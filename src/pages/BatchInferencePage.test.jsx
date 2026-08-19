import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import BatchInferencePage from "./BatchInferencePage";
import {
    fetchLabels,
    getInferenceJobs,
    getInferenceModelCatalog,
    getInferenceScopeCounts,
    previewInferenceReplace,
    startInferenceJob,
    streamInferenceJob,
} from "../api";

const { mockRoute } = vi.hoisted(() => ({
  mockRoute: { datasetId: "99" },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useParams: () => ({ datasetId: mockRoute.datasetId }),
  useNavigate: () => mockNavigate,
}));

vi.mock("../contexts/DatasetContext", () => ({
  useDataset: () => ({ currentDataset: { id: 99, name: "Test Dataset" } }),
}));

vi.mock("../components/datasets/gallery/DatasetManagementLayout", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock("../api", () => ({
  cancelInferenceJob: vi.fn(),
  deleteInferenceJob: vi.fn(),
  fetchLabels: vi.fn(),
  getInferenceJobs: vi.fn(),
  getInferenceModelCatalog: vi.fn(),
  getInferenceScopeCounts: vi.fn(),
  previewInferenceReplace: vi.fn(),
  startInferenceJob: vi.fn(),
  streamInferenceJob: vi.fn(),
}));

const REPLACE_MODEL_CATALOG = {
    models: [
        {
            registry_key: "mask2former",
            name: "Mask2Former",
            task: "instance-segmentation",
            label_ids: [],
            input_contract: {
                schema_version: 1,
                task: "instance-segmentation",
                conditioning: {
                    kind: "none",
                    user_selectable_count: false,
                },
                parameters: [
                    {
                        key: "threshold",
                        label: "Confidence threshold",
                        type: "float",
                        default_value: 0.5,
                        min_value: 0.0,
                        max_value: 1.0,
                        step: 0.05,
                    },
                ],
            },
        },
    ],
    retrieval_strategies: [],
};

const LEGACY_MODEL_CATALOG = {
    models: [
        {
            registry_key: "legacy-mask2former",
            name: "Legacy Mask2Former",
            task: "instance-segmentation",
            provenance: "legacy_default",
            label_ids: [],
            input_contract: {
                schema_version: 1,
                task: "instance-segmentation",
                conditioning: {
                    kind: "none",
                    user_selectable_count: false,
                },
                parameters: [],
            },
        },
    ],
    retrieval_strategies: [],
};

describe("BatchInferencePage Contract Submission", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchLabels.mockResolvedValue({
            labels: {
                id_to_label_object: {
                    1: { id: 1, name: "cell", parent_id: null },
                },
            },
        });
        getInferenceScopeCounts.mockResolvedValue({
            total: 10,
            not_started: 5,
            unreviewed: 8,
        });
        getInferenceJobs.mockResolvedValue([]);
        streamInferenceJob.mockReturnValue({ abort: vi.fn() });
        startInferenceJob.mockResolvedValue({
            id: 101,
            status: "pending",
            total_units: 10,
            done_units: 0,
            steps: [],
        });
    });

    const configureReplaceRun = async () => {
        getInferenceModelCatalog.mockResolvedValue(REPLACE_MODEL_CATALOG);
        render(<BatchInferencePage />);

        const modelSelect = await screen.findByRole("combobox", { name: /model for cell/i });
        fireEvent.change(modelSelect, {
            target: { value: "instance-segmentation::mask2former" },
        });

        const startButton = await screen.findByRole("button", { name: /start inference/i });
        await waitFor(() => expect(startButton).not.toBeDisabled());
        fireEvent.click(screen.getByRole("button", { name: /^replace\b/i }));
    };

    it("submits canonical inputs envelope for SAM 3 cross-image step", async () => {
        getInferenceModelCatalog.mockResolvedValue({
            models: [
                {
                    registry_key: "sam3-incontext",
                    name: "SAM 3 (In-context)",
                    task: "cross-image-suggestion",
                    label_ids: [],
                    input_contract: {
                        schema_version: 1,
                        task: "cross-image-suggestion",
                        conditioning: {
                            kind: "reference_images",
                            unit: "image",
                            min_units: 1,
                            max_units: 1,
                            requires_complete_annotation: true,
                            user_selectable_count: false,
                        },
                        parameters: [
                            {
                                key: "threshold",
                                label: "Detection sensitivity",
                                type: "float",
                                default_value: 0.3,
                                min_value: 0.0,
                                max_value: 1.0,
                                step: 0.05,
                            },
                            {
                                key: "mask_threshold",
                                label: "Mask threshold",
                                type: "float",
                                default_value: 0.5,
                                min_value: 0.0,
                                max_value: 1.0,
                                step: 0.05,
                            },
                            {
                                key: "min_target_frac",
                                label: "Target overlap",
                                type: "float",
                                default_value: 0.5,
                                min_value: 0.0,
                                max_value: 1.0,
                                step: 0.05,
                            },
                        ],
                    },
                },
            ],
            retrieval_strategies: [
                { key: "global_scene", label: "Global Scene", available: true },
            ],
        });

        render(<BatchInferencePage />);

        // Wait for models to load and select model for "cell"
        const modelSelect = await screen.findByRole("combobox", { name: /model for cell/i });
        fireEvent.change(modelSelect, { target: { value: "cross-image-suggestion::sam3-incontext" } });

        // Change parameter threshold
        const thresholdSlider = screen.getByRole("slider", { name: /detection sensitivity/i });
        fireEvent.change(thresholdSlider, { target: { value: "0.75" } });
        expect(screen.queryByRole("spinbutton", { name: /min\. confidence for cell/i })).not.toBeInTheDocument();

        // Click Start Inference button
        const startButton = screen.getByRole("button", { name: /start inference/i });
        expect(startButton).not.toBeDisabled();
        fireEvent.click(startButton);

        await waitFor(() => expect(startInferenceJob).toHaveBeenCalledTimes(1));

        const submittedPayload = startInferenceJob.mock.calls[0][0];
        expect(submittedPayload).toMatchObject({
            dataset_id: 99,
            image_selection: "all",
            confirm_replace: false,
            steps: [
                {
                    label_id: 1,
                    model_registry_key: "sam3-incontext",
                    task: "cross-image-suggestion",
                    inputs: {
                        conditioning: {
                            count: 1,
                            strategy: "global_scene",
                        },
                        parameters: {
                            threshold: 0.75,
                            mask_threshold: 0.5,
                            min_target_frac: 0.5,
                        },
                    },
                },
            ],
        });
        expect(submittedPayload.steps[0]).toHaveProperty("min_confidence", 0.75);
        expect(submittedPayload.steps[0]).not.toHaveProperty("retrieval_strategy");
        expect(submittedPayload.steps[0]).not.toHaveProperty("top_k");
        expect(submittedPayload.steps[0].inputs.parameters).not.toHaveProperty("min_confidence");
    });

    it("renders and submits gateway confidence for a legacy fallback model", async () => {
        getInferenceModelCatalog.mockResolvedValue(LEGACY_MODEL_CATALOG);
        render(<BatchInferencePage />);

        const modelSelect = await screen.findByRole("combobox", { name: /model for cell/i });
        fireEvent.change(modelSelect, {
            target: { value: "instance-segmentation::legacy-mask2former" },
        });

        const confidenceInput = await screen.findByRole("spinbutton", {
            name: /min\. confidence for cell/i,
        });
        fireEvent.change(confidenceInput, { target: { value: "0.65" } });

        const startButton = await screen.findByRole("button", { name: /start inference/i });
        expect(startButton).not.toBeDisabled();
        fireEvent.click(startButton);

        await waitFor(() => expect(startInferenceJob).toHaveBeenCalledTimes(1));

        const submittedPayload = startInferenceJob.mock.calls[0][0];
        expect(submittedPayload.steps).toEqual([
            expect.objectContaining({
                label_id: 1,
                model_registry_key: "legacy-mask2former",
                task: "instance-segmentation",
                min_confidence: 0.65,
                inputs: {
                    conditioning: {},
                    parameters: {},
                },
            }),
        ]);
        expect(submittedPayload.steps[0].inputs.parameters).not.toHaveProperty("min_confidence");
        expect(submittedPayload.steps[0]).not.toHaveProperty("retrieval_strategy");
        expect(submittedPayload.steps[0]).not.toHaveProperty("top_k");
    });

    it("shows replace-preview failures and blocks deletion without a preview", async () => {
        previewInferenceReplace.mockRejectedValueOnce(new Error("API Error: preview unavailable"));

        await configureReplaceRun();

        await waitFor(() => expect(previewInferenceReplace).toHaveBeenCalled());
        expect(await screen.findByText(/Could not count what would be deleted/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /start inference/i }));
        const dialog = await screen.findByRole("dialog");
        const confirmInput = within(dialog).getByLabelText(/type replace to confirm/i);
        fireEvent.change(confirmInput, { target: { value: "REPLACE" } });

        expect(within(dialog).getByRole("button", { name: /delete and run/i })).toBeDisabled();
        expect(startInferenceJob).not.toHaveBeenCalled();
    });

    it("shows a start error inside the replace dialog", async () => {
        previewInferenceReplace.mockResolvedValueOnce({
            contours: 2,
            images: 1,
            root_contours: 1,
            reviewed_contours: 0,
            protected_contours: 0,
        });
        startInferenceJob.mockRejectedValueOnce(new Error("API Error: delete permission required"));

        await configureReplaceRun();
        await waitFor(() => expect(previewInferenceReplace).toHaveBeenCalled());
        expect(
            await screen.findByText(
                (_, element) =>
                    element?.tagName === "P" &&
                    element.textContent.includes("2 contours across 1 images will be deleted")
            )
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /start inference/i }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText(/type replace to confirm/i), {
            target: { value: "REPLACE" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: /delete and run/i }));

        expect(await within(dialog).findByRole("alert")).toHaveTextContent(
            "API Error: delete permission required"
        );
        expect(startInferenceJob).toHaveBeenCalledWith(
            expect.objectContaining({ confirm_replace: true })
        );
    });
});
