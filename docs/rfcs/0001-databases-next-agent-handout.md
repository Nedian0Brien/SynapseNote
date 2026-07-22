# RFC 0001 databases: next-agent handout

- Prepared: 2026-07-22 (re-audited)
- Worktree: `/Users/minjaepark/code/SynapseNote-agent-databases`
- Branch: `codex/agent-native-databases`
- Authoritative checklist: [0001-databases-implementation-checklist.md](./0001-databases-implementation-checklist.md)
- Main design: [0001-databases-and-agent-data-plane.md](./0001-databases-and-agent-data-plane.md)
- UX gap checklist: [0001-notion-ux-gap-implementation-checklist.md](./0001-notion-ux-gap-implementation-checklist.md)
- Changeset: `../../.changeset/add-file-native-database-core.md`
- Latest feature changeset: `../../.changeset/inline-database-create-route.md`
- Latest inline UX changeset: `../../.changeset/inline-database-focus.md`
- Latest inline recovery changeset: `../../.changeset/inline-database-undo.md`
- Latest inline history changeset: `../../.changeset/inline-database-history.md`
- Latest inline state-safety changeset: `../../.changeset/inline-database-state-safety.md`
- Latest inline empty-state changeset: `../../.changeset/inline-database-empty-state.md`
- Latest inline agent-context changeset: `../../.changeset/inline-agent-context-inspector.md`
- Latest inline property-context changeset: `../../.changeset/inline-property-context.md`
- Latest inline single-view-tabs changeset: `../../.changeset/inline-single-view-tabs.md`
- Latest inline mode-preservation changeset: `../../.changeset/inline-view-mode-preservation.md`
- Latest inline view-tab-menu changeset: `../../.changeset/inline-view-tab-menu.md`
- Latest context-inspector-copy changeset: `../../.changeset/context-inspector-copy.md`
- Latest alternative-view context changeset: `../../.changeset/inline-context-alt-views.md`
- Latest list/gallery/feed context changeset: `../../.changeset/inline-context-list-gallery-feed.md`
- Latest chart/map context changeset: `../../.changeset/inline-context-chart-map.md`
- Latest creation-review summary changeset: `../../.changeset/database-creation-review-summary.md`
- Latest Agent Run inspection changeset: `../../.changeset/agent-run-progressive-inspection.md`
- Latest inline alternative-view mutation changeset: `../../.changeset/inline-alt-view-mutations.md`
- Latest inline view-order optimism changeset: `../../.changeset/inline-view-order-optimism.md`
- Latest Agent Run recovery handoff changeset: `../../.changeset/agent-run-recovery-handoff.md`
- Latest Agent Run MCP recovery changeset: `../../.changeset/agent-run-mcp-recovery.md`
- Latest Agent Run restart recovery changeset: `../../.changeset/agent-run-plan-restart-recovery.md`
- Latest atomic approval scope changeset: `../../.changeset/atomic-approval-scope.md`

## Objective and completion rule

Continue until every checkbox in the implementation checklist is backed by
evidence and closed. Do not check an item because a plausible implementation
exists: inspect the shared implementation, standalone clone behavior, relevant
tests, failure states, public documentation, changeset, stable-ID behavior, and
completeness/truncation semantics first. The checklist's **How to use this
checklist** section is the acceptance rule.

The user asked for speed without lowering quality. Prefer one evidence-oriented
implementation pass and one focused verification pass per item. The complete
server suite takes roughly ten minutes and should be avoided during iteration;
run individual server test files with `--conditions development`, then reserve
the repository-wide check for final release readiness.

## Current status

- Numbered A-S items: **310/335 complete (92.5%)**.
- Numbered A-S items still open: **5**.
- Total unchecked Markdown boxes: **25**. The extra 20 are M1-M4 milestone
  release gates, all intentionally still open.
- Notion UX gap implementation checklist: **36/42 complete**. NUI-201,
  NUI-202, NUI-203, NUI-204, NUI-302, NUI-304, and NUI-401 are closed with
  focused implementation evidence; NUI-301, NUI-303, and NUI-403 are now
  closed for implementation evidence; NUI-501 is now closed for the complete
  stable-ID property affordance and dependency/recovery evidence; NUI-502 is
  now closed for stable-ID view reorder and active-view settings/menu evidence;
  NUI-402 is now closed for the inline title/tab/shared-record/cache/state
  contract; NUI-503, NUI-602, and NUI-603 are now closed for focused
  implementation evidence; NUI-105 and the P1/P2 agent, linked-view,
  responsive, and browser-journey gates remain open.
- Notion UX alignment checklist: **2/128 complete**. The first insertion slice
  (user-facing `Database`/`Linked database` slash entries and an inline
  catalog/source/view picker) is implemented and DOM-tested, but its visual
  gates remain open. An in-app browser capture reached the web renderer through
  `http://[::1]:5173/` and confirmed the shell plus the administration-first
  creation modal; API routes returned HTML 404 responses, the original
  `127.0.0.1` tab was an IPv4/IPv6 listener mismatch, and no Electron journey
  was captured.
- A-K, M-P are complete. L is complete except L-017. Q is complete except
  Q-012. R-005, R-017, and R-019 remain; R-018 is closed. S-010 and S-011
  are closed.
- The goal is active and is not complete or blocked.

## What is implemented

The worktree contains the complete file-native database foundation and most of
the Notion-class and agent-native surface:

- Strict versioned YAML manifests, stable database/source/property/option/view/
  record identities, canonical Markdown/MDX records, deterministic migration,
  compatibility and Git transaction/undo receipts.
- Full v1 property model, Formula AST/evaluator, Rollups, Relations, rich text,
  Files, Person, Status, Place, Verification, buttons, metadata, date/time and
  property conversion contracts.
- Exact snapshot queries with typed filters, sorting, grouping, aggregation,
  projection, pagination, explain/freshness/completeness receipts, lexical,
  semantic and hybrid retrieval.
- Agent Data Plane catalog/describe/find/query/pack/plan/commit/undo/repair/task
  APIs, HTTP routes, MCP tools/resources, context packs, Agent Views, What the
  agent saw, Agent Runs, stable plans, policy gates and idempotent receipts.
- Table, Board, Timeline, Calendar, List, Gallery, Chart, Map, Feed, Dashboard
  and Form views; saved view management; templates; layouts; comments;
  automations; public sharing; permissions; import/export and onboarding.
- Collaboration presence, deterministic record conflict behavior, offline
  snapshots and queued writes, Git partial-transition detection, semantic merge
  drivers, checkpoints, task rollback and failure recovery.
- Benchmarks and gates for query/lifecycle latency, browser rendering, memory,
  canonical index bytes, context token efficiency and application bundle size.
- Accessibility work through Q-011: keyboard grid/menu operation, semantic
  grids and boards, chart alternatives, keyboard Map, reduced motion, forced
  colors, narrow panes, locale display formatting, bidi/IME/Unicode behavior,
  destructive-change scope/recovery, and ordinary editor/tab/history routing.

The authoritative detail is in the main RFC and the long database changeset;
do not reconstruct behavior solely from this summary.

## Most recent completed work

### P-010 to P-012

- Cooperative cancellation now propagates through core query/derived/context
  pack work, HTTP disconnects, MCP timeouts and durable tasks.
- Index watcher/subscriber queues have explicit backpressure and canonical
  overflow rebuild behavior.
- Shared cross-runtime query and Formula golden vectors run in core, app,
  server and desktop, with a cross-platform focused CI workflow.
- `check:database:regression` aggregates latency, resource, Table-render and app
  size gates. The 50k resource baseline is stored under
  `packages/server/benchmarks/baselines/`.
- Browser record-mutation validation moved into core so the app bundle does not
  import the server runtime.

### Q-003 to Q-011

- Table has roving grid focus, Shift ranges, Context Menu/Shift+F10 focus
  management and virtual-window focus scrolling.
- Board exposes semantic swimlane/group lists, card positions and polite move
  announcements.
- Chart graphics have textual category/series/value descriptions. Map has a
  textual location alternative plus Arrow pan, +/- zoom and Home reset.
- Database-scoped reduced-motion and forced-colors rules and responsive
  workspace sizing are in `packages/app/src/globals.css`.
- `packages/app/src/lib/database-display-format.ts` provides display-only Intl
  number/currency/date/relative-time/collation helpers; canonical storage and
  core query sorting remain locale neutral.
- Table headers/cells/editors use `dir="auto"`; Enter is ignored during IME
  composition; mixed CJK, emoji, combining marks and Arabic are tested.
- Exact-plan ghost review now shows file scope, risk reasons and recovery. An
  immediate permission revocation confirms principal, role, scope, effect and
  recreate-grant recovery.
- Record opening continues through the ordinary document hash and editor
  activity pool, retaining tabs, editor modes, graph/backlinks/search/history.

### 2026-07-21 parity audit and release evidence

- The Notion UX audit is captured in
  [0001-notion-ux-alignment-checklist.md](./0001-notion-ux-alignment-checklist.md),
  with screenshots and 128 explicit interaction/visual parity gates. The
  current database surface is still an admin-style modal flow, so those UX
  gates remain separate from engine-capability completion in the parity matrix.
- The creation dialog now ships seven reviewed starter databases with bounded
  example records: Tasks, Projects, CRM, Feedback, Content calendar, Issue
  tracking, and Research evidence. `packages/app/src/lib/database-creation.test.ts`
  validates every schema and sample row set against
  `DatabaseDesiredStateDraftSchema`; the focused DOM creation suite also passes.
- Database diagnostics now has a content-free JSON export. The export omits
  record paths, titles, and bodies; `DatabaseDiagnosticsDialog.test.tsx`
  verifies the projection and the UI affordance. The docs describe the export
  alongside the Electron redacted bug-report flow.
- Added `.github/workflows/database-release-gates.yml` with focused CI jobs for
  app DOM accessibility/mutations, core invariants/migrations, server
  security/recovery, held-out retrieval evals, and bounded performance tests.
  The local commands passed; R-019 stays open until a hosted CI run is attached.
- Reconciled the parity matrix with the existing implementation: Sub-items and
  dependencies are now `Done` based on typed same-source relations, List parent
  hierarchy, Timeline dependency connectors, and focused schema/server/UI tests.
  AI autofill is explicitly deferred for v1 with a documented provenance,
  freshness, privacy, and typed-failure contract; it is not presented as a
  parity claim.

### 2026-07-22 first Notion-UX insertion slice

- `DatabaseView` is no longer a fresh raw-ID slash insert. The slash menu
  exposes `Database` and `Linked database`; the latter renders a searchable
  database → source → saved-view picker and a missing-reference replacement
  path. Existing serialized `DatabaseView` blocks remain compatible.
- The `Database` slash entry opens the database shell in creation mode through
  a typed app event, preserving the existing exact-plan commit and recovery
  contract while removing one discovery step.
- Focused evidence: 22 slash-menu tests / 187 expectations, 11
  `DatabaseView` DOM tests / 61 expectations, app typecheck, and core registry
  tests (76 / 403 expectations). A live Vite capture was attempted in an
  isolated project but stopped at the React Compiler `BabelError` overlay; do
  not close UX-102 or UX-301/303/308 until a browser-enabled run captures the
  actual flow.

### 2026-07-22 creation and view-context slice

- Blank creation now accepts an optional title, falls back to the stable
  `Untitled database` name, and labels the action `Create database`; templates,
  folder binding, and CSV import retain the reviewed-plan action.
- The creation summary keeps initial view/properties/record count in the main
  path and moves record meaning, canonical folder, and stable key under a
  collapsed `Advanced storage details` disclosure.
- After a successful creation commit, the shell selects the new database's
  first source and saved view immediately. Folder creation still opens the
  separate read-only onboarding review from the same commit callback.
- Saved views now have visible in-context tabs with an adjacent `+` affordance;
  the existing dropdown remains available as a compact fallback and both paths
  share one view-selection/persistence handler.
- Focused evidence: database creation DOM tests pass (6 / 25 expectations),
  DatabaseTableDialog DOM tests pass (54 / 302 expectations), and app
  typecheck/format pass. Visual UX gates remain open until the browser runner
  can render the app without the existing React Compiler overlay.

### 2026-07-22 route-level database workspace slice

- Added a stable `#database/<database>/<source>/<view?>` route with strict
  encode/decode helpers and malformed-route rejection. The App shell treats it
  as route-level content, so reload and hash navigation select the same
  database/source/view without changing canonical state.
- `DatabaseTableDialog` now has a page presentation that removes the modal
  overlay and renders the existing database workspace as full-canvas content;
  the legacy management dialog remains available for power-user entry.
- Inline linked views' `Open full database` action now navigates to this route;
  record opening still returns to the ordinary Markdown document route.
- Focused evidence: route helpers 6 tests / 14 expectations, App + DatabaseView
  DOM suites 22 tests / 91 expectations, and DatabaseTableDialog page coverage
  included in the 54 / 302 suite. Full browser E2E remains unexecuted because
  the local Playwright Chromium download was incomplete.

### 2026-07-22 inline-first creation handoff slice

- The ephemeral `#database/new` page now keeps its creation intent until the
  exact-plan commit returns, even if the shell normalizes the draft hash while
  the request is in flight.
- A committed blank database closes the draft chooser once, replaces it with
  the canonical `#database/<database>/<source>/<view?>` route, and hands the
  page to the route-level workspace. The temporary page presentation is
  explicitly unmounted so the chooser cannot reopen over the new table.
- `DatabasePageRoute` now consumes both native hash changes and the existing
  replace-state navigation event. `initialAction="create"` is one-shot per
  open lifecycle, preventing a post-commit modal resurrection.
- Focused evidence: `DatabaseTableDialog.dom.test.tsx` 63/63 tests, 369
  expectations; `App.dom.test.tsx` + `DatabaseCreationDialog.dom.test.tsx`
  20/20 tests, 75 expectations; app typecheck and Biome pass. A live
  `127.0.0.1:5173/#database/new` browser journey created `Browser QA Tasks 7`
  and landed on a canonical route with a rendered table grid. This closes the
  route-handoff implementation gap, but not NUI-105/NUI-701 visual and
  Electron journey gates.

### 2026-07-22 inline first-row focus slice

- `DatabaseView` now marks the inline block when a blank database has just been
  created, and `DatabaseTable` consumes that intent once the canonical table
  renderer mounts. The title-cell `New row` input receives focus so the next
  action can be typed immediately, while ordinary linked-view loads do not steal
  focus.
- The page handoff keeps the database title visible rather than leaving the
  title editor open while the table settles. The route-level `HashChangeEvent`
  dispatch is now browser-safe through `window.HashChangeEvent`, with a
  regression test for the direct blank-creation route.
- Focused evidence: `DatabaseTableDialog.dom.test.tsx` passes 64 tests / 372
  expectations, including the inline new-row focus journey;
  `DatabaseView.dom.test.tsx` passes 13 tests / 116 expectations; app typecheck
  and `git diff --check` pass. The full server suite and broad E2E remain
  intentionally unrun.
- Follow-up: capture the same focus and visual continuity in the browser and
  Electron shells before closing NUI-103/NUI-105 visual gates.

### 2026-07-22 inline undo slice

- Direct-safe inline cell and first-row mutations now retain the verified
  commit's undo token and expose an inline `Undo inline database change`
  action. Undo first runs the canonical preview guard, then applies the undo
  with the same human actor/idempotency contract as the full workspace; a
  changed canonical revision leaves the token visible and reports the reason.
- Inline redo now uses the matching preview/apply contract, and the root
  surface handles `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` while leaving text-input
  undo to the browser/editor.
- Focused evidence: `DatabaseView.dom.test.tsx` passes 13 tests / 132
  expectations, including button undo/redo, keyboard shortcuts, and
  revision-conflict retention;
  app typecheck and `git diff --check` pass. The inline view remains locked
  only while saving, undoing, or redoing, and the existing optimistic cell/row behavior
  is preserved.
- Follow-up: cover undo for every alternate linked renderer and complete the
  broader agent transport/policy matrix before closing NUI-301.

### 2026-07-22 inline state-safety slice

- Inline linked-view failures now preserve typed problem kinds instead of
  treating every failure as a replacement candidate. Permission denial never
  falls back to a cached snapshot and exposes access guidance without a retry;
  missing source/view references expose `Choose replacement`; retryable offline,
  schema, index, conflict, and service failures expose a recovery action that
  does not replay a mutation.
- The inline root now exposes `aria-busy` during loading and stable
  `data-database-view-error-*` attributes for agent/browser diagnostics. The
  refresh control is disabled for permission and missing-reference states.
- Focused evidence: `DatabaseView.dom.test.tsx` passes 14 tests / 139
  expectations, including offline snapshot recovery and permission-denial
  cache isolation; app typecheck, Biome, and `git diff --check` pass. The full
  server suite and broad E2E remain intentionally unrun.

### 2026-07-22 inline loading and empty-state slice

- Inline linked views now expose a semantic loading status with `aria-busy` and
  a stable `data-database-state="loading"` marker. Empty Table sources retain
  the explicit empty message while keeping the last-row title input available
  as the immediate Notion-like add-page affordance.
- Focused evidence: `DatabaseView.dom.test.tsx` passes 16 tests / 146
  expectations, including unresolved loading and empty-source journeys; app
  typecheck, Biome, and `git diff --check` pass. The full visual state matrix
  and cross-host capture remain open.

### 2026-07-22 inline agent-context slice

- The inline `Database view actions` menu now opens the existing
  `What the agent saw` inspector scoped to the stable database/source/view
  reference. The inspector remains lazy-loaded and uses the canonical
  permission-scoped Context Pack contract; inline rendering does not embed
  record data or invent a second retrieval path.
- The inline selection toolbar now also exposes `Inspect selected context`.
  It passes the selected stable record IDs to the same permission-scoped
  Context Pack inspector, so an agent can inspect a bounded multi-record slice
  without opening the full workspace or copying record payloads into the host
  block.
- A single-property drag from inline Board, Calendar, or Timeline now uses the
  same direct-safe cell mutation path as an inline table edit; multi-property
  transitions still hand off to the reviewed canonical workspace.
- Focused evidence: `DatabaseView.dom.test.tsx` passes 17 tests / 161
  expectations, including database/view, single-record, selected-record, and
  inline Board transition entries; app typecheck, Biome, and `git diff --check`
  pass. Full agent replay and transport matrix gates remain open under
  NUI-601/NUI-603.

### 2026-07-22 mutation-policy matrix slice

- `database-mutation-policy.ts` now exposes an explicit 13-operation matrix:
  only human `user:*` cell/title/record-create/blank-create/view operations
  are automatic; every agent actor, non-user principal, schema, bulk,
  destructive, permission, external, migration, verification, and unknown
  elevated path remains review-required.
- Focused evidence: `database-mutation-policy.test.ts` passes 4 tests / 68
  expectations, including every operation and actor combination;
  `DatabaseTableDialog.dom.test.tsx` passes 64 tests / 372 expectations across
  canonical Table, Board, Timeline, Calendar, schema, and mutation journeys;
  app typecheck and Biome pass. Alternate renderer and transport-level
  integration evidence remains open under NUI-301.

### 2026-07-22 entry-point re-audit and convergence slice

- Re-audited the running-app entry surfaces against the Notion UX baseline.
  The normal `NewItemDialog` still supports only files/folders, while the
  database-specific entry points now exist in the command palette, sidebar
  toolbar, empty-space context menu, onboarding footer, and empty-editor
  footer.
- Those entry points all dispatch the typed `new` database event. `App.tsx`
  opens the same creation flow with page presentation, so future entry points
  do not create a second database writer or a modal-only fork.
- Added focused regression coverage: CommandPalette 21 tests / 176
  expectations, FileSidebar 20 tests / 119 expectations, and PackCardGrid 10
  tests / 41 expectations. App typecheck and `git diff --check` pass.
- Added the gap-driven execution document
  [0001-notion-ux-gap-implementation-checklist.md](./0001-notion-ux-gap-implementation-checklist.md).
  It records the remaining Notion mismatches and maps each implementation item
  to the UX gates. Visual gates remain open because the browser capture is not
  available.

### 2026-07-22 normal new-page entry slice

- The shared `NewItemDialog` now exposes a keyboard-accessible `New database`
  action on the normal file creation path. It closes the file dialog and
  dispatches the same typed database event used by the sidebar, empty states,
  command palette, and slash menu.
- The action is hidden in single-file mode. Focused coverage is in
  `packages/app/src/components/NewItemDialog.dom.test.tsx` (2 tests / 3
  expectations); app typecheck remains green.
- This closes the discovery gap but intentionally does not claim full Notion
  parity: the dialog still models file/folder as its primary type and the
  database choice still enters the reviewed creation flow. Promote it to a
  first-class Database/Table page type and direct-safe creation next.

### 2026-07-22 sidebar database navigator slice

- Added `DatabaseSidebarSection`, an on-demand catalog-backed sidebar section.
  It validates the compact catalog, lists database sources, follows the active
  `#database/<database>/<source>/<view?>` hash, and opens the same route without
  cloning records. Loading, empty, error/retry, and selected-source states are
  explicit.
- Focused evidence: `DatabaseSidebarSection.dom.test.tsx` (2 tests / 5
  expectations) and app typecheck. The section is intentionally not marked as
  full navigation parity yet: recent items, search, backlinks, and ordinary
  page chrome still need to converge on the same target.

### 2026-07-22 direct-safe mutation slice

- Routine title/cell edits and new-record creation now use the existing exact
  plan and canonical commit contract with automatic approval for the
  direct-safe policy. They refresh the canonical table without showing a ghost
  review or asking the user to click `Commit change`.
- Destructive deletion, schema/property, bulk, verification, and
  external/elevated actions still retain explicit ghost review. This preserves
  the agent/elevated safety boundary while removing the most common Notion UX
  interruption.
- Focused evidence: two targeted `DatabaseTableDialog.dom.test.tsx` journeys
  pass. Direct-safe cells now also render the pending value locally while the
  exact commit settles, with canonical state restored on success/failure. The
  remaining work is complete conflict/undo acknowledgement and a complete
  mutation policy matrix across every view/editor.

### 2026-07-22 navigation and save-feedback convergence slice

- Added the normal file-centric `NewItemDialog` a named, keyboard-accessible
  `New database` action, gated out of single-file mode. It dispatches the same
  typed creation event as the sidebar, empty states, command palette, and slash
  menu; it is intentionally not yet a first-class Database/Table kind.
- Added an on-demand `Databases` sidebar navigator backed by the validated
  catalog. It follows `#database/<database>/<source>` hash changes, marks the
  active source with `aria-current="page"`, and includes loading, empty, error,
  and retry states. It also listens for popstate and the dedicated navigation
  event emitted after canonical creation uses `replaceState`, so the new page
  becomes active without mounting a duplicate workspace.
- Added contextual page breadcrumbs/title/back action and a no-overlay,
  full-viewport page workspace for route-level databases. The management dialog
  remains available for administration.
- Database page state handling now distinguishes missing (404/not-found) from
  retryable failures and permission denial. Missing pages expose a safe
  `Back to databases` action; permission-denied pages expose no retry action.
  The page chrome remains mounted while catalog/target data is loading.
- Promoted the normal `NewItemDialog` database action to a visible,
  keyboard-accessible `Page`/`Database` type chooser. The Database choice still
  converges on the shared typed creation event; it does not introduce a second
  database writer or claim a separate canonical page kind.
- Added inline database page-title editing: click the page title, edit it in
  place, and press Enter to commit through the exact-plan path while preserving
  stable database/source IDs. Blank page creation focuses this title editor and
  keeps the first-row title field open in the same page workspace.
- Failed creation drafts now reopen the creation surface with the original
  typed title preserved for retry; full Escape/browser-back orphan prevention
  is now covered by an ephemeral `#database/new` history route: browser back
  closes the surface, Escape/cancel never reaches plan/commit, and successful
  creation replaces the ephemeral route with the canonical database target.
- Table View now keeps a `data-new-record-row` title input at the bottom of the
  canonical rows. Enter routes through the same direct-safe record plan and
  Escape clears the draft; empty sources expose this row instead of requiring
  the header dialog. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z now invoke conflict-safe
  undo/redo when focus is outside an editable control, covered by the exact
  bulk journey (18 expectations). After both commit and Escape cancellation,
  the edited cell is restored as the active cell (focused DOM journey, 5
  expectations). The full Table DOM suite is 63/63 tests and 369 expectations.
- Full-page saved-view tab changes now update the stable route hash with the
  selected view ID without cloning records. Inline → full-page conversion keeps
  the same database/source/view identity and exactly one stable record ID;
- Inline linked views now explain that records remain canonical/shared while
  view settings stay independent. After a successful query, a bounded
  per-tab `sessionStorage` last-verified snapshot is retained and shown with an
  explicit offline/stale status if a refresh loses transport. Only validated
  read snapshots are stored; credentials and pending writes never enter this
  cache, malformed entries are discarded, and the oldest views are evicted.
  `DatabaseView.dom.test.tsx` covers 13/13 tests and 116 expectations, while
  `database-linked-view-cache.test.ts` covers reload rehydration and eviction
  (2/2 tests, 5 expectations). At that earlier slice the full visual state
  matrix remained open under NUI-402; its functional gate is now closed and
  visual capture remains under NUI-701/NUI-702.
- Database creation now shows a bounded `First page preview` for template and
  CSV/TSV sample rows before review, while blank remains the fastest direct-safe
  path. The existing commit continuation selects the created source/view and
  opens the editable table after commit. At that earlier slice agent-authored
  preview and visual first-use evidence remained open under NUI-503; the
  resulting-page ghost preview now closes the functional gate, while visual
  first-use remains under NUI-701/NUI-702. Creation DOM coverage is 7/7 tests
  and 29 expectations.
- Record opens now preserve the originating database/view and loaded record
  order in a bounded session navigation state. The canonical record page
  exposes guarded Previous/Next and Back to database view actions; peek, full
  page, comments, history, and relations retain the same stable record
  identity. `DatabaseRecordPageChrome.dom.test.tsx` covers 2/2 tests and 32
  expectations, and `database-record-navigation.test.ts` covers 3/3 tests and
  6 expectations. Visual/cross-host continuity remains under NUI-105/NUI-701.
  reload/back-forward and conversion are covered by `App.dom.test.tsx`
  (13/13, 46 expectations) and `DatabaseView.dom.test.tsx` (13/13, 116
  expectations). NUI-204 is closed at the implementation/evidence layer;
  visual browser gates remain separate.
- Direct-safe cell edits and new-record creation now auto-approve the exact
  server plan, render a local optimistic value while it settles, and expose
  saving/saved/queued/failed feedback. Destructive, schema, bulk, permission,
  external, and other elevated operations still require explicit review.
- Centralized `database-mutation-policy.ts` now enforces the human direct-safe
  allow-list for cell/title/record-create/blank-create/view operations and
  defaults every other operation or non-user principal to required review.
- Blank human database creation follows the same direct-safe policy and opens
  the newly selected source/view with the first-record title field ready; starter
  templates, existing-folder manifests, and CSV/TSV imports remain reviewed.
- Database page chrome now follows the Notion-style hierarchy: filters, view
  settings, new-record, and archive visibility remain primary, while templates,
  automations, sharing, view management/defaults, import/export, and undo move
  under the accessible `More database actions` menu. This closes NUI-304 at the
  implementation/evidence layer.
- Linked inline database blocks now show the database/source title and a
  visible saved-view tab strip (with an active `aria-current` tab when multiple
  views exist), while preserving stable references. Offline-cache parity and
  the complete visual state matrix were the remaining NUI-402 work at that
  point; the functional gate is now closed and visual capture remains under
  NUI-701/NUI-702.
- Invalid inline database blocks now offer `Create new database`; the blank
  path compiles and commits through the same exact-plan engine, then writes only
  stable database/source/view props back to the host JSX node. This closes
  NUI-401 at the implementation/evidence layer; templates/imports and visual
  browser parity remain separate gates.
- The full database workspace's secondary actions now include
  `Inspect agent context`, wired through App to the existing What-the-agent-saw
  inspector. Database/source/view scopes now flow through the UI and filtered
  `/api/databases/inspect` list/detail contract; the server also supports
  record-scoped filtering, including all-record selection scopes. Table row
  actions, cell menus, and the selected-record toolbar expose compact context
  actions; citation labels render from captured evidence/full-body disclosures.
  The inspector now provides per-property All/None/checkbox controls plus a
  non-mutating selected-field JSON preview and approximate token count; server
  Context Packs continue to accept `propertyIds` for selective agent delivery.
- The Table Actions header now exposes a visible `+ Add property` affordance
  when the host provides schema management, opening the existing reviewed
  properties dialog. Each visible property header now also exposes a
  keyboard-accessible menu for show/hide, left/right reorder, calculations,
  rename/configure, type conversion, and dependency-aware delete. The reviewed
  properties dialog supports stable-ID inline rename plus the existing reorder
  and recovery-aware delete flow. The functional NUI-501 gate is now closed;
  pixel-level visual parity remains open under NUI-701/NUI-702.
- The active saved-view tab now exposes a keyboard-accessible options menu for
  Filters, View settings, and Manage views. Each tab also has a native drag
  handle; dropping on another stable view target compiles one exact
  `reorder-to` desired state rather than a sequence of races. The functional
  NUI-502 gate is now closed; full visual parity remains under NUI-701/NUI-702.
- Ghost review now leads with a human-readable action summary and keeps plan
  ID/hash/snapshot under collapsed exact details. Selective approval and full
  Agent Runs handoff remain open under NUI-602/NUI-603.
- Focused evidence: `DatabaseTableDialog.dom.test.tsx` 63/63 tests and 365
  expectations, `DatabasePropertiesDialog.dom.test.tsx` 7/7 (23
  expectations), `DatabaseCreationDialog.dom.test.tsx` 7/7 (29 expectations),
  `DatabaseContextInspectorDialog.test.tsx` 6/6 (25 expectations),
  `DatabaseContextInspectorDialog.dom.test.tsx` 1/1 (8 expectations),
  `database-context-inspector.test.ts` 3/3 (13 expectations),
  `database-data-plane-api.test.ts` 32/32 (317 expectations),
  `database-commit.test.ts` 47/47 (505 expectations; includes redo
  preview/apply, restart rehydration, and idempotent replay),
  `App.dom.test.tsx` 13/13 (46 expectations), `DatabaseView.dom.test.tsx` 13/13
  (116 expectations), `DatabaseRecordPageChrome.dom.test.tsx` 2/2 (32
  expectations), `NewItemDialog.dom.test.tsx` 2/2 (7 expectations), `DatabaseSidebarSection.dom.test.tsx`
  3/3, `FileSidebar.dom.test.tsx` 20/20, app typecheck, targeted Biome, diff
  check, and documentation-link validation. The 10-minute full server suite
  was not run.

### 2026-07-22 omnibar database-target slice

- The command palette now loads the validated database catalog on open and
  searches database/source names, human keys, and purpose text alongside normal
  workspace navigation. Results show human labels rather than stable IDs and
  navigate to the encoded `#database/<database>/<source>` target.
- Database page recents now persist the stable route plus display metadata, so a
  later palette open can render a useful label without treating the route as a
  filesystem path. Invalid or stale database recents are filtered out.
- Focused evidence: `CommandPalette.dom.test.tsx` 22/22 tests and 182
  expectations, `database-navigation-entries.test.ts` 2/2, and
  `command-palette-recents.test.ts` 5/5. Backlinks now preserve anchors through
  the canonical record-document route, and relations use the same route rather
  than reopening the global database manager; `DatabaseRecordPeek.dom.test.tsx`
  (1/7), `DatabaseRelationsDialog.dom.test.tsx` (1/2), and
  `database-navigation.test.ts` (9/23) cover that convergence. NUI-201 is now
  closed at the implementation/evidence layer; visual browser gates remain
  under NUI-105/NUI-701.

### 2026-07-22 inline table mutation slice

- Inline `DatabaseView` now wires the table's existing TSV clipboard path into
  the canonical mutation engine. A single-cell paste uses the same direct-safe
  cell plan, optimistic value, refresh, and failure cleanup as keyboard edits.
- A multi-cell paste is never auto-approved: its stable record/property/value
  changes are forwarded to the full database workspace, where one exact table
  paste plan opens the existing Ghost review surface. Discard leaves canonical
  records untouched; Commit remains the only bulk-write path.
- Inline table blocks now wire the table-edge `+ Add property` and property
  header menus to the reviewed properties surface. The linked-view action menu
  also exposes `Filters`, `Manage properties`, `View settings`, and `Manage views`,
  forwarding the stable property/view target into the same canonical workspace
  dialogs.
- Focused evidence: `DatabaseView.dom.test.tsx` 13/13 tests and 104
  expectations now cover single-cell paste, multi-cell review forwarding,
  review discard, and the inline property-surface handoff; app typecheck and
  targeted Biome pass. The existing
  `DatabaseTableDialog.dom.test.tsx` 63/63 suite still covers the canonical TSV
  planner and review behavior. No full server suite or E2E rerun was needed.

### 2026-07-22 inline selection and bulk-action handoff slice

- Inline table rows now expose the existing accessible record checkboxes and
  keep selection in the linked block without copying records or inventing a
  second mutation path. The inline toolbar reports the selected count and
  offers `Open bulk actions` plus `Clear selection`.
- `Open bulk actions` carries the stable selected record IDs into the canonical
  full database workspace. The reviewed bulk toolbar is visible there, so
  Copy TSV, bulk property edits, and other elevated changes retain the existing
  exact-plan/Ghost review boundary. Closing the workspace preserves the inline
  selection until the user explicitly clears it.
- Focused evidence: `DatabaseView.dom.test.tsx` 13/13 tests and 109
  expectations now cover row selection, stable-ID handoff, reviewed bulk
  toolbar visibility, close/preserve, and clear-selection behavior. App
  typecheck and targeted Biome pass; the repository-wide typecheck remains
  blocked by the native-config `cargo metadata` environment error.

### 2026-07-22 inline saved-view management slice

- Inline database action menus now expose `Manage views` in addition to
  `Manage properties` and `View settings`. The action forwards into the
  canonical `DatabaseViewManagerDialog`, so creating, renaming, duplicating,
  reordering, and deleting saved views keep the existing exact-plan/review
  behavior and stable view identities.
- Focused evidence: the linked-view DOM journey now covers the menu entry and
  `Manage saved views` surface; the suite passes 13/13 tests and 112
  expectations. Targeted Biome and app typecheck pass, with no E2E rerun.

### 2026-07-22 inline saved-view tab-plus slice

- When a linked source has multiple saved views, the inline tab strip now shows
  an adjacent `New database view` button. It forwards to the canonical reviewed
  view manager, so the inline path gains Notion-like tab adjacency without
  creating a second manifest mutation route.
- Focused evidence: `DatabaseView.dom.test.tsx` passes 17 tests / 164
  expectations, including opening and closing `Manage saved views` from the
  inline tab `+`; app typecheck, Biome, and `git diff --check` pass. Full visual
  parity remains open under NUI-701/NUI-702.

### 2026-07-22 inline property-context inspection slice

- Each visible database property header now exposes `Inspect property context`
  next to the existing visibility, reorder, calculation, configuration, type,
  and delete actions. Full and inline tables forward the stable
  database/source/view plus `propertyIds` to the canonical Context Inspector;
  no property values are copied into the inline host block.
- The HTTP inspector contract now validates comma-separated `prop_*` IDs and
  filters captured packs by every requested property. A property is considered
  in scope when it was returned in the pack schema or recorded in the pack's
  omission list, preserving permission/token-budget diagnostics.
- Focused evidence: `DatabaseView.dom.test.tsx` passes 17 tests / 168
  expectations; `DatabaseTableDialog.dom.test.tsx` passes 64 tests / 374
  expectations; `DatabaseContextInspectorDialog.test.tsx` passes 6 tests / 25
  expectations; server context-inspector/API focused tests pass 35 tests / 338
  expectations. App/server typecheck, targeted Biome, and diff checks pass; no
  full server suite or broad E2E rerun was needed.
- Follow-up: keep NUI-601's visual/browser evidence and NUI-603 Agent Runs
  inspect/undo/retry/resume gates open until real-host capture is available.

### 2026-07-22 inline single-view tabs slice

- Inline linked databases now render the active saved-view tab and adjacent
  `New database view` action even when the source has only one saved view.
  Switching tabs remains a stable database/source/view reference update, and
  the `+` action still opens the canonical reviewed saved-view manager.
- Existing alternative-view journeys now locate view names by heading so the
  new tab label cannot make renderer assertions ambiguous.
- Focused evidence: `DatabaseView.dom.test.tsx` passes 18 tests / 171
  expectations, including a single-view tab/action journey; app typecheck,
  Biome, and `git diff --check` pass. No server suite or E2E rerun was needed.
- Follow-up: capture the tab strip in the browser/Electron visual gates under
  NUI-701/NUI-702; the functional NUI-502 gate is now closed.

### 2026-07-22 inline full-page mode preservation slice

- Saved-view tab changes now preserve the linked block's current presentation
  mode. A full-page linked block remains `mode="full-page"` after switching to
  another saved view; invalid references still default safely to inline mode
  when a new database is selected.
- Focused evidence: `DatabaseView.dom.test.tsx` passes 18 tests / 172
  expectations, including host attribute handoff in full-page mode; app
  typecheck, Biome, and `git diff --check` pass. No server suite or E2E rerun
  was needed.
- Follow-up: keep browser/Electron route continuity evidence open under
  NUI-204/NUI-105.

### 2026-07-22 inline active-view tab menu slice

- The active inline saved-view tab now has its own accessible options button
  with `Filters`, `View settings`, and `Manage views`. Each action opens the
  existing canonical reviewed workspace surface; the inline block does not add
  a second settings or mutation implementation.
- Focused evidence: `DatabaseView.dom.test.tsx` passes 18 tests / 177
  expectations, including opening Filters from the active tab menu; app
  typecheck, Biome, and `git diff --check` pass. No server suite or E2E rerun
  was needed.
- Follow-up: visual-check the tab/menu spacing in browser and Electron under
  NUI-701/NUI-702; the functional NUI-502 gate is now closed.

### 2026-07-22 token-efficient context copy slice

- The Context Inspector's selected-field preview now has a `Copy` action. It
  copies only the locally projected JSON (never mutating or re-fetching the
  captured pack), keeps the computed approximate token count visible, changes
  to `Copied` on success, and reports an explicit manual-copy fallback when
  the browser/desktop clipboard is unavailable.
- Focused evidence: `DatabaseContextInspectorDialog.dom.test.tsx` passes 1 test
  / 10 expectations; `DatabaseContextInspectorDialog.test.tsx` passes 6 tests /
  25 expectations; app typecheck, Biome, and `git diff --check` pass. No server
  suite or E2E rerun was needed.
- Follow-up: connect this compact projection to any future agent handoff
  surface without bypassing the server's permission-scoped Context Pack.

### 2026-07-22 inline alternative-view context slice

- Inline Board cards, Calendar cards, and Timeline records now expose the same
  `Inspect context for record …` action already available in Table rows. The
  action is available from the Timeline table, scheduled bars (including when
  the table is hidden), and no-date lane, so changing the primary view does not
  remove an agent's record-scoped inspection path.
- `DatabaseView` forwards each action to the canonical permission-scoped
  Context Inspector with only the stable record ID; no record payload is copied
  into the inline host block.
- Focused evidence: `DatabaseBoard.dom.test.tsx`,
  `DatabaseCalendar.dom.test.tsx`, and `DatabaseTimeline.dom.test.tsx` pass 11
  tests / 39 expectations together; `DatabaseView.dom.test.tsx` passes 18
  tests / 180 expectations and asserts the callback is wired for all three
  renderers. App typecheck, targeted Biome, and `git diff --check` pass. No
  server suite or E2E rerun was needed.
- Follow-up: extend the same affordance to other record-centric renderers if
  the visual review shows their action density remains acceptable; keep the
  browser/Electron and accessibility gates open under NUI-601/NUI-702.

### 2026-07-22 inline list/gallery/feed context slice

- Inline List rows, Gallery cards, and Feed items now expose the same
  `Inspect context for record …` action as Table and the other primary views.
  List actions stop row click propagation, so inspecting a record never opens
  the canonical page accidentally; Gallery keeps the action available in both
  title and no-title card layouts.
- `DatabaseView` forwards the action to the canonical permission-scoped
  Context Inspector with only the stable record ID, preserving the inline
  host's stable-reference-only contract.
- Focused evidence: `DatabaseList.dom.test.tsx`,
  `DatabaseGallery.dom.test.tsx`, and `DatabaseFeed.dom.test.tsx` pass 7 tests
  / 31 expectations together; `DatabaseView.dom.test.tsx` passes 18 tests /
  183 expectations and asserts the callback is wired for List, Gallery, and
  Feed. App typecheck, targeted Biome, and `git diff --check` pass. No server
  suite or E2E rerun was needed.
- Follow-up: keep NUI-601's browser/Electron and accessibility gates open; chart
  and map actions are intentionally attached to their drill-through/record
  boundaries rather than the aggregate canvas itself.

### 2026-07-22 inline chart/map context slice

- Inline Chart drill-through rows now expose `Inspect context for record …`
  beside `Open record`; the chart remains aggregate-first and does not pretend
  that a bar or number card contains a complete record payload.
- Inline Map exposes the action for a single mapped pin, each record in an
  expanded cluster, and each missing-location entry. Cluster and map controls
  keep pointer events isolated from panning.
- `DatabaseView` forwards both actions to the canonical permission-scoped
  Context Inspector with only the stable record ID.
- Focused evidence: `DatabaseChart.dom.test.tsx` and
  `DatabaseMap.dom.test.tsx` pass 7 tests / 24 expectations together; app
  typecheck, targeted Biome, and `git diff --check` pass. No server suite or
  E2E rerun was needed.
- Follow-up: visual-check marker/button density and chart drill-through spacing
  in browser/Electron before closing the remaining NUI-601/NUI-702 gates.

### 2026-07-22 database creation review summary slice

- The creation ghost review now leads with a human-readable summary such as
  `Create 1 database manifest`, a compact scope/risk line, and the same
  collapsed Plan/Plan hash/Snapshot details used by record ghost review.
  `Commit creation` remains the only approval action; this does not add a
  partial or selective commit path.
- The shared human-summary formatter now names manifest actions as Create,
  Update, or Delete and pluralizes template/manifest counts for progressive
  disclosure without exposing raw IDs in the primary sentence.
- Focused evidence: the existing folder-creation review journey passes with
  the new summary assertions (1 test / 7 expectations); app typecheck,
  targeted Biome, and `git diff --check` pass. The complete
  `DatabaseTableDialog.dom.test.tsx` suite was not rerun after this small UI
  change; no server suite or E2E rerun was needed.
- Follow-up: keep NUI-602 open until selective approval is backed by an
  atomic-safety proof and Agent Runs can explain/resume the same receipt.

### 2026-07-22 Agent Run progressive inspection slice

- Agent Run details now show a compact scope summary (`databases · sources ·
  properties · views · records`) and an exact-diff byte summary before the raw
  scope/proposed-diff JSON. The JSON remains available in collapsed details for
  debugging and audit, but it no longer dominates the first inspection view.
- Existing undo preview/apply behavior and the owner-only `/api/databases/runs`
  contract are unchanged; this is a presentation-only reduction in token and
  scanning cost.
- Focused evidence: `DatabaseAgentRunsDialog.dom.test.tsx` passes 3 tests / 14
  expectations; app typecheck, targeted Biome, and `git diff --check` pass. No
  server suite or E2E rerun was needed.
- Follow-up: NUI-603 remains open for retry/resume and independent receipt
  handoff; this slice only improves inspectability.

### 2026-07-22 inline alternative-view mutation slice

- Inline Board, Calendar, and Timeline changes now stay on the direct-safe
  mutation path even when one record changes multiple cells (for example a
  two-field Timeline range move). The desired state is compiled as one exact
  record mutation, so the server's revision and precondition checks remain
  atomic; multi-record bulk actions still route to the reviewed workspace.
- While the commit is in flight, `DatabaseView` projects the pending values
  into every alternate renderer. Board group memberships are updated for the
  pending record as well, so a drag does not visually snap back; canonical
  values are still refreshed from the server after a verified receipt. Existing
  inline undo/redo tokens and conflict previews are unchanged.
- Focused evidence: `DatabaseView.dom.test.tsx` passes 18 tests / 187
  expectations, including a delayed-commit Board optimistic integration;
  `DatabaseBoard.dom.test.tsx` (3 / 13), `DatabaseCalendar.dom.test.tsx`
  (4 / 12), and `DatabaseTimeline.dom.test.tsx` (4 / 14) pass their typed
  transition/resize/context journeys. App typecheck, targeted Biome, and
  `git diff --check` pass. No full server suite or E2E was run.
- Checklist status at this point in the earlier slice: NUI-301 remained open;
  the follow-up view-order slice below adds the missing undo/redo and policy
  evidence before closing it.

### 2026-07-22 inline view-order optimism slice

- Saved-view tabs now derive a next order from stable view IDs and project that
  order immediately during a drag/drop reorder. The optimistic order remains
  visible while the exact plan commit is in flight, clears on blocked/failed
  plans, and is replaced by canonical server state after commit, undo, or redo.
  Human view edits still use the centralized direct-safe policy; agent and
  non-user principals remain review-required.
- Focused evidence: the full `DatabaseTableDialog.dom.test.tsx` suite passes
  64 tests / 387 expectations. Its delayed-commit reorder journey asserts the
  immediate tab order, `Saving` state, canonical refresh, and revision-bound
  undo/redo (preview/apply for both directions). `DatabaseView.dom.test.tsx`
  passes 18 tests / 205 expectations, including delayed-commit Board,
  Calendar, and Timeline edits with optimistic rendering and undo/redo.
  `database-mutation-policy.test.ts` passes 4 tests / 68 expectations; focused
  server commit tests cover approval failure and Agent Run lifecycle states;
  HTTP commit conformance passes 1 test / 22 expectations, MCP commit/undo
  tools pass 6 tests / 17 expectations, and the cross-transport contract passes
  1 test / 12 expectations.
  App typecheck, targeted Biome, and `git diff --check` pass. No full server
  suite or E2E rerun was needed.
- Checklist status: **NUI-301 is closed (30/42 UX-gap items)**. NUI-603
  remains open for durable Agent Run retry/resume and independent receipt
  handoff; browser/Electron and usability gates remain separate release work.

### 2026-07-22 inline filter handoff slice

- Inline database action menus now expose `Filters`, forwarding the selected
  stable view into the canonical `DatabaseAdvancedFilterDialog`. Saving a
  filter still compiles one reviewed view mutation; canceling leaves the
  canonical manifest and inline records unchanged.
- Focused evidence: the linked-view DOM journey covers the `Advanced saved
  filters` surface and closes the parent workspace cleanly; the suite passes
  13/13 tests and 116 expectations. Targeted Biome and app typecheck pass, with
  no E2E rerun.

### 2026-07-22 browser-renderer unblock and first-use capture

- The development compiler crash in `DatabaseContextInspectorDialog` was
  caused by a chained `new TextEncoder().encode(...).byteLength` expression.
  Splitting the calculation keeps the same token estimate and restores the
  dynamic import in the running web app.
- Focused evidence: `DatabaseContextInspectorDialog.dom.test.tsx` 1/1 test,
  8 expectations; app typecheck and targeted Biome pass. A live browser capture
  now renders the shell and the `Create database` modal at
  `http://127.0.0.1:5173/`. The capture intentionally leaves NUI-105 and the
  corresponding visual UX gates open because the first-use surface is still a
  modal over the editor and Electron has not been captured.

### 2026-07-22 dependency and privacy review slice

- Updated the direct security-sensitive ranges for `shell-quote`, `ws`, Vite,
  Mermaid, `@opentelemetry/core`, Next, and Turbo, added bounded root overrides
  for compatible fixed transitive versions, refreshed `bun.lock`, and repeated
  `bun audit --json`. The scan improved from 99 findings (including two
  critical) to 58 findings with zero critical findings; remaining high
  findings are concentrated in brace expansion, Hono, js-yaml, linkify-it, and
  Next and still need review.
  The exact before/after disposition is in
  [0001-database-security-scan-2026-07-22.md](./0001-database-security-scan-2026-07-22.md).
- Added user-facing database retention, deletion, recovery, and CSV/JSON
  export copy to the [Databases guide](/docs/features/databases#privacy-retention-deletion-and-export)
  and linked it from the release review. A named privacy reviewer and release
  approver are still required; L-017 remains open.
- Post-update focused verification passed: server typecheck; the commit suite
  (47 tests / 492 expectations); API/MCP/final-evaluation suite (10 tests / 71
  expectations); app, desktop, and docs typechecks; app production build;
  notices generation; documentation link validation; and `git diff --check`.
  No full server suite was run.

### 2026-07-22 Agent Run recovery handoff and restart slice

- Failed agent runs now expose `Retry run` and `Resume run` in the Agent Runs
  detail surface. Each action keeps the failed run as audit history and creates
  a new attempt from the same immutable plan rather than mutating the current
  view or overwriting the original run.
- The HTTP `/api/databases/runs` contract binds recovery to the source run
  revision and exact plan hash, accepts an explicit approval/autonomy token,
  and replays an idempotent retry key without duplicating the database write.
  Recovery metadata is additive in the core Agent Run schema and stores only a
  SHA-256 idempotency-key hash.
- The new `data_run` MCP tool mirrors the list/get/retry/resume HTTP contract,
  keeps recovery approval-gated, and returns compact machine-readable run and
  receipt payloads. It is included in the database-sandbox profile and in the
  closed MCP auto-approval deny-list so retry/resume cannot be silently
  approved.
- Focused evidence: `database-agent-run-store.test.ts` passes 6 tests including
  exact sidecar round-trip, tamper, and missing-plan recovery; the retry HTTP
  contract passes 1 test / 8 expectations, including a fresh-engine restart
  simulation; and
  `DatabaseAgentRunsDialog.dom.test.tsx` passes 4 tests / 23 expectations,
  including a compact progressively disclosed recovery receipt summary. The
  `data_run` MCP tool passes 4 tests / 10 expectations and the 31-tool registry
  plus terminal-gating contract passes 13 tests / 98 expectations.
  The owner-only Agent Runs store now atomically persists exact plan/draft
  sidecars, validates their revision, restores them into a fresh plan engine,
  and returns a typed recreate-plan recovery when the bundle is missing.
  Core/server typechecks, targeted Biome, and `git diff --check` pass. No full
  server suite or E2E rerun was needed.
- NUI-603 is closed for focused implementation evidence. Selective approval and
  real model/agent replay remain separate release gates.

### 2026-07-22 atomic approval scope slice

- Ghost review now exposes required approval scopes in a human-readable
  `Atomic approval group` section. The UI explains that the exact plan commits
  as one referential/rollback-safe unit instead of presenting misleading
  per-field toggles.
- HTTP and `data_commit` MCP accept optional `approvalCodes` for an explicit
  approval receipt. The commit engine compares them with the exact plan's
  required scopes and rejects any partial or duplicate selection with the
  complete atomic group; no canonical mutation starts on rejection.
- Focused evidence: the creation preview DOM journey asserts the approval
  scope; `database-commit.test.ts` asserts partial-selection refusal and its
  required scopes; server/app typechecks and targeted Biome pass. No broad E2E
  or full server suite was run.
- NUI-602 is closed for focused implementation evidence. Plans that can be
  safely split can add a future explicit group model; until then the contract
  deliberately explains and enforces one atomic group.

### 2026-07-22 property-context checklist closure

- The existing canonical property-management surface now has complete focused
  evidence for the table-edge `+ Add property` action, visible header menus,
  stable-ID rename, show/hide and reorder, calculations, type conversion, and
  dependency-aware delete/recovery previews. Inline tables and linked-view
  actions route to that same reviewed surface rather than exposing a second
  mutation implementation.
- The verified `DatabaseTableDialog.dom.test.tsx` suite covers the current
  schema/property journeys in 64 tests / 387 expectations; the focused
  `DatabasePropertiesDialog.dom.test.tsx` rename/reorder/delete suite passes 7
  tests / 23 expectations. This closes **NUI-501**, taking the UX-gap count to
  **31/42 (73.8%)**. Pixel-level parity, browser/Electron capture, and
  accessibility checks remain separate release gates.

### 2026-07-22 saved-view settings checklist closure

- Saved-view tabs now have stable-ID drag/keyboard reorder and an active-tab
  options menu that routes Filters, View settings, and Manage views to the
  canonical reviewed surfaces. View settings covers layout-specific options,
  filters, sorts, groups, projected properties, conditional colors, and open
  behavior; inline linked views preserve the same route and full-page mode.
- Focused evidence remains the verified `DatabaseTableDialog.dom.test.tsx`
  default-view/reorder journeys (64 tests / 374 expectations in that slice),
  plus `DatabaseView.dom.test.tsx` (18 tests / 183 expectations) for inline
  tabs, single-view `+`, active-tab menu, and full-page continuity. This closes
  **NUI-502**, taking the UX-gap count to **32/42 (76.2%)**. Pixel-level parity
  and browser/Electron/a11y gates remain separate release work.

### 2026-07-22 resulting-page creation preview closure

- Blank creation remains the direct-safe fastest path. Template and CSV/TSV
  creation already show bounded first-page previews in the creation dialog; the
  exact-plan ghost review now carries that preview into the approval surface
  for agent-shaped creation plans as well. It shows human property labels and
  example values before commit, while exact IDs/hashes remain collapsed in the
  plan details.
- Focused evidence: `DatabaseCreationDialog.dom.test.tsx` passes 7 tests / 29
  expectations and the new `DatabaseTableDialog.dom.test.tsx` resulting-page
  journey passes 1 test / 3 expectations. This closes **NUI-503**, taking the
  UX-gap count to **33/42 (78.6%)**. Visual first-use and cross-host gates stay
  under NUI-701/NUI-702.

### 2026-07-22 inline linked-view state checklist closure

- Inline linked databases now expose the canonical database/source title, the
  active saved-view tab with stable references, and the shared-record
  explanation. Loading, empty, permission, offline, stale, and retry states
  retain explicit state markers; validated per-tab snapshots survive reload in
  bounded `sessionStorage` without storing credentials or pending writes.
- Focused evidence: `DatabaseView.dom.test.tsx` covers 18 tests / 183
  expectations in the linked-view state slice, and
  `database-linked-view-cache.test.ts` passes 2 tests / 5 expectations. This
  closes **NUI-402**, taking the UX-gap count to **34/42 (81.0%)**. The complete
  visual state matrix and cross-host capture remain under NUI-701/NUI-702.

## Verification already completed

Do not rerun these simply for reassurance; rerun only when later edits touch
their scope.

- Core/server/app/desktop type checks passed for P-011 determinism work.
- Core property invariants passed: 3 tests / 768 expectations.
- Starter database tests passed: 8 tests / 47 expectations; app typecheck passed.
- Database diagnostics tests passed: 10 tests / 27 expectations; app typecheck
  passed.
- Held-out discovery/retrieval evals passed: 9 tests / 81 expectations.
- Focused release-gate server security/recovery set passed: 26 tests / 95
  expectations. Core invariant/migration set passed: 19 tests / 831
  expectations. The bounded performance set passed 2 tests; lifecycle benchmark
  took 22.2 seconds.
- Cross-runtime determinism command passed 21 tests across seven files.
- Focused resource regression passed: 50k retained estimate 279,988,258 bytes,
  canonical index JSONL 112,730,652 bytes, context pack 7,486/7,500 estimated
  tokens with 95 records.
- App production build and size-limit passed after the database workspace split:
  main JS 524.36 kB gzip, all JS 3.44 MB, CSS 57.02 kB, database workspace
  chunk 82.01 kB. Budgets are 550 kB, 3.60 MB, 60 kB and 90 kB.
- Table/Board/Chart/Map focused DOM run passed 57 tests / 322 expectations.
- Table/Feed/Form localization-adoption run passed 53 DOM tests; locale helper
  passed two seeded locale tests; app typecheck passed.
- Navigation, database record-page chrome and stable-ID realtime Table tests
  passed; app typecheck passed.
- Focused Unicode/IME, destructive delete review and permission revoke tests
  passed.
- Prettier/Biome checks passed for the new templates, diagnostics export, docs,
  focused E2E test, and release workflow.
- No repository-wide server suite was run.

The new primary-journey Playwright file is
`packages/app/tests/stress/database-primary-journeys.e2e.ts`. It is typed and
formatted. The local Chromium/headless-shell binaries are now available. The
first browser attempt exposed an existing React Compiler transform failure in
the inline creation dialog; that `try/catch/finally` boundary was rewritten as
a promise chain and the focused `DatabaseView` DOM suite still passes. A full
browser rerun was deliberately deferred after the user requested that E2E not
be run repeatedly; R-005 stays open until one complete run and an Electron
capture are available. The in-app browser observation is useful visual evidence
for the web shell, but it is not an E2E pass.

## Work in progress: do this first

`packages/core/src/database/property-invariants.test.ts` is now verified and
supports R-006 with deterministic seeds covering:

- filter + numeric sort + snapshot pagination without loss/overlap;
- arithmetic Formula evaluation;
- portable manifest/record bundle byte round trips;
- deterministic, content-free transaction receipt round trips.

Re-run only when the shared core/database files change:

```bash
bun test --cwd packages/core --conditions development \
  src/database/property-invariants.test.ts
bun run --cwd packages/core typecheck
bunx biome check packages/core/src/database/property-invariants.test.ts
```

The focused run passed. Transaction and interchange behavior are also covered
by the companion tests listed in the release-gates workflow; R-006 is already
closed in the authoritative checklist.

## Remaining numbered items

### Human/release approval items

- **L-017** — complete the security/privacy review. The evidence template is
  [0001-database-security-privacy-release-review.md](./0001-database-security-privacy-release-review.md).
  The dependency scan attachment records the initial 99-advisory snapshot and
  the latest non-passing rerun at 58 advisories (zero critical, 14 high); keep
  remediating or record named, time-bounded exceptions, then obtain approvals.
  Do not self-sign public-beta or GA approvals.
- **Q-012** — complete usability testing for creation, Table editing, view
  configuration, Relations, bulk changes and agent review. Automated DOM tests
  are supporting evidence, not a substitute for observed user sessions.

### Tests, observability and evaluation

- **R-005** — primary-view DOM and end-to-end journeys. DOM coverage now passes
  for creation, diagnostics, Table, view manager, and all linked renderers. The
  new primary-journey E2E file is blocked only by the missing local Playwright
  browser binary; run it on a browser-enabled runner before closing this item.
- **R-017** — >=90% prompt-to-valid-database creation without manual repair.
  The reusable evaluator and focused replay-shaped test now exist at
  `packages/server/src/database-creation-eval.ts` and
  `database-creation-eval.test.ts`; keep R-017 open until a real model/agent
  output replay is attached rather than counting the deterministic test
  planner as model evidence.
- **R-018** is closed with a transport-neutral final-state evaluator and a real
  commit → Context Pack → undo scenario. The focused suite passes 2 tests / 9
  expectations; it rejects wrong citations and partial recovery.
- **R-019** — CI release gates for accessibility, performance, security,
  migration and data loss. The focused workflow is committed in the worktree;
  attach its first hosted run before checking the box.

### Documentation and release readiness

- **S-001** user documentation for every released database concept and feature.
- **S-002** agent documentation for discovery, retrieval, Agent Views,
  plan/commit/approval/verification/undo and budgets.
- **S-003** complete annotated canonical manifest and record examples.
- **S-004** API/MCP schemas, examples, recovery, versioning, limits and security.
- **S-005** Notion/CSV/Markdown/Obsidian migration guides and loss matrices.
- **S-006/S-007** are closed with the starter-database and diagnostics-export
  evidence above.
- **S-008/S-009** are closed: `bun run notices` passed on 2026-07-21 and the
  database changeset contains the required user-facing release note.
- **S-010** is closed with the 2026-07-22 web/server/CLI/macOS desktop,
  standalone clone, remote Git, and direct/HTTP/MCP agent-harness evidence
  recorded in the authoritative checklist.
- **S-011** is closed with migration refusal, restart/backup restore, exact
  undo, and clean-clone/remote round-trip evidence recorded in the authoritative
  checklist. Unsupported or lossy downgrade remains an explicit refusal, as
  required by the runbook.
- **S-012** is closed: the public agent reference documents feature states,
  downgrade semantics, and unsupported combinations.

## Milestone release gates still open

There are 20 milestone gates after the numbered checklist. Keep them open until
their broad evidence is actually assembled:

- **M1 (5):** restart/cache persistence; common editable properties; complete
  primary mutation journey; watcher/index consistency; no critical data-loss,
  identity or transaction defects.
- **M2 (5):** collaborative feature E2E; failure/conflict suites; retrieval
  gates; Review-mode mutation gates; accessibility/security/50k budgets.
- **M3 (4):** parity-matrix completeness; explicit Notion loss reporting;
  web/desktop usability and accessibility review; public docs/examples.
- **M4 (6):** all agent eval thresholds; inspector/run explainability;
  adversarial autonomy budgets; production-scale durable recovery; zero
  critical release issues; clean standalone clone without hidden services.

## Recommended execution order

1. Run the new primary-journey Playwright file on a browser-enabled runner and
   attach the first hosted R-019 workflow result. This should identify missing
   tests instead of duplicating the existing 124 app DOM tests and many focused
   recovery/race suites.
2. Create the missing prompt-to-valid-database eval harness for R-017; record
   its threshold and held-out baseline in machine-readable output.
3. Attach the first hosted run of the focused R-019 workflow, then perform the
   S-010/S-011 platform and upgrade/restore rehearsals.
4. Schedule Q-012 user sessions and obtain the L-017 named approvals. These are
   legitimate external gates, not reasons to stop the engineering work above.

## Worktree cautions

- This is a very large dirty worktree (roughly 350 modified/untracked entries).
  Treat every existing change as intentional. Do not reset, clean, overwrite or
  mass-format unrelated files.
- Use `apply_patch` for edits. Inspect overlapping hunks before changing large
  files such as `DatabaseTableDialog.tsx`, `server-factory.ts` and
  `api-extension.ts`.
- `DatabaseTableDialog` and other large database components use `'use no memo'`
  because the current React Compiler rejects some control-flow shapes. Avoid
  reintroducing `try/finally` inside compiled components.
- App offline mutation validation must remain browser-safe through core; do not
  import server runtime schemas into the browser bundle.
- DOM tests do not consistently install jest-dom matchers. Prefer direct
  attributes/text or basic Bun matchers.
- Focused app DOM command:

  ```bash
  bun run --cwd packages/app test:dom path/to/file.dom.test.tsx
  ```

- Focused server command:

  ```bash
  bun test --cwd packages/server --conditions development path/to/test.ts
  ```

- Do not run the complete server suite while iterating. Final cross-package or
  release verification may still require `bun run check`, but only after the
  remaining focused gates and documentation are ready.

## Definition of final handoff success

The work is not finished when the numbered count reaches 310/310 alone. Final
completion requires all 20 milestone boxes, public/agent documentation,
standalone-clone verification, security/privacy approval and usability evidence
to be checked with authoritative artifacts. At that point rerun the release-
appropriate checks, audit every checkbox against its evidence, and only then
mark the persistent goal complete.
