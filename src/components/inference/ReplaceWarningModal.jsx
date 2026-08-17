import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";

/**
 * The last gate before a destructive run.
 *
 * Deliberately not a generic "are you sure": it states the actual numbers -- how many
 * contours, how many of them reviewed, how many top-level objects whose children go with them
 * -- and asks the user to type REPLACE. The typing is not ceremony; the whole risk of this
 * feature is somebody meaning to patch, leaving the mode on replace, and losing a week of
 * annotation. A checkbox is dismissed by reflex, a word is not.
 */

const CONFIRM_WORD = "REPLACE";

export default function ReplaceWarningModal({
    isOpen,
    preview,
    previewError,
    preserveReviewed,
    imageCount,
    isPreviewing,
    isStarting,
    error,
    onCancel,
    onRetryPreview,
    onConfirm,
}) {
    const [typed, setTyped] = useState("");

    useEffect(() => {
        if (isOpen) setTyped("");
    }, [isOpen]);

    if (!isOpen) return null;

    const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;
    const stat = (value) => (value ?? 0).toLocaleString();

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="replace-warning-title"
        >
            <div className="w-full max-w-lg bg-p1 border border-errLn rounded-2xl shadow-xl overflow-hidden">
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ln bg-errBg">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-err shrink-0" />
                        <h2 id="replace-warning-title" className="text-lg font-semibold text-err">
                            Delete existing annotations?
                        </h2>
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-t3 hover:text-t1 rounded p-1"
                        aria-label="Cancel"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                    <p className="text-sm text-t2">
                        A replace run deletes what is on the images before it predicts anything.
                        Deleting an object also deletes every object nested inside it. This cannot
                        be undone.
                    </p>

                    {preview ? (
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <dt className="text-t3">Images in scope</dt>
                            <dd className="text-t1 font-medium text-right">{stat(imageCount)}</dd>

                            <dt className="text-t3">Contours deleted</dt>
                            <dd className="text-err font-semibold text-right">
                                {stat(preview.contours)}
                            </dd>

                            <dt className="text-t3">Top-level objects (with their children)</dt>
                            <dd className="text-t1 font-medium text-right">
                                {stat(preview.root_contours)}
                            </dd>

                            <dt className="text-t3">Already reviewed</dt>
                            <dd
                                className={`font-semibold text-right ${
                                    preview.reviewed_contours > 0 && !preserveReviewed
                                        ? "text-err"
                                        : "text-t1"
                                }`}
                            >
                                {stat(preview.reviewed_contours)}
                            </dd>

                            {preserveReviewed && (
                                <>
                                    <dt className="text-ok">Kept (reviewed + nested)</dt>
                                    <dd className="text-ok font-medium text-right">
                                        {stat(preview.protected_contours)}
                                    </dd>
                                </>
                            )}
                        </dl>
                    ) : previewError ? (
                        <div className="space-y-2" role="alert">
                            <p className="text-sm text-err">
                                Could not count the annotations that would be deleted.
                            </p>
                            <p className="text-xs text-t2">{previewError}</p>
                            <button
                                type="button"
                                onClick={onRetryPreview}
                                className="text-xs font-medium text-ac hover:underline"
                            >
                                Try again
                            </button>
                        </div>
                    ) : (
                        <p className="flex items-center gap-2 text-sm text-t3">
                            {isPreviewing ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> Counting what would
                                    be deleted…
                                </>
                            ) : (
                                "The deletion preview is unavailable."
                            )}
                        </p>
                    )}

                    {error && (
                        <p
                            className="p-2 rounded-lg border border-errLn bg-errBg text-sm text-err"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}

                    {preview?.reviewed_contours > 0 && !preserveReviewed && (
                        <p className="text-xs text-err">
                            Reviewed work will be deleted too. Turn on “Keep annotations that have
                            already been reviewed” if that is not what you want.
                        </p>
                    )}

                    <div>
                        <label
                            htmlFor="replace-confirm"
                            className="block text-xs font-medium text-t1 mb-1"
                        >
                            Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to
                            confirm
                        </label>
                        <input
                            id="replace-confirm"
                            type="text"
                            value={typed}
                            onChange={(event) => setTyped(event.target.value)}
                            autoComplete="off"
                            placeholder={CONFIRM_WORD}
                            className="w-full px-3 py-2 text-sm border border-ln rounded-lg bg-well text-t1 focus:ring-2 focus:ring-err focus:border-transparent"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-5 py-3 border-t border-ln bg-well">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-t1 bg-p1 border border-ln rounded-lg hover:bg-hv"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={
                            !confirmed ||
                            isPreviewing ||
                            !preview ||
                            Boolean(previewError) ||
                            isStarting
                        }
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-onAccent bg-err rounded-lg hover:brightness-110 disabled:opacity-50"
                    >
                        {isStarting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Trash2 className="w-4 h-4" />
                        )}
                        Delete and run
                    </button>
                </div>
            </div>
        </div>
    );
}
