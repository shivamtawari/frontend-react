import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Confirms an instance-segmentation run, which replaces every contour on the
 * mask. Destructive enough to warrant the danger treatment rather than the
 * primary one.
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
      <div className="w-[420px] max-w-[calc(100%-32px)] rounded-12 bg-p1 border border-ln2 shadow-modal animate-dcPop">
        <div className="flex items-center gap-[8px] px-[14px] py-[12px] border-b border-ln">
          <AlertTriangle size={15} className="text-warn flex-none" />
          <h2 className="flex-1 text-modaltitle font-bold text-t1">
            Apply Instance Segmentation
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
          <p className="text-row leading-[1.55] text-t2">
            How would you like to apply the predicted instances?
          </p>
          <div className="flex flex-col gap-2 mt-2">
            <div className="p-3 bg-well rounded border border-ln">
              <p className="font-semibold text-t1 mb-1">Patch (Recommended)</p>
              <p className="text-xs text-t3">
                Keeps all existing annotations and adds new predictions. 
                Suppresses duplicate predictions that overlap heavily with existing ones.
              </p>
            </div>
            <div className="p-3 bg-errBg/30 rounded border border-errLn">
              <p className="font-semibold text-warn mb-1">Replace</p>
              <p className="text-xs text-t3">
                <span className="font-semibold text-warn">Deletes all existing contours</span> for the classes the model predicts, 
                then adds the new predictions. Other classes are preserved.
              </p>
            </div>
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
            onClick={() => onConfirm('replace')}
            className="h-7 px-[11px] rounded-7 border border-errLn text-err hover:bg-errBg transition-colors"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => onConfirm('patch')}
            className="h-7 px-[11px] rounded-7 border border-revLn bg-revBg2 text-btn font-bold text-rev hover:brightness-110 transition-[filter]"
          >
            Patch (Recommended)
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstanceWarningModal;
