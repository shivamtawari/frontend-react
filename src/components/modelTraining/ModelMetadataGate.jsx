import React from "react";
import { Loader2 } from "lucide-react";

export const MODEL_METADATA_STATUS = Object.freeze({
  LOADING: "loading",
  SUCCESS: "success",
  EMPTY: "empty",
  ERROR: "error",
});

function StatePanel({ children, className = "", ...props }) {
  return (
    <div
      {...props}
      className={`rounded-xl border border-ln bg-well p-6 text-center ${className}`}
    >
      {children}
    </div>
  );
}

const hasValidModels = (models) => (
  Array.isArray(models)
  && models.length > 0
  && models.every(
    (model) => model
      && typeof model.registry_key === "string"
      && model.registry_key.trim().length > 0,
  )
);

function RetryButton({ onRetry }) {
  if (typeof onRetry !== "function") return null;

  return (
    <button
      type="button"
      onClick={onRetry}
      className="mt-4 inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-lg bg-accent text-onAccent hover:brightness-110 transition-colors"
    >
      Retry
    </button>
  );
}

/**
 * Keeps model-dependent training controls out of the UI until model metadata
 * is available. An empty registry is a valid response and is intentionally
 * different from a failed request so users know whether retrying can help.
 */
export default function ModelMetadataGate({
  status,
  models = [],
  error,
  onRetry,
  children,
}) {
  // This component intentionally renders its children only for the explicit
  // success state with a fully validated model list. Unknown states and
  // malformed success payloads fail closed instead of exposing a form with
  // stale or unusable configuration.
  if (status === MODEL_METADATA_STATUS.SUCCESS && hasValidModels(models)) {
    return children;
  }

  if (status === MODEL_METADATA_STATUS.LOADING) {
    return (
      <StatePanel role="status" aria-label="Loading training models" aria-live="polite">
        <Loader2 className="w-8 h-8 text-ac animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium text-t1">Loading training models…</p>
        <p className="text-xs text-t3 mt-1">Training configuration will appear when model metadata is ready.</p>
      </StatePanel>
    );
  }

  if (status === MODEL_METADATA_STATUS.ERROR) {
    return (
      <StatePanel
        role="alert"
        aria-label={`Unable to load training models: ${error || "The model registry could not be reached."}`}
        aria-live="assertive"
      >
        <p className="text-sm font-medium text-err">Unable to load training models</p>
        <p className="text-xs text-err mt-1">{error || "The model registry could not be reached."}</p>
        <RetryButton onRetry={onRetry} />
      </StatePanel>
    );
  }

  if (status === MODEL_METADATA_STATUS.EMPTY) {
    return (
      <StatePanel role="status" aria-label="No training models available" aria-live="polite">
        <p className="text-sm font-medium text-t1">No training models available</p>
        <p className="text-xs text-t3 mt-1">
          A training model must be registered before a configuration can be created.
        </p>
      </StatePanel>
    );
  }

  return (
    <StatePanel role="alert" aria-label="Training models are unavailable" aria-live="assertive">
      <p className="text-sm font-medium text-err">Training models are unavailable</p>
      <p className="text-xs text-err mt-1">
        Model metadata was missing or returned an unsupported state. Training configuration remains unavailable.
      </p>
      <RetryButton onRetry={onRetry} />
    </StatePanel>
  );
}
