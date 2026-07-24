import React, { useState } from 'react';
import { ExternalLink, Link2, Loader2, ShieldAlert, Table2, Users2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDatasetAccess } from '../../hooks/useDatasetAccess';
import InvitesPanel from './access/InvitesPanel';
import MembersPanel from './access/MembersPanel';
import ReviewPolicyPanel from './access/ReviewPolicyPanel';
import PermissionMatrix from './PermissionMatrix';

const TABS = {
  MEMBERS: 'members',
  INVITES: 'invites',
  SETTINGS: 'settings',
  PERMISSIONS: 'permissions',
};

/**
 * Quick access management from the dataset card.
 *
 * The full page at `/dataset/:id/access` composes the same panels with more room
 * (and the task-assignment section); this is the shortcut for the common case of
 * adding one person. Both are driven by `useDatasetAccess`, so they cannot drift.
 */
const ManageAccessModal = ({ isOpen, dataset, onClose, onChange }) => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(TABS.MEMBERS);

  const access = useDatasetAccess(dataset, { enabled: isOpen, onChange });
  const { loading, error, role, canInvite, canUpdateSettings } = access;

  if (!isOpen || !dataset) return null;

  const tabButton = (key, label, Icon) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
        tab === key
          ? 'border-teal-600 text-teal-700'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className={`bg-white rounded-xl shadow-2xl w-full mx-auto max-h-[90vh] flex flex-col ${
          // The matrix needs room for five role columns; the other tabs read
          // better narrow.
          tab === TABS.PERMISSIONS ? 'max-w-5xl' : 'max-w-2xl'
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white p-6 rounded-t-xl flex items-start justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2 bg-white/20 rounded-full flex-shrink-0">
              <Users2 className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-bold">Manage access</h3>
              <p className="text-teal-100 text-sm truncate">
                Who can work on &quot;{dataset.name}&quot;
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/20 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-4 overflow-x-auto">
          {tabButton(TABS.MEMBERS, 'Members', Users2)}
          {canInvite && tabButton(TABS.INVITES, 'Invite links', Link2)}
          {canUpdateSettings && tabButton(TABS.SETTINGS, 'Review policy', ShieldAlert)}
          {/* Reference table, right where a role is being picked for someone. */}
          {tabButton(TABS.PERMISSIONS, 'What roles can do', Table2)}
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : (
            <>
              {tab === TABS.MEMBERS && (
                <MembersPanel access={access} datasetName={dataset.name} />
              )}
              {tab === TABS.INVITES && canInvite && <InvitesPanel access={access} />}
              {tab === TABS.SETTINGS && canUpdateSettings && (
                <ReviewPolicyPanel access={access} dataset={dataset} />
              )}
              {tab === TABS.PERMISSIONS && (
                <PermissionMatrix
                  highlightRole={role}
                  showDescriptions={false}
                  showKeys={false}
                  compact
                />
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              onClose();
              navigate(`/dataset/${dataset.id}/access`);
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800 transition-colors"
          >
            Open full page
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManageAccessModal;
