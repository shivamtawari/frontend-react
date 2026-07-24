import React from 'react';
import { getCoarseStatus } from '../../../utils/imageStatus';

// The annotation gallery deliberately shows only the three coarse states; the
// dataset manager is where the full review breakdown lives. Keyed off the shared
// mapping, so the backend's `finished` actually matches (this used to switch on
// `completed`, which the API never sends, leaving every done image grey).
const STATUS_DOT = {
  not_started: { color: 'bg-gray-100 border-gray-300', icon: '○' },
  in_progress: { color: 'bg-yellow-100 border-yellow-300', icon: '⏳' },
  finished: { color: 'bg-green-100 border-green-300', icon: '✓' },
};

const ImageThumbnail = React.memo(({ image, isSelected, onSelect, thumbnail, thumbnailError, isLoading }) => {

  const coarse = getCoarseStatus(image.status);
  const dot = STATUS_DOT[coarse.key] || STATUS_DOT.not_started;

  const handleClick = () => {
    onSelect(image);
  };

  const handleRetryClick = (e) => {
    e.stopPropagation(); // Prevent triggering image selection
    // Retry functionality can be added later if needed
  };

  const renderThumbnailContent = () => {
    if (isLoading) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
        </div>
      );
    }

    if (thumbnailError) {
      return (
        <div 
          className="w-full h-full flex flex-col items-center justify-center bg-red-50 rounded-lg cursor-pointer hover:bg-red-100 transition-colors"
          onClick={handleRetryClick}
          title={`Error: ${thumbnailError}. Click to retry.`}
        >
          <span className="text-xs text-red-600 mb-1">⚠️</span>
          <span className="text-xs text-red-600">Retry</span>
        </div>
      );
    }

    if (thumbnail) {
      return (
        <img
          src={thumbnail}
          alt={image.name}
          className="w-full h-full object-cover rounded-lg"
          loading="lazy"
        />
      );
    }

    // Default placeholder
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
        <span className="text-xs text-gray-500">📷</span>
      </div>
    );
  };

  return (
    <div
      onClick={handleClick}
      className={`flex-shrink-0 w-16 h-12 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer relative ${
        isSelected 
          ? 'border-teal-500 bg-teal-50 shadow-md' 
          : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:shadow-sm'
      }`}
      title={image.name}
    >
      {renderThumbnailContent()}
      
      {/* Status indicator */}
      <div
        className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 flex items-center justify-center text-xs ${dot.color}`}
        title={coarse.label}
      >
        {dot.icon}
      </div>
    </div>
  );
});

ImageThumbnail.displayName = 'ImageThumbnail';

export default ImageThumbnail;