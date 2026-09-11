import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  GraduationCap, Plus, Cpu, StopCircle, Loader2, ChevronDown, ChevronRight, Clock, Sparkles, AlertTriangle,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import DatasetManagementLayout from "../components/datasets/gallery/DatasetManagementLayout";
import { useDataset } from "../contexts/DatasetContext";
import DynamicHyperParameter from "../components/datasets/training/DynamicHyperParameter";
import {
  fetchLabels,
  getInstanceModels,
  getInstanceTrainingRuns,
  startInstanceTraining,
  cancelInstanceTraining,
  streamInstanceTrainingProgress,
  getInstanceLabelAnnotationCounts,
} from "../api";
import useThemeColors from "../hooks/useThemeColors";

const TERMINAL = new Set(["SUCCESS", "FAILED", "CANCELLED", "TIMED_OUT"]);

const STATE_LABEL = {
  STARTING: "Starting",
  PROGRESS: "In progress",
  SUCCESS: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  TIMED_OUT: "Timed out",
  starting: "Starting",
};

const STATE_STYLE = {
  STARTING: "bg-well text-t2",
  PROGRESS: "bg-acS text-ac",
  SUCCESS: "bg-okBg text-ok",
  FAILED: "bg-errBg text-err",
  CANCELLED: "bg-warnBg text-warn",
  TIMED_OUT: "bg-errBg text-err",
  starting: "bg-well text-t2",
};

const STARTING_WARNING_AFTER_MS = 60_000;
const STARTING_WARNING_TEXT =
  "This is taking longer than usual. Training will be cancelled if a worker does not become available in time.";
const FALLBACK_TIMEOUT_MESSAGE =
  "Training did not start before the queue deadline.";

const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString() : "—");
const lastLoss = (snap) => (snap?.loss?.length ? snap.loss[snap.loss.length - 1].value : null);
const formatScore = (value) => {
  const numeric = Number(value);
  return value == null || value === "" || !Number.isFinite(numeric)
    ? "—"
    : `${(numeric * 100).toFixed(1)}%`;
};
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
  validation_metrics: snapshot.validation_metrics ?? run.validation_metrics,
  validation_metrics_unavailable: snapshot.validation_metrics_unavailable
    ?? run.validation_metrics_unavailable,
  start_time: snapshot.start_time ?? run.start_time,
  queued_at: snapshot.queued_at ?? run.queued_at,
  start_deadline: snapshot.start_deadline ?? run.start_deadline,
});


const getRunNameError = (value) => {
  if (value.length === 0) return null;
  if (value.length > 80) return "Run name must be 80 characters or fewer.";
  if (!RUN_NAME_PATTERN.test(value)) {
    return "Run name may contain only letters, numbers, underscores, hyphens, and whitespace.";
  }
  return null;
};

function RunCard({ run, selected, onClick }) {
  const displayLabel = STATE_LABEL[run.state] || run.state || "Unknown";
  const badgeStyle = STATE_STYLE[run.state] || STATE_STYLE.STARTING;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-colors ${
        selected ? "border-acLn bg-acS" : "border-ln bg-p1 hover:bg-hv"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeStyle}`}>
          {displayLabel}
        </span>
        <span className="text-[11px] text-t3 flex items-center gap-1">
          <Clock size={11} /> {fmtTime(run.start_time)}
        </span>
      </div>
      <div className="text-xs text-t2">
        {run.run_name && (
          <p className="text-xs font-medium text-t1 truncate mb-0.5">{run.run_name}</p>
        )}
        {(run.label_ids?.length ?? 0)} class{(run.label_ids?.length ?? 0) === 1 ? "" : "es"}
        {run.total_epochs ? ` · ${run.epoch}/${run.total_epochs} epochs` : ""}
        {lastLoss(run) != null ? ` · loss ${lastLoss(run).toFixed(3)}` : ""}
      </div>
    </button>
  );
}

function ValidationMetrics({ metrics, labels }) {
  if (!metrics) return null;
  const labelNames = new Map((labels || []).map((label) => [Number(label.id), label.name]));
  const rows = Array.isArray(metrics.per_label) ? metrics.per_label : [];
  const hasInstanceMetrics = [metrics.ap, metrics.ap50, metrics.ap75]
    .some((value) => value != null && value !== "");

  return (
    <div className="p-4 rounded-lg border border-ln bg-well">
      <h3 className="text-sm font-semibold text-t1">Performance metrics</h3>
      <p className="text-[11px] text-t3 mt-1 mb-3">
        Checked on images that were not used during training. For every score below, higher is better.
      </p>
      {hasInstanceMetrics && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-t1">Instance metrics</h4>
          <p className="text-[11px] text-t3 mt-1 mb-3">
            AP (average precision) shows how well the model finds complete objects while balancing missed objects and extra detections.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
            <div className="p-3 rounded-lg bg-p1 border border-acLn">
              <span className="block text-[11px] text-t3">AP (primary instance score)</span>
              <span className="block mt-1 text-2xl font-semibold text-t1">{formatScore(metrics.ap)}</span>
            </div>
            <div className="p-3 rounded-lg bg-p1 border border-ln">
              <span className="block text-[11px] text-t3">AP50 · 50% overlap match</span>
              <span className="block mt-1 text-2xl font-semibold text-t1">{formatScore(metrics.ap50)}</span>
            </div>
            <div className="p-3 rounded-lg bg-p1 border border-ln">
              <span className="block text-[11px] text-t3">AP75 · 75% overlap match</span>
              <span className="block mt-1 text-2xl font-semibold text-t1">{formatScore(metrics.ap75)}</span>
            </div>
          </div>
        </div>
      )}
      <div className="border-t border-ln pt-4">
        <h4 className="text-xs font-semibold text-t1">Pixel/mask-area metrics</h4>
        <p className="text-[11px] text-t3 mt-1 mb-3">
          These scores compare the predicted mask area with the real mask area.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-t3 mb-4">
          <p><span className="font-medium text-t2">IoU:</span> how much the predicted area overlaps the real area.</p>
          <p><span className="font-medium text-t2">F1 score:</span> balance between missed and extra predicted area.</p>
          <p><span className="font-medium text-t2">Pixel precision:</span> how much of the predicted area is correct.</p>
          <p><span className="font-medium text-t2">Recall:</span> how much of the real area the model found.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-p1 border border-ln">
            <span className="block h-8 text-[11px] text-t3">Overall IoU (higher is better)</span>
            <span className="text-lg font-semibold text-t1">{formatScore(metrics.macro_iou)}</span>
          </div>
          <div className="p-3 rounded-lg bg-p1 border border-ln">
            <span className="block h-8 text-[11px] text-t3">Overall F1 (higher is better)</span>
            <span className="text-lg font-semibold text-t1">{formatScore(metrics.macro_f1)}</span>
          </div>
          <div className="p-3 rounded-lg bg-p1 border border-ln">
            <span className="block h-8 text-[11px] text-t3">Pixel precision (higher is better)</span>
            <span className="text-lg font-semibold text-t1">{formatScore(metrics.macro_precision)}</span>
          </div>
          <div className="p-3 rounded-lg bg-p1 border border-ln">
            <span className="block h-8 text-[11px] text-t3">Overall recall (higher is better)</span>
            <span className="text-lg font-semibold text-t1">{formatScore(metrics.macro_recall)}</span>
          </div>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-t3 border-b border-ln">
                <th className="py-2 pr-3 font-medium">Label</th>
                <th className="py-2 px-3 font-medium text-right">IoU</th>
                <th className="py-2 px-3 font-medium text-right">F1 score</th>
                <th className="py-2 px-3 font-medium text-right">Precision</th>
                <th className="py-2 pl-3 font-medium text-right">Recall</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label_id} className="border-b border-ln last:border-0">
                  <td className="py-2 pr-3 text-t1">
                    {labelNames.get(Number(row.label_id)) || `Label ${row.label_id}`}
                  </td>
                  <td className="py-2 px-3 text-right text-t2">{formatScore(row.iou)}</td>
                  <td className="py-2 px-3 text-right text-t2">{formatScore(row.f1)}</td>
                  <td className="py-2 px-3 text-right text-t2">{formatScore(row.precision)}</td>
                  <td className="py-2 pl-3 text-right text-t2">{formatScore(row.recall)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProgressPanel({ snapshot, labels, onStop, isStopping }) {
  const { colors } = useThemeColors();
  const total = snapshot.total_epochs || 0;
  const current = snapshot.epoch || 0;
  const percent = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const lossData = (snapshot.loss || []).map((d) => ({ epoch: d.epoch, loss: d.value }));
  const trainingParameters = snapshot.training_parameters || {};

  const isTerminal = TERMINAL.has(snapshot.state);
  const isStarting = snapshot.state === "STARTING" || snapshot.state === "starting";
  const canStop = !isTerminal && Boolean(snapshot.task_id);

  const displayLabel = STATE_LABEL[snapshot.state] || snapshot.state || "Unknown";
  const badgeStyle = STATE_STYLE[snapshot.state] || STATE_STYLE.STARTING;

  // Delayed-start warning interval: updates every second while in STARTING state
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isStarting) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isStarting]);

  const queuedMs = snapshot.queued_at != null
    ? snapshot.queued_at * 1000
    : snapshot.start_time;
  const elapsedMs = queuedMs != null ? now - queuedMs : 0;
  const showSlowStartWarning = isStarting && elapsedMs >= STARTING_WARNING_AFTER_MS;

  // Terminal message resolution
  let terminalMessage = null;
  if (snapshot.state === "TIMED_OUT") {
    terminalMessage = snapshot.message || FALLBACK_TIMEOUT_MESSAGE;
  } else if (snapshot.state === "FAILED") {
    terminalMessage = snapshot.message || "Training failed.";
  } else if (snapshot.state === "CANCELLED") {
    terminalMessage = snapshot.message || "Training cancelled.";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-t2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeStyle}`}>
          {displayLabel}
        </span>
        {isStarting ? (
          <span className="flex items-center gap-1">
            <Loader2 className="w-4 h-4 animate-spin" /> Waiting for worker…
          </span>
        ) : snapshot.state === "PROGRESS" ? (
          <span className="flex items-center gap-1">
            <Cpu className="w-4 h-4 text-ac" /> Epoch {current}{total ? ` / ${total}` : ""}
          </span>
        ) : null}
      </div>

      {showSlowStartWarning && (
        <div
          role="status"
          className="flex items-center gap-2 p-3 bg-warnBg border border-warnLn rounded-lg text-sm text-warn"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{STARTING_WARNING_TEXT}</span>
        </div>
      )}

      {isTerminal && terminalMessage && (
        <div
          role={snapshot.state === "FAILED" || snapshot.state === "TIMED_OUT" ? "alert" : "status"}
          className={`p-3 rounded-lg border text-sm ${
            snapshot.state === "CANCELLED"
              ? "bg-warnBg border-warnLn text-warn"
              : "bg-errBg border-errLn text-err"
          }`}
        >
          <p className="font-medium">{terminalMessage}</p>
        </div>
      )}

      {Object.keys(trainingParameters).length > 0 && (
        <div className="p-3 rounded-lg border border-ln bg-well">
          <h3 className="text-sm font-semibold text-t1 mb-2">Training configuration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {Object.entries(trainingParameters).map(([key, value]) => (
              <div key={key}>
                <span className="block text-t3 capitalize">{key.replace(/_/g, " ")}</span>
                <span className="font-medium text-t1">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {total > 0 && (
        <div className="w-full bg-hv2 rounded h-2">
          <div className="bg-accent h-2 rounded" style={{ width: `${percent}%`, transition: "width 0.5s" }} />
        </div>
      )}

      {lossData.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-t1">Training loss</h3>
          <p className="text-[11px] text-t3 mb-2">
            Mask2Former training loss, averaged per epoch. Lower is better. This is a debugging signal, not the model-quality score.
          </p>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lossData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.ln2} />
                <XAxis
                  dataKey="epoch"
                  tick={{ fontSize: 11, fill: colors.t2 }}
                  label={{ value: "epoch", position: "insideBottom", offset: -10, fontSize: 11, fill: colors.t3 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: colors.t2 }}
                  width={56}
                  label={{ value: "loss", angle: -90, position: "insideLeft", fontSize: 11, fill: colors.t3 }}
                />
                <Tooltip
                  formatter={(value) => [Number(value).toFixed(4), "loss"]}
                  labelFormatter={(epoch) => `Epoch ${epoch}`}
                  contentStyle={{ backgroundColor: colors.p2, border: `1px solid ${colors.ln}`, borderRadius: '8px', color: colors.t1 }}
                  labelStyle={{ color: colors.t2 }}
                />
                <Line type="monotone" dataKey="loss" stroke={colors.ac} dot={false} name="Training loss" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="text-sm text-t3">No loss logged yet.</p>
      )}

      {snapshot.validation_metrics ? (
        <ValidationMetrics metrics={snapshot.validation_metrics} labels={labels} />
      ) : snapshot.validation_metrics_unavailable ? (
        <p className="text-sm text-t3">
          Validation metrics are unavailable because this dataset does not have enough images for a held-out set.
        </p>
      ) : null}

      {canStop && (
        <button
          onClick={onStop}
          disabled={isStopping}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-onAccent bg-err rounded-lg hover:brightness-110 transition-colors disabled:opacity-60"
        >
          {isStopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
          {isStopping ? "Stopping…" : "Stop Training"}
        </button>
      )}
    </div>
  );
}

export default function ModelTrainingPage() {
  const { datasetId } = useParams();
  const { currentDataset } = useDataset();

  const [labels, setLabels] = useState([]);
  const [models, setModels] = useState([]);
  const [modelKey, setModelKey] = useState("");
  const [modelLoadStatus, setModelLoadStatus] = useState("loading");
  const [modelLoadError, setModelLoadError] = useState(null);
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
  const [modelRunName, setModelRunName] = useState("");

  const streamRef = useRef(null);
  const restoredDatasetIdRef = useRef(null);
  const currentDatasetIdRef = useRef(datasetId);
  const activeTaskDatasetIdRef = useRef(null);
  currentDatasetIdRef.current = datasetId;

  const selectedModel = useMemo(
    () => models.find((m) => m.registry_key === modelKey) || null,
    [models, modelKey]
  );

  const loadRuns = useCallback(async () => {
    try {
      const res = await getInstanceTrainingRuns(datasetId);
      if (currentDatasetIdRef.current !== datasetId) return;
      const serverRuns = Array.isArray(res?.runs) ? res.runs : [];
      const sortedServerRuns = [...serverRuns].sort(
        (a, b) => (b.start_time || 0) - (a.start_time || 0)
      );

      setRuns((currentRuns) => {
        const serverTaskIds = new Set(serverRuns.map((run) => run.task_id).filter(Boolean));
        const pendingLocalRuns = currentRuns.filter(
          (run) => run.task_id && !serverTaskIds.has(run.task_id) && !TERMINAL.has(run.state)
        );
        return [...serverRuns, ...pendingLocalRuns]
          .sort((a, b) => (b.start_time || 0) - (a.start_time || 0));
      });

      // Restore active run only once per dataset load
      if (restoredDatasetIdRef.current !== datasetId) {
        restoredDatasetIdRef.current = datasetId;
        const newestActiveRun = sortedServerRuns.find(
          (run) => !TERMINAL.has(run.state) && Boolean(run.task_id)
        );
        if (newestActiveRun) {
          setMode("run");
          setSelectedRun(newestActiveRun);
          activeTaskDatasetIdRef.current = datasetId;
          setActiveTaskId(newestActiveRun.task_id);
        }
      }
    } catch (e) {
      // non-fatal
    }
  }, [datasetId]);

  // Initial load: labels, models, runs.
  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    streamRef.current?.abort();
    streamRef.current = null;
    restoredDatasetIdRef.current = null;
    setRuns([]);
    setMode("config");
    setSelectedRun(null);
    activeTaskDatasetIdRef.current = null;
    setActiveTaskId(null);
    setIsStarting(false);
    setIsStopping(false);
    setModels([]);
    setModelKey("");
    setModelLoadStatus("loading");
    setModelLoadError(null);
    setLabels([]);
    setSelectedLabelIds(new Set());
    setAnnotationCountStatus("loading");
    setAnnotationCounts({});
    (async () => {
      let loadedLabels = [];
      try {
        const labelRes = await fetchLabels(datasetId);
        if (cancelled) return;
        const idMap = labelRes?.labels?.id_to_label_object || {};
        loadedLabels = Object.values(idMap).map((l) => ({ id: l.id, name: l.name }));
        setLabels(loadedLabels);
        setSelectedLabelIds(new Set(loadedLabels.map((l) => l.id)));
      } catch (e) {
        if (cancelled) return;
        setError(e.message || "Failed to load labels.");
      }
      try {
        const modelRes = await getInstanceModels();
        if (cancelled) return;
        const list = Array.isArray(modelRes?.result)
          ? modelRes.result.filter((model) => model?.registry_key && model.trainable === true)
          : [];
        if (modelRes?.success !== true || list.length === 0) {
          throw new Error("No trainable instance segmentation models are available.");
        }
        setModels(list);
        setModelKey(list[0].registry_key);
        setModelLoadStatus("success");
      } catch (e) {
        if (cancelled) return;
        setModels([]);
        setModelKey("");
        setModelLoadStatus("error");
        setModelLoadError(e.message || "Unable to load trainable instance segmentation models.");
      }
      try {
        const countRes = await getInstanceLabelAnnotationCounts(datasetId);
        if (cancelled) return;
        if (countRes?.success !== true || !countRes.reviewed_annotation_counts) {
          throw new Error("Annotation counts were not returned.");
        }
        const reviewedCounts = countRes.reviewed_annotation_counts;
        setAnnotationCounts(reviewedCounts);
        setAnnotationCountStatus("success");
        const positiveLabelIds = new Set(
          loadedLabels
            .filter((label) => Number(reviewedCounts[label.id]) > 0)
            .map((label) => label.id)
        );
        setSelectedLabelIds((current) => new Set(
          [...current].filter((id) => positiveLabelIds.has(id))
        ));
      } catch {
        if (cancelled) return;
        setAnnotationCountStatus("error");
      }
    })();
    loadRuns();
    return () => {
      cancelled = true;
    };
  }, [datasetId, loadRuns]);

  // Initialize hyperparameter values from the selected model's declared defaults.
  useEffect(() => {
    if (!selectedModel) return;
    const defaults = {};
    (selectedModel.training_parameters || []).forEach((p) => { defaults[p.key] = p.default_value; });
    setHyperValues(defaults);
  }, [selectedModel]);

  // Stream progress for the active task; tear down on change/unmount.
  useEffect(() => {
    if (!activeTaskId || activeTaskDatasetIdRef.current !== datasetId) return;
    const controller = streamInstanceTrainingProgress(
      activeTaskId,
      (snap) => {
        setSelectedRun((currentRun) => (currentRun ? mergeRunSnapshot(currentRun, snap) : snap));
        setRuns((currentRuns) => {
          const matchingIndex = currentRuns.findIndex(
            (run) => run.task_id === snap.task_id || (snap.run_id && run.run_id === snap.run_id)
          );
          if (matchingIndex === -1) return [snap, ...currentRuns];
          return currentRuns.map((run, index) => (
            index === matchingIndex ? mergeRunSnapshot(run, snap) : run
          ));
        });
        if (TERMINAL.has(snap.state)) {
          activeTaskDatasetIdRef.current = null;
          setActiveTaskId(null);
          loadRuns();
        }
      },
      (err) => setError(err.message || "Lost connection to training stream."),
    );
    streamRef.current = controller;
    return () => controller.abort();
  }, [activeTaskId, datasetId, loadRuns]);

  const setHyper = (key, value) => setHyperValues((prev) => ({ ...prev, [key]: value }));

  const toggleLabel = (id) => setSelectedLabelIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const countKnown = annotationCountStatus === "success";
  const selectableLabels = countKnown
    ? labels.filter((label) => Number(annotationCounts[label.id]) > 0)
    : [];
  const hasInvalidSelectedLabel = countKnown && [...selectedLabelIds].some(
    (id) => !(Number(annotationCounts[id]) > 0)
  );
  const selectionSummary = countKnown
    ? `${selectedLabelIds.size}/${selectableLabels.length}`
    : annotationCountStatus === "loading" ? "checking counts…" : "counts unavailable";

  const handleStart = async () => {
    if (
      modelLoadStatus !== "success" ||
      annotationCountStatus !== "success" ||
      !selectedModel ||
      getRunNameError(modelRunName) ||
      hasInvalidSelectedLabel
    ) return;
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
      const labelIds = Array.from(selectedLabelIds);
      const optimisticRun = {
        task_id: res.task_id,
        run_id: null,
        state: "STARTING",
        training_state: "starting",
        queued_at: Date.now() / 1000,
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
      activeTaskDatasetIdRef.current = datasetId;
      setActiveTaskId(res.task_id);
      loadRuns();
    } catch (err) {
      setError(err.message || "Failed to start training.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    const targetTaskId = activeTaskId || selectedRun?.task_id;
    if (!targetTaskId) return;
    setIsStopping(true);
    try {
      const snapshot = await cancelInstanceTraining(targetTaskId);
      setSelectedRun((currentRun) => (currentRun ? mergeRunSnapshot(currentRun, snapshot) : snapshot));
    } catch (err) {
      setError(err.message || "Failed to stop training.");
      return;
    } finally {
      setIsStopping(false);
    }
    activeTaskDatasetIdRef.current = null;
    setActiveTaskId(null);
    loadRuns();
  };

  const handleSelectRun = (run) => {
    setMode("run");
    setSelectedRun(run);
    // Keep streaming a still-running run; otherwise show its static snapshot.
    const nextTaskId = !TERMINAL.has(run.state) && run.task_id ? run.task_id : null;
    activeTaskDatasetIdRef.current = nextTaskId ? datasetId : null;
    setActiveTaskId(nextTaskId);
  };


  const handleNewTraining = () => {
    activeTaskDatasetIdRef.current = null;
    setActiveTaskId(null);
    setSelectedRun(null);
    setMode("config");
  };

  const allSelected = selectableLabels.length > 0 &&
    selectedLabelIds.size === selectableLabels.length &&
    selectableLabels.every((label) => selectedLabelIds.has(label.id));
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
              {runs.length === 0 && <p className="text-xs text-t3 px-1">No runs yet.</p>}
              {runs.map((run) => (
                <RunCard
                  key={run.run_id || run.task_id}
                  run={run}
                  selected={
                    mode === "run" &&
                    selectedRun &&
                    ((selectedRun.run_id && selectedRun.run_id === run.run_id) ||
                      (selectedRun.task_id && selectedRun.task_id === run.task_id))
                  }
                  onClick={() => handleSelectRun(run)}
                />
              ))}
            </div>
          </aside>

          {/* Right: config or progress */}
          <main className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 p-3 bg-errBg border border-errLn rounded-lg text-sm text-err">{error}</div>
            )}

            {mode === "run" && selectedRun ? (
              <div className="max-w-3xl">
                <ProgressPanel snapshot={selectedRun} labels={labels} onStop={handleStop} isStopping={isStopping} />
              </div>
            ) : (
              <div className="max-w-2xl">
                {modelLoadStatus === "loading" && (
                  <div className="p-4 rounded-xl border border-ln bg-well" role="status">
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-hv text-t3 cursor-not-allowed"
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading models…
                    </button>
                  </div>
                )}

                {modelLoadStatus === "error" && (
                  <div className="p-4 rounded-xl border border-errLn bg-errBg text-sm text-err" role="alert">
                    <p className="font-medium">Unable to load model configuration.</p>
                    <p className="mt-1">{modelLoadError}</p>
                  </div>
                )}

                {modelLoadStatus === "success" && (
                  <div className="space-y-6">
                {/* Model */}
                <div>
                  <label className="block text-sm font-medium text-t1 mb-1">Model</label>
                  <select
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
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-t1">Classes to train ({selectionSummary})</label>
                    <button
                      type="button"
                      onClick={() => setSelectedLabelIds(allSelected ? new Set() : new Set(selectableLabels.map((l) => l.id)))}
                      disabled={selectableLabels.length === 0}
                      className="text-xs text-ac hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {allSelected ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  {annotationCountStatus === "loading" && (
                    <p className="text-[11px] text-t3 mb-1" role="status">Checking reviewed annotation counts. Training will be available once they finish loading.</p>
                  )}
                  {annotationCountStatus === "error" && (
                    <p className="text-[11px] text-t3 mb-1" role="status">
                      Reviewed annotation counts are unavailable, so training is disabled until they can be loaded.
                    </p>
                  )}
                  <div className="max-h-44 overflow-y-auto border border-ln rounded-lg divide-y divide-ln">
                    {labels.length === 0 && <p className="text-xs text-t3 p-3">This dataset has no labels.</p>}
                    {labels.map((l) => {
                      const count = countKnown ? (annotationCounts[l.id] ?? 0) : null;
                      const hasReviewedAnnotations = countKnown && Number(count) > 0;
                      const disabled = countKnown && !hasReviewedAnnotations;
                      return (
                        <label
                          key={l.id}
                          className={`flex items-center gap-2 px-3 py-2 text-sm ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-hv"}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedLabelIds.has(l.id)}
                            onChange={() => toggleLabel(l.id)}
                            disabled={disabled}
                            className="h-4 w-4"
                          />
                          <span className="flex-1">{l.name}</span>
                          {disabled && <span className="text-[10px] text-t3">No reviewed annotations</span>}
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${countKnown
                              ? (hasReviewedAnnotations ? "bg-okBg text-ok" : "bg-well text-t3")
                              : "bg-well text-t3"
                            }`}
                            title={countKnown
                              ? `${count} reviewed annotation${count === 1 ? "" : "s"}`
                              : "Annotation count unavailable"}
                          >
                            {countKnown ? count : (annotationCountStatus === "loading" ? "…" : "—")}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-t3 mt-1">Multiclass by default — labels with reviewed annotations are selected. Deselect to train a smaller model.</p>
                  {countKnown && labels.length > 0 && selectableLabels.length === 0 && (
                    <p className="text-xs text-t3 mt-2" role="status">
                      No trainable labels yet. Review annotations for at least one label before training.
                    </p>
                  )}
                </div>

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

                {hasActiveRun && (
                  <div className="flex items-center gap-2 p-3 bg-warnBg border border-warnLn rounded-lg text-sm text-warn">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    A training run is still active. Starting another may cause GPU memory contention.
                  </div>
                )}

                <button
                  onClick={handleStart}
                  disabled={modelLoadStatus !== "success" || annotationCountStatus !== "success" || !selectedModel || isStarting || selectedLabelIds.size === 0 || hasInvalidSelectedLabel || Boolean(runNameError)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-onAccent bg-accent rounded-lg hover:brightness-110 transition-colors disabled:opacity-60"
                >
                  {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
                  {isStarting ? "Starting…" : "Start Training"}
                </button>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </DatasetManagementLayout>
  );
}
