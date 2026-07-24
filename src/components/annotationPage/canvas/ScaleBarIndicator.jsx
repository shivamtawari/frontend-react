import React, { useMemo } from 'react';
import { useImageScale, useImageObject } from '../../../stores/selectors/annotationSelectors';

/**
 * A map-style scale bar shown in the bottom-right corner of the canvas.
 * Only renders when a real-world scale has been set (unit !== 'px').
 *
 * Props:
 *   canvasRef {object}   Ref to the <img> element to compute rendered display bounds.
 *   zoomLevel {number}   Current canvas zoom level (for computing displayed bar width).
 */
const ScaleBarIndicator = ({ canvasRef, zoomLevel = 1 }) => {
  const scale = useImageScale();
  const imageObject = useImageObject();

  const barInfo = useMemo(() => {
    if (!scale || scale.unit === 'px' || !scale.scaleX || scale.scaleX <= 0) return null;

    // Calculate actual rendered CSS pixel width of the image inside container (object-contain)
    let displayRatio = 1; // natural image pixels per rendered CSS screen pixel
    if (canvasRef?.current && imageObject) {
      const container = canvasRef.current.parentElement;
      if (container) {
        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;
        const imgW = imageObject.width || imageObject.naturalWidth || 0;
        const imgH = imageObject.height || imageObject.naturalHeight || 0;

        if (imgW > 0 && imgH > 0 && containerWidth > 0 && containerHeight > 0) {
          const imageAspect = imgW / imgH;
          const containerAspect = containerWidth / containerHeight;
          const renderedWidth = imageAspect > containerAspect
            ? containerWidth
            : containerHeight * imageAspect;
          displayRatio = imgW / renderedWidth;
        }
      }
    }

    // Target bar width on screen: ~130px for better visibility
    const targetScreenPx = 130;
    // Physical units per CSS screen pixel at current zoomLevel
    const realPerScreenPx = (scale.scaleX * displayRatio) / zoomLevel;
    const rawRealWidth = targetScreenPx * realPerScreenPx;

    // Round to a "nice" number (1, 2, 5, 10, 20, 50, 100, ...)
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawRealWidth)));
    const fraction = rawRealWidth / magnitude;
    let nice;
    if (fraction < 1.5) nice = 1;
    else if (fraction < 3.5) nice = 2;
    else if (fraction < 7.5) nice = 5;
    else nice = 10;
    const niceRealWidth = nice * magnitude;

    // Convert back to screen pixels
    const barScreenPx = niceRealWidth / realPerScreenPx;

    // Format label: use integer if whole number, otherwise up to 3 sig figs
    const label = Number.isInteger(niceRealWidth)
      ? `${niceRealWidth} ${scale.unit}`
      : `${parseFloat(niceRealWidth.toPrecision(3))} ${scale.unit}`;

    return { barScreenPx, label };
  }, [scale, zoomLevel, canvasRef, imageObject]);

  if (!barInfo) return null;

  return (
    <div
      className="absolute bottom-5 right-5 pointer-events-none select-none"
      style={{ zIndex: 50 }}
      aria-label={`Scale bar: ${barInfo.label}`}
    >
      <div className="bg-slate-900/85 backdrop-blur-md border border-slate-700/60 shadow-xl rounded-xl px-3.5 py-2 text-white flex flex-col items-center gap-1.5 transition-all">
        {/* Bar */}
        <div className="flex items-center gap-0">
          <div className="w-0.5 h-3.5 bg-white rounded-full shadow-xs" />
          <div
            style={{ width: `${barInfo.barScreenPx}px`, height: '2.5px' }}
            className="bg-white rounded-full shadow-xs"
          />
          <div className="w-0.5 h-3.5 bg-white rounded-full shadow-xs" />
        </div>
        {/* Label */}
        <span className="text-xs font-bold tracking-wider leading-none text-slate-100 drop-shadow-xs">
          {barInfo.label}
        </span>
      </div>
    </div>
  );
};

export default ScaleBarIndicator;
