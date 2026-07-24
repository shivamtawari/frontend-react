import useAnnotationStore from '../useAnnotationStore';

// Simple state selectors 
export const useCurrentTool = () => useAnnotationStore(state => state.ui.currentTool);
export const useLeftSidebarCollapsed = () => useAnnotationStore(state => state.ui.leftSidebarCollapsed);
export const useRightSidebarCollapsed = () => useAnnotationStore(state => state.ui.rightSidebarCollapsed);
export const useVisibilityControlsExpanded = () => useAnnotationStore(state => state.ui.visibilityControlsExpanded);

// Canvas selectors
export const useCanvasPrompt = () => useAnnotationStore(state => state.canvas.prompt);
export const useIsPrompting = () => useAnnotationStore(state => state.canvas.isPrompting);

// Segmentation selectors
export const useCurrentMask = () => useAnnotationStore(state => state.segmentation.currentMask);

export const useCurrentImage = () => useAnnotationStore(state => state.images.currentImage);
export const useCurrentImageId = () => useAnnotationStore(state => state.images.currentImageId);
export const useImageList = () => useAnnotationStore(state => state.images.imageList);
export const useAnnotationStatus = () => useAnnotationStore(state => state.images.annotationStatus);

// Image loading and display selectors
export const useImageObject = () => useAnnotationStore(state => state.images.imageObject);
export const useImageLoading = () => useAnnotationStore(state => state.images.imageLoading);
export const useImageError = () => useAnnotationStore(state => state.images.imageError);

// Zoom and pan selectors
export const useZoomLevel = () => useAnnotationStore(state => state.images.zoomLevel);
export const usePanOffset = () => useAnnotationStore(state => state.images.panOffset);

export const usePromptedModel = () => useAnnotationStore(state => state.models.promptedModel);
export const useSuggestionModel = () => useAnnotationStore(state => state.models.suggestionModel);
export const useInstanceModel = () => useAnnotationStore(state => state.models.instanceModel);
export const useAvailablePromptedModels = () => useAnnotationStore(state => state.models.availablePromptedModels);
export const useAvailableSuggestionModels = () => useAnnotationStore(state => state.models.availableSuggestionModels);
export const useAvailableInstanceModels = () => useAnnotationStore(state => state.models.availableInstanceModels);
export const useIsLoadingPromptedModels = () => useAnnotationStore(state => state.models.isLoadingModels);
export const useIsLoadingSuggestionModels = () => useAnnotationStore(state => state.models.isLoadingSuggestionModels);
export const useIsLoadingInstanceModels = () => useAnnotationStore(state => state.models.isLoadingInstanceModels);
export const useIsRunningSuggestion = () => useAnnotationStore(state => state.models.isRunningSuggestion);
export const useIsRunningInstance = () => useAnnotationStore(state => state.models.isRunningInstance);

export const useObjectsList = () => useAnnotationStore(state => state.objects.list);
export const useSelectedObjects = () => useAnnotationStore(state => state.objects.selected);
export const useObjectsVisibility = () => useAnnotationStore(state => state.objects.visibility);
export const useObjectColors = () => useAnnotationStore(state => state.objects.colors);
export const useDatasetLabels = () => useAnnotationStore(state => state.objects.datasetLabels);
export const useDatasetLabelsMap = () => useAnnotationStore(state => state.objects.datasetLabelsMap);
export const useSetDatasetLabels = () => useAnnotationStore(state => state.setDatasetLabels);
export const useClearDatasetLabels = () => useAnnotationStore(state => state.clearDatasetLabels);

// Action selectors
export const useSetCurrentTool = () => useAnnotationStore(state => state.setCurrentTool);

// Canvas actions
export const useSetPrompt = () => useAnnotationStore(state => state.setPrompt);
export const useSetIsPrompting = () => useAnnotationStore(state => state.setIsPrompting);

// Segmentation actions
export const useStartSegmentation = () => useAnnotationStore(state => state.startSegmentation);
export const useSetCurrentMask = () => useAnnotationStore(state => state.setCurrentMask);

// Object actions
export const useAddObject = () => useAnnotationStore(state => state.addObject);
export const useRemoveObject = () => useAnnotationStore(state => state.removeObject);
export const useUpdateObject = () => useAnnotationStore(state => state.updateObject);
export const useSelectObject = () => useAnnotationStore(state => state.selectObject);
export const useDeselectObject = () => useAnnotationStore(state => state.deselectObject);
export const useClearSelection = () => useAnnotationStore(state => state.clearSelection);
export const useSetObjectsFromHierarchy = () => useAnnotationStore(state => state.setObjectsFromHierarchy);
export const useClearObjects = () => useAnnotationStore(state => state.clearObjects);

export const useSetPromptedModel = () => useAnnotationStore(state => state.setPromptedModel);
export const useSetSuggestionModel = () => useAnnotationStore(state => state.setSuggestionModel);
export const useSetInstanceModel = () => useAnnotationStore(state => state.setInstanceModel);
export const useSetIsRunningSuggestion = () => useAnnotationStore(state => state.setIsRunningSuggestion);
export const useSetIsRunningInstance = () => useAnnotationStore(state => state.setIsRunningInstance);
export const useFetchAvailablePromptedModels = () => useAnnotationStore(state => state.fetchAvailablePromptedModels);
export const useFetchAvailableSuggestionModels = () => useAnnotationStore(state => state.fetchAvailableSuggestionModels);
export const useFetchAvailableInstanceModels = () => useAnnotationStore(state => state.fetchAvailableInstanceModels);
export const useSetVisibilityMode = () => useAnnotationStore(state => state.setVisibilityMode);
export const useToggleVisibility = () => useAnnotationStore(state => state.toggleVisibility);
export const useInitializeLabelVisibility = () => useAnnotationStore(state => state.initializeLabelVisibility);
export const useSetCurrentImage = () => useAnnotationStore(state => state.setCurrentImage);
export const useSetImageList = () => useAnnotationStore(state => state.setImageList);
export const useSetAnnotationStatus = () => useAnnotationStore(state => state.setAnnotationStatus);

// Image loading and display actions
export const useSetImageObject = () => useAnnotationStore(state => state.setImageObject);
export const useSetImageLoading = () => useAnnotationStore(state => state.setImageLoading);
export const useSetImageError = () => useAnnotationStore(state => state.setImageError);

// Zoom and pan actions
export const useSetZoomLevel = () => useAnnotationStore(state => state.setZoomLevel);
export const useSetPanOffset = () => useAnnotationStore(state => state.setPanOffset);
export const useResetImageState = () => useAnnotationStore(state => state.resetImageState);

// UI selectors
export const useInstanceRunRequested = () => useAnnotationStore(state => state.ui.instanceRunRequested);
export const useInstanceWarningModalOpen = () => useAnnotationStore(state => state.ui.instanceWarningModalOpen);

// Sidebar actions
export const useSetLeftSidebarCollapsed = () => useAnnotationStore(state => state.setLeftSidebarCollapsed);
export const useSetRightSidebarCollapsed = () => useAnnotationStore(state => state.setRightSidebarCollapsed);
export const useToggleLeftSidebar = () => useAnnotationStore(state => state.toggleLeftSidebar);
export const useToggleRightSidebar = () => useAnnotationStore(state => state.toggleRightSidebar);

// Annotation Overview actions
export const useSetVisibilityControlsExpanded = () => useAnnotationStore(state => state.setVisibilityControlsExpanded);
export const useToggleVisibilityControls = () => useAnnotationStore(state => state.toggleVisibilityControls);
export const useSetInstanceRunRequested = () => useAnnotationStore(state => state.setInstanceRunRequested);
export const useSetInstanceWarningModalOpen = () => useAnnotationStore(state => state.setInstanceWarningModalOpen);

// AI Annotation selectors
export const useAIPrompts = () => useAnnotationStore(state => state.aiAnnotation.prompts);
export const useActivePreview = () => useAnnotationStore(state => state.aiAnnotation.activePreview);
export const useIsSubmitting = () => useAnnotationStore(state => state.aiAnnotation.isSubmitting);
export const useInstantSegmentation = () => useAnnotationStore(state => state.aiAnnotation.instantSegmentation);
export const usePromptMode = () => useAnnotationStore(state => state.aiAnnotation.promptMode);
export const useManualDrawMode = () => useAnnotationStore(state => state.aiAnnotation.manualDrawMode);

// Refinement mode selectors
export const useRefinementModeActive = () => useAnnotationStore(state => state.aiAnnotation.refinementMode.active);
export const useRefinementModeObjectId = () => useAnnotationStore(state => state.aiAnnotation.refinementMode.objectId);
export const useRefinementModeContourId = () => useAnnotationStore(state => state.aiAnnotation.refinementMode.contourId);

// AI Annotation actions
export const useAddPointPrompt = () => useAnnotationStore(state => state.addPointPrompt);
export const useAddBoxPrompt = () => useAnnotationStore(state => state.addBoxPrompt);
export const useAddPolygonPrompt = () => useAnnotationStore(state => state.addPolygonPrompt);
export const useSetPromptMode = () => useAnnotationStore(state => state.setPromptMode);
export const useSetManualDrawMode = () => useAnnotationStore(state => state.setManualDrawMode);
export const useRemoveLastPrompt = () => useAnnotationStore(state => state.removeLastPrompt);
export const useClearAllPrompts = () => useAnnotationStore(state => state.clearAllPrompts);
export const useSetActivePreview = () => useAnnotationStore(state => state.setActivePreview);
export const useSetIsSubmittingAI = () => useAnnotationStore(state => state.setIsSubmitting);
export const useToggleInstantSegmentation = () => useAnnotationStore(state => state.toggleInstantSegmentation);
export const useUndoLastAction = () => useAnnotationStore(state => state.undoLastAction);
export const useRedoLastAction = () => useAnnotationStore(state => state.redoLastAction);

// Refinement mode actions
export const useEnterRefinementMode = () => useAnnotationStore(state => state.enterRefinementMode);
export const useExitRefinementMode = () => useAnnotationStore(state => state.exitRefinementMode);

// WebSocket selectors
export const useWebSocketConnectionState = () => useAnnotationStore(state => state.websocket.connectionState);
export const useWebSocketSessionState = () => useAnnotationStore(state => state.websocket.sessionState);
export const useWebSocketImageId = () => useAnnotationStore(state => state.websocket.currentImageId);
export const useWebSocketRunningServices = () => useAnnotationStore(state => state.websocket.runningServices);
export const useWebSocketFailedServices = () => useAnnotationStore(state => state.websocket.failedServices);
export const useWebSocketLastError = () => useAnnotationStore(state => state.websocket.lastError);
export const useWebSocketIsReconnecting = () => useAnnotationStore(state => state.websocket.isReconnecting);

// WebSocket derived selectors
export const useWebSocketIsConnected = () => useAnnotationStore(
  state => state.websocket.connectionState === 'connected'
);
export const useWebSocketIsReady = () => useAnnotationStore(
  state => state.websocket.sessionState === 'ready' && state.websocket.connectionState === 'connected'
);
export const useCurrentMaskId = () => useAnnotationStore(state => state.websocket.currentMaskId);

// WebSocket actions
export const useSetWebSocketConnectionState = () => useAnnotationStore(state => state.setWebSocketConnectionState);
export const useSetWebSocketSessionState = () => useAnnotationStore(state => state.setWebSocketSessionState);
export const useSetWebSocketSessionData = () => useAnnotationStore(state => state.setWebSocketSessionData);
export const useSetWebSocketError = () => useAnnotationStore(state => state.setWebSocketError);
export const useClearWebSocketError = () => useAnnotationStore(state => state.clearWebSocketError);
export const useSetWebSocketImageId = () => useAnnotationStore(state => state.setWebSocketImageId);
export const useSetWebSocketReconnecting = () => useAnnotationStore(state => state.setWebSocketReconnecting);
export const useResetWebSocketState = () => useAnnotationStore(state => state.resetWebSocketState);

// Context Menu selectors
export const useContextMenuVisible = () => useAnnotationStore(state => state.contextMenu.visible);
export const useContextMenuX = () => useAnnotationStore(state => state.contextMenu.x);
export const useContextMenuY = () => useAnnotationStore(state => state.contextMenu.y);
export const useContextMenuTargetObjectId = () => useAnnotationStore(state => state.contextMenu.targetObjectId);

// Context Menu actions
export const useShowContextMenu = () => useAnnotationStore(state => state.showContextMenu);
export const useHideContextMenu = () => useAnnotationStore(state => state.hideContextMenu);

// Focus Mode selectors
export const useFocusModeActive = () => useAnnotationStore(state => state.focusMode.active);
export const useFocusModeObjectId = () => useAnnotationStore(state => state.focusMode.objectId);
export const useFocusModeObjectMask = () => useAnnotationStore(state => state.focusMode.objectMask);

// Contour id of the focused object (for nesting manual annotations), or null
export const useFocusedParentContourId = () => useAnnotationStore((state) => {
  if (!state.focusMode.active) return null;
  const focusedId = state.focusMode.objectId;
  const obj = state.objects.list.find((o) => o.id === focusedId);
  if (!obj) return null;
  return obj.contour_id ?? obj.id ?? null;
});

// Focus Mode actions
export const useEnterFocusMode = () => useAnnotationStore(state => state.enterFocusMode);
export const useEnterFocusModeWithZoom = () => useAnnotationStore(state => state.enterFocusModeWithZoom);
export const usePanZoomToObject = () => useAnnotationStore(state => state.panZoomToObject);
export const useExitFocusMode = () => useAnnotationStore(state => state.exitFocusMode);

// Edit Mode selectors
export const useEditModeActive = () => useAnnotationStore(state => state.editMode.active);
export const useEditModeObjectId = () => useAnnotationStore(state => state.editMode.objectId);
export const useEditModeContourId = () => useAnnotationStore(state => state.editMode.contourId);
export const useEditModeOriginalCoordinates = () => useAnnotationStore(state => state.editMode.originalCoordinates);
export const useEditModeDraftCoordinates = () => useAnnotationStore(state => state.editMode.draftCoordinates);
export const useEditModeVertices = () => useAnnotationStore(state => state.editMode.vertices);
export const useEditModeIsDirty = () => useAnnotationStore(state => state.editMode.isDirty);

// Edit Mode actions
export const useEnterEditMode = () => useAnnotationStore(state => state.enterEditMode);
export const useMoveVertex = () => useAnnotationStore(state => state.moveVertex);
export const useInsertVertex = () => useAnnotationStore(state => state.insertVertex);
export const useDeleteVertex = () => useAnnotationStore(state => state.deleteVertex);
export const useResetDraft = () => useAnnotationStore(state => state.resetDraft);
export const useSyncEditModeDraftFromRefinement = () => useAnnotationStore(state => state.syncEditModeDraftFromRefinement);
export const useExitEditMode = () => useAnnotationStore(state => state.exitEditMode);

// Line-edit Mode selectors
export const useLineEditActive = () => useAnnotationStore(state => state.lineEdit.active);
export const useLineEditObjectId = () => useAnnotationStore(state => state.lineEdit.objectId);
export const useLineEditContourId = () => useAnnotationStore(state => state.lineEdit.contourId);
export const useLineEditOriginal = () => useAnnotationStore(state => state.lineEdit.original);

// Line-edit Mode actions
export const useStartLineEdit = () => useAnnotationStore(state => state.startLineEdit);
export const useStopLineEdit = () => useAnnotationStore(state => state.stopLineEdit);

// Scale selectors
export const useImageScale = () => useAnnotationStore(state => state.images.scale);
export const useIsCalibrating = () => useAnnotationStore(state => state.images.scale.isCalibrating);
export const useCalibrationPoints = () => useAnnotationStore(state => state.images.scale.calibrationPoints);

// Scale action selectors
export const useSetImageScale = () => useAnnotationStore(state => state.setImageScale);
export const useStartCalibration = () => useAnnotationStore(state => state.startCalibration);
export const useSetCalibrationPoint = () => useAnnotationStore(state => state.setCalibrationPoint);
export const useCancelCalibration = () => useAnnotationStore(state => state.cancelCalibration);
