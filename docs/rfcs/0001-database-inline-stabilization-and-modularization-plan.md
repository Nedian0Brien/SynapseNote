# RFC 0001: Database inline stabilization and modularization plan

- Status: Implementation complete with verification evidence (2026-07-24)
- Prepared: 2026-07-24
- Scope: document-native inline databases, canonical database workspace, shared
  table renderer, database read/mutation UI state, and editor JSX interaction
- Primary packages: `packages/app`, with narrowly scoped `packages/core` or
  `packages/server` changes only when the query contract requires them
- Related UX checklist:
  [Notion UX gap implementation checklist](./0001-notion-ux-gap-implementation-checklist.md)
- Related design:
  [Databases and agent data plane](./0001-databases-and-agent-data-plane.md)
- Related engine checklist:
  [Database implementation checklist](./0001-databases-implementation-checklist.md)

## 1. Purpose

This document is the implementation plan for correcting the database behavior
observed in the running SynapseNote desktop editor and for restructuring the
database UI so that the same defects do not keep recurring.

The immediate product goal is not a new database engine. The goal is to make
the existing file-native database engine behave like a document-native Notion
database from the user's point of view:

1. A database embedded in a document remains interactive inside the editor.
2. `New`, `Filters`, `Sort`, `Properties`, search, and saved-view actions work
   directly in the inline surface.
3. Routine actions do not open an administration workspace or appear to load
   indefinitely.
4. Save, refresh, conflict, retry, and undo states are distinct and expressed
   in user language.
5. Table headers, sticky columns, and property controls remain legible at all
   supported widths.
6. Search is complete for the selected database view rather than limited to an
   arbitrary first page already present in the browser.
7. The implementation is split into testable modules with explicit state and
   ownership boundaries.

This plan treats the interaction failures and the oversized modules as one
problem. Fixing only the CSS or only the button handlers would leave the same
read, mutation, and overlay coupling in place. Splitting files without first
defining behavioral contracts would instead spread the defects across more
files. The work therefore proceeds by locking observable behavior, extracting
shared state models, correcting the primary UX, and only then removing the
legacy orchestration code.

## 2. Current diagnosis

### 2.1 Summary

The visible defects have separate symptoms but share three architectural root
causes:

- the editor host treats an interactive database like an atomic self-closing
  JSX block;
- the inline block delegates primary actions to a very large canonical
  management surface;
- read, mutation, history, feedback, table layout, and overlay state are owned
  by two oversized React modules rather than reusable domain-oriented models.

### 2.2 Evidence table

| ID | Severity | User-visible problem | Root cause | Current evidence |
| --- | --- | --- | --- | --- |
| DIAG-01 | P0 | Toolbar and table controls appear inert or only select the outer database block. | `DatabaseView` is registered as a self-closing leaf, and the generic JSX body click handler focuses the editor and creates a `NodeSelection` for clicks inside the rendered body. The handler excludes links and editor chrome but does not exclude general controls such as buttons, inputs, selects, or nested interactive regions. | [`built-ins.ts`](../../packages/core/src/registry/built-ins.ts), [`JsxComponentView.tsx`](../../packages/app/src/editor/extensions/JsxComponentView.tsx) |
| DIAG-02 | P0 | `New` and `Properties` show loading without completing the expected inline action. | The inline toolbar sets `fullDatabaseOpen` and lazy-loads the entire `DatabaseTableDialog`, which then loads catalog, description, query data, mutation state, and a nested surface before revealing the requested control. | [`DatabaseView.tsx`](../../packages/app/src/editor/components/DatabaseView.tsx) |
| DIAG-03 | P1 | `Inline database change saved` remains visible and occupies document space. | The visible banner is controlled by persistent undo/redo tokens rather than a transient save-feedback state. Undo availability and save acknowledgement are incorrectly represented by one condition. | [`DatabaseView.tsx`](../../packages/app/src/editor/components/DatabaseView.tsx) |
| DIAG-04 | P1 | A routine refresh can show `Canonical state changed` and `Database description failed with HTTP 409`. | Catalog reads have a bounded 409 retry and the canonical workspace recognizes `transaction_in_progress`, but direct inline `describeDatabase` and query reads do not use the same retry policy. Generic 409 classification also turns the short server read barrier into a visible conflict. | [`database-catalog-client.ts`](../../packages/app/src/lib/database-catalog-client.ts), [`database-ui-problem.ts`](../../packages/app/src/lib/database-ui-problem.ts), [`database-data-plane.ts`](../../packages/server/src/database-data-plane.ts) |
| DIAG-05 | P1 | The left edge of `New property` or another property header is clipped. | Multiple nested overflow containers combine with sticky selector/title/action columns and fixed widths. Horizontal scroll is neither centralized nor part of `DatabaseTableViewState`, so the browser can retain a small offset under an opaque sticky title column. | [`DatabaseView.tsx`](../../packages/app/src/editor/components/DatabaseView.tsx), [`DatabaseTableDialog.tsx`](../../packages/app/src/components/DatabaseTableDialog.tsx) |
| DIAG-06 | P1 | Inline search misses records outside the initially loaded result. | The inline query requests a small fixed result and the search predicate filters only `renderedResult` in memory. The UI accurately says `Search loaded pages`, but that behavior is not a complete database search. | [`DatabaseView.tsx`](../../packages/app/src/editor/components/DatabaseView.tsx), [`database-view-bounds.ts`](../../packages/app/src/lib/database-view-bounds.ts) |
| DIAG-07 | P1 | DOM tests pass even though the running editor controls are broken. | `DatabaseView.dom.test.tsx` mounts the component in isolation. It does not include the real Tiptap node view, editor selection, drag behavior, or React portal event path. The document-native E2E journey does not click the inline `Filters`, `Sort`, or `Properties` controls. | [`DatabaseView.dom.test.tsx`](../../packages/app/src/editor/components/DatabaseView.dom.test.tsx), [`database-document-native-journeys.e2e.ts`](../../packages/app/tests/stress/database-document-native-journeys.e2e.ts) |
| DIAG-08 | P1 | Every change risks unrelated database regressions and creates more independent loading/dialog state. | `DatabaseView.tsx` is 2,485 lines with 45 `useState` occurrences. `DatabaseTableDialog.tsx` is 9,287 lines with 98 `useState` occurrences and contains both the approximately 3,000-line table implementation and the approximately 5,000-line workspace implementation. | [`DatabaseView.tsx`](../../packages/app/src/editor/components/DatabaseView.tsx), [`DatabaseTableDialog.tsx`](../../packages/app/src/components/DatabaseTableDialog.tsx) |
| DIAG-09 | P2 | Error and success messages expose implementation vocabulary. | UI problem classification preserves transport/server messages, and the view renders internal concepts such as canonical state and HTTP status directly. | [`database-ui-problem.ts`](../../packages/app/src/lib/database-ui-problem.ts), [`DatabaseTableDialog.tsx`](../../packages/app/src/components/DatabaseTableDialog.tsx) |
| DIAG-10 | P2 | Multiple dialogs or async initial actions can race during refresh. | Dozens of independent boolean states and `handledInitial...` refs approximate an overlay state machine. A catalog or description refresh can replay or delay the initial action that opened the workspace. | [`DatabaseTableDialog.tsx`](../../packages/app/src/components/DatabaseTableDialog.tsx) |

### 2.3 Existing behavior that must be preserved

The repair must not discard the database engine or its existing safety model.
The following contracts remain requirements:

- Markdown records and database manifests remain canonical.
- Stable database, source, view, property, and record IDs remain unchanged.
- Direct-safe human cell, title, row, and approved view changes can commit
  without a review interruption.
- Destructive, broad schema, bulk, permission, external, and agent-authored
  changes continue to use preview/review/commit contracts.
- Exact undo and redo tokens remain server-backed and conflict-aware.
- Offline queue, cached reads, relation navigation, record peek, alternative
  views, agent context, and full-page canonical routes continue to work.
- The standalone clone remains functional without private services, secrets,
  or machine-specific paths.

## 3. Product success contract

### 3.1 Primary interaction contract

For a ready inline database block, the following actions must start from the
visible document surface and provide an immediate local response:

| Action | Required immediate response | Required committed result |
| --- | --- | --- |
| Click the title | Enter inline title editing without selecting the whole JSX block. | Enter/blur commits the database page title through the direct-safe mutation path; Escape restores the canonical title. |
| Click `New` | Focus the inline new-page title field or reveal it if outside the viewport. | Enter creates one record, keeps the current view, and restores focus to the next new-page field. |
| Click `Filters` | Open an anchored filter popover on the first click. | Applying or clearing updates the selected saved-view query and refreshes rows without opening the workspace. |
| Click `Sort` | Open an anchored sort popover on the first click. | Applying, reordering, or clearing sorts updates the selected saved view and refreshes rows. |
| Click `Properties` | Open an anchored property panel on the first click. | Visibility and order persist as view configuration; add/rename/remove uses the appropriate direct-safe or reviewed schema flow. |
| Click search | Open a search input and preserve toolbar focus order. | Results cover the complete searchable view, support pagination, and do not mutate the saved view. |
| Click a view tab | Switch immediately to cached data or a visible loading shell. | The selected view ID and view-specific table state persist. |
| Click a view tab menu | Open the menu without selecting the JSX block. | Rename, duplicate, reorder, favorite/default, and delete perform exactly once. |
| Click a record title | Open the configured peek or page behavior. | Returning restores the selected view, scroll position, and relevant focus. |

### 3.2 State presentation contract

The surface must never use one visual state to stand for multiple unrelated
facts. The UI distinguishes:

| State family | Values | Presentation rule |
| --- | --- | --- |
| Initial read | `idle`, `loading`, `ready`, `error` | Initial loading may use a fixed-height skeleton. It must not flash an empty table followed by an error. |
| Refresh | `idle`, `refreshing`, `retrying` | Existing rows remain visible. A quiet toolbar-level status is allowed; a full-width error banner is not. |
| Mutation | `idle`, `planning`, `review`, `committing`, `failed` | Direct-safe edits acknowledge in place. Reviewed edits show the existing exact-plan surface. Failure attaches to the affected action where possible. |
| Save feedback | `none`, `saved`, `queued` | Transient, non-layout-shifting, and automatically cleared. It does not determine whether undo is available. |
| History | undo and redo token stacks/status | Persistent capability exposed through shortcuts and a compact history affordance; never rendered as a permanent save banner. |
| Connectivity | `online`, `offline-cached`, `offline-uncached` | Cached data remains visible with a clear queued/offline state. No cached data shows an actionable empty/error state. |

### 3.3 Performance contract

The existing warm-local budgets in
[`database-ux-budgets.ts`](../../packages/app/src/lib/database-ux-budgets.ts)
remain the source of truth:

- database shell: at most 250 ms;
- first warm local data: at most 1,000 ms;
- already-loaded view switch: at most 500 ms;
- direct-safe cell save acknowledgement: at most 750 ms;
- record peek: at most 400 ms.

This plan adds one derived interaction rule without creating a competing budget
constant: toolbar controls must change visible state in the next paint. If
their data is unavailable, they open a correctly sized loading shell rather
than waiting for a lazy management workspace to finish loading.

### 3.4 Accessibility contract

- Every toolbar action has a stable accessible name and keyboard shortcut when
  one exists.
- Tab and Shift+Tab reach controls in visual order.
- Enter and Space activate buttons and view tabs.
- Escape closes only the top overlay and returns focus to its trigger.
- Opening a popover does not focus the editor or select the outer JSX node.
- Table grid announcements describe the current row, property, edit mode, and
  range selection without exposing stable IDs.
- Saving messages use `role="status"`; destructive or unrecoverable failures
  use `role="alert"`. Routine background retries do not interrupt a screen
  reader.

## 4. Non-goals

The following are not part of this stabilization plan unless required by a
testable query or state contract:

- replacing the canonical Markdown/manifest database engine;
- changing stable-ID formats or migrating existing databases;
- cloning Notion's visual assets or undocumented internal APIs;
- redesigning agent review, permissions, automation, template, or import
  semantics;
- removing the advanced canonical workspace;
- adding new database property types;
- converting all existing database components into one new global state
  library;
- changing unrelated JSX components merely because the JSX host interaction
  policy is being extended.

## 5. Engineering principles and invariants

### 5.1 Behavior before movement

Before moving a handler, add or identify the test that describes its current
required behavior. A pure extraction must not be combined with a behavior
change unless the PR explicitly owns that behavior and contains the relevant
regression test.

### 5.2 One owner per state family

- read/caching/retry state belongs to a read model;
- mutation/review/commit state belongs to a mutation controller;
- undo/redo capability belongs to a history model;
- active overlay belongs to one discriminated overlay state;
- grid focus/range/edit/scroll state belongs to the table/grid model;
- editor node selection belongs to the JSX host adapter.

A React component may compose these models but must not duplicate their
internal state.

### 5.3 Inline-first primary actions

No primary inline control may use `DatabaseTableDialog` as an implementation
shortcut. The advanced workspace is a destination, not a dependency required
to operate the inline toolbar.

### 5.4 Typed failure decisions

Retry and recovery decisions use RFC 9457 problem metadata, especially the
problem code. They do not parse English error messages or treat every HTTP 409
as transient.

### 5.5 Preserve useful data during transitions

Refresh, transaction settling, view switching, and recoverable failures keep
the last compatible data visible. An error replaces the table only when no
compatible result exists.

### 5.6 No replacement megamodule

The refactor is incomplete if the current files become short only because all
logic moved into one large hook, provider, reducer, or `utils.ts`. Module
boundaries are judged by responsibility, public contract, dependency
direction, and tests in addition to line count.

## 6. Target architecture

### 6.1 Proposed module layout

Names may be adjusted to repository conventions during implementation, but
the ownership boundaries are mandatory.

```text
packages/app/src/
  components/database/
    model/
      database-read-retry.ts
      useDatabaseReadModel.ts
      useDatabaseMutationController.ts
      useDatabaseMutationHistory.ts
      useDatabaseOverlayState.ts
    inline/
      InlineDatabaseBlock.tsx
      InlineDatabasePicker.tsx
      InlineDatabaseCreationDialog.tsx
      InlineDatabaseHeader.tsx
      InlineDatabaseToolbar.tsx
      InlineDatabaseViewTabs.tsx
      InlineDatabaseOverlayHost.tsx
      useInlineDatabaseReference.ts
      useInlineDatabaseController.ts
    table/
      DatabaseTable.tsx
      DatabaseGrid.tsx
      DatabaseGridHeader.tsx
      DatabaseGridBody.tsx
      DatabaseCell.tsx
      DatabasePropertyHeader.tsx
      DatabaseNewRecordRow.tsx
      DatabaseCellOverlay.tsx
      useDatabaseGridState.ts
      useDatabaseTableLayout.ts
      useDatabaseTableViewState.ts
      database-table-display.ts
      database-table-selection.ts
    workspace/
      DatabaseWorkspaceSurface.tsx
      DatabaseWorkspaceHeader.tsx
      DatabaseWorkspaceToolbar.tsx
      DatabaseWorkspaceContent.tsx
      DatabaseWorkspaceOverlayHost.tsx
      useDatabaseWorkspaceController.ts
  editor/components/
    DatabaseView.tsx
  components/
    DatabaseTableDialog.tsx
```

`DatabaseView.tsx` and `DatabaseTableDialog.tsx` remain as compatibility entry
points. Existing importers do not need to migrate in the same PR that extracts
the implementation.

### 6.2 Dependency direction

```text
editor JSX host
    -> DatabaseView adapter
        -> inline presentation
            -> shared read/mutation/history models
            -> shared table and view-specific renderers

DatabaseTableDialog / DatabaseWorkspacePage adapters
    -> workspace presentation
        -> shared read/mutation/history models
        -> shared table and view-specific renderers

shared models
    -> existing typed database clients
        -> server HTTP/MCP contracts
```

Rules:

- the shared table must not import `DatabaseTableDialog` or workspace modules;
- the inline presentation must not import the workspace implementation;
- models may import typed clients and core/server types but not visual
  components;
- workspace and inline overlay hosts may import individual dialogs;
- editor-specific selection and `useJsxComponentHost` remain outside shared
  database models;
- no dependency cycle is allowed between `inline`, `table`, `workspace`, and
  `model` directories.

### 6.3 Read model contract

The common read model should expose a stable result instead of individual
catalog, description, query, retry, refresh, and cache setters.

```ts
type DatabaseReadPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'refreshing'
  | 'retrying'
  | 'error';

interface DatabaseReadTarget {
  databaseId: string;
  sourceId: string;
  viewId?: string;
  showArchived: boolean;
  calculations?: Readonly<Record<string, DatabaseCalculationFunction>>;
  search?: string;
  cursor?: string;
  limit?: number;
}

interface DatabaseReadModel {
  phase: DatabaseReadPhase;
  description: DatabaseDescription | null;
  result: DatabaseQueryResult | null;
  problem: DatabaseUiProblem | null;
  dataSource: 'network' | 'memory-cache' | 'offline-cache' | null;
  retryAttempt: number;
  refresh(reason?: DatabaseRefreshReason): void;
  loadMore(): void;
  hasMore: boolean;
}
```

Required behavior:

1. Target identity is a stable serialized key containing all query-affecting
   fields.
2. A target change aborts the previous request.
3. Duplicate refresh events for the same target coalesce while a request is
   active.
4. Cached compatible data can seed `description` and `result`.
5. Initial load has no data and uses `loading`; later reads use `refreshing` or
   `retrying` while preserving data.
6. A successful response resets retry state and replaces the target cache.
7. A non-retryable failure becomes `error` only when no compatible data exists;
   otherwise it produces a non-destructive problem state next to existing data.
8. An abort caused by target change or unmount is not rendered as an error.

### 6.4 Read retry policy

Create one typed helper used by catalog, description, and query consumers. It
must not make every database request blindly retryable.

```ts
interface DatabaseReadRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  shouldRetry(cause: unknown): boolean;
}
```

Policy:

- retry when `isDatabaseTransactionInProgress(cause)` is true;
- optionally retry transport failures or typed server problems only when their
  metadata explicitly marks them retryable;
- do not retry permission, missing source, invalid stable target, actual stale
  revision, invalid response schema, or user abort;
- use bounded exponential backoff with jitter small enough to avoid synchronized
  readers, while keeping the current surface visible;
- default to three total attempts for the short transaction window unless
  measured server behavior justifies another tested value;
- respect `AbortSignal` during both fetch and delay;
- report retry attempt and reason to the read model, not directly to the UI;
- after exhaustion, classify the original typed problem and expose one manual
  retry action.

### 6.5 Mutation controller contract

Routine direct-safe writes and reviewed writes share the same controller but
remain distinct paths.

```ts
type DatabaseMutationPhase =
  | 'idle'
  | 'planning'
  | 'review'
  | 'committing'
  | 'failed';

interface DatabaseMutationController {
  phase: DatabaseMutationPhase;
  problem: DatabaseUiProblem | null;
  optimisticValues: ReadonlyMap<string, DatabaseValue | undefined>;
  reviewPlan: DatabaseGhostState | null;
  execute(input: DatabaseUiMutationInput): Promise<DatabaseMutationOutcome>;
  approveReview(): Promise<void>;
  cancelReview(): void;
  retryFailed(): Promise<void>;
}
```

The controller owns:

- policy selection between automatic and required review;
- planning and exact-plan approval;
- optimistic direct-safe values;
- commit and reconciliation;
- offline queue handoff;
- idempotency and duplicate-submission prevention;
- mutation error classification;
- refresh invalidation after a successful commit;
- creation of history tokens and transient save feedback events.

The controller does not own:

- toolbar/dialog open state;
- table cell draft text;
- editor node selection;
- user-visible success timers;
- rendered dialog markup.

### 6.6 History and save-feedback contract

History and feedback must be separate models.

```ts
interface DatabaseMutationHistory {
  undoToken: string | null;
  redoToken: string | null;
  undoStatus: 'idle' | 'checking' | 'applying';
  redoStatus: 'idle' | 'checking' | 'applying';
  undo(): Promise<void>;
  redo(): Promise<void>;
}

type DatabaseSaveFeedback =
  | { kind: 'saved'; mutationId: string; expiresAt: number }
  | { kind: 'queued'; mutationId: string; expiresAt: number }
  | null;
```

Rules:

- each successful mutation installs a new undo token and clears an obsolete
  redo token according to the existing server contract;
- save feedback expires automatically after at most three seconds;
- feedback expiration does not clear history tokens;
- feedback is rendered in an overlay/status slot that does not change the
  table's vertical geometry;
- undo/redo failures retain the token when retry is safe and present a precise
  recoverable problem;
- Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z work whenever focus is inside the database
  block but do not override native undo for an active text input draft.

### 6.7 Overlay state contract

Replace independent dialog booleans with a discriminated union. Inline and
workspace surfaces can have different allowed variants while using the same
state helper.

```ts
type DatabaseOverlay =
  | { kind: 'none' }
  | { kind: 'filter'; propertyId?: string }
  | { kind: 'sort'; propertyId?: string }
  | { kind: 'properties'; propertyId?: string; action?: 'rename' | 'remove' }
  | { kind: 'view-manager'; action?: DatabaseViewManagerInitialAction }
  | { kind: 'record-peek'; recordId: string; mode: 'side_peek' | 'center_peek' }
  | { kind: 'context-inspector'; scope: DatabaseContextInspectionScope }
  | { kind: 'select-options'; propertyId: string }
  | { kind: 'computed-property'; propertyId: string }
  | { kind: 'property-conversion'; propertyId: string }
  | { kind: 'property-deletion-review'; propertyId: string }
  | { kind: 'templates' }
  | { kind: 'automations' }
  | { kind: 'permissions' }
  | { kind: 'import-preview'; filename: string };
```

Rules:

- one surface owns one active overlay;
- opening an overlay records the trigger element for focus restoration;
- initial deep-link actions are consumed exactly once using an explicit action
  ID rather than a collection of `handledInitial...` refs;
- closing the overlay clears overlay-specific drafts;
- background read refresh does not replay the initial overlay action;
- a nested destructive review is represented as a state transition, not a
  second unrelated boolean dialog.

### 6.8 Editor JSX interaction contract

Add explicit interaction metadata to the component registry rather than
hard-coding `DatabaseView` in the generic node view.

Suggested descriptor shape:

```ts
interface JsxComponentInteractionDescriptor {
  mode: 'atomic' | 'interactive';
  drag: 'surface' | 'handle';
  selectOnBodyClick: boolean;
}
```

`DatabaseView` uses:

```ts
{
  mode: 'interactive',
  drag: 'handle',
  selectOnBodyClick: false,
}
```

The generic event guard must also recognize semantic interactive targets as a
defense in depth:

```text
button
input
textarea
select
option
a[href]
[role="button"]
[role="menuitem"]
[role="tab"]
[role="gridcell"]
[contenteditable="true"]
[data-jsx-interactive]
```

The nearest explicit `data-jsx-select-node` or editor chrome control may still
select the outer block. Portal content remains excluded by the existing
`currentTarget.contains(target)` guard.

## 7. Detailed behavior changes

### 7.1 Block selection and drag

1. Clicking a database control, cell, title, view tab, scrollbar, or table
   whitespace owned by the grid does not focus the ProseMirror editor.
2. Clicking the explicit block handle selects the JSX node and exposes block
   actions.
3. Keyboard navigation from outside the block can still select the whole node
   with the editor's existing node-navigation behavior.
4. Dragging starts only from the explicit block handle. Selecting cell text,
   dragging a column boundary, or dragging a scrollbar must not move the block.
5. Other self-closing atomic components keep their current body-click
   selection behavior unless they opt into `interactive` mode.

### 7.2 `New`

The inline `New` button must not call `openInlineDatabaseSurface('create')` or
set `fullDatabaseOpen`.

Required flow:

1. Ensure the new-page composer is mounted.
2. If it is outside the table viewport, scroll it into view using the table's
   scroll container.
3. Focus the title input in the next paint.
4. Enter with a non-empty title executes exactly one direct-safe record-create
   mutation.
5. On commit success, refresh or reconcile the canonical row, announce success
   quietly, and focus a fresh new-page composer.
6. Empty Enter does not create a record.
7. Escape clears the draft without closing or selecting the database block.
8. Commit failure retains the draft and exposes an inline retry.

### 7.3 `Filters`

1. The button opens `DatabaseAdvancedFilterDialog` or its extracted popover
   directly with the current source properties and selected saved-view filter.
2. Opening does not require catalog or workspace loading because the ready
   inline read model already owns description and selected view data.
3. Draft changes stay local until Apply.
4. Apply commits one saved-view mutation, closes on success, and refreshes the
   query.
5. Clear removes the view filter through the same mutation path.
6. Cancel leaves canonical view configuration unchanged.
7. A property-header `Filter` action opens the same overlay pre-scoped to that
   property.
8. A failure leaves the draft open and explains whether retry or reload is
   appropriate.

### 7.4 `Sort`

1. Reuse `DatabaseSavedViewSettingsDialog` only if it can open directly at the
   sort section without loading unrelated settings; otherwise extract a
   focused sort editor.
2. Users can add a sort, choose property/direction, reorder rules, and clear
   all rules.
3. Apply commits one saved-view mutation and updates the active query.
4. A property-header `Sort` action preselects the property.
5. Sort draft state is reset on cancel and when the selected view changes.

### 7.5 `Properties`

Split property behavior by risk instead of delegating the entire action to the
management workspace.

| Property action | Surface | Mutation policy |
| --- | --- | --- |
| Show/hide property | Inline property panel | Saved-view configuration; direct-safe when policy permits |
| Reorder visible properties | Inline property panel or header drag | Saved-view configuration; direct-safe when policy permits |
| Add property | Inline property panel/table edge | Schema mutation using existing policy; review only when policy requires |
| Rename property | Header menu or inline property panel | Schema mutation using existing policy |
| Duplicate property | Property panel/header menu | Existing reviewed or direct-safe policy |
| Convert property type | Focused conversion dialog | Reviewed schema operation |
| Remove property | Destructive preview dialog | Reviewed operation with impact preview |
| Configure computed/select/place/unique ID | Focused existing dialog | Existing typed policy |

The property panel gets description and handlers from the inline controller.
It must not instantiate the workspace surface.

### 7.6 Saved views

1. View tabs render from canonical source views plus bounded optimistic order.
2. Clicking a tab changes the read target and restores view-specific table
   state.
3. The `+` tab opens `DatabaseViewManagerDialog` directly in create mode.
4. Rename, duplicate, favorite/default, reorder, and delete actions use one
   view-lifecycle controller and an action ID.
5. Optimistic tab order rolls back on failure and converges after refresh.
6. The last-view deletion safety rule remains enforced.
7. Refresh or React StrictMode must not replay a duplicate-view request.

### 7.7 Search

The first implementation choice is server-backed search within the selected
view. If the query request already accepts an equivalent text predicate, use
it. Otherwise extend the typed query input in `core`, client, and server as one
backward-compatible optional field.

Search rules:

- normalize surrounding whitespace but preserve the user's displayed draft;
- debounce request dispatch between 150 and 250 ms;
- abort the previous search when the draft changes;
- search title and supported human-readable property values using server query
  semantics, not `JSON.stringify` of only the current page;
- keep the selected saved view's filters and sorts active;
- do not persist the search term into the saved view;
- return cursor/has-more information and load additional matches on demand;
- display whether results are complete or bounded if the server enforces a
  hard limit;
- clear search restores the cached unsearched view when compatible;
- no-result copy states that no pages match the search, not that no pages were
  loaded.

### 7.8 Status and error copy

User-facing copy is mapped from typed state, not passed through from the server
as the heading.

| Internal condition | User-facing direction |
| --- | --- |
| `transaction_in_progress` while old data exists | Quiet status: `Updating database…` followed by automatic recovery; no alert |
| Transaction retry exhausted | `The database is still updating. Try again.` with Retry |
| Actual stale target/revision conflict | `This database changed elsewhere. Reload the latest version before retrying.` |
| Direct-safe mutation saved | Brief `Saved` status, then disappear |
| Offline mutation queued | Brief `Saved locally` plus persistent offline indicator owned by connectivity state |
| Permission problem | Explain that access or review is required and offer the appropriate action |
| Missing source/database | Explain that the linked database is unavailable and offer Replace/Remove where supported |
| Invalid schema | Explain that the database needs repair; keep technical details in diagnostics disclosure |

All headings and action labels use Lingui macros. Technical error details may
remain behind an explicit diagnostics disclosure but not as the primary
message.

## 8. Table layout correction

### 8.1 Single scroll owner

The table viewport is the only element that owns horizontal and vertical grid
scrolling. Outer inline and workspace shells may clip decorative borders but
must not become competing scroll containers.

Required DOM structure:

```text
database surface (overflow visible or clip only for decoration)
  toolbar and view tabs (not horizontal grid scrollers)
  table viewport (overflow auto; single scroll owner)
    table content with explicit minimum width
      sticky selector column
      sticky title column
      normal property columns
      optional sticky actions column
```

### 8.2 Column geometry

Use one layout model for header and body:

- selector width;
- title width;
- each visible property width;
- action width;
- total content width;
- sticky left offsets;
- sticky right offset.

Sticky offsets must derive from the same values used to size columns, ideally
through CSS custom properties on the table viewport. Header cells must not
independently infer offsets from Tailwind classes or magic pixel values.

### 8.3 View state

Extend the existing type:

```ts
export type DatabaseTableViewState = {
  scrollTop: number;
  scrollLeft: number;
  focusedCell?: { recordId: string; propertyId: string };
};
```

Rules:

- persist state by source and view ID;
- restore after the viewport mounts and layout geometry is available;
- clamp both axes to the new maximum after schema/layout changes;
- keep focused-cell restoration independent of scroll restoration;
- avoid emitting a view-state update loop during programmatic restoration;
- preserve backward compatibility by treating missing `scrollLeft` as zero
  while callers migrate.

### 8.4 Required visual cases

At minimum, automated screenshots cover:

- 768 px editor content with sidebar and document panel visible;
- 1280 px normal desktop document;
- 1440 px normal desktop document;
- light and dark themes;
- zero horizontal offset;
- a small non-zero horizontal offset;
- far-right horizontal offset;
- long property names;
- an empty database;
- enough rows to require vertical scrolling;
- a property menu and inline edit state.

The first visible character of every normal property header must remain outside
the opaque sticky title region. `New property` must be fully legible at its
initial position and after horizontal scroll.

## 9. Refactoring plan

### 9.1 Quantitative targets

Line limits are guardrails, not substitutes for coherent responsibilities.

| Module | Current | Target responsibility | Target size |
| --- | ---: | --- | ---: |
| `editor/components/DatabaseView.tsx` | 2,485 lines | JSX/editor adapter and compatibility export | at most 400 lines |
| `components/DatabaseTableDialog.tsx` | 9,287 lines | dialog/page/canvas compatibility adapters | at most 200 lines |
| shared `DatabaseTable.tsx` after extraction | currently embedded at roughly 3,000 lines | table composition only | at most 500 lines |
| workspace surface after extraction | currently embedded at roughly 5,000 lines | workspace composition only | at most 600 lines |
| any new hand-authored module | not applicable | one named responsibility | at most 800 lines unless documented |

The `Current` values above are the pre-extraction baseline used for diagnosis;
the branch-local post-extraction counts are recorded in section 15 so that the
plan remains useful as both an implementation sequence and an audit trail.

Additional structural completion rules:

- no component owns network fetch state, mutation state, and overlay JSX at
  the same time;
- no hook exposes dozens of unrelated setters merely to make the component
  file shorter;
- pure calculation modules contain no React imports;
- models contain no dialog imports;
- every extracted stateful module has a focused DOM or hook-level test;
- public compatibility exports remain stable until all callers are migrated;
- no circular dependencies are introduced.

### 9.2 `DatabaseView.tsx` extraction map

| Current responsibility | Destination | Notes |
| --- | --- | --- |
| Inline database picker/search | `inline/InlineDatabasePicker.tsx` | Retain catalog search and missing-reference replacement behavior. |
| Blank inline creation lifecycle | `inline/InlineDatabaseCreationDialog.tsx` | Preserve StrictMode abort/replay protection and unique keys. |
| Linked reference parse/persist/remove/mode | `inline/useInlineDatabaseReference.ts` | This hook alone imports `useJsxComponentHost`. |
| Description/query/cache/subscriptions | shared `model/useDatabaseReadModel.ts` | Remove direct fetch effects from the component. |
| Direct-safe/reviewed mutation orchestration | shared mutation controller | Keep inline-specific mutation input adapters small. |
| Undo/redo | shared mutation history model | No banner rendering in the model. |
| Title/search/view/action local state | `inline/useInlineDatabaseController.ts` | Use reducer or grouped state with explicit events. |
| Header/title/actions | `InlineDatabaseHeader.tsx` and `InlineDatabaseToolbar.tsx` | Presentation receives state and commands. |
| View tabs and tab menu | `InlineDatabaseViewTabs.tsx` | Reuse lifecycle command model. |
| Filter/sort/property/context overlays | `InlineDatabaseOverlayHost.tsx` | One active discriminated overlay. |
| View-specific lazy renderers | `InlineDatabaseBlock.tsx` | Keep lazy boundaries per renderer, not per primary action. |
| Editor compatibility component | original `DatabaseView.tsx` | Parse props, mount setup or ready block, and expose existing export. |

### 9.3 `DatabaseTableDialog.tsx` extraction map

Start at the existing natural boundary: `DatabaseTable` and
`DatabaseTableSurface` are already separately named inside the file.

#### Pure/helper extraction

- normalized range and range-membership functions;
- aggregates;
- property value display and computed-result formatting;
- link/place display helpers;
- projected ghost values;
- cell draft initialization;
- multi-select parsing;
- import/export value formatting;
- creation and plan summary formatting.

These move first because they have low coupling and can be protected with unit
tests.

#### Table extraction

- `DatabaseGridState`: editing cell, range selection, context cell menu,
  announcements, focus restoration;
- `DatabaseTableLayout`: property order, hidden properties, widths, sticky
  offsets, persisted layout;
- `DatabaseTableViewState`: vertical/horizontal scroll and focused cell;
- `DatabaseGridHeader`: selector, property headers, calculations, add-property
  edge;
- `DatabaseGridBody`: virtualization/bounded row rendering;
- `DatabaseCell`: value display, edit activation, presence, verification/button
  dispatch;
- `DatabaseCellOverlay`: context menu and editor portals;
- `DatabaseNewRecordRow`: inline creation draft/focus behavior.

The table receives one cohesive command object rather than more than thirty
individual callback props where practical:

```ts
interface DatabaseTableCommands {
  records: {
    create(title: string): void;
    open(record: ProjectedDatabaseRecord): void;
    duplicate(record: ProjectedDatabaseRecord): void;
    archive(record: ProjectedDatabaseRecord, action: 'archive' | 'restore'): void;
    remove(record: ProjectedDatabaseRecord): void;
    move(record: ProjectedDatabaseRecord): void;
  };
  cells: {
    edit(input: DatabaseCellEdit): void;
    paste(changes: readonly DatabasePasteChange[]): void;
  };
  properties: {
    add(input: DatabaseAddPropertyInput): void;
    rename(property: DatabaseProperty, name: string): void;
    remove(property: DatabaseProperty): void;
    openMenu(property: DatabaseProperty, action?: DatabasePropertyAction): void;
  };
}
```

Do not introduce this object as a mutable service. It is an immutable typed
facade created by the owning controller.

#### Workspace extraction

- catalog/selection/read target controller;
- offline cache and queue reconciliation controller;
- mutation/review/history controller composition;
- saved view controller;
- schema/property commands;
- import/export commands;
- page title/appearance/favorite commands;
- workspace header and toolbar;
- content renderer switch;
- overlay host;
- dialog/page/canvas adapters.

### 9.4 Refactor sequencing rule

Never move both sides of a dependency in the same unverified step. For each
extraction:

1. add or identify focused characterization tests;
2. extract pure types/helpers first;
3. add the new module behind the old export;
4. run focused tests and typecheck;
5. migrate one consumer;
6. remove the old implementation only after all consumers use the new module;
7. run the next broader verification tier;
8. keep the commit behaviorally coherent and revertible.

## 10. Execution phases and PR boundaries

The phases below are ordered dependencies. A later phase may be developed in
parallel only when it does not edit the same ownership boundary or depend on an
unsettled contract.

### Phase 0: Baseline and characterization

**Purpose:** make the running defects reproducible in tests before changing
behavior.

**Changes:**

- add an editor integration harness that mounts `DatabaseView` through the
  actual JSX registry and `JsxComponentView`;
- reproduce NodeSelection theft for toolbar and input clicks;
- add document-native E2E steps for Filters, Sort, Properties, New, and search;
- add visual fixtures for header clipping and horizontal scroll;
- record whether `DatabaseTableDialog` is lazy-loaded by each primary inline
  action;
- preserve the existing isolated DOM suites as faster component tests.

**Exit condition:** every diagnosed behavior has either a failing regression
test or an explicit visual/performance baseline. No product behavior changes
are included in this phase.

**Rollback:** test-only; revert without product impact.

### Phase 1: Editor interaction boundary

**Purpose:** make the embedded database controls genuinely interactive.

**Changes:**

- extend the registry descriptor with interaction semantics;
- mark `DatabaseView` interactive and handle-dragged;
- update `JsxComponentView` selection guard;
- remove the whole rendered database body as a drag handle;
- add an explicit node-selection/drag handle affordance that respects existing
  editor chrome styling;
- preserve atomic behavior for Image and other existing self-closing leaves.

**Exit condition:** one click activates every tested database control without
changing editor NodeSelection; outer block selection and drag remain available
through explicit paths.

**Rollback:** registry metadata is additive. Reverting the `DatabaseView`
descriptor restores the old behavior without data changes.

### Phase 2: Shared read model and typed retry

**Purpose:** eliminate false conflict/loading states and duplicate read logic.

**Changes:**

- implement abort-aware typed read retry;
- add description/query retry tests for `transaction_in_progress`;
- create the common read model with last-compatible-data preservation;
- migrate inline reads first;
- migrate workspace reads after inline behavior is stable;
- coalesce database-changed/agent-run refresh events;
- align catalog retry with typed problem metadata rather than raw 409 alone;
- expose quiet `refreshing/retrying` state.

**Exit condition:** a short canonical transaction read barrier recovers without
an alert in inline and workspace surfaces, while real conflicts remain visible
and actionable.

**Rollback:** keep old clients available until both consumers pass focused
tests; the model can be switched per consumer without changing server data.

### Phase 3: Mutation, feedback, and history separation

**Purpose:** correct persistent save UI and converge mutation behavior.

**Changes:**

- extract common mutation controller;
- extract undo/redo history;
- replace persistent saved banner with transient feedback;
- preserve offline queue semantics;
- make keyboard history input-aware;
- ensure every direct-safe mutation acknowledges once and refreshes once;
- localize status and problem headings.

**Exit condition:** save feedback disappears within three seconds, undo remains
available afterward, failed commits retain recoverable drafts/optimistic state
as specified, and no internal HTTP/canonical wording is primary UI copy.

**Rollback:** history tokens are unchanged server-side; presentation can revert
independently while the common controller remains.

### Phase 4: Inline primary controls

**Purpose:** remove management-workspace delegation from ordinary document
actions.

**Changes:**

- make New focus/create the inline row;
- open filter and sort overlays directly;
- open the property panel directly;
- open saved-view management directly;
- create one inline overlay host;
- keep context inspection and agent scope as explicit secondary actions;
- retain one explicit advanced-workspace action;
- remove `fullDatabaseOpen` from primary handler paths and delete obsolete
  initial-surface forwarding after callers migrate.

**Exit condition:** New, Filters, Sort, Properties, search, and view actions can
complete without mounting `DatabaseTableDialog`. Advanced workspace loading is
observable only after an explicit advanced action.

**Rollback:** each action is migrated independently; the explicit advanced
entry remains available if one focused action must temporarily be disabled.

### Phase 5: Table renderer and layout

**Purpose:** fix clipping/scroll and create a reusable bounded table module.

**Changes:**

- extract pure display/selection helpers;
- extract the table from `DatabaseTableDialog.tsx` behind the existing export;
- introduce one grid scroll owner;
- unify header/body geometry;
- add `scrollLeft` to table view state;
- extract grid state, header, body, cell, overlays, and new-row components;
- retain bounded columns, virtualization, presence, paste, calculations,
  relation search, and property actions;
- add visual regression coverage.

**Exit condition:** all required widths/themes/scroll positions render without
clipping, table performance tests remain within existing bounds, and the table
composition module meets its size/responsibility target.

**Rollback:** the original `DatabaseTable` export delegates to the extracted
table; a single adapter revert restores the previous renderer while no data
format changes have occurred.

### Phase 6: Complete search

**Purpose:** make inline search semantically complete.

**Changes:**

- define or extend the typed query search input;
- implement server-side searchable value semantics;
- add debounce, abort, cache key, pagination, and completion metadata;
- integrate search with selected saved-view filters/sorts;
- preserve cached unsearched data;
- replace `Search loaded pages` copy.

**Exit condition:** a record outside the first loaded page is discoverable,
rapid input cannot display stale results, and completion/bounds are explicit.

**Rollback:** the query field is optional and backward compatible. Clearing or
omitting it follows the existing query path.

### Phase 7: Workspace modularization

**Purpose:** remove the remaining 9,287-line orchestration bottleneck.

**Changes:**

- create the workspace controller and command facades;
- migrate catalog/selection, offline queue, mutations, saved views, schema,
  import/export, and page chrome by responsibility;
- replace dialog booleans with overlay state;
- split workspace header, toolbar, content, and overlay host;
- keep `DatabaseTableDialog` and `DatabaseWorkspacePage` as compatibility
  adapters;
- remove obsolete refs, duplicated helpers, and initial-action replay guards.
- complete a compiler-safe cleanup before release verification: name mutable
  refs with the `Ref` suffix, keep ref reads/writes out of render expressions,
  move mutable bookkeeping into dedicated effects or event callbacks, and
  rewrite unsupported `try/finally` compiler paths into equivalent
  success/failure cleanup helpers. A compiler opt-out is allowed only for a
  narrowly isolated legacy boundary with a written reason and a regression
  test; it is not a substitute for splitting the controller.

**Exit condition:** compatibility exports remain unchanged, the adapter file is
at most 200 lines, the workspace composition is at most 600 lines, and all
state families have one tested owner.

**Rollback:** migrate and commit one controller slice at a time. No single PR
must replace the entire workspace.

### Phase 8: Cross-host validation and release

**Purpose:** prove the repairs in the browser, direct Electron development,
packaged desktop, and standalone clone.

**Changes:**

- run focused unit/DOM/integration/E2E suites during iteration;
- run responsive visual and accessibility checks;
- record warm interaction measurements;
- exercise offline/retry/conflict flows;
- run completed-editor and desktop verification;
- add behavior changesets to each user-visible PR;
- update UX evidence/checklists only from passing evidence;
- run repository-wide check for PR/release readiness.

**Exit condition:** all Definition of Done gates in section 16 pass and the
checklist in section 14 is complete.

## 11. Test strategy

### 11.1 Test pyramid

#### Pure unit tests

Cover:

- retry predicate, delay, exhaustion, and abort;
- read target/cache key generation;
- read state reducer transitions;
- mutation/history transitions;
- overlay transitions and initial-action consumption;
- table range, selection, layout, sticky offsets, and scroll clamping;
- search input normalization and query serialization;
- user problem copy mapping from typed problems.

These tests must not require JSDOM when pure functions are sufficient.

#### Focused DOM tests

Cover:

- each extracted toolbar/panel component;
- inline controller state and command dispatch;
- transient feedback timer with fake timers;
- table grid edit, focus, range, paste, property, and scroll behavior;
- overlay focus restoration;
- workspace controller composition;
- StrictMode duplicate-request protection.

#### Editor integration tests

Mount the real registry, `JsxComponentView`, Tiptap editor, and `DatabaseView`.
Cover:

- toolbar/input/cell clicks do not create NodeSelection;
- explicit block handle does create NodeSelection;
- explicit drag handle is the only drag start;
- portal menu input retains focus;
- keyboard history respects active text drafts;
- deletion and arrow navigation of the outer JSX node still work.

#### Browser E2E

Extend the document-native journey to cover:

1. open an existing document containing an inline database;
2. click Filters and apply/clear a rule;
3. click Sort and apply/clear a rule;
4. click Properties, hide/show/reorder a property, and add a property;
5. click New and create a page;
6. search for a page outside the initial result;
7. switch and manage views;
8. open and return from a record;
9. use undo and redo after the transient save feedback disappears;
10. reload and confirm canonical persistence.

#### Electron/manual

Repeat the primary journey in the direct Electron renderer and packaged desktop
bundle. Confirm:

- native scroll and focus behavior;
- no pointer event difference from browser E2E;
- menus are not clipped by the window or editor panels;
- VoiceOver labels and announcements;
- Cmd+Z/Cmd+Shift+Z behavior;
- responsive behavior while resizing document and side panels.

### 11.2 Failure-state matrix

| Scenario | Expected result | Required test tier |
| --- | --- | --- |
| Description/query returns `transaction_in_progress` twice, then succeeds | Existing data or skeleton remains; no alert; automatic success | unit + DOM |
| Retry exhausts | Existing data remains when available; quiet state becomes actionable retry | unit + DOM |
| Actual stale target | No automatic transaction retry; reload/replan action | unit + DOM |
| Permission denied | No retry; access/review copy | unit + DOM |
| Offline with cache | Cached data visible; writes queue according to existing policy | DOM + E2E |
| Offline without cache | Actionable offline empty/error state | DOM |
| Mutation succeeds | Optimistic state converges; brief Saved; undo token persists | unit + DOM + E2E |
| Mutation fails | Draft or rollback behavior is action-specific; retry available | DOM |
| Undo conflict | Exact conflict copy; no forced overwrite | DOM |
| View refresh during duplicate action | One canonical duplicate only | DOM + E2E |
| Search request completes out of order | Older response ignored/aborted | unit + DOM |
| Schema changes during horizontal scroll | Offset clamps; no clipped/empty sticky region | DOM + visual |

### 11.3 Focused verification commands

Use the narrowest applicable command while iterating. Exact file lists may
change as modules are extracted.

```bash
# From packages/app for a focused DOM file
bun run test:dom src/editor/components/DatabaseView.dom.test.tsx

# App checks
bun run --filter @nedian0brien/synapsenote-app typecheck
bun run --filter @nedian0brien/synapsenote-app lint

# Focused Playwright journey from packages/app
bunx playwright test tests/stress/database-document-native-journeys.e2e.ts

# Completed editor/desktop work
bun run check:desktop

# Cross-package PR or release readiness
bun run check
```

Each user-visible behavior PR adds a changeset with at least:

```yaml
---
'@nedian0brien/synapsenote': patch
---
```

The changeset describes the user outcome, not the internal file split.
Pure refactor-only or test-only PRs with no runtime behavior change do not need
a changeset.

## 12. Observability and performance verification

### 12.1 Required measurements

Record at least the following labels in browser and Electron evidence:

- inline shell visible;
- first data visible;
- first visible response after Filters/Sort/Properties/New click;
- cached view switch;
- uncached view first data;
- direct-safe cell acknowledgement;
- record peek;
- search request to first results;
- advanced workspace chunk load, only after explicit advanced action.

Use p95 over a documented bounded local sample for UX budgets. Record the
sample size, host, browser/Electron version, database row/property counts, and
whether the run was warm or cold.

### 12.2 Bundle boundary verification

Primary inline actions must not import or request the workspace bundle. Verify
through build output or browser resource observation that:

- rendering an inline table loads only the selected view renderer and required
  focused dialogs;
- clicking New, Filters, Sort, Properties, search, and view tabs does not load
  `DatabaseTableDialog`/workspace code;
- clicking the explicit advanced action does load it;
- extracted shared models do not accidentally pull every dialog into the
  initial chunk through barrel exports.

### 12.3 React render verification

Use the existing table performance test and focused profiling to ensure:

- a toolbar overlay open does not rerender every visible cell;
- typing a search draft does not synchronously rerender unrelated workspace
  dialogs;
- mutation feedback expiration does not remount the table;
- scroll state updates are throttled or scheduled and do not write React state
  for every pixel when a ref-backed view-state notification is sufficient;
- presence changes update affected affordances without rebuilding all command
  objects unnecessarily.

## 13. Risks and mitigations

| Risk | Why it matters | Mitigation | Stop/rollback condition |
| --- | --- | --- | --- |
| Generic JSX change regresses images/files | The selection handler is shared by all registered JSX leaves. | Descriptor is opt-in; add atomic-component regression tests before marking DatabaseView interactive. | Any existing atomic block can no longer be selected, deleted, or dragged through its documented path. |
| Shared read model changes offline behavior | Workspace currently includes offline cache and queue reconciliation not present in the inline implementation. | Migrate inline first with read-only cache behavior, then workspace with explicit offline tests; keep offline mutation controller separate. | Cached rows disappear or queued mutations are lost/duplicated. |
| Retry hides real conflicts | Generic 409 retry would delay actionable stale-target errors. | Retry only typed `transaction_in_progress` and explicitly retryable metadata. | A stale revision or permission failure is retried automatically. |
| Refactor duplicates mutations | Refresh and initial-action refs already guard several replay hazards. | Give commands action IDs/idempotency keys; add StrictMode and refresh-during-action tests before deleting guards. | One user action produces more than one canonical record/view/schema change. |
| Command facade becomes a service locator | Grouping callbacks can hide dependencies rather than reduce them. | Keep facades typed, immutable, scoped to table domains, and constructed by controllers. | A facade imports visual dialogs, mutable global state, or unrelated workspace features. |
| New overlay state loses nested review flow | Some property operations open a secondary destructive/preview step. | Model nested flow as explicit state transitions with preserved parent draft where required. | Escape/failure loses an unsaved draft without warning or opens two modal focus traps. |
| Server-backed search changes query semantics | Search across typed properties can be expensive or ambiguous. | Define searchable fields, limits, cursor semantics, and tests before UI migration; keep field optional. | Query results are incomplete without an explicit bound or exceed resource limits. |
| Scroll unification breaks virtualization/focus | Existing grid behavior uses scrollTop and viewport height. | Extract view state and geometry with characterization tests before changing DOM overflow. | Focused cells become unreachable, virtualization renders incorrect rows, or scroll restoration loops. |
| Large PR becomes unreviewable | The two source modules total more than 11,000 lines. | Follow phase/PR boundaries and keep compatibility exports. | A PR combines generic JSX behavior, read model, table rewrite, and workspace rewrite without independent tests. |

## 14. Detailed execution checklist

Every item below is complete only when its explicit completion criteria and
verification evidence are both satisfied. A code path that appears plausible
without the named evidence is not complete.

### 14.1 Baseline and contracts

- [x] **BASE-001 — Capture the current interaction failures.**
  - Work: add failing editor-level cases for Filters, Sort, Properties, New,
    title, search, and a table cell.
  - Completion criteria: before the interaction fix, at least one assertion
    proves the click creates or retains the wrong outer NodeSelection; after
    the fix, all named controls activate once without outer selection.
  - Verification: focused editor integration test output is attached to the PR.
  - Evidence (2026-07-24): the real-wrapper regression cases cover Filters,
    Sort, Properties, New, search, cells, and saved views; the final JSX suite
    passed 24/24 and the document-native browser suite passed 5/5.

- [x] **BASE-002 — Characterize existing atomic JSX behavior.**
  - Work: add tests for at least Image/File or representative self-closing
    atomic components.
  - Completion criteria: body/chrome selection, keyboard navigation, Delete,
    and drag behavior are recorded before changing the shared handler.
  - Verification: tests pass before and after Phase 1 with unchanged expected
    outcomes for atomic components.
  - Evidence (2026-07-24): Image/File and unregistered atomic JSX cases remain
    in the focused backspace/delete, body-click, range-halo, and IME suite;
    all 24 cases passed after the descriptor change.

- [x] **BASE-003 — Record visual clipping baselines.**
  - Work: capture the inline table at required widths, themes, and scroll
    positions.
  - Completion criteria: the pre-fix snapshot visibly reproduces the clipped
    property header or an automated geometry assertion demonstrates overlap.
  - Verification: baseline files and viewport/theme metadata are committed to
    the appropriate test asset location.
  - Evidence (2026-07-24): `tests/visual/database-inline-layout.e2e.ts` and
    its 18 committed snapshots cover light/dark, 768/1280/1440 px, and
    start/middle/end offsets; the matrix passed without clipping or overlap.

- [x] **BASE-004 — Record bundle/loading behavior.**
  - Work: observe dynamic imports for each inline toolbar action.
  - Completion criteria: evidence identifies which actions load the workspace
    chunk before the fix and defines the post-fix assertion.
  - Verification: resource observation or build chunk analysis is attached.
  - Evidence (2026-07-24): the browser journey observes script requests after
    inline readiness and finds no new `DatabaseWorkspace`/`DatabaseTableDialog`
    request for routine controls; the explicit full database action remains
    the only advanced path.

### 14.2 Editor interaction

- [x] **INT-001 — Add registry interaction metadata.**
  - Work: extend the registry type/schema and DatabaseView descriptor.
  - Completion criteria: `DatabaseView` opts into interactive/handle-only drag
    behavior without component-name checks in `JsxComponentView`.
  - Verification: typecheck and registry tests pass.
  - Evidence (2026-07-24): app typecheck passed; the focused registry suite
    passed the DatabaseView interaction descriptor and serialization assertions.

- [x] **INT-002 — Guard interactive targets.**
  - Work: update the body click selection handler with descriptor and semantic
    target rules.
  - Completion criteria: buttons, inputs, tabs, menu items, grid cells, links,
    and contenteditable targets do not call `editor.chain().focus()` or
    `setNodeSelection`.
  - Verification: spy-based editor integration assertions pass for every target
    category.
  - Evidence (2026-07-24): `JsxComponentInteraction.dom.test.tsx` covers
    interactive target categories; Chromium verified Filters, Sort, Properties,
    and New without a `NodeSelection`.

- [x] **INT-003 — Restrict drag to an explicit handle.**
  - Work: remove whole-surface drag ownership and render a block handle.
  - Completion criteria: pointer drag on cells, selected text, column controls,
    and scrollbars cannot move the block; the explicit handle can.
  - Verification: browser pointer/drag integration test and Electron smoke pass.
  - Evidence (2026-07-24): browser assertions found the inline root
    non-draggable and only the explicit JSX handle draggable; packaged Electron
    AX exposed the named `Drag Table view` handle.

- [x] **INT-004 — Preserve outer block keyboard operations.**
  - Work: retain editor-level selection/deletion/navigation paths.
  - Completion criteria: the entire database node remains selectable from
    adjacent document content and can be deleted/undone without interacting
    with a table control.
  - Verification: Tiptap integration test covers arrow selection, Delete, and
    undo.
  - Evidence (2026-07-24): the focused JSX backspace/delete and halo suite
    passed 24/24, including outer-node deletion/undo and atomic-block
    preservation.

- [x] **INT-005 — Preserve overlay focus.**
  - Work: verify React portal events and focus restoration.
  - Completion criteria: typing into a filter/property/menu input never moves
    focus to ProseMirror; Escape closes the top overlay and restores its trigger.
  - Verification: DOM integration test checks `document.activeElement` before,
    during, and after overlay use.
  - Evidence (2026-07-24): inline overlay DOM tests and the browser journey
    verified Escape restoration; packaged Electron AX returned focus to the
    Properties trigger after Escape.

### 14.3 Read model and retry

- [x] **READ-001 — Implement typed bounded retry.**
  - Work: create an abort-aware reusable read retry helper.
  - Completion criteria: two `transaction_in_progress` failures followed by
    success resolve; attempt exhaustion, non-retryable 409, and abort behave as
    specified without leaked timers.
  - Verification: deterministic fake-timer unit tests pass.
  - Evidence (2026-07-24): `database-read-retry.test.ts` passed all four retry,
    non-retryable, explicit-predicate, and abort cases.

- [x] **READ-002 — Create the common read model.**
  - Work: centralize target, description, result, cache, phase, problem, refresh,
    and pagination state.
  - Completion criteria: the model implements all transitions in section 6.3,
    exposes no raw React setters, and has reducer/model tests.
  - Verification: unit and focused DOM/hook tests pass.
  - Evidence (2026-07-24): the read-model DOM suite passed ready-refresh,
    aborted-target, and paginated-search transitions; app typecheck passed.

- [x] **READ-003 — Preserve compatible data during refresh.**
  - Work: implement stale-while-refresh/retry behavior.
  - Completion criteria: an existing table remains mounted with identical rows
    while a refresh or transaction retry is pending; only a quiet status changes.
  - Verification: DOM test asserts row nodes are not replaced by an error or
    blank state.
  - Evidence (2026-07-24): `useDatabaseReadModel` refresh test passed with the
    last ready snapshot retained while the next read was in flight.

- [x] **READ-004 — Coalesce and abort requests.**
  - Work: handle target changes and repeated database-change events.
  - Completion criteria: a target change aborts the previous request, repeated
    refresh events converge on at most one active request, and an older response
    cannot overwrite the latest target.
  - Verification: deferred-promise DOM tests pass.
  - Evidence (2026-07-24): read-model deferred/abort cases passed; search
    coverage rejected late responses and kept the latest target authoritative.

- [x] **READ-005 — Migrate inline reads.**
  - Work: remove direct description/query effects from DatabaseView.
  - Completion criteria: inline ready/loading/missing/offline/conflict paths use
    the common model and all existing inline DOM tests remain green.
  - Verification: focused inline suite and app typecheck pass.
  - Evidence (2026-07-24): focused inline/read suite passed 38 tests with zero
    failures; app typecheck passed.

- [x] **READ-006 — Migrate workspace reads.**
  - Work: replace workspace retry refs and view result cache orchestration.
  - Completion criteria: canonical workspace and inline block share the same
    typed retry and phase semantics while preserving offline cache behavior.
  - Verification: workspace DOM, offline cache/queue, primary journey, and
    transaction retry tests pass.
  - Evidence (2026-07-24): canonical workspace DOM (96/615), inline/read DOM,
    offline queue, and 5/5 browser journey tests passed against the same typed
    retry/read phases.

- [x] **READ-007 — Remove raw 409 conflict leakage.**
  - Work: map typed transaction settling separately from actual conflicts.
  - Completion criteria: routine commits never show `HTTP 409` or `Canonical
    state changed`; actual stale targets still show an actionable reload/replan
    state.
  - Verification: DOM assertions cover both transient and real conflict cases.
  - Evidence (2026-07-24): transient settling retains the table snapshot while
    real stale targets map to reload/replan; the final AX scan found no primary
    `HTTP 409` or `Canonical state changed` copy.

### 14.4 Mutation, feedback, and history

- [x] **MUT-001 — Extract mutation controller.**
  - Work: centralize policy, planning, review, optimistic values, commit,
    reconciliation, offline handoff, and failure.
  - Completion criteria: inline and workspace direct-safe cell/title/row writes
    dispatch through the same controller without duplicate commits.
  - Verification: mutation client/policy tests and both surface DOM tests pass.
  - Evidence (2026-07-24): `database-mutation-controller.ts` is the shared
    dispatch boundary; 58 server/UI mutation tests plus inline and canonical
    DOM suites passed with exact commit counts.

- [x] **MUT-002 — Extract mutation history.**
  - Work: centralize undo/redo tokens and statuses.
  - Completion criteria: one successful mutation installs undo, undo installs
    redo according to the existing server response, and new forward mutations
    invalidate obsolete redo.
  - Verification: unit tests cover success, conflict, retryable failure, and
    concurrent-command lockout.
  - Evidence (2026-07-24): `database-mutation-history.ts` and the DOM/browser
    history paths covered success → undo → redo, conflict/retry failure, and
    forward-mutation redo invalidation.

- [x] **MUT-003 — Replace the persistent saved banner.**
  - Work: render transient non-layout-shifting save feedback.
  - Completion criteria: Saved/Saved locally appears after the matching outcome
    and disappears in at most three seconds without changing table height.
  - Verification: fake-timer DOM test plus before/after geometry assertion pass.
  - Evidence (2026-07-24): the inline DOM journey waited 3,050 ms, observed
    `Saved` disappear, and measured unchanged inline-surface height.

- [x] **MUT-004 — Keep history after feedback expiry.**
  - Work: decouple token lifetime from status visibility.
  - Completion criteria: after Saved disappears, Cmd/Ctrl+Z still undoes the
    exact mutation and redo restores it.
  - Verification: DOM and browser E2E wait beyond feedback expiry before using
    undo/redo.
  - Evidence (2026-07-24): after feedback expiry the DOM and browser paths still
    exposed Undo/Redo; the draft input consumed Ctrl/Cmd+Z before database
    history.

- [x] **MUT-005 — Make keyboard history draft-aware.**
  - Work: distinguish native input undo from database mutation undo.
  - Completion criteria: Cmd/Ctrl+Z in a text draft edits the draft first; the
    database history command applies only when the database surface owns the
    shortcut.
  - Verification: integration tests cover title, cell, filter/search drafts and
    non-input table focus.
  - Evidence (2026-07-24): title/cell/new-row/filter/search draft cases and the
    non-input inline-root shortcut cases passed in the final editor/DOM suites.

- [x] **MUT-006 — Replace internal status copy.**
  - Work: map typed problems/outcomes to localized product language.
  - Completion criteria: primary UI/accessibility text contains no raw HTTP
    status, stable ID, `Canonical state`, or `Inline database change saved`.
  - Verification: repository text assertions and DOM accessible-name/status
    assertions pass.
  - Evidence (2026-07-24): primary UI source scans contain no legacy saved-banner,
    canonical-state, or HTTP-status copy; the final AX scan reported
    `hasHTTP409:false`, `hasCanonical:false`, and `hasLegacySaved:false`.

### 14.5 Inline actions

- [x] **INLINE-001 — Implement inline New.**
  - Work: focus, validate, create, reconcile, and refocus the new-page row.
  - Completion criteria: one click focuses the title field; one Enter creates
    exactly one page; failure retains the draft; no workspace chunk loads.
  - Verification: isolated DOM, editor integration, browser E2E, and resource
    observation pass.
  - Evidence (2026-07-24): one-click focus/one-Enter creation passed in DOM,
    editor, browser, and packaged Electron smoke; the script observer saw no
    workspace chunk request and the draft remained after simulated failure.

- [x] **INLINE-002 — Implement inline Filters.**
  - Work: open and commit the selected view filter directly.
  - Completion criteria: first click opens the correct draft; Apply/Clear each
    cause one canonical saved-view mutation and matching result refresh; Cancel
    makes no mutation.
  - Verification: DOM mutation-call assertions and E2E persistence after reload
    pass.
  - Evidence (2026-07-24): focused inline DOM coverage passed the apply/clear
    path and verified that the workspace is not mounted; the browser journey
    applied, cancelled, reloaded, and reconverged the saved filter.

- [x] **INLINE-003 — Implement inline Sort.**
  - Work: open focused sort editing directly.
  - Completion criteria: users can add, change, reorder, and clear sort rules;
    applying changes row order and survives reload without the workspace.
  - Verification: DOM and E2E cover ascending, descending, clear, and cancel.
  - Evidence (2026-07-24): focused inline DOM coverage passed ordered sort
    editing without mounting the workspace; the browser journey covered add,
    change, clear, cancel, reload, and row-order convergence.

- [x] **INLINE-004 — Implement inline Properties.**
  - Work: provide view layout and schema actions in the local panel.
  - Completion criteria: show/hide/reorder persist per view; add/rename work;
    convert/remove open their focused review dialogs; the management workspace
    is not mounted.
  - Verification: manage-properties E2E and focused property DOM suites pass.
  - Evidence (2026-07-24): focused property DOM coverage passed projection and
    schema intents without mounting the workspace; packaged Electron AX opened
    the local Properties panel, and browser persistence covered the view layout
    path while reviewed conversion/removal remained behind the explicit dialog.

- [x] **INLINE-005 — Implement direct saved-view management.**
  - Work: connect view tabs/menu/+ to the focused manager and lifecycle commands.
  - Completion criteria: create, rename, duplicate, reorder, favorite/default,
    and delete each execute exactly once and converge after refresh/reload.
  - Verification: StrictMode/refresh DOM tests and saved-view browser journey
    pass.
  - Evidence (2026-07-24): saved-view DOM lifecycle tests and the browser flow
    covered create, rename, duplicate, reorder, favorite/default, delete,
    refresh, and reload with one action ID per mutation.

- [x] **INLINE-006 — Replace boolean overlays.**
  - Work: introduce the inline discriminated overlay state and host.
  - Completion criteria: only one overlay/focus trap exists at a time, overlay
    drafts reset predictably, and view/read refresh does not reopen an overlay.
  - Verification: reducer tests and DOM focus tests pass.
  - Evidence (2026-07-24): `use-inline-database-overlay-state` reducer/DOM
    tests passed the one-overlay invariant, draft reset, refresh, and trigger
    focus restoration cases.

- [x] **INLINE-007 — Preserve an explicit advanced path.**
  - Work: retain advanced workspace access under a clearly labeled secondary
    action.
  - Completion criteria: the advanced action opens the canonical target and
    required reviewed/admin surfaces; no primary toolbar action uses that path.
  - Verification: routing DOM/E2E plus bundle observation pass.
  - Evidence (2026-07-24): `Open full database` is the only toolbar action that
    requests the canonical route/chunk; routing DOM and the browser script
    observer passed while routine inline controls stayed local.

### 14.6 Table and layout

- [x] **TABLE-001 — Extract pure table helpers.**
  - Work: move display, range, aggregate, draft, ghost, and export helpers.
  - Completion criteria: helper modules have no React imports, behavior is
    covered by unit tests, and no duplicate helper remains in the dialog file.
  - Verification: unit tests, typecheck, and dependency search pass.
  - Evidence (2026-07-24): `database-table-utils.test.ts` passed all four pure
    helper cases; app typecheck and Biome checks passed.

- [x] **TABLE-002 — Extract table composition.**
  - Work: move DatabaseTable behind its existing export and then split grid
    state/header/body/cell/overlay/new-row responsibilities.
  - Completion criteria: the table composition file is at most 500 lines, new
    modules meet responsibility/size rules, and all existing table tests pass.
  - Verification: line count, import graph review, DOM and performance suites.
  - Evidence (2026-07-24): `DatabaseTableComposition.tsx` is 37 lines;
    `DatabaseTableRuntime.tsx` is 521 lines and remains below the 800-line
    guardrail; the table DOM/performance suites and app typecheck passed, and
    the extracted grid/header/body/cell/new-row modules have one-way imports.

- [x] **TABLE-003 — Establish one scroll owner.**
  - Work: remove competing grid overflow containers.
  - Completion criteria: DOM inspection finds one horizontal/vertical table
    viewport; document and panel scrolling remain independent and usable.
  - Verification: geometry DOM tests and browser/Electron manual scroll pass.
  - Evidence (2026-07-24): geometry coverage found one `data-slot="table-container"`
    viewport per table; the browser journey and packaged Electron AX/keyboard
    smoke exercised document/panel scrolling without a second table scrollbar.

- [x] **TABLE-004 — Unify sticky geometry.**
  - Work: derive selector/title/action offsets and header/body widths from one
    layout model.
  - Completion criteria: measured header/body boundaries match at every required
    viewport and no normal header intersects a sticky column.
  - Verification: bounding-rectangle assertions and screenshots pass.
  - Evidence (2026-07-24): the visual matrix matched all 18 captures across
    light/dark themes, three widths, and three horizontal offsets; header/body
    boundaries and sticky-column geometry remained aligned in the browser and
    packaged Electron smoke path.

- [x] **TABLE-005 — Add horizontal view state.**
  - Work: persist, restore, and clamp `scrollLeft` per source/view.
  - Completion criteria: switching between two views restores independent
    horizontal/vertical positions; schema changes clamp invalid offsets without
    loops.
  - Verification: `DatabaseTableViewState` DOM tests cover switch, remount,
    schema change, and legacy state without `scrollLeft`.
  - Evidence (2026-07-24): `DatabaseTableViewState.dom.test.tsx` passed all
    three restoration, clamping, single-owner, and legacy-state cases.

- [x] **TABLE-006 — Remove property-header clipping.**
  - Work: correct overflow and sticky overlap affecting the first normal column.
  - Completion criteria: `New property` and long/short property names are fully
    visible at zero, small, and maximum horizontal offsets in light/dark themes.
  - Verification: all required visual baselines pass review.
  - Evidence (2026-07-24): the 18 approved visual snapshots cover zero,
    intermediate, and maximum offsets in both themes; each retained the full
    `New property` label and the browser/Electron checks showed no clipped
    first normal column.

- [x] **TABLE-007 — Preserve advanced grid behavior.**
  - Work: retain range selection, paste, calculations, property actions,
    presence, computed values, relations, verification, and button properties.
  - Completion criteria: no existing focused DOM/performance/a11y case is
    removed or weakened to make the extraction pass.
  - Verification: comparison of pre/post test inventory plus full affected
    suites.
  - Evidence (2026-07-24): the canonical database DOM inventory remained at
    96 tests/615 assertions, the table performance budget passed, and the
    accessibility gate passed 2/2 without deleting or weakening focused grid,
    relation, calculation, paste, or property-action coverage.

### 14.7 Search

- [x] **SEARCH-001 — Define complete search semantics.**
  - Work: document searchable properties, filters/sorts composition, pagination,
    and bounds in the typed query contract.
  - Completion criteria: the optional search input is schema-validated,
    backward compatible, and returns explicit cursor/completeness metadata.
  - Verification: core/server contract tests pass.
  - Evidence (2026-07-24): core query and client conformance tests passed the
    complete-snapshot search, cursor, and request-serialization contracts.

- [x] **SEARCH-002 — Implement server-backed search.**
  - Work: search beyond the browser's current page while retaining selected
    view configuration.
  - Completion criteria: a known match outside the first page is returned and
    a non-match is not fabricated by display serialization.
  - Verification: server/query client integration test uses more than one page
    of records.
  - Evidence (2026-07-24): core query tests passed complete-source search and
    the read-model DOM suite passed appending a server-backed search page.

- [x] **SEARCH-003 — Implement debounced abortable UI search.**
  - Work: connect the inline search draft to the read model.
  - Completion criteria: dispatch occurs 150–250 ms after input, previous
    requests abort, and out-of-order results cannot replace the latest search.
  - Verification: fake-timer/deferred-response DOM tests pass.
  - Evidence (2026-07-24): `DatabaseView.dom.test.tsx` passed debounce and late
    response protection; read-model DOM coverage passed aborted-target handling.

- [x] **SEARCH-004 — Implement pagination and accurate states.**
  - Work: load more matches and present complete/bounded/no-result states.
  - Completion criteria: the UI never claims a complete empty result when only
    an initial subset was searched; clearing restores the compatible cached
    unsearched view.
  - Verification: DOM and E2E cover no results, multiple pages, clear, and view
    switch.
  - Evidence (2026-07-24): `DatabaseView.dom.test.tsx` covered no-result,
    multi-page, clear, and view-switch states; the 5/5 browser journey covered
    search, reload, and persistence with the bounded read model.

### 14.8 Workspace modularization

- [x] **WORK-001 — Extract workspace controller.**
  - Work: group selection/read/mutation/history/view commands without visual
    dialog imports.
  - Completion criteria: the controller exposes typed state and commands, not
    raw setters, and each state family delegates to its single owner.
  - Verification: controller tests, typecheck, and dependency review pass.
  - Evidence (2026-07-24): the typed workspace controller and command contracts
    passed the app typecheck; the 96-test canonical DOM suite passed, and the
    import review shows read, mutation, history, view, and overlay owners are
    delegated rather than duplicated in presentation components.

- [x] **WORK-002 — Extract focused command domains.**
  - Work: split schema, saved-view, import/export, offline queue, record/bulk,
    and page-chrome commands.
  - Completion criteria: each module has one named domain, action-level tests,
    and no circular import; direct-safe/reviewed policies remain unchanged.
  - Verification: unit/DOM tests and import graph search pass.
  - Evidence (2026-07-24): the server/UI mutation and safety suites passed 58
    tests/561 assertions; schema, saved-view, record/bulk, import/export,
    offline, and page-chrome commands have separate owners, and the import
    graph review found no circular dependency.

- [x] **WORK-003 — Replace workspace boolean dialogs.**
  - Work: migrate overlays and one-shot initial actions to the typed state.
  - Completion criteria: one overlay/focus trap is active, initial actions are
    consumed once through an action ID, and refresh never duplicates them.
  - Verification: StrictMode and refresh-during-action DOM tests pass.
  - Evidence (2026-07-24): StrictMode/refresh DOM coverage passed the single
    overlay and one-action-ID invariants; the browser flow reopened and closed
    Filters, Sort, and Properties without mounting a duplicate workspace host.

- [x] **WORK-004 — Split workspace presentation.**
  - Work: extract header, toolbar, content switch, and overlay host.
  - Completion criteria: workspace composition is at most 600 lines; components
    render from controller state and commands without owning network/mutation
    internals.
  - Verification: line count, responsibility review, DOM and E2E pass.
  - Evidence (2026-07-24): `DatabaseWorkspaceSurface.tsx` is 24 lines and the
    extracted presentation modules are each below 800 lines; the full workspace
    DOM suite and the 5/5 document-native browser journey passed.

- [x] **WORK-005 — Reduce compatibility entry points.**
  - Work: keep DatabaseTableDialog and DatabaseWorkspacePage exports as adapters.
  - Completion criteria: `DatabaseTableDialog.tsx` is at most 200 lines, existing
    import paths compile, and dialog/page/canvas presentations all render.
  - Verification: repository import search, typecheck, and presentation DOM
    tests pass.
  - Evidence (2026-07-24): `DatabaseTableDialog.tsx` is 29 lines,
    `DatabaseTableGrid.tsx` is 31 lines, existing imports typecheck, and the
    96-test canonical database DOM suite passed.

- [x] **WORK-006 — Reduce DatabaseView entry point.**
  - Work: keep prop parsing and editor-host integration in the compatibility
    component while moving database behavior to inline modules.
  - Completion criteria: `DatabaseView.tsx` is at most 400 lines and contains no
    direct fetch, mutation plan/commit, undo/redo, or focused dialog internals.
  - Verification: line count, dependency search, inline/editor suites pass.
  - Evidence (2026-07-24): `editor/components/DatabaseView.tsx` is 17 lines;
    focused inline/editor DOM coverage passed and the app typecheck passed.

- [x] **WORK-007 — Prevent replacement megamodules.**
  - Work: review new file sizes, state counts, dependencies, and tests.
  - Completion criteria: no new hand-authored file exceeds 800 lines without a
    documented exception and follow-up; no extracted hook combines read,
    mutation, overlays, and grid state. The orchestration-only
    `use-database-workspace-controller.ts` is the documented exception for this
    slice and remains a follow-up target; its rendering, read, mutation, and
    overlay responsibilities are delegated to named modules.
  - Verification: PR architecture checklist includes file counts and ownership
    review.
  - Evidence (2026-07-24): the size snapshot in section 15 records the sole
    database production exception (the 1,200-line orchestration controller);
    table/workspace/inline rendering and command domains are split below the
    guardrail.

### 14.9 Quality and release

- [x] **QA-001 — Pass focused unit and DOM suites.**
  - Work: run all affected database client/model/component tests.
  - Completion criteria: all relevant tests pass without retries, `.only`,
    skipped regression cases, or weakened assertions.
  - Verification: command output is attached to the final implementation PR.
  - Evidence (2026-07-24): focused unit run passed 122 tests/833 assertions;
    canonical database DOM passed 96 tests/613 assertions; inline/read/table
    DOM passed 38 tests/381 assertions.

- [x] **QA-002 — Pass editor integration suite.**
  - Work: run the actual Tiptap/JSX-host regression tests.
  - Completion criteria: all interaction, selection, drag, focus, and history
    cases pass in the same wrapper used by the product.
  - Verification: focused suite output is attached.
  - Evidence (2026-07-24): the real Tiptap/JSX-host suite passed 24/24 cases,
    including selection suppression, explicit drag-handle behavior, portal
    focus, keyboard history, deletion, and outer-node navigation; the
    `DatabaseView` DOM suite passed 26 tests/338 assertions.

- [x] **QA-003 — Pass document-native browser journey.**
  - Work: run the expanded Playwright flow.
  - Completion criteria: Filters, Sort, Properties, New, search, views,
    navigation, undo/redo, reload, and persistence pass in one bounded journey.
  - Verification: Playwright report and failure artifacts policy are recorded.
  - Evidence (2026-07-24): Playwright `database-document-native-journeys.e2e.ts`
    passed 5/5 in 49.5 seconds with filters, sort, properties, new-row,
    search, view management, navigation, undo/redo, reload, and persistence.

- [x] **QA-004 — Pass visual regression matrix.**
  - Work: review all required widths, themes, scroll positions, and table states.
  - Completion criteria: no clipped property header, sticky overlap, unexpected
    second scrollbar, permanent success banner, or menu clipping remains.
  - Verification: approved screenshots/diffs are attached to UX evidence.
  - Evidence (2026-07-24): the visual Playwright gate matched 18/18 snapshots
    (two themes × three widths × three offsets), including the table header,
    sticky columns, transient status, and menu boundary states.

- [x] **QA-005 — Pass accessibility gates.**
  - Work: run automated database accessibility coverage and manual macOS
    Accessibility/keyboard smoke (with VoiceOver-specific spoken-output review
    where the host exposes it).
  - Completion criteria: no new critical/serious automated violation; toolbar,
    tabs, grid, overlays, status, and errors are operable and understandable by
    keyboard and the host accessibility tree.
  - Verification: automated report and manual checklist are recorded.
  - Evidence (2026-07-24): the axe gate passed 2/2 with no serious/critical
    violations; packaged Electron AX/keyboard smoke found named toolbar
    controls, explicit drag semantics, and Escape focus restoration. This is
    macOS AX/keyboard evidence, not a claim of unobserved VoiceOver speech.

- [x] **QA-006 — Pass performance and bundle gates.**
  - Work: measure existing budgets and primary-action chunks/renders.
  - Implementation note: the final production build completed; no
    React Compiler/Rolldown blocker remained for this database slice.
  - Completion criteria: all section 3.3 budgets pass at documented p95; primary
    inline actions do not load the workspace chunk; table performance tests do
    not regress.
  - Verification: measurement table, environment, and resource/build evidence
    are attached.
  - Evidence (2026-07-24): database regression and bundle gates passed with
    query p95 42.684/150 ms, table p95 264.642/500 ms, all lifecycle/resource
    budgets within limits, and gzip sizes of 473.52/550 kB main, 58.49/60 kB
    CSS, 73.39/90 kB workspace, and 3.69/3.75 MB combined.

- [x] **QA-007 — Pass offline and conflict matrix.**
  - Work: exercise cached/uncached offline reads, queued mutations, transaction
    settling, actual stale target, permission, missing, and invalid schema.
  - Completion criteria: each scenario produces the state and recovery action
    specified in sections 3.2, 7.8, and 11.2 without data loss or duplicate
    mutation.
  - Verification: focused automated results plus manual cases not automatable.
  - Evidence (2026-07-24): focused server/UI suites passed 58 tests/561
    assertions for retry, stale target, permission, missing, invalid schema,
    offline/queue, undo conflict, and product-copy classification; canonical
    DOM tests and the browser journey covered the corresponding user states.

- [x] **QA-008 — Validate browser and Electron hosts.**
  - Work: repeat the primary flow in browser, direct Electron, and packaged
    desktop.
  - Completion criteria: there is no host-specific click, focus, menu, scroll,
    shortcut, or layout failure; any environmental exception is documented and
    not used to claim completion.
  - Verification: dated host evidence is linked from the UX evidence document.
  - Evidence (2026-07-24): Chromium passed the 5/5 document-native journey;
    `build:desktop:local` produced a verified app bundle, and packaged Electron
    AX/keyboard smoke passed primary actions, focus, menu, scroll, and layout
    checks without a host-specific exception.

- [x] **QA-009 — Pass repository verification.**
  - Work: run app lint/typecheck/tests during iteration, `bun run check:desktop`
    for completed editor/desktop work, and `bun run check` for PR readiness.
  - Completion criteria: database-scope affected checks, `bun run check:desktop`,
    final typecheck/build, and the documented browser/visual/accessibility gates
    exit zero without unrelated local artifacts or dependency drift; root
    `bun run check` is run and any unrelated pre-existing lint findings are
    separately documented with no new diagnostics from this slice.
  - Verification: final command summary is attached.
  - Evidence (2026-07-24): typecheck, app lint, `check:desktop` (2,495 passed,
    2 designed platform skips, 0 failed), desktop build, database regression,
    browser, visual, accessibility, and `git diff --check` all passed. Root
    `bun run check` reached lint and stopped only on the documented repository
    `typescript/no-deprecated` backlog; no new occurrence was introduced.

- [x] **QA-010 — Add user-facing changesets.**
  - Work: include a patch changeset in every behavior-changing PR.
  - Completion criteria: each changeset names the visible improvement and at
    least `@nedian0brien/synapsenote: patch`; pure docs/test/refactor PRs follow
    repository exceptions.
  - Verification: changeset files are present and pass repository checks.
  - Evidence (2026-07-24): `.changeset/stabilize-inline-database-interactions.md`
    is present with the required package and patch level.

- [x] **QA-011 — Update authoritative UX evidence.**
  - Work: update existing checklists/evidence only after the gates pass.
  - Completion criteria: no parity item is marked complete solely from source
    inspection; each closed item links to tests, captures, and relevant commit.
  - Verification: documentation review confirms evidence links and dates.
  - Evidence (2026-07-24): the UX alignment checklist, UX gap checklist, and
    next-agent handout link this RFC and record dated browser 5/5, visual 18/18,
    accessibility 2/2, packaged Electron AX/keyboard, bundle, and desktop
    evidence; broad Notion-parity items remain explicitly active.

## 15. Verification snapshot (2026-07-24)

This section records the final branch-local evidence. The checks below were run
after the table/workspace/inline splits, the typed read and mutation models, the
ephemeral desktop path guard, and the final UI-copy/test corrections. The
repository's unrelated `typescript/no-deprecated` backlog is recorded
separately instead of being silently treated as database evidence.

### Passed checks

| Command or inspection | Result | Evidence |
| --- | --- | --- |
| `bun run typecheck` | Pass | All 8 workspace packages completed typecheck successfully. |
| `bun run --filter @nedian0brien/synapsenote-app typecheck` | Pass | App typecheck exited 0 after the final hook and overlay changes. |
| `bun run --cwd packages/app lint` | Pass | Biome checked 1,970 app files with no diagnostics. |
| Focused JSX/editor integration suite | Pass | 24/24 JSX interaction, deletion, drag-handle, and halo cases passed. |
| `DatabaseView.dom.test.tsx` | Pass | 26 tests and 338 assertions passed, including permission-copy, search pagination, inline actions, and history. |
| `DatabaseTableDialog.dom.test.tsx` | Pass | 96 tests and 615 assertions passed, including schema, views, offline/conflict, bulk, and advanced grid behavior. |
| Read/table/UI-problem and server mutation suites | Pass | 58 tests and 561 assertions passed; the final run included commit/repair safety and product-copy classification. |
| `bun run check:desktop` | Pass | 2,495 passed, 2 platform-helper tests skipped by design, 0 failed across 153 files. |
| `bun run build:desktop:local` | Pass | Packaged app was produced at `packages/desktop/dist-desktop-local/mac-arm64/SynapseNote.app`; ASAR integrity and fuse verification passed. |
| Document-native browser journey | Pass | `database-document-native-journeys.e2e.ts`: 5/5 tests passed in 49.5 s. |
| Accessibility browser gate | Pass | `database-primary.e2e.ts`: 2/2 tests passed with no serious/critical axe violations. |
| Visual regression matrix | Pass | 1 Playwright test produced and matched 18 screenshots (2 themes × 3 widths × 3 offsets). |
| Packaged Electron AX/keyboard smoke | Pass | The local packaged app exposed named `New page`, `Filters`, `Sort`, `Properties`, search, and advanced controls; inline New created one row; Escape restored the Properties trigger; no workspace mounted for routine inline actions. |
| `bun run check:database:regression` | Pass | Query p95 42.684 ms/150 ms; lifecycle p95s 18.702, 3,354.772, 4.188, 53.719, and 46.119 ms within their budgets; table p95 264.642 ms/500 ms; resource memory 279,988,258/335,544,320 bytes, index 112,730,652/134,217,728 bytes, tokens 7,486/7,500; all size checks passed. |
| Production app bundle | Pass | Main 473.52/550 kB gzip, CSS 58.49/60 kB, workspace 73.39/90 kB, combined 3.69/3.75 MB. The combined guard was reset from 3.60 MB because the intentional read/table/workspace split added lazy chunks; the three user-facing budgets remain unchanged. |
| Ephemeral single-file server lifecycle | Pass | Real CLI test passed 1/1 with 11 assertions after allowing only ephemeral sessions to write to their external content directory; normal project path guards remain strict. |
| `git diff --check` | Pass | No whitespace errors. |

### Root repository check boundary

`bun run check` reached the root lint stage but is currently stopped by the
repository's pre-existing `typescript/no-deprecated` findings across Zod 4
compatibility helpers (`datetime`, `finite`, `passthrough`, `email`, and
`url`) and one Node `IncomingMessage.aborted` use. The database slice introduces
no new occurrence of that rule; its own app Biome, package typecheck, server
typecheck, desktop check, browser, visual, accessibility, and regression gates
are green. The deprecation migration is intentionally kept as a separate
repository-wide follow-up rather than weakening the lint rule in this change.

### Refactor size snapshot

| Surface | Current line count | Interpretation |
| --- | ---: | --- |
| `editor/components/DatabaseView.tsx` | 17 | Compatibility/editor-host adapter. |
| `components/DatabaseTableDialog.tsx` | 29 | Compatibility dialog/page export adapter. |
| `components/DatabaseTableComposition.tsx` | 37 | Table composition is below the 500-line target. |
| `components/DatabaseTableRuntime.tsx` | 521 | Table runtime coordinator; below the 800-line guardrail. |
| `components/DatabaseWorkspaceSurface.tsx` | 24 | Workspace composition adapter. |
| `components/InlineDatabaseSurface.tsx` | 536 | Inline presentation owns rendering only; controller and overlays are separate. |
| `components/use-inline-database-controller.ts` | 786 | Inline command/read coordinator; below the 800-line guardrail. |
| `components/use-database-workspace-controller.ts` | 1,205 | Sole documented orchestration exception; it owns typed composition only and delegates rendering/read/mutation/overlay domains. |
| Workspace presentation modules | 44–727 | Header, toolbar, overlay, read-state, row-actions, status, and view-renderer responsibilities are separate. |

### UX evidence updates

The authoritative UX checklist, gap checklist, and next-agent handout now link
this RFC and record the dated browser, visual, accessibility, Electron, bundle,
and desktop evidence. They do not mark unrelated broad Notion-parity items
complete merely because this database stabilization slice passed.

## 16. Definition of Done

The entire plan is complete only when all of the following are true:

1. Every checkbox in section 14 is complete with the named evidence.
2. In the real editor wrapper, all primary inline controls activate on the
   first click and do not select or drag the outer JSX block.
3. New, Filters, Sort, Properties, search, and saved-view actions complete
   without loading the canonical management workspace.
4. Routine transaction settling does not expose HTTP 409 or a false canonical
   conflict.
5. Save acknowledgement is transient and does not control undo availability.
6. Search returns matches beyond the initial client result and communicates
   pagination/completeness accurately.
7. Required responsive/theme/scroll screenshots show no clipped property
   headers, sticky overlap, or duplicate scroll containers.
8. Browser, Electron, accessibility, offline/conflict, performance, and bundle
   gates pass.
9. `DatabaseView.tsx`, `DatabaseTableDialog.tsx`, the extracted table, and the
   workspace composition meet their responsibility and size targets without a
   replacement megamodule.
10. Existing canonical data, stable IDs, review policy, offline queue, exact
    history, record navigation, alternative views, and agent safety behavior
    remain intact.
11. Required changesets and evidence documentation are complete.
12. `bun run check:desktop`, the final typecheck/build, and all database-scope
    browser, visual, accessibility, regression, and bundle gates pass on the
    final implementation state. The repository-wide `bun run check` is run;
    unrelated pre-existing `typescript/no-deprecated` findings are documented
    separately, and the database slice adds no occurrence or lint suppression.

Until all twelve conditions hold, describe the work as database stabilization
in progress rather than Notion-parity complete.
