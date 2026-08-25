import React from "react";
import { ORCHESTRATION_CATEGORIES } from "./orchestrationViewModel";
import { getTaskMeta } from "../../../constants/tasks";

/**
 * TaskRail component
 *
 * Left navigation rail with 3 visual category cards (270-300px width)
 * matching the target design with subtle thin left accent stripes, pill chips,
 * and a dashed contextual helper card at the bottom.
 */
export default function TaskRail({
  selectedCategory,
  onSelectCategory,
  coverage,
  className = "",
}) {
  const categories = coverage?.categories || {};

  const getCategoryTheme = (key, isSelected) => {
    switch (key) {
      case "interactive":
        return {
          accentBorder: "border-l-2 border-l-teal-400",
          cardStyle: isSelected
            ? "border border-teal-500/30 bg-[#0e1724] shadow-2xs"
            : "border border-slate-800 bg-[#111622] hover:bg-[#151c2a] hover:border-slate-700",
          badgeStyle: isSelected
            ? "bg-teal-500/10 text-teal-400 border border-teal-500/25"
            : "bg-[#18202f] text-teal-400/70 border border-slate-700/50",
          chipStyle: isSelected
            ? "bg-teal-500/10 text-teal-300 border border-teal-500/20"
            : "bg-[#18202f] text-slate-400 border border-slate-700/50",
        };
      case "instance":
      case "batch-instance":
        return {
          accentBorder: "border-l-2 border-l-amber-400",
          cardStyle: isSelected
            ? "border border-amber-500/30 bg-[#1e1912] shadow-2xs"
            : "border border-slate-800 bg-[#111622] hover:bg-[#151c2a] hover:border-slate-700",
          badgeStyle: isSelected
            ? "bg-amber-500/10 text-amber-300 border border-amber-500/25"
            : "bg-[#18202f] text-amber-400/70 border border-slate-700/50",
          chipStyle: isSelected
            ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
            : "bg-[#18202f] text-slate-400 border border-slate-700/50",
        };
      case "cross-image":
        return {
          accentBorder: "border-l-2 border-l-purple-400",
          cardStyle: isSelected
            ? "border border-purple-500/30 bg-[#1a1426] shadow-2xs"
            : "border border-slate-800 bg-[#111622] hover:bg-[#151c2a] hover:border-slate-700",
          badgeStyle: isSelected
            ? "bg-purple-500/10 text-purple-300 border border-purple-500/25"
            : "bg-[#18202f] text-purple-400/70 border border-slate-700/50",
          chipStyle: isSelected
            ? "bg-purple-500/10 text-purple-300 border border-purple-500/20"
            : "bg-[#18202f] text-slate-400 border border-slate-700/50",
        };
      default:
        return {
          accentBorder: "border-l-2 border-l-teal-400",
          cardStyle: "border border-slate-800 bg-[#111622]",
          badgeStyle: "bg-[#18202f] text-slate-400 border border-slate-700/50",
          chipStyle: "bg-[#18202f] text-slate-400 border border-slate-700/50",
        };
    }
  };

  const getCategoryDescription = (key) => {
    switch (key) {
      case "interactive":
        return "Canvas prompts and within-image suggestions.";
      case "instance":
      case "batch-instance":
        return "Batch run across every dataset image.";
      case "cross-image":
        return "Retrieve exemplars from other images.";
      default:
        return "";
    }
  };

  return (
    <aside
      className={`w-full lg:w-72 shrink-0 flex flex-col gap-3 ${className}`}
      aria-label="Orchestration task categories"
    >
      <div className="text-[10px] font-bold text-t3 uppercase tracking-wider px-1">
        Tasks
      </div>

      <nav className="flex flex-col gap-2.5" role="tablist">
        {ORCHESTRATION_CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          const catCoverage = categories[cat.key] || {
            bound: 0,
            possible: 0,
            stale: 0,
          };
          const theme = getCategoryTheme(cat.key, isSelected);
          const description = getCategoryDescription(cat.key) || cat.description;
          const countDisplay = catCoverage.bound > 0 ? catCoverage.bound : "—";

          return (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-current={isSelected ? "true" : undefined}
              onClick={() => onSelectCategory(cat.key)}
              className={`p-3.5 rounded-xl text-left transition-all ${theme.cardStyle} ${theme.accentBorder}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold truncate ${isSelected ? "text-t1" : "text-t2"}`}>
                  {cat.label}
                </span>

                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                    catCoverage.stale > 0
                      ? "border border-amber-500/30 bg-amber-500/10 text-amber-500"
                      : countDisplay === "—"
                      ? "bg-[#18202f] text-slate-400 border border-slate-700/50"
                      : theme.badgeStyle
                  }`}
                  title={`${catCoverage.bound} of ${catCoverage.possible} routes bound`}
                >
                  {countDisplay}
                </span>
              </div>

              <p className="text-[11px] text-t3 leading-snug mt-1">
                {description}
              </p>

              {/* Sub-route chips for aggregated categories (e.g. interactive) */}
              {cat.tasks.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {cat.tasks.map((taskKey) => {
                    const taskMeta = getTaskMeta(taskKey);
                    return (
                      <span
                        key={taskKey}
                        className={`inline-flex items-center text-[10px] font-medium px-2.5 py-0.5 rounded-full ${theme.chipStyle}`}
                      >
                        {taskMeta?.label || taskKey}
                      </span>
                    );
                  })}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Category context helper text in dashed rounded card */}
      <div className="p-3.5 rounded-xl border border-dashed border-slate-800 bg-[#0d121c]/40 text-[11px] text-t3 leading-relaxed">
        {selectedCategory === "interactive"
          ? "Prompted segmentation and within-image suggestion share one route: the same model serves canvas prompts and auto-detected instances in the open image."
          : "Selecting a category configures its independent default and per-label routing policies."}
      </div>
    </aside>
  );
}
