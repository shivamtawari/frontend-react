import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Play, Loader2, Sparkles, Clock, Trash2, StopCircle, ArrowLeft, Wand2, ChevronDown, ChevronRight, Cpu, ArrowRight, Check } from "lucide-react";
import DatasetManagementLayout from "../components/datasets/gallery/DatasetManagementLayout";
import { useDataset } from "../contexts/DatasetContext";
import {
    deleteInferenceJob,
    getInferenceJobs,
    getInferenceModelCatalog,
    getInferenceRoutingPolicy,
    getInferenceScopeCounts,
    previewInferenceReplace,
    startInferenceJob,
    streamInferenceJob,
} from "../api/inference";
import { fetchLabels } from "../api/labels";
import LabelModelPlanner from "../components/inference/LabelModelPlanner";
import WriteModeSelector from "../components/inference/WriteModeSelector";
import ReplaceWarningModal from "../components/inference/ReplaceWarningModal";
import InferenceProgressPanel, {
    STATUS_STYLE,
    TERMINAL_JOB_STATUSES,
} from "../components/inference/InferenceProgressPanel";
import { BATCH_INFERENCE_TASKS } from "../constants/tasks";
import { usePermissions } from "../hooks/usePermissions";
import { Permission } from "../utils/permissions";
import { getBatchStepsFromPolicy } from "../utils/inferenceRouting";

/**
 * Batch inference: annotate a whole dataset without opening the canvas.
 *
 * Provides a focused batch run execution workflow with run history, scope selection,
 * label model planning, and write-mode controls. Model routing policies are managed
 * on the dedicated Model Orchestration page and prefilled here.
 */

const DEFAULT_OPTIONS = {
    write_mode: "patch",
    nms_iou: 0.7,
    preserve_reviewed: true,
    unparented: "drop",
    min_parent_containment: 0.5,
};

const SCOPE_OPTIONS = [
    { value: "all", label: "Every image", countKey: "total" },
    { value: "not_started", label: "Not annotated yet", countKey: "not_started" },
    { value: "unreviewed", label: "Not fully reviewed", countKey: "unreviewed" },
];

const RUN_NAME_PATTERN = /^[\p{L}\p{N}_\-\s]{1,80}$/u;

const LEGACY_STEP_KEYS = new Set(["retrieval_strategy", "top_k"]);

const stepsForRequest = (steps) =>
    steps.map((step) =>
        step.inputs
            ? Object.fromEntries(
                  Object.entries(step).filter(([key]) => !LEGACY_STEP_KEYS.has(key))
              )
            : step
    );

const formatTime = (value) => (value ? new Date(value).toLocaleString() : "—");

function JobCard({ job, selected, onClick }) {
    const percent = job.total_units
        ? Math.round((job.done_units / job.total_units) * 100)
        : 0;
    return (
        <button
            onClick={onClick}
            className={`w-full text-left p-3 rounded-xl border transition-colors ${
                selected ? "border-acLn bg-acS" : "border-ln bg-p1 hover:bg-hv"
            }`}
        >
            <div className="flex items-center justify-between mb-1">
                <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        STATUS_STYLE[job.status] || STATUS_STYLE.pending
                    }`}
                >
                    {job.status}
                </span>
                <span className="text-[11px] text-t3 flex items-center gap-1">
                    <Clock size={11} /> {formatTime(job.created_at)}
                </span>
            </div>
            {job.name && (
                <p className="text-xs font-medium text-t1 truncate mb-0.5">{job.name}</p>
            )}
            <p className="text-xs text-t2">
                {job.steps?.length ?? 0} label{(job.steps?.length ?? 0) === 1 ? "" : "s"} ·{" "}
                {job.image_count?.toLocaleString() ?? 0} images · {percent}%
            </p>
            {job.write_mode === "replace" && (
                <p className="text-[11px] text-err mt-0.5">replace</p>
            )}
        </button>
    );
}

export default function BatchInferencePage() {
    const { datasetId } = useParams();
    const { currentDataset } = useDataset();
    const navigate = useNavigate();
    const { can } = usePermissions(datasetId);

    const canConfigure = Boolean(can(Permission.AI_BATCH_INFER));

    const [labelsById, setLabelsById] = useState({});
    const [catalog, setCatalog] = useState({ models: [], retrieval_strategies: [] });
    const [scope, setScope] = useState({ total: 0, not_started: 0, unreviewed: 0 });

    // Dataset Model Routing Policy (read-only input for batch planner prefill)
    const [policy, setPolicy] = useState(null);
    const [appliedFilter, setAppliedFilter] = useState(null); // "all" | "instance-segmentation" | "cross-image-suggestion" | null

    // Batch Execution Form State
    const [stepsByLabel, setStepsByLabel] = useState({});
    const [options, setOptions] = useState(DEFAULT_OPTIONS);
    const [imageSelection, setImageSelection] = useState("all");
    const [runName, setRunName] = useState("");

    // Job Execution & History State
    const [jobs, setJobs] = useState([]);
    const [mode, setMode] = useState("config"); // "config" | "run"
    const [selectedJob, setSelectedJob] = useState(null);
    const [activeJobId, setActiveJobId] = useState(null);

    const [replacePreview, setReplacePreview] = useState(null);
    const [showReplaceWarning, setShowReplaceWarning] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const streamRef = useRef(null);
    const datasetIdRef = useRef(datasetId);
    datasetIdRef.current = datasetId;
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const steps = useMemo(
        () => Object.values(stepsByLabel).filter(Boolean),
        [stepsByLabel]
    );

    const canonicalCurrentSteps = useMemo(() => stepsForRequest(steps), [steps]);

    const requestBody = useCallback(
        (confirmReplace = false) => ({
            dataset_id: Number(datasetId),
            name: runName.trim() || undefined,
            steps: canonicalCurrentSteps,
            image_selection: imageSelection,
            options,
            confirm_replace: confirmReplace,
        }),
        [datasetId, runName, canonicalCurrentSteps, imageSelection, options]
    );

    const loadJobs = useCallback(
        async (isCancelled = () => false) => {
            try {
                const list = await getInferenceJobs(datasetId);
                if (!isCancelled()) {
                    setJobs(Array.isArray(list) ? list : []);
                }
                return list;
            } catch (e) {
                if (!isCancelled()) {
                    setJobs([]);
                }
                return [];
            }
        },
        [datasetId]
    );

    // Apply dataset policy bindings to the batch execution plan
    const applyPolicyToBatchSteps = useCallback(
        (bindings, availableLabels, availableCatalog, preferredTask = null) => {
            if (!Array.isArray(bindings)) return;
            const policyObj = { bindings };
            const models = availableCatalog?.models || [];
            const newSteps = getBatchStepsFromPolicy(
                policyObj,
                availableLabels,
                models,
                preferredTask
            );
            setStepsByLabel(newSteps);
        },
        []
    );

    const handleApplyFilter = useCallback(
        (filterKey) => {
            if (!policy?.bindings) return;
            const task = filterKey === "all" ? null : filterKey;
            applyPolicyToBatchSteps(policy.bindings, labelsById, catalog, task);
            setAppliedFilter(filterKey);
        },
        [policy, labelsById, catalog, applyPolicyToBatchSteps]
    );

    useEffect(() => {
        if (!datasetId) return undefined;
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        setIsStarting(false);
        setIsCancelling(false);
        setShowReplaceWarning(false);
        setPolicy(null);
        setAppliedFilter(null);
        setStepsByLabel({});
        setOptions(DEFAULT_OPTIONS);
        setJobs([]);
        setSelectedJob(null);
        setActiveJobId(null);
        setMode("config");

        (async () => {
            try {
                const [labelResponse, catalogResponse, scopeResponse, policyResponse] = await Promise.all([
                    fetchLabels(datasetId),
                    getInferenceModelCatalog(datasetId),
                    getInferenceScopeCounts(datasetId),
                    getInferenceRoutingPolicy(datasetId),
                ]);
                if (cancelled) return;

                const loadedLabels = labelResponse?.labels?.id_to_label_object || {};
                const loadedCatalog = catalogResponse || { models: [], retrieval_strategies: [] };

                setLabelsById(loadedLabels);
                setCatalog(loadedCatalog);
                setScope(scopeResponse || { total: 0, not_started: 0, unreviewed: 0 });
                setPolicy(policyResponse);

                // Initialize batch execution plan only if a single unambiguous batch task is configured;
                // if both batch tasks are configured, require explicit user action via 'Apply Routes' buttons.
                if (policyResponse?.bindings && Array.isArray(policyResponse.bindings)) {
                    const hasInstance = policyResponse.bindings.some((b) => b.task === "instance-segmentation");
                    const hasCross = policyResponse.bindings.some((b) => b.task === "cross-image-suggestion");
                    if (hasInstance && !hasCross) {
                        applyPolicyToBatchSteps(policyResponse.bindings, loadedLabels, loadedCatalog, "instance-segmentation");
                        setAppliedFilter("instance-segmentation");
                    } else if (hasCross && !hasInstance) {
                        applyPolicyToBatchSteps(policyResponse.bindings, loadedLabels, loadedCatalog, "cross-image-suggestion");
                        setAppliedFilter("cross-image-suggestion");
                    }
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e.message || "Could not load the models or policy for this dataset.");
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }

            if (cancelled) return;
            const list = await loadJobs(() => cancelled);
            if (cancelled) return;
            const running = (list || []).find((job) => !TERMINAL_JOB_STATUSES.has(job.status));
            if (running) {
                setSelectedJob(running);
                setActiveJobId(running.id);
                setMode("run");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [datasetId, loadJobs, applyPolicyToBatchSteps]);

    // Stream the active run; tear down on change/unmount
    useEffect(() => {
        if (!activeJobId) return undefined;
        let cancelled = false;

        const controller = streamInferenceJob(
            activeJobId,
            (update) => {
                if (cancelled || !isMountedRef.current) return;
                setSelectedJob(update);
                setJobs((current) =>
                    current.map((j) => (j.id === update.id ? update : j))
                );
                if (TERMINAL_JOB_STATUSES.has(update.status)) {
                    setActiveJobId(null);
                }
            },
            (err) => {
                if (cancelled || !isMountedRef.current) return;
                setError((prev) => prev || err?.message || "Lost connection to run updates.");
            }
        );
        streamRef.current = controller;

        return () => {
            cancelled = true;
            if (controller && typeof controller.abort === "function") {
                controller.abort();
            }
        };
    }, [activeJobId]);

    const setStep = (labelId, stepOrNull) => {
        setAppliedFilter(null);
        setStepsByLabel((current) => {
            const next = { ...current };
            if (stepOrNull) {
                next[labelId] = stepOrNull;
            } else {
                delete next[labelId];
            }
            return next;
        });
    };

    const handleSelectJob = (job) => {
        setSelectedJob(job);
        setActiveJobId(TERMINAL_JOB_STATUSES.has(job.status) ? null : job.id);
        setMode("run");
    };

    const handleCancel = async () => {
        if (!selectedJob) return;
        setIsCancelling(true);
        try {
            await cancelInferenceJob(selectedJob.id);
        } catch (e) {
            setError(e.message || "Failed to cancel run.");
        } finally {
            if (isMountedRef.current) {
                setIsCancelling(false);
            }
        }
    };

    const handleDelete = async () => {
        if (!selectedJob) return;
        try {
            await deleteInferenceJob(selectedJob.id);
            setJobs((cur) => cur.filter((j) => j.id !== selectedJob.id));
            setSelectedJob(null);
            setActiveJobId(null);
            setMode("config");
        } catch (e) {
            setError(e.message || "Failed to delete run.");
        }
    };

    const start = async (confirmReplace = false) => {
        setError(null);
        setIsStarting(true);
        try {
            const body = requestBody(confirmReplace);
            const job = await startInferenceJob(body);
            setShowReplaceWarning(false);
            setReplacePreview(null);
            setJobs((current) => [job, ...current.filter((j) => j.id !== job.id)]);
            setSelectedJob(job);
            setActiveJobId(job.id);
            setMode("run");
        } catch (e) {
            setError(e.message || "Failed to start batch inference.");
        } finally {
            if (isMountedRef.current) {
                setIsStarting(false);
            }
        }
    };

    const handleStart = async () => {
        if (options.write_mode === "replace") {
            try {
                const body = requestBody(false);
                const preview = await previewInferenceReplace(body);
                setReplacePreview(preview);
                setShowReplaceWarning(true);
            } catch (e) {
                setError(e.message || "Failed to preview replace run.");
            }
            return;
        }
        await start(false);
    };

    const handleLoadJobIntoPlanner = (job) => {
        if (!job?.steps || !Array.isArray(job.steps)) return;
        const restored = {};
        for (const step of job.steps) {
            if (step.label_id != null) {
                restored[step.label_id] = step;
            }
        }
        setStepsByLabel(restored);
        if (job.image_selection) {
            setImageSelection(job.image_selection);
        }
        if (job.options) {
            setOptions({ ...DEFAULT_OPTIONS, ...job.options });
        }
        if (job.name) {
            setRunName(`${job.name} (copy)`);
        }
        setMode("config");
    };

    const batchEligibleBindings = useMemo(() => {
        if (!policy?.bindings || !Array.isArray(policy.bindings)) return [];
        return policy.bindings.filter((b) => BATCH_INFERENCE_TASKS.includes(b.task));
    }, [policy]);

    const hasInstanceRoutes = useMemo(() => {
        return batchEligibleBindings.some((b) => b.task === "instance-segmentation");
    }, [batchEligibleBindings]);

    const hasCrossRoutes = useMemo(() => {
        return batchEligibleBindings.some((b) => b.task === "cross-image-suggestion");
    }, [batchEligibleBindings]);

    const scopeCount = scope[SCOPE_OPTIONS.find((s) => s.value === imageSelection)?.countKey ?? "total"] ?? 0;
    const hasActiveRun = jobs.some((j) => !TERMINAL_JOB_STATUSES.has(j.status));
    const runNameError =
        runName.trim() && !RUN_NAME_PATTERN.test(runName.trim())
            ? "Letters, numbers, spaces, underscores, and hyphens only (max 80)."
            : null;

    const canStart = steps.length > 0 && scopeCount > 0 && !hasActiveRun && !isStarting && !runNameError && canConfigure;

    return (
        <DatasetManagementLayout datasetId={datasetId}>
            <div className="flex flex-col h-[calc(100vh-64px)] bg-app">
                {/* Top Title Banner */}
                <header className="p-6 border-b border-ln bg-p1 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl font-bold text-t1">
                                {currentDataset?.name ? `${currentDataset.name} — Batch Inference` : "Batch Inference"}
                            </h1>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-acS text-ac">
                                <Wand2 size={13} /> Batch Runner
                            </span>
                        </div>
                        <p className="text-xs text-t3 mt-1">
                            Launch autonomous batch inference runs across dataset images using configured model plans.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {mode === "run" ? (
                            <button
                                type="button"
                                onClick={() => setMode("config")}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium border border-ln rounded-xl bg-p1 text-t1 hover:bg-hv transition"
                            >
                                <ArrowLeft size={13} />
                                <span>Configure New Run</span>
                            </button>
                        ) : (
                            <Link
                                to={`/dataset/${datasetId}/model-orchestration`}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium border border-ln rounded-xl bg-p1 text-t1 hover:bg-hv transition"
                            >
                                <Cpu size={13} />
                                <span>Model Orchestration</span>
                            </Link>
                        )}
                    </div>
                </header>

                <div className="flex flex-1 min-h-0">
                    {/* Left History Rail */}
                    <aside className="w-80 border-r border-ln bg-p1 flex flex-col min-h-0">
                        <div className="p-4 border-b border-ln flex items-center justify-between">
                            <h2 className="text-xs font-semibold uppercase tracking-wide text-t2">
                                Run History
                            </h2>
                            <span className="text-xs text-t3">{jobs.length} run{jobs.length === 1 ? "" : "s"}</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {jobs.length === 0 && <p className="text-xs text-t3 px-1 py-4 text-center">No previous runs yet.</p>}
                            {jobs.map((job) => (
                                <JobCard
                                    key={job.id}
                                    job={job}
                                    selected={mode === "run" && selectedJob?.id === job.id}
                                    onClick={() => handleSelectJob(job)}
                                />
                            ))}
                        </div>
                    </aside>

                    {/* Main Content Area */}
                    <main className="flex-1 overflow-y-auto p-6">
                        {error && (
                            <div className="mb-6 p-4 bg-errBg border border-errLn rounded-2xl text-sm text-err">
                                {error}
                            </div>
                        )}

                        {mode === "run" && selectedJob ? (
                            <div className="max-w-4xl">
                                <InferenceProgressPanel
                                    job={selectedJob}
                                    onCancel={handleCancel}
                                    isCancelling={isCancelling}
                                    onReview={() =>
                                        navigate(`/dataset/${datasetId}/review`, {
                                             state: { onlySubmitted: false },
                                         })
                                    }
                                    onDelete={handleDelete}
                                    onLoadIntoPlanner={handleLoadJobIntoPlanner}
                                    onOpenImage={(imageId) =>
                                        navigate(`/dataset/${datasetId}/annotate/${imageId}`)
                                    }
                                />
                            </div>
                        ) : isLoading ? (
                            <div className="flex items-center justify-center p-12 text-sm text-t3 gap-2">
                                <Loader2 className="w-5 h-5 animate-spin text-ac" />
                                <span>Loading dataset models, policies, and labels…</span>
                            </div>
                        ) : (
                            <div className="max-w-4xl space-y-8">
                                {/* Batch Inference Runner */}
                                <section className="border border-ln rounded-3xl bg-p1 p-6 shadow-xs space-y-8">
                                    <div>
                                        <h2 className="text-lg font-semibold text-t1 flex items-center gap-2">
                                            <Wand2 size={20} className="text-ac" />
                                            Launch Batch Inference Run
                                        </h2>
                                        <p className="text-xs text-t3 mt-1">
                                            Execute autonomous segmentation across your dataset images using the configured label plan.
                                        </p>
                                    </div>

                                    {/* Step A: Scope */}
                                    <div>
                                        <h3 className="text-sm font-semibold text-t1 mb-2">
                                            1. Scope (Which images to annotate)
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {SCOPE_OPTIONS.map((option) => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => setImageSelection(option.value)}
                                                    aria-pressed={imageSelection === option.value}
                                                    className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors ${
                                                        imageSelection === option.value
                                                            ? "border-acLn bg-acS text-ac shadow-xs"
                                                            : "border-ln bg-p1 text-t2 hover:bg-hv"
                                                    }`}
                                                >
                                                    {option.label}
                                                    <span className="ml-1.5 text-[11px] text-t3 font-normal">
                                                        ({(scope[option.countKey] ?? 0).toLocaleString()})
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Step B: Label Model Planner */}
                                    <div>
                                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                            <div>
                                                <h3 className="text-sm font-semibold text-t1">
                                                    2. Batch Label Plan
                                                </h3>
                                                <p className="text-xs text-t3">
                                                    Specify which model executes each label in this batch run.
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {batchEligibleBindings.length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleApplyFilter("all")}
                                                            aria-pressed={appliedFilter === "all"}
                                                            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-xl border transition-all ${
                                                                appliedFilter === "all"
                                                                    ? "border-acLn bg-acS text-ac font-semibold shadow-xs"
                                                                    : "border-ln bg-p1 text-t2 hover:bg-hv hover:text-t1"
                                                            }`}
                                                            title="Apply all batch routes from dataset policy"
                                                        >
                                                            {appliedFilter === "all" ? (
                                                                <Check size={13} className="text-ac" />
                                                            ) : (
                                                                <ArrowRight size={13} className="text-t3" />
                                                            )}
                                                            <span>Apply All Routes</span>
                                                        </button>
                                                        {hasInstanceRoutes && hasCrossRoutes && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleApplyFilter("instance-segmentation")}
                                                                    aria-pressed={appliedFilter === "instance-segmentation"}
                                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-xl border transition-all ${
                                                                        appliedFilter === "instance-segmentation"
                                                                            ? "border-acLn bg-acS text-ac font-semibold shadow-xs"
                                                                            : "border-ln bg-p1 text-t2 hover:bg-hv hover:text-t1"
                                                                    }`}
                                                                    title="Apply only Instance Segmentation routes"
                                                                >
                                                                    {appliedFilter === "instance-segmentation" && (
                                                                        <Check size={13} className="text-ac" />
                                                                    )}
                                                                    <span>Instance Seg Only</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleApplyFilter("cross-image-suggestion")}
                                                                    aria-pressed={appliedFilter === "cross-image-suggestion"}
                                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-xl border transition-all ${
                                                                        appliedFilter === "cross-image-suggestion"
                                                                            ? "border-acLn bg-acS text-ac font-semibold shadow-xs"
                                                                            : "border-ln bg-p1 text-t2 hover:bg-hv hover:text-t1"
                                                                    }`}
                                                                    title="Apply only Cross-Image Suggestion routes"
                                                                >
                                                                    {appliedFilter === "cross-image-suggestion" && (
                                                                        <Check size={13} className="text-ac" />
                                                                    )}
                                                                    <span>Cross-Image Only</span>
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}

                                                <Link
                                                    to={`/dataset/${datasetId}/model-orchestration`}
                                                    className="inline-flex items-center gap-1 text-xs font-medium text-ac hover:underline"
                                                >
                                                    <Cpu size={13} />
                                                    <span>Edit model routing</span>
                                                </Link>
                                            </div>
                                        </div>
                                        <LabelModelPlanner
                                            labelsById={labelsById}
                                            models={catalog.models}
                                            strategies={catalog.retrieval_strategies}
                                            steps={steps}
                                            onChange={setStep}
                                            allowedTasks={BATCH_INFERENCE_TASKS}
                                        />
                                    </div>

                                    {/* Step C: Annotation Mode */}
                                    <div>
                                        <h3 className="text-sm font-semibold text-t1 mb-2">
                                            3. Annotation Write Mode
                                        </h3>
                                        <WriteModeSelector
                                            options={options}
                                            onChange={setOptions}
                                            replacePreview={replacePreview}
                                        />
                                    </div>

                                    {/* Step D: Nested Objects */}
                                    {steps.some((step) => (labelsById[step.label_id]?.parent_id ?? null) !== null) && (
                                        <div>
                                            <h3 className="text-sm font-semibold text-t1 mb-2">
                                                4. Nested Objects Hierarchy
                                            </h3>
                                            <label className="flex items-center gap-2 text-xs text-t2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={options.unparented === "keep_at_root"}
                                                    onChange={(event) =>
                                                        setOptions({
                                                            ...options,
                                                            unparented: event.target.checked
                                                                ? "keep_at_root"
                                                                : "drop",
                                                        })
                                                    }
                                                    className="h-4 w-4 rounded border-ln text-ac focus:ring-ac"
                                                />
                                                <span>Keep child predictions that fall outside parent bounding boundaries</span>
                                            </label>
                                        </div>
                                    )}

                                    {/* Run Name */}
                                    <div>
                                        <label
                                            htmlFor="inference-run-name"
                                            className="block text-xs font-semibold text-t1 uppercase tracking-wide mb-1"
                                        >
                                            Run Name <span className="text-t3 font-normal">(optional)</span>
                                        </label>
                                        <input
                                            id="inference-run-name"
                                            type="text"
                                            value={runName}
                                            onChange={(event) => setRunName(event.target.value)}
                                            maxLength={80}
                                            aria-invalid={Boolean(runNameError)}
                                            placeholder="e.g. Pass 1 — Cells & Nuclei"
                                            className={`w-full px-3 py-2 text-xs border rounded-xl bg-well text-t1 focus:ring-2 focus:ring-ac focus:border-transparent ${
                                                runNameError ? "border-errLn" : "border-ln"
                                            }`}
                                        />
                                        {runNameError && (
                                            <p className="text-[11px] text-err mt-1">{runNameError}</p>
                                        )}
                                    </div>

                                    {hasActiveRun && (
                                        <div className="p-3.5 bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 rounded-2xl text-xs text-amber-800 dark:text-amber-300">
                                            A batch inference job is currently active for this dataset. Please wait for it to finish or cancel it before starting a new run.
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-4 pt-2">
                                        <button
                                            type="button"
                                            onClick={handleStart}
                                            disabled={!canStart}
                                            className={`inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white rounded-xl shadow-xs transition disabled:opacity-50 ${
                                                options.write_mode === "replace" ? "bg-red-600 hover:bg-red-700" : "bg-accent hover:bg-accent/90"
                                            }`}
                                        >
                                            {isStarting ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Play size={14} className="fill-white" />
                                            )}
                                            <span>{isStarting ? "Starting Run…" : "Start Batch Inference"}</span>
                                        </button>

                                        {steps.length > 0 && scopeCount > 0 && (
                                            <span className="text-xs text-t3">
                                                {(steps.length * scopeCount).toLocaleString()} total tasks ({steps.length} label{steps.length === 1 ? "" : "s"} × {scopeCount.toLocaleString()} images)
                                            </span>
                                        )}
                                        {steps.length === 0 && (
                                            <span className="text-xs text-t3">
                                                Configure at least one label in the batch plan.
                                            </span>
                                        )}
                                    </div>
                                </section>
                            </div>
                        )}
                    </main>
                </div>
            </div>

            <ReplaceWarningModal
                isOpen={showReplaceWarning}
                preview={replacePreview}
                preserveReviewed={options.preserve_reviewed}
                imageCount={scopeCount}
                isStarting={isStarting}
                onCancel={() => setShowReplaceWarning(false)}
                onConfirm={() => start(true)}
            />
        </DatasetManagementLayout>
    );
}
