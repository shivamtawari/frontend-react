import { useCallback } from 'react';
import annotationSession from '../services/annotationSession';
import {
  useInstanceModel,
  useIsRunningInstance,
  useSetIsRunningInstance,
  useSetObjectsFromHierarchy,
  useDatasetLabelsMap,
} from "../stores/selectors/annotationSelectors";
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
  const setObjectsFromHierarchy = useSetObjectsFromHierarchy();
  const datasetLabelsMap = useDatasetLabelsMap();
  const { addToast } = useToast();

  const runInstance = useCallback(async (applyMode = 'patch') => {
    if (!instanceModelId) {
      const error = new Error('Please select an instance segmentation model first');
      if (onError) {
        onError(error);
      } else {
        addToast({ message: 'Please select an instance segmentation model first', type: 'error' });
      }
      return;
    }

    // Check if instance service is available
    if (!annotationSession.isServiceAvailable('instance_segmentation')) {
      const error = new Error('Instance segmentation service is not available');
      if (onError) {
        onError(error);
      } else {
        addToast({
          message: 'Instance segmentation service is not available. Please check your connection.',
          type: 'error',
        });
      }
      return;
    }

    setIsRunning(true);

    try {
      // The server returns the committed hierarchy in the response and also
      // broadcasts it as an OBJECTS message. The response is used below for
      // immediate local hydration; the broadcast remains the shared update
      // path for other session consumers.
      const response = await annotationSession.runInstance(
        instanceModelId,  // Model identifier (string)
        applyMode
      );

      if (!response.success) {
        throw new Error(response.message || 'Instance segmentation failed');
      }

      // The server response contains the committed hierarchy. Hydrate the
      // object store from it directly instead of relying only on the generic
      // OBJECTS websocket listener, which can race the request promise and
      // leave the object panel populated while the canvas still has stale
      // geometry.
      if (Array.isArray(response?.data?.root_contours)) {
        setObjectsFromHierarchy(response.data, datasetLabelsMap);
      }

      // Call success callback if provided
      if (onSuccess) {
        onSuccess(response);
      } else if (response?.data?.applied_stats) {
        const stats = response.data.applied_stats;
        addToast({
          message: `Added ${stats.added_count} instances. Removed ${stats.suppressed_count} by overlap${
            applyMode === 'replace' ? `, deleted ${stats.replaced_count} existing` : ''
          }.`,
          type: 'success',
        });
      } else {
        addToast({ message: 'Instance segmentation applied successfully', type: 'success' });
      }
    } catch (error) {
      console.error('Instance segmentation error:', error);

      // Call error callback if provided
      if (onError) {
        onError(error);
      } else {
        addToast({
          message: `Failed to run instance segmentation: ${error.message || 'Unknown error'}`,
          type: 'error',
        });
      }
    } finally {
      setIsRunning(false);
    }
  }, [
    instanceModelId,
    onSuccess,
    onError,
    setIsRunning,
    setObjectsFromHierarchy,
    datasetLabelsMap,
    addToast,
  ]);

  return { runInstance, isRunning };
}
