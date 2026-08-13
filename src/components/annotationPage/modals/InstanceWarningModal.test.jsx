import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import InstanceWarningModal from './InstanceWarningModal';

describe('InstanceWarningModal', () => {
  test('offers patch as the safe default and passes patch mode', () => {
    const onConfirm = jest.fn();

    render(
      <InstanceWarningModal isOpen onClose={jest.fn()} onConfirm={onConfirm} />
    );

    expect(
      screen.getByText(/keeps existing annotations and adds only non-overlapping predictions/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Patch and run' }));

    expect(onConfirm).toHaveBeenCalledWith('patch');
  });

  test('clearly warns before passing override mode', () => {
    const onConfirm = jest.fn();

    render(
      <InstanceWarningModal isOpen onClose={jest.fn()} onConfirm={onConfirm} />
    );

    expect(
      screen.getByText(/replaces all current contours with the new predictions/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Override and run' }));

    expect(onConfirm).toHaveBeenCalledWith('override');
  });
});
