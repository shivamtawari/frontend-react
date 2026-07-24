import React, { useEffect, useState } from 'react';

/**
 * Per-dataset review policy.
 *
 * @param {Object} props
 * @param {Object} props.access - The `useDatasetAccess` return value.
 * @param {Object} props.dataset - Supplies the current stored value.
 */
const ReviewPolicyPanel = ({ access, dataset }) => {
  const { busy, setIndependentReview } = access;
  const [enabled, setEnabled] = useState(Boolean(dataset?.require_independent_review));

  // Re-sync if the dataset is refetched while this panel is mounted.
  useEffect(() => {
    setEnabled(Boolean(dataset?.require_independent_review));
  }, [dataset?.require_independent_review]);

  const handleToggle = async () => {
    const next = !enabled;
    // Optimistic, then rolled back if the request fails, so the checkbox does not
    // sit unresponsive for a round trip.
    setEnabled(next);
    const result = await setIndependentReview(next);
    if (!result) setEnabled(!next);
  };

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          disabled={busy === 'settings'}
          className="mt-1 w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
        />
        <span>
          <span className="block font-medium text-gray-900">
            Require independent review
          </span>
          <span className="block text-sm text-gray-600 mt-1">
            An annotation cannot be approved by the person who created it, so
            &quot;finished&quot; means someone else actually checked it. Leave this off if
            you annotate and review this dataset on your own — otherwise you will never
            be able to finish it.
          </span>
        </span>
      </label>
    </div>
  );
};

export default ReviewPolicyPanel;
