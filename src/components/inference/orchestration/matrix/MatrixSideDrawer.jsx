import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Search,
  Check,
  ChevronRight,
  ArrowLeft,
  Star,
  Sliders,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { getTaskMeta } from "../../../../constants/tasks";
import {
  getEffectiveContract,
  getDefaultConditioning,
  getDefaultParameters,
} from "../../plannerContractUtils";

/**
 * MatrixSideDrawer Component (Design B)
 *
 * 2-stage right slide-over drawer:
 * Stage 1: "BIND A MODEL" (Model selector)
 * Stage 2: "MODEL INPUTS" (Conditioning & parameter sliders)
 */
export default function MatrixSideDrawer({
  isOpen = false,
  onClose,
  target = null, // { task, labelId }
  labelsById = {},
  catalog = { models: [], retrieval_strategies: [] },
  draftBindings = [],
  onSaveRoute,
  onUnbindRoute,
  canEdit = true,
}) {
  const models = catalog?.models || [];
  const strategies = catalog?.retrieval_strategies || [];

  const task = target?.task || "prompted-segmentation";
  const labelId = target?.labelId ?? null;
  const label = labelId != null ? labelsById[labelId] : null;
  const taskMeta = getTaskMeta(task);

  // Existing binding for this exact (task, labelId)
  const existingBinding = useMemo(() => {
    if (!target) return null;
    return draftBindings.find(
      (b) => b.task === task && (labelId == null ? b.label_id == null : Number(b.label_id) === Number(labelId))
    );
  }, [draftBindings, target, task, labelId]);

  // Drawer View State: 'select' | 'configure'
  const [view, setView] = useState("select");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModelKey, setSelectedModelKey] = useState(null);
  const [inputs, setInputs] = useState({ conditioning: {}, parameters: {} });

  const drawerRef = useRef(null);

  // Compatible models for this task & label
  const compatibleModels = useMemo(() => {
    return models.filter((m) => {
      if (m.task !== task) return false;
      if (labelId == null) return true;
      return (
        !m.label_ids ||
        m.label_ids.length === 0 ||
        m.label_ids.includes(Number(labelId))
      );
    });
  }, [models, task, labelId]);

  // Filtered by search
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return compatibleModels;
    const q = searchQuery.toLowerCase();
    return compatibleModels.filter(
      (m) =>
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.registry_key && m.registry_key.toLowerCase().includes(q)) ||
        (m.description && m.description.toLowerCase().includes(q))
    );
  }, [compatibleModels, searchQuery]);

  // Reset drawer state when opened or target changes
  useEffect(() => {
    if (!isOpen || !target) return;

    setView("select");
    setSearchQuery("");

    if (existingBinding && existingBinding.model_registry_key) {
      setSelectedModelKey(existingBinding.model_registry_key);
      const model = models.find(
        (m) => m.task === task && m.registry_key === existingBinding.model_registry_key
      );
      const contract = model ? getEffectiveContract(model) : null;
      const defaultCond = getDefaultConditioning(contract, strategies, label);
      const defaultParams = getDefaultParameters(contract);

      setInputs({
        conditioning: {
          ...defaultCond,
          ...(existingBinding.inputs?.conditioning || {}),
        },
        parameters: {
          ...defaultParams,
          ...(existingBinding.inputs?.parameters || {}),
        },
      });
    } else {
      setSelectedModelKey(null);
      setInputs({ conditioning: {}, parameters: {} });
    }
  }, [isOpen, target, existingBinding, models, strategies, label, task]);

  // Selected model details
  const selectedModel = models.find(
    (m) => m.task === task && m.registry_key === selectedModelKey
  );
  const contract = selectedModel ? getEffectiveContract(selectedModel) : null;
  const condSpec = contract?.conditioning;
  const paramsSpec = contract?.parameters || [];

  const handleSelectModel = (modelKey) => {
    if (!canEdit) return;
    setSelectedModelKey(modelKey);
    const m = models.find((item) => item.task === task && item.registry_key === modelKey);
    const c = m ? getEffectiveContract(m) : null;
    const defaultCond = getDefaultConditioning(c, strategies, label);
    const defaultParams = getDefaultParameters(c);
    setInputs({
      conditioning: defaultCond,
      parameters: defaultParams,
    });
  };

  const handleConfigureClick = (modelKey, e) => {
    if (e) e.stopPropagation();
    handleSelectModel(modelKey);
    setView("configure");
  };

  const handleApplyRoute = () => {
    if (!selectedModelKey || !onSaveRoute) return;
    onSaveRoute(task, labelId, {
      model_registry_key: selectedModelKey,
      task,
      label_id: labelId,
      inputs,
    });
    onClose();
  };

  const handleUnbind = () => {
    if (!onUnbindRoute) return;
    onUnbindRoute(task, labelId);
    onClose();
  };

  if (!isOpen || !target) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Panel */}
      <div
        ref={drawerRef}
        className="relative w-full max-w-md bg-[#111722] border-l border-slate-800 shadow-2xl h-full flex flex-col z-10 text-xs overflow-hidden"
        data-testid="matrix-side-drawer"
      >
        {/* ================= STAGE 1: BIND A MODEL ================= */}
        {view === "select" && (
          <>
            {/* Header */}
            <div className="p-5 border-b border-slate-800/80 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-t3">
                  Bind a Model
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 rounded-lg text-t3 hover:text-t1 hover:bg-slate-800 transition"
                  aria-label="Close drawer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Breadcrumb pills */}
              <div className="flex items-center gap-2 mt-3">
                <span className="px-2 py-0.5 rounded text-[11px] font-medium text-teal-400 bg-teal-500/10 border border-teal-500/20">
                  {taskMeta.label}
                </span>
                <span className="text-slate-600">→</span>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium text-t1 bg-slate-800 border border-slate-700">
                  {labelId == null ? (
                    <>
                      <Star size={11} className="text-amber-400 fill-amber-400" />
                      <span>Task default</span>
                    </>
                  ) : (
                    <>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: label?.color || "#2dd4bf" }}
                      />
                      <span>{label?.name || "Label"}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative mt-4">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-t3 pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${compatibleModels.length} compatible models`}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-t1 placeholder:text-t3/50 focus:outline-none focus:border-teal-500/50"
                />
              </div>
            </div>

            {/* Model Cards List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {filteredModels.length === 0 ? (
                <div className="p-8 text-center text-t3 text-xs">
                  No compatible models found for this search.
                </div>
              ) : (
                filteredModels.map((m) => {
                  const isSelected = selectedModelKey === m.registry_key;
                  const isTrained = m.is_fine_tuned || m.is_trained_here;

                  return (
                    <div
                      key={m.registry_key}
                      onClick={() => handleSelectModel(m.registry_key)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? "border-teal-500/50 bg-teal-950/20 shadow-xs"
                          : "border-slate-800 bg-[#141b27] hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-t1 truncate">
                              {m.name || m.registry_key}
                            </span>
                            {isTrained && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/30">
                                trained here
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-t3 truncate mt-0.5">
                            {m.description || (m.label_ids?.length ? `${m.label_ids.length} class model` : "Class-agnostic")}
                          </p>
                        </div>

                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-teal-500 text-slate-950 flex items-center justify-center shrink-0 mt-0.5">
                            <Check size={11} strokeWidth={3} />
                          </div>
                        )}
                      </div>

                      {/* Badges and Configure Link */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/40 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          {m.latency_badge && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-800/80 text-t3 border border-slate-700/60">
                              {m.latency_badge}
                            </span>
                          )}
                          {m.model_size && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-800/80 text-t3 border border-slate-700/60">
                              {m.model_size}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleConfigureClick(m.registry_key, e)}
                          className="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300 font-medium transition"
                        >
                          <span>configure</span>
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Helper Note */}
              <div className="p-3.5 rounded-xl border border-slate-800/60 bg-slate-900/40 text-t3 text-[11px] leading-relaxed">
                Leaving this cell unbound keeps it on the task default. Clearing the task default stops the task from running.
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800/80 bg-[#0d121a] flex items-center justify-between gap-3 shrink-0">
              <div>
                {existingBinding ? (
                  <button
                    type="button"
                    onClick={handleUnbind}
                    className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 font-medium transition"
                  >
                    <Trash2 size={13} />
                    <span>Unbind Route</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-t3 hover:text-t1 font-medium transition"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div>
                {selectedModelKey ? (
                  <button
                    type="button"
                    onClick={handleApplyRoute}
                    className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold shadow-xs transition"
                  >
                    Save route
                  </button>
                ) : (
                  <span className="text-t3/70 text-[11px]">
                    Pick a model to set its inputs
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {/* ================= STAGE 2: MODEL INPUTS ================= */}
        {view === "configure" && selectedModel && (
          <>
            {/* Header with back arrow */}
            <div className="p-5 border-b border-slate-800/80 shrink-0">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setView("select")}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-semibold transition"
                >
                  <ArrowLeft size={14} />
                  <span>models · INPUTS</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 rounded-lg text-t3 hover:text-t1 hover:bg-slate-800 transition"
                  aria-label="Close drawer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-3">
                <h3 className="text-base font-bold text-t1">
                  {selectedModel.name || selectedModel.registry_key}
                </h3>
                <p className="text-[11px] text-t3/70 font-mono truncate mt-0.5">
                  registry://{selectedModel.registry_key}/contract
                </p>
              </div>
            </div>

            {/* Inputs & Conditioning sliders */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Conditioning */}
              {condSpec && condSpec.kind !== "none" && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-t3">
                    Conditioning
                  </h4>

                  {/* Prompt concept */}
                  <div>
                    <label className="block text-xs font-medium text-t2 mb-1.5">
                      Prompt concept
                    </label>
                    <input
                      type="text"
                      value={label?.name || ""}
                      disabled
                      className="w-full px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-t1"
                    />
                  </div>

                  {/* Count presets */}
                  {condSpec.user_selectable_count && (
                    <div>
                      <label className="block text-xs font-medium text-t2 mb-1.5">
                        {condSpec.unit === "instance" ? "Instances count" : "Exemplars count"}
                      </label>
                      <div className="flex items-center gap-2">
                        {[5, 10, 20].map((countVal) => {
                          const currentCount = inputs.conditioning?.count ?? 5;
                          const isActive = currentCount === countVal;

                          return (
                            <button
                              key={countVal}
                              type="button"
                              onClick={() =>
                                setInputs((prev) => ({
                                  ...prev,
                                  conditioning: { ...prev.conditioning, count: countVal },
                                }))
                              }
                              className={`flex-1 py-2 rounded-xl border font-mono text-xs font-semibold transition ${
                                isActive
                                  ? "border-teal-500 bg-teal-950/30 text-teal-300"
                                  : "border-slate-800 bg-slate-900/50 text-t3 hover:text-t1 hover:border-slate-700"
                              }`}
                            >
                              {countVal}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Parameters */}
              <div className="space-y-5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-t3">
                  Parameters
                </h4>

                {paramsSpec.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-center text-t3 text-xs">
                    This model has no configurable hyper-parameters.
                  </div>
                ) : (
                  paramsSpec.map((param) => {
                    const currentVal =
                      inputs.parameters?.[param.key] ?? param.default_value ?? 0;
                    const min = param.min_value ?? 0;
                    const max = param.max_value ?? 1;
                    const step = param.type === "int" ? 1 : 0.01;

                    return (
                      <div key={param.key} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <label className="font-semibold text-t1">
                            {param.label || param.key}
                          </label>
                          <span className="font-mono text-t2">
                            {typeof currentVal === "number" ? currentVal.toFixed(2) : currentVal}
                          </span>
                        </div>

                        {param.type === "float" || param.type === "int" ? (
                          <input
                            type="range"
                            min={min}
                            max={max}
                            step={step}
                            value={currentVal}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setInputs((prev) => ({
                                ...prev,
                                parameters: {
                                  ...prev.parameters,
                                  [param.key]: val,
                                },
                              }));
                            }}
                            className="w-full accent-teal-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                          />
                        ) : null}

                        {param.description && (
                          <p className="text-[11px] text-t3">
                            {param.description}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800/80 bg-[#0d121a] flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setView("select")}
                className="px-4 py-2 rounded-xl border border-slate-800 bg-slate-900/60 text-t1 hover:bg-slate-800 transition font-medium text-xs"
              >
                Back
              </button>

              <button
                type="button"
                onClick={handleApplyRoute}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold shadow-xs transition"
              >
                <span>Apply route</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
