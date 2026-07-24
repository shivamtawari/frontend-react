import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import {
  useAIPrompts,
  useActivePreview,
  useAddPointPrompt,
  useAddBoxPrompt,
  useAddPolygonPrompt,
  usePromptMode,
  useSetPromptMode,
  useSetActivePreview,
  useCurrentTool,
  usePromptedModel,
  useAvailablePromptedModels,
  useImageObject,
  useImageLoading,
  useImageError,
  useZoomLevel,
  usePanOffset,
  useSetZoomLevel,
  useSetPanOffset,
  useFocusModeActive,
  useFocusModeObjectMask,
  useRefinementModeActive,
  useExitRefinementMode,
} from '../../../stores/selectors/annotationSelectors';
import annotationSession from '../../../services/annotationSession';
import { isPointInFocusedObject, isBoxInFocusedObject } from '../../../utils/geometryUtils';
import useCanvasViewport from '../../../hooks/useCanvasViewport';
import usePromptDrawing from '../../../hooks/usePromptDrawing';
import PointPromptMarker from './prompts/PointPromptMarker';
import BoxPromptMarker from './prompts/BoxPromptMarker';
import LiveBoxPreview from './prompts/LiveBoxPreview';
import PolygonPromptMarker from './prompts/PolygonPromptMarker';
import PromptModeToolbar from './prompts/PromptModeToolbar';
import DrawingPreview from './prompts/DrawingPreview';

/**
 * AI Prompt Canvas Component
 * Handles interactive prompt creation (points, boxes, polygons, freehand) using
 * Konva. Only active when currentTool is 'ai_annotation'.
 */
const AIPromptCanvas = ({ width, height, renderBackground = true }) => {
  const stageRef = useRef(null);
  const [dragStart, setDragStart] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [focusModeWarning, setFocusModeWarning] = useState(null);

  // Store state
  const currentTool = useCurrentTool();
  const selectedModel = usePromptedModel();
  const availablePromptedModels = useAvailablePromptedModels();
  const promptMode = usePromptMode();
  const prompts = useAIPrompts();
  const activePreview = useActivePreview();
  const imageObject = useImageObject();
  const imageLoading = useImageLoading();
  const imageError = useImageError();
  const zoomLevel = useZoomLevel();
  const panOffset = usePanOffset();
  const focusModeActive = useFocusModeActive();
  const focusedObjectMask = useFocusModeObjectMask();
  const refinementModeActive = useRefinementModeActive();
  const exitRefinementMode = useExitRefinementMode();
  // Focus/refinement overlays put an indicator at top-left; move our toolbar down
  // so it stays visible instead of being covered by that indicator.
  const overlayActive = focusModeActive || refinementModeActive;

  // Store actions
  const addPointPrompt = useAddPointPrompt();
  const addBoxPrompt = useAddBoxPrompt();
  const addPolygonPrompt = useAddPolygonPrompt();
  const setPromptMode = useSetPromptMode();
  const setActivePreview = useSetActivePreview();
  const setZoomLevel = useSetZoomLevel();
  const setPanOffset = useSetPanOffset();

  const active = currentTool === 'ai_annotation';

  // Shared viewport (sizing, transform math, pan/zoom, coordinate mapping)
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

  // Show focus mode warning
  const showFocusModeWarning = useCallback((message) => {
    setFocusModeWarning(message);
    setTimeout(() => setFocusModeWarning(null), 3000);
  }, []);

  // Prompt types advertised by the active model (drives which modes the toolbar offers)
  const selectedModelObj = (availablePromptedModels || []).find((m) => m.id === selectedModel);
  const supportedPromptTypes = selectedModelObj?.supported_prompt_types;
  const polygonSupported =
    !Array.isArray(supportedPromptTypes) ||
    supportedPromptTypes.length === 0 ||
    supportedPromptTypes.some((t) => String(t || '').trim().toLowerCase().replace(/s$/, '') === 'polygon');

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

  // Polygon / freehand completion: validate against focus mode, then add a prompt
  const handleDrawFinalize = useCallback((points, { freehand }) => {
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    if (!isPointInFocusedObject(cx, cy, focusedObjectMask)) {
      showFocusModeWarning(
        `${freehand ? 'Freehand' : 'Polygon'} annotation is outside the focused object boundary`
      );
      return;
    }
    addPolygonPrompt(points, { freehand });
  }, [focusedObjectMask, showFocusModeWarning, addPolygonPrompt]);

  const {
    isDrawMode,
    polygonPoints,
    cursorImagePt,
    handleMouseDown: drawMouseDown,
    handleMouseMove: drawMouseMove,
    handleMouseUp: drawMouseUp,
    handleDblClick: drawDblClick,
    handleKeyDown: drawKeyDown,
  } = usePromptDrawing({
    mode: promptMode,
    stageToImageCoords,
    getScale,
    onFinalize: handleDrawFinalize,
  });

  // If the active model declares supported prompt types and polygon isn't among
  // them, fall back to point mode so the user isn't stuck drawing unusable prompts.
  useEffect(() => {
    if (!isDrawMode) return;
    if (!Array.isArray(supportedPromptTypes) || supportedPromptTypes.length === 0) return;
    const supportsPolygon = supportedPromptTypes.some((t) =>
      String(t || '').trim().toLowerCase().replace(/s$/, '') === 'polygon'
    );
    if (!supportsPolygon) {
      setPromptMode('point');
    }
  }, [isDrawMode, supportedPromptTypes, setPromptMode]);

  const handleStageClick = useCallback((e) => {
    if (!active || !selectedModel || isDragging) return;
    // Negative-point shortcut (right-click) only applies in point mode
    if (promptMode !== 'point') return;
    if (e.evt.button !== 2) return;

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    const coords = stageToImageCoords(pointerPosition.x, pointerPosition.y);
    if (!coords) return;

    if (!isPointInFocusedObject(coords.imageX, coords.imageY, focusedObjectMask)) {
      showFocusModeWarning('Point annotation is outside the focused object boundary');
      return;
    }

    addPointPrompt(coords.imageX, coords.imageY, 'negative');
  }, [active, selectedModel, isDragging, promptMode, stageToImageCoords, addPointPrompt, focusedObjectMask, showFocusModeWarning]);

  const handleStageDblClick = useCallback((e) => {
    if (isDrawMode) drawDblClick(e);
  }, [isDrawMode, drawDblClick]);

  const handleMouseDown = useCallback((e) => {
    if (!active || !selectedModel) return;

    // Panning takes priority (middle mouse, or Space-held left drag)
    if (e.evt.button === 1 || (e.evt.button === 0 && isPanMode)) {
      handlePanStart(e);
      return;
    }

    // Polygon / freehand drawing modes have their own gesture handling
    if (isDrawMode) {
      drawMouseDown(e);
      return;
    }

    if (e.evt.button !== 0 || isPanMode) return;

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    const coords = stageToImageCoords(pointerPosition.x, pointerPosition.y);
    if (!coords) return;

    setDragStart({ imageX: coords.imageX, imageY: coords.imageY, stageX: coords.stageX, stageY: coords.stageY });
  }, [active, selectedModel, isPanMode, isDrawMode, drawMouseDown, stageToImageCoords, handlePanStart]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      handlePanMove(e);
      return;
    }

    if (isDrawMode) {
      drawMouseMove(e);
      return;
    }

    if (!dragStart) return;

    // Box preview only matters in box mode
    if (promptMode !== 'box') return;

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    const coords = stageToImageCoords(pointerPosition.x, pointerPosition.y);
    if (!coords) return;

    if (!isDragging) {
      const distance = Math.sqrt(
        Math.pow(pointerPosition.x - dragStart.stageX, 2) +
        Math.pow(pointerPosition.y - dragStart.stageY, 2)
      );
      if (distance > 5) {
        setIsDragging(true);
      }
    }

    setActivePreview({
      x1: dragStart.stageX,
      y1: dragStart.stageY,
      x2: coords.stageX,
      y2: coords.stageY,
    });
  }, [isPanning, handlePanMove, isDrawMode, drawMouseMove, dragStart, promptMode, isDragging, stageToImageCoords, setActivePreview]);

  const handleMouseUp = useCallback((e) => {
    if (isPanning) {
      handlePanEnd();
      return;
    }

    if (isDrawMode) {
      drawMouseUp(e);
      return;
    }

    if (promptMode === 'box' && isDragging && dragStart) {
      const stage = e.target.getStage();
      const pointerPosition = stage.getPointerPosition();
      const coords = stageToImageCoords(pointerPosition.x, pointerPosition.y);

      if (coords) {
        const w = Math.abs(coords.imageX - dragStart.imageX);
        const h = Math.abs(coords.imageY - dragStart.imageY);

        if (w >= 3 && h >= 3) {
          if (!isBoxInFocusedObject(dragStart.imageX, dragStart.imageY, coords.imageX, coords.imageY, focusedObjectMask)) {
            showFocusModeWarning('Box annotation is outside the focused object boundary');
          } else {
            addBoxPrompt(dragStart.imageX, dragStart.imageY, coords.imageX, coords.imageY);
          }
        }
      }

      setDragStart(null);
      setIsDragging(false);
      setActivePreview(null);
    } else if (promptMode === 'point' && dragStart && active && selectedModel && e.evt.button === 0) {
      const stage = e.target.getStage();
      const pointerPosition = stage.getPointerPosition();
      const coords = stageToImageCoords(pointerPosition.x, pointerPosition.y);

      if (coords) {
        if (!isPointInFocusedObject(coords.imageX, coords.imageY, focusedObjectMask)) {
          showFocusModeWarning('Point annotation is outside the focused object boundary');
        } else {
          addPointPrompt(coords.imageX, coords.imageY, 'positive');
        }
      }

      setDragStart(null);
      setIsDragging(false);
      setActivePreview(null);
    } else {
      // No actionable gesture (e.g. plain click in box mode) — clear transient state
      setDragStart(null);
      setIsDragging(false);
      setActivePreview(null);
    }
  }, [isPanning, handlePanEnd, isDrawMode, drawMouseUp, promptMode, isDragging, dragStart, active, selectedModel, stageToImageCoords, addBoxPrompt, addPointPrompt, focusedObjectMask, showFocusModeWarning, setActivePreview]);

  // Keyboard: drawing shortcuts (Enter/Esc) take priority, then refinement Escape
  useEffect(() => {
    if (!active) return undefined;

    const handleKeyDown = async (e) => {
      if (drawKeyDown(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Single-key mode switching (ignore while typing or with modifiers)
      const typing = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'p') { e.preventDefault(); setPromptMode('point'); return; }
        if (key === 'b') { e.preventDefault(); setPromptMode('box'); return; }
        if (key === 'g' && polygonSupported) { e.preventDefault(); setPromptMode('polygon'); return; }
        if (key === 'f' && polygonSupported) { e.preventDefault(); setPromptMode('freehand'); return; }
      }

      if (e.code === 'Escape' && refinementModeActive) {
        e.preventDefault();
        e.stopPropagation();
        try {
          await annotationSession.unselectRefinementObject();
          setZoomLevel(1);
          setPanOffset({ x: 0, y: 0 });
          exitRefinementMode();
        } catch (error) {
          console.error('Failed to exit refinement mode:', error);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, drawKeyDown, refinementModeActive, exitRefinementMode, setZoomLevel, setPanOffset, setPromptMode, polygonSupported]);

  const handleContextMenu = useCallback((e) => {
    e.evt.preventDefault();
  }, []);

  if (!active) return null;

  if (imageLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading image...</p>
        </div>
      </div>
    );
  }

  if (!imageObject) return null;

  if (imageError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-red-600 mb-2">Failed to load image</p>
          <p className="text-sm text-gray-600">{imageError}</p>
        </div>
      </div>
    );
  }

  const cursor = !selectedModel
    ? 'not-allowed'
    : isPanning
      ? 'grabbing'
      : isPanMode
        ? 'grab'
        : 'crosshair';

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10"
      style={{ cursor }}
    >
      {/* Pan mode indicator */}
      {isPanMode && (
        <div className="absolute top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium shadow-lg z-50">
          Pan Mode - Hold Space + Drag
        </div>
      )}

      {/* Prompt drawing-mode selector (points / box / polygon / freehand) */}
      <PromptModeToolbar supportedTypes={supportedPromptTypes} shiftDown={overlayActive} />

      {/* Drawing instructions for polygon / freehand modes */}
      {isDrawMode && selectedModel && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-gray-900/90 text-white px-3 py-1.5 rounded-full text-xs font-medium shadow-lg z-40 pointer-events-none">
          {promptMode === 'polygon'
            ? 'Click to add points · double-click or Enter to close · right-click undoes a point · Esc cancels'
            : 'Press and drag to trace an outline · release to close'}
        </div>
      )}

      {containerSize.width > 0 && containerSize.height > 0 && (
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        onClick={handleStageClick}
        onDblClick={handleStageDblClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        <Layer>
          {renderBackground && (
            <KonvaImage
              image={imageObject}
              x={imageDimensions.displayX}
              y={imageDimensions.displayY}
              width={imageDimensions.displayWidth}
              height={imageDimensions.displayHeight}
            />
          )}

          {prompts
            .filter((p) => p.type === 'box')
            .map((prompt) => {
              const finalScale = imageDimensions.baseScale * zoomLevel;
              const stagePrompt = {
                ...prompt,
                coords: {
                  x1: prompt.coords.x1 * finalScale + imageDimensions.displayX,
                  y1: prompt.coords.y1 * finalScale + imageDimensions.displayY,
                  x2: prompt.coords.x2 * finalScale + imageDimensions.displayX,
                  y2: prompt.coords.y2 * finalScale + imageDimensions.displayY,
                },
              };
              return <BoxPromptMarker key={prompt.id} prompt={stagePrompt} />;
            })}

          <LiveBoxPreview preview={activePreview} />

          {prompts
            .filter((p) => p.type === 'point')
            .map((prompt) => {
              const finalScale = imageDimensions.baseScale * zoomLevel;
              const stagePrompt = {
                ...prompt,
                coords: {
                  x: prompt.coords.x * finalScale + imageDimensions.displayX,
                  y: prompt.coords.y * finalScale + imageDimensions.displayY,
                },
              };
              return <PointPromptMarker key={prompt.id} prompt={stagePrompt} />;
            })}

          {/* Finalized polygon / freehand prompts */}
          {prompts
            .filter((p) => p.type === 'polygon')
            .map((prompt) => {
              const stagePoints = [];
              (prompt.coords.points || []).forEach((pt) => {
                const [sx, sy] = toStage(pt);
                stagePoints.push(sx, sy);
              });
              return (
                <PolygonPromptMarker
                  key={prompt.id}
                  prompt={{ ...prompt, coords: { stagePoints } }}
                />
              );
            })}

          {/* In-progress polygon / freehand outline */}
          {isDrawMode && (
            <DrawingPreview
              mode={promptMode}
              polygonPoints={polygonPoints}
              cursorImagePt={cursorImagePt}
              toStage={toStage}
            />
          )}
        </Layer>
      </Stage>
      )}

      {focusModeWarning && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium">{focusModeWarning}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIPromptCanvas;
