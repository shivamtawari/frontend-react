import { render } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import InferenceScanOverlay from './InferenceScanOverlay';

vi.mock('../../../stores/selectors/annotationSelectors', () => ({
  useIsSubmitting: () => true,
  useIsRunningSuggestion: () => false,
  useIsRunningInstance: () => false,
  useImageObject: () => ({ width: 1600, height: 900 }),
}));

vi.mock('../../../hooks/useImageDisplayRect', () => ({
  default: () => ({ x: 0, y: 50, width: 800, height: 450 }),
}));

describe('InferenceScanOverlay', () => {
  beforeEach(() => vi.clearAllMocks());

  test('tracks the image zoom and pan transform', () => {
    const { container } = render(
      <InferenceScanOverlay
        containerRef={{ current: document.createElement('div') }}
        zoomLevel={2.5}
        panOffset={{ x: 12, y: -8 }}
      />
    );

    expect(container.firstChild).toHaveStyle({
      transform: 'scale(2.5) translate(12px, -8px)',
      transformOrigin: 'center center',
    });
  });
});
