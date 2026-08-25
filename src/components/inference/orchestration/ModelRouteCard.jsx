import React from "react";
import {
  Sliders,
  Star,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { ROUTE_STATUS } from "./orchestrationViewModel";

/**
 * ModelRouteCard component
 *
 * Renders the right-hand model route block in the source -> model row rhythm.
 * Matches the target design with clean model icon tiles, 2-line title/description hierarchy,
 * subtle performance/fine-tuned badges, and dedicated Configure / Bind buttons.
 */
export default function ModelRouteCard({
  task,
  label = null,
  effectiveRoute,
  availableModels = [],
  onConfigure,
  canEdit = true,
  className = "",
}) {
  const isDefault = label == null;
  const status = effectiveRoute?.status || ROUTE_STATUS.UNBOUND;
  const model = effectiveRoute?.model;
  const binding = effectiveRoute?.binding;
  const labelId = label?.id ?? null;

  const hasCompatibleModels = availableModels.length > 0;
  const isStale = status === ROUTE_STATUS.STALE || status === ROUTE_STATUS.STALE_DEFAULT;
  const isExplicit = status === ROUTE_STATUS.EXPLICIT;
  const isInherited = status === ROUTE_STATUS.INHERITED;
  const isIncompatible = status === ROUTE_STATUS.UNBOUND_INCOMPATIBLE;
  const isUnbound = status === ROUTE_STATUS.UNBOUND;

  const handleActionClick = () => {
    if (!onConfigure) return;
    onConfigure(task, labelId);
  };

  const getLatencyBars = (badge) => {
    const b = (badge || "").toLowerCase();
    if (b === "fast") {
      return (
        <div className="flex items-center gap-0.5 text-teal-400" title="Fast latency">
          <span className="w-1 h-3 bg-teal-400 rounded-2xs" />
          <span className="w-1 h-2 bg-teal-400/40 rounded-2xs" />
          <span className="w-1 h-1 bg-teal-400/20 rounded-2xs" />
        </div>
      );
    }
    if (b === "balanced") {
      return (
        <div className="flex items-center gap-0.5 text-teal-400" title="Balanced latency">
          <span className="w-1 h-2.5 bg-teal-400 rounded-2xs" />
          <span className="w-1 h-2.5 bg-teal-400 rounded-2xs" />
          <span className="w-1 h-1 bg-teal-400/20 rounded-2xs" />
        </div>
      );
    }
    if (b === "accurate") {
      return (
        <div className="flex items-center gap-0.5 text-teal-400" title="Accurate / Higher latency">
          <span className="w-1 h-3 bg-teal-400 rounded-2xs" />
          <span className="w-1 h-3 bg-teal-400 rounded-2xs" />
          <span className="w-1 h-3 bg-teal-400 rounded-2xs" />
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className={`rounded-xl border p-3 px-4 transition-all text-xs flex items-center justify-between gap-4 ${
        isStale
          ? "border-amber-400/80 bg-amber-500/5 ring-1 ring-amber-400/30"
          : isExplicit
          ? "border-teal-500/30 bg-[#161d28] shadow-2xs"
          : isInherited
          ? "border border-dashed border-slate-700/70 bg-[#11161f]/60 hover:bg-[#11161f]"
          : isIncompatible
          ? "border border-dashed border-slate-700/60 bg-[#11161f]/40 text-t3"
          : "border border-dashed border-slate-700/60 bg-[#11161f]/40 text-t3"
      } ${className}`}
      data-testid={`route-card-${task}-${labelId ?? "default"}`}
    >
      {/* Model Info Left (2-line layout: Title & Description) */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* Icon tile */}
        <div
          className={`p-2 rounded-lg shrink-0 ${
            isStale
              ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
              : isExplicit
              ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
              : "bg-well text-t3 border border-ln/60"
          }`}
        >
          {isStale ? (
            <AlertTriangle size={15} />
          ) : isExplicit ? (
            <Zap size={15} className="fill-teal-400/20" />
          ) : (
            <Zap size={15} />
          )}
        </div>

        <div className="min-w-0 flex-1 flex flex-col justify-center">
          {isStale ? (
            <>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-amber-500 text-xs">
                  {model?.name || binding?.model_registry_key || "Unknown model"}
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">
                  {effectiveRoute?.reason === "incompatible_model"
                    ? "Incompatible with label"
                    : "Degraded / Unavailable"}
                </span>
              </div>
              <p className="text-[11px] text-amber-500/80 mt-0.5 line-clamp-1">
                {effectiveRoute?.reason === "incompatible_model"
                  ? "This model only predicts specific classes and does not support this label. Reconfigure to resolve."
                  : "The saved model key is not registered in the active catalog. Reconfigure to resolve."}
              </p>
            </>
          ) : isExplicit ? (
            <>
              <div className="text-xs font-bold text-t1 leading-tight truncate">
                {model?.name || model?.registry_key || binding?.model_registry_key}
              </div>
              <div className="text-[11px] text-t3 truncate mt-0.5">
                {model?.description || model?.usage_tip || "Class-agnostic · serves prompts and suggestions"}
              </div>
            </>
          ) : isInherited ? (
            <>
              <div className="text-xs font-semibold text-t2 leading-tight truncate">
                {model?.name || "Task default"}
              </div>
              <div className="text-[11px] text-t3 truncate mt-0.5">
                Inherits task default · nothing to configure
              </div>
            </>
          ) : isIncompatible ? (
            <div className="text-xs font-medium text-t3 leading-tight truncate">
              Unbound — task default does not cover this class
            </div>
          ) : (
            <div className="text-xs font-medium text-t3 leading-tight truncate">
              {isDefault ? "No default model bound" : "Unbound (no override)"}
            </div>
          )}
        </div>
      </div>

      {/* Badges & Actions Right */}
      <div className="flex items-center gap-2.5 shrink-0 ml-2">
        {isExplicit && model?.trained_on_dataset && (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-teal-500/10 text-teal-300 border border-teal-500/20"
            title="Fine-tuned on this dataset"
          >
            <Star size={10} className="fill-teal-300 text-teal-300" />
            <span>Fine-tuned</span>
          </span>
        )}

        {isExplicit && Array.isArray(model?.badges) &&
          model.badges.map((b, idx) => (
            <React.Fragment key={idx}>
              <span className="px-2.5 py-0.5 bg-well text-t2 rounded-md text-[11px] font-medium border border-ln/60">
                {b}
              </span>
              {getLatencyBars(b)}
            </React.Fragment>
          ))}

        {isInherited && (
          <span className="px-2.5 py-0.5 bg-well/60 text-t3 rounded-md text-[11px] font-medium border border-ln/40">
            Inherits default
          </span>
        )}

        {!canEdit ? (
          <button
            type="button"
            onClick={handleActionClick}
            aria-label={label ? `View details for ${label.name} route` : "View details for task default route"}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-t2 border border-ln rounded-lg bg-well/40 hover:text-t1 hover:bg-well transition shadow-2xs"
          >
            <Sliders size={12} />
            <span>View details</span>
          </button>
        ) : isStale ? (
          <button
            type="button"
            onClick={handleActionClick}
            aria-label={label ? `Repair ${label.name} route` : "Repair task default route"}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-amber-400 border border-amber-500/40 rounded-lg hover:bg-amber-500/10 transition shadow-2xs disabled:opacity-50"
          >
            <Sliders size={12} />
            <span>Repair</span>
          </button>
        ) : isExplicit ? (
          <button
            type="button"
            onClick={handleActionClick}
            aria-label={label ? `Configure ${label.name} route` : "Configure task default route"}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-teal-400 border border-teal-500/50 rounded-lg hover:bg-teal-500/10 transition shadow-2xs disabled:opacity-50"
          >
            <Sliders size={12} />
            <span>Configure</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleActionClick}
            disabled={!hasCompatibleModels}
            aria-label={label ? `Bind model to ${label.name}` : "Bind model to task default"}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-t2 border border-ln rounded-lg bg-well/40 hover:text-t1 hover:bg-well transition shadow-2xs disabled:opacity-40"
          >
            <Sliders size={12} />
            <span>Bind a model</span>
          </button>
        )}
      </div>
    </div>
  );
}
