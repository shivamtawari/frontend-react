# Model Orchestration Redesign — Implementation Plan

## Status

- Planning status: revised after implementation screenshot review
- Implementation status: functionally complete; visual convergence and two correctness fixes remain
- Repository: `frontend-react`
- Branch inspected: `feat/issue-31-model-orchestration-config`
- Baseline commit inspected: `eae0cf7`
- Baseline verification: 35 focused orchestration/contract tests pass

## Source material and precedence

This plan translates two design inputs into the current IQUANA frontend:

1. The 29.7-second, 1590×952 `model orchestration redesign.webm` recording is the primary visual reference.
2. The pasted redesign brief is supporting design commentary, not a source of truth for behavior or data.

The repository is authoritative for tasks, routes, API contracts, permissions, validation, state, theme tokens, and responsive policy. Example model names, counts, badges, performance labels, sizes, timestamps, colors, and parameter names from the reference must not be hardcoded.

## Post-implementation review (2026-08-25)

The first implementation completed the planned architecture: full-width shell, four-task/three-category mapping, route coverage, task rail, effective inheritance, configuration modal, computed draft diff, sticky save workflow, and focused tests. Those pieces should be retained.

The visual review is not yet complete. The supplied target screenshot is 1491×798 while the implementation screenshot is 1889×737, so their scale and line wrapping cannot be compared directly. Even after allowing for that viewport difference, the implementation diverges in hierarchy and composition:

- the target's global navigation is not visible in the implementation capture and must be verified in the actual built route;
- root/page surfaces are materially lighter than the target;
- typography is too small and compressed;
- coverage categories look like selectable mini-cards instead of one continuous status strip;
- the workspace header became a large bordered panel instead of a compact inline context row;
- task defaults and label overrides lost the target's explicit `source → model` two-column mapping;
- redundant state/provenance badges add noise;
- category colors are not consistently teal/amber/purple;
- the save bar is a floating rounded card instead of an edge-aligned persistent action surface.

Real policy differences are not redesign failures. The target's `3 of 9`, inherited Coral polyp, model names, and unsaved state are illustrative; the implementation must continue to show the loaded dataset's actual route count, explicit overrides, catalog models, and saved/dirty state.

## Objective

Redesign `/dataset/:datasetId/model-orchestration` as a full-width, dense routing desk that visually matches the recording while retaining the existing dataset routing policy API and all current behaviors. The page should expose route coverage, category navigation, task defaults, hierarchical label overrides, contract-driven route configuration in a modal, and a sticky draft/save bar.

## Non-goals

- No backend, database, routing-policy schema, model-registry, permission, or inference changes.
- No mock catalog, label, policy, instance-count, performance, memory-size, or model-status data.
- No merging of the four canonical task keys into three backend routes.
- No redesign of batch inference or annotation consumers of the saved policy.
- No global theme palette rewrite and no page-specific hardcoded dark palette.
- No mobile application redesign below the app's existing large-screen support boundary.

## Current implementation summary

### Page and integration

`src/pages/ModelOrchestrationPage.jsx`:

- Routes from `src/App.jsx` at `/dataset/:datasetId/model-orchestration`.
- Uses `DatasetManagementLayout showSidebar={false} headerDensity="compact"`, retaining shared navigation while removing the dataset-info sidebar for this route.
- Loads labels, model catalog, and policy in parallel with `fetchLabels`, `getInferenceModelCatalog`, and `getInferenceRoutingPolicy`.
- Discards stale async responses when the dataset changes.
- Allows viewing with `ai.interactive` or `ai.batch_infer`; allows editing only with `ai.batch_infer`.
- Saves the complete policy with `PUT /inference/config` and clears it with `DELETE /inference/config`.
- Owns loading, page-level errors, save/delete pending state, and canonical policy replacement after save.

### Editor behavior

`src/components/inference/ModelOrchestrationPanel.jsx`:

- Copies `policy.bindings` into a local draft.
- Supports one task default and one override per label for each canonical task.
- Filters model options by exact task and label compatibility.
- Initializes model-owned conditioning and parameters from the selected model's effective input contract.
- Uses extracted coverage, task-rail, workspace, route-card, modal, save-bar, and pure view-model components.
- Edits model selection, concept text, count, retrieval strategy, and dynamic parameters in an accessible route-local modal.
- Computes policy-vs-draft changes, detects unavailable saved models, resets a draft, clears the saved policy after confirmation, and saves the entire draft.
- Uses four independent tasks from `TASK_ORDER`:
  - `prompted-segmentation`
  - `instance-suggestion`
  - `instance-segmentation`
  - `cross-image-suggestion`

### Data available for the redesign

The catalog provides `registry_key`, `name`, `task`, optional `description`, optional `usage_tip`, `badges`, optional `architecture`, `label_ids`, `trained_on_dataset`, `input_contract`, and `provenance`. Retrieval strategies provide labels, descriptions, availability, required embedding kinds, and unavailability reasons.

The label response provides hierarchy identity and names; display color can be resolved with the existing deterministic label palette (`getLabelColor`) when no explicit label color exists. It does not provide the example instance counts shown in the recording.

The saved policy provides `bindings`, `updated_by`, `created_at`, and `updated_at`.

## Design translation decisions

### 1. Full-width shell without changing other dataset pages

The implemented `DatasetManagementLayout` and `DatasetGalleryHeader` opt-in presentation props hide the dataset-info sidebar and request the compact header variant; existing callers retain current defaults. Phase 6 should refine this shell only where the fresh-build baseline proves a mismatch, without cloning navigation/authentication controls or globally changing other pages.

The existing small-screen message remains the behavior below `lg`. The redesign will adapt within supported desktop widths (approximately 1024–1920px); true mobile support is optional follow-up because the surrounding dataset application currently blocks that viewport.

### 2. Three visual categories over four canonical tasks

The recording's rail has three cards, but the backend has four independent task selectors. Preserve all four selectors and group only the presentation:

- **Interactive segmentation**: aggregates `prompted-segmentation` and `instance-suggestion`; its workspace contains a compact sub-route switcher so each task keeps an independent default, overrides, inputs, coverage, and draft changes.
- **Instance segmentation**: maps to `instance-segmentation`.
- **Cross-image suggestion**: maps to `cross-image-suggestion`.

No save payload may contain a synthetic `interactive-segmentation` task.

### 3. Route coverage based on actual selectors

Let `slotCount = 1 + numberOfLabels` (one task default plus one route per label).

- Overall possible routes: `slotCount × 4`.
- Interactive possible routes: `slotCount × 2`.
- Instance possible routes: `slotCount`.
- Cross-image possible routes: `slotCount`.
- Bound routes: unique draft `(task, label_id)` selectors with a model key.

Unavailable/stale bindings remain counted as configured selectors but receive a visible degraded warning; they must not be presented as healthy. Coverage reads from the draft so the bars react before the global save.

### 4. Inheritance must reflect model compatibility

A label without an explicit override displays **Inherits task default** only when a default binding exists and its selected model is available and applicable to that label. A class-specific default that omits the label is not inherited; show **Unbound — task default does not cover this label** instead. A missing default is also unbound. This avoids the false universal inheritance implied by the concept mockup.

### 5. Modal edits are draft edits, not backend saves

`Configure` and `Bind a model` open a centered dialog. The dialog owns a temporary copy of one route:

- **Save route** validates and commits that route into the panel draft only.
- **Cancel**, close, overlay dismissal (if enabled), and Escape discard modal-local changes.
- **Save routing policy** in the sticky page bar remains the only PUT operation.
- **Clear policy** retains the existing confirmed, immediate DELETE operation and clears draft state on success.

The modal must render the selected model's real contract: concept text when declared, selectable count with backend min/max, retrieval strategy when required, and every dynamic parameter type supported by `DynamicHyperParameter` (select, boolean, bounded slider, number, or text). It must not assume the three example sliders exist.

### 6. Metadata and visual language

- Reuse `bg-app`, `bg-p1`, `bg-p2`, `bg-well`, `border-ln`, `text-t1/t2/t3`, `ac/acS/acLn`, `warn`, and existing purple/review tokens.
- Reuse the existing label palette for hierarchy dots/connectors.
- Show catalog `description`/`usage_tip`, `badges`, `architecture`, `trained_on_dataset`, and provenance only when present and useful.
- Never infer “fast,” “balanced,” “accurate,” model size, quality bars, or instance counts from a model name.
- Preserve light-theme readability even though the recording is dark.

## Acceptance criteria

### Layout and presentation

- The orchestration route uses the available desktop width and no persistent dataset-info sidebar.
- The shared top navigation remains functional and uses its compact page-specific variant.
- The page header contains breadcrumb/context, title, concise description, last-saved metadata when present, and Dataset Management navigation.
- A single route-coverage strip shows overall and category coverage from draft state.
- A three-card task rail controls one workspace; Interactive segmentation exposes both canonical interactive sub-routes.
- The selected workspace shows one task default followed by hierarchical label override rows with deterministic label colors and parent/level context.
- Explicit, inherited, unbound, and stale states are visually distinct without relying on color alone.
- The route dialog and sticky save bar match the density, hierarchy, and proportions of the recording at 1590×952.

### Behavior and data integrity

- Initial label/catalog/policy loading, stale-response cancellation, page errors, and saved metadata continue to work.
- Every draft selector remains one of the four backend task keys and is unique by `(task, label_id)`.
- Model choices retain current task and label compatibility filtering.
- Selecting a model initializes inputs from its actual effective contract.
- Changing a model resets route inputs to the new model's declared defaults.
- Modal Cancel/Escape does not alter the draft; Save route alters only the draft.
- Contract conditioning, strategy, count limits, and all parameter widget types remain editable and correctly typed.
- Backend validation errors from global save remain visible and do not erase the draft.
- Reset restores the last canonical `policy.bindings` and clears the change set.
- Clear policy asks for confirmation, calls the existing DELETE API, and clears policy/draft only on success.
- Global save calls the existing PUT API with `{dataset_id, bindings}`, replaces local policy with the canonical response, and clears dirty state only on success.
- Read-only users can inspect routes and model metadata but cannot mutate draft, save, reset, or clear.
- Existing policy consumers and APIs remain unchanged.

### Accessibility and responsive behavior

- Rail cards, sub-route controls, route actions, and destructive actions are semantic buttons with visible focus.
- The modal has `role="dialog"`, an accessible name, focus entry/return, keyboard-contained focus, Escape close, labelled radio group, and labelled inputs.
- Status is communicated with text/icons as well as color.
- At supported widths, the rail/workspace collapses or stacks without overlap; the modal stays within `calc(100vw - 32px)` and preserves a scrollable body/sticky footer.
- Existing small-screen fallback remains intact below the application support breakpoint.

## Phase map

### Phase 1 — Shell and view-model foundation

Add opt-in full-width/compact layout support and pure orchestration view-model helpers for category grouping, selector keys, coverage, effective inheritance, and draft diffing. Keep existing editor output in place until helper tests pass.

Exit criteria: other dataset pages retain default layout behavior; helper tests prove four-task semantics and class-specific inheritance.

### Phase 2 — Routing desk and task workspace

Refactor `ModelOrchestrationPanel` into the coverage strip, three-card rail, canonical sub-route selector, task-default card, hierarchical override rows, and model route cards. Preserve inline binding logic temporarily only where needed during migration.

Exit criteria: every saved route state is correctly represented and task/category switching has test coverage.

### Phase 3 — Configure-route modal

Move model selection and contract controls into an accessible modal with isolated route-local state and explicit Save route/Cancel semantics. Include stale-route repair and retrieval-strategy controls.

Exit criteria: all model/contract interactions alter only the intended draft selector and no API call occurs from the modal.

### Phase 4 — Sticky save workflow and permission/error states

Replace the current bottom action row with a sticky change bar driven by a real policy-vs-draft diff. Integrate reset, immediate confirmed clear, global save, pending states, status messages, and read-only behavior.

Exit criteria: save/reset/clear failures and successes preserve canonical state correctly and are fully tested.

### Phase 5 — Visual polish, regression, and documentation

Compare the implementation with the recording at its native viewport, tune density/alignment with theme tokens, verify both themes and supported widths, run focused and full frontend checks, and record outcomes in both plan documents.

Exit criteria: visual checklist, automated tests, build, and manual interaction matrix pass with no backend or API-contract changes.

### Phase 6 — Visual convergence and correction pass

Retain the implemented behavior and component boundaries, but rework the page shell, coverage strip, rail, workspace rows, route-card chrome, and save-bar placement to match the target composition. Fix the empty-label copy and saved-empty-policy detection found during screenshot review. Compare target and implementation at the same 1491×798 viewport before evaluating spacing or scale.

Exit criteria: the correction checklist in `model_orchestration_redesign_implementation_details.md` passes; same-viewport screenshots demonstrate the intended hierarchy; focused/full tests and production build remain green.

## Dependencies

- Existing `DatasetManagementLayout`, `DatasetGalleryHeader`, auth controls, and theme tokens.
- Existing label hierarchy response and `getLabelColor` utility.
- Existing model catalog and routing policy endpoints.
- Existing `plannerContractUtils` and `DynamicHyperParameter` contract rendering.
- React Router, Lucide, Tailwind, Vitest, and Testing Library already in the repository.

No new runtime dependency is expected.

## Risks and mitigations

- **Visual grouping could accidentally merge task semantics.** Keep grouping metadata frontend-only and assert exact task keys in tests and save payloads.
- **Class-specific defaults can be misrepresented as inherited.** Centralize and test effective-route resolution against `label_ids`.
- **Modal changes can leak into the draft before confirmation.** Deep-clone the route into modal-local state and commit only from Save route.
- **Dynamic parameter callbacks can be wired with the wrong signature.** Use the component's `(key, value)` callback contract explicitly and test typed values.
- **Coverage can be misleading with duplicate or stale selectors.** Normalize by selector key and expose stale status separately.
- **Changing the shared shell can regress all dataset pages.** Make new layout/header props opt-in with unchanged defaults and add layout tests.
- **The concept includes unavailable metadata.** Render only fields returned by the catalog and allow rows to compact gracefully when fields are absent.
- **Sticky UI can cover content.** Reserve bottom padding equal to bar height and test short viewports/modal scroll.
- **Different screenshot viewports can produce false visual conclusions.** Capture target-equivalent and implementation screenshots at the same 1491×798 viewport before sign-off.
- **A functionally complete phase can be marked visually complete without evidence.** Phase 6 requires side-by-side screenshots and measurable shell/row/modal dimensions in its boundary record.
- **Unsaved route changes can be lost on dataset switch.** Preserve current behavior unless product explicitly requests navigation blocking; document this as optional follow-up rather than silently expanding scope.

## Definition of done

- All acceptance criteria above are met.
- Focused orchestration tests, full frontend tests, and production build pass.
- Manual checks pass for empty policy, partial policy, complete policy, stale model, class-specific default, no labels, read-only user, failed load/save/delete, and dataset switch.
- Visual comparison is completed at the target screenshot's 1491×798 viewport and the recording's 1590×952 viewport, plus 1280px and 1024px supported desktop widths in dark mode; light mode remains legible.
- The global navigation is visible in a fresh production build and contains the existing Back to Datasets, IQUANA, dataset, user, documentation, theme, report-bug, and logout controls.
- Coverage, route rows, and the save bar match the target's composition rather than merely containing the same information.
- `git diff` confirms no backend/API/schema changes and no unrelated frontend changes.
- Phase-boundary evidence is recorded in `model_orchestration_redesign_implementation_details.md`.

## Optional follow-up (not required)

- Warn before leaving the page with an unsaved draft.
- Add true sub-1024px orchestration support if the wider dataset application removes its current small-screen block.
- Add richer catalog metrics only through a separately designed backend contract; do not infer them in the frontend.
