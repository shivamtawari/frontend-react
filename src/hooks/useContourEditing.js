import { useCallback, useRef, useEffect } from 'react';
import {
  useEditModeActive,
  useEditModeContourId,
  useEditModeDraftCoordinates,
  useEditModeIsDirty,
  useEditModeObjectId,
  useEnterEditMode,
  useResetDraft,
  useExitEditMode,
  useUpdateObject,
  useObjectsList,
} from '../stores/selectors/annotationSelectors';
import annotationSession from '../services/annotationSession';

/**
 * Hook for managing contour editing operations
 * Handles entering/exiting edit mode and saving changes via WebSocket
 */
export const useContourEditing = () => {
  // State selectors
  const isEditModeActive = useEditModeActive();
  const editingObjectId = useEditModeObjectId();
  const editingContourId = useEditModeContourId();
  const draftCoordinates = useEditModeDraftCoordinates();
  const isDirty = useEditModeIsDirty();
  const objects = useObjectsList();

  // Actions
  const enterEditMode = useEnterEditMode();
  const resetDraft = useResetDraft();
  const exitEditMode = useExitEditMode();
  const updateObject = useUpdateObject();

  // Auto-save infrastructure: keep a ref with the latest state so the timer
  // callback always reads fresh values without stale closures.
  const autoSaveTimerRef = useRef(null);
  const stateRef = useRef({
    isEditModeActive: false,
    editingObjectId: null,
    editingContourId: null,
    draftCoordinates: null,
    isDirty: false,
    objects: [],
  });

  // Sync stateRef after every render (no deps = always current)
  useEffect(() => {
    stateRef.current = { isEditModeActive, editingObjectId, editingContourId, draftCoordinates, isDirty, objects };
  });

  /**
   * Start editing a contour
   * @param {number|string} objectId - Store object ID for local state management
   * @param {number} contourId - Backend contour ID for API calls
   * @param {Array<number>} x - Original x coordinates (normalized 0-1)
   * @param {Array<number>} y - Original y coordinates (normalized 0-1)
   */
  const startEditing = useCallback((objectId, contourId, x, y) => {
    if (!x || !y || x.length === 0 || y.length === 0) {
      return;
    }
    
    enterEditMode(objectId, contourId, x, y);
  }, [enterEditMode]);

  /**
   * Cancel editing and revert to original coordinates
   */
  const cancelEditing = useCallback(() => {
    if (!isEditModeActive) return;
    
    exitEditMode();
  }, [isEditModeActive, exitEditMode]);

  /**
   * Reset draft to original coordinates without exiting edit mode
   */
  const resetChanges = useCallback(() => {
    if (!isEditModeActive) return;
    
    resetDraft();
  }, [isEditModeActive, resetDraft]);

  /**
   * Save the edited contour to the backend
   * Sends WebSocket message and updates local store immediately
   */
  const saveEditing = useCallback(async () => {
    if (!isEditModeActive || !editingObjectId || !editingContourId || !draftCoordinates) {
      return;
    }

    if (!isDirty) {
      // No changes made, just exit
      exitEditMode();
      return;
    }

    try {
      // Find the object being edited
      const currentObject = objects.find(obj => obj.id === editingObjectId);
      if (!currentObject) {
        return;
      }

      // Store original coordinates and path for potential revert
      const originalCoordinates = {
        x: [...currentObject.x],
        y: [...currentObject.y],
        path: currentObject.path,
      };

      // Update local state immediately (optimistic update)
      // updateObject expects (id, updates) not the full object
      // Clear the cached path so it regenerates from new x,y coordinates
      updateObject(editingObjectId, {
        x: [...draftCoordinates.x],
        y: [...draftCoordinates.y],
        path: null, // Clear cached path to force regeneration
      });
      
      // Exit edit mode immediately to show the changes on the canvas
      exitEditMode();

      // Send update to backend via WebSocket (in background)
      try {
        const response = await annotationSession.modifyObject(editingContourId, {
          x: draftCoordinates.x,
          y: draftCoordinates.y,
        });

        if (!response.success) {
          // Revert local changes on failure
          updateObject(editingObjectId, originalCoordinates);
          alert('Failed to save contour changes. Changes have been reverted.');
        }
      } catch (error) {
        // Revert local changes on network error
        updateObject(editingObjectId, originalCoordinates);
        alert('Network error while saving. Changes have been reverted.');
      }
    } catch (error) {
      throw error;
    }
  }, [
    isEditModeActive,
    editingObjectId,
    editingContourId,
    draftCoordinates,
    isDirty,
    objects,
    updateObject,
    exitEditMode,
  ]);

  /**
   * Schedule an automatic save after AUTO_SAVE_DELAY ms of inactivity.
   * Resets the timer on each call so rapid edits only trigger one save.
   */
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      autoSaveTimerRef.current = null;
      const s = stateRef.current;
      if (!s.isEditModeActive || !s.editingObjectId || !s.editingContourId || !s.draftCoordinates || !s.isDirty) return;

      const currentObject = s.objects.find(obj => obj.id === s.editingObjectId);
      if (!currentObject) return;

      const originalCoordinates = { x: [...currentObject.x], y: [...currentObject.y], path: currentObject.path };

      // Optimistic local update
      updateObject(s.editingObjectId, { x: [...s.draftCoordinates.x], y: [...s.draftCoordinates.y], path: null });
      exitEditMode();

      try {
        const response = await annotationSession.modifyObject(s.editingContourId, {
          x: s.draftCoordinates.x,
          y: s.draftCoordinates.y,
        });
        if (!response.success) {
          updateObject(s.editingObjectId, originalCoordinates);
        }
      } catch {
        updateObject(s.editingObjectId, originalCoordinates);
      }
    }, 10_000); // 10-second idle window
  }, [updateObject, exitEditMode]); // Stable: Zustand actions don't change

  /** Cancel any pending auto-save timer. */
  const cancelAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  return {
    // State
    isEditModeActive,
    editingObjectId: editingObjectId,
    editingContourId,
    draftCoordinates,
    isDirty,
    
    // Actions
    startEditing,
    cancelEditing,
    resetChanges,
    saveEditing,
    scheduleAutoSave,
    cancelAutoSave,
  };
};
