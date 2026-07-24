import React from 'react';
import { Eye, EyeOff, Edit3, Trash2, CheckCircle, RotateCcw, XCircle } from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';
import { Permission } from '../../../utils/permissions';

/**
 * Action buttons for an object (Accept/Discard/Send back/Edit/Delete/Visibility)
 *
 * Two different things used to share the word "reject": discarding an unwanted
 * AI suggestion, and sending a human's work back for rework. They are separate
 * actions with separate permissions here — discarding is a delete
 * (`annotation.delete_own`), sending back is a review action (`review.reject`)
 * that records a reason.
 *
 * Actions the current role cannot perform are left out rather than shown
 * disabled: an annotator has no way to grant themselves review rights, so a
 * greyed-out approve button would only be in the way. Visibility is always
 * available — it is a local view toggle, not a change to the data.
 *
 * @param {boolean} isReviewed - Whether the object has been reviewed
 * @param {boolean} isReviewable - Whether the object can be reviewed
 * @param {boolean} isVisible - Whether the object is visible
 * @param {Object} dataset - Dataset the object belongs to, for the permission check
 * @param {Function} onAccept - Assign a label (counts as approval for reviewers)
 * @param {Function} onReject - Discard this object
 * @param {Function} onSendBack - Send this object back with a reason
 * @param {Function} onMarkAsReviewed - Callback when mark as reviewed is clicked
 * @param {Function} onEdit - Callback when edit is clicked
 * @param {Function} onDelete - Callback when delete is clicked
 * @param {Function} onToggleVisibility - Callback when visibility is toggled
 */
const ObjectActions = ({
  isReviewed,
  isReviewable,
  isVisible,
  dataset,
  onAccept,
  onReject,
  onSendBack,
  onMarkAsReviewed,
  onEdit,
  onDelete,
  onToggleVisibility,
}) => {
  const { can } = usePermissions(dataset);
  const canEdit = can(Permission.ANNOTATION_EDIT_OWN);
  const canDelete = can(Permission.ANNOTATION_DELETE_OWN);
  const canApprove = can(Permission.REVIEW_APPROVE);
  const canSendBack = can(Permission.REVIEW_REJECT);

  const isUnreviewed = !isReviewed;

  const visibilityButton = (
    <button
      onClick={onToggleVisibility}
      className="p-1 hover:bg-gray-200 rounded transition-colors"
      title={isVisible ? 'Hide object' : 'Show object'}
    >
      {isVisible ? (
        <Eye className="w-4 h-4 text-gray-600" />
      ) : (
        <EyeOff className="w-4 h-4 text-gray-400" />
      )}
    </button>
  );

  const editButton = canEdit ? (
    <button
      onClick={onEdit}
      className="p-1 hover:bg-gray-200 rounded transition-colors"
      title="Edit contour"
    >
      <Edit3 className="w-4 h-4 text-gray-600" />
    </button>
  ) : null;

  return (
    <div className="flex items-center space-x-1">
      {isUnreviewed ? (
        // Unreviewed object actions. Accepting assigns a label, which also counts
        // as an approval for anyone entitled to give one.
        <>
          <button
            onClick={onAccept}
            className="p-1 hover:bg-green-100 rounded transition-colors"
            title={canApprove ? 'Assign label and approve' : 'Assign label'}
          >
            <CheckCircle className="w-4 h-4 text-green-600" />
          </button>

          {canDelete && (
            <button
              onClick={onReject}
              className="p-1 hover:bg-red-100 rounded transition-colors"
              title="Discard this object"
            >
              <XCircle className="w-4 h-4 text-red-600" />
            </button>
          )}

          {canSendBack && onSendBack && (
            <button
              onClick={onSendBack}
              className="p-1 hover:bg-rose-100 rounded transition-colors"
              title="Send back with a reason"
            >
              <RotateCcw className="w-4 h-4 text-rose-600" />
            </button>
          )}

          {editButton}
        </>
      ) : (
        // Reviewed object actions (Visibility/Edit/Send back/Delete)
        <>
          {visibilityButton}
          {editButton}
          {canSendBack && onSendBack && (
            <button
              onClick={onSendBack}
              className="p-1 hover:bg-rose-100 rounded transition-colors"
              title="Send back with a reason"
            >
              <RotateCcw className="w-4 h-4 text-rose-600" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              className="p-1 hover:bg-red-100 rounded transition-colors"
              title="Delete object"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default ObjectActions;
