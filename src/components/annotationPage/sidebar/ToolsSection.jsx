import React from 'react';
import { MousePointer, Pencil, Sparkles, CheckCircle, Ruler } from 'lucide-react';
import { 
  useCurrentTool, 
  useSetCurrentTool, 
  useLeftSidebarCollapsed,
  useInstantSegmentation,
  useToggleInstantSegmentation,
  useStartCalibration,
  useCancelCalibration,
  useImageScale,
} from '../../../stores/selectors/annotationSelectors';
import ModelSelectors from './ModelSelectors';

const ToolsSection = () => {
  const currentTool = useCurrentTool();
  const setCurrentTool = useSetCurrentTool();
  const leftSidebarCollapsed = useLeftSidebarCollapsed();
  const instantSegmentation = useInstantSegmentation();
  const toggleInstantSegmentation = useToggleInstantSegmentation();
  const startCalibration = useStartCalibration();
  const cancelCalibration = useCancelCalibration();
  const scale = useImageScale();

  const handleToolChange = (toolId) => {
    if (toolId === 'set_scale') {
      if (currentTool === 'set_scale') {
        // Toggle off: exit calibration mode and return to previous tool
        cancelCalibration();
        setCurrentTool('ai_annotation');
      } else {
        setCurrentTool('set_scale');
        startCalibration();
      }
      return;
    }
    // Switching away from scale tool: cancel any active calibration
    if (currentTool === 'set_scale') {
      cancelCalibration();
    }
    setCurrentTool(toolId);
  };

  const tools = [
    { id: 'selection', name: 'Selection', icon: MousePointer, description: 'Select and manipulate objects', disabled: false },
    { id: 'manual_drawing', name: 'Manual Drawing', icon: Pencil, description: 'Draw polygon or freehand annotations by hand', disabled: false },
    { id: 'ai_annotation', name: 'AI assisted Annotation', icon: Sparkles, description: 'Use AI models for automatic segmentation', disabled: false },
    { id: 'suggestion', name: 'Annotation Suggestion', icon: CheckCircle, description: 'Automatically detect new objects given one or multiple examples', disabled: true },
    {
      id: 'set_scale',
      name: 'Set Scale',
      icon: Ruler,
      description: scale?.unit !== 'px'
        ? `Calibrated: 1px = ${scale.scaleX.toFixed(4)} ${scale.unit}`
        : 'Draw a line to set the real-world scale',
      disabled: false,
    },
  ];

  if (leftSidebarCollapsed) {
    return (
      <div className="flex-1 flex flex-col p-1">
        {/* Collapsed Tools Icons */}
        <div className="space-y-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const isActive = currentTool === tool.id;
            const isDisabled = tool.disabled;
            
            return (
              <button
                key={tool.id}
                onClick={() => !isDisabled && handleToolChange(tool.id)}
                disabled={isDisabled}
                className={`w-full p-2 rounded transition-colors flex items-center justify-center ${
                  isDisabled
                    ? 'opacity-50 cursor-not-allowed text-gray-400'
                    : isActive 
                      ? 'bg-teal-50 text-teal-600' 
                      : 'hover:bg-gray-100 text-gray-600'
                }`}
                title={tool.name}
              >
                <Icon className="w-5 h-5" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Tools List */}
      <div className="p-2 lg:p-3 space-y-1.5">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = currentTool === tool.id;
          const isDisabled = tool.disabled;
          
          return (
            <button
              key={tool.id}
              onClick={() => !isDisabled && handleToolChange(tool.id)}
              disabled={isDisabled}
              className={`w-full flex items-center space-x-2.5 p-2 rounded-lg transition-all text-left ${
                isDisabled
                  ? 'opacity-50 cursor-not-allowed border-2 border-transparent text-gray-400'
                  : isActive 
                    ? 'bg-teal-50 border-2 border-teal-200 text-teal-800' 
                    : 'hover:bg-gray-50 border-2 border-transparent text-gray-700'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isDisabled ? 'text-gray-400' : isActive ? 'text-teal-600' : 'text-gray-500'}`} />
              <div className="flex-1">
                <div className={`font-medium text-xs ${isDisabled ? 'text-gray-400' : isActive ? 'text-teal-800' : 'text-gray-900'}`}>
                  {tool.name}
                </div>
                <div className={`text-xs leading-tight ${isDisabled ? 'text-gray-400' : 'text-gray-500'}`}>
                  {tool.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      
      {/* Model Selectors - Show right below tools */}
      <div className="border-t border-gray-200 p-2">
        <ModelSelectors />
      </div>
      
      {/* Instant Segmentation Toggle - Only show when AI annotation tool is active */}
      {currentTool === 'ai_annotation' && (
        <div className="border-t border-gray-200 p-3">
          <label className="flex items-start justify-between cursor-pointer group hover:bg-gray-50 rounded-lg -m-1 p-1 transition-colors focus-within:bg-teal-50/50">
            <div className="flex-1 pr-3">
              <div className="text-xs font-semibold text-gray-900 group-hover:text-teal-700 transition-colors">
                Instant Prompted Segmentation
              </div>
              <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                Auto-trigger segmentation when prompt is added
              </div>
            </div>
            <div className="ml-2 relative flex-shrink-0 pt-0.5">
              <input
                type="checkbox"
                checked={instantSegmentation}
                onChange={toggleInstantSegmentation}
                className="sr-only peer"
              />
              <div
                className={`relative w-12 h-6 rounded-full transition-all duration-300 ease-in-out ring-0 ${
                  instantSegmentation 
                    ? 'bg-gradient-to-r from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30 ring-2 ring-teal-500/20' 
                    : 'bg-gray-300 group-hover:bg-gray-400'
                } peer-focus:ring-2 peer-focus:ring-teal-500/50 peer-focus:ring-offset-2`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transform transition-all duration-300 ease-in-out ${
                    instantSegmentation 
                      ? 'translate-x-6' 
                      : 'translate-x-0.5'
                  }`}
                  style={{
                    boxShadow: instantSegmentation 
                      ? '0 2px 8px rgba(0, 0, 0, 0.2), 0 1px 3px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9)' 
                      : '0 2px 4px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
                  }}
                />
              </div>
            </div>
          </label>
        </div>
      )}
      
    </div>
  );
};

export default ToolsSection;