# RFC 0001 databases: next-agent handout

- Prepared: 2026-07-23 (re-audited)
- Worktree: `/Users/minjaepark/code/SynapseNote-agent-databases`
- Branch: `codex/agent-native-databases`
- Authoritative checklist: [0001-databases-implementation-checklist.md](./0001-databases-implementation-checklist.md)
- Main design: [0001-databases-and-agent-data-plane.md](./0001-databases-and-agent-data-plane.md)
- UX gap checklist: [0001-notion-ux-gap-implementation-checklist.md](./0001-notion-ux-gap-implementation-checklist.md)
- Changeset: `../../.changeset/add-file-native-database-core.md`
- Latest feature changeset: `../../.changeset/inline-database-create-route.md`
- Latest property-journey test commit: `f5ff201d`
- Latest primary-journey docs commit: `f6d1cfcd`
- Latest primary-journey feature commit: `b79b1801`
- Latest page-terminology feature commit: `33ad933c`
- Latest route-handoff feature commit: `8896e7bd`
- Latest database-sidebar request-lifecycle commit: `02449e9b` (supersedes `226626cf` and `3d5713b0`)
- Latest database-sidebar request-lifecycle changeset: `../../.changeset/database-sidebar-request-state.md`
- Latest database-page semantics commit: `bcd078a0`
- Latest database-page semantics changeset: `../../.changeset/database-page-semantic-surface.md`
- Latest inline-view projection commit: `f0201231`
- Latest inline-view projection changeset: `../../.changeset/inline-view-projection-persistence.md`
- Latest inline-view tab-action commit: `18682ec2`
- Latest inline-view tab-action changeset: `../../.changeset/inline-view-tab-actions.md`
- Latest inline-view rename commit: `80fb4807`
- Latest inline-view rename changeset: `../../.changeset/inline-view-rename-handoff.md`
- Latest inline-view default-action commit: `f9ef4f4d`
- Latest inline-view default-action changeset: `../../.changeset/inline-view-default-handoff.md`
- Latest page-terminology changeset: `../../.changeset/notion-database-page-language.md`
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
- Latest inline duplicate-view changeset: `../../.changeset/inline-duplicate-view-action.md`
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
- Latest database page appearance changeset: `../../.changeset/database-page-appearance.md`
- Latest inline title accessibility changeset: `../../.changeset/inline-title-accessible-name.md`
- Latest inline action-context changeset: `../../.changeset/inline-action-context.md`
- Latest inline agent-label changeset: `../../.changeset/inline-agent-context-label.md`
- Latest database responsive changeset: `../../.changeset/database-page-responsive.md`
- Latest property deletion safety changeset: `../../.changeset/database-property-deletion-preview.md`
- Latest view-scoped property layout changeset: `../../.changeset/database-view-scoped-property-layout.md`
- Latest view-action convergence changeset: `../../.changeset/database-view-action-convergence.md`
- Latest visible view-tabs changeset: `../../.changeset/database-visible-view-tabs.md`
- Latest view-suggestions changeset: `../../.changeset/database-view-suggestions.md`
- Latest coherent view-settings changeset: `../../.changeset/database-coherent-view-settings.md`
- Latest active-query explainer changeset: `../../.changeset/database-query-summary.md`
- Latest saved-view tab-actions changeset: `../../.changeset/database-view-tab-actions.md`
- Latest last-view safety changeset: `../../.changeset/database-last-view-safety.md`
- Latest view-state memory changeset: `../../.changeset/database-view-state-memory.md`
- Latest linked-view override changeset: `../../.changeset/linked-database-view-overrides.md`
- Latest cross-layout view-surface changeset: `../../.changeset/database-layout-contract.md`
- Latest canonical record-title changeset: `../../.changeset/database-record-title-links.md`
- Latest shared record-page surface changeset: `../../.changeset/shared-record-page-surface.md`
- Latest record-breadcrumb changeset: `../../.changeset/database-record-breadcrumbs.md`
- Latest record-page sync changeset: `../../.changeset/database-record-page-sync.md`
- Latest record-body placement changeset: `../../.changeset/database-record-body.md`
- Latest record-page affordances changeset: `../../.changeset/database-record-page-affordances.md`
- Latest record-navigation changeset: `../../.changeset/database-record-navigation.md`
- Latest record-actions changeset: `../../.changeset/database-record-actions.md`
- Latest relation-links changeset: `../../.changeset/database-relation-links.md`
- Latest record-state-safety changeset: `../../.changeset/database-record-state-safety.md`
- Latest unified-creation-surface changeset: `../../.changeset/database-creation-start-surface.md`
- Latest template-preview changeset: `../../.changeset/database-template-previews.md`
- Latest blank-default changeset: `../../.changeset/database-creation-default.md`
- Latest CSV-preview changeset: `../../.changeset/database-csv-preview.md`
- Latest source-identity-migration changeset: `../../.changeset/database-source-identity-migration.md`
- Latest agent-plan-preview changeset: `../../.changeset/database-agent-plan-preview.md`
- Latest agent-plan-editing changeset: `../../.changeset/database-agent-plan-editing.md`
- Latest creation-result-route changeset: `../../.changeset/database-creation-result-route.md`
- Latest machine-ID disclosure changeset: `../../.changeset/database-machine-ids.md`
- Latest Context Inspector summary changeset: `../../.changeset/database-context-summary.md`
- Latest scoped database agent handoff changeset: `../../.changeset/database-agent-scope-composer.md`
- Latest agent proposal provenance changeset: `../../.changeset/database-agent-provenance.md`
- Latest agent plan summary changeset: `../../.changeset/database-agent-plan-summary.md`
- Latest atomic approval copy changeset: `../../.changeset/database-atomic-approval-copy.md`
- Latest sensitive-operation review changeset: `../../.changeset/database-sensitive-review.md`
- Latest Agent Run current-view recovery changeset: `../../.changeset/agent-run-current-view-recovery.md`
- Latest retrieval explainability changeset: `../../.changeset/database-retrieval-explainability.md`
- Latest Notion canvas vocabulary changeset: `../../.changeset/notion-canvas-page-vocabulary.md`
- Latest converged-creation changeset: `../../.changeset/notion-converged-creation.md`
- Latest route-handoff changeset: `../../.changeset/notion-route-handoff.md`
- Latest blank-identity/StrictMode changeset: `../../.changeset/notion-blank-database-identity.md`
- Latest creation-retry changeset: `../../.changeset/notion-creation-retry.md`
- Latest inline creation-retry changeset: `../../.changeset/inline-database-create-retry.md`
- Latest bounded document-native journey test commit: `917ee0f4`
- Latest primary journey affordance commit: `b79b1801`
- Latest primary journey affordance changeset: `../../.changeset/primary-database-journey-affordances.md`
- Latest saved-view mutation journey test commit: `4f30e862`

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

### 2026-07-23 bounded system-Chrome document-native run

One focused Playwright run used the installed system Chrome (headless,
1280x720, one worker, no retries) against the running IPv4 app. All three
document-native cases passed in **45.9s**:

- sidebar `New database` → editable Table → first page creation;
- slash-menu `/database` inline creation → first row/title → canonical handoff
  → browser Back;
- linked view insertion → shared row → record peek/full-page route → browser
  return.

This is supporting web evidence only. It does not close the visual baseline,
compact-width, accessibility/manual, NewItemDialog-specific, Electron,
agent-policy, or full mutation-matrix gates. The run emitted non-blocking
diagnostics for the existing frozen-table-header lookup, missing dialog
description metadata, and React `flushSync` lifecycle warnings; preserve those
as follow-up quality work rather than treating them as journey failures.

## Important product correction (2026-07-23)

The user has explicitly rejected a DBMS/administration-first experience. The
target is Notion-equivalent UI/UX: a database is an ordinary editor block or
page, the table is visible immediately, and the user can rename the title, add
a property, add a row, and switch views without opening a management wizard or
handling IDs. The earlier `#database/new` capture showed a method chooser over
an already-mounted table; that was the confirmed parity failure that drove the
current direct table-first creation slice. The remaining visual/cross-host
gates still must prove the new surface in a running app.

The earlier 101/128 snapshot is structural evidence only. The current
structural count is **115/129**; do not close
the remaining UX gates or describe the feature as Notion-parity complete until
the following first-use flow is visually and interactively true:

`new page or slash → page/block title → immediately editable table → inline
new-page row → add property from the table edge → visible view tabs → record
peek/page`

Template/import/folder/Assistant creation, machine IDs, schema/index details,
agent context, diagnostics, and review receipts must remain secondary
progressive-disclosure surfaces. The captured regression image is
`docs/rfcs/assets/0001-notion-ux-audit/06-current-new-database-screen.png`.

### Notion canvas vocabulary continuation (2026-07-23)

`a1977f9c fix: make database canvas page-first` removes another visible
DBMS cue from the document-native canvas. The canvas no longer repeats the
source title inside the table body, its primary action is rendered as `New`
(accessible name `New page`), and the inline composer uses `New page` / `Add
page` language. The administration presentation keeps its existing `New
record` and reviewed-plan terminology. The focused canvas DOM journey passes
18 expectations; app typecheck and targeted Biome checks pass.

This is a vocabulary and hierarchy correction, not evidence that visual,
Electron, manual accessibility, usability, performance, or release gates are
closed.

The packaged Turbo Electron launch remains blocked at
`@nedian0brien/synapse-native-config#build` because `@napi-rs/cli` cannot run
`cargo metadata` in this checkout. A direct development Electron fallback can
launch after rebuilding `packages/core`; it has now provided focused live
evidence for the sidebar and empty-state creation entries. Treat the packaged
native-config failure separately from the working direct-dev renderer; do not
spend iteration time repeating the full launch until that toolchain is
available.

### 2026-07-23 navigation and sidebar continuity slice

Two small continuity defects were closed in the running database surface:

- `8896e7bd fix: close database surface on document navigation` dispatches a
  shared route-navigation event from `replaceHashWithoutNavigation`. The
  database page and App-level creation surface now unmount when a normal
  document route replaces a canonical database hash; the focused DOM journey
  and a live browser recheck showed the database grid disappears and the new
  document route remains active.
- `226626cf fix: bound database sidebar catalog loading` removes the
  translator-function identity from the catalog request effect and keeps the
  current translator in a ref. The focused sidebar suite passes with an
  intentionally fresh translator on every render, covering the lifecycle that
  could abort an in-flight catalog request. A ten-second timeout now exposes a
  retryable error instead of leaving an indefinite spinner. A fresh host-level
  network capture is still required before this counts toward NUI-105/UX-1101;
  the focused test alone is not a visual-gate closure.
- `02449e9b fix: keep database sidebar catalog request alive` fixes the deeper
  state-loop variant: the effect no longer depends on the `loading` state it
  sets, so rendering the spinner cannot abort the request. Retry increments an
  explicit request attempt, stale responses are ignored, and closing/reopening
  the section starts a clean request. The focused suite now passes 4 tests / 10
  expectations, including an abort-aware deferred request. A live IPv4 browser
  recheck now changes the expanded section from `Loading databases` to the
  `Untitled database` source entry. This is navigation evidence, not closure
  of the remaining cross-host visual/accessibility/usability/release gates.

These commits improve navigation continuity and request resilience; they do
not close the remaining cross-host visual, accessibility, usability, or release
gates.

### 2026-07-23 page-surface semantics slice

`bcd078a0 fix: expose database pages as non-modal workspaces` separates the
route-level page/canvas presentation from the compatibility management dialog.
Page and canvas surfaces now use a non-modal Dialog primitive with an explicit
`main` landmark; the internal workspace body becomes a plain `div` in those
presentations so the document does not contain nested `main` landmarks. The
legacy management presentation remains a modal dialog. The focused page-route
DOM test passes 1 test / 35 expectations and asserts that no dialog role is
exposed; the live IPv4 browser accessibility tree now reports `main
"Untitled database"` beneath the editor shell. This corrects semantics and
focus boundaries, but is not visual, responsive, manual screen-reader, or
cross-host parity sign-off.

### 2026-07-23 linked-view projection persistence slice

`f0201231 fix: persist inline database view projection` wires the inline Table's
header hide/reorder callback to the host JSX block's `viewOverrides.projection`.
The canonical database view remains shared, while each linked block now keeps
its own visible property order across refreshes and remounts. The focused
`DatabaseView.dom.test.tsx` case drives `Property options for Status → Move
right` and asserts the serialized stable property order; the full focused file
passes 22 tests / 261 expectations, app typecheck, and targeted Biome. This is
functional linked-view evidence; browser visual, accessibility, and E2E
coverage remain open under UX-1104–UX-1106 and NUI-701.

### 2026-07-23 inline saved-view tab-action routing slice

`18682ec2 fix: honor inline saved-view tab actions` closes a fall-through in
the inline saved-view tab menu. Duplicate, Favorite, move-left/right, and
Delete now become explicit reviewed manager intents with the selected stable
view ID; they no longer open an unrelated generic manager screen. The manager
keeps the canonical lifecycle compiler as the mutation boundary, and the
Favorite intent is keyed by its target boolean so repeated toggles cannot be
silently swallowed. Rename, Make/Clear default, and Manage views continue to
open a handoff surface; the two direct-input/default cases were converged in
the follow-up commits below, while Manage views remains the full management
surface.

Focused evidence at this commit: the combined
`DatabaseViewManagerDialog.dom.test.tsx` and `DatabaseView.dom.test.tsx` run
passes 37 tests / 295 expectations; the helper mapping test covers the five
initial lifecycle actions and the manager test covers favorite, reorder, and
delete forwarding. App typecheck, targeted
Biome, and `git diff --check` pass. This closes the inline action-routing
implementation slice, but not the remaining visual, accessibility, Electron,
responsive, performance, or packaged-release gates.

`80fb4807 fix: route inline view rename directly` completes the remaining
inline rename handoff: selecting Rename now opens the reviewed rename dialog
with the current saved-view name and stable ID, rather than opening the generic
manager. The manager explicitly ignores that handoff because the rename dialog
owns the required user input. Focused evidence adds the rename handoff DOM
journey to the 78-test / 516-expectation `DatabaseTableDialog` suite; the
manager-plus-inline suite passes 38 tests / 296 expectations. App typecheck,
targeted Biome, and diff checks pass.

`f9ef4f4d fix: route inline view default actions directly` applies the same
convergence to Make default and Clear default. Inline tabs now call the
existing reviewed default-view mutation boundary with the selected stable view
ID (or an explicit clear), and do not open the generic manager. The focused
default handoff test reaches the plan endpoint for both Make and Clear and
asserts that the manager is absent (1 test / 6 expectations); the
manager-plus-inline suite passes 39 tests / 300 expectations. The default
helper uses `useEffectEvent` so an initial handoff cannot be replayed by state
refreshes. Follow-up test commit `2372c42f` adds the explicit Clear coverage.

### Notion surface continuation (2026-07-23)

The follow-up implementation keeps the temporary creation shell honest and
pushes the linked block closer to Notion's document grammar:

- `a6dd621c fix: disable pending database preview controls` disables the
  preview's non-functional Table, new-view, and property controls until the
  canonical table is mounted; cancellation still aborts the pending mutation.
- `756256d1 feat: reveal table controls on hover` keeps selection, property,
  and row-management chrome available to keyboard/focus users while revealing
  it on hover/focus on the Notion surface instead of presenting an always-on
  admin toolbar.
- `0561a56 feat: show database title above inline views` separates the
  database/source title from the saved-view tab name in inline blocks.
- `32e998a3 feat: rename inline databases in place` adds click-to-rename with
  Enter/Escape behavior and the existing direct-safe, undoable title mutation.

These are implementation slices, not visual-gate closures: the checklist was
**101/128** at that point, and browser/Electron capture is still required before
claiming pixel-level Notion parity.

### Implementation slice completed after the correction (2026-07-23)

Three feature commits now move the default experience toward that grammar:

- `19feafab feat: open databases with notion-first table` — full-page blank
  creation shell, inline blank intent, and focused DOM/type evidence.
- `29b14c72 feat: trim admin chrome from database canvas` — removes the most
  DBMS-shaped controls from the primary canvas and keeps archived records in
  the secondary menu.
- `16e6805a feat: render inline databases table first` — shows the inline
  Title/table/view/new-page shell before the blank mutation resolves.

The follow-up table-control slice (`3c241c52`) also hides layout/calculation
controls and property type labels from the Notion surface. These commits do
not close visual UX gates: the structural count was 101/128 at that point, and
the running Electron/web journey still needs to confirm appearance, focus, and
record peek/page behavior. The table-edge property picker is covered by
`d8f621a5 feat: add properties from the notion table edge`; its advanced
schema commit still uses the reviewed mutation seam. `4cd0d8ff` adds a narrow
human-only direct-safe policy for adding an empty property from a table edge;
agent-authored schema writes remain review-required.

### 2026-07-23 Notion creation handoff continuity

`a450e698 fix: complete notion database page handoff` completes the functional
handoff guard around the primary Notion path:

- A no-op plan whose desired canonical state already exists is reported as
  `converged`, so a renderer reload or repeated navigation opens the existing
  page instead of showing a blocked creation state.
- The temporary `#database/new` page closes explicitly after replacing the
  hash with the canonical `#database/<database>/<source>/<view>` workspace.
- The request is reused across React StrictMode's development effect
  probe; the page no longer issues duplicate mutations or gets stuck in
  `Preparing your editable table`. Real unmounts still abort the request.
- Focused DOM, mutation-client, typecheck, Biome, and diff checks pass. No
  repository-wide server suite or repeated E2E run was used.

This is a functional continuity fix, not a claim of DBMS feature parity or
complete Notion visual parity. The primary acceptance flow remains:

`new page or slash → page/block title → editable table → inline New page row →
property/view controls → record peek/page`.

### 2026-07-23 Electron entrypoint follow-up

After the Mac was unlocked, the direct development Electron renderer was
checked with the smallest affected UI actions:

- Sidebar toolbar `New database` entered `#database/new` and converged on a
  canonical `#database/<database>/<source>/<view>` page.
- Empty-state `New database` used the same typed route and converged on the
  same page surface.
- The accessibility tree exposed `Untitled database`, `Table`, `New page`,
  `Add property`, `Filters`, and `View settings`; the legacy `Create database`
  method chooser was absent after the route transition.
- The live check exposed a nested-form lifecycle bug: the temporary creator's
  reviewed form remained portaled after canonical navigation. Commit
  `21a35284 fix: keep notion database creation page on top` clears that child
  state when its host closes, and the focused regression test passes.
- Commit `16e64889 fix: expose database page title to agents` aligns the
  page-title button's accessible name with the visible database title and
  retains rename guidance in the tooltip. The canonical workspace DOM journey
  covers this name explicitly.
- Commit `3e84141d fix: keep database canvas page-like` removes the modal-style
  close control from the canonical canvas; users return through the visible
  `Databases` breadcrumb while the secondary management dialog keeps its close
  affordance.

This is partial cross-host evidence, not closure of NUI-105. Command-palette,
slash, normal New-page, visual comparison, manual accessibility, usability,
performance, and packaged-release gates remain open. No full server suite or
repeated E2E run was used.

### 2026-07-23 Inline title accessibility follow-up

The visible title button in `DatabaseView` now uses the displayed source name
as its accessibility name (`Tasks`) instead of exposing only the action label
`Rename inline database`. The action wording remains in the native tooltip, and
activating the named button still opens the `Inline database title` input. The
focused single-view DOM test passes 1 test / 6 expectations; the broader
`DatabaseView.dom.test.tsx` file retains a pre-existing multiline-paste
commit-count mismatch and was intentionally not rerun as a release gate.

The follow-up `fa80636c fix: contextualize inline database actions` gives the
overflow menu an accessible name containing the displayed source/database and
saved-view names (`Database view actions for Tasks · Open tasks`). Commit
`4c573af8 fix: contextualize inline database controls` applies the same
context to refresh, change-view, and open-full-database icon controls. This
keeps the icon-only Notion-style chrome compact while making repeated linked
blocks searchable and distinguishable by agents. The focused journey passes 2
tests / 15 expectations; no full E2E or server suite was run.

Commit `df37e544 fix: label inline agent actions with view context` extends the
same convention to the inline `Ask agent` trigger (`Ask agent about Tasks ·
Open tasks`). This changes presentation only; the handoff scope still carries
stable database/source/view IDs. Its assertion is included in the focused
single-view journey (11 expectations).

Commit `d9e796c1 test: align database journey with contextual labels` updates
the document-native browser journey to activate the title through its heading
context and match the contextual `Open full database:` name. Playwright test
discovery lists all 3 journey cases; no browser execution was repeated.

Commit `b6c0b5dc fix: contextualize inline add-view action` labels the compact
plus control with `New database view for Tasks · Open tasks`. Its focused
single-view assertion passes; the broader inline journey retains the known
multiline-paste commit-count baseline failure and was not treated as release
evidence.

Commit `d7ace02f fix: contextualize inline database landmark` names the ready
inline region `Linked database view: Tasks · Open tasks` and updates all three
document-native journey selectors. Loading retains the generic landmark name
until the description is available; the focused DOM journey passes and the
Playwright file is only discovery-checked.

Commit `3e224595 fix: expose inline row actions by record title` applies the
same agent-friendly rule to the primary inline Table rows. Actions now read
`Open record Shared canonical row` / `Inspect context for record Shared
canonical row` and use the title for duplicate/archive/move/delete/select;
full-page administration keeps its stable-ID labels. Focused inline and
canonical-table DOM checks pass; no additional E2E run was made.

Commit `a7c24956 fix: expose Board actions by record title` carries the same
contract into inline Board cards. Card, open, move-to-group, duplicate,
inspect-context, archive/restore, and delete actions now name the visible page
title (for example, `Move record First task to group`) while `data-record-id`
and mutation scope keep the stable canonical ID. `DatabaseBoard.dom.test.tsx`
passes 3 tests / 16 expectations. Commit `e770e1cd test: align linked Board
journey with landmark` updates the two linked-Board DOM journeys to assert the
semantic region and active `Task board` view tab; they pass 2 tests / 17
expectations. No E2E browser run was repeated.

Commit `44c6d0a6 fix: name alternate view actions by record title` extends the
same agent-facing naming to Calendar, Timeline, List, Gallery, Feed, Chart, and
Map. Open/inspect, scheduling, resize, and hierarchy controls use the visible
record title while stable IDs remain in callbacks and DOM markers. The focused
alternate-renderer run passes 24 tests / 91 expectations; the linked-view
DatabaseView slice passes 6 tests / 62 expectations. The changeset is
`.changeset/inline-alternate-record-labels.md`; no E2E browser run was repeated.

### 2026-07-23 Database workspace accessibility gate

Commit `a80d9495 test: add database workspace accessibility gate` adds
`packages/app/tests/a11y/database-primary.e2e.ts` with `DB-A11Y-01` and
`DB-A11Y-02`. The first creates a canonical database through the plan/commit
API, opens it through the normal `Databases` command-palette surface, waits for
the rendered Table and title-based record action, and audits the workspace. The
second creates an inline database through the document slash flow, saves a
title-based row, and audits the ready linked Table. Both use WCAG 2.1 tags and
block serious and critical violations; color contrast remains excluded from
this automated slice because visual contrast is a separate cross-host/manual
gate. Biome and app typecheck pass, and Playwright discovery lists two tests.
Execution is intentionally deferred: this checkout still lacks the Playwright
Chromium executable, so no additional full E2E run was started.

### 2026-07-23 Human page terminology and progressive disclosure

The terminology slice is now implemented and covered without a full E2E or
server-wide run. Canonical/page, inline, table, peek, page chrome, loading and
recovery states use `page` where a Notion user sees the object; board, calendar,
timeline, list, gallery, feed, chart, map, and dashboard renderers receive the
same page-surface flag. Stable `record` fields, IDs, API names, and machine-ID
details remain available in advanced/agent/diagnostic disclosures.

Focused evidence:

- `bun run typecheck` in `packages/app` passed.
- Targeted Biome and `git diff --check` passed for the changed renderer,
  accessibility, DOM-test, and bounded journey files.
- The focused DOM set passed 134 tests / 882 expectations before the final
  three expectation updates; those three stale-label cases were then rerun
  directly and passed (the route-level page case, the inline cell-control case,
  and the live projection case). No full E2E or server-wide test was repeated.

This closes NUI-016 and UX-011. UX-009 visual baselines, manual screen-reader
review, observed usability, responsive browser capture, Electron packaging,
and the remaining release gates stay open. Feature changeset:
`../../.changeset/notion-database-page-language.md`.

## Current status

- Numbered A-S items: **310/335 complete (92.5%)**.
- Numbered A-S items still open: **5**.
- Total unchecked Markdown boxes: **25**. The extra 20 are M1-M4 milestone
  release gates, all intentionally still open.
- Notion UX gap implementation checklist: **37/43 complete**. NUI-016,
  NUI-201,
  NUI-202, NUI-203, NUI-204, NUI-302, NUI-304, and NUI-401 are closed with
  focused implementation evidence; NUI-301, NUI-303, and NUI-403 are now
  closed for implementation evidence; NUI-501 is now closed for the complete
  stable-ID property affordance and dependency/recovery evidence; NUI-502 is
  now closed for stable-ID view reorder and active-view settings/menu evidence;
  NUI-402 is now closed for the inline title/tab/shared-record/cache/state
  contract; NUI-503, NUI-602, and NUI-603 are now closed for focused
  implementation evidence; NUI-105 and the P1/P2 agent, linked-view,
  responsive, and browser-journey gates remain open.
- Notion parity matrix agent-native foundation rows: **8 moved from
  Foundation to Done (2026-07-23)** after focused server/HTTP/MCP evidence for
  catalog/schema, typed queries, evidence traces, Context Packs, exact plans,
  approval-bound commits, undo, and restart/backup idempotency. Agent View
  policy/privacy/sandbox review remains Partial by design.
- Notion UX alignment checklist: **115/129 complete**. The page-first and normal
  New-page creation slices, the inline/linked insertion contract, and the
  table-first direct-manipulation, named canonical workspace canvas-route,
  shared navigation without a duplicate canvas rail, sidebar/recent/search/
  backlink/relation navigation, normal database page chrome, responsive canvas
  guardrails, inline/full-page state parity, property-add/header affordances,
  stable conversion, durable History/receipt recovery, property-header
  Sort/Filter/Duplicate, friendly property-copy, Title-safety,
  type-specific-editor, schema-vs-data mutation-scope, and destructive
  property-deletion preview, adjacent Formula/Rollup error-indicator, and
  view-scoped property-layout, converged header/settings-action, and visible
  reorderable view-tab, layout-independent new-view affordance, and
  layout-specific starter-suggestion, coherent view-settings, and active
  filter/sort explainer, saved-view tab lifecycle menu, last-view safety,
  saved-view switch memory, and independent linked-view settings without copied
  rows, cross-layout title/tab/control/state/record-opening alignment,
  canonical record-title entrypoints across every supported renderer, and the
  shared side/center/full-page record surface, record breadcrumbs with
  return-to-view continuity, table/page synchronization, and record body
  placement below properties, and record-page comments/history/permissions/
  appearance/layout affordances, previous/next active-view navigation, and
  row/page mutation menu parity for duplicate/archive/restore/move/delete, and
  direct Relation property links to canonical record pages, safe record
  deep-link/reload/missing/archived/permission states, and the unified
  Blank/template/import/folder/Assistant creation start surface and realistic
  template view/property/sample-page previews, Blank-first/reset behavior, and
  bounded CSV/TSV import previews, and the dedicated existing-folder
  source-identity migration review, and the natural-language agent plan
  preview, editable proposal overrides, resulting-page landing without
  implicit advanced choices, scoped database agent invocation from
  database/view/selection/row/property/record-page surfaces, and agent proposal
  provenance/atomic review grouping, human-language plan summaries with
  technical detail disclosure, server-enforced atomic approval copy,
  sensitive-operation review with permission-change confirmation, and
  current-view-preserving Agent Run recovery, retrieval query/filter/ranking/
  projection/permission/token explainability, stable agent API/MCP contracts
  across the UI route redesign, keyboard order across the database page, and
  visible focus/roving-grid selection and edit announcements, semantically
  labelled controls and transient states, screen-reader landmarks across
  table/board/calendar/record-peek/property-editor/agent-review surfaces,
  shared focus return after dialog/menu closure, and theme-safe conditional
  theme-safe conditional colors, and 768px compact primary-path guardrails are
  now
  evidenced. A
  2026-07-23 in-app browser capture reached the IPv4 renderer at
  `http://127.0.0.1:5173/`, created a full-page database, created two canonical
  rows, created an inline database from the slash menu, saved an inline row,
  opened the shared full-page route, and removed the linked block without
  deleting the canonical record. The follow-up slash-menu capture now proves
  `/database` and `/table` lead with `New database` and `Linked view of
  database`. A direct Electron dev fallback has reached the canonical table
  once, but the complete post-fix Electron journey is not captured. A bounded
  system-Chrome Playwright run on 2026-07-23 also exercised the sidebar
  page-first, slash inline, and linked-view/record-continuity cases; each case
  passed across focused runs. The journey file now additionally covers the
  `New file → Database` entry point; it is included in the next bounded run
  but has not been counted as passed yet. Complete linked state-matrix, accessibility,
  responsive, usability, performance, and packaged-release evidence remain
  open.
- A-K, M-P are complete. L is complete except L-017. Q is complete except
  Q-012. R-005, R-017, and R-019 remain; R-018 is closed. S-010 and S-011
  are closed.
- UX-010, UX-011, and UX-1109 are now closed with focused compatibility and
  terminology evidence:
  v1 manifest/migration corpus, saved-view and typed Markdown/MDX record
  fixtures, a real MDX `DatabaseView` stable-reference block, descriptor dirty
  serialization, live block projection/reference writes, and database
  last-opened route persistence. The structural UX count is **115/129**;
  UX-009 and UX-1101–UX-1114 visual/manual/release gates remain open.
- The Context Inspector description was corrected to a block-level semantic
  container so expanded machine-ID details do not create invalid nested
  `<p>/<details>/<dl>` markup. Its focused DOM suite passes; manual keyboard and
  screen-reader review remains part of UX-1110.
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

### 2026-07-23 duplicate-view replay guard

- The live inline action capture exposed a real safety bug: opening the saved
  view manager from `Duplicate view configuration` could remount the manager
  during a draft and replay the same initial action, producing many copies.
  `DatabaseTableDialog` now keeps the manager mounted across schema refreshes;
  `DatabaseViewManagerDialog` reconciles names from new view props without
  resetting its action guard. This preserves one-shot semantics while keeping
  the canonical reviewed mutation path for the duplicate itself.
- Regression evidence: the focused manager/view DOM suite passes **30 tests / 227
  expectations**; the live browser check shows exactly one `Table copy` after
  one duplicate action. Test-only database files and temporary documents were
  removed from the worktree and were not staged.

### 2026-07-23 normal New-page database journey

- The running IPv4 app now has browser evidence for the normal `New file`
  surface: its `New page type` chooser exposes `Page` and `Database`, and the
  Database choice routes to `#database/new` without requiring the command
  palette or raw IDs. Blank creation accepts an optional title, keeps storage
  identity details under `Advanced storage details`, and lands on the stable
  canonical database/source/view route with Title, Table, and first-row
  affordances visible.
- A follow-up cancel check returned from `#database/new` to the empty hash with
  no second database. This closes the evidence-backed UX-101, UX-103, and
  UX-105–UX-112 items (the snapshot then was 22/128 UX gates complete). UX-104,
  full-page/sidebar
  integration, Electron, accessibility, responsive, usability, performance,
  and release gates remain open.

### 2026-07-23 slash database command alignment

- The slash menu now labels the first database choices `New database` and
  `Linked view of database`, with `Inline database` following them. The
  `/database` and `/table` queries share those aliases and preserve the same
  order, matching the Notion-style first-use grammar.
- Running-app evidence shows the grouped `Data` menu and its previews. The
  temporary query was undone after capture; no document mutation remains.
- Focused `component-items.test.ts` coverage now passes 23 tests / 198
  expectations. UX-102 is closed; full-page/sidebar, state-matrix, Electron,
  accessibility, responsive, usability, performance, and release gates remain
  open.

### 2026-07-23 database discovery page jump

- `Open databases` from the command palette now selects the full-height
  no-overlay page presentation. The page keeps the source rail, breadcrumbs,
  view tabs, table controls, and first-row affordance visible while avoiding a
  global management modal over the document.
- `App.dom.test.tsx` verifies the callback selects `presentation="page"`, and
  the running-app capture shows the overlay-free workspace. UX-104 is closed;
  ordinary sidebar/recent URL integration remains in UX-201–UX-208.

### 2026-07-23 table-first direct manipulation slice

- The `DatabaseTable` surface now restores focus to the new-row title input
  after a direct row creation commits. It uses a monotonic request token, so
  the mutation lock cannot consume the focus request while the table is
  refreshing; the existing inline handoff remains compatible.
- The focused `DatabaseTableDialog.dom.test.tsx` suite passes **65 tests / 393
  expectations**. It covers sticky header/title/new-row affordances,
  type-specific editors, optimistic direct-safe edits, save/offline/conflict/
  failure states, row selection and bulk review thresholds, archive/delete
  recovery, keyboard navigation and TSV/multi-cell paste, persisted layout and
  density, and secondary action menus.
- `DatabaseView.dom.test.tsx` covers the linked inline selection, review,
  undo/redo shortcut, and full-page handoff paths. UX-401–UX-412 are checked in
  the alignment checklist; UX-407 is now closed by the History entry and the
  durable Agent Run receipt surface. The broader visual, accessibility,
  responsive, Electron, and release gates remain open.

### 2026-07-23 canonical database canvas route

- Canonical `#database/<database>/<source>/<view?>` targets now replace the
  document editor inside `SidebarInset`. The route owns an explicit
  `DatabaseWorkspacePage` surface; its shared body is named
  `DatabaseTableSurface`, while `DatabaseTableDialog` remains the compatibility
  wrapper for management/reviewed modal callers. The route is non-portal,
  omits the duplicate internal `Databases` rail, and does not refetch the
  catalog just for that hidden rail; source navigation comes from the ordinary
  sidebar and cross-database lookup from the inline picker. The ephemeral
  `#database/new` creation flow continues to use its reviewed page/dialog
  presentations.
- `App.dom.test.tsx` passes **14 tests / 50 expectations**, including the
  canvas's `SidebarInset` placement and hash back/forward restoration. The
  focused database test renders `DatabaseWorkspacePage` and covers the real
  no-portal/no-overlay workspace, selected-view hash, missing-source back
  action, and permission-denied state.
- UX-201, UX-202, UX-204, UX-205, UX-206, UX-207, UX-208, UX-209, UX-501,
  UX-502, UX-503, UX-504, UX-505, UX-506, UX-507, and UX-508 are checked.
  UX-210 remains open
  for conversion proof; visual parity, responsive visual proof, and the broader
  property-family gates remain open.

### 2026-07-23 normal database page chrome

- The canonical `DatabaseWorkspacePage` now uses a Notion-style page header:
  contextual breadcrumbs, inline title editing, favorite state, and a stable
  page action area are kept above the shared table surface. The database icon
  resolves as emoji, safe image URL/path, or the default database glyph.
- `Customize page` opens a focused editor for an optional icon and cover. The
  editor validates through the shared page-header resolver, closes before the
  schema mutation enters review, and leaves the parent ghost proposal's
  `Commit change` control visible. Clearing either field removes the optional
  manifest key.
- Icon/cover are bounded optional fields in the core manifest schema. App and
  server desired-state bases preserve them through title, deletion, button, and
  data-plane paths, so appearance changes do not alter stable database/source/
  view/record identities.
- Focused evidence: page/canvas `DatabaseTableDialog.dom.test.tsx` (2 tests /
  26 expectations), core `schema.test.ts` (1 / 2), app mutation compiler test
  (1 / 4), app typecheck, server typecheck, targeted Biome, and diff check. The
  full server suite and broad E2E were intentionally not run.
- UX-204 is checked at the implementation/evidence layer. Visual pixel parity,
  responsive/Electron, accessibility, performance, and release gates remain
  open.

### 2026-07-23 database search/backlink/relation entry points

- Catalog-backed command results search database/source names and human keys,
  while recent entries reopen the same stable database hash. Record backlinks
  preserve ordinary document anchors, and relation records link to the same
  canonical record-document route; no path reopens the global database manager
  or duplicates record payloads.
- Focused evidence: `CommandPalette.dom.test.tsx` (3 tests / 15
  expectations), `DatabaseRecordPeek.dom.test.tsx` (1 / 7),
  `DatabaseRelationsDialog.dom.test.tsx` (1 / 2), and
  `database-navigation.test.ts` (9 / 23).
- UX-206 is checked at the implementation/evidence layer. Responsive,
  accessibility, visual, Electron, performance, and packaged-release evidence
  remain open.

### 2026-07-23 responsive database canvas guardrails

- The page body explicitly owns incidental horizontal overflow, while the
  table container owns both axes and the view-tab strip owns horizontal tab
  scrolling. The page title/action row and action group use `min-w-0` plus
  `flex-wrap`, keeping narrow widths from expanding the page canvas.
- The route-level page and non-portal canvas share these guardrails. Focused
  `DatabaseTableDialog.dom.test.tsx` page/canvas evidence asserts the classes
  (2 tests / 26 expectations); app typecheck, targeted Biome, and diff check
  pass.
- UX-209 is checked at the implementation/evidence layer. The 768px visual
  browser check remains UX-1007, alongside accessibility, Electron,
  performance, and packaged-release gates.

### 2026-07-23 inline/full-page state parity

- Inline loading, empty, permission, offline, and stale snapshot states use
  the same user-facing meanings and safe retry/replacement boundaries as the
  full-page workspace. Permission denial clears cached snapshots; a successful
  snapshot remains visible with an explicit stale status when refresh loses
  transport; empty sources retain the focused new-row affordance.
- Focused evidence: `DatabaseView.dom.test.tsx` (4 tests / 18 expectations)
  and `DatabaseTableDialog.dom.test.tsx` (7 / 33) cover inline/page loading,
  missing, permission, offline, stale, invalid-schema, stale-index, and
  recoverable-service states.
- UX-309 is checked at the functional implementation/evidence layer. The full
  visual state matrix and cross-host capture remain NUI-701/NUI-702 gates.

### 2026-07-23 in-context property affordances

- When schema management is available, the table edge exposes `Add property`
  and opens the canonical reviewed properties surface. Read-only hosts omit the
  action rather than presenting a dead control. Each property header exposes a
  stable-ID menu for visibility, move left/right, calculations, context
  inspection, rename/configure, type conversion, Sort, Filter, Duplicate, and
  dependency-aware delete; Title remains frozen from invalid
  move/delete/duplicate operations. Sort and Filter open the active view's
  existing settings with the selected property targeted. Duplicate preserves
  typed configuration and compiles a fresh stable key.
- The same surface uses friendly labels and examples instead of exposing
  schema enum names first: e.g. `Multi-select` / “Several choices from a list”
  in add and conversion controls, with stable enum names retained for agents
  and diagnostics.
- Focused evidence: `DatabaseTableDialog.dom.test.tsx` (2 tests / 18
  expectations), `DatabasePropertiesDialog.dom.test.tsx` (8 / 26),
  `DatabaseAdvancedFilterDialog.dom.test.tsx` (2 / 7),
  `DatabaseSavedViewSettingsDialog.dom.test.tsx` (13 / 16),
  `DatabasePropertyConversionDialog.dom.test.tsx` (3 / 11),
  `packages/core/src/database/schema.test.ts` (1 / 6), and
  `database-cell-mutation.test.ts` (1 / 3).
- The typed-editor slice in `DatabaseTableDialog.dom.test.tsx` adds 12 focused
  tests / 46 expectations across scalar, structured, derived, and action-only
  property families.
- Review summaries now prefix `Data:` versus `Schema:` scopes, and property
  schema callers pass the explicit schema policy while cell writes pass the
  direct-safe cell policy. Focused evidence: scope labels 2 tests / 23
  expectations and policy matrix 4 tests / 68 expectations.
- Deleting a non-Title property first fetches a complete source snapshot and
  opens `Review property deletion` with values-to-clear, records-checked, and
  formula/rollup/relation/saved-view dependencies. Confirmation commits value
  cleanup while the property still exists, then reopens Properties for an
  explicit schema-removal review; the phases are separate because racing two
  commits can wedge the server, and both expose History undo. Focused evidence:
  `database-property-deletion.test.ts` (2 tests / 5 expectations) and
  `DatabasePropertyDeletionPreviewDialog.dom.test.tsx` (1 / 11).
- Formula and Rollup columns now show a warning count and error codes beside
  the property header for the loaded records; each affected cell keeps the
  visible code, full accessible message, and machine-readable error code/
  message attributes. `DatabaseTableDialog.dom.test.tsx` covers both families
  (2 tests / 7 expectations).
- In a saved view, header and layout controls now route visibility/order changes
  through the active view projection and reviewed view mutation policy. They no
  longer persist into the source schema or the personal per-source table
  layout; `DatabaseTableDialog.dom.test.tsx` covers the callback (1 / 2).
- Header projection actions and the full View settings surface now share the
  same `createDatabaseViewConfigurationChangeDesiredState` boundary. The table
  waits for canonical refresh after a saved-view mutation, so cancelled review
  cannot leave a false local projection. Focused evidence: the header callback
  (1 / 2) and saved-view projection/configuration test (1 / 2).
- Saved views are primary, visible, draggable tabs beside the database title;
  the legacy select is wrapped in `md:hidden` as a compact narrow-screen
  fallback. The canonical-default DOM journey verifies the tab strip, fallback
  boundary, drag affordance, active tab, active menu, and All-records navigation
  with a List-layout saved view (1 test / 19 expectations). The shared tab strip
  renders before the layout switch, so the `New database view` plus action is
  available for every supported renderer.
- Saved-view creation now shows a layout-specific starter suggestion below the
  name/layout controls (group, date, files preview, chart dimension, map place,
  feed chronology, dashboard candidates, form title, or table/list projection).
  The hint is derived from the same default constructors as the emitted view;
  Board suggestion/default-group evidence is 1 test / 3 expectations, while
  the existing manager matrix covers the other layouts.
- `Saved view settings` now includes a scope summary covering opening behavior,
  projection/order, sort, group, conditional colors, and layout display; it
  points Filters to the same active-view boundary. Focused evidence verifies
  the six settings regions and scope copy (1 / 7), alongside the typed view
  revision and advanced-filter tests.
- Canonical and inline/linked database headers now show active saved-view
  filters and sort directions as bounded, clickable explainers. Nested AND/
  OR/NOT filters are summarized with property names and a rule count; filter
  chips reopen Filters and sort chips reopen View settings. Focused evidence:
  `DatabaseViewQuerySummary.dom.test.tsx` 2 tests / 9 expectations.
- The active saved-view tab menu now exposes Filters, View settings, Rename,
  Duplicate, Favorite, move-left/right, Make/Clear default, Delete, and Manage
  views. Canonical actions use reviewed lifecycle/default mutations; default
  deletion is disabled and rename uses a stable-ID-preserving reviewed dialog.
  Inline/linked tabs share the vocabulary and delegate mutations to the
  canonical manager. Focused evidence: menu 2 tests / 17 expectations, rename
  dialog 1 / 2, and canonical tab journey 1 / 25.
- Last-view deletion is protected at the lifecycle compiler, tab menu, and
  manager layers. A source must retain one usable saved view; default deletion
  remains separately guarded. Focused evidence: compiler 1 test / 10
  expectations, tab-menu 2 / 20, manager 1 / 1.
- Previously loaded views reuse a verified result snapshot during refresh and
  restore table scrollTop plus the last focused record/property cell per
  source/view. Inline tables use the same view-state contract. Focused evidence:
  2 DOM journeys / 30 expectations.
- Linked blocks persist stable canonical references plus optional local
  `viewOverrides` for layout, filters, sorts, groups, projection, conditional
  colors, and open behavior. The server applies the overlay for the query only;
  the canonical manifest and record rows are unchanged. Inline Filters and View
  settings edit this block-local payload. Focused evidence: core schema 1 / 5,
  server query boundary 1 / 4, and independent linked-block DOM journey 1 / 10.
- Inline and canonical surfaces now expose visible Filters and View settings
  controls on the same active-view boundary; all non-form renderers receive the
  same record-opening callback and expose a layout marker for the state matrix.
  Focused non-table Feed evidence is 1 DOM journey / 6 expectations; the
  canonical table journey remains the shared tab/control baseline.
- Every supported record-oriented renderer now exposes its visible record title
  through that same canonical opening callback. Table title editing remains an
  explicit pencil action, while List/Feed/Timeline title spans now become
  direct title links; Board, Calendar, Gallery, Chart, Map, and Dashboard
  title affordances expose the same stable `data-record-title-link` contract.
  Focused title journeys cover Table, List, Board, Feed, Calendar, and
  Timeline; existing Gallery/Chart/Map/Dashboard/workspace journeys cover the
  remaining entry points.
- Alternate-view action labels now use those same visible titles: Calendar and
  Timeline open/inspect/move/resize, List expand/collapse/inspect, and
  Gallery/Feed/Chart/Map open/inspect controls are all title-first. Stable IDs
  remain the underlying identity and mutation scope.
- Commit `8259f7e7 fix: name inline cell actions by record title` extends the
  contract to inline Table property links, copy controls, buttons, and edit
  affordances. Full-page management keeps stable-ID labels; the inline
  DatabaseView journey passes after its title-based edit/selection selectors
  were updated. `DatabaseTableDialog.dom.test.tsx` directly covers the inline
  URL link/copy/edit labels (1 test / 3 expectations). Changeset:
  `.changeset/inline-cell-action-labels.md`.
- Commit `b51ec7bc fix: contextualize inline cell menu actions` names the
  inline cell context menu with record title and property, and contextualizes
  its open/edit/inspect/agent actions. Focused menu regression: 2 tests / 13
  expectations. Changeset: `.changeset/inline-cell-menu-context.md`.
- `DatabaseRecordPageSurface` is now the shared structural component used by
  side peek, center peek, and the ordinary full-page editor. Sheet/Dialog and
  live Y.Doc bindings remain host adapters, while the record-page identity and
  sizing contract no longer fork. Focused peek/chrome evidence passes 3 tests /
  41 expectations; app typecheck passes.
- Full-page and side/center peek headers now expose a `Database breadcrumbs`
  landmark. When session navigation identifies the originating saved view, the
  peek's `Back to database view` action restores its exact stable hash before
  closing; otherwise the database/source breadcrumb falls back to the source
  route. Focused peek/chrome evidence passes 4 tests / 47 expectations.
- `DatabaseRecordPageChrome` now listens to validated `database-changed` events
  and asks a clean, already-synced record provider for the canonical Y.Doc
  delta. Dirty local pages are skipped to prevent remote table edits from
  overwriting in-progress work. Focused evidence emits a matching record event
  and verifies `forceSync`; the title/property journey plus peek/chrome run
  passes 4 tests / 48 expectations.
- The ordinary record editor body is now a first-class page-chrome slot below
  the title/properties. `EditorActivityPool` passes the existing SourceEditor /
  Tiptap stack into that slot for regular pages while preserving source-mode
  and managed-artifact branches. Focused chrome DOM evidence asserts the body
  marker and document order; the file passes 2 tests / 38 expectations, the
  editor-pool unit contract passes 42 / 84, and app typecheck passes.
- The full-page record action row now exposes Comments, Record history,
  Permissions, Customize appearance, Customize this record, and Customize
  layout. Appearance reuses the validated icon/cover dialog in record mode and
  patches only canonical record frontmatter; Permissions passes the current
  database and record scope into the existing share dialog. Focused chrome DOM
  evidence passes 2 tests / 48 expectations, permissions passes 1 / 10, and
  PageHeader icon/cover coverage passes 9 / 26.
- The bounded session navigation state now drives Previous record and Next
  record in both full pages and side/center peeks. Loaded rows swap in place;
  unloaded paths hand off to the canonical route while retaining the origin
  view index. Focused peek/page evidence passes 5 tests / 65 expectations and
  the navigation helper passes 3 / 6.
- The full-page record action menu now mirrors row-level Duplicate, Archive/
  Restore, Move, and Delete actions. It loads the canonical projected record,
  reuses the existing desired-state compilers and reviewed mutation boundary,
  and only enables Move for explicitly mapped compatible sources. Focused
  chrome evidence passes 3 tests / 64 expectations; matching row journeys pass
  4 tests / 35 expectations. App typecheck and targeted Biome checks pass.
- Relation properties on record pages now resolve permission-visible target
  titles through the bounded exact-record reader and render direct canonical
  document links without opening the global database manager. Missing/denied
  targets remain non-disclosing unavailable chips, and the pencil affordance
  returns to the existing Relation editor. Focused chrome evidence passes 4
  tests / 68 expectations; the relation dialog passes 1 / 2. App typecheck and
  targeted Biome checks pass.
- Canonical record pages now preload the permission-filtered record projection
  so archived state and access failures are known before actions render. A 404
  shows an explicit missing state with a safe Back to database view action; a
  403 shows a non-retryable permission state and both states hide the editable
  body/property/action surface. Archived pages retain identity and expose
  Restore. Focused chrome evidence passes 7 tests / 77 expectations; matching
  table missing/permission/archive journeys pass 3 / 16, and the canonical
  database reload/back-forward journey passes 1 / 10. App typecheck and
  targeted Biome checks pass.
- UX-501 through UX-510, UX-601, UX-602, UX-603, UX-604, UX-605, UX-606,
  UX-607, UX-608, UX-609, UX-610, UX-701, UX-702, UX-703, UX-704, UX-705,
  UX-706, UX-707, UX-708, UX-709, UX-710, UX-801, UX-802, UX-803, UX-804, and
  UX-805, UX-806, UX-807, and UX-808
  are checked at the functional
  implementation/evidence layer. Visual and broader property-family gates
  remain open.

### 2026-07-23 unified database creation start surface

- `DatabaseCreationDialog` now puts Blank, Template, Existing folder, CSV/TSV,
  and Assistant in one creation-method chooser. Blank keeps its direct-safe
  fast path; the other methods retain exact-plan review and the folder path
  still opens the blocker-free onboarding preview after the manifest commits.
- The Assistant method injects the existing installed-agent
  `CreatePromptComposer` from the production database surface. It does not add a
  second database writer: agents continue through the canonical MCP/HTTP
  desired-state plan and commit boundary. The dialog accepts the composer as a
  host slot so focused component tests stay provider-free.
- Focused evidence: `DatabaseCreationDialog.dom.test.tsx` passes 9 tests / 38
  expectations (including the Assistant chooser and no-direct-commit guard),
  the existing resulting-page preview test passes 1 / 4, and the folder
  onboarding test passes 1 / 7. App typecheck and targeted Biome checks pass.
- UX-801 through UX-808, UX-901, and UX-902 are now checked at the functional creation/agent
  proposal and resulting-page handoff layer. Cross-host, visual, responsive,
  and packaged-release evidence remains open.

### 2026-07-23 Blank-first creation reset

- Blank remains the initial creation method. Cancelling Template, import,
  folder, or Assistant resets the method-specific choice to Blank while keeping
  the typed title available; a successful commit remounts the creator so the
  next New database action cannot inherit an advanced method. Failed plans keep
  their draft for retry.
- Focused evidence: the creation dialog suite passes 11 tests / 49
  expectations, including the advanced-cancel reset; the focused
  `DatabaseTableDialog.dom.test.tsx` failure/cancel/folder journeys pass 3 / 13,
  with app typecheck and targeted Biome checks passing.
- UX-803 is now checked at the functional default/reset layer. Usability
  timing, visual first-use, and packaged-host evidence remain open.

### 2026-07-23 CSV/TSV import preview

- The import branch now shows the detected CSV/TSV format, headers, inferred
  property types, target `Table` view, and up to three sample rows before the
  exact-plan review. Invalid rows include their source row number and reason;
  parse failures stay in the same preview instead of becoming a late commit
  error.
- Focused evidence: `DatabaseCreationDialog.dom.test.tsx` passes 12 tests / 59
  expectations, including valid header/type/target-view preview and an
  invalid-row pre-commit warning. App typecheck and targeted Biome checks pass.
- UX-804 is now checked at the functional import-preview layer. Richer
  per-cell coercion explanations, visual first-use parity, and packaged-host
  evidence remain open under UX-11.

### 2026-07-23 existing-folder source-identity migration

- Existing-folder creation commits only the canonical manifest, then hands off
  to a dedicated `Advanced migration: assign record identities` surface. The
  surface previews the exact source-bound file set, blocks incomplete or
  non-identity changes, states that schema/manifest-version migration is out of
  scope, and queues the existing reviewed `import` task only after approval.
- Focused evidence: `DatabaseOnboardingDialog.dom.test.tsx` passes 2 tests / 11
  expectations; the focused `DatabaseTableDialog.dom.test.tsx` folder journey
  passes 1 test / 10 expectations and proves the handoff occurs after manifest
  commit. App typecheck and targeted Biome checks pass.
- UX-805 is now checked at the functional advanced-migration boundary. Broader
  multi-source migration, accessibility, visual first-use, and packaged-host
  evidence remain open under UX-10/UX-11.

### 2026-07-23 agent-assisted database plan preview

- The Assistant composer now exposes a preview-only intent channel for the
  database creation surface. A conservative local compiler maps a natural-
  language goal to a starter template and renders the suggested name, typed
  properties, Table/Board views, and optional sample pages. The proposal is
  visibly unsaved; it never writes a manifest or records and does not replace
  the installed-agent exact-plan handoff.
- Focused evidence: `database-creation.test.ts` passes 9 tests / 63
  expectations; `DatabaseAgentCreationPlanPreview.dom.test.tsx` passes 3 / 12;
  `CreatePromptComposer.dom.test.tsx` passes 14 / 62; and
  `ComposerMentionInput.dom.test.tsx` passes 16 / 46 for the serialized prompt
  callback. The creation dialog remains green at 12 / 59. App typecheck and
  targeted Biome checks pass.
- UX-806 is now checked at the functional proposal-preview layer. Model-backed
  schema generation, richer goal clarification, visual first-use, and
  packaged-host evidence remain open under UX-808 and UX-11; editable proposal
  fields are recorded in the UX-807 section below.

### 2026-07-23 agent proposal editing

- The unsaved Assistant proposal now exposes property name/type and view
  name/layout controls. Title remains locked to `title`; other property types
  and layouts are bounded to the supported preview set. Sample-page inclusion
  remains an explicit toggle.
- Edited values are serialized into the agent handoff as a clear requested
  override block, preserving one writer and the same exact-plan approval
  boundary. Focused evidence: the preview suite passes 3 / 12 and the full
  composer suite passes 14 / 62, including edited-field handoff propagation.
- UX-807 is now checked at the functional proposal-editing layer. Richer
  model-backed clarification, broader property/layout families, visual
  first-use, and packaged-host evidence remain open under UX-11.

### 2026-07-23 resulting-page landing

- Every successful desired-state creation now resolves the first source/view,
  replaces the hash with the canonical database page route, and closes the
  legacy management shell when creation began there. Existing-folder creation
  keeps the shell only while the separate source-identity migration review is
  active.
- Focused evidence: the template/agent-shaped review journey commits and
  asserts the canonical route plus shell-close callback (1 test / 7
  expectations); the folder journey retains its post-manifest migration handoff
  proof (1 / 10). App typecheck and targeted Biome checks pass.
- UX-808 is now checked at the functional resulting-page handoff layer.
  Cross-host agent commit callbacks, visual first-use, responsive, and
  packaged-release evidence remain open under UX-11.

### 2026-07-23 stable machine-ID disclosure

- Canonical table workspaces and record page/peek surfaces now expose stable
  database/source/view/record identity through machine-readable `data-*`
  attributes. Table rows, property headers, view tabs, and Context Pack fields
  are marked with their object kind so agents and automation can target objects
  without parsing human labels.
- The shared `DatabaseMachineIdsDetails` component keeps those identifiers
  collapsed by default and reveals them only on explicit expansion. Context
  Inspector scope, pack IDs, omitted property IDs, and the exact pack are now
  progressive-disclosure details rather than primary copy; visible lists lead
  with goals, names, timestamps, and counts.
- Focused evidence: `DatabaseMachineIdsDetails.dom.test.tsx` passes 2 tests /
  15 expectations; Context Inspector DOM/static tests pass; the focused
  record-page test asserts surface identity and disclosure; and the focused
  table-dialog test asserts workspace identity and machine-object markers. App
  typecheck and targeted Biome checks pass. No full server suite or E2E rerun
  was needed.
- UX-901 is now checked at the functional stable-identity/progressive-
  disclosure layer. UX-904 through UX-1105 remain open.

### 2026-07-23 Context Inspector compact summary

- The Context Inspector now leads with one compact retrieval summary for schema
  field names, Agent View versus database default, requested/returned selection
  counts, estimated/available/max/reserve token budget, truncation cause and
  continuation, and citation count/disclosure level.
- The selected-field preview and exact Context Pack remain collapsed by default;
  expanding them still exposes the complete JSON evidence. No second retrieval
  path or payload copy was introduced.
- Focused evidence: `DatabaseContextInspectorDialog.dom.test.tsx` passes 2
  focused tests / 19 expectations, and
  `DatabaseContextInspectorDialog.test.tsx` passes 6 tests / 25 expectations.
  App typecheck and targeted Biome checks pass. No full server suite or E2E
  rerun was needed.
- UX-902 is now checked at the functional compact-inspection layer. UX-903
  through UX-1105 remain open.

### 2026-07-23 scoped database agent invocation

- Canonical table and inline-view headers now expose one shared `Ask agent`
  menu. The default scope is database/source/view; selected rows narrow it to
  stable record IDs. Table row actions and property menus open the same menu
  with record- or property-only scope, while record pages and peeks use the
  same record boundary.
- The composer displays a compact human scope summary and says that changes
  stay inside the scope unless the user asks to widen it. The dispatch prompt
  carries a deduplicated stable-ID block for SynapseNote MCP, including the
  database, source, view, record, and property IDs.
- Web workspace lookup is lazy until the scoped menu is opened, avoiding an
  unrelated `/api/workspace` request when an inline view mounts; Electron
  resolves its project path synchronously.
- Focused evidence: `database-agent-scope.test.ts` 2 tests, the scoped
  `OpenInAgentMenu.dom.test.tsx` case within 13 passing tests, and
  `DatabaseTableDialog.dom.test.tsx` row/property callback coverage. The
  record page/peek suite passes 10 tests / 100 expectations. App typecheck and
  targeted Biome checks pass; no full server suite or broad E2E rerun was
  needed.
- UX-903 is now checked at the functional scoped-invocation layer. UX-904
  through UX-1105 remain open.

### 2026-07-23 agent proposal provenance and review grouping

- Agent Run detail now leads with a `Proposal source` card. Agent suggestions
  are explicitly separated from human changes; principal and session IDs stay
  under `Show source details` so the primary review copy remains human-facing.
- The same surface labels the immutable plan as one `Review group`, explains
  that its changes commit together, and lists every required/optional approval
  scope. Existing ghost and creation reviews keep the `Proposed · not saved`
  label, human plan summary, and atomic approval group for in-progress UI
  mutations.
- Focused evidence: `DatabaseAgentRunsDialog.dom.test.tsx` passes 4 tests / 27
  expectations, including agent provenance and grouped approval scope. App
  typecheck and targeted Biome checks pass; no full server suite or broad E2E
  rerun was needed.
- UX-904 is now checked at the functional provenance/grouping layer. UX-905
  through UX-1105 remain open.

### 2026-07-23 human-language agent plan summaries

- Agent Run detail now leads with a `Plan summary`: plain-language risk,
  approval-scope count, and the one-exact-plan boundary. A short explanation
  states that the reviewed scope is checked before commit.
- Plan ID/hash, snapshot, expiry, and risk reasons are grouped under `Show plan
  details`; proposed diff JSON and recovery receipts remain independently
  disclosed. The primary decision surface therefore stays readable without
  removing exact audit evidence.
- Focused evidence: `DatabaseAgentRunsDialog.dom.test.tsx` passes 4 tests / 30
  expectations, including summary-first rendering and collapsed plan details.
  App typecheck and targeted Biome checks pass.
- UX-905 is now checked at the functional plan-explanation layer. UX-906
  through UX-1105 remain open.

### 2026-07-23 atomic approval safety

- Atomic proposal reviews now state in the decision surface that selective
  approval is unavailable for the group and that every required scope must be
  approved together. The copy names referential and rollback safety, while the
  exact plan remains one verified transaction.
- The server independently rejects a partial approval-code selection before
  mutation with `approval_required`, `atomicGroup`, and the required approval
  codes. This keeps the UI explanation backed by a transport-level invariant.
- Focused evidence: the resulting-page creation journey in
  `DatabaseTableDialog.dom.test.tsx` passes 2 tests / 9 expectations for the
  atomic review and failed-reopen paths; the focused
  `packages/server/src/database-commit.test.ts` mismatch test passes 1 test / 7
  expectations. App typecheck and targeted Biome checks pass; no full server
  suite or broad E2E rerun was needed.
- UX-906 is now checked at the functional atomic-approval layer. UX-907
  through UX-1105 remain open.

### 2026-07-23 sensitive-operation review

- The browser mutation policy keeps permission changes, destructive/permanent
  deletion, external actions, migrations, and bulk edits in the required-review
  column for both human and agent actors. Only routine cell/title/record-create/
  view work may use the direct-safe shortcut; the policy test covers all 13
  operation rows and blocks agent/non-user principals from inheriting it.
- The permissions dialog now stages share, edit, and revoke actions in an
  explicit review card. It shows the principal, workspace/database scope,
  role/actions, immediate-effect warning, and an approval button before the
  permission API is called. The review copy links the same boundary to
  permanent deletion, external actions, broad schema migration, and
  threshold-crossing bulk edits.
- Focused evidence: `database-mutation-policy.test.ts` passes 4 tests / 68
  expectations; `DatabasePermissionsDialog.dom.test.tsx` passes 1 test / 14
  expectations; the atomic creation review asserts the sensitive-operation
  policy copy. App typecheck and targeted Biome checks pass; no full server
  suite or broad E2E rerun was needed.
- UX-907 is now checked at the functional sensitive-operation review layer.
  UX-908 and UX-909 are now checked at their functional current-view recovery
  and retrieval-explainability layers; UX-910 is also checked for stable
  contracts, and UX-1001 through UX-1105 remain open.

### 2026-07-23 retrieval explainability

- Context Pack responses now include an exact retrieval explanation: structured
  query/archive scope, filter property IDs, typed-sort ranking with a stable
  record-ID tie-breaker, requested/returned/omitted property projection,
  matched/returned/omitted record counts, permission exclusions, disclosure
  search mode, continuation state, and token-budget outcome.
- `DatabaseContextInspector` carries the same bounded metadata in list/detail
  summaries. Its new `Retrieval explainability` card gives a compact human
  summary of query, filters, ranking, results, fields, permissions, and tokens;
  the full filter expression, IDs, policy revision, and machine object remain
  under `Show retrieval details`.
- Focused evidence: server context-pack tests pass the schema/budget and
  disclosure cases with retrieval assertions; server and app typechecks pass;
  `DatabaseContextInspectorDialog.dom.test.tsx` passes the compact/retrieval
  assertions; targeted Biome checks pass. No full server suite or broad E2E
  rerun was needed.
- UX-909 is now checked at the functional retrieval-explainability layer.
  UX-910 is now checked at the functional stable-contract layer; UX-1001
  through UX-1105 remain open.

### 2026-07-23 stable agent API/MCP contract

- The canonical `#database/<database>/<source>/<view?>` route remains a
  stable-ID address only. A focused route round-trip test passes the decoded
  target directly into the shared database-agent scope instruction and proves
  the exact database/source/view IDs reach the MCP boundary without embedding
  route strings or introducing a second identity.
- The existing server transport conformance and `data`/`data_plan`/commit
  boundaries remain unchanged; the UI route redesign continues to call the
  same versioned contracts.
- Focused evidence: `database-navigation.test.ts` passes 10 tests / 27
  expectations, including the route-to-MCP scope contract; app typecheck and
  targeted Biome checks pass. No full server suite or broad E2E rerun was
  needed.
- UX-910 is now checked. Visual, responsive, accessibility, cross-host, and
  packaged-release gates remain open.

### 2026-07-23 keyboard order

- The canonical database page keeps the keyboard/DOM progression from its
  breadcrumb and title through saved-view tabs, database controls, table
  headers, grid cells, the new-record affordance, and load-more pagination.
  The existing table grid retains arrow-key movement and edit-focus return.
- Focused evidence: the route-level `DatabaseTableDialog.dom.test.tsx`
  journey asserts the ordered landmarks (26 expectations in the focused run),
  alongside the existing cell-navigation/edit-focus tests. App typecheck and
  targeted Biome checks pass; no full server suite or broad E2E rerun was
  needed.
- UX-1001 is now checked at the functional keyboard-order layer. Contrast,
  responsive, and performance gates remain open; UX-1002 covers the focused
  grid/announcement layer.

### 2026-07-23 focus and grid announcements

- Database cells now have an explicit focus-visible ring, the grid declares
  `aria-multiselectable`, and selected cells/rows retain `aria-selected` while
  the roving tab index moves with arrow keys. A polite live region announces
  the focused row/property, selection size, and edit start/cancel state; the
  existing Escape menu path and post-edit restoration keep focus in context.
- Focused evidence: the targeted `DatabaseTableDialog.dom.test.tsx` keyboard,
  edit-focus, and rectangular-selection cases pass 3 tests / 29 expectations.
  App typecheck and targeted Biome checks pass; no full server suite or broad
  E2E rerun was needed.
- UX-1002 is now checked at the functional grid-focus and announcement layer.
  Full screen-reader matrix, contrast, responsive, and performance gates
  remain open.

### 2026-07-23 control names and semantic states

- Canonical database surfaces keep icon-only controls discoverable with stable
  accessible names. Tabs expose `role="tab"` and `aria-selected`, the table
  exposes a named `role="grid"`, and transient saves/errors/recovery surfaces
  use status or alert semantics.
- Focused evidence: the route-level `DatabaseTableDialog.dom.test.tsx` journey
  asserts that every rendered icon-only button has an accessible name and that
  the canonical grid carries its selection semantics (28 expectations in the
  focused run). Existing table, saved-view, review, picker, and conflict DOM
  tests cover the corresponding menu/dialog state roles. App typecheck and
  targeted Biome checks pass; no full server suite or broad E2E rerun was
  needed.
- UX-1003 is now checked at the functional naming/semantics layer. Full
  screen-reader matrix, contrast, responsive, and performance gates remain
  open.

### 2026-07-23 screen-reader landmark coverage

- The primary database surfaces expose a stable semantic landmark contract:
  named table grid and controls; Board region, swimlanes, lists, and card
  actions; Calendar region, date groups, and navigation; record-peek dialog and
  breadcrumbs; property-editor dialog and property list; and Agent Runs review
  dialog with refresh, scope, diff, and recovery controls.
- Focused evidence: `DatabaseTableDialog.dom.test.tsx` (28 expectations),
  `DatabaseBoard.dom.test.tsx` (12), `DatabaseCalendar.dom.test.tsx` (9),
  `DatabaseRecordPeek.dom.test.tsx` (12), `DatabasePropertiesDialog.dom.test.tsx`
  (9), and `DatabaseAgentRunsDialog.dom.test.tsx` (17) all pass their focused
  semantic landmark cases. App typecheck and targeted Biome checks pass; no
  full server suite or broad E2E rerun was needed.
- UX-1004 is now checked at the automated screen-reader landmark/role contract
  layer. Manual assistive-technology sessions, contrast, responsive, and
  performance gates remain release follow-up work.

### 2026-07-23 focus return and modal-stack guard

- Shared `DialogContent` records the focused opener during Radix open autofocus
  and restores it during close autofocus unless a consumer intentionally
  overrides the event. Controlled database dialogs therefore return to their
  trigger even without an explicit `DialogTrigger`; the table cell menu keeps
  its explicit Escape-to-cell path, and side peeks retain the Sheet focus scope.
- Focused evidence: `DatabasePropertiesDialog.dom.test.tsx` opens a controlled
  property editor from a focused trigger, closes it, and observes focus on the
  opener. The existing `DatabaseTableDialog.dom.test.tsx` menu test observes
  Escape returning to the originating cell. App typecheck and targeted Biome
  checks pass; the behavior has a patch changeset, and no full server suite or
  broad E2E rerun was needed.
- UX-1005 is now checked at the shared focus-return/modal-stack guard layer.
  Manual assistive-technology sessions and full cross-surface focus journeys
  remain release follow-up work.

### 2026-07-23 theme contrast and conditional colors

- Conditional-color surfaces use low-alpha backgrounds with semantic
  `text-foreground` in Board, Calendar, List, and Gallery, plus explicit dark
  theme background variants; the table keeps its dark-aware tint map. Timeline
  bars use solid palette colors with white or black text selected per color, so
  labels remain readable in both themes and color is only a secondary cue.
- Focused evidence: `DatabaseColorContrast.test.ts` computes WCAG relative
  luminance ratios for every Timeline conditional color (all at least 4.5:1)
  and asserts semantic foreground/dark-theme classes across the tinted maps.
  Focused Board, Calendar, List, Gallery, and Timeline DOM tests still assert
  conditional-color application. App typecheck and targeted Biome checks pass;
  no full server suite or broad E2E rerun was needed.
- UX-1006 is now checked at the automated theme/contrast contract layer.
  Manual browser contrast sampling and full visual responsive coverage remain
  release follow-up work.

### 2026-07-23 768px primary-path guardrails

- The canonical page wraps its chrome/actions, exposes a `md:hidden` saved-view
  selector, clips horizontal overflow at the page body while retaining vertical
  scrolling, and scopes table overflow to the table container. Saved-view tabs
  keep their own horizontal scroller, so compact widths do not require
  page-level two-axis scrolling or clip filter/new-record actions.
- Focused evidence: the route-level `DatabaseTableDialog.dom.test.tsx` journey
  asserts page-body `overflow-x-hidden`/`overflow-y-auto`, table-local
  `overflow-auto`, tab `overflow-x-auto`, and the compact view switcher's
  `md:hidden`/accessible saved-view control (31 expectations in the focused
  run). App typecheck and targeted Biome checks pass; no full server suite or
  broad E2E rerun was needed.
- UX-1007 is now checked at the DOM/CSS guardrail layer. Manual 768px browser
  capture and the full visual responsive matrix remain release follow-up work.

### 2026-07-23 Agent Run current-view recovery

- Undo, retry, and resume emit a scoped Agent Run change event only after the
  recovery API succeeds. Canonical tables, linked inline views, and record
  pages subscribe and refresh in place; unrelated database surfaces ignore the
  event. The event carries database/source/record IDs for that boundary.
- The table refresh preserves the live selected row IDs instead of restoring
  only the route's initial selection. The Agent Runs dialog keeps its selected
  run open, refreshes the run receipt, and explains that the underlying route
  and selection remain stable during recovery.
- Focused evidence: `DatabaseAgentRunsDialog.dom.test.tsx` undo/retry tests
  pass with the scoped event assertion; the table snapshot test passes 1 test /
  23 expectations with retained selection; the event helper DOM test passes 1
  test. App typecheck and targeted Biome checks pass; no full server suite or
  broad E2E rerun was needed.
- UX-908 is now checked at the functional current-view recovery layer. UX-909
  is covered by the retrieval-explainability slice above, and UX-910 is covered
  by the stable-contract slice; UX-1001 through UX-1105 remain open for the
  remaining release gates.

### 2026-07-23 template preview parity

- All seven starter templates now compile a Table view plus a Board view
  grouped by the template's status/stage/confidence property. The creation
  chooser previews both layouts, every property type, and bounded sample pages
  before the exact-plan commit, so the committed result matches the preview.
- Focused evidence: `database-creation.test.ts` passes 8 tests / 56
  expectations (all seven templates), `DatabaseCreationDialog.dom.test.tsx`
  passes the template preview journey (1 / 6), and the focused server
  `database-plan.test.ts` view regressions pass 2 / 8. App typecheck and
  targeted Biome checks pass.
- UX-802 is now checked at the functional preview/desired-state layer.
  Calendar/timeline-specific template configurations, editable preview
  controls, visual first-use parity, and packaged-host proof remain open.

### 2026-07-23 sidebar and recent database navigation

- `DatabaseSidebarSection` is a peer `Databases` section in the ordinary file
  sidebar. It lazy-loads the catalog, navigates sources by the stable database
  hash, opens for an existing database target, and marks the active source.
- The command palette's existing omnibar recents now have UI evidence for a
  catalog-backed database under `Recently opened`, reopening the same stable
  route. Focused evidence: sidebar 3 tests / 7 expectations and recent UI 1 / 5.
- UX-203, UX-204, UX-206, UX-209, UX-309, UX-501, UX-502, UX-503, UX-504,
  UX-505, UX-506, UX-507, UX-508, UX-509, UX-510, UX-601, UX-602, UX-603, UX-604, UX-605, UX-606, UX-607, UX-608, UX-609, UX-610, UX-701, UX-702, UX-703, UX-704, UX-705, UX-706, UX-707, UX-708, UX-709, UX-710, UX-801, UX-802, UX-803, UX-804, UX-805, UX-806, UX-807, UX-808, UX-901, UX-902, UX-903, UX-904, UX-905, UX-906, UX-907, UX-908, UX-909, UX-910, UX-1001, UX-1002, UX-1003, UX-1004, UX-1005, UX-1006, and UX-1007 are checked. The 768px visual responsive check remains
  open.

### 2026-07-23 stable inline/full-page conversion

- Converting a linked `DatabaseView` now serializes the current
  `databaseId/sourceId/viewId` alongside the new `mode`, even when the host
  block's existing props are sparse. It never writes embedded records or
  clones a source.
- The focused `DatabaseView.dom.test.tsx` projection test exercises the menu
  action and asserts the stable references plus no record payload. UX-210 is
  checked; responsive and broader visual conversion proof remain open.

### 2026-07-23 database History entry

- `Database actions → History` is now present on the management and canonical
  canvas table surfaces. App wiring opens `DatabaseAgentRunsDialog`, which
  exposes compact history plus the selected exact scope, proposed/actual diff,
  mutation ID, verification status, undo token, and recovery controls.
- Focused evidence: the table menu test passes 1 / 32 filtered expectations;
  the compact receipt test passes 1 / 8; the adjacent recovery test covers
  preview/apply undo without leaving the History surface. The inline mutation
  suite continues to cover Undo/Redo buttons and `Ctrl/Cmd+Z` plus
  `Shift+Ctrl/Cmd+Z`, including stale-revision recovery.
- UX-206, UX-209, UX-309, and UX-407 are checked. Remaining UX work is responsive
  visual/cross-host parity, the
  inline/full-page state matrix, Electron, responsive, accessibility,
  usability, performance, and packaged-release evidence.

### 2026-07-22 first Notion-UX insertion slice

- `DatabaseView` is no longer a fresh raw-ID slash insert. The slash menu
  exposes `New database` and `Linked view of database`; the latter renders a
  searchable
  database → source → saved-view picker and a missing-reference replacement
  path. Existing serialized `DatabaseView` blocks remain compatible.
- The `Database` slash entry opens the database shell in creation mode through
  a typed app event, preserving the existing exact-plan commit and recovery
  contract while removing one discovery step.
- Focused evidence: 23 slash-menu tests / 198 expectations, 11
  `DatabaseView` DOM tests / 61 expectations, app typecheck, and core registry
  tests (76 / 403 expectations). The running IPv4 app capture now closes
  UX-102; UX-301/303/308 remain backed by the inline picker journey.

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

### 2026-07-23 ordinary document body recovery and Electron smoke

- `DatabaseRecordPageChrome` now renders the supplied editor body for ordinary
  non-record documents as well as canonical database record pages. The missing
  normal-document branch had prevented the ProseMirror surface from mounting,
  which in turn made `/` and inline database insertion impossible from a blank
  page. `DatabaseRecordPageChrome.dom.test.tsx` now passes 8 tests / 86
  expectations, including the body-after-page-header regression guard.
- A direct `bun run dev:electron` launch (the wrapper still hits the unrelated
  native-config `cargo metadata` build failure) reached the real Electron
  renderer. After the fix, the blank document exposed `.ProseMirror`, `/database`
  opened the slash menu, and selecting **Inline database** rendered the
  Notion-style inline creation shell. The local auto-create plan stayed at
  `Preparing table`, so the complete post-handoff Electron journey remains an
  open runtime/backend follow-up; no E2E checkbox was self-closed.

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
formatted. The checkout still has no usable Playwright-managed Chromium/ffmpeg
cache: `bunx playwright install chromium` downloaded the archive but its macOS
post-download step hung and was terminated. The initial managed-browser
attempt therefore failed before the app launched. To keep verification bounded,
the document-native journey was then run with the installed system Chrome via a
temporary no-video config. The sidebar page-first, slash inline, and linked
view/record-continuity cases each passed across focused runs after stale test
fixtures/assertions were corrected in `954bdcc4`. This is functional browser
evidence only; visual/manual checks, complete primary-view coverage, and
Electron capture remain required before closing R-005. The canonical primary
journey's three focused cases also passed later in the same system-Chrome
regime; see the dated stabilization section below. Do not repeat the
install/test loop until a browser-enabled runner or a later scoped change
requires it.

Commit `93411d21 test: cover alternate view title actions` extends
`database-primary-journeys.e2e.ts` to assert `Inspect context for record View
task` after creating and switching to a saved List view. Playwright discovery
still lists 3 tests; the later bounded system-Chrome run is recorded below.

### 2026-07-23 primary-view journey stabilization

`b79b1801 fix: stabilize primary database journey affordances` records the
first functional browser evidence for the canonical primary-view file. With
installed system Chrome and a temporary no-video Playwright config, three
focused cases each passed:

- canonical row create → Title edit → undo/redo → stable record-route opening;
- reviewed bulk Status change → canonical refresh → undo;
- saved-view create → visible tab switch → List rendering and record context
  inspection → saved-view rename.

The test was aligned with the current UI contract: the Command Palette uses its
semantic dialog/combobox, the database page uses breadcrumb/sidebar boundaries,
saved views use visible tabs, and direct-safe view changes commit without a
ghost-review button. The run also found and fixed two product defects: the
canonical Table surface now forwards List's existing record Context Inspector
callback, and saved-view rename captures the input value before the React state
updater runs. Focused evidence passes `DatabaseList.dom.test.tsx` (2 tests / 11
expectations), `DatabaseViewManagerDialog.dom.test.tsx` (13 tests / 23
expectations), app typecheck, and targeted Biome.

This remains functional evidence, not visual or release sign-off. Property
configuration, duplicate/reorder/delete view coverage, reload persistence,
agent proposal, destructive review, accessibility/manual checks, Electron
capture, and the complete primary-view matrix remain open. No repository-wide
server suite or broad/repeated E2E run was used.

### 2026-07-23 property-management journey stabilization

`f5ff201d test: stabilize property management journey` records a bounded
system-Chrome pass for `packages/app/tests/stress/database-manage-properties.e2e.ts`:

- property add → reviewed commit → `Priority` column visible;
- valued `Status` delete → reviewed commit clears the record value;
- a second reviewed delete → schema no longer exposes `Status`.

The test now follows the semantic Command Palette and database breadcrumb,
targets status values through their cell buttons, explicitly advances the
destructive review, and closes the management dialog between the two commits.
This proves only the add path and valued-delete recovery sequence. Property
configure/reorder/hide, full view mutation coverage, reload/agent journeys,
accessibility/manual review, Electron capture, and the complete primary matrix
remain open. No full server suite or repeated broad E2E run was used.

### 2026-07-23 saved-view mutation journey stabilization

`4f30e862 test: cover saved view mutation journey` extends the third case in
`packages/app/tests/stress/database-primary-journeys.e2e.ts`. One bounded
system-Chrome run now covers:

- saved-view settings opening and reviewed sort configuration;
- duplicate through the visible active-view menu;
- visible-tab reorder (`Move left`) with the resulting order asserted;
- deletion of the duplicated non-default view and tab removal.

This is additional functional evidence for UX-1106/NUI-701/R-005, not visual,
manual accessibility, reload, agent-policy, or release evidence. Filters,
layout-specific settings, the remaining view matrix, and the external Electron
gate remain open. No full server suite or broad/repeated E2E run was used.

### 2026-07-23 canonical canvas reload and peek continuity

Commit `8fc8bb0f fix: preserve canonical database canvas navigation` extends
the primary canonical journey without changing the reviewed administration
surface:

- A source with no explicit `defaultViewId` deterministically selects its first
  saved view. Page presentation writes that resolved view into the canonical
  `#database/<database>/<source>/<view>` hash, so reload does not briefly fall
  back to the unscoped All-records table.
- The page canvas keeps its root presentation open while nested menus and the
  record sheet are active. The explicit breadcrumb clears the canonical hash;
  opening a row therefore remains a Notion-style side peek instead of closing
  the database page when a portal opens.
- The primary system-Chrome case now covers create → Title edit → undo/redo →
  reload → row side peek → full page → browser return, and verifies the original
  `All tasks` saved-view tab is still selected. The focused saved-view case also
  passes once after the same canvas lifetime fix.
- Property-management selector alignment remains in the same feature-unit
  change; its bounded add and two-step valued-property deletion journey had
  already passed. No full E2E or repository-wide server suite was run.

Focused static evidence after the commit: targeted Biome and app typecheck pass;
`git diff --check` passes. A targeted DOM run reported 77 passing tests and
three unrelated existing Calendar/Timeline/conflict failures, so those broad
fixtures remain outside this slice. The temporary system-Chrome config was
removed before commit.

This closes UX-1107 at the focused functional-evidence layer and adds partial
evidence toward UX-1104/NUI-701/R-005. Typed non-Title editors, the complete
view/mutation matrix, accessibility/manual review, agent journeys, Electron
capture, and release gates remain open.

### Notion blank-creation identity and lifecycle follow-up (2026-07-23)

The latest inline-first slice fixes two failures that were visible in the
running Electron renderer:

- `createNotionDatabaseKey()` keeps the visible `Untitled database` title while
  giving each Notion-style blank creation a readable unique internal key. The
  same key is used for the source folder, so a second inline or full-page blank
  database cannot silently converge on the first one.
- `InlineDatabaseCreationDialog` now defers abort during React StrictMode's
  cleanup/setup probe. A real unmount still aborts the request, while a
  development replay keeps the original draft/plan request alive instead of
  leaving the shell in `Preparing table` forever. Converged plans are treated
  as a successful handoff, matching the full-page creator.

Focused evidence:

- `packages/app/src/lib/database-creation.test.ts`: 10 tests / 65
  expectations.
- `packages/app/src/editor/components/DatabaseView.dom.test.tsx`: the
  StrictMode inline blank-intent test passes 10 expectations.
- `packages/app/src/components/NotionDatabaseCreationPage.dom.test.tsx`: 3
  tests / 16 expectations, including the unique-key request assertion.
- App typecheck and targeted Biome checks pass.
- One direct Electron smoke after the fix reached the ready inline table with
  `Untitled database · Table`, `New`, `Filters`, `View settings`, `Title`, and
  `Press Enter to create page`; the temporary `Untitled.md` and generated
  manifest were removed afterward.
- Follow-on commit `f702ab3f` corrected the projection journey's asynchronous
  commit expectations instead of masking a delayed title-cell save. The full
  `DatabaseView.dom.test.tsx` file now passes 20 tests / 254 expectations; no
  production mutation behavior was changed by that test-only fix.
- Commit `6594165e` adds an integration guard at the `DatabaseTableDialog`
  boundary: the Notion creation route must render the page-first table shell
  and must not expose the administration wizard's database-name, Blank, or
  Template controls. The focused test passes 1 test / 5 expectations.
- Commit `c90d51a2` extends the App route harness so slash and sidebar New
  database events explicitly select `creationExperience="notion"`, while the
  intentional command-palette Databases discovery path remains `admin`. The
  full App DOM file passes 15 tests / 57 expectations.

This is functional handoff evidence only. Do not close UX-1102/NUI-105 or the
browser visual/usability gates from this smoke; the full Playwright journey and
cross-host evidence are still outstanding.

### 2026-07-23 Creation recovery follow-up

Commit `2330dcd1 fix: add retry to notion database creation` keeps the
Notion-style page-first creator recoverable after a rejected blank-database
mutation:

- The page landmark exposes `aria-busy="true"` while the first request is
  pending and returns to `false` after an error.
- The error state stays in the same page-shaped canvas and offers an explicit
  `Retry` action instead of requiring the user to reopen the database chooser.
- The retry attempt gets a distinct idempotency-key nonce while preserving the
  same visible `Untitled database` and canonical page-first handoff.
- The focused DOM file passes 4 tests / 23 expectations, including a rejected
  first request followed by successful retry; targeted Biome passes.
- The accompanying changeset is
  `../../.changeset/notion-creation-retry.md`.

The direct Electron dev launch was retried after the user reported unlocking
the Mac, but Computer Use still reported the OS as locked and returned no
accessibility tree or screenshot. The dev process was stopped cleanly. This
remains an environment capture blocker, not a product-test pass; do not close
UX-009, UX-1101–UX-1114, NUI-105, or NUI-701–NUI-705 from this attempt.

### 2026-07-23 Inline creation recovery follow-up

The inline `/database` Notion-style creator now has the same recovery contract
as the full-page creator:

- A failed automatic blank creation remains in the page-shaped block instead of
  reopening the database picker or silently disappearing.
- The inline landmark exposes `aria-busy="true"` during the request and offers
  an in-place `Retry` button from the error state.
- Each attempt uses a fresh UUID idempotency key, so a retry cannot accidentally
  reuse a prior failed request identity.
- `DatabaseView.dom.test.tsx` passes 21 tests / 259 expectations, including a
  first-request 503 followed by a successful retry under React StrictMode;
  targeted Biome and app typecheck pass.
- The accompanying changeset is
  `../../.changeset/inline-database-create-retry.md`.

This is functional recovery evidence only. Browser/Electron visual comparison,
manual keyboard/screen-reader review, and first-use usability evidence remain
open under NUI-105/NUI-701–NUI-705 and UX-009/UX-1101–UX-1114.

The Playwright-managed Chromium/ffmpeg install remains incomplete: the archive
download reached completion, but its macOS post-download process stopped with a
partial cache after roughly two minutes and was interrupted. The browser
journey was still verified without repeating that install loop by reusing the
installed system Chrome in a temporary no-video config. Each of the three
cases in `packages/app/tests/stress/database-document-native-journeys.e2e.ts`
passed across bounded runs (sidebar page-first, slash inline, and linked
record continuity). Console warnings and visual/manual/Electron/release gates
remain open; do not treat this as Notion parity sign-off.

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
  for creation, diagnostics, Table, view manager, and all linked renderers. A
  bounded system-Chrome run passed all three cases in
  `tests/stress/database-document-native-journeys.e2e.ts`; the complete
  primary-view suite, accessibility suite, and Electron capture are still
  required before closing this item. The bounded
  `tests/stress/database-manage-properties.e2e.ts` run also passes property
  add plus the two-step valued-property delete review; configure/reorder/hide,
  agent, and the remaining mutation matrix are still open. Canonical reload and
  row-continuity evidence is recorded in `8fc8bb0f`, but it does not replace the
  full primary-view, agent, accessibility, or Electron gates.
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

### 2026-07-23 local usability evidence protocol

- Added `docs/rfcs/0001-notion-ux-evidence.md` as the single content-free
  schema for database UX attempts. It defines success/failed/cancelled/
  abandoned outcomes, semantic action counts, elapsed time, user-visible
  errors, abandonment points, recovery attempts, redaction rules, and the
  primary Notion-style journey catalog.
- UX-008 is now checked in the Notion UX alignment checklist. This closes the
  definition gate only; running-app visual captures and observed user sessions
  remain open under UX-009 and UX-1101–UX-1114.
- Existing DOM and Electron smoke evidence is explicitly labelled supporting
  evidence in the protocol so future agents cannot mistake it for a visual or
  usability sign-off.

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

1. When a browser-enabled runner is available, run only the new primary-journey
   Playwright file and attach the first hosted R-019 workflow result. Do not
   repeat the managed-browser install/test loop locally; the bounded
   system-Chrome document-native evidence is already recorded. This should
   identify missing tests instead of duplicating the existing 124 app DOM tests
   and many focused recovery/race suites.
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
