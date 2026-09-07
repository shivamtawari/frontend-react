import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LabelsTab from "./LabelsTab";
import * as DatasetContext from "../../../contexts/DatasetContext";
import * as ToastContext from "../../../contexts/ToastContext";
import * as annotationSelectors from "../../../stores/selectors/annotationSelectors";
import * as labelsApi from "../../../api/labels";
import useAnnotationStore from "../../../stores/useAnnotationStore";

vi.mock("../../../api/labels", () => ({
    createLabel: vi.fn(),
    fetchLabels: vi.fn(),
}));

describe("LabelsTab taxonomy rendering and interactions", () => {
    const setActiveLabelId = vi.fn();
    const setDatasetLabels = vi.fn();
    const toggleVisibility = vi.fn();
    const addToast = vi.fn();

    const mockLabels = [
        { id: 1, name: "Coral", color: "#FF0000", parent_id: null },
        { id: 2, name: "Bleached", color: "#00FF00", parent_id: null },
    ];

    beforeEach(() => {
        vi.clearAllMocks();

        vi.spyOn(DatasetContext, "useDataset").mockReturnValue({
            currentDataset: { id: 10, name: "Test Dataset" },
        });
        vi.spyOn(ToastContext, "useToast").mockReturnValue({ addToast });

        vi.spyOn(annotationSelectors, "useDatasetLabels").mockReturnValue(mockLabels);
        vi.spyOn(annotationSelectors, "useSetDatasetLabels").mockReturnValue(setDatasetLabels);
        vi.spyOn(annotationSelectors, "useLabelDatasetGeneration").mockReturnValue(1);
        vi.spyOn(annotationSelectors, "useObjectsList").mockReturnValue([
            { id: 100, labelId: 1 },
            { id: 101, labelId: 1 },
        ]);
        vi.spyOn(annotationSelectors, "useObjectsVisibility").mockReturnValue({ labels: { 1: true, 2: false } });
        vi.spyOn(annotationSelectors, "useToggleVisibility").mockReturnValue(toggleVisibility);
        vi.spyOn(annotationSelectors, "useActiveLabelId").mockReturnValue(1);
        vi.spyOn(annotationSelectors, "useSetActiveLabelId").mockReturnValue(setActiveLabelId);
        vi.spyOn(annotationSelectors, "useLabelColorOverrides").mockReturnValue({});
        vi.spyOn(annotationSelectors, "useSetLabelColorOverride").mockReturnValue(vi.fn());
    });

    it("renders label rows with counts and active badge", () => {
        render(<LabelsTab />);

        expect(screen.getAllByText("Coral").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Bleached")).toBeInTheDocument();
        expect(screen.getByText("ACTIVE")).toBeInTheDocument();
        expect(screen.getByText("2")).toBeInTheDocument(); // count for Coral
    });

    it("clicking a label arms it as active label", () => {
        render(<LabelsTab />);

        fireEvent.click(screen.getByText("Bleached"));
        expect(setActiveLabelId).toHaveBeenCalledWith(2);
    });

    it("clicking visibility button toggles class visibility", () => {
        render(<LabelsTab />);

        const hideButton = screen.getByRole("button", { name: "Hide Coral" });
        fireEvent.click(hideButton);
        expect(toggleVisibility).toHaveBeenCalledWith(1);
    });

    it("creates a new label and displays success toast", async () => {
        labelsApi.createLabel.mockResolvedValue({ id: 3, name: "Algae" });
        labelsApi.fetchLabels.mockResolvedValue({
            labels: {
                id_to_label_object: {
                    1: { id: 1, name: "Coral" },
                    2: { id: 2, name: "Bleached" },
                    3: { id: 3, name: "Algae" },
                },
            },
        });

        render(<LabelsTab />);

        const newLabelBtn = screen.getByRole("button", { name: "New label" });
        fireEvent.click(newLabelBtn);

        const input = screen.getByPlaceholderText("Label name");
        expect(input).toBeInTheDocument();

        fireEvent.change(input, { target: { value: "Algae" } });
        expect(input.value).toBe("Algae");

        const addBtn = screen.getByRole("button", { name: "Add" });
        fireEvent.click(addBtn);

        await waitFor(() => {
            expect(labelsApi.createLabel).toHaveBeenCalledWith(
                { name: "Algae", parent_id: null },
                10
            );
            expect(setDatasetLabels).toHaveBeenCalledWith(
                expect.any(Array),
                expect.any(Map),
                10,
                1
            );
            expect(addToast).toHaveBeenCalledWith({
                type: "success",
                message: "Label “Algae” created.",
            });
        });
    });

    it("rejects delayed label-creation refresh across an A -> B -> A transition and preserves fresh A2 labels", async () => {
        const datasetA = { id: 1, name: "Dataset A" };

        let datasetContextVal = {
            currentDataset: datasetA,
        };
        vi.spyOn(DatasetContext, "useDataset").mockImplementation(() => datasetContextVal);

        // Reset store and activate Dataset A (generation 1)
        useAnnotationStore.setState((state) => {
            state.objects = {
                list: [],
                selected: [],
                labelDatasetId: null,
                labelDatasetGeneration: 0,
                datasetLabels: [{ id: 10, name: "Coral A" }],
                datasetLabelsMap: new Map([[10, "Coral A"]]),
                visibility: { labels: {}, rootLabelIds: [] },
                colors: {},
            };
            state.workspace = {
                activeLabelId: null,
                labelColorOverrides: {},
                picker: null,
            };
        });
        useAnnotationStore.getState().activateLabelDataset(1);
        const gen1 = useAnnotationStore.getState().objects.labelDatasetGeneration;

        // Restore real store selectors for this test
        vi.spyOn(annotationSelectors, "useDatasetLabels").mockImplementation(() => useAnnotationStore.getState().objects.datasetLabels);
        vi.spyOn(annotationSelectors, "useSetDatasetLabels").mockImplementation(() => useAnnotationStore.getState().setDatasetLabels);
        vi.spyOn(annotationSelectors, "useLabelDatasetGeneration").mockImplementation(() => useAnnotationStore.getState().objects.labelDatasetGeneration);

        let resolveRefreshA1;
        const promiseRefreshA1 = new Promise((resolve) => {
            resolveRefreshA1 = resolve;
        });

        labelsApi.createLabel.mockResolvedValue({ id: 11, name: "New Algae" });
        labelsApi.fetchLabels.mockReturnValue(promiseRefreshA1);

        render(<LabelsTab />);

        // Start label creation on A1
        const newLabelBtn = screen.getByRole("button", { name: "New label" });
        fireEvent.click(newLabelBtn);
        const input = screen.getByPlaceholderText("Label name");
        fireEvent.change(input, { target: { value: "New Algae" } });
        const addBtn = screen.getByRole("button", { name: "Add" });
        fireEvent.click(addBtn);

        // createLabel is awaited, and then fetchLabels(1) is deferred
        await waitFor(() => {
            expect(labelsApi.createLabel).toHaveBeenCalledWith(
                { name: "New Algae", parent_id: null },
                1
            );
        });

        // While fetchLabels(1) for A1 is pending, transition A -> B -> A
        useAnnotationStore.getState().activateLabelDataset(2); // to B (gen 2)
        useAnnotationStore.getState().activateLabelDataset(1); // back to A (gen 3)
        const gen3 = useAnnotationStore.getState().objects.labelDatasetGeneration;
        expect(gen3).toBeGreaterThan(gen1);

        // Install fresh A2 labels in the store (as would happen on the second visit to A)
        useAnnotationStore.getState().setDatasetLabels(
            [{ id: 99, name: "Fresh A2" }],
            new Map([[99, "Fresh A2"]]),
            1,
            gen3
        );
        expect(useAnnotationStore.getState().objects.datasetLabels[0].name).toBe("Fresh A2");

        // Now resolve A1's deferred refresh last
        await act(async () => {
            resolveRefreshA1({
                labels: {
                    id_to_label_object: {
                        10: { id: 10, name: "Coral A" },
                        11: { id: 11, name: "Stale A1 New Algae" },
                    },
                },
            });
        });

        // Stale A1 refresh must NOT overwrite fresh A2 labels
        const currentLabels = useAnnotationStore.getState().objects.datasetLabels;
        expect(currentLabels.some((l) => l.name === "Fresh A2")).toBe(true);
        expect(currentLabels.some((l) => l.name === "Stale A1 New Algae")).toBe(false);
    });
});
