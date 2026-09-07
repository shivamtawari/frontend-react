import React from "react";
import { render, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AnnotationPageV2 from "./AnnotationPageV2";
import useAnnotationStore from "../stores/useAnnotationStore";
import * as DatasetContext from "../contexts/DatasetContext";
import * as labelsApi from "../api/labels";
import websocketService from "../services/websocket";
import annotationSession from "../services/annotationSession";
import { SERVER_MESSAGE_TYPES } from "../utils/messageTypes";

const { mockRoute } = vi.hoisted(() => ({
    mockRoute: { datasetId: "2", imageId: "10" },
}));

vi.mock("react-router-dom", () => ({
    useParams: () => ({ datasetId: mockRoute.datasetId, imageId: mockRoute.imageId }),
    Navigate: ({ to }) => <div data-testid="navigate" data-to={to} />,
}));

vi.mock("../components/annotationPage/layout/MainLayout", () => ({
    default: () => <div data-testid="main-layout" />,
}));

vi.mock("../components/annotationPage/layout/ResponsiveWrapper", () => ({
    default: ({ children }) => <div data-testid="responsive-wrapper">{children}</div>,
}));

vi.mock("../components/annotationPage/layout/DatasetLoader", () => ({
    default: ({ children }) => <div data-testid="dataset-loader">{children}</div>,
}));

vi.mock("../contexts/AnnotationRoutingPolicyContext", () => ({
    AnnotationRoutingPolicyProvider: ({ children }) => <div>{children}</div>,
}));

vi.mock("../hooks/usePermissions", () => ({
    usePermissions: () => ({ can: () => true }),
}));

vi.mock("../hooks/useAnnotationSession", () => ({
    default: vi.fn(() => ({
        isReady: true,
        sessionState: "ready",
        runningServices: [],
        failedServices: [],
    })),
}));

vi.mock("../hooks/useWebSocketObjectHandler", () => ({
    default: vi.fn(),
}));

vi.mock("../hooks/useWebSocketStatusToasts", () => ({
    default: vi.fn(),
}));

vi.mock("../hooks/useWebSocketErrorToasts", () => ({
    default: vi.fn(),
}));

vi.mock("../hooks/useModelPreloader", () => ({
    default: vi.fn(),
}));

vi.mock("../api/labels", () => ({
    fetchLabels: vi.fn(),
}));

describe("AnnotationPageV2 dataset-scoped label cache regression tests", () => {
    let wsCallbacks = {};

    beforeEach(() => {
        vi.clearAllMocks();
        wsCallbacks = {};

        vi.spyOn(websocketService, "on").mockImplementation((event, cb) => {
            wsCallbacks[event] = cb;
            return () => {
                delete wsCallbacks[event];
            };
        });

        vi.spyOn(annotationSession, "getCurrentImageId").mockReturnValue(10);

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

    it("does not reuse dataset A's labels when opening dataset B, fetches B's labels, and hydrates B contours", async () => {
        // Seed store with Dataset A (id 1) labels
        useAnnotationStore.setState((state) => {
            state.objects.datasetLabels = [{ id: 1, name: "Label A1" }];
            state.objects.datasetLabelsMap = new Map([
                [1, "Label A1"],
                ["1", "Label A1"],
            ]);
            state.workspace.activeLabelId = 1;
        });

        mockRoute.datasetId = "2";
        mockRoute.imageId = "10";

        const datasetB = { id: 2, name: "Dataset B" };
        vi.spyOn(DatasetContext, "useDataset").mockReturnValue({
            currentDataset: datasetB,
            datasets: [datasetB],
        });

        labelsApi.fetchLabels.mockResolvedValue({
            labels: {
                id_to_label_object: {
                    2: { id: 2, name: "Label B2", parent_id: null },
                },
            },
        });

        render(<AnnotationPageV2 />);

        // Deliver an OBJECTS message with contour label_id: 2
        await act(async () => {
            wsCallbacks[SERVER_MESSAGE_TYPES.OBJECTS]?.({
                data: {
                    root_contours: [
                        { id: 201, label_id: 2, x: [10], y: [20], children: [] },
                    ],
                },
            });
        });

        // fetchLabels MUST have been called for dataset B (id 2)
        expect(labelsApi.fetchLabels).toHaveBeenCalledWith(2);

        // Object in store must be hydrated with Label B2, NOT null or Label A1
        await waitFor(() => {
            const objects = useAnnotationStore.getState().objects.list;
            expect(objects.length).toBe(1);
            expect(objects[0].label).toBe("Label B2");
        });

        // The cached labels in store must belong to dataset B
        const storeLabels = useAnnotationStore.getState().objects.datasetLabels;
        expect(storeLabels.some((l) => l.name === "Label B2")).toBe(true);
        expect(storeLabels.some((l) => l.name === "Label A1")).toBe(false);
    });

    it("rejects late label response from dataset A when user has switched to dataset B", async () => {
        let resolveA;
        const promiseA = new Promise((resolve) => {
            resolveA = resolve;
        });

        labelsApi.fetchLabels.mockImplementation((id) => {
            if (id === 1) return promiseA;
            if (id === 2) {
                return Promise.resolve({
                    labels: {
                        id_to_label_object: {
                            20: { id: 20, name: "Label B20", parent_id: null },
                        },
                    },
                });
            }
            return Promise.resolve([]);
        });

        mockRoute.datasetId = "1";
        const datasetA = { id: 1, name: "Dataset A" };
        const datasetB = { id: 2, name: "Dataset B" };

        let datasetContextVal = {
            currentDataset: datasetA,
            datasets: [datasetA, datasetB],
        };

        const datasetSpy = vi.spyOn(DatasetContext, "useDataset").mockImplementation(() => datasetContextVal);

        const { rerender } = render(<AnnotationPageV2 />);

        // Trigger contour load for dataset A
        act(() => {
            wsCallbacks[SERVER_MESSAGE_TYPES.OBJECTS]?.({
                data: {
                    root_contours: [
                        { id: 101, label_id: 10, x: [1], y: [2], children: [] },
                    ],
                },
            });
        });

        expect(labelsApi.fetchLabels).toHaveBeenCalledWith(1);

        // Switch route and context to Dataset B before A resolves
        mockRoute.datasetId = "2";
        datasetContextVal = {
            currentDataset: datasetB,
            datasets: [datasetA, datasetB],
        };

        rerender(<AnnotationPageV2 />);

        // Trigger contour load for dataset B
        await act(async () => {
            wsCallbacks[SERVER_MESSAGE_TYPES.OBJECTS]?.({
                data: {
                    root_contours: [
                        { id: 201, label_id: 20, x: [3], y: [4], children: [] },
                    ],
                },
            });
        });

        await waitFor(() => {
            const list = useAnnotationStore.getState().objects.list;
            expect(list.length).toBe(1);
            expect(list[0].label).toBe("Label B20");
        });

        // Now late resolve A
        await act(async () => {
            resolveA({
                labels: {
                    id_to_label_object: {
                        10: { id: 10, name: "Label A10", parent_id: null },
                    },
                },
            });
        });

        // Late response from A must NOT overwrite store cache or object list with A's labels
        const storeLabels = useAnnotationStore.getState().objects.datasetLabels;
        expect(storeLabels.some((l) => l.name === "Label A10")).toBe(false);
        expect(storeLabels.some((l) => l.name === "Label B20")).toBe(true);

        const list = useAnnotationStore.getState().objects.list;
        expect(list.some((o) => o.label === "Label A10")).toBe(false);
    });

    it("preserves activeLabelId and label cache when navigating between images in the same dataset", async () => {
        mockRoute.datasetId = "5";
        mockRoute.imageId = "100";

        const dataset = { id: 5, name: "Dataset 5" };
        vi.spyOn(DatasetContext, "useDataset").mockReturnValue({
            currentDataset: dataset,
            datasets: [dataset],
        });

        labelsApi.fetchLabels.mockResolvedValue({
            labels: {
                id_to_label_object: {
                    501: { id: 501, name: "Label 501", parent_id: null },
                },
            },
        });

        const { rerender } = render(<AnnotationPageV2 />);

        // Deliver contour and load labels
        await act(async () => {
            wsCallbacks[SERVER_MESSAGE_TYPES.OBJECTS]?.({
                data: {
                    root_contours: [
                        { id: 1, label_id: 501, x: [1], y: [2], children: [] },
                    ],
                },
            });
        });

        await waitFor(() => {
            expect(labelsApi.fetchLabels).toHaveBeenCalledWith(5);
        });

        // User arms label 501
        act(() => {
            useAnnotationStore.getState().setActiveLabelId(501);
        });

        expect(useAnnotationStore.getState().workspace.activeLabelId).toBe(501);
        expect(useAnnotationStore.getState().objects.datasetLabels.length).toBe(1);

        // Switch to next image inside the same dataset
        mockRoute.imageId = "101";
        await act(async () => {
            rerender(<AnnotationPageV2 />);
        });

        // Armed label and cache must still be intact
        expect(useAnnotationStore.getState().workspace.activeLabelId).toBe(501);
        expect(useAnnotationStore.getState().objects.datasetLabels.length).toBe(1);
        expect(useAnnotationStore.getState().objects.labelDatasetId).toBe(5);
        // fetchLabels should NOT have been called again (cache hit)
        expect(labelsApi.fetchLabels).toHaveBeenCalledTimes(1);
    });

    it("rejects late response from first visit to A across an A -> B -> A transition", async () => {
        let resolveA1;
        const promiseA1 = new Promise((resolve) => {
            resolveA1 = resolve;
        });

        let resolveA2;
        const promiseA2 = new Promise((resolve) => {
            resolveA2 = resolve;
        });

        let callCountA = 0;
        labelsApi.fetchLabels.mockImplementation((id) => {
            if (id === 1) {
                callCountA += 1;
                return callCountA === 1 ? promiseA1 : promiseA2;
            }
            if (id === 2) {
                return Promise.resolve({
                    labels: {
                        id_to_label_object: {
                            20: { id: 20, name: "Label B20", parent_id: null },
                        },
                    },
                });
            }
            return Promise.resolve([]);
        });

        mockRoute.datasetId = "1";
        const datasetA = { id: 1, name: "Dataset A" };
        const datasetB = { id: 2, name: "Dataset B" };

        let datasetContextVal = {
            currentDataset: datasetA,
            datasets: [datasetA, datasetB],
        };

        vi.spyOn(DatasetContext, "useDataset").mockImplementation(() => datasetContextVal);

        const { rerender } = render(<AnnotationPageV2 />);

        // Trigger contour load for dataset A (first visit -> starts A1)
        act(() => {
            wsCallbacks[SERVER_MESSAGE_TYPES.OBJECTS]?.({
                data: {
                    root_contours: [
                        { id: 101, label_id: 10, x: [1], y: [2], children: [] },
                    ],
                },
            });
        });

        expect(labelsApi.fetchLabels).toHaveBeenCalledWith(1);
        expect(callCountA).toBe(1);

        // Switch to Dataset B
        mockRoute.datasetId = "2";
        datasetContextVal = {
            currentDataset: datasetB,
            datasets: [datasetA, datasetB],
        };

        await act(async () => {
            rerender(<AnnotationPageV2 />);
        });

        // Trigger contour load for Dataset B
        await act(async () => {
            wsCallbacks[SERVER_MESSAGE_TYPES.OBJECTS]?.({
                data: {
                    root_contours: [
                        { id: 201, label_id: 20, x: [3], y: [4], children: [] },
                    ],
                },
            });
        });

        await waitFor(() => {
            const list = useAnnotationStore.getState().objects.list;
            expect(list.length).toBe(1);
            expect(list[0].label).toBe("Label B20");
        });

        // Switch BACK to Dataset A (second visit)
        mockRoute.datasetId = "1";
        datasetContextVal = {
            currentDataset: datasetA,
            datasets: [datasetA, datasetB],
        };

        await act(async () => {
            rerender(<AnnotationPageV2 />);
        });

        // Trigger contour load for Dataset A (second visit -> starts A2)
        await act(async () => {
            wsCallbacks[SERVER_MESSAGE_TYPES.OBJECTS]?.({
                data: {
                    root_contours: [
                        { id: 102, label_id: 10, x: [5], y: [6], children: [] },
                    ],
                },
            });
        });

        expect(callCountA).toBe(2);

        // Resolve A2 with fresh labels
        await act(async () => {
            resolveA2({
                labels: {
                    id_to_label_object: {
                        10: { id: 10, name: "Label A_new", parent_id: null },
                    },
                },
            });
        });

        await waitFor(() => {
            const storeLabels = useAnnotationStore.getState().objects.datasetLabels;
            expect(storeLabels.some((l) => l.name === "Label A_new")).toBe(true);
            const list = useAnnotationStore.getState().objects.list;
            expect(list[0].label).toBe("Label A_new");
        });

        // Now late resolve A1 with stale labels
        await act(async () => {
            resolveA1({
                labels: {
                    id_to_label_object: {
                        10: { id: 10, name: "Label A_stale", parent_id: null },
                    },
                },
            });
        });

        // Stale A1 must NOT overwrite the A2 cache or hydrate with A_stale
        const storeLabels = useAnnotationStore.getState().objects.datasetLabels;
        expect(storeLabels.some((l) => l.name === "Label A_stale")).toBe(false);
        expect(storeLabels.some((l) => l.name === "Label A_new")).toBe(true);

        const list = useAnnotationStore.getState().objects.list;
        expect(list.some((o) => o.label === "Label A_stale")).toBe(false);
        expect(list[0].label).toBe("Label A_new");
    });

    it("commits B's labels to store cache when unmounting A, preserving Zustand state, and mounting B", async () => {
        const datasetA = { id: 1, name: "Dataset A" };
        const datasetB = { id: 2, name: "Dataset B" };

        labelsApi.fetchLabels.mockImplementation((id) => {
            if (id === 1) {
                return Promise.resolve({
                    labels: {
                        id_to_label_object: {
                            10: { id: 10, name: "Label A10", parent_id: null },
                        },
                    },
                });
            }
            if (id === 2) {
                return Promise.resolve({
                    labels: {
                        id_to_label_object: {
                            20: { id: 20, name: "Label B20", parent_id: null },
                        },
                    },
                });
            }
            return Promise.resolve([]);
        });

        // 1. Mount AnnotationPageV2 for Dataset A
        mockRoute.datasetId = "1";
        mockRoute.imageId = "10";
        let datasetContextVal = {
            currentDataset: datasetA,
            datasets: [datasetA, datasetB],
        };
        vi.spyOn(DatasetContext, "useDataset").mockImplementation(() => datasetContextVal);

        const { unmount } = render(<AnnotationPageV2 />);

        // Deliver contours for A
        await act(async () => {
            wsCallbacks[SERVER_MESSAGE_TYPES.OBJECTS]?.({
                data: {
                    root_contours: [
                        { id: 101, label_id: 10, x: [1], y: [2], children: [] },
                    ],
                },
            });
        });

        await waitFor(() => {
            const storeLabels = useAnnotationStore.getState().objects.datasetLabels;
            expect(storeLabels.some((l) => l.name === "Label A10")).toBe(true);
        });

        const genAfterA = useAnnotationStore.getState().objects.labelDatasetGeneration;
        expect(genAfterA).toBeGreaterThanOrEqual(1);

        // 2. Unmount Dataset A (simulating leaving the annotation page)
        unmount();

        // 3. Switch route and context to Dataset B and mount a fresh AnnotationPageV2
        mockRoute.datasetId = "2";
        mockRoute.imageId = "20";
        datasetContextVal = {
            currentDataset: datasetB,
            datasets: [datasetA, datasetB],
        };

        render(<AnnotationPageV2 />);

        // Deliver contours for B
        await act(async () => {
            wsCallbacks[SERVER_MESSAGE_TYPES.OBJECTS]?.({
                data: {
                    root_contours: [
                        { id: 201, label_id: 20, x: [3], y: [4], children: [] },
                    ],
                },
            });
        });

        // 4. Verify B's labels are committed to the Zustand store cache
        await waitFor(() => {
            const storeLabels = useAnnotationStore.getState().objects.datasetLabels;
            expect(storeLabels.some((l) => l.name === "Label B20")).toBe(true);
            expect(storeLabels.some((l) => l.name === "Label A10")).toBe(false);
        });

        const store = useAnnotationStore.getState();
        expect(store.objects.labelDatasetId).toBe(2);
        expect(store.objects.labelDatasetGeneration).toBeGreaterThan(genAfterA);
        expect(store.objects.list[0].label).toBe("Label B20");
    });
});
