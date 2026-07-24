/**
 * Review endpoints: sending annotation work back with a reason, and clearing it again.
 *
 * Approving a single contour lives in `api/contours.js`; rejecting lives here
 * because a rejection can be about the mask as a whole ("objects are missing")
 * rather than any one contour.
 */
import { handleApiError, getAuthHeaders, buildUrl } from "./util";
import { API_BASE_URL } from "./config";

const jsonHeaders = () => getAuthHeaders({ "Content-Type": "application/json" });

/**
 * Fetch the predefined rejection reasons with their display labels.
 *
 * The wording lives with the backend enum so the dropdown cannot drift out of
 * sync with what the API accepts.
 *
 * @returns {Promise<{success: boolean, reasons: Array<{value: string, label: string, requires_note: boolean}>}>}
 */
export const fetchRejectionReasons = async () => {
    const response = await fetch(`${API_BASE_URL}/reviews/reasons`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * Send a mask back to its annotator with a reason.
 *
 * Rejecting clears `fully_annotated`, so the mask leaves the review queue and
 * reappears in the annotator's work list. Its status stays `rejected` until every
 * open rejection is resolved.
 *
 * @param {number} maskId
 * @param {Object} rejection
 * @param {string} rejection.reason - A value from `fetchRejectionReasons`.
 * @param {string} [rejection.note] - Free-text detail. Required when reason is "other".
 * @param {number} [rejection.contourId] - Reject one object; omit for a mask-level problem.
 */
export const rejectMask = async (maskId, { reason, note = null, contourId = null }) => {
    const response = await fetch(`${API_BASE_URL}/reviews/masks/${maskId}/reject`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ reason, note, contour_id: contourId }),
    });
    return handleApiError(response);
};

/**
 * List rejections recorded against a mask, newest first.
 *
 * Readable by annotators as well as reviewers — an annotator has to be able to
 * see why their work came back.
 *
 * @param {number} maskId
 * @param {boolean} [openOnly=false] - Only rejections that have not been resolved.
 */
export const fetchMaskRejections = async (maskId, openOnly = false) => {
    const url = buildUrl(API_BASE_URL, `/reviews/masks/${maskId}/rejections`, {
        open_only: openOnly,
    });
    const response = await fetch(url, { headers: getAuthHeaders() });
    return handleApiError(response);
};

/**
 * Mark one rejection as addressed.
 *
 * @param {number} rejectionId
 * @param {"fixed"|"wont_fix"|null} [resolution] - How it was closed. The correction
 *   queue sends "fixed" for "Mark as done" and "wont_fix" for "Won't fix"; omit for
 *   an unspecified resolve (e.g. the RejectionBanner's plain "Done").
 */
export const resolveRejection = async (rejectionId, resolution = null) => {
    const response = await fetch(
        `${API_BASE_URL}/reviews/rejections/${rejectionId}/resolve`,
        {
            method: "PATCH",
            headers: jsonHeaders(),
            body: JSON.stringify({ resolution }),
        }
    );
    return handleApiError(response);
};

/**
 * Clear every open rejection on a mask, e.g. after reworking it.
 * @param {number} maskId
 */
export const resolveAllMaskRejections = async (maskId) => {
    const response = await fetch(
        `${API_BASE_URL}/reviews/masks/${maskId}/rejections/resolve`,
        { method: "PATCH", headers: getAuthHeaders() }
    );
    return handleApiError(response);
};

/**
 * How much review work a dataset holds, plus the available queue orderings.
 *
 * Backs the "There are x instances to review" line on the management card and
 * the strategy dropdown on the review setup page.
 *
 * @param {number|string} datasetId
 * @returns {Promise<{success: boolean, summary: {
 *   pending_instances: number, pending_images: number, open_rejections: number,
 *   strategies: Array<{key: string, label: string, description: string}>,
 * }}>}
 */
export const fetchReviewSummary = async (datasetId) => {
    const response = await fetch(
        `${API_BASE_URL}/reviews/datasets/${datasetId}/summary`,
        { headers: getAuthHeaders() }
    );
    return handleApiError(response);
};

/**
 * Build the ordered work list for one review session.
 *
 * The queue is a snapshot, not a reservation: nothing is locked server-side, so
 * an item someone else handles mid-session simply no-ops when acted on.
 *
 * @param {number|string} datasetId
 * @param {Object} options
 * @param {"images"|"hierarchy"|"custom"} options.granularity
 * @param {string} [options.sortStrategy="hierarchy"] - A key from the summary's `strategies`.
 * @param {"asc"|"desc"} [options.direction="asc"]
 * @param {number[]} [options.labelIds] - Required for "custom" granularity.
 * @param {boolean} [options.onlySubmitted=true] - Only masks submitted for review.
 * @param {boolean} [options.includeReviewed=false] - Also queue instances other
 *   reviewers approved, to add a second opinion. The caller's own approvals stay out.
 */
export const buildReviewQueue = async (
    datasetId,
    {
        granularity,
        sortStrategy = "hierarchy",
        direction = "asc",
        labelIds = null,
        onlySubmitted = true,
        includeReviewed = false,
    }
) => {
    const response = await fetch(`${API_BASE_URL}/reviews/datasets/${datasetId}/queue`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
            granularity,
            sort_strategy: sortStrategy,
            direction,
            label_ids: labelIds,
            only_submitted: onlySubmitted,
            include_reviewed: includeReviewed,
        }),
    });
    return handleApiError(response);
};

/**
 * Approve every not-yet-reviewed contour of a mask at once — the image-level
 * "Accept" of the review queue. The caller's own annotations are skipped
 * (separation of duties) and returned in `skipped`.
 *
 * @param {number} maskId
 * @param {Object} [options]
 * @param {boolean} [options.includeReviewed=false] - Also add the caller's
 *   approval on top of contours other reviewers already approved, matching a
 *   queue built with the same flag.
 * @returns {Promise<{success: boolean, approved: number[], skipped: number[]}>}
 */
export const approveMask = async (maskId, { includeReviewed = false } = {}) => {
    const url = buildUrl(API_BASE_URL, `/reviews/masks/${maskId}/approve`, {
        include_reviewed: includeReviewed,
    });
    const response = await fetch(url, {
        method: "POST",
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * How much correction work a dataset holds — the count behind the "x instances
 * sent back for correction" line on the Correct management card.
 *
 * @param {number|string} datasetId
 * @returns {Promise<{success: boolean, summary: {
 *   open_rejections: number, affected_instances: number, affected_images: number,
 * }}>}
 */
export const fetchCorrectionSummary = async (datasetId) => {
    const response = await fetch(
        `${API_BASE_URL}/reviews/datasets/${datasetId}/correction-summary`,
        { headers: getAuthHeaders() }
    );
    return handleApiError(response);
};

/**
 * Build the ordered work list for one correction session: every open rejection in
 * the dataset, grouped by image. The queue is a snapshot, not a reservation — an
 * item someone else resolves mid-session simply no-ops when acted on.
 *
 * @param {number|string} datasetId
 * @param {Object} [options]
 * @param {"oldest"|"newest"} [options.order="oldest"]
 * @param {string[]} [options.reasons] - Only these rejection reasons; omit for all.
 * @returns {Promise<{success: boolean, queue: {
 *   order: string, total: number, items: Array<{
 *     rejection_id: number, mask_id: number, image_id: number, contour_id: number|null,
 *     reason: string, reason_label: string, note: string|null,
 *     created_by: string|null, created_at: string,
 *   }>,
 * }}>}
 */
export const buildCorrectionQueue = async (
    datasetId,
    { order = "oldest", reasons = null } = {}
) => {
    const response = await fetch(
        `${API_BASE_URL}/reviews/datasets/${datasetId}/correction-queue`,
        {
            method: "POST",
            headers: jsonHeaders(),
            body: JSON.stringify({ order, reasons }),
        }
    );
    return handleApiError(response);
};
