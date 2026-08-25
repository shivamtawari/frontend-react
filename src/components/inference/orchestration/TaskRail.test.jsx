import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import TaskRail from "./TaskRail";

describe("TaskRail", () => {
  const mockCoverage = {
    categories: {
      interactive: { bound: 2, possible: 6, stale: 0 },
      instance: { bound: 3, possible: 3, stale: 0 },
      "cross-image": { bound: 1, possible: 3, stale: 1 },
    },
  };

  it("renders 3 category buttons with descriptions, counts, and interactive chips", () => {
    const handleSelectCategory = vi.fn();

    render(
      <TaskRail
        selectedCategory="interactive"
        onSelectCategory={handleSelectCategory}
        coverage={mockCoverage}
      />
    );

    const interactiveTab = screen.getByRole("tab", { name: /interactive segmentation/i });
    expect(interactiveTab).toHaveAttribute("aria-selected", "true");
    expect(interactiveTab).toHaveAttribute("aria-current", "true");

    // Check chips
    expect(screen.getByText("Prompted seg")).toBeInTheDocument();
    expect(screen.getByText("Within-image suggestion")).toBeInTheDocument();

    // Click another tab
    const instanceTab = screen.getByRole("tab", { name: /instance segmentation/i });
    fireEvent.click(instanceTab);
    expect(handleSelectCategory).toHaveBeenCalledWith("instance");
  });
});
