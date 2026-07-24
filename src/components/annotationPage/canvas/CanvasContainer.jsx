import React, { useRef, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import PromptOverlay from './PromptOverlay';
import SegmentationOverlay from './SegmentationOverlay';
import AIPromptCanvas from './AIPromptCanvas';
import ManualDrawCanvas from './ManualDrawCanvas';
import ModelSelectionHint from './ModelSelectionHint';
import RunAIButton from './RunAIButton';
import SuggestSimilarButton from './SuggestSimilarButton';
import AddAsObjectButton from './AddAsObjectButton';
import ObjectContextMenu from './ObjectContextMenu';
import FocusOverlay from './FocusOverlay';
import RefinementOverlay from './RefinementOverlay';
import EditableContourOverlay from './EditableContourOverlay';
import LineEditCanvas from './LineEditCanvas';
import ScaleCalibrationOverlay from './ScaleCalibrationOverlay';
import ScaleBarIndicator from './ScaleBarIndicator';
import useAIAnnotationShortcuts from '../../../hooks/useAIAnnotationShortcuts';
import useAISegmentation from '../../../hooks/useAISegmentation';
import useFocusModeEscape from '../../../hooks/useFocusModeEscape';
import useMultiSelectShortcuts from '../../../hooks/useMultiSelectShortcuts';
import {
  useCurrentTool,
  useInstantSegmentation,
  useAIPrompts,
  usePromptedModel,
  useIsSubmitting,
  useAvailablePromptedModels,
  useIsLoadingPromptedModels,
  useFetchAvailablePromptedModels,
  useRefinementModeActive, useSetPromptedModel,
  useFocusModeActive,
  useLineEditActive,
} from '../../../stores/selectors/annotationSelectors';

const CanvasContainer = ({ imageObject, currentImage, zoomLevel, panOffset, isDragging }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const currentTool = useCurrentTool();
  const instantSegmentation = useInstantSegmentation();
  const prompts = useAIPrompts();
  const promptedModel = usePromptedModel();
  const availablePromptedModels = useAvailablePromptedModels();
  const isLoadingPromptedModels = useIsLoadingPromptedModels();
  const fetchAvailablePromptedModels = useFetchAvailablePromptedModels();
  const setPromptedModel = useSetPromptedModel();
  const isSubmitting = useIsSubmitting();
  const refinementModeActive = useRefinementModeActive();
  const focusModeActive = useFocusModeActive();
  const lineEditActive = useLineEditActive();
  const previousPromptsLengthRef = useRef(0);
  const previousRefinementModeRef = useRef(false);
  const refinementModeEnteredTimeRef = useRef(0);
  
  // AI Segmentation hook
  const { runSegmentation, error } = useAISegmentation();
  
  // Enable keyboard shortcuts for AI annotation
  useAIAnnotationShortcuts();
  
  // Enable Escape key to exit focus mode
  useFocusModeEscape();
  
  // Enable keyboard shortcuts for multi-select operations
  useMultiSelectShortcuts();

  const handleRunAI = useCallback(async () => {
    const result = await runSegmentation();
    if (!result.success) {
      console.error('Segmentation failed:', result.error);
      // TODO: toast notification here
    }
  }, [runSegmentation]);

  // Reset previousPromptsLengthRef when entering/exiting refinement mode
  useEffect(() => {
    // If refinement mode state changed, reset the previous prompts length
    if (previousRefinementModeRef.current !== refinementModeActive) {
      previousPromptsLengthRef.current = 0;
      previousRefinementModeRef.current = refinementModeActive;
      
      // Track when refinement mode was entered to ensure backend is ready
      if (refinementModeActive) {
        refinementModeEnteredTimeRef.current = Date.now();
      }
    }
  }, [refinementModeActive]);

  // Ensure prompted models are fetched and a default model is selected in AI mode,
  // even if the sidebar wasn't interacted with.
  useEffect(() => {
    if (currentTool !== 'ai_annotation') {
      return;
    }

    if (!isLoadingPromptedModels && availablePromptedModels.length === 0) {
      fetchAvailablePromptedModels();
      return;
    }

    if (!promptedModel && availablePromptedModels.length > 0) {
      const firstModelId = availablePromptedModels.find((m) => m?.id)?.id;
      if (firstModelId) setPromptedModel(firstModelId);
    }
  }, [
    currentTool,
    promptedModel,
    availablePromptedModels,
    isLoadingPromptedModels,
    fetchAvailablePromptedModels,
    setPromptedModel,
  ]);

  // Auto-trigger segmentation when instant segmentation is enabled and a prompt is added
  useEffect(() => {
    // Only trigger if:
    // 1. Instant segmentation is enabled
    // 2. Current tool is AI annotation
    // 3. A model is selected
    // 4. Not already submitting
    // 5. Prompts exist
    // 6. A new prompt was just added (prompts.length increased)
    if (
      instantSegmentation &&
      currentTool === 'ai_annotation' &&
      promptedModel &&
      !isSubmitting &&
      prompts.length > 0 &&
      prompts.length > previousPromptsLengthRef.current
    ) {
      // Calculate appropriate delay
      let delay = 100; // Default delay for normal segmentation
      
      // In refinement mode, ensure minimum time has passed since entering refinement mode
      if (refinementModeActive) {
        const timeSinceRefinementEntered = Date.now() - refinementModeEnteredTimeRef.current;
        const minReadyTime = 200; // Minimum time for backend to be ready
        
        // If we just entered refinement mode, wait longer
        if (timeSinceRefinementEntered < minReadyTime) {
          delay = minReadyTime - timeSinceRefinementEntered + 150; // Extra buffer
        } else {
          delay = 150; // Backend should be ready, but still use slightly longer delay
        }
      }
      
      const timeoutId = setTimeout(() => {
        handleRunAI();
      }, delay);
      
      return () => clearTimeout(timeoutId);
    }
    
    // Update the previous prompts length
    previousPromptsLengthRef.current = prompts.length;
  }, [instantSegmentation, currentTool, promptedModel, isSubmitting, prompts.length, refinementModeActive, handleRunAI]);

  // Cursor for non-AI tools (base image remains mounted for all tools)
  const getCanvasCursor = () => {
    switch (currentTool) {
      case 'selection':
        return 'cursor-pointer'; // Hand pointer for selection
      case 'manual_drawing':
        return 'cursor-crosshair'; // Crosshair for drawing
      case 'suggestion':
        return 'cursor-pointer'; // Hand pointer for suggestion
      default:
        return 'cursor-default';
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full ${getCanvasCursor()} overflow-hidden`}
      onDragStart={(e) => e.preventDefault()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <div
        className="relative w-full h-full"
        style={{
          transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
          transformOrigin: 'center center'
        }}
      >
        <img
          ref={canvasRef}
          src={imageObject.src}
          alt={currentImage?.name || 'Annotation Image'}
          className="object-contain w-full h-full"
          style={{
            display: 'block',
          }}
          draggable={false}
        />

        {/* Overlays for traditional tools */}
        {currentTool !== 'ai_annotation' && (
          <PromptOverlay canvasRef={canvasRef} />
        )}
      </div>

      {/* Segmentation results overlay (for all tools) - outside transform for correct positioning */}
      <SegmentationOverlay canvasRef={canvasRef} zoomLevel={zoomLevel} panOffset={panOffset} />

      {/* Focus mode overlay (shows dimmed area and focused object) */}
      <FocusOverlay canvasRef={canvasRef} zoomLevel={zoomLevel} panOffset={panOffset} />

      {/* Refinement mode overlay (shows indicator and exit button) */}
      <RefinementOverlay />

      {/* Edit mode overlay (shows draggable control points for contour editing) */}
      <EditableContourOverlay canvasRef={canvasRef} zoomLevel={zoomLevel} panOffset={panOffset} />

      {/* Line-edit mode: draw a line that gets merged into a contour (cut/add).
          Mounted only while active so its viewport measures its container on the
          first render (otherwise the stage stays 0-sized and eats clicks). */}
      {lineEditActive && <LineEditCanvas />}

      {/* Scale calibration overlay — active only when set_scale tool is selected */}
      <ScaleCalibrationOverlay canvasRef={canvasRef} zoomLevel={zoomLevel} panOffset={panOffset} />

      {/* Scale bar — shown in bottom-right whenever a real-world scale is set */}
      <ScaleBarIndicator canvasRef={canvasRef} zoomLevel={zoomLevel} />

      {/* Context menu for object labeling */}
      <ObjectContextMenu />

      {/* Bottom-center action row.
          - Run AI Segmentation: shown only in the AI annotation tool (handles its
            own visibility, including refinement mode).
          - Suggest Similar (Instance Suggestion): always visible so users discover
            it; lights up when a homogeneous selection (same class, or all
            unlabelled) is selected.
          Rendered side by side at z-70 so both stay above the control-points
          overlay (z-65) and remain clickable. */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-[70] flex items-end gap-3 pointer-events-none">
        <RunAIButton onRunAI={handleRunAI} />
        <SuggestSimilarButton />
      </div>

      {/* Instant mode: show processing indicator when prompt was placed and request is in flight */}
      {currentTool === 'ai_annotation' && instantSegmentation && isSubmitting && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-teal-600/95 text-white text-sm font-medium shadow-lg border border-teal-500/50"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-5 h-5 animate-spin shrink-0" />
          <span>Processing segmentation…</span>
        </div>
      )}

      {/* AI tool overlays — in refinement mode use z-62 so prompt canvas sits above contour line (55) and below control points (65) */}
      {currentTool === 'ai_annotation' && (
        <div
          className="absolute inset-0 pointer-events-none"
          /* In focus mode lift the prompt canvas (and its toolbar) above the
             FocusOverlay dim (z40), but keep it below the overlay's buttons (z50)
             so "Exit Focus" stays clickable. Refinement uses z62 so the
             control-points overlay (z65) can still sit above the prompt canvas. */
          style={{ zIndex: refinementModeActive ? 62 : (focusModeActive ? 45 : undefined) }}
        >
          <div className="absolute inset-0 pointer-events-auto">
            <AIPromptCanvas 
              width={containerRef.current?.offsetWidth || 800}
              height={containerRef.current?.offsetHeight || 600}
              renderBackground={false}
            />
            <ModelSelectionHint />
            {/* Run AI button lives in the shared bottom-center row below. */}
            {/* Save drawn shapes (box/polygon/freehand) directly as objects, no model */}
            {!refinementModeActive && <AddAsObjectButton />}
          </div>
          {error && (
            <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
              <div className="bg-red-50 border-2 border-red-300 rounded-lg px-4 py-2 shadow-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual drawing tool: draw polygon / freehand object outlines by hand */}
      {currentTool === 'manual_drawing' && (
        <div className="absolute inset-0 pointer-events-auto">
          <ManualDrawCanvas />
        </div>
      )}
    </div>
  );
};

export default CanvasContainer;
