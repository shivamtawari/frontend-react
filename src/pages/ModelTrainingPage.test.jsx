import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ModelTrainingPage from "./ModelTrainingPage";
import {
  fetchLabels,
  getInstanceLabelAnnotationCounts,
  getInstanceModels,
  getInstanceTrainingModels,
  getInstanceTrainingRuns,
  startInstanceTraining,
  streamInstanceTrainingProgress,
} from "../api";
import { useDataset } from "../contexts/DatasetContext";

jest.mock("../api", () => ({
  cancelInstanceTraining: jest.fn(),
  fetchLabels: jest.fn(),
  getInstanceLabelAnnotationCounts: jest.fn(),
  getInstanceModels: jest.fn(),
  getInstanceTrainingModels: jest.fn(),
  getInstanceTrainingRuns: jest.fn(),
  startInstanceTraining: jest.fn(),
  streamInstanceTrainingProgress: jest.fn(),
}));


jest.mock("../contexts/DatasetContext", () => ({
  useDataset: jest.fn(),
}));

jest.mock("../components/datasets/gallery/DatasetManagementLayout", () => ({ children }) => children);

jest.mock("../hooks/useThemeColors", () => () => ({
  colors: { ln: "#000", ln2: "#000", t1: "#000", t2: "#000", t3: "#000", p2: "#000", ac: "#000" },
}));

let mockDatasetId = "42";
jest.mock("react-router-dom", () => ({
  useParams: () => ({ datasetId: mockDatasetId }),
}), { virtual: true });

const registeredModel = {
  registry_key: "registered-model",
  name: "Registered model",
  training_parameters: [],
};

const defaultLabels = {
  1: { id: 1, name: "Cell", parent_id: null },
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

function resolveSupportingRequests() {
  fetchLabels.mockResolvedValue({ labels: { id_to_label_object: defaultLabels } });
  getInstanceLabelAnnotationCounts.mockResolvedValue({
    success: true,
    reviewed_annotation_counts: { 1: 1 },
  });
  getInstanceModels.mockResolvedValue({ result: [registeredModel] });
  getInstanceTrainingModels.mockResolvedValue({ result: [registeredModel] });
  getInstanceTrainingRuns.mockResolvedValue({ runs: [] });
  streamInstanceTrainingProgress.mockImplementation(() => ({ abort: jest.fn() }));
}


function renderReadyPage() {
  render(<ModelTrainingPage />);
  return waitFor(() => expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument());
}

describe("ModelTrainingPage metadata and resource states", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockDatasetId = "42";
    useDataset.mockReturnValue({ currentDataset: { name: "Test dataset" } });
    resolveSupportingRequests();
  });

  test("keeps model configuration unavailable while metadata is loading", () => {
    fetchLabels.mockReturnValue(new Promise(() => {}));
    getInstanceLabelAnnotationCounts.mockReturnValue(new Promise(() => {}));
    getInstanceTrainingRuns.mockReturnValue(new Promise(() => {}));
    getInstanceTrainingModels.mockReturnValue(new Promise(() => {}));

    render(<ModelTrainingPage />);

    expect(screen.getByRole("status", { name: /Loading training models/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Training" })).not.toBeInTheDocument();
  });

  test("renders a valid empty model state without a fallback", async () => {
    getInstanceTrainingModels.mockResolvedValue({ result: [] });

    render(<ModelTrainingPage />);

    expect(await screen.findByRole("status", { name: /No training models available/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  test("shows a model load failure and retries successfully", async () => {
    getInstanceTrainingModels.mockRejectedValueOnce(new Error("Registry unavailable"));

    render(<ModelTrainingPage />);

    expect(await screen.findByRole("alert", { name: /Registry unavailable/i })).toBeInTheDocument();


    getInstanceTrainingModels.mockResolvedValueOnce({ result: [registeredModel] });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("registered-model");
    });
    expect(screen.getByText("Registered model")).toBeInTheDocument();
  });

  test("renders the configuration only after valid model metadata loads", async () => {
    await renderReadyPage();

    expect(screen.getByRole("group", { name: /Classes to train \(1\/1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Training" })).toBeInTheDocument();
  });

  test("distinguishes standard flat models from exclusive_hierarchy_v1 models", async () => {
    const flatModel = { ...registeredModel, tags: { segmentation_mode: "flat" }, registry_key: "flat-model" };
    const awareModel = { ...registeredModel, tags: { target_encoding: "exclusive_hierarchy_v1" }, registry_key: "aware-model" };
    
    getInstanceTrainingModels.mockResolvedValue({ result: [flatModel, awareModel] });

    
    render(<ModelTrainingPage />);
    await screen.findByRole("combobox", { name: "Model" });
    
    // First model is flat, should not show hierarchy aware badge
    expect(screen.queryByText("Hierarchy Aware")).not.toBeInTheDocument();
    expect(screen.getByText(/Multiclass by default/i)).not.toHaveTextContent("exclusive_hierarchy_v1");

    // Select the second model
    fireEvent.change(screen.getByRole("combobox", { name: "Model" }), { target: { value: "aware-model" } });
    
    await screen.findByText("Hierarchy Aware");
    expect(screen.getByText(/exclusive_hierarchy_v1/i)).toBeInTheDocument();
  });
});

describe("ModelTrainingPage labels, run history, and accessibility", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockDatasetId = "42";
    useDataset.mockReturnValue({ currentDataset: { name: "Test dataset" } });
    resolveSupportingRequests();
  });

  test("shows label loading and then a valid empty label state", async () => {
    const labelsRequest = deferred();
    fetchLabels.mockReturnValue(labelsRequest.promise);

    render(<ModelTrainingPage />);
    await screen.findByRole("status", { name: /Loading labels/i });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await act(async () => {
      labelsRequest.resolve({ labels: { id_to_label_object: {} } });
    });
    expect(await screen.findByRole("status", { name: /No labels available for this dataset/i })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  test("shows a label error and retries without changing the API", async () => {
    fetchLabels.mockRejectedValueOnce(new Error("Label service unavailable"));
    render(<ModelTrainingPage />);

    expect(await screen.findByRole("alert", { name: /Label service unavailable/i })).toBeInTheDocument();
    fetchLabels.mockResolvedValueOnce({ labels: { id_to_label_object: defaultLabels } });
    fireEvent.click(screen.getByRole("button", { name: "Retry labels" }));

    expect(await screen.findByRole("checkbox", { name: "Cell" })).toBeInTheDocument();
    expect(fetchLabels).toHaveBeenLastCalledWith("42");
  });

  test("shows run-history loading, error/retry, and valid empty states", async () => {
    const runsRequest = deferred();
    getInstanceTrainingRuns.mockReturnValueOnce(runsRequest.promise);
    render(<ModelTrainingPage />);

    expect(await screen.findByRole("status", { name: /Loading run history/i })).toBeInTheDocument();
    await act(async () => {
      runsRequest.reject(new Error("Run history unavailable"));
    });
    expect(await screen.findByRole("alert", { name: /Run history unavailable/i })).toBeInTheDocument();

    getInstanceTrainingRuns.mockResolvedValueOnce({ runs: [] });
    fireEvent.click(screen.getByRole("button", { name: "Retry run history" }));
    expect(await screen.findByRole("status", { name: /No runs yet for this dataset/i })).toBeInTheDocument();
  });

  test("associates the model select and label checkboxes with accessible names", async () => {
    await renderReadyPage();
    await screen.findByRole("checkbox", { name: "Cell" });

    const modelSelect = screen.getByRole("combobox", { name: "Model" });
    expect(modelSelect).toHaveAttribute("id", "model-registry-key");

    const labelGroup = screen.getByRole("group", { name: /Classes to train/i });
    expect(labelGroup).toHaveAttribute("aria-describedby", "training-label-help");
    expect(screen.getByRole("checkbox", { name: "Cell" })).toHaveAttribute("name", "label_ids");
    expect(screen.getByRole("button", { name: "Clear all" })).toHaveAttribute(
      "aria-controls",
      "training-label-options",
    );
    expect(screen.getByLabelText("Run name (optional)")).toBeInTheDocument();
  });
});

describe("ModelTrainingPage dataset and stream race guards", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockDatasetId = "old";
    useDataset.mockReturnValue({ currentDataset: { name: "Test dataset" } });
    resolveSupportingRequests();
  });

  test("ignores out-of-order labels, counts, and runs from the previous dataset", async () => {
    const oldLabels = deferred();
    const newLabels = deferred();
    const oldCounts = deferred();
    const newCounts = deferred();
    const oldRuns = deferred();
    const newRuns = deferred();

    fetchLabels.mockImplementation((id) => (id === "old" ? oldLabels.promise : newLabels.promise));
    getInstanceLabelAnnotationCounts.mockImplementation((id) => (
      id === "old" ? oldCounts.promise : newCounts.promise
    ));
    getInstanceTrainingRuns.mockImplementation((id) => (id === "old" ? oldRuns.promise : newRuns.promise));

    const view = render(<ModelTrainingPage />);
    await waitFor(() => expect(fetchLabels).toHaveBeenCalledWith("old"));

    mockDatasetId = "new";
    view.rerender(<ModelTrainingPage />);
    await waitFor(() => expect(fetchLabels).toHaveBeenCalledWith("new"));

    await act(async () => {
      newLabels.resolve({
        labels: {
          id_to_label_object: { 20: { id: 20, name: "New label", parent_id: null } },
        },
      });
      newCounts.resolve({ success: true, reviewed_annotation_counts: { 20: 2 } });
      newRuns.resolve({
        runs: [{ task_id: "new-task", run_name: "New run", state: "SUCCESS", label_ids: [20] }],
      });
    });

    expect(await screen.findByRole("checkbox", { name: "New label" })).toBeInTheDocument();
    expect(await screen.findByText("New run")).toBeInTheDocument();

    await act(async () => {
      oldLabels.resolve({
        labels: {
          id_to_label_object: { 10: { id: 10, name: "Old label", parent_id: null } },
        },
      });
      oldCounts.resolve({ success: true, reviewed_annotation_counts: { 10: 99 } });
      oldRuns.resolve({
        runs: [{ task_id: "old-task", run_name: "Old run", state: "SUCCESS", label_ids: [10] }],
      });
    });

    await screen.findByRole("checkbox", { name: "New label" });
    expect(screen.queryByRole("checkbox", { name: "Old label" })).not.toBeInTheDocument();
    expect(screen.queryByText("Old run")).not.toBeInTheDocument();
  });

  test("ignores late stream messages and errors after a dataset switch", async () => {
    const streamControllers = [];
    streamInstanceTrainingProgress.mockImplementation((taskId, onMessage, onError) => {
      const controller = { taskId, onMessage, onError, abort: jest.fn() };
      streamControllers.push(controller);
      return controller;
    });
    getInstanceTrainingRuns.mockImplementation((id) => Promise.resolve({
      runs: id === "old"
        ? [{ task_id: "old-task", run_name: "Old active run", state: "PROGRESS", label_ids: [1] }]
        : [],
    }));

    const view = render(<ModelTrainingPage />);
    await screen.findByText("Old active run");
    fireEvent.click(screen.getByRole("button", { name: /PROGRESS/ }));
    await waitFor(() => expect(streamControllers).toHaveLength(1));

    mockDatasetId = "new";
    view.rerender(<ModelTrainingPage />);
    await waitFor(() => expect(screen.queryByText("Old active run")).not.toBeInTheDocument());

    await act(async () => {
      streamControllers[0].onMessage({
        task_id: "old-task",
        state: "SUCCESS",
        run_name: "Late old stream run",
      });
      streamControllers[0].onError(new Error("Late old stream error"));
    });

    expect(screen.queryByText("Late old stream run")).not.toBeInTheDocument();
    expect(screen.queryByText("Late old stream error")).not.toBeInTheDocument();
  });
});

describe("ModelTrainingPage hierarchy selection", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockDatasetId = "42";
    useDataset.mockReturnValue({ currentDataset: { name: "Test dataset" } });
    resolveSupportingRequests();
    fetchLabels.mockResolvedValue({
      labels: {
        id_to_label_object: {
          1: { id: 1, name: "Root", parent_id: null },
          2: { id: 2, name: "Intermediate", parent_id: 1 },
          3: { id: 3, name: "Leaf", parent_id: 2 },
        },
      },
    });
    getInstanceLabelAnnotationCounts.mockResolvedValue({
      success: true,
      reviewed_annotation_counts: { 1: 1, 2: 1, 3: 1 },
    });
  });

  test("preserves parent_id and blocks a skipped ancestor-descendant path", async () => {
    await renderReadyPage();
    await screen.findByRole("checkbox", { name: "Leaf" });

    const leaf = screen.getByRole("checkbox", { name: "Leaf" });
    expect(leaf).toHaveAttribute("data-parent-id", "2");

    fireEvent.click(screen.getByRole("checkbox", { name: "Intermediate" }));
    expect(await screen.findByRole("alert", { name: /Intermediate.*cannot skip levels/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Training" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Intermediate" }));
    await waitFor(() => expect(screen.queryByRole("alert", { name: /cannot skip levels/i })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Start Training" })).toBeEnabled();
  });

  test("allows a single child label without requiring its ancestors", async () => {
    await renderReadyPage();
    await screen.findByRole("checkbox", { name: "Leaf" });

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Leaf" }));

    expect(screen.queryByRole("alert", { name: /cannot skip levels/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Training" })).toBeEnabled();
  });
});

describe("ModelTrainingPage hierarchy normalization confirmation", () => {
  const hierarchyNormalizationError = {
    error_code: "hierarchy_normalization_required",
    details: {
      summary: {
        adjusted_child_count: 3,
        excluded_image_count: 2,
        excluded_child_count: 4,
        sibling_overlap_pair_count: 5,
        affected_images: [
          { image_id: 1, file_name: "image-1", action: "normalize" },
          { image_id: 2, file_name: "image-2", action: "exclude" },
        ],
      },
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockDatasetId = "42";
    useDataset.mockReturnValue({ currentDataset: { name: "Test dataset" } });
    resolveSupportingRequests();
  });

  async function renderPageForNormalization() {
    await renderReadyPage();
    await screen.findByRole("checkbox", { name: "Cell" });
  }

  test("shows the defensive normalization summary and affected images", async () => {
    startInstanceTraining.mockRejectedValueOnce(hierarchyNormalizationError);
    await renderPageForNormalization();

    fireEvent.click(screen.getByRole("button", { name: "Start Training" }));

    const dialog = await screen.findByRole("dialog", { name: "Adjust masks before training?" });
    expect(dialog).toHaveTextContent("Images with masks adjusted1");
    expect(dialog).toHaveTextContent("Objects with masks adjusted3");
    expect(dialog).toHaveTextContent("Images excluded2");
    expect(dialog).toHaveTextContent("Objects excluded4");
    expect(dialog).toHaveTextContent("Sibling-overlap pairs5");
    expect(dialog).toHaveTextContent("image-1");
    expect(dialog).toHaveTextContent("source annotations are unchanged");
  });

  test("cancels without retrying or changing the strict initial request", async () => {
    startInstanceTraining.mockRejectedValueOnce(hierarchyNormalizationError);
    await renderPageForNormalization();

    fireEvent.click(screen.getByRole("button", { name: "Start Training" }));
    await screen.findByRole("dialog", { name: "Adjust masks before training?" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Adjust masks before training?" })).not.toBeInTheDocument();
    expect(startInstanceTraining).toHaveBeenCalledTimes(1);
    expect(startInstanceTraining.mock.calls[0][0]).not.toHaveProperty("hierarchy_conflict_policy");
  });

  test("sends normalize only on the confirmed retry", async () => {
    startInstanceTraining
      .mockRejectedValueOnce(hierarchyNormalizationError)
      .mockResolvedValueOnce({ task_id: "normalized-task" });
    await renderPageForNormalization();

    fireEvent.click(screen.getByRole("button", { name: "Start Training" }));
    await screen.findByRole("dialog", { name: "Adjust masks before training?" });
    fireEvent.click(screen.getByRole("button", { name: "Adjust masks and continue" }));

    await waitFor(() => expect(startInstanceTraining).toHaveBeenCalledTimes(2));
    expect(startInstanceTraining.mock.calls[0][0]).not.toHaveProperty("hierarchy_conflict_policy");
    expect(startInstanceTraining.mock.calls[1][0]).toMatchObject({
      hierarchy_conflict_policy: "normalize",
    });
  });

  test("shows the run after a successful normalization retry", async () => {
    startInstanceTraining
      .mockRejectedValueOnce(hierarchyNormalizationError)
      .mockResolvedValueOnce({ task_id: "normalized-task" });
    await renderPageForNormalization();

    fireEvent.click(screen.getByRole("button", { name: "Start Training" }));
    await screen.findByRole("dialog", { name: "Adjust masks before training?" });
    fireEvent.click(screen.getByRole("button", { name: "Adjust masks and continue" }));

    expect(await screen.findByText("Waiting for worker…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Training" })).not.toBeInTheDocument();
  });

  test("explains when the pre-training hierarchy check is taking a while", async () => {
    jest.useFakeTimers();
    const pendingStart = deferred();
    startInstanceTraining.mockReturnValueOnce(pendingStart.promise);
    await renderPageForNormalization();

    fireEvent.click(screen.getByRole("button", { name: "Start Training" }));
    expect(screen.getByText(/Preparing the training data/i)).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();

    pendingStart.resolve({ task_id: "delayed-task" });
    expect(await screen.findByText("Waiting for worker…")).toBeInTheDocument();
    jest.useRealTimers();
  });
});
