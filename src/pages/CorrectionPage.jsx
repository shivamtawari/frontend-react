import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CheckCircle2,
  Loader2,
  Play,
  Wrench,
} from 'lucide-react';
import {
  fetchCorrectionSummary,
  buildCorrectionQueue,
  fetchRejectionReasons,
} from '../api/reviews';
import { useAuth } from '../contexts/AuthContext';
import { useDataset } from '../contexts/DatasetContext';
import { useCorrection } from '../contexts/CorrectionContext';
import { usePermissions } from '../hooks/usePermissions';
import { Permission } from '../utils/permissions';
import RoleBadge from '../components/datasets/RoleBadge';

const readableError = (err, fallback) =>
  (err?.message || '').replace(/^API Error:\s*/i, '') || fallback;

/**
 * The correction session's launch pad.
 *
 * Picks an order (and optionally a subset of reasons), builds the queue of open
 * rejections, and hands it to the CorrectionContext — then jumps into the
 * annotation editor on the first item's image, where `CorrectionBar` drives the
 * rest. The queue is memory-only (a snapshot), so this page is where a session
 * always begins; a refresh mid-session lands back here.
 */
const CorrectionPage = () => {
  const { datasetId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { datasets } = useDataset();
  const correction = useCorrection();

  const dataset = useMemo(
    () => datasets?.find((d) => String(d.id) === String(datasetId)) || null,
    [datasets, datasetId]
  );
  const { can, role } = usePermissions(dataset);
  const mayCorrect = can(Permission.ANNOTATION_EDIT_OWN);

  const [summary, setSummary] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [order, setOrder] = useState('oldest');
  const [selectedReasons, setSelectedReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!datasetId || !isAuthenticated) return undefined;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryResponse, reasonResponse] = await Promise.all([
          fetchCorrectionSummary(datasetId),
          fetchRejectionReasons(),
        ]);
        if (cancelled) return;
        if (summaryResponse?.success) setSummary(summaryResponse.summary);
        setReasons(reasonResponse?.reasons || []);
      } catch (err) {
        if (!cancelled) setError(readableError(err, 'Could not load the correction overview.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [datasetId, isAuthenticated]);

  const openCount = summary?.open_rejections ?? null;

  const toggleReason = (value) => {
    setSelectedReasons((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
    );
  };

  const handleStart = useCallback(async () => {
    setBuilding(true);
    setError(null);
    try {
      const response = await buildCorrectionQueue(datasetId, {
        order,
        reasons: selectedReasons.length > 0 ? selectedReasons : null,
      });
      const items = response?.queue?.items || [];
      if (items.length === 0) {
        setError('Nothing matches — there is no correction work with those filters.');
        return;
      }
      correction.start(datasetId, items);
      navigate(`/dataset/${datasetId}/annotate/${items[0].image_id}`);
    } catch (err) {
      setError(readableError(err, 'Could not build the correction queue.'));
    } finally {
      setBuilding(false);
    }
  }, [datasetId, order, selectedReasons, correction, navigate]);

  const canStart = !building && (openCount == null || openCount > 0);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="bg-teal-600 text-white flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(`/dataset/${datasetId}/datamanagement`)}
              className="flex items-center gap-2 hover:text-teal-200 transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="h-6 w-px bg-teal-400 flex-shrink-0" />
            <Wrench className="w-5 h-5 flex-shrink-0" />
            <h1 className="text-lg font-bold truncate">
              Correct {dataset?.name ? `· ${dataset.name}` : ''}
            </h1>
            {role && <RoleBadge role={role} showDescription />}
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex-shrink-0">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!mayCorrect && !loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            You do not have permission to correct annotations on this dataset.
          </div>
        ) : loading ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : openCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <CheckCircle2 className="w-12 h-12 text-teal-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Nothing to correct</h2>
            <p className="text-gray-600 mb-6">
              No annotations have been sent back for correction right now.
            </p>
            <button
              onClick={() => navigate(`/dataset/${datasetId}/datamanagement`)}
              className="px-5 py-2.5 rounded-lg font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors"
            >
              Back to dataset
            </button>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Start a correction session</h2>
            <p className="text-gray-600 mb-2">
              Work through every instance a reviewer sent back, one at a time, in the
              annotation editor.
            </p>
            {openCount != null && (
              <p className="text-sm font-medium text-teal-700 mb-6">
                {openCount === 1
                  ? '1 instance sent back for correction'
                  : `${openCount} instances sent back for correction`}
                {summary?.affected_images > 0 &&
                  ` across ${summary.affected_images} image${
                    summary.affected_images === 1 ? '' : 's'
                  }.`}
              </p>
            )}

            {/* Order */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
              <div className="text-sm font-semibold text-gray-700 mb-3">Order</div>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
                <button
                  onClick={() => setOrder('oldest')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                    order === 'oldest'
                      ? 'bg-teal-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <ArrowUpNarrowWide className="w-4 h-4" />
                  Oldest feedback first
                </button>
                <button
                  onClick={() => setOrder('newest')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                    order === 'newest'
                      ? 'bg-teal-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <ArrowDownWideNarrow className="w-4 h-4" />
                  Newest first
                </button>
              </div>
            </div>

            {/* Reason filter */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
              <div className="text-sm font-semibold text-gray-700 mb-1">
                Limit to reasons ({selectedReasons.length || 'all'})
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Leave all unchecked to correct every kind of feedback.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {reasons.map((reason) => (
                  <label
                    key={reason.value}
                    className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedReasons.includes(reason.value)}
                      onChange={() => toggleReason(reason.value)}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-800">{reason.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleStart}
              disabled={!canStart}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-colors ${
                canStart
                  ? 'bg-teal-600 text-white hover:bg-teal-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {building ? 'Building queue…' : 'Start correcting'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CorrectionPage;
