import { useCallback, useEffect } from 'react';
import { 
  useImageObject, 
  useImageLoading, 
  useImageError, 
  useSetImageObject,
  useSetImageLoading,
  useSetImageError,
  useResetImageState,
  useSetImageScale,
} from '../stores/selectors/annotationSelectors';
import { getImageById } from '../api/images';
import { getPixelScale } from '../api/scale';

export const useImageLoader = (currentImage) => {
  const imageObject = useImageObject();
  const imageLoading = useImageLoading();
  const imageError = useImageError();
  
  const setImageObject = useSetImageObject();
  const setImageLoading = useSetImageLoading();
  const setImageError = useSetImageError();
  const resetImageState = useResetImageState();
  const setImageScale = useSetImageScale();

  const loadImage = useCallback(async (image) => {
    if (!image || !image.id) {
      setImageObject(null);
      return;
    }

    try {
      setImageLoading(true);
      setImageError(null);
      
      // Fetch image data from API
      const imageResponse = await getImageById(image.id, false);
      
      if (!imageResponse || !imageResponse[image.id]) {
        throw new Error(`Failed to load image data for ID: ${image.id}`);
      }

      const base64Data = imageResponse[image.id];
      const imageUrl = `data:image/jpeg;base64,${base64Data}`;
      const imgObject = new Image();

      // Wait for image to load
      await new Promise((resolve, reject) => {
        imgObject.onload = () => resolve();
        imgObject.onerror = () => reject(new Error("Failed to load image data"));
        imgObject.src = imageUrl;
      });

      setImageObject(imgObject);

      // Load persisted scale for this image from the backend.
      // Done after image loads so scale bar appears immediately.
      // Failure is non-fatal: scale simply stays at the default px value.
      try {
        const scaleData = await getPixelScale(image.id);
        setImageScale(scaleData.scale_x, scaleData.scale_y, scaleData.unit);
      } catch (scaleErr) {
        console.warn('Could not load image scale (will default to px):', scaleErr);
      }
      
    } catch (error) {
      console.error('Error loading image:', error);
      setImageError(error.message);
      setImageObject(null);
    } finally {
      setImageLoading(false);
    }
  }, [setImageObject, setImageLoading, setImageError, setImageScale]);

  // Load image when currentImage changes
  useEffect(() => {
    if (currentImage && currentImage.id) {
      loadImage(currentImage);
    } else {
      setImageObject(null);
    }
  }, [currentImage, loadImage, setImageObject]);

  // Reset image state when currentImage changes
  useEffect(() => {
    if (!currentImage) {
      resetImageState();
    }
  }, [currentImage, resetImageState]);

  return {
    imageObject,
    imageLoading,
    imageError,
    loadImage
  };
};
