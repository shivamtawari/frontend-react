import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useDataset } from '../../../contexts/DatasetContext';
import { useSetImageList, useSetCurrentImage } from '../../../stores/selectors/annotationSelectors';
import useAnnotationStore from '../../../stores/useAnnotationStore';
import { fetchImages } from '../../../api/images';
import { fetchAnnotationQueue } from '../../../api/annotation_queue';

/**
 * Reorder the image list to follow the annotation queue: ids in `queueIds` come
 * first, in that order; images not in the queue (e.g. uploaded after the queue was
 * built) keep their original order at the end. Next/previous walk this list, so
 * this is what makes the queue define the annotation order.
 */
const orderImagesByQueue = (images, queueIds) => {
  if (!queueIds || queueIds.length === 0) return images;
  const rank = new Map(queueIds.map((id, index) => [id, index]));
  const inQueue = [];
  const rest = [];
  images.forEach((img) => (rank.has(img.id) ? inQueue : rest).push(img));
  inQueue.sort((a, b) => rank.get(a.id) - rank.get(b.id));
  return [...inQueue, ...rest];
};

const isFinished = (img) => img?.status === 'finished' || img?.finished;

const DatasetLoader = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { datasetId, imageId } = useParams();
  const { datasets, currentDataset, selectDataset, loading } = useDataset();
  const setImageList = useSetImageList();
  const setCurrentImage = useSetCurrentImage();

  const [datasetNotFound, setDatasetNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Select the dataset based on the URL parameter
  useEffect(() => {
    const loadDataset = async () => {
      if (datasets.length > 0 && datasetId) {
        const datasetIdNum = parseInt(datasetId);

        // Check if datasetId is a valid number
        if (isNaN(datasetIdNum)) {
          setDatasetNotFound(true);
          setIsLoading(false);
          return;
        }

        const dataset = datasets.find(d => d.id === datasetIdNum);

        if (dataset) {
          // Always select the dataset if it's different from current
          if (!currentDataset || currentDataset.id !== dataset.id) {
            selectDataset(dataset);
            setDatasetNotFound(false);
          }

          // Always load images for the dataset (in case of navigation)
          await loadDatasetImages(dataset);
        } else {
          // Dataset not found
          setDatasetNotFound(true);
        }
        setIsLoading(false);
      } else if (datasets.length > 0 && !loading) {
        // Datasets loaded but no valid dataset found
        setDatasetNotFound(true);
        setIsLoading(false);
      }
    };

    loadDataset();
  }, [datasets, datasetId, currentDataset, selectDataset, loading]);

  // Handle imageId changes (when navigating between images within the same dataset)
  useEffect(() => {
    if (imageId && currentDataset) {
      const imageIdNum = parseInt(imageId);
      if (!isNaN(imageIdNum)) {
        // Get current image list and current image from store
        const currentState = useAnnotationStore.getState();
        const currentImageList = currentState.images.imageList;
        const currentImg = currentState.images.currentImage;

        // Only update if the target image is different from the current one
        if (currentImageList.length > 0 && (!currentImg || currentImg.id !== imageIdNum)) {
          const targetImage = currentImageList.find(img => img.id === imageIdNum);
          if (targetImage) {
            setCurrentImage(targetImage);
          }
        }
      }
    }
  }, [imageId, currentDataset, setCurrentImage]);

  // Load images for the dataset
  const loadDatasetImages = async (dataset) => {
    try {
      // Fetch images from API
      const response = await fetchImages(dataset.id);

      
      const imageDataList = response.image_data || response.images || [];

      if (response.success && imageDataList.length > 0) {
        // Transform API response to our format
        // We need to fetch full image details or use what we have
        const apiImages = imageDataList.map((img) => ({
          id: img.image_id || img.id,
          name: img.file_name || img.filename || `image_${img.image_id || img.id}`,
          width: img.width,
          height: img.height,
          hash: img.hash_code || img.hash,
          finished: img.status === 'finished' || img.finished || false,
          generated: img.generated || false,
          status: img.status || (img.finished ? 'completed' : 'not_started'),
          mask_id: img.mask_id,
          isFromAPI: true,
        }));

        // Apply the annotator's saved queue order. The queue ids are seeded from
        // navigation state when we just came from the builder (avoids a reorder
        // flash and a race with the just-saved row); on a refresh or a direct link
        // there is no state, so fall back to re-reading the saved queue.
        let orderedImages = apiImages;
        try {
          let queueIds = location.state?.queueImageIds;
          if (!queueIds) {
            const queueResponse = await fetchAnnotationQueue(dataset.id);
            queueIds = queueResponse?.success && queueResponse.queue
              ? queueResponse.queue.image_ids
              : null;
          }
          orderedImages = orderImagesByQueue(apiImages, queueIds);
        } catch (queueError) {
          // No queue (or it failed to load) — keep upload order.
          orderedImages = apiImages;
        }

        setImageList(orderedImages);

        // Set current image if imageId is provided
        if (imageId) {
          const imageIdNum = parseInt(imageId);
          const targetImage = orderedImages.find(img => img.id === imageIdNum);
          if (targetImage) {
            setCurrentImage(targetImage);
          } else {
            // Image not found, set first image as fallback
            setCurrentImage(orderedImages[0]);
          }
        } else {
          // No specific image: start at the first image still needing work, in
          // queue order, so the annotator picks up where the queue left off.
          const firstUnfinished = orderedImages.find(img => !isFinished(img));
          setCurrentImage(firstUnfinished || orderedImages[0]);
        }
      } else {
        // Fallback to empty list
        setImageList([]);
      }
    } catch (error) {
      // Fallback to empty list
      setImageList([]);
    }
  };

  // Redirect to datasets page if dataset not found
  useEffect(() => {
    if (datasetNotFound) {
      const timer = setTimeout(() => {
        navigate("/datasets", { replace: true });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [datasetNotFound, navigate]);

  // Show dataset not found message
  if (datasetNotFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Dataset Not Found</h2>
          <p className="text-gray-600 mb-4">
            The dataset with ID "{datasetId}" could not be found.
          </p>
          <p className="text-gray-500 text-sm">
            Redirecting to datasets page in 3 seconds...
          </p>
          <button
            onClick={() => navigate("/datasets")}
            className="mt-4 bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition-colors"
          >
            Go to Datasets Now
          </button>
        </div>
      </div>
    );
  }

  // If datasets are still loading or no current dataset is selected, show loading
  if (loading || !currentDataset || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dataset...</p>
        </div>
      </div>
    );
  }

  // Check if images are loaded
  const currentState = useAnnotationStore.getState();
  const hasImages = currentState.images.imageList.length > 0;
  const hasCurrentImage = currentState.images.currentImage !== null;

  // If no images are loaded yet, show loading
  if (!hasImages) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading images...</p>
        </div>
      </div>
    );
  }

  // Dataset loaded successfully, render children
  return children;
};

export default DatasetLoader;