import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useLabelsHierarchy } from "./useLabelsHierarchy";
import * as labelsApi from "../api/labels";

vi.mock("../api/labels", () => ({
    fetchLabels: vi.fn(),
}));

describe("useLabelsHierarchy regression tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects late response from previous dataset when switching A -> B", async () => {
        let resolveA;
        const promiseA = new Promise((resolve) => {
            resolveA = resolve;
        });

        let resolveB;
        const promiseB = new Promise((resolve) => {
            resolveB = resolve;
        });

        labelsApi.fetchLabels.mockImplementation((datasetId) => {
            if (datasetId === 1) return promiseA;
            if (datasetId === 2) return promiseB;
            return Promise.resolve([]);
        });

        const datasetA = { id: 1, name: "Dataset A" };
        const datasetB = { id: 2, name: "Dataset B" };

        const { result, rerender } = renderHook(
            ({ shouldLoad, dataset }) => useLabelsHierarchy(shouldLoad, dataset),
            {
                initialProps: { shouldLoad: true, dataset: datasetA },
            }
        );

        expect(labelsApi.fetchLabels).toHaveBeenCalledWith(1);

        // Switch to dataset B before A resolves
        rerender({ shouldLoad: true, dataset: datasetB });
        expect(labelsApi.fetchLabels).toHaveBeenCalledWith(2);

        // Resolve B first
        await act(async () => {
            resolveB({
                labels: {
                    id_to_label_object: {
                        201: { id: 201, name: "Label B1", parent_id: null },
                    },
                },
            });
        });

        await waitFor(() => {
            expect(result.current.labelMap.has(201)).toBe(true);
        });

        // Now resolve A late
        await act(async () => {
            resolveA({
                labels: {
                    id_to_label_object: {
                        101: { id: 101, name: "Label A1", parent_id: null },
                    },
                },
            });
        });

        // After A resolves late, result.current.labelMap MUST NOT contain dataset A's labels!
        // It must still contain only dataset B's labels.
        expect(result.current.labelMap.has(101)).toBe(false);
        expect(result.current.labelMap.has(201)).toBe(true);
    });

    it("clears labelMap and labelHierarchy when switching datasets or when shouldLoad is false", async () => {
        labelsApi.fetchLabels.mockResolvedValueOnce({
            labels: {
                id_to_label_object: {
                    101: { id: 101, name: "Label A1", parent_id: null },
                },
            },
        });

        const datasetA = { id: 1, name: "Dataset A" };
        const datasetB = { id: 2, name: "Dataset B" };

        const { result, rerender } = renderHook(
            ({ shouldLoad, dataset }) => useLabelsHierarchy(shouldLoad, dataset),
            {
                initialProps: { shouldLoad: true, dataset: datasetA },
            }
        );

        await waitFor(() => {
            expect(result.current.labelMap.has(101)).toBe(true);
        });

        // Now switch to dataset B (with an in-flight promise that doesn't resolve yet)
        labelsApi.fetchLabels.mockReturnValueOnce(new Promise(() => {}));

        rerender({ shouldLoad: true, dataset: datasetB });

        // Stale labels from dataset A must not remain in labelMap while B is loading
        expect(result.current.labelMap.has(101)).toBe(false);
    });
});
