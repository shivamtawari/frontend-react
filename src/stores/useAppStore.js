import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';

// Enable Map and Set support in Immer
enableMapSet();

const useAppStore = create()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        // State organized by domain
        datasets: {
          list: [],
          current: null,
          loading: false,
          error: null
        },
        
        ui: {
          loading: false,
          error: null,
          successMessage: null,
          // StatusBar specific state
          isSegmenting: false,
          promptedModel: null,
          suppressLoadingModal: false
        },
        
        downloads: {
          isCreatingDataset: false,
          isCreatingCSV: false,
          error: null
        },
        
        modals: {
          // DeleteDatasetModal state
          deleteConfirmText: '',
        },
        
        // Quantification explore surfaces.
        quantification: {
          // Saved Perspective viewer configurations — a config is a saved analysis
          // (pivot, filters, sort, chart type), so losing it on a tab switch or a
          // re-render throws away the user's actual work.
          //
          // Keyed by dataset and profile. The profile decides which metric columns exist
          // at all, so a config saved under one profile names columns that another does
          // not have, and restoring it there would fail or silently drop them.
          viewerConfigs: {}
        },

        // Gallery and Image Management State
        gallery: {
          // DatasetGallery state
          currentDataset: null,
          images: [],
          labels: [],
          stats: {},
          labelsLoaded: false,
          statsLoaded: false,
          loadingData: false,
          error: null,
          requestGeneration: 0,
          
          // ImageGallery state  
          searchTerm: '',
          // The status filter is two coordinates now that an image has three
          // independent phases: which phase to judge it on, and which state to
          // keep. `filterPhase: 'overall'` judges on the combined status.
          filterStatus: 'all', // all | not_started | in_progress | finished
          filterPhase: 'overall', // overall | calibrate | annotate | review
          // Subgroup filter: `{metadataKey: condition}`. Conditions within a key
          // are OR-ed and different keys AND-ed, matching the backend's reading
          // and the way a row of chips is expected to behave. A condition is
          // either an array of values (empty meaning "has this key at all,
          // whatever the value") or, for the typed keys, `{min, max}` for a range
          // and `{contains}` for a free-text substring.
          metadataFilters: {},
          // Separate from the map above because "has no metadata at all" is not a
          // value of any key — it is the complement of every subgroup, and it is
          // how a curator finds the images the grouping has missed.
          metadataOnlyUntagged: false,
          loadedImages: new Set(),
          showUploadModal: false,
          uploadProgress: { current: 0, total: 0 },
          uploadingFiles: [],
          uploadErrors: [],
          loadingErrors: new Map(),
          // Thumbnail cache - Map<imageId, thumbnailUrl>
          // This persists across component unmounts for better performance
          thumbnailCache: new Map(),
          // Maximum cache size to prevent memory issues
          maxCacheSize: 500
        },
        
        quantificationActions: {
          /** Stable key for the saved analysis of one dataset/profile pair. */
          // `scope` separates viewers that show the same dataset+profile through different
          // defaults — the dataset-wide explorer and the per-image pivot. Without it they
          // share one saved analysis, and opening one would overwrite the other's layout
          // with a grouping that makes no sense there. Kept as a suffix so the
          // `${datasetId}:` prefix scan in clearViewerConfigsForDataset still finds both.
          viewerConfigKey: (datasetId, profileId, scope = null) =>
            `${datasetId}:${profileId ?? 'none'}${scope ? `:${scope}` : ''}`,

          setViewerConfig: (key, config) => set(state => {
            state.quantification.viewerConfigs[key] = config;
          }),

          getViewerConfig: (key) => get().quantification.viewerConfigs[key] || null,

          // Used when a profile's metrics are edited: the columns just changed underneath
          // every saved config for that dataset, so they are dropped rather than left to
          // fail a restore against columns that no longer exist.
          clearViewerConfigsForDataset: (datasetId) => set(state => {
            Object.keys(state.quantification.viewerConfigs)
              .filter(key => key.startsWith(`${datasetId}:`))
              .forEach(key => { delete state.quantification.viewerConfigs[key]; });
          })
        },

        // Actions grouped by domain
        datasetActions: {
          setDatasets: (datasets) => set(state => {
            state.datasets.list = datasets;
          }),
          
          setCurrentDataset: (dataset) => set(state => {
            state.datasets.current = dataset;
          }),
          
          setLoading: (loading) => set(state => {
            state.datasets.loading = loading;
          }),
          
          setError: (error) => set(state => {
            state.datasets.error = error;
          })
        },
        
        uiActions: {
          setLoading: (loading) => set(state => {
            state.ui.loading = loading;
          }),
          
          setError: (error) => set(state => {
            state.ui.error = error;
          }),
          
          setSuccessMessage: (message) => set(state => {
            state.ui.successMessage = message;
          }),
          
          setIsSegmenting: (isSegmenting) => set(state => {
            state.ui.isSegmenting = isSegmenting;
          }),
          
          setPromptedModel: (model) => set(state => {
            state.ui.promptedModel = model;
          }),
          
          setSuppressLoadingModal: (suppress) => set(state => {
            state.ui.suppressLoadingModal = suppress;
          }),
          
          clearMessages: () => set(state => {
            state.ui.error = null;
            state.ui.successMessage = null;
          })
        },
        
        downloadActions: {
          setCreatingDataset: (isCreating) => set(state => {
            state.downloads.isCreatingDataset = isCreating;
          }),
          
          setCreatingCSV: (isCreating) => set(state => {
            state.downloads.isCreatingCSV = isCreating;
          }),
          
          setDownloadError: (error) => set(state => {
            state.downloads.error = error;
          }),
          
          clearDownloadState: () => set(state => {
            state.downloads.isCreatingDataset = false;
            state.downloads.isCreatingCSV = false;
            state.downloads.error = null;
          })
        },
        
        modalActions: {
          // DeleteDatasetModal actions
          setDeleteConfirmText: (text) => set(state => {
            state.modals.deleteConfirmText = text;
          }),
          
          clearDeleteConfirmText: () => set(state => {
            state.modals.deleteConfirmText = '';
          })
        },
        
        galleryActions: {
          // DatasetGallery actions
          // When switching dataset, clear cached images/labels/stats 
          setCurrentDataset: (dataset) => set(state => {
            const prevId = state.gallery.currentDataset?.id;
            const nextId = dataset?.id;
            if (prevId !== nextId) {
              state.gallery.images = [];
              state.gallery.labels = [];
              state.gallery.stats = {};
              state.gallery.labelsLoaded = false;
              state.gallery.statsLoaded = false;
              state.gallery.error = null;
              state.gallery.loadingData = false;
              state.gallery.requestGeneration = (state.gallery.requestGeneration || 0) + 1;
            }
            state.gallery.currentDataset = dataset;
          }),

          nextRequestGeneration: (datasetId = null) => {
            let nextGen = null;
            set(state => {
              if (datasetId != null && state.gallery.currentDataset?.id !== datasetId) {
                return;
              }
              state.gallery.requestGeneration = (state.gallery.requestGeneration || 0) + 1;
              nextGen = state.gallery.requestGeneration;
            });
            return nextGen;
          },

          getRequestGeneration: () => {
            return get().gallery.requestGeneration || 0;
          },
          
          setImages: (images) => set(state => {
            state.gallery.images = images;
          }),
          
          setLabels: (labels) => set(state => {
            state.gallery.labels = labels;
            state.gallery.labelsLoaded = true;
          }),
          
          setStats: (stats) => set(state => {
            state.gallery.stats = stats;
            state.gallery.statsLoaded = true;
          }),

          setLabelsLoaded: (loaded) => set(state => {
            state.gallery.labelsLoaded = loaded;
          }),

          setStatsLoaded: (loaded) => set(state => {
            state.gallery.statsLoaded = loaded;
          }),
          
          setLoadingData: (loading) => set(state => {
            state.gallery.loadingData = loading;
          }),
          
          setGalleryError: (error) => set(state => {
            state.gallery.error = error;
          }),
          
          // ImageGallery actions
          setSearchTerm: (term) => set(state => {
            state.gallery.searchTerm = term;
          }),
          
          setFilterStatus: (status) => set(state => {
            state.gallery.filterStatus = status;
          }),

          setFilterPhase: (phase) => set(state => {
            state.gallery.filterPhase = phase;
          }),

          // Add or remove one value of one metadata key. Selecting every value of
          // a key back off leaves no entry rather than an empty one, so "site: []"
          // keeps its distinct meaning of "tagged with site, any value".
          toggleMetadataFilterValue: (key, value) => set(state => {
            // Rehydrated pre-metadata sessions have no map at all (see selectors).
            if (!state.gallery.metadataFilters) state.gallery.metadataFilters = {};
            // A key holding a range condition (from a type change since the
            // filter was set) is replaced rather than spread into.
            const existing = state.gallery.metadataFilters[key];
            const selected = Array.isArray(existing) ? existing : [];
            const next = selected.includes(value)
              ? selected.filter((v) => v !== value)
              : [...selected, value];
            if (next.length === 0) {
              delete state.gallery.metadataFilters[key];
            } else {
              state.gallery.metadataFilters[key] = next;
            }
          }),

          setMetadataFilters: (filters) => set(state => {
            state.gallery.metadataFilters = filters;
          }),

          // Range and substring conditions for the typed keys. A condition with
          // nothing set in it is removed rather than stored, so an untouched
          // range control does not silently narrow the gallery to "has this key".
          setMetadataCondition: (key, condition) => set(state => {
            if (!state.gallery.metadataFilters) state.gallery.metadataFilters = {};
            const empty = !condition
              || (condition.min == null && condition.max == null && !condition.contains);
            if (empty) {
              delete state.gallery.metadataFilters[key];
            } else {
              state.gallery.metadataFilters[key] = condition;
            }
          }),

          setMetadataOnlyUntagged: (only) => set(state => {
            state.gallery.metadataOnlyUntagged = only;
            // "Untagged" and a subgroup filter can never both match anything.
            if (only) state.gallery.metadataFilters = {};
          }),

          clearMetadataFilters: () => set(state => {
            state.gallery.metadataFilters = {};
            state.gallery.metadataOnlyUntagged = false;
          }),


          addLoadedImage: (imageId) => set(state => {
            state.gallery.loadedImages = new Set([...state.gallery.loadedImages, imageId]);
          }),
          
          setShowUploadModal: (show) => set(state => {
            state.gallery.showUploadModal = show;
          }),
          
          setUploadProgress: (progress) => set(state => {
            state.gallery.uploadProgress = progress;
          }),
          
          setUploadingFiles: (files) => set(state => {
            state.gallery.uploadingFiles = files;
          }),
          
          addUploadingFiles: (newFiles) => set(state => {
            state.gallery.uploadingFiles = [...state.gallery.uploadingFiles, ...newFiles];
          }),
          
          removeUploadingFile: (index) => set(state => {
            state.gallery.uploadingFiles = state.gallery.uploadingFiles.filter((_, i) => i !== index);
          }),
          
          setUploadErrors: (errors) => set(state => {
            state.gallery.uploadErrors = errors;
          }),
          
          setLoadingError: (imageId, error) => set(state => {
            state.gallery.loadingErrors = new Map(state.gallery.loadingErrors).set(imageId, error);
          }),
          
          clearLoadingError: (imageId) => set(state => {
            const newErrors = new Map(state.gallery.loadingErrors);
            newErrors.delete(imageId);
            state.gallery.loadingErrors = newErrors;
          }),
          
          // Thumbnail cache actions
          setThumbnail: (imageId, thumbnailUrl) => set(state => {
            // if cache is full, remove oldest entries
            if (state.gallery.thumbnailCache.size >= state.gallery.maxCacheSize) {
              // Remove first 10% of entries
              const entriesToRemove = Math.floor(state.gallery.maxCacheSize * 0.1);
              const iterator = state.gallery.thumbnailCache.keys();
              for (let i = 0; i < entriesToRemove; i++) {
                const key = iterator.next().value;
                if (key !== undefined) {
                  state.gallery.thumbnailCache.delete(key);
                }
              }
            }
            state.gallery.thumbnailCache.set(imageId, thumbnailUrl);
          }),
          
          setThumbnails: (thumbnails) => set(state => {
            // Batch update thumbnails
            thumbnails.forEach(([imageId, thumbnailUrl]) => {
              if (state.gallery.thumbnailCache.size >= state.gallery.maxCacheSize) {
                // Evict oldest entry
                const firstKey = state.gallery.thumbnailCache.keys().next().value;
                if (firstKey !== undefined) {
                  state.gallery.thumbnailCache.delete(firstKey);
                }
              }
              state.gallery.thumbnailCache.set(imageId, thumbnailUrl);
            });
          }),
          
          getThumbnail: (imageId) => {
            const state = get();
            return state.gallery.thumbnailCache.get(imageId);
          },
          
          clearThumbnailCache: () => set(state => {
            state.gallery.thumbnailCache.clear();
          }),
          
          clearThumbnailsForDataset: (imageIds) => set(state => {
            imageIds.forEach(id => {
              state.gallery.thumbnailCache.delete(id);
            });
          }),
          
          resetGalleryState: () => set(state => {
            state.gallery.currentDataset = null;
            state.gallery.images = [];
            state.gallery.labels = [];
            state.gallery.stats = {};
            state.gallery.labelsLoaded = false;
            state.gallery.statsLoaded = false;
            state.gallery.loadingData = false;
            state.gallery.error = null;
            state.gallery.requestGeneration = (state.gallery.requestGeneration || 0) + 1;
            state.gallery.searchTerm = '';
            state.gallery.filterStatus = 'all';
            state.gallery.filterPhase = 'overall';
            state.gallery.metadataFilters = {};
            state.gallery.metadataOnlyUntagged = false;
            state.gallery.loadedImages = new Set();
            state.gallery.showUploadModal = false;
            state.gallery.uploadProgress = { current: 0, total: 0 };
            state.gallery.uploadingFiles = [];
            state.gallery.uploadErrors = [];
            state.gallery.loadingErrors = new Map();
          })
        }
      }))
    ),
    {
      name: 'coral-app-store'
    }
  )
);

export default useAppStore;
