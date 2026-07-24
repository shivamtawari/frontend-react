import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { useCurrentMaskId } from '../../../stores/selectors/annotationSelectors';
import { useDataset } from '../../../contexts/DatasetContext';
import { usePermissions } from '../../../hooks/usePermissions';
import { Permission } from '../../../utils/permissions';
import RejectionBanner from '../RejectionBanner';
import RejectMaskModal from '../modals/RejectMaskModal';

/**
 * The review strip above the annotation canvas.
 *
 * Two halves of the same workflow: whoever holds `review.reject` gets the button
 * that sends the image back with a reason, and whoever is working on it sees the
 * open feedback and can tick it off. Both are permission-gated, so an annotator
 * sees only the feedback and a reviewer sees both.
 */
const ReviewBar = () => {
  const { datasetId } = useParams();
  const maskId = useCurrentMaskId();
  const { datasets } = useDataset();
  const dataset = datasets?.find((d) => String(d.id) === String(datasetId)) || null;
  const { can } = usePermissions(dataset);

  const [showReject, setShowReject] = useState(false);
  // Bumped after a rejection so the banner refetches instead of showing stale state.
  const [refreshKey, setRefreshKey] = useState(0);

  if (!maskId) return null;

  const canReject = can(Permission.REVIEW_REJECT);

  return (
    <>
      <RejectionBanner
        maskId={maskId}
        dataset={dataset}
        refreshKey={refreshKey}
        onResolved={() => setRefreshKey((key) => key + 1)}
      />

      {canReject && (
        <div className="flex justify-end px-4 py-2 border-b border-gray-200 bg-white">
          <button
            onClick={() => setShowReject(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
            title="Send this image back to the annotator with a reason"
          >
            <RotateCcw className="w-4 h-4" />
            Send back
          </button>
        </div>
      )}

      <RejectMaskModal
        isOpen={showReject}
        maskId={maskId}
        onClose={() => setShowReject(false)}
        onRejected={() => setRefreshKey((key) => key + 1)}
      />
    </>
  );
};

export default ReviewBar;
