import React from "react";
import {
  Wrench,
  GraduationCap,
  Lightbulb,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  MousePointerClick,
  RefreshCw,
  Hash,
  Boxes,
  Wand2,
  Scan,
  Star,
} from "lucide-react";
import { getTaskMeta, TASK_ORDER } from "../../constants/tasks";
import { filterDisplayableModelTags } from "./modelTags";

import TaskFavoriteChooser from "./TaskFavoriteChooser";

// A model is model-centric now: it can serve several tasks. The header tile is
// keyed by the model's first (primary) task; the capability chips below list
// every task it can do.
const TASK_VISUAL = {
  "prompted-segmentation": { Icon: MousePointerClick, tile: "bg-acS text-ac" },
  "instance-suggestion": { Icon: Wand2, tile: "bg-acS text-ac" },
  "instance-segmentation": { Icon: Boxes, tile: "bg-warnBg text-warn" },
};
const DEFAULT_VISUAL = { Icon: Scan, tile: "bg-acS text-ac" };

// Order a model's tasks by the canonical task order for stable chip layout.
const orderTasks = (tasks) =>
  [...(tasks || [])].sort((a, b) => TASK_ORDER.indexOf(a) - TASK_ORDER.indexOf(b));

const ModelCard = ({
  model,
  isFavorite = false,
  selectedTask = "all",
  favorites = {},
  onToggleFavorite,
  onAction,
}) => {
  const [showChooser, setShowChooser] = React.useState(false);
  const handleAction = (actionType) => onAction?.(model, actionType);

  const tasks = orderTasks(model.tasks);
  const primaryTask = tasks[0];
  const { Icon, tile } = TASK_VISUAL[primaryTask] || DEFAULT_VISUAL;

  const badges = Array.isArray(model.badges) ? model.badges : [];
  const promptTypes = Array.isArray(model.promptTypesSupported) ? model.promptTypesSupported : [];
  const isReady = model.status !== "not_ready";
  const showFinetuning = model.trainable === true;

  // Descriptor chips are metadata that isn't a task or an action. Drop the raw
  // "task"/"tasks" tags (the capability chips already convey them).
  const tags = filterDisplayableModelTags(model.tags).filter((t) => {
    const key = String(t.key || "").toLowerCase();
    return key !== "task" && key !== "tasks" && !key.startsWith("task_");
  });

  const capabilities = [
    model.pretrained && { label: "Pretrained", className: "bg-okBg text-ok" },
    model.refinementSupported && {
      label: "Refinement",
      className: "bg-acS text-ac",
      Icon: RefreshCw,
    },
    showFinetuning && {
      label: "Fine-tune on dataset",
      className: "bg-acS text-ac",
      Icon: GraduationCap,
    },
  ].filter(Boolean);

  const handleStarClick = (e) => {
    e.stopPropagation();
    if (selectedTask !== "all" || tasks.length <= 1) {
      onToggleFavorite?.(model, selectedTask !== "all" ? selectedTask : tasks[0]);
    } else {
      setShowChooser((prev) => !prev);
    }
  };

  return (
    <div className="group flex flex-col bg-p1 rounded-2xl border border-ln shadow-sm hover:shadow-lg hover:border-ln2 hover:-translate-y-0.5 transition-all duration-200">
      {/* Header: icon + name + status + favorite */}
      <div className="flex items-start gap-3 p-5 pb-4">
        <div
          className={`shrink-0 w-11 h-11 rounded-xl ${tile} flex items-center justify-center shadow-sm`}
        >
          <Icon className="w-5 h-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-t1 leading-snug truncate">
              {model.name}
            </h3>
            <div className="flex items-center gap-1.5 shrink-0 relative">
              {model.status && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    isReady ? "bg-okBg text-ok" : "bg-warnBg text-warn"
                  }`}
                  title={isReady ? "Ready to use" : "Needs training before use"}
                >
                  {isReady ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <AlertCircle className="w-3 h-3" />
                  )}
                  {isReady ? "Ready" : "Needs training"}
                </span>
              )}
              <button
                type="button"
                onClick={handleStarClick}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={isFavorite}
                title={
                  isFavorite
                    ? "Favorite — preselected in the annotation page"
                    : "Set as your personal default model"
                }
                className="p-0.5 rounded-md hover:bg-hv transition-colors"
              >
                <Star
                  className={`w-4.5 h-4.5 ${
                    isFavorite
                      ? "fill-amber-400 text-warn"
                      : "text-t3 hover:text-warn"
                  }`}
                  style={{ width: 18, height: 18 }}
                />
              </button>

              {showChooser && (
                <TaskFavoriteChooser
                  model={model}
                  favorites={favorites}
                  onToggleTaskFavorite={(m, t) => {
                    onToggleFavorite?.(m, t);
                  }}
                  onClose={() => setShowChooser(false)}
                  anchorAlign="right"
                />
              )}
            </div>
          </div>
          {model.identifier && (
            <p
              className="text-[11px] text-t3 font-mono truncate mt-0.5"
              title={model.identifier}
            >
              {model.identifier}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col flex-1 px-5 pb-5">
        {/* Capability chips: every task this model can serve with per-task star */}
        {tasks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tasks.map((taskKey) => {
              const meta = getTaskMeta(taskKey);
              const isTaskFav = favorites[taskKey] === model.identifier;
              return (
                <span
                  key={taskKey}
                  className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 rounded-full text-[11px] font-medium ${meta.chip}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  <span>{meta.label}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite?.(model, taskKey);
                    }}
                    aria-label={`Toggle favorite for ${meta.label}`}
                    className="p-0.5 rounded hover:bg-black/10 transition-colors"
                    title={isTaskFav ? `Favorite for ${meta.label}` : `Set as default for ${meta.label}`}
                  >
                    <Star
                      className={`w-3 h-3 ${
                        isTaskFav ? "fill-amber-400 text-warn" : "text-t3 hover:text-warn"
                      }`}
                    />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Highlight badges */}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {badges.map((badge, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-acS text-ac rounded-full text-[11px] font-medium"
              >
                <Sparkles className="w-3 h-3" />
                {badge}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        {model.description && (
          <p className="text-sm text-t2 leading-relaxed line-clamp-3 mb-3">
            {model.description}
          </p>
        )}

        {/* Usage tip */}
        {model.usageTip && (
          <div className="flex items-start gap-2 mb-3 p-2.5 bg-warnBg rounded-lg">
            <Lightbulb className="w-4 h-4 text-warn mt-0.5 shrink-0" />
            <p className="text-xs text-warn leading-relaxed">{model.usageTip}</p>
          </div>
        )}

        {/* Descriptor chips: capabilities, prompts, tags, predicted label */}
        {(capabilities.length > 0 ||
          promptTypes.length > 0 ||
          tags.length > 0 ||
          model.labelId != null) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {capabilities.map((cap, index) => (
              <span
                key={`cap-${index}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cap.className}`}
              >
                {cap.Icon && <cap.Icon className="w-3 h-3" />}
                {cap.label}
              </span>
            ))}
            {promptTypes.map((pt, index) => (
              <span
                key={`pt-${index}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-acS text-ac rounded-full text-[11px] font-medium capitalize"
                title="Supported prompt type"
              >
                <MousePointerClick className="w-3 h-3" />
                {String(pt).replace(/_/g, " ")}
              </span>
            ))}
            {tags.map((tag, index) => (
              <span
                key={`tag-${index}`}
                className="inline-flex items-center px-2 py-0.5 bg-well text-t2 rounded-full text-[11px]"
              >
                {tag.key && <span className="text-t3 mr-1">{tag.key}</span>}
                <span className="font-medium">{tag.value}</span>
              </span>
            ))}
            {model.labelId != null && (
              <span
                className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-well text-t2 rounded-full text-[11px] font-mono"
                title="Predicts this label id"
              >
                <Hash className="w-3 h-3 text-t3" />
                {model.labelId}
              </span>
            )}
          </div>
        )}

        {/* Footer: learn more + actions, pinned to bottom */}
        <div className="mt-auto flex items-center gap-2">
          {model.infoUrl && (
            <a
              href={model.infoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-t3 hover:text-ac transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Learn more
            </a>
          )}

          {showFinetuning && (
            <button
              onClick={() => handleAction("finetuning")}
              className="ml-auto inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-sm font-medium bg-acS text-ac hover:bg-acS transition-colors"
              title="Fine-tune this model on a dataset"
            >
              <Wrench className="w-4 h-4" />
              Fine-tune
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelCard;
