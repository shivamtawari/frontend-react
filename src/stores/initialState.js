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
  
  // Workspace shell state — panel/tab/theme layout of the redesigned annotation
  // workspace. Kept separate from `ui` so the legacy sidebar flags above can be
  // retired independently once nothing reads them.
  workspace: {
    theme: 'dark',              // 'dark' | 'light'
    // The workspace tab. All three share one canvas and one viewport; they differ
    // in the rail's tools and which side panel is in front. See setWorkspaceMode.
    mode: 'annotate',           // 'calibrate' | 'annotate' | 'review'
    /**
     * What happens when a prompt is placed - see PROMPT_ACTIONS in toolModel.js.
     * 'nothing' leaves it for the action bar's two buttons, 'ai' runs the model
     * at once (what the instant-mode switch used to do), 'manual' adds an
     * outline as an object at once.
     */
    promptAction: 'nothing',    // 'nothing' | 'ai' | 'manual'
    leftDrawerOpen: true,
    rightPanelOpen: true,
    rightTab: 'objects',        // 'objects' | 'labels'
    filmstripOpen: true,
    /** Review mode hides already-approved objects; this restores them. */
    showApproved: false,
    /** Label armed for the next annotation, and the source of the rail swatch. */
    activeLabelId: null,
    /** Hover is shared between the canvas and the object rows so both highlight. */
    hoveredObjectId: null,
    /** Which floating picker is open above the action bar, if any. */
    picker: null,               // 'label' | 'model' | 'reject' | 'parent' | 'more' | null
    /** Shortcut cheat-sheet overlay. Other modals keep their own local state. */
    shortcutSheetOpen: false,
    /** Per-object visibility — independent of the label-level filters. */
    hiddenObjectIds: {},
    /** Expanded/collapsed state of parent rows in the Objects tree. */
    collapsedObjectIds: {},
    /** Client-side colour overrides per label id; no backend field exists for these. */
    labelColorOverrides: {},
    /** Root ordering after a drag-reorder, or null to keep the natural order. */
    rootOrder: null,
    /** Live cursor position in image pixels, for the status bar. */
    cursor: null,
    /** Canvas label chips: 'all' | 'minimal' (hover/selection only) | 'off'. */
    chipMode: 'all',
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
    // Active drawing mode for prompts: 'point' | 'box' | 'polygon' | 'freehand'
    promptMode: 'point',
    // Active drawing mode for the manual-drawing tool: 'polygon' | 'freehand'.
    // Freehand by default, because that is what the rail's Freedraw tool
    // promises; polygon is one keypress away on the canvas (G).
    manualDrawMode: 'freehand',
    undoStack: [],
    redoStack: [],
    // Refinement mode
    refinementMode: {
      active: false,
      objectId: null, // Store ID for UI selection
      contourId: null, // Backend contour ID for refinement
    },
  },
  
  // Undo/redo history for the current image. The stack is the backend's; this is
  // only what the toolbar needs to render it. See slices/historySlice.js.
  history: {
    canUndo: false,
    canRedo: false,
    /** Short name of the next step ("delete object"), for the button tooltip. */
    undoLabel: null,
    redoLabel: null,
    /** True while an undo/redo request is in flight, so it cannot be double-fired. */
    busy: false,
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
    mode: 'reshape', // 'reshape' merges the line into the boundary; 'split' cuts along it
    objectId: null, // store object id being reshaped
    contourId: null, // backend contour id for the modify call
    original: null, // { x: [], y: [] } normalized — the contour being reshaped
  },
  
  // Image State
  images: {
    currentImage: null,
    currentImageId: null,
    imageList: [],
    // The current image's combined status, plus the three phases behind it.
    annotationStatus: 'not_started',
    phaseStatus: { calibrate: 'not_started', annotate: 'not_started', review: 'not_started' },
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
  
  // Calibration State — the Calibrate tab's view of the current image.
  //
  // Only the scale sub-object under `images.scale` above is duplicated here in
  // spirit: that one stays as-is because the status bar, the scale-bar indicator
  // and the draw-a-line overlay all read it, and it is refreshed from the same
  // backend response this slice loads.
  calibration: {
    /** Registry metadata from the server; fetched once and reused per image. */
    kinds: [],
    kindsLoaded: false,
    /** One entry per kind for the current image, calibrated or not. */
    entries: [],
    loading: false,
    error: null,
    /** Which calibration the rail has selected in Calibrate mode. */
    activeKind: null,
    /**
     * What the canvas is currently capturing clicks for, if anything.
     *   { kind, mode: 'role',        role }   — one named reference (two-patch)
     *   { kind, mode: 'wedge_ends'         }  — the two ends of a reference card
     *   { kind, mode: 'wedge_patch', index }  — one card patch, to re-read it
     */
    activePick: null,
    /** Radius of the sampled disc, in image pixels. */
    sampleRadius: 8,
    /** Sampled-but-unsaved named references: { [kind]: { [role]: sample } }. */
    pending: {},
    /**
     * Reference-card placement for the current image.
     *
     * The card's patches are evenly spaced along a rigid strip, so clicking the
     * first and last patch centres is enough to place all of them — 2 clicks
     * instead of 20. `points` is what that produced, `samples` what they read,
     * and either can be corrected one patch at a time when a disc lands badly.
     */
    wedge: {
      ends: [],       // [{x, y}, {x, y}] in image pixels, as clicked
      points: [],     // derived patch centres, image pixels
      samples: [],    // one sample per point, aligned by index
      sampling: false,
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
    favorites: {}, // User's favorite model per task: { task: registry_key }. Preselected in the selectors.
    favoritesLoaded: false, // Guards a single favorites fetch before defaults are computed.
  },
  
  // Objects State
  objects: {
    list: [],
    selected: [],
    labelDatasetId: null,   // Dataset ID that owns the currently cached datasetLabels and datasetLabelsMap
    labelDatasetGeneration: 0, // Monotonically increasing generation counter for dataset transitions
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
    /**
     * True from the moment an image switch wipes the canvas until its contours arrive
     * (or fail to). The canvas shows a spinner over the new image while it is set, so an
     * empty object list reads as "still loading" rather than "this image has no objects".
     */
    loading: false,
    /** When the contours could not be loaded — the message shown in place of the spinner. */
    loadError: null,
    /**
     * Which image the contours in `list` were loaded for, or null when none have been.
     *
     * The websocket session is opened from the URL's image id and answered with the contours
     * straight away, while the image list is still being fetched over REST, so the contours
     * can arrive before their image is the current one. Without this tag `setCurrentImage`
     * cannot distinguish them from a previous image's and wipes them, leaving the canvas
     * waiting for a message the server has already sent.
     */
    loadedForImageId: null,
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

