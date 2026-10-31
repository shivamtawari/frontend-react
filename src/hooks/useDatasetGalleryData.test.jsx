import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useDatasetGalleryData } from './useDatasetGalleryData';
import useAppStore from '../stores/useAppStore';
import * as api from '../api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

let mockDatasetContextValue = {
  datasets: [],
  currentDataset: null,
  selectDataset: vi.fn(),
  getAnnotationProgress: vi.fn().mockResolvedValue({ total: 0 }),
};

vi.mock('../contexts/DatasetContext', () => ({
  useDataset: () => mockDatasetContextValue,
}));

vi.mock('../api', () => ({
  fetchImages: vi.fn(),
  fetchStacks: vi.fn(),
  fetchLabels: vi.fn(),
}));

const TestComponent = ({ datasetId, customGalleryActions }) => {
  useDatasetGalleryData(datasetId, customGalleryActions);
  return <div data-testid="test-component" />;
};

describe('useDatasetGalleryData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.getState().galleryActions.resetGalleryState();
    api.fetchStacks.mockResolvedValue({ stacks: [] });
    api.fetchLabels.mockResolvedValue([]);
    mockDatasetContextValue = {
      datasets: [
        { id: 1, name: 'Dataset One' },
        { id: 2, name: 'Dataset Two' },
      ],
      currentDataset: null,
      selectDataset: vi.fn((dataset) => {
        mockDatasetContextValue.currentDataset = dataset;
      }),
      getAnnotationProgress: vi.fn().mockResolvedValue({ total: 0 }),
    };
  });

  afterEach(() => {
    useAppStore.getState().galleryActions.resetGalleryState();
  });

  it('1. Reproduce with delayed responses: switching from A to B keeps B when A finishes late', async () => {
    let resolveDatasetA;
    let resolveDatasetB;

    const promiseA = new Promise((resolve) => {
      resolveDatasetA = resolve;
    });
    const promiseB = new Promise((resolve) => {
      resolveDatasetB = resolve;
    });

    api.fetchImages.mockImplementation((id) => {
      if (id === 1) return promiseA;
      if (id === 2) return promiseB;
      return Promise.resolve({ success: true, image_data: [] });
    });

    // Start with Dataset A (id: 1)
    mockDatasetContextValue.currentDataset = { id: 1, name: 'Dataset One' };
    const { rerender } = render(<TestComponent datasetId="1" />);

    // Dataset A fetch is now in flight
    expect(api.fetchImages).toHaveBeenCalledWith(1, { includeFrames: true });
    expect(useAppStore.getState().gallery.loadingData).toBe(true);

    // Switch to Dataset B (id: 2)
    mockDatasetContextValue.currentDataset = { id: 2, name: 'Dataset Two' };
    rerender(<TestComponent datasetId="2" />);

    // Dataset B fetch is now in flight
    expect(api.fetchImages).toHaveBeenCalledWith(2, { includeFrames: true });

    // Finish Dataset B's request first
    await act(async () => {
      resolveDatasetB({
        success: true,
        image_data: [{ image_id: 201, file_name: 'b1.png', status: 'finished' }],
      });
    });

    await waitFor(() => {
      const state = useAppStore.getState().gallery;
      expect(state.currentDataset?.id).toBe(2);
      expect(state.images).toHaveLength(1);
      expect(state.images[0].id).toBe(201);
      expect(state.loadingData).toBe(false);
    });

    // Now finish Dataset A's delayed request
    await act(async () => {
      resolveDatasetA({
        success: true,
        image_data: [{ image_id: 101, file_name: 'a1.png', status: 'finished' }],
      });
    });

    // Dataset B MUST remain displayed! Dataset A's images must NOT overwrite B
    const state = useAppStore.getState().gallery;
    expect(state.currentDataset?.id).toBe(2);
    expect(state.images).toHaveLength(1);
    expect(state.images[0].id).toBe(201);
    expect(state.images[0].name).toBe('b1.png');
    expect(state.loadingData).toBe(false);
    expect(state.error).toBeNull();
  });

  it('2. Only fetches when the URL and context identify the same dataset', async () => {
    api.fetchImages.mockResolvedValue({ success: true, image_data: [] });

    // Context is Dataset 1, but URL is "2" (mismatch)
    mockDatasetContextValue.currentDataset = { id: 1, name: 'Dataset One' };
    render(<TestComponent datasetId="2" />);

    // Should NOT fetch data because context (1) and URL (2) do not match
    expect(api.fetchImages).not.toHaveBeenCalled();
    expect(useAppStore.getState().gallery.loadingData).toBe(false);
  });

  it('3. Ignores outdated errors and loading-state updates when switching datasets', async () => {
    let rejectDatasetA;
    let resolveDatasetB;

    const promiseA = new Promise((_, reject) => {
      rejectDatasetA = reject;
    });
    const promiseB = new Promise((resolve) => {
      resolveDatasetB = resolve;
    });

    api.fetchImages.mockImplementation((id) => {
      if (id === 1) return promiseA;
      if (id === 2) return promiseB;
      return Promise.resolve({ success: true, image_data: [] });
    });

    // Start loading Dataset A
    mockDatasetContextValue.currentDataset = { id: 1, name: 'Dataset One' };
    const { rerender } = render(<TestComponent datasetId="1" />);

    // Switch to Dataset B
    mockDatasetContextValue.currentDataset = { id: 2, name: 'Dataset Two' };
    rerender(<TestComponent datasetId="2" />);

    // Dataset A fails with network error
    await act(async () => {
      rejectDatasetA(new Error('Network error on Dataset A'));
    });

    // Dataset B should NOT have an error set!
    expect(useAppStore.getState().gallery.error).toBeNull();
    // Dataset B is still in flight, so loadingData should NOT be cleared by A
    expect(useAppStore.getState().gallery.loadingData).toBe(true);

    // Finish Dataset B
    await act(async () => {
      resolveDatasetB({
        success: true,
        image_data: [{ image_id: 201, file_name: 'b1.png', status: 'finished' }],
      });
    });

    await waitFor(() => {
      const state = useAppStore.getState().gallery;
      expect(state.error).toBeNull();
      expect(state.loadingData).toBe(false);
      expect(state.images).toHaveLength(1);
    });
  });

  it('4. Same-dataset race: older initial load does not overwrite newer post-upload refresh, clears loading, and keeps labels/stats', async () => {
    let resolveInitialLoad;
    const initialPromise = new Promise((resolve) => {
      resolveInitialLoad = resolve;
    });

    api.fetchImages.mockReturnValueOnce(initialPromise);
    api.fetchLabels.mockResolvedValueOnce(['Cell', 'Nucleus']);
    mockDatasetContextValue.getAnnotationProgress.mockResolvedValueOnce({
      total: 1,
      overall: { finished: 1, in_progress: 0, not_started: 0 },
    });

    mockDatasetContextValue.currentDataset = { id: 1, name: 'Dataset One' };
    render(<TestComponent datasetId="1" />);

    expect(useAppStore.getState().gallery.loadingData).toBe(true);

    // Simulate post-upload refresh for Dataset 1
    const galleryActions = useAppStore.getState().galleryActions;
    const postUploadImages = [
      { id: 1, name: 'initial.png', finished: true },
      { id: 2, name: 'uploaded.png', finished: false },
    ];
    act(() => {
      galleryActions.nextRequestGeneration(1);
      galleryActions.setImages(postUploadImages);
    });

    expect(useAppStore.getState().gallery.images).toHaveLength(2);
    expect(useAppStore.getState().gallery.images[1].name).toBe('uploaded.png');

    // Now the older initial load resolves with older image list (only 1 image)
    await act(async () => {
      resolveInitialLoad({
        success: true,
        image_data: [{ image_id: 1, file_name: 'initial.png', status: 'finished' }],
      });
    });

    await waitFor(() => {
      const state = useAppStore.getState().gallery;
      // Older initial load must NOT overwrite the newer 2 images!
      expect(state.images).toHaveLength(2);
      expect(state.images[1].name).toBe('uploaded.png');
      // Labels and stats must remain populated from initial load!
      expect(state.labels).toEqual(['Cell', 'Nucleus']);
      expect(state.stats.total).toBe(1);
      // Loading must clear!
      expect(state.loadingData).toBe(false);
    });
  });

  it('5. Ignores state updates when unmounted while fetch is in flight', async () => {
    let resolveImages;
    const inFlightPromise = new Promise((resolve) => {
      resolveImages = resolve;
    });
    api.fetchImages.mockReturnValue(inFlightPromise);

    mockDatasetContextValue.currentDataset = { id: 1, name: 'Dataset One' };
    const { unmount } = render(<TestComponent datasetId="1" />);

    expect(useAppStore.getState().gallery.loadingData).toBe(true);

    // Unmount while fetch in flight
    unmount();

    // Resolve after unmount
    await act(async () => {
      resolveImages({
        success: true,
        image_data: [{ image_id: 1, file_name: 'img.png' }],
      });
    });

    // Store should not have had images set by the unmounted component
    expect(useAppStore.getState().gallery.images).toHaveLength(0);
  });

  it('6. Preserves existing caching when images already exist in store', async () => {
    // Populate store cache for dataset 1
    const galleryActions = useAppStore.getState().galleryActions;
    galleryActions.setCurrentDataset({ id: 1, name: 'Dataset One' });
    galleryActions.setImages([{ id: 10, name: 'cached.png', isFromAPI: true }]);

    mockDatasetContextValue.currentDataset = { id: 1, name: 'Dataset One' };
    render(<TestComponent datasetId="1" />);

    // Should NOT fetch because cache is valid and has images
    expect(api.fetchImages).not.toHaveBeenCalled();
    expect(useAppStore.getState().gallery.images).toHaveLength(1);
    expect(useAppStore.getState().gallery.images[0].name).toBe('cached.png');
  });

  it('7. Handles empty datasets properly', async () => {
    api.fetchImages.mockResolvedValue({ success: true, image_data: [] });
    mockDatasetContextValue.currentDataset = { id: 1, name: 'Dataset One' };

    render(<TestComponent datasetId="1" />);

    await waitFor(() => {
      const state = useAppStore.getState().gallery;
      expect(state.images).toEqual([]);
      expect(state.loadingData).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  it('8. Clears loading state when cancelling an initial load, and loads missing labels and statistics on cached return', async () => {
    let resolveInitialLoad;
    const initialPromise = new Promise((resolve) => {
      resolveInitialLoad = resolve;
    });

    api.fetchImages.mockReturnValueOnce(initialPromise);
    api.fetchLabels.mockResolvedValue(['Polyp', 'Adenoma']);
    mockDatasetContextValue.getAnnotationProgress.mockResolvedValue({
      total: 5,
      overall: { finished: 2, in_progress: 1, not_started: 2 },
    });

    // Initial load starts for Dataset 1
    mockDatasetContextValue.currentDataset = { id: 1, name: 'Dataset One' };
    const { unmount } = render(<TestComponent datasetId="1" />);

    expect(useAppStore.getState().gallery.loadingData).toBe(true);

    // Refresh supplies images while the initial load is pending
    const galleryActions = useAppStore.getState().galleryActions;
    act(() => {
      galleryActions.setImages([{ id: 101, name: 'supplied_by_refresh.png', isFromAPI: true }]);
    });
    expect(useAppStore.getState().gallery.images).toHaveLength(1);

    // User navigates away (cancels initial load)
    unmount();

    // Loading state MUST be cleared when initial load is cancelled!
    expect(useAppStore.getState().gallery.loadingData).toBe(false);
    expect(useAppStore.getState().gallery.labelsLoaded).toBe(false);
    expect(useAppStore.getState().gallery.statsLoaded).toBe(false);

    // Returning to the same dataset with cached images skips fetching images, but loads missing labels and stats
    render(<TestComponent datasetId="1" />);

    // loadingData must NOT be stuck enabled!
    expect(useAppStore.getState().gallery.loadingData).toBe(false);
    expect(useAppStore.getState().gallery.images).toHaveLength(1);
    expect(useAppStore.getState().gallery.images[0].name).toBe('supplied_by_refresh.png');

    await waitFor(() => {
      const state = useAppStore.getState().gallery;
      expect(state.loadingData).toBe(false);
      expect(state.labels).toEqual(['Polyp', 'Adenoma']);
      expect(state.labelsLoaded).toBe(true);
      expect(state.stats).toEqual({
        total: 5,
        overall: { finished: 2, in_progress: 1, not_started: 2 },
      });
      expect(state.statsLoaded).toBe(true);
    });

    // Images were NOT re-fetched on cached return (still only 1 fetch call from initial load)
    expect(api.fetchImages).toHaveBeenCalledTimes(1);

    // Late resolve of cancelled initial load
    await act(async () => {
      resolveInitialLoad({
        success: true,
        image_data: [{ image_id: 101, file_name: 'supplied_by_refresh.png' }],
      });
    });

    expect(useAppStore.getState().gallery.loadingData).toBe(false);
  });

  it('9. Does not re-fetch labels or statistics on cached return when both are already loaded', async () => {
    const galleryActions = useAppStore.getState().galleryActions;
    galleryActions.setCurrentDataset({ id: 1, name: 'Dataset One' });
    galleryActions.setImages([{ id: 10, name: 'cached.png', isFromAPI: true }]);
    galleryActions.setLabels(['Healthy', 'Lesion']);
    galleryActions.setStats({ total: 3 });

    mockDatasetContextValue.currentDataset = { id: 1, name: 'Dataset One' };
    render(<TestComponent datasetId="1" />);

    // Should NOT fetch anything because cache is complete
    expect(api.fetchImages).not.toHaveBeenCalled();
    expect(api.fetchLabels).not.toHaveBeenCalled();
    expect(mockDatasetContextValue.getAnnotationProgress).not.toHaveBeenCalled();
    expect(useAppStore.getState().gallery.images).toHaveLength(1);
    expect(useAppStore.getState().gallery.labels).toEqual(['Healthy', 'Lesion']);
    expect(useAppStore.getState().gallery.stats).toEqual({ total: 3 });
    expect(useAppStore.getState().gallery.loadingData).toBe(false);
  });

  it('10. Fetches only missing statistics if labels are already loaded on cached return', async () => {
    const galleryActions = useAppStore.getState().galleryActions;
    galleryActions.setCurrentDataset({ id: 1, name: 'Dataset One' });
    galleryActions.setImages([{ id: 10, name: 'cached.png', isFromAPI: true }]);
    galleryActions.setLabels(['Healthy']);
    // stats NOT loaded

    mockDatasetContextValue.getAnnotationProgress.mockResolvedValueOnce({
      total: 10,
      overall: { finished: 10 },
    });

    mockDatasetContextValue.currentDataset = { id: 1, name: 'Dataset One' };
    render(<TestComponent datasetId="1" />);

    expect(api.fetchImages).not.toHaveBeenCalled();
    expect(api.fetchLabels).not.toHaveBeenCalled();
    expect(mockDatasetContextValue.getAnnotationProgress).toHaveBeenCalledWith(1);

    await waitFor(() => {
      const state = useAppStore.getState().gallery;
      expect(state.stats).toEqual({ total: 10, overall: { finished: 10 } });
      expect(state.statsLoaded).toBe(true);
      expect(state.labels).toEqual(['Healthy']);
      expect(state.loadingData).toBe(false);
    });
  });

  it('11. Cancelling return to cached images does not commit late labels/stats', async () => {
    let resolveLabels;
    const labelsPromise = new Promise((resolve) => {
      resolveLabels = resolve;
    });

    api.fetchLabels.mockReturnValueOnce(labelsPromise);

    const galleryActions = useAppStore.getState().galleryActions;
    galleryActions.setCurrentDataset({ id: 1, name: 'Dataset One' });
    galleryActions.setImages([{ id: 10, name: 'cached.png', isFromAPI: true }]);
    // labels and stats NOT loaded

    mockDatasetContextValue.currentDataset = { id: 1, name: 'Dataset One' };
    const { unmount } = render(<TestComponent datasetId="1" />);

    // Unmount before missing data resolves
    unmount();

    await act(async () => {
      resolveLabels(['LateLabel']);
    });

    // Store labels should NOT have been committed after unmount
    expect(useAppStore.getState().gallery.labels).toEqual([]);
    expect(useAppStore.getState().gallery.labelsLoaded).toBe(false);
  });
});

