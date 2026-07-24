import { handleApiError, getAuthHeaders, buildUrl } from "../api/util";

import { API_BASE_URL } from "./config";

export const markMaskAsFinal = async (maskId) => {
    try {
        // Validate maskId
        if (!maskId || typeof maskId !== "number") {
            throw new Error("Invalid mask ID provided");
        }

        // Send request to mark the mask as complete
        const response = await fetch(`${API_BASE_URL}/masks/${maskId}/status/complete`, {
            method: "PATCH",
            headers: getAuthHeaders({
                "Content-Type": "application/json",
            }),
        });
        return handleApiError(response);
    } catch (error) {
        throw error;
    }
}

export const markMaskAsUnfinished = async (maskId) => {
    try {
        // Validate maskId
        if (!maskId || typeof maskId !== "number") {
            throw new Error("Invalid mask ID provided");
        }

        // Send request to mark the mask as incomplete
        const response = await fetch(`${API_BASE_URL}/masks/${maskId}/status/incomplete`, {
            method: "PATCH",
            headers: getAuthHeaders({
                "Content-Type": "application/json",
            }),
        });
        return handleApiError(response);
    } catch (error) {
        throw error;
    }
}

export const getMaskAnnotationStatus = async (maskId) => {
    try {
        // Validate maskId
        if (!maskId || typeof maskId !== "number") {
            throw new Error("Invalid mask ID provided");
        }

        // Send request to get the annotation status of the mask
        const response = await fetch(`${API_BASE_URL}/masks/${maskId}/status`, {
            method: "GET",
            headers: getAuthHeaders({
                "Content-Type": "application/json",
            }),
        });
        return handleApiError(response);
    } catch (error) {
        throw error;
    }
}

// Save a mask
export const saveMask = async (imageId, label, contours) => {
    try {
        // Validate parameters
        if (imageId === undefined || imageId === null) {
            throw new Error("Image ID is required");
        }

        if (!label || typeof label !== "string") {
            throw new Error("Label is required and must be a string");
        }

        if (!contours || !Array.isArray(contours) || contours.length === 0) {
            throw new Error("Contours are required and must be a non-empty array");
        }

        // First create a mask to get a mask_id
        const createMaskUrl = `${API_BASE_URL}/masks/create_mask/${imageId}`;

        const createResponse = await fetch(createMaskUrl, {
            method: "PUT",
            headers: getAuthHeaders({
                "Content-Type": "application/json",
            }),
        });

        if (!createResponse.ok) {
            throw new Error(
                `Failed to create mask: ${createResponse.status} ${createResponse.statusText}`
            );
        }

        const createResult = await createResponse.json();

        if (!createResult || !createResult.mask_id) {
            throw new Error("Failed to get mask ID from create_mask response");
        }

        const maskId = createResult.mask_id;

        // Now add each contour to the mask
        const results = [];

        for (let i = 0; i < contours.length; i++) {
            const contour = contours[i];

            // Build URL with query parameters
            const urlParams = {
                mask_id: maskId
            };

            if (i > 0 && results.length > 0 && results[i - 1].contour_id) {
                // If we have a previous contour, we can set it as parent
                urlParams.parent_contour_id = results[i - 1].contour_id;
            }

            const addContourUrl = buildUrl(API_BASE_URL, '/masks/add_contour', urlParams);

            const addResponse = await fetch(addContourUrl, {
                method: "POST",
                headers: getAuthHeaders({
                    "Content-Type": "application/json",
                }),
                body: JSON.stringify({
                    x: contour.x,
                    y: contour.y,
                    label_id: contour.labelId ?? contour.label_id ?? (typeof contour.label === 'number' ? contour.label : null),
                }),
            });

            if (!addResponse.ok) {
                continue; // Try to continue with the next contour
            }

            const addResult = await addResponse.json();
            results.push(addResult);
        }

        // Return information about the mask and contours
        return {
            id: maskId,
            success: true,
            message: `Created mask with ${results.length} contours`,
            contours: results.map((r) => r.contour_id),
        };
    } catch (error) {
        throw error;
    }
};

// Get all masks for an image
export const getMasksForImage = async (imageId) => {
    try {
        // Add a timeout to avoid hanging on slow requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const url = `${API_BASE_URL}/images/${imageId}/masks`;

            const response = await fetch(url, {
                signal: controller.signal,
                method: "GET",
                headers: getAuthHeaders(),
            });

            clearTimeout(timeoutId);

            // Handle the case where the backend returns 404 (which is expected if no masks exist)
            if (response.status === 404) {
                return {
                    success: true,
                    message: "No masks found for this image yet",
                    masks: [],
                };
            }

            // For other error status codes, handle them through structured error responses
            if (!response.ok) {
                // Try to parse error response
                try {
                    const errorData = await response.json();
                    return {
                        success: false,
                        message:
                            errorData.detail ||
                            `Error ${response.status}: ${response.statusText}`,
                        masks: [],
                    };
                } catch (e) {
                    // If we can't parse the error as JSON, use the status text
                    return {
                        success: false,
                        message: `Error ${response.status}: ${response.statusText}`,
                        masks: [],
                    };
                }
            }

            const data = await response.json();

            // Backend returns {success: true, masks: [...]}
            if (data.success && Array.isArray(data.masks)) {
                return {
                    success: true,
                    message: data.message || "Masks retrieved successfully",
                    masks: data.masks.map((mask) => ({
                        ...mask,
                        contours: mask.contours || [],
                    })),
                };
            }

            // If masks array is missing or empty, return empty array
            return {
                success: true,
                message: data.message || "Masks retrieved successfully",
                masks: [],
            };
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    } catch (error) {
        // Return a safe response instead of throwing
        return {
            success: false,
            message:
                "Cannot retrieve masks: " +
                (error.name === "AbortError"
                    ? "Request timed out"
                    : error.message || "Unknown error"),
            masks: [],
        };
    }
};

// Get a mask with its contours properly loaded
export const getMaskWithContours = async (maskId) => {
    try {
        // Add a timeout to avoid hanging on slow requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            // First get the basic mask info
            const response = await fetch(`${API_BASE_URL}/masks/get_mask/${maskId}`, {
                signal: controller.signal,
                headers: getAuthHeaders(),
            });

            // Handle 404 and other errors
            if (response.status === 404) {
                return {
                    success: false,
                    message: `Mask not found`,
                    mask: null,
                };
            }

            if (!response.ok) {
                return {
                    success: false,
                    message: `Error ${response.status}: ${response.statusText}`,
                    mask: null,
                };
            }

            // Parse mask data
            const maskData = await response.json();

            // Now fetch the contours for this mask
            const contoursResponse = await fetch(
                `${API_BASE_URL}/masks/${maskId}/contours?flattened=true`,
                {
                    signal: controller.signal,
                    headers: getAuthHeaders(),
                }
            );

            // Clear timeout once both requests complete
            clearTimeout(timeoutId);

            // Handle 404 for contours request (mask exists but has no contours)
            if (contoursResponse.status === 404) {
                return {
                    success: true,
                    message: "Mask found but has no contours",
                    mask: {
                        ...maskData,
                        contours: [],
                    },
                };
            }

            // Handle other errors for contours request
            if (!contoursResponse.ok) {
                return {
                    success: true,
                    message: `Mask found but error fetching contours: ${contoursResponse.status}`,
                    mask: {
                        ...maskData,
                        contours: [],
                    },
                };
            }

            // Parse contours data
            const contoursData = await contoursResponse.json();

            // Format contours data for frontend use
            const formattedContours = contoursData.map((contour) => {
                let coords = {};
                try {
                    coords = JSON.parse(contour.coords);
                } catch (e) {
                    coords = { x: [], y: [] };
                }

                return {
                    id: contour.id,
                    x: coords.x || [],
                    y: coords.y || [],
                    label_id: contour.labelId ?? contour.label_id ?? (typeof contour.label === 'number' ? contour.label : null),
                    parent_id: contour.parent_id,
                };
            });

            // Combine mask data with contours
            return {
                success: true,
                mask: {
                    ...maskData,
                    contours: formattedContours,
                },
            };
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    } catch (error) {
        // Return appropriate error based on error type

        // Return a safe response instead of throwing
        return {
            success: false,
            message:
                "Cannot retrieve mask details: " +
                (error.name === "AbortError"
                    ? "Request timed out"
                    : error.message || "Unknown error"),
            mask: null,
        };
    }
};

/**
 * Retrieves the final mask for an image by getting masks for the image.
 * This function uses the existing mask endpoints since there's no specialized final mask endpoint.
 * The "final mask" concept is implemented by treating finished=true masks as final.
 *
 * @param {number} imageId - The ID of the image to get the final mask for.
 * @returns {Promise<Object>} - A response object containing the final mask with its contours if found.
 */
export async function getFinalMask(imageId) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second
    let attempts = 0;

    while (attempts < MAX_RETRIES) {
        try {
            const response = await fetch(
                `${API_BASE_URL}/images/${imageId}/masks`,
                {
                    method: "GET",
                    headers: getAuthHeaders({
                        "Content-Type": "application/json",
                    }),
                }
            );

            // If mask not found, return appropriate message
            if (response.status === 404) {
                return {
                    success: false,
                    message: "No masks found for this image.",
                };
            }

            // Handle other errors
            if (!response.ok) {
                let errorMessage = `Error ${response.status}: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorMessage;
                } catch (e) {
                    // Ignore JSON parsing error
                }
                return {
                    success: false,
                    message: errorMessage,
                };
            }

            // Parse and return the successful response
            const data = await response.json();

            // Backend returns {success: true, masks: [...]} - get the first mask
            if (data.success && Array.isArray(data.masks) && data.masks.length > 0) {
                var finalMask = data.masks[0];
            } else {
                return {
                    success: false,
                    message: "No masks found for this image.",
                };
            }

            // Get contours for the final mask
            try {
                const contoursResponse = await fetch(
                    `${API_BASE_URL}/masks/${finalMask.id}/contours?flattened=true`,
                    {
                        method: "GET",
                        headers: getAuthHeaders({
                            "Content-Type": "application/json",
                        }),
                    }
                );

                if (contoursResponse.ok) {
                    const contoursData = await contoursResponse.json();
                    
                    if (contoursData.success && contoursData.contours) {
                        finalMask.contours = contoursData.contours;
                    } else {
                        finalMask.contours = [];
                    }
                } else {
                    finalMask.contours = [];
                }
            } catch (contoursError) {
                finalMask.contours = [];
            }

            return {
                success: true,
                mask: finalMask,
                message: "Final mask retrieved successfully",
            };
        } catch (error) {
            attempts++;

            if (attempts >= MAX_RETRIES) {
                return {
                    success: false,
                    message: `Failed to fetch mask after ${MAX_RETRIES} attempts: ${error.message}`,
                };
            }

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        }
    }
}

/**
 * Creates a final mask for an image if one doesn't exist yet.
 * Uses the backend's create_mask endpoint and marks it as finished.
 *
 * @param {number} imageId - The ID of the image to create a final mask for.
 * @returns {Promise<Object>} - Response with success status and mask_id.
 */
export async function createFinalMask(imageId) {
    try {
        // First, try to create a mask using the backend endpoint
        const response = await fetch(
            `${API_BASE_URL}/masks/create_mask/${imageId}`,
            {
                method: "PUT",
                headers: getAuthHeaders({
                    "Content-Type": "application/json",
                }),
            }
        );

        // Handle errors
        if (!response.ok) {
            let errorMessage = `Error ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                // Ignore JSON parsing error
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (data.success) {
            return {
                success: true,
                mask_id: data.mask_id,
                message: data.message || "Final mask created successfully",
            };
        } else {
            throw new Error(data.message || "Failed to create final mask");
        }
    } catch (error) {
        throw new Error(`Failed to create final mask: ${error.message}`);
    }
}

/**
 * Adds a contour to the final mask of an image.
 * Creates the final mask if it doesn't exist yet.
 * Uses the backend's add_contour endpoint.
 *
 * @param {number} imageId - The ID of the image.
 * @param {Object} contour - The contour to add.
 * @returns {Promise<Object>} - Response with success status and contour ID.
 */
export async function addContourToFinalMask(imageId, contour) {
    try {
        if (!imageId || typeof imageId !== "number") {
            throw new Error("Invalid imageId provided");
        }

        if (!contour || typeof contour !== "object") {
            throw new Error("Invalid contour provided");
        }

        // Ensure the final mask exists first
        let maskId;
        try {
            const finalMaskResponse = await getFinalMask(imageId);
            if (finalMaskResponse.success && finalMaskResponse.mask) {
                maskId = finalMaskResponse.mask.id;
            } else {
                // Create a new mask if none exists
                const createResponse = await createFinalMask(imageId);
                if (createResponse.success) {
                    maskId = createResponse.mask_id;
                } else {
                    throw new Error("Failed to create final mask");
                }
            }
        } catch (error) {
            throw new Error(`Failed to prepare final mask: ${error.message}`);
        }

        // Prepare the contour data in the format expected by the backend
        const contourData = {
            x: contour.x || [],
            y: contour.y || [],
            label_id: contour.labelId ?? contour.label_id ?? (typeof contour.label === 'number' ? contour.label : null),
        };

        // Build URL params
        const urlParams = {
            mask_id: maskId
        };

        // Add parent_contour_id if specified
        if (contour.parent_contour_id) {
            urlParams.parent_contour_id = contour.parent_contour_id;
        }

        const url = buildUrl(API_BASE_URL, '/contours/add_contour', urlParams);

        const response = await fetch(url, {
            method: "POST",
            headers: getAuthHeaders({
                "Content-Type": "application/json",
            }),
            body: JSON.stringify(contourData),
        });

        // Handle errors
        if (!response.ok) {
            let errorMessage = `Error ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorData.detail || errorMessage;
            } catch (e) {
                // Ignore JSON parsing error
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (data.success) {
            return {
                success: true,
                contour_id: data.contour_id,
                mask_id: maskId,
                message: data.message || "Contour added successfully",
            };
        } else {
            throw new Error(data.message || "Failed to add contour");
        }
    } catch (error) {
        throw new Error(`Failed to add contour to final mask: ${error.message}`);
    }
}

/**
 * Adds multiple contours to the final mask of an image.
 * Creates the final mask if it doesn't exist yet.
 *
 * @param {number} imageId - The ID of the image.
 * @param {Array<Object>} contours - Array of contours to add, each with x, y coordinates and a label.
 * @returns {Promise<Object>} - Response with the mask ID and array of contour IDs.
 */
export async function addContoursToFinalMask(imageId, contours) {
    try {
        // Validate parameters
        if (!imageId || typeof imageId !== "number") {
            return {
                success: false,
                message: "Invalid image ID.",
            };
        }

        if (!Array.isArray(contours) || contours.length === 0) {
            return {
                success: false,
                message: "Invalid contours data. Must provide an array of contours.",
            };
        }

        // Validate each contour
        for (const contour of contours) {
            if (
                !contour ||
                !Array.isArray(contour.x) ||
                !Array.isArray(contour.y) ||
                contour.label === undefined
            ) {
                return {
                    success: false,
                    message:
                        "Invalid contour data. Each contour must include x and y coordinate arrays and a label.",
                };
            }
        }

        // First, create or get the mask for this image
        const createMaskResponse = await fetch(
            `${API_BASE_URL}/masks/create_mask/${imageId}`,
            {
                method: "PUT",
                headers: getAuthHeaders({
                    "Content-Type": "application/json",
                }),
            }
        );

        if (!createMaskResponse.ok) {
            return {
                success: false,
                message: `Failed to create mask: ${createMaskResponse.status} ${createMaskResponse.statusText}`,
            };
        }

        const createResult = await createMaskResponse.json();
        const maskId = createResult.mask_id;

        // Now add the contours using the correct endpoint
        const url = buildUrl(API_BASE_URL, '/contours/add_contours', {
            mask_id: maskId
        });

        // Format contours for the backend
        const formattedContours = contours.map((contour) => ({
            x: contour.x,
            y: contour.y,
            label_id: contour.labelId ?? contour.label_id ?? (typeof contour.label === 'number' ? contour.label : null),
        }));

        const response = await fetch(url, {
            method: "POST",
            headers: getAuthHeaders({
                "Content-Type": "application/json",
            }),
            body: JSON.stringify(formattedContours),
        });

        if (!response.ok) {
            let errorMessage = `Error ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                // Ignore JSON parsing error
            }
            return {
                success: false,
                message: errorMessage,
            };
        }

        const data = await response.json();
        return {
            success: true,
            maskId: maskId,
            contourIds: data.added_ids || [],
            message: data.message || "Contours added successfully",
        };
    } catch (error) {
        return {
            success: false,
            message: `Network error: ${error.message}`,
        };
    }
}

// Update a mask with new contours
export const updateMask = async (mask) => {
    try {
        // Get the mask ID from the mask object
        const maskId = mask.id;
        if (!maskId) {
            throw new Error("Mask ID is required");
        }
        // Ensure contours are in the correct format: x/y arrays and label only
        const formattedContours = mask.contours.map((contour) => {
            return {
                x: contour.x,
                y: contour.y,
                label: parseInt(contour.label || 0, 10), // Ensure it's an integer
            };
        });
        const requestData = {
            mask_id: maskId,
            contours: formattedContours,
            is_final: mask.is_final || false,
        };
        const response = await fetch(`${API_BASE_URL}/masks/update_mask`, {
            method: "PUT",
            headers: getAuthHeaders({
                "Content-Type": "application/json",
            }),
            body: JSON.stringify(requestData),
        });
        return handleApiError(response);
    } catch (error) {
        throw error;
    }
};

// Get a specific mask (basic version without contours)
export const getMask = async (maskId) => {
    try {
        const response = await fetch(`${API_BASE_URL}/masks/get_mask/${maskId}`, {
            headers: getAuthHeaders(),
        });
        return handleApiError(response);
    } catch (error) {
        throw error;
    }
};

// Delete a mask
export const deleteMask = async (maskId) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/masks/delete_mask/${maskId}`,
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

// Edit contour label
export const editContourLabel = async (contourId, newLabelId) => {
    try {
        // Validate parameters
        if (!contourId || typeof contourId !== "number") {
            throw new Error("Invalid contour ID provided");
        }
        
        if (newLabelId === undefined || newLabelId === null) {
            throw new Error("New label ID is required");
        }

        // Send request to edit the contour label
        const url = `${API_BASE_URL}/contours/${contourId}/label?new_label_id=${newLabelId}`;
        
        const response = await fetch(url, {
            method: "PATCH",
            headers: getAuthHeaders({
                "Content-Type": "application/json",
            }),
        });
        
        return handleApiError(response);
    } catch (error) {
        throw error;
    }
};

/**
 * Fetch a mask's contours over REST.
 *
 * The read-only viewer uses this instead of the annotation WebSocket, which
 * delivers the hierarchy only to callers allowed to annotate. Contours come back
 * with a precomputed `path` (an SVG path string in pixel coordinates), so they
 * can be drawn without a canvas.
 *
 * @param {number} maskId
 * @param {boolean} [flattened=true] - Flat list, or the nested parent/child tree.
 */
export const getContoursOfMask = async (maskId, flattened = true) => {
    if (!maskId && maskId !== 0) {
        throw new Error("Mask ID is required");
    }
    const url = buildUrl(API_BASE_URL, `/masks/${maskId}/contours`, {
        flattened,
    });
    const response = await fetch(url, { headers: getAuthHeaders() });
    return handleApiError(response);
};
