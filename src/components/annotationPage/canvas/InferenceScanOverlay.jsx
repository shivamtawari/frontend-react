import React from 'react';
import {
  useIsSubmitting,
  useIsRunningSuggestion,
  useIsRunningInstance,
  useImageObject,
} from '../../../stores/selectors/annotationSelectors';
import useImageDisplayRect from '../../../hooks/useImageDisplayRect';

/** Brand teal (theme.js ACCENT) as rgb parts, so the layers can carry alpha. */
const AC = '20, 184, 166';

/**
 * Ambient "the model is reading this image" treatment, shown while any AI
 * inference is in flight (prompted segmentation, refinement, suggestion,
 * instance detection).
 *
 * Inference here is genuinely slow and of indeterminate length, so a looping
 * indicator is the honest shape: it reports *that* work is happening, without
 * pretending to know how far along it is. It is scoped to the painted image
 * rather than the whole stage because the state it conveys is about this image.
 *
 * Purely atmospheric and always `pointer-events-none` — the action bar stays
 * reachable while it runs.
 */
const InferenceScanOverlay = ({ containerRef, zoomLevel = 1, panOffset = { x: 0, y: 0 } }) => {
  const isSubmitting = useIsSubmitting();
  const isRunningSuggestion = useIsRunningSuggestion();
  const isRunningInstance = useIsRunningInstance();
  const imageObject = useImageObject();

  const rect = useImageDisplayRect(containerRef, imageObject);
  const running = isSubmitting || isRunningSuggestion || isRunningInstance;

  if (!running || rect.width === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none animate-dcFadeSlow"
      style={{
        zIndex: 50,
        transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
        transformOrigin: 'center center',
      }}
      aria-hidden="true"
    >
      <div
        className="absolute overflow-hidden"
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      >
        {/* Scrim. Doing double duty: it signals the image is momentarily not
            yours to edit, and it gives the teal below something to read
            against — over a bright photo the glow alone washes out. */}
        <div className="absolute inset-0" style={{ background: 'rgba(6, 14, 16, .34)' }} />

        {/* Aura: light gathered at the edges of the frame, breathing. Opacity is
            the only animated property, so the shadow is rasterised once. */}
        <div
          className="absolute inset-0 animate-dcAura motion-reduce:animate-none motion-reduce:opacity-70"
          style={{
            boxShadow: `inset 0 0 70px 8px rgba(${AC}, .55), inset 0 0 180px 34px rgba(${AC}, .28)`,
          }}
        />

        {/* Scan band. Transform-only movement; the gradient fades to fully clear
            at both ends so the band has no visible edge. */}
        <div
          className="absolute -left-1/4 w-[150%] h-[42%] animate-dcSweep motion-reduce:hidden"
          style={{
            background: `linear-gradient(to bottom,
              rgba(${AC}, 0) 0%,
              rgba(${AC}, .18) 38%,
              rgba(${AC}, .45) 50%,
              rgba(${AC}, .18) 62%,
              rgba(${AC}, 0) 100%)`,
            filter: 'blur(16px)',
          }}
        />

        {/* Leading edge of the sweep: a bright hairline, the part that reads as
            "being scanned right now" rather than a general glow. Lifted toward
            white so it stays legible over the band's own teal. */}
        <div
          className="absolute -left-1/4 w-[150%] h-[42%] animate-dcSweep motion-reduce:hidden"
          style={{
            background: `linear-gradient(to bottom,
              transparent 0%,
              transparent 49.2%,
              rgba(160, 255, 242, .85) 50%,
              transparent 50.8%,
              transparent 100%)`,
          }}
        />
      </div>
    </div>
  );
};

export default InferenceScanOverlay;
