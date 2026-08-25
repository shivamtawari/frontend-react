import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  X,
  Sliders,
  Star,
  AlertTriangle,
  Bookmark,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { getTaskMeta } from "../../../constants/tasks";
import { modelsForTaskAndLabel } from "../ModelOrchestrationPanel";
import {
  getEffectiveContract,
  getDefaultConditioning,
  getDefaultParameters,
} from "../plannerContractUtils";
import DynamicHyperParameter, { coerceValue } from "../../datasets/training/DynamicHyperParameter";
import {
  ORCHESTRATION_CATEGORIES,
  resolveEffectiveRoute,
  ROUTE_STATUS,
} from "./orchestrationViewModel";

/**
 * ConfigureRouteModal component
 *
 * Polished modal matching the target design for model routing selection,
 * prompt conditioning, and hyperparameters.
 * Strictly adheres to model-declared input contracts (no invented parameters or undeclared conditioning).
 */
export default function ConfigureRouteModal({
  isOpen,
  onClose,
  target,
  labelsById = {},
  catalog = { models: [], retrieval_strategies: [] },
  draftBindings = [],
  onSaveRoute,
  onUnbindRoute,
  canEdit = true,
}) {
  const modalRef = useRef(null);
  const triggerElementRef = useRef(null);

  const task = target?.task;
  const labelId = target?.labelId ?? null;
  const isDefault = labelId == null;
  const label = !isDefault ? labelsById[labelId] || labelsById[String(labelId)] : null;
  const taskMeta = task ? getTaskMeta(task) : null;

  // Resolve parent label name if label has parent_id
  const parentName = useMemo(() => {
    if (!label) return null;
    if (label.parentName) return label.parentName;
    if (label.parent_id != null && labelsById[label.parent_id]) {
      return labelsById[label.parent_id].name;
    }
    return null;
  }, [label, labelsById]);

  const models = catalog?.models || [];
  const strategies = catalog?.retrieval_strategies || [];

  // Find visual category for breadcrumb
  const category = useMemo(() => {
    if (!task) return null;
    return (
      ORCHESTRATION_CATEGORIES.find((c) => c.tasks.includes(task)) ||
      ORCHESTRATION_CATEGORIES[0]
    );
  }, [task]);

  // Find existing draft binding for this (task, labelId)
  const existingBinding = useMemo(() => {
    if (!task) return null;
    return (
      draftBindings.find(
        (b) =>
          b.task === task &&
          (labelId == null ? b.label_id == null : Number(b.label_id) === Number(labelId))
      ) || null
    );
  }, [draftBindings, task, labelId]);

  // Resolve effective route context (e.g. task default fallback)
  const effectiveRouteContext = useMemo(() => {
    if (!task) return null;
    return resolveEffectiveRoute({
      task,
      labelId,
      bindings: draftBindings,
      catalog,
    });
  }, [task, labelId, draftBindings, catalog]);

  // Compatible models for this task and label
  const compatibleModels = useMemo(() => {
    if (!task) return [];
    return modelsForTaskAndLabel(models, task, labelId);
  }, [models, task, labelId]);

  // Local route edit buffer state
  const [selectedModelKey, setSelectedModelKey] = useState(null);
  const [inputs, setInputs] = useState({ conditioning: {}, parameters: {} });
  const [showModelSwitchConfirm, setShowModelSwitchConfirm] = useState(false);
  const [pendingModelKey, setPendingModelKey] = useState(null);

  // Initialize buffer when modal opens or target changes
  useEffect(() => {
    if (!isOpen || !target) return;

    triggerElementRef.current = document.activeElement;

    if (existingBinding && existingBinding.model_registry_key) {
      setSelectedModelKey(existingBinding.model_registry_key);
      const existingInputs = existingBinding.inputs || {};
      const model =
        models.find((m) => m.task === task && m.registry_key === existingBinding.model_registry_key) ||
        models.find((m) => m.registry_key === existingBinding.model_registry_key);
      const effectiveContract = model ? getEffectiveContract(model) : null;
      const defaultCond = getDefaultConditioning(effectiveContract, strategies, label);
      const defaultParams = getDefaultParameters(effectiveContract);

      setInputs({
        conditioning: {
          ...defaultCond,
          ...(existingInputs.conditioning || {}),
        },
        parameters: {
          ...defaultParams,
          ...(existingInputs.parameters || {}),
        },
      });
    } else {
      setSelectedModelKey(null);
      setInputs({ conditioning: {}, parameters: {} });
    }

    setShowModelSwitchConfirm(false);
    setPendingModelKey(null);
  }, [isOpen, target, existingBinding, models, strategies, label, task]);

  // Focus trap & Escape listener
  useEffect(() => {
    if (!isOpen) return;

    const focusTimer = setTimeout(() => {
      if (modalRef.current) {
        const firstFocusable = modalRef.current.querySelector(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable && typeof firstFocusable.focus === "function") {
          firstFocusable.focus();
        }
      }
    }, 50);

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        if (!modalRef.current) return;
        const focusableElements = modalRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      if (triggerElementRef.current && typeof triggerElementRef.current.focus === "function") {
        triggerElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  const selectedModel = models.find(
    (m) => m.task === task && m.registry_key === selectedModelKey
  );
  const isSelectedModelCompatible = compatibleModels.some(
    (m) => m.registry_key === selectedModelKey
  );
  const isStaleSelected = Boolean(selectedModelKey && !selectedModel);
  const isIncompatibleSelected = Boolean(selectedModelKey && selectedModel && !isSelectedModelCompatible);

  const contract = selectedModel ? getEffectiveContract(selectedModel) : null;
  const condSpec = contract?.conditioning;

  // Use model-declared parameters strictly (never invent parameters)
  const parameters = useMemo(() => {
    return contract?.parameters || [];
  }, [contract]);

  const isDirectExemplarTask =
    task === "within-image-suggestion" ||
    task === "instance-suggestion" ||
    task === "prompted-segmentation";
  const requiresStrategy = Boolean(
    !isDirectExemplarTask &&
    condSpec &&
    ["reference_images", "instances", "embeddings"].includes(condSpec.kind)
  );
  const availableStrategies = strategies.filter((s) => s.available);
  const hasAvailableStrategy = availableStrategies.length > 0;
  const isMissingRequiredStrategy = requiresStrategy && !hasAvailableStrategy;

  const minUnits = condSpec?.min_units ?? 1;
  const maxUnits = condSpec?.max_units ?? null;

  // Bound presets strictly to contract bounds, preserving unbounded contracts (maxUnits: null)
  const validPresets = useMemo(() => {
    if (!condSpec?.user_selectable_count) return [];
    const standardPresets = [5, 10, 20];
    const filtered = standardPresets.filter(
      (p) => p >= minUnits && (maxUnits === null || p <= maxUnits)
    );
    if (filtered.length > 0) return filtered;
    if (maxUnits !== null && minUnits === maxUnits) return [minUnits];
    if (maxUnits !== null) {
      const mid = Math.floor((minUnits + maxUnits) / 2);
      return Array.from(new Set([minUnits, mid, maxUnits])).sort((a, b) => a - b);
    }
    return [minUnits, minUnits + 5, minUnits + 15];
  }, [condSpec, minUnits, maxUnits]);

  const hasCustomInputs = useMemo(() => {
    if (!selectedModel) return false;
    const currentContract = getEffectiveContract(selectedModel);
    const defaultCond = getDefaultConditioning(currentContract, strategies, label);
    const defaultParams = getDefaultParameters(currentContract);

    const currentCond = inputs.conditioning || {};
    const condKeys = new Set([...Object.keys(currentCond), ...Object.keys(defaultCond)]);
    for (const k of condKeys) {
      if (currentCond[k] !== defaultCond[k]) return true;
    }

    const currentParams = inputs.parameters || {};
    const paramKeys = new Set([...Object.keys(currentParams), ...Object.keys(defaultParams)]);
    for (const k of paramKeys) {
      if (currentParams[k] !== defaultParams[k]) return true;
    }

    return false;
  }, [selectedModel, inputs, strategies, label]);

  const applyModelSelection = (newModelKey) => {
    const targetModel = models.find((m) => m.task === task && m.registry_key === newModelKey);
    if (!targetModel) {
      setSelectedModelKey(null);
      setInputs({ conditioning: {}, parameters: {} });
      return;
    }

    const effectiveContract = getEffectiveContract(targetModel);
    const defaultCond = getDefaultConditioning(effectiveContract, strategies, label);
    const defaultParams = getDefaultParameters(effectiveContract);

    setSelectedModelKey(targetModel.registry_key);
    setInputs({
      conditioning: defaultCond,
      parameters: defaultParams,
    });
    setShowModelSwitchConfirm(false);
    setPendingModelKey(null);
  };

  const handleSelectModel = (modelKey) => {
    if (!canEdit || modelKey === selectedModelKey) return;

    if (selectedModelKey && hasCustomInputs) {
      setPendingModelKey(modelKey);
      setShowModelSwitchConfirm(true);
    } else {
      applyModelSelection(modelKey);
    }
  };

  const handleParamChange = (key, val) => {
    if (!canEdit) return;
    setInputs((prev) => ({
      ...prev,
      parameters: {
        ...(prev.parameters || {}),
        [key]: val,
      },
    }));
  };

  const handleCondChange = (key, val) => {
    if (!canEdit) return;
    setInputs((prev) => ({
      ...prev,
      conditioning: {
        ...(prev.conditioning || {}),
        [key]: val,
      },
    }));
  };

  const handleSaveRoute = () => {
    if (
      !canEdit ||
      !selectedModelKey ||
      !isSelectedModelCompatible ||
      isMissingRequiredStrategy
    ) {
      return;
    }

    // Gate conditioning strictly by model contract
    const validatedConditioning = {};

    if (condSpec?.kind === "concept_text") {
      const text = inputs.conditioning?.concept_text;
      validatedConditioning.concept_text =
        text !== undefined && text !== null && text !== ""
          ? text
          : label?.name || "";
    }

    if (condSpec?.user_selectable_count) {
      const rawCount = Number(inputs.conditioning?.count);
      let clampedCount = Number.isFinite(rawCount)
        ? Math.max(minUnits, rawCount)
        : condSpec?.default_count ?? minUnits;
      if (maxUnits !== null && Number.isFinite(maxUnits)) {
        clampedCount = Math.min(maxUnits, clampedCount);
      }
      validatedConditioning.count = clampedCount;
    }

    if (requiresStrategy && hasAvailableStrategy) {
      const strategy = inputs.conditioning?.strategy;
      const isCurrentAvailable = availableStrategies.some((s) => s.key === strategy);
      validatedConditioning.strategy = isCurrentAvailable
        ? strategy
        : availableStrategies[0].key;
    }

    // Validate only declared parameters
    const validatedParameters = {};
    parameters.forEach((p) => {
      const raw =
        inputs.parameters?.[p.key] !== undefined
          ? inputs.parameters[p.key]
          : p.default_value;
      let coerced = coerceValue(raw, p.type);
      if (p.type === "int" || p.type === "float") {
        if (typeof coerced !== "number" || !Number.isFinite(coerced)) {
          coerced =
            typeof p.default_value === "number" && Number.isFinite(p.default_value)
              ? p.default_value
              : (p.min_value ?? 0);
        }
        if (p.min_value !== null && p.min_value !== undefined && coerced < p.min_value) {
          coerced = p.min_value;
        }
        if (p.max_value !== null && p.max_value !== undefined && coerced > p.max_value) {
          coerced = p.max_value;
        }
      }
      validatedParameters[p.key] = coerced;
    });

    const hasConditioning = Object.keys(validatedConditioning).length > 0;
    const hasParams = Object.keys(validatedParameters).length > 0;

    const newBinding = {
      task,
      label_id: labelId,
      model_registry_key: selectedModelKey,
      inputs:
        hasConditioning || hasParams
          ? {
              ...(hasConditioning ? { conditioning: validatedConditioning } : {}),
              ...(hasParams ? { parameters: validatedParameters } : {}),
            }
          : null,
    };

    onSaveRoute(task, labelId, newBinding);
  };

  const handleUnbind = () => {
    if (!canEdit) return;
    onUnbindRoute(task, labelId);
    if (onClose) onClose();
  };

  if (!isOpen || !target) return null;

  const targetLabelTitle = isDefault ? "Task Default" : label?.name || `Label #${labelId}`;
  const activeModelDisplayName = selectedModel?.name || selectedModelKey;

  const hasConditioningControls = Boolean(
    condSpec?.kind === "concept_text" ||
    condSpec?.user_selectable_count ||
    (requiresStrategy && strategies.length > 0)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="configure-route-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-2xl bg-p1 border border-ln rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150 outline-none"
      >
        {/* Modal Header */}
        <header className="px-6 py-4 border-b border-ln bg-p1 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 shrink-0">
              <Sliders size={18} />
            </div>

            <div className="min-w-0 flex-1">
              <h2
                id="configure-route-dialog-title"
                className="text-base font-semibold text-t1 leading-none"
              >
                Configure route
              </h2>

              {/* Target breadcrumb flow */}
              <div className="flex items-center gap-2 text-xs text-t3 mt-1.5 flex-wrap">
                {category && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium text-teal-400 bg-teal-500/10 border border-teal-500/30">
                    {category.label}
                  </span>
                )}
                <ArrowRight size={12} className="text-t3/50" />
                <span className="text-t2 font-medium">
                  {targetLabelTitle}
                  {parentName && (
                    <span className="text-t3 font-normal ml-1">(child of {parentName})</span>
                  )}
                </span>
                {activeModelDisplayName && (
                  <>
                    <ArrowRight size={12} className="text-t3/50" />
                    <span className="text-t1 font-bold truncate">
                      {activeModelDisplayName}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl border border-ln bg-well text-t2 hover:text-t1 hover:bg-hv transition shrink-0 ml-3"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </header>

        {/* Scrollable Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 min-h-0">
          {/* Model switch confirmation prompt */}
          {showModelSwitchConfirm && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle size={15} className="shrink-0" />
                <span>Switch Model and Reset Parameters?</span>
              </div>
              <p className="text-amber-700/90 dark:text-amber-300/90 text-[11px] leading-relaxed">
                Changing the model will discard current input parameters and initialize the new model's declared defaults.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => applyModelSelection(pendingModelKey)}
                  className="px-3 py-1 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition"
                >
                  Yes, switch model
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModelSwitchConfirm(false);
                    setPendingModelKey(null);
                  }}
                  className="px-3 py-1 bg-well border border-ln rounded-lg text-t2 hover:text-t1 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Stale / Incompatible Model Warning Row */}
          {(isStaleSelected || isIncompatibleSelected) && (
            <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-800 dark:text-amber-300 font-mono">
                  {selectedModel?.name || selectedModelKey || "Unknown Model"}
                </div>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                  {isIncompatibleSelected ? (
                    <>
                      <span className="font-semibold block">Currently bound model is incompatible</span>
                      <span>Select a compatible model below to resolve.</span>
                    </>
                  ) : (
                    <span>
                      This model is no longer available in the active catalog. Select one of the compatible options below to repair this route.
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Compatible Models List */}
          {compatibleModels.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-ln bg-well/40 text-center text-xs text-t3">
              No compatible models available in the catalog for this task and label.
            </div>
          ) : (
            <div className="space-y-2" role="radiogroup" aria-label="Select model">
              {compatibleModels.map((model) => {
                const isSelected = selectedModelKey === model.registry_key;
                const badges = Array.isArray(model.badges) ? model.badges : [];
                const sizeLabel = model.size_mb ? `${model.size_mb} MB` : model.architecture || "";

                return (
                  <button
                    key={model.registry_key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleSelectModel(model.registry_key)}
                    disabled={!canEdit}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all relative ${
                      isSelected
                        ? "border-teal-500/80 bg-teal-500/5 shadow-xs ring-1 ring-teal-500/30"
                        : "border-ln bg-well/30 hover:bg-well/60 hover:border-ln2"
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Custom radio button */}
                        <div
                          className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-colors ${
                            isSelected
                              ? "border-teal-400"
                              : "border-t3/40 bg-transparent"
                          }`}
                        >
                          {isSelected && <span className="w-2 h-2 rounded-full bg-teal-400" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-t1 text-sm">
                              {model.name || model.registry_key}
                            </span>
                            {model.trained_on_dataset && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                <Star size={10} className="fill-amber-500" />
                                <span>Fine-tuned</span>
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-t3 mt-0.5 line-clamp-1">
                            {model.trained_on_dataset
                              ? `Fine-tuned on this dataset${model.description ? ` · ${model.description}` : ""}`
                              : model.description || model.usage_tip || "Class-agnostic model"}
                          </p>
                        </div>
                      </div>

                      {/* Right-aligned badges and size */}
                      <div className="shrink-0 flex items-center gap-2">
                        {badges.map((badge, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md bg-well text-t2 text-[11px] font-medium border border-ln/60"
                          >
                            {badge.toLowerCase()}
                          </span>
                        ))}
                        {sizeLabel && (
                          <span className="text-xs text-t3 font-medium">
                            {sizeLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Missing Required Strategy Warning */}
          {isMissingRequiredStrategy && (
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
              This model requires exemplar retrieval conditioning, but no active retrieval strategies are currently available in the catalog.
            </div>
          )}

          {/* Conditioning Section — Strictly gated by model contract */}
          {selectedModel && isSelectedModelCompatible && hasConditioningControls && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-t3">
                Conditioning
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Concept Text (Only if kind === "concept_text") */}
                {condSpec?.kind === "concept_text" && (
                  <div className="flex flex-col">
                    <label
                      htmlFor="route-prompt-concept-input"
                      className="text-xs font-semibold text-t1 mb-1"
                    >
                      Prompt concept
                    </label>
                    <input
                      id="route-prompt-concept-input"
                      type="text"
                      value={inputs.conditioning?.concept_text ?? (label?.name || "")}
                      onChange={(e) => handleCondChange("concept_text", e.target.value)}
                      disabled={!canEdit}
                      placeholder={label?.name || "coral fragment"}
                      className="text-xs px-3 py-2 rounded-lg border border-ln bg-well text-t1 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition"
                    />
                    <span className="text-[11px] text-t3 mt-1">
                      Defaults to the label name.
                    </span>
                  </div>
                )}

                {/* Selectable Instances / Images Count (Only if user_selectable_count is true) */}
                {condSpec?.user_selectable_count && (
                  <div className="flex flex-col">
                    <label
                      htmlFor="route-exemplar-count-input"
                      className="text-xs font-semibold text-t1 mb-1"
                    >
                      {condSpec.unit === "image"
                        ? "Images count"
                        : condSpec.unit === "instance"
                        ? "Instances count"
                        : "Exemplars count"}
                    </label>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 flex-1">
                        {validPresets.map((preset) => {
                          const currentCount = Number(inputs.conditioning?.count ?? condSpec.default_count ?? minUnits);
                          const isPresetSelected = currentCount === preset;

                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => handleCondChange("count", preset)}
                              disabled={!canEdit}
                              className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg border transition-all text-center ${
                                isPresetSelected
                                  ? "bg-teal-500/20 text-teal-300 border-teal-500/60 shadow-2xs"
                                  : "bg-well text-t2 border-ln hover:bg-hv"
                              }`}
                            >
                              {preset}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        id="route-exemplar-count-input"
                        aria-label={
                          condSpec.unit === "image"
                            ? "Images count"
                            : condSpec.unit === "instance"
                            ? "Instances count"
                            : "Exemplars count"
                        }
                        type="number"
                        min={minUnits}
                        max={maxUnits !== null ? maxUnits : undefined}
                        value={inputs.conditioning?.count ?? condSpec.default_count ?? minUnits}
                        onChange={(e) => handleCondChange("count", Number(e.target.value))}
                        disabled={!canEdit}
                        className="w-16 text-xs px-2 py-1.5 rounded-lg border border-ln bg-well text-t1 font-mono text-center focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition"
                      />
                    </div>
                    <span className="text-[11px] text-t3 mt-1">
                      {maxUnits !== null
                        ? `Contract allows ${minUnits}–${maxUnits}.`
                        : `Contract allows min. ${minUnits}.`}
                    </span>
                  </div>
                )}

                {/* Retrieval Strategy Selector (Only if requiresStrategy) */}
                {requiresStrategy && strategies.length > 0 && (
                  <div className="flex flex-col sm:col-span-2">
                    <label
                      htmlFor="route-retrieval-strategy-select"
                      className="text-xs font-semibold text-t1 mb-1"
                    >
                      Retrieval Strategy
                    </label>
                    <select
                      id="route-retrieval-strategy-select"
                      value={inputs.conditioning?.strategy || strategies[0]?.key}
                      onChange={(e) => handleCondChange("strategy", e.target.value)}
                      disabled={!canEdit || isMissingRequiredStrategy}
                      className="text-xs px-3 py-2 rounded-lg border border-ln bg-well text-t1 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition disabled:opacity-50"
                    >
                      {strategies.map((strat) => (
                        <option
                          key={strat.key}
                          value={strat.key}
                          disabled={!strat.available}
                        >
                          {strat.label || strat.key}
                          {!strat.available ? ` (${strat.unavailable_reason || "Unavailable"})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Parameters Section — Strictly declared parameters only */}
          {selectedModel && isSelectedModelCompatible && parameters.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-t3">
                Parameters
              </h3>

              <div className="space-y-3">
                {parameters.map((param) => {
                  const currentVal = inputs.parameters?.[param.key] ?? param.default_value;

                  return (
                    <div
                      key={param.key}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-well/30 border border-ln/50"
                    >
                      <div className="sm:w-56 shrink-0">
                        <label
                          htmlFor={`route-param-${param.key}`}
                          className="text-xs font-semibold text-t1 block"
                        >
                          {param.label || param.key}
                        </label>
                        {param.description && (
                          <span className="text-[11px] text-t3 block leading-tight mt-0.5">
                            {param.description}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <DynamicHyperParameter
                          param={param}
                          idPrefix="route"
                          value={currentVal}
                          onChange={handleParamChange}
                          disabled={!canEdit}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Informational note when model declares NO conditioning and NO parameters */}
          {selectedModel &&
            isSelectedModelCompatible &&
            !hasConditioningControls &&
            parameters.length === 0 &&
            !requiresStrategy &&
            !isMissingRequiredStrategy && (
              <div className="p-3.5 rounded-xl border border-ln/60 bg-well/20 text-xs text-t3 text-center">
                This model operates with its default runtime parameters and requires no additional input configuration.
              </div>
            )}

          {/* Context helper text for unselected state */}
          {!existingBinding && effectiveRouteContext?.status === ROUTE_STATUS.INHERITED && (
            <div className="text-[11px] text-t3 italic">
              Currently inherits task default ({effectiveRouteContext.model?.name || "fallback"}).
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <footer className="px-6 py-3.5 border-t border-ln bg-p1 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-t3">
              Saved to the dataset routing policy, not to the model.
            </span>
            {existingBinding && canEdit && (
              <button
                type="button"
                onClick={handleUnbind}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-400 transition"
              >
                <Trash2 size={12} />
                <span>Unbind Route</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium border border-ln rounded-lg text-t1 bg-well hover:bg-hv transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveRoute}
              disabled={
                !canEdit ||
                !selectedModelKey ||
                !isSelectedModelCompatible ||
                isMissingRequiredStrategy
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-lg transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Bookmark size={13} className="fill-slate-950/20" />
              <span>Save route</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
