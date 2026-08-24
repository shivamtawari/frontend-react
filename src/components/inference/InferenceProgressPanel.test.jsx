import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import InferenceProgressPanel from "./InferenceProgressPanel";

vi.mock("../../api/inference", () => ({
    getInferenceJobItems: vi.fn().mockResolvedValue([]),
}));

describe("InferenceProgressPanel Load into Planner action", () => {
    const baseJob = {
        id: 101,
        dataset_id: 1,
        name: "test_run",
        total_units: 10,
        done_units: 10,
        failed_units: 0,
        contours_created: 5,
        status: "succeeded",
        plan_steps: [{ label_id: 1, model_registry_key: "m2f" }],
        options: {},
    };

    it("renders 'Load into Planner' button for terminal statuses and calls onLoadIntoPlanner", () => {
        const terminalStatuses = ["succeeded", "partial", "failed", "cancelled"];

        terminalStatuses.forEach((status) => {
            const onLoadIntoPlanner = vi.fn();
            const job = { ...baseJob, status };
            const { unmount } = render(
                <InferenceProgressPanel
                    job={job}
                    onLoadIntoPlanner={onLoadIntoPlanner}
                />
            );

            const loadButton = screen.getByRole("button", { name: /load into planner/i });
            expect(loadButton).toBeInTheDocument();

            fireEvent.click(loadButton);
            expect(onLoadIntoPlanner).toHaveBeenCalledWith(job);

            unmount();
        });
    });

    it("does NOT render 'Load into Planner' button for active in-flight statuses", () => {
        const activeStatuses = ["pending", "running", "cancelling"];

        activeStatuses.forEach((status) => {
            const onLoadIntoPlanner = vi.fn();
            const job = { ...baseJob, status };
            const { unmount } = render(
                <InferenceProgressPanel
                    job={job}
                    onLoadIntoPlanner={onLoadIntoPlanner}
                />
            );

            expect(screen.queryByRole("button", { name: /load into planner/i })).not.toBeInTheDocument();

            unmount();
        });
    });

    it("allows force stop while a run is cancelling", () => {
        const onCancel = vi.fn();
        const job = { ...baseJob, status: "cancelling" };
        render(
            <InferenceProgressPanel
                job={job}
                onCancel={onCancel}
                isCancelling={false}
            />
        );

        const stopButton = screen.getByRole("button", { name: /force stop/i });
        expect(stopButton).toBeInTheDocument();
        expect(stopButton).not.toBeDisabled();
        fireEvent.click(stopButton);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("renders 'Remove from history' for non-running statuses and hides it while running", () => {
        const allowedStatuses = ["pending", "cancelling", "succeeded", "partial", "failed", "cancelled"];
        allowedStatuses.forEach((status) => {
            const onDelete = vi.fn();
            const job = { ...baseJob, status };
            const { unmount } = render(
                <InferenceProgressPanel
                    job={job}
                    onDelete={onDelete}
                />
            );

            const deleteButton = screen.getByRole("button", { name: /remove from history/i });
            expect(deleteButton).toBeInTheDocument();
            fireEvent.click(deleteButton);
            expect(onDelete).toHaveBeenCalled();
            unmount();
        });

        // Running status blocks deletion
        const { unmount } = render(
            <InferenceProgressPanel
                job={{ ...baseJob, status: "running" }}
                onDelete={vi.fn()}
            />
        );
        expect(screen.queryByRole("button", { name: /remove from history/i })).not.toBeInTheDocument();
        unmount();
    });
});
