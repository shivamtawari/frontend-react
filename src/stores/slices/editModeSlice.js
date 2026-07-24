/**
 * Edit Mode slice - manages manual contour editing.
 *
 * The editable shape is a small set of **control vertices**, not the dense point
 * list the model emits. On entry the dense outline is simplified to a few vertices
 * (`simplifyClosedContour`); the user drags/adds/removes those, and after every
 * change the dense `draftCoordinates` — what the canvas draws and what gets saved —
 * is resampled as a smooth closed curve through the vertices
 * (`densifyClosedVertices`). Keeping `draftCoordinates` dense means the save path
 * (`useContourEditing`, `RefinementOverlay`) is unchanged; only the handles moved
 * from "every Nth dense point" to "the control vertices".
 */
import { simplifyClosedContour, densifyClosedVertices } from '../../utils/contourEditing';

/** Recompute the dense draft outline from the current control vertices. */
const syncDraftFromVertices = (state) => {
  const { vertices } = state.editMode;
  if (!vertices || vertices.x.length < 3) return;
  state.editMode.draftCoordinates = densifyClosedVertices(vertices.x, vertices.y);
};

export const createEditModeSlice = (set) => ({
  enterEditMode: (objectId, contourId, originalX, originalY) => set((state) => {
    const vertices = simplifyClosedContour(originalX, originalY);
    state.editMode.active = true;
    state.editMode.objectId = objectId;
    state.editMode.contourId = contourId;
    state.editMode.originalCoordinates = { x: [...originalX], y: [...originalY] };
    state.editMode.vertices = { x: [...vertices.x], y: [...vertices.y] };
    state.editMode.initialVertices = { x: [...vertices.x], y: [...vertices.y] };
    state.editMode.draftCoordinates = densifyClosedVertices(vertices.x, vertices.y);
    state.editMode.isDirty = false;
  }),

  /** Move one control vertex to a new normalized position. */
  moveVertex: (index, newX, newY) => set((state) => {
    const { vertices } = state.editMode;
    if (!state.editMode.active || !vertices || index < 0 || index >= vertices.x.length) return;
    vertices.x[index] = newX;
    vertices.y[index] = newY;
    syncDraftFromVertices(state);
    state.editMode.isDirty = true;
  }),

  /** Insert a new control vertex after `afterIndex` (adds local precision). */
  insertVertex: (afterIndex, newX, newY) => set((state) => {
    const { vertices } = state.editMode;
    if (!state.editMode.active || !vertices) return;
    const at = afterIndex + 1;
    vertices.x.splice(at, 0, newX);
    vertices.y.splice(at, 0, newY);
    syncDraftFromVertices(state);
    state.editMode.isDirty = true;
  }),

  /** Remove one control vertex. A closed shape needs at least three. */
  deleteVertex: (index) => set((state) => {
    const { vertices } = state.editMode;
    if (!state.editMode.active || !vertices || vertices.x.length <= 3) return;
    if (index < 0 || index >= vertices.x.length) return;
    vertices.x.splice(index, 1);
    vertices.y.splice(index, 1);
    syncDraftFromVertices(state);
    state.editMode.isDirty = true;
  }),

  resetDraft: () => set((state) => {
    const { initialVertices } = state.editMode;
    if (!state.editMode.active || !initialVertices) return;
    state.editMode.vertices = { x: [...initialVertices.x], y: [...initialVertices.y] };
    syncDraftFromVertices(state);
    state.editMode.isDirty = false;
  }),

  /**
   * Sync edit mode to a new contour (e.g. after "Refine object" re-segments it):
   * re-simplify the new dense outline into fresh control vertices while staying in
   * edit mode.
   */
  syncEditModeDraftFromRefinement: (newX, newY) => set((state) => {
    if (!state.editMode.active || !Array.isArray(newX) || !Array.isArray(newY) ||
        newX.length === 0 || newY.length === 0) return;
    const vertices = simplifyClosedContour(newX, newY);
    state.editMode.originalCoordinates = { x: [...newX], y: [...newY] };
    state.editMode.vertices = { x: [...vertices.x], y: [...vertices.y] };
    state.editMode.initialVertices = { x: [...vertices.x], y: [...vertices.y] };
    state.editMode.draftCoordinates = densifyClosedVertices(vertices.x, vertices.y);
    state.editMode.isDirty = false;
  }),

  exitEditMode: () => set((state) => {
    state.editMode.active = false;
    state.editMode.objectId = null;
    state.editMode.contourId = null;
    state.editMode.originalCoordinates = null;
    state.editMode.draftCoordinates = null;
    state.editMode.vertices = null;
    state.editMode.initialVertices = null;
    state.editMode.isDirty = false;
  }),

  /**
   * Enter line-edit mode: the user draws an open line near the boundary that gets
   * merged into this contour (cut/add). Any point-editing session is closed first —
   * the two ways of reshaping a contour are mutually exclusive.
   */
  startLineEdit: (objectId, contourId, x, y) => set((state) => {
    state.editMode.active = false;
    state.editMode.objectId = null;
    state.editMode.contourId = null;
    state.editMode.vertices = null;
    state.editMode.initialVertices = null;
    state.editMode.draftCoordinates = null;
    state.editMode.originalCoordinates = null;
    state.editMode.isDirty = false;
    state.lineEdit.active = true;
    state.lineEdit.objectId = objectId;
    state.lineEdit.contourId = contourId;
    state.lineEdit.original = (Array.isArray(x) && Array.isArray(y))
      ? { x: [...x], y: [...y] }
      : null;
  }),

  stopLineEdit: () => set((state) => {
    state.lineEdit.active = false;
    state.lineEdit.objectId = null;
    state.lineEdit.contourId = null;
    state.lineEdit.original = null;
  }),
});
