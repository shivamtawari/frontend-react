import React, { useEffect, useMemo, useCallback, useState } from "react";
import { Search, Image as ImageIcon, Tag, Trash2, X } from "lucide-react";
import { useLazyImageLoader } from "../../../hooks/useLazyImageLoader";
import { useImageUpload } from "../../../hooks/useImageUpload";
import { usePermissions, Permission } from "../../../hooks/usePermissions";
import ImageThumbnail from "./ImageThumbnail";
import ImageMetadataModal from "./ImageMetadataModal";
import MetadataImportModal from "./MetadataImportModal";
import MetadataKeysModal from "./MetadataKeysModal";
import UploadModal from "./UploadModal";
import GalleryHeader from "./GalleryHeader";
import { useDatasetMetadata } from "../../../hooks/useDatasetMetadata";
import {
  getImageStatus,
  getImageStatusCounts,
  getPhaseStatus,
  statesOfPhase,
} from "../../../utils/imageStatus";
import { isUntagged, matchesMetadataFilters } from "../../../utils/imageMetadata";
import {
  useSearchTerm,
  useFilterStatus,
  useFilterPhase,
  useMetadataFilters,
  useMetadataOnlyUntagged,
  useShowUploadModal,
  useGalleryActions
} from "../../../stores/selectors";

/**
 * @param {Function} [onBulkDelete] - Called with the selected image objects when
 *   the viewer asks to delete them. Optional: the caller passes it only where
 *   deleting is allowed, and the bulk bar hides the button without it.
 * @param {Function} [onShowQuantifications] - Called with an image to open its
 *   measurements. Optional for the same reason, and gated on the export permission
 *   the per-image page's table needs.
 */
const ImageGallery = ({ images, onImageClick, dataset, onDeleteImage, onImagesUpdated, onBulkDelete, onShowQuantifications }) => {
  // Zustand store selectors - provides persistence across navigation
  const searchTerm = useSearchTerm();
  const filterStatus = useFilterStatus();
  const filterPhase = useFilterPhase();
  const metadataFilters = useMetadataFilters();
  const metadataOnlyUntagged = useMetadataOnlyUntagged();
  const showUploadModal = useShowUploadModal();
  const galleryActions = useGalleryActions();
  const { can } = usePermissions(dataset);
  const canEditMetadata = can(Permission.IMAGE_METADATA_WRITE);
  // Selecting is worth offering as soon as *some* bulk action is available, so a
  // curator who may delete but not tag still gets checkboxes.
  const canSelect = canEditMetadata || Boolean(onBulkDelete);

  // Which images the metadata editor is open on. Empty means closed; selection
  // for the bulk edit is separate, so an editor opened from one tile's tag
  // button does not disturb a selection in progress.
  const [editingImages, setEditingImages] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [showKeysModal, setShowKeysModal] = useState(false);

  // Count images per phase and state (across all images, so the chips are accurate)
  const statusCounts = useMemo(() => getImageStatusCounts(images), [images]);

  // The metadata vocabulary, fetched rather than derived: a key's declared type
  // decides which filter control it gets, and that cannot be recovered from its
  // values. Refetches whenever the image list is replaced, which is what an edit
  // or an import triggers.
  const {
    facets: metadataFacets,
    typesByKey,
    untaggedCount,
    refresh: refreshMetadata,
  } = useDatasetMetadata(dataset?.id, images);

  // Filter images based on search, workflow status and metadata subgroup
  const filteredImages = useMemo(() => {
    return images.filter((image) => {
      const matchesSearch =
        image.file_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        image.name?.toLowerCase().includes(searchTerm.toLowerCase());

      // "all" (or any state the selected phase cannot be in) shows everything;
      // otherwise match the image on the selected axis — one phase, or the
      // combined status.
      const state =
        filterPhase === "overall"
          ? getImageStatus(image).key
          : getPhaseStatus(image, filterPhase).key;
      const matchesFilter =
        filterStatus === "all" ||
        !statesOfPhase(filterPhase).some((s) => s.key === filterStatus) ||
        state === filterStatus;

      const matchesMetadata = metadataOnlyUntagged
        ? isUntagged(image)
        : matchesMetadataFilters(image, metadataFilters, typesByKey);

      return matchesSearch && matchesFilter && matchesMetadata;
    });
  }, [images, searchTerm, filterStatus, filterPhase, metadataFilters,
      metadataOnlyUntagged, typesByKey]);

  // Extract image IDs for lazy loading
  const imageIds = useMemo(
    () => filteredImages.map((img) => img.id),
    [filteredImages]
  );

  // Lazy load images
  const { loadedImages, imageThumbnails, resetLoadedImages } = useLazyImageLoader(imageIds);

  // Reset loaded images when either half of the filter changes
  useEffect(() => {
    resetLoadedImages();
  }, [filterStatus, filterPhase, resetLoadedImages]);

  // Image upload hook
  const {
    uploadingFiles,
    uploadProgress,
    uploadErrors,
    isUploading,
    stackExtensions,
    kindOf,
    addFiles,
    removeFile,
    removeUnsupported,
    clearFiles,
    handleUpload,
  } = useImageUpload(dataset, useCallback(() => {
    galleryActions.setShowUploadModal(false);
    if (onImagesUpdated) {
      onImagesUpdated();
    } else {
      window.location.reload();
    }
  }, [galleryActions, onImagesUpdated]), useCallback(() => {
    onImagesUpdated?.();
  }, [onImagesUpdated]));

  const handleSearchChange = useCallback((term) => {
    galleryActions.setSearchTerm(term);
  }, [galleryActions]);

  const handleFilterChange = useCallback((newFilter) => {
    galleryActions.setFilterStatus(newFilter);
    resetLoadedImages();
  }, [galleryActions, resetLoadedImages]);

  const handlePhaseChange = useCallback((newPhase) => {
    galleryActions.setFilterPhase(newPhase);
    // Not every state exists on every phase: leaving "Not reviewable yet" selected
    // while switching to Calibrate would show an empty grid with no chip lit up.
    if (!statesOfPhase(newPhase).some((s) => s.key === filterStatus)) {
      galleryActions.setFilterStatus('all');
    }
    resetLoadedImages();
  }, [galleryActions, resetLoadedImages, filterStatus]);

  const toggleSelected = useCallback((imageId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  }, []);

  const selectedImages = useMemo(
    () => images.filter((image) => selectedIds.has(image.id)),
    [images, selectedIds]
  );

  // Images that leave the listing — deleted, most obviously — must leave the
  // selection with it, or the bulk bar keeps counting rows that no longer exist.
  useEffect(() => {
    setSelectedIds((current) => {
      if (current.size === 0) return current;
      const live = new Set(images.map((image) => image.id));
      const next = new Set([...current].filter((id) => live.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [images]);

  // Selecting "all" means all *filtered* images: the filters are how a subgroup
  // is picked out in the first place, so "everything from reef A that is still
  // unreviewed, tag it" is one gesture rather than forty clicks.
  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filteredImages.map((image) => image.id)));
  }, [filteredImages]);

  const handleMetadataSaved = useCallback(() => {
    setSelectedIds(new Set());
    // Refreshing the images also re-triggers the facet fetch, so the chips and
    // the grid never disagree about what was just written.
    onImagesUpdated?.();
    refreshMetadata();
  }, [onImagesUpdated, refreshMetadata]);

  return (
    <div className="h-full flex flex-col bg-p1">
      <GalleryHeader
        imageCount={filteredImages.length}
        totalCount={images.length}
        statusCounts={statusCounts}
        searchTerm={searchTerm}
        filterStatus={filterStatus}
        filterPhase={filterPhase}
        onSearchChange={handleSearchChange}
        onFilterChange={handleFilterChange}
        onPhaseChange={handlePhaseChange}
        onAddImagesClick={() => galleryActions.setShowUploadModal(true)}
        onImportMetadataClick={canEditMetadata ? () => setShowImportModal(true) : undefined}
        metadataFacets={metadataFacets}
        metadataFilters={metadataFilters}
        metadataOnlyUntagged={metadataOnlyUntagged}
        untaggedCount={untaggedCount}
        onToggleMetadataValue={galleryActions.toggleMetadataFilterValue}
        onSetMetadataCondition={galleryActions.setMetadataCondition}
        onToggleUntagged={galleryActions.setMetadataOnlyUntagged}
        onClearMetadataFilters={galleryActions.clearMetadataFilters}
        onManageMetadataKeys={canEditMetadata ? () => setShowKeysModal(true) : undefined}
      />

      {/* Bulk bar. Only present while something is selected, so the gallery does
          not carry a permanently empty toolbar. */}
      {canSelect && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 border-b border-ln bg-acS">
          <span className="text-sm font-medium text-ac">
            {selectedIds.size} selected
          </span>
          {canEditMetadata && (
            <button
              onClick={() => setEditingImages(selectedImages)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent text-onAccent text-xs font-medium hover:brightness-110 transition-colors"
            >
              <Tag className="w-3.5 h-3.5" />
              Edit metadata
            </button>
          )}
          {onBulkDelete && (
            <button
              onClick={() => onBulkDelete(selectedImages)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-err text-onAccent text-xs font-medium hover:brightness-110 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete selected
            </button>
          )}
          {selectedIds.size < filteredImages.length && (
            <button
              onClick={selectAllFiltered}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-ac hover:bg-hv transition-colors"
            >
              Select all {filteredImages.length} shown
            </button>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-t2 hover:bg-hv transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear selection
          </button>
        </div>
      )}

      {/* Image Grid */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3 lg:p-4">
        {images.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <ImageIcon className="w-10 h-10 sm:w-12 sm:h-12 text-t3 mx-auto mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-t1 mb-1 sm:mb-2">
              No images found
            </h3>
            <p className="text-sm sm:text-base text-t2">
              This dataset doesn't contain any images yet.
            </p>
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <Search className="w-10 h-10 sm:w-12 sm:h-12 text-t3 mx-auto mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-t1 mb-1 sm:mb-2">
              No results found
            </h3>
            <p className="text-sm sm:text-base text-t2">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 sm:gap-3 lg:gap-4">
            {filteredImages.map((image) => (
              <ImageThumbnail
                key={image.id}
                image={image}
                thumbnailUrl={imageThumbnails.get(image.id)}
                isLoaded={loadedImages.has(image.id)}
                onImageClick={onImageClick}
                onDeleteImage={onDeleteImage}
                onEditMetadata={canEditMetadata ? (img) => setEditingImages([img]) : undefined}
                onShowQuantifications={onShowQuantifications}
                selected={selectedIds.has(image.id)}
                onToggleSelect={canSelect ? toggleSelected : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => galleryActions.setShowUploadModal(false)}
        dataset={dataset}
        uploadingFiles={uploadingFiles}
        uploadProgress={uploadProgress}
        uploadErrors={uploadErrors}
        isUploading={isUploading}
        stackExtensions={stackExtensions}
        kindOf={kindOf}
        onAddFiles={addFiles}
        onRemoveFile={removeFile}
        onRemoveUnsupported={removeUnsupported}
        onUpload={handleUpload}
        onClear={clearFiles}
      />

      <ImageMetadataModal
        isOpen={editingImages.length > 0}
        images={editingImages}
        facets={metadataFacets}
        onClose={() => setEditingImages([])}
        onSaved={handleMetadataSaved}
      />

      <MetadataImportModal
        isOpen={showImportModal}
        dataset={dataset}
        onClose={() => setShowImportModal(false)}
        onImported={handleMetadataSaved}
      />

      <MetadataKeysModal
        isOpen={showKeysModal}
        dataset={dataset}
        facets={metadataFacets}
        onClose={() => setShowKeysModal(false)}
        onChanged={handleMetadataSaved}
      />
    </div>
  );
};

export default ImageGallery;
