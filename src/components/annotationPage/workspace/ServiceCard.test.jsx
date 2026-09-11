import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ServiceCard from './ServiceCard';

vi.mock('../../../stores/selectors/annotationSelectors', () => ({
  useModelFavorites: () => ({}),
  useSetFavoriteModel: () => vi.fn(),
  useClearFavoriteModel: () => vi.fn(),
}));

const makeService = (overrides = {}) => ({
  key: 'instance',
  task: 'instance-segmentation',
  name: 'Instance Segmentation',
  models: [{ id: 'ready-model', name: 'Ready model', model_status: 'ready' }],
  selectedModel: null,
  setSelectedModel: vi.fn(),
  isLoading: false,
  isRunning: false,
  onRun: vi.fn(),
  canRun: false,
  ...overrides,
});

const openCard = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Instance Segmentation' }));
};

describe('ServiceCard instance runs', () => {
  it('keeps the Run button visible but disabled without a usable selection', () => {
    render(<ServiceCard service={makeService()} />);

    openCard();

    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
  });

  it('shows a non-blocking override note for a runnable manual selection', () => {
    render(
      <ServiceCard
        service={makeService({
          selectedModel: 'ready-model',
          canRun: true,
          selectionNotice: 'Session override for this image — dataset default remains unchanged.',
        })}
      />
    );

    openCard();

    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    expect(screen.getByText(/session override for this image/i)).toBeInTheDocument();
    expect(screen.getByText(/dataset default remains unchanged/i)).toBeInTheDocument();
  });
});
