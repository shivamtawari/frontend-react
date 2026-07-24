/**
 * Platform administration. Every call here needs a global permission, so only
 * accounts with `global_role === "admin"` can use them.
 */
import { handleApiError, getAuthHeaders, buildUrl } from "./util";
import { API_BASE_URL } from "./config";

const jsonHeaders = () => getAuthHeaders({ "Content-Type": "application/json" });

/**
 * List every account with its global role and dataset count.
 * @returns {Promise<{success: boolean, users: Array<{username: string, global_role: string, is_active: boolean, dataset_count: number}>}>}
 */
export const fetchUsers = async () => {
    const response = await fetch(`${API_BASE_URL}/admin/users`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * Change an account's platform-level role.
 *
 * `guest` cannot create datasets and only works inside datasets they were
 * invited to; `member` is the default; `admin` bypasses dataset membership
 * entirely.
 *
 * @param {string} username
 * @param {"admin"|"member"|"guest"} globalRole
 */
export const setGlobalRole = async (username, globalRole) => {
    const response = await fetch(
        `${API_BASE_URL}/admin/users/${encodeURIComponent(username)}/global_role`,
        {
            method: "PATCH",
            headers: jsonHeaders(),
            body: JSON.stringify({ global_role: globalRole }),
        }
    );
    return handleApiError(response);
};

/**
 * Enable or disable an account.
 *
 * Deactivation is preferred over deletion: it revokes access immediately while
 * leaving the annotations and review history the account produced intact.
 *
 * @param {string} username
 * @param {boolean} isActive
 */
export const setUserActive = async (username, isActive) => {
    const url = buildUrl(
        API_BASE_URL,
        `/admin/users/${encodeURIComponent(username)}/active`,
        { is_active: isActive }
    );
    const response = await fetch(url, { method: "PATCH", headers: getAuthHeaders() });
    return handleApiError(response);
};
