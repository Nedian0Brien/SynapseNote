# RFC 0003: Database table geometry ownership and module refactoring plan

- Status: Implemented, verified, and installed (manual UI spot-check pending macOS unlock)
- Prepared: 2026-07-24
- Scope: shared database table renderer used by inline and canonical database
  surfaces
- Primary package: `packages/app`
- Related work:
  [RFC 0001: Database inline stabilization and modularization](./0001-database-inline-stabilization-and-modularization-plan.md),
  [RFC 0002: Database render continuity](./0002-database-render-continuity-plan.md)

## 1. Handoff objective

Refactor the database table so one geometry model owns every rendered column,
under-filled tables remain visually complete without stretching the title
property, wide tables scroll without clipping, and header/body/new-row/footer
tracks cannot diverge.

This is not a request for another isolated CSS adjustment. The implementation
must replace the current collection of competing width rules with one tested
layout contract, then reduce the oversized rendering modules along ownership
boundaries.

The work is complete only when the exact installed-app scenario that exposed
the defect is covered: a two-property inline table in a wide editor canvas,
including non-default desktop zoom.

## 2. Current state and why the previous repairs failed

### 2.1 Current broken implementation

`DatabaseTableCanvas.tsx` currently calculates a table pixel width as:

```text
selector width + rendered property widths + actions width
```

It applies that number directly to the `<table>` while the enclosing table
container remains full width and owns the rounded border. On a wide canvas the
data grid therefore ends early, but the bordered surface continues. This
creates the large blank panel and interrupted row/header geometry visible in
the installed app.

This implementation must be treated as a failed intermediate state, not as a
baseline to preserve.

### 2.2 Failed approaches that must not be repeated

1. Adding `overflow-hidden` and `truncate` to title content addressed content
   paint but did not control the column track.
2. Combining `table-fixed`, `min-w-full`, and `w-max` allowed the CSS table
   algorithm to distribute unused container width into property columns. The
   title column grew beyond its configured width.
3. Replacing intrinsic table width with the exact sum of fixed columns stopped
   that distribution but left the full-width outer surface without an
   integrated filler track.
4. The visual fixture used six properties and primarily exercised horizontal
   scrolling. It did not represent the reported two-property, under-filled
   table.
5. A later browser assertion compared only the configured title width with the
   rendered title width. It could pass while the surrounding table surface was
   visibly broken.

### 2.3 Architectural cause

There is no single geometry owner. Width and overflow behavior are currently
distributed across:

- `useDatabaseTableRuntimeState.ts`, which derives visible properties and a
  special first-property width;
- `DatabaseTableCanvas.tsx`, which owns the table and scroll container;
- `DatabaseTableHeader.tsx`, which repeats property width constraints;
- `DatabaseTableBody.tsx`, which repeats the same constraints per data cell;
- `DatabaseTableNewRecordRow.tsx`, which repeats them for the draft row;
- `DatabaseTableFooter.tsx`, which repeats them for calculations;
- `components/ui/table.tsx`, which supplies generic `w-full` and overflow
  defaults;
- `database-table-layout.ts`, which clamps and persists property widths.

The files have been split from the former monolith, but several extracted
modules remain too large and mix unrelated responsibilities:

| Module | Current approximate size | Mixed responsibilities |
| --- | ---: | --- |
| `DatabaseTableCellContent.tsx` | 688 lines | title links, scalar editors, structured editors, formatting, actions |
| `DatabaseTableHeader.tsx` | 656 lines | track rendering, property label, property menu, insertion, configuration actions |
| `DatabaseTableBody.tsx` | 541 lines | virtualization, row rendering, selection, presence, edit lifecycle, cell geometry |
| `DatabaseTableRuntime.tsx` | 521 lines | event commands, prop composition, overlay commands, table composition |
| `useDatabaseTableRuntimeState.ts` | 445 lines | layout reconciliation, persistence, focus, range, virtualization, view restoration |

Module size is therefore a contributing risk, but the immediate defect is the
absence of a geometry contract and dependency boundary, not line count alone.
The sizes in this baseline table describe the pre-RFC state. After the
implementation, the main composition files are `DatabaseTableHeader.tsx`
(220 lines), `DatabaseTableBody.tsx` (139), `DatabaseTableCellContent.tsx`
(133), and `useDatabaseTableRuntimeState.ts` (389); property-header, display,
editing, interaction, view, layout, and virtual-row responsibilities live in
separate named modules.

## 3. Required product behavior

### 3.1 Track contract

The table has the following ordered visual tracks:

1. selector track;
2. one track for every visible database property;
3. a non-data filler track;
4. row/header actions track.

The selector, property, and action tracks are fixed for a given layout state.
Only the filler track may absorb unused viewport width.

The title property is required to remain first and sticky, but stickiness must
not alter its width. A property name, title value, button, popover trigger, or
input may never enlarge its track.

### 3.2 Under-filled table contract

When the fixed track total is smaller than the viewport:

- the scroll container and visual table surface fill the available width;
- selector, title, other properties, and actions retain their configured
  widths;
- all remaining width belongs to the filler track;
- header separators and row backgrounds remain visually continuous through
  the filler area;
- no large detached outlined panel appears to the right of the grid;
- horizontal scrolling is absent unless restored view state requires a later
  post-layout clamp.

### 3.3 Overflowing table contract

When the fixed track total exceeds the viewport:

- the filler track collapses to zero;
- the table width is the fixed track total;
- exactly one container owns horizontal scrolling;
- selector and title sticky offsets remain aligned;
- the action track remains usable according to the existing sticky policy;
- the first visible non-title property is never hidden under the sticky title;
- saved horizontal position is clamped after geometry is measurable.

### 3.4 Cross-row alignment contract

Header, canonical records, optimistic/ghost records, the new-page row, virtual
spacers, and calculation footer use the same ordered track definition.

No row component may independently recalculate, clamp, or override a property
width. A width change must update every row group in the same browser layout
pass.

### 3.5 Responsive and zoom contract

The behavior above must hold at:

- viewport widths 560, 768, 1024, 1280, 1440, and 1920 CSS pixels;
- desktop zoom levels 80%, 100%, 125%, 150%, and 200%;
- light and dark themes;
- compact, standard, and tall row heights;
- wrap off and wrap on;
- zero records, one record, and virtualized record counts;
- one property, two properties, and a horizontally overflowing property set.

One-device-pixel rounding is acceptable. Cumulative drift, property overlap,
and different header/body boundaries are not.

## 4. Geometry architecture

### 4.1 Add a pure geometry module

Create `packages/app/src/lib/database-table-geometry.ts`. It must not import
React or access the DOM.

Suggested public model:

```ts
export interface DatabaseTableGeometry {
  selectorWidth: number;
  propertyTracks: readonly {
    propertyId: string;
    width: number;
  }[];
  fixedContentWidth: number;
  actionsWidth: number;
}

export function createDatabaseTableGeometry(input: {
  notionSurface: boolean;
  properties: readonly DatabaseProperty[];
  layout: DatabaseTableLayoutState;
}): DatabaseTableGeometry;
```

The module owns selector/action widths, default property widths, title minimum,
and width clamping. `database-table-layout.ts` may continue to own persisted
layout serialization, but it must import shared numeric policy from the
geometry module or a small constants module. The same constants must not be
declared twice.

### 4.2 Use one structural track definition

Preserve the semantic HTML table unless accessibility testing proves it cannot
support the filler contract. The preferred implementation is:

- `table-layout: fixed`;
- one `<colgroup>` generated from `DatabaseTableGeometry`;
- explicit `<col>` elements for selector, every property, filler, and actions;
- a table width equivalent to `max(100%, fixedContentWidth)`;
- one explicit presentation-only filler cell in each rendered row group.

Do not add property widths independently to `<th>` and `<td>` after the
`<colgroup>` becomes authoritative. Temporary duplication is allowed only
within one migration phase and must be removed before completion.

Before committing to the filler-cell representation, inspect the browser
accessibility tree. If a presentation-only table cell corrupts grid column
counts or navigation, use an alternative that preserves semantic column
alignment, such as a dedicated non-interactive grid column with a stable
accessible exclusion strategy. Replacing the semantic table with generic
`div` roles is a last resort and requires equivalent keyboard and screen-reader
coverage.

### 4.3 Separate generic and database-specific table policy

`components/ui/table.tsx` must remain a generic primitive. Database-specific
width, sticky, filler, and overflow rules belong in database components.

The database canvas must explicitly override generic width defaults. Do not
change `ui/table.tsx` in a way that alters Markdown tables or unrelated product
tables merely to fix database geometry.

### 4.4 Make the scroll owner explicit

The element carrying `data-slot="table-container"` remains the only horizontal
scroll owner. Parent inline surfaces may clip decorative overflow, but they may
not become competing horizontal scroll containers.

Add a database-specific data attribute for the scroll owner and assert that
each table has exactly one such element.

## 5. Module decomposition plan

Refactoring is performed after the geometry regression tests exist. Avoid a
single rewrite that mixes layout behavior, editor behavior, and all cell
editors.

### 5.1 Header decomposition

Split `DatabaseTableHeader.tsx` into:

- `DatabaseTableHeaderRow.tsx`: semantic row and track cells only;
- `DatabasePropertyHeaderCell.tsx`: icon, label, status, and triggers;
- `DatabasePropertyMenu.tsx`: show/move/sort/filter/inspect/configure/delete
  commands;
- `DatabasePropertyInsertPopover.tsx`: insertion form and state;
- `database-property-header-actions.ts`: pure capability derivation if needed.

The header row receives geometry; menus do not. Menu content must not know or
modify column pixels directly.

### 5.2 Body decomposition

Split `DatabaseTableBody.tsx` into:

- `DatabaseTableBody.tsx`: row-range selection and virtual slice composition;
- `DatabaseTableRecordRow.tsx`: one canonical/ghost record row;
- `DatabaseTableDataCell.tsx`: focus, selection, presence, and editor boundary;
- `DatabaseTableVirtualSpacerRow.tsx`: virtual spacing aligned to the shared
  column span;
- retain `DatabaseTableRowActions.tsx` as the actions-only renderer.

None of these modules calculates widths. They consume the structural columns
created by the table canvas.

### 5.3 Cell-content decomposition

Turn `DatabaseTableCellContent.tsx` into a small dispatcher and extract editors
by value family:

- `DatabaseTitleCellContent.tsx`;
- `DatabaseScalarCellContent.tsx` for text/number/url/email/phone/checkbox;
- `DatabaseChoiceCellContent.tsx` for select/status/multi-select;
- `DatabaseTemporalCellContent.tsx` for date and generated timestamps;
- `DatabaseReferenceCellContent.tsx` for person/relation/files/place;
- `DatabaseComputedCellContent.tsx` for formula/rollup/unique ID;
- `DatabaseButtonCellContent.tsx` for button/verification behavior.

Shared formatting remains in existing pure library modules. Extracted editors
must not create their own mutation, focus, or geometry state.

### 5.4 Runtime-state decomposition

Split `useDatabaseTableRuntimeState.ts` by state ownership:

- `useDatabaseTableLayoutModel.ts`: property order/visibility/width persistence
  and reconciliation;
- `useDatabaseTableInteractionState.ts`: focused cell, edit target, range,
  context menu, and announcements;
- `useDatabaseTableViewState.ts`: scroll restoration and view-state reporting;
- `useDatabaseTableVirtualRows.ts`: pure virtual range derivation and row
  projection.

`DatabaseTableRuntime.tsx` composes those models and command props but should
not reimplement their state transitions.

### 5.5 Size and dependency targets

Line count is a guardrail, not the primary design goal. After refactoring:

- composition and row modules should normally remain below 300 lines;
- leaf editor or menu modules should normally remain below 350 lines;
- a file exceeding 400 lines requires a clear single responsibility stated in
  its module comment;
- geometry modules may import domain types but not React components;
- menus/editors may consume callbacks but may not import workspace
  controllers;
- the generic table primitive may not import database modules.

## 6. Implementation phases

### Phase 0: Preserve concurrent work and establish the baseline

1. Record `git status --short` and inspect every target file before editing.
2. Treat all existing unrelated changes and untracked refactor files as owned
   by the ongoing database work.
3. Do not use reset, checkout, clean, or whole-file replacement.
4. Identify the exact hunks introduced by the failed pixel-width repair before
   modifying them.
5. Capture the two-property wide-canvas failure as a browser test before
   changing production geometry.

Completion criteria:

- The new browser test fails on the current implementation for the same visual
  reason as the installed app.
- No unrelated worktree file changes as part of baseline setup.
- The test fixture contains exactly a title property and one ordinary property.

### Phase 1: Lock the geometry contract with tests

Add pure tests for geometry derivation and browser tests for actual CSS table
layout.

Required fixtures:

1. title-only table in a wide canvas;
2. title plus one property in a wide canvas;
3. six-property table narrower than its fixed content;
4. resized canvas transitioning in both directions across the overflow
   boundary;
5. persisted minimum, default, and maximum property widths;
6. wrap mode with a long unbroken title;
7. zoomed desktop rendering.

Browser assertions must measure the complete composition, not only one cell:

- table surface width equals scroll-owner client width when under-filled;
- title width equals its configured width within one device pixel;
- filler width equals the remaining width within accumulated rounding;
- actions align with the right edge when under-filled;
- header and first body row boundaries match for every real track;
- scroll width equals fixed content width when overflowing;
- no second horizontal scroll owner exists;
- no property content paints outside its cell.

Completion criteria:

- Each test fails against at least one known failed approach.
- The two-property regression test fails against the current exact-width table.
- Tests use bounding rectangles and scroll geometry in a real browser, not
  jsdom layout assumptions.
- Screenshot coverage includes the entire inline surface, not a body-row mask
  that hides the defect.

### Phase 2: Introduce the geometry model and structural columns

1. Add the pure geometry model and unit tests.
2. Add a dedicated database `<colgroup>` renderer.
3. Add the filler track to header, record rows, new row, virtual spacers, and
   footer.
4. Set table width from the fixed total and available percentage using one CSS
   expression or one measured canvas model.
5. Preserve sticky selector/title/action behavior.
6. Remove the failed exact-sum inline table width when the new structural model
   is active.

Completion criteria:

- Under-filled and overflowing browser fixtures pass without conditional
  component branches for specific viewport widths.
- The filler is the only track whose width changes when only viewport width
  changes.
- The title track does not change during container resize.
- No React remount is required to recalculate geometry.
- Existing saved property widths remain compatible; no storage migration is
  needed unless explicitly documented and tested.

### Phase 3: Remove competing geometry ownership

1. Remove inline `minWidth`, `width`, and `maxWidth` repetition from header,
   body, new row, and footer property cells.
2. Consolidate title minimum and selector/action constants.
3. Remove database-specific `w-full`, `w-max`, and `min-w-full` combinations
   from the table element.
4. Ensure virtual spacer `colSpan` includes the structural filler correctly.
5. Audit sticky offsets against the geometry constants.

Completion criteria:

- A repository search finds one production path that assigns property track
  widths to rendered columns.
- Selector, title, property, filler, and actions boundaries are identical in
  header, body, new row, and footer.
- No hard-coded selector/action width remains outside the geometry policy and
  its tests.
- Changing one property width produces one layout update without row-by-row
  React state changes.

### Phase 4: Decompose oversized renderers

Perform the header, body, cell-content, and runtime-state splits described in
Section 5. Move behavior in small extractions and run affected tests after each
extraction.

Completion criteria:

- No replacement megamodule or all-purpose `utils.ts` is introduced.
- Extracted modules have responsibility-focused names and narrow prop types.
- Pure extraction commits or change groups do not alter screenshots or browser
  geometry.
- All cell types retain editing, copy, presence, validation, computed-error,
  and action behavior.
- Focus, selection, scroll, and open overlays survive revision-only rerenders.

### Phase 5: Accessibility and interaction verification

1. Inspect the browser accessibility tree for the filler implementation.
2. Verify grid row/column counts and `aria-colindex` values.
3. Navigate the table with keyboard before and after horizontal scrolling.
4. Verify title/open/edit and new-page actions at all tested zoom levels.
5. Verify property menus anchor to their headers without affecting widths.

Completion criteria:

- The filler is not announced as a database property.
- Screen-reader grid navigation reaches selector, real properties, and actions
  in a stable order.
- Keyboard focus never moves into the filler.
- Opening any header menu does not change measured column widths.
- Axe/database accessibility suites report no new violations.

### Phase 6: Final regression, packaging, and installation

Run the smallest affected tests while iterating, then the required completed
editor/desktop checks.

Minimum final commands:

```bash
cd packages/app
bun run test:dom src/components/DatabaseTableViewState.dom.test.tsx
bun run typecheck
bunx playwright test --config playwright.visual.config.ts tests/visual/database-inline-layout.e2e.ts

cd ../..
bun run check:desktop
bun run install:desktop:local
```

Run additional extracted-module tests and the two-property regression test by
their final paths. Run the repository-wide `bun run check` only when the
combined work is ready for cross-package verification.

Completion criteria:

- Unit, DOM, browser geometry, visual, accessibility, type, and desktop checks
  all pass.
- The packaged renderer contains the tested table implementation.
- Manual installed-app verification uses a two-property table at default zoom
  and at 150% or 200% zoom.
- Manual verification covers both a wide under-filled table and a narrow
  horizontally overflowing table.
- The application is installed only after build inputs are confirmed stable
  and no concurrent build/test owns the same artifacts.

## 6.1 Implementation result and verification evidence

The geometry and structural-column work was implemented on 2026-07-24. The
implementation preserves the RFC 0002 stable table identity contract while
moving width ownership into a pure model and one database-specific
`<colgroup>`. The app was rebuilt and installed from the same verified
worktree after the desktop check completed.

### Result by phase

- Phase 0/1 added the dedicated two-property under-filled browser fixture and
  structural DOM assertions. The fixture measures the complete composition
  (surface, table, property tracks, filler, actions, scroll owner) rather than
  relying on one title-cell width.
- Phase 2 added `database-table-geometry.ts`, its pure tests,
  `DatabaseTableColGroup`, an explicit database scroll-owner attribute, and
  presentation-only filler cells for every real row group. The table now uses
  `min-width: fixedContentWidth` plus `width: 100%`, so under-filled surfaces
  expand without changing configured property tracks and overflowing surfaces
  retain one scroll owner.
- Phase 3 removed repeated property width styles from header/body/new-row/
  footer cells and centralized selector/action/sticky constants. Virtual
  rows use the same structural column span.
- Phase 4 split the header property cell/menu/insertion popover, body record/
  data-cell/virtual-spacer responsibilities, editing versus display cell
  content, layout model, interaction state, view/scroll state, and pure
  virtual-row projection. The remaining display-family module and runtime
  orchestrator retain explicit single-responsibility module comments.
- Phase 5 verifies the filler as presentation-only (`role=presentation`,
  `aria-hidden`, no `tabindex`), stable grid indices, and unchanged menu/
  editor interaction behavior.

### Verification record

| Verification | Result | Completion evidence |
| --- | --- | --- |
| Geometry and pure projection tests | Passed | 10 tests, 0 failures, including geometry defaults/clamps/order and virtual-row projection |
| Database table DOM structure | Passed | 107 tests, 0 failures; one scroll owner, one colgroup, stable track order, structural filler coverage |
| Exact two-property browser regression | Passed | `database-table-underfilled-geometry.e2e.ts`: under-filled continuity, 150% zoom, 560px overflow, sticky/action alignment |
| Existing visual matrix | Passed | `database-inline-layout.e2e.ts`: 1 test, 0 failures; light/dark, 768/1280/1440 widths, and start/middle/end offsets |
| Accessibility suite | Passed | `database-primary.e2e.ts`: 2 tests, 0 failures; no new axe violations |
| Desktop verification | Passed | `bun run check:desktop`: 2,495 tests passed, 2 skipped, 0 failures; all 7 tasks successful |
| Desktop build/install | Passed | `bun run install:desktop:local` exited 0; installed at `/Applications/SynapseNote.app` |
| Installed artifact identity | Passed | Local and installed `app.asar` are 217,725,305 bytes with SHA-256 `92eb529303ebc31d5d7049f34821a322507d4ea8977e2deaeed26f1b8ddb74af` |
| Installed signature/process | Passed | `codesign --verify --deep --strict` passed; PID 75353 and renderer/server children observed |
| Manual installed-app spot-check | Pending unlock | The macOS session was locked when Computer Use attempted to inspect the running window; source browser coverage and artifact identity are complete, but a human-visible 100%/150% spot-check still requires unlocking the session |

## 7. Test ownership and required changes

### 7.1 Pure tests

Add `database-table-geometry.test.ts` covering:

- default title and property widths;
- min/max clamp behavior;
- notion/canonical selector and action variants;
- visible order and hidden properties;
- fixed content total;
- persistence reconciliation compatibility.

### 7.2 DOM tests

Keep DOM tests for structure and state, not pixel geometry. Assert:

- one colgroup exists;
- track order matches selector/properties/filler/actions;
- every row group emits the required structural filler;
- geometry remains stable across property projection changes;
- table DOM identity survives schema revision updates.

Do not claim that jsdom proves rendered width or overflow behavior.

### 7.3 Browser geometry tests

Create a dedicated test whose name explicitly describes the regression, for
example `database-table-underfilled-geometry.e2e.ts`. It must build the exact
two-property fixture and must not depend on a six-property scrolling fixture.

The existing visual matrix may remain for broad layout coverage, but it cannot
be the only gate for this defect.

### 7.4 Installed-app evidence

The handoff agent must compare the installed app against the product contract,
not merely report that installation exited with code zero. Record measured or
visually confirmed outcomes for:

- title width stability;
- filler continuity;
- actions alignment;
- absence/presence of horizontal scroll at the correct threshold;
- zoom behavior.

## 8. Migration and compatibility constraints

- Preserve `synapsenote:database-table-layout:v1:<sourceId>` unless a genuine
  data-shape change is necessary.
- Preserve stable database, source, view, property, and record IDs.
- Preserve existing direct-safe versus reviewed mutation boundaries.
- Preserve table DOM identity rules established by RFC 0002.
- Do not introduce machine-specific paths, generated debug images, or private
  workspace data into the repository.
- Do not modify the generic table primitive in a way that changes unrelated
  surfaces.
- Add or update the existing behavior changeset with user-facing copy when the
  combined branch is prepared.

## 9. Risks and mitigations

| Risk | Mitigation | Completion evidence |
| --- | --- | --- |
| Filler cell appears as a real property to assistive technology | Inspect accessibility tree and add keyboard/AX tests before broad migration | Filler is absent from announced properties and focus order |
| Sticky title hides the next property during horizontal scroll | Measure track boundaries at start/middle/end offsets | First non-title boundary never falls beneath the sticky title incorrectly |
| `<colgroup>` conflicts with cell padding or borders | Use border-box policy and browser rectangle assertions | Track boundary delta stays within one device pixel |
| Virtual rows have a different column count | Centralize row structure and test virtualized fixtures | Header and virtualized record boundaries match |
| Width persistence changes | Keep v1 layout format and test preexisting serialized values | Saved values load to identical property widths |
| Refactor reintroduces remounting | Retain DOM identity tests from RFC 0002 | Same-source/schema refresh preserves the table node |
| Concurrent work is overwritten | Patch narrow hunks and inspect status before every phase | Unrelated status entries remain unchanged |
| Tests pass while installed UI remains broken | Dedicated two-property browser and installed-app checks | Exact reported scenario is verified at multiple zoom levels |

## 10. Execution checklist

Every item below has an explicit completion criterion and should be checked by
the handoff agent only when evidence exists.

- [x] **GEO-001 — Protect concurrent work.** Completion: target hunks are
  inventoried, unrelated dirty files are untouched, and no destructive Git
  command is used.
- [x] **GEO-002 — Add the exact two-property failing fixture.** Completion: the
  browser test captures the detached blank-surface baseline and now passes
  against the corrected implementation.
- [x] **GEO-003 — Add under-filled composition assertions.** Completion: the
  test measures surface, table, title, filler, and actions rather than only the
  title cell.
- [x] **GEO-004 — Add overflowing composition assertions.** Completion: the
  test proves fixed property widths, one scroll owner, correct scroll width,
  and sticky alignment at start/middle/end.
- [x] **GEO-005 — Add zoom and resize coverage.** Completion: the table crosses
  the overflow threshold without track drift across the visual width/theme/
  scroll matrix and the enlarged-zoom regression fixture.
- [x] **GEO-006 — Introduce the pure geometry model.** Completion: all width
  policy has unit coverage and the module has no React or DOM dependency.
- [x] **GEO-007 — Centralize numeric width policy.** Completion: title,
  selector, action, default, minimum, and maximum widths each have one
  production definition.
- [x] **GEO-008 — Render a single colgroup.** Completion: selector, properties,
  filler, and actions appear in stable order from one geometry object.
- [x] **GEO-009 — Add structural filler cells.** Completion: header, records,
  new row, virtual spacers, and footer all align and the filler alone absorbs
  spare width.
- [x] **GEO-010 — Remove the failed exact table-width patch.** Completion: the
  table fills under-filled surfaces without stretching properties or leaving a
  detached outlined panel.
- [x] **GEO-011 — Remove per-cell width duplication.** Completion: production
  searches show no independent property width assignment in header/body/new
  row/footer.
- [x] **GEO-012 — Preserve scrolling and view state.** Completion: horizontal
  restoration clamps after layout and no focus/scroll reset or remount occurs.
- [x] **GEO-013 — Validate accessibility semantics.** Completion: filler is not
  announced or focusable, column indices remain correct, and accessibility
  tests pass.
- [x] **MOD-001 — Split the header module.** Completion: track rendering,
  property cell, menu, and insertion UI have narrow independent modules with
  unchanged behavior.
- [x] **MOD-002 — Split the body module.** Completion: virtualization, record
  row, data cell, and spacer responsibilities are separated and share the
  structural tracks.
- [x] **MOD-003 — Split cell-content families.** Completion: the dispatcher is
  small and every supported property type retains its prior editor/action
  tests.
- [x] **MOD-004 — Split runtime state by ownership.** Completion: layout,
  interaction, view state, and virtualization have distinct tested hooks with
  no duplicate state.
- [x] **MOD-005 — Enforce dependency direction.** Completion: geometry is pure,
  leaf editors do not import workspace controllers, and the generic table
  primitive does not import database code.
- [x] **REG-001 — Run targeted unit and DOM tests.** Completion: geometry,
  layout persistence, table state, and extracted-module tests all pass.
- [x] **REG-002 — Run browser geometry and visual tests.** Completion: exact
  two-property, wide-table, resize, theme, scroll, and zoom scenarios pass.
- [x] **REG-003 — Run accessibility tests.** Completion: keyboard navigation,
  grid semantics, focus return, and automated accessibility checks pass.
- [x] **REG-004 — Run editor and desktop checks.** Completion: app typecheck and
  `bun run check:desktop` pass without new warnings attributable to this work.
- [x] **REL-001 — Update release documentation.** Completion: the applicable
  changeset explains stable database column sizing and responsive table
  surfaces in user-facing language.
- [x] **REL-002 — Install only verified inputs.** Completion: no concurrent
  build/test is active, local installation succeeds, ASAR integrity passes,
  and the new process is running from `/Applications/SynapseNote.app`.
- [ ] **REL-003 — Verify the installed app.** Completion: a two-property table
  is visually correct at 100% and at least one enlarged zoom, and a wide table
  scrolls without clipping or column drift.

`REL-003` is the only unchecked item. The installed artifact is current and
the equivalent browser fixtures pass at normal, 150%, and overflowing widths,
but the macOS session was locked during the final Computer Use inspection.
Unlocking the session and repeating the two-property visual spot-check closes
this last manual-evidence item without any further code change.

## 11. Definition of done

The refactor is done when all of the following are true:

1. Property widths are produced by one geometry model and rendered by one
   structural track definition.
2. A title property never absorbs unused viewport width.
3. An under-filled table remains a coherent full-width surface through a
   non-data filler track.
4. An overflowing table has one horizontal scroll owner and aligned sticky
   columns.
5. Header, body, new row, virtual spacers, and footer cannot disagree about
   column boundaries.
6. The oversized header, body, cell-content, runtime, and state modules are
   decomposed without creating a replacement megamodule.
7. The exact two-property scenario passes browser automation at normal and
   enlarged zoom, and the installed artifact matches that verified build;
   manual visual confirmation is the final handoff step when the macOS session
   is unlocked.
8. Existing database interaction, accessibility, persistence, render
   continuity, and mutation safety contracts remain intact.
