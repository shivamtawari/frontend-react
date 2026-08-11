import { handleApiError, getAuthHeaders } from "./util";
import { API_BASE_URL } from "./config";

/**
 * List available inference-ready instance segmentation models for a dataset.
 * @param {number} [datasetId]
 */
export const getInstanceModels = async (datasetId) => {
    const url = datasetId
        ? `${API_BASE_URL}/instance_segmentation/models?dataset_id=${datasetId}`
        : `${API_BASE_URL}/instance_segmentation/models`;
    const response = await fetch(url, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * List available training base models for fine-tuning.
 */
export const getInstanceTrainingModels = async () => {
    const response = await fetch(`${API_BASE_URL}/instance_segmentation/training/models`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};


/**
 * Fetch reviewed annotation counts per label ID for a dataset.
 */
export const getInstanceLabelAnnotationCounts = async (datasetId) => {
    const response = await fetch(
        `${API_BASE_URL}/instance_segmentation/training/label-annotation-counts?dataset_id=${datasetId}`,
        { headers: getAuthHeaders() }
    );
    return handleApiError(response);
};

/**
 * Start training an instance segmentation model on a dataset.
 * @param {Object} cfg
 * @param {number} cfg.dataset_id
 * @param {number[]} [cfg.label_ids] - labels to train on; empty/omitted = all dataset labels (multiclass)
 * @param {string} [cfg.model_registry_key] - base model to fine-tune
 * @param {Object} [cfg.hyper_parameter] - hyperparameter overrides keyed by model param key
 * @param {string} [cfg.model_run_name] - optional human-readable alias for this run
 * @returns {Promise<{success: boolean, task_id: string}>}
 */
export const startInstanceTraining = async ({
    dataset_id,
    label_ids = [],
    model_registry_key = "mask2former",
    hyper_parameter = {},
    model_run_name = undefined,
    hierarchy_conflict_policy = undefined,
}) => {
    const response = await fetch(`${API_BASE_URL}/instance_segmentation/training/start`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
            dataset_id,
            label_ids,
            model_registry_key,
            hyper_parameter,
            model_run_name,
            ...(hierarchy_conflict_policy === undefined ? {} : { hierarchy_conflict_policy }),
        }),
    });

    // Keep structured training conflict fields available to the page while
    // preserving the shared API error behavior and its auth handling.
    const errorPayloadPromise = !response.ok && typeof response.clone === "function"
        ? response.clone().json().catch(() => null)
        : Promise.resolve(null);

    try {
        return await handleApiError(response);
    } catch (error) {
        const errorPayload = await errorPayloadPromise;
        const detail = errorPayload?.detail && typeof errorPayload.detail === "object"
            ? errorPayload.detail
            : errorPayload;
        if (detail && typeof detail === "object") {
            if (typeof detail.error_code === "string") error.error_code = detail.error_code;
            if (detail.details && typeof detail.details === "object") error.details = detail.details;
        }
        throw error;
    }
};

/**
 * List past + active training runs for a dataset (newest first).
 */
export const getInstanceTrainingRuns = async (datasetId) => {
    const response = await fetch(
        `${API_BASE_URL}/instance_segmentation/training/runs?dataset_id=${datasetId}`,
        { headers: getAuthHeaders() }
    );
    return handleApiError(response);
};

/**
 * Fetch a progress snapshot for a specific (e.g. past) MLflow run.
 */
export const getInstanceRunSnapshot = async (runId) => {
    const response = await fetch(`${API_BASE_URL}/instance_segmentation/training/runs/${runId}`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * Fetch a single MLflow-backed progress snapshot for a training job (by task id).
 */
export const getInstanceTrainingStatus = async (taskId) => {
    const response = await fetch(`${API_BASE_URL}/instance_segmentation/training/${taskId}`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * Cancel (revoke) a running training job.
 */
export const cancelInstanceTraining = async (taskId) => {
    const response = await fetch(`${API_BASE_URL}/instance_segmentation/training/${taskId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * Subscribe to the Server-Sent-Events progress stream for a training job.
 *
 * EventSource cannot send the Authorization header, so we consume the SSE stream
 * with fetch + a ReadableStream reader instead. Each parsed `data:` payload is
 * delivered to `onMessage`. Returns an AbortController; call `.abort()` to stop.
 *
 * @param {string} taskId
 * @param {(payload: object) => void} onMessage
 * @param {(error: Error) => void} [onError]
 * @returns {AbortController}
 */
export const streamInstanceTrainingProgress = (taskId, onMessage, onError) => {
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch(
                `${API_BASE_URL}/instance_segmentation/training/${taskId}/stream`,
                { headers: getAuthHeaders(), signal: controller.signal }
            );
            if (!response.ok || !response.body) {
                throw new Error(`Stream failed: ${response.status} ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            // Standard SSE framing: events are separated by a blank line; each
            // event's payload lines are prefixed with "data:".
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let sep;
                while ((sep = buffer.indexOf("\n\n")) !== -1) {
                    const rawEvent = buffer.slice(0, sep);
                    buffer = buffer.slice(sep + 2);

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
