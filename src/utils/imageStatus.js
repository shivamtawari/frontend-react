import { Circle, Clock, Eye, CheckCircle2, RotateCcw } from 'lucide-react';

/**
 * The annotation statuses an image's mask can have, with the colors/icons used
 * to present them. Order matches the natural annotation lifecycle.
 *
 * Single source of truth for the gallery badge, the status filters and the
 * dataset progress chart.
 */
export const IMAGE_STATUSES = [
  {
    key: 'not_started',
    label: 'Not started',
    icon: Circle,
    dot: 'bg-gray-400',
    badge: 'bg-gray-100 text-gray-700',
    ring: 'ring-gray-300',
    chart: '#DC2626',
  },
  {
    key: 'in_progress',
    label: 'In progress',
    icon: Clock,
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-800',
    ring: 'ring-amber-300',
    chart: '#F59E0B',
  },
  {
    // A reviewer sent this mask back. It belongs to the annotator again until
    // every rejection on it is resolved.
    key: 'rejected',
    label: 'Sent back',
    icon: RotateCcw,
    dot: 'bg-rose-500',
    badge: 'bg-rose-100 text-rose-800',
    ring: 'ring-rose-300',
    chart: '#F43F5E',
  },
  {
    key: 'reviewable',
    label: 'Reviewable',
    icon: Eye,
    dot: 'bg-purple-500',
    badge: 'bg-purple-100 text-purple-800',
    ring: 'ring-purple-300',
    chart: '#3B82F6',
  },
  {
    key: 'finished',
    label: 'Finished',
    icon: CheckCircle2,
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800',
    ring: 'ring-emerald-300',
    chart: '#059669',
  },
];

export const IMAGE_STATUS_MAP = Object.fromEntries(IMAGE_STATUSES.map((s) => [s.key, s]));

// Legacy/alias status values mapped onto canonical keys.
const STATUS_ALIASES = {
  completed: 'finished',
  done: 'finished',
  reviewed: 'finished',
};

/**
 * Resolve an image to its status descriptor, tolerating legacy shapes
 * (e.g. a bare `finished` flag or a "completed" status string).
 */
export const getImageStatus = (image) => {
  const raw = image?.status;
  if (raw && IMAGE_STATUS_MAP[raw]) return IMAGE_STATUS_MAP[raw];
  if (raw && STATUS_ALIASES[raw]) return IMAGE_STATUS_MAP[STATUS_ALIASES[raw]];
  if (image?.finished) return IMAGE_STATUS_MAP.finished;
  return IMAGE_STATUS_MAP.not_started;
};

/**
 * The three-state view of the same lifecycle, for the annotation page.
 *
 * While annotating, the review sub-states are noise: whether a mask is awaiting
 * review or has been sent back, the annotator's own question is only "is this
 * image done?". The dataset manager keeps the full five-way breakdown, which is
 * where the review pipeline is actually managed from.
 */
export const COARSE_STATUSES = [
  {
    key: 'not_started',
    label: 'Not started',
    badge: 'bg-gray-100 text-gray-800',
  },
  {
    key: 'in_progress',
    label: 'In progress',
    badge: 'bg-blue-100 text-blue-800',
  },
  {
    key: 'finished',
    label: 'Finished',
    badge: 'bg-green-100 text-green-800',
  },
];

export const COARSE_STATUS_MAP = Object.fromEntries(
  COARSE_STATUSES.map((s) => [s.key, s])
);

/**
 * Collapse a detailed status onto one of the three coarse states.
 *
 * `reviewable` and `rejected` both fold into `in_progress`: the work exists but
 * is not signed off, which is all the annotation page needs to say.
 */
const COARSE_BY_DETAILED = {
  not_started: 'not_started',
  in_progress: 'in_progress',
  rejected: 'in_progress',
  reviewable: 'in_progress',
  finished: 'finished',
};

/**
 * Resolve any status string to its coarse descriptor.
 * @param {string} status - A detailed status key, alias, or unknown value.
 */
export const getCoarseStatus = (status) => {
  const canonical = STATUS_ALIASES[status] || status;
  const key = COARSE_BY_DETAILED[canonical] || 'not_started';
  return COARSE_STATUS_MAP[key];
};

/** An all-zero count object keyed by every known status. */
export const emptyStatusCounts = () =>
  Object.fromEntries(IMAGE_STATUSES.map((s) => [s.key, 0]));

/** Count images per status key. */
export const getImageStatusCounts = (images = []) => {
  const counts = emptyStatusCounts();
  for (const image of images) {
    const key = getImageStatus(image).key;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
};
