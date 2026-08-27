import React, { useState, useEffect, useMemo } from "react";
import {
  Cpu,
  Save,
  RotateCcw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import {
  TASK_ORDER,
  TASKS,
  getTaskMeta,
  BATCH_INFERENCE_TASKS,
} from "../../constants/tasks";
import {
  ORCHESTRATION_CATEGORIES,
  calculateCoverage,
  calculatePolicyDiff,
  formatChangeSummary,
  normalizeBindingsMap,
  normalizeSelector,
} from "./orchestration/orchestrationViewModel";
import MatrixTopSummary from "./orchestration/matrix/MatrixTopSummary";
import MatrixGrid from "./orchestration/matrix/MatrixGrid";
import MatrixSideDrawer from "./orchestration/matrix/MatrixSideDrawer";
import RoutingSaveBar from "./orchestration/RoutingSaveBar";

/**
 * Finds models compatible with a specific task and optional label.
 * For task default (labelId == null): all models for this task (class-agnostic or class-aware).
 * For label override: class-agnostic models OR models predicting that specific label.
 */
export const modelsForTaskAndLabel = (models, task, labelId = null) => {
  return (models || []).filter((m) => {
    if (m.task !== task) return false;
    if (labelId == null) {
      // Task default allows any model for this task
      return true;
    }
    return (
      !m.label_ids ||
      m.label_ids.length === 0 ||
      m.label_ids.includes(Number(labelId))
    );
  });
};

/**
 * ModelOrchestrationPanel Coordinator (Design B)
 *
 * Coordinates draft state, matrix grid view, right slide-over drawers,
 * and bottom save bar.
 */
export default function ModelOrchestrationPanel({
  datasetId,
  policy,
  labelsById = {},
  catalog = { models: [], retrieval_strategies: [] },
  onSavePolicy,
  onDeletePolicy,
  isSaving = false,
  isDeleting = false,
  canEdit = true,
  onApplyToBatch = null,
}) {
  const models = catalog?.models || [];
  const strategies = catalog?.retrieval_strategies || [];

  // Local draft bindings state initialized from loaded policy
  const [draftBindings, setDraftBindings] = useState([]);
  const [statusMessage, setStatusMessage] = useState(null);

  // Active drawer target { task, labelId }
  const [drawerTarget, setDrawerTarget] = useState(null);

  // Sync draft bindings when policy changes (e.g. initial load or dataset switch)
  useEffect(() => {
    const initial = policy?.bindings ? JSON.parse(JSON.stringify(policy.bindings)) : [];
    setDraftBindings(initial);
    setStatusMessage(null);
  }, [policy, datasetId]);

  // Pure view-model computations
  const coverage = useMemo(
    () => calculateCoverage(draftBindings, labelsById, catalog),
    [draftBindings, labelsById, catalog]
  );

  const policyDiff = useMemo(
    () => calculatePolicyDiff(policy?.bindings || [], draftBindings),
    [policy?.bindings, draftBindings]
  );

  const hasUnsavedChanges = policyDiff.length > 0;

  const changeSummary = useMemo(
    () => formatChangeSummary(policyDiff, { labelsById, catalog }),
    [policyDiff, labelsById, catalog]
  );

  const handleUpdateBinding = (task, labelId, newBinding) => {
    setDraftBindings((prev) => {
      const filtered = prev.filter(
        (b) =>
          !(
            b.task === task &&
            (labelId == null
              ? b.label_id == null
              : Number(b.label_id) === Number(labelId))
          )
      );
      if (newBinding) {
        filtered.push(newBinding);
      }
      return filtered;
    });
    setStatusMessage(null);
  };

  const handleSave = async () => {
    if (!canEdit || isSaving) return;
    setStatusMessage(null);
    try {
      await onSavePolicy(draftBindings);
      setStatusMessage({ type: "success", text: "Routing policy saved successfully." });
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to save routing policy.",
      });
    }
  };

  const handleReset = () => {
    const initial = policy?.bindings ? JSON.parse(JSON.stringify(policy.bindings)) : [];
    setDraftBindings(initial);
    setStatusMessage(null);
  };

  const handleClearAll = async () => {
    if (!canEdit || isDeleting || isSaving) return;
    try {
      await onDeletePolicy();
      setDraftBindings([]);
      setStatusMessage({ type: "success", text: "Routing policy cleared." });
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to clear routing policy.",
      });
    }
  };

  // Batch eligible count
  const batchEligibleCount = useMemo(() => {
    return draftBindings.filter((b) => BATCH_INFERENCE_TASKS.includes(b.task)).length;
  }, [draftBindings]);

  const hasInstanceRoutes = useMemo(() => {
    return draftBindings.some((b) => b.task === "instance-segmentation");
  }, [draftBindings]);

  const hasCrossImageRoutes = useMemo(() => {
    return draftBindings.some((b) => b.task === "cross-image-suggestion");
  }, [draftBindings]);

  return (
    <div className="space-y-6" data-testid="model-orchestration-desk">
      {/* 1. Top 3 Category Summary Cards */}
      <MatrixTopSummary coverage={coverage} />

      {/* 2. Main Matrix Grid */}
      <MatrixGrid
        labelsById={labelsById}
        catalog={catalog}
        draftBindings={draftBindings}
        onSelectCell={(taskKey, targetLabelId) => {
          setDrawerTarget({ task: taskKey, labelId: targetLabelId });
        }}
        canEdit={canEdit && !isSaving && !isDeleting}
      />

      {/* Batch Application Toolbar (when onApplyToBatch is passed) */}
      {onApplyToBatch && batchEligibleCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-well rounded-xl border border-ln">
          <button
            type="button"
            onClick={() => onApplyToBatch(draftBindings, null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ac bg-acS hover:bg-acS/80 rounded-lg transition"
          >
            <ArrowRight size={13} />
            <span>Apply All Routes ({batchEligibleCount})</span>
          </button>
          {hasInstanceRoutes && hasCrossImageRoutes && (
            <>
              <button
                type="button"
                onClick={() =>
                  onApplyToBatch(draftBindings, "instance-segmentation")
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-t2 bg-well hover:bg-hv rounded-lg transition border border-ln"
                title="Apply only Instance Segmentation routes"
              >
                <span>Instance Seg Only</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onApplyToBatch(draftBindings, "cross-image-suggestion")
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-t2 bg-well hover:bg-hv rounded-lg transition border border-ln"
                title="Apply only Cross-Image Suggestion routes"
              >
                <span>Cross-Image Only</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* 3. Bottom Routing Save Bar */}
      <RoutingSaveBar
        hasUnsavedChanges={hasUnsavedChanges}
        changeSummary={changeSummary}
        hasSavedPolicy={Boolean(policy)}
        onSave={handleSave}
        onReset={handleReset}
        onClear={handleClearAll}
        isSaving={isSaving}
        isDeleting={isDeleting}
        canEdit={canEdit}
        statusMessage={statusMessage}
      />

      {/* 4. Slide-over Model & Inputs Drawer */}
      <MatrixSideDrawer
        isOpen={Boolean(drawerTarget)}
        onClose={() => setDrawerTarget(null)}
        target={drawerTarget}
        labelsById={labelsById}
        catalog={catalog}
        draftBindings={draftBindings}
        onSaveRoute={(taskKey, targetLabelId, newBinding) => {
          handleUpdateBinding(taskKey, targetLabelId, newBinding);
          setDrawerTarget(null);
        }}
        onUnbindRoute={(taskKey, targetLabelId) => {
          handleUpdateBinding(taskKey, targetLabelId, null);
          setDrawerTarget(null);
        }}
        canEdit={canEdit && !isSaving && !isDeleting}
      />
    </div>
  );
}
