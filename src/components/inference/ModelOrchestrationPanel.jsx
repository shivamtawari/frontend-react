import React, { useState, useEffect, useMemo } from "react";
import {
    Cpu,
    Sparkles,
    Star,
    Layers,
    Save,
    RotateCcw,
    Trash2,
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ArrowRight,
    Info,
} from "lucide-react";
import {
    TASK_ORDER,
    TASKS,
    getTaskMeta,
    BATCH_INFERENCE_TASKS,
} from "../../constants/tasks";
import DynamicHyperParameter from "../datasets/training/DynamicHyperParameter";
import {
    getEffectiveContract,
    getDefaultConditioning,
    getDefaultParameters,
} from "./plannerContractUtils";
import { groupLabelsByLevel } from "./LabelModelPlanner";

const NONE_VALUE = "__NONE__";

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
 * Format model display name with badges.
 */
function ModelOptionLabel({ model }) {
    return (
        <span>
            {model.name || model.registry_key}
            {model.trained_on_dataset && " ★"}
            {model.provenance === "declared" && " (Declared)"}
        </span>
    );
}

/**
 * Single binding editor row (for either a task default or a label override).
 */
function BindingRow({
    task,
    label = null, // null for task default, or label object
    binding,
    models,
    strategies,
    onChange,
    disabled = false,
}) {
    const taskModels = useMemo(
        () => modelsForTaskAndLabel(models, task, label?.id ?? null),
        [models, task, label]
    );

    const selectedModelKey = binding?.model_registry_key || NONE_VALUE;
    const selectedModel = models.find(
        (m) => m.task === task && m.registry_key === binding?.model_registry_key
    );

    const isStale = Boolean(
        binding?.model_registry_key && !selectedModel
    );

    const contract = selectedModel ? getEffectiveContract(selectedModel) : null;
    const condSpec = contract?.conditioning;
    const parameters = contract?.parameters || [];

    const handleModelChange = (e) => {
        const value = e.target.value;
        if (value === NONE_VALUE) {
            onChange(null);
            return;
        }
        const model = models.find((m) => m.task === task && m.registry_key === value);
        if (!model) {
            onChange(null);
            return;
        }

        const effectiveContract = getEffectiveContract(model);
        const defaultCond = getDefaultConditioning(effectiveContract, strategies, label);
        const defaultParams = getDefaultParameters(effectiveContract);

        onChange({
            task,
            label_id: label?.id ?? null,
            model_registry_key: model.registry_key,
            inputs: {
                conditioning: defaultCond,
                parameters: defaultParams,
            },
        });
    };

    const handleParamChange = (key, val) => {
        if (!binding) return;
        const currentInputs = binding.inputs || { conditioning: {}, parameters: {} };
        const currentParams = currentInputs.parameters || {};
        onChange({
            ...binding,
            inputs: {
                ...currentInputs,
                parameters: {
                    ...currentParams,
                    [key]: val,
                },
            },
        });
    };

    const handleCondChange = (key, val) => {
        if (!binding) return;
        const currentInputs = binding.inputs || { conditioning: {}, parameters: {} };
        const currentCond = currentInputs.conditioning || {};
        onChange({
            ...binding,
            inputs: {
                ...currentInputs,
                conditioning: {
                    ...currentCond,
                    [key]: val,
                },
            },
        });
    };

    const countUnitLabel =
        condSpec?.unit === "image"
            ? "Images"
            : condSpec?.unit === "instance"
            ? "Instances"
            : condSpec?.unit === "vector"
            ? "Vectors"
            : "Count";

    return (
        <div
            className={`border rounded-xl p-3 transition-colors ${
                isStale
                    ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20"
                    : binding
                    ? "border-ln bg-p1"
                    : "border-dashed border-ln bg-well"
            }`}
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1 flex items-center gap-2">
                    {label ? (
                        <div className="flex items-center gap-1.5 font-medium text-sm text-t1">
                            <span className="w-2.5 h-2.5 rounded-full bg-ac" />
                            <span>{label.name}</span>
                            {label.parentName && (
                                <span className="text-xs text-t3 font-normal">
                                    (child of {label.parentName})
                                </span>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 font-medium text-sm text-t1">
                            <Star size={14} className="text-amber-500 fill-amber-500" />
                            <span>Task Default Model</span>
                            <span className="text-xs text-t3 font-normal">
                                (used when no label override is specified)
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={selectedModelKey}
                        onChange={handleModelChange}
                        disabled={disabled}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border bg-bg text-t1 font-medium focus:outline-none focus:ring-1 focus:ring-ac transition ${
                            isStale ? "border-amber-400 text-amber-700 dark:text-amber-300" : "border-ln"
                        }`}
                        aria-label={label ? `Model for ${label.name} (${task})` : `Default model for ${task}`}
                    >
                        <option value={NONE_VALUE}>
                            {label ? "(Inherit task default / None)" : "(No task default)"}
                        </option>
                        {isStale && (
                            <option value={binding.model_registry_key} disabled>
                                ⚠ {binding.model_registry_key} (Unavailable)
                            </option>
                        )}
                        {taskModels.map((m) => (
                            <option key={m.registry_key} value={m.registry_key}>
                                {m.name || m.registry_key}
                                {m.trained_on_dataset ? " ★" : ""}
                                {!label && m.label_ids && m.label_ids.length > 0 ? " (Class-specific)" : ""}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {!label && selectedModel?.label_ids && selectedModel.label_ids.length > 0 && (
                <div className="mt-2 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1.5 bg-blue-50/60 dark:bg-blue-950/20 p-2 rounded-lg">
                    <Info size={13} className="shrink-0" />
                    <span>
                        This default model predicts specific classes ({selectedModel.label_ids.length} class{selectedModel.label_ids.length > 1 ? "es" : ""}). It will only apply as a default to those classes.
                    </span>
                </div>
            )}

            {isStale && (
                <div className="mt-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle size={13} className="shrink-0" />
                    <span>
                        The previously saved model <code>{binding.model_registry_key}</code> is currently unavailable or unregistered. Select an active model or clear this binding to repair.
                    </span>
                </div>
            )}

            {/* Model contract inputs (parameters & conditioning) */}
            {selectedModel && (parameters.length > 0 || condSpec?.kind === "concept_text" || condSpec?.user_selectable_count) && (
                <div className="mt-3 pt-2.5 border-t border-ln grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {/* Conditioning: concept text */}
                    {condSpec?.kind === "concept_text" && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-medium text-t2">
                                Prompt Concept
                            </label>
                            <input
                                type="text"
                                value={binding?.inputs?.conditioning?.concept_text || ""}
                                onChange={(e) => handleCondChange("concept_text", e.target.value)}
                                disabled={disabled}
                                placeholder={label?.name || "e.g. object"}
                                className="text-xs px-2 py-1 rounded border border-ln bg-bg text-t1 focus:ring-1 focus:ring-ac"
                            />
                        </div>
                    )}

                    {/* Conditioning: Exemplar count */}
                    {condSpec?.user_selectable_count && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-medium text-t2">
                                {countUnitLabel} count
                            </label>
                            <input
                                type="number"
                                min={condSpec.min_units || 1}
                                max={condSpec.max_units || 32}
                                value={binding?.inputs?.conditioning?.count ?? condSpec.default_count ?? 5}
                                onChange={(e) => handleCondChange("count", Number(e.target.value))}
                                disabled={disabled}
                                className="text-xs px-2 py-1 rounded border border-ln bg-bg text-t1 w-24 focus:ring-1 focus:ring-ac"
                            />
                        </div>
                    )}

                    {/* Hyperparameters */}
                    {parameters.map((param) => (
                        <div key={param.key} className="flex flex-col gap-1">
                            <label className="text-[11px] font-medium text-t2">
                                {param.label || param.key}
                            </label>
                            <DynamicHyperParameter
                                param={param}
                                value={binding?.inputs?.parameters?.[param.key] ?? param.default_value}
                                onChange={(val) => handleParamChange(param.key, val)}
                                disabled={disabled}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Task section containing the task default and hierarchy label overrides.
 */
function TaskSection({
    task,
    policyBindings,
    labelsById,
    models,
    strategies,
    onUpdateBinding,
    disabled = false,
}) {
    const meta = getTaskMeta(task);
    const [isExpanded, setIsExpanded] = useState(false);

    const levels = useMemo(() => groupLabelsByLevel(labelsById), [labelsById]);

    const defaultBinding = useMemo(
        () => policyBindings.find((b) => b.task === task && (b.label_id == null || b.label_id === undefined)),
        [policyBindings, task]
    );

    const overridesByLabelId = useMemo(() => {
        const map = new Map();
        policyBindings.forEach((b) => {
            if (b.task === task && b.label_id != null) {
                map.set(Number(b.label_id), b);
            }
        });
        return map;
    }, [policyBindings, task]);

    const activeCount = (defaultBinding ? 1 : 0) + overridesByLabelId.size;

    return (
        <div className="border border-ln rounded-2xl bg-p1 overflow-hidden shadow-xs">
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 bg-p1 hover:bg-hv transition-colors text-left"
                aria-expanded={isExpanded}
            >
                <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${meta.chip}`}>
                        {meta.label}
                    </span>
                    <span className="text-xs text-t3 hidden sm:inline">
                        {meta.description}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-t2 font-medium bg-well px-2 py-0.5 rounded-md">
                        {activeCount === 0 ? "Not configured" : `${activeCount} route${activeCount > 1 ? "s" : ""}`}
                    </span>
                    {isExpanded ? <ChevronDown size={16} className="text-t3" /> : <ChevronRight size={16} className="text-t3" />}
                </div>
            </button>

            {isExpanded && (
                <div className="p-4 space-y-4 border-t border-ln">
                    {/* 1. Task Default Row */}
                    <div>
                        <div className="text-xs font-semibold text-t2 uppercase tracking-wide mb-2">
                            Default Routing
                        </div>
                        <BindingRow
                            task={task}
                            label={null}
                            binding={defaultBinding}
                            models={models}
                            strategies={strategies}
                            onChange={(newBinding) => onUpdateBinding(task, null, newBinding)}
                            disabled={disabled}
                        />
                    </div>

                    {/* 2. Hierarchy Label Overrides */}
                    {levels.length > 0 && (
                        <div className="space-y-3 pt-2">
                            <div className="text-xs font-semibold text-t2 uppercase tracking-wide">
                                Label Overrides
                            </div>
                            {levels.map(({ level, labels }) => (
                                <div key={level} className="space-y-2">
                                    <div className="text-[11px] font-medium text-t3 flex items-center gap-1.5">
                                        <Layers size={12} />
                                        <span>Level {level + 1}</span>
                                    </div>
                                    <div className="space-y-2 pl-2">
                                        {labels.map((label) => (
                                            <BindingRow
                                                key={label.id}
                                                task={task}
                                                label={label}
                                                binding={overridesByLabelId.get(label.id)}
                                                models={models}
                                                strategies={strategies}
                                                onChange={(newBinding) => onUpdateBinding(task, label.id, newBinding)}
                                                disabled={disabled}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Complete Dataset Model Orchestration Policy Editor.
 */
export default function ModelOrchestrationPanel({
    datasetId,
    policy,
    labelsById,
    catalog,
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
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    // Sync draft bindings when policy changes (e.g. initial load or dataset switch)
    useEffect(() => {
        const initial = policy?.bindings ? JSON.parse(JSON.stringify(policy.bindings)) : [];
        setDraftBindings(initial);
        setHasUnsavedChanges(false);
    }, [policy, datasetId]);

    const handleUpdateBinding = (task, labelId, newBinding) => {
        setDraftBindings((prev) => {
            // Remove existing binding for (task, labelId)
            const filtered = prev.filter(
                (b) => !(b.task === task && (labelId == null ? b.label_id == null : Number(b.label_id) === Number(labelId)))
            );
            if (newBinding) {
                filtered.push(newBinding);
            }
            return filtered;
        });
        setHasUnsavedChanges(true);
        setStatusMessage(null);
    };

    const handleSave = async () => {
        if (!canEdit || isSaving) return;
        setStatusMessage(null);
        try {
            await onSavePolicy(draftBindings);
            setHasUnsavedChanges(false);
            setStatusMessage({ type: "success", text: "Routing policy saved successfully." });
        } catch (err) {
            setStatusMessage({ type: "error", text: err.message || "Failed to save routing policy." });
        }
    };

    const handleReset = () => {
        const initial = policy?.bindings ? JSON.parse(JSON.stringify(policy.bindings)) : [];
        setDraftBindings(initial);
        setHasUnsavedChanges(false);
        setStatusMessage(null);
    };

    const handleClearAll = async () => {
        if (!canEdit || isDeleting) return;
        if (!window.confirm("Are you sure you want to clear all model routing bindings for this dataset?")) {
            return;
        }
        try {
            await onDeletePolicy();
            setDraftBindings([]);
            setHasUnsavedChanges(false);
            setStatusMessage({ type: "success", text: "Routing policy cleared." });
        } catch (err) {
            setStatusMessage({ type: "error", text: err.message || "Failed to clear routing policy." });
        }
    };

    // Calculate batch-supported bindings available for pre-filling batch planner
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
        <div className="space-y-6">
            {/* Header & Description */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-t1 flex items-center gap-2">
                        <Cpu size={20} className="text-ac" />
                        Dataset Model Routing
                    </h2>
                    <p className="text-xs text-t3 mt-1 max-w-2xl">
                        Define which AI model annotates each task and label in this dataset. Settings configured here serve as the canonical defaults for interactive canvas tools and full-dataset batch runs.
                    </p>
                </div>

                {policy?.updated_at && (
                    <div className="text-[11px] text-t3 text-right">
                        <span>Last updated by <strong className="text-t2">{policy.updated_by || "system"}</strong></span>
                        <br />
                        <span>{new Date(policy.updated_at).toLocaleString()}</span>
                    </div>
                )}
            </div>

            {/* Status alert */}
            {statusMessage && (
                <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                        statusMessage.type === "success"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
                            : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800"
                    }`}
                >
                    {statusMessage.type === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    <span>{statusMessage.text}</span>
                </div>
            )}

            {/* Canonical Task Sections */}
            <div className="space-y-4">
                {TASK_ORDER.map((task) => (
                    <TaskSection
                        key={task}
                        task={task}
                        policyBindings={draftBindings}
                        labelsById={labelsById}
                        models={models}
                        strategies={strategies}
                        onUpdateBinding={handleUpdateBinding}
                        disabled={!canEdit || isSaving || isDeleting}
                    />
                ))}
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-ln">
                <div className="flex items-center gap-2">
                    {onApplyToBatch && batchEligibleCount > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => onApplyToBatch(draftBindings, null)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ac bg-acS hover:bg-acS/80 rounded-xl transition"
                            >
                                <ArrowRight size={13} />
                                <span>Apply All Routes ({batchEligibleCount})</span>
                            </button>
                            {hasInstanceRoutes && hasCrossImageRoutes && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => onApplyToBatch(draftBindings, "instance-segmentation")}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-t2 bg-well hover:bg-hv rounded-xl transition"
                                        title="Apply only Instance Segmentation routes"
                                    >
                                        <span>Instance Seg Only</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onApplyToBatch(draftBindings, "cross-image-suggestion")}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-t2 bg-well hover:bg-hv rounded-xl transition"
                                        title="Apply only Cross-Image Suggestion routes"
                                    >
                                        <span>Cross-Image Only</span>
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {policy && (
                        <button
                            type="button"
                            onClick={handleClearAll}
                            disabled={!canEdit || isDeleting || isSaving}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition disabled:opacity-50"
                        >
                            <Trash2 size={13} />
                            <span>{isDeleting ? "Clearing..." : "Clear Policy"}</span>
                        </button>
                    )}

                    {hasUnsavedChanges && (
                        <button
                            type="button"
                            onClick={handleReset}
                            disabled={!canEdit || isSaving}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-t2 hover:bg-well rounded-xl transition disabled:opacity-50"
                        >
                            <RotateCcw size={13} />
                            <span>Reset Changes</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!canEdit || isSaving || (!hasUnsavedChanges && policy !== null)}
                        className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-xl transition shadow-xs ${
                            hasUnsavedChanges
                                ? "bg-accent hover:bg-accent/90 text-white"
                                : "bg-p2 text-t3 cursor-default"
                        } disabled:opacity-50`}
                    >
                        <Save size={13} />
                        <span>{isSaving ? "Saving..." : hasUnsavedChanges ? "Save Routing Policy" : "Saved"}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
