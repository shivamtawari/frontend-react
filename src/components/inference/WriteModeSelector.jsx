import React from "react";
import { AlertTriangle, Layers2, Loader2, Trash2 } from "lucide-react";

/**
 * How predictions meet the annotations that are already on the images.
 *
 * The two modes are not symmetric and the UI should not pretend they are. Patch is additive
 * and reversible in practice (delete the objects the model added); replace destroys existing
 * annotations *and their child objects* before a single prediction is made. So replace is
 * styled as the dangerous option, states its consequence in the option itself rather than in
 * a footnote, and is confirmed separately before the run starts.
 */

const OPTIONS = [
    {
        value: "patch",
        icon: Layers2,
        title: "Patch",
        blurb: "Add the predictions to what is already there.",
        detail:
            "Existing annotations are never removed. A prediction that overlaps one is dropped as a duplicate, so re-running is safe.",
    },
    {
        value: "replace",
        icon: Trash2,
        title: "Replace",
        blurb: "Delete the existing annotations first, then annotate from scratch.",
        detail:
            "Deleting an object also deletes the objects nested inside it. This cannot be undone.",
        danger: true,
    },
];

export default function WriteModeSelector({
    options,
    onChange,
    replacePreview,
    replacePreviewError,
    isPreviewingReplace,
    onRetryReplacePreview,
}) {
    const isReplace = options.write_mode === "replace";

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const selected = options.write_mode === option.value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onChange({ ...options, write_mode: option.value })}
                            aria-pressed={selected}
                            className={`text-left p-3 rounded-xl border transition-colors ${
                                selected
                                    ? option.danger
                                        ? "border-errLn bg-errBg"
                                        : "border-acLn bg-acS"
                                    : "border-ln bg-p1 hover:bg-hv"
                            }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <Icon
                                    size={16}
                                    className={selected && option.danger ? "text-err" : "text-ac"}
                                />
                                <span className="text-sm font-semibold text-t1">{option.title}</span>
                            </div>
                            <p className="text-xs text-t2">{option.blurb}</p>
                            <p className="text-[11px] text-t3 mt-1">{option.detail}</p>
                        </button>
                    );
                })}
            </div>

            {isReplace && (
                <div className="p-3 rounded-lg border border-errLn bg-errBg space-y-2">
                    <p className="flex items-center gap-2 text-sm font-semibold text-err">
                        <AlertTriangle size={15} /> This run deletes annotations
                    </p>
                    {replacePreview ? (
                        <p className="text-xs text-err">
                            <strong>{replacePreview.contours.toLocaleString()}</strong> contours across{" "}
                            <strong>{replacePreview.images.toLocaleString()}</strong> images will be
                            deleted, including{" "}
                            <strong>{replacePreview.root_contours.toLocaleString()}</strong> top-level
                            objects and every object nested inside them.
                            {replacePreview.reviewed_contours > 0 && (
                                <>
                                    {" "}
                                    <strong>{replacePreview.reviewed_contours.toLocaleString()}</strong>{" "}
                                    of them have already been reviewed.
                                </>
                            )}
                        </p>
                    ) : replacePreviewError ? (
                        <div className="space-y-1" role="alert">
                            <p className="text-xs text-err">
                                Could not count what would be deleted: {replacePreviewError}
                            </p>
                            <button
                                type="button"
                                onClick={onRetryReplacePreview}
                                className="text-xs font-medium text-ac hover:underline"
                            >
                                Try again
                            </button>
                        </div>
                    ) : (
                        <p className="text-xs text-err flex items-center gap-1">
                            {isPreviewingReplace && (
                                <Loader2 size={12} className="animate-spin" />
                            )}
                            {isPreviewingReplace
                                ? "Counting what would be deleted…"
                                : "The deletion preview is unavailable."}
                        </p>
                    )}
                    <label className="flex items-center gap-2 text-xs text-t1">
                        <input
                            type="checkbox"
                            checked={options.preserve_reviewed}
                            onChange={(event) =>
                                onChange({ ...options, preserve_reviewed: event.target.checked })
                            }
                            className="h-4 w-4"
                        />
                        Keep annotations that have already been reviewed (and everything nested in
                        them)
                    </label>
                </div>
            )}

            {!isReplace && (
                <label className="flex items-center gap-3 text-xs text-t2">
                    <span className="shrink-0">Treat as duplicate above IoU</span>
                    <input
                        type="range"
                        min={0.3}
                        max={0.95}
                        step={0.05}
                        value={options.nms_iou}
                        onChange={(event) =>
                            onChange({ ...options, nms_iou: Number(event.target.value) })
                        }
                        className="flex-1 max-w-xs"
                    />
                    <span className="font-medium text-t1 w-10">{options.nms_iou.toFixed(2)}</span>
                </label>
            )}
        </div>
    );
}
