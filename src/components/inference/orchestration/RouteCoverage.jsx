import React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { ORCHESTRATION_CATEGORIES } from "./orchestrationViewModel";

/**
 * RouteCoverage component
 *
 * Renders a single continuous summary strip matching the target design:
 * Left: Uppercase header, prominent route bound counter.
 * Right: Three category progress segments (teal, amber, purple) with top progress bar,
 * colored status dot, and bound/possible count.
 */
export default function RouteCoverage({
  coverage,
  className = "",
}) {
  const overall = coverage?.overall || { bound: 0, possible: 0, stale: 0, percentage: 0 };
  const categories = coverage?.categories || {};

  const getCategoryTheme = (catKey, isStale) => {
    if (isStale) {
      return {
        barColor: "bg-amber-500",
        dotColor: "text-amber-400",
      };
    }
    if (catKey === "interactive") {
      return {
        barColor: "bg-teal-400",
        dotColor: "text-teal-400",
      };
    }
    if (catKey === "instance" || catKey === "batch-instance") {
      return {
        barColor: "bg-amber-400",
        dotColor: "text-amber-400",
      };
    }
    if (catKey === "cross-image") {
      return {
        barColor: "bg-purple-400",
        dotColor: "text-purple-400",
      };
    }
    return {
      barColor: "bg-ac",
      dotColor: "text-ac",
    };
  };

  const getShortLabel = (catKey, label) => {
    if (catKey === "interactive") return "Interactive seg";
    if (catKey === "instance" || catKey === "batch-instance") return "Instance seg";
    if (catKey === "cross-image") return "Cross-image";
    return label;
  };

  return (
    <div
      className={`border border-ln rounded-2xl bg-p1 p-4 shadow-2xs transition-colors ${className}`}
      data-testid="route-coverage-strip"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Overall Summary block */}
        <div className="flex items-center gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-t3">
                Route Coverage
              </span>
              {overall.stale > 0 ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <AlertTriangle size={10} />
                  <span>{overall.stale} degraded</span>
                </span>
              ) : overall.percentage === 100 && overall.possible > 0 ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <CheckCircle2 size={10} />
                  <span>Complete</span>
                </span>
              ) : null}
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-3xl font-bold text-t1 tracking-tight">
                {overall.bound}
              </span>
              <span className="text-xs text-t3">
                of <strong className="font-semibold text-t2">{overall.possible}</strong> possible routes bound ({overall.percentage}%)
              </span>
            </div>
          </div>
        </div>

        {/* 3 inline category progress segments */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 flex-1 lg:max-w-2xl">
          {ORCHESTRATION_CATEGORIES.map((cat) => {
            const catCoverage = categories[cat.key] || {
              bound: 0,
              possible: 0,
              stale: 0,
              percentage: 0,
            };
            const theme = getCategoryTheme(cat.key, catCoverage.stale > 0);

            return (
              <div
                key={cat.key}
                className="flex flex-col gap-1.5"
                data-testid={`coverage-segment-${cat.key}`}
              >
                {/* Thin progress bar above label/count */}
                <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${theme.barColor}`}
                    style={{ width: `${Math.min(100, Math.max(0, catCoverage.percentage))}%` }}
                    role="progressbar"
                    aria-valuenow={catCoverage.percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${cat.label} completion percentage`}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-[10px] ${theme.dotColor}`}>●</span>
                    <span className="font-medium text-t2 truncate" title={cat.label}>
                      {cat.label}
                    </span>
                  </div>
                  <span className="text-t3 font-mono text-xs shrink-0 ml-2">
                    {catCoverage.bound}/{catCoverage.possible}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
