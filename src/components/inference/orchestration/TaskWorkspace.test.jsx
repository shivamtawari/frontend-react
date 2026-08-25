import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import TaskWorkspace from "./TaskWorkspace";
import { ORCHESTRATION_CATEGORIES } from "./orchestrationViewModel";

describe("TaskWorkspace", () => {
  const labelsById = {
    1: { id: 1, name: "cell", parent_id: null },
    2: { id: 2, name: "nucleus", parent_id: 1 },
  };

  const catalog = {
    models: [
      {
        registry_key: "sam2-prompted",
        name: "SAM 2 Prompted",
        task: "prompted-segmentation",
        label_ids: [],
      },
      {
        registry_key: "sam3-intra",
        name: "SAM 3 Intra",
        task: "instance-suggestion",
        label_ids: [],
      },
    ],
    retrieval_strategies: [],
  };

  it("renders sub-route switcher for interactive category, mapping rows, and override count", () => {
    const handleSelectInteractiveTask = vi.fn();
    const handleConfigure = vi.fn();

    render(
      <TaskWorkspace
        category={ORCHESTRATION_CATEGORIES[0]}
        selectedInteractiveTask="prompted-segmentation"
        onSelectInteractiveTask={handleSelectInteractiveTask}
        draftBindings={[]}
        labelsById={labelsById}
        catalog={catalog}
        onConfigure={handleConfigure}
        canEdit={true}
      />
    );

    // Switcher buttons
    const promptedBtn = screen.getByRole("button", { name: "Prompted seg" });
    const withinImgBtn = screen.getByRole("button", { name: "Within-image suggestion" });
    expect(promptedBtn).toHaveAttribute("aria-pressed", "true");
    expect(withinImgBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(withinImgBtn);
    expect(handleSelectInteractiveTask).toHaveBeenCalledWith("instance-suggestion");

    // Task default
    expect(screen.getByText("Task Default Route")).toBeInTheDocument();

    // Override count
    expect(screen.getByText("0 overrides / 2 labels")).toBeInTheDocument();

    // Labels
    expect(screen.getByText("cell")).toBeInTheDocument();
    expect(screen.getByText("nucleus")).toBeInTheDocument();
    expect(screen.getByText("child of cell")).toBeInTheDocument();
  });

  it("renders factual empty message when dataset has no labels", () => {
    render(
      <TaskWorkspace
        category={ORCHESTRATION_CATEGORIES[0]}
        selectedInteractiveTask="prompted-segmentation"
        draftBindings={[]}
        labelsById={{}}
        catalog={catalog}
      />
    );

    expect(
      screen.getByText("No dataset labels exist; only the task default route can be configured.")
    ).toBeInTheDocument();
    expect(screen.getByText("0 overrides / 0 labels")).toBeInTheDocument();
  });
});
