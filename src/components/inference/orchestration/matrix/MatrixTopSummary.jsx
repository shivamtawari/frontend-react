import React from "react";
import { ORCHESTRATION_CATEGORIES } from "../orchestrationViewModel";

/**
 * MatrixTopSummary Component (Design B)
 *
 * 3 category metric cards across the top:
 * - Interactive segmentation (Canvas prompts + within-image)
 * - Instance segmentation (Batch across the dataset)
 * - Cross-image suggestion (Retrieved exemplars)
 */
export default function MatrixTopSummary({ coverage }) {
  const categories = coverage?.categories || {};

  const getCategoryMeta = (catKey) => {
    switch (catKey) {
      case "interactive":
        return {
          subtitle: "Canvas prompts + within-image",
          dotColor: "text-teal-400",
          barColor: "bg-teal-400",
        };
      case "instance":
      case "batch-instance":
        return {
          subtitle: "Batch across the dataset",
          dotColor: "text-amber-400",
          barColor: "bg-amber-400",
        };
      case "cross-image":
        return {
          subtitle: "Retrieved exemplars",
          dotColor: "text-purple-400",
          barColor: "bg-purple-400",
        };
      default:
        return {
          subtitle: "",
          dotColor: "text-teal-400",
          barColor: "bg-teal-400",
        };
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="matrix-top-summary">
      {ORCHESTRATION_CATEGORIES.map((cat) => {
        const catCov = categories[cat.key] || { bound: 0, possible: 0, percentage: 0 };
        const meta = getCategoryMeta(cat.key);
        const percentage = Math.min(100, Math.max(0, catCov.percentage || 0));

        return (
          <div
            key={cat.key}
            className="p-4 rounded-2xl border border-slate-800/80 bg-[#121721] flex items-center justify-between gap-4 shadow-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-xs ${meta.dotColor}`}>●</span>
                <h4 className="text-sm font-semibold text-t1 truncate">
                  {cat.label}
                </h4>
              </div>
              <p className="text-xs text-t3 truncate mt-1">
                {meta.subtitle}
              </p>
            </div>

            <div className="flex flex-col items-end shrink-0 gap-1.5 w-28">
              <div className="flex items-baseline gap-1 text-xs">
                <span className="text-base font-bold text-t1 font-mono">
                  {catCov.bound}
                </span>
                <span className="text-t3 text-[11px]">
                  of {catCov.possible} bound
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-800/90 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${meta.barColor}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
