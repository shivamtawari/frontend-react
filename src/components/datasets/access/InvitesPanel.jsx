import React, { useState } from 'react';
import { Check, Copy, Link2, Loader2, Trash2 } from 'lucide-react';
import { DATASET_ROLE_LABELS, ASSIGNABLE_DATASET_ROLES } from '../../../utils/permissions';
import RoleBadge from '../RoleBadge';

const EXPIRY_OPTIONS = [
  { label: '24 hours', value: 24 },
  { label: '7 days', value: 168 },
  { label: '30 days', value: 720 },
  { label: 'Never', value: null },
];

/**
 * Invite-link creation and the list of active links.
 *
 * The raw token comes back exactly once — the backend stores only its hash — so
 * the newly minted link is held in local state and shown prominently until the
 * panel unmounts.
 *
 * @param {Object} props
 * @param {Object} props.access - The `useDatasetAccess` return value.
 */
const InvitesPanel = ({ access }) => {
  const { invites, busy, canRevokeInvite, createInvite, revokeInvite, setError } = access;

  const [role, setRole] = useState(ASSIGNABLE_DATASET_ROLES[1]); // annotator
  const [expiry, setExpiry] = useState(168);
  const [maxUses, setMaxUses] = useState('');
  const [freshInvite, setFreshInvite] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    const parsedUses = parseInt(maxUses, 10);
    const response = await createInvite({
      role,
      expiresInHours: expiry,
      maxUses: Number.isNaN(parsedUses) ? null : parsedUses,
    });
    if (!response) return;
    setFreshInvite({
      url: `${window.location.origin}${process.env.PUBLIC_URL || ''}/invites/${response.token}`,
      role: response.invite?.role,
    });
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!freshInvite) return;
    try {
      await navigator.clipboard.writeText(freshInvite.url);
      setCopied(true);
    } catch (err) {
      setError('Could not copy automatically — select the link and copy it manually.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500"
            >
              {ASSIGNABLE_DATASET_ROLES.map((option) => (
                <option key={option} value={option}>
                  {DATASET_ROLE_LABELS[option].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Expires</label>
            <select
              value={String(expiry)}
              onChange={(e) =>
                setExpiry(e.target.value === 'null' ? null : Number(e.target.value))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500"
            >
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option.label} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max uses</label>
            <input
              type="number"
              min="1"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Unlimited"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={busy === 'invite'}
          className="mt-3 w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 transition-colors flex items-center justify-center gap-2"
        >
          {busy === 'invite' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Link2 className="w-4 h-4" />
          )}
          Create invite link
        </button>
        <p className="mt-2 text-xs text-gray-500">
          Invite links cannot grant ownership.
        </p>
      </div>

      {freshInvite && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-medium text-amber-900 mb-2">
            Copy this link now — it is not stored and cannot be shown again.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={freshInvite.url}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-amber-300 rounded-lg bg-white font-mono"
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-1 flex-shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg">
        {invites.map((invite) => (
          <li key={invite.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <RoleBadge role={invite.role} />
                <span className="text-xs text-gray-500">
                  {invite.uses} use{invite.uses === 1 ? '' : 's'}
                  {invite.max_uses ? ` of ${invite.max_uses}` : ''}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {invite.expires_at
                  ? `Expires ${new Date(invite.expires_at).toLocaleString()}`
                  : 'Never expires'}
                {' · '}by {invite.created_by}
              </p>
            </div>
            {canRevokeInvite && (
              <button
                onClick={() => revokeInvite(invite.id)}
                disabled={busy === `invite:${invite.id}`}
                className="p-1.5 rounded hover:bg-red-100 transition-colors flex-shrink-0"
                title="Revoke this link"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            )}
          </li>
        ))}
        {invites.length === 0 && (
          <li className="p-4 text-sm text-gray-500 text-center">
            No active invite links.
          </li>
        )}
      </ul>
    </div>
  );
};

export default InvitesPanel;
