import React, { useState } from 'react';
import { Ruler, X, CheckCircle } from 'lucide-react';

const SUPPORTED_UNITS = [
  { value: 'cm', label: 'cm (centimetres)' },
  { value: 'mm', label: 'mm (millimetres)' },
  { value: 'µm', label: 'µm (micrometres)' },
];

/**
 * Modal that appears after the user draws a calibration line.
 * Asks for the real-world distance and unit, then calls onConfirm.
 *
 * Props:
 *   pixelDistance {number}   Pixel length of the drawn line (display only).
 *   onConfirm({ knownDistance, unit }) Called when the user confirms.
 *   onCancel()               Called when the user cancels / closes.
 */
const ScaleInputModal = ({ pixelDistance, onConfirm, onCancel }) => {
  const [knownDistance, setKnownDistance] = useState('');
  const [unit, setUnit] = useState('cm');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsed = parseFloat(knownDistance);
    if (!knownDistance || isNaN(parsed) || parsed <= 0) {
      setError('Please enter a positive number.');
      return;
    }
    setError('');
    onConfirm({ knownDistance: parsed, unit });
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 z-[9999]"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-teal-500 to-cyan-600">
          <div className="flex items-center gap-2 text-white">
            <Ruler className="w-5 h-5" />
            <h2 className="text-base font-semibold">Set Image Scale</h2>
          </div>
          <button
            onClick={onCancel}
            className="text-white/80 hover:text-white transition-colors rounded-full p-1 hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Drawn line info */}
          <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-100 rounded-xl text-sm text-teal-800">
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
              <Ruler className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <p className="font-medium">Line drawn</p>
              <p className="text-teal-600">
                {pixelDistance ? `${Math.round(pixelDistance)} pixels` : '—'}
              </p>
            </div>
          </div>

          {/* Real-world distance input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Real-world length of this line
            </label>
            <div className="flex gap-2">
              <input
                id="scale-distance-input"
                type="number"
                min="0.000001"
                step="any"
                value={knownDistance}
                onChange={(e) => { setKnownDistance(e.target.value); setError(''); }}
                placeholder="e.g. 100"
                autoFocus
                className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
              <select
                id="scale-unit-select"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              >
                {SUPPORTED_UNITS.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
            {knownDistance && !error && pixelDistance && (
              <p className="mt-1.5 text-xs text-gray-500">
                Scale:{' '}
                <span className="font-medium text-teal-700">
                  {(parseFloat(knownDistance) / pixelDistance).toFixed(6)} {unit}/px
                </span>
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-xl transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="scale-confirm-button"
              className="flex items-center gap-1.5 px-5 py-2 text-sm text-white bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl font-medium hover:shadow-lg transition-all"
            >
              <CheckCircle className="w-4 h-4" />
              Confirm Scale
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScaleInputModal;
