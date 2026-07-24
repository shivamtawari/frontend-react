import React from 'react';
import { MousePointerClick, Square, Hexagon, Spline, Ruler } from 'lucide-react';
import {
  usePromptMode,
  useSetPromptMode,
  useCurrentTool,
  useSetCurrentTool,
  useStartCalibration,
  useCancelCalibration,
  useIsCalibrating,
  useImageScale,
} from '../../../../stores/selectors/annotationSelectors';

/**
 * Floating toolbar (top-left of the AI prompt canvas) for choosing how the user
 * draws prompts: points, bounding box, polygon, or freehand sketch.
 *
 * Polygon and freehand both serialize to the backend `polygon_prompt`, so they
 * are enabled whenever the active model advertises polygon support. Point and
 * box are always available. When `supportedTypes` is empty/unknown we enable all
 * modes so the controls degrade gracefully for models that don't declare them.
 */
const MODES = [
  { id: 'point', label: 'Points', icon: MousePointerClick, requires: 'point', hotkey: 'P' },
  { id: 'box', label: 'Box', icon: Square, requires: 'box', hotkey: 'B' },
  { id: 'polygon', label: 'Polygon', icon: Hexagon, requires: 'polygon', hotkey: 'G' },
  { id: 'freehand', label: 'Freehand', icon: Spline, requires: 'polygon', hotkey: 'F' },
];

const PromptModeToolbar = ({ supportedTypes, shiftDown = false }) => {
  const promptMode = usePromptMode();
  const setPromptMode = useSetPromptMode();
  const currentTool = useCurrentTool();
  const setCurrentTool = useSetCurrentTool();
  const startCalibration = useStartCalibration();
  const cancelCalibration = useCancelCalibration();
  const isCalibrating = useIsCalibrating();
  const scale = useImageScale();

  const handleToggleScale = () => {
    if (currentTool === 'set_scale' || isCalibrating) {
      cancelCalibration();
      setCurrentTool('ai_annotation');
    } else {
      setCurrentTool('set_scale');
      startCalibration();
    }
  };

  // Normalize the model's advertised prompt types to canonical singular keys.
  const declared = Array.isArray(supportedTypes) ? supportedTypes : [];
  const hasDeclarations = declared.length > 0;
  const normalized = new Set(
    declared.map((t) =>
      String(t || '')
        .trim()
        .toLowerCase()
        .replace(/s$/, '')
    )
  );

  const isSupported = (requires) => {
    // Point and box are always offered; polygon/freehand need polygon support.
    if (requires === 'point' || requires === 'box') return true;
    if (!hasDeclarations) return true; // model didn't declare — don't block
    return normalized.has(requires);
  };

  return (
    <div className={`absolute ${shiftDown ? 'top-20' : 'top-4'} left-4 z-50 flex items-center gap-1 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg p-1`}>
      {MODES.map(({ id, label, icon: Icon, requires, hotkey }) => {
        const enabled = isSupported(requires);
        const active = promptMode === id;
        return (
          <button
            key={id}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && setPromptMode(id)}
            title={
              enabled
                ? `${label} prompt (${hotkey})`
                : `The selected model doesn't support ${label.toLowerCase()} prompts`
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !enabled
                ? 'text-gray-300 cursor-not-allowed'
                : active
                ? 'bg-teal-500 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
            <kbd
              className={`hidden md:inline text-[10px] font-semibold leading-none px-1 py-0.5 rounded border ${
                active ? 'border-white/40 text-white/90' : 'border-gray-300 text-gray-400'
              }`}
            >
              {hotkey}
            </kbd>
          </button>
        );
      })}

      <div className="w-px h-4 bg-gray-200 mx-0.5" />

      {/* Set Scale Button */}
      <button
        type="button"
        id="set-scale-canvas-toolbar-button"
        onClick={handleToggleScale}
        title={
          scale?.unit !== 'px'
            ? `Calibrated: 1px = ${scale?.scaleX?.toFixed(4)} ${scale?.unit}`
            : 'Draw a ruler line to set scale'
        }
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          currentTool === 'set_scale' || isCalibrating
            ? 'bg-amber-500 text-white shadow-sm'
            : scale?.unit !== 'px'
            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        <Ruler className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {scale?.unit !== 'px' ? scale?.unit : 'Scale'}
        </span>
      </button>
    </div>
  );
};

export default PromptModeToolbar;
