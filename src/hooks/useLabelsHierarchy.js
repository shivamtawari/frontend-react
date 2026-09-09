import { useState, useEffect } from 'react';
import { fetchLabels } from '../api/labels';
import { extractLabelsFromResponse, buildLabelHierarchy } from '../utils/labelHierarchy';

/**
 * Hook for fetching and managing label hierarchy
 * 
 * @param {boolean} shouldLoad - Whether to load labels (e.g., when modal/menu is visible)
 * @param {Object} currentDataset - The current dataset
 * @returns {Object} - { labelHierarchy, labelMap, labelsLoading }
 */
export function useLabelsHierarchy(shouldLoad, currentDataset) {
  const [labelHierarchy, setLabelHierarchy] = useState([]);
  const [labelMap, setLabelMap] = useState(new Map());
  const [labelsLoading, setLabelsLoading] = useState(false);

  useEffect(() => {
    if (!shouldLoad || !currentDataset?.id) {
      setLabelHierarchy([]);
      setLabelMap(new Map());
      setLabelsLoading(false);
      return;
    }

    // Immediately clear state for new dataset so stale labels don't persist
    setLabelHierarchy([]);
    setLabelMap(new Map());

    let cancelled = false;

    const loadLabels = async () => {
      setLabelsLoading(true);
      try {
        const labelsData = await fetchLabels(currentDataset.id);
        if (cancelled) return;
        const labelsArray = extractLabelsFromResponse(labelsData, false); // Include all labels
        
        // Build hierarchical structure
        const hierarchy = buildLabelHierarchy(labelsArray);
        
        // Create a map for quick lookup
        const map = new Map();
        labelsArray.forEach(label => {
          map.set(label.id, label);
        });

        if (!cancelled) {
          setLabelHierarchy(hierarchy);
          setLabelMap(map);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load labels:', error);
          setLabelHierarchy([]);
          setLabelMap(new Map());
        }
      } finally {
        if (!cancelled) {
          setLabelsLoading(false);
        }
      }
    };

    loadLabels();

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, currentDataset?.id]);

  return { labelHierarchy, labelMap, labelsLoading };
}
