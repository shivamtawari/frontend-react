import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ConfigureRouteModal from "./ConfigureRouteModal";

describe("ConfigureRouteModal", () => {
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
      registry_key: "sam3-cross",
      name: "SAM 3 Cross Exemplar",
      task: "cross-image-suggestion",
      label_ids: [],
      provenance: "declared",
      trained_on_dataset: true,
      input_contract: {
        schema_version: 1,
        task: "cross-image-suggestion",
        conditioning: {
          kind: "concept_text",
          user_selectable_count: true,
          min_units: 1,
          max_units: 10,
          default_count: 3,
        },
        parameters: [
          {
            key: "threshold",
            label: "Detection threshold",
            type: "float",
            default_value: 0.5,
            min_value: 0.0,
            max_value: 1.0,
            step: 0.05,
          },
          {
            key: "multimask",
            label: "Multi-mask output",
            type: "bool",
            default_value: true,
          },
        ],
      },
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
      label_ids: [1], // only label 1
      provenance: "declared",
      trained_on_dataset: true,
    },
  ];

  const strategies = [
    { key: "global_scene", label: "Global Scene", available: true },
    {
      key: "dino_v2",
      label: "DINOv2 Embeddings",
      available: false,
      unavailable_reason: "Embeddings not computed",
    },
  ];

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <ConfigureRouteModal
        isOpen={false}
        onClose={vi.fn()}
        target={{ task: "prompted-segmentation", labelId: null }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders breadcrumb, target context, and compatible models for task default", () => {
    const handleClose = vi.fn();

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={handleClose}
        target={{ task: "instance-segmentation", labelId: null }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[]}
        canEdit={true}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Task Default")).toBeInTheDocument();
    expect(screen.getAllByText("Instance segmentation").length).toBeGreaterThanOrEqual(1);

    // Models for instance-segmentation default: m2f-generic and m2f-cell-specialist
    expect(screen.getByText("Mask2Former Generic")).toBeInTheDocument();
    expect(screen.getByText("Mask2Former Cell Specialist")).toBeInTheDocument();
  });

  it("renders parent name and inherited route context for child labels", () => {
    const defaultBinding = {
      task: "instance-segmentation",
      label_id: null,
      model_registry_key: "m2f-generic",
    };

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "instance-segmentation", labelId: 2 }} // child of label 1 (cell)
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[defaultBinding]}
        canEdit={true}
      />
    );

    // Parent name
    expect(screen.getByText("(child of cell)")).toBeInTheDocument();
    // Inherited route context
    expect(screen.getByText(/Currently inherits task default/)).toBeInTheDocument();
    expect(screen.getAllByText("Mask2Former Generic").length).toBeGreaterThanOrEqual(1);
  });

  it("filters out class-incompatible models for specific label overrides", () => {
    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "instance-segmentation", labelId: 2 }} // label 2 (nucleus)
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[]}
        canEdit={true}
      />
    );

    // Label 2 should see Mask2Former Generic, but NOT Mask2Former Cell Specialist (which only supports label 1)
    expect(screen.getByText("Mask2Former Generic")).toBeInTheDocument();
    expect(screen.queryByText("Mask2Former Cell Specialist")).not.toBeInTheDocument();
  });

  it("disables Save Route when existing binding is incompatible with label", () => {
    const incompatibleBinding = {
      task: "instance-segmentation",
      label_id: 2, // nucleus
      model_registry_key: "m2f-cell-specialist", // only covers [1]
      inputs: { conditioning: {}, parameters: {} },
    };

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "instance-segmentation", labelId: 2 }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[incompatibleBinding]}
        canEdit={true}
      />
    );

    expect(screen.getByText("Currently bound model is incompatible")).toBeInTheDocument();
    const saveBtn = screen.getByRole("button", { name: /save route/i });
    expect(saveBtn).toBeDisabled();
  });

  it("correctly saves numeric and boolean dynamic hyperparameter values", () => {
    const handleSaveRoute = vi.fn();
    const handleClose = vi.fn();

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={handleClose}
        target={{ task: "cross-image-suggestion", labelId: 1 }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[]}
        onSaveRoute={handleSaveRoute}
        canEdit={true}
      />
    );

    // Select model
    fireEvent.click(screen.getByRole("radio", { name: /SAM 3 Cross Exemplar/i }));

    // Change slider/number threshold parameter
    const thresholdInput = screen.getByLabelText("Detection threshold");
    fireEvent.change(thresholdInput, { target: { value: "0.85" } });

    // Toggle boolean checkbox parameter
    const multimaskCheckbox = screen.getByLabelText("Multi-mask output");
    fireEvent.click(multimaskCheckbox); // toggles from true to false

    const saveBtn = screen.getByRole("button", { name: /save route/i });
    fireEvent.click(saveBtn);

    expect(handleSaveRoute).toHaveBeenCalledWith(
      "cross-image-suggestion",
      1,
      expect.objectContaining({
        model_registry_key: "sam3-cross",
        inputs: expect.objectContaining({
          parameters: expect.objectContaining({
            threshold: 0.85,
            multimask: false,
          }),
        }),
      })
    );
  });

  it("enforces count clamping on Save Route", () => {
    const handleSaveRoute = vi.fn();

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "cross-image-suggestion", labelId: 1 }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[]}
        onSaveRoute={handleSaveRoute}
        canEdit={true}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: /SAM 3 Cross Exemplar/i }));

    // Set count to 999 (contract max is 10)
    const countInput = screen.getByRole("spinbutton");
    fireEvent.change(countInput, { target: { value: "999" } });

    fireEvent.click(screen.getByRole("button", { name: /save route/i }));

    expect(handleSaveRoute).toHaveBeenCalledWith(
      "cross-image-suggestion",
      1,
      expect.objectContaining({
        inputs: expect.objectContaining({
          conditioning: expect.objectContaining({
            count: 10, // clamped to max_units (10)
          }),
        }),
      })
    );
  });

  it("prompts before model switch and resets parameters upon confirmation", () => {
    const existingBinding = {
      task: "instance-segmentation",
      label_id: null,
      model_registry_key: "m2f-generic",
      inputs: { parameters: { custom_param: 42 } },
    };

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "instance-segmentation", labelId: null }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[existingBinding]}
        canEdit={true}
      />
    );

    // Switch to Mask2Former Cell Specialist
    fireEvent.click(screen.getByRole("radio", { name: /Mask2Former Cell Specialist/i }));

    // Should show switch confirmation
    expect(screen.getByText("Switch Model and Reset Parameters?")).toBeInTheDocument();

    // Confirm switch
    fireEvent.click(screen.getByRole("button", { name: /yes, switch model/i }));

    const specialistRadio = screen.getByRole("radio", { name: /Mask2Former Cell Specialist/i });
    expect(specialistRadio).toHaveAttribute("aria-checked", "true");
  });

  it("supports unbinding existing explicit routes", () => {
    const handleUnbindRoute = vi.fn();
    const handleClose = vi.fn();

    const existingBinding = {
      task: "instance-segmentation",
      label_id: 1,
      model_registry_key: "m2f-generic",
      inputs: { conditioning: {}, parameters: {} },
    };

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={handleClose}
        target={{ task: "instance-segmentation", labelId: 1 }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[existingBinding]}
        onUnbindRoute={handleUnbindRoute}
        canEdit={true}
      />
    );

    const unbindBtn = screen.getByRole("button", { name: /unbind route/i });
    expect(unbindBtn).toBeInTheDocument();

    fireEvent.click(unbindBtn);
    expect(handleUnbindRoute).toHaveBeenCalledWith("instance-segmentation", 1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("closes modal on Escape key or Cancel button without committing changes", () => {
    const handleSaveRoute = vi.fn();
    const handleClose = vi.fn();

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={handleClose}
        target={{ task: "prompted-segmentation", labelId: null }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[]}
        onSaveRoute={handleSaveRoute}
        canEdit={true}
      />
    );

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(handleSaveRoute).not.toHaveBeenCalled();

    // Test Escape key
    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it("disables editing and saving in read-only mode", () => {
    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "prompted-segmentation", labelId: null }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[]}
        canEdit={false}
      />
    );

    const radioOptions = screen.getAllByRole("radio");
    radioOptions.forEach((opt) => {
      expect(opt).toBeDisabled();
    });

    const saveBtn = screen.getByRole("button", { name: /save route/i });
    expect(saveBtn).toBeDisabled();
  });

  it("disables dynamic hyperparameter controls in read-only mode", () => {
    const existingBinding = {
      task: "cross-image-suggestion",
      label_id: 1,
      model_registry_key: "sam3-cross",
      inputs: { conditioning: { count: 3 }, parameters: { threshold: 0.5 } },
    };

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "cross-image-suggestion", labelId: 1 }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[existingBinding]}
        canEdit={false}
      />
    );

    const thresholdInput = screen.getByLabelText("Detection threshold");
    expect(thresholdInput).toBeDisabled();
  });

  it("switches model immediately without confirmation when inputs match declared defaults", () => {
    const existingBinding = {
      task: "instance-segmentation",
      label_id: null,
      model_registry_key: "m2f-generic",
      // exactly matches declared defaults (empty or default objects)
      inputs: { conditioning: {}, parameters: {} },
    };

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "instance-segmentation", labelId: null }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[existingBinding]}
        canEdit={true}
      />
    );

    // Switch to Mask2Former Cell Specialist
    fireEvent.click(screen.getByRole("radio", { name: /Mask2Former Cell Specialist/i }));

    // Should NOT show switch confirmation prompt
    expect(screen.queryByText("Switch Model and Reset Parameters?")).not.toBeInTheDocument();
    const specialistRadio = screen.getByRole("radio", { name: /Mask2Former Cell Specialist/i });
    expect(specialistRadio).toHaveAttribute("aria-checked", "true");
  });

  it("disables Save Route when model requires retrieval strategy but no strategies are available", () => {
    const retrievalModel = {
      registry_key: "retrieval-seg",
      name: "Retrieval Seg",
      task: "cross-image-suggestion",
      label_ids: [],
      input_contract: {
        schema_version: 1,
        task: "cross-image-suggestion",
        conditioning: {
          kind: "reference_images",
        },
        parameters: [],
      },
    };

    const unavailableStrategies = [
      { key: "dino_v2", label: "DINOv2", available: false, unavailable_reason: "Embeddings unavailable" },
    ];

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "cross-image-suggestion", labelId: null }}
        labelsById={labelsById}
        catalog={{ models: [retrievalModel], retrieval_strategies: unavailableStrategies }}
        draftBindings={[]}
        canEdit={true}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: /Retrieval Seg/i }));

    expect(
      screen.getByText(/no active retrieval strategies are currently available in the catalog/)
    ).toBeInTheDocument();

    const saveBtn = screen.getByRole("button", { name: /save route/i });
    expect(saveBtn).toBeDisabled();
  });

  it("falls back to declared default and clamps when numeric parameter is empty", () => {
    const handleSaveRoute = vi.fn();

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "cross-image-suggestion", labelId: 1 }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[]}
        onSaveRoute={handleSaveRoute}
        canEdit={true}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: /SAM 3 Cross Exemplar/i }));

    const thresholdInput = screen.getByLabelText("Detection threshold");
    fireEvent.change(thresholdInput, { target: { value: "" } }); // Clear input

    fireEvent.click(screen.getByRole("button", { name: /save route/i }));

    expect(handleSaveRoute).toHaveBeenCalledWith(
      "cross-image-suggestion",
      1,
      expect.objectContaining({
        inputs: expect.objectContaining({
          parameters: expect.objectContaining({
            threshold: 0.5, // falls back to default_value (0.5)
          }),
        }),
      })
    );
  });

  it("gates conditioning and parameters to declared contract only, saving inputs as null when undeclared", () => {
    const handleSaveRoute = vi.fn();

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "prompted-segmentation", labelId: null }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[]}
        onSaveRoute={handleSaveRoute}
        canEdit={true}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: /SAM 2 Prompted/i }));

    // Neither conditioning nor undeclared parameters should be rendered
    expect(screen.queryByLabelText(/Prompt concept/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Instances count|Images count|Exemplars count/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Mask threshold/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Min mask area/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/NMS IoU/i)).not.toBeInTheDocument();

    // Informational note is displayed
    expect(
      screen.getByText(/This model operates with its default runtime parameters and requires no additional input configuration/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save route/i }));

    expect(handleSaveRoute).toHaveBeenCalledWith(
      "prompted-segmentation",
      null,
      expect.objectContaining({
        model_registry_key: "sam2-prompted",
        inputs: null,
      })
    );
  });

  it("bounds presets strictly to contract min_units and max_units", () => {
    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "cross-image-suggestion", labelId: 1 }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[]}
        canEdit={true}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: /SAM 3 Cross Exemplar/i }));

    // Model contract declares min_units: 1, max_units: 10
    // Preset buttons 5 and 10 should be present; preset 20 must NOT be present
    expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "20" })).not.toBeInTheDocument();
  });

  it("persists displayed concept default (label name) without manual edit", () => {
    const handleSaveRoute = vi.fn();
    const existingBindingWithoutConceptText = {
      task: "cross-image-suggestion",
      label_id: 1, // "cell"
      model_registry_key: "sam3-cross",
      inputs: { conditioning: { count: 3 }, parameters: { threshold: 0.8 } },
    };

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "cross-image-suggestion", labelId: 1 }}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        draftBindings={[existingBindingWithoutConceptText]}
        onSaveRoute={handleSaveRoute}
        canEdit={true}
      />
    );

    // Save directly without typing into prompt concept
    fireEvent.click(screen.getByRole("button", { name: /save route/i }));

    expect(handleSaveRoute).toHaveBeenCalledWith(
      "cross-image-suggestion",
      1,
      expect.objectContaining({
        inputs: expect.objectContaining({
          conditioning: expect.objectContaining({
            concept_text: "cell",
            count: 3,
          }),
        }),
      })
    );
  });

  it("preserves unbounded count contracts (max_units: null) without numeric capping", () => {
    const handleSaveRoute = vi.fn();
    const unboundedModel = {
      registry_key: "sam-unbounded",
      name: "SAM Unbounded",
      task: "cross-image-suggestion",
      label_ids: [],
      input_contract: {
        schema_version: 1,
        task: "cross-image-suggestion",
        conditioning: {
          kind: "instances",
          user_selectable_count: true,
          min_units: 1,
          max_units: null, // unbounded!
          default_count: 5,
        },
        parameters: [],
      },
    };

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "cross-image-suggestion", labelId: 1 }}
        labelsById={labelsById}
        catalog={{ models: [unboundedModel], retrieval_strategies: strategies }}
        draftBindings={[]}
        onSaveRoute={handleSaveRoute}
        canEdit={true}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: /SAM Unbounded/i }));

    const countInput = screen.getByLabelText(/Instances count|Images count|Exemplars count/i);
    expect(countInput).not.toHaveAttribute("max");
    expect(screen.getByText("Contract allows min. 1.")).toBeInTheDocument();

    // Set count to 50 (above 32)
    fireEvent.change(countInput, { target: { value: 50 } });

    fireEvent.click(screen.getByRole("button", { name: /save route/i }));

    expect(handleSaveRoute).toHaveBeenCalledWith(
      "cross-image-suggestion",
      1,
      expect.objectContaining({
        inputs: expect.objectContaining({
          conditioning: expect.objectContaining({
            count: 50,
          }),
        }),
      })
    );
  });

  it("does not show contradictory default message when retrieval strategy is missing for cross-image", () => {
    const retrievalModel = {
      registry_key: "retrieval-seg",
      name: "Retrieval Seg",
      task: "cross-image-suggestion",
      label_ids: [],
      input_contract: {
        schema_version: 1,
        task: "cross-image-suggestion",
        conditioning: {
          kind: "reference_images",
        },
        parameters: [],
      },
    };

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "cross-image-suggestion", labelId: null }}
        labelsById={labelsById}
        catalog={{ models: [retrievalModel], retrieval_strategies: [] }}
        draftBindings={[]}
        canEdit={true}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: /Retrieval Seg/i }));

    // Warning must be displayed
    expect(
      screen.getByText(/This model requires exemplar retrieval conditioning, but no active retrieval strategies are currently available in the catalog/)
    ).toBeInTheDocument();

    // Contradictory message must NOT be displayed
    expect(
      screen.queryByText(/This model operates with its default runtime parameters and requires no additional input configuration/)
    ).not.toBeInTheDocument();
  });

  it("disambiguates multi-task models by canonical task when initializing existing bindings", () => {
    const multiTaskModels = [
      {
        registry_key: "sam3-universal",
        name: "SAM 3 (Prompted)",
        task: "prompted-segmentation",
        label_ids: [],
        input_contract: {
          schema_version: 1,
          task: "prompted-segmentation",
          conditioning: { kind: "none", user_selectable_count: false },
          parameters: [],
        },
      },
      {
        registry_key: "sam3-universal",
        name: "SAM 3 (Within-Image)",
        task: "instance-suggestion",
        label_ids: [],
        input_contract: {
          schema_version: 1,
          task: "instance-suggestion",
          conditioning: { kind: "instances", user_selectable_count: true, min_units: 1, max_units: 10 },
          parameters: [
            {
              key: "mask_threshold",
              label: "Mask Threshold",
              type: "float",
              default_value: 0.7,
            },
          ],
        },
      },
    ];

    const draftBindings = [
      {
        task: "instance-suggestion",
        label_id: 1,
        model_registry_key: "sam3-universal",
        inputs: {
          parameters: { mask_threshold: 0.85 },
        },
      },
    ];

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "instance-suggestion", labelId: 1 }}
        labelsById={labelsById}
        catalog={{ models: multiTaskModels, retrieval_strategies: [] }}
        draftBindings={draftBindings}
        canEdit={true}
      />
    );

    // Verifies it matched the instance-suggestion contract and rendered the mask_threshold parameter input
    expect(screen.getByLabelText(/Mask Threshold/i)).toHaveValue(0.85);
    expect(screen.getByText(/Instances count|Exemplars count/i)).toBeInTheDocument();
  });

  it("does not hydrate another task's contract when exact task model is missing", () => {
    const onlyPromptedModels = [
      {
        registry_key: "sam3-universal",
        name: "SAM 3 (Prompted Only)",
        task: "prompted-segmentation",
        label_ids: [],
        input_contract: {
          schema_version: 1,
          task: "prompted-segmentation",
          conditioning: { kind: "none", user_selectable_count: false },
          parameters: [],
        },
      },
    ];

    const draftBindings = [
      {
        task: "instance-suggestion",
        label_id: 1,
        model_registry_key: "sam3-universal",
      },
    ];

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "instance-suggestion", labelId: 1 }}
        labelsById={labelsById}
        catalog={{ models: onlyPromptedModels, retrieval_strategies: [] }}
        draftBindings={draftBindings}
        canEdit={true}
      />
    );

    // Because there is no instance-suggestion model for sam3-universal, it must be marked stale/unavailable
    expect(screen.getByText(/is no longer available in the active catalog/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Mask Threshold/i)).not.toBeInTheDocument();
  });

  it("permits saving within-image suggestion models when no retrieval strategies exist", () => {
    const withinImageModel = {
      registry_key: "sam3-within",
      name: "SAM 3 Within-Image",
      task: "instance-suggestion",
      label_ids: [],
      input_contract: {
        schema_version: 1,
        task: "instance-suggestion",
        conditioning: { kind: "instances", user_selectable_count: true, min_units: 1, max_units: 10 },
        parameters: [],
      },
    };

    const handleSave = vi.fn();

    render(
      <ConfigureRouteModal
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "instance-suggestion", labelId: 1 }}
        labelsById={labelsById}
        catalog={{ models: [withinImageModel], retrieval_strategies: [] }}
        draftBindings={[]}
        onSaveRoute={handleSave}
        canEdit={true}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: /SAM 3 Within-Image/i }));

    // Should NOT show retrieval strategy warning
    expect(
      screen.queryByText(/requires exemplar retrieval conditioning/i)
    ).not.toBeInTheDocument();

    // Save button should be enabled
    const saveBtn = screen.getByRole("button", { name: /Save Route/i });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    expect(handleSave).toHaveBeenCalledWith(
      "instance-suggestion",
      1,
      expect.objectContaining({
        model_registry_key: "sam3-within",
        task: "instance-suggestion",
      })
    );
  });
});
