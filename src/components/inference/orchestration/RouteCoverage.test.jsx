import React from "react";
import { render, screen } from "@testing-library/react";
import RouteCoverage from "./RouteCoverage";

describe("RouteCoverage", () => {
  const mockCoverage = {
    overall: { bound: 3, possible: 12, stale: 1, percentage: 25 },
    categories: {
      interactive: { bound: 2, possible: 6, stale: 0, percentage: 33 },
      instance: { bound: 1, possible: 3, stale: 1, percentage: 33 },
      "cross-image": { bound: 0, possible: 3, stale: 0, percentage: 0 },
    },
  };

  it("renders overall count, degraded warning, and category progress segments", () => {
    render(<RouteCoverage coverage={mockCoverage} />);

    const strip = screen.getByTestId("route-coverage-strip");
    expect(strip).toHaveTextContent(/Route Coverage/i);
    expect(strip).toHaveTextContent("1 degraded");
    expect(strip).toHaveTextContent("3");
    expect(strip).toHaveTextContent("of 12 possible routes bound (25%)");

    // Check category segments
    expect(screen.getByText("Interactive segmentation")).toBeInTheDocument();
    expect(screen.getByText("Instance segmentation")).toBeInTheDocument();
    expect(screen.getByText("Cross-image suggestion")).toBeInTheDocument();

    expect(screen.getByTestId("coverage-segment-interactive")).toHaveTextContent("2/6");
    expect(screen.getByTestId("coverage-segment-instance")).toHaveTextContent("1/3");
    expect(screen.getByTestId("coverage-segment-cross-image")).toHaveTextContent("0/3");
  });

  it("shows Complete badge when 100% covered and 0 stale", () => {
    const fullCoverage = {
      overall: { bound: 12, possible: 12, stale: 0, percentage: 100 },
      categories: {
        interactive: { bound: 6, possible: 6, stale: 0, percentage: 100 },
        "batch-instance": { bound: 3, possible: 3, stale: 0, percentage: 100 },
        "cross-image": { bound: 3, possible: 3, stale: 0, percentage: 100 },
      },
    };

    render(<RouteCoverage coverage={fullCoverage} />);
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });
});
