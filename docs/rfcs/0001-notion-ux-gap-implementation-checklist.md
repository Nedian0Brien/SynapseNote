# RFC 0001: Notion UX gap implementation checklist

- Status: Active
- Re-audit date: 2026-07-23
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

1. The primary blank human path is now page-first, but the secondary
   administration surface still exposes the method chooser (Blank, Template,
   Existing folder, CSV/TSV, and Assistant). That chooser is appropriate for
   reviewed/import/agent work, not for the first interaction. The remaining
   gap is to keep those advanced paths progressively disclosed while the
   ordinary page/block opens with a usable table first.
2. Database workspaces now resolve through sidebar, recent/search, backlinks,
   relations, and a stable page route. The remaining mismatch is visual
   convergence with ordinary document chrome plus complete cross-host capture;
   `Open databases` remains the explicit administration surface.
3. Direct-safe human cell/title/row/view writes now use a centralized policy,
   optimistic acknowledgement, and exact undo; schema, destructive, bulk,
   permission, external, and agent-authored operations still require review.
   Focused policy and optimistic/undo/redo evidence now covers the editable
   Table, Board, Calendar, Timeline, and saved-view reorder paths; visual,
   cross-host, and usability gates remain open elsewhere in this checklist.
4. Inline linked views now expose title, visible view tabs, canonical shared
   records, and an explicit stale snapshot state. Inline creation and record
   navigation continuity are implemented; cross-reload cache semantics and the
   complete visual state matrix remain open.
5. Agent context inspection is scoped and token-aware, and ghost plans lead
   with human summaries. Database creation review now uses the same progressive
   summary/exact-plan disclosure. Agent Run retry/resume now has an exact-plan,
   idempotent HTTP/MCP handoff, durable restart recovery, failed-run controls,
   and a progressive receipt; real model/agent replay remains unverified.
6. Component coverage is broad, and the page-first web creation/table journey
   is captured on IPv4. A focused Electron dev journey now proves the sidebar
   and empty-state entry points reach the canonical page without a leftover
   admin dialog, but the complete cross-entrypoint journey, linked-view/record
   journey, and release evidence remain open; these are still blockers for
   NUI-105/NUI-701.

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
Notion parity; the creation chooser is still administration-dense, the
captured route renders an overlapping wizard/table state, and the Electron/full
first-use journey remains open.

## Latest browser audit (2026-07-23)

The in-app browser reached the IPv4 development server at
`http://127.0.0.1:5173/` with an HTTP 200 response and exercised the updated
document-native entry point:

- Selecting `New database` from the sidebar opened `#database/new` as a
  full-page, non-overlay creation surface, but the visible page still presents
  a multi-method administration chooser while an `Untitled database` table is
  mounted underneath. The absence of a blurred backdrop does not make this a
  Notion-style page/block flow.
- Leaving the optional title blank or entering a title kept the same page-first
  flow. Submitting Blank landed on the canonical
  `#database/<database>/<source>/<view>` route with an editable Table view,
  title focus, and a new-row affordance.
- Creating the first and second rows completed in the running app. A transient
  `transaction_in_progress` read barrier after the first commit was retried in
  the table loader and did not surface as a persistent error; the second row
  completed without an error alert.
- In a new document, the visible `/` menu opened `Inline database`; the picker
  offered existing databases and `Create new database`. Creating
  `Inline browser audit` replaced the setup block in place, saved
  `Inline first record`, showed the database title, `Table` tab, shared-record
  explanation, and inline undo. `Open full database` reached the canonical
  route, and removing the linked block left the canonical record available.
- A follow-up live check found and fixed a duplicate-view replay hazard: opening
  `Duplicate view configuration` now creates exactly one `Table copy` even when
  the canonical manager refreshes during the draft. The focused manager/view
  DOM suite passes 30 tests / 227 expectations; this is a mutation-safety fix,
  not a claim that the broader visual state matrix is complete.
- The normal New-page browser journey is now captured as well: `New file` shows
  a Page/Database chooser, Database enters `#database/new`, Blank lands on the
  canonical editable Table route with Title and first-row affordances, and
  Cancel returns to the empty hash without creating a second database. This
  closes the evidence-backed UX-101/103/105–112 alignment items; Electron and
  release gates remain open.

This closes the browser evidence for the page-first creation slice, but it does
not close NUI-105 or NUI-701–NUI-705: the complete cross-entrypoint Electron
journey, complete linked-view state matrix, accessibility or responsive
capture, usability timing, performance budget, or packaged-release evidence
is still outstanding.

## Electron follow-up (2026-07-23)

After the Mac was unlocked, the direct development Electron renderer was
validated without running the slow repository-wide suite:

- Sidebar toolbar `New database` entered the ephemeral `#database/new` route
  and converged on a canonical `#database/<database>/<source>/<view>` page.
- The empty-state `New database` action followed the same route and landed on
  the same page surface.
- The resulting accessibility tree exposed `Untitled database`, the `Table`
  view, `New page`, `Add property`, `Filters`, and `View settings`; it did not
  expose the legacy `Create database` method chooser.
- A regression was found during this capture: the temporary Notion creator
  left its nested reviewed form portaled after canonical navigation. Commit
  `21a35284` clears the child creation state when the host closes it, and the
  focused `DatabaseTableDialog` DOM regression test now covers that lifecycle.

This is focused Electron evidence for two entry points, not closure of NUI-105:
command-palette, slash, normal New-page, web/Electron visual comparison,
manual accessibility, five-user usability, and performance/release gates still
need their own evidence.

### Inline blank-creation lifecycle follow-up (2026-07-23)

The direct Electron slash flow initially stayed in `Preparing table` even
though the generated desired state was valid. The cause was React StrictMode:
the inline dialog's development cleanup aborted the first request and the
auto-start guard prevented a replay. The dialog now defers abort across the
cleanup/setup probe, accepts a converged no-op handoff, and assigns each
Notion-style blank creation a readable unique internal key while keeping the
visible `Untitled database` title. The same key is applied to full-page blank
creation so repeated New actions cannot silently reuse the first database.

Focused app tests pass for the key helper, the StrictMode inline DOM journey,
the full-page creation page, and app typecheck. A single post-fix Electron
smoke reached the ready inline Table with the new-page row and view controls;
the temporary document and manifest were removed. This evidence does not
close NUI-105/NUI-701 or UX-1102 because browser E2E, cross-host visual
comparison, and manual usability/accessibility gates remain open.

### Sidebar catalog freshness follow-up (2026-07-23)

The open `Databases` sidebar now invalidates and reloads its catalog when the
typed `database-changed` event reports a workspace/schema commit. This fixes a
Notion-parity navigation detail where renamed database/source labels previously
remained stale until the section was reopened. Focused evidence:
`DatabaseSidebarSection.dom.test.tsx` passes 5 tests / 13 expectations,
targeted Biome passes, and app typecheck passes. This functional subpath does
not close NUI-105 or NUI-701–NUI-705; visual, cross-host, accessibility,
usability, performance, and release evidence remains required.

## Implemented in the current slice

These items are code-backed and have focused DOM/type checks. They must not be
treated as visual parity until a browser capture is attached.

- [x] **NUI-001** Add `New database` to the command palette with search tokens
  for database/table/page language. Evidence: `CommandPalette.dom.test.tsx`.
- [x] **NUI-002** Add `New database` to the sidebar toolbar and empty-space
  context menu. The embedded fallback dispatches
  `synapsenote:database-slash-command` with the `new` detail, while the main
  host can provide the same page route directly. Evidence:
  `FileSidebar.dom.test.tsx`.
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
  (4 tests / 10 expectations) and app typecheck. An abort-aware deferred
  request regression test proves the loading state cannot abort its own
  request; a live IPv4 browser check resolves the expanded section to the
  `Untitled database` source. It also follows popstate and
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
- [x] **NUI-016** Audit and humanize database terminology across the normal
  canvas, inline block, table, peek, page, error, and accessibility surfaces.
  Use `page`, `property`, `view`, and `linked view` in the default journey;
  keep `canonical`, `schema`, `index`, `query`, `mutation`, `projection`,
  machine IDs, and related implementation terms behind Advanced, agent,
  diagnostic, or recovery disclosure. Cover visible copy and accessible names
  together, retain the internal stable-ID/API vocabulary, and add focused DOM
  assertions for the resulting human-language contract. Evidence (2026-07-23):
  `DatabaseTableDialog.tsx`, `DatabaseRecordPeek.tsx`,
  `DatabaseRecordPageChrome.tsx`, and all normal view renderers now switch
  human labels to `page` on canvas/inline/page surfaces while keeping stable
  record IDs and advanced machine-ID disclosures unchanged. The focused DOM
  contract is covered by `DatabaseTableDialog.dom.test.tsx`,
  `DatabaseView.dom.test.tsx`, `DatabaseRecordPageChrome.dom.test.tsx`, and
  the Board/Calendar/Chart/Dashboard/Feed/Gallery/List/Map/Timeline/Peek
  component tests; app typecheck, Biome, and `git diff --check` pass.

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
  visual gate from DOM tests alone. The IPv4 browser capture proves the
  page-first table route, and the 2026-07-23 Electron capture proves the
  sidebar and empty-state routes converge on the canonical page without the
  legacy admin chooser. A bounded 2026-07-23 system-Chrome run now executes
  the document-native journey file: the sidebar page-first case, slash inline
  case, and linked-view/record continuity case each pass (the latter two were
  rerun after stale locators and a missing saved-view fixture were corrected).
  The same bounded system-Chrome pass now covers the primary canonical-table
  create/edit/undo/redo, bulk property undo, and saved-view List/context
  journeys; `b79b1801` also wires List context inspection through the canonical
  surface. Command-palette, empty-state, the NewItemDialog type chooser,
  complete cross-host visual comparison, and manual interaction evidence
  remain open. The shared catalog client now retries one transient HTTP 409
  that can occur during the short manifest/index transaction window immediately
  after a new database is created; persistent conflicts still surface with the
  existing retry action. Focused client evidence covers the 409 → success
  recovery.
  Map to UX-112/UX-1101/UX-1102.

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

- [x] **NUI-301** Define the mutation policy in code: direct-safe human cell,
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
  creates a second inline bulk-write path. Inline Board, Calendar, and Timeline now compile
  one-record multi-cell transitions through the same exact desired-state
  mutation and project optimistic values (including Board memberships) while
  the commit is in flight; multi-record bulk edits still hand off to reviewed
  workspace actions. The explicit 13-operation matrix is covered by
  `database-mutation-policy.test.ts`; the canonical workspace regression suite
  passes 64/64 tests and 387 expectations across Table, Board, Timeline,
  Calendar, schema, and mutation journeys. Its saved-view reorder journey
  proves delayed-commit optimism plus revision-bound undo/redo.
  `DatabaseView.dom.test.tsx` passes 18 tests / 205 expectations, including
  delayed-commit Board, Calendar, and Timeline mutations with optimistic
  rendering and undo/redo; List, Gallery, Feed, Chart, and Map are read-only
  renderers and have no separate edit path. The 13-operation human/agent
  policy matrix passes 4 tests / 68 expectations, and focused server commit
  tests prove unapproved agent work fails closed and Agent Run lifecycles
  retain awaiting-approval/failed states. HTTP commit conformance passes 1
  test / 22 expectations; the MCP commit/undo tools pass 6 tests / 17
  expectations and the cross-transport contract passes 1 test / 12
  expectations. No full server suite or E2E was needed for this
  implementation gate. Map to UX-005/UX-006.
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
  guards. Evidence: `DatabaseTableDialog.dom.test.tsx` 64/64 tests and 387
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
- [x] **NUI-402** Make the inline block show the database title, visible view
  tabs, shared-record explanation, and consistent loading/error/offline states.
  The inline block now exposes the database/source title and the active
  saved-view tab (plus adjacent tabs when a source has multiple views), with
  `aria-current` on the active tab;
  it also explains canonical shared records and retains a bounded per-tab
  `sessionStorage` last-verified snapshot with an explicit offline/stale status
  on refresh failure. The cache stores only validated read snapshots (never
  credentials or pending writes), rejects malformed entries, and evicts the
  oldest views. Cross-reload cache parity is now covered by
  `database-linked-view-cache.test.ts` (2/2 tests, 5 expectations); the full
  visual state matrix remains open. Evidence: `DatabaseView.dom.test.tsx`
  18/18 tests, 183 expectations, plus the cache suite. Loading exposes
  `aria-busy`/`data-database-state="loading"`, empty sources retain the
  actionable new-row input, and permission denial is proven not to reuse an
  offline snapshot. The visible inline title control now exposes the
  source/database name as its accessibility name while retaining rename
  guidance in its tooltip; the focused single-view DOM journey verifies the
  name, tooltip, and rename input. The overflow action menu now includes the
  same database/source and saved-view context in its accessibility name, so
  repeated linked blocks are distinguishable to agents and assistive
  technology. Refresh, change-view, and open-full-database icon controls now
  carry the same context as well, and the inline agent trigger reads `Ask
  agent about Tasks · Open tasks` when the linked view is ready. The functional
  title/tab/cache/state contract is complete; the remaining visual state
  matrix is a separate NUI-701/NUI-702 gate. The inline add-view affordance
  also carries the same visible context (`New database view for Tasks · Open
  tasks`). The ready inline landmark is also named with that same context so
  repeated blocks can be located without opening them. Map to
  UX-304/UX-305/UX-309. In the primary Notion table surface, row actions now
  use the visible record title (`Open record Shared canonical row`, etc.) while
  the stable record ID remains in the data attributes and mutation scope. The
  inline Board surface follows the same title-first contract: card, open, move,
  duplicate, inspect, archive/restore, and delete actions identify the visible
  record title while stable IDs remain the mutation and DOM identity. Focused
  `DatabaseBoard.dom.test.tsx` evidence passes 3 tests / 16 expectations.
  Calendar, Timeline, List, Gallery, Feed, Chart, and Map now apply the same
  title-first naming to their inline open, inspect, scheduling, resize, and
  expand/collapse controls. The focused alternate-renderer suite passes 24
  tests / 91 expectations, and the linked-view DatabaseView slice passes 6
  tests / 62 expectations. Inline Table property links, copy controls, buttons,
  and edit affordances now use the same visible title context, while the
  stable record ID remains the underlying scope. `DatabaseTableDialog.dom.test.tsx`
  covers the inline URL link/copy/edit labels directly (1 test / 3 expectations).
  Its inline cell context menu is also named with the visible title and property
  (`Database cell actions for First task · Budget`), with contextual open/edit/
  inspect/agent menu items; the focused menu regression passes 2 tests / 13
  expectations.
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

- [x] **NUI-501** Add a table-edge property `+` and header menu for add,
  rename, configure, hide/reorder, calculate, and delete with dependency and
  recovery previews. The table edge now exposes an accessible `+ Add property`
  affordance when schema management is available. Each visible property header
  now has a keyboard-accessible contextual menu for show/hide, left/right
  reorder, calculation, settings, type conversion, and dependency-aware delete.
  On the canonical page surface, a non-Title header's `Rename or configure
  property` action now opens an in-table draft editor and commits through the
  reviewed schema mutation boundary; the broader configure/reorder/delete flows
  still open the canonical reviewed properties surface without exposing raw IDs.
  The required Title property follows the same canonical rename path while its
  stable identity, required type, position, and destructive-action guards stay
  intact; the administration manager remains conservative and marks it Frozen.
  `Insert left` and `Insert right` reuse the table-edge picker and preserve both
  source order and the active saved-view projection by stable key; inserting
  before Title is disabled to keep the identity column first.
  Select and Multi-select headers expose `Configure options`, opening the
  existing complete-snapshot option lifecycle preview instead of forcing users
  to find the secondary manager. Both scalar and array-valued record references
  now migrate through the same exact, reviewed compiler boundary; Multi-select
  merge deduplicates the target option while preserving array order, and its
  defaults and dependency checks are covered by focused core/app tests.
  Linked inline tables pass an `options` initial surface and stable property ID
  into the full database workspace, so the same editor opens in context rather
  than dropping users into an unrelated properties list.
  The reviewed properties dialog continues to support stable-ID inline rename as
  well as the existing reorder/delete recovery path. Inline table blocks use a
  human direct-safe, undoable path for adding an empty common property from the
  table edge. A linked-view action also provides an explicit `Manage properties`
  entry. Pixel-level Notion visual parity remains open. Evidence:
  `DatabaseTableDialog.dom.test.tsx`
  schema-management and contextual property-menu journeys in the verified
  focused suite, `DatabasePropertiesDialog.dom.test.tsx`
  rename/reorder/delete journeys, and the
  linked-view DOM journey. Pixel-level visual parity remains a separate
  NUI-701/NUI-702 gate; the stable-ID property affordance and
  dependency/recovery behavior are complete. Map to UX-501–UX-510.
- [x] **NUI-502** Make saved-view tabs reorderable and put layout, filters,
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
  (64/64 tests, 374 expectations) plus the lifecycle compiler test. The inline
  linked-view tab strip always exposes the active saved-view tab and an
  adjacent `New database view` affordance, even for a source with one view;
  both open or switch through the same stable-reference/reviewed manager
  paths, and tab switching preserves `mode="full-page"` when the host is in
  the full-page presentation. The active tab also exposes Filters, View
  settings, and Manage views without requiring the block-level overflow menu.
  The inline journey passes 18 tests / 183 expectations, including the
  single-view `+` handoff, property-context action, active-tab menu, and
  full-page mode preservation. Inline Table header hide/reorder actions now
  persist the linked block's `viewOverrides.projection`; the focused
  `DatabaseView.dom.test.tsx` projection journey drives a reorder and asserts
  the stable serialized property order, while the full focused file passes 22
  tests / 261 expectations.
  Commit `18682ec2` also routes inline saved-view tab Duplicate, Favorite,
  move-left/right, and Delete actions into the exact reviewed lifecycle
  changes for the selected stable view instead of falling through to a generic
  manager open. Follow-up `80fb4807` routes inline Rename directly to
  the reviewed rename dialog while preserving the stable view ID; the focused
  `DatabaseTableDialog.dom.test.tsx` suite passes 78 tests / 516 expectations,
  and the manager-plus-inline suite passes 38 tests / 296 expectations.
  Follow-up `f9ef4f4d` routes inline Make default and Clear default through the
  reviewed default-view mutation boundary without opening the manager; the
  focused handoff test passes 1 test / 6 expectations and the manager-plus-
  inline suite passes 39 tests / 300 expectations.
  Pixel-level visual parity remains a separate NUI-701/NUI-702 gate; the
  stable-ID reorder and active-view settings/menu handoff are complete. Map to
  UX-601–UX-610.
- [x] **NUI-503** Keep Blank fastest; make templates/import/agent-assisted
  creation preview the resulting page/block rather than ending in the admin
  shell. Blank remains the direct-safe fastest path; template and CSV/TSV
  creation now show a bounded first-page preview of the actual sample rows;
  templates also preview and commit a Table plus grouped Board view with typed
  properties, and all committed creation modes converge into the editable
  database page. The
  agent-shaped creation plans now also show a resulting-page preview inside
  the exact-plan ghost review before approval, so the flow does not end in an
  admin shell. Evidence: `DatabaseCreationDialog.dom.test.tsx` 12/12 tests,
  59 expectations, `database-creation.test.ts` 8/8 tests, 56 expectations,
  plus the focused `DatabaseTableDialog.dom.test.tsx` journey (1 test / 3
  expectations) and the existing creation commit continuation.
  Visual first-use parity remains a separate NUI-701/NUI-702 gate. Map to
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
  context actions; inline Board, Calendar, and Timeline cards/bars expose the
  same record-scoped action. Inline List rows, Gallery cards, and Feed items
  expose it as well, so changing among record-centric views does not remove
  the inspection path. Chart drill-through records and Map marker/missing
  location lists expose the same action at their record boundary. Citation
  labels are rendered from captured
  evidence/full-body disclosures. The inspector now offers per-property
  All/None/checkbox controls,
  a non-mutating selected-field JSON preview with an approximate token count,
  and one-click copying of that compact preview with an explicit clipboard
  failure state;
  property-header actions now open the same inspector with a property-scoped
  `propertyIds` query, including properties omitted by the captured pack. The
  server Context Pack contract already accepts `propertyIds` for agent-side
  selective delivery. Evidence:
  `DatabaseContextInspectorDialog.test.tsx` (6 tests / 25 expectations),
  `DatabaseContextInspectorDialog.dom.test.tsx` (1 test / 10 expectations),
  `database-context-inspector.test.ts` (3 tests / 16 expectations), the focused
  `database-data-plane-api.test.ts` contract, the Table menu journey, and the
  inline `DatabaseView.dom.test.tsx` scoped inspector journey (18 tests / 183
  expectations), including database/view, property, single-record,
  selected-record, inline Board transition, and alternative-view context
  affordance assertions for Board, Calendar, Timeline, List, Gallery, Feed,
  Chart, and Map; server
  `DatabaseContextInspectionScope` and HTTP query validation now cover
  `propertyIds` filtering.
  Map to UX-902/UX-909.
- [x] **NUI-602** Keep human-language plans first and stable IDs/files/risk/
  receipts under progressive disclosure; support selective approval only when
  atomic safety is preserved. Ghost review now leads with a human-readable
  action summary and keeps plan ID/hash/snapshot in collapsed exact details;
  database creation review now exposes the same summary, scope/risk line, and
  collapsed exact-plan details before `Commit creation`. Approval scopes now
  render as one human-readable atomic group; the HTTP/MCP commit contracts
  accept optional approval codes but reject partial selections with the exact
  required group, so referential and rollback safety cannot be split. Evidence:
  `DatabaseTableDialog.dom.test.tsx` discardable-ghost journey plus the focused
  `opens read-only folder onboarding only after the manifest creation commits`
  journey (1 test / 7 expectations), the resulting-page/approval-scope journey,
  and `database-commit.test.ts` atomic-scope rejection. Map to UX-904–UX-907.
- [x] **NUI-603** Keep Agent Runs inspect/undo/retry/resume independent from
  the current view and preserve the public MCP/HTTP contracts. Agent Run
  inspection now leads with compact scope and proposed-diff summaries and keeps
  raw scope/diff JSON behind progressive disclosure. Failed agent runs now
  expose Retry/Resume controls that create an independent attempt from the
  exact immutable plan; the HTTP handoff binds the source revision, plan hash,
  approval/autonomy token, and idempotency key, while preserving the failed run
  as audit history. Exact plan/draft sidecars are now atomically persisted in
  the owner-only Agent Runs store and restored into a fresh plan engine after a
  process restart; missing sidecars return a typed recreate-plan recovery. The
  public MCP surface mirrors list/get/retry/resume and remains approval-gated,
  while the UI exposes a progressive recovery receipt. Evidence:
  `DatabaseAgentRunsDialog.dom.test.tsx` (4 tests / 23 expectations), the
  focused `database-data-plane-api.test.ts` retry contract (1 test / 8
  expectations, including a fresh-engine restart simulation),
  `database-agent-run-store.test.ts` (6 tests, including sidecar round-trip,
  tamper, and missing-plan recovery), `database-plan.test.ts` fresh-engine
  restore coverage, and the `data_run` MCP tool (4 tests / 10 expectations)
  plus the 31-tool registry/gating contract. Selective approval and real
  model/agent replay remain release evidence gates. Map to UX-908/UX-910.

## P2 — Evidence and release gates

- [ ] **NUI-701** Add primary browser journeys for new-page creation, inline
  creation, linked view, row/page continuity, property/view configuration,
  direct-safe edit, agent proposal, and destructive review. The existing
  document-native journey now uses the contextual inline accessibility names;
  the primary journey file now covers canonical row create/edit/undo/redo and
  record routing, reviewed bulk property change plus undo, and saved-view
  List creation/switch/rename with the title-based `Inspect context for record
  View task` affordance. On 2026-07-23, all three primary cases ran green in
  bounded focused system-Chrome runs (temporary no-video config; Playwright
  Chromium/ffmpeg cache remains incomplete) after `b79b1801` aligned the
  current page/role contracts. A separate bounded system-Chrome pass also
  covers property add and the two-step valued-property deletion review in
  `database-manage-properties.e2e.ts`; `f5ff201d` aligns that journey with the
  semantic palette/breadcrumb and reviewed destructive-action surfaces.
  The saved-view case now also covers reviewed view settings (sort), duplicate,
  visible-tab reorder, and delete in the same bounded browser regime;
  `4f30e862` records that extension. The follow-up canonical case now also
  covers reload persistence plus row → side peek → full page → browser return
  to the same saved view in a bounded system-Chrome run (`8fc8bb0f`). Property
  add now has focused DOM/live-web evidence for both the commit-ready
  Select/Multi-select schema path and immediate active-view projection update;
  configure/reorder/hide, agent proposal, and full primary coverage remain
  open.
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
