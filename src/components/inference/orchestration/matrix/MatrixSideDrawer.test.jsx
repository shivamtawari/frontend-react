import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MatrixSideDrawer from "./MatrixSideDrawer";

describe("MatrixSideDrawer (Design B)", () => {
  const labelsById = {
    1: { id: 1, name: "Coral fragment", color: "#2dd4bf" },
  };

  const catalog = {
    models: [
      {
        registry_key: "coral-ft-v3",
        name: "Coral-FT v3",
        task: "prompted-segmentation",
        label_ids: [1],
        latency_badge: "fast",
        model_size: "38 MB",
        trained_on_dataset: true,
        input_contract: {
          parameters: [
            { key: "threshold", label: "Mask threshold", type: "float", min_value: 0, max_value: 1, step: 0.05, default_value: 0.62 },
            { key: "refine_edges", label: "Refine edges", type: "bool", default_value: true },
            { key: "quality", label: "Quality preset", type: "str", options: ["low", "medium", "high"], default_value: "high" },
          ],
        },
      },
      {
        registry_key: "sam21-small",
        name: "SAM 2.1 Small",
        task: "prompted-segmentation",
        label_ids: [],
        latency_badge: "balanced",
        model_size: "46 MB",
        trained_on_dataset: false,
      },
    ],
    retrieval_strategies: [],
  };

  it("renders model list in Stage 1 and filters by search, showing trained badge", () => {
    render(
      <MatrixSideDrawer
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "prompted-segmentation", labelId: 1 }}
        labelsById={labelsById}
        catalog={catalog}
        draftBindings={[]}
        onSaveRoute={vi.fn()}
        onUnbindRoute={vi.fn()}
      />
    );

    expect(screen.getByText("Bind a Model")).toBeInTheDocument();
    expect(screen.getByText("Coral fragment")).toBeInTheDocument();
    expect(screen.getByText("Coral-FT v3")).toBeInTheDocument();
    expect(screen.getByText("SAM 2.1 Small")).toBeInTheDocument();
    expect(screen.getByText("trained here")).toBeInTheDocument();
    expect(screen.getByText(/Leaving this cell unbound falls back to the task default/i)).toBeInTheDocument();

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Search 2 compatible models/i);
    fireEvent.change(searchInput, { target: { value: "coral" } });

    expect(screen.getByText("Coral-FT v3")).toBeInTheDocument();
    expect(screen.queryByText("SAM 2.1 Small")).not.toBeInTheDocument();
  });

  it("transitions to Stage 2 when clicking configure and renders contract hyperparameter inputs", () => {
    const handleSaveRoute = vi.fn();

    render(
      <MatrixSideDrawer
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "prompted-segmentation", labelId: 1 }}
        labelsById={labelsById}
        catalog={catalog}
        draftBindings={[]}
        onSaveRoute={handleSaveRoute}
        onUnbindRoute={vi.fn()}
      />
    );

    const configureBtns = screen.getAllByRole("button", { name: /configure/i });
    fireEvent.click(configureBtns[0]);

    // Stage 2 headers
    expect(screen.getByText(/models · INPUTS/i)).toBeInTheDocument();
    expect(screen.getByText("Mask threshold")).toBeInTheDocument();
    expect(screen.getByText("Refine edges")).toBeInTheDocument();
    expect(screen.getByText("Quality preset")).toBeInTheDocument();

    // Verify boolean checkbox
    const boolInput = screen.getByRole("checkbox", { name: /Refine edges/i });
    expect(boolInput).toBeChecked();
    fireEvent.click(boolInput);
    expect(boolInput).not.toBeChecked();

    // Verify select dropdown
    const selectDropdown = screen.getByRole("combobox", { name: /Quality preset/i });
    expect(selectDropdown).toHaveValue("high");
    fireEvent.change(selectDropdown, { target: { value: "medium" } });
    expect(selectDropdown).toHaveValue("medium");

    // Apply route
    const applyBtn = screen.getByRole("button", { name: /apply route/i });
    fireEvent.click(applyBtn);

    expect(handleSaveRoute).toHaveBeenCalledWith(
      "prompted-segmentation",
      1,
      expect.objectContaining({
        model_registry_key: "coral-ft-v3",
        task: "prompted-segmentation",
        label_id: 1,
        inputs: expect.objectContaining({
          parameters: expect.objectContaining({
            threshold: 0.62,
            refine_edges: false,
            quality: "medium",
          }),
        }),
      })
    );
  });

  it("renders canonical backend badges and handles Escape key press to close dialog", () => {
    const handleClose = vi.fn();
    const modelWithBadgesCatalog = {
      models: [
        {
          registry_key: "canonical-model",
          name: "Canonical Model",
          task: "prompted-segmentation",
          badges: ["fast inference", "120 MB", "GPU accelerated"],
          trained_on_dataset: true,
        },
      ],
      retrieval_strategies: [],
    };

    render(
      <MatrixSideDrawer
        isOpen={true}
        onClose={handleClose}
        target={{ task: "prompted-segmentation", labelId: 1 }}
        labelsById={labelsById}
        catalog={modelWithBadgesCatalog}
        draftBindings={[]}
        onSaveRoute={vi.fn()}
      />
    );

    // Verify dialog role and aria attributes
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "matrix-drawer-title");

    // Verify canonical badges
    expect(screen.getByText("fast inference")).toBeInTheDocument();
    expect(screen.getByText("120 MB")).toBeInTheDocument();
    expect(screen.getByText("GPU accelerated")).toBeInTheDocument();

    // Verify Escape key closes dialog
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("renders supported conditioning context and hides unsupported concept text", () => {
    const conditioningCatalog = {
      models: [
        {
          registry_key: "sam3-instances",
          name: "SAM 3 Instances",
          task: "instance-suggestion",
          input_contract: {
            conditioning: { kind: "instances", user_selectable_count: false, unit: "instance" },
          },
        },
        {
          registry_key: "sam3-cross",
          name: "SAM 3 Cross",
          task: "cross-image-suggestion",
          input_contract: {
            conditioning: { kind: "reference_images", user_selectable_count: true, unit: "image" },
          },
        },
        {
          registry_key: "clip-concept",
          name: "CLIP Concept",
          task: "instance-segmentation",
          input_contract: {
            conditioning: { kind: "concept_text" },
          },
        },
        {
          registry_key: "sam2-prompted",
          name: "SAM 2 Prompted",
          task: "prompted-segmentation",
          input_contract: {
            conditioning: { kind: "none" },
          },
        },
      ],
      retrieval_strategies: [{ key: "global_scene", label: "Global Scene", available: true }],
    };

    // 1. Within-image suggestion (SAM 3 Instances) -> Selected objects in this image, NO strategy selector
    const { rerender } = render(
      <MatrixSideDrawer
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "instance-suggestion", labelId: 1 }}
        labelsById={labelsById}
        catalog={conditioningCatalog}
        draftBindings={[]}
        onSaveRoute={vi.fn()}
      />
    );

    const configureBtns = screen.getAllByRole("button", { name: /configure/i });
    fireEvent.click(configureBtns[0]);

    expect(screen.getByText("Selected objects in this image")).toBeInTheDocument();
    expect(screen.queryByText("Prompt concept")).not.toBeInTheDocument();
    expect(screen.queryByText("Retrieval strategy")).not.toBeInTheDocument();
    expect(document.getElementById("matrix-drawer-title")).toHaveTextContent("SAM 3 Instances");

    // 2. Cross-image suggestion (SAM 3 Cross) -> Reference examples from other images & strategy selector & count buttons
    rerender(
      <MatrixSideDrawer
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "cross-image-suggestion", labelId: 1 }}
        labelsById={labelsById}
        catalog={conditioningCatalog}
        draftBindings={[]}
        onSaveRoute={vi.fn()}
      />
    );

    const crossConfigBtns = screen.getAllByRole("button", { name: /configure/i });
    fireEvent.click(crossConfigBtns[0]);

    expect(screen.getByText("Reference examples from other images")).toBeInTheDocument();
    expect(screen.getByText("Retrieval strategy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "20" })).toBeInTheDocument();

    // 3. Concept text is not exposed until a runtime task supports it end-to-end.
    rerender(
      <MatrixSideDrawer
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "instance-segmentation", labelId: 1 }}
        labelsById={labelsById}
        catalog={conditioningCatalog}
        draftBindings={[]}
        onSaveRoute={vi.fn()}
      />
    );

    const instConfigBtns = screen.getAllByRole("button", { name: /configure/i });
    fireEvent.click(instConfigBtns[0]); // clip-concept

    expect(screen.queryByText("Prompt concept")).not.toBeInTheDocument();
    expect(screen.queryByText("Conditioning")).not.toBeInTheDocument();

    // 4. Kind === none (SAM 2 Prompted) -> Conditioning section hidden
    rerender(
      <MatrixSideDrawer
        isOpen={true}
        onClose={vi.fn()}
        target={{ task: "prompted-segmentation", labelId: 1 }}
        labelsById={labelsById}
        catalog={conditioningCatalog}
        draftBindings={[]}
        onSaveRoute={vi.fn()}
      />
    );

    const promptConfigBtns = screen.getAllByRole("button", { name: /configure/i });
    fireEvent.click(promptConfigBtns[0]); // sam2-prompted

    expect(screen.queryByText("Conditioning")).not.toBeInTheDocument();
  });
});
