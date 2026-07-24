/**
 * Answers "may the current user do X here?" for the UI.
 *
 * Permissions come from the backend, which attaches `my_role` and
 * `my_permissions` to every dataset payload. Nothing is computed client-side
 * from the role name, so adding a permission to a role on the server takes
 * effect here without a frontend change.
 *
 * This only decides what to *show*. Every action is re-checked server-side, so a
 * stale permission list can never do more than surface a button that 403s.
 */
import { useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDataset } from '../contexts/DatasetContext';
import { GlobalRole, Permission, hasPermission } from '../utils/permissions';

/**
 * @param {Object|number|null} [datasetOrId] - Dataset object, dataset id, or omitted
 *   to use the currently selected dataset.
 * @returns {{
 *   role: string|null,
 *   permissions: string[],
 *   globalRole: string,
 *   isAdmin: boolean,
 *   can: (permission: string) => boolean,
 *   canAny: (permissions: string[]) => boolean,
 *   canAll: (permissions: string[]) => boolean,
 *   canCreateDatasets: boolean,
 *   canManageUsers: boolean,
 * }}
 */
export function usePermissions(datasetOrId) {
    const { user } = useAuth();
    const { currentDataset, datasets } = useDataset();

    const dataset = useMemo(() => {
        if (datasetOrId && typeof datasetOrId === 'object') return datasetOrId;
        if (datasetOrId !== undefined && datasetOrId !== null) {
            const id = Number(datasetOrId);
            // Prefer the freshly-listed copy: it is the one carrying my_permissions.
            return datasets?.find((d) => Number(d.id) === id) || null;
        }
        return currentDataset || null;
    }, [datasetOrId, datasets, currentDataset]);

    const globalRole = user?.global_role || GlobalRole.MEMBER;
    const isAdmin = globalRole === GlobalRole.ADMIN || Boolean(user?.is_admin);

    const permissions = useMemo(() => {
        if (Array.isArray(dataset?.my_permissions)) return dataset.my_permissions;
        // Fall back to the membership map on /auth/me for datasets fetched by a
        // route that does not include the permission list.
        const membership = dataset?.id != null
            ? user?.memberships?.[dataset.id] ?? user?.memberships?.[String(dataset.id)]
            : null;
        return membership?.permissions || [];
    }, [dataset, user]);

    const role = dataset?.my_role
        ?? (dataset?.id != null
            ? (user?.memberships?.[dataset.id] ?? user?.memberships?.[String(dataset.id)])?.role
            : null)
        ?? null;

    const can = useCallback(
        (permission) => {
            // An admin bypasses dataset membership entirely, matching the backend.
            if (isAdmin) return true;
            return hasPermission(permissions, permission);
        },
        [isAdmin, permissions]
    );

    const canAny = useCallback(
        (wanted) => (wanted || []).some((permission) => can(permission)),
        [can]
    );

    const canAll = useCallback(
        (wanted) => (wanted || []).every((permission) => can(permission)),
        [can]
    );

    return {
        role,
        permissions,
        globalRole,
        isAdmin,
        can,
        canAny,
        canAll,
        // Global permissions are answered by the account, not by any dataset.
        canCreateDatasets: isAdmin || globalRole === GlobalRole.MEMBER,
        canManageUsers: isAdmin,
    };
}

export { Permission };
export default usePermissions;
