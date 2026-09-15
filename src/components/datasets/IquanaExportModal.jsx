import React, { useState, useEffect } from "react";
import { Download, X, Loader2, FileArchive, Settings2, Info } from "lucide-react";
import { downloadIquanaArchive } from "../../api";

/**
 * Modal for exporting a dataset to the native IQUANA archive format (v1).
 *
 * Lets the user choose whether to include dataset-owned configuration (review policy,
 * calibrations, quantification profiles, model routing) before streaming the ZIP.
 */
const IquanaExportModal = ({ isOpen, onClose, dataset }) => {
  const [includeConfig, setIncludeConfig] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setIncludeConfig(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setIncludeConfig(false);
    setError(null);
    onClose();
  };

  const handleExport = async () => {
    if (!dataset?.id) {
      setError("No dataset selected.");
      return;
    }
    setIsExporting(true);
    setError(null);
    try {
      await downloadIquanaArchive(dataset.id, {
        includeConfig,
        datasetName: dataset.name,
      });
      handleClose();
    } catch (err) {
      setError(err.message || "Failed to export dataset archive.");
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div className="fixed inset-0 bg-scrim transition-opacity" onClick={handleClose} />

        <div className="relative inline-block w-full max-w-lg text-left align-middle bg-p1 rounded-2xl shadow-xl overflow-hidden border border-ln">
          {/* Header */}
          <div className="relative bg-p2 border-b border-ln px-6 py-5 text-t1">
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-1 rounded-lg text-t3 hover:text-t1 hover:bg-hv2 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 pr-8">
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-hv shrink-0">
                <FileArchive className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Export IQUANA Archive</h3>
                <p className="text-sm text-t3 mt-0.5">
                  Download a self-contained portable snapshot of this dataset
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            <div className="bg-p2 border border-ln rounded-xl p-4 text-sm text-t2 space-y-2">
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <p>
                  The archive contains full-resolution images, category hierarchies, masks,
                  canonical annotations, metadata, and image calibrations formatted for lossless
                  import into another IQUANA instance.
                </p>
              </div>
              <p className="text-xs text-t3 pl-6.5">
                Browser exports buffer in memory (up to ~2 GiB recommended). For larger datasets, use direct API streaming.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-t3 flex items-center gap-2">
                <Settings2 size={14} /> Optional Configuration
              </h4>
              <div className="bg-p2 border border-ln rounded-xl p-1">
                <Toggle
                  checked={includeConfig}
                  onChange={setIncludeConfig}
                  label="Include internal configuration (config.json)"
                  description="Adds review policy settings, calibration defaults, quantification profile configurations, and model routing assignments. Never includes quantification results, which can be recomputed anytime."
                />
              </div>
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
              disabled={isExporting}
              className="px-5 py-2 text-sm font-medium bg-accent text-onAccent rounded-xl hover:brightness-110 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Preparing Archive...</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Download Archive (.zip)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IquanaExportModal;
