/**
 * Initial state for the annotation store
 */
export const initialState = {
  // UI State
  ui: {
    currentTool: 'ai_annotation',
    leftSidebarCollapsed: false,
    rightSidebarCollapsed: false,
    visibilityControlsExpanded: true,
    /** When true, Services opens the instance segmentation warning modal (e.g. from shortcut "3") */
    instanceRunRequested: false,
    /** True while the instance segmentation warning modal is open (so shortcuts don't steal Enter) */
    instanceWarningModalOpen: false,
  },
  
  // Canvas State (needed for canvas components)
  canvas: {
    prompt: null,
    isPrompting: false,
  },
  
  // AI Annotation State (for AI-assisted annotation flow)
  aiAnnotation: {
    prompts: [],
    activePreview: null,
    isSubmitting: false,
    instantSegmentation: false, // Auto-trigger segmentation when prompt is added
    // Active drawing mode for prompts: 'point' | 'box' | 'polygon' | 'freehand'
    promptMode: 'point',
    // Active drawing mode for the manual-drawing tool: 'polygon' | 'freehand'
    manualDrawMode: 'polygon',
    undoStack: [],
    redoStack: [],
    // Refinement mode
    refinementMode: {
      active: false,
      objectId: null, // Store ID for UI selection
      contourId: null, // Backend contour ID for refinement
    },
  },
  
  // Segmentation State (needed for canvas components)
  segmentation: {
    currentMask: null,
  },
  
  // Context Menu State (for object labeling)
  contextMenu: {
    visible: false,
    x: 0,
    y: 0,
    targetObjectId: null,
  },
  
  // Focus Mode State (for focused annotation)
  focusMode: {
    active: false,
    objectId: null,
    objectMask: null, // Store mask for boundary checking
  },
  
  // Edit Mode State (for contour editing)
  editMode: {
    active: false,
    objectId: null,
    contourId: null,
    originalCoordinates: null, // { x: [], y: [] } — the dense outline as it was on entry
    draftCoordinates: null, // { x: [], y: [] } — dense outline resampled from `vertices` (displayed + saved)
    vertices: null, // { x: [], y: [] } — the few control handles the user drags
    initialVertices: null, // { x: [], y: [] } — vertices at entry, for Reset
    isDirty: false, // Track if changes have been made
  },

  // Line-edit Mode State (draw an open line near the boundary; it is merged into
  // the contour, replacing the nearest boundary arc — cutting a region off or
  // adding one). An alternative to dragging the outline's control points.
  lineEdit: {
    active: false,
    objectId: null, // store object id being reshaped
    contourId: null, // backend contour id for the modify call
    original: null, // { x: [], y: [] } normalized — the contour being reshaped
  },
  
  // Image State
  images: {
    currentImage: null,
    currentImageId: null,
    imageList: [],
    annotationStatus: 'not_started',
    // Image loading and display state
    imageObject: null,
    imageLoading: false,
    imageError: null,
    // Zoom and pan state
    zoomLevel: 1,
    panOffset: { x: 0, y: 0 },
    // Physical scale calibration for the current image
    scale: {
      scaleX: 1,
      scaleY: 1,
      unit: 'px',          // 'px' means no real-world scale has been set yet
      isCalibrating: false, // true while user is drawing a calibration line
      // { p1: {x, y}, p2: {x, y} } in image-pixel coordinates, or null
      calibrationPoints: null,
    },
  },
  
  // Model State
  models: {
    promptedModel: null, // Store model ID as string, not object
    suggestionModel: null, // Store model ID as string, not object
    instanceModel: null, // Store model ID as string, not object
    availablePromptedModels: [], // List of available AI models from backend
    availableSuggestionModels: [], // List of available suggestion models from backend
    availableInstanceModels: [], // List of available instance segmentation models from backend
    isLoadingModels: false,
    isLoadingSuggestionModels: false,
    isLoadingInstanceModels: false,
    isRunningSuggestion: false, // Track when suggestion segmentation (suggest similar) is running
    isRunningInstance: false, // Track when instance segmentation is running
  },
  
  // Objects State
  objects: {
    list: [],
    selected: [],
    datasetLabels: [],       // Cached labels array for the current dataset (fetched once)
    datasetLabelsMap: null,   // Map<labelId, labelName> for quick lookup (or null if not loaded)
    visibility: {
      showAll: true,
      rootLevelOnly: false,
      selectedLevelOnly: false,
      showRootLabels: true, // Toggle for root level labels visibility
      labels: {}, // Map of labelId -> boolean (dynamically populated from actual labels)
      rootLabelIds: [], // Array of root-level label IDs for filtering
    },
    colors: {},
    labelAssignmentCounter: 0, // Global counter to track label assignment order
  },
  
  // WebSocket State
  websocket: {
    connectionState: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'
    sessionState: 'uninitialized',   // 'uninitialized' | 'initializing' | 'ready' | 'error'
    currentImageId: null,
    currentMaskId: null,             // Mask ID for the current image (set from SESSION_INITIALIZED)
    runningServices: [],
    failedServices: [],
    lastError: null,
    isReconnecting: false,
  },
};

