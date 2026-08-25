import React, { useMemo } from "react";
import {
  Star,
  ArrowRight,
} from "lucide-react";
import { getTaskMeta } from "../../../constants/tasks";
import { resolveEffectiveRoute, ROUTE_STATUS } from "./orchestrationViewModel";
import { modelsForTaskAndLabel } from "../ModelOrchestrationPanel";
import { groupLabelsByLevel } from "../LabelModelPlanner";
import { getLabelColor } from "../../../utils/labelColors";
import ModelRouteCard from "./ModelRouteCard";

/**
 * TaskWorkspace component
 *
 * Main routing desk workspace matching the target design:
 * - Top context bar with pill, summary, and override precedence note.
 * - Unified source -> model task default mapping row inside subtle dark gradient card.
 * - Hierarchical label overrides section with thin tree spine and branch connector lines.
 */
export default function TaskWorkspace({
  category,
  selectedInteractiveTask = "prompted-segmentation",
  onSelectInteractiveTask,
  draftBindings = [],
  labelsById = {},
  catalog = { models: [], retrieval_strategies: [] },
  onConfigure,
  canEdit = true,
  className = "",
}) {
  const activeTask =
    category?.key === "interactive"
      ? selectedInteractiveTask || "prompted-segmentation"
      : category?.tasks?.[0] || "instance-segmentation";

  const taskMeta = getTaskMeta(activeTask);
  const models = catalog?.models || [];

  // Group labels hierarchically by depth level
  const levels = useMemo(() => groupLabelsByLevel(labelsById), [labelsById]);
  const totalLabelsCount = Object.keys(labelsById).length;

  // Flattened ordered labels preserving hierarchical depth
  const allOrderedLabels = useMemo(() => {
    return levels.flatMap((lvl) => lvl.labels);
  }, [levels]);

  // Actual explicit override bindings count for this task
  const explicitOverrideCount = useMemo(() => {
    return draftBindings.filter(
      (b) => b.task === activeTask && b.label_id != null && labelsById[b.label_id]
    ).length;
  }, [draftBindings, activeTask, labelsById]);

  // Resolve task default route
  const defaultEffectiveRoute = useMemo(
    () =>
      resolveEffectiveRoute({
        task: activeTask,
        labelId: null,
        bindings: draftBindings,
        catalog,
      }),
    [activeTask, draftBindings, catalog]
  );

  const defaultAvailableModels = useMemo(
    () => modelsForTaskAndLabel(models, activeTask, null),
    [models, activeTask]
  );

  const getWorkspaceSubtitle = () => {
    if (category?.key === "interactive") {
      return "Canvas prompts and within-image suggestions, one model.";
    }
    if (category?.key === "instance" || category?.key === "batch-instance") {
      return "Batch run across every dataset image.";
    }
    if (category?.key === "cross-image") {
      return "Retrieve exemplars from other images.";
    }
    return taskMeta.description || "";
  };

  return (
    <div
      className={`flex-1 flex flex-col gap-5 min-w-0 ${className}`}
      data-testid="task-workspace"
    >
      {/* 1. Context Row Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium text-teal-400 bg-teal-500/10 border border-teal-500/30">
            {category?.label || taskMeta.label}
          </span>
          <span className="text-xs text-t3 hidden sm:inline">
            {getWorkspaceSubtitle()}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Sub-route switcher for Interactive category */}
          {category?.key === "interactive" && (
            <div className="flex items-center gap-1 bg-well p-0.5 rounded-lg border border-ln">
              {category.tasks.map((taskKey) => {
                const isSubSelected = activeTask === taskKey;
                const meta = getTaskMeta(taskKey);

                return (
                  <button
                    key={taskKey}
                    type="button"
                    onClick={() => onSelectInteractiveTask && onSelectInteractiveTask(taskKey)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      isSubSelected
                        ? "bg-p1 text-t1 shadow-2xs border border-ln"
                        : "text-t3 hover:text-t2 hover:bg-hv/50"
                    }`}
                    aria-pressed={isSubSelected}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="text-xs text-t3 italic hidden lg:block">
            A label override always beats the task default.
          </div>
        </div>
      </div>

      {/* 2. Task Default Route Card with subtle thin teal border */}
      <div className="p-4 sm:p-5 rounded-2xl border border-teal-500/25 bg-gradient-to-r from-teal-950/15 via-[#131924] to-[#131924] shadow-xs flex flex-col md:flex-row md:items-center gap-4">
        {/* Left source column */}
        <div className="md:w-56 shrink-0 px-1 flex items-center gap-3">
          <Star size={16} className="text-amber-400 fill-amber-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-t1 leading-tight">
              Task Default Route
            </div>
            <div className="text-xs text-t3 truncate mt-0.5">
              Every label without an override
            </div>
          </div>
        </div>

        {/* Connector arrow */}
        <div className="hidden md:flex items-center text-t3/40 shrink-0 mx-2">
          <ArrowRight size={15} />
        </div>

        {/* Right model column */}
        <div className="flex-1 min-w-0">
          <ModelRouteCard
            task={activeTask}
            label={null}
            effectiveRoute={defaultEffectiveRoute}
            availableModels={defaultAvailableModels}
            onConfigure={onConfigure}
            canEdit={canEdit}
          />
        </div>
      </div>

      {/* 3. Hierarchical Label Overrides Section */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-3 px-1 py-1">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-t3 shrink-0">
            Label Overrides
          </h3>
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs text-t3 shrink-0 font-medium">
            {explicitOverrideCount} overrides / {totalLabelsCount} labels
          </span>
        </div>

        {allOrderedLabels.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-slate-800 bg-[#0d121c] text-center text-xs text-t3">
            No dataset labels exist; only the task default route can be configured.
          </div>
        ) : (
          <div className="relative pl-6 sm:pl-8 space-y-3">
            {/* The thin vertical tree spine on the left */}
            <div
              className="absolute left-2.5 sm:left-3 top-7 bottom-7 w-px bg-slate-700/80 z-10"
              aria-hidden="true"
            />

            {allOrderedLabels.map((label) => {
              const labelColor = label.color || getLabelColor(label.id);
              const effectiveRoute = resolveEffectiveRoute({
                task: activeTask,
                labelId: label.id,
                bindings: draftBindings,
                catalog,
              });
              const isExplicit = effectiveRoute?.status === ROUTE_STATUS.EXPLICIT;
              const isInherited = effectiveRoute?.status === ROUTE_STATUS.INHERITED;
              const availableModels = modelsForTaskAndLabel(models, activeTask, label.id);

              return (
                <div key={label.id} className="relative">
                  {/* Thin horizontal branch connector line from spine to card */}
                  <div
                    className="absolute -left-3.5 sm:-left-5 top-1/2 w-3.5 sm:w-5 h-px bg-slate-700/80 z-10"
                    aria-hidden="true"
                  />

                  {/* Outer Card: Thin solid border for explicit overrides, thin dashed border for inherited */}
                  <div
                    className={`p-4 sm:p-5 rounded-2xl transition-all shadow-xs flex flex-col md:flex-row md:items-center gap-4 relative ${
                      isExplicit
                        ? "border border-slate-700/80 bg-[#131924] hover:border-slate-600"
                        : "border border-dashed border-slate-800 bg-[#0d121c] hover:bg-[#0f1523]"
                    }`}
                  >
                    {/* Left source column: Label Identity with compact dot */}
                    <div className="md:w-56 shrink-0 px-1 flex items-center gap-2.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: labelColor,
                          boxShadow: `0 0 6px ${labelColor}88`,
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-t1 truncate leading-tight">
                          {label.name}
                        </div>
                        {label.parentName ? (
                          <div className="text-xs text-t3 truncate mt-0.5">
                            <span>Level {label.level + 1} · </span>
                            <span>child of {label.parentName}</span>
                          </div>
                        ) : (
                          <div className="text-xs text-t3 truncate mt-0.5">
                            <span>Level 1 · </span>
                            <span>{label.instance_count ? `${label.instance_count} instances` : "Root class"}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Connector arrow */}
                    <div className="hidden md:flex items-center text-t3/40 shrink-0 mx-2">
                      <ArrowRight size={15} />
                    </div>

                    {/* Right model column: Route Card */}
                    <div className="flex-1 min-w-0">
                      <ModelRouteCard
                        task={activeTask}
                        label={label}
                        effectiveRoute={effectiveRoute}
                        availableModels={availableModels}
                        onConfigure={onConfigure}
                        canEdit={canEdit}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
