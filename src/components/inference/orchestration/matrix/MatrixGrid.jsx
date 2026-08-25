import React from "react";
import { Star, AlertTriangle } from "lucide-react";
import {
  ORCHESTRATION_CATEGORIES,
  ROUTE_STATUS,
  resolveEffectiveRoute,
} from "../orchestrationViewModel";

/**
 * MatrixGrid Component (Design B)
 *
 * Full matrix view rendering one cell per (task, label).
 * Displays Task Default row, hierarchical label rows, and visual cues for
 * bound vs inherited vs unconfigured cells.
 */
export default function MatrixGrid({
  labelsById = {},
  catalog = { models: [], retrieval_strategies: [] },
  draftBindings = [],
  onSelectCell,
  canEdit = true,
  className = "",
}) {
  const models = catalog?.models || [];

  // Build hierarchical ordered label list
  const allLabels = Object.values(labelsById);
  const rootLabels = allLabels.filter(
    (l) => l.parent_id == null || !labelsById[l.parent_id]
  );
  const childMap = {};
  allLabels.forEach((l) => {
    if (l.parent_id != null) {
      if (!childMap[l.parent_id]) childMap[l.parent_id] = [];
      childMap[l.parent_id].push(l);
    }
  });

  const orderedRows = [];
  const traverse = (label, depth = 0) => {
    orderedRows.push({ ...label, depth });
    const children = childMap[label.id] || [];
    children.forEach((c) => traverse(c, depth + 1));
  };
  rootLabels.forEach((r) => traverse(r, 0));

  // If no hierarchy is defined, fall back to flat list
  const displayLabels = orderedRows.length > 0 ? orderedRows : allLabels.map((l) => ({ ...l, depth: 0 }));

  // Column definitions mapping to canonical task keys
  const columns = [
    {
      key: "interactive",
      task: "prompted-segmentation",
      label: "Interactive segmentation",
      subtitle: "Canvas prompts and within-image suggestions",
      dotColor: "text-teal-400",
      accentBorder: "border-teal-500/60 bg-[#101e23] hover:border-teal-400 hover:bg-[#13262d]",
      dotHex: "#2dd4bf",
    },
    {
      key: "instance",
      task: "instance-segmentation",
      label: "Instance segmentation",
      subtitle: "Batch, whole dataset",
      dotColor: "text-amber-400",
      accentBorder: "border-amber-500/60 bg-[#1f1912] hover:border-amber-400 hover:bg-[#271f16]",
      dotHex: "#fbbf24",
    },
    {
      key: "cross-image",
      task: "cross-image-suggestion",
      label: "Cross-image suggestion",
      subtitle: "Retrieve exemplars across images",
      dotColor: "text-purple-400",
      accentBorder: "border-purple-500/60 bg-[#1c1524] hover:border-purple-400 hover:bg-[#231a2e]",
      dotHex: "#c084fc",
    },
  ];

  const renderCellContent = (col, labelId) => {
    const isDefault = labelId == null;
    const effective = resolveEffectiveRoute({
      task: col.task,
      labelId,
      bindings: draftBindings,
      catalog,
    });

    const isExplicit = effective.status === ROUTE_STATUS.EXPLICIT;
    const isInherited = effective.status === ROUTE_STATUS.INHERITED;
    const isStale =
      effective.status === ROUTE_STATUS.STALE ||
      effective.status === ROUTE_STATUS.STALE_DEFAULT;
    const model = effective.model;
    const isTrainedOnDataset = model?.is_fine_tuned || model?.is_trained_here || false;

    // Subtitle description
    let subtitle = "";
    if (isExplicit && model) {
      const perf = model.latency_badge ? `${model.latency_badge} · ` : "";
      const classText =
        model.label_ids?.length > 0
          ? `${model.label_ids.length} class${model.label_ids.length > 1 ? "es" : ""}`
          : "class-agnostic";
      subtitle = `${perf}${classText}`;
    } else if (isInherited && model) {
      subtitle = "from task default";
    } else if (isDefault) {
      subtitle = "task will not run";
    } else {
      subtitle = "no default set";
    }

    const handleClick = () => {
      if (!onSelectCell) return;
      onSelectCell(col.task, labelId);
    };

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!canEdit}
        className={`w-full text-left p-3.5 rounded-xl transition-all cursor-pointer group flex items-start justify-between gap-2 min-h-[66px] ${
          isStale
            ? "border border-amber-400/80 bg-amber-500/10 ring-1 ring-amber-400/30"
            : isExplicit
            ? `border ${col.accentBorder} shadow-2xs`
            : isInherited
            ? "border border-dashed border-slate-700/80 bg-[#121822] hover:bg-[#161e2b] hover:border-slate-600"
            : isDefault
            ? "border border-dashed border-slate-800 bg-[#0e131b] hover:bg-[#121822] hover:border-slate-700 text-t3"
            : "border border-dashed border-slate-800 bg-[#0e131b] hover:bg-[#121822] hover:border-slate-700 text-t3"
        }`}
        data-testid={`matrix-cell-${col.task}-${labelId ?? "default"}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {isStale ? (
              <AlertTriangle size={12} className="text-amber-400 shrink-0" />
            ) : isExplicit ? (
              <span className={`text-[9px] ${col.dotColor} shrink-0`}>●</span>
            ) : (
              <span className="text-[9px] text-t3/50 shrink-0">●</span>
            )}

            <span
              className={`text-xs font-semibold truncate ${
                isExplicit ? "text-t1" : isInherited ? "text-t2 group-hover:text-t1" : "text-t3 group-hover:text-t2"
              }`}
            >
              {isExplicit && model
                ? model.name || model.registry_key
                : isInherited && model
                ? `Inherits ${model.name || model.registry_key}`
                : isDefault
                ? "No task default"
                : "Inherit default"}
            </span>

            {isTrainedOnDataset && (
              <Star
                size={11}
                className="text-teal-400 fill-teal-400 shrink-0 ml-0.5"
                title="Trained on this dataset"
              />
            )}
          </div>

          <p className="text-[11px] text-t3 truncate mt-1 pl-3.5">
            {subtitle}
          </p>
        </div>
      </button>
    );
  };

  return (
    <div
      className={`rounded-2xl border border-slate-800/80 bg-[#0b0f17] p-5 space-y-4 shadow-sm ${className}`}
      data-testid="matrix-grid"
    >
      {/* Matrix Header Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-3 border-b border-slate-800/80 text-xs">
        <div className="font-bold text-[10px] uppercase tracking-wider text-t3 self-end px-1">
          Label
        </div>
        {columns.map((col) => (
          <div key={col.key} className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs ${col.dotColor}`}>●</span>
              <span className="font-semibold text-t1">{col.label}</span>
            </div>
            <p className="text-[11px] text-t3 truncate">{col.subtitle}</p>
          </div>
        ))}
      </div>

      {/* Row 1: Task Default Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center py-2">
        <div className="px-1">
          <div className="flex items-center gap-2">
            <Star size={14} className="text-amber-400 fill-amber-400 shrink-0" />
            <span className="text-xs font-bold text-t1">Task default</span>
          </div>
          <p className="text-[11px] text-t3 mt-0.5 pl-5.5">
            Fallback for every label
          </p>
        </div>

        {columns.map((col) => (
          <div key={col.key}>
            {renderCellContent(col, null)}
          </div>
        ))}
      </div>

      {/* Label Rows */}
      {displayLabels.map((l) => {
        const parent = l.parent_id ? labelsById[l.parent_id] : null;
        const levelText = `Level ${l.depth + 1}${
          l.instance_count != null ? ` · ${l.instance_count} instances` : ""
        }${parent ? ` · child of ${parent.name}` : ""}`;

        return (
          <div
            key={l.id}
            className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center py-2 border-t border-slate-800/40"
          >
            {/* Label Column with elegant curved tree connector */}
            <div
              className="px-1 min-w-0"
              style={{ paddingLeft: `${l.depth * 22 + 4}px` }}
            >
              <div className="relative flex items-center gap-2 min-w-0">
                {l.depth > 0 && (
                  <div
                    className="absolute -left-3.5 -top-3 w-3 h-5.5 border-l-2 border-b-2 border-slate-700/80 rounded-bl-md pointer-events-none"
                    aria-hidden="true"
                  />
                )}
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/10"
                  style={{ backgroundColor: l.color || "#2dd4bf" }}
                />
                <span className="text-xs font-semibold text-t1 truncate">
                  {l.name}
                </span>
              </div>
              <p
                className="text-[10px] text-t3 truncate mt-0.5 pl-4.5"
              >
                {levelText}
              </p>
            </div>

            {columns.map((col) => (
              <div key={col.key}>
                {renderCellContent(col, l.id)}
              </div>
            ))}
          </div>
        );
      })}

      {/* Bottom Legend */}
      <div className="pt-4 border-t border-slate-800/80 flex items-center gap-6 text-[11px] text-t3">
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded border border-teal-500/50 bg-teal-950/30" />
          <span>bound route</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded border border-dashed border-slate-700 bg-slate-800/30" />
          <span>inherits default</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Star size={11} className="text-teal-400 fill-teal-400" />
          <span>trained on this dataset</span>
        </div>
      </div>
    </div>
  );
}
