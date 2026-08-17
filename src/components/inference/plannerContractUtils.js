/**
 * Utilities for model-declared inference input contracts (Issue #27).
 *
 * Provides contract resolution, default initialization, conditioning and parameter
 * updates, and canonical inputs formatting without model-name or task-specific UI branches.
 */

export const LEGACY_TASK_DEFAULTS = {
  "instance-segmentation": {
    schema_version: 1,
    task: "instance-segmentation",
    conditioning: {
      kind: "none",
      unit: null,
      min_units: 0,
      max_units: null,
      requires_complete_annotation: false,
      embedding_kinds: [],
      user_selectable_count: false,
    },
    parameters: [
      {
        key: "threshold",
        label: "Confidence Threshold",
        type: "float",
        default_value: 0.5,
        min_value: 0.0,
        max_value: 1.0,
        step: 0.05,
      },
    ],
  },
  "cross-image-suggestion": {
    schema_version: 1,
    task: "cross-image-suggestion",
    conditioning: {
      kind: "reference_images",
      unit: "image",
      min_units: 1,
      max_units: 1,
      requires_complete_annotation: true,
      embedding_kinds: [],
      user_selectable_count: false,
    },
    parameters: [
      {
        key: "threshold",
        label: "Confidence Threshold",
        type: "float",
        default_value: 0.3,
        min_value: 0.0,
        max_value: 1.0,
        step: 0.05,
      },
      {
        key: "mask_threshold",
        label: "Mask Threshold",
        type: "float",
        default_value: 0.5,
        min_value: 0.0,
        max_value: 1.0,
        step: 0.05,
      },
      {
        key: "min_target_frac",
        label: "Min Target Fraction",
        type: "float",
        default_value: 0.5,
        min_value: 0.0,
        max_value: 1.0,
        step: 0.05,
      },
    ],
    notes: "Legacy default contract for cross-image exemplar transfer.",
  },
};

/**
 * Returns the effective input contract for a model option, falling back to legacy task defaults.
 */
export const getEffectiveContract = (model) => {
  if (model?.input_contract) return model.input_contract;
  const task = model?.task || "instance-segmentation";
  return LEGACY_TASK_DEFAULTS[task] || LEGACY_TASK_DEFAULTS["instance-segmentation"];
};

/**
 * Returns a map of default parameter values declared in the contract.
 */
export const getDefaultParameters = (contract) => {
  const params = {};
  if (!contract?.parameters) return params;
  contract.parameters.forEach((p) => {
    params[p.key] = p.default_value;
  });
  return params;
};

/**
 * Returns default conditioning fields derived from the contract's conditioning spec.
 */
export const getDefaultConditioning = (contract, strategies = [], label = null) => {
  const condSpec = contract?.conditioning;
  const kind = condSpec?.kind || "none";

  if (kind === "none") {
    return {};
  }

  if (kind === "concept_text") {
    return {
      concept_text: label?.name || "",
    };
  }

  const minUnits = condSpec?.min_units ?? 0;
  const maxUnits = condSpec?.max_units ?? null;
  const selectable = Boolean(condSpec?.user_selectable_count);

  let count = 1;
  if (selectable) {
    count = 5;
    if (minUnits > count) count = minUnits;
    if (maxUnits !== null && count > maxUnits) count = maxUnits;
  } else {
    count = maxUnits !== null ? maxUnits : (minUnits > 0 ? minUnits : 1);
  }

  const result = { count };

  if (kind === "reference_images") {
    const availableStrategy = strategies.find((s) => s.available)?.key || strategies[0]?.key || "global_scene";
    result.strategy = availableStrategy;
  }

  return result;
};

/**
 * Initializes a new step record when a model is bound to a label.
 */
export const initStep = (label, model, strategies = []) => {
  if (!model || !label) return null;
  const contract = getEffectiveContract(model);
  const parameters = getDefaultParameters(contract);
  const conditioning = getDefaultConditioning(contract, strategies, label);

  const step = {
    label_id: label.id,
    model_registry_key: model.registry_key,
    task: model.task,
    inputs: {
      conditioning,
      parameters,
    },
    // Legacy migration compatibility fields
    min_confidence: parameters.threshold ?? 0,
    retrieval_strategy: conditioning.strategy ?? null,
    top_k: conditioning.count ?? 5,
  };

  return step;
};

/**
 * Updates a parameter in the step's canonical inputs envelope and syncs legacy fields.
 */
export const updateStepParameter = (step, key, value) => {
  if (!step) return step;
  const nextParameters = {
    ...(step.inputs?.parameters || {}),
    [key]: value,
  };

  return {
    ...step,
    inputs: {
      ...(step.inputs || {}),
      parameters: nextParameters,
    },
    min_confidence: key === "threshold" && typeof value === "number" ? value : step.min_confidence,
  };
};

/**
 * Updates a conditioning field in the step's canonical inputs envelope and syncs legacy fields.
 */
export const updateStepConditioning = (step, key, value) => {
  if (!step) return step;
  const nextConditioning = {
    ...(step.inputs?.conditioning || {}),
    [key]: value,
  };

  return {
    ...step,
    inputs: {
      ...(step.inputs || {}),
      conditioning: nextConditioning,
    },
    top_k: key === "count" && typeof value === "number" ? value : step.top_k,
    retrieval_strategy: key === "strategy" ? value : step.retrieval_strategy,
  };
};
