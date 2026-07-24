import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Minus } from 'lucide-react';
import { fetchRoleCatalog } from '../../api/members';
import {
  DATASET_ROLE_LABELS,
  DATASET_ROLE_ORDER,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
} from '../../utils/permissions';

const readableError = (err, fallback) =>
  (err?.message || '').replace(/^API Error:\s*/i, '') || fallback;

/**
 * The role -> permission reference table.
 *
 * The matrix is fetched from `GET /datasets/roles/catalog` rather than written
 * out here, so it always shows what the backend actually enforces. A permission
 * the backend knows about but this frontend has no wording for still appears,
 * listed under "Other" with its raw key — better a slightly ugly row than a
 * silently incomplete reference.
 *
 * @param {Object} props
 * @param {string} [props.highlightRole] - Role column to emphasise, e.g. the reader's own.
 * @param {boolean} [props.showDescriptions=true] - Show the per-role blurb above the table.
 * @param {boolean} [props.showKeys=true] - Show the raw permission key under each row.
 * @param {boolean} [props.compact=false] - Tighter padding, for constrained containers.
 */
const PermissionMatrix = ({
  highlightRole = null,
  showDescriptions = true,
  showKeys = true,
  compact = false,
}) => {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetchRoleCatalog();
        if (!cancelled) setCatalog(response);
      } catch (err) {
        if (!cancelled) setError(readableError(err, 'Could not load the permission list.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Roles as columns, least privileged first. */
  const roles = useMemo(() => {
    if (!catalog?.roles) return [];
    return [...catalog.roles].sort(
      (a, b) => (DATASET_ROLE_ORDER[a.role] ?? 0) - (DATASET_ROLE_ORDER[b.role] ?? 0)
    );
  }, [catalog]);

  /** Permission sets keyed by role, for O(1) cell lookups. */
  const grantedBy = useMemo(() => {
    const map = {};
    roles.forEach((entry) => {
      map[entry.role] = new Set(entry.permissions);
    });
    return map;
  }, [roles]);

  /** Groups, plus a catch-all for anything the backend has that we don't describe. */
  const groups = useMemo(() => {
    if (!catalog?.roles) return [];
    const known = new Set(Object.keys(PERMISSION_LABELS));
    const seen = new Set(catalog.roles.flatMap((entry) => entry.permissions));
    const undescribed = [...seen].filter((permission) => !known.has(permission)).sort();

    const described = PERMISSION_GROUPS
      .map((group) => ({
        ...group,
        // Drop rows for permissions no role grants — usually a permission that
        // exists in the enum but is not yet wired into any bundle.
        permissions: group.permissions.filter(([permission]) => seen.has(permission)),
      }))
      .filter((group) => group.permissions.length > 0);

    if (undescribed.length === 0) return described;
    return [
      ...described,
      {
        id: 'other',
        title: 'Other',
        permissions: undescribed.map((permission) => [permission, permission]),
      },
    ];
  }, [catalog]);

  /**
   * The pinned first column. The right-edge shadow is what makes it read as
   * pinned rather than as text overlapping the columns sliding under it.
   */
  const labelCell = [
    'sticky left-0',
    compact ? 'px-3 py-1.5' : 'px-4 py-2',
    compact ? 'min-w-[200px] max-w-[280px]' : 'min-w-[260px] max-w-[380px]',
    // Literal grey-200 rather than theme(), so the class survives any Tailwind
    // config that does not resolve theme() inside arbitrary values.
    'shadow-[1px_0_0_0_#e5e7eb]',
  ].join(' ');

  const roleCell = [
    compact ? 'px-2 py-1.5' : 'px-3 py-2',
    'min-w-[84px] whitespace-nowrap',
  ].join(' ');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading permissions…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <p className="text-sm text-amber-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showDescriptions && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((entry) => {
            const meta = DATASET_ROLE_LABELS[entry.role];
            if (!meta) return null;
            return (
              <div
                key={entry.role}
                className={`p-3 rounded-lg border ${
                  highlightRole === entry.role
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <h5 className="font-semibold text-gray-900 text-sm">{meta.label}</h5>
                <p className="text-gray-600 text-sm mt-0.5">{meta.description}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* The table scrolls inside this box rather than pushing the page sideways.
          `w-max` stops the browser compressing columns to fit a narrow container —
          without it the permission text wraps to one word per line in the modal. */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg relative">
        <table className="w-max min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th
                className={`${labelCell} text-left font-semibold text-gray-700 bg-gray-50 z-20`}
              >
                Permission
              </th>
              {roles.map((entry) => (
                <th
                  key={entry.role}
                  className={`${roleCell} font-semibold text-center ${
                    highlightRole === entry.role
                      ? 'text-teal-700 bg-teal-100/70'
                      : 'text-gray-700'
                  }`}
                >
                  {DATASET_ROLE_LABELS[entry.role]?.label || entry.role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <React.Fragment key={group.id}>
                {/* The group title lives in its own pinned cell instead of a
                    colSpan across the row: a spanning cell cannot stick, so the
                    heading used to slide out of view while the permission column
                    stayed put. */}
                <tr className="bg-gray-100 border-t border-gray-200">
                  <th
                    scope="colgroup"
                    className={`${labelCell} text-left text-xs font-bold uppercase tracking-wide text-gray-500 bg-gray-100 z-20 py-1.5`}
                  >
                    {group.title}
                  </th>
                  <td colSpan={roles.length} className="bg-gray-100" />
                </tr>
                {group.permissions.map(([permission, description]) => (
                  <tr key={permission} className="border-t border-gray-200 group">
                    <th
                      scope="row"
                      className={`${labelCell} text-left font-normal text-gray-800 bg-white z-10 group-hover:bg-gray-50`}
                    >
                      {description}
                      {showKeys && (
                        <span className="block text-[11px] text-gray-400 font-mono">
                          {permission}
                        </span>
                      )}
                    </th>
                    {roles.map((entry) => {
                      const granted = grantedBy[entry.role]?.has(permission);
                      return (
                        <td
                          key={entry.role}
                          className={`${roleCell} text-center ${
                            highlightRole === entry.role ? 'bg-teal-50/60' : ''
                          }`}
                        >
                          {granted ? (
                            <Check
                              className="w-4 h-4 text-emerald-600 mx-auto"
                              aria-label="Allowed"
                            />
                          ) : (
                            <Minus
                              className="w-4 h-4 text-gray-300 mx-auto"
                              aria-label="Not allowed"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Owners can additionally grant or withhold a single permission for one
        collaborator, so someone&apos;s effective access may differ slightly from their
        role. Their exact permissions are shown in Manage access.
      </p>
    </div>
  );
};

export default PermissionMatrix;
