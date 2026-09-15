import { handleApiError, getAuthHeaders, buildUrl } from "../api/util";
import { getImageById } from "./images"; // Import the image fetching function

import { API_BASE_URL } from "./config";

// Dataset API functions
export const fetchDatasets = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/datasets/all`, {
            headers: getAuthHeaders(),
        });
        return handleApiError(response);
    } catch (error) {
        throw error;
    }
};

export const createDataset = async (name, description, datasetType) => {
    try {
        const url = buildUrl(API_BASE_URL, '/datasets/create', {
            name: name,
            description: description,
            dataset_type: datasetType
        });

        const response = await fetch(url, {
            method: "POST",
            headers: getAuthHeaders(),
        });
        return handleApiError(response);
    } catch (error) {
        throw error;
    }
};

export const deleteDataset = async (datasetId) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/datasets/${datasetId}`,
            {
                method: "DELETE",
                headers: getAuthHeaders(),
            }
        );
        return handleApiError(response);
    } catch (error) {
        throw error;
    }
};

export const shareDataset = async (datasetId, shareWithUsername) => {
    try {
        const url = buildUrl(API_BASE_URL, `/datasets/${datasetId}/share`, {
            share_with_username: shareWithUsername,
        });
        const response = await fetch(url, {
            method: "POST",
            headers: getAuthHeaders(),
        });
        return handleApiError(response);
    } catch (error) {
        throw error;
    }
};

export const getDataset = async (datasetId) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/datasets/${datasetId}`,
            {
                headers: getAuthHeaders(),
            }
        );
        return handleApiError(response);
    } catch (error) {
        throw error;
    }
};

// Get annotation progress for a dataset
export const getAnnotationProgress = async (datasetId) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/datasets/${datasetId}/progress`,
            {
                headers: getAuthHeaders(),
            }
        );
        return handleApiError(response);
    } catch (error) {
        throw error;
    }
};

// Get sample images for a dataset (first few images)
export const getSampleImages = async (datasetId, limit = 4) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/datasets/${datasetId}/thumbnails/b64?limit=${limit}`,
            {
                headers: getAuthHeaders(),
            }
        );
        const data = await handleApiError(response);

        if (data.success && data.images) {
            return Object.entries(data.images).map(([id, base64]) => ({
                id: Number(id) || id,
                base64: base64,
                filename: `image_${id}`,
            }));
        }

        return [];
    } catch (error) {
        return [];
    }
};

/**
 * Download a dataset in COCO format for ML tasks.
 *
 * With `includeImages` it downloads a ZIP bundle (COCO JSON + referenced images)
 * from `GET /datasets/{id}/coco`; otherwise it downloads the annotations-only
 * COCO JSON from `GET /datasets/{id}/coco/annotations`. The browser download is
 * triggered automatically.
 *
 * @param {number} datasetId
 * @param {Object} options
 * @param {boolean} [options.includeImages=true] - Bundle images (ZIP) vs annotations-only (JSON).
 * @param {boolean} [options.excludeUnreviewed=true] - Drop contours that haven't been reviewed.
 * @param {boolean} [options.excludeNotFullyAnnotated=true] - Drop images whose masks aren't fully annotated.
 * @param {"all"|"leaves"|"top_level"} [options.contourSelection="all"] - Which contours of the hierarchy to emit.
 */
export const downloadCocoExport = async (
    datasetId,
    {
        includeImages = true,
        excludeUnreviewed = true,
        excludeNotFullyAnnotated = true,
        contourSelection = "all",
    } = {}
) => {
    if (!datasetId) {
        throw new Error("Dataset ID is required");
    }

    const path = includeImages
        ? `/datasets/${datasetId}/coco`
        : `/datasets/${datasetId}/coco/annotations`;

    const params = {
        exclude_unreviewed: excludeUnreviewed,
        exclude_not_fully_annotated: excludeNotFullyAnnotated,
        contour_selection: contourSelection,
    };
    if (includeImages) {
        params.include_images = true;
    }

    const url = buildUrl(API_BASE_URL, path, params);
    const response = await fetch(url, { headers: getAuthHeaders() });

    if (!response.ok) {
        let message = `Export failed (${response.status})`;
        try {
            const data = await response.json();
            message = data.detail || data.message || message;
        } catch (_) {
            // non-JSON error body; keep the status-based message
        }
        throw new Error(message);
    }

    const blob = await response.blob();

    // Prefer the server-provided filename; fall back to a sensible default.
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const fallback = includeImages
        ? `dataset_${datasetId}_coco.zip`
        : `dataset_${datasetId}_coco.json`;
    const filename = match ? match[1] : fallback;

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
};

/**
 * Download a dataset in IQUANA archive format (.zip) directly from the browser.
 *
 * The browser download is triggered automatically with object URL cleanup.
 * Note: Uses response.blob() which buffers in browser tab memory; recommended for
 * standard browser workflows up to ~2 GiB. For multi-gigabyte exports, backend streaming
 * should be consumed via direct curl/HTTP client or native file stream writer.
 *
 * @param {number} datasetId
 * @param {Object} [options]
 * @param {boolean} [options.includeConfig=false] - Whether to include internal configuration (config.json).
 * @param {string} [options.datasetName] - Fallback dataset name for the filename.
 */
export const downloadIquanaArchive = async (
    datasetId,
    { includeConfig = false, datasetName } = {}
) => {
    if (!datasetId) {
        throw new Error("Dataset ID is required");
    }

    const path = `/datasets/${datasetId}/iquana`;
    const params = {
        include_config: Boolean(includeConfig),
    };

    const url = buildUrl(API_BASE_URL, path, params);
    const response = await fetch(url, { headers: getAuthHeaders() });

    if (!response.ok) {
        let message = `Export failed (${response.status})`;
        try {
            const data = await response.json();
            message = data.detail || data.message || message;
        } catch (_) {
            // non-JSON error body
        }
        throw new Error(message);
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const fallback = datasetName ? `${datasetName}.zip` : `dataset_${datasetId}.zip`;
    const filename = match ? match[1] : fallback;

    const blobUrl = URL.createObjectURL(blob);
    try {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
};

/**
 * Import a dataset from an IQUANA archive ZIP (v1).
 *
 * Sends a multipart POST to `POST /datasets/import/iquana`.
 *
 * @param {File} file - The .zip file to import.
 * @param {string|null} [name=null] - Optional override dataset name.
 * @returns {Promise<{success: boolean, message: string, dataset_id: number, dataset_name: string, config_applied: boolean, warnings: string[]}>}
 */
export const importIquanaArchive = async (file, name = null) => {
    if (!file) {
        throw new Error("Archive file is required");
    }

    const formData = new FormData();
    formData.append("file", file);
    if (name && name.trim()) {
        formData.append("name", name.trim());
    }

    const authHeaders = getAuthHeaders();
    const headers = { ...authHeaders };
    delete headers["Content-Type"];

    const response = await fetch(`${API_BASE_URL}/datasets/import/iquana`, {
        method: "POST",
        headers,
        body: formData,
    });

    if (!response.ok) {
        let message = `Import failed (${response.status})`;
        let detail = null;
        try {
            const data = await response.json();
            detail = data.detail;
            message = detail || data.message || message;
        } catch (_) {
            // non-JSON response
        }
        const error = new Error(message);
        error.status = response.status;
        error.detail = detail;
        throw error;
    }

    return await response.json();
};