/**
 * API client functions for image pixel-scale endpoints.
 *
 * All fetch() calls live here — never in components or stores (RULE: api/ layer
 * is the single point of contact with the backend for scale operations).
 */
import { getAuthHeaders, handleApiError } from "./util";
import { API_BASE_URL } from "./config";

/**
 * Fetch the current physical scale stored for an image.
 *
 * @param {number} imageId
 * @returns {Promise<{scale_x: number, scale_y: number, unit: string}>}
 */
export const getPixelScale = async (imageId) => {
  const response = await fetch(`${API_BASE_URL}/scale/get_pixel_scale/${imageId}`, {
    headers: getAuthHeaders(),
  });
  return handleApiError(response);
};

/**
 * Manually set the physical scale for a single image.
 *
 * @param {number} imageId
 * @param {number} scaleX  Physical size of one pixel along x (in `unit` units).
 * @param {number} scaleY  Physical size of one pixel along y (in `unit` units).
 * @param {string} unit    Length unit string, e.g. "mm" or "µm".
 * @returns {Promise<{message: string, scale_x: number, scale_y: number, unit: string}>}
 */
export const setPixelScale = async (imageId, scaleX, scaleY, unit) => {
  const response = await fetch(`${API_BASE_URL}/scale/set_pixel_scale`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ image_id: imageId, scale_x: scaleX, scale_y: scaleY, unit }),
  });
  return handleApiError(response);
};

/**
 * Compute and store the physical scale from a user-drawn calibration line.
 *
 * The user draws a line between two known points on the image (pixel coordinates,
 * NOT normalised 0-1 fractions) and provides the real-world distance between them.
 *
 * @param {number} imageId
 * @param {{x: number, y: number}} p1  First point in image pixels.
 * @param {{x: number, y: number}} p2  Second point in image pixels.
 * @param {number} knownDistance       Real-world distance between p1 and p2.
 * @param {string} unit                Unit of knownDistance, e.g. "mm".
 * @returns {Promise<{message: string, scale_x: number, scale_y: number, unit: string, pixel_distance: number}>}
 */
export const setPixelScaleViaDrawnLine = async (imageId, p1, p2, knownDistance, unit) => {
  const response = await fetch(`${API_BASE_URL}/scale/set_pixel_scale_via_drawn_line`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      image_id: imageId,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      known_distance: knownDistance,
      unit,
    }),
  });
  return handleApiError(response);
};

/**
 * Apply the same physical scale to every image in a dataset.
 *
 * @param {number} datasetId
 * @param {number} scaleX
 * @param {number} scaleY
 * @param {string} unit
 * @returns {Promise<{message: string, images_updated: number, images_total: number, scale_x: number, scale_y: number, unit: string}>}
 */
export const applyScaleToDataset = async (datasetId, scaleX, scaleY, unit) => {
  const response = await fetch(`${API_BASE_URL}/scale/apply_to_dataset`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ dataset_id: datasetId, scale_x: scaleX, scale_y: scaleY, unit }),
  });
  return handleApiError(response);
};
