import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Stage, Layer, Circle, Line } from 'react-konva';
import {
  useEditModeActive,
  useEditModeDraftCoordinates,
  useEditModeVertices,
  useImageObject,
  useRefinementModeActive,
  useMoveVertex,
  useInsertVertex,
  useDeleteVertex,
} from '../../../stores/selectors/annotationSelectors';
import { useContourEditing } from '../../../hooks/useContourEditing';
import { nearestEdge } from '../../../utils/contourEditing';

/**
 * EditableContourOverlay
 *
 * Renders the manual contour editor: a smooth closed outline (the dense
 * `draftCoordinates`) plus a handful of draggable **control vertices**. Drag a
 * vertex to reshape, click the outline to add a vertex where you need finer
 * control, double-click a vertex to remove it. All geometry is normalized [0,1].
 */
const EditableContourOverlay = ({ canvasRef, zoomLevel = 1, panOffset = { x: 0, y: 0 } }) => {
  const editModeActive = useEditModeActive();
  const draftCoordinates = useEditModeDraftCoordinates();
  const vertices = useEditModeVertices();
  const imageObject = useImageObject();
  const refinementModeActive = useRefinementModeActive();

  const moveVertex = useMoveVertex();
  const insertVertex = useInsertVertex();
  const deleteVertex = useDeleteVertex();

  const { cancelEditing, resetChanges, scheduleAutoSave, cancelAutoSave } = useContourEditing();

  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0, x: 0, y: 0 });
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const containerRef = useRef(null);
  const pointsWrapperRef = useRef(null);
  // Konva Stage nodes, so their backing-store resolution can track the zoom.
  const singleStageRef = useRef(null);
  const pointsStageRef = useRef(null);
  const lineStageRef = useRef(null);

  // Keep the overlay crisp when zoomed. The wrapper is CSS-scaled by `zoomLevel`,
  // which would upscale (blur) a fixed-resolution canvas — so bump each Konva
  // canvas's pixelRatio by the zoom to render at the displayed density instead.
  useEffect(() => {
    const pr = Math.min(4, (window.devicePixelRatio || 1) * (zoomLevel > 0 ? zoomLevel : 1));
    const apply = (stage) => {
      if (!stage) return;
      try {
        stage.getLayers().forEach((layer) => {
          const canvas = layer.getCanvas();
          if (canvas && canvas.getPixelRatio() !== pr) canvas.setPixelRatio(pr);
        });
        stage.batchDraw();
      } catch {
        /* stage torn down mid-update — nothing to do */
      }
    };
    apply(singleStageRef.current);
    apply(pointsStageRef.current);
    apply(lineStageRef.current);
  }, [zoomLevel, editModeActive, refinementModeActive]);

  // Calculate rendered image dimensions
  useEffect(() => {
    if (!canvasRef?.current || !imageObject) return;

    const updateDimensions = () => {
      const container = canvasRef.current;
      if (!container) return;

      const containerWidth = container.offsetWidth;
      const containerHeight = container.offsetHeight;

      if (containerWidth === 0 || containerHeight === 0 || !imageObject.width || !imageObject.height) {
        return;
      }

      const imageAspect = imageObject.width / imageObject.height;
      const containerAspect = containerWidth / containerHeight;

      let renderedWidth, renderedHeight, x, y;

      if (imageAspect > containerAspect) {
        renderedWidth = containerWidth;
        renderedHeight = containerWidth / imageAspect;
        x = 0;
        y = (containerHeight - renderedHeight) / 2;
      } else {
        renderedWidth = containerHeight * imageAspect;
        renderedHeight = containerHeight;
        x = (containerWidth - renderedWidth) / 2;
        y = 0;
      }

      setImageDimensions({ width: renderedWidth, height: renderedHeight, x, y });
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    const currentContainer = canvasRef.current;
    resizeObserver.observe(currentContainer);

    return () => {
      if (currentContainer) {
        resizeObserver.unobserve(currentContainer);
      }
      resizeObserver.disconnect();
    };
  }, [canvasRef, imageObject]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!editModeActive) return;

    const handleKeyDown = (e) => {
      // Escape: discard changes and exit — but only when NOT in refinement mode.
      // In refinement mode, RefinementOverlay owns the Escape key (it saves + exits both modes).
      if (e.key === 'Escape' && !refinementModeActive) {
        e.preventDefault();
        cancelAutoSave();
        cancelEditing();
      }
      // Reset: Ctrl/Cmd+Z
      else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        cancelAutoSave();
        resetChanges();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editModeActive, refinementModeActive, cancelEditing, resetChanges, cancelAutoSave]);

  // --- Event forwarding for refinement mode ---
  // In refinement mode the control-points Stage sits at z-65, above the AIPromptCanvas at z-62.
  // A full-screen Konva canvas captures ALL pointer events, blocking prompt placement.
  // Fix: when a mousedown lands on the Stage background (not a control point), temporarily
  // disable pointer-events on this canvas and re-dispatch the native event to whatever element
  // is actually below — i.e. the AIPromptCanvas Stage. Subsequent move/up events are forwarded
  // as long as that mousedown was forwarded, so box-drawing preview continues to work.
  const forwardedMouseDownRef = useRef(false);

  const forwardNativeEvent = useCallback((nativeEvent) => {
    const wrapper = pointsWrapperRef.current;
    if (!wrapper) return;

    // Temporarily hide the entire z-65 wrapper so elementFromPoint
    // skips it and all its children (Konva Stage container, canvas, etc.)
    wrapper.style.visibility = 'hidden';
    const elementBelow = document.elementFromPoint(nativeEvent.clientX, nativeEvent.clientY);
    wrapper.style.visibility = '';

    if (!elementBelow) return;

    elementBelow.dispatchEvent(new MouseEvent(nativeEvent.type, {
      bubbles: true,
      cancelable: true,
      button: nativeEvent.button,
      buttons: nativeEvent.buttons,
      clientX: nativeEvent.clientX,
      clientY: nativeEvent.clientY,
      screenX: nativeEvent.screenX,
      screenY: nativeEvent.screenY,
      movementX: nativeEvent.movementX ?? 0,
      movementY: nativeEvent.movementY ?? 0,
      shiftKey: nativeEvent.shiftKey,
      ctrlKey: nativeEvent.ctrlKey,
      metaKey: nativeEvent.metaKey,
      altKey: nativeEvent.altKey,
    }));
  }, []);

  const handlePointsStageMouseDown = useCallback((e) => {
    if (e.target === e.target.getStage()) {
      // Background click — forward to AIPromptCanvas and track that we forwarded
      forwardedMouseDownRef.current = true;
      forwardNativeEvent(e.evt);
    } else {
      // Landed on a control point circle — normal drag, do not forward
      forwardedMouseDownRef.current = false;
    }
  }, [forwardNativeEvent]);

  const handlePointsStageMouseMove = useCallback((e) => {
    if (forwardedMouseDownRef.current) {
      forwardNativeEvent(e.evt);
    }
  }, [forwardNativeEvent]);

  const handlePointsStageMouseUp = useCallback((e) => {
    if (forwardedMouseDownRef.current) {
      forwardNativeEvent(e.evt);
      forwardedMouseDownRef.current = false;
    }
  }, [forwardNativeEvent]);

  // Prevent browser context menu; forward right-click events so the AIPromptCanvas
  // can synthesise its own Konva click (button=2) and add a negative prompt.
  const handlePointsStageContextMenu = useCallback((e) => {
    e.evt.preventDefault();
    if (e.target === e.target.getStage()) {
      forwardNativeEvent(e.evt);
    }
  }, [forwardNativeEvent]);

  if (!editModeActive || !draftCoordinates || !vertices || !imageObject || imageDimensions.width === 0) {
    return null;
  }

  const toScreenX = (nx) => nx * imageDimensions.width + imageDimensions.x;
  const toScreenY = (ny) => ny * imageDimensions.height + imageDimensions.y;
  const toNormX = (sx) => (sx - imageDimensions.x) / imageDimensions.width;
  const toNormY = (sy) => (sy - imageDimensions.y) / imageDimensions.height;

  // The smooth outline: every dense draft point (straight segments between them
  // trace the resampled Catmull-Rom curve).
  const linePoints = draftCoordinates.x.flatMap((x, i) => [toScreenX(x), toScreenY(draftCoordinates.y[i])]);

  // The handles: one per control vertex.
  const handles = vertices.x.map((x, i) => ({ x: toScreenX(x), y: toScreenY(vertices.y[i]), index: i }));
  const handleScreenXs = handles.map((h) => h.x);
  const handleScreenYs = handles.map((h) => h.y);

  // Scale point sizes so they stay visually consistent regardless of zoom level.
  const safeZoom = zoomLevel > 0 ? zoomLevel : 1;
  const visiblePointRadius = Math.max(2, 5 / safeZoom);
  const hoveredPointRadius = Math.max(2.5, 7 / safeZoom);
  const hitboxRadius = Math.max(8, 18 / safeZoom);
  // How close (on-screen px) a click must land to the outline to insert a vertex.
  const insertThreshold = 16 / safeZoom;

  const handlePointDragMove = (index, e) => {
    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    const clampedX = Math.max(0, Math.min(1, toNormX(pointerPos.x)));
    const clampedY = Math.max(0, Math.min(1, toNormY(pointerPos.y)));
    moveVertex(index, clampedX, clampedY);
    // Auto-save resets the idle timer on every drag; editing is fully auto-saved.
    scheduleAutoSave();
  };

  const handleDeleteVertex = (index) => {
    if (vertices.x.length <= 3) return; // A closed shape needs at least three.
    deleteVertex(index);
    scheduleAutoSave();
  };

  // Click on empty canvas: if it lands on the outline, insert a vertex there.
  const handleStageClick = (e) => {
    if (e.target !== e.target.getStage()) return; // clicks on handles are theirs.
    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;
    const { index, distance } = nearestEdge(handleScreenXs, handleScreenYs, pointerPos);
    if (distance > insertThreshold) return; // clicked away from the outline — ignore.
    insertVertex(index, toNormX(pointerPos.x), toNormY(pointerPos.y));
    scheduleAutoSave();
  };

  const transformStyle = {
    transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
    transformOrigin: 'center center',
  };

  const stageProps = {
    width: imageDimensions.width + imageDimensions.x * 2,
    height: imageDimensions.height + imageDimensions.y * 2,
  };

  const lineLayer = (
    <Layer listening={false}>
      <Line points={linePoints} stroke="#3b82f6" strokeWidth={Math.max(1, 2 / safeZoom)} closed tension={0} />
    </Layer>
  );

  const renderHandle = (point) => {
    const isHovered = hoveredPoint === point.index;
    return (
      <React.Fragment key={point.index}>
        <Circle
          x={point.x}
          y={point.y}
          radius={hitboxRadius}
          fill="transparent"
          draggable
          onDragMove={(e) => handlePointDragMove(point.index, e)}
          onDblClick={() => handleDeleteVertex(point.index)}
          onMouseEnter={(e) => {
            e.target.getStage().container().style.cursor = 'grab';
            setHoveredPoint(point.index);
          }}
          onMouseLeave={(e) => {
            e.target.getStage().container().style.cursor = 'default';
            setHoveredPoint(null);
          }}
          onDragStart={(e) => {
            e.target.getStage().container().style.cursor = 'grabbing';
          }}
          onDragEnd={(e) => {
            e.target.getStage().container().style.cursor = 'grab';
          }}
        />
        <Circle
          x={point.x}
          y={point.y}
          radius={isHovered ? hoveredPointRadius : visiblePointRadius}
          fill={isHovered ? '#2563eb' : '#3b82f6'}
          stroke="#ffffff"
          strokeWidth={Math.max(1, 2 / safeZoom)}
          listening={false}
        />
      </React.Fragment>
    );
  };

  const pointsLayer = <Layer>{handles.map(renderHandle)}</Layer>;

  // In refinement mode: line below (z-55, non-interactive) so prompt canvas (z-62) can receive clicks; points above (z-65) so they remain draggable
  if (refinementModeActive) {
    return (
      <>
        <div
          ref={containerRef}
          className="absolute inset-0 pointer-events-none"
          style={{ ...transformStyle, zIndex: 55 }}
        >
          <Stage {...stageProps} listening={false} ref={lineStageRef}>
            {lineLayer}
          </Stage>
        </div>
        <div
          ref={pointsWrapperRef}
          className="absolute inset-0 pointer-events-none"
          style={{ ...transformStyle, zIndex: 65 }}
        >
          <Stage
            {...stageProps}
            ref={pointsStageRef}
            className="pointer-events-auto"
            onMouseDown={handlePointsStageMouseDown}
            onMouseMove={handlePointsStageMouseMove}
            onMouseUp={handlePointsStageMouseUp}
            onMouseLeave={handlePointsStageMouseUp}
            onContextMenu={handlePointsStageContextMenu}
          >
            {pointsLayer}
          </Stage>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Single overlay when not in refinement mode */}
      <div
        ref={containerRef}
        className="absolute inset-0 pointer-events-none"
        style={{ ...transformStyle, zIndex: 60 }}
      >
        <Stage {...stageProps} ref={singleStageRef} className="pointer-events-auto" onClick={handleStageClick} onTap={handleStageClick}>
          {lineLayer}
          {pointsLayer}
        </Stage>
      </div>

      {/* Discoverability hint for the insert/delete gestures. */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[62] pointer-events-none px-3 py-1.5 rounded-lg bg-gray-900/80 text-white text-xs font-medium shadow-lg backdrop-blur-sm"
      >
        Drag a point to reshape · Click the outline to add a point · Double-click a point to remove · Esc to discard
      </div>
    </>
  );
};

export default EditableContourOverlay;
