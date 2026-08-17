import React from "react";

/**
 * Renders a single parameter input, driven by the model-declared descriptor
 * (see iquana_toolbox HyperParameter). The widget is inferred from the descriptor:
 *   - `options` set            -> dropdown
 *   - type "bool"              -> checkbox
 *   - `min_value`/`max_value`  -> slider (for int/float with finite bounds)
 *   - type "int"/"float"       -> number input
 *   - otherwise                -> text input (type "str" or unconstrained)
 */
export const coerceValue = (raw, type) => {
  if (type === "int") {
    if (raw === "" || raw === null || raw === undefined) return "";
    const val = parseInt(raw, 10);
    return Number.isNaN(val) ? "" : val;
  }
  if (type === "float") {
    if (raw === "" || raw === null || raw === undefined) return "";
    const val = parseFloat(raw);
    return Number.isNaN(val) ? "" : val;
  }
  if (type === "bool") {
    if (typeof raw === "boolean") return raw;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return Boolean(raw);
  }
  if (type === "str") return String(raw ?? "");
  return raw;
};

export default function DynamicHyperParameter({
  param,
  value,
  onChange,
  compact = false,
  idPrefix = "",
}) {
  const { key, label, description, type, options, min_value, max_value, step } = param;
  const current = value ?? param.default_value;
  const inputId = idPrefix ? `${idPrefix}-param-${key}` : `param-${key}`;

  const isSlider = min_value !== null && min_value !== undefined &&
    max_value !== null && max_value !== undefined && !options &&
    (type === "int" || type === "float");

  let control;
  if (options && options.length > 0) {
    control = (
      <select
        id={inputId}
        aria-label={label || key}
        title={description || undefined}
        value={current !== undefined && current !== null ? String(current) : ""}
        onChange={(e) => onChange(key, coerceValue(e.target.value, type))}
        className="w-full px-2.5 py-1.5 text-xs sm:text-sm border border-ln2 rounded-lg bg-well text-t1 focus:ring-2 focus:ring-ac focus:border-transparent"
      >
        {options.map((opt) => (
          <option key={String(opt)} value={String(opt)}>{String(opt)}</option>
        ))}
      </select>
    );
  } else if (type === "bool") {
    control = (
      <input
        id={inputId}
        aria-label={label || key}
        title={description || undefined}
        type="checkbox"
        checked={Boolean(current)}
        onChange={(e) => onChange(key, e.target.checked)}
        className="h-4 w-4 rounded border-ln2 text-ac focus:ring-ac"
      />
    );
  } else if (isSlider) {
    control = (
      <div className="flex items-center gap-2" title={description || undefined}>
        <input
          id={inputId}
          aria-label={label || key}
          title={description || undefined}
          type="range"
          min={min_value}
          max={max_value}
          step={step ?? (type === "int" ? 1 : 0.01)}
          value={current ?? min_value}
          onChange={(e) => onChange(key, coerceValue(e.target.value, type))}
          className="flex-1 accent-ac"
        />
        <span className="text-xs font-mono font-semibold w-12 text-right text-t1">{current}</span>
      </div>
    );
  } else if (type === "int" || type === "float") {
    control = (
      <input
        id={inputId}
        aria-label={label || key}
        title={description || undefined}
        type="number"
        min={min_value !== null && min_value !== undefined ? min_value : undefined}
        max={max_value !== null && max_value !== undefined ? max_value : undefined}
        step={step ?? (type === "int" ? 1 : "any")}
        value={current !== undefined && current !== null ? current : ""}
        onChange={(e) => onChange(key, coerceValue(e.target.value, type))}
        className="w-full px-2.5 py-1.5 text-xs sm:text-sm border border-ln2 rounded-lg bg-well text-t1 focus:ring-2 focus:ring-ac focus:border-transparent"
      />
    );
  } else {
    control = (
      <input
        id={inputId}
        aria-label={label || key}
        title={description || undefined}
        type="text"
        value={current !== undefined && current !== null ? String(current) : ""}
        onChange={(e) => onChange(key, coerceValue(e.target.value, type))}
        className="w-full px-2.5 py-1.5 text-xs sm:text-sm border border-ln2 rounded-lg bg-well text-t1 focus:ring-2 focus:ring-ac focus:border-transparent"
      />
    );
  }

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-1.5 text-[11px] text-t2"
        title={description || undefined}
      >
        <label
          htmlFor={inputId}
          className="shrink-0 cursor-pointer"
          title={description || undefined}
        >
          {label || key}
        </label>
        <div className="min-w-16">{control}</div>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className="flex items-center justify-between text-sm font-medium text-t1 mb-1"
        title={description || undefined}
      >
        <span>{label || key}</span>
      </label>
      {control}
      {description && <p className="text-[11px] text-t3 mt-1">{description}</p>}
    </div>
  );
}
