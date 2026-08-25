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
        is_fine_tuned: true,
        input_contract: {
          parameters: [
            { key: "threshold", label: "Mask threshold", type: "float", min_value: 0, max_value: 1, default_value: 0.62 },
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
      },
    ],
    retrieval_strategies: [],
  };

  it("renders model list in Stage 1 and filters by search", () => {
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

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Search 2 compatible models/i);
    fireEvent.change(searchInput, { target: { value: "coral" } });

    expect(screen.getByText("Coral-FT v3")).toBeInTheDocument();
    expect(screen.queryByText("SAM 2.1 Small")).not.toBeInTheDocument();
  });

  it("transitions to Stage 2 when clicking configure and saves updated inputs", () => {
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
      })
    );
  });
});
