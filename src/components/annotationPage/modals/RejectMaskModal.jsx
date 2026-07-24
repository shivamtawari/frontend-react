import React, { useEffect, useState } from 'react';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { fetchRejectionReasons, rejectMask } from '../../../api/reviews';

const readableError = (err, fallback) =>
  (err?.message || '').replace(/^API Error:\s*/i, '') || fallback;

/**
 * Sends a mask (or one object on it) back to its annotator with a reason.
 *
 * The reason list comes from the backend rather than being hard-coded here, so
 * the dropdown cannot drift away from the values the API accepts.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {number} props.maskId
 * @param {number} [props.contourId] - Reject one object; omit for a mask-level problem.
 * @param {string} [props.contourLabel] - Shown so the reviewer knows what they are rejecting.
 * @param {Function} props.onClose
 * @param {Function} [props.onRejected] - Called with the created rejection.
 */
const RejectMaskModal = ({
  isOpen,
  maskId,
  contourId = null,
  contourLabel = null,
  onClose,
  onRejected,
}) => {
  const [reasons, setReasons] = useState([]);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchRejectionReasons();
        if (cancelled) return;
        const options = response.reasons || [];
        setReasons(options);
        setSelected(options[0]?.value ?? null);
        setNote('');
      } catch (err) {
        if (!cancelled) setError(readableError(err, 'Could not load rejection reasons.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedOption = reasons.find((reason) => reason.value === selected);
  const noteRequired = Boolean(selectedOption?.requires_note);
  const noteMissing = noteRequired && !note.trim();

  const handleSubmit = async () => {
    if (!selected || noteMissing) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await rejectMask(maskId, {
        reason: selected,
        note: note.trim() || null,
        contourId,
      });
      if (onRejected) onRejected(response.rejection);
      onClose();
    } catch (err) {
      setError(readableError(err, 'Could not record the rejection.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="bg-gradient-to-r from-rose-500 to-red-500 text-white p-5 rounded-t-xl flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-full">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Send back for rework</h3>
              <p className="text-rose-100 text-sm">
                {contourId
                  ? `Object${contourLabel ? ` "${contourLabel}"` : ''} on this image`
                  : 'This whole image'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading reasons…
            </div>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gray-700 mb-2">
                  What is wrong with it?
                </legend>
                {reasons.map((reason) => (
                  <label
                    key={reason.value}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      selected === reason.value
                        ? 'border-rose-400 bg-rose-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rejection-reason"
                      value={reason.value}
                      checked={selected === reason.value}
                      onChange={() => setSelected(reason.value)}
                      className="w-4 h-4 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-sm text-gray-800">{reason.label}</span>
                  </label>
                ))}
              </fieldset>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Note {noteRequired ? '(required)' : '(optional)'}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Anything that helps whoever picks this up next."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 text-sm"
                />
              </div>

              {error && (
                <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <p className="mt-3 text-xs text-gray-500">
                The image goes back to the annotator and stays marked as sent back until
                every open point on it is resolved.
              </p>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !selected || noteMissing}
                  title={noteMissing ? 'This reason needs a note.' : undefined}
                  className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Send back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RejectMaskModal;
