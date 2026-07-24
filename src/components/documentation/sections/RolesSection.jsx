import React from "react";
import { Link2, ShieldCheck, UserCog } from "lucide-react";
import PermissionMatrix from "../../datasets/PermissionMatrix";
import { usePermissions } from "../../../hooks/usePermissions";
import { GLOBAL_ROLE_LABELS, GlobalRole } from "../../../utils/permissions";

/**
 * Reference documentation for the access model.
 *
 * The permission table is fetched live from the backend, so this page is the
 * authoritative answer to "what can a reviewer actually do?" rather than prose
 * that drifts as roles change.
 */
const RolesSection = () => {
  const { globalRole } = usePermissions();

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Who can do what
        </h3>
        <p className="text-gray-700 mb-2">
          Access works on two levels. Your <strong>account role</strong> decides what you
          can do on the platform as a whole. Your <strong>role on each dataset</strong>
          {' '}decides what you can do inside it — and it can differ from one dataset to
          the next, so you might own one and only be able to view another.
        </p>
      </div>

      <div>
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <UserCog className="w-5 h-5 text-teal-600" />
          Account roles
        </h4>
        <div className="grid gap-3 sm:grid-cols-3">
          {[GlobalRole.GUEST, GlobalRole.MEMBER, GlobalRole.ADMIN].map((role) => {
            const meta = GLOBAL_ROLE_LABELS[role];
            const isYours = globalRole === role;
            return (
              <div
                key={role}
                className={`p-4 rounded-lg border ${
                  isYours ? "border-teal-400 bg-teal-50" : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h5 className="font-semibold text-gray-900">{meta.label}</h5>
                  {isYours && (
                    <span className="text-[11px] font-medium text-teal-700 bg-white border border-teal-300 rounded-full px-2 py-0.5">
                      You
                    </span>
                  )}
                </div>
                <p className="text-gray-600 text-sm">{meta.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-teal-600" />
          Dataset roles
        </h4>
        <p className="text-gray-700 mb-4">
          Each row is one thing you can do; a tick means that role is allowed to do it.
          Roles build on each other, so every role can do everything the ones to its left
          can.
        </p>
        <PermissionMatrix />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-teal-600" />
            Giving someone access
          </h4>
          <div className="space-y-3 text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <h5 className="font-medium text-gray-900">Add them directly</h5>
              <p className="text-gray-600">
                In <strong>Manage access</strong> on the dataset card, enter a username and
                pick a role. They see the dataset the next time they load their list.
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <h5 className="font-medium text-gray-900">Send an invite link</h5>
              <p className="text-gray-600">
                Useful when you do not know someone&apos;s username yet. The link grants a
                fixed role, can expire or cap how many people use it, and is shown only
                once — copy it before closing the dialog. Invite links can never grant
                ownership.
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <h5 className="font-medium text-gray-900">Hand over ownership</h5>
              <p className="text-gray-600">
                A dataset has exactly one owner. Transferring makes someone else the owner
                and drops you to curator, so only the new owner can transfer it back.
              </p>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Review policy</h4>
          <div className="space-y-3 text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <h5 className="font-medium text-gray-900">Independent review</h5>
              <p className="text-gray-600">
                Off by default. When on, nobody can approve an annotation they drew
                themselves, so &quot;finished&quot; means a second person checked the work.
                Leave it off if you annotate and review a dataset on your own — otherwise
                you could never finish it.
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <h5 className="font-medium text-gray-900">Sending work back</h5>
              <p className="text-gray-600">
                Reviewers can send an image, or a single object, back with a reason. The
                image returns to the annotator and stays marked as sent back until every
                open point on it is resolved.
              </p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <h5 className="font-medium text-gray-900">Removing someone</h5>
              <p className="text-gray-600">
                Revoking access does not delete their work — the annotations they made stay
                in the dataset, still credited to them.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RolesSection;
