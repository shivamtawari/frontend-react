import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Crosshair,
  Eye,
  ImageOff,
  Loader2,
  Search,
} from 'lucide-react';
import * as api from '../api';
import { getContoursOfMask } from '../api/masks';
import { useAuth } from '../contexts/AuthContext';
import { useDataset } from '../contexts/DatasetContext';
import { usePermissions } from '../hooks/usePermissions';
import { Permission } from '../utils/permissions';
import { getCoarseStatus } from '../utils/imageStatus';
import { getLabelColor } from '../utils/labelColors';
import { extractLabelsFromResponse } from '../utils/labelHierarchy';
import AnnotationViewerCanvas from '../components/viewer/AnnotationViewerCanvas';
import RoleBadge from '../components/datasets/RoleBadge';

const readableError = (err, fallback) =>
  (err?.message || '').replace(/^API Error:\s*/i, '') || fallback;

/**
 * Read-only browser for a dataset's annotations.
 *
 * Viewers cannot open an annotation session — the WebSocket requires
 * `annotation.create` — and that session is what delivers the contour hierarchy,
 * so the annotation page loaded for them but never showed any annotations. This
 * page fetches the same data over REST instead: image, contours, labels.
 *
 * It is also useful above the viewer tier as a quick read-only pass, so it is not
 * gated to viewers only; it just never offers an editing tool.
 */
const AnnotationViewerPage = () => {
  const { datasetId, imageId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { datasets } = useDataset();

  const dataset = useMemo(
    () => datasets?.find((d) => String(d.id) === String(datasetId)) || null,
    [datasets, datasetId]
  );
  const { can, role } = usePermissions(dataset);
  const canAnnotate = can(Permission.ANNOTATION_CREATE);

  const [images, setImages] = useState([]);
  const [labelsById, setLabelsById] = useState({});
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [contours, setContours] = useState([]);
  const [selectedContourId, setSelectedContourId] = useState(null);
  const [zoomTarget, setZoomTarget] = useState(null);
  const [search, setSearch] = useState('');

  const [loadingList, setLoadingList] = useState(true);
  const [loadingImage, setLoadingImage] = useState(false);
  const [error, setError] = useState(null);

  // -- Dataset-level data ---------------------------------------------------

  useEffect(() => {
    if (!datasetId || !isAuthenticated) return;
    let cancelled = false;

    const load = async () => {
      setLoadingList(true);
      setError(null);
      try {
        const [imageResponse, labelResponse] = await Promise.all([
          api.fetchImages(datasetId),
          api.fetchLabels(datasetId),
        ]);
        if (cancelled) return;

        const list = imageResponse.image_data || [];
        setImages(list);

        const flat = extractLabelsFromResponse(labelResponse);
        setLabelsById(Object.fromEntries(flat.map((label) => [label.id, label])));

        // Honour the id in the URL when there is one, so a link to a specific
        // image opens on it.
        const initial =
          list.find((item) => String(item.image_id) === String(imageId)) || list[0] || null;
        setSelectedImage(initial);
      } catch (err) {
        if (!cancelled) setError(readableError(err, 'Could not load this dataset.'));
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [datasetId, imageId, isAuthenticated]);

  // -- Per-image data -------------------------------------------------------

  useEffect(() => {
    if (!selectedImage) return;
    let cancelled = false;

    const load = async () => {
      setLoadingImage(true);
      setSelectedContourId(null);
      setZoomTarget(null);
      try {
        const [imageData, contourResponse] = await Promise.all([
          api.getImageById(selectedImage.image_id, false),
          selectedImage.mask_id
            ? getContoursOfMask(selectedImage.mask_id, true)
            : Promise.resolve({ contours: [] }),
        ]);
        if (cancelled) return;

        // The image endpoint returns the base64 under the image id as a key.
        const base64 =
          imageData[selectedImage.image_id] ??
          imageData[String(selectedImage.image_id)] ??
          Object.entries(imageData).find(
            ([key]) => key !== 'success' && key !== 'message'
          )?.[1];

        setImageSrc(base64 ? `data:image/png;base64,${base64}` : null);
        setContours(contourResponse.contours || []);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(readableError(err, 'Could not load this image.'));
      } finally {
        if (!cancelled) setLoadingImage(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedImage]);

  const labelNameFor = useCallback(
    (contour) => labelsById[contour.label_id]?.name || 'Unlabelled',
    [labelsById]
  );

  const colorFor = useCallback(
    (contour) =>
      contour.label_id ? getLabelColor(contour.label_id) : '#94a3b8',
    []
  );

  const visibleContours = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contours;
    return contours.filter((contour) =>
      labelNameFor(contour).toLowerCase().includes(term)
    );
  }, [contours, search, labelNameFor]);

  const handleSelectContour = (contourId, { zoom = false } = {}) => {
    setSelectedContourId(contourId);
    if (!zoom || contourId == null) return;
    const contour = contours.find((c) => c.id === contourId);
    // A new object identity each time, so re-clicking the same object re-frames it.
    if (contour) setZoomTarget({ ...contour });
  };

  const handleSelectImage = (image) => {
    setSelectedImage(image);
    navigate(`/dataset/${datasetId}/view/${image.image_id}`, { replace: true });
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-teal-600 text-white flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(`/dataset/${datasetId}/datamanagement`)}
              className="flex items-center gap-2 hover:text-teal-200 transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="h-6 w-px bg-teal-400 flex-shrink-0" />
            <Eye className="w-5 h-5 flex-shrink-0" />
            <h1 className="text-lg font-bold truncate">
              {dataset?.name || 'Annotations'}
            </h1>
            {role && <RoleBadge role={role} showDescription />}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-sm text-teal-100 hidden md:inline">Read-only view</span>
            {canAnnotate && (
              <button
                onClick={() =>
                  navigate(
                    `/dataset/${datasetId}/annotate${
                      selectedImage ? `/${selectedImage.image_id}` : ''
                    }`
                  )
                }
                className="bg-white/10 hover:bg-white/20 py-1.5 px-3 rounded-lg transition-colors text-sm"
              >
                Open annotation tools
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex-shrink-0">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Image list */}
        <aside className="w-56 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
          <div className="px-3 py-2 border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Images ({images.length})
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading…
              </div>
            ) : (
              images.map((image) => {
                const coarse = getCoarseStatus(image.status);
                const isActive = selectedImage?.image_id === image.image_id;
                return (
                  <button
                    key={image.image_id}
                    onClick={() => handleSelectImage(image)}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 transition-colors ${
                      isActive ? 'bg-teal-50 text-teal-800 font-medium' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="block truncate">Image {image.image_id}</span>
                    <span
                      className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] ${coarse.badge}`}
                    >
                      {coarse.label}
                    </span>
                  </button>
                );
              })
            )}
            {!loadingList && images.length === 0 && (
              <p className="p-4 text-sm text-gray-500 text-center">
                This dataset has no images yet.
              </p>
            )}
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex-1 relative min-w-0">
          {loadingImage && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/60 text-white">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading image…
            </div>
          )}
          {imageSrc ? (
            <AnnotationViewerCanvas
              imageSrc={imageSrc}
              contours={visibleContours}
              selectedId={selectedContourId}
              onSelect={(id) => handleSelectContour(id)}
              zoomTarget={zoomTarget}
              colorFor={colorFor}
            />
          ) : (
            !loadingImage && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <ImageOff className="w-10 h-10 mb-2" />
                <p className="text-sm">Select an image to view its annotations.</p>
              </div>
            )
          )}
        </main>

        {/* Object list */}
        <aside className="w-72 border-l border-gray-200 bg-white flex flex-col flex-shrink-0">
          <div className="px-3 py-2 border-b border-gray-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Annotations ({contours.length})
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by label"
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {visibleContours.map((contour) => {
              const isSelected = contour.id === selectedContourId;
              const reviewers = contour.reviewed_by || [];
              return (
                <div
                  key={contour.id}
                  onClick={() => handleSelectContour(contour.id)}
                  className={`px-3 py-2 border-b border-gray-100 cursor-pointer transition-colors ${
                    isSelected ? 'bg-teal-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
                        style={{ backgroundColor: colorFor(contour) }}
                      />
                      <span className="text-sm text-gray-900 truncate">
                        {labelNameFor(contour)}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectContour(contour.id, { zoom: true });
                      }}
                      className="p-1 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
                      title="Zoom to this annotation"
                    >
                      <Crosshair className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500 flex flex-wrap gap-x-2">
                    <span>#{contour.id}</span>
                    {contour.added_by && <span>by {contour.added_by}</span>}
                    {reviewers.length > 0 && (
                      <span className="text-emerald-600">
                        approved by {reviewers.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {!loadingImage && contours.length === 0 && selectedImage && (
              <p className="p-4 text-sm text-gray-500 text-center">
                This image has no annotations yet.
              </p>
            )}
            {contours.length > 0 && visibleContours.length === 0 && (
              <p className="p-4 text-sm text-gray-500 text-center">
                No annotations match &quot;{search}&quot;.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AnnotationViewerPage;
