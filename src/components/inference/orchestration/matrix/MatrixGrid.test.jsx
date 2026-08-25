import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MatrixGrid from "./MatrixGrid";

describe("MatrixGrid (Design B)", () => {
  const labelsById = {
    1: { id: 1, name: "Coral fragment", parent_id: null, color: "#2dd4bf", instance_count: 412 },
    2: { id: 2, name: "Coral polyp", parent_id: 1, color: "#c084fc", instance_count: 85 },
  };

  const catalog = {
    models: [
      {
        registry_key: "sam21-small",
        name: "SAM 2.1 Small",
        task: "prompted-segmentation",
        label_ids: [],
        latency_badge: "balanced",
        is_fine_tuned: false,
      },
      {
        registry_key: "coral-ft-v3",
        name: "Coral-FT v3",
        task: "prompted-segmentation",
        label_ids: [1],
        latency_badge: "fast",
        is_fine_tuned: true,
      },
      {
        registry_key: "mask-rcnn-coral",
        name: "Mask R-CNN coral",
        task: "instance-segmentation",
        label_ids: [1, 2],
        latency_badge: "accurate",
        is_fine_tuned: true,
      },
    ],
    retrieval_strategies: [],
  };

  const draftBindings = [
    { task: "prompted-segmentation", label_id: null, model_registry_key: "sam21-small" },
    { task: "prompted-segmentation", label_id: 1, model_registry_key: "coral-ft-v3" },
    { task: "instance-segmentation", label_id: null, model_registry_key: "mask-rcnn-coral" },
  ];

  it("renders task default row and hierarchical label rows with tree indentation", () => {
    render(
      <MatrixGrid
        labelsById={labelsById}
        catalog={catalog}
        draftBindings={draftBindings}
        onSelectCell={vi.fn()}
      />
    );

    // Headers
    expect(screen.getByText("Interactive segmentation")).toBeInTheDocument();
    expect(screen.getByText("Instance segmentation")).toBeInTheDocument();
    expect(screen.getByText("Cross-image suggestion")).toBeInTheDocument();

    // Task default row
    expect(screen.getByText("Task default")).toBeInTheDocument();

    // Labels
    expect(screen.getByText("Coral fragment")).toBeInTheDocument();
    expect(screen.getByText("Coral polyp")).toBeInTheDocument();

    // Model cells
    expect(screen.getByText("Coral-FT v3")).toBeInTheDocument();
    expect(screen.getByText("Inherits SAM 2.1 Small")).toBeInTheDocument();
    expect(screen.getAllByText("Inherits Mask R-CNN coral")).toHaveLength(2);
  });

  it("calls onSelectCell with correct task and labelId when a cell is clicked", () => {
    const handleSelectCell = vi.fn();

    render(
      <MatrixGrid
        labelsById={labelsById}
        catalog={catalog}
        draftBindings={draftBindings}
        onSelectCell={handleSelectCell}
      />
    );

    const cell = screen.getByTestId("matrix-cell-prompted-segmentation-1");
    fireEvent.click(cell);

    expect(handleSelectCell).toHaveBeenCalledWith("prompted-segmentation", 1);
  });

  it("calls onSelectCell for task default cell when clicked", () => {
    const handleSelectCell = vi.fn();

    render(
      <MatrixGrid
        labelsById={labelsById}
        catalog={catalog}
        draftBindings={draftBindings}
        onSelectCell={handleSelectCell}
      />
    );

    const cell = screen.getByTestId("matrix-cell-instance-segmentation-default");
    fireEvent.click(cell);

    expect(handleSelectCell).toHaveBeenCalledWith("instance-segmentation", null);
  });
});
