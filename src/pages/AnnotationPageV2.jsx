import React, { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import MainLayout from '../components/annotationPage/layout/MainLayout';
import ResponsiveWrapper from '../components/annotationPage/layout/ResponsiveWrapper';
import DatasetLoader from '../components/annotationPage/layout/DatasetLoader';
import useAnnotationSession from '../hooks/useAnnotationSession';
import useWebSocketObjectHandler from '../hooks/useWebSocketObjectHandler';
import useWebSocketStatusToasts from '../hooks/useWebSocketStatusToasts';
import useWebSocketErrorToasts from '../hooks/useWebSocketErrorToasts';
import useModelPreloader from '../hooks/useModelPreloader';
import { useSetObjectsFromHierarchy, useClearObjects, useFailObjectsLoad, useSetAnnotationStatus, useSetDatasetLabels, useDatasetLabelsMap, useDatasetLabels, useFetchAvailablePromptedModels, useAvailablePromptedModels, useActivateLabelDataset, useLabelDatasetId } from '../stores/selectors/annotationSelectors';
import { useCurrentImageId } from '../stores/selectors/annotationSelectors';
import useAnnotationStore from '../stores/useAnnotationStore';
import { useDataset } from '../contexts/DatasetContext';
import { usePermissions } from '../hooks/usePermissions';
import { Permission } from '../utils/permissions';
import { fetchLabels } from '../api/labels';
import { extractLabelsFromResponse } from '../utils/labelHierarchy';
import { SERVER_MESSAGE_TYPES } from '../utils/messageTypes';
import websocketService from '../services/websocket';
import annotationSession from '../services/annotationSession';
import { AnnotationRoutingPolicyProvider } from '../contexts/AnnotationRoutingPolicyContext';

const AnnotationPageV2 = () => {
  const { datasetId, imageId: urlImageId } = useParams();
  // Get imageId from store (set by DatasetLoader when no URL imageId is present)
  const storeImageId = useCurrentImageId();
  
  // Use URL imageId if available, otherwise use store imageId
  const imageId = urlImageId ? parseInt(urlImageId) : storeImageId;

  // Fetch prompted models immediately on page mount (before DatasetLoader finishes),
  // so a default is auto-selected by the time the canvas is visible.
  const fetchAvailablePromptedModels = useFetchAvailablePromptedModels();
  const availablePromptedModels = useAvailablePromptedModels();
  useEffect(() => {
    if (availablePromptedModels.length === 0) {
      fetchAvailablePromptedModels();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setObjectsFromHierarchy = useSetObjectsFromHierarchy();
  const clearObjects = useClearObjects();
  const failObjectsLoad = useFailObjectsLoad();
  const setAnnotationStatus = useSetAnnotationStatus();
  const setDatasetLabels = useSetDatasetLabels();
  const activateLabelDataset = useActivateLabelDataset();
  const cachedLabelDatasetId = useLabelDatasetId();
  const cachedLabelsMap = useDatasetLabelsMap();
  const cachedLabels = useDatasetLabels();
  const { currentDataset, datasets } = useDataset();
  // Resolve from the list rather than currentDataset: the list entries carry
  // my_permissions, and currentDataset may not be the one in the URL yet.
  const routeDataset = React.useMemo(
    () => datasets?.find((d) => String(d.id) === String(datasetId)) || null,
    [datasets, datasetId]
  );
  // /annotate-v2 has no dataset route segment; use the dataset selected by the
  // loader once it becomes available while preserving the URL id for normal
  // dataset-scoped annotation routes.
  const effectiveDatasetId =
    routeDataset?.id ??
    (datasetId != null && !isNaN(datasetId) ? Number(datasetId) : (datasetId ?? currentDataset?.id));
  const effectiveDatasetIdRef = React.useRef(effectiveDatasetId);
  effectiveDatasetIdRef.current = effectiveDatasetId;

  // Activate the route/effective dataset in a layout effect so stale label state is
  // cleared before descendants paint. The store increments its authoritative generation.
  React.useLayoutEffect(() => {
    if (effectiveDatasetId != null) {
      activateLabelDataset(effectiveDatasetId);
      setHierarchyData(null);
    }
  }, [effectiveDatasetId, activateLabelDataset]);
  const { can } = usePermissions(routeDataset);
  const canAnnotate = can(Permission.ANNOTATION_CREATE);
  const [hierarchyData, setHierarchyData] = React.useState(null); // Use state instead of ref to trigger re-renders

  // Helper: ensure labels are loaded (uses cache, fetches only once per dataset)
  const ensureLabelsLoaded = React.useCallback(async (targetDatasetId) => {
    if (targetDatasetId == null) {
      return { labelsArray: [], labelsMap: null, stale: true };
    }

    const targetIdStr = String(targetDatasetId);
    // Use the store generation as the single authoritative source of truth
    const requestGen = useAnnotationStore.getState().objects.labelDatasetGeneration;

    // If labels are already cached for this dataset, return them
    // Note: compare cachedLabelDatasetId and check cachedLabelsMap !== null (empty array is a valid cache)
    if (
      cachedLabelDatasetId != null &&
      String(cachedLabelDatasetId) === targetIdStr &&
      cachedLabelsMap !== null
    ) {
      return { labelsArray: cachedLabels, labelsMap: cachedLabelsMap, stale: false };
    }

    try {
      const labelsData = await fetchLabels(targetDatasetId);

      // Verify that after await, both the effective dataset ID and authoritative store generation still match
      const currentGen = useAnnotationStore.getState().objects.labelDatasetGeneration;
      if (
        effectiveDatasetIdRef.current == null ||
        String(effectiveDatasetIdRef.current) !== targetIdStr ||
        currentGen !== requestGen
      ) {
        return { labelsArray: [], labelsMap: null, stale: true };
      }

      const labelsArray = extractLabelsFromResponse(labelsData);

      // Create a map from label ID to label name
      const labelsMap = new Map();
      labelsArray.forEach((label) => {
        if (label && label.id && label.name) {
          const labelIdNum = Number(label.id);
          labelsMap.set(labelIdNum, label.name);
          labelsMap.set(String(label.id), label.name);
        }
      });

      // Cache in the store with targetDatasetId and authoritative generation
      setDatasetLabels(labelsArray, labelsMap, targetDatasetId, requestGen);

      if (
        effectiveDatasetIdRef.current == null ||
        String(effectiveDatasetIdRef.current) !== targetIdStr ||
        useAnnotationStore.getState().objects.labelDatasetGeneration !== requestGen
      ) {
        return { labelsArray: [], labelsMap: null, stale: true };
      }

      return { labelsArray, labelsMap, stale: false };
    } catch (error) {
      console.error('[AnnotationPageV2] Failed to fetch labels:', error);
      return { labelsArray: [], labelsMap: null, stale: false };
    }
  }, [cachedLabelDatasetId, cachedLabels, cachedLabelsMap, setDatasetLabels]);

  // Load objects with their label names.
  //
  // `imageId` tags the contours with the image the session fetched them for. The label
  // lookup below is awaited, and on a reload the contours can arrive before DatasetLoader
  // has made that image current; without the tag `setCurrentImage` cannot distinguish them
  // from a previous image's and wipes them.
  const loadObjectsWithLabels = React.useCallback(async (hierarchy, datasetOrId, imageId) => {
    const rawTarget = datasetOrId?.id ?? datasetOrId ?? effectiveDatasetIdRef.current;
    const targetDatasetId =
      rawTarget != null && !isNaN(rawTarget) ? Number(rawTarget) : rawTarget;
    if (targetDatasetId == null) return;

    const requestGen = useAnnotationStore.getState().objects.labelDatasetGeneration;
    const { labelsMap, stale } = await ensureLabelsLoaded(targetDatasetId);
    if (stale) {
      return;
    }

    if (
      effectiveDatasetIdRef.current == null ||
      String(effectiveDatasetIdRef.current) !== String(targetDatasetId) ||
      useAnnotationStore.getState().objects.labelDatasetGeneration !== requestGen
    ) {
      return;
    }

    setObjectsFromHierarchy(hierarchy, labelsMap, imageId);
  }, [ensureLabelsLoaded, setObjectsFromHierarchy]);

  // Initialize WebSocket session for the current image
  const { isReady, sessionState, runningServices, failedServices } = useAnnotationSession(
    imageId,
    {
      // Don't even attempt the socket without annotation rights — the server
      // refuses it, and the redirect below sends those users to the read-only
      // viewer. Connecting first would just log a refusal and fire an error toast.
      autoConnect: canAnnotate,
      onSessionReady: async (data) => {
        // Populate objects from backend provided hierarchy when available
        if (data && data.objects) {
          setHierarchyData(data.objects); // Use state setter to trigger useEffect
        }
        // No `else` clearing the objects: the contours are not part of this reply, they
        // follow as their own OBJECTS message. Clearing here would wipe a hierarchy that
        // had already arrived (the server sends both back to back) and leave the canvas
        // empty with nothing further coming.
        // Set workflow status from session data (no extra REST call needed)
        if (data && data.maskStatus != null) {
          setAnnotationStatus(data.maskStatus, data.phaseStatus);
        } else {
          setAnnotationStatus('not_started', {
            calibrate: 'not_started',
            annotate: 'not_started',
            review: 'not_started',
          });
        }
      },
      onSessionError: (error) => {
        console.error('[AnnotationPageV2] WebSocket session error:', error);
        clearObjects();
        // Resolve the canvas spinner as a failure. Without this it would spin forever:
        // the OBJECTS message that normally ends it is never coming.
        failObjectsLoad(error?.message || 'Could not load the annotations for this image.');
      },
    }
  );

  // Listen for server-initiated WebSocket messages (object updates)
  useWebSocketObjectHandler();

  // Surface connection drops to the user (the WebSocket can fail silently)
  useWebSocketStatusToasts();

  // Surface backend-reported errors (the connection stays open; the action just failed)
  useWebSocketErrorToasts();

  // Listen for "objects" message: full hierarchy from backend
  // Clear canvas and load the received hierarchy.
  useEffect(() => {
    const unsubscribe = websocketService.on(
      SERVER_MESSAGE_TYPES.OBJECTS,
      (message) => {
        if (!message || !message.data) return;
        // No clearObjects() first: setObjectsFromHierarchy replaces the list wholesale,
        // and clearing ahead of the awaited label lookup only opened a window in which
        // the canvas was empty for no reason.
        // The session's own image id rather than the store's, which may not have caught up
        // yet — the case the tag exists for.
        loadObjectsWithLabels(
          message.data,
          effectiveDatasetId ?? currentDataset,
          annotationSession.getCurrentImageId()
        );
      }
    );
    return unsubscribe;
  }, [effectiveDatasetId, currentDataset, loadObjectsWithLabels]);

  // Preload models into backend memory when session is ready
  useModelPreloader();

  // When both dataset and hierarchy data are available, load objects with labels
  useEffect(() => {
    const targetDataset = effectiveDatasetId ?? currentDataset;
    if (targetDataset && hierarchyData) {
      loadObjectsWithLabels(hierarchyData, targetDataset);
    }
  }, [effectiveDatasetId, currentDataset, hierarchyData, loadObjectsWithLabels]);

  // Without annotation rights the WebSocket session is refused, and that session
  // is what delivers the contours — so this page would render an empty canvas
  // forever. Send those users to the read-only viewer, which fetches over REST.
  if (datasetId && datasets?.length > 0 && !canAnnotate) {
    const target = urlImageId
      ? `/dataset/${datasetId}/view/${urlImageId}`
      : `/dataset/${datasetId}/view`;
    return <Navigate to={target} replace />;
  }

  return (
    <AnnotationRoutingPolicyProvider datasetId={effectiveDatasetId}>
      <DatasetLoader>
        {/* The workspace shell carries its own toolbar (app menu, breadcrumb and
            account chip), so the app navbar is not rendered here. */}
        <ResponsiveWrapper>
          <MainLayout />
        </ResponsiveWrapper>
      </DatasetLoader>
    </AnnotationRoutingPolicyProvider>
  );
};

export default AnnotationPageV2;
