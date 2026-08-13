import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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

jest.mock("react-router-dom", () => ({
  useParams: () => ({ datasetId: "42" }),
}), { virtual: true });

jest.mock("../contexts/DatasetContext", () => ({
  useDataset: () => ({ currentDataset: { name: "Test dataset" } }),
}));

jest.mock("../components/datasets/gallery/DatasetManagementLayout", () => ({ children }) => (
  <div>{children}</div>
));

jest.mock("../components/datasets/training/DynamicHyperParameter", () => () => null);

jest.mock("../api", () => ({
  cancelInstanceTraining: jest.fn(),
  fetchLabels: jest.fn(),
  getInstanceLabelAnnotationCounts: jest.fn(),
  getInstanceModels: jest.fn(),
  getInstanceTrainingRuns: jest.fn(),
  startInstanceTraining: jest.fn(),
  streamInstanceTrainingProgress: jest.fn(),
}));

describe("ModelTrainingPage model loading", () => {
  beforeEach(() => {
    fetchLabels.mockResolvedValue({ labels: { id_to_label_object: {} } });
    getInstanceLabelAnnotationCounts.mockResolvedValue({
      success: true,
      reviewed_annotation_counts: {},
    });
    getInstanceTrainingRuns.mockResolvedValue({ runs: [] });
    cancelInstanceTraining.mockResolvedValue({});
    startInstanceTraining.mockResolvedValue({ task_id: "task-1" });
    streamInstanceTrainingProgress.mockReturnValue({ abort: jest.fn() });
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
