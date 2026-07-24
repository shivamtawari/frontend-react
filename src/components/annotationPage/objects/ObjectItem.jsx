import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { 
  useSelectedObjects, 
  useSelectObject, 
  useDeselectObject, 
  useRemoveObject,
  useUpdateObject,
  useImageObject,
  useSetZoomLevel,
  useSetPanOffset,
  useEnterRefinementMode,
  useSetCurrentTool,
  useFocusModeActive,
  useExitFocusMode,
  useCurrentTool,
  useEnterFocusMode,
  useRefinementModeActive,
  useAnnotationStatus,
  useEnterEditMode,
  useObjectsList,
  useFocusModeObjectId,
} from '../../../stores/selectors/annotationSelectors';
import { useZoomToObject } from '../../../hooks/useZoomToObject';
import { useRefinementMode } from '../../../hooks/useRefinementMode';
import { useLabelSelection } from '../../../hooks/useLabelSelection';
import { useMarkAsReviewed } from '../../../hooks/useMarkAsReviewed';
import { useDataset } from '../../../contexts/DatasetContext';
import { fetchLabels } from '../../../api/labels';
import { extractLabelsFromResponse, getChildLabels, resolveParentLabelId } from '../../../utils/labelHierarchy';
import { hexToRgba } from '../../../utils/labelColors';
import { calculateRenderedImageDimensions, getCanvasContainer } from '../../../utils/canvasUtils';
import annotationSession from '../../../services/annotationSession';
import { getContourId } from '../../../utils/objectUtils';
import { deleteObject } from '../../../utils/objectOperations';
import { hasValidLabel } from '../../../stores/utils/labelValidation';
import { useCurrentMaskId } from '../../../stores/selectors/annotationSelectors';
import RejectMaskModal from '../modals/RejectMaskModal';
import ObjectActions from './ObjectActions';
import ObjectStatsPopover from './ObjectStatsPopover';
import ReviewedByBadge from './ReviewedByBadge';
import LabelSelectionModal from './LabelSelectionModal';

const ObjectItem = ({ object, hasChildren = false, isExpanded = true, onToggleExpand }) => {
  const selectedObjects = useSelectedObjects();
  const selectObject = useSelectObject();
  const deselectObject = useDeselectObject();
  const removeObject = useRemoveObject();
  const updateObject = useUpdateObject();
  const enterRefinementMode = useEnterRefinementMode();
  const setCurrentTool = useSetCurrentTool();
  const focusModeActive = useFocusModeActive();
  const exitFocusMode = useExitFocusMode();
  const currentTool = useCurrentTool();
  const enterFocusMode = useEnterFocusMode();
  const refinementModeActive = useRefinementModeActive();
  const annotationStatus = useAnnotationStatus();
  const enterEditMode = useEnterEditMode();
  const { currentDataset } = useDataset();
  const imageObject = useImageObject();
  const setZoomLevel = useSetZoomLevel();
  const setPanOffset = useSetPanOffset();
  const objectsList = useObjectsList();
  const focusModeObjectId = useFocusModeObjectId();
  const currentMaskId = useCurrentMaskId();
  const [showSendBackModal, setShowSendBackModal] = useState(false);

  // The labels selectable for this object are dictated by its level in the
  // hierarchy: root labels at the top level, or the children of the parent
  // contour's label when this object lives inside another contour.
  const parentLabelId = React.useMemo(
    () =>
      resolveParentLabelId(object, objectsList, {
        active: focusModeActive,
        objectId: focusModeObjectId,
      }),
    [object, objectsList, focusModeActive, focusModeObjectId]
  );
  
  // Use the modular zoom hook
  const { zoomToObject: zoomToObjectFn } = useZoomToObject({
    marginPct: 0.2,
    maxZoom: 4, // Cap at 400% (max zoom)
    minZoom: 1
  });
  
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labels, setLabels] = useState([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  // When true, the label modal was opened because focus mode requires a label first
  const [labelModalForFocusMode, setLabelModalForFocusMode] = useState(false);
  const singleClickTimeoutRef = useRef(null);
  
  const isSelected = selectedObjects.includes(object.id);
  const isVisible = true; // For now, assume all objects are visible
  // Determine if reviewed based on reviewed_by field (ignore prop, use actual data)
  const isReviewed = object.reviewed_by && object.reviewed_by.length > 0;
  const isReviewable = annotationStatus === 'reviewable' || annotationStatus === 'finished';

  // Helper function to check if an object has a valid label
  const hasValidLabel = (obj) => {
    if (!obj.label) return false;
    // Convert to string and trim
    const labelStr = String(obj.label || '').trim();
    if (!labelStr || labelStr === 'Object') return false;
    // Check if label is just a number (like "2") - these are not valid labels
    if (/^\d+$/.test(labelStr)) return false;
    return true;
  };

  // Compute display name: if labeled, show "{label} #{id}", otherwise "Object #{id}"
  const displayName = React.useMemo(() => {
    // Only compute label-based name for reviewed objects with valid labels
    if (isReviewed && hasValidLabel(object)) {
      return `${object.label} #${object.id}`;
    }
    
    // For unlabeled objects or unreviewed objects, show default format
    return `Object #${object.id}`;
  }, [object, isReviewed]);

  const performPanZoom = () => {
    if (!imageObject || !object.x || !object.y || object.x.length === 0) {
      return;
    }

    // Get image dimensions
    const imageDimensions = {
      width: imageObject.width,
      height: imageObject.height
    };

    // Find the canvas container
    const container = getCanvasContainer(null);
    if (!container) {
      return;
    }

    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;
    
    if (!containerWidth || !containerHeight) {
      return;
    }

    // Calculate rendered image dimensions (object-contain sizing)
    const renderedImageDimensions = calculateRenderedImageDimensions(
      imageObject,
      containerWidth,
      containerHeight
    );

    // Use the modular zoom hook
    zoomToObjectFn(
      object, // Object with x, y arrays
      imageDimensions,
      { width: containerWidth, height: containerHeight },
      renderedImageDimensions,
      {
        animateMs: 320, // Smooth animation
        immediate: false
      }
    );
  };

  const resetView = () => {
    // Reset zoom and pan to default view (show entire image)
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Use shared refinement mode hook
  const enterRefinementModeForObject = useRefinementMode({
    enterRefinementMode,
    setCurrentTool,
    exitFocusMode,
    focusModeActive,
    imageObject,
    containerRef: null, // Will use getCanvasContainer fallback
    zoomOptions: {
      marginPct: 0.2,
      maxZoom: 4,
      minZoom: 1,
    },
  });

  const handleDoubleClick = async () => {
    // Double-click enters refinement mode
    try {
      await enterRefinementModeForObject(object);
    } catch (error) {
      alert(`Failed to enter refinement mode: ${error.message || 'Unknown error'}`);
    }
  };

  const handleItemClick = (e) => {
    // Don't trigger if clicking action buttons or chevron
    if (e.target.closest('button')) {
      return;
    }
    
    // Check if Shift key is held for multi-select
    const isShiftHeld = e.shiftKey;
    
    // If Shift is held, toggle selection immediately without focus mode
    if (isShiftHeld) {
      if (isSelected) {
        deselectObject(object.id);
      } else {
        selectObject(object.id);
      }
      return;
    }
    
    // Detect double-click
    const currentTime = Date.now();
    const timeDiff = currentTime - lastClickTime;
    
    if (timeDiff < 300 && lastClickTime > 0) {
      // Double-click detected - cancel pending single-click action
      if (singleClickTimeoutRef.current) {
        clearTimeout(singleClickTimeoutRef.current);
        singleClickTimeoutRef.current = null;
      }
      handleDoubleClick();
      setLastClickTime(0); // Reset to prevent triple-clicks
      return;
    }
    
    setLastClickTime(currentTime);
    
    // Clear any existing timeout
    if (singleClickTimeoutRef.current) {
      clearTimeout(singleClickTimeoutRef.current);
    }
    
    // Delay single-click action to allow double-click detection
    singleClickTimeoutRef.current = setTimeout(async () => {
      singleClickTimeoutRef.current = null;
      
      // Single click: Toggle selection, enter focus mode (if appropriate), and zoom/pan to object
      if (isSelected) {
        // If already selected, deselect it
        deselectObject(object.id);
        // Exit focus mode if active
        if (focusModeActive) {
          // Send unfocus message to backend
          if (annotationSession.isReady()) {
            annotationSession.unfocusImage().catch(err => 
              console.error('Failed to send unfocus message:', err)
            );
          }
          exitFocusMode();
        }
        // If this was the only selected object, reset view
        if (selectedObjects.length === 1) {
          resetView();
        }
      } else {
        // If not selected, select it
        selectObject(object.id);
        
        // Enter focus mode if:
        // 1. Not in refinement mode
        // 2. Using selection tool (not AI annotation tool)
        // 3. Object has valid coordinates
        if (!refinementModeActive && currentTool === 'selection' && 
            imageObject && object.x && object.y && object.x.length > 0) {

          // Block focus mode for unlabelled objects — prompt to label first
          if (!hasValidLabel(object.label)) {
            setLabelModalForFocusMode(true);
            setShowLabelModal(true);
            performPanZoom();
            return;
          }

          // Create mask from x,y arrays if mask doesn't exist or doesn't have points
          let mask = object.mask;
          
          // If mask doesn't exist or doesn't have points, create it from x,y arrays
          if (!mask || !mask.points) {
            // Convert normalized x,y arrays to pixel coordinates and create points array
            const points = object.x.map((x, i) => [
              x * imageObject.width,
              object.y[i] * imageObject.height
            ]);
            mask = { points: points };
          }
          
          if (mask && mask.points && mask.points.length > 0) {
            // Get contour ID for WebSocket message
            const contourId = getContourId(object);
            
            try {
              // Send focus message to backend via WebSocket
              await annotationSession.focusImage(contourId);
              
              // Enter focus mode in the store
              enterFocusMode(object.id, mask);
            } catch (error) {
              console.error('Failed to enter focus mode:', error);
            }
          }
        }
        
        // Pan/zoom to the object
        performPanZoom();
      }
    }, 200); // Wait 200ms to see if a second click comes
  };

  const handleEdit = (e) => {
    e?.stopPropagation();
    
    // Ensure object has valid coordinates
    if (!object.x || !object.y || object.x.length === 0 || object.y.length === 0) {
      console.error('Cannot edit object: missing or invalid coordinates');
      return;
    }
    
    // Ensure contour_id exists for backend communication
    if (!object.contour_id && object.contour_id !== 0) {
      console.error('Cannot edit object: missing contour_id');
      return;
    }
    
    // Exit focus mode if active
    if (focusModeActive) {
      // Send unfocus message to backend
      if (annotationSession.isReady()) {
        annotationSession.unfocusImage().catch(err => 
          console.error('Failed to send unfocus message:', err)
        );
      }
      exitFocusMode();
    }
    
    // Enter edit mode
    enterEditMode(object.id, object.contour_id, object.x, object.y);
    
    // Optionally select the object for better visibility
    if (!isSelected) {
      selectObject(object.id);
    }
  };

  const handleDelete = async (e) => {
    e?.stopPropagation();
    
    try {
      await deleteObject(object, removeObject);
    } catch (error) {
      alert(`Failed to delete object: ${error.message || 'Unknown error'}`);
    }
  };

  // Fetch labels when modal opens
  useEffect(() => {
    if (!showLabelModal || !currentDataset) return;

    const loadLabels = async () => {
      setLabelsLoading(true);
      try {
        const labelsData = await fetchLabels(currentDataset.id);
        const allLabels = extractLabelsFromResponse(labelsData, false);
        // Only offer the labels available at this object's hierarchy level.
        setLabels(getChildLabels(allLabels, parentLabelId));
      } catch (error) {
        setLabels([]);
      } finally {
        setLabelsLoading(false);
      }
    };

    loadLabels();
  }, [showLabelModal, currentDataset, parentLabelId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (singleClickTimeoutRef.current) {
        clearTimeout(singleClickTimeoutRef.current);
      }
    };
  }, []);

  const handleAccept = (e) => {
    e?.stopPropagation();
    // Show label selection modal instead of directly accepting
    if (!currentDataset) {
      alert('Please select a dataset first');
      return;
    }
    setShowLabelModal(true);
  };

  // Use shared label selection hook
  const handleLabelSelect = useLabelSelection(
    updateObject,
    () => setShowLabelModal(false), // onSuccess: close modal
    (error) => alert(`Failed to accept object: ${error.message || 'Unknown error'}`) // onError
  );

  // Use shared mark as reviewed hook
  const markAsReviewed = useMarkAsReviewed(
    updateObject,
    null, // onSuccess: no additional action needed
    (error) => alert(`Failed to mark as reviewed: ${error.message || 'Unknown error'}`) // onError
  );

  const handleLabelSelectWrapper = async (label) => {
    if (!label) return;
    await handleLabelSelect(object, label);

    // If the label modal was opened because focus mode requires a label, enter focus mode now
    if (labelModalForFocusMode) {
      setLabelModalForFocusMode(false);
      // Use the updated label name from the selection
      const updatedLabelName = typeof label === 'object' ? label.name : label;
      if (imageObject && object.x && object.y && object.x.length > 0) {
        let mask = object.mask;
        if (!mask || !mask.points) {
          const points = object.x.map((x, i) => [
            x * imageObject.width,
            object.y[i] * imageObject.height,
          ]);
          mask = { points };
        }
        if (mask && mask.points && mask.points.length > 0) {
          const contourId = getContourId(object);
          try {
            await annotationSession.focusImage(contourId);
            enterFocusMode(object.id, mask);
          } catch (error) {
            console.error('Failed to enter focus mode after labelling:', error);
          }
        }
      }
    }
  };

  const handleCloseModal = () => {
    setShowLabelModal(false);
    setLabelModalForFocusMode(false);
  };

  const handleReject = async (e) => {
    e?.stopPropagation();
    // Reject temporary object: delete it
    try {
      await deleteObject(object, removeObject);
    } catch (error) {
      alert(`Failed to reject object: ${error.message || 'Unknown error'}`);
    }
  };

  // Sending one object back is a review action that records a reason, unlike
  // handleReject above which simply discards an unwanted suggestion.
  const handleSendBack = (e) => {
    e?.stopPropagation();
    setShowSendBackModal(true);
  };

  const handleMarkAsReviewed = async (e) => {
    e?.stopPropagation();
    await markAsReviewed(object);
  };

  // Use object's color for styling
  const objectColor = object.color || '#3b82f6'; // Default to blue if no color
  const borderColorStyle = isSelected 
    ? objectColor 
    : hexToRgba(objectColor, 0.3); // Lighter border when not selected
  const bgColorStyle = isSelected
    ? hexToRgba(objectColor, 0.15) // More visible when selected
    : hexToRgba(objectColor, 0.08); // Subtle background

  return (
    <div
      className="group rounded-md border transition-colors cursor-pointer"
      style={{
        borderColor: borderColorStyle,
        backgroundColor: bgColorStyle,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = hexToRgba(objectColor, 0.12);
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = hexToRgba(objectColor, 0.08);
        }
      }}
      onClick={handleItemClick}
      title="Click to select and zoom to object"
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {/* Expand/collapse children, or aligning spacer for leaf objects */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand?.();
            }}
            className="p-0.5 text-gray-400 hover:text-gray-700 rounded shrink-0"
            title={isExpanded ? 'Collapse children' : 'Expand children'}
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-[18px] shrink-0" aria-hidden="true" />
        )}

        {/* Color dot */}
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white"
          style={{ backgroundColor: objectColor }}
        />

        {/* Name */}
        <span className="flex-1 min-w-0 truncate text-xs font-medium text-gray-800">
          {displayName}
        </span>

        {/* Reviewed status tick (unreviewed objects have none) */}
        {isReviewed && <ReviewedByBadge reviewedBy={object.reviewed_by} />}

        {/* Hoverable stats */}
        <ObjectStatsPopover object={object} />

        {/* Actions — revealed on hover/focus to keep rows compact */}
        <div className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <ObjectActions
            isReviewed={isReviewed}
            isReviewable={isReviewable}
            isVisible={isVisible}
            dataset={currentDataset}
            onAccept={handleAccept}
            onReject={handleReject}
            onSendBack={currentMaskId ? handleSendBack : undefined}
            onMarkAsReviewed={handleMarkAsReviewed}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleVisibility={() => {/* TODO: Toggle visibility */}}
          />
        </div>
      </div>

      {/* Send-back modal, scoped to this one object */}
      {currentMaskId && (
        <RejectMaskModal
          isOpen={showSendBackModal}
          maskId={currentMaskId}
          contourId={getContourId(object)}
          contourLabel={object?.label_name || object?.label}
          onClose={() => setShowSendBackModal(false)}
        />
      )}

      {/* Label Selection Modal */}
      <LabelSelectionModal
        isOpen={showLabelModal}
        onClose={handleCloseModal}
        labels={labels}
        labelsLoading={labelsLoading}
        onLabelSelect={handleLabelSelectWrapper}
        description={
          labelModalForFocusMode
            ? 'Focus Mode requires a label to ensure annotation hierarchy integrity. Please assign a label to this object first.'
            : undefined
        }
      />
    </div>
  );
};

export default ObjectItem;
