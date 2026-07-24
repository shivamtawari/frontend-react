import React from 'react';
import { Ruler } from 'lucide-react';
import {
  useImageScale,
  useCurrentTool,
  useSetCurrentTool,
  useIsCalibrating,
  useStartCalibration,
  useCancelCalibration,
} from '../../../stores/selectors/annotationSelectors';

/**
 * Pixel Scale Calibration header control.
 * Displays current scale badge and provides a button to trigger scale calibration,
 * styled to match the main teal/cyan UI theme.
 */
const ScaleControl = () => {
  const scale = useImageScale();
  const currentTool = useCurrentTool();
  const setCurrentTool = useSetCurrentTool();
  const isCalibrating = useIsCalibrating();
  const startCalibration = useStartCalibration();
  const cancelCalibration = useCancelCalibration();

  const isScaleActive = isCalibrating || currentTool === 'set_scale';

  const handleToggleScale = () => {
    if (isScaleActive) {
      cancelCalibration();
      setCurrentTool('ai_annotation');
    } else {
      setCurrentTool('set_scale');
      startCalibration();
    }
  };

  const isCalibrated = scale?.unit && scale.unit !== 'px' && scale.scaleX > 0;

  return (
    <div className="flex items-center space-x-2 bg-white/90 backdrop-blur-sm rounded-lg p-1.5 shadow-lg border border-gray-100">
      {/* Scale status pill */}
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
        isCalibrated
          ? 'bg-teal-50 text-teal-700 border border-teal-200/60'
          : 'bg-gray-100 text-gray-500'
      }`}>
        <Ruler className={`w-3.5 h-3.5 ${isCalibrated ? 'text-teal-600' : 'text-gray-400'}`} />
        <span>
          {isCalibrated
            ? `1px = ${scale.scaleX.toFixed(4)} ${scale.unit}`
            : 'Uncalibrated'}
        </span>
      </div>

      {/* Set Scale Calibration button */}
      <button
        type="button"
        id="header-set-scale-button"
        onClick={handleToggleScale}
        className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 ${
          isScaleActive
            ? 'bg-teal-600 text-white shadow-sm'
            : 'bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-700 border border-transparent hover:border-teal-200'
        }`}
        title={isScaleActive ? 'Cancel calibration mode (ESC)' : 'Draw a ruler line on the image to set physical scale'}
      >
        <span>{isScaleActive ? 'Cancel Calibration' : 'Set Scale'}</span>
      </button>
    </div>
  );
};

export default ScaleControl;
