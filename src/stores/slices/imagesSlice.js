/**
 * Images slice - manages image state, loading, zoom, and pan
 */
export const createImagesSlice = (set) => ({
  setCurrentImage: (image) => set((state) => {
    // Check if image is actually changing
    const isImageChanging = state.images.currentImageId !== (image?.id || null);
    
    state.images.currentImage = image;
    state.images.currentImageId = image?.id || null;
    
    // Reset zoom and pan when switching to a different image
    if (isImageChanging) {
      state.images.zoomLevel = 1;
      state.images.panOffset = { x: 0, y: 0 };
    }

    // Clear focus mode when switching images
    state.focusMode.active = false;
    state.focusMode.objectId = null;
    state.focusMode.objectMask = null;

    // Clear refinement and edit mode when switching images so blue control-point overlay doesn't persist on the new image
    if (isImageChanging) {
      state.aiAnnotation.refinementMode.active = false;
      state.aiAnnotation.refinementMode.objectId = null;
      state.aiAnnotation.refinementMode.contourId = null;
      state.editMode.active = false;
      state.editMode.objectId = null;
      state.editMode.contourId = null;
      state.editMode.originalCoordinates = null;
      state.editMode.draftCoordinates = null;
      state.editMode.vertices = null;
      state.editMode.initialVertices = null;
      state.editMode.isDirty = false;
      state.lineEdit.active = false;
      state.lineEdit.objectId = null;
      state.lineEdit.contourId = null;
      state.lineEdit.original = null;

      // Reset calibration/tool state for the new image so the scale button
      // shows "Set Scale" instead of "Cancel Calibration".
      state.images.scale = { scaleX: 1, scaleY: 1, unit: 'px', isCalibrating: false, calibrationPoints: null };
      state.ui.currentTool = 'ai_annotation';
    }
  }),
  
  setImageList: (images) => set((state) => {
    state.images.imageList = images;
  }),
  
  setAnnotationStatus: (status) => set((state) => {
    state.images.annotationStatus = status;
  }),
  
  // Image loading and display actions
  setImageObject: (imageObject) => set((state) => {
    state.images.imageObject = imageObject;
  }),
  
  setImageLoading: (loading) => set((state) => {
    state.images.imageLoading = loading;
  }),
  
  setImageError: (error) => set((state) => {
    state.images.imageError = error;
  }),
  
  // Zoom and pan actions
  setZoomLevel: (level) => set((state) => {
    state.images.zoomLevel = level;
  }),
  
  setPanOffset: (offset) => set((state) => {
    state.images.panOffset = offset;
  }),
  
  resetImageState: () => set((state) => {
    state.images.imageObject = null;
    state.images.imageLoading = false;
    state.images.imageError = null;
    state.images.zoomLevel = 1;
    state.images.panOffset = { x: 0, y: 0 };
    state.images.scale = { scaleX: 1, scaleY: 1, unit: 'px', isCalibrating: false, calibrationPoints: null };

    // Clear focus mode when resetting image state
    state.focusMode.active = false;
    state.focusMode.objectId = null;
    state.focusMode.objectMask = null;
  }),

  // ---------------------------------------------------------------------------
  // Scale actions
  // ---------------------------------------------------------------------------

  /**
   * Overwrite the stored scale for the current image (called after a successful
   * API response). Does NOT make any network call — that lives in the component/hook.
   */
  setImageScale: (scaleX, scaleY, unit) => set((state) => {
    state.images.scale.scaleX = scaleX;
    state.images.scale.scaleY = scaleY;
    state.images.scale.unit = unit;
  }),

  /** Enter draw-line calibration mode. Clears any previous calibration points. */
  startCalibration: () => set((state) => {
    state.images.scale.isCalibrating = true;
    state.images.scale.calibrationPoints = null;
  }),

  /**
   * Record a calibration point (0 = first click, 1 = second click).
   * @param {{x: number, y: number}} point  Image-pixel coordinates.
   * @param {0|1} index
   */
  setCalibrationPoint: (point, index) => set((state) => {
    if (!state.images.scale.calibrationPoints) {
      state.images.scale.calibrationPoints = { p1: null, p2: null };
    }
    if (index === 0) {
      state.images.scale.calibrationPoints.p1 = point;
      state.images.scale.calibrationPoints.p2 = null; // reset second point on first click
    } else {
      state.images.scale.calibrationPoints.p2 = point;
    }
  }),

  /** Exit calibration mode and clear the drawn line. */
  cancelCalibration: () => set((state) => {
    state.images.scale.isCalibrating = false;
    state.images.scale.calibrationPoints = null;
  }),
});

