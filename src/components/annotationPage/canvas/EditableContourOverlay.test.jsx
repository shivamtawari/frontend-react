import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import EditableContourOverlay from './EditableContourOverlay';
import * as annotationSelectors from '../../../stores/selectors/annotationSelectors';
import * as contourEditingHook from '../../../hooks/useContourEditing';

let capturedCircles = [];
let capturedStages = [];
vi.mock('react-konva', () => ({
  Stage: React.forwardRef(({ children, ...props }, ref) => {
    capturedStages.push(props);
    return (
      <div ref={ref} data-testid="mock-stage" className={props.className}>
        {children}
      </div>
    );
  }),
  Layer: ({ children }) => <div data-testid="mock-layer">{children}</div>,
  Line: ({ points }) => <div data-testid="mock-line" data-points={JSON.stringify(points)} />,
  Circle: (props = {}) => {
    if (props) capturedCircles.push(props);
    return <div data-testid="mock-circle" data-radius={props.radius} />;
  },
}));

describe('EditableContourOverlay stage-level nearest-vertex interaction', () => {
  let mockMoveVertex;
  let mockDeleteVertex;
  let mockScheduleAutoSave;
  let mockInsertVertex;
  let mockContainer;
  let canvasRef;

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

  const uncrowdedVertices = {
    x: [0.1, 0.5, 0.5, 0.1],
    y: [0.1, 0.1, 0.5, 0.5],
  };

  const createStageEvent = (pointerPos, evtProps = {}) => {
    const mockContainer = { style: { cursor: 'default' } };
    const fakeStage = {
      container: () => mockContainer,
      getPointerPosition: () => pointerPos,
      getStage: () => fakeStage,
    };
    return {
      target: fakeStage,
      evt: {
        type: 'mousemove',
        button: 0,
        clientX: pointerPos?.x ?? 0,
        clientY: pointerPos?.y ?? 0,
        ...evtProps,
      },
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCircles = [];
    capturedStages = [];

    mockMoveVertex = vi.fn();
    mockDeleteVertex = vi.fn();
    mockScheduleAutoSave = vi.fn();
    mockInsertVertex = vi.fn();

    mockContainer = document.createElement('div');
    Object.defineProperty(mockContainer, 'offsetWidth', { configurable: true, value: 800 });
    Object.defineProperty(mockContainer, 'offsetHeight', { configurable: true, value: 600 });
    canvasRef = { current: mockContainer };

    vi.spyOn(annotationSelectors, 'useEditModeActive').mockReturnValue(true);
    vi.spyOn(annotationSelectors, 'useImageObject').mockReturnValue({ width: 800, height: 600 });
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(false);
    vi.spyOn(annotationSelectors, 'useMoveVertex').mockReturnValue(mockMoveVertex);
    vi.spyOn(annotationSelectors, 'useDeleteVertex').mockReturnValue(mockDeleteVertex);
    vi.spyOn(annotationSelectors, 'useInsertVertex').mockReturnValue(mockInsertVertex);

    vi.spyOn(contourEditingHook, 'useContourEditing').mockReturnValue({
      cancelEditing: vi.fn(),
      resetChanges: vi.fn(),
      scheduleAutoSave: mockScheduleAutoSave,
      cancelAutoSave: vi.fn(),
    });
  });

  it('renders visible handles at constant screen size with listening={false} and no draggable circles', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);

    capturedCircles = [];
    const { rerender } = render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    const circlesZoom1 = capturedCircles.filter((c) => c && c.listening === false);
    expect(circlesZoom1.length).toBe(4);
    circlesZoom1.forEach((circle) => {
      expect(circle.listening).toBe(false);
      expect(circle.draggable).toBeUndefined();
    });
    // Base visible radius is 3px screen size at zoom 1
    expect(circlesZoom1[0].radius).toBe(3);

    capturedCircles = [];
    rerender(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={4} />);
    const circlesZoom4 = capturedCircles.filter((c) => c && c.listening === false);
    expect(circlesZoom4.length).toBe(4);
    // Base visible radius at zoom 4 is 3 / 4 = 0.75 stage px (screen size 0.75 * 4 = 3px)
    expect(circlesZoom4[0].radius * 4).toBe(3);
  });

  it('allows selecting points 5px apart by clicking toward each respective vertex', () => {
    // Canvas is 800x600.
    // Vertex 0 at (0.5, 0.5) -> screen coords (400, 300)
    // Vertex 1 at (0.5 + 5/800, 0.5) -> screen coords (405, 300) (5 screen px apart)
    // Vertex 2 at (0.5, 0.6) -> screen coords (400, 360)
    // Vertex 3 at (0.4, 0.5) -> screen coords (320, 300)
    const closeVertices = {
      x: [0.5, 0.5 + 5 / 800, 0.5, 0.4],
      y: [0.5, 0.5, 0.6, 0.5],
    };

    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(closeVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(closeVertices);

    render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    const stageProps = capturedStages[0];

    // Click toward Vertex 0 (at x=399, y=300): dist to v0 is 1px, dist to v1 is 6px
    act(() => {
      stageProps.onMouseDown(createStageEvent({ x: 399, y: 300 }, { button: 0, type: 'mousedown' }));
      stageProps.onMouseMove(createStageEvent({ x: 390, y: 300 }, { button: 0, type: 'mousemove' }));
    });
    expect(mockMoveVertex).toHaveBeenCalledWith(0, 390 / 800, 300 / 600);
    expect(mockScheduleAutoSave).toHaveBeenCalled();

    act(() => {
      stageProps.onMouseUp(createStageEvent({ x: 390, y: 300 }, { button: 0, type: 'mouseup' }));
    });

    mockMoveVertex.mockClear();
    mockScheduleAutoSave.mockClear();

    // Click toward Vertex 1 (at x=406, y=300): dist to v1 is 1px, dist to v0 is 6px
    act(() => {
      stageProps.onMouseDown(createStageEvent({ x: 406, y: 300 }, { button: 0, type: 'mousedown' }));
      stageProps.onMouseMove(createStageEvent({ x: 420, y: 300 }, { button: 0, type: 'mousemove' }));
    });
    expect(mockMoveVertex).toHaveBeenCalledWith(1, 420 / 800, 300 / 600);
    expect(mockScheduleAutoSave).toHaveBeenCalled();
  });

  it('maintains a 12 screen pixel hit area across different zoom levels', () => {
    const testVertices = {
      x: [0.5, 0.6, 0.6, 0.5],
      y: [0.5, 0.5, 0.6, 0.6],
    };
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(testVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(testVertices);

    // Zoom 1: 12 stage px is 12 screen px
    const { rerender } = render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    let stageProps = capturedStages[capturedStages.length - 1];

    // 12px away from Vertex 0 at (400, 300) -> hit
    act(() => {
      stageProps.onMouseDown(createStageEvent({ x: 412, y: 300 }, { button: 0, type: 'mousedown' }));
      stageProps.onMouseMove(createStageEvent({ x: 415, y: 300 }, { button: 0, type: 'mousemove' }));
    });
    expect(mockMoveVertex).toHaveBeenCalledWith(0, 415 / 800, 300 / 600);
    act(() => {
      stageProps.onMouseUp(createStageEvent({ x: 415, y: 300 }, { button: 0, type: 'mouseup' }));
    });

    mockMoveVertex.mockClear();

    // 12.1px away from Vertex 0 -> miss
    act(() => {
      stageProps.onMouseDown(createStageEvent({ x: 412.1, y: 300 }, { button: 0, type: 'mousedown' }));
      stageProps.onMouseMove(createStageEvent({ x: 415, y: 300 }, { button: 0, type: 'mousemove' }));
    });
    expect(mockMoveVertex).not.toHaveBeenCalled();
    act(() => {
      stageProps.onMouseUp(createStageEvent({ x: 415, y: 300 }, { button: 0, type: 'mouseup' }));
    });

    // Zoom 3: 12 / 3 = 4 stage px is 12 screen px
    rerender(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={3} />);
    stageProps = capturedStages[capturedStages.length - 1];

    // 4 stage px away from Vertex 0 at (400, 300) -> hit
    act(() => {
      stageProps.onMouseDown(createStageEvent({ x: 404, y: 300 }, { button: 0, type: 'mousedown' }));
      stageProps.onMouseMove(createStageEvent({ x: 405, y: 300 }, { button: 0, type: 'mousemove' }));
    });
    expect(mockMoveVertex).toHaveBeenCalledWith(0, 405 / 800, 300 / 600);
    act(() => {
      stageProps.onMouseUp(createStageEvent({ x: 405, y: 300 }, { button: 0, type: 'mouseup' }));
    });

    mockMoveVertex.mockClear();

    // 4.1 stage px away from Vertex 0 -> miss
    act(() => {
      stageProps.onMouseDown(createStageEvent({ x: 404.1, y: 300 }, { button: 0, type: 'mousedown' }));
      stageProps.onMouseMove(createStageEvent({ x: 405, y: 300 }, { button: 0, type: 'mousemove' }));
    });
    expect(mockMoveVertex).not.toHaveBeenCalled();
  });

  it('never inserts a new vertex when clicking within reach of a handle', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);

    render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    const stageProps = capturedStages[0];

    // Handle 0 is at (80, 60). Clicking 5px away (85, 60) is near handle 0 and near the outline edge
    const nearHandleEvent = createStageEvent({ x: 85, y: 60 }, { button: 0 });

    act(() => {
      stageProps.onMouseDown(nearHandleEvent);
      stageProps.onClick(nearHandleEvent);
      stageProps.onMouseUp(nearHandleEvent);
    });

    expect(mockInsertVertex).not.toHaveBeenCalled();
  });

  it('allows outline insertion on the gesture after dragging a vertex', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);

    render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    const stageProps = capturedStages[0];

    act(() => {
      stageProps.onMouseDown(createStageEvent({ x: 80, y: 60 }, { type: 'mousedown', button: 0 }));
      stageProps.onMouseMove(createStageEvent({ x: 90, y: 70 }, { type: 'mousemove', button: 0 }));
      stageProps.onClick(createStageEvent({ x: 90, y: 70 }, { type: 'click', button: 0 }));
      stageProps.onMouseUp(createStageEvent({ x: 90, y: 70 }, { type: 'mouseup', button: 0 }));
    });

    expect(mockInsertVertex).not.toHaveBeenCalled();
    mockScheduleAutoSave.mockClear();

    const outlineClick = createStageEvent({ x: 200, y: 60 }, { type: 'mousedown', button: 0 });
    act(() => {
      stageProps.onMouseDown(outlineClick);
      stageProps.onClick(outlineClick);
      stageProps.onMouseUp({ ...outlineClick, evt: { ...outlineClick.evt, type: 'mouseup' } });
    });

    expect(mockInsertVertex).toHaveBeenCalledWith(0, 0.25, 0.1);
    expect(mockScheduleAutoSave).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('drags the nearest vertex with touch and suppresses the resulting tap (refinement: %s)', (refinementModeActive) => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(refinementModeActive);

    render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    const stageProps = capturedStages[capturedStages.length - 1];
    const preventStart = vi.fn();
    const preventMove = vi.fn();

    const touchStart = createStageEvent({ x: 80, y: 60 }, {
      type: 'touchstart',
      button: undefined,
      preventDefault: preventStart,
    });
    const touchMove = createStageEvent({ x: 90, y: 70 }, {
      type: 'touchmove',
      button: undefined,
      preventDefault: preventMove,
    });

    act(() => {
      stageProps.onTouchStart(touchStart);
      stageProps.onTouchMove(touchMove);
      // Konva emits tap before touchend for Stage-background gestures.
      stageProps.onTap?.(touchMove);
      stageProps.onTouchEnd(createStageEvent({ x: 90, y: 70 }, {
        type: 'touchend',
        button: undefined,
        preventDefault: vi.fn(),
      }));
    });

    expect(preventStart).toHaveBeenCalled();
    expect(preventMove).toHaveBeenCalled();
    expect(mockMoveVertex).toHaveBeenCalledWith(0, 90 / 800, 70 / 600);
    expect(mockScheduleAutoSave).toHaveBeenCalled();
    expect(mockInsertVertex).not.toHaveBeenCalled();
  });

  it('clears an active touch drag when the browser cancels the gesture', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);

    render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    const stageProps = capturedStages[0];

    act(() => {
      stageProps.onTouchStart(createStageEvent({ x: 80, y: 60 }, {
        type: 'touchstart',
        button: undefined,
        preventDefault: vi.fn(),
      }));
      window.dispatchEvent(new Event('touchcancel'));
      stageProps.onTouchMove(createStageEvent({ x: 90, y: 70 }, {
        type: 'touchmove',
        button: undefined,
        preventDefault: vi.fn(),
      }));
    });

    expect(mockMoveVertex).not.toHaveBeenCalled();
    expect(mockScheduleAutoSave).not.toHaveBeenCalled();
  });

  it('clears an armed vertex when edit mode deactivates', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);
    const editModeSpy = vi.spyOn(annotationSelectors, 'useEditModeActive').mockReturnValue(true);

    const { rerender } = render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    let stageProps = capturedStages[capturedStages.length - 1];

    act(() => {
      stageProps.onMouseDown(createStageEvent({ x: 80, y: 60 }, { type: 'mousedown', button: 0 }));
    });

    editModeSpy.mockReturnValue(false);
    rerender(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    editModeSpy.mockReturnValue(true);
    rerender(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    stageProps = capturedStages[capturedStages.length - 1];

    act(() => {
      stageProps.onMouseMove(createStageEvent({ x: 90, y: 70 }, { type: 'mousemove', button: 0 }));
    });

    expect(mockMoveVertex).not.toHaveBeenCalled();
    expect(mockScheduleAutoSave).not.toHaveBeenCalled();
  });

  it('gives Space and middle-button panning priority over moving a vertex', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);

    const mockElementBelow = document.createElement('div');
    const dispatchSpy = vi.spyOn(mockElementBelow, 'dispatchEvent');
    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(mockElementBelow);

    try {
      render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
      const stageProps = capturedStages[0];

      // Handle 0 is at (80, 60). Middle-click (button 1) directly over handle 0
      const middleClickEvent = createStageEvent({ x: 80, y: 60 }, { button: 1, type: 'mousedown' });
      act(() => {
        stageProps.onMouseDown(middleClickEvent);
        stageProps.onMouseMove(createStageEvent({ x: 90, y: 70 }, { button: 1, type: 'mousemove' }));
      });

      expect(mockMoveVertex).not.toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'mousedown', button: 1 })
      );

      dispatchSpy.mockClear();

      // Space + left click (button 0) directly over handle 0
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      });
      const stagePropsWithSpace = capturedStages[capturedStages.length - 1];

      const spaceClickEvent = createStageEvent({ x: 80, y: 60 }, { button: 0, type: 'mousedown' });
      act(() => {
        stagePropsWithSpace.onMouseDown(spaceClickEvent);
        stagePropsWithSpace.onMouseMove(createStageEvent({ x: 90, y: 70 }, { button: 0, type: 'mousemove' }));
      });

      expect(mockMoveVertex).not.toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'mousedown', button: 0 })
      );
    } finally {
      document.elementFromPoint = origElementFromPoint;
    }
  });

  it('keeps coincident vertices recoverable by selecting the later index deterministically and freeing the other after drag', () => {
    // Vertex 1 and Vertex 2 are at exactly the same coordinates (0.5, 0.5) -> (400, 300)
    const coincidentVertices = {
      x: [0.1, 0.5, 0.5, 0.1],
      y: [0.1, 0.5, 0.5, 0.8],
    };

    const verticesRef = { current: coincidentVertices };
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockImplementation(() => verticesRef.current);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockImplementation(() => verticesRef.current);

    const { rerender } = render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    let stageProps = capturedStages[capturedStages.length - 1];

    // Pointer down directly at coincident location (400, 300): deterministic tie-break selects index 2 (the later index)
    act(() => {
      stageProps.onMouseDown(createStageEvent({ x: 400, y: 300 }, { button: 0, type: 'mousedown' }));
      stageProps.onMouseMove(createStageEvent({ x: 450, y: 350 }, { button: 0, type: 'mousemove' }));
    });
    expect(mockMoveVertex).toHaveBeenCalledWith(2, 450 / 800, 350 / 600);
    act(() => {
      stageProps.onMouseUp(createStageEvent({ x: 450, y: 350 }, { button: 0, type: 'mouseup' }));
    });

    mockMoveVertex.mockClear();

    // Now index 2 is moved away to (450/800, 350/600), while index 1 remains at (0.5, 0.5) -> (400, 300)
    verticesRef.current = {
      x: [0.1, 0.5, 450 / 800, 0.1],
      y: [0.1, 0.5, 350 / 600, 0.8],
    };
    rerender(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    stageProps = capturedStages[capturedStages.length - 1];

    // Clicking at (400, 300) now selects index 1!
    act(() => {
      stageProps.onMouseDown(createStageEvent({ x: 400, y: 300 }, { button: 0, type: 'mousedown' }));
      stageProps.onMouseMove(createStageEvent({ x: 410, y: 310 }, { button: 0, type: 'mousemove' }));
    });
    expect(mockMoveVertex).toHaveBeenCalledWith(1, 410 / 800, 310 / 600);
  });

  it('highlights the vertex on hover that pointer-down will select, including deterministic tie-break for coincident points', () => {
    // Vertex 1 and Vertex 2 are coincident at (0.5, 0.5) -> (400, 300)
    const coincidentVertices = {
      x: [0.1, 0.5, 0.5, 0.1],
      y: [0.1, 0.5, 0.5, 0.8],
    };
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(coincidentVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(coincidentVertices);

    render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    const stageProps = capturedStages[0];

    // Hover over coincident points at (400, 300): deterministic winner is index 2
    act(() => {
      stageProps.onMouseMove(createStageEvent({ x: 400, y: 300 }));
    });

    // Check captured circles from the latest render: circle for index 2 should be highlighted (#2563eb, radius 4)
    const latestCircles = capturedCircles.slice(-4);
    expect(latestCircles[2].fill).toBe('#2563eb');
    expect(latestCircles[2].radius).toBe(4);
    // Other circles are unhovered (#3b82f6, radius 3)
    expect(latestCircles[1].fill).toBe('#3b82f6');
    expect(latestCircles[1].radius).toBe(3);

    // Pointer-down at the same position selects index 2
    act(() => {
      stageProps.onMouseDown(createStageEvent({ x: 400, y: 300 }, { button: 0, type: 'mousedown' }));
      stageProps.onMouseMove(createStageEvent({ x: 410, y: 300 }, { button: 0, type: 'mousemove' }));
    });
    expect(mockMoveVertex).toHaveBeenCalledWith(2, 410 / 800, 300 / 600);
  });

  it('deletes the nearest vertex on stage double-click', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);

    render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    const stageProps = capturedStages[0];

    // Double-click near handle 0 at (82, 60)
    act(() => {
      stageProps.onDblClick(createStageEvent({ x: 82, y: 60 }, { button: 0 }));
    });

    expect(mockDeleteVertex).toHaveBeenCalledWith(0);
    expect(mockScheduleAutoSave).toHaveBeenCalled();
  });

  it('forwards wheel events to underlying canvas during refinement mode', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(true);

    const mockElementBelow = document.createElement('div');
    const dispatchSpy = vi.spyOn(mockElementBelow, 'dispatchEvent');
    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(mockElementBelow);

    try {
      capturedStages = [];
      render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={3} />);

      expect(capturedStages.length).toBe(2);
      const pointsStageProps = capturedStages[1];
      expect(typeof pointsStageProps.onWheel).toBe('function');

      const mockPreventDefault = vi.fn();
      act(() => {
        pointsStageProps.onWheel({
          evt: {
            type: 'wheel',
            clientX: 400,
            clientY: 300,
            deltaY: -100,
            deltaX: 0,
            deltaZ: 0,
            deltaMode: 0,
            preventDefault: mockPreventDefault,
          },
        });
      });

      expect(mockPreventDefault).toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const forwardedEvent = dispatchSpy.mock.calls[0][0];
      expect(forwardedEvent).toBeInstanceOf(WheelEvent);
      expect(forwardedEvent.type).toBe('wheel');
      expect(forwardedEvent.deltaY).toBe(-100);
      expect(forwardedEvent.clientX).toBe(400);
      expect(forwardedEvent.clientY).toBe(300);
    } finally {
      document.elementFromPoint = origElementFromPoint;
    }
  });

  it('forwards wheel events during single-stage edit mode', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(false);

    const mockElementBelow = document.createElement('div');
    const dispatchSpy = vi.spyOn(mockElementBelow, 'dispatchEvent');
    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(mockElementBelow);

    try {
      capturedStages = [];
      render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);

      expect(capturedStages.length).toBe(1);
      const singleStageProps = capturedStages[0];
      expect(typeof singleStageProps.onWheel).toBe('function');

      const mockPreventDefault = vi.fn();
      act(() => {
        singleStageProps.onWheel({
          evt: {
            type: 'wheel',
            clientX: 500,
            clientY: 250,
            deltaY: 100,
            deltaX: 0,
            preventDefault: mockPreventDefault,
          },
        });
      });

      expect(mockPreventDefault).toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const forwardedEvent = dispatchSpy.mock.calls[0][0];
      expect(forwardedEvent).toBeInstanceOf(WheelEvent);
      expect(forwardedEvent.deltaY).toBe(100);
    } finally {
      document.elementFromPoint = origElementFromPoint;
    }
  });

  it('forwards mousedown and does not drag vertex during space-to-pan in refinement mode', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(true);

    const mockElementBelow = document.createElement('div');
    const dispatchSpy = vi.spyOn(mockElementBelow, 'dispatchEvent');
    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(mockElementBelow);

    try {
      capturedStages = [];
      render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);

      // Press Spacebar
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      });

      const pointsStageProps = capturedStages[capturedStages.length - 1];
      expect(pointsStageProps.className).toContain('cursor-grab');

      // Mousedown on handle 0 forwards the event for pan and does not move vertex
      act(() => {
        pointsStageProps.onMouseDown(createStageEvent({ x: 80, y: 60 }, {
          type: 'mousedown',
          button: 0,
          clientX: 80,
          clientY: 60,
        }));
        pointsStageProps.onMouseMove(createStageEvent({ x: 90, y: 70 }, {
          type: 'mousemove',
          button: 0,
          clientX: 90,
          clientY: 70,
        }));
      });

      expect(mockMoveVertex).not.toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mousedown',
          clientX: 80,
          clientY: 60,
        })
      );
    } finally {
      document.elementFromPoint = origElementFromPoint;
    }
  });

  it('forwards middle-click mouse events for panning even when space is not pressed', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(true);

    const mockElementBelow = document.createElement('div');
    const dispatchSpy = vi.spyOn(mockElementBelow, 'dispatchEvent');
    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(mockElementBelow);

    try {
      capturedStages = [];
      render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);

      const pointsStageProps = capturedStages[1];

      // Middle-click (button === 1) over a handle
      act(() => {
        pointsStageProps.onMouseDown(createStageEvent({ x: 80, y: 60 }, {
          type: 'mousedown',
          button: 1,
          clientX: 200,
          clientY: 150,
        }));
      });

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mousedown',
          button: 1,
          clientX: 200,
          clientY: 150,
        })
      );
    } finally {
      document.elementFromPoint = origElementFromPoint;
    }
  });

  it('resets spacePressed state when editing deactivates so re-entering starts ready to drag vertices', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(false);
    const editModeSpy = vi.spyOn(annotationSelectors, 'useEditModeActive').mockReturnValue(true);

    const { rerender } = render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);

    // Press Spacebar while in edit mode
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    });

    // User exits editing while still holding Space
    editModeSpy.mockReturnValue(false);
    rerender(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);

    // User releases Space while outside edit mode (keyup is not received by inactive overlay)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
    });

    // User re-enters editing
    editModeSpy.mockReturnValue(true);
    rerender(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);

    const latestStageProps = capturedStages[capturedStages.length - 1];

    // Mouse down on handle 0 should drag the vertex, NOT pan
    act(() => {
      latestStageProps.onMouseDown(createStageEvent({ x: 80, y: 60 }, { button: 0, type: 'mousedown' }));
      latestStageProps.onMouseMove(createStageEvent({ x: 90, y: 60 }, { button: 0, type: 'mousemove' }));
    });

    expect(mockMoveVertex).toHaveBeenCalledWith(0, 90 / 800, 60 / 600);
  });

  it('suppresses vertex insertion when a middle-button pan completes near the outline', () => {
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(false);
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);

    render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    const stageProps = capturedStages[0];

    const fakeStage = {
      getStage: () => fakeStage,
      getPointerPosition: () => ({ x: 200, y: 60 }),
    };

    act(() => {
      stageProps.onMouseDown({ evt: { button: 1, clientX: 200, clientY: 60 }, target: fakeStage });
      stageProps.onClick({ evt: { button: 0 }, target: fakeStage });
      stageProps.onMouseUp({ evt: { button: 1, clientX: 200, clientY: 60 }, target: fakeStage });
    });

    expect(mockInsertVertex).not.toHaveBeenCalled();
    expect(mockScheduleAutoSave).not.toHaveBeenCalled();
  });

  it('suppresses vertex insertion when Space is released before mouseup during a space-pan', () => {
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(false);
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);

    render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);

    const fakeStage = {
      getStage: () => fakeStage,
      getPointerPosition: () => ({ x: 200, y: 60 }),
    };

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    });

    const stagePropsWithSpace = capturedStages[capturedStages.length - 1];

    act(() => {
      stagePropsWithSpace.onMouseDown({ evt: { button: 0, clientX: 200, clientY: 60 }, target: fakeStage });
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
    });

    const latestStageProps = capturedStages[capturedStages.length - 1];

    act(() => {
      latestStageProps.onClick({ evt: { button: 0 }, target: fakeStage });
      latestStageProps.onMouseUp({ evt: { button: 0, clientX: 200, clientY: 60 }, target: fakeStage });
    });

    expect(mockInsertVertex).not.toHaveBeenCalled();
    expect(mockScheduleAutoSave).not.toHaveBeenCalled();
  });

  it('inserts a vertex on normal primary click on the outline', () => {
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(false);
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);

    render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    const stageProps = capturedStages[0];

    const fakeStage = {
      getStage: () => fakeStage,
      getPointerPosition: () => ({ x: 200, y: 60 }),
    };

    act(() => {
      stageProps.onMouseDown({ evt: { button: 0, clientX: 200, clientY: 60 }, target: fakeStage });
      stageProps.onClick({ evt: { button: 0 }, target: fakeStage });
      stageProps.onMouseUp({ evt: { button: 0, clientX: 200, clientY: 60 }, target: fakeStage });
    });

    expect(mockInsertVertex).toHaveBeenCalledTimes(1);
    expect(mockInsertVertex).toHaveBeenCalledWith(0, 0.25, 0.1);
    expect(mockScheduleAutoSave).toHaveBeenCalledTimes(1);
  });

  it('inserts a vertex on touch tap (onTap) when event lacks button property', () => {
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(false);
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);

    render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
    const stageProps = capturedStages[0];

    const fakeStage = {
      getStage: () => fakeStage,
      getPointerPosition: () => ({ x: 200, y: 60 }),
    };

    act(() => {
      stageProps.onTap({ evt: {}, target: fakeStage });
    });

    expect(mockInsertVertex).toHaveBeenCalledTimes(1);
    expect(mockInsertVertex).toHaveBeenCalledWith(0, 0.25, 0.1);
    expect(mockScheduleAutoSave).toHaveBeenCalledTimes(1);
  });

  it('delivers bubbling mouseup to cached target when pointer leaves during a middle-button pan', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(false);

    const mockElementBelow = document.createElement('div');
    const dispatchSpy = vi.spyOn(mockElementBelow, 'dispatchEvent');
    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(mockElementBelow);

    try {
      capturedStages = [];
      render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);
      const stageProps = capturedStages[0];

      act(() => {
        stageProps.onMouseDown({
          evt: { type: 'mousedown', button: 1, clientX: 200, clientY: 150 },
        });
      });

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'mousedown', button: 1, clientX: 200, clientY: 150 })
      );

      document.elementFromPoint = vi.fn().mockReturnValue(null);

      act(() => {
        stageProps.onMouseLeave({
          evt: { type: 'mouseleave', button: 1, clientX: -10, clientY: -10 },
        });
      });

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mouseup',
          bubbles: true,
          cancelable: true,
        })
      );
    } finally {
      document.elementFromPoint = origElementFromPoint;
    }
  });

  it('delivers bubbling mouseup to cached target when pointer leaves during a space-pan', () => {
    vi.spyOn(annotationSelectors, 'useEditModeVertices').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useEditModeDraftCoordinates').mockReturnValue(uncrowdedVertices);
    vi.spyOn(annotationSelectors, 'useRefinementModeActive').mockReturnValue(false);

    const mockElementBelow = document.createElement('div');
    const dispatchSpy = vi.spyOn(mockElementBelow, 'dispatchEvent');
    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(mockElementBelow);

    try {
      capturedStages = [];
      render(<EditableContourOverlay canvasRef={canvasRef} zoomLevel={1} />);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      });

      const stageProps = capturedStages[capturedStages.length - 1];

      act(() => {
        stageProps.onMouseDown({
          evt: { type: 'mousedown', button: 0, clientX: 200, clientY: 150 },
        });
      });

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'mousedown', button: 0, clientX: 200, clientY: 150 })
      );

      document.elementFromPoint = vi.fn().mockReturnValue(null);

      act(() => {
        stageProps.onMouseLeave({
          evt: { type: 'mouseleave', button: 0, clientX: 900, clientY: 700 },
        });
      });

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mouseup',
          bubbles: true,
          cancelable: true,
        })
      );
    } finally {
      document.elementFromPoint = origElementFromPoint;
    }
  });
});
