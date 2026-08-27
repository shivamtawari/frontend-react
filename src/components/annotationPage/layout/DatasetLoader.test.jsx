import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DatasetLoader from './DatasetLoader';
import { useDataset } from '../../../contexts/DatasetContext';
import { fetchImages } from '../../../api/images';
import { fetchAnnotationQueue } from '../../../api/annotation_queue';
import useAnnotationStore from '../../../stores/useAnnotationStore';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ datasetId: '1', imageId: '10' }),
  useLocation: () => ({ state: null }),
}));

vi.mock('../../../contexts/DatasetContext', () => ({
  useDataset: vi.fn(),
}));

vi.mock('../../../api/images', () => ({
  fetchImages: vi.fn(),
}));

vi.mock('../../../api/annotation_queue', () => ({
  fetchAnnotationQueue: vi.fn(),
}));

describe('DatasetLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAnnotationStore.setState({
      images: {
        imageList: [],
        currentImage: null,
      },
    });
  });

  it('renders children when images load successfully', async () => {
    useDataset.mockReturnValue({
      datasets: [{ id: 1, name: 'Coral Dataset' }],
      currentDataset: { id: 1, name: 'Coral Dataset' },
      selectDataset: vi.fn(),
      loading: false,
    });

    fetchImages.mockResolvedValue({
      success: true,
      image_data: [
        { image_id: 10, file_name: 'coral1.png', width: 800, height: 600, status: 'not_started' },
        { image_id: 11, file_name: 'coral2.png', width: 800, height: 600, status: 'finished' },
      ],
    });

    fetchAnnotationQueue.mockResolvedValue({ success: true, queue: { image_ids: [10, 11] } });

    render(
      <DatasetLoader>
        <div data-testid="workspace-content">Workspace Loaded</div>
      </DatasetLoader>
    );

    await waitFor(() => {
      expect(screen.getByTestId('workspace-content')).toBeInTheDocument();
    });

    const storeState = useAnnotationStore.getState();
    expect(storeState.images.currentImage.dataset_id).toBe(1);
    expect(storeState.images.imageList[0].dataset_id).toBe(1);
  });

  it('surfaces image-loading failures with a Retry button', async () => {
    useDataset.mockReturnValue({
      datasets: [{ id: 1, name: 'Coral Dataset' }],
      currentDataset: { id: 1, name: 'Coral Dataset' },
      selectDataset: vi.fn(),
      loading: false,
    });

    fetchImages.mockRejectedValue(new Error('Network connection timeout'));

    render(
      <DatasetLoader>
        <div data-testid="workspace-content">Workspace Loaded</div>
      </DatasetLoader>
    );

    await waitFor(() => {
      expect(screen.getByTestId('dataset-image-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/Failed to Load Images/i)).toBeInTheDocument();
    expect(screen.getByText(/Network connection timeout/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();

    // Clicking retry refetches images
    fetchImages.mockResolvedValueOnce({
      success: true,
      image_data: [{ image_id: 10, file_name: 'coral1.png' }],
    });

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    await waitFor(() => {
      expect(screen.getByTestId('workspace-content')).toBeInTheDocument();
    });
  });

  it('renders a friendly empty state when dataset has 0 images', async () => {
    useDataset.mockReturnValue({
      datasets: [{ id: 1, name: 'Empty Dataset' }],
      currentDataset: { id: 1, name: 'Empty Dataset' },
      selectDataset: vi.fn(),
      loading: false,
    });

    fetchImages.mockResolvedValue({
      success: true,
      image_data: [],
    });

    render(
      <DatasetLoader>
        <div data-testid="workspace-content">Workspace Loaded</div>
      </DatasetLoader>
    );

    await waitFor(() => {
      expect(screen.getByTestId('dataset-empty-state')).toBeInTheDocument();
    });

    expect(screen.getByText(/No Images in Dataset/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload Images/i })).toBeInTheDocument();
  });
});
