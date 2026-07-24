/**
 * Dataset membership, roles and invite links.
 *
 * Mirrors the backend's two-level access model: a global role on the account
 * (admin / member / guest) and a per-dataset role on the membership row
 * (viewer / annotator / reviewer / curator / owner).
 */
import { handleApiError, getAuthHeaders, buildUrl } from "./util";
import { API_BASE_URL } from "./config";

const jsonHeaders = () => getAuthHeaders({ "Content-Type": "application/json" });

/**
 * Fetch the role -> permission matrix.
 *
 * Served by the backend rather than duplicated here, so the two cannot drift
 * apart when a permission is added.
 *
 * @returns {Promise<{success: boolean, roles: Array<{role: string, permissions: string[]}>, global_permissions: string[]}>}
 */
export const fetchRoleCatalog = async () => {
    const response = await fetch(`${API_BASE_URL}/datasets/roles/catalog`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * List everyone with a role on a dataset.
 * @param {number} datasetId
 */
export const fetchMembers = async (datasetId) => {
    const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/members`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * Add a collaborator or change their role.
 *
 * `extraPermissions` / `deniedPermissions` are the escape hatch for one-off
 * exceptions — e.g. letting a single annotator download quantification results —
 * without inventing a new role. Denials win over grants.
 *
 * @param {number} datasetId
 * @param {string} username
 * @param {string} role - one of viewer|annotator|reviewer|curator
 * @param {Object} [options]
 * @param {string[]} [options.extraPermissions]
 * @param {string[]} [options.deniedPermissions]
 */
export const grantMemberRole = async (
    datasetId,
    username,
    role,
    { extraPermissions = [], deniedPermissions = [] } = {}
) => {
    const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/members`, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({
            username,
            role,
            extra_permissions: extraPermissions,
            denied_permissions: deniedPermissions,
        }),
    });
    return handleApiError(response);
};

/**
 * Remove a collaborator's access. Their annotations are left untouched.
 * @param {number} datasetId
 * @param {string} username
 */
export const revokeMember = async (datasetId, username) => {
    const response = await fetch(
        `${API_BASE_URL}/datasets/${datasetId}/members/${encodeURIComponent(username)}`,
        { method: "DELETE", headers: getAuthHeaders() }
    );
    return handleApiError(response);
};

/**
 * Hand ownership to another account. The current owner becomes a curator.
 * @param {number} datasetId
 * @param {string} newOwner
 */
export const transferOwnership = async (datasetId, newOwner) => {
    const url = buildUrl(API_BASE_URL, `/datasets/${datasetId}/transfer_ownership`, {
        new_owner: newOwner,
    });
    const response = await fetch(url, { method: "POST", headers: getAuthHeaders() });
    return handleApiError(response);
};

/**
 * Mint a shareable invite link.
 *
 * The raw token comes back exactly once — the backend only stores its hash — so
 * the caller must show it to the user immediately.
 *
 * @param {number} datasetId
 * @param {Object} [options]
 * @param {string} [options.role="annotator"] - Role granted on redemption. Owner is rejected.
 * @param {number|null} [options.expiresInHours=168] - null means the link never expires.
 * @param {number|null} [options.maxUses=null] - null means unlimited.
 * @returns {Promise<{token: string, invite_path: string, invite: Object}>}
 */
export const createInvite = async (
    datasetId,
    { role = "annotator", expiresInHours = 168, maxUses = null } = {}
) => {
    const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/invites`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
            role,
            expires_in_hours: expiresInHours,
            max_uses: maxUses,
        }),
    });
    return handleApiError(response);
};

/**
 * List a dataset's invite links. Tokens are never returned, only their metadata.
 * @param {number} datasetId
 * @param {boolean} [includeInactive=false] - Also list expired/revoked/used-up links.
 */
export const fetchInvites = async (datasetId, includeInactive = false) => {
    const url = buildUrl(API_BASE_URL, `/datasets/${datasetId}/invites`, {
        include_inactive: includeInactive,
    });
    const response = await fetch(url, { headers: getAuthHeaders() });
    return handleApiError(response);
};

/**
 * Disable an invite link. Members who already joined through it keep access.
 * @param {number} datasetId
 * @param {number} inviteId
 */
export const revokeInvite = async (datasetId, inviteId) => {
    const response = await fetch(
        `${API_BASE_URL}/datasets/${datasetId}/invites/${inviteId}`,
        { method: "DELETE", headers: getAuthHeaders() }
    );
    return handleApiError(response);
};

/**
 * See what an invite link would grant, before accepting it.
 * @param {string} token
 */
export const previewInvite = async (token) => {
    const response = await fetch(
        `${API_BASE_URL}/invites/${encodeURIComponent(token)}`,
        { headers: getAuthHeaders() }
    );
    return handleApiError(response);
};

/**
 * Join a dataset via an invite link. Never lowers an existing role.
 * @param {string} token
 */
export const acceptInvite = async (token) => {
    const response = await fetch(
        `${API_BASE_URL}/invites/${encodeURIComponent(token)}/accept`,
        { method: "POST", headers: getAuthHeaders() }
    );
    return handleApiError(response);
};

/**
 * Update per-dataset settings.
 *
 * With `requireIndependentReview` on, a contour cannot be approved by whoever
 * created it. Off by default, because a single owner annotating their own
 * dataset would otherwise never be able to finish it.
 *
 * @param {number} datasetId
 * @param {{requireIndependentReview?: boolean}} settings
 */
export const updateDatasetSettings = async (datasetId, { requireIndependentReview } = {}) => {
    const params = {};
    if (requireIndependentReview !== undefined) {
        params.require_independent_review = requireIndependentReview;
    }
    const url = buildUrl(API_BASE_URL, `/datasets/${datasetId}/settings`, params);
    const response = await fetch(url, { method: "PATCH", headers: getAuthHeaders() });
    return handleApiError(response);
};
