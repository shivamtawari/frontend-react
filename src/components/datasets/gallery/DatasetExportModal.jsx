import React, { useState, useEffect, useMemo } from "react";
import {
  Download,
  X,
  Loader2,
  FileArchive,
  FileJson,
  Check,
  Settings2,
  Info,
  Package,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { downloadIquanaArchive, downloadCocoExport } from "../../../api";
import { fetchLabels } from "../../../api/labels";
import { extractLabelsFromResponse, buildLabelHierarchy } from "../../../utils/labelHierarchy";
import { usePermissions } from "../../../hooks/usePermissions";
import { Permission } from "../../../utils/permissions";

/**
 * Unified modal for exporting a dataset in either native IQUANA archive format or COCO format.
 *
 * Exposes a top-level format choice (IQUANA default vs COCO), followed by format-specific
 * options (images vs annotations only, configuration, filters, and label selections).
 */
const DatasetExportModal = ({ isOpen, onClose, dataset }) => {
  const { can } = usePermissions(dataset);
  const canExportImages = can(Permission.EXPORT_IMAGES);
  const canReadLabels = can(Permission.LABEL_READ);

  // Format selection: "iquana" (default) or "coco"
  const [format, setFormat] = useState("iquana");

  // IQUANA format options
  const [iquanaIncludeImages, setIquanaIncludeImages] = useState(canExportImages);
  const [iquanaIncludeConfig, setIquanaIncludeConfig] = useState(false);

  // COCO format options
  const [cocoIncludeImages, setCocoIncludeImages] = useState(canExportImages);
  const [cocoExcludeUnreviewed, setCocoExcludeUnreviewed] = useState(true);
  const [cocoExcludeNotFullyAnnotated, setCocoExcludeNotFullyAnnotated] = useState(true);

  // COCO label filtering state
  const [labels, setLabels] = useState([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState(new Set());
  const [isLoadingLabels, setIsLoadingLabels] = useState(false);
  const [labelsError, setLabelsError] = useState(null);

  // General export & error state
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const resetState = () => {
    setFormat("iquana");
    setIquanaIncludeImages(canExportImages);
    setIquanaIncludeConfig(false);
    setCocoIncludeImages(canExportImages);
    setCocoExcludeUnreviewed(true);
    setCocoExcludeNotFullyAnnotated(true);
    setLabels([]);
    setSelectedLabelIds(new Set());
    setIsLoadingLabels(false);
    setError(null);
    setLabelsError(null);
  };

  // Reset all format states to documented defaults whenever modal opens or image permission changes
  useEffect(() => {
    if (isOpen) {
      resetState();
    }
  }, [isOpen, canExportImages]);

  // Load dataset labels ONLY when modal is open, format is COCO, and user has LABEL_READ
  useEffect(() => {
    if (!isOpen || !dataset?.id || format !== "coco") return undefined;

    if (!canReadLabels) {
      setLabels([]);
      setSelectedLabelIds(new Set());
      setIsLoadingLabels(false);
      setLabelsError(null);
      return undefined;
    }

    let cancelled = false;
    setIsLoadingLabels(true);
    setLabelsError(null);
    setError(null);

    fetchLabels(dataset.id)
      .then((res) => {
        if (cancelled) return;
        const flat = extractLabelsFromResponse(res) || [];
        setLabels(flat);
        setSelectedLabelIds(new Set(flat.map((l) => l.id)));
        setIsLoadingLabels(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLabels([]);
        setSelectedLabelIds(new Set());
        setLabelsError(err.message || "Failed to load labels");
        setIsLoadingLabels(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, dataset?.id, format, canReadLabels]);

  const labelTree = useMemo(() => buildLabelHierarchy(labels), [labels]);

  // Check if any selected label has an ancestor that is also selected
  const hasAncestorDescendantOverlap = useMemo(() => {
    if (selectedLabelIds.size <= 1 || labels.length === 0) return false;
    const parentMap = new Map();
    for (const l of labels) {
      parentMap.set(l.id, l.parent_id);
    }
    for (const id of selectedLabelIds) {
      let curr = parentMap.get(id);
      while (curr !== null && curr !== undefined) {
        if (selectedLabelIds.has(curr)) {
          return true;
        }
        curr = parentMap.get(curr);
      }
    }
    return false;
  }, [selectedLabelIds, labels]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isExporting) return;
    resetState();
    onClose();
  };

  const toggleLabel = (id) => {
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allSelected = labels.length > 0 && selectedLabelIds.size === labels.length;
  const toggleAll = () => {
    if (allSelected) {
      setSelectedLabelIds(new Set());
    } else {
      setSelectedLabelIds(new Set(labels.map((l) => l.id)));
    }
  };

  const hasEmptySubset = canReadLabels && labels.length > 0 && selectedLabelIds.size === 0;

  const canExportCoco =
    !isExporting &&
    (!canReadLabels || (!isLoadingLabels && !labelsError && !hasEmptySubset));

  const canExport = format === "iquana" ? !isExporting : canExportCoco;

  const handleExport = async () => {
    if (!dataset?.id) {
      setError("No dataset selected.");
      return;
    }

    if (format === "coco") {
      if (canReadLabels && labelsError) {
        setError("Cannot export when dataset labels failed to load.");
        return;
      }
      if (canReadLabels && labels.length > 0 && selectedLabelIds.size === 0) {
        setError("At least one label must be selected for export.");
        return;
      }
    }

    setIsExporting(true);
    setError(null);

    try {
      if (format === "iquana") {
        await downloadIquanaArchive(dataset.id, {
          includeImages: iquanaIncludeImages,
          includeConfig: iquanaIncludeConfig,
          datasetName: dataset.name,
        });
      } else {
        const isSubset =
          canReadLabels && labels.length > 0 && selectedLabelIds.size < labels.length;
        const labelIdsParam = isSubset ? Array.from(selectedLabelIds) : null;

        await downloadCocoExport(dataset.id, {
          includeImages: cocoIncludeImages,
          excludeUnreviewed: cocoExcludeUnreviewed,
          excludeNotFullyAnnotated: cocoExcludeNotFullyAnnotated,
          contourSelection: "all",
          labelIds: labelIdsParam,
        });
      }
      resetState();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to export dataset.");
    } finally {
      setIsExporting(false);
    }
  };

  const Toggle = ({ checked, onChange, label, description }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 text-left p-3 rounded-xl hover:bg-hv transition-colors"
    >
      <span
        className={`mt-0.5 relative w-9 h-5 rounded-full transition-colors shrink-0 ${
          checked ? "bg-accent" : "bg-ln2"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-p1 rounded-full shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-t1">{label}</span>
        {description && <span className="block text-xs text-t3 mt-0.5">{description}</span>}
      </span>
    </button>
  );

  const renderLabelNode = (node, depth = 0) => {
    const isChecked = selectedLabelIds.has(node.id);
    return (
      <React.Fragment key={node.id}>
        <label
          className="flex items-center gap-2 py-1 px-2 rounded hover:bg-hv cursor-pointer text-sm text-t1 select-none"
          style={{ paddingLeft: `${depth * 18 + 8}px` }}
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => toggleLabel(node.id)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-ln2 bg-well text-transparent transition-colors peer-checked:border-accent peer-checked:bg-accent peer-checked:text-onAccent peer-focus:ring-2 peer-focus:ring-accent"
          >
            <Check size={12} strokeWidth={3} />
          </span>
          <span className="truncate">{node.name}</span>
        </label>
        {node.children && node.children.map((child) => renderLabelNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div
          className="fixed inset-0 bg-scrim transition-opacity"
          onClick={isExporting ? undefined : handleClose}
        />

        <div className="relative inline-block w-full max-w-lg text-left align-middle bg-p1 rounded-2xl shadow-xl overflow-hidden border border-ln">
          {/* Header */}
          <div className="relative bg-p2 border-b border-ln px-6 py-5 text-t1">
            <button
              onClick={handleClose}
              disabled={isExporting}
              className="absolute top-4 right-4 p-1 rounded-lg text-t3 hover:text-t1 hover:bg-hv2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Close"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 pr-8">
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-hv shrink-0">
                <Download className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Export Dataset</h3>
                <p className="text-sm text-t3 mt-0.5">
                  Download {dataset?.name ? `“${dataset.name}”` : "this dataset"} in IQUANA archive or COCO format.
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5 max-h-[calc(100vh-200px)] overflow-y-auto">
            {/* Format Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-t3">
                Format
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={format === "iquana"}
                  onClick={() => setFormat("iquana")}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all duration-200 ${
                    format === "iquana"
                      ? "border-acLn bg-acS text-ac shadow-sm"
                      : "border-ln text-t2 hover:bg-hv"
                  }`}
                >
                  <FileArchive className="w-5 h-5" />
                  <span className="text-sm font-semibold">IQUANA archive</span>
                  <span className="text-[11px] text-t3">Native backup & transfer</span>
                </button>
                <button
                  type="button"
                  aria-pressed={format === "coco"}
                  onClick={() => setFormat("coco")}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all duration-200 ${
                    format === "coco"
                      ? "border-acLn bg-acS text-ac shadow-sm"
                      : "border-ln text-t2 hover:bg-hv"
                  }`}
                >
                  <FileJson className="w-5 h-5" />
                  <span className="text-sm font-semibold">COCO</span>
                  <span className="text-[11px] text-t3">Interoperability for ML</span>
                </button>
              </div>
            </div>

            {/* Format-specific options */}
            <div key={format} className="export-format-panel">
            {format === "iquana" && (
              <div className="space-y-5">
                {/* Content choice */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-t3">
                    Content
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => canExportImages && setIquanaIncludeImages(true)}
                      disabled={!canExportImages}
                      title={
                        canExportImages
                          ? undefined
                          : "Your role on this dataset does not allow downloading the images."
                      }
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors ${
                        !canExportImages
                          ? "border-ln text-t3 bg-well cursor-not-allowed"
                          : iquanaIncludeImages
                            ? "border-acLn bg-acS text-ac"
                            : "border-ln text-t2 hover:bg-hv"
                      }`}
                    >
                      {canExportImages ? (
                        <Package className="w-5 h-5" />
                      ) : (
                        <Lock className="w-5 h-5" />
                      )}
                      <span className="text-sm font-semibold">Images + annotations</span>
                      <span className="text-[11px] text-t3">
                        {canExportImages ? "Full portable archive" : "Not permitted"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIquanaIncludeImages(false)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors ${
                        !iquanaIncludeImages
                          ? "border-acLn bg-acS text-ac"
                          : "border-ln text-t2 hover:bg-hv"
                      }`}
                    >
                      <FileArchive className="w-5 h-5" />
                      <span className="text-sm font-semibold">Annotations only</span>
                      <span className="text-[11px] text-t3">ZIP without images</span>
                    </button>
                  </div>
                </div>

                {iquanaIncludeImages ? (
                  <div className="bg-p2 border border-ln rounded-xl p-4 text-sm text-t2 space-y-2">
                    <div className="flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <p>
                        Includes the original images and annotation data for backup or transfer to
                        another IQUANA instance.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-p2 border border-ln rounded-xl p-4 text-sm text-t2 space-y-2">
                    <div className="flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <p>
                        Annotations-only export preserves the complete annotation snapshot, category hierarchies,
                        masks, calibrations, and image metadata without bundling raw image binaries.
                      </p>
                    </div>
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-600 dark:text-amber-400">
                      <strong>Notice:</strong> Annotations-only archives cannot create a new dataset,
                      and importing or merging them into an existing dataset is not supported yet.
                      To create an importable backup, choose “Images + annotations”.
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-t3 flex items-center gap-2">
                    <Settings2 size={14} /> Optional Configuration
                  </h4>
                  <div className="bg-p2 border border-ln rounded-xl p-1">
                    <Toggle
                      checked={iquanaIncludeConfig}
                      onChange={setIquanaIncludeConfig}
                      label="Include internal configuration (config.json)"
                      description="Includes internal settings for use in another IQUANA instance. Quantification results are not included."
                    />
                  </div>
                </div>
              </div>
            )}

            {format === "coco" && (
              <div className="space-y-5">
                {/* Content choice */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-t3">
                    Content
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => canExportImages && setCocoIncludeImages(true)}
                      disabled={!canExportImages}
                      title={
                        canExportImages
                          ? undefined
                          : "Your role on this dataset does not allow downloading the images."
                      }
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors ${
                        !canExportImages
                          ? "border-ln text-t3 bg-well cursor-not-allowed"
                          : cocoIncludeImages
                            ? "border-acLn bg-acS text-ac"
                            : "border-ln text-t2 hover:bg-hv"
                      }`}
                    >
                      {canExportImages ? (
                        <Package className="w-5 h-5" />
                      ) : (
                        <Lock className="w-5 h-5" />
                      )}
                      <span className="text-sm font-semibold">Images + annotations</span>
                      <span className="text-[11px] text-t3">
                        {canExportImages ? "ZIP bundle" : "Not permitted"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCocoIncludeImages(false)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors ${
                        !cocoIncludeImages
                          ? "border-acLn bg-acS text-ac"
                          : "border-ln text-t2 hover:bg-hv"
                      }`}
                    >
                      <FileJson className="w-5 h-5" />
                      <span className="text-sm font-semibold">Annotations only</span>
                      <span className="text-[11px] text-t3">COCO JSON</span>
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="space-y-1 bg-p2 border border-ln rounded-xl p-1">
                  <Toggle
                    checked={cocoExcludeNotFullyAnnotated}
                    onChange={setCocoExcludeNotFullyAnnotated}
                    label="Only fully-annotated images"
                    description="Skip images whose masks aren't marked complete."
                  />
                  <Toggle
                    checked={cocoExcludeUnreviewed}
                    onChange={setCocoExcludeUnreviewed}
                    label="Only reviewed annotations"
                    description="Skip contours that haven't been reviewed."
                  />
                </div>

                {/* Labels to include */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-t1">
                      Labels to include
                    </label>
                    {canReadLabels && labels.length > 0 && !isLoadingLabels && (
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-xs text-accent hover:underline font-medium"
                      >
                        {allSelected ? "Deselect all" : "Select all"}
                      </button>
                    )}
                  </div>
                  <div className="max-h-40 overflow-y-auto border border-ln rounded-lg p-1 bg-p2">
                    {!canReadLabels ? (
                      <div className="p-3 text-xs text-t3 text-center">
                        Label filtering is unavailable without label read permissions. All annotations will be exported.
                      </div>
                    ) : isLoadingLabels ? (
                      <div className="flex items-center justify-center p-4 text-xs text-t3 gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading labels…
                      </div>
                    ) : labelsError ? (
                      <div className="p-3 text-xs text-err bg-errBg rounded border border-errLn">
                        Failed to load labels: {labelsError}
                      </div>
                    ) : labels.length === 0 ? (
                      <div className="p-3 text-xs text-t3 text-center">
                        No labels found in this dataset.
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {labelTree.map((rootNode) => renderLabelNode(rootNode, 0))}
                      </div>
                    )}
                  </div>
                  {hasAncestorDescendantOverlap && (
                    <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>
                        Selected labels include both parent and descendant categories. Their annotations may overlap. Some COCO training pipelines may interpret overlapping masks differently.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>

            {error && (
              <div className="p-3.5 bg-errBg border border-errLn text-err text-sm rounded-xl">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-p2 border-t border-ln px-6 py-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isExporting}
              className="px-4 py-2 text-sm font-medium text-t2 hover:text-t1 hover:bg-hv rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!canExport}
              className="px-5 py-2 text-sm font-medium bg-accent text-onAccent rounded-xl hover:brightness-110 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{format === "iquana" ? "Preparing Archive..." : "Preparing…"}</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>{format === "iquana" ? "Download Archive (.zip)" : "Export"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatasetExportModal;
