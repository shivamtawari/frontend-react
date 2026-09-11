import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { vi } from "vitest";
import ModelTrainingPage from "./ModelTrainingPage";
import {
  cancelInstanceTraining,
  fetchLabels,
  getInstanceLabelAnnotationCounts,
  getInstanceModels,
  getInstanceTrainingRuns,
  startInstanceTraining,
  streamInstanceTrainingProgress,
} from "../api";

const { mockRoute } = vi.hoisted(() => ({
  mockRoute: { datasetId: "42" },
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ datasetId: mockRoute.datasetId }),
}));

vi.mock("../contexts/DatasetContext", () => ({
  useDataset: () => ({ currentDataset: { name: "Test dataset" } }),
}));

vi.mock("../components/datasets/gallery/DatasetManagementLayout", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock("../components/datasets/training/DynamicHyperParameter", () => ({
  default: () => null,
}));

vi.mock("../api", () => ({
  cancelInstanceTraining: vi.fn(),
  fetchLabels: vi.fn(),
  getInstanceLabelAnnotationCounts: vi.fn(),
  getInstanceModels: vi.fn(),
  getInstanceTrainingRuns: vi.fn(),
  startInstanceTraining: vi.fn(),
  streamInstanceTrainingProgress: vi.fn(),
}));

beforeEach(() => {
  mockRoute.datasetId = "42";
});

describe("ModelTrainingPage model loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchLabels.mockResolvedValue({ labels: { id_to_label_object: {} } });
    getInstanceLabelAnnotationCounts.mockResolvedValue({
      success: true,
      reviewed_annotation_counts: {},
    });
    getInstanceTrainingRuns.mockResolvedValue({ runs: [] });
    cancelInstanceTraining.mockResolvedValue({});
    startInstanceTraining.mockResolvedValue({ task_id: "task-1" });
    streamInstanceTrainingProgress.mockReturnValue({ abort: vi.fn() });
  });

  it("keeps the configuration unavailable while models are loading", async () => {
    let resolveModels;
    getInstanceModels.mockReturnValue(new Promise((resolve) => {
      resolveModels = resolve;
    }));

    render(<ModelTrainingPage />);

    expect(screen.getByRole("button", { name: /loading models/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /start training/i })).not.toBeInTheDocument();

    resolveModels({
      success: true,
      result: [{ registry_key: "real-model", name: "Real model", trainable: true, training_parameters: [] }],
    });
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("real-model"));
  });

  it("excludes trained output models from the training-model selector", async () => {
    getInstanceModels.mockResolvedValue({
      success: true,
      result: [
        { registry_key: "trained-output", name: "My trained model", trainable: false },
        { registry_key: "mask2former", name: "Mask2Former", trainable: true, training_parameters: [] },
      ],
    });

    render(<ModelTrainingPage />);

    const selector = await screen.findByRole("combobox");
    expect(selector).toHaveValue("mask2former");
    expect(screen.queryByRole("option", { name: "My trained model" })).not.toBeInTheDocument();
  });

  it("shows a model error instead of falling back when loading fails", async () => {
    getInstanceModels.mockRejectedValue(new Error("Registry unavailable"));

    render(<ModelTrainingPage />);

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Unable to load model configuration.");
    expect(error).toHaveTextContent("Registry unavailable");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start training/i })).not.toBeInTheDocument();
  });

  it("shows a no-model state when the registry returns no trainable models", async () => {
    getInstanceModels.mockResolvedValue({ success: true, result: [] });

    render(<ModelTrainingPage />);

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("No trainable instance segmentation models are available.");
    expect(screen.queryByText("Mask2Former")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start training/i })).not.toBeInTheDocument();
  });
});

describe("Task 3: Frontend lifecycle presentation normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchLabels.mockResolvedValue({
      labels: {
        id_to_label_object: { 1: { id: 1, name: "cell" } },
      },
    });
    getInstanceLabelAnnotationCounts.mockResolvedValue({
      success: true,
      reviewed_annotation_counts: { 1: 5 },
    });
    getInstanceModels.mockResolvedValue({
      success: true,
      result: [{ registry_key: "mask2former", name: "Mask2Former", trainable: true, training_parameters: [] }],
    });
    cancelInstanceTraining.mockResolvedValue({});
    startInstanceTraining.mockResolvedValue({ task_id: "task-start-123" });
    streamInstanceTrainingProgress.mockReturnValue({ abort: vi.fn() });
  });

  it("renders friendly display labels for all canonical lifecycle states", async () => {
    const historicalRuns = [
      { task_id: "t1", run_id: "r1", state: "STARTING", start_time: 1000, label_ids: [1] },
      { task_id: "t2", run_id: "r2", state: "PROGRESS", start_time: 2000, label_ids: [1] },
      { task_id: "t3", run_id: "r3", state: "SUCCESS", start_time: 3000, label_ids: [1] },
      { task_id: "t4", run_id: "r4", state: "FAILED", start_time: 4000, label_ids: [1] },
      { task_id: "t5", run_id: "r5", state: "CANCELLED", start_time: 5000, label_ids: [1] },
      { task_id: "t6", run_id: "r6", state: "TIMED_OUT", start_time: 6000, label_ids: [1] },
      { task_id: "t7", run_id: "r7", state: "CUSTOM_UNKNOWN", start_time: 7000, label_ids: [1] },
    ];
    getInstanceTrainingRuns.mockResolvedValue({ runs: historicalRuns });

    render(<ModelTrainingPage />);

    // Check RunCard state labels in the history sidebar
    expect(await screen.findByText("Starting")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("Timed out")).toBeInTheDocument();
    expect(screen.getAllByText("CUSTOM_UNKNOWN")[0]).toBeInTheDocument();
  });

  it("treats TIMED_OUT as a terminal state and hides Stop Training", async () => {
    const timedOutRun = {
      task_id: "t-timeout",
      run_id: "r-timeout",
      state: "TIMED_OUT",
      message: "Training did not start before the queue deadline.",
      start_time: 1000,
      label_ids: [1],
    };
    getInstanceTrainingRuns.mockResolvedValue({ runs: [timedOutRun] });

    render(<ModelTrainingPage />);

    const runCard = await screen.findByText("Timed out");
    fireEvent.click(runCard);

    expect(screen.queryByRole("button", { name: /stop training/i })).not.toBeInTheDocument();
    expect(streamInstanceTrainingProgress).not.toHaveBeenCalled();
  });

  it("shows Stop Training button for non-terminal STARTING runs and hides it for terminal runs", async () => {
    const runs = [
      { task_id: "t-start", run_id: "r-start", state: "STARTING", start_time: 2000, label_ids: [1] },
      { task_id: "t-done", run_id: "r-done", state: "SUCCESS", start_time: 1000, label_ids: [1] },
    ];
    getInstanceTrainingRuns.mockResolvedValue({ runs });

    render(<ModelTrainingPage />);

    // By default, newest active run (t-start) is restored
    expect(await screen.findByRole("button", { name: /stop training/i })).toBeInTheDocument();

    // Select the completed run
    const completedCard = screen.getByText("Completed");
    fireEvent.click(completedCard);

    expect(screen.queryByRole("button", { name: /stop training/i })).not.toBeInTheDocument();
  });

  it("uses optimistic STARTING state and opens progress stream on start", async () => {
    getInstanceTrainingRuns.mockResolvedValue({ runs: [] });
    render(<ModelTrainingPage />);

    const startBtn = await screen.findByRole("button", { name: /start training/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(streamInstanceTrainingProgress).toHaveBeenCalledWith(
        "task-start-123",
        expect.any(Function),
        expect.any(Function)
      );
    });

    expect(await screen.findByText("Waiting for worker…")).toBeInTheDocument();
  });
});

describe("Zero-annotation training prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchLabels.mockResolvedValue({
      labels: {
        id_to_label_object: {
          1: { id: 1, name: "annotated" },
          2: { id: 2, name: "empty" },
        },
      },
    });
    getInstanceLabelAnnotationCounts.mockResolvedValue({
      success: true,
      reviewed_annotation_counts: { 1: 4, 2: 0 },
    });
    getInstanceModels.mockResolvedValue({
      success: true,
      result: [{ registry_key: "mask2former", name: "Mask2Former", trainable: true, training_parameters: [] }],
    });
    getInstanceTrainingRuns.mockResolvedValue({ runs: [] });
    startInstanceTraining.mockResolvedValue({ task_id: "task-zero-annotation" });
    streamInstanceTrainingProgress.mockReturnValue({ abort: vi.fn() });
  });

  it("disables and excludes zero-count labels from the default and Select all selections", async () => {
    render(<ModelTrainingPage />);

    const startButton = await screen.findByRole("button", { name: /start training/i });
    const annotated = screen.getByRole("checkbox", { name: /annotated/i });
    const empty = screen.getByRole("checkbox", { name: /empty/i });

    expect(annotated).toBeChecked();
    expect(empty).toBeDisabled();
    expect(empty).not.toBeChecked();
    expect(screen.getByText("No reviewed annotations")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    fireEvent.click(screen.getByRole("button", { name: /select all/i }));

    expect(annotated).toBeChecked();
    expect(empty).not.toBeChecked();
    expect(startButton).toBeEnabled();
  });

  it("does not call the training API when counts are zero or missing", async () => {
    getInstanceLabelAnnotationCounts.mockResolvedValue({
      success: true,
      reviewed_annotation_counts: { 1: 0 },
    });

    render(<ModelTrainingPage />);

    const startButton = await screen.findByRole("button", { name: /start training/i });
    await waitFor(() => expect(startButton).toBeDisabled());
    fireEvent.click(startButton);

    expect(startInstanceTraining).not.toHaveBeenCalled();
  });

  it("keeps training disabled while counts are loading", async () => {
    let resolveCounts;
    getInstanceLabelAnnotationCounts.mockReturnValue(new Promise((resolve) => {
      resolveCounts = resolve;
    }));

    render(<ModelTrainingPage />);

    const startButton = await screen.findByRole("button", { name: /start training/i });
    expect(startButton).toBeDisabled();
    expect(screen.getByText(/training will be available once they finish loading/i)).toBeInTheDocument();
    fireEvent.click(startButton);
    expect(startInstanceTraining).not.toHaveBeenCalled();

    resolveCounts({ success: true, reviewed_annotation_counts: { 1: 4, 2: 0 } });
    await waitFor(() => expect(startButton).toBeEnabled());
  });

  it("keeps training disabled and explains count-fetch failure", async () => {
    getInstanceLabelAnnotationCounts.mockRejectedValue(new Error("Counts unavailable"));

    render(<ModelTrainingPage />);

    const startButton = await screen.findByRole("button", { name: /start training/i });
    expect(startButton).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("training is disabled until they can be loaded");
    fireEvent.click(startButton);

    expect(startInstanceTraining).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows no trainable labels when every reviewed count is zero", async () => {
    getInstanceLabelAnnotationCounts.mockResolvedValue({
      success: true,
      reviewed_annotation_counts: { 1: 0, 2: 0 },
    });

    render(<ModelTrainingPage />);

    const startButton = await screen.findByRole("button", { name: /start training/i });
    await waitFor(() => expect(startButton).toBeDisabled());
    expect(screen.getByText(/no trainable labels yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select all/i })).toBeDisabled();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getAllByRole("checkbox").every((checkbox) => checkbox.disabled)).toBe(true);
    fireEvent.click(startButton);

    expect(startInstanceTraining).not.toHaveBeenCalled();
  });

  it("ignores delayed label responses from a previous dataset", async () => {
    let resolveFirstDataset;
    fetchLabels.mockImplementation((datasetId) => {
      if (datasetId === "42") {
        return new Promise((resolve) => {
          resolveFirstDataset = resolve;
        });
      }
      return Promise.resolve({
        labels: { id_to_label_object: { 3: { id: 3, name: "dataset-b-label" } } },
      });
    });
    getInstanceLabelAnnotationCounts.mockResolvedValue({
      success: true,
      reviewed_annotation_counts: { 3: 2 },
    });

    const { rerender } = render(<ModelTrainingPage />);
    mockRoute.datasetId = "43";
    rerender(<ModelTrainingPage />);

    expect(await screen.findByText("dataset-b-label")).toBeInTheDocument();
    await act(async () => {
      resolveFirstDataset({
        labels: { id_to_label_object: { 1: { id: 1, name: "dataset-a-label" } } },
      });
    });

    expect(screen.queryByText("dataset-a-label")).not.toBeInTheDocument();
    expect(screen.getByText("dataset-b-label")).toBeInTheDocument();
  });
});

describe("Task 4: Active run restoration after refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchLabels.mockResolvedValue({
      labels: { id_to_label_object: { 1: { id: 1, name: "cell" } } },
    });
    getInstanceLabelAnnotationCounts.mockResolvedValue({
      success: true,
      reviewed_annotation_counts: { 1: 5 },
    });
    getInstanceModels.mockResolvedValue({
      success: true,
      result: [{ registry_key: "mask2former", name: "Mask2Former", trainable: true, training_parameters: [] }],
    });
    streamInstanceTrainingProgress.mockReturnValue({ abort: vi.fn() });
  });

  it("restores an active STARTING run on page load and starts progress streaming", async () => {
    const runs = [
      { task_id: "task-starting-99", run_id: "run-99", state: "STARTING", start_time: 5000, label_ids: [1] },
    ];
    getInstanceTrainingRuns.mockResolvedValue({ runs });

    render(<ModelTrainingPage />);

    await waitFor(() => {
      expect(streamInstanceTrainingProgress).toHaveBeenCalledWith(
        "task-starting-99",
        expect.any(Function),
        expect.any(Function)
      );
    });

    expect(await screen.findByText("Waiting for worker…")).toBeInTheDocument();
  });

  it("restores an active PROGRESS run on page load", async () => {
    const runs = [
      { task_id: "task-prog-1", run_id: "run-prog-1", state: "PROGRESS", epoch: 3, total_epochs: 10, start_time: 5000, label_ids: [1] },
    ];
    getInstanceTrainingRuns.mockResolvedValue({ runs });

    render(<ModelTrainingPage />);

    await waitFor(() => {
      expect(streamInstanceTrainingProgress).toHaveBeenCalledWith(
        "task-prog-1",
        expect.any(Function),
        expect.any(Function)
      );
    });

    expect(await screen.findByText(/epoch 3 \/ 10/i)).toBeInTheDocument();
  });

  it("does not start streaming when only terminal runs are present", async () => {
    const runs = [
      { task_id: "t-done", run_id: "r-done", state: "SUCCESS", start_time: 1000, label_ids: [1] },
      { task_id: "t-failed", run_id: "r-failed", state: "FAILED", start_time: 2000, label_ids: [1] },
    ];
    getInstanceTrainingRuns.mockResolvedValue({ runs });

    render(<ModelTrainingPage />);

    await screen.findByRole("button", { name: /start training/i });
    expect(streamInstanceTrainingProgress).not.toHaveBeenCalled();
  });

  it("restores only the newest active run when multiple active runs exist", async () => {
    const runs = [
      { task_id: "task-older", run_id: "run-older", state: "STARTING", start_time: 1000, label_ids: [1] },
      { task_id: "task-newer", run_id: "run-newer", state: "PROGRESS", start_time: 5000, label_ids: [1] },
    ];
    getInstanceTrainingRuns.mockResolvedValue({ runs });

    render(<ModelTrainingPage />);

    await waitFor(() => expect(streamInstanceTrainingProgress).toHaveBeenCalledTimes(1));
    expect(streamInstanceTrainingProgress).toHaveBeenCalledWith(
      "task-newer",
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("aborts active stream controller on unmount", async () => {
    const abortMock = vi.fn();
    streamInstanceTrainingProgress.mockReturnValue({ abort: abortMock });

    const runs = [
      { task_id: "task-active", run_id: "run-active", state: "STARTING", start_time: 5000, label_ids: [1] },
    ];
    getInstanceTrainingRuns.mockResolvedValue({ runs });

    const { unmount } = render(<ModelTrainingPage />);

    await waitFor(() => expect(streamInstanceTrainingProgress).toHaveBeenCalled());
    unmount();
    expect(abortMock).toHaveBeenCalled();
  });

  it("clears the active run and aborts its stream when the dataset changes", async () => {
    const abortMock = vi.fn();
    streamInstanceTrainingProgress.mockReturnValue({ abort: abortMock });
    getInstanceTrainingRuns.mockImplementation((datasetId) => Promise.resolve({
      runs: datasetId === "42"
        ? [{
            task_id: "task-dataset-42",
            run_id: "run-dataset-42",
            state: "STARTING",
            start_time: 5000,
            label_ids: [1],
          }]
        : [],
    }));

    const { rerender } = render(<ModelTrainingPage />);

    await waitFor(() => expect(streamInstanceTrainingProgress).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Waiting for worker…")).toBeInTheDocument();

    mockRoute.datasetId = "43";
    rerender(<ModelTrainingPage />);

    await waitFor(() => expect(getInstanceTrainingRuns).toHaveBeenCalledWith("43"));
    await waitFor(() => expect(abortMock).toHaveBeenCalled());
    expect(streamInstanceTrainingProgress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Waiting for worker…")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /start training/i })).toBeInTheDocument();
  });
});

describe("Task 5: Slow-start warning and terminal messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchLabels.mockResolvedValue({
      labels: { id_to_label_object: { 1: { id: 1, name: "cell" } } },
    });
    getInstanceLabelAnnotationCounts.mockResolvedValue({
      success: true,
      reviewed_annotation_counts: { 1: 5 },
    });
    getInstanceModels.mockResolvedValue({
      success: true,
      result: [{ registry_key: "mask2former", name: "Mask2Former", trainable: true, training_parameters: [] }],
    });
    cancelInstanceTraining.mockResolvedValue({
      task_id: "task-cancel-1",
      state: "CANCELLED",
      message: "Training cancelled by user.",
    });
    streamInstanceTrainingProgress.mockReturnValue({ abort: vi.fn() });
  });

  it("shows slow-start warning only after 60 seconds of STARTING and removes it on PROGRESS", async () => {
    let streamCallback;
    streamInstanceTrainingProgress.mockImplementation((taskId, onSnap) => {
      streamCallback = onSnap;
      return { abort: vi.fn() };
    });

    vi.useFakeTimers();
    try {
      const baseTime = 1000000;
      vi.setSystemTime(baseTime);

      const startingRun = {
        task_id: "task-slow",
        run_id: "run-slow",
        state: "STARTING",
        queued_at: baseTime / 1000, // Unix seconds
        start_time: baseTime,
        label_ids: [1],
      };
      getInstanceTrainingRuns.mockResolvedValue({ runs: [startingRun] });

      render(<ModelTrainingPage />);

      // Flush mount promises
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText("Waiting for worker…")).toBeInTheDocument();

      // At 59 seconds: no warning
      act(() => {
        vi.advanceTimersByTime(59000);
      });
      expect(screen.queryByText(/This is taking longer than usual/i)).not.toBeInTheDocument();

      // At 60 seconds: warning is shown
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText(/This is taking longer than usual/i)).toBeInTheDocument();

      // When state transitions to PROGRESS: warning disappears
      act(() => {
        streamCallback({
          task_id: "task-slow",
          run_id: "run-slow",
          state: "PROGRESS",
          epoch: 1,
          total_epochs: 10,
        });
      });
      expect(screen.queryByText(/This is taking longer than usual/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("displays server message and fallback message for TIMED_OUT runs", async () => {
    const timedOutRunWithMessage = {
      task_id: "task-to-1",
      run_id: "run-to-1",
      state: "TIMED_OUT",
      message: "Custom timeout from backend.",
      start_time: 1000,
      label_ids: [1],
    };
    getInstanceTrainingRuns.mockResolvedValue({ runs: [timedOutRunWithMessage] });

    render(<ModelTrainingPage />);

    const runCard = await screen.findByText("Timed out");
    fireEvent.click(runCard);

    expect(screen.getByRole("alert")).toHaveTextContent("Custom timeout from backend.");
  });

  it("displays fallback message for TIMED_OUT runs when message is omitted", async () => {
    const timedOutRunNoMessage = {
      task_id: "task-to-2",
      run_id: "run-to-2",
      state: "TIMED_OUT",
      start_time: 1000,
      label_ids: [1],
    };
    getInstanceTrainingRuns.mockResolvedValue({ runs: [timedOutRunNoMessage] });

    render(<ModelTrainingPage />);

    const runCard = await screen.findByText("Timed out");
    fireEvent.click(runCard);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Training did not start before the queue deadline."
    );
  });

  it("stops active streaming and reloads history on terminal SSE snapshot", async () => {
    let streamCallback;
    streamInstanceTrainingProgress.mockImplementation((taskId, onSnap) => {
      streamCallback = onSnap;
      return { abort: vi.fn() };
    });

    const runs = [
      { task_id: "task-live", run_id: "run-live", state: "STARTING", start_time: 5000, label_ids: [1] },
    ];
    getInstanceTrainingRuns.mockResolvedValue({ runs });

    render(<ModelTrainingPage />);

    await waitFor(() => expect(streamInstanceTrainingProgress).toHaveBeenCalled());

    // Stream receives terminal SUCCESS snapshot
    act(() => {
      streamCallback({
        task_id: "task-live",
        run_id: "run-live",
        state: "SUCCESS",
        training_state: "completed",
        epoch: 10,
        total_epochs: 10,
      });
    });

    await waitFor(() => {
      // History should have been reloaded
      expect(getInstanceTrainingRuns).toHaveBeenCalledTimes(2);
    });
  });

  it("invokes cancellation and displays cancelled state when Stop Training is clicked on a STARTING run", async () => {
    const runs = [
      { task_id: "task-to-cancel", run_id: "run-to-cancel", state: "STARTING", start_time: 5000, label_ids: [1] },
    ];
    getInstanceTrainingRuns.mockResolvedValue({ runs });
    cancelInstanceTraining.mockResolvedValue({
      task_id: "task-to-cancel",
      run_id: "run-to-cancel",
      state: "CANCELLED",
      training_state: "cancelled",
      message: "Training cancelled by user.",
    });

    render(<ModelTrainingPage />);

    const stopBtn = await screen.findByRole("button", { name: /stop training/i });
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(cancelInstanceTraining).toHaveBeenCalledWith("task-to-cancel");
    });

    expect(await screen.findByText("Training cancelled by user.")).toBeInTheDocument();
  });
});
