import { describe, it, expect, beforeEach } from "vitest";
import useAnnotationStore from "../useAnnotationStore";

describe("objectsSlice setObjectsFromHierarchy", () => {
    beforeEach(() => {
        useAnnotationStore.setState((state) => {
            state.objects = {
                list: [],
                colors: {},
                selectedIds: [],
                visible: {},
                locked: {},
            };
        });
    });

    it("populates objects correctly from raw root_contours shape", () => {
        const labelsMap = new Map([
            [1, "Coral"],
            ["1", "Coral"],
        ]);

        const rawHierarchy = {
            root_contours: [
                {
                    id: 101,
                    label_id: 1,
                    points: [{ x: 0.1, y: 0.2 }],
                    children: [],
                },
            ],
        };

        const store = useAnnotationStore.getState();
        store.setObjectsFromHierarchy(rawHierarchy, labelsMap);

        const updated = useAnnotationStore.getState().objects;
        expect(updated.list.length).toBe(1);
        expect(updated.list[0].id).toBe(101);
        expect(updated.list[0].label).toBe("Coral");
    });

    it("populates objects correctly from backend API envelope { contours: { root_contours: [...] } }", () => {
        const labelsMap = new Map([
            [2, "Bleached"],
            ["2", "Bleached"],
        ]);

        const backendEnvelope = {
            success: true,
            message: "Contours hierarchy retrieved.",
            contours: {
                root_contours: [
                    {
                        id: 202,
                        label_id: 2,
                        points: [{ x: 0.3, y: 0.4 }],
                        children: [
                            {
                                id: 203,
                                label_id: 2,
                                points: [{ x: 0.35, y: 0.45 }],
                                children: [],
                            },
                        ],
                    },
                ],
            },
        };

        const store = useAnnotationStore.getState();
        store.setObjectsFromHierarchy(backendEnvelope, labelsMap);

        const updated = useAnnotationStore.getState().objects;
        expect(updated.list.length).toBe(2);
        expect(updated.list[0].id).toBe(202);
        expect(updated.list[0].label).toBe("Bleached");
        expect(updated.list[1].id).toBe(203);
        expect(updated.list[1].parent_id).toBe(202);
    });
});

describe("objectsSlice dataset-scoped label cache and activateLabelDataset", () => {
    beforeEach(() => {
        useAnnotationStore.setState((state) => {
            state.objects = {
                list: [],
                selected: [],
                labelDatasetId: null,
                datasetLabels: [],
                datasetLabelsMap: null,
                visibility: {
                    showAll: true,
                    rootLevelOnly: false,
                    selectedLevelOnly: false,
                    showRootLabels: true,
                    labels: {},
                    rootLabelIds: [],
                },
                colors: {},
                labelAssignmentCounter: 0,
                loading: false,
                loadError: null,
                loadedForImageId: null,
            };
            state.workspace = {
                ...(state.workspace || {}),
                activeLabelId: null,
                labelColorOverrides: {},
                picker: null,
            };
        });
    });

    it("clears labels, active label, per-label visibility, overrides, and picker in one update on new dataset", () => {
        const store = useAnnotationStore.getState();
        store.activateLabelDataset(1);
        store.setDatasetLabels(
            [{ id: 10, name: "Coral" }],
            new Map([[10, "Coral"]]),
            1
        );

        useAnnotationStore.setState((state) => {
            state.workspace.activeLabelId = 10;
            state.workspace.labelColorOverrides = { 10: "#ff0000" };
            state.workspace.picker = "label";
            state.objects.visibility.labels = { "10": false };
            state.objects.visibility.rootLabelIds = [10];
        });

        // Activate Dataset 2
        store.activateLabelDataset(2);

        const state = useAnnotationStore.getState();
        expect(state.objects.labelDatasetId).toBe(2);
        expect(state.objects.datasetLabels).toEqual([]);
        expect(state.objects.datasetLabelsMap).toBeNull();
        expect(state.workspace.activeLabelId).toBeNull();
        expect(state.workspace.labelColorOverrides).toEqual({});
        expect(state.workspace.picker).toBeNull();
        expect(state.objects.visibility.labels).toEqual({});
        expect(state.objects.visibility.rootLabelIds).toEqual([]);
    });

    it("re-activating the same dataset is a no-op and preserves armed label and cache", () => {
        const store = useAnnotationStore.getState();
        store.activateLabelDataset(1);
        store.setDatasetLabels(
            [{ id: 10, name: "Coral" }],
            new Map([[10, "Coral"]]),
            1
        );

        useAnnotationStore.setState((state) => {
            state.workspace.activeLabelId = 10;
        });

        // Re-activate Dataset 1 (same dataset)
        store.activateLabelDataset(1);
        // Also check string vs number equivalence
        store.activateLabelDataset("1");

        const state = useAnnotationStore.getState();
        expect(state.objects.labelDatasetId).toBe(1);
        expect(state.objects.datasetLabels.length).toBe(1);
        expect(state.workspace.activeLabelId).toBe(10);
    });

    it("ignores a stale setDatasetLabels(A, ...) after B is active", () => {
        const store = useAnnotationStore.getState();
        store.activateLabelDataset(1);
        // Switch to B
        store.activateLabelDataset(2);

        // Stale write from A
        store.setDatasetLabels(
            [{ id: 10, name: "Stale Coral A" }],
            new Map([[10, "Stale Coral A"]]),
            1
        );

        let state = useAnnotationStore.getState();
        expect(state.objects.datasetLabels).toEqual([]);
        expect(state.objects.datasetLabelsMap).toBeNull();

        // Valid write from B
        store.setDatasetLabels(
            [{ id: 20, name: "Valid B" }],
            new Map([[20, "Valid B"]]),
            2
        );

        state = useAnnotationStore.getState();
        expect(state.objects.datasetLabels.length).toBe(1);
        expect(state.objects.datasetLabels[0].name).toBe("Valid B");
    });

    it("installs B labels when the label list is empty", () => {
        const store = useAnnotationStore.getState();
        store.activateLabelDataset(2);

        store.setDatasetLabels([], new Map(), 2);

        const state = useAnnotationStore.getState();
        expect(state.objects.labelDatasetId).toBe(2);
        expect(state.objects.datasetLabels).toEqual([]);
        expect(state.objects.datasetLabelsMap).toEqual(new Map());
    });

    it("clears activeLabelId on dataset switch even if both datasets share the same numeric label ID", () => {
        const store = useAnnotationStore.getState();
        store.activateLabelDataset(1);
        store.setDatasetLabels(
            [{ id: 99, name: "Coral A" }],
            new Map([[99, "Coral A"]]),
            1
        );

        useAnnotationStore.setState((state) => {
            state.workspace.activeLabelId = 99;
        });

        // Switch to Dataset 2
        store.activateLabelDataset(2);

        const state = useAnnotationStore.getState();
        expect(state.workspace.activeLabelId).toBeNull();

        // Even after installing Dataset 2 labels which happen to also include ID 99
        store.setDatasetLabels(
            [{ id: 99, name: "Algae B" }],
            new Map([[99, "Algae B"]]),
            2
        );

        const stateAfterInstall = useAnnotationStore.getState();
        expect(stateAfterInstall.workspace.activeLabelId).toBeNull();
    });

    it("rejects setDatasetLabels when generation does not match the active generation across A -> B -> A", () => {
        const store = useAnnotationStore.getState();
        // Visit 1: Dataset 1 (gen 1)
        store.activateLabelDataset(1);
        const gen1 = useAnnotationStore.getState().objects.labelDatasetGeneration;

        // Visit 2: Dataset 2 (gen 2)
        store.activateLabelDataset(2);

        // Visit 3: Dataset 1 again (gen 3)
        store.activateLabelDataset(1);
        const gen3 = useAnnotationStore.getState().objects.labelDatasetGeneration;
        expect(gen3).toBeGreaterThan(gen1);

        // Installing fresh labels for gen 3
        store.setDatasetLabels(
            [{ id: 10, name: "Coral Visit 2" }],
            new Map([[10, "Coral Visit 2"]]),
            1,
            gen3
        );

        expect(useAnnotationStore.getState().objects.datasetLabels[0].name).toBe("Coral Visit 2");

        // Stale write from gen 1 (same dataset 1, but stale generation)
        store.setDatasetLabels(
            [{ id: 10, name: "Coral Visit 1 Stale" }],
            new Map([[10, "Coral Visit 1 Stale"]]),
            1,
            gen1
        );

        // Stale write must be ignored
        expect(useAnnotationStore.getState().objects.datasetLabels[0].name).toBe("Coral Visit 2");
    });
});
