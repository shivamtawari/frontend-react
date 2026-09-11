import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LineEditCanvas from './LineEditCanvas';

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  drawKeyDown: vi.fn(),
  mergeLineIntoContour: vi.fn(),
  modifyObject: vi.fn(),
  mode: 'polygon',
  onFinalize: null,
  objects: [],
  polygonPoints: [{ x: 12, y: 12 }],
  resetDrawing: vi.fn(),
  setMode: vi.fn(),
  stopLineEdit: vi.fn(),
  updateObject: vi.fn(),
}));

vi.mock('react-konva', () => ({
  Stage: React.forwardRef(({ children }, ref) => <div ref={ref} data-testid="stage">{children}</div>),
  Layer: ({ children }) => <div>{children}</div>,
  Line: () => null,
}));

vi.mock('../../../stores/selectors/annotationSelectors', () => ({
  useCurrentMaskId: () => 9,
  useImageError: () => null,
  useImageLoading: () => false,
  useImageObject: () => ({ width: 100, height: 100 }),
  useLineEditActive: () => true,
  useLineEditContourId: () => 7,
  useLineEditMode: () => 'reshape',
  useLineEditObjectId: () => 1,
  useLineEditOriginal: () => ({ x: [0, 0.2, 0.2], y: [0, 0, 0.2] }),
  useManualDrawMode: () => mocks.mode,
  useObjectsList: () => mocks.objects,
  usePanOffset: () => ({ x: 0, y: 0 }),
  useSetManualDrawMode: () => mocks.setMode,
  useSetPanOffset: () => vi.fn(),
  useSetZoomLevel: () => vi.fn(),
  useStopLineEdit: () => mocks.stopLineEdit,
  useUpdateObject: () => mocks.updateObject,
  useZoomLevel: () => 1,
}));

vi.mock('../../../stores/useAnnotationStore', () => ({
  default: {
    getState: () => ({ objects: { list: mocks.objects } }),
  },
}));

vi.mock('../../../services/annotationSession', () => ({
  default: {
    isReady: () => true,
    modifyObject: mocks.modifyObject,
  },
}));

vi.mock('../../../utils/coordinateUtils', () => ({
  pixelArrayToNormalized: () => ({ x: [0.2, 0.6, 0.6], y: [0.2, 0.2, 0.6] }),
}));

vi.mock('../../../utils/contourEditing', () => ({
  mergeLineIntoContour: mocks.mergeLineIntoContour,
}));

vi.mock('../../../utils/contourOperations', () => ({
  splitObjectByLine: vi.fn(),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}));

vi.mock('../../../hooks/useCanvasViewport', () => ({
  default: () => ({
    containerRef: { current: null },
    containerSize: { width: 800, height: 600 },
    imageDimensions: { baseScale: 1, displayX: 0, displayY: 0 },
    isPanning: false,
    isPanMode: false,
    stageToImageCoords: vi.fn(),
    handlePanStart: vi.fn(),
    handlePanMove: vi.fn(),
    handlePanEnd: vi.fn(),
    handleWheel: vi.fn(),
  }),
}));

vi.mock('../../../hooks/usePromptDrawing', () => ({
  default: (options) => {
    mocks.onFinalize = options.onFinalize;
    return {
      polygonPoints: mocks.polygonPoints,
      cursorImagePt: null,
      handleMouseDown: vi.fn(),
      handleMouseMove: vi.fn(),
      handleMouseUp: vi.fn(),
      handleDblClick: vi.fn(),
      handleKeyDown: mocks.drawKeyDown,
      resetDrawing: mocks.resetDrawing,
    };
  },
}));

vi.mock('./prompts/DrawingPreview', () => ({ default: () => null }));

describe('LineEditCanvas mode controls', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.objects = [{
      id: 1,
      contour_id: 7,
      label: 'Coral',
      x: [0.1, 0.5, 0.5],
      y: [0.1, 0.1, 0.5],
    }];
    mocks.mode = 'polygon';
    mocks.polygonPoints = [{ x: 12, y: 12 }];
    mocks.mergeLineIntoContour.mockReturnValue([
      { x: 20, y: 20 },
      { x: 60, y: 20 },
      { x: 60, y: 60 },
    ]);
    mocks.modifyObject.mockResolvedValue({ success: true });
    mocks.updateObject.mockImplementation((id, updates) => {
      mocks.objects = mocks.objects.map((object) => object.id === id ? { ...object, ...updates } : object);
    });
  });

  it('keeps reshape active after saving and separates cancel from exit', async () => {
    render(<LineEditCanvas />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear current line' }));
    expect(mocks.resetDrawing).toHaveBeenCalledOnce();
    expect(mocks.stopLineEdit).not.toHaveBeenCalled();

    await act(async () => {
      await mocks.onFinalize([{ x: 20, y: 20 }, { x: 60, y: 60 }], { freehand: false });
    });

    expect(mocks.mergeLineIntoContour).toHaveBeenCalledWith(
      [
        { x: 10, y: 10 },
        { x: 50, y: 10 },
        { x: 50, y: 50 },
      ],
      [{ x: 20, y: 20 }, { x: 60, y: 60 }]
    );
    expect(mocks.modifyObject).toHaveBeenCalledWith(7, {
      x: [0.2, 0.6, 0.6],
      y: [0.2, 0.2, 0.6],
    });
    expect(mocks.stopLineEdit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Exit reshape/ }));
    expect(mocks.stopLineEdit).toHaveBeenCalledOnce();
  });

  it('hides the clear-line control in freehand mode', () => {
    mocks.mode = 'freehand';
    render(<LineEditCanvas />);

    expect(screen.queryByRole('button', { name: 'Clear current line' })).not.toBeInTheDocument();
  });

  it('exits on the first Escape even when a line is in progress', () => {
    mocks.drawKeyDown.mockReturnValue(true);
    render(<LineEditCanvas />);

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    expect(mocks.stopLineEdit).toHaveBeenCalledOnce();
    expect(mocks.drawKeyDown).not.toHaveBeenCalled();
  });

  it('does not let a late save failure overwrite a newer edit', async () => {
    let rejectSave;
    mocks.modifyObject.mockReturnValue(new Promise((resolve, reject) => {
      rejectSave = reject;
    }));
    render(<LineEditCanvas />);

    let save;
    act(() => {
      save = mocks.onFinalize([{ x: 20, y: 20 }, { x: 60, y: 60 }], { freehand: false });
    });
    expect(mocks.updateObject).toHaveBeenCalledOnce();

    mocks.objects = mocks.objects.map((object) => object.id === 1
      ? { ...object, x: [0.3, 0.7, 0.7], y: [0.3, 0.3, 0.7] }
      : object);

    await act(async () => {
      rejectSave(new Error('Save failed'));
      await save;
    });

    expect(mocks.updateObject).toHaveBeenCalledOnce();
  });
});
