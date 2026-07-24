import React, { useEffect, useRef, useState } from 'react';
import {
  useContextMenuVisible,
  useContextMenuX,
  useContextMenuY,
  useContextMenuTargetObjectId,
  useHideContextMenu,
  useEnterFocusMode,
  useObjectsList,
  useSelectedObjects,
  useImageObject,
  useUpdateObject,
  useRemoveObject,
  useEnterRefinementMode,
  useSetCurrentTool,
  useRefinementModeActive,
  useFocusModeActive,
  useFocusModeObjectId,
  useExitFocusMode,
  useSuggestionModel,
  useWebSocketIsReady,
  useEnterEditMode,
  useStartLineEdit,
  useSelectObject,
} from '../../../stores/selectors/annotationSelectors';
import { useRefinementMode } from '../../../hooks/useRefinementMode';
import { useZoomToObject } from '../../../hooks/useZoomToObject';
import { useLabelSelection } from '../../../hooks/useLabelSelection';
import { useLabelsHierarchy } from '../../../hooks/useLabelsHierarchy';
import { getChildLabels, resolveParentLabelId } from '../../../utils/labelHierarchy';
import { useSuggestionSegmentation } from '../../../hooks/useSuggestionSegmentation';
import { useDataset } from '../../../contexts/DatasetContext';
import { calculateRenderedImageDimensions } from '../../../utils/canvasUtils';
import { deleteObject } from '../../../utils/objectOperations';
import { hasValidLabel } from '../../../stores/utils/labelValidation';
import annotationSession from '../../../services/annotationSession';
import { getContourId } from '../../../utils/objectUtils';
import ContextMenuItem from './ContextMenuItem';
import HierarchicalLabelList from './HierarchicalLabelList';

const ObjectContextMenu = () => {
  const visible = useContextMenuVisible();
  const x = useContextMenuX();
  const y = useContextMenuY();
  const targetObjectId = useContextMenuTargetObjectId();
  const hideContextMenu = useHideContextMenu();
  const enterFocusMode = useEnterFocusMode();
  const objectsList = useObjectsList();
  const selectedObjects = useSelectedObjects();
  const imageObject = useImageObject();
  const updateObject = useUpdateObject();
  const removeObject = useRemoveObject();
  const enterRefinementMode = useEnterRefinementMode();
  const setCurrentTool = useSetCurrentTool();
  const refinementModeActive = useRefinementModeActive();
  const focusModeActive = useFocusModeActive();
  const focusModeObjectId = useFocusModeObjectId();
  const exitFocusMode = useExitFocusMode();
  const suggestionModel = useSuggestionModel();
  
  // Use the same zoom hook as refinement mode
  const { zoomToObject } = useZoomToObject({
    marginPct: 0.2,
    maxZoom: 4,
    minZoom: 1,
  });
  const wsIsReady = useWebSocketIsReady();
  const enterEditMode = useEnterEditMode();
  const startLineEdit = useStartLineEdit();
  const selectObject = useSelectObject();
  const { currentDataset } = useDataset();
  const menuRef = useRef(null);
  
  const [adjustedPosition, setAdjustedPosition] = useState({ x, y });
  
  // Get all selected objects (targets for batch operations)
  const targetObjects = React.useMemo(() => {
    return objectsList.filter(obj => selectedObjects.includes(obj.id));
  }, [objectsList, selectedObjects]);
  
  const isMultiSelect = targetObjects.length > 1;

  // Check if the single target object is unlabelled (focus mode requires a label)
  const targetObjectIsUnlabelled = React.useMemo(() => {
    if (isMultiSelect) return false;
    const target = objectsList.find(obj => obj.id === targetObjectId);
    return target ? !hasValidLabel(target.label) : false;
  }, [isMultiSelect, objectsList, targetObjectId]);
  
  // Use labels hierarchy hook
  const { labelMap, labelsLoading } = useLabelsHierarchy(visible, currentDataset);

  // Restrict the selectable labels to the current hierarchy level: root labels
  // when annotating at the top level, or the children of the parent contour's
  // label when annotating inside another contour.
  const flatLabels = React.useMemo(() => Array.from(labelMap.values()), [labelMap]);

  const primaryTarget = React.useMemo(
    () => objectsList.find((obj) => obj.id === targetObjectId) || targetObjects[0] || null,
    [objectsList, targetObjectId, targetObjects]
  );

  const parentLabelId = React.useMemo(
    () =>
      resolveParentLabelId(primaryTarget, objectsList, {
        active: focusModeActive,
        objectId: focusModeObjectId,
      }),
    [primaryTarget, objectsList, focusModeActive, focusModeObjectId]
  );

  const parentLabelName = React.useMemo(() => {
    if (parentLabelId === null || parentLabelId === undefined) return null;
    const parent =
      labelMap.get(parentLabelId) ||
      labelMap.get(Number(parentLabelId)) ||
      labelMap.get(String(parentLabelId));
    return parent?.name ?? null;
  }, [labelMap, parentLabelId]);

  // Strip nested children so only the single current level is rendered.
  const currentLevelLabels = React.useMemo(
    () =>
      getChildLabels(flatLabels, parentLabelId).map((label) => ({
        id: label.id,
        name: label.name,
        parent_id: label.parent_id,
      })),
    [flatLabels, parentLabelId]
  );
  
  // Use suggestion segmentation hook
  const { runSuggestion, isRunning: isRunningSuggestion } = useSuggestionSegmentation(
    null, // onSuccess: objects are automatically added via WebSocket
    (error) => alert(`Failed to suggest similar instances: ${error.message || 'Unknown error'}`)
  );

  // Adjust position to keep menu within container bounds and place it intuitively next to the object
  useEffect(() => {
    if (!visible || !menuRef.current) return;

    const menu = menuRef.current;
    const menuRect = menu.getBoundingClientRect();
    
    // Get the container bounds (the canvas container)
    const container = menu.parentElement;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    const offset = 10; // Small offset from cursor
    let adjustedX = x + offset;
    let adjustedY = y + offset;

    // Horizontal positioning: prefer right, flip to left if needed
    if (adjustedX + menuRect.width > containerWidth - 10) {
      adjustedX = x - menuRect.width - offset;
    }
    
    // Keep within horizontal bounds
    adjustedX = Math.max(10, Math.min(adjustedX, containerWidth - menuRect.width - 10));

    // Vertical positioning: prefer below, flip above if needed
    if (adjustedY + menuRect.height > containerHeight - 10) {
      adjustedY = y - menuRect.height - offset;
    }
    
    // Keep within vertical bounds
    adjustedY = Math.max(10, Math.min(adjustedY, containerHeight - menuRect.height - 10));

    setAdjustedPosition({ x: adjustedX, y: adjustedY });
  }, [visible, x, y]);

  // Close menu on outside click
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        hideContextMenu();
      }
    };

    // Add small delay to prevent immediate close on the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Use shared label selection hook
  const handleLabelSelectBase = useLabelSelection(
    updateObject,
    () => {
      // onSuccess: switch tool and hide menu
      setCurrentTool('ai_annotation');
      hideContextMenu();
    },
    (error) => {
      // onError: show error and hide menu
      alert(`Failed to apply label: ${error.message || 'Unknown error'}`);
      hideContextMenu();
    }
  );

  const handleLabelSelect = async (label) => {
    if (targetObjects.length === 0) {
      hideContextMenu();
      return;
    }

    // Apply label to all selected objects
    try {
      for (const targetObject of targetObjects) {
        await handleLabelSelectBase(targetObject, label);
      }
      
      // Success: menu is already hidden by handleLabelSelectBase
    } catch (error) {
      // Error is already handled by handleLabelSelectBase
      hideContextMenu();
    }
  };

  const handleFocusMode = async () => {
    // Disable focus mode when in refinement mode or multiple objects selected
    if (refinementModeActive || isMultiSelect) {
      return;
    }
    
    if (!targetObjectId || !imageObject) return;

    // Find the target object
    const targetObject = objectsList.find(obj => obj.id === targetObjectId);
    if (!targetObject || !targetObject.x || !targetObject.y || targetObject.x.length === 0) {
      hideContextMenu();
      return;
    }

    // Block focus mode for unlabelled objects
    if (!hasValidLabel(targetObject.label)) {
      hideContextMenu();
      return;
    }
    
    // Get contour ID for WebSocket message
    const contourId = getContourId(targetObject);
    
    // Create mask from x,y arrays for focus mode boundary checking
    const points = targetObject.x.map((x, i) => [
      x * imageObject.width,
      targetObject.y[i] * imageObject.height
    ]);
    const objectMask = { points: points };
    
    try {
      // Send focus message to backend via WebSocket
      await annotationSession.focusImage(contourId);
      
      // Enter focus mode in the store (without zoom - zoom is handled externally)
      enterFocusMode(targetObjectId, objectMask);
    } catch (error) {
      console.error('Failed to enter focus mode:', error);
      hideContextMenu();
      return;
    }

    // Get the container element (the canvas container)
    const container = menuRef.current?.parentElement;
    if (!container) {
      hideContextMenu();
      return;
    }

    const containerWidth = container.offsetWidth || 800;
    const containerHeight = container.offsetHeight || 600;

    // Calculate image dimensions (actual image size)
    const imageDimensions = {
      width: imageObject.width || 800,
      height: imageObject.height || 600
    };

    // Calculate container dimensions
    const containerDimensions = {
      width: containerWidth,
      height: containerHeight
    };

    // Calculate rendered image dimensions (how the image is displayed in the container)
    const renderedImageDimensions = calculateRenderedImageDimensions(
      imageObject,
      containerWidth,
      containerHeight
    );

    // Use the same zoom logic as refinement mode
    zoomToObject(
      targetObject, 
      imageDimensions, 
      containerDimensions, 
      renderedImageDimensions,
      { animateMs: 300, immediate: false }
    );
    
    hideContextMenu();
  };

  const handleReject = async () => {
    if (targetObjects.length === 0) {
      hideContextMenu();
      return;
    }

    try {
      // Delete all selected objects
      for (const targetObject of targetObjects) {
        await deleteObject(targetObject, removeObject);
      }
      
      // Switch to AI assisted annotation tool
      setCurrentTool('ai_annotation');
      
      hideContextMenu();
    } catch (error) {
      alert(`Failed to reject object(s): ${error.message || 'Unknown error'}`);
      hideContextMenu();
    }
  };

  // Use shared refinement mode hook
  const enterRefinementModeForObject = useRefinementMode({
    enterRefinementMode,
    setCurrentTool,
    exitFocusMode,
    focusModeActive,
    imageObject,
    containerRef: menuRef,
    zoomOptions: {
      marginPct: 0.25,
      maxZoom: 4,
      minZoom: 1,
    },
  });

  const handleRefine = async () => {
    // Disable refinement mode for multiple objects
    if (isMultiSelect) {
      return;
    }
    
    if (!targetObjectId) return;

    // Find the target object to get its contour_id
    const targetObject = objectsList.find(obj => obj.id === targetObjectId);
    if (!targetObject) {
      hideContextMenu();
      return;
    }

    try {
      await enterRefinementModeForObject(targetObject);

      // Also enter edit mode so control points are immediately available
      if (targetObject.x && targetObject.y && targetObject.x.length > 0 && targetObject.contour_id != null) {
        enterEditMode(targetObject.id, targetObject.contour_id, targetObject.x, targetObject.y);
      }

      hideContextMenu();
    } catch (error) {
      alert(`Failed to enter refinement mode: ${error.message || 'Unknown error'}`);
      hideContextMenu();
    }
  };

  const handleSuggestSimilar = async () => {
    if (targetObjects.length === 0) {
      hideContextMenu();
      return;
    }

    // Get all contour IDs from selected objects
    const contourIds = targetObjects
      .map(obj => obj.contour_id)
      .filter(id => id !== null && id !== undefined);
    
    if (contourIds.length === 0) {
      alert('Could not find contour IDs for selected objects');
      hideContextMenu();
      return;
    }

    // Check if WebSocket is ready
    if (!wsIsReady) {
      alert('WebSocket connection is not ready. Please wait or refresh the page.');
      hideContextMenu();
      return;
    }

    hideContextMenu();
    
    // Use the suggestion hook with all selected contour IDs as seeds
    // For multiple seeds, we'll use the first object's labelId as the default
    const labelId = targetObjects[0]?.labelId;
    
    // Pass contour IDs (hook handles both single and array)
    await runSuggestion(contourIds.length === 1 ? contourIds[0] : contourIds, labelId);
  };

  const handleLineEditContour = () => {
    if (isMultiSelect) return;
    const targetObject = objectsList.find(obj => obj.id === targetObjectId);
    if (!targetObject || targetObject.contour_id == null ||
        !targetObject.x || targetObject.x.length === 0) {
      hideContextMenu();
      return;
    }

    if (focusModeActive) {
      if (annotationSession.isReady()) {
        annotationSession.unfocusImage().catch(() => {});
      }
      exitFocusMode();
    }

    selectObject(targetObject.id);
    setCurrentTool('selection');
    startLineEdit(targetObject.id, targetObject.contour_id, targetObject.x, targetObject.y);

    // Frame the instance so there is room to draw the line.
    if (imageObject && targetObject.x.length > 0) {
      const container = menuRef.current?.parentElement;
      if (container?.offsetWidth && container?.offsetHeight) {
        const rendered = calculateRenderedImageDimensions(imageObject, container.offsetWidth, container.offsetHeight);
        zoomToObject(
          targetObject,
          { width: imageObject.width, height: imageObject.height },
          { width: container.offsetWidth, height: container.offsetHeight },
          rendered,
          { animateMs: 300, immediate: false }
        );
      }
    }

    hideContextMenu();
  };

  const handleEditContour = () => {
    // Disable edit mode for multiple objects
    if (isMultiSelect) {
      return;
    }
    
    if (!targetObjectId) {
      hideContextMenu();
      return;
    }

    // Find the target object
    const targetObject = objectsList.find(obj => obj.id === targetObjectId);
    if (!targetObject) {
      hideContextMenu();
      return;
    }

    // Ensure object has valid coordinates
    if (!targetObject.x || !targetObject.y || targetObject.x.length === 0 || targetObject.y.length === 0) {
      alert('Cannot edit object: missing or invalid coordinates');
      hideContextMenu();
      return;
    }
    
    // Ensure contour_id exists for backend communication
    if (!targetObject.contour_id && targetObject.contour_id !== 0) {
      alert('Cannot edit object: missing contour_id');
      hideContextMenu();
      return;
    }

    // Exit focus mode if active
    if (focusModeActive) {
      if (annotationSession.isReady()) {
        annotationSession.unfocusImage().catch(err => 
          console.error('Failed to send unfocus message:', err)
        );
      }
      exitFocusMode();
    }

    // Enter edit mode
    enterEditMode(targetObject.id, targetObject.contour_id, targetObject.x, targetObject.y);

    // Zoom into the contour (like refinement mode does)
    if (imageObject && targetObject.x && targetObject.y && targetObject.x.length > 0) {
      const container = menuRef.current?.parentElement;
      if (container) {
        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;
        if (containerWidth && containerHeight) {
          const renderedImageDimensions = calculateRenderedImageDimensions(imageObject, containerWidth, containerHeight);
          zoomToObject(
            targetObject,
            { width: imageObject.width, height: imageObject.height },
            { width: containerWidth, height: containerHeight },
            renderedImageDimensions,
            { animateMs: 300, immediate: false }
          );
        }
      }
    }
    
    hideContextMenu();
  };

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-white rounded-md shadow-xl border border-gray-200 py-1 min-w-[120px] max-w-[220px]"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      {/* Header showing selection count */}
      {isMultiSelect && (
        <div className="px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border-b border-blue-100">
          {targetObjects.length} objects selected
        </div>
      )}
      
      {/* Reject Object Option */}
      <ContextMenuItem
        onClick={handleReject}
        className="hover:bg-red-50 hover:text-red-700"
        label={isMultiSelect ? `Reject ${targetObjects.length} objects` : "Reject object"}
        icon={
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        }
      />

      {/* Focus Mode Option - Disabled in refinement mode, multi-select, or for unlabelled objects */}
      <ContextMenuItem
        onClick={handleFocusMode}
        disabled={refinementModeActive || isMultiSelect || targetObjectIsUnlabelled}
        title={
          isMultiSelect 
            ? 'Focus mode is disabled for multiple selections' 
            : refinementModeActive 
              ? 'Focus mode is disabled during refinement'
            : targetObjectIsUnlabelled
              ? 'Assign a label to this object before entering Focus Mode'
              : 'Enter focus mode'
        }
        label="Focus Mode"
        icon={
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
        }
      />

      {/* Refine Option - Disabled for multi-select */}
      <ContextMenuItem
        onClick={handleRefine}
        disabled={isMultiSelect}
        title={isMultiSelect ? 'Refinement mode is disabled for multiple selections' : 'Refine object'}
        className="hover:bg-purple-50 hover:text-purple-700"
        label="Refine Object"
        icon={
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        }
      />

      {/* Reshape by Line Option - draw a line that is merged into the boundary */}
      <ContextMenuItem
        onClick={handleLineEditContour}
        disabled={isMultiSelect}
        title={isMultiSelect ? 'Reshape is disabled for multiple selections' : 'Draw a line across the boundary to cut off or add a region'}
        className="hover:bg-teal-50 hover:text-teal-700"
        label="Reshape by Line"
        icon={
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20l6-6m0 0l4-4 6-6M10 14l4 4m-4-4l-2-2" />
          </svg>
        }
      />

      {/* Edit Contour Option - Disabled for multi-select */}
      <ContextMenuItem
        onClick={handleEditContour}
        disabled={isMultiSelect}
        title={isMultiSelect ? 'Edit contour is disabled for multiple selections' : 'Drag the existing outline’s control points'}
        className="hover:bg-blue-50 hover:text-blue-700"
        label="Edit Contour"
        icon={
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        }
      />

      {/* Suggest Similar Instances Option */}
      <ContextMenuItem
        onClick={handleSuggestSimilar}
        disabled={isRunningSuggestion || !suggestionModel || !wsIsReady}
        className="hover:bg-green-50 hover:text-green-700"
        title={
          !suggestionModel 
            ? 'Select a suggestion model first' 
            : !wsIsReady 
              ? 'WebSocket not ready' 
              : isMultiSelect
                ? `Use ${targetObjects.length} objects as seeds for suggestion segmentation`
                : 'Find similar instances using suggestion segmentation'
        }
        label={isRunningSuggestion ? 'Finding similar...' : 'Suggest Similar Instances'}
        icon={
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        }
      />

      {/* Label section header */}
      <div className="px-3 py-1 border-b border-gray-100">
        <div className="text-xs font-medium text-gray-600">
          {isMultiSelect ? `Assign label to ${targetObjects.length} objects` : 'Label'}
        </div>
        <div className="text-[10px] font-normal text-gray-400">
          {parentLabelName ? `Sub-labels of ${parentLabelName}` : 'Root level'}
        </div>
      </div>

      {/* Current-level label list (root labels, or children of the parent contour's label) */}
      <HierarchicalLabelList
        labelHierarchy={currentLevelLabels}
        labelsLoading={labelsLoading}
        onLabelSelect={handleLabelSelect}
        emptyMessage={
          parentLabelName
            ? `No sub-labels under "${parentLabelName}"`
            : 'No labels available'
        }
      />
    </div>
  );
};

export default ObjectContextMenu;

