import { useState, useRef, useEffect, useCallback } from 'react';

// Pixel thresholds (in stage space) for polygon/freehand drawing gestures.
const POLYGON_CLOSE_THRESHOLD_PX = 12; // click within this of the first vertex closes the shape
const MIN_SKETCH_DIST_PX = 4; // minimum spacing between captured freehand points

/**
 * Reusable polygon / freehand drawing gesture logic for Konva canvases.
 *
 * Manages the in-progress vertex list and exposes Konva event handlers. On
 * completion it invokes `onFinalize(points, { freehand })` with image-space
 * points ({x, y}); the caller decides what to do (add a prompt, create an
 * object, run focus-mode checks, …). The hook resets its own state afterward.
 *
 * @param {Object} params
 * @param {('polygon'|'freehand'|string)} params.mode - Active drawing mode
 * @param {Function} params.stageToImageCoords - Maps stage px -> {imageX, imageY}
 * @param {Function} params.getScale - Returns the current stage scale (px per image px)
 * @param {Function} params.onFinalize - Called with (points, { freehand }) on completion
 * @param {number} [params.minPoints=3] - Fewest points a completed shape needs (2 for an open line)
 * @param {boolean} [params.closeOnFirst=true] - Polygon closes when clicking near the first vertex
 *   (turn off for open lines, which finish on double-click / Enter instead)
 */
const usePromptDrawing = ({ mode, stageToImageCoords, getScale, onFinalize, minPoints = 3, closeOnFirst = true }) => {
  const [polygonPoints, setPolygonPoints] = useState([]);
  const [cursorImagePt, setCursorImagePt] = useState(null); // live vertex for the rubber band
  const [isSketching, setIsSketching] = useState(false); // freehand drag in progress
  const pointsRef = useRef([]);

  const isDrawMode = mode === 'polygon' || mode === 'freehand';

  useEffect(() => {
    pointsRef.current = polygonPoints;
  }, [polygonPoints]);

  const resetDrawing = useCallback(() => {
    setPolygonPoints([]);
    setCursorImagePt(null);
    setIsSketching(false);
  }, []);

  // Abandon any half-drawn outline when the drawing mode changes
  useEffect(() => {
    resetDrawing();
  }, [mode, resetDrawing]);

  const finalize = useCallback((ptsArg, freehand = false) => {
    const pts = ptsArg || pointsRef.current;
    resetDrawing();
    if (!pts || pts.length < minPoints) return;
    onFinalize(pts.map((p) => ({ x: p.x, y: p.y })), { freehand });
  }, [onFinalize, resetDrawing, minPoints]);

  const handleMouseDown = useCallback((e) => {
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    const coords = stageToImageCoords(pointerPosition.x, pointerPosition.y);
    if (!coords) return;
    const pt = { x: coords.imageX, y: coords.imageY };

    if (mode === 'freehand') {
      if (e.evt.button !== 0) return;
      setIsSketching(true);
      setPolygonPoints([pt]);
      setCursorImagePt(pt);
      return;
    }

    // Polygon mode
    if (e.evt.button === 2) {
      // Right-click removes the most recent vertex
      setPolygonPoints((pts) => pts.slice(0, -1));
      return;
    }
    if (e.evt.button !== 0) return;

    const existing = pointsRef.current;
    if (closeOnFirst && existing.length >= 3) {
      // Close the shape when clicking near the first vertex
      const first = existing[0];
      const scale = getScale();
      const dx = (first.x - pt.x) * scale;
      const dy = (first.y - pt.y) * scale;
      if (Math.sqrt(dx * dx + dy * dy) <= POLYGON_CLOSE_THRESHOLD_PX) {
        finalize(existing, false);
        return;
      }
    }
    setPolygonPoints((pts) => [...pts, pt]);
  }, [mode, stageToImageCoords, getScale, finalize, closeOnFirst]);

  const handleMouseMove = useCallback((e) => {
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    const coords = stageToImageCoords(pointerPosition.x, pointerPosition.y);
    if (!coords) return;
    const pt = { x: coords.imageX, y: coords.imageY };

    if (mode === 'freehand') {
      if (!isSketching) return;
      setPolygonPoints((pts) => {
        const last = pts[pts.length - 1];
        if (last) {
          const scale = getScale();
          const dx = (pt.x - last.x) * scale;
          const dy = (pt.y - last.y) * scale;
          if (Math.sqrt(dx * dx + dy * dy) < MIN_SKETCH_DIST_PX) return pts;
        }
        return [...pts, pt];
      });
    } else {
      // Polygon: show a live segment from the last vertex to the cursor
      setCursorImagePt(pt);
    }
  }, [mode, isSketching, stageToImageCoords, getScale]);

  const handleMouseUp = useCallback(() => {
    if (mode === 'freehand' && isSketching) {
      finalize(pointsRef.current, true);
    }
  }, [mode, isSketching, finalize]);

  const handleDblClick = useCallback(() => {
    if (mode === 'polygon') {
      finalize(pointsRef.current, false);
    }
  }, [mode, finalize]);

  /**
   * Keyboard handler for Enter (close polygon) / Escape (cancel).
   * Returns true when it consumed the event so the caller can stop processing.
   */
  const handleKeyDown = useCallback((e) => {
    if (!isDrawMode || pointsRef.current.length === 0) return false;
    if (e.code === 'Escape') {
      resetDrawing();
      return true;
    }
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && mode === 'polygon') {
      finalize(pointsRef.current, false);
      return true;
    }
    return false;
  }, [isDrawMode, mode, resetDrawing, finalize]);

  return {
    isDrawMode,
    polygonPoints,
    cursorImagePt,
    isSketching,
    resetDrawing,
    finalize,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDblClick,
    handleKeyDown,
  };
};

export default usePromptDrawing;
