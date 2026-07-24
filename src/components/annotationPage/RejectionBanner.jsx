import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import {
  fetchMaskRejections,
  resolveAllMaskRejections,
  resolveRejection,
} from '../../api/reviews';
import { usePermissions } from '../../hooks/usePermissions';
import { Permission } from '../../utils/permissions';

const readableError = (err, fallback) =>
  (err?.message || '').replace(/^API Error:\s*/i, '') || fallback;

/**
 * Shows the open rejections on the current mask, so an annotator opening a
 * sent-back image can see why it came back without hunting for it.
 *
 * Renders nothing when there is nothing open, which is the normal case.
 *
 * @param {Object} props
 * @param {number} props.maskId
 * @param {Object} [props.dataset] - Used to decide whether the user may resolve.
 * @param {number} [props.refreshKey] - Change to force a re-fetch after rejecting.
 * @param {Function} [props.onResolved] - Called after anything is resolved.
 */
const RejectionBanner = ({ maskId, dataset, refreshKey = 0, onResolved }) => {
  const { can } = usePermissions(dataset);
  const canResolve = can(Permission.ANNOTATION_EDIT_OWN);

  const [rejections, setRejections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!maskId) {
      setRejections([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetchMaskRejections(maskId, true);
      setRejections(response.rejections || []);
      setError(null);
    } catch (err) {
      setError(readableError(err, 'Could not load review feedback.'));
    } finally {
      setLoading(false);
    }
  }, [maskId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!maskId || (!loading && rejections.length === 0 && !error)) return null;

  const handleResolve = async (rejectionId) => {
    setBusy(rejectionId);
    try {
      await resolveRejection(rejectionId);
      await load();
      if (onResolved) onResolved();
    } catch (err) {
      setError(readableError(err, 'Could not mark this as resolved.'));
    } finally {
      setBusy(null);
    }
  };

  const handleResolveAll = async () => {
    setBusy('all');
    try {
      await resolveAllMaskRejections(maskId);
      await load();
      if (onResolved) onResolved();
    } catch (err) {
      setError(readableError(err, 'Could not resolve the feedback.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-rose-50 border-b border-rose-200 px-4 py-3">
      <div className="flex items-start gap-3">
        <RotateCcw className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-rose-900">
              Sent back for rework
              {rejections.length > 1 && ` (${rejections.length} points)`}
            </p>
            {canResolve && rejections.length > 1 && (
              <button
                onClick={handleResolveAll}
                disabled={busy === 'all'}
                className="text-xs font-medium text-rose-700 hover:text-rose-900 underline disabled:opacity-50"
              >
                Mark all as done
              </button>
            )}
          </div>

          {loading && rejections.length === 0 ? (
            <p className="text-sm text-rose-800 mt-1 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading feedback…
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {rejections.map((rejection) => (
                <li
                  key={rejection.id}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-rose-900">
                      {rejection.reason_label}
                    </span>
                    {rejection.contour_id && (
                      <span className="text-rose-700"> · object #{rejection.contour_id}</span>
                    )}
                    {rejection.note && (
                      <span className="block text-rose-800">{rejection.note}</span>
                    )}
                    <span className="block text-xs text-rose-600">
                      {rejection.created_by} ·{' '}
                      {new Date(rejection.created_at).toLocaleString()}
                    </span>
                  </div>
                  {canResolve && (
                    <button
                      onClick={() => handleResolve(rejection.id)}
                      disabled={busy === rejection.id}
                      className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-700 bg-white border border-rose-300 rounded hover:bg-rose-100 disabled:opacity-50 transition-colors"
                      title="Mark this point as addressed"
                    >
                      {busy === rejection.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      Done
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default RejectionBanner;
