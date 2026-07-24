import React, { useEffect, useState } from "react";
import {
  ArrowDownUp,
  Loader2,
  Play,
  RotateCcw,
  Shuffle,
  Sparkles,
  SquarePen,
  X,
} from "lucide-react";
import {
  buildAnnotationQueue,
  fetchAnnotationQueue,
  fetchAnnotationQueueSummary,
} from "../../../api";

/** Icon per ordering strategy; falls back to the generic reorder icon. */
const STRATEGY_ICONS = {
  as_uploaded: ArrowDownUp,
  random: Shuffle,
  diversity: Sparkles,
};

/**
 * The step between the Annotation card and the editor: choose the order images
 * are annotated in (as uploaded, randomized, or a future active-learning
 * ordering) and build the queue, or resume the one saved from last time.
 *
 * The built order is persisted per (dataset, user) on the backend; `onStart` is
 * called with the ordered image ids so the caller can jump into the editor. The
 * editor's loader re-reads the saved queue, so the order survives a refresh even
 * though we hand it over here to avoid a reorder flash.
 */
const AnnotationQueueModal = ({ isOpen, onClose, dataset, onStart }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState(null);
  // Even when a queue is saved, let the user drop into the chooser to rebuild it.
  const [recomputing, setRecomputing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Load the workload + saved-queue state each time the modal opens.
  useEffect(() => {
    if (!isOpen || !dataset?.id) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRecomputing(false);
    fetchAnnotationQueueSummary(dataset.id)
      .then((response) => {
        if (cancelled) return;
        if (response?.success) {
          setSummary(response.summary);
          const available = (response.summary.strategies || []).filter((s) => s.available);
          setStrategy(response.summary.saved_strategy || available[0]?.key || null);
        } else {
          setError("Could not load annotation options.");
        }
      })
      .catch(() => !cancelled && setError("Could not load annotation options."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isOpen, dataset?.id]);

  if (!isOpen) return null;

  const strategies = summary?.strategies || [];
  const hasSavedQueue = summary?.has_saved_queue;
  const noImages = summary != null && summary.total === 0;
  // The chooser shows either when nothing is saved, or the user asked to rebuild.
  const showChooser = !hasSavedQueue || recomputing;

  const finish = (imageIds) => {
    if (!imageIds || imageIds.length === 0) {
      setError("This dataset has no images to annotate.");
      return;
    }
    onStart(imageIds);
  };

  const handleResume = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchAnnotationQueue(dataset.id);
      if (response?.success && response.queue) {
        finish(response.queue.image_ids);
      } else {
        // The saved queue vanished (e.g. cleared elsewhere) — fall back to building.
        setRecomputing(true);
      }
    } catch (err) {
      setError(err.message || "Could not load the saved queue.");
    } finally {
      setBusy(false);
    }
  };

  const handleBuild = async () => {
    if (!strategy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await buildAnnotationQueue(dataset.id, { strategy });
      if (response?.success && response.queue) {
        finish(response.queue.image_ids);
      } else {
        setError("Could not build the queue.");
      }
    } catch (err) {
      setError(err.message || "Could not build the queue.");
    } finally {
      setBusy(false);
    }
  };

  const savedStrategyLabel =
    strategies.find((s) => s.key === summary?.saved_strategy)?.label || summary?.saved_strategy;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div className="fixed inset-0 bg-gray-500/75 transition-opacity" onClick={onClose} />

        <div className="relative inline-block w-full max-w-lg text-left align-middle bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="relative bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-5 text-white">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 pr-8">
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/20 shrink-0">
                <SquarePen className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Annotate images</h3>
                <p className="text-sm text-white/90 mt-0.5">
                  Choose the order to work through{" "}
                  {dataset?.name ? `“${dataset.name}”` : "this dataset"}.
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4 min-h-[8rem]">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading…
              </div>
            ) : noImages ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                This dataset has no images yet. Upload some from Data Management first.
              </div>
            ) : (
              <>
                {/* Resume state: offer to pick up the saved order, with a way to rebuild. */}
                {hasSavedQueue && !recomputing && (
                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                    <div className="text-sm font-semibold text-gray-800">
                      Resume your saved queue
                    </div>
                    <div className="text-sm text-gray-600 mt-0.5">
                      Ordered <span className="font-medium">{savedStrategyLabel}</span>. You’ll
                      start at the first unfinished image.
                    </div>
                    <button
                      type="button"
                      onClick={() => setRecomputing(true)}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Change or recompute order
                    </button>
                  </div>
                )}

                {/* Ordering chooser. */}
                {showChooser && (
                  <div className="space-y-2">
                    {hasSavedQueue && (
                      <div className="text-sm font-semibold text-gray-700">Pick a new order</div>
                    )}
                    {strategies.map((option) => {
                      const Icon = STRATEGY_ICONS[option.key] || ArrowDownUp;
                      const active = strategy === option.key;
                      const disabled = !option.available;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          disabled={disabled}
                          onClick={() => setStrategy(option.key)}
                          className={`w-full text-left rounded-xl border-2 p-3 transition-all flex items-start gap-3 ${
                            disabled
                              ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-70"
                              : active
                                ? "border-teal-500 bg-teal-50 shadow-sm"
                                : "border-gray-200 bg-white hover:border-teal-300"
                          }`}
                        >
                          <Icon
                            className={`w-5 h-5 mt-0.5 shrink-0 ${
                              active && !disabled ? "text-teal-600" : "text-gray-400"
                            }`}
                          />
                          <span className="flex-1">
                            <span className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{option.label}</span>
                              {disabled && (
                                <span className="inline-block px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[11px] font-medium">
                                  Coming soon
                                </span>
                              )}
                            </span>
                            <span className="block text-sm text-gray-600 leading-snug">
                              {option.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {error}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            {!loading && !noImages && hasSavedQueue && !recomputing ? (
              <button
                onClick={handleResume}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Resume
              </button>
            ) : (
              <button
                onClick={handleBuild}
                disabled={busy || loading || noImages || !strategy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {busy ? "Building…" : "Build queue & start"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnotationQueueModal;
