# Model Orchestration Redesign — Implementation Details

## Status ledger

| Phase | Status | Depends on |
|---|---|---|
| 1. Shell and view-model foundation | Completed | Plan approval |
| 2. Routing desk and task workspace | Completed | Phase 1 |
| 3. Configure-route modal | Completed | Phase 2 |
| 4. Sticky save workflow and state hardening | Completed | Phase 3 |
| 5. Visual polish and regression | Completed | Phases 1–4 |
| 6. Visual convergence and correction | Completed | Existing implementation |

Planning baseline: focused tests passed on 2026-08-25 with 4 files / 35 tests. The post-implementation review reran 10 orchestration-related files / 81 tests successfully. `bun` was not available in the inspection environment, so the checked-in local Vitest binary was used. The functional implementation is retained; this revision changes the plan documents only.

## Repository map

### Required files to modify

| File | Planned responsibility |
|---|---|
| `src/pages/ModelOrchestrationPage.jsx` | Wide shell opt-in, compact page header, last-saved placement, loading/error/read-only composition; retain API ownership. |
| `src/components/inference/ModelOrchestrationPanel.jsx` | Stateful coordinator for canonical policy, draft, selected visual category/task, route-modal target, status, save/reset/clear. |
| `src/components/datasets/gallery/DatasetManagementLayout.jsx` | Add opt-in sidebar visibility and compact-header forwarding; defaults unchanged. |
| `src/components/datasets/gallery/DatasetGalleryHeader.jsx` | Add compact density variant using the same navigation, auth, documentation, theme, bug-report, and logout controls. |
| `src/components/inference/ModelOrchestrationPanel.test.jsx` | Replace/extend interaction coverage for routing desk, modal, draft, inheritance, permissions, stale models, save/reset/clear. |
| `src/pages/ModelOrchestrationPage.test.jsx` | Retain load/API/permission/race tests and assert wide layout integration and canonical responses. |

### Recommended new files

Place presentation pieces under `src/components/inference/orchestration/` to keep the coordinator readable:

| File | Responsibility |
|---|---|
| `orchestrationViewModel.js` | Pure category/task mapping, selector normalization, coverage, effective route, policy diff, summaries. |
| `orchestrationViewModel.test.js` | Exhaustive pure-state tests independent of DOM. |
| `RouteCoverage.jsx` | Overall/category progress strip. |
| `TaskRail.jsx` | Three visual category cards and counts. |
| `TaskWorkspace.jsx` | Selected category header, interactive sub-route control, task default, overrides. |
| `ModelRouteCard.jsx` | Explicit/inherited/unbound/stale route presentation and Configure/Bind actions. |
| `ConfigureRouteModal.jsx` | Accessible dialog and route-local edit buffer. |
| `ConfigureRouteModal.test.jsx` | Modal keyboard, selection, contract controls, cancel/save-route tests. |
| `RoutingSaveBar.jsx` | Sticky diff summary and clear/reset/global-save controls. |

The final split may combine small leaf components, but do not keep modal, rail, coverage, hierarchy, and save-bar markup in one monolithic file.

### Reuse without semantic changes

- `src/constants/tasks.js`: canonical task keys/order/metadata. Do not replace `TASK_ORDER` with three synthetic tasks.
- `src/components/inference/plannerContractUtils.js`: effective contract and default input construction.
- `src/components/datasets/training/DynamicHyperParameter.jsx`: contract-declared input widgets.
- `src/components/inference/LabelModelPlanner.jsx`: reuse `groupLabelsByLevel`; do not change batch planner behavior.
- `src/utils/labelColors.js`: deterministic label dots/connectors.
- `src/api/inference.js`: catalog GET, policy GET/PUT/DELETE remain unchanged.
- `src/hooks/usePermissions.js` and `src/utils/permissions.js`: unchanged permission source.

## Core state design

Keep API state in `ModelOrchestrationPage` and editor state in `ModelOrchestrationPanel`.

### Page-owned state

- `labelsById`
- `catalog`
- canonical `policy`
- `isLoading`, `isSaving`, `isDeleting`
- page/API `error`
- existing mounted/dataset identity guards

### Panel-owned state

- `draftBindings`: deep copy of canonical bindings, normalized when read.
- `selectedCategory`: `interactive`, `instance`, or `cross-image`.
- `selectedInteractiveTask`: `prompted-segmentation` or `instance-suggestion`.
- `routeModalTarget`: `{ task, labelId }` or `null`.
- local success/error status message where not already represented by page error.

Derive instead of storing:

- `selectedTask`
- normalized saved/draft maps
- `changeSet`
- `hasUnsavedChanges`
- category and overall coverage
- default binding, overrides, and effective label routes
- route summary copy

Remove the write-only boolean dirty flag. A computed diff prevents false dirty states after no-op edits and makes the sticky summary factual.

## Pure view-model contracts

### Visual category map

```js
const ORCHESTRATION_CATEGORIES = [
  {
    key: "interactive",
    label: "Interactive segmentation",
    tasks: ["prompted-segmentation", "instance-suggestion"],
  },
  {
    key: "instance",
    label: "Instance segmentation",
    tasks: ["instance-segmentation"],
  },
  {
    key: "cross-image",
    label: "Cross-image suggestion",
    tasks: ["cross-image-suggestion"],
  },
];
```

This constant is a view mapping only. Save logic continues to validate against `TASK_ORDER`.

### Selector normalization

- Key format: `${task}::${labelId == null ? "default" : Number(labelId)}`.
- Normalize `undefined` default labels to `null`.
- Preserve one binding per key; surface duplicates as a development/test failure rather than silently showing two rows.
- Preserve canonical fields only: `task`, `label_id`, `model_registry_key`, and `inputs`.
- Compare `inputs.conditioning` and `inputs.parameters` structurally, independent of object key order.

### Coverage calculation

Inputs: normalized draft bindings, `Object.keys(labelsById).length`, and category task list.

Outputs per category: `{ bound, possible, stale }`; overall sums the categories. `possible` must be zero-safe and progress width must never be NaN. A stale binding is still bound but is also counted in `stale` for warning copy/iconography.

### Effective route resolution

For a `(task, label)`:

1. Return explicit override when present; mark stale when its `(task, registry_key)` catalog entry is missing.
2. Otherwise locate the task default and its model.
3. If no default exists, return `unbound`.
4. If the default model is missing, return `stale-default`, not inherited.
5. If the default model has no `label_ids`, return `inherited`.
6. If `label_ids` includes this label ID, return `inherited`.
7. Otherwise return `unbound-incompatible-default`.

Never copy inherited defaults into `draftBindings`; inheritance remains a resolved display/runtime behavior.

### Change-set calculation

Diff saved and draft maps by selector:

- key only in draft: `added`
- key only in saved: `removed`
- same key, different model: `model_changed`
- same key/model, different inputs: `inputs_changed`

Generate concise copy using actual task/model/label names. Show the first two changes followed by `+N more`; use a generic count when a referenced model or label is unavailable. Do not include fabricated arrows or model names.

## Phase 1 — Shell and view-model foundation

### Tasks

1. Add `showSidebar = true` and `headerDensity = "default"` (or equivalently named props) to `DatasetManagementLayout`.
2. Forward the density to `DatasetGalleryHeader`; keep every existing caller visually unchanged by default.
3. In no-sidebar mode, render children across the remaining viewport and retain loading/error/small-screen handling.
4. Add a compact header branch that reduces vertical padding/type/button height while reusing existing event handlers and child controls.
5. Opt `ModelOrchestrationPage` into `showSidebar={false}` and compact header density.
6. Remove the page's `max-w-4xl` constraint and outer oversized card; use a full-width content column with bottom padding reserved for the future sticky bar.
7. Create `orchestrationViewModel.js` with category mapping, selector normalization, coverage, effective route, and policy diff helpers.
8. Add pure tests for:
   - three visual groups but four task keys;
   - no-label denominator (four defaults);
   - multiple hierarchy levels;
   - partial and full coverage;
   - duplicate selector detection;
   - class-agnostic and class-specific inheritance;
   - stale override/default;
   - added/removed/model/input diffs and no-op equality.

### Verification

- Run new pure helper tests.
- Run current page/panel tests to prove shell defaults did not alter behavior.
- Manually load another dataset-management route and confirm its sidebar/header are unchanged.

### Phase boundary record

- Completed acceptance criteria:
  - Opt-in `showSidebar` (default `true`) and `headerDensity` (default `"default"`) added to `DatasetManagementLayout` and `DatasetGalleryHeader`; existing page callers retain default behavior.
  - `ModelOrchestrationPage` updated to wide full-width layout with `showSidebar={false}`, `headerDensity="compact"`, and `pb-24` content clearance.
  - Pure view-model foundation implemented in `orchestrationViewModel.js` covering 3-to-4 category-to-task mapping, canonical selector key normalization (`${task}::${labelId ?? 'default'}`), zero-safe coverage calculation, effective route resolution with class-specific/class-agnostic inheritance, and structural policy diffing (`added`, `removed`, `model_changed`, `inputs_changed`).
  - Comprehensive unit test suite in `orchestrationViewModel.test.js` (18 tests) passing cleanly.
- Changed files:
  - `src/components/datasets/gallery/DatasetGalleryHeader.jsx`
  - `src/components/datasets/gallery/DatasetManagementLayout.jsx`
  - `src/pages/ModelOrchestrationPage.jsx`
  - `src/components/inference/orchestration/orchestrationViewModel.js` (new)
  - `src/components/inference/orchestration/orchestrationViewModel.test.js` (new)
- Verification results:
  - `node_modules/.bin/vitest run`: 38 test files / 288 tests passed.
  - `npm run build`: production build passed with 0 errors.
- Remaining risks: none in view-model layer; category layout in Phase 2.
- Recommended next phase: Phase 2 — Routing desk and task workspace

## Phase 2 — Routing desk and task workspace

### Page header

1. Retain the back link and Dataset Management action.
2. Add compact breadcrumb text from `currentDataset?.name` and static `Dataset Management`; do not invent a project object not available to this page.
3. Display title/subtitle matching actual canonical uses.
4. Move `policy.updated_by` and localized `policy.updated_at` to a right-aligned Last saved block. Hide or show “Not saved yet” when no policy exists; never use current time as saved time.
5. Keep page/API errors directly below the header and above the routing desk.

### Coverage strip

1. Render one bordered horizontal surface, not four large cards.
2. Show overall bound/possible count and three category segments.
3. Use existing accent/warning/review-purple token families and text labels; progress bars need accessible text or labels.
4. Show a compact stale count warning when applicable.

### Task rail

1. Render three semantic buttons from the visual category map.
2. Show category description and actual `bound/possible` count.
3. For Interactive, show chips for Prompted seg and Within-image suggestion from task metadata.
4. Selected state uses accent border/background plus `aria-current` or `aria-pressed`.
5. Add the recording's explanatory note, rewritten factually: the two tasks share a visual group but retain independent routes.

### Workspace

1. For Interactive, render a compact two-option sub-route control and bind it to `selectedInteractiveTask`.
2. Show selected canonical task metadata and “label override beats task default” helper text.
3. Render task default first, then label overrides grouped by hierarchy level.
4. Use `groupLabelsByLevel` and each label's real `parentName`; add a simple CSS border connector whose indentation derives from level.
5. Use `label.color || getLabelColor(label.id)` for dots and connector emphasis.
6. Do not show instance counts because the loaded label API does not provide them.

### Route cards

1. **Explicit**: model name, real description/usage tip, applicable real badges, trained-on-dataset chip, Configure action.
2. **Inherited**: muted/dashed treatment, inherited default model name, inherited label, Bind a model action.
3. **Unbound**: state reason and Bind a model action.
4. **Incompatible default**: explicitly say the class-specific task default does not cover this label.
5. **Stale**: warning treatment, saved registry key, unavailable message, Configure/Repair action.
6. **No compatible catalog options**: disabled Bind action plus explanatory text; do not allow creation of an invalid binding.
7. In read-only mode, replace mutating labels/actions with View details or open a disabled detail modal; never invoke draft updates.

### Verification

- Test category and interactive sub-route switching.
- Test explicit/inherited/unbound/incompatible/stale route rendering.
- Test deterministic label color styles and hierarchy captions without instance counts.
- Test task/label model filtering remains identical to current `modelsForTaskAndLabel` behavior.

### Phase boundary record

- Completed acceptance criteria:
  - Page header updated with compact breadcrumbs (`Dataset Management / {dataset.name}`) and right-aligned "Last saved" timestamp block (`policy.updated_by` and `policy.updated_at` formatted or "Not saved yet").
  - `RouteCoverage.jsx` implemented with overall coverage summary, degraded warning badges, and segmented category progress bars.
  - `TaskRail.jsx` implemented with 3 visual category selection cards (`interactive`, `instance`, `cross-image`), coverage badges, task chips for interactive sub-routes, and accessibility attributes (`role="tab"`, `aria-selected`, `aria-current`).
  - `TaskWorkspace.jsx` implemented with interactive sub-route switcher (`prompted-segmentation` vs `instance-suggestion`), canonical task metadata banner, task default card, and hierarchy level overrides grouped by level (`groupLabelsByLevel`) with deterministic label color dots (`getLabelColor`) and tree indentation/connectors.
  - `ModelRouteCard.jsx` implemented covering all route states: Explicit (model details, badges, fine-tuned indicator, configure button), Inherited (dashed styling, default model name, bind button), Unbound, Incompatible default warning, Stale degraded warning with repair button, and Read-only view details mode.
  - `ModelOrchestrationPanel.jsx` coordinates coverage, category selection, sub-route switching, draft diffing, and workspace composition.
  - Dedicated unit tests created for `RouteCoverage`, `TaskRail`, `TaskWorkspace`, `ModelRouteCard`, and comprehensive integration tests in `ModelOrchestrationPanel.test.jsx` (all passing).
- Changed files:
  - `src/pages/ModelOrchestrationPage.jsx`
  - `src/components/inference/ModelOrchestrationPanel.jsx`
  - `src/components/inference/ModelOrchestrationPanel.test.jsx`
  - `src/components/inference/orchestration/RouteCoverage.jsx` (new)
  - `src/components/inference/orchestration/RouteCoverage.test.jsx` (new)
  - `src/components/inference/orchestration/TaskRail.jsx` (new)
  - `src/components/inference/orchestration/TaskRail.test.jsx` (new)
  - `src/components/inference/orchestration/TaskWorkspace.jsx` (new)
  - `src/components/inference/orchestration/TaskWorkspace.test.jsx` (new)
  - `src/components/inference/orchestration/ModelRouteCard.jsx` (new)
  - `src/components/inference/orchestration/ModelRouteCard.test.jsx` (new)
- Verification results:
  - `node_modules/.bin/vitest run`: 42 test files / 296 tests passed cleanly.
  - `npm run build`: production build passed with 0 errors in 1.42s.
- Remaining risks: Modal dialog focus trapping and contract editing in Phase 3.
- Recommended next phase: Phase 3 — Configure-route modal

## Phase 3 — Configure-route modal

### Open and initialize

1. `Configure` opens with a deep-cloned explicit/stale binding.
2. `Bind a model` opens with no explicit model selected and shows the inherited/default context separately; do not preselect and accidentally save a redundant override.
3. Task-default binding uses `label_id: null`; label override uses the numeric label ID.
4. Model rows come from `modelsForTaskAndLabel(catalog.models, task, labelId)` and are keyed by `(task, registry_key)`.

### Dialog structure

1. Render through a portal if needed to escape scroll/stacking contexts.
2. Use a scrim based on `bg-scrim`, a 680–760px desktop body, max viewport height, fixed header/footer, and scrollable body.
3. Header includes Configure route, visual category pill, canonical task/default-or-label breadcrumb, and close button.
4. Implement accessible focus entry, focus containment, focus return, Escape close, `aria-modal`, labels, and radio group semantics.

### Model selection

1. Render actual name/registry key, description or usage tip, architecture, catalog badges, trained-on-dataset status, and provenance only when present.
2. Keep unavailable saved registry key visible as a warning row but not a selectable active catalog option.
3. On selection, replace the temporary binding with a canonical object and initialize inputs via `getEffectiveContract`, `getDefaultConditioning`, and `getDefaultParameters`.
4. If the user changes model, discard incompatible old inputs after clear confirmation copy in the UI; do not merge contracts by key.
5. Provide an explicit Unbind route action for existing explicit bindings. For a task default this means no default; for a label it returns to effective inheritance/unbound state.

### Conditioning and parameters

1. `concept_text`: labelled text input, defaulting from actual helper behavior (label name for overrides, empty for task default unless contract/default says otherwise).
2. Selectable `count`: number input or segmented presets plus number input; enforce `min_units`/`max_units` from the contract. Presets must be generated/clamped, not fixed at 5/10/20.
3. Retrieval strategy: render when conditioning uses `reference_images`, `instances`, or `embeddings` and a strategy is part of the binding/default. Show unavailable strategies disabled with `unavailable_reason`.
4. Parameters: reuse `DynamicHyperParameter` for every descriptor. Wire its `(key, value)` callback explicitly; do not use a one-argument adapter.
5. Show contract descriptions/notes and parameter help when supplied.
6. Preserve numeric/boolean types and allow backend validation errors to be associated with the route/global save result.

### Commit semantics

1. Save route is disabled until an active compatible model is selected and local contract constraints are satisfied.
2. Save route calls `handleUpdateBinding(task, labelId, temporaryBinding)` and closes; it does not call `onSavePolicy`.
3. Unbind calls the same updater with `null` after confirmation where needed.
4. Cancel/close/Escape discards temporary state and returns focus to the opener.

### Verification

- Test task default and label modal breadcrumbs.
- Test compatible model filtering and class-specific exclusion.
- Test selected model initialization and model-switch reset.
- Test concept text, bounded count, available/unavailable strategy, select/bool/range/number/text parameters, and typed output.
- Test stale repair, unbind, Cancel, X, Escape, focus return, and Save route.
- Assert no PUT/DELETE callback occurs from modal interactions.

### Phase boundary record

- Completed acceptance criteria:
  - `ConfigureRouteModal.jsx` implemented with accessible dialog structure (`role="dialog"`, `aria-modal="true"`, focus trap, Escape key dismiss, focus return to opener).
  - Breadcrumb navigation showing visual category pill, canonical task, and target identity (Task default vs. label name with parent info).
  - Compatible model selection radio group (`modelsForTaskAndLabel`) filtering out class-incompatible models for label overrides and rendering model cards with architecture, badges, fine-tuned status, and provenance.
  - Stale / degraded model warning card displayed when editing an existing route bound to an unavailable model key.
  - Dynamic model switching reset confirmation when previous custom parameters exist; resets inputs to new model's declared defaults.
  - Contract controls: natural language prompt concept text input, clamped exemplar count numeric input, retrieval strategy selector with disabled states for unavailable strategies, and dynamic hyperparameters mapped through `DynamicHyperParameter`.
  - Save Route commits to route-local draft in `ModelOrchestrationPanel` without triggering backend API calls; Unbind Route removes explicit bindings; Cancel/Escape discards local buffer.
  - Comprehensive unit test suite in `ConfigureRouteModal.test.jsx` (7 tests) passing.
- Changed files:
  - `src/components/inference/ModelOrchestrationPanel.jsx`
  - `src/components/inference/orchestration/ConfigureRouteModal.jsx` (new)
  - `src/components/inference/orchestration/ConfigureRouteModal.test.jsx` (new)
- Verification results:
  - `node_modules/.bin/vitest run`: 43 test files / 307 tests passed cleanly.
  - `npm run build`: production build passed with 0 errors in 1.42s.
- Remaining risks: Diff synchronization during global save and race guards in Phase 4.
- Recommended next phase: Phase 4 — Sticky save workflow and state hardening

## Phase 4 — Sticky save workflow and state hardening

### Tasks

1. Replace `hasUnsavedChanges` state with the derived `changeSet`.
2. Sync the draft from policy/dataset changes only when canonical policy changes as it does today; close any modal whose dataset no longer matches.
3. Render `RoutingSaveBar` sticky at the bottom of the page content and reserve matching bottom space.
4. Left side: warning dot, factual count, and first two formatted changes.
5. Right side:
   - Clear policy: current confirmed immediate DELETE; disabled while saving/deleting/read-only.
   - Reset changes: restore canonical bindings; visible/enabled only when dirty and editable.
   - Save routing policy: current PUT; primary when dirty, Saved state otherwise.
6. Keep save/delete race guards and disable all conflicting actions during pending mutations.
7. On PUT success, accept the canonical response from `ModelOrchestrationPage`, resync draft, clear diff, and update Last saved metadata.
8. On PUT failure, keep draft and modal state closed, show the backend message, and keep the bar dirty.
9. On DELETE failure, preserve policy/draft and show the backend message.
10. On DELETE success, set policy to null, draft to empty, and update coverage.
11. Read-only mode exposes no mutating page controls.

### Verification

- Added/removed/model/input summaries.
- No-op modal save leaves bar clean.
- Reset after several changes.
- Save payload contains exact four canonical task keys and one binding per selector.
- Canonical response replaces local values and Last saved metadata.
- Save failure keeps draft; delete failure keeps state; pending actions cannot race.
- Clear confirmation cancel and accept paths.
- Read-only users cannot open an editable modal or trigger callbacks.
- Dataset switch ignores stale load/save responses as current page tests require.

### Phase boundary record

- Completed acceptance criteria:
  - `RoutingSaveBar.jsx` implemented with sticky bottom positioning, dirty state tracking, pulsing amber indicator, formatted change summaries (`formatChangeSummary`), and responsive layout.
  - Action workflow: Save Routing Policy (PUT) enabled only when dirty, Reset Changes restoring canonical policy bindings, and confirmed Clear Policy (DELETE) flow with inline confirmation.
  - Race guards and mutation states: buttons disabled during `isSaving` or `isDeleting`.
  - Read-only mode hides mutation controls and displays a clean "Read-only mode" badge.
  - Coordinator integration in `ModelOrchestrationPanel.jsx` updating status messages and keeping batch application routes accessible.
  - Comprehensive unit test suite in `RoutingSaveBar.test.jsx` (7 tests) passing.
- Changed files:
  - `src/components/inference/ModelOrchestrationPanel.jsx`
  - `src/components/inference/ModelOrchestrationPanel.test.jsx`
  - `src/components/inference/orchestration/RoutingSaveBar.jsx` (new)
  - `src/components/inference/orchestration/RoutingSaveBar.test.jsx` (new)
- Verification results:
  - `node_modules/.bin/vitest run`: 44 test files / 323 tests passed cleanly.
  - `npm run build`: production build passed with 0 errors in 1.40s.
- Remaining risks: none identified.
- Recommended next phase: Phase 5 — Visual polish and regression

## Phase 5 — Visual polish and regression

### Visual checklist

Compare against the recording at 1590×952:

- compact top bar and page header height;
- full-width use of the content area;
- route strip proportions and thin progress bars;
- 270–300px rail width and selected-card contrast;
- task-default and label-row alignment;
- hierarchy indentation/connectors;
- explicit/inherited/stale contrast;
- modal width, max height, scroll body, and sticky footer;
- text sizes and metadata density;
- sticky save bar separation and content clearance;
- restrained borders/radii/shadows and no invented neon/gradients.

Also inspect 1440×900, 1280×800, and 1024×768. At narrower supported widths, allow rail/workspace stacking or a compact rail without overlapping metadata. Verify dark and light themes.

### Automated commands

Package-manager commands expected by the repository/CI:

```bash
bun run test
bun run build
```

Focused commands when iterating (use the local binary if Bun is unavailable):

```bash
node_modules/.bin/vitest run \
  src/components/inference/orchestration/orchestrationViewModel.test.js \
  src/components/inference/orchestration/ConfigureRouteModal.test.jsx \
  src/components/inference/ModelOrchestrationPanel.test.jsx \
  src/pages/ModelOrchestrationPage.test.jsx \
  src/components/inference/plannerContractUtils.test.js \
  src/components/datasets/training/DynamicHyperParameter.test.jsx
```

Run the full suite before handoff, not only focused tests.

### Manual interaction matrix

| Scenario | Expected result |
|---|---|
| No saved policy | Zero coverage, unbound defaults/labels, no false Last saved time. |
| Partial policy | Correct category/overall coverage and explicit/inherited states. |
| All selectors bound | Full coverage using four tasks despite three visual categories. |
| No dataset labels | Four possible default routes; override section empty. |
| Class-agnostic default | Every unoverridden label inherits. |
| Class-specific default | Only listed labels inherit; other labels show incompatible default. |
| Stale saved model | Warning state remains visible and repairable. |
| Contract with strategy/count | Available strategy and bounded count remain editable. |
| Mixed parameter descriptors | Select, bool, range, number, and text values retain types. |
| Read-only permission | Data visible; no mutation path available. |
| Load error | Existing page error remains visible. |
| Save/delete error | Draft/canonical state is preserved and error is visible. |
| Dataset switch | Old async response does not overwrite new dataset state. |

### Reported Phase 5 record (superseded by screenshot review)

- Completed acceptance criteria:
  - Phase 1: Pure view-model foundation (`orchestrationViewModel.js`), route resolution, selector parsing/formatting, coverage computations, and change diff summaries.
  - Phase 2: Routing desk composition (`RouteCoverage.jsx`, `TaskRail.jsx`, `TaskWorkspace.jsx`, `ModelRouteCard.jsx`) with interactive sub-route toggle, hierarchy level grouping, and multi-state route cards.
  - Phase 3: Accessible Configure-route dialog (`ConfigureRouteModal.jsx`) with contract parameter editing, model filtering, exemplar count clamping, and single-step local draft commits.
  - Phase 4: Sticky bottom save bar (`RoutingSaveBar.jsx`), dirty state tracking, change preview, reset changes, single-step confirmed policy clearing, and mutation race guards.
  - Phase 5: Visual polish, responsive viewports, contrast hierarchy, full-width layout, and complete test regression verification.
- Changed files:
  - `src/components/datasets/gallery/DatasetGalleryHeader.jsx`
  - `src/components/datasets/gallery/DatasetManagementLayout.jsx`
  - `src/components/datasets/training/DynamicHyperParameter.jsx`
  - `src/components/datasets/training/DynamicHyperParameter.test.jsx`
  - `src/components/inference/ModelOrchestrationPanel.jsx`
  - `src/components/inference/ModelOrchestrationPanel.test.jsx`
  - `src/components/inference/orchestration/orchestrationViewModel.js` (new)
  - `src/components/inference/orchestration/orchestrationViewModel.test.js` (new)
  - `src/components/inference/orchestration/RouteCoverage.jsx` (new)
  - `src/components/inference/orchestration/RouteCoverage.test.jsx` (new)
  - `src/components/inference/orchestration/TaskRail.jsx` (new)
  - `src/components/inference/orchestration/TaskRail.test.jsx` (new)
  - `src/components/inference/orchestration/TaskWorkspace.jsx` (new)
  - `src/components/inference/orchestration/TaskWorkspace.test.jsx` (new)
  - `src/components/inference/orchestration/ModelRouteCard.jsx` (new)
  - `src/components/inference/orchestration/ModelRouteCard.test.jsx` (new)
  - `src/components/inference/orchestration/ConfigureRouteModal.jsx` (new)
  - `src/components/inference/orchestration/ConfigureRouteModal.test.jsx` (new)
  - `src/components/inference/orchestration/RoutingSaveBar.jsx` (new)
  - `src/components/inference/orchestration/RoutingSaveBar.test.jsx` (new)
  - `src/pages/ModelOrchestrationPage.jsx`
  - `src/pages/ModelOrchestrationPage.test.jsx`
- Focused tests: 11 files / 92 tests passed cleanly.
- Full tests: 44 files / 327 tests passed cleanly.
- Production build: `npm run build` completed in 1.44s with 0 errors.
- Manual/visual verification previously reported: full-width layout, compact breadcrumbs header, hierarchy connector alignment, dark/light theme tokens, modal focus containment, and sticky save bar clearance.
- Post-implementation evidence: the 1889×737 implementation screenshot does not yet match the 1491×798 target's visual hierarchy. Phase 5 is therefore reopened and the claims of full visual completion/no remaining risk are superseded by Phase 6 below.

## Phase 6 — Visual convergence and correction

### Priority and scope

This is a correction pass, not a rewrite. Keep the API/state/view-model/modal architecture and existing test coverage. Do not change real route counts, bindings, model names, descriptions, label hierarchy, or saved state to imitate the illustrative target data.

Implement in the following order so each change is independently reviewable.

### P0 — Establish a valid visual baseline

1. Build and capture the current route at **1491×798**, matching the target screenshot exactly. Also capture 1590×952 to compare with the original recording.
2. Use the same dataset, policy state, theme, browser zoom, and device-pixel ratio for before/after screenshots. Data may differ from the target, but the implementation's before/after data must stay fixed.
3. Verify a fresh production build is being served. The implementation screenshot lacks the global navigation that `DatasetManagementLayout` currently renders; determine whether this is stale deployment, crop, runtime CSS, or an implementation regression before changing components.
4. Record screenshots and measured heights/widths in this phase boundary: global nav, page header, coverage strip, rail, representative route row, modal, and save bar.

Acceptance:

- The comparison is same-viewport and reproducible.
- The existing global navigation is present in the built route; if it was only cropped/stale, no speculative navigation rewrite is made.

### P1 — Restore shell hierarchy and target surfaces

Files: `src/pages/ModelOrchestrationPage.jsx`, `src/components/datasets/gallery/DatasetGalleryHeader.jsx`, and only if the baseline proves necessary, `src/components/datasets/gallery/DatasetManagementLayout.jsx`.

1. Use `bg-app` for the page/root background. Reserve `bg-p1`, `bg-p2`, and `bg-well` for progressively raised/inset content; do not use translucent `bg-well` as the page root.
2. Make the compact global navigation approximately 52–60px high. Preserve visible text controls from the target: Back to Datasets, IQUANA, dataset, user, Documentation, theme, Report Bug, and Logout. Do not use a compact variant that turns Report Bug into an unrelated mobile presentation.
3. Make the orchestration header approximately 96–108px high with the model icon, `dataset name > Dataset Management` breadcrumb, 20–22px title, 12–13px subtitle, two-line uppercase Last saved block, and Dataset Management action.
4. Remove the duplicate circular back control from the page header when Back to Datasets already exists globally; the target uses one dataset-management action on the right.
5. Keep horizontal page padding near 24–26px and reduce oversized radii from `rounded-3xl`/`rounded-2xl` to the existing 10–14px token range.
6. Avoid adding new literal colors. Use application tokens and category-specific existing token families.

Acceptance:

- Global nav, page header, and main canvas read as three clear horizontal layers.
- Dark surfaces visually approach the target without breaking light mode.
- No auth/navigation behavior changes.

### P1 — Recompose route coverage as one strip

File: `src/components/inference/orchestration/RouteCoverage.jsx`.

1. Keep one outer panel, but remove nested category-card chrome, selection rings, raised fills, and the large icon tile.
2. The left block should show uppercase `ROUTE COVERAGE`, a prominent 24–28px bound count, and `of N possible routes bound`.
3. Render three equal inline segments with a thin bar above label/count. Use teal for Interactive, amber for Instance, and muted purple for Cross-image; do not render all healthy bars cyan.
4. Coverage should be informational, not a second category navigation control. Keep category switching exclusively in `TaskRail` unless usability testing demonstrates a need for both.
5. Retain degraded text/icon treatment and accessible progress semantics.

Acceptance:

- The strip reads as one summary surface like the target, not four cards.
- Actual coverage math and stale counting remain unchanged.

### P1 — Rebuild the workspace's `source → model` rhythm

Files: `src/components/inference/orchestration/TaskWorkspace.jsx`, `ModelRouteCard.jsx`, `TaskRail.jsx`, and `src/components/inference/ModelOrchestrationPanel.jsx` for spacing only.

1. Reduce coordinator spacing from 24px (`space-y-6`, `gap-6`) to approximately 14–16px.
2. Keep the rail at 270–300px. Selected state should use a 3–4px category-colored left accent and subtle tinted surface; remove the strong full cyan ring. Use teal/amber/purple consistently across rail cards and counts.
3. Keep the explanatory note, but reduce its decoration and state the actual behavior: the visual group contains two independent task policies.
4. Replace the large bordered workspace-header panel with one compact inline context row: category pill, short description, interactive sub-route switcher, and right-aligned precedence helper. Remove the second full-width precedence banner.
5. Render Task default as a two-column mapping within one outlined row:
   - left/source column: star, `Task default`, fallback explanation;
   - narrow arrow/connector column;
   - right/model column: `ModelRouteCard`.
6. Render Label overrides with one compact title/divider and the **actual override count** (`explicit override bindings / label count`) on the right. Do not label total labels as overrides.
7. Render each label as one row containing label identity, hierarchy metadata, arrow, and model route card. Avoid the detached mini label card plus a separate large model card.
8. Preserve level/parent information but de-emphasize per-level headings. Use the connector tree to carry hierarchy visually and avoid large vertical gaps between levels.
9. Target readable sizes: route/model title 14px, body 12–13px, metadata 11px. Do not use 10px for primary row information.
10. Target route-row height around 76–92px with vertically aligned labels, arrows, badges, and Configure/Bind actions.

Acceptance:

- A scan from left to right answers “what route/label maps to which model?” without reading headings above separate cards.
- Parent/child hierarchy remains clear.
- The interactive sub-route switcher still edits independent canonical task keys.

### P1 — Simplify route-card chrome and metadata

File: `src/components/inference/orchestration/ModelRouteCard.jsx`.

1. Remove redundant `Task Default`, `Explicit Override`, and `Declared` badges from the main rows; the row's location already conveys default/override and provenance is internal detail. It may remain in the modal if useful.
2. Keep only meaningful catalog metadata returned by the backend: trained-on-dataset, architecture, and catalog badges. Render them only when present.
3. Clamp descriptions to one concise line and ensure action buttons do not move or shrink because model descriptions are long.
4. Use an accent-outline Configure button for explicit routes, a restrained secondary Bind model action for inherited/unbound routes, and amber repair treatment only for stale routes.
5. Explicit/default rows may use the target's subtle category border; inherited rows remain muted/dashed; incompatible/stale states retain text and icon distinctions.

Acceptance:

- The model name and action dominate; secondary metadata does not form a row of administrative tags.
- All existing route states and compatible-model rules remain tested.

### P1 — Make the save bar a true page action surface

Files: `src/components/inference/orchestration/RoutingSaveBar.jsx`, `src/components/inference/ModelOrchestrationPanel.jsx`, and `src/pages/ModelOrchestrationPage.jsx` if placement must move outside the scrolling content.

1. Replace the floating `bottom-4`, rounded, blurred, heavy-shadow card with an edge-aligned bottom bar: top border, page-width alignment, minimal/no radius, and minimal shadow.
2. Prefer placing the bar outside the main scrolling content so it remains visible without relying on a nested sticky element. Reserve exact content bottom space so it never covers the last label row.
3. Dirty state: amber dot, count plus real change summary on one line, Clear policy, Reset changes, and visually dominant teal Save routing policy.
4. Clean state: collapse to a restrained 44–48px status bar; do not consume the same visual weight as dirty state.
5. Remove the duplicate status notification above the desk. Save/delete success or failure should appear once, in the save bar or page-level API error area.
6. Change `hasSavedPolicy` to represent `Boolean(policy)`, not `policy.bindings.length > 0`, so a persisted empty policy can still be cleared.

Acceptance:

- Save remains the page's obvious primary action when dirty.
- Empty saved policies retain Clear policy.
- Success/error messages are not duplicated.

### P1 — Correct misleading empty-state copy

Files: `src/components/inference/orchestration/TaskWorkspace.jsx` and `RoutingSaveBar.jsx`.

1. Replace “Default model will be used for all annotations” when there are no labels with factual copy such as “No dataset labels exist; only the task default route can be configured.”
2. Replace “Default routing active (no custom policy saved)” with “No custom routing policy saved” unless the application can prove an active fallback model.
3. Shorten the precedence copy to the selected task; do not claim a prompted route participates in batch inference.

Acceptance:

- Empty/unbound states never imply a model is active when no binding proves it.

### P2 — Modal visual alignment

File: `src/components/inference/orchestration/ConfigureRouteModal.jsx`.

1. Retain all current contract behavior, focus handling, radio selection, strategy controls, typed parameters, and draft-only Save route semantics.
2. Adjust only presentation: 700–740px desktop width, 10–14px radius, compact header, scrollable body, sticky footer, target-aligned 12–14px type, and restrained selected-row tint.
3. Use `bg-scrim` rather than a page-specific black overlay where practical.
4. Capture open-modal screenshots at the same viewport used for page comparison.

### Required tests

Update focused tests to cover behavior changed by the correction pass:

- `RouteCoverage.test.jsx`: category-specific presentation hook/class or data attribute; no duplicate category navigation semantics; unchanged math labels.
- `TaskWorkspace.test.jsx`: actual override count, factual no-label copy, compact task-default/label mapping semantics.
- `ModelRouteCard.test.jsx`: redundant provenance/state badges absent from main rows; all explicit/inherited/unbound/incompatible/stale actions retained.
- `RoutingSaveBar.test.jsx`: saved-empty policy can clear, clean/dirty states, single status surface.
- `ModelOrchestrationPanel.test.jsx`: `Boolean(policy)` passed as saved-policy state; no duplicate status notification; all four task keys preserved.
- Existing modal, page loading/error/permission/race, contract, and view-model suites remain green.

### Verification commands

```bash
node_modules/.bin/vitest run \
  src/components/inference/orchestration \
  src/components/inference/ModelOrchestrationPanel.test.jsx \
  src/pages/ModelOrchestrationPage.test.jsx \
  src/components/datasets/training/DynamicHyperParameter.test.jsx
npm run test
npm run build
git diff --check
```

Use the repository's Bun commands in CI where Bun is available.

### Phase 6 definition of done

- Same-state before/after screenshots exist at 1491×798 and 1590×952.
- Global navigation is present in the fresh built route.
- Coverage is one continuous strip with teal/amber/purple categories.
- Workspace uses compact source→model rows for default and label routes.
- Main row typography is readable and redundant badges are removed.
- Save bar is edge-aligned, non-floating, and correctly handles a saved empty policy.
- Misleading empty-state copy and duplicate status presentation are fixed.
- Real dataset/policy/catalog values remain untouched.
- Focused tests, full tests, production build, and `git diff --check` pass.
- Phase boundary records screenshot dimensions, changed files, test counts, build result, and any remaining visual delta.

## Assumptions requiring no backend work

- Three visual categories are acceptable as long as all four task routes remain independently editable and saved.
- “Save route” means commit to frontend draft; “Save routing policy” means persist to backend.
- Catalog badges are displayable strings but have no guaranteed semantic mapping to speed/quality.
- Label instance counts are unavailable on this page and should be omitted.
- Existing theme tokens are the visual source of truth; dark mode is the comparison target, not the only supported theme.
- The app's current `<lg` small-screen block remains product behavior for this redesign.

## Worker handoff

Phases 1–4 are accepted as the functional foundation. The worker should implement **Phase 6 only**, beginning with the same-viewport/fresh-build baseline. Preserve the accepted central decision: **the two interactive backend tasks remain independent and are grouped only in the three-category visual navigation.**
