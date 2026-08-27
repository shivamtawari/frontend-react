import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ModelOrchestrationPanel, { modelsForTaskAndLabel } from "./ModelOrchestrationPanel";

describe("ModelOrchestrationPanel (Design B)", () => {
  const labelsById = {
    1: { id: 1, name: "Coral fragment", parent_id: null, color: "#2dd4bf" },
    2: { id: 2, name: "Coral polyp", parent_id: 1, color: "#c084fc" },
  };

  const models = [
    {
      registry_key: "sam21-small",
      name: "SAM 2.1 Small",
      task: "prompted-segmentation",
      label_ids: [],
      latency_badge: "balanced",
      trained_on_dataset: false,
    },
    {
      registry_key: "coral-ft-v3",
      name: "Coral-FT v3",
      task: "prompted-segmentation",
      label_ids: [1],
      latency_badge: "fast",
      trained_on_dataset: true,
      input_contract: {
        parameters: [
          { key: "threshold", label: "Mask threshold", type: "float", min_value: 0, max_value: 1, default_value: 0.62 },
        ],
      },
    },
    {
      registry_key: "mask-rcnn-coral",
      name: "Mask R-CNN coral",
      task: "instance-segmentation",
      label_ids: [1, 2],
      latency_badge: "accurate",
      trained_on_dataset: true,
    },
  ];

  const strategies = [];

  it("filters models correctly by task and label", () => {
    const defaultModels = modelsForTaskAndLabel(models, "prompted-segmentation", null);
    expect(defaultModels.map((m) => m.registry_key)).toEqual(["sam21-small", "coral-ft-v3"]);

    const label1Models = modelsForTaskAndLabel(models, "prompted-segmentation", 1);
    expect(label1Models.map((m) => m.registry_key)).toEqual(["sam21-small", "coral-ft-v3"]);

    const label2Models = modelsForTaskAndLabel(models, "prompted-segmentation", 2);
    expect(label2Models.map((m) => m.registry_key)).toEqual(["sam21-small"]);
  });

  it("renders top summary cards, matrix grid, and save bar", () => {
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

    // Top summary
    expect(screen.getByTestId("matrix-top-summary")).toBeInTheDocument();
    expect(screen.getAllByText("Interactive segmentation").length).toBeGreaterThan(0);

    // Matrix grid
    expect(screen.getByTestId("matrix-grid")).toBeInTheDocument();
    expect(screen.getByText("Task default")).toBeInTheDocument();
    expect(screen.getByText("Coral fragment")).toBeInTheDocument();
    expect(screen.getByText("Coral polyp")).toBeInTheDocument();

    // Save bar
    expect(screen.getByTestId("routing-save-bar")).toBeInTheDocument();
  });

  it("opens slide-over drawer when a cell is clicked and binds a model", async () => {
    const handleSavePolicy = vi.fn().mockResolvedValue({});

    render(
      <ModelOrchestrationPanel
        datasetId={10}
        policy={null}
        labelsById={labelsById}
        catalog={{ models, retrieval_strategies: strategies }}
        onSavePolicy={handleSavePolicy}
        onDeletePolicy={vi.fn()}
      />
    );

    // Click cell for Coral fragment under interactive segmentation
    const cell = screen.getByTestId("matrix-cell-prompted-segmentation-1");
    fireEvent.click(cell);

    // Drawer opens
    expect(screen.getByTestId("matrix-side-drawer")).toBeInTheDocument();
    expect(screen.getByText("Bind a Model")).toBeInTheDocument();

    // Select Coral-FT v3
    const modelCard = screen.getByText("Coral-FT v3");
    fireEvent.click(modelCard);

    // Click save route
    const saveRouteBtn = screen.getByRole("button", { name: /save route/i });
    fireEvent.click(saveRouteBtn);

    // Drawer closes and cell shows Coral-FT v3
    expect(screen.queryByTestId("matrix-side-drawer")).not.toBeInTheDocument();
    expect(screen.getByText("Coral-FT v3")).toBeInTheDocument();

    // Save bar shows unsaved change
    const savePolicyBtn = screen.getByRole("button", { name: /save routing policy/i });
    expect(savePolicyBtn).not.toBeDisabled();

    fireEvent.click(savePolicyBtn);

    await waitFor(() => {
      expect(handleSavePolicy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            task: "prompted-segmentation",
            label_id: 1,
            model_registry_key: "coral-ft-v3",
          }),
        ])
      );
    });
  });
});
