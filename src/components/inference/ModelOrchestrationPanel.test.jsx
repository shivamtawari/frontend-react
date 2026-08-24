import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ModelOrchestrationPanel, { modelsForTaskAndLabel } from "./ModelOrchestrationPanel";
import { TASK_ORDER } from "../../constants/tasks";

describe("ModelOrchestrationPanel", () => {
    const labelsById = {
        1: { id: 1, name: "cell", parent_id: null },
        2: { id: 2, name: "nucleus", parent_id: 1 },
    };

    const models = [
        {
            registry_key: "sam2-prompted",
            name: "SAM 2 Prompted",
            task: "prompted-segmentation",
            label_ids: [],
            provenance: "declared",
            trained_on_dataset: false,
        },
        {
            registry_key: "sam3-intra",
            name: "SAM 3 Intra",
            task: "instance-suggestion",
            label_ids: [],
            provenance: "declared",
            trained_on_dataset: false,
        },
        {
            registry_key: "m2f-generic",
            name: "Mask2Former Generic",
            task: "instance-segmentation",
            label_ids: [],
            provenance: "legacy_default",
            trained_on_dataset: false,
        },
        {
            registry_key: "m2f-cell-specialist",
            name: "Mask2Former Cell Specialist",
            task: "instance-segmentation",
            label_ids: [1],
            provenance: "declared",
            trained_on_dataset: true,
        },
        {
            registry_key: "sam3-cross",
            name: "SAM 3 Cross Exemplar",
            task: "cross-image-suggestion",
            label_ids: [],
            provenance: "declared",
            trained_on_dataset: false,
            input_contract: {
                schema_version: 1,
                task: "cross-image-suggestion",
                conditioning: {
                    kind: "concept_text",
                    user_selectable_count: false,
                },
                parameters: [
                    {
                        key: "threshold",
                        label: "Detection sensitivity",
                        type: "float",
                        default_value: 0.5,
                        min_value: 0.0,
                        max_value: 1.0,
                        step: 0.05,
                    },
                ],
            },
        },
    ];

    const strategies = [
        { key: "global_scene", label: "Global Scene", available: true },
    ];

    it("correctly filters models for task and label", () => {
        // Task default for instance-segmentation: lists all models for the task (both class-agnostic and class-aware)
        const defaultModels = modelsForTaskAndLabel(models, "instance-segmentation", null);
        expect(defaultModels.map((m) => m.registry_key)).toEqual([
            "m2f-generic",
            "m2f-cell-specialist",
        ]);

        // Override for label 1 (cell): both class-agnostic and specialist predicting 1
        const cellModels = modelsForTaskAndLabel(models, "instance-segmentation", 1);
        expect(cellModels.map((m) => m.registry_key)).toEqual([
            "m2f-generic",
            "m2f-cell-specialist",
        ]);

        // Override for label 2 (nucleus): only class-agnostic m2f-generic
        const nucleusModels = modelsForTaskAndLabel(models, "instance-segmentation", 2);
        expect(nucleusModels.map((m) => m.registry_key)).toEqual(["m2f-generic"]);
    });

    it("renders all four task sections in canonical order and collapsed by default", () => {
        render(
            <ModelOrchestrationPanel
                datasetId={10}
                policy={null}
                labelsById={labelsById}
                catalog={{ models, retrieval_strategies: strategies }}
                onSavePolicy={jest.fn()}
                onDeletePolicy={jest.fn()}
            />
        );

        const buttons = screen.getAllByRole("button", { expanded: false });
        expect(buttons.length).toBeGreaterThanOrEqual(4);

        expect(screen.getByText("Prompted seg")).toBeInTheDocument();
        expect(screen.getByText("Within-image suggestion")).toBeInTheDocument();
        expect(screen.getByText("Instance segmentation")).toBeInTheDocument();
        expect(screen.getByText("Cross-image suggestion")).toBeInTheDocument();
    });

    it("initializes from an existing policy and displays saved bindings when expanded", () => {
        const policy = {
            dataset_id: 10,
            bindings: [
                {
                    task: "instance-segmentation",
                    label_id: null,
                    model_registry_key: "m2f-generic",
                    inputs: null,
                },
                {
                    task: "cross-image-suggestion",
                    label_id: 1,
                    model_registry_key: "sam3-cross",
                    inputs: { conditioning: { concept_text: "cell" }, parameters: { threshold: 0.7 } },
                },
            ],
            updated_by: "curator",
            created_at: "2026-08-24T10:00:00Z",
            updated_at: "2026-08-24T12:00:00Z",
        };

        render(
            <ModelOrchestrationPanel
                datasetId={10}
                policy={policy}
                labelsById={labelsById}
                catalog={{ models, retrieval_strategies: strategies }}
                onSavePolicy={jest.fn()}
                onDeletePolicy={jest.fn()}
            />
        );

        expect(screen.getByText("Last updated by")).toBeInTheDocument();
        expect(screen.getByText("curator")).toBeInTheDocument();

        // Expand Instance segmentation and Cross-image suggestion cards
        fireEvent.click(screen.getByRole("button", { name: /instance segmentation/i }));
        fireEvent.click(screen.getByRole("button", { name: /cross-image suggestion/i }));

        // Check selected models in dropdowns
        const defaultInstSelect = screen.getByLabelText("Default model for instance-segmentation");
        expect(defaultInstSelect.value).toBe("m2f-generic");

        const crossCellSelect = screen.getByLabelText("Model for cell (cross-image-suggestion)");
        expect(crossCellSelect.value).toBe("sam3-cross");
    });

    it("allows updating bindings and calls onSavePolicy with complete bindings list", async () => {
        const handleSave = jest.fn().mockResolvedValue({});

        render(
            <ModelOrchestrationPanel
                datasetId={10}
                policy={null}
                labelsById={labelsById}
                catalog={{ models, retrieval_strategies: strategies }}
                onSavePolicy={handleSave}
                onDeletePolicy={jest.fn()}
            />
        );

        // Expand Prompted segmentation card
        fireEvent.click(screen.getByRole("button", { name: /prompted seg/i }));

        // Select task default for prompted segmentation
        const promptedDefaultSelect = screen.getByLabelText("Default model for prompted-segmentation");
        fireEvent.change(promptedDefaultSelect, { target: { value: "sam2-prompted" } });

        // Save button should now be enabled
        const saveButton = screen.getByRole("button", { name: /save routing policy/i });
        expect(saveButton).not.toBeDisabled();

        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(handleSave).toHaveBeenCalledTimes(1);
        });

        const savedBindings = handleSave.mock.calls[0][0];
        expect(savedBindings).toHaveLength(1);
        expect(savedBindings[0].task).toBe("prompted-segmentation");
        expect(savedBindings[0].label_id).toBeNull();
        expect(savedBindings[0].model_registry_key).toBe("sam2-prompted");
    });

    it("renders warning for stale unavailable models when expanded", () => {
        const policyWithStale = {
            dataset_id: 10,
            bindings: [
                {
                    task: "instance-segmentation",
                    label_id: 1,
                    model_registry_key: "retired-legacy-model",
                    inputs: null,
                },
            ],
            updated_by: "curator",
            created_at: "2026-08-24T10:00:00Z",
            updated_at: "2026-08-24T12:00:00Z",
        };

        render(
            <ModelOrchestrationPanel
                datasetId={10}
                policy={policyWithStale}
                labelsById={labelsById}
                catalog={{ models, retrieval_strategies: strategies }}
                onSavePolicy={jest.fn()}
                onDeletePolicy={jest.fn()}
            />
        );

        // Expand Instance segmentation card
        fireEvent.click(screen.getByRole("button", { name: /instance segmentation/i }));

        expect(screen.getByText(/The previously saved model/)).toBeInTheDocument();
        expect(screen.getByText("retired-legacy-model")).toBeInTheDocument();
    });

    it("disables editing controls when canEdit is false", () => {
        render(
            <ModelOrchestrationPanel
                datasetId={10}
                policy={null}
                labelsById={labelsById}
                catalog={{ models, retrieval_strategies: strategies }}
                onSavePolicy={jest.fn()}
                onDeletePolicy={jest.fn()}
                canEdit={false}
            />
        );

        // Expand all task cards to inspect controls
        fireEvent.click(screen.getByRole("button", { name: /prompted seg/i }));
        fireEvent.click(screen.getByRole("button", { name: /within-image suggestion/i }));
        fireEvent.click(screen.getByRole("button", { name: /instance segmentation/i }));
        fireEvent.click(screen.getByRole("button", { name: /cross-image suggestion/i }));

        const selects = screen.getAllByRole("combobox");
        selects.forEach((select) => {
            expect(select).toBeDisabled();
        });

        const saveButton = screen.getByRole("button", { name: /saved|save routing policy/i });
        expect(saveButton).toBeDisabled();
    });
});
