import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Lets the annotator choose how instance-segmentation predictions are written.
 * Patch is the safe default; Override is deliberately treated as destructive.
 */
const InstanceWarningModal = ({ isOpen, onClose, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-scrim animate-dcFade"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[360px] max-w-[calc(100%-32px)] rounded-12 bg-p1 border border-ln2 shadow-modal animate-dcPop">
        <div className="flex items-center gap-[8px] px-[14px] py-[12px] border-b border-ln">
          <h2 className="flex-1 text-modaltitle font-bold text-t1">
            Choose how to apply predictions
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-[22px] h-[22px] flex items-center justify-center rounded-5 text-t3 hover:bg-hv hover:text-ac transition-colors duration-150"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-[14px] py-[12px] flex flex-col gap-[10px]">
          <div className="rounded-8 border border-ln2 bg-well px-[10px] py-[8px]">
            <p className="text-row leading-[1.55] text-t2">
              <span className="font-semibold text-ac">Patch (recommended)</span>{' '}
              keeps existing annotations and adds only non-overlapping predictions.
            </p>
          </div>

          <div className="flex items-start gap-[7px] rounded-8 border border-errLn bg-errBg px-[10px] py-[8px]">
            <AlertTriangle size={14} className="mt-[2px] flex-none text-err" />
            <p className="text-row leading-[1.55] text-t2">
              <span className="font-semibold text-err">Override</span>{' '}
              replaces all current contours with the new predictions. This cannot be undone.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-[7px] px-[14px] py-[11px] border-t border-ln">
          <button
            type="button"
            onClick={onClose}
            className="h-7 px-[11px] rounded-7 border border-ln2 text-btn font-semibold text-t2 hover:bg-hv transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => onConfirm('patch')}
            className="h-7 px-[11px] rounded-7 bg-ac text-btn font-bold text-onAccent hover:brightness-110 transition-[filter]"
          >
            Patch and run
          </button>
          <button
            type="button"
            onClick={() => onConfirm('override')}
            className="h-7 px-[11px] rounded-7 border border-errLn bg-errBg2 text-btn font-bold text-err hover:brightness-110 transition-[filter]"
          >
            Override and run
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstanceWarningModal;
