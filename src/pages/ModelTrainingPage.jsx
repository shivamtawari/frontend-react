import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  GraduationCap, Plus, ChevronDown, ChevronRight, Sparkles, AlertTriangle, Loader2
} from "lucide-react";
import DatasetManagementLayout from "../components/datasets/gallery/DatasetManagementLayout";
import { useDataset } from "../contexts/DatasetContext";
import DynamicHyperParameter from "../components/datasets/training/DynamicHyperParameter";
import ModelMetadataGate, {
  MODEL_METADATA_STATUS,
} from "../components/modelTraining/ModelMetadataGate";
import {
  getLabelSelectionError,
  normalizeLabelMetadata,
  validateLabelSelection,
} from "../components/modelTraining/labelHierarchy";
import {
  fetchLabels,
  getInstanceModels,
  getInstanceTrainingRuns,
  startInstanceTraining,
  cancelInstanceTraining,
  streamInstanceTrainingProgress,
  getInstanceLabelAnnotationCounts,
} from "../api";
import RunCard from "../components/modelTraining/trainingPage/RunCard";
import ProgressPanel from "../components/modelTraining/trainingPage/ProgressPanel";

const TERMINAL = new Set(["SUCCESS", "FAILED", "CANCELLED", "TIMED_OUT"]);
const RESOURCE_STATUS = Object.freeze({
  LOADING: "loading",
  SUCCESS: "success",
  EMPTY: "empty",
  ERROR: "error",
});
const RUN_NAME_PATTERN = /^[\p{L}\p{N}_\-\s]{1,80}$/u;

const mergeRunSnapshot = (run, snapshot) => ({
  ...run,
  ...snapshot,
  // Preserve optimistic values until the worker-created MLflow run is discoverable.
  run_name: snapshot.run_name || run.run_name,
  label_ids: snapshot.label_ids?.length ? snapshot.label_ids : run.label_ids,
  total_epochs: snapshot.total_epochs ?? run.total_epochs,
  training_parameters: Object.keys(snapshot.training_parameters || {}).length
    ? snapshot.training_parameters
    : run.training_parameters,
  start_time: snapshot.start_time ?? run.start_time,
});

const mergeRunHistory = (currentRuns, serverRuns) => {
  const serverTaskIds = new Set(serverRuns.map((run) => run.task_id).filter(Boolean));
  const pendingLocalRuns = currentRuns.filter(
    (run) => run.task_id && !serverTaskIds.has(run.task_id) && !TERMINAL.has(run.state),
  );
  return [...serverRuns, ...pendingLocalRuns]
    .sort((a, b) => (b.start_time || 0) - (a.start_time || 0));
};

const getRunNameError = (value) => {
  if (value.length === 0) return null;
  if (value.length > 80) return "Run name must be 80 characters or fewer.";
  if (!RUN_NAME_PATTERN.test(value)) {
    return "Run name may contain only letters, numbers, underscores, hyphens, and whitespace.";
  }
  return null;
};

export default function ModelTrainingPage() {
  const { datasetId } = useParams();
  const { currentDataset } = useDataset();

  const [labels, setLabels] = useState([]);
  const [labelStatus, setLabelStatus] = useState(RESOURCE_STATUS.LOADING);
  const [labelError, setLabelError] = useState(null);
  const [models, setModels] = useState([]);
  const [modelKey, setModelKey] = useState(null);
  const [modelMetadataStatus, setModelMetadataStatus] = useState(MODEL_METADATA_STATUS.LOADING);
  const [modelMetadataError, setModelMetadataError] = useState(null);
  const [selectedLabelIds, setSelectedLabelIds] = useState(() => new Set());
  const [hyperValues, setHyperValues] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(true);

  const [runs, setRuns] = useState([]);
  const [mode, setMode] = useState("config"); // "config" | "run"
  const [selectedRun, setSelectedRun] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState(null);
  const [annotationCounts, setAnnotationCounts] = useState({});
  const [annotationCountStatus, setAnnotationCountStatus] = useState("loading");
  const [annotationCountError, setAnnotationCountError] = useState(null);
  const [runStatus, setRunStatus] = useState(RESOURCE_STATUS.LOADING);
  const [runError, setRunError] = useState(null);
  const [modelRunName, setModelRunName] = useState("");

  const datasetGenerationRef = useRef(0);
  const labelRequestRef = useRef(0);
  const annotationCountRequestRef = useRef(0);
  const runRequestRef = useRef(0);
  const modelMetadataRequestRef = useRef(0);
  const streamGenerationRef = useRef(0);
  const streamRef = useRef(null);

  const selectedModel = useMemo(
    () => models.find((m) => m.registry_key === modelKey) || null,
    [models, modelKey]
  );

  const loadLabels = useCallback(async () => {
    const requestedDatasetId = datasetId;
    const generation = datasetGenerationRef.current;
    const requestId = labelRequestRef.current + 1;
    labelRequestRef.current = requestId;
    setLabelStatus(RESOURCE_STATUS.LOADING);
    setLabelError(null);
    setLabels([]);
    setSelectedLabelIds(new Set());

    try {
      const labelRes = await fetchLabels(requestedDatasetId);
      if (
        datasetGenerationRef.current !== generation
        || labelRequestRef.current !== requestId
      ) return;

      const labelMap = labelRes?.labels?.id_to_label_object;
      if (!labelMap || typeof labelMap !== "object" || Array.isArray(labelMap)) {
        throw new Error("Labels response was invalid.");
      }

      const list = normalizeLabelMetadata(labelMap);
      setLabels(list);
      setSelectedLabelIds(new Set(list.map((label) => label.id)));
      setLabelStatus(list.length > 0 ? RESOURCE_STATUS.SUCCESS : RESOURCE_STATUS.EMPTY);
    } catch (e) {
      if (
        datasetGenerationRef.current !== generation
        || labelRequestRef.current !== requestId
      ) return;

      setLabels([]);
      setSelectedLabelIds(new Set());
      setLabelError(e.message || "Failed to load labels.");
      setLabelStatus(RESOURCE_STATUS.ERROR);
    }
  }, [datasetId]);

  const loadAnnotationCounts = useCallback(async () => {
    const requestedDatasetId = datasetId;
    const generation = datasetGenerationRef.current;
    const requestId = annotationCountRequestRef.current + 1;
    annotationCountRequestRef.current = requestId;
    setAnnotationCountStatus(RESOURCE_STATUS.LOADING);
    setAnnotationCountError(null);
    setAnnotationCounts({});

    try {
      const countRes = await getInstanceLabelAnnotationCounts(requestedDatasetId);
      if (
        datasetGenerationRef.current !== generation
        || annotationCountRequestRef.current !== requestId
      ) return;
      if (
        countRes?.success !== true
        || !countRes.reviewed_annotation_counts
        || typeof countRes.reviewed_annotation_counts !== "object"
        || Array.isArray(countRes.reviewed_annotation_counts)
      ) {
        throw new Error("Annotation counts were not returned.");
      }

      setAnnotationCounts(countRes.reviewed_annotation_counts);
      setAnnotationCountStatus(RESOURCE_STATUS.SUCCESS);
    } catch (e) {
      if (
        datasetGenerationRef.current !== generation
        || annotationCountRequestRef.current !== requestId
      ) return;

      setAnnotationCounts({});
      setAnnotationCountError(e.message || "Failed to load annotation counts.");
      setAnnotationCountStatus(RESOURCE_STATUS.ERROR);
    }
  }, [datasetId]);

  const loadRuns = useCallback(async () => {
    const requestedDatasetId = datasetId;
    const generation = datasetGenerationRef.current;
    const requestId = runRequestRef.current + 1;
    runRequestRef.current = requestId;
    setRunStatus(RESOURCE_STATUS.LOADING);
    setRunError(null);

    try {
      const res = await getInstanceTrainingRuns(requestedDatasetId);
      if (
        datasetGenerationRef.current !== generation
        || runRequestRef.current !== requestId
      ) return;
      if (!Array.isArray(res?.runs)) {
        throw new Error("Run history response was invalid.");
      }

      const serverRuns = res.runs;
      setRuns((currentRuns) => mergeRunHistory(currentRuns, serverRuns));
      setRunStatus(serverRuns.length > 0 ? RESOURCE_STATUS.SUCCESS : RESOURCE_STATUS.EMPTY);

      const nonterminal = serverRuns.find((run) => !TERMINAL.has(run.state));
      if (nonterminal) {
        setActiveTaskId((prev) => prev || nonterminal.task_id);
        setSelectedRun((prev) => prev || nonterminal);
      }
    } catch (e) {
      if (
        datasetGenerationRef.current !== generation
        || runRequestRef.current !== requestId
      ) return;

      setRunError(e.message || "Failed to load run history.");
      setRunStatus(RESOURCE_STATUS.ERROR);
    }
  }, [datasetId]);

  const loadModelMetadata = useCallback(async () => {
    const requestId = modelMetadataRequestRef.current + 1;
    modelMetadataRequestRef.current = requestId;
    setModelMetadataStatus(MODEL_METADATA_STATUS.LOADING);
    setModelMetadataError(null);
    setModels([]);
    setModelKey(null);
    setHyperValues({});

    try {
      const modelRes = await getInstanceModels();
      if (requestId !== modelMetadataRequestRef.current) return;
      if (!Array.isArray(modelRes?.result)) {
        throw new Error("Training models response was invalid.");
      }

      const list = modelRes.result.filter(
        (model) => typeof model?.registry_key === "string" && model.registry_key.trim().length > 0,
      );
      setModels(list);
      setModelKey(list[0]?.registry_key ?? null);
      setModelMetadataStatus(
        list.length > 0 ? MODEL_METADATA_STATUS.SUCCESS : MODEL_METADATA_STATUS.EMPTY,
      );
    } catch (e) {
      if (requestId !== modelMetadataRequestRef.current) return;

      setModels([]);
      setModelKey(null);
      setHyperValues({});
      setModelMetadataError(e.message || "Failed to load training models.");
      setModelMetadataStatus(MODEL_METADATA_STATUS.ERROR);
    }
  }, []);

  // Load all dataset-scoped resources under one generation. A response from a
  // previous dataset is ignored even when the underlying API cannot be
  // cancelled.
  useEffect(() => {
    const generation = datasetGenerationRef.current + 1;
    datasetGenerationRef.current = generation;

    setLabels([]);
    setLabelStatus(RESOURCE_STATUS.LOADING);
    setLabelError(null);
    setSelectedLabelIds(new Set());
    setAnnotationCountStatus(RESOURCE_STATUS.LOADING);
    setAnnotationCounts({});
    setAnnotationCountError(null);
    setRuns([]);
    setRunStatus(RESOURCE_STATUS.LOADING);
    setRunError(null);
    setSelectedRun(null);
    setActiveTaskId(null);
    setMode("config");
    setIsStarting(false);
    setIsStopping(false);
    setError(null);
    setModelRunName("");
    setHyperValues({});

    if (datasetId) {
      loadLabels();
      loadAnnotationCounts();
      loadRuns();
    }

    return () => {
      if (datasetGenerationRef.current !== generation) return;

      // Invalidate before aborting so a callback already queued by the stream
      // cannot repopulate the old dataset after the route changes/unmounts.
      datasetGenerationRef.current += 1;
      streamGenerationRef.current += 1;
      if (streamRef.current?.abort) streamRef.current.abort();
      streamRef.current = null;
    };
  }, [datasetId, loadAnnotationCounts, loadLabels, loadRuns]);

  // Model metadata is global, but still receives a request token so an
  // unmounted page cannot render a late registry response.
  useEffect(() => {
    loadModelMetadata();
    return () => {
      modelMetadataRequestRef.current += 1;
    };
  }, [loadModelMetadata]);

  // Initialize hyperparameter values from the selected model's declared defaults.
  useEffect(() => {
    if (!selectedModel) return;
    const defaults = {};
    (selectedModel.training_parameters || []).forEach((p) => { defaults[p.key] = p.default_value; });
    setHyperValues(defaults);
  }, [selectedModel]);

  const invalidateCurrentStream = () => {
    streamGenerationRef.current += 1;
    if (streamRef.current?.abort) streamRef.current.abort();
    streamRef.current = null;
  };

  // Stream progress for the active task; callbacks are scoped to the dataset,
  // task, and stream instance that created them.
  useEffect(() => {
    const streamId = streamGenerationRef.current + 1;
    streamGenerationRef.current = streamId;
    const generation = datasetGenerationRef.current;
    const taskId = activeTaskId;

    if (!taskId) {
      streamRef.current = null;
      return () => {
        if (streamGenerationRef.current === streamId) streamGenerationRef.current += 1;
      };
    }

    const isLive = () => (
      streamGenerationRef.current === streamId
      && datasetGenerationRef.current === generation
    );
    const controller = streamInstanceTrainingProgress(
      taskId,
      (snap) => {
        if (!isLive() || !snap || typeof snap !== "object") return;
        if (snap.task_id && snap.task_id !== taskId) return;

        const scopedSnapshot = snap.task_id ? snap : { ...snap, task_id: taskId };
        setSelectedRun((currentRun) => {
          if (!currentRun) return scopedSnapshot;
          if (currentRun.task_id && currentRun.task_id !== taskId) return currentRun;
          return mergeRunSnapshot(currentRun, scopedSnapshot);
        });
        setRuns((currentRuns) => {
          const matchingIndex = currentRuns.findIndex(
            (run) => run.task_id === taskId
              || (scopedSnapshot.run_id && run.run_id === scopedSnapshot.run_id),
          );
          if (matchingIndex === -1) return [scopedSnapshot, ...currentRuns];
          return currentRuns.map((run, index) => (
            index === matchingIndex ? mergeRunSnapshot(run, scopedSnapshot) : run
          ));
        });
        if (TERMINAL.has(scopedSnapshot.state)) {
          setActiveTaskId((currentTaskId) => (currentTaskId === taskId ? null : currentTaskId));
          loadRuns();
        }
      },
      (err) => {
        if (isLive()) setError(err.message || "Lost connection to training stream.");
      },
    );
    streamRef.current = controller;
    return () => {
      if (streamGenerationRef.current === streamId) streamGenerationRef.current += 1;
      if (streamRef.current === controller) streamRef.current = null;
      if (controller?.abort) controller.abort();
    };
  }, [activeTaskId, datasetId, loadRuns]);

  const setHyper = (key, value) => setHyperValues((prev) => ({ ...prev, [key]: value }));

  const toggleLabel = (id) => setSelectedLabelIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleStart = async () => {
    const selectionValidation = validateLabelSelection(labels, selectedLabelIds);
    if (
      getRunNameError(modelRunName)
      || !selectedModel
      || labelStatus !== RESOURCE_STATUS.SUCCESS
      || !selectionValidation.valid
    ) return;

    const requestedDatasetId = datasetId;
    const generation = datasetGenerationRef.current;
    setError(null);
    setIsStarting(true);
    try {
      const res = await startInstanceTraining({
        dataset_id: Number(datasetId),
        // Empty = all labels; sending the explicit selection keeps intent clear.
        label_ids: Array.from(selectedLabelIds),
        model_registry_key: modelKey,
        hyper_parameter: hyperValues,
        model_run_name: modelRunName.trim() || undefined,
      });
      if (
        datasetGenerationRef.current !== generation
        || String(datasetId) !== String(requestedDatasetId)
      ) return;

      const labelIds = Array.from(selectedLabelIds);
      const optimisticRun = {
        task_id: res.task_id,
        run_id: null,
        state: "starting",
        epoch: 0,
        total_epochs: hyperValues.epochs ? Number(hyperValues.epochs) : null,
        loss: [],
        label_ids: labelIds,
        training_parameters: { ...hyperValues },
        run_name: modelRunName.trim() || undefined,
        start_time: Date.now(),
      };
      setRuns((currentRuns) => [
        optimisticRun,
        ...currentRuns.filter((run) => run.task_id !== res.task_id),
      ]);
      setMode("run");
      setSelectedRun(optimisticRun);
      setActiveTaskId(res.task_id);
      loadRuns();
    } catch (err) {
      if (
        datasetGenerationRef.current === generation
        && String(datasetId) === String(requestedDatasetId)
      ) {
        setError(err.message || "Failed to start training.");
      }
    } finally {
      if (
        datasetGenerationRef.current === generation
        && String(datasetId) === String(requestedDatasetId)
      ) {
        setIsStarting(false);
      }
    }
  };

  const handleStop = async () => {
    if (!activeTaskId) return;
    const taskId = activeTaskId;
    const generation = datasetGenerationRef.current;
    invalidateCurrentStream();
    setIsStopping(true);
    try {
      const snapshot = await cancelInstanceTraining(taskId);
      if (datasetGenerationRef.current !== generation) return;
      setSelectedRun((currentRun) => {
        if (!currentRun || currentRun.task_id !== taskId) return currentRun;
        return mergeRunSnapshot(currentRun, snapshot);
      });
    } catch (err) {
      if (datasetGenerationRef.current === generation) {
        setError(err.message || "Failed to stop training.");
      }
      return;
    } finally {
      if (datasetGenerationRef.current === generation) setIsStopping(false);
    }
    if (datasetGenerationRef.current === generation) {
      setActiveTaskId((currentTaskId) => (currentTaskId === taskId ? null : currentTaskId));
      loadRuns();
    }
  };

  const handleSelectRun = (run) => {
    const nextTaskId = !TERMINAL.has(run.state) && run.task_id ? run.task_id : null;
    if (nextTaskId !== activeTaskId) invalidateCurrentStream();
    setMode("run");
    setSelectedRun(run);
    // Keep streaming a still-running run; otherwise show its static snapshot.
    setActiveTaskId(nextTaskId);
  };

  const handleNewTraining = () => {
    invalidateCurrentStream();
    setActiveTaskId(null);
    setSelectedRun(null);
    setMode("config");
  };

  const allSelected = labels.length > 0 && selectedLabelIds.size === labels.length;
  const noAnnotations =
    annotationCountStatus === "success" &&
    selectedLabelIds.size > 0 &&
    [...selectedLabelIds].every((id) => (annotationCounts[id] ?? 0) === 0);
  const selectionValidation = validateLabelSelection(labels, selectedLabelIds);
  const selectionError = getLabelSelectionError(selectionValidation);
  const runNameError = getRunNameError(modelRunName);
  const hasActiveRun = activeTaskId != null || runs.some((run) => !TERMINAL.has(run.state));

  return (
    <DatasetManagementLayout>
      <div className="h-full flex flex-col bg-p1 overflow-hidden">
        {/* Header */}
        <div className="bg-p1 border-b border-ln px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3">
          <GraduationCap className="w-6 h-6 text-ac" />
          <div>
            <h1 className="text-2xl font-bold text-t1">Model Training</h1>
            <p className="text-sm text-t2">
              Train an instance segmentation model on {currentDataset?.name ? `“${currentDataset.name}”` : "this dataset"}.
            </p>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: run history */}
          <aside className="w-72 shrink-0 border-r border-ln flex flex-col">
            <div className="p-3 border-b border-ln">
              <button
                type="button"
                onClick={handleNewTraining}
                className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === "config" ? "bg-accent text-onAccent" : "bg-acS text-ac hover:bg-acS"
                }`}
              >
                <Plus size={16} /> New Training
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-t3 px-1">Run history</p>
              {runStatus === RESOURCE_STATUS.LOADING && runs.length === 0 && (
                <p className="text-xs text-t3 px-1" role="status" aria-label="Loading run history">Loading run history…</p>
              )}
              {runStatus === RESOURCE_STATUS.ERROR && (
                <div
                  className="p-2 rounded-lg bg-errBg border border-errLn text-xs text-err"
                  role="alert"
                  aria-label={runError || "Unable to load run history."}
                >
                  <p>{runError || "Unable to load run history."}</p>
                  <button
                    type="button"
                    onClick={loadRuns}
                    className="mt-2 font-medium underline hover:no-underline"
                  >
                    Retry run history
                  </button>
                </div>
              )}
              {runStatus === RESOURCE_STATUS.EMPTY && runs.length === 0 && (
                <p className="text-xs text-t3 px-1" role="status" aria-label="No runs yet for this dataset">
                  No runs yet for this dataset.
                </p>
              )}
              {runs.map((run) => (
                <RunCard
                  key={run.run_id || run.task_id}
                  run={run}
                  selected={mode === "run" && selectedRun && (
                    (selectedRun.task_id && selectedRun.task_id === run.task_id)
                    || (selectedRun.run_id && selectedRun.run_id === run.run_id)
                  )}
                  onClick={() => handleSelectRun(run)}
                />
              ))}
            </div>
          </aside>

          {/* Right: config or progress */}
          <main className="flex-1 overflow-y-auto p-6">
            {error && (
              <div
                className="mb-4 p-3 bg-errBg border border-errLn rounded-lg text-sm text-err whitespace-pre-wrap"
                role="alert"
                aria-label={error}
              >
                {error}
              </div>
            )}

            {mode === "run" && selectedRun ? (
              <div className="max-w-3xl">
                <ProgressPanel snapshot={selectedRun} onStop={handleStop} isStopping={isStopping} />
              </div>
            ) : (
              <ModelMetadataGate
                status={modelMetadataStatus}
                models={models}
                error={modelMetadataError}
                onRetry={loadModelMetadata}
              >
                <div className="max-w-2xl space-y-6">
                {/* Model */}
                <div>
                  <label htmlFor="model-registry-key" className="block text-sm font-medium text-t1 mb-1">Model</label>
                  <select
                    id="model-registry-key"
                    name="model_registry_key"
                    value={modelKey}
                    onChange={(e) => setModelKey(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-ln2 rounded-lg focus:ring-2 focus:ring-ac focus:border-transparent"
                  >
                    {models.map((m) => (
                      <option key={m.registry_key} value={m.registry_key}>{m.name || m.registry_key}</option>
                    ))}
                  </select>
                  {selectedModel?.description && (
                    <p className="text-[11px] text-t3 mt-1 line-clamp-2">{selectedModel.description}</p>
                  )}
                </div>

                {/* Labels */}
                <fieldset
                  id="training-labels"
                  aria-describedby={`training-label-help${selectionError ? " training-label-error" : ""}`}
                  aria-invalid={Boolean(selectionError)}
                  className="border-0 p-0 m-0"
                >
                  <legend className="block text-sm font-medium text-t1 mb-1 w-full">
                    <div className="flex items-center gap-2">
                      <span>Classes to train ({selectedLabelIds.size}/{labels.length})</span>
                      {(selectedModel?.tags?.target_encoding === "exclusive_hierarchy_v1" || selectedModel?.target_encoding === "exclusive_hierarchy_v1") && (
                        <span className="bg-acS text-ac text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 inline-flex" title="This encoded model variant supports hierarchical datasets">
                          <Sparkles size={10} /> Hierarchy Aware
                        </span>
                      )}
                    </div>
                  </legend>
                  <div className="flex items-center justify-end mb-1">
                    <button
                      type="button"
                      aria-controls="training-label-options"
                      onClick={() => setSelectedLabelIds(allSelected ? new Set() : new Set(labels.map((l) => l.id)))}
                      className="text-xs text-ac hover:underline"
                    >
                      {allSelected ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  {labelStatus === RESOURCE_STATUS.LOADING && (
                    <p className="text-[11px] text-t3 mb-1" role="status" aria-label="Loading labels">Loading labels…</p>
                  )}
                  {labelStatus === RESOURCE_STATUS.ERROR && (
                    <div
                      className="text-[11px] text-err mb-1"
                      role="alert"
                      aria-label={labelError || "Unable to load labels."}
                    >
                      <p>{labelError || "Unable to load labels."}</p>
                      <button
                        type="button"
                        onClick={loadLabels}
                        className="mt-1 font-medium underline hover:no-underline"
                      >
                        Retry labels
                      </button>
                    </div>
                  )}
                  {labelStatus === RESOURCE_STATUS.EMPTY && (
                    <p
                      className="text-xs text-t3 p-3 border border-ln rounded-lg"
                      role="status"
                      aria-label="No labels available for this dataset"
                    >
                      No labels available for this dataset.
                    </p>
                  )}
                  {annotationCountStatus === RESOURCE_STATUS.LOADING && (
                    <p className="text-[11px] text-t3 mb-1" role="status" aria-label="Loading annotation counts">
                      Loading annotation counts…
                    </p>
                  )}
                  {annotationCountStatus === RESOURCE_STATUS.ERROR && (
                    <div
                      className="text-[11px] text-warn mb-1"
                      role="alert"
                      aria-label={annotationCountError || "Unable to load annotation counts."}
                    >
                      <p>{annotationCountError || "Unable to load annotation counts."} Training will be validated by the backend.</p>
                      <button
                        type="button"
                        onClick={loadAnnotationCounts}
                        className="mt-1 font-medium underline hover:no-underline"
                      >
                        Retry annotation counts
                      </button>
                    </div>
                  )}
                  {labelStatus === RESOURCE_STATUS.SUCCESS && (
                    <div
                      id="training-label-options"
                      className="max-h-44 overflow-y-auto border border-ln rounded-lg divide-y divide-ln"
                    >
                      {labels.map((label) => {
                        const checkboxId = `training-label-${label.id}`;
                        const countKnown = annotationCountStatus === RESOURCE_STATUS.SUCCESS;
                        const count = countKnown ? (annotationCounts[label.id] ?? 0) : null;
                        const countId = `${checkboxId}-count`;
                        return (
                          <div key={label.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-hv">
                            <input
                              id={checkboxId}
                              name="label_ids"
                              type="checkbox"
                              data-parent-id={label.parent_id ?? ""}
                              checked={selectedLabelIds.has(label.id)}
                              onChange={() => toggleLabel(label.id)}
                              aria-describedby={countId}
                              className="h-4 w-4"
                            />
                            <label htmlFor={checkboxId} className="flex-1 cursor-pointer">{label.name}</label>
                            <span
                              id={countId}
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${countKnown
                                ? (count === 0 ? "bg-errBg text-err" : "bg-okBg text-ok")
                                : "bg-well text-t3"
                              }`}
                              title={countKnown
                                ? `${count} reviewed annotation${count === 1 ? "" : "s"}`
                                : "Annotation count unavailable"}
                              aria-label={countKnown
                                ? `${count} reviewed annotation${count === 1 ? "" : "s"}`
                                : "Annotation count unavailable"}
                            >
                              {countKnown ? count : (annotationCountStatus === RESOURCE_STATUS.LOADING ? "…" : "—")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {selectionError && (
                    <p
                      id="training-label-error"
                      className="text-xs text-err mt-2"
                      role="alert"
                      aria-label={selectionError}
                    >
                      {selectionError}
                    </p>
                  )}
                  <p id="training-label-help" className="text-[11px] text-t3 mt-1">
                    Multiclass by default — all labels are selected. A single label is valid; selected ancestor and descendant paths must include every intermediate label.
                    {(selectedModel?.tags?.target_encoding === "exclusive_hierarchy_v1" || selectedModel?.target_encoding === "exclusive_hierarchy_v1") && " When a hierarchy is selected, this model trains using the exclusive_hierarchy_v1 algorithm."}
                  </p>
                </fieldset>

                {/* Advanced (model-declared params) */}
                {(selectedModel?.training_parameters?.length ?? 0) > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAdvanced((s) => !s)}
                      className="flex items-center gap-1 text-sm font-medium text-t2 hover:text-t1"
                    >
                      {showAdvanced ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Training parameters
                    </button>
                    {showAdvanced && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {selectedModel.training_parameters.map((p) => (
                          <DynamicHyperParameter key={p.key} param={p} value={hyperValues[p.key]} onChange={setHyper} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Auto-train (coming soon) */}
                <div className="p-4 rounded-xl border border-dashed border-ln2 bg-well">
                  <div className="flex items-center gap-2 text-sm font-medium text-t2">
                    <Sparkles size={16} className="text-t3" />
                    Automated training triggers
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-hv2 text-t3 px-2 py-0.5 rounded-full">Coming soon</span>
                  </div>
                  <p className="text-xs text-t3 mt-1">Automatically retrain as new images are fully annotated.</p>
                </div>

                {/* Run name */}
                <div>
                  <label htmlFor="model-run-name" className="block text-sm font-medium text-t1 mb-1">
                    Run name <span className="text-t3 font-normal">(optional)</span>
                  </label>
                  <input
                    id="model-run-name"
                    type="text"
                    value={modelRunName}
                    onChange={(e) => setModelRunName(e.target.value)}
                    maxLength={80}
                    aria-invalid={Boolean(runNameError)}
                    aria-describedby="run-name-help"
                    placeholder="e.g. Cells-FineTuned-v1"
                    className={`w-full px-3 py-2 text-sm border rounded-lg bg-well text-t1 focus:ring-2 focus:ring-ac focus:border-transparent ${runNameError ? "border-errLn" : "border-ln"}`}
                  />
                  <p id="run-name-help" className={`text-[11px] mt-1 ${runNameError ? "text-err" : "text-t3"}`}>
                    {runNameError || "Optional, 1–80 characters: letters, numbers, underscores, hyphens, or whitespace."}
                  </p>
                </div>

                {noAnnotations && (
                  <p className="text-xs text-err">
                    The selected classes have no reviewed annotations. Review some annotations before training.
                  </p>
                )}

                {hasActiveRun && (
                  <div className="flex items-center gap-2 p-3 bg-warnBg border border-warnLn rounded-lg text-sm text-warn">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    A training run is still active. Starting another may cause GPU memory contention.
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleStart}
                  disabled={
                    isStarting
                    || labelStatus !== RESOURCE_STATUS.SUCCESS
                    || selectedLabelIds.size === 0
                    || noAnnotations
                    || Boolean(selectionError)
                    || Boolean(runNameError)
                  }
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-onAccent bg-accent rounded-lg hover:brightness-110 transition-colors disabled:opacity-60"
                >
                  {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
                  {isStarting ? "Starting…" : "Start Training"}
                </button>
                </div>
              </ModelMetadataGate>
            )}
          </main>
        </div>
      </div>
    </DatasetManagementLayout>
  );
}
