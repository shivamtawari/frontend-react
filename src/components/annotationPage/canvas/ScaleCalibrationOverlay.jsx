import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { setPixelScaleViaDrawnLine } from '../../../api/scale';
import {
  useCalibrationPoints,
  useCancelCalibration,
  useCurrentImageId,
  useImageObject,
  useIsCalibrating,
  useSetCalibrationPoint,
  useSetCurrentTool,
  useSetImageScale,
} from '../../../stores/selectors/annotationSelectors';
import ScaleInputModal from '../modals/ScaleInputModal';

/**
 * SVG overlay that handles drawing the two-point calibration line.
 *
 * The overlay is rendered outside the zoom/pan transform (identical to
 * SegmentationOverlay) so it occupies the full canvas container and uses the
 * same imageDimensions geometry to convert between container-relative clicks
 * and image-pixel coordinates.
 *
 * Props:
 *   canvasRef      ref to the <img> element (for getBoundingClientRect)
 *   zoomLevel      current zoom level
 *   panOffset      { x, y } current pan
 *   imageObject    the loaded Image object (for naturalWidth/naturalHeight)
 */
const ScaleCalibrationOverlay = ({ canvasRef, zoomLevel, panOffset }) => {
  const isCalibrating = useIsCalibrating();
  const calibrationPoints = useCalibrationPoints();
  const setCalibrationPoint = useSetCalibrationPoint();
  const cancelCalibration = useCancelCalibration();
  const setCurrentTool = useSetCurrentTool();
  const setImageScale = useSetImageScale();
  const imageObject = useImageObject();
  const currentImageId = useCurrentImageId();

  const containerRef = useRef(null);
  const [imageDimensions, setImageDimensions] = useState(null);
  const [mousePos, setMousePos] = useState(null); // live cursor position during drawing
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Mirror the imageDimensions calculation used in SegmentationOverlay
  useEffect(() => {
    if (!containerRef.current || !imageObject) return;

    const updateDimensions = () => {
      const container = containerRef.current;
      if (!container) return;
      const containerWidth = container.offsetWidth;
      const containerHeight = container.offsetHeight;
      const imgW = imageObject.width || imageObject.naturalWidth || 0;
      const imgH = imageObject.height || imageObject.naturalHeight || 0;
      if (!imgW || !imgH) return;
      const imageAspect = imgW / imgH;
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
    const ro = new ResizeObserver(updateDimensions);
    ro.observe(containerRef.current);
    const el = containerRef.current;
    return () => { ro.unobserve(el); ro.disconnect(); };
  }, [imageObject]);

  /**
   * Convert a container-relative point (from a mouse event) to image-pixel
   * coordinates, accounting for zoom/pan.
   */
  const containerToImagePx = useCallback((containerX, containerY) => {
    // The image is centered inside the container with object-contain layout.
    // The zoom/pan transform is applied on the inner div, not this overlay.
    // We read the actual rendered image rect from canvasRef for accuracy.
    if (!canvasRef?.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    // rect is in viewport coordinates; containerRef is also in viewport coords
    const containerRect = containerRef.current.getBoundingClientRect();
    const relX = containerX + containerRect.left - rect.left;
    const relY = containerY + containerRect.top - rect.top;
    const imgW = imageObject?.width || imageObject?.naturalWidth || 1;
    const imgH = imageObject?.height || imageObject?.naturalHeight || 1;
    const scaleX = imgW / rect.width;
    const scaleY = imgH / rect.height;
    return { x: relX * scaleX, y: relY * scaleY };
  }, [canvasRef, imageObject]);

  const handleMouseMove = useCallback((e) => {
    if (!isCalibrating) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, [isCalibrating]);

  const handleClick = useCallback((e) => {
    if (!isCalibrating) return;
    const rect = containerRef.current.getBoundingClientRect();
    const containerX = e.clientX - rect.left;
    const containerY = e.clientY - rect.top;
    const imgPx = containerToImagePx(containerX, containerY);
    if (!imgPx) return;

    const hasP1 = calibrationPoints?.p1 != null;
    if (!hasP1) {
      // Record first point — store container coords for SVG display + image px for backend
      setCalibrationPoint({ x: imgPx.x, y: imgPx.y, _cx: containerX, _cy: containerY }, 0);
    } else {
      // Second click — record and show modal
      setCalibrationPoint({ x: imgPx.x, y: imgPx.y, _cx: containerX, _cy: containerY }, 1);
      setShowModal(true);
    }
  }, [isCalibrating, calibrationPoints, setCalibrationPoint, containerToImagePx]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && isCalibrating) {
      cancelCalibration();
      setCurrentTool('ai_annotation');
      setShowModal(false);
      setMousePos(null);
    }
  }, [isCalibrating, cancelCalibration, setCurrentTool]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleConfirm = async ({ knownDistance, unit }) => {
    if (!calibrationPoints?.p1 || !calibrationPoints?.p2) return;
    setSaving(true);
    try {
      const result = await setPixelScaleViaDrawnLine(
        currentImageId,
        { x: calibrationPoints.p1.x, y: calibrationPoints.p1.y },
        { x: calibrationPoints.p2.x, y: calibrationPoints.p2.y },
        knownDistance,
        unit,
      );
      setImageScale(result.scale_x, result.scale_y, result.unit);
      setShowModal(false);
      cancelCalibration();
      setCurrentTool('ai_annotation');
    } catch (err) {
      console.error('Failed to set scale:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleModalCancel = () => {
    setShowModal(false);
    cancelCalibration();
    setCurrentTool('ai_annotation');
    setMousePos(null);
  };

  if (!isCalibrating && !showModal) return null;

  // --- SVG drawing helpers ---
  const p1 = calibrationPoints?.p1;
  const p2 = calibrationPoints?.p2;
  // Use container coords (_cx, _cy) for drawing — image-px are only for the backend
  const cx1 = p1?._cx;
  const cy1 = p1?._cy;
  const cx2 = p2?._cx ?? mousePos?.x;
  const cy2 = p2?._cy ?? mousePos?.y;

  const pixelDistance = p1 && p2
    ? Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
    : null;

  return (
    <>
      {/* SVG overlay for the calibration line */}
      {isCalibrating && (
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ zIndex: 80, cursor: p1 ? 'crosshair' : 'crosshair' }}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <filter id="cal-glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Line from p1 to cursor / p2 */}
            {cx1 != null && cx2 != null && (
              <line
                x1={cx1} y1={cy1} x2={cx2} y2={cy2}
                stroke="#f59e0b"
                strokeWidth="2"
                strokeDasharray="8,4"
                filter="url(#cal-glow)"
              />
            )}

            {/* P1 dot */}
            {cx1 != null && (
              <>
                <circle cx={cx1} cy={cy1} r="7" fill="rgba(245,158,11,0.2)" stroke="#f59e0b" strokeWidth="2" />
                <circle cx={cx1} cy={cy1} r="3" fill="#f59e0b" />
              </>
            )}

            {/* P2 dot */}
            {p2 && cx2 != null && (
              <>
                <circle cx={cx2} cy={cy2} r="7" fill="rgba(245,158,11,0.2)" stroke="#f59e0b" strokeWidth="2" />
                <circle cx={cx2} cy={cy2} r="3" fill="#f59e0b" />
              </>
            )}

            {/* Pixel distance label */}
            {cx1 != null && cx2 != null && (
              <text
                x={(cx1 + cx2) / 2}
                y={(cy1 + cy2) / 2 - 10}
                fill="#f59e0b"
                fontSize="12"
                fontWeight="600"
                textAnchor="middle"
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}
              >
                {pixelDistance ? `${Math.round(pixelDistance)}px` : ''}
              </text>
            )}
          </svg>

          {/* Instruction banner */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/95 text-white text-sm font-medium shadow-lg">
              <span>
                {!p1
                  ? '📏 Click the first point on the image'
                  : '📏 Click the second point to complete the line'}
              </span>
              <span className="text-white/70 text-xs ml-2">ESC to cancel</span>
            </div>
          </div>
        </div>
      )}

      {/* Scale input modal — portalled to body so it escapes the transform */}
      {showModal && ReactDOM.createPortal(
        <ScaleInputModal
          pixelDistance={pixelDistance}
          onConfirm={handleConfirm}
          onCancel={handleModalCancel}
          saving={saving}
        />,
        document.body,
      )}
    </>
  );
};

export default ScaleCalibrationOverlay;
