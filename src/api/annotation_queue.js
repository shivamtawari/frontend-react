/**
 * Annotation-queue endpoints: the persisted order an annotator works images in.
 *
 * Unlike the review queue (a per-session snapshot), an annotation queue is saved
 * per (dataset, user): the builder on the Annotation card writes it, and the
 * editor's loader applies it so next/previous follow that order. See
 * `app.services.annotation_queue` on the backend for the ordering registry (where
 * active-learning orderings plug in).
 */
import { handleApiError, getAuthHeaders } from "./util";
import { API_BASE_URL } from "./config";

const jsonHeaders = () => getAuthHeaders({ "Content-Type": "application/json" });

/**
 * The dataset's annotation workload plus the caller's saved-queue state.
 *
 * Backs the Annotation card's "x in progress, y not started" subcaption and the
 * queue builder's ordering options / resume prompt.
 *
 * @param {number|string} datasetId
 * @returns {Promise<{success: boolean, summary: {
 *   not_started: number, in_progress: number, finished: number, total: number,
 *   has_saved_queue: boolean, saved_strategy: string|null,
 *   strategies: Array<{key: string, label: string, description: string, available: boolean}>,
 * }}>}
 */
export const fetchAnnotationQueueSummary = async (datasetId) => {
    const response = await fetch(
        `${API_BASE_URL}/annotation-queue/datasets/${datasetId}/summary`,
        { headers: getAuthHeaders() }
    );
    return handleApiError(response);
};

/**
 * The caller's saved queue for a dataset, or `queue: null` if none was built.
 *
 * @param {number|string} datasetId
 * @returns {Promise<{success: boolean, queue: {
 *   strategy: string, image_ids: number[], total: number, updated_at: string|null,
 * }|null}>}
 */
export const fetchAnnotationQueue = async (datasetId) => {
    const response = await fetch(
        `${API_BASE_URL}/annotation-queue/datasets/${datasetId}`,
        { headers: getAuthHeaders() }
    );
    return handleApiError(response);
};

/**
 * Build the image order for a strategy and persist it, overwriting any earlier
 * queue for this dataset + user.
 *
 * @param {number|string} datasetId
 * @param {Object} options
 * @param {string} options.strategy - A key from the summary's `strategies` (must be `available`).
 * @returns {Promise<{success: boolean, queue: {
 *   strategy: string, image_ids: number[], total: number, updated_at: string|null,
 * }}>}
 */
export const buildAnnotationQueue = async (datasetId, { strategy }) => {
    const response = await fetch(
        `${API_BASE_URL}/annotation-queue/datasets/${datasetId}`,
        {
            method: "POST",
            headers: jsonHeaders(),
            body: JSON.stringify({ strategy }),
        }
    );
    return handleApiError(response);
};
