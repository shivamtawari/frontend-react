import { useCallback } from 'react';
import annotationSession from '../services/annotationSession';
import {useInstanceModel, useIsRunningInstance, useSetIsRunningInstance} from "../stores/selectors/annotationSelectors";
import { useToast } from "../contexts/ToastContext";

/**
 * Hook for running instance segmentation inference
 *
 * @param {Function} onSuccess - Optional callback on successful completion
 * @param {Function} onError - Optional callback on error
 * @returns {Object} - { runInstance, isRunning }
 */
export function useInstanceSegmentation(onSuccess, onError) {
  const isRunning = useIsRunningInstance();
  const setIsRunning = useSetIsRunningInstance();
  const instanceModelId = useInstanceModel(); // This is a string ID, not an object
  const { showToast } = useToast();

  const runInstance = useCallback(async (applyMode = 'patch') => {
    if (!instanceModelId) {
      const error = new Error('Please select an instance segmentation model first');
      if (onError) {
        onError(error);
      } else {
        showToast('Please select an instance segmentation model first', 'error');
      }
      return;
    }

    // Check if instance service is available
    if (!annotationSession.isServiceAvailable('instance_segmentation')) {
      const error = new Error('Instance segmentation service is not available');
      if (onError) {
        onError(error);
      } else {
        showToast('Instance segmentation service is not available. Please check your connection.', 'error');
      }
      return;
    }

    setIsRunning(true);

    try {
      // Call WebSocket method - objects will be added automatically via OBJECT_ADDED messages
      // instanceModelId is already the string identifier we need
      const response = await annotationSession.runInstance(
        instanceModelId,  // Model identifier (string)
        applyMode
      );

      if (!response.success) {
        throw new Error(response.message || 'Instance segmentation failed');
      }

      // Call success callback if provided
      if (onSuccess) {
        onSuccess(response);
      } else if (response?.data?.applied_stats) {
        const stats = response.data.applied_stats;
        showToast(
          `Added ${stats.added_count} instances. Removed ${stats.suppressed_count} by overlap${
            applyMode === 'replace' ? `, deleted ${stats.replaced_count} existing` : ''
          }.`,
          'success'
        );
      } else {
        showToast('Instance segmentation applied successfully', 'success');
      }
    } catch (error) {
      console.error('Instance segmentation error:', error);

      // Call error callback if provided
      if (onError) {
        onError(error);
      } else {
        showToast(`Failed to run instance segmentation: ${error.message || 'Unknown error'}`, 'error');
      }
    } finally {
      setIsRunning(false);
    }
  }, [instanceModelId, onSuccess, onError, setIsRunning, showToast]);

  return { runInstance, isRunning };
}
