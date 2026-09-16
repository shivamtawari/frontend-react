import React, { useState, useRef } from "react";
import {
  Upload,
  X,
  Loader2,
  FileArchive,
  Info,
} from "lucide-react";
import { importIquanaArchive } from "../../api";

/**
 * Modal for importing an IQUANA archive ZIP file as a new dataset.
 *
 * Supports file selection, optional name override, upload progress,
 * and retry on conflict/validation error.
 */
const IquanaImportModal = ({
  isOpen,
  onClose,
  onSuccess,
  onImportComplete,
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [overrideName, setOverrideName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState(null);
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
    if (isImporting) return;
    setSelectedFile(null);
    setOverrideName("");
    setError(null);
    onClose();
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
        <div
          className="fixed inset-0 bg-scrim transition-opacity"
          onClick={isImporting ? undefined : handleResetAndClose}
        />

        <div className="relative inline-block w-full max-w-lg text-left align-middle bg-p1 rounded-2xl shadow-xl overflow-hidden border border-ln">
          {/* Header */}
          <div className="relative bg-p2 border-b border-ln px-6 py-5 text-t1">
            <button
              onClick={handleResetAndClose}
              disabled={isImporting}
              className="absolute top-4 right-4 p-1 rounded-lg text-t3 hover:text-t1 hover:bg-hv2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Close"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-3 pr-8">
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-hv shrink-0">
                <Upload className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="text-xl font-bold">
                  Import IQUANA Archive
                </h3>
                <p className="text-sm text-t3 mt-0.5">
                  Import a complete dataset from an IQUANA ZIP file.
                </p>
              </div>
            </div>
          </div>

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
                  Images, masks, labels, and calibrations will be restored.
                </p>
              </div>

              {error && (
                <div className="p-3.5 bg-errBg border border-errLn text-err text-sm rounded-xl">
                  {error}
                </div>
              )}
          </form>

          {/* Footer */}
          <div className="bg-p2 border-t border-ln px-6 py-4 flex items-center justify-end gap-3">
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default IquanaImportModal;
