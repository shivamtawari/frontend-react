import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';

/**
 * Renders children only if the current user holds the given permission(s) on a dataset.
 *
 * Hiding beats disabling for permissions the user can do nothing about: a greyed
 * out "Delete dataset" button on someone else's dataset is noise, not guidance.
 * Use `fallback` when the absence would be confusing on its own.
 *
 * @param {Object} props
 * @param {string} [props.permission] - Single permission to require.
 * @param {string[]} [props.anyOf] - Render if the user holds at least one of these.
 * @param {string[]} [props.allOf] - Render only if the user holds all of these.
 * @param {Object|number} [props.dataset] - Dataset object or id. Defaults to the selected dataset.
 * @param {React.ReactNode} [props.fallback=null] - Rendered instead when not permitted.
 * @param {React.ReactNode} props.children
 *
 * @example
 * <Can permission={Permission.DATASET_DELETE} dataset={dataset}>
 *   <DeleteDatasetButton dataset={dataset} onClick={onDelete} />
 * </Can>
 */
const Can = ({ permission, anyOf, allOf, dataset, fallback = null, children }) => {
    const { can, canAny, canAll } = usePermissions(dataset);

    let permitted = true;
    if (permission) permitted = permitted && can(permission);
    if (anyOf?.length) permitted = permitted && canAny(anyOf);
    if (allOf?.length) permitted = permitted && canAll(allOf);

    return permitted ? <>{children}</> : <>{fallback}</>;
};

export default Can;
