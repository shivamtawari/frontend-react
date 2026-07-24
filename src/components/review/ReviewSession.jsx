import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Loader2,
  MessageSquarePlus,
  ScanEye,
  SkipForward,
  Undo2,
} from 'lucide-react';
import * as api from '../../api';
import { getContoursOfMask } from '../../api/masks';
import { markContourAsReviewed } from '../../api/contours';
import { approveMask, rejectMask } from '../../api/reviews';
import { useToast } from '../../contexts/ToastContext';
import { getLabelColor } from '../../utils/labelColors';
import AnnotationViewerCanvas from '../viewer/AnnotationViewerCanvas';

const readableError = (err, fallback) =>
  (err?.message || '').replace(/^API Error:\s*/i, '') || fallback;

/**
 * The reject buttons of the queue. The wording is the reviewer's, the values are
 * the backend's `RejectionReason` vocabulary — kept as a fixed map here (rather
 * than the `/reviews/reasons` catalog) because the queue offers a deliberate
 * subset with queue-specific phrasing.
 */
const REJECT_ACTIONS = [
  { reason: 'bad_outline', label: 'Bad outlines', instanceLabel: 'Bad outline' },
  { reason: 'missing_objects', label: 'Missed instances', instanceLabel: 'Missed instances' },
  { reason: 'wrong_label', label: 'Wrong labels', instanceLabel: 'Wrong label' },
  { reason: 'wrong_hierarchy', label: 'Hierarchy wrong', instanceLabel: 'Hierarchy wrong' },
];

/**
 * Plays a review queue one item at a time.
 *
 * Image items show the whole mask; instance items show one contour plus its
 * immediate children, framed. Accepting approves (the mask's pending contours,
 * or the one instance); rejecting records a rejection with the chosen reason and
 * sends the mask back to its annotator — which also invalidates every other
 * queued item on that mask, so those are dropped from the queue on the spot.
 */
const ReviewSession = ({ queue, labelsById, onExit }) => {
  const { addToast } = useToast();
  const isImageMode = queue.granularity === 'images';

  // The queue is state, not a constant: a rejection removes the sibling items of
  // the same mask (they went back to the annotator along with it).
  const [items, setItems] = useState(() =>
    isImageMode ? queue.images : queue.instances
  );
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState({ accepted: 0, rejected: 0, skipped: 0 });

  const [imageSrc, setImageSrc] = useState(null);
  const [contours, setContours] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [zoomTarget, setZoomTarget] = useState(null);
  const [selectedContourId, setSelectedContourId] = useState(null);

  // Consecutive queue items often share an image/mask (hierarchy order groups
  // them); the caches make advancing through those instant.
  const imageCache = useRef(new Map());
  const contourCache = useRef(new Map());

  const current = items[index] || null;
  const done = index >= items.length;

  // -- Data loading ---------------------------------------------------------

  useEffect(() => {
    if (!current) return undefined;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let src = imageCache.current.get(current.image_id);
        if (!src) {
          const imageData = await api.getImageById(current.image_id, false);
          const base64 =
            imageData[current.image_id] ??
            imageData[String(current.image_id)] ??
            Object.entries(imageData).find(
              ([key]) => key !== 'success' && key !== 'message'
            )?.[1];
          src = base64 ? `data:image/png;base64,${base64}` : null;
          imageCache.current.set(current.image_id, src);
        }

        let maskContours = contourCache.current.get(current.mask_id);
        if (!maskContours) {
          const contourResponse = await getContoursOfMask(current.mask_id, true);
          maskContours = contourResponse.contours || [];
          contourCache.current.set(current.mask_id, maskContours);
        }

        if (cancelled) return;
        setImageSrc(src);
        setContours(maskContours);
        if (!isImageMode) {
          const instance = maskContours.find((c) => c.id === current.contour_id);
          setSelectedContourId(current.contour_id);
          // New object identity so revisiting the same instance re-frames it.
          setZoomTarget(instance ? { ...instance } : null);
        } else {
          setSelectedContourId(null);
          setZoomTarget(null);
        }
      } catch (err) {
        if (!cancelled) setError(readableError(err, 'Could not load this item.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [current, isImageMode]);

  // -- Derived display state --------------------------------------------------

  /** Image mode shows everything; instance mode the instance and its children. */
  const visibleContours = useMemo(() => {
    if (isImageMode || !current) return contours;
    return contours.filter(
      (contour) =>
        contour.id === current.contour_id || contour.parent_id === current.contour_id
    );
  }, [contours, current, isImageMode]);

  const instanceContour = useMemo(
    () =>
      !isImageMode && current
        ? contours.find((contour) => contour.id === current.contour_id) || null
        : null,
    [contours, current, isImageMode]
  );

  const childCount = useMemo(
    () =>
      !isImageMode && current
        ? contours.filter((contour) => contour.parent_id === current.contour_id).length
        : 0,
    [contours, current, isImageMode]
  );

  const labelNameFor = useCallback(
    (labelId) => labelsById[labelId]?.name || 'Unlabelled',
    [labelsById]
  );

  const colorFor = useCallback(
    (contour) => (contour.label_id ? getLabelColor(contour.label_id) : '#94a3b8'),
    []
  );

  // -- Advancing ---------------------------------------------------------------

  const advance = useCallback(
    (outcome, { dropMaskId = null } = {}) => {
      setTally((current_) => ({ ...current_, [outcome]: current_[outcome] + 1 }));
      setNote('');
      setShowNote(false);
      setItems((currentItems) => {
        if (dropMaskId == null) return currentItems;
        // A rejected mask went back to the annotator: its other queued items are
        // stale now, so drop everything after the current position that points
        // at it. The contour cache entry is stale too.
        contourCache.current.delete(dropMaskId);
        return currentItems.filter(
          (item, itemIndex) => itemIndex <= index || item.mask_id !== dropMaskId
        );
      });
      setIndex((currentIndex) => currentIndex + 1);
    },
    [index]
  );

  const handleAccept = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      if (isImageMode) {
        // The Accept must cover exactly what this queue considers open, so the
        // second-opinion flag travels with the queue it was built for.
        const response = await approveMask(current.mask_id, {
          includeReviewed: Boolean(queue.include_reviewed),
        });
        contourCache.current.delete(current.mask_id);
        if (response?.skipped?.length) {
          addToast({
            type: 'error',
            message: `${response.skipped.length} of your own annotations were not self-approved; another reviewer has to look at those.`,
          });
        }
      } else {
        await markContourAsReviewed(current.contour_id);
        contourCache.current.delete(current.mask_id);
      }
      advance('accepted');
    } catch (err) {
      setError(readableError(err, 'Could not approve this item.'));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (reason) => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await rejectMask(current.mask_id, {
        reason,
        note: note.trim() || null,
        contourId: isImageMode ? null : current.contour_id,
      });
      advance('rejected', { dropMaskId: current.mask_id });
    } catch (err) {
      setError(readableError(err, 'Could not send this item back.'));
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = () => {
    if (!current || busy) return;
    advance('skipped');
  };

  // Keyboard: A accepts, S skips — but never while typing the note.
  useEffect(() => {
    const onKey = (event) => {
      if (done || busy) return;
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (event.key === 'a' || event.key === 'A') handleAccept();
      if (event.key === 's' || event.key === 'S') handleSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // -- Rendering -----------------------------------------------------------------

  if (done) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4">
        <CheckCircle2 className="w-12 h-12 text-teal-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Session finished</h2>
        <p className="text-gray-600 mb-6">
          {tally.accepted} accepted · {tally.rejected} sent back · {tally.skipped} skipped
        </p>
        <button
          onClick={onExit}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors"
        >
          <Undo2 className="w-4 h-4" />
          Back to review setup
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex min-h-0">
      {/* Canvas */}
      <main className="flex-1 relative min-w-0">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/60 text-white">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading…
          </div>
        )}
        {imageSrc && (
          <AnnotationViewerCanvas
            imageSrc={imageSrc}
            contours={visibleContours}
            selectedId={selectedContourId}
            onSelect={setSelectedContourId}
            zoomTarget={zoomTarget}
            colorFor={colorFor}
          />
        )}
      </main>

      {/* Action panel */}
      <aside className="w-80 border-l border-gray-200 bg-white flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {isImageMode ? 'Image review' : 'Instance review'}
            </span>
            <span className="text-sm font-medium text-gray-700">
              {index + 1} / {items.length}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-teal-500 h-1.5 rounded-full transition-all"
              style={{ width: `${(index / Math.max(items.length, 1)) * 100}%` }}
            />
          </div>
        </div>

        {/* What is on the table */}
        <div className="px-4 py-3 border-b border-gray-200 text-sm text-gray-700 space-y-1">
          {isImageMode ? (
            <>
              <div>
                Image <span className="font-medium">#{current.image_id}</span>
              </div>
              <div className="text-gray-500">
                {current.pending_instances} of {current.total_instances} instances awaiting{' '}
                {queue.include_reviewed ? 'your review' : 'review'}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                  style={{
                    backgroundColor: current.label_id
                      ? getLabelColor(current.label_id)
                      : '#94a3b8',
                  }}
                />
                <span className="font-medium">{labelNameFor(current.label_id)}</span>
                <span className="text-gray-400">#{current.contour_id}</span>
              </div>
              <div className="text-gray-500">
                Depth {current.depth}
                {childCount > 0 &&
                  ` · ${childCount} direct child${childCount === 1 ? '' : 'ren'} shown`}
                {instanceContour?.added_by && ` · by ${instanceContour.added_by}`}
              </div>
              {(instanceContour?.reviewed_by?.length ?? 0) > 0 && (
                <div className="text-emerald-600">
                  Already approved by {instanceContour.reviewed_by.join(', ')} — accept to
                  confirm, send back to overrule (withdraws your own approval).
                </div>
              )}
              <button
                onClick={() => instanceContour && setZoomTarget({ ...instanceContour })}
                className="flex items-center gap-1.5 text-teal-600 hover:text-teal-700 text-xs font-medium"
              >
                <ScanEye className="w-3.5 h-3.5" />
                Re-frame instance
              </button>
            </>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          <button
            onClick={handleAccept}
            disabled={busy || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            Accept
          </button>

          <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Send back
          </div>
          {REJECT_ACTIONS.map(({ reason, label, instanceLabel }) => (
            <button
              key={reason}
              onClick={() => handleReject(reason)}
              disabled={busy || loading}
              className="w-full text-left px-4 py-2.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:border-gray-200 disabled:text-gray-400 transition-colors text-sm font-medium"
            >
              {isImageMode ? label : instanceLabel}
            </button>
          ))}

          {showNote ? (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note for the annotator…"
              rows={3}
              className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          ) : (
            <button
              onClick={() => setShowNote(true)}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-xs font-medium mt-2"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Add a note to the next send-back
            </button>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200">
          <button
            onClick={handleSkip}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:text-gray-400 transition-colors text-sm font-medium"
          >
            <SkipForward className="w-4 h-4" />
            Skip (S) — Accept with (A)
          </button>
        </div>
      </aside>
    </div>
  );
};

export default ReviewSession;
