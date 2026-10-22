# RFC 0004: Database table sticky geometry and interaction-handle refactoring plan

- Status: Implemented (2026-07-24; repository-wide check exception recorded below)
- Prepared: 2026-07-24
- Scope: inline and canonical database table geometry, horizontal scrolling,
  sticky columns, row interaction handles, geometry regression coverage, and
  desktop installation verification
- Primary package: `packages/app`
- Related work:
  [RFC 0002: Database render continuity](./0002-database-render-continuity-plan.md),
  [RFC 0003: Database table geometry and module refactoring](./0003-database-table-geometry-and-module-refactoring-plan.md)

## Implementation evidence (2026-07-24)

The refactor described by this RFC is implemented in the current worktree.
The implementation keeps the table's structural coordinate system separate
from document-side interaction chrome:

- `packages/app/src/lib/database-table-surface-policy.ts` is the single pure
  source for inline/canonical selector, action, interaction-rail, and handle
  gap policy.
- `packages/app/src/lib/database-table-geometry.ts` derives numeric track
  widths and `titleStickyInset` from that policy. Inline geometry has a zero
  Title inset; canonical geometry derives the inset from the selector track.
- `DatabaseTableCanvas`, the structural row components, and the footer use
  the same numeric geometry object. The former `left-11`, `-ml-11`, `pl-11`,
  and `2.75rem` interaction-gutter topology is gone from database production
  layout.
- `DatabaseTableInteractionLayer` is a single sibling overlay of the inline
  scroll owner. It delegates row targeting, creates the native add/grip
  controls once, positions them with `@floating-ui/dom`, and cleans up
  listeners, timers, and positioning observers on retarget/unmount.
- `create-interaction-handle-element.ts` is shared by the editor drag handle
  and database row overlay; ProseMirror commands remain in the editor
  extension and database selection/reorder commands remain in the database
  layer.
- `DatabaseTableRowControls` and Title-cell `leadingContent` coupling were
  removed. Inline tables now expose `Title, visible properties, filler,
  actions` as the only structural tracks, while canonical tables retain the
  selector track.

Verification completed for the affected implementation:

| Gate | Result |
| --- | --- |
| app lint | `bun run --filter @nedian0brien/synapsenote-app lint` — pass |
| app typecheck | `bun run --filter @nedian0brien/synapsenote-app typecheck` — pass |
| geometry/native-handle DOM tests | geometry 4/4; native handle 2/2 — pass |
| targeted table/view DOM tests | DatabaseTableViewState 6/6; DatabaseView 27/27; targeted DatabaseTableDialog 16/16 — pass |
| production app build | `bun run --filter @nedian0brien/synapsenote-app build` — pass |
| browser geometry gate | `bun run test:visual:database-geometry` — 1/1 pass; under-filled, overflow, scroll, zoom, hover-neutrality, and external-handle assertions passed |
| desktop local gate | `bun run check:desktop:local` — pass |
| desktop full gate | `bun run check:desktop` — 2,495 pass, 2 skipped, 0 fail |
| accessibility gate | `database-primary.e2e.ts` — 2/2 pass; canonical audit uses the semantic route-level `<main>` boundary because the Radix canvas primitive does not reliably forward the legacy data marker |

The local desktop workflow then rebuilt, signed, integrity-checked, installed,
and relaunched `/Applications/SynapseNote.app` from this worktree. A fresh
README inspection showed both linked tables with the Title header and new-page
input beginning at the table boundary; the focused browser geometry snapshot
also showed the native handle outside the grid without changing table
rectangles. No generated screenshots or temporary test artifacts were added to
the repository.

The repository-wide `bun run check` was also attempted. It stops in the
repository-wide `oxlint --max-warnings 0` phase on existing deprecation and
style diagnostics in unrelated database/server modules (and therefore never
reaches the full Turbo test phase). The affected checks listed above are the
completion evidence for this RFC; the baseline exception is retained here so
a future clean-worktree run can close it independently.

## 1. Objective

Remove the recurring rightward displacement of the first `Title` column by
separating three concepts that the current implementation treats as the same
left-side offset:

1. structural table tracks, such as the canonical selector column;
2. sticky-column insets, which may only be derived from pinned structural
   tracks;
3. document-side interaction chrome, such as the Notion-style add and drag
   handle shown outside a hovered row.

The implementation must not be another `left-*`, padding, or negative-margin
adjustment. It must introduce an explicit coordinate-space contract, move the
row handle out of the table and scroll-owner geometry, and make the contract
observable in real-browser and installed-app verification.

The work is complete only when all of the following remain true at the same
time:

- an inline table has no selector column or selector-shaped blank strip;
- the first Title header, every Title record cell, the new-page cell, and the
  calculation footer begin at the first structural table boundary;
- the add/drag handle is rendered outside that boundary and does not affect
  column width or sticky positioning;
- a wide table scrolls horizontally through one scroll owner;
- the Title column remains pinned without covering the interaction handle or
  the next property;
- adding, selecting, dragging, editing, resizing, filtering, and changing
  views do not remount the table;
- the local desktop install workflow cannot pass without exercising the
  relevant geometry regression gate.

## 2. Confirmed defect

### 2.1 Visible failure

The installed application currently renders a blank band before the Title
content. The same displacement is visible in the header, record rows, and new
page input. The input paint extends across the configured first-column
boundary, which proves that the problem is not merely icon spacing or text
padding.

### 2.2 Direct cause

The inline surface has already removed the selector track:

- `DATABASE_TABLE_SELECTOR_WIDTH.notion` is `0`;
- `DatabaseTableColGroup` omits the selector `<col>` when the width is `0`;
- `DatabaseTableHeader`, `DatabaseTableRecordRow`,
  `DatabaseTableNewRecordRow`, and `DatabaseTableFooter` omit their selector
  cells on the inline surface.

Despite that structural model, `databaseTableStickyGeometry(true)` returns
`titleOffset: 'left-11'`. Tailwind spacing `11` equals `2.75rem`, or 44 CSS
pixels at the default root size. That offset is applied to the first Title
`<th>` and `<td>` even though no 44px table track precedes them.

The 44px value is also represented independently as:

- `DATABASE_TABLE_INTERACTION_GUTTER_WIDTH = 44` in the pure geometry module;
- `-ml-11`, `pl-11`, and `w-[calc(100%+2.75rem)]` on the scroll owner;
- `left: -2.75rem` and `width: 2.625rem` in row-control CSS;
- literal class assertions in DOM tests.

The exported numeric constant is not consumed by those render paths. The code
therefore has several apparent geometry owners and no enforced relationship
between them.

### 2.3 Browser layout mechanism

The `<colgroup>` assigns the first structural track to Title. CSS table layout
uses that track for header/body/new-row/footer alignment. `position: sticky`
then paints the first cell at its configured `left` inset without adding a
matching `<col>`.

On the inline surface, `left: 44px` therefore creates two different coordinate
systems:

```text
structural layout:  [ Title ][ property ][ filler ][ actions ]
painted cells:              [ Title ][ property ...
                    ^ 44px visual gap and overlap
```

The gap is the missing selector-shaped area. The overlap is why Title content
and the new-page input can paint across the next property boundary.

### 2.4 Why the regression recurred

The earlier selector-column implementation legitimately used the selector
track width as the Title sticky inset. When the selector column was removed,
the new 44px interaction gutter inherited that role even though it is not a
table track. The old rule—"Title starts after the left control width"—survived
after the left control stopped participating in table layout.

This recurrence was enabled by four design faults:

1. `notionSurface: boolean` conflates presentation, table tracks, sticky
   behavior, action widths, and interaction chrome.
2. The pure geometry object owns column widths but not sticky insets or the
   boundary between structural and non-structural UI.
3. A formatting/helper module returns opaque Tailwind class strings instead of
   semantic numeric geometry.
4. DOM tests assert the presence of `left-11`; jsdom cannot calculate the
   resulting table-cell coordinates, so the test currently protects the bug.

The real-browser geometry test uses `getBoundingClientRect()`, but visual tests
are not part of `bun run check`, `bun run check:desktop`,
`bun run check:desktop:local`, or `bun run install:desktop:local`. A desktop
package can therefore be built and installed while the only test capable of
detecting this paint displacement remains unexecuted.

## 3. Non-goals

This RFC does not:

- redesign database schemas, queries, mutations, or record persistence;
- replace the semantic HTML table with a generic div grid;
- add a permanent selector column to the inline table;
- change canonical workspace selection behavior unless required to consume the
  shared geometry contract;
- change database remount/refresh identity rules established in RFC 0002;
- implement unrelated Notion parity work such as new property editors or new
  view types;
- change Markdown table behavior through the generic `ui/table` primitive;
- use a magic padding adjustment as the final architecture.

## 4. Required invariants

### 4.1 Structural-track invariant

- The `<colgroup>` is the only owner of table-track order and width.
- Inline order is `Title, visible properties, filler, actions`.
- Canonical order is `selector, Title, visible properties, filler, actions`.
- A visual control that is not represented by a `<col>` may not contribute to
  any sticky-cell inset.
- Header, record, optimistic record, new-page, virtual spacer, and calculation
  rows use the same ordered structural tracks.

### 4.2 Sticky invariant

- `titleStickyInset` equals the width of pinned structural tracks preceding the
  Title track.
- Inline `titleStickyInset` is `0` because no structural selector precedes
  Title.
- Canonical `titleStickyInset` equals `selectorTrackWidth` while the selector
  remains pinned.
- Sticky positioning may change paint position during horizontal scrolling but
  may not change column width or the initial, unscrolled table boundary.
- At `scrollLeft === 0`, `titleCell.left === table.left` on the inline surface.
- At every scroll position, `titleCell.right` may not cover the first unpinned
  property's readable content region.

### 4.3 Interaction-handle invariant

- The inline add/drag control is a sibling overlay of the scroll owner, not a
  table cell, table padding region, or child that changes Title geometry.
- Exactly one row-handle element exists per mounted inline table and is
  retargeted to the current hovered/focused row.
- The handle uses the native editor block-handle chrome and positioning model:
  an imperative element, a single active target, and `@floating-ui/dom`
  placement outside the target.
- The handle's right edge remains outside the Title structural boundary.
- Hiding or showing the handle does not alter `clientWidth`, `scrollWidth`,
  column boundaries, or table height.
- Reordering updates the active linked view's manual order without causing a
  server refetch or table remount.

### 4.4 Scroll invariant

- `data-database-table-scroll-owner` is the only horizontal scroll owner.
- The scroll owner has no left padding or negative margin whose purpose is to
  reserve row-handle space.
- The table width is `max(available content width, fixed structural width)`.
- Under-filled tables have no horizontal scroll range and retain a filler
  track.
- Overflowing tables expose the complete last property and actions track.
- Restored `scrollLeft` is clamped after the table and viewport have measurable
  geometry.

### 4.5 Mount-continuity invariant

- Hovering or focusing a row only retargets the overlay handle.
- Reordering rows changes record order without changing the table surface DOM
  identity.
- Schema and projection reconciliation do not recreate the interaction layer.
- Changing view layout may replace the renderer; changing a table revision may
  not.

### 4.6 Accessibility invariant

- The accessibility grid exposes Title as column 1 inline and column 2 in the
  canonical workspace.
- The row handle has a contextual accessible name for the current page.
- Clicking the grip selects the same page that dragging would reorder.
- A keyboard-accessible, non-pointer path remains available for row selection
  and reordering, or the existing supported alternative is documented and
  tested.
- The transient overlay does not appear as an extra grid column.

## 5. Target architecture

### 5.1 Separate surface policy from derived table geometry

Add a pure `database-table-surface-policy.ts` module. It owns differences
between inline and canonical table surfaces without returning CSS classes.

Proposed contract:

```ts
export type DatabaseTableSurfaceMode = 'inline' | 'canonical';

export interface DatabaseTableSurfacePolicy {
  mode: DatabaseTableSurfaceMode;
  selectorTrackWidth: number;
  actionsTrackWidth: number;
  interactionRailWidth: number;
  rowHandleGap: number;
}

export function databaseTableSurfacePolicy(
  mode: DatabaseTableSurfaceMode,
): DatabaseTableSurfacePolicy;
```

The policy values are semantic:

- `selectorTrackWidth` participates in the `<colgroup>`;
- `actionsTrackWidth` participates in the `<colgroup>`;
- `interactionRailWidth` and `rowHandleGap` are consumed only by the external
  interaction layer.

`notionSurface` may remain at compatibility call sites during migration, but
it must be converted to `DatabaseTableSurfaceMode` once at the runtime
boundary. Geometry and leaf components must not branch independently on the
boolean.

### 5.2 Extend the pure geometry model

Refactor `database-table-geometry.ts` to consume the surface policy and produce
all structural and sticky values:

```ts
export interface DatabaseTableGeometry {
  surfaceMode: DatabaseTableSurfaceMode;
  selectorTrackWidth: number;
  propertyTracks: readonly DatabaseTablePropertyTrack[];
  fillerTrack: { kind: 'flex' };
  actionsTrackWidth: number;
  fixedStructuralWidth: number;
  titleStickyInset: number;
}
```

Derivation rules:

```text
titleStickyInset = selectorTrackWidth
fixedStructuralWidth = selectorTrackWidth
                     + sum(propertyTrack widths)
                     + actionsTrackWidth
```

The interaction rail is intentionally absent from `fixedStructuralWidth` and
`titleStickyInset`.

### 5.3 Replace stringly sticky geometry

Delete `databaseTableStickyGeometry()` from `database-table-utils.ts`.

`DatabaseTableCanvas` passes the same `DatabaseTableGeometry` instance to:

- `DatabaseTableHeader`;
- `DatabaseTableBody` and `DatabaseTableRecordRow`;
- `DatabaseTableDataCell` only if the cell must apply the first-track style;
- `DatabaseTableNewRecordRow`;
- `DatabaseTableFooter`.

Cells apply numeric styles or a single host CSS variable derived from the
geometry object. They must not select Tailwind `left-*` classes independently.

Preferred implementation:

```tsx
style={isTitle ? { left: geometry.titleStickyInset } : undefined}
```

If a CSS variable is required for pseudo-elements or shared selectors, set it
once on `data-database-table-surface`:

```tsx
style={{ '--database-title-sticky-inset': `${geometry.titleStickyInset}px` }}
```

and consume it without redefining its numeric value in CSS.

### 5.4 Introduce a sibling interaction layer

Add `DatabaseTableInteractionLayer.ts` or
`DatabaseTableInteractionLayer.tsx` as a sibling of `DatabaseTableCanvas`
inside `DatabaseTableComposition`:

```text
DatabaseTableComposition (position: relative; overflow: visible)
├── DatabaseTableControls
├── DatabaseTableCanvas
│   └── scroll owner
│       └── semantic table
├── DatabaseTableInteractionLayer
└── DatabaseTableCellMenu
```

The layer owns one imperative controls element, mirroring the existing
`BlockDragHandle` lifecycle:

- create the add button and grip once;
- mount it in the table surface rather than inside React-rendered cells;
- use event delegation to identify the active `tr[data-record-id]`;
- use `@floating-ui/dom` with `placement: 'left-start'` and the shared native
  offset policy;
- update the contextual `aria-label` when the active row changes;
- retarget on `pointermove`, `focusin`, vertical scroll, resize, and virtual-row
  replacement;
- hide it when the pointer/focus leaves the table, the row becomes invalid, or
  the table unmounts;
- destroy listeners, observers, and the imperative DOM element during cleanup.

This design deliberately uses one overlay instead of rendering controls in
every Title cell. It avoids clipping by the horizontal scroll owner and keeps
interaction chrome out of semantic grid navigation.

### 5.5 Extract reusable native handle chrome

The native editor implementation currently creates its DOM in
`editor/extensions/drag-handle.ts`. Extract the product-neutral pieces into a
small module, for example:

```text
editor/interaction-handle/create-interaction-handle-element.ts
editor/interaction-handle/interaction-handle-positioning.ts
```

The extracted code owns:

- the `ok-block-controls`, `ok-add-block-btn`, and `ok-drag-grip` DOM structure;
- button dimensions and shared positioning constants;
- common mouse-down suppression for the add button;
- contextual label updates;
- common visibility lifecycle.

Editor-specific ProseMirror selection/insertion remains in
`drag-handle.ts`. Database-specific page selection, focus-new-page, and record
reordering remain in `DatabaseTableInteractionLayer`.

This prevents the database from merely copying native class names while
implementing a separate geometry system.

### 5.6 Simplify the scroll owner

After the interaction layer is outside the scroll owner, remove from the
inline `DatabaseTableCanvas` container:

- `-ml-11`;
- `pl-11`;
- `w-[calc(100%+2.75rem)]`;
- `data-database-table-interaction-gutter` if it no longer names a real DOM
  owner.

Retain:

- `min-w-0`;
- `overflow-x-auto`;
- the intended vertical scrolling policy;
- `overscroll-x-contain` and `touch-pan-x` when they remain useful;
- one `data-database-table-scroll-owner` marker.

The table then begins at the scroll owner's content edge. Any document-side
space needed by the overlay belongs to the composition host, not the table.

## 6. Module-level change plan

| Module | Required change | Responsibility after refactor |
| --- | --- | --- |
| `lib/database-table-geometry.ts` | Consume surface policy; derive structural width and numeric sticky inset | Pure table-track and sticky geometry |
| `lib/database-table-surface-policy.ts` | New module | Pure inline/canonical surface constants |
| `components/database-table-utils.ts` | Remove `databaseTableStickyGeometry` | Value formatting and table-domain helpers only |
| `components/DatabaseTableComposition.tsx` | Mount interaction layer as a sibling of the canvas | Stable surface DOM composition |
| `components/DatabaseTableCanvas.tsx` | Remove gutter padding/negative margin; pass geometry | Semantic table and sole scroll owner |
| `components/DatabaseTableHeader.tsx` | Consume numeric geometry | Header row composition only |
| `components/DatabasePropertyHeaderCell.tsx` | Apply Title sticky inset from geometry | One property header and menu trigger |
| `components/DatabaseTableBody.tsx` | Supply active rows to interaction controller without owning pixels | Row slice and reorder orchestration |
| `components/DatabaseTableRecordRow.tsx` | Remove per-row controls from Title content; expose row identity | Semantic record row |
| `components/DatabaseTableDataCell.tsx` | Remove `leadingContent` geometry coupling; consume Title inset | Cell interaction and editor boundary |
| `components/DatabaseTableNewRecordRow.tsx` | Consume shared Title inset | Draft row only |
| `components/DatabaseTableFooter.tsx` | Consume shared Title inset | Calculation row only |
| `components/DatabaseTableRowControls.tsx` | Replace or delete after native factory extraction | No independent geometry owner |
| `components/DatabaseTableInteractionLayer.*` | New module | Single native row-handle overlay and active-row lifecycle |
| `editor/extensions/drag-handle.ts` | Consume extracted native element/position helpers | ProseMirror-specific handle commands |
| `globals.css` | Remove database-specific `left: -2.75rem`; retain shared visual states | Styling without geometry duplication |
| `components/ui/table.tsx` | No database-specific changes | Generic table primitive |

## 7. Implementation phases

### Phase 0: Freeze evidence and establish the failing contract

1. Preserve the current installed-app screenshot and a focused crop outside
   the public repository.
2. Record the current DOM structure, `colgroup`, computed sticky inset, table
   boundary, Title boundary, first unpinned property boundary, and scroll-owner
   dimensions.
3. Add a browser regression assertion that fails when the first inline Title
   cell is displaced at `scrollLeft === 0`.
4. Add a row-input boundary assertion so a displaced new-page input cannot
   overlap the next structural track.
5. Run the new assertion against the current implementation and preserve the
   failing result before production changes.

Phase completion criteria:

- the failure reproduces with exactly two properties and at least one record;
- the test fails because `title.left !== table.left`, not because of text,
  theme, timing, or snapshot noise;
- the focused screenshot shows the same blank band as the installed app;
- no production geometry code has changed yet.

### Phase 1: Introduce explicit surface policy and numeric sticky geometry

1. Add `DatabaseTableSurfaceMode` and `DatabaseTableSurfacePolicy`.
2. Move selector, action, interaction-rail, and handle-gap constants into the
   policy module.
3. Extend `DatabaseTableGeometry` with `surfaceMode` and
   `titleStickyInset`.
4. Derive `titleStickyInset` exclusively from preceding pinned structural
   tracks.
5. Convert `notionSurface` to surface mode once at the runtime boundary.
6. Add pure tests covering inline and canonical policies.

Phase completion criteria:

- inline geometry returns `selectorTrackWidth: 0` and
  `titleStickyInset: 0`;
- canonical geometry returns matching selector and Title sticky widths;
- interaction-rail width does not change `fixedStructuralWidth`;
- no duplicate numeric selector/action/gutter policy remains outside the pure
  policy modules;
- all pure geometry tests pass.

### Phase 2: Make every structural row consume one geometry object

1. Pass `DatabaseTableGeometry` through canvas, header, body, new row, and
   footer props.
2. Replace `left-11` and `left-10` class selection with the numeric
   `titleStickyInset`.
3. Delete `databaseTableStickyGeometry()` and its class-string tests.
4. Remove independent sticky calculations from record and data-cell modules.
5. Verify header/body/new-row/footer receive the same object identity in one
   render.

Phase completion criteria:

- `rg "left-11|left-10"` finds no database Title sticky policy;
- `rg "databaseTableStickyGeometry"` returns no production usage;
- all Title-bearing row groups use the same numeric inset;
- inline DOM exposes Title as the first structural cell;
- canonical selector and Title remain aligned;
- no table remount occurs while widths or projection are reconciled.

### Phase 3: Extract the native interaction-handle primitive

1. Extract shared imperative DOM creation from `BlockDragHandle`.
2. Extract shared handle dimensions and floating-position policy.
3. Keep ProseMirror commands and telemetry in the editor extension.
4. Add unit/DOM tests for creation, contextual labels, visibility, and cleanup.
5. Verify the editor's existing block handle is visually and behaviorally
   unchanged.

Phase completion criteria:

- both editor blocks and database rows consume the same handle DOM factory;
- no React-owned element is moved imperatively by a plugin;
- exactly one native controls element is created per handle controller;
- cleanup removes listeners and detached DOM;
- existing block add/select/drag tests continue to pass;
- handle styling has no database-specific copy of shared dimensions.

### Phase 4: Move database row controls into the sibling interaction layer

1. Add `DatabaseTableInteractionLayer` to the stable table composition.
2. Use delegated events to identify the active rendered record row.
3. Position the native handle from the active row using floating-ui.
4. Wire add, select, drag start, drag over, drop, drag end, and announcements
   to the active record ID.
5. Retarget safely when virtualization replaces the active row.
6. Preserve manual linked-view order without triggering a read-model cache-key
   change.
7. Remove `leadingContent` and per-row handle instances from Title cells.
8. Remove database handle geometry from global CSS.

Phase completion criteria:

- no row handle is a descendant of a `<th>`, `<td>`, `<tr>`, or scroll owner;
- one overlay handle follows the hovered/focused row;
- the handle remains outside the Title boundary at 80–200% zoom;
- the handle does not change table, row, or column measurements when shown;
- selecting and dragging always target the labelled page;
- drag reorder persists in the active linked view;
- no describe/query request occurs solely because of manual reorder;
- table surface, focused cell, and scroll owner retain DOM identity.

### Phase 5: Remove the padded-gutter scroll topology

1. Remove inline scroll-owner negative margin, left padding, and width
   compensation.
2. Ensure the composition host and inline database surface permit the sibling
   overlay to paint into the document gutter.
3. Keep exactly one horizontal scroll owner.
4. Revalidate under-filled filler behavior and wide-table scrolling.
5. Revalidate saved scroll restoration after the viewport becomes measurable.

Phase completion criteria:

- `scrollOwner.paddingLeft === 0` on inline tables;
- `scrollOwner.marginLeft === 0` for row-handle purposes;
- `table.left === scrollOwner.contentLeft` at `scrollLeft === 0`;
- under-filled tables have `scrollWidth === clientWidth` within one rounding
  pixel;
- overflowing tables have `scrollWidth > clientWidth` and can reveal their
  complete final track;
- there is no second horizontal scrollbar on any parent surface.

### Phase 6: Replace regression assertions with semantic geometry checks

1. Remove DOM expectations that require literal `left-11`, `pl-11`, or
   `-ml-11` classes.
2. Retain DOM tests for semantic track order, accessible column indices,
   single scroll-owner structure, and stable element identity.
3. Expand browser tests to measure actual rectangles and scroll dimensions.
4. Add interaction-layer tests for row targeting, handle placement, and
   geometry neutrality.
5. Add installed-app spot checks using the same README two-property fixture.

Phase completion criteria:

- DOM tests assert meaning rather than implementation class names;
- browser tests fail when a Title cell receives any nonzero initial inline
  displacement;
- tests cover header, first record, new page, and footer when present;
- tests cover start, middle, and maximum horizontal scroll positions;
- tests cover 560, 768, 1280, and 1440 CSS-pixel viewports;
- tests cover 80%, 100%, 125%, 150%, and 200% zoom;
- tests cover light and dark themes;
- focused-row handle screenshots compare the document gutter and first two
  property boundaries in one crop.

### Phase 7: Integrate verification into the delivery path

1. Add a narrow database geometry browser command that runs the exact
   regression without the complete visual suite.
2. Invoke that command from an appropriate database/editor completion check,
   or document it as a mandatory pre-install gate enforced by CI.
3. Run affected unit, DOM, browser, visual, accessibility, type, build, and
   desktop checks.
4. Build and install the local desktop app.
5. Compare the installed app with the accepted reference state.

Phase completion criteria:

- the narrow geometry command exits nonzero on the original `left-11` defect;
- CI or the documented release gate cannot omit that command for database
  geometry changes;
- `bun run check:desktop:local` passes;
- affected `packages/app` tests pass;
- `bun run check:desktop` passes;
- `bun run check` passes before PR readiness;
- `/Applications/SynapseNote.app` is rebuilt from the current worktree and
  relaunched;
- the installed-app Title boundary and row handle are visually verified.

## 8. Required browser geometry matrix

Each matrix cell must assert numeric geometry, not only screenshots.

| Scenario | Required assertions |
| --- | --- |
| Title only, under-filled | Title begins at table start; filler consumes remainder; no horizontal scroll |
| Title + one property, under-filled | Exact Title/property boundary; no blank left band; actions align right |
| Six properties, overflowing | One scroll owner; final track reachable; Title remains pinned |
| Empty database | Header and new-page Title boundaries align |
| Calculation footer | Header/body/footer Title boundaries align |
| Hovered first/middle/last row | One handle; outside Title; correct active record |
| Manual reorder | Row order changes without table replacement or refetch |
| Column resize | All row groups update in one layout pass; handle placement follows row |
| Projection change | Visible tracks reconcile without remount or stale sticky inset |
| Saved horizontal scroll | Restored/clamped position; no gutter overlap |
| 80–200% zoom | Maximum one device-pixel boundary difference |
| Light/dark | Same geometry; handle remains legible and focus-visible |

For the inline surface, the minimum required equations are:

```text
abs(titleHeader.left - table.left) <= 1 device pixel
abs(titleRecord.left - titleHeader.left) <= 1 device pixel
abs(newPageTitle.left - titleHeader.left) <= 1 device pixel
abs(titleHeader.right - firstProperty.left) <= 1 device pixel
rowHandle.right < titleHeader.left
scrollOwnerCount === 1
```

For canonical tables:

```text
abs(titleHeader.left - selectorHeader.right) <= 1 device pixel
abs(titleStickyInset - selectorTrackWidth) <= 1 device pixel
```

## 9. Test inventory

### 9.1 Pure tests

- surface-policy values and mode conversion;
- Title sticky inset derivation;
- fixed structural width excluding interaction rail;
- property width defaults, minimums, maximums, and persisted widths;
- canonical selector relationship;
- visible-property reorder and projection reconciliation.

### 9.2 DOM tests

- one colgroup and stable track order;
- no inline selector track or selector cell;
- accessible grid column counts and indices;
- one scroll owner;
- one interaction layer and one imperative controls element;
- contextual active-row label;
- add/select/drag command routing;
- cleanup on unmount;
- table and scroll-owner DOM identity across rerenders;
- no manual reorder cache-key change.

### 9.3 Browser and visual tests

- bounding rectangles for every Title-bearing row group;
- handle rectangle outside the Title rectangle;
- no geometry change between hidden and visible handle states;
- under-filled and overflowing scroll dimensions;
- sticky boundaries at start/middle/end offsets;
- resize across the overflow threshold;
- zoom/theme matrix;
- focused crops containing the interaction gutter, Title, next property, and
  new-page input.

### 9.4 Accessibility tests

- screen-reader tree has no phantom selector column inline;
- grip and add button names follow the active page;
- focus does not enter hidden controls;
- row selection state is announced;
- drag has a documented keyboard alternative;
- reduced-motion mode does not rely on animated placement for comprehension.

### 9.5 Installed desktop verification

Use the current README linked databases because they reproduce the real editor
width, outline panel, theme, and desktop zoom environment.

Verify:

1. both inline tables align Title with the first structural boundary;
2. hovering each row shows the native handle outside the grid;
3. dragging changes order and does not collapse or reload the table;
4. adding a page focuses the new-page input;
5. enough visible properties produce an internal horizontal scrollbar;
6. the final property remains reachable;
7. switching views preserves the table shell while changing visible tracks.

## 10. Risks and mitigations

### Risk 1: Overlay drift during virtualization or vertical scrolling

Mitigation:

- use one active row reference and floating-ui auto-update primitives;
- retarget from stable `data-record-id` rather than array index;
- hide immediately when the referenced row disconnects;
- test virtual slice replacement and rapid scroll.

### Risk 2: Native editor handle regressions after extraction

Mitigation:

- extract element creation and positioning only;
- keep ProseMirror commands and plugin lifecycle unchanged;
- add characterization tests before changing imports;
- compare editor handle screenshots and click/drag behavior before and after.

### Risk 3: Drag events cross the overlay/table boundary

Mitigation:

- store the dragged record ID in the interaction controller at `dragstart`;
- use delegated row `dragover`/`drop` targets;
- clear drag state on `dragend`, drop, blur, and unmount;
- test pointer exit and canceled drag.

### Risk 4: Sticky Title overlaps the row handle during horizontal scroll

Mitigation:

- place the handle outside the scroll owner;
- make the inline Title inset structurally zero;
- measure handle and Title rectangles at maximum scroll;
- assign overlay/table z-index tokens in the surface policy rather than ad hoc
  values in cells.

### Risk 5: Canonical table behavior changes accidentally

Mitigation:

- preserve the canonical selector as a structural track;
- derive canonical Title inset from that track;
- run a separate canonical geometry matrix;
- avoid changes to the generic table primitive.

### Risk 6: Test suite passes without real layout

Mitigation:

- prohibit class-string assertions as geometry acceptance criteria;
- require browser rectangle assertions for sticky changes;
- add the narrow browser geometry command to the completion gate;
- verify the installed desktop bundle, not only the dev server.

## 11. Rollback strategy

The refactor should be delivered in reviewable commits or patches by phase.

- Surface policy and geometry changes can land with compatibility adapters
  before the overlay migration.
- The sibling interaction layer must be guarded behind an internal surface
  capability until it passes the complete row-action matrix.
- Do not restore the inline selector column as a rollback.
- Do not restore `left-11`, padded scroll topology, or per-row controls as a
  silent fallback.
- If the new overlay has a blocking interaction failure, disable row-handle
  display while retaining correctly aligned Title geometry and preserve row
  operations through menus/keyboard until the overlay is repaired.
- No data migration is required; manual record order remains stored in the
  existing linked-view override.

## 12. Implementation checklist

Every item below has an explicit completion criterion.

### Geometry ownership

- [x] **GEO-001 — Add the surface-policy module.** Completion: inline and
  canonical selector/action/interaction values are exported from one pure
  module with unit coverage.
- [x] **GEO-002 — Extend `DatabaseTableGeometry`.** Completion: the model
  includes surface mode, structural tracks, fixed structural width, and numeric
  Title sticky inset.
- [x] **GEO-003 — Derive Title inset from structural tracks.** Completion:
  inline produces `0`; canonical produces the selector width; interaction rail
  changes do not change the result.
- [x] **GEO-004 — Remove duplicate geometry literals.** Completion: database
  production code contains no independent `left-11`, `-ml-11`, `pl-11`, or
  `2.75rem` geometry policy.
- [x] **GEO-005 — Remove stringly sticky helper.** Completion:
  `databaseTableStickyGeometry` and its literal-class tests no longer exist.
- [x] **GEO-006 — Share one geometry instance.** Completion: header, body, new
  row, and footer consume the geometry created by the runtime without
  recalculating it.

### Native interaction layer

- [x] **INT-001 — Characterize the existing editor handle.** Completion:
  current add/select/drag behavior, DOM, labels, placement, and cleanup have
  passing tests before extraction.
- [x] **INT-002 — Extract native handle creation.** Completion: editor and
  database code can create the same imperative handle chrome from one module.
- [x] **INT-003 — Extract shared positioning constants.** Completion: handle
  height, gap, and first-line alignment are defined once and used by both
  consumers.
- [x] **INT-004 — Add the database interaction layer.** Completion: one sibling
  overlay mounts per inline table and targets the active rendered row.
- [x] **INT-005 — Remove per-cell controls.** Completion: no row-control element
  is rendered inside a Title `<td>` and `leadingContent` is removed if unused.
- [x] **INT-006 — Preserve add behavior.** Completion: the add button focuses
  the new-page input for the active row without geometry change or remount.
- [x] **INT-007 — Preserve select behavior.** Completion: grip click selects the
  labelled page and announces the resulting selection state.
- [x] **INT-008 — Preserve drag reorder.** Completion: dragging reorders loaded
  pages, persists manual order, and does not issue an equivalent server read.
- [x] **INT-009 — Handle virtualization.** Completion: disconnected rows hide
  or retarget the overlay with no stale-record action.
- [x] **INT-010 — Clean up lifecycle resources.** Completion: unmount leaves no
  detached handle, event listener, observer, floating-ui updater, or timer.

### Scroll topology

- [x] **SCR-001 — Remove interaction padding from the scroll owner.**
  Completion: inline scroll-owner computed left padding and handle-specific
  negative margin are both zero.
- [x] **SCR-002 — Preserve one horizontal owner.** Completion: every table has
  exactly one `data-database-table-scroll-owner` and no parent horizontal
  scrollbar.
- [x] **SCR-003 — Preserve under-filled behavior.** Completion: filler absorbs
  remaining width and `scrollWidth` does not exceed `clientWidth` by more than
  one rounding pixel.
- [x] **SCR-004 — Preserve overflow behavior.** Completion: wide tables scroll
  to the complete final actions track without clipping.
- [x] **SCR-005 — Preserve scroll restoration.** Completion: saved horizontal
  position restores and clamps once without a feedback loop or remount.

### Cross-row alignment

- [x] **ROW-001 — Align header Title.** Completion: inline Title header left
  equals table left within one device pixel.
- [x] **ROW-002 — Align record Title cells.** Completion: every rendered record
  Title boundary equals the header boundary.
- [x] **ROW-003 — Align the new-page Title cell.** Completion: its input remains
  inside the Title track at all supported zoom levels.
- [x] **ROW-004 — Align calculation footer.** Completion: the footer Title
  boundary matches header/body when calculations are visible.
- [x] **ROW-005 — Preserve canonical alignment.** Completion: canonical Title
  begins immediately after the selector track with no overlap.

### Regression coverage

- [x] **TST-001 — Add a failing initial-boundary test.** Completion: the test
  fails on the current 44px displacement and passes only when Title and table
  starts align.
- [x] **TST-002 — Add next-property overlap coverage.** Completion: Title right
  and the first unpinned property left differ by at most one device pixel.
- [x] **TST-003 — Add new-page input containment.** Completion: the input's
  bounding box is fully contained in the Title track.
- [x] **TST-004 — Add handle-neutrality coverage.** Completion: showing/hiding
  the handle does not change table or column rectangles.
- [x] **TST-005 — Add scroll-position coverage.** Completion: start, middle, and
  end scroll states satisfy sticky and overlap invariants.
- [x] **TST-006 — Add viewport and zoom coverage.** Completion: required
  viewport/zoom matrix passes with at most one device-pixel rounding.
- [x] **TST-007 — Replace literal-class DOM assertions.** Completion: no DOM
  test treats a Tailwind spacing class as proof of correct geometry.
- [x] **TST-008 — Add the narrow browser gate.** Completion: one documented
  command runs the exact database geometry regression and is required by the
  delivery workflow.
- [x] **TST-009 — Verify accessibility structure.** Completion: inline Title is
  column 1, the overlay is not a grid column, and contextual controls are
  labelled.
- [x] **TST-010 — Verify mount continuity.** Completion: projection, reorder,
  focus, and scroll changes retain table and scroll-owner DOM identity.

### Delivery

- [x] **DEL-001 — Add a behavior changeset.** Completion: release notes describe
  aligned inline tables, external native row handles, and reliable horizontal
  scrolling without internal implementation jargon.
- [x] **DEL-002 — Run affected app tests.** Completion: geometry, table DOM,
  inline database, read-model, and editor handle tests pass with zero failures.
- [x] **DEL-003 — Run browser/visual/a11y tests.** Completion: the targeted
  geometry, visual matrix, and database accessibility suites pass.
- [x] **DEL-004 — Run desktop checks.** Completion:
  `bun run check:desktop:local` and `bun run check:desktop` pass.
- [ ] **DEL-005 — Run repository verification.** Completion: `bun run check`
  passes before PR readiness. **Exception:** this worktree retains unrelated
  repository-wide oxlint deprecation/style diagnostics, so the full check
  stops before the Turbo test phase; the affected package and desktop gates
  above are the release evidence for this RFC.
- [x] **DEL-006 — Rebuild and reinstall the app.** Completion: the installed
  `/Applications/SynapseNote.app` bundle is produced from the current
  worktree, launches successfully, and opens the target project.
- [x] **DEL-007 — Perform installed-app visual verification.** Completion: the
  README two-property tables show no left blank band, hover handles appear
  outside the grid, and wide tables scroll to the final track.
- [x] **DEL-008 — Record final evidence.** Completion: the RFC status and test
  matrix are updated with commands, results, and accepted installed-app
  screenshots without committing generated debug artifacts.

## 13. Definition of done

This RFC is complete only when:

1. inline Title cells use a zero structural sticky inset;
2. interaction-handle geometry is absent from table tracks and the scroll
   owner;
3. the database consumes the same native handle primitive as editor blocks;
4. one pure policy and one geometry object own all numeric table layout;
5. literal spacing classes are not accepted as geometry tests;
6. real-browser rectangle tests cover the original installed-app failure;
7. the narrow geometry gate participates in the delivery workflow;
8. the installed desktop app shows aligned Title/header/body/new-row/footer
   boundaries, an external native row handle, and complete horizontal scrolling;
9. no database table remount, read refetch, data migration, or canonical
   selector regression is introduced.
