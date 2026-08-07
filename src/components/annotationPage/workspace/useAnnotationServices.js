import { useEffect, useState } from 'react';
import {
  useAvailablePromptedModels,
  useAvailableSuggestionModels,
  useAvailableInstanceModels,
  useFetchAvailablePromptedModels,
  useFetchAvailableSuggestionModels,
  useFetchAvailableInstanceModels,
  useIsLoadingPromptedModels,
  useIsLoadingSuggestionModels,
  useIsLoadingInstanceModels,
  useIsRunningSuggestion,
  useIsRunningInstance,
  usePromptedModel,
  useSuggestionModel,
  useInstanceModel,
  useSetPromptedModel,
  useSetSuggestionModel,
  useSetInstanceModel,
  useInstanceRunRequested,
  useSetInstanceRunRequested,
  useSetInstanceWarningModalOpen,
} from '../../../stores/selectors/annotationSelectors';
import annotationSession from '../../../services/annotationSession';
import useModelSwitchPreloader from '../../../hooks/useModelSwitchPreloader';
import { useInstanceSegmentation } from '../../../hooks/useInstanceSegmentation';

const getFirstModelId = (models) => {
  const first = (models || []).find((m) => m?.id || m?.registry_key || m?.identifier);
  return first?.id || first?.registry_key || first?.identifier || null;
};

/**
 * Model lists, selections, defaults, preloading and the instance-segmentation
 * warning flow for the three annotation services.
 *
 * Lifted verbatim from the old Services component so the options drawer only
 * has to render. The behaviour it preserves:
 *  - fetch each model list once,
 *  - force a deterministic default selection as soon as a list arrives,
 *  - push every selection change to the backend so the model is warm,
 *  - open the instance warning modal both from its Run button and from the
 *    `3` shortcut, which sets `instanceRunRequested` in the store.
 */
export default function useAnnotationServices() {
  const fetchPromptedModels = useFetchAvailablePromptedModels();
  const fetchSuggestionModels = useFetchAvailableSuggestionModels();
  const fetchInstanceModels = useFetchAvailableInstanceModels();

  const availablePromptedModels = useAvailablePromptedModels();
  const availableSuggestionModels = useAvailableSuggestionModels();
  const availableInstanceModels = useAvailableInstanceModels();

  const promptedModel = usePromptedModel();
  const suggestionModel = useSuggestionModel();
  const instanceModel = useInstanceModel();
  const setPromptedModel = useSetPromptedModel();
  const setSuggestionModel = useSetSuggestionModel();
  const setInstanceModel = useSetInstanceModel();

  const isLoadingPrompted = useIsLoadingPromptedModels();
  const isLoadingSuggestion = useIsLoadingSuggestionModels();
  const isLoadingInstance = useIsLoadingInstanceModels();
  const isRunningSuggestion = useIsRunningSuggestion();
  const isRunningInstance = useIsRunningInstance();

  const instanceRunRequested = useInstanceRunRequested();
  const setInstanceRunRequested = useSetInstanceRunRequested();
  const setInstanceWarningModalOpen = useSetInstanceWarningModalOpen();
  const { runInstance } = useInstanceSegmentation();

  const [showInstanceWarning, setShowInstanceWarning] = useState(false);

  useEffect(() => {
    if (instanceRunRequested) {
      setShowInstanceWarning(true);
      setInstanceRunRequested(false);
    }
  }, [instanceRunRequested, setInstanceRunRequested]);

  // Mirrored to the store so keyboard shortcuts don't steal Enter while the
  // modal has focus.
  useEffect(() => {
    setInstanceWarningModalOpen(showInstanceWarning);
  }, [showInstanceWarning, setInstanceWarningModalOpen]);

  useEffect(() => {
    if (availablePromptedModels.length === 0) fetchPromptedModels();
    if (availableSuggestionModels.length === 0) fetchSuggestionModels();
    if (availableInstanceModels.length === 0) fetchInstanceModels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!promptedModel) {
      const id = getFirstModelId(availablePromptedModels);
      if (id) setPromptedModel(id);
    }
  }, [promptedModel, availablePromptedModels, setPromptedModel]);

  useEffect(() => {
    if (!suggestionModel) {
      const id = getFirstModelId(availableSuggestionModels);
      if (id) setSuggestionModel(id);
    }
  }, [suggestionModel, availableSuggestionModels, setSuggestionModel]);

  useEffect(() => {
    if (!instanceModel) {
      const id = getFirstModelId(availableInstanceModels);
      if (id) setInstanceModel(id);
    }
  }, [instanceModel, availableInstanceModels, setInstanceModel]);

  useModelSwitchPreloader(
    promptedModel,
    annotationSession.selectPromptedModel.bind(annotationSession),
    'prompted'
  );
  useModelSwitchPreloader(
    suggestionModel,
    annotationSession.selectSuggestionModel.bind(annotationSession),
    'suggestion'
  );
  useModelSwitchPreloader(
    instanceModel,
    annotationSession.selectInstanceModel.bind(annotationSession),
    'instance'
  );

  const closeInstanceWarning = () => {
    setShowInstanceWarning(false);
    setInstanceWarningModalOpen(false);
  };

  const confirmInstanceRun = (mode) => {
    setShowInstanceWarning(false);
    setInstanceRunRequested(false);
    setInstanceWarningModalOpen(false);
    runInstance(mode);
  };

  const services = [
    {
      key: 'prompted',
      task: 'prompted-segmentation',
      name: 'Prompted Segmentation',
      models: availablePromptedModels,
      isLoading: isLoadingPrompted,
      selectedModel: promptedModel,
      setSelectedModel: setPromptedModel,
      isRunning: false,
      hasInstantMode: true,
    },
    {
      key: 'suggestion',
      task: 'instance-suggestion',
      name: 'Instance Suggestion',
      models: availableSuggestionModels,
      isLoading: isLoadingSuggestion,
      selectedModel: suggestionModel,
      setSelectedModel: setSuggestionModel,
      isRunning: isRunningSuggestion,
      usageHint:
        'Shift-click objects to select exemplars, then right-click any exemplar and choose “Suggest Similar Instances”.',
    },
    {
      key: 'instance',
      task: 'instance-segmentation',
      name: 'Instance Segmentation',
      models: availableInstanceModels,
      isLoading: isLoadingInstance,
      selectedModel: instanceModel,
      setSelectedModel: setInstanceModel,
      isRunning: isRunningInstance,
      onRun: () => setShowInstanceWarning(true),
    },
  ];

  return {
    services,
    showInstanceWarning,
    closeInstanceWarning,
    confirmInstanceRun,
  };
}
