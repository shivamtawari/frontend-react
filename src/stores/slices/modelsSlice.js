import {
  getPromptedModels,
  getSuggestionModels,
  getModelFavorites,
  setModelFavorite,
  clearModelFavorite,
} from '../../api/models';
import { getInstanceModels } from '../../api/instance_segmentation';

/**
 * Models slice - manages AI model selection, available models, and per-task
 * favorite (default) models.
 */
const getModelId = (model) =>
  model?.id ?? model?.registry_key ?? model?.identifier ?? null;

// Default selection for a task: the user's favorite if it is currently
// available, otherwise the first model in the list.
const pickDefaultId = (models, favorite) => {
  const ids = (models || []).map(getModelId).filter(Boolean);
  if (favorite && ids.includes(favorite)) return favorite;
  return ids[0] ?? null;
};

export const createModelsSlice = (set, get) => ({
  setPromptedModel: (model) => set((state) => {
    state.models.promptedModel = model;
  }),

  setSuggestionModel: (model) => set((state) => {
    state.models.suggestionModel = model;
  }),

  setInstanceModel: (model) => set((state) => {
    state.models.instanceModel = model;
  }),

  setIsRunningSuggestion: (isRunning) => set((state) => {
    state.models.isRunningSuggestion = isRunning;
  }),

  setIsRunningInstance: (isRunning) => set((state) => {
    state.models.isRunningInstance = isRunning;
  }),

  // --- Favorites ---------------------------------------------------------

  // Load the user's favorite model per task ({ task: registry_key }).
  fetchModelFavorites: async () => {
    const result = await getModelFavorites();
    set((state) => {
      state.models.favorites = result.favorites || {};
      state.models.favoritesLoaded = true;
    });
    return get().models.favorites;
  },

  // Fetch favorites once, before defaults are computed.
  ensureFavoritesLoaded: async () => {
    if (get().models.favoritesLoaded) return;
    await get().fetchModelFavorites();
  },

  // Make `registryKey` the favorite (default) model for `task`. Optimistic;
  // reverts by refetching on failure.
  setFavoriteModel: async (task, registryKey) => {
    set((state) => {
      state.models.favorites = { ...state.models.favorites, [task]: registryKey };
    });
    const res = await setModelFavorite(task, registryKey);
    if (!res.success) await get().fetchModelFavorites();
  },

  // Clear the favorite model for `task`.
  clearFavoriteModel: async (task) => {
    set((state) => {
      const next = { ...state.models.favorites };
      delete next[task];
      state.models.favorites = next;
    });
    const res = await clearModelFavorite(task);
    if (!res.success) await get().fetchModelFavorites();
  },

  // --- Available models --------------------------------------------------

  fetchAvailableSuggestionModels: async () => {
    set((state) => {
      state.models.isLoadingSuggestionModels = true;
    });
    await get().ensureFavoritesLoaded();

    try {
      const result = await getSuggestionModels();
      if (result.success && result.models && result.models.length > 0) {
        const transformedModels = result.models.map(model => ({
          id: getModelId(model),
          name: model.name,
          description: model.description,
          tags: model.tags,
          supports_refinement: model.refinement_supported,
          model_status: model.model_status || 'ready',
        }));

        set((state) => {
          state.models.availableSuggestionModels = transformedModels;
          state.models.isLoadingSuggestionModels = false;
          if (!state.models.suggestionModel) {
            const chosen = pickDefaultId(transformedModels, state.models.favorites?.['instance-suggestion']);
            if (chosen) state.models.suggestionModel = chosen;
          }
        });
      } else {
        console.warn('No suggestion models returned from backend');
        set((state) => {
          state.models.availableSuggestionModels = [];
          state.models.isLoadingSuggestionModels = false;
        });
      }
    } catch (error) {
      console.error('Error fetching suggestion models:', error);
      set((state) => {
        state.models.availableSuggestionModels = [];
        state.models.isLoadingSuggestionModels = false;
      });
    }
  },

  fetchAvailablePromptedModels: async () => {
    set((state) => {
      state.models.isLoadingModels = true;
    });
    await get().ensureFavoritesLoaded();

    try {
      const result = await getPromptedModels();
      if (result.success && result.models && result.models.length > 0) {
        const transformedModels = result.models.map(model => ({
          id: getModelId(model),
          name: model.name,
          description: model.description,
          tags: model.tags,
          supported_prompt_types: model.prompt_types_supported,
          supports_refinement: model.refinement_supported,
          model_status: model.model_status || 'ready',
        }));

        set((state) => {
          state.models.availablePromptedModels = transformedModels;
          state.models.isLoadingModels = false;
          if (!state.models.promptedModel) {
            const chosen = pickDefaultId(transformedModels, state.models.favorites?.['prompted-segmentation']);
            if (chosen) state.models.promptedModel = chosen;
          }
        });
      } else {
        console.warn('No prompted models returned from backend');
        set((state) => {
          state.models.availablePromptedModels = [];
          state.models.isLoadingModels = false;
        });
      }
    } catch (error) {
      console.error('Error fetching AI models:', error);
      set((state) => {
        state.models.availablePromptedModels = [];
        state.models.isLoadingModels = false;
      });
    }
  },

  fetchAvailableInstanceModels: async (datasetId) => {
    const activeDatasetId = datasetId || get().images?.currentImage?.dataset_id || null;
    const requestId = (get().models.instanceModelsRequestId || 0) + 1;

    set((state) => {
      state.models.instanceModelsRequestId = requestId;
      state.models.availableInstanceModels = [];
      state.models.instanceModel = null;
      state.models.isLoadingInstanceModels = true;
    });

    if (!activeDatasetId) {
      set((state) => {
        if (state.models.instanceModelsRequestId === requestId) {
          state.models.isLoadingInstanceModels = false;
        }
      });
      return;
    }

    await get().ensureFavoritesLoaded();

    try {
      const result = await getInstanceModels(activeDatasetId);
      const modelsList = Array.isArray(result?.result) ? result.result : [];
      if (result?.success && modelsList.length > 0) {
        const transformedModels = modelsList.map(model => ({
          id: getModelId(model),
          name: model.name,
          description: model.description,
          tags: model.tags,
          model_status: model.model_status || 'ready',
        }));

        set((state) => {
          if (state.models.instanceModelsRequestId !== requestId) return;
          state.models.availableInstanceModels = transformedModels;
          state.models.isLoadingInstanceModels = false;
          if (!state.models.instanceModel) {
            const chosen = pickDefaultId(transformedModels, state.models.favorites?.['instance-segmentation']);
            if (chosen) state.models.instanceModel = chosen;
          }
        });
      } else {
        console.warn('No instance models returned from backend');
        set((state) => {
          if (state.models.instanceModelsRequestId !== requestId) return;
          state.models.availableInstanceModels = [];
          state.models.isLoadingInstanceModels = false;
          state.models.instanceModel = null;
        });
      }
    } catch (error) {
      console.error('Error fetching instance models:', error);
      set((state) => {
        if (state.models.instanceModelsRequestId !== requestId) return;
        state.models.availableInstanceModels = [];
        state.models.isLoadingInstanceModels = false;
        state.models.instanceModel = null;
      });
    }
  },

});
