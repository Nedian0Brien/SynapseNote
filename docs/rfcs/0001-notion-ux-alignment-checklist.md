# RFC 0001: Notion database UX alignment checklist

- Status: Active
- Audit date: 2026-07-23
- Scope: desktop and web editor database journeys
- Engine checklist: [database implementation checklist](./0001-databases-implementation-checklist.md)
- Capability reference: [Notion parity matrix](./0001-notion-parity-matrix.md)

This checklist resets the user-experience acceptance bar for SynapseNote
databases. The engine already implements many Notion-class primitives, and the
first document-native entry slice is now present, but the primary human journey
still does not consistently behave like a Notion database. Checked items in the
engine checklist prove capability; they do not prove that a user can discover
and use it through a Notion-like flow. The gap-driven execution plan is tracked
in the [new UX implementation checklist](./0001-notion-ux-gap-implementation-checklist.md).

## Audit verdict

The current implementation is a strong **database administration surface** and
a weak **document-native database experience**.

- The command palette, sidebar toolbar, empty-space menu, onboarding footer,
  and empty-editor footer now expose a user-facing `New database` entry. A
  guided `New database` → `Linked view of database` slash entry is also
  available for `/database` and `/table`. The normal
  New-page dialog now exposes a named `New database` action and a visible
  Page/Database type chooser; a running web journey now proves the handoff and
  resulting table, while Electron parity remains a separate gate.
- The default management surface is still shared with the legacy dialog, but
  the `Open databases` power-user command now enters its no-overlay page
  presentation instead of a global modal. It is not yet the ordinary
  page/sidebar experience.
- Blank creation now makes the title optional, hides storage details behind
  `Advanced`, commits the low-risk human path directly, and selects the first
  source/view after commit. Template, folder, CSV, agent-authored, and elevated
  paths still retain the explicit review-and-commit boundary.
- Direct-safe human cell and new-row writes now auto-approve the exact plan and
  refresh without a ghost-review interruption. Schema, destructive, bulk, and
  elevated actions retain explicit review; optimistic local acknowledgement and
  full mutation classification are still incomplete.
- The renderer, schemas, saved views, record pages/peeks, templates,
  permissions, import/export, automations, and agent APIs are substantial
  reusable assets. The main missing layer is information architecture and
  interaction design.

Existing `Complete` labels in the parity matrix therefore mean **engine
capability complete**, not **Notion UX complete**, until this checklist passes.

## Evidence and limits

The audit covered the first-use path in the running app and inspected the
corresponding app/core code. It did not commit the proposed database, mutate the
user's canonical project, or run the repository-wide/server test suite.

### Captured journey (pre-entry-point baseline)

1. **Blank editor baseline:** this screenshot predates the entry-point slice;
   current onboarding/empty canvas and sidebar surfaces now show `New database`,
   and the normal New-page dialog now exposes the same named Database choice.

   ![Pre-slice blank editor with no visible database entry](./assets/0001-notion-ux-audit/01-editor-entry.png)

2. **Command palette:** `Open databases` is discoverable only after invoking
   the command surface and scanning unrelated commands.

   ![Command palette containing Open databases](./assets/0001-notion-ux-audit/02-command-palette.png)

3. **Database workspace:** an empty modal management surface appears with a
   database rail and snapshot-oriented technical copy.

   ![Empty database management dialog](./assets/0001-notion-ux-audit/03-database-empty-workspace.png)

4. **Creation form:** Blank, Template, Existing folder, and CSV/TSV are useful,
   but the default path exposes `canonical folder`, `stable key`, and other
   implementation concepts before the user sees a table.

   ![Database creation form](./assets/0001-notion-ux-audit/04-database-creation-form.png)

5. **Creation review:** the result remains a proposed ghost with a separate
   `Commit creation` action. This is valuable for agent-authored or risky
   changes, but it is friction in the ordinary human blank-database path.

   ![Proposed database awaiting explicit commit](./assets/0001-notion-ux-audit/05-database-creation-review.png)

### Code evidence

| Area           | Current implementation                                                                                                                                                         | UX implication                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Global entry   | `App.tsx` retains the power-user `databasesOpen` surface, while `#database/<database>/<source>/<view?>` is now a stable route-level workspace. `New database` entry points dispatch one typed event into page presentation, and `Open databases` selects that no-overlay page presentation. | The direct entry, normal New-page handoff, and power-user page jump are evidenced; ordinary sidebar/recent integration remains open. |
| New item       | `NewItemDialog` still models `file`/`folder`, but its normal file path now exposes a named `New database` action that dispatches the shared creation event.                     | Discovery is improved, but Database/Table is not yet a first-class page type in the picker.                          |
| Creation       | `DatabaseCreationDialog.tsx` accepts an optional blank title, keeps storage details in a collapsed disclosure, and routes blank human creation through an automatic exact-plan commit while retaining review for templates/imports/agent paths. | The first-use path is shorter and safer for routine human creation; higher-risk methods still expose the explicit review boundary. |
| Blank schema   | `createBlankDatabaseDesiredState` creates one title property; after commit the shell selects the new source and first view.                                                    | A minimal database lands in its table, but it is still inside the management dialog.                                 |
| Inline block   | Fresh `New database`/`Linked view of database`/`Inline database` inserts use a catalog/source/view picker; raw references remain advanced for existing MDX, and the block renders shared records with visible tabs and full-page handoff. | The core inline/linked journey is now unified for creation, editing, conversion, and removal; duplicate-view action and full state-matrix parity remain open. |
| Database shell | `DatabaseTableDialog.tsx` supports a route-level page presentation plus the legacy management dialog; both still share the dense workspace toolbar.                            | The modal boundary is removable, but administration and primary work remain coupled.                                 |
| Human writes   | Direct-safe cell/row writes use plan → auto-approval → commit; destructive, bulk, schema, and elevated writes retain plan → ghost → explicit review → commit.                    | The interruption is removed for common edits, but optimistic/offline acknowledgement and full policy coverage remain. |
| Views          | Saved views now render as visible tabs with `+`; the dropdown and `Manage views` dialog remain available.                                                                      | The primary view switch is closer to Notion, but reorder/rename/favorite controls still live in management.          |
| Renderer       | `editor/components/DatabaseView.tsx` renders all major layouts and record peeks.                                                                                               | This is reusable once insertion, editing, and view controls are redesigned.                                          |
| Journey tests  | Component tests are broad, a primary-journey E2E file exists, and an in-app browser capture covers page-first and inline creation; the local Playwright executable remains unavailable. | Web functional evidence covers the core slice, but the full E2E matrix and Electron journey remain open. |

Screenshots cannot establish focus traps, keyboard ordering, screen-reader
names, contrast, responsive behavior, data-loss safety, or performance. Those
remain acceptance work below.

## Implementation evidence since the audit

The first document-native insertion slice is now implemented. The 2026-07-23
browser capture closes the core inline/linked interaction contract below; its
broader visual, accessibility, responsive, and cross-host acceptance gates
remain open:

- The slash menu now offers `New database` and `Linked view of database` in user-facing
  language. The raw `Database view` descriptor remains readable for existing
  MDX but is no longer a fresh-insert option.
- Choosing `Linked view of database` inserts an inline placeholder that searches the
  database catalog, chooses a source, and then chooses a saved view. It writes
  the stable references back to the current block; missing references expose
  the same `Choose replacement` picker.
- The three stable reference properties are classified as advanced in the
  descriptor, so the regular PropPanel no longer leads with raw IDs; the
  serialized MDX and advanced panel remain the compatibility/debug escape
  hatch.
- Choosing `New database` opens the database shell directly in creation mode, so a
  user does not have to rediscover the `Create database` action in the admin
  rail.
- Blank creation accepts an optional title, uses `Untitled database` as a
  deterministic fallback, selects the newly committed source/view immediately,
  and exposes saved views as visible tabs with a nearby `+` affordance. The
  existing dropdown and reviewed commit path remain as compatibility and safety
  fallbacks.
- The creation summary keeps human-facing view/property information prominent
  and moves record meaning, canonical folder, and stable key under a collapsed
  `Advanced storage details` disclosure.
- A route-level `#database/<database>/<source>/<view?>` workspace now renders
  the existing database surface without a modal overlay, preserves the selected
  view in the URL, and is used by inline linked views' `Open full database`
  action. The management surface remains available as a compatibility/admin
  surface, while the `Open databases` power-user jump uses the no-overlay page
  presentation until it is fully integrated with ordinary page chrome/sidebar
  navigation.
- `New database` is now reachable from the sidebar toolbar, empty-space context
  menu, onboarding pack footer, empty-editor footer, and command palette. All
  of those surfaces dispatch the same typed event, so the app opens one creation
  flow instead of maintaining parallel writers.
- Focused evidence passes in
  `packages/app/src/editor/slash-command/component-items.test.ts` and
  `packages/app/src/editor/components/DatabaseView.dom.test.tsx`; app
  typecheck and the core registry suite also pass.
- A historical live Vite capture reached the real `127.0.0.1:5173` shell and
  the administration-oriented `Create database` surface after the
  context-preview compiler expression was split into named steps. The
  follow-up capture below supersedes its modal-only conclusion for the
  page-first and inline slices; it does not prove Electron parity or the
  remaining visual/release gates.

## Follow-up browser evidence (2026-07-23)

The IPv4 development server now serves the app at `http://127.0.0.1:5173/`.
From the sidebar, `New database` opens a full-page, non-overlay creation
surface at `#database/new`; Blank creation then lands on the canonical
`#database/<database>/<source>/<view>` route with an editable table and a
new-row affordance. The first two rows were created in the running app, and a
short-lived `transaction_in_progress` read barrier was retried without leaving
an error alert visible.

### Normal New-page database journey evidence (2026-07-23)

From the running IPv4 app, the command-palette `New file` command opened the
normal `New file` surface with a visible `New page type` group containing
`Page` and `Database`. Selecting `Database` navigated to `#database/new` and
showed the page-based creation surface. The blank path accepted the optional
name `Normal new page audit`; submitting it reached the canonical
`#database/<database>/<source>/<view>` route with the Title property, visible
Table view, `New record`/first-row affordance, and collapsed `Advanced storage
details`. Navigating back to `#database/new` and pressing `Cancel` returned to
the document root (`hash === ''`) without creating another database.

This is evidence for the page-first and inline/linked creation slices. It does
not establish ordinary document chrome/sidebar integration, the complete
linked-view state matrix, Electron parity,
accessibility/responsive behavior, usability timing, performance, or
packaged-release readiness. Those acceptance gates remain unchecked below.

### Slash database command evidence (2026-07-23)

In the same running web app, opening an existing page and typing `/database`
into the editor showed a grouped `Data` slash menu whose first choices were
`New database`, `Linked view of database`, and `Inline database`. The same
ordered choices are returned for `/table`; the menu preview describes the
blank table and linked shared-record behavior. The temporary query was undone
after capture, so no project document was changed. The focused
`component-items.test.ts` suite pins the labels, aliases, and first-choice
ordering.

### Open databases page-jump evidence (2026-07-23)

Selecting `Open databases` from the command palette in the running web app now
opens the full-height database workspace without a dialog overlay. The capture
shows the database breadcrumbs, source rail, view tabs, table controls, and
first-row affordance. `App.dom.test.tsx` verifies that this command selects
`presentation="page"`; the canonical `DatabaseTableDialog` page test verifies
that the overlay is absent. Ordinary sidebar/recent URL integration remains a
separate UX-201–UX-208 gate.

### Inline database journey evidence (2026-07-23)

On the same running IPv4 app, a new document was created and the visible
`/` command menu was used to choose `Inline database`. The searchable database
picker offered both `Create new database` and existing database candidates. The
blank inline flow created `Inline browser audit` without leaving the document,
replaced the setup block with an editable Table, and focused the `New row title`
cell. A row named `Inline first record` was saved in place; the block displayed
the database title, a visible `Table` view tab, the shared-record explanation,
refresh/full-page controls, and the inline saved-state/undo affordance.

Opening the linked block's full database produced the canonical
`#database/<database>/<source>/<view>` route and showed the same record. Removing
the linked block returned to the host document, and reopening that canonical
route still showed `Inline first record`, proving that block removal does not
delete the source or its records. The focused `DatabaseView.dom.test.tsx`
journey and linked-view cache tests cover replacement, conversion, invalid and
permission/offline states, stable IDs, and the shared-record contract.

The same block action menu exposes `Duplicate view configuration`; selecting it
opens the canonical saved-view manager with the current view copied as a new
stable view configuration. The action is covered by the live menu capture and
the `DatabaseViewManagerDialog` initial-duplicate DOM test.

The follow-up regression capture found that remounting the manager during a
draft could replay the initial action and create duplicate copies. The manager
now keeps a stable instance across schema refreshes, synchronizes its view-name
state without remounting, and guards the initial action by stable key. The
focused manager/view suite passes 30 tests / 227 expectations, and the live
browser check now shows exactly one `Table copy` after one duplicate action.

### Direct manipulation evidence (2026-07-23)

The table-first interaction contract is now covered by the focused DOM suites
and the running implementation. `DatabaseTableDialog.dom.test.tsx` passes 65
tests / 393 expectations, including sticky table/title/new-row structure,
Enter-to-create with post-commit focus restoration, configured title opening,
type-specific direct editors, optimistic reconciliation, compact save/offline/
conflict/failure states, selection/bulk review thresholds, archive versus delete,
keyboard traversal and TSV/multi-cell paste, persisted layout and row density,
and secondary action menus for import/export, diagnostics, automations, and
archived rows. `DatabaseView.dom.test.tsx` additionally covers the inline
selection, review, undo/redo shortcut, and full-page handoff paths. The normal
table row-create path now emits a monotonic focus request only after the exact
commit succeeds, so a disabled mutation state cannot steal the next useful
input position. The table's `Database actions → History` entry now opens the
same durable Agent Runs receipt surface used by the agent recovery flow; the
focused entry-point and receipt tests below close UX-407.

### Canonical canvas route evidence (2026-07-23)

Canonical `#database/<database>/<source>/<view?>` targets now replace the
document editor inside `SidebarInset` and render the shared database surface
with a non-portal `canvas` presentation. The reviewed management and
`#database/new` creation surfaces remain page/dialog presentations.
`App.dom.test.tsx` passes 14 tests / 50 expectations and verifies the canvas is
mounted inside the sidebar inset, while the focused database suite verifies the
real workspace has no Dialog portal or overlay. The route suite also covers
hash view selection, back/forward restoration, missing-source back handling,
and permission-denied handling without an unsafe retry. This closes UX-202,
UX-205, and UX-208.

UX-201 remains open because the canvas still shares the `DatabaseTableDialog`
implementation internally; extracting a named main-canvas surface and normal
page chrome is the next architectural slice. UX-203, UX-204, UX-206, UX-207,
UX-209 likewise remain open pending sidebar/recent integration, normal page
chrome, entry-point coverage, and responsive acceptance. UX-210 is covered by
the conversion evidence below.

### Sidebar and recent database navigation evidence (2026-07-23)

The ordinary file sidebar now exposes database sources as a peer `Databases`
section. It loads the catalog only when expanded, navigates by the stable route,
opens when the current hash is a database page, and marks the active source with
`aria-current="page"`. The workspace command palette already treats database
targets as first-class recent entries; its UI test confirms a catalog-backed
database appears under `Recently opened` and reopens the canonical route.
`DatabaseSidebarSection.dom.test.tsx` passes 3 tests / 7 expectations and the
focused recent-navigation test passes 1 / 5. This closes UX-203. Normal page
chrome, additional entry points, and responsive proof remain open under
UX-204/206/209.

### Inline/full-page conversion evidence (2026-07-23)

The linked-view action now writes the current `databaseId`, `sourceId`, and
`viewId` together with the new `mode` whenever a block is converted. The
conversion path never embeds records or clones a source. The focused
`DatabaseView.dom.test.tsx` projection test exercises the menu action and
asserts the stable references plus absence of an embedded record payload. This
closes UX-210; responsive and broader visual conversion journeys remain open.

### Database History and recovery evidence (2026-07-23)

The `Database actions` menu now exposes a human-facing `History` item on both
the management and canonical canvas database surfaces. App wiring passes the
selection through to `DatabaseAgentRunsDialog`, so the entry opens durable Agent
Run receipts instead of a transient mutation log. The receipt surface shows the
compact run list, exact scope, proposed and actual diff, mutation ID,
verification status, and the undo token; its recovery test previews and applies
undo without leaving the History surface. The inline view mutation journey also
covers the table's Undo/Redo buttons plus `Ctrl/Cmd+Z` and `Shift+Ctrl/Cmd+Z`
shortcuts, including a revision-conflict recovery state.

Focused evidence:

- `DatabaseTableDialog.dom.test.tsx`: the History menu item invokes the host
  recovery surface (1 test / 32 expectations when filtered).
- `DatabaseAgentRunsDialog.dom.test.tsx`: compact history loads the selected
  exact run and exposes scope/diff/mutation/undo details (1 / 8); the adjacent
  recovery test previews and applies the exact undo receipt.
- `DatabaseView.dom.test.tsx`: inline Undo/Redo controls, keyboard shortcuts,
  and stale-revision conflict behavior remain covered in the long mutation
  journey.

This closes UX-407; cross-host, accessibility, responsive, visual, usability,
performance, and packaged-release evidence remain open.

## Re-audit snapshot (2026-07-23)

The implementation has moved the surface closer to Notion, but it has not
crossed the document-native UX bar:

| Measure | Current result | Interpretation |
| --- | --- | --- |
| Engine implementation checklist | 310/335 numbered items complete | Core/database and agent contracts are substantially implemented. |
| Notion UX checklist | 40/128 gates complete | Vocabulary/claim-boundary, normal New-page creation, slash database entry, page-based database discovery, inline/linked insertion, table-first direct manipulation, canonical canvas routing, sidebar/recent database navigation, stable inline/full-page conversion, and durable History/receipt recovery are evidenced; full visual, page chrome, state-matrix, and cross-host journey gates remain open. |
| First-use database entry | `New database` in sidebar, empty states, normal new-page dialog, command palette, plus slash-menu `New database`/`Linked view of database`; normal picker exposes Page/Database chooser and the resulting route lands in an editable table. `Open databases` enters the no-overlay page workspace. | Discovery and the web first-use path are evidenced; ordinary sidebar/recent integration and Electron proof remain open. |
| Blank creation | Optional title, `Untitled database` fallback, direct-safe exact-plan commit, immediate source/view selection, title/new-row focus | The blank human path is continuous in DOM coverage; template/import/agent paths intentionally retain review and visual browser proof remains open. |
| Full-page navigation | Stable `#database/<database>/<source>/<view?>` route, no-overlay canvas presentation, sidebar source section, and command-palette recents | Route and navigation identity are evidenced; normal page chrome and broader entry points remain incomplete. |
| Inline linked view | Catalog → source → saved-view picker, inline creation, shared rows, visible tabs, replacement, conversion, duplicate configuration, and block removal | The core inline/linked contract is evidenced; the complete visual state matrix remains open. |
| Direct editing | Direct-safe cell/row auto-approval, optimistic reconciliation, offline/conflict/failure states, post-commit focus, standard undo/redo, and durable History receipts are covered by focused DOM evidence | Elevated mutations retain exact review; full visual/cross-host acceptance remains open. |
| Browser evidence | In-app web renderer is reachable on IPv4 and normal New-page, page-first, inline creation, record sharing, and cancellation journeys are captured; no Electron or complete state-matrix journey is captured | The core web slice is evidenced, but NUI-105/NUI-701–NUI-705 remain release gates for cross-host, accessibility, responsive, usability, performance, and packaged-release parity. |

### Priority order for the next implementation pass

1. **P0 — Document-native entry and creation:** prove the new-page
   Page/Database choice and make the visible entry points land directly in an
   editable full-page table with title focus and a first-row affordance.
2. **P0 — Workspace integration:** replace the route-level dialog presentation
   with ordinary page chrome, sidebar/recent navigation, reload/missing/denied
   states, and back/forward behavior.
3. **P0 — Direct manipulation:** make routine human cell/row/property/view
   edits optimistic and undoable; retain exact review only for agent,
   destructive, permission, external, and threshold-crossing bulk work.
4. **P1 — Inline/record continuity:** support inline creation, conversion,
   block actions, canonical record pages, and relation navigation without the
   global database manager.
5. **P1 — In-context configuration:** move property and active-view actions
   into table headers/tabs and consolidate settings around the active view.
6. **P2 — Evidence and release:** run browser journeys, accessibility and
   responsive checks, usability sessions, performance budgets, and migration
   rehearsals before changing any parity claim to complete.

## User-facing vocabulary

These nouns are the default copy for the human surface. Stable IDs, manifest
paths, and source keys are implementation details shown only in advanced or
diagnostic contexts.

| Noun                     | Meaning in the UI                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Database                 | A named collection of page records with a shared schema.                                  |
| Page                     | One database record whose title, properties, and body share one identity.                 |
| View                     | A saved way to display the same records, including layout and view-scoped settings.       |
| Linked view              | An inline block that reads shared records from a database and can choose its own view.    |
| Property                 | A named column on records, edited with a type-specific control.                           |
| Template                 | A starting schema, view set, and optional example records.                                |
| Advanced storage details | Stable IDs, canonical folders, source mappings, and diagnostics for agents or migrations. |

## Official Notion interaction baseline

The target is semantic and interaction parity, not a pixel clone. As of the
audit date, official Notion documentation describes these core behaviors:

- Create a new page and select **Table**, or type `/database` in an existing
  page. Start from scratch, an existing source, AI, or suggested templates.
- A new database defaults to a table. Its first column names database pages;
  additional columns are properties.
- Database items are pages. `New` or `+ New` adds one, and opening it reveals
  page content beneath its properties.
- A full-page database behaves like an ordinary sidebar page. An inline
  database lives inside another page and can expand or convert to full-page.
- Saved views are directly switchable; a nearby `+` creates another view. Each
  view owns filters, sorts, groups, property visibility, and open behavior.
- Properties are added at the table's right edge or from a property-header menu,
  and cells use type-appropriate editors.

Sources:

- [Introduction to databases](https://www.notion.com/help/intro-to-databases)
- [Create a database](https://www.notion.com/help/create-a-database)
- [Database properties](https://www.notion.com/help/database-properties)
- [Views, filters, sorts and groups](https://www.notion.com/help/views-filters-and-sorts)
- [Database layouts](https://www.notion.com/help/layouts)

## UX gap matrix

| Journey         | Current SynapseNote UX                                   | Notion baseline                                   | Health          | Required correction                                             |
| --------------- | -------------------------------------------------------- | ------------------------------------------------- | --------------- | --------------------------------------------------------------- |
| Discover        | Command opens a management dialog.                       | New page type and `/database`.                    | Unhealthy       | Put databases in the normal page/block creation grammar.        |
| Start blank     | Form → review → commit → later open.                     | Create and immediately edit a table.              | Unhealthy       | Enter the table in one continuous flow.                         |
| Understand      | Copy starts with canonical storage and record semantics. | A collection of pages and properties.             | Unhealthy       | Use task language; move storage details under Advanced.         |
| Navigate        | Database lives inside a modal rail.                      | Full-page database is an ordinary navigable page. | Unhealthy       | Add route, sidebar presence, page chrome, and history behavior. |
| Insert inline   | Raw stable IDs go into a generic component.              | Slash insertion offers new/linked choices.        | Unhealthy       | Build a guided inline/linked picker.                            |
| Add row         | Separate form says `Plan new record`.                    | `New` or inline row immediately creates a page.   | Unhealthy       | Support immediate inline title entry.                           |
| Edit cell       | Proposed ghost requires explicit commit.                 | Direct cell edit, autosave, undo.                 | Unhealthy       | Autosave ordinary human edits; review elevated risk.            |
| Switch views    | Dropdown plus management dialog.                         | Visible view tabs and adjacent `+`.               | At risk         | Make view switching/creation persistent and in-context.         |
| Configure views | Powerful but spread across toolbar/dialogs.              | One view menu owns view settings.                 | At risk         | Consolidate controls behind the active view.                    |
| Open record     | Page and peek primitives exist.                          | Each row is a page with peek/full-page modes.     | Good foundation | Make it primary and consistent in every view.                   |
| Safety/agents   | Exact plan, ghost, risk, receipt, and recovery exist.    | No equivalent Notion contract.                    | Differentiator  | Keep for agents, destructive/bulk work, and optional preview.   |
| Empty state     | Sparse management message.                               | Usable table with clear first actions.            | Unhealthy       | Show Name, first row, templates, import, and AI in context.     |

## Target product contract

1. **A database is a page or block first.** Manifests and Markdown remain the
   storage model, but users need not understand them to create or edit data.
2. **Human direct manipulation is immediate and undoable.** Normal cell, row,
   title, property, and view edits save without a second confirmation.
3. **Agent writes are explicit, scoped, and reviewable.** Agent-authored,
   destructive, permission-changing, external-action, and large bulk mutations
   retain exact plans, ghosts, risks, receipts, and recovery.
4. **Every record is visibly a page.** Title cell, peek, full page, body,
   comments, history, and relations share one stable record identity.
5. **Progressive disclosure protects first use.** Storage, IDs, source mappings,
   diagnostics, imports/exports, and automations must not dominate routine work.
6. **Agent-friendly does not mean human-hostile.** Stable schemas,
   token-efficient projections, and exact mutation contracts sit behind a
   familiar document-native UI.

## New implementation checklist

Every item began unchecked. Check it only with code, the smallest relevant
automated test, and—for visual behavior—a captured running-app journey. Engine
capability alone is insufficient.

### UX-0 — Claims, measures, and architecture

- [x] **UX-001** Label parity-matrix completion as engine capability until the
      corresponding UX gates pass.
- [x] **UX-002** Define user-facing nouns: database, view, property, page,
      linked view, template, and advanced storage details.
- [ ] **UX-003** Define a full-page database route/document identity without
      duplicating manifest, source, or view identities.
- [ ] **UX-004** Define one database-surface state model reusable by full-page
      and inline rendering, not modal-only state.
- [ ] **UX-005** Classify mutations as direct-safe, elevated-risk, destructive,
      external-side-effect, agent-authored, or bulk.
- [ ] **UX-006** Define confirmation policy per class: direct-safe human edits
      skip ghost review; agent/elevated-risk work retains it.
- [ ] **UX-007** Specify optimistic update, acknowledgement, conflict, offline,
      retry, and undo behavior for direct-safe edits.
- [ ] **UX-008** Define local usability evidence: success, actions, time, errors,
      abandonment, and recovery.
- [ ] **UX-009** Freeze visual baselines at desktop widths 1280/1440 and compact
      width 768 using existing SynapseNote tokens.
- [ ] **UX-010** Add compatibility rules/fixtures for manifests, records, saved
      views, and existing `<DatabaseView>` blocks.

### UX-1 — Entry points and instant blank creation

- [x] **UX-101** Add `Database`/`Table` to the normal new-page flow. Evidence:
      `NewItemDialog.dom.test.tsx` and the 2026-07-23 browser journey show the
      Page/Database chooser and canonical route handoff.
- [x] **UX-102** Add `/database` and `/table` commands whose first choice is
      `New database` or `Linked view of database`. Evidence: the running-app
      slash-menu capture on 2026-07-23 shows both queries resolving to the
      ordered `New database`, `Linked view of database`, and `Inline database`
      choices; `component-items.test.ts` pins the order and aliases.
- [x] **UX-103** Add a visible database option to the editor's empty-page insert
      affordances; do not require the command palette. Evidence: slash-menu
      browser capture plus `DatabaseView.dom.test.tsx` and entry-point DOM
      coverage.
- [x] **UX-104** Keep `Open databases` as a power-user jump, but route it to a
      page or searchable picker rather than a global management modal. Evidence:
      `App.dom.test.tsx` verifies the command selects the page presentation;
      the 2026-07-23 running-app capture shows the full-height workspace with
      no dialog overlay. Ordinary sidebar/recent integration remains UX-201–208.
- [x] **UX-105** Make the blank path require no fields beyond an optional title.
      Evidence: blank-creation DOM coverage and the browser creation surface
      with an optional `Database name`.
- [x] **UX-106** Create the minimal canonical schema and immediately show its
      editable table after the creation action. Evidence: the browser route
      shows the canonical Table grid immediately after Blank submission.
- [x] **UX-107** Default the first property to Name/title and show `+ New` or an
      equivalent first-record affordance. Evidence: browser Table capture shows
      the Title column, `New record`, and focused `New record title` row.
- [x] **UX-108** Focus the database title for full-page creation and the first
      title cell for inline creation. Evidence: `DatabaseCreationDialog.tsx`
      uses auto-focus for the creation name, the Table DOM focus test covers
      inline handoff, and the inline browser journey captured the new-row title.
- [x] **UX-109** Make Escape/back during creation leave no orphaned database,
      source, manifest, or page. Evidence: `App.dom.test.tsx`,
      `DatabaseTableDialog.dom.test.tsx`, and the browser cancellation journey
      return from `#database/new` to an empty hash without a second database.
- [x] **UX-110** Move canonical folder, stable key, source IDs, and record
      meaning behind `Advanced`. Evidence: the browser creation surface keeps
      `Advanced storage details` collapsed and the creation DOM suite covers
      the disclosure.
- [x] **UX-111** Preserve the typed title and offer local retry when creation
      fails. Evidence: the failed-creation DOM journey reopens with the typed
      title and a retry action.
- [x] **UX-112** Verify `new page → database → visible table` in at most two
      primary actions after opening New. Evidence: the browser journey uses
      Database then Create database and lands on the editable table route.

### UX-2 — Full-page database as a workspace page

- [ ] **UX-201** Render a full-page database in the main canvas, not
      `DatabaseTableDialog`.
- [x] **UX-202** Give it a stable URL/hash that survives reload and back/forward
      navigation.
- [x] **UX-203** Show full-page databases in the sidebar/tree and recent items
      like ordinary pages.
- [ ] **UX-204** Reuse normal page chrome for icon, cover, title, breadcrumbs,
      favorite, and page actions where applicable.
- [x] **UX-205** Preserve the selected view in navigation/local state without a
      canonical write on simple view switches.
- [ ] **UX-206** Open databases from search, backlinks, relations, recent items,
      and command results.
- [ ] **UX-207** Replace the modal database rail with existing navigation and a
      picker only for cross-database lookup.
- [x] **UX-208** Reload into the same database/view with clear missing and
      permission-denied states.
- [ ] **UX-209** Support a responsive wide canvas without broken page chrome or
      unintended two-axis scrolling.
- [x] **UX-210** Offer inline/full-page conversion only when records and stable
      identities remain shared, never cloned.

### UX-3 — Inline and linked insertion

- [x] **UX-301** Replace raw stable-ID editing for new `DatabaseView` blocks
      with a searchable database/source/view picker.
- [x] **UX-302** Create a new inline database without leaving the current page.
- [x] **UX-303** Link an existing database and choose or create its saved view.
- [x] **UX-304** Explain that records are shared while saved-view configuration
      belongs to the chosen view.
- [x] **UX-305** Show database title and visible view tabs in the inline block.
- [x] **UX-306** Add block actions: open source, duplicate view configuration,
      convert, replace source, and remove block.
- [x] **UX-307** Keep stable IDs in MDX but expose them only in advanced/debug
      details.
- [x] **UX-308** Recover missing source/view references with `Choose replacement`.
- [ ] **UX-309** Align inline loading, empty, error, permission, offline, and
      stale states with full-page behavior.
- [x] **UX-310** Prove that removing a linked block never deletes its source or
      records.

### UX-4 — Table-first direct manipulation

- [x] **UX-401** Default to a table with sticky header, title column, and new-row
      affordance.
- [x] **UX-402** Create a page by typing in the new-row title cell and pressing
      Enter; leave focus in a useful next position.
- [x] **UX-403** Open the title using the configured side peek, center peek, or
      full-page behavior.
- [x] **UX-404** Edit direct-safe cells in place with type-specific editors and
      no plan/commit banner.
- [x] **UX-405** Render optimistic edits and reconcile canonical results without
      cursor/focus jumps.
- [x] **UX-406** Show compact saving, saved, offline, conflict, and failed states
      without converting the table into a transaction screen.
- [x] **UX-407** Expose undo/redo through standard shortcuts/history; place exact
      receipts under History. Evidence: the table History entry, Agent Runs
      receipt-detail/recovery tests, and inline shortcut/button mutation journey
      above.
- [x] **UX-408** Support row selection/bulk actions and trigger review only when
      the UX-005 threshold is crossed.
- [x] **UX-409** Keep archive and permanent delete distinct and explain recovery.
- [x] **UX-410** Support keyboard travel, Enter-to-edit, Escape-to-cancel, paste,
      multi-cell paste, and row creation.
- [x] **UX-411** Persist column resize/reorder and row density as immediate view
      configuration.
- [x] **UX-412** Move import/export, diagnostics, automations, and archived rows
      into secondary menus.

### UX-5 — Properties in context

- [ ] **UX-501** Add a right-edge `+` column affordance with a property picker.
- [ ] **UX-502** Add a header menu for rename, configure, sort, filter,
      calculate, insert left/right, hide, duplicate, and delete.
- [ ] **UX-503** Use friendly property names/examples before schema terminology.
- [ ] **UX-504** Keep Title uniquely required and explain conversion blockers.
- [ ] **UX-505** Use type-specific cell editors for every implemented family.
- [ ] **UX-506** Classify schema changes separately from cell-value changes.
- [ ] **UX-507** Preview destructive property deletion with value count,
      dependency impact, and recovery.
- [ ] **UX-508** Put formula/rollup errors beside the relevant property/cell.
- [ ] **UX-509** Make property visibility/order view-scoped, not schema changes.
- [ ] **UX-510** Ensure header and settings-menu property actions converge on
      one canonical result.

### UX-6 — Visible views and coherent settings

- [ ] **UX-601** Replace the primary view dropdown with visible reorderable tabs
      near the database title.
- [ ] **UX-602** Put `+` beside the tabs for every supported layout.
- [ ] **UX-603** Name a new view and choose its layout with sensible property
      suggestions before it appears.
- [ ] **UX-604** Put layout, properties, filter, sort, group, color, open
      behavior, and layout settings in one active-view menu.
- [ ] **UX-605** Keep active quick filters/sorts visible as compact explainers.
- [ ] **UX-606** Add rename, duplicate, favorite, reorder, default, and delete
      to the view-tab context menu.
- [ ] **UX-607** Prevent deletion of the last usable view or atomically create a
      fallback.
- [ ] **UX-608** Switch views immediately and preserve scroll/focus per view.
- [ ] **UX-609** Let linked blocks use independent views without copying rows.
- [ ] **UX-610** Align title, tabs, controls, states, and record opening across
      every supported layout.

### UX-7 — Records are pages

- [ ] **UX-701** Make each applicable record title open its one canonical page.
- [ ] **UX-702** Share one record-page component across side peek, center peek,
      and full page.
- [ ] **UX-703** Show database breadcrumbs and return-to-view on record pages.
- [ ] **UX-704** Synchronize title/property edits between table and page without
      manual refresh.
- [ ] **UX-705** Render page body below properties with normal editor behavior.
- [ ] **UX-706** Expose comments, history, permissions, icon, cover, and layout
      through normal page affordances.
- [ ] **UX-707** Navigate previous/next records in the active view context.
- [ ] **UX-708** Align duplicate, move, archive, restore, and delete between row
      and page menus.
- [ ] **UX-709** Navigate relations without opening the global database dialog.
- [ ] **UX-710** Verify deep links, reload, missing, archived, and denied states.

### UX-8 — Templates, import, and assisted creation

- [ ] **UX-801** Put Blank, templates, import, existing folder, and
      agent-assisted creation in one start surface.
- [ ] **UX-802** Preview templates with realistic properties, views, and rows.
- [ ] **UX-803** Keep Blank fastest and remember no advanced choice implicitly.
- [ ] **UX-804** Preview CSV/TSV headers, inferred types, invalid rows, and target
      view before commit.
- [ ] **UX-805** Move existing-folder identity assignment into a dedicated
      advanced migration flow.
- [ ] **UX-806** Turn a natural-language goal into a preview of properties,
      views, templates, and optional sample records.
- [ ] **UX-807** Edit agent-suggested properties/views directly before approval.
- [ ] **UX-808** Land every successful method in the resulting page/block, not
      the management shell.

### UX-9 — Agent-friendly differentiation

- [ ] **UX-901** Keep stable machine IDs behind every object without showing
      them by default.
- [ ] **UX-902** Add a context inspector for compact schema, view, selection,
      token estimate, truncation, and citations.
- [ ] **UX-903** Invoke agents from database, view, selection, row, property, or
      record page with scope explicit in the composer.
- [ ] **UX-904** Distinguish agent proposals from human edits and group related
      proposals into one review.
- [ ] **UX-905** Explain plans in human language first; put IDs, files, risk, and
      receipts under details.
- [ ] **UX-906** Permit selective approval only when atomic/referential safety is
      preserved; otherwise explain atomic grouping.
- [ ] **UX-907** Always review permission changes, permanent deletion, external
      actions, broad schema migration, and threshold-crossing bulk edits.
- [ ] **UX-908** Inspect, undo, retry, or resume an agent run without losing the
      current view.
- [ ] **UX-909** Explain retrieval query, filters, ranking, returned/omitted
      fields, permissions, and token budget.
- [ ] **UX-910** Preserve stable agent APIs/MCP contracts through the UI/route
      redesign.

### UX-10 — Accessibility, responsive behavior, and performance

- [ ] **UX-1001** Define keyboard order across title, tabs, controls, headers,
      cells, new row, and pagination.
- [ ] **UX-1002** Implement visible focus, roving grid focus, selection, and edit
      announcements without trapping users.
- [ ] **UX-1003** Name icon controls and apply correct semantics to menus,
      pickers, dialogs, save states, and conflicts.
- [ ] **UX-1004** Test screen readers on table, board, calendar, record peek,
      property editor, and agent review.
- [ ] **UX-1005** Return focus correctly after menus, pickers, peeks, advanced
      dialogs, and review; avoid nested modal stacks.
- [ ] **UX-1006** Verify WCAG contrast in light/dark themes, including tags and
      conditional colors.
- [ ] **UX-1007** Keep the primary path usable at 768 CSS pixels without clipped
      actions or two-axis page scrolling.
- [ ] **UX-1008** Bound large-view rendering while retaining keyboard and
      screen-reader behavior.
- [ ] **UX-1009** Set budgets for shell, first data, view switch, cell save, and
      record peek latency.
- [ ] **UX-1010** Prevent focus jumps, full-table flashes, and scroll resets on
      save, refresh, presence, and agent proposals.

### UX-11 — Journey tests, usability gates, and release

- [ ] **UX-1101** E2E full-page blank creation from the new-page flow.
- [ ] **UX-1102** E2E `/database` inline creation.
- [ ] **UX-1103** E2E linked-view insertion for an existing database.
- [ ] **UX-1104** E2E row creation, typed cell editing, reload persistence, and
      undo.
- [ ] **UX-1105** E2E property add/configure/reorder/hide and destructive delete
      review.
- [ ] **UX-1106** E2E view create/switch/configure/duplicate/reorder/delete using
      visible tabs.
- [ ] **UX-1107** E2E row → peek → full page → return to the same view context.
- [ ] **UX-1108** E2E different policies for agent proposal, human direct edit,
      and destructive human action.
- [ ] **UX-1109** Migration fixtures for existing manifests, pages, views, MDX
      references, and last-opened state.
- [ ] **UX-1110** Automated accessibility plus manual keyboard/screen-reader
      checks on primary journeys.
- [ ] **UX-1111** Five uncoached first-use sessions: at least four users create a
      database, add a property, add two pages, and create a second view without the
      command palette or raw IDs.
- [ ] **UX-1112** Median `new page → editable table` under 15 seconds and no more
      than two primary actions after opening New.
- [ ] **UX-1113** Median `add property → edit value` under 20 seconds and `create
second view → switch back` under 25 seconds.
- [ ] **UX-1114** Capture final desktop/compact journeys beside this baseline
      and record remaining differences.
- [ ] **UX-1115** Run affected app/component/E2E tests while iterating; reserve
      the repository-wide check and slow server suite for PR readiness.
- [ ] **UX-1116** Update help, release notes, parity claims, and the engine
      checklist only after usability gates pass.

## Delivery sequence

| Phase | Scope              | Exit gate                                                                        |
| ----- | ------------------ | -------------------------------------------------------------------------------- |
| P0    | UX-0               | Route/state, mutation policy, and compatibility fixtures are agreed.             |
| P1    | UX-1 + UX-2        | A blank full-page database is created and edited in the normal canvas.           |
| P2    | UX-4 + UX-5 + UX-6 | Table/property/view work no longer depends on the management dialog.             |
| P3    | UX-3 + UX-7        | Inline/linked views and record pages form one document-native flow.              |
| P4    | UX-8 + UX-9        | Assisted creation and agent review preserve safety without taxing routine edits. |
| P5    | UX-10 + UX-11      | Accessibility, performance, migration, usability, and release evidence pass.     |

## Definition of Notion-aligned UX complete

- A first-time user creates a full-page or inline database without the command
  palette, raw IDs, canonical-path terminology, or a management dialog.
- Blank creation lands immediately in an editable table whose rows clearly open
  as pages.
- Ordinary human edits are direct, autosaved, resilient, and undoable; agent,
  destructive, broad, and external-effect mutations retain exact review.
- Views are visible/in-context, properties are created from the table, and
  record pages preserve view context.
- Existing canonical data and agent APIs remain compatible.
- UX-10 and UX-11 accessibility, performance, migration, and first-use evidence
  pass.
