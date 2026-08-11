import React, { useCallback, useMemo, useState } from 'react';
import { Eye, EyeOff, Layers, MoreHorizontal } from 'lucide-react';
import ObjectRow from './ObjectRow';
import ObjectStatsPopover from './ObjectStatsPopover';
import LabelPicker from './LabelPicker';
import VisibilitySection from './VisibilitySection';
import ConfirmDialog from './ConfirmDialog';
import useObjectActions from './useObjectActions';
import useLabelAssignment from './useLabelAssignment';
import useImageLevelActions from './useImageLevelActions';
import { buildObjectTree, flattenTree, isReviewed } from './objectViewModel';
import { resolveLabelColor } from './labelColorUtils';
import RejectMaskModal from '../modals/RejectMaskModal';
import { getContourId } from '../../../utils/objectUtils';
import { usePermissions } from '../../../hooks/usePermissions';
import { Permission } from '../../../utils/permissions';
import { useDataset } from '../../../contexts/DatasetContext';
import { useToast } from '../../../contexts/ToastContext';
import annotationSession from '../../../services/annotationSession';
import {
  useObjectsList,
  useObjectsVisibility,
  useSelectedObjects,
  useSelectObject,
  useHiddenObjectIds,
  useToggleObjectHidden,
  useCollapsedObjectIds,
  useToggleObjectCollapsed,
  useExpandObject,
  useHoveredObjectId,
  useSetHoveredObjectId,
  useWorkspaceMode,
  useShowApproved,
  useToggleShowApproved,
  useRootOrder,
  useInitRootOrder,
  useReorderRootObject,
  useLabelColorOverrides,
  useShowContextMenu,
  useCurrentMaskId,
  useDatasetLabels,
  useUpdateObject,
} from '../../../stores/selectors/annotationSelectors';

/** Where in a row a drop lands: top third before, bottom third after, middle nests. */
const dropZoneFor = (event, element) => {
  const rect = element.getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / rect.height;
  if (ratio < 0.3) return 'before';
  if (ratio > 0.7) return 'after';
  return 'into';
};

/**
 * Rule swatches mirroring how each state is stroked on the canvas: approved is
 * solid, pending review is dashed, unlabelled is amber and dashed.
 */
const LEGEND = [
  { label: 'approved', style: { background: 'var(--ok)' } },
  {
    label: 'pending review',
    style: {
      backgroundImage: 'repeating-linear-gradient(90deg, var(--t2) 0 3px, transparent 3px 6px)',
    },
  },
  {
    label: 'no label',
    style: {
      backgroundImage: 'repeating-linear-gradient(90deg, var(--warn) 0 3px, transparent 3px 6px)',
    },
  },
];

const Legend = () => (
  <div className="flex items-center gap-[10px] text-meta text-t3">
    {LEGEND.map((item) => (
      <span key={item.label} className="inline-flex items-center gap-[4px]">
        <span className="w-[12px] h-[2px] rounded-full" style={item.style} />
        {item.label}
      </span>
    ))}
  </div>
);

/**
 * Objects tab — the layers tree.
 *
 * Owns selection, per-row actions, drag reorder/nest, the bulk accept/discard
 * actions that used to sit in the old ObjectsSection header, and the image-level
 * footer actions from the old left-sidebar StatusSection.
 */
const ObjectsTab = () => {
  const objects = useObjectsList();
  const visibility = useObjectsVisibility();
  const selectedIds = useSelectedObjects();
  const selectObject = useSelectObject();
  const hiddenIds = useHiddenObjectIds();
  const toggleHidden = useToggleObjectHidden();
  const collapsedIds = useCollapsedObjectIds();
  const toggleCollapsed = useToggleObjectCollapsed();
  const expandObject = useExpandObject();
  const hoveredId = useHoveredObjectId();
  const setHoveredId = useSetHoveredObjectId();
  const mode = useWorkspaceMode();
  const showApproved = useShowApproved();
  const toggleShowApproved = useToggleShowApproved();
  const rootOrder = useRootOrder();
  const initRootOrder = useInitRootOrder();
  const reorderRootObject = useReorderRootObject();
  const colorOverrides = useLabelColorOverrides();
  const showContextMenu = useShowContextMenu();
  const currentMaskId = useCurrentMaskId();
  const labels = useDatasetLabels();
  const updateObject = useUpdateObject();

  const { currentDataset } = useDataset();
  const { can } = usePermissions(currentDataset);
  const { addToast } = useToast();

  const actions = useObjectActions();
  const labelling = useLabelAssignment();
  const imageActions = useImageLevelActions();

  const [statsFor, setStatsFor] = useState(null);
  const [labelTargets, setLabelTargets] = useState(null);
  const [labelQuery, setLabelQuery] = useState('');
  const [sendBackFor, setSendBackFor] = useState(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [drag, setDrag] = useState({ id: null, overId: null, zone: null });

  const isReviewMode = mode === 'review';
  const canEdit = can(Permission.ANNOTATION_EDIT_OWN);
  const canDelete = can(Permission.ANNOTATION_DELETE_OWN);
  const canSendBack = can(Permission.REVIEW_REJECT);

  const rows = useMemo(() => {
    const tree = buildObjectTree(objects, {
      visibility,
      hiddenIds: {}, // hidden objects stay listed (greyed) so they can be restored
      reviewOnly: isReviewMode && !showApproved,
      rootOrder,
    });
    return flattenTree(tree, collapsedIds);
  }, [objects, visibility, isReviewMode, showApproved, rootOrder, collapsedIds]);

  const unreviewed = useMemo(() => objects.filter((object) => !isReviewed(object)), [objects]);
  const toReviewCount = useMemo(
    () => objects.filter((object) => !isReviewed(object)).length,
    [objects]
  );

  const colorFor = useCallback(
    (object) => {
      if (object.labelId != null) {
        const label = labels.find((item) => String(item.id) === String(object.labelId));
        if (label) return resolveLabelColor(label, colorOverrides);
      }
      return object.color || 'var(--warn)';
    },
    [labels, colorOverrides]
  );

  // --- label assignment -----------------------------------------------------

  const openLabelPicker = useCallback((targets) => {
    setLabelTargets(targets);
    setLabelQuery('');
  }, []);

  const commitLabel = useCallback(
    async (label) => {
      const targets = labelTargets || [];
      setLabelTargets(null);
      await labelling.assignLabelToMany(targets, label);
    },
    [labelTargets, labelling]
  );

  const pickerLabels = useMemo(
    () => (labelTargets?.length ? labelling.getLabelsForObject(labelTargets[0]) : []),
    [labelTargets, labelling]
  );

  // --- drag and drop --------------------------------------------------------

  const handleDragStart = (object) => (event) => {
    // Seed the manual ordering from what is on screen, so a reorder has a base.
    initRootOrder(rows.filter((row) => row.depth === 0).map((row) => row.object.id));
    setDrag({ id: object.id, overId: null, zone: null });
    event.dataTransfer.effectAllowed = 'move';
    // Firefox requires data to be set for a drag to start at all.
    event.dataTransfer.setData('text/plain', String(object.id));
  };

  const handleDragOver = (object) => (event) => {
    if (drag.id == null || drag.id === object.id) return;
    event.preventDefault();
    // Compute this before entering the state updater. React may run the updater
    // after the synthetic event has been released, at which point
    // event.currentTarget is null.
    const zone = dropZoneFor(event, event.currentTarget);
    setDrag((current) => ({
      ...current,
      overId: object.id,
      zone,
    }));
  };

  const handleDrop = (target) => async (event) => {
    event.preventDefault();
    const { id: dragId, zone } = drag;
    setDrag({ id: null, overId: null, zone: null });
    if (dragId == null || dragId === target.id) return;

    const dragged = actions.getObjectById(dragId);
    if (!dragged) return;

    if (zone === 'into') {
      const contourId = getContourId(dragged);
      const parentContourId = getContourId(target);
      if (contourId == null || parentContourId == null) {
        addToast({ type: 'error', message: 'These objects cannot be nested.' });
        return;
      }
      try {
        await annotationSession.modifyObject(contourId, { parent_id: parentContourId });
        updateObject(dragId, { parent_id: target.id });
        expandObject(target.id);
      } catch (error) {
        // Re-parenting is not part of the documented OBJECT_MODIFY contract, so
        // a rejection here is expected on backends that don't support it.
        addToast({
          type: 'error',
          message: `Could not nest this object: ${error.message || 'not supported by the server'}`,
        });
      }
      return;
    }

    // Reordering roots is a view-only concern; the backend has no order field.
    if (!dragged.parent_id && !target.parent_id) {
      reorderRootObject(dragId, target.id, zone);
    }
  };

  // --- bulk actions ---------------------------------------------------------

  const acceptAll = () => {
    setOverflowOpen(false);
    if (unreviewed.length === 0) return;
    openLabelPicker(unreviewed);
  };

  const discardAll = () => {
    setOverflowOpen(false);
    if (unreviewed.length === 0) return;
    setConfirm({
      title: `Discard ${unreviewed.length} unreviewed object${unreviewed.length === 1 ? '' : 's'}?`,
      body: 'Every object that has not been reviewed is deleted. This cannot be undone.',
      confirmLabel: 'Discard all',
      onConfirm: async () => {
        await actions.removeMany(unreviewed);
        setConfirm(null);
      },
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-[8px] pt-[9px] pb-[12px] flex flex-col gap-[9px]">
        <VisibilitySection />

        <div className="h-px bg-ln" />

        <div>
          <div className="flex items-center gap-[6px] h-[22px]">
            <Layers size={13} strokeWidth={1.9} className="text-t3 flex-none" />
            <span className="text-sect font-bold tracking-[.08em] uppercase text-t3">Objects</span>
            <span className="inline-flex items-center h-[16px] px-[6px] rounded-9 bg-well text-meta font-bold text-t2">
              {isReviewMode ? `${toReviewCount} to review` : objects.length}
            </span>
            <span className="flex-1" />

            {isReviewMode ? (
              <button
                type="button"
                onClick={toggleShowApproved}
                title={showApproved ? 'Hide approved objects' : 'Show approved objects'}
                aria-label={showApproved ? 'Hide approved objects' : 'Show approved objects'}
                className="w-5 h-5 flex items-center justify-center rounded-5 text-t3 hover:bg-hv hover:text-ac transition-colors duration-150"
              >
                {showApproved ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOverflowOpen((open) => !open)}
                  aria-label="More object actions"
                  className="w-5 h-5 flex items-center justify-center rounded-5 text-t3 hover:bg-hv hover:text-ac transition-colors duration-150"
                >
                  <MoreHorizontal size={13} />
                </button>
                {overflowOpen && (
                  <>
                    <div className="fixed inset-0 z-[70]" onClick={() => setOverflowOpen(false)} />
                    <div className="absolute right-0 top-[22px] z-[80] w-[200px] p-[5px] rounded-9 bg-p2 border border-ln2 shadow-dropdown animate-dcPop">
                      <button
                        type="button"
                        onClick={acceptAll}
                        disabled={unreviewed.length === 0}
                        className="w-full h-7 px-[7px] flex items-center rounded-6 text-btn text-t1 hover:bg-hv disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                      >
                        Assign label to all ({unreviewed.length})
                      </button>
                      <button
                        type="button"
                        onClick={discardAll}
                        disabled={unreviewed.length === 0 || !canDelete}
                        className="w-full h-7 px-[7px] flex items-center rounded-6 text-btn text-err hover:bg-errBg disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                      >
                        Discard all unreviewed
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="mt-[6px] mb-[7px]">
            <Legend />
          </div>

          {rows.length === 0 ? (
            <div className="py-[26px] text-center rounded-9 border border-ln2 bg-well">
              <Layers size={22} className="mx-auto mb-[8px] text-t3" />
              <p className="text-row font-semibold text-t2">No objects yet</p>
              <p className="mt-[3px] text-meta text-t3">
                Draw a shape or run a model to add one
              </p>
            </div>
          ) : (
            <div role="tree" className="flex flex-col gap-[1px]">
              {rows.map(({ object, depth, hasChildren, expanded }) => (
                <ObjectRow
                  key={object.id}
                  object={object}
                  depth={depth}
                  hasChildren={hasChildren}
                  expanded={expanded}
                  selected={selectedIds.includes(object.id)}
                  hovered={hoveredId === object.id}
                  hidden={!!hiddenIds[object.id]}
                  color={colorFor(object)}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canSendBack={canSendBack && !!currentMaskId}
                  isReviewMode={isReviewMode}
                  dragging={drag.id === object.id}
                  dropHint={drag.overId === object.id ? drag.zone : null}
                  onToggleExpand={() => toggleCollapsed(object.id)}
                  onSelect={(event) => {
                    if (event.shiftKey || event.metaKey || event.ctrlKey) {
                      actions.toggleSelection(object);
                      return;
                    }
                    // Focus mode is only entered for labelled objects; an
                    // unlabelled one opens the picker instead of failing.
                    actions.selectAndFrame(object, { focus: true }).then((result) => {
                      if (result === 'needs-label') openLabelPicker([object]);
                    });
                  }}
                  onDoubleClick={() => actions.refine(object)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (!selectedIds.includes(object.id)) selectObject(object.id);
                    showContextMenu(event.clientX, event.clientY, object.id);
                  }}
                  onHover={setHoveredId}
                  onToggleHidden={() => toggleHidden(object.id)}
                  onAssignLabel={() => openLabelPicker([object])}
                  onDiscard={() => actions.remove(object)}
                  onSendBack={() => setSendBackFor(object)}
                  onEditContour={() => actions.editContour(object)}
                  onDelete={() =>
                    setConfirm({
                      title: 'Delete this object?',
                      body: `“${object.label || `Object #${object.id}`}” is removed from the image. This cannot be undone.`,
                      confirmLabel: 'Delete',
                      onConfirm: async () => {
                        await actions.remove(object);
                        setConfirm(null);
                      },
                    })
                  }
                  onShowStats={(event) => {
                    const rect = event?.currentTarget?.getBoundingClientRect?.();
                    setStatsFor({
                      object,
                      anchor: rect
                        ? { top: rect.top + rect.height / 2, left: rect.left - 8 }
                        : null,
                    });
                  }}
                  onDragStart={handleDragStart(object)}
                  onDragOver={handleDragOver(object)}
                  onDrop={handleDrop(object)}
                  onDragEnd={() => setDrag({ id: null, overId: null, zone: null })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Image-level actions, from the old left-sidebar Status section. */}
      <div className="h-[34px] flex-none flex items-center gap-[7px] px-[8px] border-t border-ln">
        <button
          type="button"
          disabled={!imageActions.hasMask || imageActions.isProcessing}
          onClick={() =>
            setConfirm({
              title: 'Remove all annotations?',
              body: 'Every object on this image is deleted, including reviewed ones. This cannot be undone.',
              confirmLabel: 'Remove all',
              onConfirm: async () => {
                await imageActions.removeAllAnnotations();
                setConfirm(null);
              },
            })
          }
          className="h-[24px] px-[8px] rounded-6 text-meta font-semibold text-err hover:bg-errBg transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Remove all
        </button>
        <span className="flex-1" />
        <button
          type="button"
          disabled={!imageActions.hasMask || imageActions.isProcessing}
          onClick={
            imageActions.isReviewable
              ? imageActions.unmarkAsFullyAnnotated
              : imageActions.markAsFullyAnnotated
          }
          className="h-[24px] px-[8px] rounded-6 border border-ln2 text-meta font-semibold text-t2 hover:bg-hv hover:text-t1 transition-colors disabled:opacity-40"
        >
          {imageActions.isReviewable ? 'Unmark done' : 'Mark done'}
        </button>
      </div>

      {labelTargets && (
        <>
          <div className="fixed inset-0 z-[190]" onClick={() => setLabelTargets(null)} />
          <div className="absolute right-[8px] bottom-[42px] z-[200]">
            <LabelPicker
              items={pickerLabels}
              query={labelQuery}
              onQueryChange={setLabelQuery}
              onSelect={commitLabel}
              onClose={() => setLabelTargets(null)}
              colorOverrides={colorOverrides}
              caption={
                labelTargets.length > 1
                  ? `Applies to ${labelTargets.length} objects`
                  : labelling.getParentLabelName(labelTargets[0])
                    ? `Sub-labels of ${labelling.getParentLabelName(labelTargets[0])}`
                    : 'Root level'
              }
              emptyMessage="No labels valid at this level"
            />
          </div>
        </>
      )}

      {statsFor && (
        <ObjectStatsPopover
          object={statsFor.object}
          anchor={statsFor.anchor}
          onClose={() => setStatsFor(null)}
        />
      )}

      {currentMaskId && sendBackFor && (
        <RejectMaskModal
          isOpen
          maskId={currentMaskId}
          contourId={getContourId(sendBackFor)}
          contourLabel={sendBackFor.label_name || sendBackFor.label}
          onClose={() => setSendBackFor(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel}
        busy={imageActions.isProcessing}
        onCancel={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
      />
    </div>
  );
};

export default ObjectsTab;
