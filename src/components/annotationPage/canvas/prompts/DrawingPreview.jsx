import React from 'react';
import { Line, Circle } from 'react-konva';

/**
 * Renders the in-progress polygon/freehand outline on a Konva layer.
 *
 * @param {Object} props
 * @param {('polygon'|'freehand')} props.mode - Active drawing mode
 * @param {Array<{x:number,y:number}>} props.polygonPoints - Vertices in image space
 * @param {{x:number,y:number}|null} props.cursorImagePt - Live cursor vertex (polygon only)
 * @param {Function} props.toStage - Maps an image-space point to [stageX, stageY]
 * @param {boolean} [props.closed] - Override whether the preview line closes back
 *   on itself. Defaults to closing only for freehand; pass false to draw an open line.
 */
const DrawingPreview = ({ mode, polygonPoints, cursorImagePt, toStage, closed }) => {
  if (!polygonPoints || polygonPoints.length === 0) return null;
  const isClosed = closed ?? mode === 'freehand';

  const livePoints = [];
  polygonPoints.forEach((pt) => {
    const [sx, sy] = toStage(pt);
    livePoints.push(sx, sy);
  });
  // Polygon shows a rubber-band segment from the last vertex to the cursor
  if (mode === 'polygon' && cursorImagePt) {
    const [cx, cy] = toStage(cursorImagePt);
    livePoints.push(cx, cy);
  }

  return (
    <>
      <Line
        points={livePoints}
        closed={isClosed}
        stroke="#0D9488"
        strokeWidth={2}
        dash={mode === 'polygon' ? [6, 4] : undefined}
        fill={isClosed ? 'rgba(20, 184, 166, 0.12)' : undefined}
        lineJoin="round"
        lineCap="round"
      />
      {mode === 'polygon' &&
        polygonPoints.map((pt, i) => {
          const [sx, sy] = toStage(pt);
          return (
            <Circle
              key={i}
              x={sx}
              y={sy}
              radius={i === 0 ? 5 : 3.5}
              fill={i === 0 ? '#0D9488' : '#14B8A6'}
              stroke="white"
              strokeWidth={1.5}
            />
          );
        })}
    </>
  );
};

export default DrawingPreview;
