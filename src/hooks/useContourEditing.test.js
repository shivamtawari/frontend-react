import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useContourEditing } from './useContourEditing';
import * as annotationSelectors from '../stores/selectors/annotationSelectors';
import annotationSession from '../services/annotationSession';

vi.mock('../services/annotationSession', () => ({
  default: {
    modifyObject: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe('useContourEditing auto-save idle handling', () => {
  let mockExitEditMode;
  let mockUpdateObject;
  let mockEnterEditMode;
  let mockResetDraft;

  const fakeObject = {
    id: 1,
    x: [0.1, 0.2, 0.3],
    y: [0.1, 0.2, 0.3],
    path: 'M 10 10',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockExitEditMode = vi.fn();
    mockUpdateObject = vi.fn();
    mockEnterEditMode = vi.fn();
    mockResetDraft = vi.fn();

    vi.spyOn(annotationSelectors, 'useEditModeActive').mockReturnValue(true);
    vi.spyOn(annotationSelectors, 'useEditModeObjectId').mockReturnValue(1);
    vi.spyOn(annotationSelectors, 'useEditModeContourId').mockReturnValue(101);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue({
      x: [0.15, 0.25, 0.35],
      y: [0.15, 0.25, 0.35],
    });
    vi.spyOn(annotationSelectors, 'useEditModeIsDirty').mockReturnValue(true);
    vi.spyOn(annotationSelectors, 'useObjectsList').mockReturnValue([fakeObject]);
    vi.spyOn(annotationSelectors, 'useEnterEditMode').mockReturnValue(mockEnterEditMode);
    vi.spyOn(annotationSelectors, 'useResetDraft').mockReturnValue(mockResetDraft);
    vi.spyOn(annotationSelectors, 'useExitEditMode').mockReturnValue(mockExitEditMode);
    vi.spyOn(annotationSelectors, 'useUpdateObject').mockReturnValue(mockUpdateObject);
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers auto-save and exits edit mode after 10s idle when refinement mode is not active', async () => {
    const { result } = renderHook(() => useContourEditing());

    act(() => {
      result.current.scheduleAutoSave();
    });

    // Before 10 seconds: no save or exit
    vi.advanceTimersByTime(9999);
    expect(mockUpdateObject).not.toHaveBeenCalled();
    expect(mockExitEditMode).not.toHaveBeenCalled();

    // At 10 seconds: saves and exits edit mode
    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(mockUpdateObject).toHaveBeenCalledWith(1, {
      x: [0.15, 0.25, 0.35],
      y: [0.15, 0.25, 0.35],
      path: null,
    });
    expect(mockExitEditMode).toHaveBeenCalledTimes(1);
    expect(annotationSession.modifyObject).toHaveBeenCalledWith(101, {
      x: [0.15, 0.25, 0.35],
      y: [0.15, 0.25, 0.35],
    });
  });

  it('skips scheduling idle auto-save when refinement mode is active', async () => {
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(true);

    const { result } = renderHook(() => useContourEditing());

    act(() => {
      result.current.scheduleAutoSave();
    });

    // Advance beyond 10 seconds
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });

    expect(mockUpdateObject).not.toHaveBeenCalled();
    expect(mockExitEditMode).not.toHaveBeenCalled();
    expect(annotationSession.modifyObject).not.toHaveBeenCalled();
  });

  it('cancels pending auto-save timer when refinement mode becomes active', async () => {
    const refinementSpy = vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(false);

    const { result, rerender } = renderHook(() => useContourEditing());

    // Schedule auto-save while outside refinement mode
    act(() => {
      result.current.scheduleAutoSave();
    });

    vi.advanceTimersByTime(5000);

    // Refinement mode activates
    refinementSpy.mockReturnValue(true);
    rerender();

    // Advance past the remaining time
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(mockUpdateObject).not.toHaveBeenCalled();
    expect(mockExitEditMode).not.toHaveBeenCalled();
    expect(annotationSession.modifyObject).not.toHaveBeenCalled();
  });
});
