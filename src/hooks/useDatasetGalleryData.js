import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataset } from '../contexts/DatasetContext';
import * as api from '../api';
import { extractLabelsFromResponse } from '../utils/labelHierarchy';
import useAppStore from '../stores/useAppStore';
import { buildItemList } from '../utils/stackItems';

/**
 * Normalizes a raw image object from the API into the shape expected by the UI.
 * Used both on initial load and after operations like upload/delete so the
 * image list is always consistently shaped.
 */
export const normalizeImage = (img) => ({
  id: img.image_id || img.id,
  name: img.file_name || img.filename || `image_${img.image_id || img.id}`,
  width: img.width,
  height: img.height,
  hash: img.hash_code || img.hash,
  finished: img.status === 'finished' || img.finished || false,
  generated: img.generated || false,
  status: img.status || (img.finished ? 'completed' : 'not_started'),
  // Per-phase breakdown (calibrate / annotate / review). Absent on legacy
  // payloads, which `getPhaseStatuses` falls back to the overall status for.
  phases: img.phases || null,
  mask_id: img.mask_id,
  // Grouping key/values, shipped with the listing so the gallery can filter on a
  // subgroup without a second request. Empty object for an untagged image.
  metadata: img.metadata || {},
  // Set on a stack's frames only (listed with `includeFrames`).
  stackId: img.stack_id ?? null,
  frameIndex: img.frame_index ?? null,
  thumbnail: null,
  isFromAPI: true,
});

/**
 * The dataset's items for the gallery: plain images, and each stack (an OCT
 * volume, a video) once, as the entry `buildItemList` folds its frames into.
 *
 * @returns {Promise<Array<Object>|null>} null when the listing failed.
 */
export const fetchGalleryItems = async (datasetId) => {
  const [imagesResponse, stacksResponse] = await Promise.all([
    api.fetchImages(datasetId, { includeFrames: true }),
    api.fetchStacks(datasetId).catch(() => ({ stacks: [] })),
  ]);
  if (!imagesResponse.success) return null;
  const rows = imagesResponse.image_data || imagesResponse.images || [];
  return buildItemList(rows.map(normalizeImage), stacksResponse?.stacks || []);
};

/**
 * Custom hook to handle dataset gallery data fetching and initialization
 */
export const useDatasetGalleryData = (datasetId, customGalleryActions) => {
  const navigate = useNavigate();
  const { datasets, currentDataset, selectDataset, getAnnotationProgress } = useDataset();
  const storeGalleryActions = useAppStore(state => state.galleryActions);
  const galleryActions = customGalleryActions || storeGalleryActions;

  // Find and select dataset based on URL
  useEffect(() => {
    if (datasets.length > 0 && datasetId) {
      const datasetIdNum = parseInt(datasetId, 10);
      const foundDataset = datasets.find(d => d.id === datasetIdNum);
      
      if (foundDataset) {
        // Update store with current dataset
        galleryActions.setCurrentDataset(foundDataset);
        if (!currentDataset || currentDataset.id !== foundDataset.id) {
          selectDataset(foundDataset);
        }
      } else {
        galleryActions.setGalleryError("Dataset not found");
        setTimeout(() => navigate("/datasets"), 2000);
      }
    }
  }, [datasets, datasetId, currentDataset, selectDataset, navigate, galleryActions]);

  // Fetch dataset data - only if dataset changed or data is missing
  useEffect(() => {
    let cancelled = false;

    const fetchDatasetData = async () => {
      const datasetIdNum = datasetId ? parseInt(datasetId, 10) : null;
      // Only fetch when the URL and context identify the same dataset.
      if (
        !currentDataset ||
        datasetIdNum == null ||
        Number.isNaN(datasetIdNum) ||
        currentDataset.id !== datasetIdNum
      ) {
        return;
      }

      const targetDatasetId = currentDataset.id;

      // Check if we already have cached data for this dataset
      const storeState = useAppStore.getState();
      const storeDataset = storeState.gallery.currentDataset;
      const hasCachedData = storeDataset?.id === targetDatasetId && storeState.gallery.images.length > 0;
      const needLabels = !storeState.gallery.labelsLoaded;
      const needStats = !storeState.gallery.statsLoaded;
      
      // Use cached data if available for this dataset
      if (hasCachedData) {
        galleryActions.setLoadingData(false);
        if (!needLabels && !needStats) {
          return; // Skip fetch, use cached data
        }

        // Fetch any missing labels or statistics without triggering the full-gallery spinner
        try {
          const fetchPromises = [];
          if (needLabels) {
            fetchPromises.push(
              api.fetchLabels(targetDatasetId).catch(() => [])
            );
          }
          if (needStats) {
            fetchPromises.push(
              getAnnotationProgress(targetDatasetId)
            );
          }

          const results = await Promise.all(fetchPromises);
          if (cancelled) return;

          const currentStore = useAppStore.getState();
          if (currentStore.gallery.currentDataset?.id !== targetDatasetId) {
            return;
          }

          let index = 0;
          if (needLabels) {
            const labelsResp = results[index++];
            const labelsArray = extractLabelsFromResponse(labelsResp);
            if (!currentStore.gallery.labelsLoaded) {
              galleryActions.setLabels(labelsArray);
            }
          }
          if (needStats) {
            const statsResp = results[index++];
            if (!currentStore.gallery.statsLoaded) {
              galleryActions.setStats(statsResp);
            }
          }
        } catch (err) {
          if (cancelled) return;
          const currentStore = useAppStore.getState();
          if (currentStore.gallery.currentDataset?.id !== targetDatasetId) {
            return;
          }
          console.error("Error fetching missing dataset labels/stats:", err);
        }
        return;
      }

      // Shared request-generation guard
      const generation = galleryActions.nextRequestGeneration(targetDatasetId);
      if (generation == null) return;
      galleryActions.setLoadingData(true);
      galleryActions.setGalleryError(null);

      try {
        const [items, labelsResponse, statsResponse] = await Promise.all([
          fetchGalleryItems(targetDatasetId),
          api.fetchLabels(targetDatasetId).catch(() => []),
          getAnnotationProgress(targetDatasetId),
        ]);

        if (cancelled) return;

        const currentStore = useAppStore.getState();
        const currentStoreDatasetId = currentStore.gallery.currentDataset?.id;
        const currentGen = currentStore.gallery.requestGeneration;

        // Ignore outdated results if user switched to another dataset
        if (currentStoreDatasetId !== targetDatasetId) {
          return;
        }

        const labelsArray = extractLabelsFromResponse(labelsResponse);

        if (currentGen === generation) {
          // Latest generation: commit all results
          if (items) galleryActions.setImages(items);
          galleryActions.setLabels(labelsArray);
          galleryActions.setStats(statsResponse);
          galleryActions.setLoadingData(false);
        } else {
          // Superseded by a newer request on the same dataset (e.g. post-upload refresh).
          // An older initial load must not overwrite a newer post-upload refresh.
          // Ensure loading clears and labels/statistics remain correct.
          if (!currentStore.gallery.labelsLoaded) {
            galleryActions.setLabels(labelsArray);
          }
          if (!currentStore.gallery.statsLoaded) {
            galleryActions.setStats(statsResponse);
          }
          galleryActions.setLoadingData(false);
        }
      } catch (err) {
        if (cancelled) return;

        const currentStore = useAppStore.getState();
        const currentStoreDatasetId = currentStore.gallery.currentDataset?.id;
        const currentGen = currentStore.gallery.requestGeneration;

        // Ignore outdated errors if user switched to another dataset
        if (currentStoreDatasetId !== targetDatasetId) {
          return;
        }

        if (currentGen === generation) {
          console.error("Error fetching dataset data:", err);
          galleryActions.setGalleryError("Failed to load dataset data");
          galleryActions.setLoadingData(false);
        } else {
          // Superseded on same dataset: ignore outdated error, but clear loading state
          galleryActions.setLoadingData(false);
        }
      }
    };

    fetchDatasetData();

    return () => {
      cancelled = true;
      galleryActions.setLoadingData(false);
    };
  }, [currentDataset, datasetId, getAnnotationProgress, galleryActions]);

  return currentDataset;
};

