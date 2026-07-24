import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  Loader2,
  PenLine,
  Pencil,
  ScanEye,
  SkipForward,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { resolveRejection } from '../../api/reviews';
import { useCorrection } from '../../contexts/CorrectionContext';
import { useToast } from '../../contexts/ToastContext';
import { useContourEditing } from '../../hooks/useContourEditing';
import { useZoomToObject } from '../../hooks/useZoomToObject';
import { getContourId } from '../../utils/objectUtils';
import { calculateRenderedImageDimensions, getCanvasContainer } from '../../utils/canvasUtils';
import {
  useObjectsList,
  useSelectObject,
  useClearSelection,
  useCurrentMaskId,
  useWebSocketIsReady,
  useImageObject,
  useEnterEditMode,
  useExitEditMode,
  useSetCurrentTool,
  useStartLineEdit,
  useStopLineEdit,
} from '../../stores/selectors/annotationSelectors';

const readableError = (err, fallback) =>
  (err?.message || '').replace(/^API Error:\s*/i, '') || fallback;

/** Reasons whose fix is a re-outline, so the canvas drops straight into point editing. */
const OUTLINE_REASONS = new Set(['bad_outline']);

/**
 * Drives a correction session from inside the annotation editor.
 *
 * A correction session is a queue of open rejections (built on the launch page,
 * held in `CorrectionContext`). This bar walks it one item at a time: it keeps the
 * editor pointed at the current item's image, auto-selects the sent-back instance
 * and — for an outline complaint — drops into the manual contour editor (drag the
 * control points) so the annotator can reshape it immediately. "Mark as done" /
 * "Won't fix" resolve the rejection with the matching kind and advance; "Skip"
 * advances without resolving. Any pending point edit is saved on every advance.
 *
 * Renders nothing when no session is active, so mounting it unconditionally in
 * `MainLayout` is free for ordinary annotation work.
 */
const CorrectionBar = () => {
  const { datasetId, imageId: urlImageId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const {
    active,
    currentItem,
    index,
    total,
    datasetId: sessionDatasetId,
    advance,
    endSession,
  } = useCorrection();

  const objectsList = useObjectsList();
  const selectObject = useSelectObject();
  const clearSelection = useClearSelection();
  const currentMaskId = useCurrentMaskId();
  const sessionReady = useWebSocketIsReady();
  const imageObject = useImageObject();
  const enterEditMode = useEnterEditMode();
  const exitEditMode = useExitEditMode();
  const setCurrentTool = useSetCurrentTool();
  const startLineEdit = useStartLineEdit();
  const stopLineEdit = useStopLineEdit();
  const { saveEditing, cancelAutoSave } = useContourEditing();
  const { zoomToObject } = useZoomToObject({ marginPct: 0.25, maxZoom: 4, minZoom: 1 });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // The rejection id we have already auto-focused, so the effect fires once per item.
  const focusedRejectionRef = useRef(null);

  const findTarget = useCallback(
    (contourId) =>
      contourId == null
        ? null
        : objectsList.find((obj) => Number(getContourId(obj)) === Number(contourId)) || null,
    [objectsList]
  );

  const zoomToInstance = useCallback(
    (target) => {
      if (!imageObject || !target?.x?.length) return;
      const container =
        getCanvasContainer(null) || document.querySelector('.relative.overflow-hidden');
      if (!container) return;
      const cw = container.offsetWidth;
      const ch = container.offsetHeight;
      if (!cw || !ch) return;
      const rendered = calculateRenderedImageDimensions(imageObject, cw, ch);
      zoomToObject(
        target,
        { width: imageObject.width, height: imageObject.height },
        { width: cw, height: ch },
        rendered,
        { animateMs: 300 }
      );
    },
    [imageObject, zoomToObject]
  );

  // Bring one instance into focus: select it, frame it, and open the requested
  // fixing tool — 'line' (draw a line merged into the boundary), 'points' (drag
  // control points), or 'none' (just look).
  const focusInstance = useCallback(
    (target, { tool }) => {
      clearSelection();
      selectObject(target.id);
      setCurrentTool('selection');
      zoomToInstance(target);
      if (tool === 'line') startLineEdit(target.id, target.contour_id, target.x, target.y);
      else if (tool === 'points') enterEditMode(target.id, target.contour_id, target.x, target.y);
    },
    [clearSelection, selectObject, setCurrentTool, zoomToInstance, startLineEdit, enterEditMode]
  );

  // -- Keep the editor on the current item's image ---------------------------
  useEffect(() => {
    if (!active || !currentItem) return;
    if (String(currentItem.image_id) !== String(urlImageId)) {
      navigate(`/dataset/${sessionDatasetId}/annotate/${currentItem.image_id}`);
    }
  }, [active, currentItem, urlImageId, sessionDatasetId, navigate]);

  // -- Auto-select / edit the sent-back instance once its image is loaded ----
  useEffect(() => {
    if (!active || !currentItem) return;
    if (focusedRejectionRef.current === currentItem.rejection_id) return;
    // Wait until the editor session for this exact mask is ready and its objects
    // have arrived over the socket.
    if (!sessionReady || currentMaskId !== currentItem.mask_id) return;

    // Mask-level feedback (e.g. "objects are missing") has no single instance to
    // open — leave the whole image in view and just show the note.
    if (currentItem.contour_id == null) {
      focusedRejectionRef.current = currentItem.rejection_id;
      clearSelection();
      return;
    }

    const target = findTarget(currentItem.contour_id);
    if (!target) return; // Objects still loading; try again on the next render.

    focusedRejectionRef.current = currentItem.rejection_id;
    // An outline complaint drops straight into the line tool (the user's primary
    // fix); other reasons just frame the instance.
    focusInstance(target, { tool: OUTLINE_REASONS.has(currentItem.reason) ? 'line' : 'none' });
  }, [active, currentItem, sessionReady, currentMaskId, findTarget, focusInstance, clearSelection]);

  // Persist any pending point edit, drop any in-progress line edit, then step to
  // the next item (or finish).
  const goNext = useCallback(() => {
    saveEditing().catch(() => {}); // no-op when not editing or nothing changed
    cancelAutoSave();
    stopLineEdit();
    if (index >= total - 1) {
      endSession();
      addToast({ type: 'success', message: 'Correction session complete.' });
      navigate(`/dataset/${sessionDatasetId}/datamanagement`);
    } else {
      advance();
    }
  }, [saveEditing, cancelAutoSave, stopLineEdit, index, total, advance, endSession, addToast, navigate, sessionDatasetId]);

  const resolveAndAdvance = useCallback(
    async (resolution) => {
      if (!currentItem || busy) return;
      setBusy(true);
      setError(null);
      try {
        await resolveRejection(currentItem.rejection_id, resolution);
        goNext();
      } catch (err) {
        setError(readableError(err, 'Could not resolve this item.'));
      } finally {
        setBusy(false);
      }
    },
    [currentItem, busy, goNext]
  );

  const handleExit = useCallback(() => {
    saveEditing().catch(() => {});
    cancelAutoSave();
    exitEditMode();
    stopLineEdit();
    endSession();
    navigate(`/dataset/${sessionDatasetId}/datamanagement`);
  }, [saveEditing, cancelAutoSave, exitEditMode, stopLineEdit, endSession, navigate, sessionDatasetId]);

  if (!active || !currentItem) return null;

  // Guard against a session that belongs to another dataset (stale navigation).
  if (String(sessionDatasetId) !== String(datasetId)) return null;

  const isOutline = OUTLINE_REASONS.has(currentItem.reason);

  const focusWith = (tool) => {
    const target = findTarget(currentItem.contour_id);
    if (target) focusInstance(target, { tool });
  };

  return (
    <div className="bg-teal-50 border-b border-teal-200 px-4 py-2.5">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-teal-800 flex-shrink-0">
          <Wrench className="w-5 h-5" />
          <span className="font-semibold text-sm">Correcting</span>
          <span className="text-sm text-teal-600">
            {index + 1} / {total}
          </span>
        </div>

        <div className="flex-1 min-w-0 text-sm">
          <span className="font-medium text-gray-900">{currentItem.reason_label}</span>
          {currentItem.contour_id != null && (
            <span className="text-gray-500"> · object #{currentItem.contour_id}</span>
          )}
          {currentItem.note && (
            <span className="text-gray-700"> — “{currentItem.note}”</span>
          )}
          {currentItem.created_by && (
            <span className="text-gray-400"> ({currentItem.created_by})</span>
          )}
          {error && <span className="block text-red-700">{error}</span>}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {currentItem.contour_id != null && isOutline && (
            <>
              <button
                onClick={() => focusWith('line')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-teal-700 bg-white border border-teal-300 rounded-lg hover:bg-teal-100 disabled:opacity-50 transition-colors"
                title="Draw a line across the boundary to cut off or add a region"
              >
                <PenLine className="w-3.5 h-3.5" />
                Draw line
              </button>
              <button
                onClick={() => focusWith('points')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                title="Drag the existing outline's control points instead"
              >
                <Pencil className="w-3.5 h-3.5" />
                Adjust points
              </button>
            </>
          )}
          {currentItem.contour_id != null && !isOutline && (
            <button
              onClick={() => focusWith('none')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-white border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-50 transition-colors"
              title="Zoom to this instance"
            >
              <ScanEye className="w-3.5 h-3.5" />
              Locate
            </button>
          )}
          <button
            onClick={() => resolveAndAdvance('fixed')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:bg-gray-300 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Mark as done
          </button>
          <button
            onClick={() => resolveAndAdvance('wont_fix')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            title="Leave the annotation as it is — I checked, it is correct"
          >
            <XCircle className="w-4 h-4" />
            Won&apos;t fix
          </button>
          <button
            onClick={goNext}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50 transition-colors"
            title="Skip this item — leaves it open for later"
          >
            <SkipForward className="w-4 h-4" />
            Skip
          </button>
          <button
            onClick={handleExit}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
            title="End the correction session"
          >
            <X className="w-4 h-4" />
            End
          </button>
        </div>
      </div>
    </div>
  );
};

export default CorrectionBar;
