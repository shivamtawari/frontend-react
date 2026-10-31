import React from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import DatasetGallery from './DatasetGallery';
import useAppStore from '../../stores/useAppStore';
import * as datasetGalleryData from '../../hooks/useDatasetGalleryData';

const mockNavigate = vi.fn();
let mockLocation = { pathname: '/dataset/1/datamanagement/images' };
let mockParams = { datasetId: '1' };

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
  useParams: () => mockParams,
}));

let mockCurrentDataset = { id: 1, name: 'Dataset One' };

vi.mock('../../contexts/DatasetContext', () => ({
  useDataset: () => ({
    currentDataset: mockCurrentDataset,
    loading: false,
    datasets: [{ id: 1, name: 'Dataset One' }],
  }),
}));

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAny: () => true,
    role: 'owner',
  }),
}));

let capturedOnImagesUpdated = null;
vi.mock('./gallery/DataManagementView', () => ({
  default: ({ onImagesUpdated, images }) => {
    capturedOnImagesUpdated = onImagesUpdated;
    return (
      <div data-testid="data-management-view">
        <span data-testid="image-count">{images.length}</span>
        <button data-testid="trigger-refresh" onClick={onImagesUpdated}>
          Refresh
        </button>
      </div>
    );
  },
}));

vi.mock('./gallery/DatasetManagementLayout', () => ({
  default: ({ children }) => <div data-testid="layout">{children}</div>,
}));

vi.mock('./gallery/ManagementCardsView', () => ({
  default: () => <div data-testid="management-cards-view" />,
}));

vi.mock('./gallery/LabelManagementView', () => ({
  default: () => <div data-testid="label-management-view" />,
}));

vi.mock('./gallery/DatasetExportModal', () => ({
  default: () => null,
}));

vi.mock('./gallery/AnnotationQueueModal', () => ({
  default: () => null,
}));

describe('DatasetGallery refresh and overlapping request races', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.getState().galleryActions.resetGalleryState();
    mockCurrentDataset = { id: 1, name: 'Dataset One' };
    mockParams = { datasetId: '1' };
    mockLocation = { pathname: '/dataset/1/datamanagement/images' };
    useAppStore.getState().galleryActions.setCurrentDataset(mockCurrentDataset);
  });

  afterEach(() => {
    cleanup();
    useAppStore.getState().galleryActions.resetGalleryState();
  });

  it('updates images in store when onImagesUpdated refresh completes', async () => {
    const fetchSpy = vi.spyOn(datasetGalleryData, 'fetchGalleryItems').mockResolvedValueOnce([
      { id: 10, name: 'uploaded_file.png', isFromAPI: true },
    ]);

    render(<DatasetGallery />);

    expect(screen.getByTestId('data-management-view')).toBeInTheDocument();

    await act(async () => {
      await capturedOnImagesUpdated();
    });

    expect(fetchSpy).toHaveBeenCalledWith(1);
    expect(useAppStore.getState().gallery.images).toHaveLength(1);
    expect(useAppStore.getState().gallery.images[0].name).toBe('uploaded_file.png');
  });

  it('overlapping refreshes: an older refresh finishing late must not overwrite newer refresh results', async () => {
    let resolveRefresh1;
    let resolveRefresh2;

    const promise1 = new Promise((resolve) => {
      resolveRefresh1 = resolve;
    });
    const promise2 = new Promise((resolve) => {
      resolveRefresh2 = resolve;
    });

    vi.spyOn(datasetGalleryData, 'fetchGalleryItems')
      .mockImplementationOnce(() => promise1)
      .mockImplementationOnce(() => promise2);

    render(<DatasetGallery />);

    // Start Refresh 1 (older)
    await act(async () => {
      capturedOnImagesUpdated();
    });

    // Start Refresh 2 (newer)
    await act(async () => {
      capturedOnImagesUpdated();
    });

    // Resolve Refresh 2 first with 3 images
    await act(async () => {
      resolveRefresh2([
        { id: 1, name: 'img1.png' },
        { id: 2, name: 'img2.png' },
        { id: 3, name: 'img3.png' },
      ]);
      await Promise.resolve();
    });

    expect(useAppStore.getState().gallery.images).toHaveLength(3);

    // Resolve Refresh 1 later with only 1 image
    await act(async () => {
      resolveRefresh1([{ id: 1, name: 'img1.png' }]);
      await Promise.resolve();
    });

    // Must still have 3 images (Refresh 1 was superseded and ignored!)
    expect(useAppStore.getState().gallery.images).toHaveLength(3);
    expect(useAppStore.getState().gallery.images[2].name).toBe('img3.png');
  });

  it('stale refresh does not overwrite images if dataset changed while refresh was in flight', async () => {
    let resolveRefresh;
    const promise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    vi.spyOn(datasetGalleryData, 'fetchGalleryItems').mockReturnValueOnce(promise);

    render(<DatasetGallery />);

    // Start refresh on Dataset 1
    await act(async () => {
      capturedOnImagesUpdated();
    });

    // User switches to Dataset 2
    await act(async () => {
      useAppStore.getState().galleryActions.setCurrentDataset({ id: 2, name: 'Dataset Two' });
      useAppStore.getState().galleryActions.setImages([{ id: 200, name: 'dataset2.png' }]);
    });

    // Refresh for Dataset 1 finishes
    await act(async () => {
      resolveRefresh([{ id: 100, name: 'dataset1_late.png' }]);
    });

    // Store must still contain Dataset 2's images, not Dataset 1's late image!
    const state = useAppStore.getState().gallery;
    expect(state.currentDataset?.id).toBe(2);
    expect(state.images).toHaveLength(1);
    expect(state.images[0].name).toBe('dataset2.png');
  });

  it('checks dataset ownership before advancing request generation so old upload refresh does not invalidate active dataset request', async () => {
    const fetchSpy = vi.spyOn(datasetGalleryData, 'fetchGalleryItems').mockResolvedValue([]);

    render(<DatasetGallery />);
    const datasetAOnImagesUpdated = capturedOnImagesUpdated;

    // User starts uploading in Dataset A, then switches to Dataset B.
    // Store is updated to Dataset B and Dataset B starts loading with generation genB.
    let genB;
    await act(async () => {
      useAppStore.getState().galleryActions.setCurrentDataset({ id: 2, name: 'Dataset Two' });
      genB = useAppStore.getState().galleryActions.nextRequestGeneration(2);
    });

    // Now Dataset A's upload finishes while B is loading, triggering A's old refresh callback.
    await act(async () => {
      await datasetAOnImagesUpdated();
    });

    // Refresh for Dataset A must NOT advance request generation or trigger fetch for A
    expect(useAppStore.getState().gallery.requestGeneration).toBe(genB);
    expect(fetchSpy).not.toHaveBeenCalledWith(1);

    // Dataset B completes loading
    const datasetBImages = [{ id: 201, name: 'b1.png' }];
    await act(async () => {
      if (useAppStore.getState().gallery.requestGeneration === genB) {
        useAppStore.getState().galleryActions.setImages(datasetBImages);
      }
    });

    // Dataset B's gallery MUST remain populated and not discarded
    expect(useAppStore.getState().gallery.images).toEqual(datasetBImages);
  });
});
