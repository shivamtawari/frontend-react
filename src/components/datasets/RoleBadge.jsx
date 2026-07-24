import React from 'react';
import { Crown, Eye, PencilLine, ShieldCheck, Settings2 } from 'lucide-react';
import {
    DATASET_ROLE_BADGE_CLASSES,
    DATASET_ROLE_LABELS,
    DatasetRole,
} from '../../utils/permissions';

const ROLE_ICONS = {
    [DatasetRole.VIEWER]: Eye,
    [DatasetRole.ANNOTATOR]: PencilLine,
    [DatasetRole.REVIEWER]: ShieldCheck,
    [DatasetRole.CURATOR]: Settings2,
    [DatasetRole.OWNER]: Crown,
};

/**
 * Shows which role the current user holds on a dataset.
 *
 * Renders nothing for an unknown role rather than an "unknown" chip — a dataset
 * the user has no role on should not be on screen in the first place.
 *
 * @param {Object} props
 * @param {string} props.role - One of the DatasetRole values.
 * @param {boolean} [props.showDescription=false] - Use the role's description as the tooltip.
 * @param {string} [props.className]
 */
const RoleBadge = ({ role, showDescription = false, className = '' }) => {
    const meta = DATASET_ROLE_LABELS[role];
    if (!meta) return null;

    const Icon = ROLE_ICONS[role] || Eye;
    const classes = DATASET_ROLE_BADGE_CLASSES[role] || DATASET_ROLE_BADGE_CLASSES[DatasetRole.VIEWER];

    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${classes} ${className}`}
            title={showDescription ? meta.description : undefined}
        >
            <Icon className="w-3 h-3 flex-shrink-0" />
            {meta.label}
        </span>
    );
};

export default RoleBadge;
