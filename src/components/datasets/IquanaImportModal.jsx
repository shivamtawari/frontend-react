import React, { useState, useRef } from "react";
import {
  Upload,
  X,
  Loader2,
  FileArchive,
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Info,
  ArrowRight,
} from "lucide-react";
import { importIquanaArchive } from "../../api";

/**
 * Modal for importing an IQUANA archive ZIP file as a new dataset.
 *
 * Supports file selection, optional name override, upload progress,
 * retry on conflict/validation error, and warning display upon completion.
 */
const IquanaImportModal = ({
  isOpen,
  onClose,
  onSuccess,
  onImportComplete,
  onNavigateOpen,
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [overrideName, setOverrideName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".zip")) {
        setError("Please select a valid .zip file.");
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".zip")) {
        setError("Please select a valid .zip file.");
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please select an IQUANA archive (.zip) file to import.");
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const response = await importIquanaArchive(selectedFile, overrideName);
      onImportComplete?.(response);
      onSuccess?.(response);
      handleResetAndClose();
    } catch (err) {
      // Keep selectedFile intact so user can adjust name on 409 conflict or retry
      setError(err.message || "Failed to import dataset archive.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleResetAndClose = () => {
    setSelectedFile(null);
    setOverrideName("");
    setError(null);
    setResult(null);
    onClose();
  };

  const handleSuccessAction = () => {
    if (result && onNavigateOpen) {
      onNavigateOpen(result);
    }
    handleResetAndClose();
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div className="fixed inset-0 bg-scrim transition-opacity" onClick={handleResetAndClose} />

        <div className="relative inline-block w-full max-w-lg text-left align-middle bg-p1 rounded-2xl shadow-xl overflow-hidden border border-ln">
          {/* Header */}
          <div className="relative bg-p2 border-b border-ln px-6 py-5 text-t1">
            <button
              onClick={handleResetAndClose}
              className="absolute top-4 right-4 p-1 rounded-lg text-t3 hover:text-t1 hover:bg-hv2 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 pr-8">
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-hv shrink-0">
                {result ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                ) : (
                  <Upload className="w-6 h-6 text-accent" />
                )}
              </div>
              <div>
                <h3 className="text-xl font-bold">
                  {result ? "Dataset Imported Successfully" : "Import IQUANA Archive"}
                </h3>
                <p className="text-sm text-t3 mt-0.5">
                  {result
                    ? `Dataset "${result.dataset_name}" is ready`
                    : "Restore a complete dataset from an IQUANA format v1 ZIP file"}
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          {result ? (
            <div className="p-6 space-y-5">
              <div className="bg-p2 border border-ln rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-t3">Dataset Name:</span>
                  <span className="font-semibold text-t1">{result.dataset_name}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-t3">Dataset ID:</span>
                  <span className="font-mono text-t2">#{result.dataset_id}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-t3">Internal Configuration:</span>
                  <span className="font-medium text-t1">
                    {result.config_applied ? "Applied from archive" : "Destination defaults used"}
                  </span>
                </div>
              </div>

              {result.warnings && result.warnings.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-600 dark:text-amber-400 space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle size={16} />
                    <span>Import Warnings</span>
                  </div>
                  <ul className="list-disc list-inside text-xs space-y-1 pl-1">
                    {result.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleImport} className="p-6 space-y-5">
              {/* Dropzone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  selectedFile
                    ? "border-accent bg-accent/5"
                    : "border-ln hover:border-accent hover:bg-hv"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".zip,application/zip"
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileArchive className="w-8 h-8 text-accent shrink-0" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-t1 truncate max-w-[280px]">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-t3">{formatBytes(selectedFile.size)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-center">
                      <Upload className="w-8 h-8 text-t3" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-t1">
                        Click or drag & drop an IQUANA archive (.zip)
                      </p>
                      <p className="text-xs text-t3 mt-1">
                        Must contain valid <span className="font-mono">annotations.json</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Name Override */}
              <div className="space-y-1.5">
                <label htmlFor="overrideName" className="block text-sm font-medium text-t2">
                  Dataset Name Override <span className="text-xs text-t3">(Optional)</span>
                </label>
                <input
                  id="overrideName"
                  type="text"
                  value={overrideName}
                  onChange={(e) => setOverrideName(e.target.value)}
                  placeholder="Leave empty to use the name saved in the archive"
                  disabled={isImporting}
                  className="w-full px-3.5 py-2.5 bg-p2 border border-ln rounded-xl text-sm text-t1 placeholder:text-t3 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
                />
              </div>

              <div className="bg-p2 border border-ln rounded-xl p-3.5 text-xs text-t3 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <p>
                  Images, masks, labels, and calibrations will be restored. Original author accounts
                  and reviewer approvals are detached to maintain local security separation.
                </p>
              </div>

              {error && (
                <div className="p-3.5 bg-errBg border border-errLn text-err text-sm rounded-xl">
                  {error}
                </div>
              )}
            </form>
          )}

          {/* Footer */}
          <div className="bg-p2 border-t border-ln px-6 py-4 flex items-center justify-end gap-3">
            {result ? (
              <>
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="px-4 py-2 text-sm font-medium text-t2 hover:text-t1 hover:bg-hv rounded-xl transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSuccessAction}
                  className="px-5 py-2 text-sm font-medium bg-accent text-onAccent rounded-xl hover:brightness-110 transition-all flex items-center gap-2 shadow-sm"
                >
                  <FolderOpen size={16} />
                  <span>Open Dataset</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  disabled={isImporting}
                  className="px-4 py-2 text-sm font-medium text-t2 hover:text-t1 hover:bg-hv rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!selectedFile || isImporting}
                  className="px-5 py-2 text-sm font-medium bg-accent text-onAccent rounded-xl hover:brightness-110 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Importing Dataset...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      <span>Start Import</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IquanaImportModal;
