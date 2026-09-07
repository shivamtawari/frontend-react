import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import SegmentationOverlay from './SegmentationOverlay';
import * as annotationSelectors from '../../../stores/selectors/annotationSelectors';

describe('SegmentationOverlay refinement fill regression', () => {
  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      constructor(cb) {
        this.cb = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 600,
    });
  });

  const activeObject = {
    id: 1,
    contour_id: 101,
    color: '#3b82f6',
    parent_id: null,
    status: 'approved',
    x: [0.1, 0.2, 0.2, 0.1],
    y: [0.1, 0.1, 0.2, 0.2],
  };

  const descendantObject = {
    id: 2,
    contour_id: 102,
    color: '#10b981',
    parent_id: 1,
    status: 'approved',
    x: [0.12, 0.18, 0.18, 0.12],
    y: [0.12, 0.12, 0.18, 0.18],
  };

  const isTransparentFill = (fill) => {
    if (!fill) return false;
    if (fill === 'none' || fill === 'transparent') return true;
    const rgbaMatch = fill.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
    if (rgbaMatch) {
      return parseFloat(rgbaMatch[1]) === 0;
    }
    return false;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(annotationSelectors, 'useCurrentMask').mockReturnValue(null);
    vi.spyOn(annotationSelectors, 'useObjectsList').mockReturnValue([activeObject, descendantObject]);
    vi.spyOn(annotationSelectors, 'useImageObject').mockReturnValue({ width: 800, height: 600 });
    vi.spyOn(annotationSelectors, 'useShowContextMenu').mockReturnValue(vi.fn());
    vi.spyOn(annotationSelectors, 'useEnterFocusMode').mockReturnValue(vi.fn());
    vi.spyOn(annotationSelectors, 'useCurrentTool').mockReturnValue('ai_annotation');
    vi.spyOn(annotationSelectors, 'useSelectedObjects').mockReturnValue([]);
    vi.spyOn(annotationSelectors, 'useSelectObject').mockReturnValue(vi.fn());
    vi.spyOn(annotationSelectors, 'useDeselectObject').mockReturnValue(vi.fn());
    vi.spyOn(annotationSelectors, 'useClearSelection').mockReturnValue(vi.fn());
    vi.spyOn(annotationSelectors, 'useFocusModeActive').mockReturnValue(false);
    vi.spyOn(annotationSelectors, 'useFocusModeObjectId').mockReturnValue(null);
    vi.spyOn(annotationSelectors, 'useEnterRefinementMode').mockReturnValue(vi.fn());
    vi.spyOn(annotationSelectors, 'useSetCurrentTool').mockReturnValue(vi.fn());
    vi.spyOn(annotationSelectors, 'useExitFocusMode').mockReturnValue(vi.fn());
    vi.spyOn(annotationSelectors, 'useObjectsVisibility').mockReturnValue({ showAll: true, labels: {} });
    vi.spyOn(annotationSelectors, 'useEnterEditMode').mockReturnValue(vi.fn());
    vi.spyOn(annotationSelectors, 'useExitEditMode').mockReturnValue(vi.fn());
    vi.spyOn(annotationSelectors, 'useUpdateObject').mockReturnValue(vi.fn());
    vi.spyOn(annotationSelectors, 'useHoveredObjectId').mockReturnValue(null);
    vi.spyOn(annotationSelectors, 'useSetHoveredObjectId').mockReturnValue(vi.fn());
    vi.spyOn(annotationSelectors, 'useWorkspaceMode').mockReturnValue('annotate');
    vi.spyOn(annotationSelectors, 'useShowApproved').mockReturnValue(true);
    vi.spyOn(annotationSelectors, 'useChipMode').mockReturnValue('off');
    vi.spyOn(annotationSelectors, 'useHiddenObjectIds').mockReturnValue({});
  });

  it('renders active and contextual contours with transparent fill and distinct strokes in refinement mode', () => {
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(true);
    vi.spyOn(annotationSelectors, 'useRefinementModeObjectId').mockReturnValue(1);

    const { container } = render(<SegmentationOverlay />);

    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBe(2);

    const activePath = paths[0];
    const descendantPath = paths[1];

    // Assert active and contextual paths have transparent interiors
    expect(isTransparentFill(activePath.getAttribute('fill'))).toBe(true);
    expect(isTransparentFill(descendantPath.getAttribute('fill'))).toBe(true);

    // Assert active stroke is stronger than contextual stroke
    const activeStrokeWidth = parseFloat(activePath.getAttribute('stroke-width'));
    const descendantStrokeWidth = parseFloat(descendantPath.getAttribute('stroke-width'));
    expect(activeStrokeWidth).toBeGreaterThan(descendantStrokeWidth);

    // Assert paths are pointer-inert in refinement mode
    expect(activePath.style.pointerEvents).toBe('none');
    expect(descendantPath.style.pointerEvents).toBe('none');
  });

  it('restores state-based fill when refinement mode is deactivated', () => {
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(false);
    vi.spyOn(annotationSelectors, 'useRefinementModeObjectId').mockReturnValue(null);

    const { container } = render(<SegmentationOverlay />);

    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBe(2);

    const normalPath = paths[0];
    const fill = normalPath.getAttribute('fill');

    // Normal mode must retain solid/state fill rather than transparent
    expect(isTransparentFill(fill)).toBe(false);
  });
});
