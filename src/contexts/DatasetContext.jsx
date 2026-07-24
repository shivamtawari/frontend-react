import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import * as api from '../api';
import { emptyStatusCounts } from '../utils/imageStatus';
import { useAuth } from './AuthContext';

const DatasetContext = createContext();

export const useDataset = () => {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error('useDataset must be used within a DatasetProvider');
  }
  return context;
};

export const DatasetProvider = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [datasets, setDatasets] = useState([]);
  const [currentDataset, setCurrentDataset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch all datasets
  const fetchDatasets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.fetchDatasets();
      if (response.success) {
        setDatasets(response.datasets);
        // Both the initial selection and the re-sync happen inside one functional
        // update. Reading the previous dataset from `prev` rather than from the
        // enclosing scope is what keeps this callback dependency-free: depending on
        // `currentDataset` here made every fetch rebuild `fetchDatasets`, which the
        // init effect below lists as a dependency, so the effect re-fired and fetched
        // again — an endless /datasets/all -> images -> thumbnails loop that never
        // let the page finish loading.
        setCurrentDataset((prev) => {
          if (!prev) return response.datasets.length > 0 ? response.datasets[0] : null;
          // Re-sync the selected dataset from the fresh list so `my_role` and
          // `my_permissions` reflect the latest grant rather than whatever they
          // were when it was first opened.
          return response.datasets.find((d) => d.id === prev.id) || prev;
        });
        return response.datasets;
      }
      return [];
    } catch (err) {
      setError('Failed to fetch datasets');
      console.error('Error fetching datasets:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Get annotation progress for a dataset.
  // Memoised because consumers list it in effect dependency arrays (see
  // useDatasetGalleryData) — an unstable identity there re-fires the fetch on
  // every single provider render.
  const getAnnotationProgress = useCallback(async (datasetId) => {
    // Spreading the backend's counts over a zeroed template keeps this working
    // when a status is added server-side (as `rejected` was) without listing
    // each key by hand here.
    const empty = { ...emptyStatusCounts(), total: 0 };
    try {
      const response = await api.getAnnotationProgress(datasetId);
      if (response.success) {
        return {
          ...empty,
          ...(response.num_masks_with_status || {}),
          total: response.total_images || 0,
        };
      }
      return empty;
    } catch (err) {
      console.error('Error fetching annotation progress:', err);
      return empty;
    }
  }, []);

  // Get sample images for a dataset
  const getSampleImages = useCallback(async (datasetId, limit = 4) => {
    try {
      const images = await api.getSampleImages(datasetId, limit);
      return images;
    } catch (err) {
      console.error('Error fetching sample images:', err);
      return [];
    }
  }, []);

  // Create a new dataset
  const createDataset = useCallback(async (name, description, datasetType = 'image') => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.createDataset(name, description, datasetType);
      if (response.success) {
        // Refresh the list and wait for it to complete
        await fetchDatasets();
        return response;
      }
      throw new Error(response.message || 'Failed to create dataset');
    } catch (err) {
      setError(err.message || 'Failed to create dataset');
      console.error('Error creating dataset:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchDatasets]);

  // Delete a dataset
  const deleteDataset = useCallback(async (datasetId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.deleteDataset(datasetId);
      if (response.success) {
        await fetchDatasets(); // Refresh the list
        // If the deleted dataset was the current one, clear it. Functional form so
        // this callback needs no `currentDataset` dependency.
        setCurrentDataset((prev) => (prev && prev.id === datasetId ? null : prev));
        return response;
      }
      throw new Error(response.message || 'Failed to delete dataset');
    } catch (err) {
      setError(err.message || 'Failed to delete dataset');
      console.error('Error deleting dataset:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchDatasets]);

  // Select a dataset
  const selectDataset = useCallback((dataset) => {
    setCurrentDataset(dataset);
  }, []);

  // Initialize datasets when authenticated
  useEffect(() => {
    // Only fetch datasets if user is authenticated and auth is not loading
    if (isAuthenticated && !authLoading) {
      fetchDatasets();
    } else if (!isAuthenticated && !authLoading) {
      // Clear datasets when user logs out
      setDatasets([]);
      setCurrentDataset(null);
    }
  }, [isAuthenticated, authLoading, fetchDatasets]);

  // Memoised so a provider re-render does not hand every consumer a brand-new
  // context object — several of them spread these callbacks into effect deps.
  const value = useMemo(() => ({
    datasets,
    currentDataset,
    loading,
    error,
    fetchDatasets,
    createDataset,
    deleteDataset,
    selectDataset,
    getAnnotationProgress,
    getSampleImages,
    setError
  }), [
    datasets,
    currentDataset,
    loading,
    error,
    fetchDatasets,
    createDataset,
    deleteDataset,
    selectDataset,
    getAnnotationProgress,
    getSampleImages
  ]);

  return (
    <DatasetContext.Provider value={value}>
      {children}
    </DatasetContext.Provider>
  );
}; 