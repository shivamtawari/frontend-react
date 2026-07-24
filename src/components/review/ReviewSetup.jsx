import React, { useMemo, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Images,
  ListTree,
  Loader2,
  Play,
  SlidersHorizontal,
} from 'lucide-react';
import { buildLabelHierarchy } from '../../utils/labelHierarchy';
import { getLabelColor } from '../../utils/labelColors';

/** The three ways to slice the review work. */
const MODES = [
  {
    key: 'images',
    icon: Images,
    title: 'Entire images',
    description:
      'One image at a time, with every annotation on it. Accept the whole image or send it back with a reason.',
  },
  {
    key: 'hierarchy',
    icon: ListTree,
    title: 'Instances by hierarchy',
    description:
      'One instance at a time with its immediate children. Root instances are verified first, then their children.',
  },
  {
    key: 'custom',
    icon: SlidersHorizontal,
    title: 'Custom selection',
    description:
      'Only instances carrying the labels you pick, one at a time. Useful for sweeping a single class.',
  },
];

/** Depth-first flattening of the label tree, so the checklist can indent. */
const flattenWithDepth = (labels) => {
  const result = [];
  const walk = (nodes, depth) => {
    nodes.forEach((node) => {
      result.push({ ...node, depth });
      if (node.children?.length) walk(node.children, depth + 1);
    });
  };
  walk(buildLabelHierarchy(labels), 0);
  return result;
};

/**
 * The review session's launch pad: granularity, ordering, and (for the custom
 * mode) which labels to sweep. Calls `onStart` with the options the API expects.
 */
const ReviewSetup = ({ summary, labels, building, onStart }) => {
  const [mode, setMode] = useState('hierarchy');
  const [direction, setDirection] = useState('asc');
  const [strategy, setStrategy] = useState('hierarchy');
  const [selectedLabelIds, setSelectedLabelIds] = useState([]);
  const [includeReviewed, setIncludeReviewed] = useState(false);

  const strategies = summary?.strategies || [];
  const indentedLabels = useMemo(() => flattenWithDepth(labels), [labels]);
  const isInstanceMode = mode === 'hierarchy' || mode === 'custom';
  const pending = summary?.pending_instances ?? null;
  const reviewedCount = summary?.reviewed_instances ?? 0;
  // What the queue will actually contain under the current toggle state.
  const available = pending == null ? null : includeReviewed ? pending + reviewedCount : pending;

  const toggleLabel = (labelId) => {
    setSelectedLabelIds((current) =>
      current.includes(labelId)
        ? current.filter((id) => id !== labelId)
        : [...current, labelId]
    );
  };

  const canStart =
    !building &&
    (mode !== 'custom' || selectedLabelIds.length > 0) &&
    (available == null || available > 0);

  const handleStart = () => {
    onStart({
      granularity: mode,
      sortStrategy: strategy,
      direction,
      labelIds: mode === 'custom' ? selectedLabelIds : null,
      includeReviewed,
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Start a review session</h2>
        <p className="text-gray-600 mb-2">
          Choose how to work through the annotations awaiting review.
        </p>
        {pending != null && (
          <p className="text-sm font-medium text-teal-700 mb-6">
            {pending === 0
              ? reviewedCount > 0
                ? `No unreviewed instances — but ${reviewedCount} already-reviewed instance${
                    reviewedCount === 1 ? '' : 's'
                  } can be re-reviewed.`
                : 'Nothing is waiting for review right now.'
              : `${pending} instance${pending === 1 ? '' : 's'} across ${
                  summary.pending_images
                } image${summary.pending_images === 1 ? '' : 's'} waiting for review.`}
            {summary?.open_rejections > 0 &&
              ` ${summary.open_rejections} sent-back item${
                summary.open_rejections === 1 ? ' is' : 's are'
              } still with the annotators.`}
          </p>
        )}

        {/* Granularity */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {MODES.map(({ key, icon: Icon, title, description }) => {
            const active = mode === key;
            return (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`text-left rounded-xl border-2 p-4 transition-all ${
                  active
                    ? 'border-teal-500 bg-teal-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-teal-300'
                }`}
              >
                <Icon className={`w-6 h-6 mb-2 ${active ? 'text-teal-600' : 'text-gray-400'}`} />
                <div className="font-semibold text-gray-900 mb-1">{title}</div>
                <div className="text-sm text-gray-600 leading-snug">{description}</div>
              </button>
            );
          })}
        </div>

        {/* Second opinions: re-open work that other reviewers already approved. */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeReviewed}
              onChange={(e) => setIncludeReviewed(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-700">
                Include already-reviewed instances
                {reviewedCount > 0 && (
                  <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 text-xs font-medium">
                    +{reviewedCount}
                  </span>
                )}
              </span>
              <span className="block text-sm text-gray-600">
                Re-review approved work, your own approvals included. Accepting
                again confirms an approval; sending an instance back withdraws
                your earlier approval of it.
              </span>
            </span>
          </label>
        </div>

        {/* Ordering — only meaningful when the queue is instance-by-instance. */}
        {isInstanceMode && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="text-sm font-semibold text-gray-700 mb-3">Queue order</div>
            <div className="flex flex-wrap items-center gap-3">
              {strategies.length > 1 && (
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  {strategies.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setDirection('asc')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                    direction === 'asc'
                      ? 'bg-teal-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <ArrowUpNarrowWide className="w-4 h-4" />
                  Ascending
                </button>
                <button
                  onClick={() => setDirection('desc')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                    direction === 'desc'
                      ? 'bg-teal-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <ArrowDownWideNarrow className="w-4 h-4" />
                  Descending
                </button>
              </div>
              <span className="text-xs text-gray-500">
                {strategies.find((option) => option.key === strategy)?.description ||
                  'Root instances first, then their children.'}
              </span>
            </div>
          </div>
        )}

        {/* Label filter for the custom mode. */}
        {mode === 'custom' && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="text-sm font-semibold text-gray-700 mb-3">
              Labels to review ({selectedLabelIds.length} selected)
            </div>
            {indentedLabels.length === 0 ? (
              <p className="text-sm text-gray-500">This dataset has no labels yet.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {indentedLabels.map((label) => (
                  <label
                    key={label.id}
                    className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer"
                    style={{ paddingLeft: `${8 + label.depth * 20}px` }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLabelIds.includes(label.id)}
                      onChange={() => toggleLabel(label.id)}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span
                      className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                      style={{ backgroundColor: getLabelColor(label.id) }}
                    />
                    <span className="text-sm text-gray-800">{label.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={!canStart}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-colors ${
            canStart
              ? 'bg-teal-600 text-white hover:bg-teal-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {building ? 'Building queue…' : 'Start reviewing'}
        </button>
      </div>
    </div>
  );
};

export default ReviewSetup;
