// Services.jsx
import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import ServiceCard from "./Service"
import {
    useAvailableSuggestionModels,
    useAvailablePromptedModels,
    useAvailableInstanceModels,
    useSuggestionModel,
    useFetchAvailableSuggestionModels,
    useFetchAvailablePromptedModels,
    useFetchAvailableInstanceModels,
    useIsLoadingSuggestionModels,
    useIsLoadingPromptedModels,
    useIsLoadingInstanceModels,
    useIsRunningSuggestion,
    useIsRunningInstance,
    usePromptedModel,
    useInstanceModel,
    useSetSuggestionModel,
    useSetPromptedModel,
    useSetInstanceModel,
    useInstanceRunRequested,
    useSetInstanceRunRequested,
    useSetInstanceWarningModalOpen,
} from "../../../stores/selectors/annotationSelectors";
import annotationSession from '../../../services/annotationSession';
import useModelSwitchPreloader from '../../../hooks/useModelSwitchPreloader';
import { useInstanceSegmentation } from '../../../hooks/useInstanceSegmentation';
import InstanceWarningModal from '../modals/InstanceWarningModal';

const getFirstModelId = (models) => {
    const first = (models || []).find((m) => m?.id || m?.registry_key || m?.identifier);
    return first?.id || first?.registry_key || first?.identifier || null;
};

const Services = () => {
    // Fetch models functions
    const fetchPromptedModels = useFetchAvailablePromptedModels();
    const fetchSuggestionModels = useFetchAvailableSuggestionModels();
    const fetchInstanceModels = useFetchAvailableInstanceModels();

    // Get current model lists (to avoid refetching if already loaded)
    const availablePromptedModels = useAvailablePromptedModels();
    const availableSuggestionModels = useAvailableSuggestionModels();
    const availableInstanceModels = useAvailableInstanceModels();

    // Get current model selections
    const promptedModel = usePromptedModel();
    const suggestionModel = useSuggestionModel();
    const instanceModel = useInstanceModel();
    const setPromptedModel = useSetPromptedModel();
    const setSuggestionModel = useSetSuggestionModel();
    const setInstanceModel = useSetInstanceModel();

    // Get running states
    const isRunningSuggestion = useIsRunningSuggestion();
    const isRunningInstance = useIsRunningInstance();

    // Instance segmentation warning modal
    const [showInstanceWarning, setShowInstanceWarning] = useState(false);
    const instanceRunRequested = useInstanceRunRequested();
    const setInstanceRunRequested = useSetInstanceRunRequested();
    const setInstanceWarningModalOpen = useSetInstanceWarningModalOpen();
    const { runInstance } = useInstanceSegmentation();

    // Open instance warning modal when requested (e.g. by shortcut "3")
    useEffect(() => {
        if (instanceRunRequested) {
            setShowInstanceWarning(true);
            setInstanceRunRequested(false);
        }
    }, [instanceRunRequested, setInstanceRunRequested]);

    // Sync modal open state to store so shortcuts don't steal Enter
    useEffect(() => {
        setInstanceWarningModalOpen(showInstanceWarning);
    }, [showInstanceWarning, setInstanceWarningModalOpen]);

    // Load models on mount only if not already loaded
    useEffect(() => {
        if (availablePromptedModels.length === 0) fetchPromptedModels();
        if (availableSuggestionModels.length === 0) fetchSuggestionModels();
        if (availableInstanceModels.length === 0) fetchInstanceModels();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Enforce deterministic default selections once model lists are available.
    useEffect(() => {
        if (!promptedModel) {
            const firstPromptedId = getFirstModelId(availablePromptedModels);
            if (firstPromptedId) setPromptedModel(firstPromptedId);
        }
    }, [promptedModel, availablePromptedModels, setPromptedModel]);

    useEffect(() => {
        if (!suggestionModel) {
            const firstSuggestionId = getFirstModelId(availableSuggestionModels);
            if (firstSuggestionId) setSuggestionModel(firstSuggestionId);
        }
    }, [suggestionModel, availableSuggestionModels, setSuggestionModel]);

    useEffect(() => {
        if (!instanceModel) {
            const firstInstanceId = getFirstModelId(availableInstanceModels);
            if (firstInstanceId) setInstanceModel(firstInstanceId);
        }
    }, [instanceModel, availableInstanceModels, setInstanceModel]);

    // Preload models when they change
    useModelSwitchPreloader(promptedModel, annotationSession.selectPromptedModel.bind(annotationSession), 'prompted');
    useModelSwitchPreloader(suggestionModel, annotationSession.selectSuggestionModel.bind(annotationSession), 'suggestion');
    useModelSwitchPreloader(instanceModel, annotationSession.selectInstanceModel.bind(annotationSession), 'instance');

    // Handle instance segmentation with warning
    const handleInstanceRun = () => {
        setShowInstanceWarning(true);
    };

    const handleInstanceConfirm = () => {
        setShowInstanceWarning(false);
        setInstanceRunRequested(false);
        setInstanceWarningModalOpen(false);
        runInstance();
    };

    const services = [
        {
            name: "Prompted Segmentation",
            models: availablePromptedModels,
            isLoading: useIsLoadingPromptedModels(),
            promptedModel: promptedModel,
            setPromptedModel: setPromptedModel,
            updateAvailableModels: fetchPromptedModels,
            isRunning: false,
        },
        {
            name: "Instance Suggestion",
            models: availableSuggestionModels,
            isLoading: useIsLoadingSuggestionModels(),
            promptedModel: suggestionModel,
            setPromptedModel: setSuggestionModel,
            updateAvailableModels: fetchSuggestionModels,
            isRunning: isRunningSuggestion,
            usageHint: "Shift-click objects to select exemplars, then right-click any exemplar and choose “Suggest Similar Instances” to run the model.",
        },
        {
            name: "Instance Segmentation",
            models: availableInstanceModels,
            isLoading: useIsLoadingInstanceModels(),
            promptedModel: instanceModel,
            setPromptedModel: setInstanceModel,
            updateAvailableModels: fetchInstanceModels,
            isRunning: isRunningInstance,
            onRun: handleInstanceRun,
        },
    ]

    return (
        <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="p-3 space-y-3">
                <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center">
                            <div className="p-1.5 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-lg mr-2 shadow-sm">
                                <Sparkles className="w-3.5 h-3.5 text-white" />
                            </div>
                            Annotation Services
                        </h3>
                    </div>
                    <p className="text-xs text-gray-500 ml-8">AI-powered models for segmentation</p>
                </div>

                {services.map((service, index) => (
                    <ServiceCard
                        key={service.name}
                        serviceName={service.name}
                        models={service.models}
                        isLoading={service.isLoading}
                        selectedModel={service.promptedModel}
                        setSelectedModel={service.setPromptedModel}
                        onModelSwitch={service.updateAvailableModels}
                        isRunning={service.isRunning}
                        onRun={service.onRun}
                        usageHint={service.usageHint}
                    />
                ))}
            </div>

            {/* Instance Segmentation Warning Modal */}
            <InstanceWarningModal
                isOpen={showInstanceWarning}
                onClose={() => {
                    setShowInstanceWarning(false);
                    setInstanceWarningModalOpen(false);
                }}
                onConfirm={handleInstanceConfirm}
            />
        </div>
    );
};

export default Services;
