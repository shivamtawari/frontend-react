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

  // --- Space-to-pan tracking ---
  const [spacePressed, setSpacePressed] = useState(false);

  useEffect(() => {
    if (!editModeActive) {
      setSpacePressed(false);
      return undefined;
    }

    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !spacePressed) {
        const target = e.target;
        const isEditable =
          target instanceof HTMLElement &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (!isEditable) {
          e.preventDefault();
          setSpacePressed(true);
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };

    const handleBlur = () => {
      setSpacePressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [editModeActive, spacePressed]);

  // --- Event forwarding for refinement mode ---
  // In refinement mode the control-points Stage sits at z-65, above the AIPromptCanvas at z-62.
  // A full-screen Konva canvas captures ALL pointer events, blocking prompt placement and wheel zoom.
  // Fix: when an event lands on the Stage background or is a wheel/pan gesture, temporarily
  // disable pointer-events on this canvas and re-dispatch the native event to whatever element
  // is actually below — i.e. the AIPromptCanvas Stage (or the main canvas).
  const forwardedMouseDownRef = useRef(false);
  const forwardedTargetRef = useRef(null);

  const forwardNativeEvent = useCallback((nativeEvent) => {
    const wrapper = refinementModeActive ? pointsWrapperRef.current : containerRef.current;
    if (!wrapper) return;

    let elementBelow;
    if ((nativeEvent.type === 'mousemove' || nativeEvent.type === 'mouseup' || nativeEvent.type === 'mouseleave') && forwardedTargetRef.current) {
      elementBelow = forwardedTargetRef.current;
    } else {
      wrapper.style.visibility = 'hidden';
      elementBelow = typeof document.elementFromPoint === 'function'
        ? document.elementFromPoint(nativeEvent.clientX, nativeEvent.clientY)
        : null;
      wrapper.style.visibility = '';
      if (!elementBelow) {
        elementBelow = wrapper.parentElement?.querySelector('.konvajs-content canvas') || canvasRef?.current;
      }
    }

    if (!elementBelow) return;

    if (nativeEvent.type === 'mousedown') {
      forwardedTargetRef.current = elementBelow;
    } else if (nativeEvent.type === 'mouseup' || nativeEvent.type === 'mouseleave') {
      forwardedTargetRef.current = null;
    }

    const isLeave = nativeEvent.type === 'mouseleave';
    const type = isLeave ? 'mouseup' : nativeEvent.type;
    const EventCtor = (nativeEvent instanceof WheelEvent || type === 'wheel')
      ? WheelEvent
      : MouseEvent;
    elementBelow.dispatchEvent(new EventCtor(type, isLeave ? {
      bubbles: true,
      cancelable: true,
      button: nativeEvent.button ?? 0,
      buttons: nativeEvent.buttons ?? 0,
      clientX: nativeEvent.clientX ?? 0,
      clientY: nativeEvent.clientY ?? 0,
      screenX: nativeEvent.screenX ?? 0,
      screenY: nativeEvent.screenY ?? 0,
    } : nativeEvent));
  }, [refinementModeActive, canvasRef]);

  // --- Stage-level nearest-vertex drag & pan state ---
  const activeVertexRef = useRef(null);
  const draggedSinceDownRef = useRef(false);

  // Konva does not reliably emit Stage-level touchcancel with non-listening shapes.
  useEffect(() => {
    if (!editModeActive) {
      activeVertexRef.current = null;
      draggedSinceDownRef.current = false;
      return undefined;
    }

    const cancelTouchGesture = () => {
      activeVertexRef.current = null;
      draggedSinceDownRef.current = false;
    };

    window.addEventListener('touchcancel', cancelTouchGesture, true);
    return () => window.removeEventListener('touchcancel', cancelTouchGesture, true);
  }, [editModeActive]);

  const safeZoom = zoomLevel > 0 ? zoomLevel : 1;
  const SCREEN_VISIBLE_RADIUS = 3;
  const SCREEN_HOVERED_RADIUS = 4;
  const baseVisibleRadius = SCREEN_VISIBLE_RADIUS / safeZoom;
  const baseHoveredRadius = SCREEN_HOVERED_RADIUS / safeZoom;
  const HANDLE_HIT_RADIUS = 12 / safeZoom;

  const toScreenX = (nx) => nx * imageDimensions.width + imageDimensions.x;
  const toScreenY = (ny) => ny * imageDimensions.height + imageDimensions.y;
  const toNormX = (sx) => (sx - imageDimensions.x) / imageDimensions.width;
  const toNormY = (sy) => (sy - imageDimensions.y) / imageDimensions.height;

  // The handles: one per control vertex.
  const handles = (vertices?.x || []).map((x, i) => ({
    x: toScreenX(x),
    y: toScreenY(vertices.y[i]),
    index: i,
  }));
  const handleScreenXs = handles.map((h) => h.x);
  const handleScreenYs = handles.map((h) => h.y);

  /**
   * Find nearest handle within 12 screen pixels.
   * Deterministic tie-break: uses <= so the later index wins ties on exact-coincident vertices.
   */
  const findNearestHandle = useCallback((pointer) => {
    if (!pointer) return null;
    let nearest = null;
    let nearestDistance = HANDLE_HIT_RADIUS;

    handles.forEach((handle) => {
      const distance = Math.hypot(
        pointer.x - handle.x,
        pointer.y - handle.y,
      );

      if (distance <= nearestDistance) {
        nearest = handle;
        nearestDistance = distance;
      }
    });

    return nearest;
  }, [handles, HANDLE_HIT_RADIUS]);

  const armNearestVertex = useCallback((e) => {
    const stage = e.target?.getStage ? e.target.getStage() : e.target;
    const pointerPos = stage?.getPointerPosition?.();
    const nearest = findNearestHandle(pointerPos);

    draggedSinceDownRef.current = false;
    activeVertexRef.current = nearest?.index ?? null;

    if (nearest) {
      const container = stage?.container?.();
      if (container?.style) container.style.cursor = 'grabbing';
    }

    return nearest;
  }, [findNearestHandle]);

  const handlePointsStageMouseDown = useCallback((e) => {
    const isPanAction = e.evt?.button === 1 || (e.evt?.button === 0 && spacePressed);
    if (isPanAction || (e.evt?.button != null && e.evt.button !== 0)) {
      forwardedMouseDownRef.current = true;
      forwardNativeEvent(e.evt);
      return;
    }
    const nearest = armNearestVertex(e);
    if (nearest) {
      forwardedMouseDownRef.current = false;
    } else {
      forwardedMouseDownRef.current = true;
      forwardNativeEvent(e.evt);
    }
  }, [armNearestVertex, forwardNativeEvent, spacePressed]);

  const handleSingleStageMouseDown = useCallback((e) => {
    const isPanAction = e.evt?.button === 1 || (e.evt?.button === 0 && spacePressed);
    forwardedMouseDownRef.current = isPanAction;
    if (isPanAction) {
      forwardNativeEvent(e.evt);
      return;
    }
    if (e.evt?.button != null && e.evt.button !== 0) return;
    armNearestVertex(e);
  }, [armNearestVertex, forwardNativeEvent, spacePressed]);

  const handleStageTouchStart = useCallback((e) => {
    forwardedMouseDownRef.current = false;
    if (armNearestVertex(e)) {
      e.evt?.preventDefault?.();
    }
  }, [armNearestVertex]);

  const handleStageMouseMove = useCallback((e) => {
    const stage = e.target?.getStage ? e.target.getStage() : e.target;
    const pointerPos = stage?.getPointerPosition?.();

    if (activeVertexRef.current !== null) {
      draggedSinceDownRef.current = true;
      if (pointerPos) {
        const clampedX = Math.max(0, Math.min(1, toNormX(pointerPos.x)));
        const clampedY = Math.max(0, Math.min(1, toNormY(pointerPos.y)));
        moveVertex(activeVertexRef.current, clampedX, clampedY);
        scheduleAutoSave();
      }
      return;
    }

    if (forwardedMouseDownRef.current) {
      forwardNativeEvent(e.evt);
      return;
    }

    const nearest = findNearestHandle(pointerPos);
    setHoveredPoint(nearest ? nearest.index : null);
    const container = stage?.container?.();
    if (container?.style) {
      container.style.cursor = spacePressed ? 'grab' : (nearest ? 'grab' : 'default');
    }
  }, [findNearestHandle, forwardNativeEvent, moveVertex, scheduleAutoSave, spacePressed, toNormX, toNormY]);

  const handleStageTouchMove = useCallback((e) => {
    if (activeVertexRef.current !== null) {
      e.evt?.preventDefault?.();
    }
    handleStageMouseMove(e);
  }, [handleStageMouseMove]);

  const handleStageMouseUp = useCallback((e) => {
    if (activeVertexRef.current !== null) {
      activeVertexRef.current = null;
      const stage = e.target?.getStage ? e.target.getStage() : e.target;
      if (stage) {
        const pointerPos = stage?.getPointerPosition?.();
        const nearest = findNearestHandle(pointerPos);
        const container = stage?.container?.();
        if (container?.style) {
          container.style.cursor = spacePressed ? 'grab' : (nearest ? 'grab' : 'default');
        }
      }
    }

    if (forwardedMouseDownRef.current) {
      forwardNativeEvent(e.evt);
      forwardedMouseDownRef.current = false;
    }
  }, [findNearestHandle, forwardNativeEvent, spacePressed]);

  const handleStageTouchEnd = useCallback((e) => {
    if (activeVertexRef.current !== null) {
      e.evt?.preventDefault?.();
    }
    handleStageMouseUp(e);
  }, [handleStageMouseUp]);

  const handleStageMouseLeave = useCallback((e) => {
    if (activeVertexRef.current !== null) {
      activeVertexRef.current = null;
    }
    setHoveredPoint(null);

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

  const handleWheel = useCallback((e) => {
    e.evt.preventDefault();
    forwardNativeEvent(e.evt);
  }, [forwardNativeEvent]);

  const handleDeleteVertex = (index) => {
    if (vertices.x.length <= 3) return; // A closed shape needs at least three.
    deleteVertex(index);
    scheduleAutoSave();
  };

  const handleStageDblClick = (e) => {
    if (spacePressed || (e.evt?.button != null && e.evt.button !== 0)) return;
    const stage = e.target?.getStage ? e.target.getStage() : e.target;
    const pointerPos = stage?.getPointerPosition?.();
    const nearest = findNearestHandle(pointerPos);
    if (nearest) {
      handleDeleteVertex(nearest.index);
    }
  };

  // How close (on-screen px) a click must land to the outline to insert a vertex.
  const insertThreshold = 16 / safeZoom;

  // Click on empty canvas: if it lands on the outline, insert a vertex there.
  const handleStageClick = (e) => {
    if (
      forwardedMouseDownRef.current ||
      draggedSinceDownRef.current ||
      (e.evt?.button != null && e.evt.button !== 0)
    ) return;
    const stage = e.target?.getStage ? e.target.getStage() : e.target;
    const pointerPos = stage?.getPointerPosition?.();
    if (!pointerPos) return;

    // Clicking near an existing handle never inserts a new vertex
    if (findNearestHandle(pointerPos)) return;

    const { index, distance } = nearestEdge(handleScreenXs, handleScreenYs, pointerPos);
    if (distance > insertThreshold) return; // clicked away from the outline — ignore.
    insertVertex(index, toNormX(pointerPos.x), toNormY(pointerPos.y));
    scheduleAutoSave();
  };

  if (!editModeActive || !draftCoordinates || !vertices || !imageObject || imageDimensions.width === 0) {
    return null;
  }

  // The smooth outline: every dense draft point (straight segments between them
  // trace the resampled Catmull-Rom curve).
  const linePoints = draftCoordinates.x.flatMap((x, i) => [toScreenX(x), toScreenY(draftCoordinates.y[i])]);

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

  const pointsLayer = (
    <Layer listening={false}>
      {handles.map((handle) => {
        const isHovered = hoveredPoint === handle.index;
        return (
          <Circle
            key={handle.index}
            x={handle.x}
            y={handle.y}
            radius={isHovered ? baseHoveredRadius : baseVisibleRadius}
            fill={isHovered ? '#2563eb' : '#3b82f6'}
            stroke="#ffffff"
            strokeWidth={Math.max(0.5, 1 / safeZoom)}
            listening={false}
          />
        );
      })}
    </Layer>
  );

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
            className={spacePressed ? 'cursor-grab pointer-events-auto' : 'pointer-events-auto'}
            onMouseDown={handlePointsStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
            onMouseLeave={handleStageMouseLeave}
            onTouchStart={handleStageTouchStart}
            onTouchMove={handleStageTouchMove}
            onTouchEnd={handleStageTouchEnd}
            onDblClick={handleStageDblClick}
            onContextMenu={handlePointsStageContextMenu}
            onWheel={handleWheel}
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
        <Stage
          {...stageProps}
          ref={singleStageRef}
          className={spacePressed ? 'cursor-grab pointer-events-auto' : 'pointer-events-auto'}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onDblClick={handleStageDblClick}
          onMouseDown={handleSingleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={handleStageMouseLeave}
          onTouchStart={handleStageTouchStart}
          onTouchMove={handleStageTouchMove}
          onTouchEnd={handleStageTouchEnd}
          onWheel={handleWheel}
        >
          {lineLayer}
          {pointsLayer}
        </Stage>
      </div>

      {/* Discoverability hint for the insert/delete gestures. */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[62] pointer-events-none px-3 py-1.5 rounded-lg bg-scrim text-white text-xs font-medium shadow-lg backdrop-blur-sm"
      >
        Drag a point to reshape · Click the outline to add a point · Double-click a point to remove · Esc to discard
      </div>
    </>
  );
};

export default EditableContourOverlay;
