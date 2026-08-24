/**
 * Batch inference: run an orchestration of models over a whole dataset.
 *
 * The page builds a *plan* -- one model per label -- and posts it as a job. The backend
 * freezes it into a work list ordered by the label hierarchy and hands it to Celery; from
 * then on the page only reads progress, either by streaming or by polling.
 */
import { handleApiError, getAuthHeaders } from "./util";
import { API_BASE_URL } from "./config";

const jsonHeaders = () => getAuthHeaders({ "Content-Type": "application/json" });

/**
 * Models a label in this dataset may be bound to, plus the exemplar-retrieval strategies.
 * @param {number|string} datasetId
 * @returns {Promise<{models: Array, retrieval_strategies: Array}>}
 */
export const getInferenceModelCatalog = async (datasetId) => {
    const response = await fetch(`${API_BASE_URL}/inference/models?dataset_id=${datasetId}`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * Image counts per scope option (total / not started / unreviewed).
 */
export const getInferenceScopeCounts = async (datasetId) => {
    const response = await fetch(`${API_BASE_URL}/inference/scope?dataset_id=${datasetId}`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * Count what a replace run would delete. Takes the same body as `startInferenceJob`, so the
 * numbers in the warning are the numbers for the run about to start.
 * @returns {Promise<{images:number, contours:number, reviewed_contours:number,
 *                    root_contours:number, protected_contours:number}>}
 */
export const previewInferenceReplace = async (body) => {
    const response = await fetch(`${API_BASE_URL}/inference/replace-preview`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
    });
    return handleApiError(response);
};

/**
 * Start a run. A replace run additionally needs `confirm_replace: true`.
 * @param {Object} body - {dataset_id, name?, steps, image_selection, image_ids?, options,
 *                         confirm_replace?}
 * @returns {Promise<Object>} the first progress snapshot
 */
export const startInferenceJob = async (body) => {
    const response = await fetch(`${API_BASE_URL}/inference/jobs`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
    });
    return handleApiError(response);
};

/** The dataset's run history, newest first. */
export const getInferenceJobs = async (datasetId) => {
    const response = await fetch(`${API_BASE_URL}/inference/jobs?dataset_id=${datasetId}`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/** One progress snapshot (the polling fallback for the stream below). */
export const getInferenceJob = async (jobId) => {
    const response = await fetch(`${API_BASE_URL}/inference/jobs/${jobId}`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/** Work items of a run; pass `status="failed"` for the error list. */
export const getInferenceJobItems = async (jobId, status = null) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const response = await fetch(`${API_BASE_URL}/inference/jobs/${jobId}/items${query}`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/** Ask a run to stop after the image it is on. Annotations already written are kept. */
export const cancelInferenceJob = async (jobId) => {
    const response = await fetch(`${API_BASE_URL}/inference/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/** Remove a finished run from the history. */
export const deleteInferenceJob = async (jobId) => {
    const response = await fetch(`${API_BASE_URL}/inference/jobs/${jobId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * Stream a job's progress as Server-Sent Events until it reaches a terminal state.
 *
 * Same shape as `streamInstanceTrainingProgress`: `fetch` rather than `EventSource`, because
 * EventSource cannot send the Authorization header.
 *
 * @returns {AbortController} abort it to stop streaming.
 */
export const streamInferenceJob = (jobId, onMessage, onError) => {
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/inference/jobs/${jobId}/stream`, {
                headers: getAuthHeaders(),
                signal: controller.signal,
            });
            if (!response.ok || !response.body) {
                throw new Error(`Stream failed: ${response.status} ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            // Standard SSE framing: events separated by a blank line, payload lines
            // prefixed with "data:".
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let separator;
                while ((separator = buffer.indexOf("\n\n")) !== -1) {
                    const rawEvent = buffer.slice(0, separator);
                    buffer = buffer.slice(separator + 2);

                    const dataLines = rawEvent
                        .split("\n")
                        .filter((line) => line.startsWith("data:"))
                        .map((line) => line.slice(5).trim());
                    if (dataLines.length === 0) continue;

                    try {
                        onMessage(JSON.parse(dataLines.join("\n")));
                    } catch (e) {
                        // Ignore malformed frames.
                    }
                }
            }
        } catch (error) {
            if (error.name !== "AbortError" && onError) {
                onError(error);
            }
        }
    })();

    return controller;
};

/**
 * Get the single saved model routing policy for a dataset.
 * Returns null when 204 No Content.
 */
export const getInferenceRoutingPolicy = async (datasetId) => {
    const params = new URLSearchParams({ dataset_id: String(datasetId) });
    const response = await fetch(`${API_BASE_URL}/inference/config?${params.toString()}`, {
        headers: getAuthHeaders(),
    });
    if (response.status === 204) {
        return null;
    }
    return handleApiError(response);
};

export const getInferenceConfig = getInferenceRoutingPolicy;

/**
 * Save or replace the single model routing policy for a dataset.
 * Expects { dataset_id: number, bindings: Array<ModelRoutingBinding> }
 */
export const updateInferenceRoutingPolicy = async (body) => {
    const response = await fetch(`${API_BASE_URL}/inference/config`, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({
            dataset_id: Number(body.dataset_id),
            bindings: body.bindings || [],
        }),
    });
    return handleApiError(response);
};

export const saveInferenceConfig = updateInferenceRoutingPolicy;

/**
 * Delete the model routing policy for a dataset.
 */
export const deleteInferenceRoutingPolicy = async (datasetId) => {
    const params = new URLSearchParams({ dataset_id: String(datasetId) });
    const response = await fetch(`${API_BASE_URL}/inference/config?${params.toString()}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

export const deleteInferenceConfig = deleteInferenceRoutingPolicy;

/**
 * Run one routed model step for a single image with patch semantics.
 */
export const suggestModelRoutingStep = async ({
    datasetId,
    imageId,
    maskId = null,
    labelId,
    task = "cross-image-suggestion",
}) => {
    const response = await fetch(`${API_BASE_URL}/inference/config/suggest`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
            dataset_id: Number(datasetId),
            image_id: Number(imageId),
            mask_id: maskId != null ? Number(maskId) : null,
            label_id: Number(labelId),
            task: task || "cross-image-suggestion",
        }),
    });
    return handleApiError(response);
};

export const suggestInferenceConfigStep = suggestModelRoutingStep;
