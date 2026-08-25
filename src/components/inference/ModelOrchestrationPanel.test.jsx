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
      badges: ["Fast"],
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

  it("renders coverage strip, 3-card task rail, and initial workspace", () => {
    render(
      <ModelOrchestrationPanel
        datasetId={10}
        policy={null}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        onSavePolicy={vi.fn()}
        onDeletePolicy={vi.fn()}
      />
    );

    // Coverage strip
    const coverageStrip = screen.getByTestId("route-coverage-strip");
    expect(coverageStrip).toBeInTheDocument();
    expect(coverageStrip).toHaveTextContent(/Route Coverage/i);
    expect(coverageStrip).toHaveTextContent("0");
    expect(coverageStrip).toHaveTextContent("of 12 possible routes bound (0%)");

    // 3 category rail tabs
    expect(screen.getByRole("tab", { name: /interactive segmentation/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /instance segmentation/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /cross-image suggestion/i })).toBeInTheDocument();

    // Active workspace default is interactive
    expect(screen.getByTestId("task-workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prompted seg" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Within-image suggestion" })).toBeInTheDocument();
  });

  it("allows switching categories and interactive sub-routes", () => {
    render(
      <ModelOrchestrationPanel
        datasetId={10}
        policy={null}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        onSavePolicy={vi.fn()}
        onDeletePolicy={vi.fn()}
      />
    );

    // Switch to instance segmentation
    const instanceTab = screen.getByRole("tab", { name: /instance segmentation/i });
    fireEvent.click(instanceTab);
    expect(instanceTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("route-card-instance-segmentation-default")).toBeInTheDocument();

    // Switch to cross-image suggestion
    const crossTab = screen.getByRole("tab", { name: /cross-image suggestion/i });
    fireEvent.click(crossTab);
    expect(crossTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("route-card-cross-image-suggestion-default")).toBeInTheDocument();

    // Switch back to interactive and toggle sub-route
    const interactiveTab = screen.getByRole("tab", { name: /interactive segmentation/i });
    fireEvent.click(interactiveTab);

    const withinImageBtn = screen.getByRole("button", { name: "Within-image suggestion" });
    fireEvent.click(withinImageBtn);
    expect(withinImageBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("route-card-instance-suggestion-default")).toBeInTheDocument();
  });

  it("displays explicit, inherited, and stale routes from policy", () => {
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
          task: "instance-segmentation",
          label_id: 1,
          model_registry_key: "m2f-cell-specialist",
          inputs: null,
        },
        {
          task: "instance-segmentation",
          label_id: 2,
          model_registry_key: "stale-retired-model",
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
        policy={policy}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        onSavePolicy={vi.fn()}
        onDeletePolicy={vi.fn()}
      />
    );

    // Switch to Instance Segmentation category
    fireEvent.click(screen.getByRole("tab", { name: /instance segmentation/i }));

    // Task default: Mask2Former Generic
    const defaultCard = screen.getByTestId("route-card-instance-segmentation-default");
    expect(defaultCard).toHaveTextContent("Mask2Former Generic");

    // Label 1 (cell): Mask2Former Cell Specialist (Fine-tuned)
    const cellCard = screen.getByTestId("route-card-instance-segmentation-1");
    expect(cellCard).toHaveTextContent("Mask2Former Cell Specialist");
    expect(cellCard).toHaveTextContent("Fine-tuned");

    // Label 2 (nucleus): Stale degraded model
    const nucleusCard = screen.getByTestId("route-card-instance-segmentation-2");
    expect(nucleusCard).toHaveTextContent("stale-retired-model");
    expect(nucleusCard).toHaveTextContent("Degraded / Unavailable");
  });

  it("shows inherited route when class-agnostic default is set and no label override exists", () => {
    const policy = {
      dataset_id: 10,
      bindings: [
        {
          task: "instance-segmentation",
          label_id: null,
          model_registry_key: "m2f-generic",
          inputs: null,
        },
      ],
    };

    render(
      <ModelOrchestrationPanel
        datasetId={10}
        policy={policy}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        onSavePolicy={vi.fn()}
        onDeletePolicy={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: /instance segmentation/i }));

    // Both label 1 and label 2 should inherit from m2f-generic
    const cellCard = screen.getByTestId("route-card-instance-segmentation-1");
    expect(cellCard).toHaveTextContent("Mask2Former Generic");
    expect(cellCard).toHaveTextContent("Inherits default");

    const nucleusCard = screen.getByTestId("route-card-instance-segmentation-2");
    expect(nucleusCard).toHaveTextContent("Mask2Former Generic");
    expect(nucleusCard).toHaveTextContent("Inherits default");
  });

  it("shows incompatible default warning when default model does not cover the label", () => {
    const policy = {
      dataset_id: 10,
      bindings: [
        {
          task: "instance-segmentation",
          label_id: null,
          model_registry_key: "m2f-cell-specialist", // only covers [1]
          inputs: null,
        },
      ],
    };

    render(
      <ModelOrchestrationPanel
        datasetId={10}
        policy={policy}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        onSavePolicy={vi.fn()}
        onDeletePolicy={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: /instance segmentation/i }));

    // Label 1 (cell) inherits specialist
    const cellCard = screen.getByTestId("route-card-instance-segmentation-1");
    expect(cellCard).toHaveTextContent("Mask2Former Cell Specialist");
    expect(cellCard).toHaveTextContent("Inherits default");

    // Label 2 (nucleus) is incompatible with specialist default
    const nucleusCard = screen.getByTestId("route-card-instance-segmentation-2");
    expect(nucleusCard).toHaveTextContent("Unbound — task default does not cover this class");
  });

  it("renders read-only view details mode when canEdit is false", () => {
    render(
      <ModelOrchestrationPanel
        datasetId={10}
        policy={null}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        onSavePolicy={vi.fn()}
        onDeletePolicy={vi.fn()}
        canEdit={false}
      />
    );

    const viewDetailsBtns = screen.getAllByRole("button", { name: /view details/i });
    expect(viewDetailsBtns.length).toBeGreaterThan(0);

    expect(screen.getByText("Read-only mode")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save routing policy/i })).not.toBeInTheDocument();
  });

  it("handles full save workflow: open modal -> select model -> save route -> save routing policy", async () => {
    const handleSavePolicy = vi.fn().mockResolvedValue({ id: 10, bindings: [] });

    render(
      <ModelOrchestrationPanel
        datasetId={10}
        policy={null}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        onSavePolicy={handleSavePolicy}
        onDeletePolicy={vi.fn()}
        canEdit={true}
      />
    );

    // Click "Bind Model" on task default for prompted-segmentation
    const bindBtn = screen.getByRole("button", { name: /bind model to task default/i });
    fireEvent.click(bindBtn);

    // Modal opens
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Select SAM 2 Prompted
    const sam2Option = screen.getByRole("radio", { name: /SAM 2 Prompted/i });
    fireEvent.click(sam2Option);

    // Click "Save Route" in modal
    const saveRouteBtn = screen.getByRole("button", { name: /^save route$/i });
    fireEvent.click(saveRouteBtn);

    // Modal closes and Save Bar shows dirty state
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();
    expect(screen.getByText(/Bound SAM 2 Prompted to Prompted default/i)).toBeInTheDocument();

    // Click "Save Routing Policy" on the save bar
    const savePolicyBtn = screen.getByRole("button", { name: /save routing policy/i });
    fireEvent.click(savePolicyBtn);

    await waitFor(() => {
      expect(handleSavePolicy).toHaveBeenCalledTimes(1);
    });

    expect(handleSavePolicy).toHaveBeenCalledWith([
      expect.objectContaining({
        task: "prompted-segmentation",
        label_id: null,
        model_registry_key: "sam2-prompted",
      }),
    ]);
  });

  it("handles save failure gracefully and displays backend error message", async () => {
    const handleSavePolicy = vi.fn().mockRejectedValue(new Error("Database connection error"));

    render(
      <ModelOrchestrationPanel
        datasetId={10}
        policy={null}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        onSavePolicy={handleSavePolicy}
        onDeletePolicy={vi.fn()}
        canEdit={true}
      />
    );

    // Open modal and bind SAM 2
    fireEvent.click(screen.getByRole("button", { name: /bind model to task default/i }));
    fireEvent.click(screen.getByRole("radio", { name: /SAM 2 Prompted/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save route$/i }));

    // Click save
    const savePolicyBtn = screen.getByRole("button", { name: /save routing policy/i });
    fireEvent.click(savePolicyBtn);

    await waitFor(() => {
      expect(screen.getByText("Database connection error")).toBeInTheDocument();
    });
  });

  it("resets dirty changes back to initial canonical policy", async () => {
    const policy = {
      dataset_id: 10,
      bindings: [
        {
          task: "prompted-segmentation",
          label_id: null,
          model_registry_key: "sam2-prompted",
        },
      ],
    };

    render(
      <ModelOrchestrationPanel
        datasetId={10}
        policy={policy}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        onSavePolicy={vi.fn()}
        onDeletePolicy={vi.fn()}
        canEdit={true}
      />
    );

    // Configure label 1 override to create dirty state
    fireEvent.click(screen.getByRole("button", { name: /bind model to cell/i }));
    fireEvent.click(screen.getByRole("radio", { name: /SAM 2 Prompted/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save route$/i }));

    expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();

    // Click Reset Changes
    const resetBtn = screen.getByRole("button", { name: /reset changes/i });
    fireEvent.click(resetBtn);

    // Changes reset, dirty bar cleans up
    expect(screen.queryByText(/unsaved change/i)).not.toBeInTheDocument();
  });

  it("handles single-step clear policy without duplicate window.confirm", async () => {
    const handleDeletePolicy = vi.fn().mockResolvedValue(true);
    const policy = {
      dataset_id: 10,
      bindings: [
        {
          task: "prompted-segmentation",
          label_id: null,
          model_registry_key: "sam2-prompted",
        },
      ],
    };

    render(
      <ModelOrchestrationPanel
        datasetId={10}
        policy={policy}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        onSavePolicy={vi.fn()}
        onDeletePolicy={handleDeletePolicy}
        canEdit={true}
      />
    );

    // Click Clear Policy
    const clearBtn = screen.getByRole("button", { name: /clear policy/i });
    fireEvent.click(clearBtn);

    // Save bar shows inline confirm
    expect(screen.getByText("Clear all custom routes?")).toBeInTheDocument();

    // Confirm clear
    const confirmBtn = screen.getByRole("button", { name: /yes, clear/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleDeletePolicy).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText("Routing policy cleared.")).toBeInTheDocument();
    });
  });
});
