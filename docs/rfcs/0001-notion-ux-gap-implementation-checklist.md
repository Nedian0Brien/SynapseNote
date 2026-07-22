# RFC 0001: Notion UX gap implementation checklist

- Status: Active
- Re-audit date: 2026-07-22
- Scope: database creation, navigation, editing, inline views, and agent
  handoff in the web and Electron editor
- UX audit: [Notion UX alignment checklist](./0001-notion-ux-alignment-checklist.md)
- Engine checklist: [database implementation checklist](./0001-databases-implementation-checklist.md)

This is the execution checklist produced from the current implementation audit.
It is intentionally separate from the parity matrix: a capability can be
complete in the engine while the same action is still hard to discover or
unlike Notion for a human user.

## Current finding

SynapseNote has a broad database engine and a strong safety/agent contract. The
largest remaining mismatches are:

1. The creation chooser is now a first-class Page/Database choice and Blank
   lands directly on an editable table, but templates, existing-folder, CSV,
   and agent-assisted flows still feel like reviewed administration rather than
   Notion's immediate page-first creation. Visual first-use and preview parity
   remain open.
2. Database workspaces now resolve through sidebar, recent/search, backlinks,
   relations, and a stable page route. The remaining mismatch is visual
   convergence with ordinary document chrome plus complete cross-host capture;
   `Open databases` remains the explicit administration surface.
3. Direct-safe human cell/title/row/view writes now use a centralized policy,
   optimistic acknowledgement, and exact undo; schema, destructive, bulk,
   permission, external, and agent-authored operations still require review.
   Complete policy evidence across every view editor, redo, and focus retention
   remains open.
4. Inline linked views now expose title, visible view tabs, canonical shared
   records, and an explicit stale snapshot state. Inline creation and record
   navigation continuity are implemented; cross-reload cache semantics and the
   complete visual state matrix remain open.
5. Agent context inspection is scoped and token-aware, and ghost plans lead
   with human summaries. Selective approval, independent Agent Runs
   inspect/undo/retry/resume, and real model/agent replay remain unverified.
6. Component coverage is broad, but a complete first-use journey is still not
   evidenced across both hosts. The local web renderer/API setup currently has
   an IPv4/IPv6 and server-route mismatch, and no Electron journey has been
   captured; these remain release blockers for NUI-105/NUI-701.

## Latest browser audit (2026-07-22)

The in-app browser reached the running web renderer at
`http://[::1]:5173/` and confirmed the following visible behavior:

- The workspace shell exposes `New database` in the sidebar and empty state,
  and keeps `Databases` as a separate collapsed rail section.
- Opening `New database` still presents an administration-oriented modal with
  four creation methods (`Blank`, `Template`, `Existing folder`, `CSV or TSV`),
  a creation summary, and expandable stable-storage details. This is useful
  for agent safety, but it is not yet the same as Notion's quick page/database
  creation surface or inline-first database flow.
- The shell displayed a server 404/invalid-JSON alert for workspace/templates
  APIs. This prevents a trustworthy end-to-end browser journey and remains a
  release blocker for NUI-105/NUI-701; it is not evidence that the focused DOM
  implementation is incorrect.
- No Electron journey was captured in this audit. Do not close NUI-105 from
  this web-only observation.

Follow-up focused browser evidence on the IPv4 dev server now covers the
critical inline-first handoff: submitting Blank from `#database/new` created a
database and landed on a canonical `#database/<database>/<source>/<view?>`
route with a rendered table grid. This validates route continuity, not visual
Notion parity; the creation chooser is still administration-dense and the
Electron/full first-use journey remains open.

## Implemented in the current slice

These items are code-backed and have focused DOM/type checks. They must not be
treated as visual parity until a browser capture is attached.

- [x] **NUI-001** Add `New database` to the command palette with search tokens
  for database/table/page language. Evidence: `CommandPalette.dom.test.tsx`.
- [x] **NUI-002** Add `New database` to the sidebar toolbar and empty-space
  context menu. Both dispatch `synapsenote:database-slash-command` with the
  `new` detail. Evidence: `FileSidebar.dom.test.tsx`.
- [x] **NUI-003** Add the same entry to onboarding and the empty-editor footer
  so a blank project does not require the command palette. Evidence:
  `PackCardGrid.dom.test.tsx` plus app typecheck.
- [x] **NUI-004** Route the shared event to database creation mode with
  `presentation="page"`; retain the management dialog for the explicit
  power-user `Open databases` action. Evidence: App/database table DOM suites.
- [x] **NUI-005** Keep the existing slash `Database` and `Linked database`
  picker, stable-ID advanced disclosure, missing-reference replacement, and
  `Open full database` route. Evidence: slash-command and `DatabaseView` DOM
  suites.
- [x] **NUI-006** Add a keyboard-accessible `New database` action to the normal
  file creation dialog and hide it in single-file mode. Evidence:
  `NewItemDialog.dom.test.tsx` (2 tests / 5 expectations).
- [x] **NUI-007** Add an on-demand `Databases` sidebar section that lists
  validated catalog sources, follows the active database hash, and opens the
  stable full-page route. Evidence: `DatabaseSidebarSection.dom.test.tsx`
  (3 tests / 7 expectations) and app typecheck. It also follows popstate and
  canonical-creation route notifications. This is the first navigation slice;
  recent/search/backlink/relation integration remains open below.
- [x] **NUI-008** Auto-approve only direct-safe cell edits and new-record
  creation through the existing exact-plan/commit contract, while retaining
  ghost review for deletion, schema, bulk, and elevated actions. Evidence:
  targeted `DatabaseTableDialog.dom.test.tsx` cell and row journeys.
- [x] **NUI-009** Render a direct-safe cell's pending value locally while the
  exact canonical commit settles, then clear it on success or failure without
  setting `data-canonical=false`. Evidence: optimistic-cell DOM coverage in
  `DatabaseTableDialog.dom.test.tsx`.
- [x] **NUI-010** Keep routine mutation feedback in the page workspace: show
  saving, review-required, saved, locally queued, and failed states without
  replacing the table with a transaction screen. Existing offline-cache,
  conflict, permission, invalid-value, and service-error notices remain
  state-specific. Evidence: `DatabaseTableDialog.dom.test.tsx` (57 tests / 316
  expectations) plus focused typecheck.
- [x] **NUI-011** Add catalog-backed database page targets to the workspace
  omnibar: search uses human database/source names, keys, and purpose; selection
  navigates by the encoded stable route; recent entries retain the display label
  and stable target metadata. Evidence: `CommandPalette.dom.test.tsx` (22 tests /
  182 expectations), `database-navigation-entries.test.ts`, and
  `command-palette-recents.test.ts`. Backlinks and relation-specific workspace
  presentation remain part of NUI-201.
- [x] **NUI-012** Add contextual database page chrome details that are safe to
  keep local: a database icon, stable breadcrumb/title, and a persisted
  database/source favorite toggle. Evidence: route-level
  `DatabaseTableDialog.dom.test.tsx` coverage plus
  `database-navigation.test.ts` favorite storage tests. Full page-header
  parity and canonical favorite synchronization remain open under NUI-202.
- [x] **NUI-013** Make blank human-created databases direct-safe: the exact
  server plan is committed without a ghost interruption, the canonical source
  and first saved view become the page target, and the draft chooser closes
  before the editable table is handed to the canonical route. Template,
  existing-folder, and CSV creation remain reviewed. Evidence: blank-creation
  journey in `DatabaseTableDialog.dom.test.tsx` and the shared `runMutation`
  policy; cross-route title/first-row focus remains a separate UX gate.
- [x] **NUI-014** Preserve the typed database name when a creation draft fails:
  reopen the creation surface after the failed exact-plan request so the user
  can retry without re-entering the title. Evidence: the failed-creation DOM
  journey in `DatabaseTableDialog.dom.test.tsx`; Escape/back orphan prevention
  remains open under NUI-104.
- [x] **NUI-015** Add a title-cell new-row affordance at the bottom of Table
  View. Enter compiles the title through the same direct-safe record mutation;
  Escape clears the draft without changing canonical state, and empty sources
  keep the row visible instead of forcing a separate creation dialog. Evidence:
  `DatabaseTableDialog.dom.test.tsx` direct record journey and the Table DOM
  row marked `data-new-record-row`. Standard undo/redo and focus-retention
  across every editor remain open under NUI-303.

## P0 — Make databases first-class pages

- [x] **NUI-101** Extend the normal new-page affordance with a keyboard-
  accessible, named `New database` action and a visible `Page`/`Database`
  type chooser. The underlying app model still routes the Database choice
  through the shared typed creation event; a separate canonical
  `kind='database'` page model remains outside this slice. Map to UX-101.
- [x] **NUI-102** Make the normal New-page choice and `/database` choice enter
  the same direct-safe creation state; do not fork a second database writer.
  Map to UX-102/UX-103. Evidence: the first-class normal-page Database type
  button, slash/database event, and App route all converge on the same
  `DatabaseTableDialog` creation state; blank creation uses the direct-safe
  policy in NUI-013.
- [x] **NUI-103** After a blank title (or `Untitled database`) is accepted,
  hand off to the canonical table shell with a title and first-row `New`
  affordance in one continuous route flow. Keep review available for
  agent/elevated-risk paths. Evidence: the blank page creation route closes
  its draft chooser and lands on the canonical page title/table; an inline
  blank-database handoff now focuses the first-row title input after the host
  block receives stable references. Cross-route title focus remains a visual
  UX follow-up. Map to UX-105–UX-108 and UX-401/UX-402.
- [x] **NUI-104** Make Escape, browser back, and failed creation leave no
  manifest/source/record orphan; preserve the typed title for retry. The
  uncommitted `#database/new` route is a history entry, browser back closes
  the page surface, Escape/cancel emits no plan or commit request, and a
  failed draft reopens with its typed title. Evidence:
  `App.dom.test.tsx`, `DatabaseTableDialog.dom.test.tsx`,
  `DatabaseCreationDialog.dom.test.tsx`, and `database-navigation.test.ts`.
  Map to UX-109/UX-111.
- [ ] **NUI-105** Capture a running web and Electron journey for sidebar,
  empty-state, command-palette, slash, and New-page creation. Do not close a
  visual gate from DOM tests alone. A live `127.0.0.1:5173` browser capture now
  reaches the real shell and `Create database` surface after fixing the
  development-compiler crash; it still shows the administration modal over the
  editor rather than a finished Notion-style page/table journey, and no
  Electron evidence exists. Map to UX-112/UX-1101/UX-1102.

## P0 — Integrate the workspace with normal navigation

- [x] **NUI-201** Register full-page databases as ordinary navigable page
  targets in the sidebar/tree, recent items, search, backlinks, and relations.
  The sidebar, omnibar search, and database recents resolve the same encoded
  workspace target; canonical creation refreshes the sidebar after
  `replaceState`. Backlinks preserve anchors and relations open the same
  canonical record-document route, which renders the shared database record
  page chrome instead of reopening the global database manager. Evidence:
  `DatabaseSidebarSection.dom.test.tsx` (3/7), `CommandPalette.dom.test.tsx`
  (22/182), `command-palette-recents.test.ts` (5/5),
  `DatabaseRecordPeek.dom.test.tsx` (1/7),
  `DatabaseRelationsDialog.dom.test.tsx` (1/2),
  `database-navigation.test.ts` (9/23), and
  `DatabaseRecordPageChrome.dom.test.tsx`. Map to UX-203/UX-206.
- [x] **NUI-202** Reuse page chrome for database title, icon, breadcrumbs,
  favorite/actions, loading, missing, and permission-denied states. The route
  page keeps its title/icon/breadcrumb/favorite/action chrome mounted through
  loading, classifies 404 targets as a non-retryable missing page with a back
  action, and blocks unsafe retry on permission denial. Evidence:
  `DatabaseTableDialog.dom.test.tsx` (60/60 tests, 345 expectations),
  `database-ui-problem.test.ts` (4/4), and
  `DatabaseRecordPageChrome.dom.test.tsx` (1/25). Pixel-level reuse of the
  normal document header remains a visual UX gate under UX-204/UX-208.
- [x] **NUI-203** Replace the default modal rail with the page workspace while
  keeping `Open databases` as a scoped picker/administration entry. Map to
  UX-104/UX-207. Evidence: `DatabaseTableDialog` page presentation uses a
  full-viewport no-overlay workspace; route-level DOM coverage asserts the
  page chrome and back action, while the legacy management dialog remains
  modal for administration.
- [x] **NUI-204** Prove hash reload, back/forward, selected-view persistence,
  and inline/full-page conversion without cloning records. The full-page
  surface writes the selected saved-view ID back into the stable route hash
  without changing records. `App.dom.test.tsx` proves canonical initial target
  hydration plus view-hash back/forward restoration; `DatabaseView.dom.test.tsx`
  proves inline → full-page conversion keeps the same database/source/view
  identity and renders exactly one stable record ID. Map to
  UX-202/UX-205/UX-210/UX-1109.

## P0 — Make routine edits feel direct

- [ ] **NUI-301** Define the mutation policy in code: direct-safe human cell,
  title, row, and view changes are optimistic and undoable; agent-authored,
  destructive, permission, external, schema-migration, and threshold-crossing
  bulk changes retain exact review. The allow-list is now centralized in
  `database-mutation-policy.ts` and wired to cell/title/row/blank-create/view
  callers. Inline `DatabaseView` now uses the same direct-safe policy for title
  cell edits and first-row creation, with optimistic values, canonical refresh,
  and an inline saving/error state. Inline commits also expose a
  revision-guarded `Undo inline database change` action using the same preview
  and apply contract as the full workspace. Inline now also exposes redo and
  handles `Ctrl/Cmd+Z` plus `Ctrl/Cmd+Shift+Z` without intercepting text-input
  undo. Inline row selection reports selected stable
  IDs and hands bulk actions to the canonical reviewed workspace; it never
  creates a second inline bulk-write path. The remaining gate is full
  optimistic/undo evidence for every view editor and a complete policy matrix
  for agent transports. The explicit 13-operation matrix is covered by
  `database-mutation-policy.test.ts`; the canonical workspace regression suite
  passes 64/64 tests and 372 expectations across Table, Board, Timeline,
  Calendar, schema, and mutation journeys. Integration evidence across every
  alternate renderer and agent transport remains open. Map to UX-005/UX-006.
- [x] **NUI-302** Add saving/saved/offline/conflict/failed indicators that do
  not replace the table with a transaction screen. Map to UX-405/UX-406.
  Evidence: `DatabaseTableDialog` save indicator and the state-specific DOM
  journeys listed under NUI-010.
- [x] **NUI-303** Make title-cell row creation, Enter/Escape editing, paste,
  multi-cell paste, and standard undo/redo work without focus jumps. The
  title-cell creation and TSV paste primitives are covered by the Table DOM
  suite; commit and Escape cancellation restore the edited cell's focus (the
  focused DOM journey), and the revision-bound bulk journey now covers
  Ctrl/Cmd+Z followed by Ctrl/Cmd+Shift+Z with exact server preview/apply
  guards. Evidence: `DatabaseTableDialog.dom.test.tsx` 63/63 tests and 369
  expectations, including 18 expectations in the undo/redo journey. Policy
  coverage across every editor/transport remains separately tracked by
  NUI-301.
  Map to UX-402/UX-407/UX-410.
- [x] **NUI-304** Move receipts, risk details, diagnostics, automation, import,
  export, and archive into secondary menus. Full-page database chrome now keeps
  filters, view settings, new-record, and archive visibility controls primary;
  templates, automations, sharing, view management/defaults, import/export, and
  undo live under the accessible `More database actions` menu. Evidence:
  `DatabaseTableDialog.dom.test.tsx` export and bulk-undo journeys assert the
  secondary menu items and the absence of primary export buttons. Map to
  UX-409/UX-412.

## P1 — Complete inline views and record continuity

- [x] **NUI-401** Create a new inline database in the current page, convert
  inline/full-page without changing stable identities, and preserve the host
  document. Invalid linked blocks now offer `Create new database`, create a
  blank database through the exact-plan mutation seam, and write only stable
  database/source/view props back to the host JSX node. The existing
  inline/full-page identity test proves the route conversion does not clone
  records. Evidence: `DatabaseView.dom.test.tsx` inline-creation journey
  (12/12 tests, 75 expectations) plus NUI-204 route identity coverage. Map to
  UX-302/UX-306/UX-310.
- [ ] **NUI-402** Make the inline block show the database title, visible view
  tabs, shared-record explanation, and consistent loading/error/offline states.
  The inline block now exposes the database/source title and visible saved-view
  tabs when a source has multiple views, with `aria-current` on the active tab;
  it also explains canonical shared records and retains a bounded per-tab
  `sessionStorage` last-verified snapshot with an explicit offline/stale status
  on refresh failure. The cache stores only validated read snapshots (never
  credentials or pending writes), rejects malformed entries, and evicts the
  oldest views. Cross-reload cache parity is now covered by
  `database-linked-view-cache.test.ts` (2/2 tests, 5 expectations); the full
  visual state matrix remains open. Evidence: `DatabaseView.dom.test.tsx`
  16/16 tests, 146 expectations, plus the cache suite. Loading exposes
  `aria-busy`/`data-database-state="loading"`, empty sources retain the
  actionable new-row input, and permission denial is proven not to reuse an
  offline snapshot.
  Map to UX-304/UX-305/UX-309.
- [x] **NUI-403** Use one canonical record-page component for title cell, peek,
  full page, comments, history, relation navigation, previous/next, and return
  to the originating view. Record opens now persist the originating database,
  saved view, and loaded record order in a bounded session navigation state;
  the canonical record page exposes guarded Previous/Next and Back to database
  view actions while peek/full-page/comment/history/relation surfaces continue
  to use the same record identity. Evidence: `DatabaseRecordPageChrome.dom.test.tsx`
  (2/2 tests, 32 expectations), `DatabaseRecordPeek.dom.test.tsx`,
  `DatabaseRelationsDialog.dom.test.tsx`, and
  `database-record-navigation.test.ts` (3/3 tests, 6 expectations). Visual
  parity and cross-host capture remain separate NUI-105/NUI-701 gates. Map to
  UX-701–UX-710.

## P1 — Put properties and views in context

- [ ] **NUI-501** Add a table-edge property `+` and header menu for add,
  rename, configure, hide/reorder, calculate, and delete with dependency and
  recovery previews. The table edge now exposes an accessible `+ Add property`
  affordance when schema management is available and routes to the existing
  dependency/recovery-aware properties dialog. Each visible property header now
  has a keyboard-accessible contextual menu for show/hide, left/right reorder,
  calculation, settings, type conversion, and dependency-aware delete. The
  reviewed properties dialog now supports stable-ID inline rename as well as
  the existing reorder/delete recovery path. Inline table blocks now wire the
  same callback, so the table-edge `+` and header menu open the canonical
  reviewed properties surface without exposing raw IDs; a linked-view action
  also provides an explicit `Manage properties` entry. Pixel-level Notion
  visual parity remains open. Evidence: `DatabaseTableDialog.dom.test.tsx`
  schema-management and contextual property-menu journeys (63/63 tests, 369
  expectations), `DatabasePropertiesDialog.dom.test.tsx` rename/reorder/delete
  journeys (7/7 tests, 23 expectations), and the linked-view DOM journey.
  Map to UX-501–UX-510.
- [ ] **NUI-502** Make saved-view tabs reorderable and put layout, filters,
  sorts, groups, properties, color, and open behavior behind the active-view
  menu. The active saved-view tab now exposes a keyboard-accessible options
  menu for Filters, View settings, and Manage views. Tabs now expose a native
  drag handle that compiles a stable-ID `reorder-to` desired state, while the
  existing keyboard Move left/Move right actions remain available. Inline
  linked views now expose `View settings` in their block action menu and open
  the same saved-view settings dialog against the selected stable view. Full
  settings convergence and pixel-level parity remain open. Inline linked-view
  actions now also expose `Manage views` and `Filters`, forwarding to the
  canonical reviewed view manager/filter editor. Evidence:
  `DatabaseTableDialog.dom.test.tsx` default-view and drag-reorder journeys
  (63/63 tests, 369 expectations) plus the lifecycle compiler test. Map to
  UX-601–UX-610.
- [ ] **NUI-503** Keep Blank fastest; make templates/import/agent-assisted
  creation preview the resulting page/block rather than ending in the admin
  shell. Blank remains the direct-safe fastest path; template and CSV/TSV
  creation now show a bounded first-page preview of the actual sample rows and
  all committed creation modes converge into the editable database page. The
  full agent-assisted preview and visual first-use journey remain open.
  Evidence: `DatabaseCreationDialog.dom.test.tsx` 7/7 tests, 29 expectations,
  plus the creation commit continuation in `DatabaseTableDialog`. Map to
  UX-801–UX-808.

## P1 — Preserve the agent-native advantage

- [x] **NUI-601** Expose a compact context inspector from database, view,
  selection, row, and record scope with token estimate, truncation, citations,
  permissions, and omitted fields. The full database workspace now exposes an
  accessible `Inspect agent context` secondary action that opens the existing
  What-the-agent-saw inspector. Database/source/view scopes now flow through the
  UI and filtered `/api/databases/inspect` list/detail contract; the server also
  supports record-scoped filtering, including all-record selection scopes. Table
  row actions, cell menus, and the selected-record toolbar now expose compact
  context actions. Citation labels are rendered from captured evidence/full-body
  disclosures. The inspector now offers per-property All/None/checkbox controls
  and a non-mutating selected-field JSON preview with an approximate token count;
  the server Context Pack contract already accepts `propertyIds` for agent-side
  selective delivery. Evidence:
  `DatabaseContextInspectorDialog.test.tsx` (6 tests / 25 expectations),
  `DatabaseContextInspectorDialog.dom.test.tsx` (1 test / 8 expectations),
  `database-context-inspector.test.ts` (3 tests / 13 expectations), the focused
  `database-data-plane-api.test.ts` contract, the Table menu journey, and the
  inline `DatabaseView.dom.test.tsx` scoped inspector journey (16 tests / 157
  expectations), including database/view, single-record, and selected-record
  query assertions.
  Map to UX-902/UX-909.
- [ ] **NUI-602** Keep human-language plans first and stable IDs/files/risk/
  receipts under progressive disclosure; support selective approval only when
  atomic safety is preserved. Ghost review now leads with a human-readable
  action summary and keeps plan ID/hash/snapshot in collapsed exact details;
  selective approval and full Agent Runs handoff remain open. Evidence:
  `DatabaseTableDialog.dom.test.tsx` discardable-ghost journey. Map to
  UX-904–UX-907.
- [ ] **NUI-603** Keep Agent Runs inspect/undo/retry/resume independent from
  the current view and preserve the public MCP/HTTP contracts. Map to
  UX-908/UX-910.

## P2 — Evidence and release gates

- [ ] **NUI-701** Add primary browser journeys for new-page creation, inline
  creation, linked view, row/page continuity, property/view configuration,
  direct-safe edit, agent proposal, and destructive review.
- [ ] **NUI-702** Run keyboard, screen-reader, contrast, 768px responsive, and
  reduced-motion checks on those same journeys.
- [ ] **NUI-703** Run five uncoached first-use sessions. At least four users
  must create a database, add a property, add two pages, and create/switch a
  second view without raw IDs or the command palette.
- [ ] **NUI-704** Meet the journey budgets: median `New page → editable table`
  under 15 seconds with at most two primary actions; `add property → edit
  value` under 20 seconds; `second view → switch back` under 25 seconds.
- [ ] **NUI-705** Update help, release notes, parity claims, and the engine
  checklist only after visual, usability, and migration evidence passes.

## Verification policy

Use the smallest affected checks while iterating:

```bash
bun run --cwd packages/app test:dom src/components/CommandPalette.dom.test.tsx
bun run --cwd packages/app test:dom src/components/FileSidebar.dom.test.tsx
bun run --cwd packages/app test:dom src/components/PackCardGrid.dom.test.tsx
bun run --cwd packages/app typecheck
```

Do not run the roughly ten-minute repository-wide server suite for each item.
Use the focused server file(s) touched by a change, then reserve the full
release check for hosted CI or final PR readiness.

## Exit criteria

The UX gap is closed only when all P0/P1 items have code and focused tests,
NUI-105/NUI-701–NUI-704 have captured browser/usability evidence, existing
database records and agent contracts remain compatible, and the corresponding
UX checklist gates are explicitly updated with dated evidence.
