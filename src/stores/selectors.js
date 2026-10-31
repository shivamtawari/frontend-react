import useAppStore from './useAppStore';

// Dataset selectors
export const useDatasets = () => useAppStore(state => state.datasets);
export const useDatasetList = () => useAppStore(state => state.datasets.list);
export const useCurrentDataset = () => useAppStore(state => state.datasets.current);
export const useDatasetsLoading = () => useAppStore(state => state.datasets.loading);
export const useDatasetsError = () => useAppStore(state => state.datasets.error);

// Dataset actions
export const useDatasetActions = () => useAppStore(state => state.datasetActions);

// UI selectors
export const useUI = () => useAppStore(state => state.ui);
export const useUILoading = () => useAppStore(state => state.ui.loading);
export const useUIError = () => useAppStore(state => state.ui.error);
export const useUISuccessMessage = () => useAppStore(state => state.ui.successMessage);
export const useIsSegmenting = () => useAppStore(state => state.ui.isSegmenting);
export const useSelectedModel = () => useAppStore(state => state.ui.promptedModel);
export const useSuppressLoadingModal = () => useAppStore(state => state.ui.suppressLoadingModal);

// UI actions
export const useUIActions = () => useAppStore(state => state.uiActions);

// Download selectors
export const useDownloads = () => useAppStore(state => state.downloads);
export const useIsCreatingDataset = () => useAppStore(state => state.downloads.isCreatingDataset);
export const useIsCreatingCSV = () => useAppStore(state => state.downloads.isCreatingCSV);
export const useDownloadError = () => useAppStore(state => state.downloads.error);

// Download actions
export const useDownloadActions = () => useAppStore(state => state.downloadActions);

// Modal selectors
export const useModals = () => useAppStore(state => state.modals);
export const useDeleteConfirmText = () => useAppStore(state => state.modals.deleteConfirmText);

// Modal actions
export const useModalActions = () => useAppStore(state => state.modalActions);

// Gallery selectors
export const useGallery = () => useAppStore(state => state.gallery);
export const useGalleryCurrentDataset = () => useAppStore(state => state.gallery.currentDataset);
export const useGalleryImages = () => useAppStore(state => state.gallery.images);
export const useGalleryLabels = () => useAppStore(state => state.gallery.labels);
export const useGalleryStats = () => useAppStore(state => state.gallery.stats);
export const useGalleryLabelsLoaded = () => useAppStore(state => state.gallery.labelsLoaded);
export const useGalleryStatsLoaded = () => useAppStore(state => state.gallery.statsLoaded);
export const useGalleryLoadingData = () => useAppStore(state => state.gallery.loadingData);
export const useGalleryError = () => useAppStore(state => state.gallery.error);

// ImageGallery selectors
export const useSearchTerm = () => useAppStore(state => state.gallery.searchTerm);
export const useFilterStatus = () => useAppStore(state => state.gallery.filterStatus);
export const useFilterPhase = () => useAppStore(state => state.gallery.filterPhase);
// The whole store is persisted, so a session rehydrated from before these fields
// existed has no value for them. A shared frozen default keeps the selector's
// identity stable — returning a fresh `{}` would re-render on every store change.
const NO_METADATA_FILTERS = Object.freeze({});
export const useMetadataFilters = () =>
    useAppStore(state => state.gallery.metadataFilters || NO_METADATA_FILTERS);
export const useMetadataOnlyUntagged = () =>
    useAppStore(state => state.gallery.metadataOnlyUntagged || false);
export const useLoadedImages = () => useAppStore(state => state.gallery.loadedImages);
export const useShowUploadModal = () => useAppStore(state => state.gallery.showUploadModal);
export const useGalleryUploadProgress = () => useAppStore(state => state.gallery.uploadProgress);
export const useUploadingFiles = () => useAppStore(state => state.gallery.uploadingFiles);
export const useGalleryUploadErrors = () => useAppStore(state => state.gallery.uploadErrors);
export const useLoadingErrors = () => useAppStore(state => state.gallery.loadingErrors);

// Gallery actions
export const useGalleryActions = () => useAppStore(state => state.galleryActions);
