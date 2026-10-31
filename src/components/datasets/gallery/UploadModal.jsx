import React from 'react';
import { AlertTriangle, Upload, Image as ImageIcon, Layers } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { supportedFormatsText } from '../../../utils/uploadFiles';

const UploadModal = ({
  isOpen,
  onClose,
  dataset,
  uploadingFiles,
  uploadProgress,
  uploadErrors,
  isUploading,
  stackExtensions,
  kindOf,
  onAddFiles,
  onRemoveFile,
  onRemoveUnsupported,
  onUpload,
  onClear,
}) => {
  // Any file is accepted; ones nothing can read are flagged and skipped.
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onAddFiles,
    multiple: true,
    disabled: isUploading,
  });

  if (!isOpen) return null;

  const unsupported = uploadingFiles.filter((file) => kindOf(file) === 'unsupported');
  const uploadable = uploadingFiles.length - unsupported.length;
  const completedProgressLabel = uploadErrors.length > 0 ? 'Upload attempt finished' : 'Upload completed!';
  let uploadButtonLabel = 'Upload';
  if (isUploading) uploadButtonLabel = 'Uploading...';
  else if (uploadErrors.length > 0 && uploadable > 0) uploadButtonLabel = 'Retry failed uploads';

  const handleClose = () => {
    onClear();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" onClick={handleClose}>
          <div className="absolute inset-0 bg-t3 opacity-75"></div>
        </div>

        <div className="inline-block align-bottom bg-p1 rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-p1 px-6 pt-6 pb-4">
            <h3 className="text-lg font-medium text-t1 mb-4">
              Add Images to {dataset?.name || 'Dataset'}
            </h3>

            {/* File Upload Area */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-acLn bg-acS'
                  : 'border-ln2 bg-well hover:border-acLn hover:bg-acS'
              } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input {...getInputProps()} />
              <Upload className="w-12 h-12 text-t3 mx-auto mb-4" />
              <p className="text-lg font-medium text-t2 mb-2">Upload files here</p>
              <p className="text-sm text-t3">
                {isDragActive
                  ? 'Drop the files here...'
                  : 'Drag and drop files here, or click to select files'}
              </p>
              <p className="mt-1 text-xs text-t3">{supportedFormatsText(stackExtensions)}</p>
            </div>

            {/* File List */}
            {uploadingFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-medium text-t2">Selected files:</h4>
                <div className="max-h-40 overflow-y-auto space-y-1 border border-ln rounded-lg p-2 bg-well">
                  {uploadingFiles.map((file, index) => {
                    const kind = kindOf(file);
                    return (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between bg-p1 p-2 rounded border"
                    >
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        {kind === 'unsupported' && <AlertTriangle className="w-4 h-4 text-warn flex-shrink-0" aria-label="Not supported" />}
                        {kind === 'stack' && <Layers className="w-4 h-4 text-ac flex-shrink-0" aria-label="OCT volume" />}
                        {kind === 'image' && <ImageIcon className="w-4 h-4 text-ac flex-shrink-0" />}
                        <span className={`text-sm truncate ${kind === 'unsupported' ? 'text-t3' : 'text-t2'}`}>{file.name}</span>
                        {kind === 'stack' && <span className="text-xs text-ac flex-shrink-0">OCT volume</span>}
                        {kind === 'unsupported' && <span className="text-xs text-warn flex-shrink-0">Not supported</span>}
                        <span className="text-xs text-t3 flex-shrink-0">
                          ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                      {!isUploading && (
                        <button
                          type="button"
                          onClick={() => onRemoveFile(index)}
                          className="text-err hover:text-err ml-2 flex-shrink-0"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {unsupported.length > 0 && !isUploading && (
              <div className="mt-4 flex items-start gap-3 p-3 border rounded-lg bg-warnBg border-warnLn text-sm text-t2">
                <AlertTriangle className="w-4 h-4 text-warn flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  {unsupported.length === 1 ? `${unsupported[0].name} is` : `${unsupported.length} files are`} not in a
                  supported format and will be skipped.
                </div>
                <button
                  type="button"
                  onClick={onRemoveUnsupported}
                  className="text-xs text-t2 hover:text-err flex-shrink-0"
                >
                  Remove them
                </button>
              </div>
            )}

            {/* Upload Progress */}
            {uploadProgress.total > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-t2 mb-2">
                  <span>
                    {uploadProgress.current === uploadProgress.total
                      ? completedProgressLabel
                      : `Uploading ${uploadProgress.total} files...`}
                  </span>
                  <span>
                    {uploadProgress.current}/{uploadProgress.total}
                  </span>
                </div>
                <div className="w-full bg-hv2 rounded-full h-2">
                  <div
                    className="bg-accent h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
            )}

            {/* Upload Errors */}
            {uploadErrors.length > 0 && (
              <div className="mt-4 p-4 border rounded-lg bg-errBg border-errLn">
                <h4 className="text-sm font-semibold mb-2 text-err">Upload Errors:</h4>
                <ul className="text-sm space-y-1 text-err">
                  {uploadErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={handleClose}
                disabled={isUploading}
                className="px-4 py-2 text-sm text-t2 bg-well rounded-lg hover:bg-hv2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={onUpload}
                disabled={uploadable === 0 || isUploading}
                className="px-4 py-2 text-sm text-onAccent bg-accent rounded-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploadButtonLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
