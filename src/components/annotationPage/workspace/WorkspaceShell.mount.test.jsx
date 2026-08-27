import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceShell from './WorkspaceShell';
import useAnnotationStore from '../../../stores/useAnnotationStore';

vi.mock('../../../contexts/DatasetContext', () => ({
  useDataset: () => ({
    currentDataset: { id: 1, name: 'Test Dataset' },
    datasets: [{ id: 1, name: 'Test Dataset' }],
  }),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('../../../api/inference', () => ({
  getInferenceRoutingPolicy: vi.fn().mockResolvedValue(null),
}));

vi.mock('./useWorkspaceShortcuts', () => ({ default: () => {} }));
vi.mock('./useArmedLabelAutoApply', () => ({ default: () => {} }));
vi.mock('./useCalibrationState', () => ({ useCalibrationSync: () => {} }));

// Keep this a workspace mount test: the shell and its annotation keyboard hooks
// remain real, while browser/canvas-heavy panels are represented by their mount
// boundaries. A render exception here is the same failure mode as a blank route.
vi.mock('./TopToolbar', () => ({ default: () => <div data-testid="top-toolbar" /> }));
vi.mock('./ToolRail', () => ({ default: () => <div data-testid="tool-rail" /> }));
vi.mock('./ToolOptionsDrawer', () => ({ default: () => <div data-testid="tool-options" /> }));
vi.mock('./CalibrationDrawer', () => ({ default: () => <div data-testid="calibration-drawer" /> }));
vi.mock('./RightPanel', () => ({ default: () => <div data-testid="right-panel" /> }));
vi.mock('./ActionBar', () => ({ default: () => <div data-testid="action-bar" /> }));
vi.mock('./Filmstrip', () => ({ default: () => <div data-testid="filmstrip" /> }));
vi.mock('./StatusBar', () => ({ default: () => <div data-testid="status-bar" /> }));
vi.mock('./ReviewBanner', () => ({ default: () => null }));
vi.mock('./ShortcutSheet', () => ({ default: () => null }));
vi.mock('../canvas/MainCanvas', () => ({ default: () => <div data-testid="main-canvas" /> }));
vi.mock('../../correction/CorrectionBar', () => ({ default: () => null }));
vi.mock('../RejectionBanner', () => ({ default: () => null }));

describe('WorkspaceShell mount smoke test', () => {
  beforeEach(() => {
    useAnnotationStore.setState({
      images: {
        currentImage: { id: 1, dataset_id: 1 },
        currentImageId: 1,
      },
      models: {
        availablePromptedModels: [],
        availableSuggestionModels: [],
        availableInstanceModels: [],
      },
    });
  });

  it('renders the annotation workspace at the routed image URL', () => {
    render(
      <MemoryRouter initialEntries={['/dataset/1/annotate/1']}>
        <Routes>
          <Route path="/dataset/:datasetId/annotate/:imageId" element={<WorkspaceShell />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('top-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('main-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('tool-rail')).toBeInTheDocument();
    expect(screen.getByTestId('right-panel')).toBeInTheDocument();
  });
});
