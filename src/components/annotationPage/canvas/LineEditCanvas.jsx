import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import { Hexagon, Spline, X } from 'lucide-react';
import {
  useImageObject,
  useImageLoading,
  useImageError,
  useZoomLevel,
  usePanOffset,
  useSetZoomLevel,
  useSetPanOffset,
  useManualDrawMode,
  useSetManualDrawMode,
  useLineEditActive,
  useLineEditObjectId,
  useLineEditContourId,
  useLineEditOriginal,
  useLineEditMode,
  useStopLineEdit,
  useUpdateObject,
  useObjectsList,
  useCurrentMaskId,
} from '../../../stores/selectors/annotationSelectors';
import annotationSession from '../../../services/annotationSession';
import { pixelArrayToNormalized } from '../../../utils/coordinateUtils';
import { mergeLineIntoContour } from '../../../utils/contourEditing';
import { splitObjectByLine } from '../../../utils/contourOperations';
import { useToast } from '../../../contexts/ToastContext';
import useAnnotationStore from '../../../stores/useAnnotationStore';
import useCanvasViewport from '../../../hooks/useCanvasViewport';
import usePromptDrawing from '../../../hooks/usePromptDrawing';
import DrawingPreview from './prompts/DrawingPreview';
import ModeBanner from '../workspace/ModeBanner';

/**
 * Line-edit Canvas
 *
 * Draw an open line across or near a contour — freehand (press-drag) or polygon
 * (click points, double-click / Enter to finish) — and do one of two things with it,
 * chosen by `lineEdit.mode`:
 *
 * - **reshape**: the line's ends snap to the closest points on the contour and the
 *   nearest boundary arc is replaced by the line (`mergeLineIntoContour`) — draw just
 *   outside to add a region, just inside to cut one off. Saved via `modifyObject`.
 * - **split**: both arcs between the snapped ends are kept, cutting the object in two
 *   (`splitObjectByLine`). One half stays on this contour, the other becomes a new
 *   object beside it.
 *
 * The two share every part of the interaction except that last step, which is why they
 * share this canvas. The faint dashed outline is the contour being edited.
 *
 * Rendered at full container resolution with zoom applied to coordinates (via
 * `useCanvasViewport`), so the drawing stays crisp at any zoom. Only mounted while
 * a line-edit session is active (mounting is gated by the parent so the viewport
 * measures its container on first render).
 */
const MODES = [
  { id: 'freehand', label: 'Freehand', icon: Spline, hotkey: 'F' },
  { id: 'polygon', label: 'Polygon', icon: Hexagon, hotkey: 'G' },
];

const hasCoordinates = (object, coordinates) =>
  ['x', 'y'].every((axis) =>
    Array.isArray(object?.[axis]) &&
    object[axis].length === coordinates[axis].length &&
    object[axis].every((value, index) => value === coordinates[axis][index])
  );

const LineEditCanvas = () => {
  const stageRef = useRef(null);
  const active = useLineEditActive();
  const objectId = useLineEditObjectId();
  const contourId = useLineEditContourId();
  const original = useLineEditOriginal();
  const editMode = useLineEditMode();
  const stopLineEdit = useStopLineEdit();
  const updateObject = useUpdateObject();
  const objectsList = useObjectsList();
  const maskId = useCurrentMaskId();
  const { addToast } = useToast();
  const isSplit = editMode === 'split';
  const [isSaving, setIsSaving] = useState(false);

  const targetObject = useMemo(
    () => objectsList.find((object) => object.id === objectId) || null,
    [objectsList, objectId]
  );
  // Prefer the live object so each reshape starts from the outline produced by
  // the previous one. The stored original remains a fallback if the object list
  // has not caught up yet.
  const workingContour = targetObject?.x?.length && targetObject?.y?.length
    ? targetObject
    : original;

  const mode = useManualDrawMode();
  const setMode = useSetManualDrawMode();

  const imageObject = useImageObject();
  const imageLoading = useImageLoading();
  const imageError = useImageError();
  const zoomLevel = useZoomLevel();
  const panOffset = usePanOffset();
  const setZoomLevel = useSetZoomLevel();
  const setPanOffset = useSetPanOffset();

  const {
    containerRef,
    containerSize,
    imageDimensions,
    isPanning,
    isPanMode,
    stageToImageCoords,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
    handleWheel,
  } = useCanvasViewport({ imageObject, zoomLevel, panOffset, setZoomLevel, setPanOffset, active });

  const getScale = useCallback(
    () => imageDimensions.baseScale * zoomLevel,
    [imageDimensions.baseScale, zoomLevel]
  );
  const toStage = useCallback(
    (pt) => {
      const finalScale = imageDimensions.baseScale * zoomLevel;
      return [
        pt.x * finalScale + imageDimensions.displayX,
        pt.y * finalScale + imageDimensions.displayY,
      ];
    },
    [imageDimensions, zoomLevel]
  );

  // The contour being reshaped, in stage pixels, as a faint dashed reference.
  const referencePoints = useMemo(() => {
    if (!workingContour || !imageObject || !imageDimensions.baseScale) return null;
    const pts = [];
    for (let i = 0; i < workingContour.x.length; i++) {
      const [sx, sy] = toStage({
        x: workingContour.x[i] * imageObject.width,
        y: workingContour.y[i] * imageObject.height,
      });
      pts.push(sx, sy);
    }
    return pts;
  }, [workingContour, imageObject, imageDimensions.baseScale, toStage]);

  const handleDrawFinalize = useCallback(async (points, { freehand }) => {
    if (isSaving || !imageObject || points.length < 2 || contourId == null || !workingContour) return;

    const linePixel = points.map((p) => ({ x: p.x, y: p.y }));

    if (isSplit) {
      const target = objectsList.find((obj) => obj.id === objectId);
      if (!target) {
        addToast({ type: 'error', message: 'That object is no longer on the canvas.' });
        stopLineEdit();
        return;
      }
      const result = await splitObjectByLine({
        object: target,
        objectsList,
        imageObject,
        linePixel,
        maskId,
        updateObject,
      });
      // A refusal changed nothing, so stay in the tool and let them redraw the line.
      if (!result.refused) stopLineEdit();
      addToast({ type: result.success ? 'success' : 'error', message: result.message });
      return;
    }

    // Merge in pixel space (avoids the x/y aspect skew of normalized coordinates).
    const contourPixel = workingContour.x.map((x, i) => ({
      x: x * imageObject.width,
      y: workingContour.y[i] * imageObject.height,
    }));
    const merged = mergeLineIntoContour(contourPixel, linePixel);

    if (merged === contourPixel || merged.length < 3) {
      addToast({ type: 'error', message: 'Draw the line so its two ends sit near different parts of the outline.' });
      return;
    }

    const normalized = pixelArrayToNormalized(
      merged.map((p) => p.x),
      merged.map((p) => p.y),
      imageObject.width,
      imageObject.height
    );

    if (!annotationSession.isReady()) {
      addToast({ type: 'error', message: 'Session is not ready yet. Please wait for the image to load.' });
      return;
    }

    // Optimistic: show the reshaped outline immediately, revert if the save fails.
    setIsSaving(true);
    updateObject(objectId, { x: normalized.x, y: normalized.y, path: null });
    try {
      const response = await annotationSession.modifyObject(contourId, { x: normalized.x, y: normalized.y });
      if (response && response.success === false) throw new Error(response.message || 'Save rejected');
      addToast({ type: 'success', message: `Outline reshaped (${freehand ? 'freehand' : 'polygon'}).` });
    } catch (err) {
      // Do not let a late failure overwrite a newer edit made after this request.
      const currentObject = useAnnotationStore.getState().objects.list.find((object) => object.id === objectId);
      if (hasCoordinates(currentObject, normalized)) {
        updateObject(objectId, { x: workingContour.x, y: workingContour.y, path: null });
      }
      addToast({ type: 'error', message: err.message || 'Could not reshape the outline. Reverted.' });
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, imageObject, contourId, objectId, workingContour, updateObject, stopLineEdit,
      addToast, isSplit, objectsList, maskId]);

  const {
    polygonPoints,
    cursorImagePt,
    handleMouseDown: drawMouseDown,
    handleMouseMove: drawMouseMove,
    handleMouseUp: drawMouseUp,
    handleDblClick: drawDblClick,
    handleKeyDown: drawKeyDown,
    resetDrawing,
  } = usePromptDrawing({
    mode,
    stageToImageCoords,
    getScale,
    onFinalize: handleDrawFinalize,
    minPoints: 2, // an open line needs only two points
    closeOnFirst: false, // do not snap-close near the first point; it is not a loop
  });

  const handleMouseDown = useCallback((e) => {
    if (!active || isSaving) return;
    if (e.evt.button === 1 || (e.evt.button === 0 && isPanMode)) {
      handlePanStart(e);
      return;
    }
    drawMouseDown(e);
  }, [active, isSaving, isPanMode, handlePanStart, drawMouseDown]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      handlePanMove(e);
      return;
    }
    drawMouseMove(e);
  }, [isPanning, handlePanMove, drawMouseMove]);

  const handleMouseUp = useCallback((e) => {
    if (isPanning) {
      handlePanEnd();
      return;
    }
    drawMouseUp(e);
  }, [isPanning, handlePanEnd, drawMouseUp]);

  const handleContextMenu = useCallback((e) => {
    e.evt.preventDefault();
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (e) => {
      const typing = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        stopLineEdit();
        return;
      }
      if (drawKeyDown(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'g') { e.preventDefault(); setMode('polygon'); }
      else if (key === 'f') { e.preventDefault(); setMode('freehand'); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, drawKeyDown, setMode, stopLineEdit]);

  if (!active) return null;
  if (imageLoading || imageError || !imageObject) return null;

  const cursor = isPanning ? 'grabbing' : isPanMode ? 'grab' : 'crosshair';
  const title = isSplit ? 'Split Mode' : 'Reshape Mode';
  const instruction = isSplit
    ? (mode === 'polygon'
      ? 'Click across the object · double-click or Enter to split'
      : 'Drag across the object · release to split')
    : (mode === 'polygon'
      ? 'Click across the boundary · double-click or Enter to reshape'
      : 'Drag across the boundary · release to reshape');

  return (
    <div ref={containerRef} className="absolute inset-0 z-[60]" style={{ cursor }}>
      <ModeBanner
        title={title}
        subject={targetObject?.label || (objectId != null ? `Object #${objectId}` : null)}
        hint={instruction}
        dotClass="bg-ac"
        exitLabel={isSplit ? 'Exit split' : 'Exit reshape'}
        onExit={stopLineEdit}
      />

      {/* Mode selector */}
      <div className="absolute top-[76px] left-3 z-[80] flex items-center gap-1 bg-p1 backdrop-blur-sm border border-ln rounded-xl shadow-lg p-1">
        {MODES.map(({ id, label, icon: Icon, hotkey }) => {
          const isActive = mode === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              title={`${label} (${hotkey})`}
              aria-label={`${label} drawing mode`}
              aria-pressed={isActive}
              disabled={isSaving}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isActive ? 'bg-accent text-onAccent shadow-sm' : 'text-t2 hover:bg-hv'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
        {mode === 'polygon' && polygonPoints.length > 0 && (
          <>
            <div className="w-px h-5 bg-hv2 mx-1" />
            <button
              type="button"
              onClick={resetDrawing}
              title="Clear current line"
              aria-label="Clear current line"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-t2 hover:bg-hv transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear line</span>
            </button>
          </>
        )}
      </div>

      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        onDblClick={drawDblClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        <Layer listening={false}>
          {referencePoints && (
            <Line points={referencePoints} closed stroke="#f43f5e" strokeWidth={1.5} dash={[6, 5]} opacity={0.55} />
          )}
        </Layer>
        <Layer>
          <DrawingPreview
            mode={mode}
            polygonPoints={polygonPoints}
            cursorImagePt={cursorImagePt}
            toStage={toStage}
            closed={false}
          />
        </Layer>
      </Stage>
    </div>
  );
};

export default LineEditCanvas;
