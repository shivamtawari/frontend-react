import { useCallback } from 'react';
import { markContourAsReviewed } from '../api/contours';
import { getContourId } from '../utils/objectUtils';

/**
 * Shared hook for approving an object.
 *
 * Approval goes through the REST endpoint only. The WebSocket used to be told
 * about it as well, with a `reviewed_by` field the client made up — the backend
 * now refuses client-supplied reviewers (it let a client mark a contour as
 * reviewed by anyone), so that call has been dropped rather than left to fail
 * silently.
 *
 * @param {Function} updateObject - Function to update object in store
 * @param {Function} onSuccess - Optional callback on successful review
 * @param {Function} onError - Optional callback on error
 * @returns {Function} - Function to handle marking as reviewed
 */
export function useMarkAsReviewed(updateObject, onSuccess, onError) {
  const handleMarkAsReviewed = useCallback(async (object) => {
    if (!object) return;

    const contourId = getContourId(object);

    try {
      const response = await markContourAsReviewed(contourId);

      // Trust the server's reviewer list; it is the one that decides whether the
      // approval was actually recorded (a dataset can require that a contour is
      // reviewed by someone other than its author).
      if (response.reviewed_by) {
        updateObject(object.id, { reviewed_by: response.reviewed_by });
      }

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      if (onError) {
        onError(error);
      } else {
        alert(`Failed to mark as reviewed: ${error.message || 'Unknown error'}`);
      }
      throw error;
    }
  }, [updateObject, onSuccess, onError]);

  return handleMarkAsReviewed;
}
