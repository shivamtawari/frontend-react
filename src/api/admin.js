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

/**
 * Create an account outright, without an invite or self-registration.
 *
 * An instance is closed by default and an invite only ever grants access to one
 * dataset, so this is how somebody is handed an account at all. The password is
 * chosen here and passed on out of band — iquana sends no mail, so there is
 * nowhere to deliver an activation link to.
 *
 * @param {{username: string, password: string, global_role?: string, is_active?: boolean}} account
 */
export const createUser = async (account) => {
    const response = await fetch(`${API_BASE_URL}/admin/users`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(account),
    });
    return handleApiError(response);
};

/**
 * Describe every editable instance setting, plus the AI service's live state.
 *
 * Secrets come back as `{is_set, hint}` and never as a value — the field renders
 * blank and is only ever written to.
 *
 * @returns {Promise<{success: boolean, groups: Array, settings: Array, ai_service: Object}>}
 */
export const fetchSettings = async () => {
    const response = await fetch(`${API_BASE_URL}/admin/settings`, {
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};

/**
 * Store overrides for the given settings.
 *
 * Sparse on purpose: send only what was edited, so two admins on different tabs
 * cannot clobber each other. An empty string for a secret means "leave it
 * alone", because the current value is never sent to the browser to begin with.
 *
 * @param {Object<string, string|null>} values - `{settingKey: newValue}`
 */
export const updateSettings = async (values) => {
    const response = await fetch(`${API_BASE_URL}/admin/settings`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ values }),
    });
    return handleApiError(response);
};

/**
 * Drop one override, falling back to the value configured for the deployment.
 * @param {string} key
 */
export const clearSetting = async (key) => {
    const response = await fetch(
        `${API_BASE_URL}/admin/settings/${encodeURIComponent(key)}`,
        { method: "DELETE", headers: getAuthHeaders() }
    );
    return handleApiError(response);
};

/**
 * Re-send the settings the AI service consumes.
 *
 * That service holds them in memory, so restarting it drops whatever was pushed;
 * this is how an operator puts them back without editing a second `.env`.
 */
export const pushSettings = async () => {
    const response = await fetch(`${API_BASE_URL}/admin/settings/push`, {
        method: "POST",
        headers: getAuthHeaders(),
    });
    return handleApiError(response);
};
