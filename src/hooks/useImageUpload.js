import { useState, useCallback, useEffect, useRef } from 'react';
import * as api from '../api';
import { DEFAULT_STACK_EXTENSIONS } from '../api/stacks';
import { uploadKind } from '../utils/uploadFiles';

/**
 * Custom hook for handling image uploads. OCT exports go to the stack upload
 * (one file can become several stacks); files in no supported format are kept
 * in the list, flagged, and skipped.
 * @param {Object} dataset - Dataset object with id
 * @param {Function} onSuccess - Callback when the queue is fully uploaded
 * @param {Function} onPartialSuccess - Refresh callback when some files were accepted
 * @returns {Object} - Upload state and handlers
 */
export const useImageUpload = (dataset, onSuccess, onPartialSuccess) => {
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadErrors, setUploadErrors] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [stackExtensions, setStackExtensions] = useState(DEFAULT_STACK_EXTENSIONS);
  const uploadingFilesRef = useRef(uploadingFiles);
  const stackWarningsRef = useRef([]);

  const updateUploadingFiles = useCallback((update) => {
    const next = typeof update === 'function' ? update(uploadingFilesRef.current) : update;
    uploadingFilesRef.current = next;
    setUploadingFiles(next);
    return next;
  }, []);

  useEffect(() => {
    api.fetchStackFormats().then((response) => {
      if (response?.extensions?.length) setStackExtensions(response.extensions);
    }).catch(() => {});
  }, []);

  /** @returns {'image'|'stack'|'unsupported'} */
  const kindOf = useCallback((file) => uploadKind(file.name, stackExtensions), [stackExtensions]);

  const addFiles = useCallback((files) => {
    updateUploadingFiles((prev) => [...prev, ...files]);
  }, [updateUploadingFiles]);

  const removeFile = useCallback((index) => {
    updateUploadingFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadErrors([]);
  }, [updateUploadingFiles]);

  const removeUnsupported = useCallback(() => {
    updateUploadingFiles((prev) => prev.filter((file) => kindOf(file) !== 'unsupported'));
    setUploadErrors([]);
  }, [kindOf, updateUploadingFiles]);

  const clearFiles = useCallback(() => {
    updateUploadingFiles([]);
    setUploadProgress({ current: 0, total: 0 });
    setUploadErrors([]);
    setIsUploading(false);
    stackWarningsRef.current = [];
  }, [updateUploadingFiles]);

  const handleUpload = useCallback(async () => {
    const filesAtStart = [...uploadingFilesRef.current];
    const filesAtStartSet = new Set(filesAtStart);
    const queued = filesAtStart.filter((file) => kindOf(file) !== 'unsupported');
    if (queued.length === 0 || !dataset?.id) return;

    setIsUploading(true);
    setUploadProgress({ current: 0, total: queued.length });
    setUploadErrors([]);

    let uploadedCount = 0;
    let failedCount = 0;
    const errors = [];
    const successfulFiles = new Set();

    for (const file of queued) {
      try {
        if (kindOf(file) === 'stack') {
          const result = await api.uploadStackFiles([file], dataset.id);
          const failures = result?.failed ?? [];
          if (result?.stack_ids?.length) {
            successfulFiles.add(file);
            const warnings = failures.map((failure) => `Failed to read ${failure.file_name}: ${failure.reason}`);
            stackWarningsRef.current = [...new Set([...stackWarningsRef.current, ...warnings])];
            errors.push(...warnings);
          } else {
            failedCount++;
            for (const failure of failures) errors.push(`Failed to read ${failure.file_name}: ${failure.reason}`);
            if (!failures.length) errors.push(`No volume could be read from ${file.name}.`);
          }
        } else {
          const result = await api.uploadImage(file, dataset.id);
          if (result?.success) {
            successfulFiles.add(file);
          } else {
            failedCount++;
            errors.push(`Failed to upload ${file.name}: ${result?.message || 'Unknown error'}`);
          }
        }
      } catch (err) {
        failedCount++;
        errors.push(`Error uploading ${file.name}: ${err.message || 'Unknown error'}`);
      } finally {
        uploadedCount++;
        setUploadProgress((prev) => ({ ...prev, current: uploadedCount }));
      }
    }

    setIsUploading(false);

    const remaining = updateUploadingFiles((current) => current.filter((file) => !successfulFiles.has(file)));
    const hasNewFiles = remaining.some((file) => !filesAtStartSet.has(file));

    if (!hasNewFiles && failedCount === 0 && errors.length === 0) {
      clearFiles();
      onSuccess?.();
    } else if (failedCount > 0 || errors.length > 0) {
      setUploadErrors([
        `Uploaded ${queued.length - failedCount} out of ${queued.length} files.`,
        ...(failedCount > 0 ? [`${failedCount} files failed to upload.`, 'Some images may already exist or were invalid.'] : []),
        ...stackWarningsRef.current,
        ...errors.filter((error) => !stackWarningsRef.current.includes(error)),
      ]);
      if (successfulFiles.size > 0) onPartialSuccess?.();
    } else {
      // A file may have been added while the request was in flight. Keep it for
      // the next attempt while refreshing any uploads accepted in this batch.
      setUploadProgress({ current: 0, total: 0 });
      if (successfulFiles.size > 0) onPartialSuccess?.();
    }
  }, [dataset, onSuccess, onPartialSuccess, clearFiles, kindOf, updateUploadingFiles]);

  return {
    uploadingFiles,
    uploadProgress,
    uploadErrors,
    isUploading,
    stackExtensions,
    kindOf,
    addFiles,
    removeFile,
    removeUnsupported,
    clearFiles,
    handleUpload,
  };
};
