import React from 'react';
import { ClipboardList, Info } from 'lucide-react';
import { DATASET_ROLE_LABELS, DatasetRole } from '../../../utils/permissions';

/**
 * Placeholder for per-annotator work assignment.
 *
 * Assignment was deliberately left out of the roles work: it is a separate table
 * (who is meant to annotate which images), not a role, so it can land later
 * without reshaping access control. This panel reserves the place it will live
 * and says what it will do, rather than shipping a dead "coming soon" box.
 *
 * @param {Object} props
 * @param {Array} props.members - Current collaborators, to show who work could go to.
 */
const TaskAssignmentPanel = ({ members = [] }) => {
  // Assignment only makes sense for people who actually annotate or review.
  const assignable = members.filter((member) =>
    [DatasetRole.ANNOTATOR, DatasetRole.REVIEWER, DatasetRole.CURATOR, DatasetRole.OWNER]
      .includes(member.role)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-gray-900">Not available yet</h4>
          <p className="text-sm text-gray-700 mt-1">
            Today everyone with access works from the same pool of images. Assignment
            will let you hand specific images to specific people, so several annotators
            can share a dataset without colliding on the same image, and so you can see
            who still has work outstanding.
          </p>
        </div>
      </div>

      <div className="border border-dashed border-gray-300 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="w-5 h-5 text-gray-400" />
          <h4 className="font-medium text-gray-700">Who work could be assigned to</h4>
        </div>

        {assignable.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nobody on this dataset annotates or reviews yet. Add collaborators as{' '}
            {DATASET_ROLE_LABELS[DatasetRole.ANNOTATOR].label.toLowerCase()} or{' '}
            {DATASET_ROLE_LABELS[DatasetRole.REVIEWER].label.toLowerCase()} first.
          </p>
        ) : (
          <ul className="space-y-2">
            {assignable.map((member) => (
              <li
                key={member.username}
                className="flex items-center justify-between text-sm text-gray-500"
              >
                <span className="text-gray-700">{member.username}</span>
                <span className="text-xs">
                  {DATASET_ROLE_LABELS[member.role]?.label} · no assignments
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TaskAssignmentPanel;
