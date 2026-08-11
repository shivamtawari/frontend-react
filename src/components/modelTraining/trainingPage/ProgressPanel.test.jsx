import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ProgressPanel from "./ProgressPanel";

jest.mock("../../../hooks/useThemeColors", () => () => ({
  colors: { ln: "#000", ln2: "#000", t1: "#000", t2: "#000", t3: "#000", p2: "#000", ac: "#000" },
}));

describe("ProgressPanel queued training", () => {
  test("warns about a long queue wait and still lets the user cancel", () => {
    const onStop = jest.fn();
    render(
      <ProgressPanel
        snapshot={{
          state: "starting",
          start_time: new Date(Date.now() - 60_001).toISOString(),
          loss: [],
        }}
        onStop={onStop}
        isStopping={false}
      />,
    );

    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel queued training" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
