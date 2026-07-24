/**
 * Loading and mutating a dataset's access settings.
 *
 * Shared by the Manage Access modal (on the dataset card) and the full Manage
 * Access page, so the two cannot drift apart — the page is the same feature with
 * more room, not a second implementation.
 */
import { useCallback, useEffect, useState } from 'react';
import * as api from '../api';
import { useToast } from '../contexts/ToastContext';
import { usePermissions } from './usePermissions';
import { DATASET_ROLE_LABELS, Permission } from '../utils/permissions';

/** Turn an API error into something worth showing a user. */
export const readableError = (err, fallback) =>
  (err?.message || '').replace(/^API Error:\s*/i, '') || fallback;

/**
 * @param {Object} dataset - Dataset object (needs at least `id`).
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true] - Skip loading while a modal is closed.
 * @param {Function} [options.onChange] - Called after any change, to refresh the caller.
 */
export function useDatasetAccess(dataset, { enabled = true, onChange } = {}) {
  const { can, role } = usePermissions(dataset);
  const { addToast } = useToast();

  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  /** Key of the row currently mutating, so only that control shows a spinner. */
  const [busy, setBusy] = useState(null);

  const permissions = {
    canGrant: can(Permission.MEMBER_GRANT),
    canRevoke: can(Permission.MEMBER_REVOKE),
    canList: can(Permission.MEMBER_LIST),
    canInvite: can(Permission.INVITE_CREATE),
    canRevokeInvite: can(Permission.INVITE_REVOKE),
    canTransfer: can(Permission.DATASET_TRANSFER_OWNERSHIP),
    canUpdateSettings: can(Permission.DATASET_UPDATE),
  };
  const { canInvite } = permissions;

  const notifyChanged = useCallback(() => {
    if (onChange) onChange();
  }, [onChange]);

  const load = useCallback(async () => {
    if (!dataset?.id || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const [memberResponse, inviteResponse] = await Promise.all([
        api.fetchMembers(dataset.id),
        // Asking for invites without the permission would 403 and take the
        // member list down with it.
        canInvite ? api.fetchInvites(dataset.id) : Promise.resolve({ invites: [] }),
      ]);
      setMembers(memberResponse.members || []);
      setInvites(inviteResponse.invites || []);
    } catch (err) {
      setError(readableError(err, 'Could not load access settings.'));
    } finally {
      setLoading(false);
    }
  }, [dataset?.id, enabled, canInvite]);

  useEffect(() => {
    load();
  }, [load]);

  /** Run a mutation with consistent busy/error handling, then reload. */
  const run = useCallback(
    async (key, action, { fallbackError, successMessage, reload = true } = {}) => {
      setBusy(key);
      setError(null);
      try {
        const result = await action();
        if (successMessage) addToast({ message: successMessage, type: 'success' });
        if (reload) await load();
        notifyChanged();
        return result;
      } catch (err) {
        setError(readableError(err, fallbackError || 'Something went wrong.'));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [addToast, load, notifyChanged]
  );

  const addMember = useCallback(
    (username, memberRole) =>
      run(
        'add',
        () => api.grantMemberRole(dataset.id, username, memberRole),
        {
          fallbackError: `Could not add ${username}.`,
          successMessage: `${username} is now ${DATASET_ROLE_LABELS[memberRole].label.toLowerCase()} on this dataset.`,
        }
      ),
    [dataset?.id, run]
  );

  const changeRole = useCallback(
    (username, memberRole) =>
      run(`role:${username}`, () => api.grantMemberRole(dataset.id, username, memberRole), {
        fallbackError: `Could not change the role for ${username}.`,
      }),
    [dataset?.id, run]
  );

  const revokeMember = useCallback(
    (username) =>
      run(`revoke:${username}`, () => api.revokeMember(dataset.id, username), {
        fallbackError: `Could not remove ${username}.`,
        successMessage: `Removed ${username} from this dataset.`,
      }),
    [dataset?.id, run]
  );

  const transferOwnership = useCallback(
    (username) =>
      run(`transfer:${username}`, () => api.transferOwnership(dataset.id, username), {
        fallbackError: 'Could not transfer ownership.',
        successMessage: `${username} now owns this dataset.`,
      }),
    [dataset?.id, run]
  );

  const createInvite = useCallback(
    (options) =>
      run('invite', () => api.createInvite(dataset.id, options), {
        fallbackError: 'Could not create an invite link.',
      }),
    [dataset?.id, run]
  );

  const revokeInvite = useCallback(
    (inviteId) =>
      run(`invite:${inviteId}`, () => api.revokeInvite(dataset.id, inviteId), {
        fallbackError: 'Could not revoke the invite link.',
      }),
    [dataset?.id, run]
  );

  const setIndependentReview = useCallback(
    (value) =>
      run(
        'settings',
        () => api.updateDatasetSettings(dataset.id, { requireIndependentReview: value }),
        { fallbackError: 'Could not update the review policy.', reload: false }
      ),
    [dataset?.id, run]
  );

  return {
    role,
    members,
    invites,
    loading,
    error,
    busy,
    setError,
    reload: load,
    ...permissions,
    addMember,
    changeRole,
    revokeMember,
    transferOwnership,
    createInvite,
    revokeInvite,
    setIndependentReview,
  };
}

export default useDatasetAccess;
