# RFC 0002: Database render continuity and refresh stabilization plan

- Status: Implemented, verified, and installed
- Prepared: 2026-07-24
- Scope: inline database blocks, canonical database workspace, record pages,
  background read state, database-change notifications, and advanced-action
  handoffs
- Related plan:
  [RFC 0001: Database inline stabilization and modularization](./0001-database-inline-stabilization-and-modularization-plan.md)

## 1. Objective

Database interactions must preserve the mounted UI whenever the user is still
looking at the same database source and saved view. Schema revisions, record
revisions, background refreshes, and recoverable server errors are data events;
they are not component identities.

This work removes the remaining paths where a database button can visibly
replace the whole table, reset focus or scroll, discard an open dialog draft,
or open a second workspace that appears to do nothing.

The target behavior is:

1. A same-source, same-view refresh updates component props without changing
   the renderer instance.
2. Schema changes reconcile affected columns and values without remounting the
   entire table.
3. A failed background refresh retains the last compatible result and presents
   a non-blocking recovery message.
4. One committed mutation results in at most one effective in-flight read per
   surface, even when the local completion callback and the collaboration event
   both request a refresh.
5. Advanced actions always show an immediate loading shell and eventually open
   the requested control. Form and dashboard layouts must not produce a ready
   but empty workspace.
6. Regression tests assert DOM identity, focus/scroll continuity, failure
   preservation, and action handoff behavior.

## 2. Confirmed recurrence mechanisms

### RC-01: Schema revisions are used as React identities

The inline renderer, canonical workspace renderers, record-page views, and
multiple dialogs include `schemaRevision` in their React `key`. The server
computes that revision from the complete database definition. A title, property,
view, policy, or unrelated source change therefore changes the key and forces
React to unmount and recreate the current surface.

Consequences include:

- loss of focused cell and edit mode;
- scroll and horizontal position restoration races;
- reset column widths and local component state;
- dismissal or reset of popovers and dialog drafts;
- repeated lazy-renderer fallbacks;
- the appearance that the complete database reloaded.

### RC-02: Refresh failures replace a previously ready surface

The read model uses stale-while-refresh while a request is pending, but its
terminal error path changes the complete state to `error`. A transient 409,
stale-index response, or 5xx after a successful initial load consequently
removes the table and renders the full error state.

### RC-03: Refresh requests have multiple owners

An inline mutation directly increments `refreshKey`. The same commit may emit a
`database-changed` collaboration event that increments it again. Workspace-wide
index notifications refresh all inline database blocks. Each increment aborts
the previous request and starts a new describe/query pair.

### RC-04: Advanced actions load a second database workspace

Select-option configuration, reviewed row actions, bulk actions, and advanced
property management lazy-load `DatabaseTableDialog`. The lazy boundary has no
visible fallback. The nested workspace then performs a separate catalog,
description, and query load before consuming the requested action.

Form and dashboard views intentionally have a `null` query result, while both
the workspace success renderer and initial action consumer currently require a
non-null result. Those layouts can therefore reach `ready` without showing the
workspace content or executing the requested action.

## 3. Invariants

### 3.1 Identity

- Renderer identity is `{databaseId, sourceId, viewId, layoutType}`.
- Record-page identity additionally includes `recordId`.
- Dialog identity is its semantic target, such as `propertyId` or `viewId`.
- Manifest, schema, index, snapshot, and record revisions never appear in a
  React `key`.
- A layout-type change may replace the renderer because it changes the
  component contract; a revision-only change may not.

### 3.2 Read continuity

- Initial load without compatible data may show the full loading or error state.
- Same-surface refresh keeps the last ready description and result visible.
- Recoverable refresh failure sets `refreshing=false`, records a refresh problem,
  and leaves the ready surface mounted.
- A later successful refresh clears the refresh problem.
- Pagination failure keeps all previously loaded pages.
- Switching database, source, view, or presentation mode may use an initial
  loading shell because the semantic surface changed.

### 3.3 Refresh ownership

- `refreshKey` remains an invalidation signal, not a request queue.
- Multiple invalidations in the same browser task coalesce into one generation.
- A collaboration event received while an equivalent local refresh is pending
  must not cause an observable loading reset.
- Workspace-wide events remain correct but are debounced so a burst produces a
  single effective refresh per mounted surface.

### 3.4 Advanced action handoff

- Opening a lazy workspace displays an immediate, labelled loading shell.
- Initial schema/view/filter actions require a ready description, not a query
  result when the action itself does not consume records.
- Form and dashboard workspaces render their view and toolbar when the read model
  is ready with `result=null`.
- Record and bulk actions continue to require a non-null result and expose an
  actionable error if their target cannot be resolved.

## 4. Implementation plan

### Phase A: Stable renderer and overlay identities

1. Introduce shared identity helpers for database renderer, record page, and
   overlay targets.
2. Replace every `key` containing `schemaRevision` in inline, workspace, and
   record-page surfaces.
3. Keep keys only where semantic target replacement is required.
4. Reconcile schema-dependent table state by stable property and record IDs;
   discard only state whose target ID no longer exists.

Completion criteria:

- No production TSX file has a React `key` containing `schemaRevision`,
  `snapshotRevision`, `indexRevision`, or `manifestRevision`.
- Changing only the description revision preserves the exact table DOM node.
- Adding a property preserves table DOM identity and existing cell focus when
  the focused record/property still exists.
- Open settings dialogs keep their draft when an unrelated schema refresh
  arrives.

### Phase B: Last-ready refresh preservation

1. Extend the ready read state with an optional refresh problem.
2. Retain a ref to the most recent ready state for each semantic surface.
3. On a same-surface refresh failure, restore that ready state with a
   non-blocking refresh problem instead of returning `status='error'`.
4. Show compact retry feedback above the existing inline/workspace content.
5. Keep full errors for initial loads or incompatible surface changes.

Completion criteria:

- A 409 or 500 after an initial successful load leaves the grid mounted.
- Rows, focus, selection, and scroll remain visible after the failed refresh.
- Retry succeeds without an intermediate full loading surface.
- An initial 409/500 with no compatible result still renders the full error
  state.

### Phase C: Refresh invalidation coalescing

1. Add a small refresh scheduler hook that merges invalidations occurring in
   the same task and debounces collaboration bursts.
2. Route local mutation completion, manual refresh, database-change events,
   agent-run events, and online recovery through the scheduler.
3. Keep request abort/latest-wins behavior inside the shared read model.
4. Preserve explicit pagination cursor behavior outside the debounce path.

Completion criteria:

- A local commit plus its collaboration notification produces one effective
  describe/query generation after the commit settles.
- Ten workspace index notifications in one burst produce one refresh.
- Manual refresh remains immediate from the user's perspective.
- No invalidation is lost when it arrives during an in-flight request.

### Phase D: Advanced-action loading and null-result layouts

1. Replace `Suspense fallback={null}` for the database workspace with an
   accessible loading panel.
2. Split description-only initial actions from record-result-dependent actions.
3. Allow toolbar and renderer success content when form/dashboard result is
   null.
4. Make invalid select-option targets report a visible problem instead of
   silently returning.
5. Retain the canonical workspace for reviewed and broad operations; do not
   duplicate those safety flows in the inline renderer.

Completion criteria:

- Every advanced button changes visible state on the next paint.
- Properties, options, view manager, filters, and view settings open once after
  description readiness.
- Form and dashboard views render in the workspace without a query result.
- Missing or incompatible action targets produce an error message and recovery
  path rather than a blank workspace.

### Phase E: Verification and installation

1. Add DOM tests for revision-only rerenders and schema-property changes.
2. Add read-model tests for failed same-surface refresh and retry recovery.
3. Add workspace tests for form/dashboard null-result action handoffs.
4. Extend the document-native E2E continuity probe through title/property/view
   schema mutations and a forced refresh error.
5. Run app DOM tests, affected app tests, typecheck, desktop checks, build, and
   local installation.

Completion criteria:

- All new regression tests fail against the pre-change behavior and pass after
  implementation.
- Affected test suites, app typecheck, and `bun run check:desktop` pass.
- The installed `/Applications/SynapseNote.app` renderer chunks match the local
  build artifacts.
- Manual verification confirms that routine and schema-changing actions do not
  replace the current table DOM node.

## 5. Implementation checklist

- [x] Replace revision-derived renderer keys.
  - Done when every production database renderer uses semantic identity only
    and the static revision-key guard passes.
- [x] Replace revision-derived dialog keys.
  - Done when unrelated schema refreshes cannot remount an open dialog.
- [x] Preserve the last ready state on refresh failure.
  - Done when 409 and 500 DOM tests retain the same surface node and expose a
    retryable refresh notice.
- [x] Coalesce refresh invalidations.
  - Done when local-commit/broadcast and event-burst tests each observe one
    effective generation.
- [x] Add a visible advanced-workspace lazy fallback.
  - Done when the user sees an accessible loading status immediately after the
    triggering click.
- [x] Remove the non-null query-result gate from description-only actions.
  - Done when properties/view/filter controls open on form and dashboard views.
- [x] Render form and dashboard workspace success states with `result=null`.
  - Done when both layouts render their toolbar and view instead of blank
    content.
- [x] Report invalid initial action targets.
  - Done when an invalid select property produces a visible recoverable problem.
- [x] Add render-continuity regression coverage.
  - Done when revision, schema mutation, failed refresh, and advanced-action
    scenarios assert DOM identity and pass.
- [x] Complete desktop verification and installation.
  - Done when required checks pass and the installed application matches the
    verified build.

## 6. Rollback and risk control

- Stable keys may expose child components that incorrectly assume they mount
  once. Each affected renderer must be rerendered with changed source/view props
  in tests; local reconciliation replaces forced remounting where necessary.
- Preserving stale data must not hide failures. Refresh problems remain visible
  and retryable, while initial or incompatible errors remain blocking.
- Debouncing must not suppress the final invalidation. The scheduler increments
  a generation after the quiet window and queues another generation if an event
  arrives while flushing.
- Null-result layout support must not allow record actions without records.
  Description-only and record-dependent handoffs remain separately guarded.

## 7. Implementation result and verification evidence

Implementation and local installation completed on 2026-07-24.

### 7.1 Result by phase

- Phase A removed mutable revision tokens from renderer, record-page, and dialog
  keys. Mounted table state now reconciles editing, menu, selection, and focus
  targets by stable property and record IDs, discarding only targets that no
  longer exist.
- Phase B added a last-ready state per semantic database surface. A failed
  background refresh now leaves the compatible surface mounted and exposes a
  retryable, non-blocking problem. Initial failures without compatible data
  remain blocking.
- Phase C introduced one refresh scheduler for local completions and
  collaboration notifications. Burst invalidations share a quiet window,
  while explicit user refresh remains immediate.
- Phase D added an accessible lazy-workspace loading shell, separated
  description-only initial actions from record-dependent actions, permitted
  form/dashboard success rendering with `result=null`, and converted invalid
  action targets from silent returns into visible recoverable errors.
- Phase E added static key enforcement, DOM identity/focus assertions,
  refresh-error preservation tests, a ten-event coalescing test, null-result
  action tests, and document-native E2E continuity checks.

### 7.2 Verification record

| Verification | Result | Completion evidence |
| --- | --- | --- |
| Revision-derived React key guard | Passed | 1 test, 0 failures; production TSX keys reject schema, snapshot, index, and manifest revisions |
| Affected database DOM suites | Passed | 138 tests, 0 failures; includes table identity/focus, 409 preservation, form handoff, and ten-event coalescing |
| App TypeScript check | Passed | `tsc --noEmit` exited 0 |
| Document-native continuity E2E | Passed | Saved-view creation and rename preserve the exact inline surface after the final scheduler implementation |
| Desktop check | Passed | 2,495 tests passed, 2 skipped, 0 failures; all 7 tasks successful |
| Local desktop workflow check | Passed | 7 tests, 0 failures; desktop typecheck exited 0 |
| Desktop build and install | Passed | Local package signed, ASAR integrity verified, installed at `/Applications/SynapseNote.app`, and relaunched |
| Installed artifact comparison | Passed | Local and installed `app.asar` have identical size and SHA-256 `0cc5cf79257c40cd5b69e9dfed75d20b5658d66edd7b1717038d36d814fee37b` |
| Installed signature | Passed | `codesign --verify --deep --strict` reports a valid on-disk bundle satisfying its designated requirement |

The broader app-wide unit command was also sampled during implementation. It
still reports pre-existing failures in unrelated PropertyPanel expectations and
DOM-environment test setup. The affected database suites, production build,
desktop verification, and installed artifact checks above all pass.
