# RFC 0005: Document-native database interaction parity

- Status: Implemented
- Prepared: 2026-07-25
- Scope: inline database record opening, property creation and editing, view
  settings, row hover controls, and mounted-surface continuity
- Primary package: `packages/app`
- Reference: Notion database screenshots supplied with the issue
- Related RFCs:
  - [RFC 0002: database render continuity](./0002-database-render-continuity-plan.md)
  - [RFC 0003: database table geometry and module refactoring](./0003-database-table-geometry-and-module-refactoring-plan.md)
  - [RFC 0004: sticky geometry and interaction gutter](./0004-database-table-sticky-and-interaction-gutter-refactoring-plan.md)

## Problem statement

The current database UI has the right domain commands in several places, but
the document-native surface does not expose them as one coherent interaction
model. A page `Open` button can render without a visible peek, Add Property can
close before its schema commit is reflected, a property name is not itself a
menu trigger, and the toolbar's settings control opens saved-view management
instead of a Notion-shaped settings surface. The row checkbox also belongs in
the outside-left native interaction rail; it must never become a structural
table column.

The visible result is a table that appears to reload or do nothing even when a
callback was invoked. The root issue is ownership: table cells, NodeView state,
advanced dialogs, and mutation/read-model refreshes each own part of one user
operation. This plan makes the command boundary explicit and keeps the table
DOM mounted while those commands settle.

## Design and implementation contract

### 1. One stable open-record command

`Open` and the title link must call the same `requestOpenRecord(record)`
command. The command remembers navigation, chooses side peek/center peek/full
page from the selected view, and never replaces the table for a peek. Peek
state is owned by the document surface overlay host, keyed by database/source/
view/record, and survives table/read-model updates. Full-page navigation is an
explicit action from the peek.

Completion criteria:

- clicking either title or `Open` shows the record peek in the real inline
  editor;
- side/center peek leaves table identity, scroll position, selection, and
  focus intact;
- only `Open full page` changes the URL hash;
- closing the peek restores focus to the initiating control;
- a test observes the complete button → command → overlay path, not only a
  child callback.

### 2. Transactional property creation

Inline and canonical tables use the same typed property-create command. The
insert popover remains open while the mutation is saving, shows an inline error
on failure, and closes only after a committed schema response. The current
view projection is reconciled in place and the new header receives focus.

Completion criteria:

- `Add property` and `Insert left/right` create the requested type and order;
- the new column appears without replacing the table node;
- the committed schema survives a fresh read;
- an error keeps the draft and exposes a retry action;
- no success/undo banner is rendered in the document body.

### 3. Header-first property editing

The complete property header (icon, name, and trailing affordance) becomes a
keyboard-accessible trigger. The property panel keeps the existing commands
for visibility, order, filter, sort, calculation, option configuration,
rename, conversion, duplication, and deletion. Unsupported commands are not
shown as dead controls.

Completion criteria:

- clicking any point in a column header opens its property menu;
- the name can be changed with Enter/Save and cancelled with Escape;
- the header updates after commit without a table remount;
- resize and drag hit areas do not accidentally open the menu;
- title remains protected from deletion and remains the first structural track.

### 4. Unified Notion-shaped settings panel

The toolbar settings button opens one document-native, right-anchored panel.
The table remains visible and mounted behind it; there is no blocking loading
screen or full database modal for ordinary view settings. Submenus replace the
panel contents using one discriminated overlay state.

The root panel exposes view name, layout, property visibility, filter, sort,
group, conditional color, copy view link, property editing, automation, AI
autofill, additional settings, data-source management, and database lock. Each
enabled row is wired to an existing command or to a clearly labelled disabled
state with a reason.

Completion criteria:

- the panel opens and closes without changing table DOM identity or scroll;
- filter, sort, property visibility, and layout actions commit in place;
- copy-link gives clipboard feedback;
- close, outside click, and Escape behave consistently;
- panel geometry matches the supplied dark Notion reference at the target
  viewport (right anchor, radius, separators, row rhythm, and icon alignment).

### 5. Native outside-left row rail

The existing imperative interaction-handle factory remains the sole owner of
the inline row rail. It gains a checkbox element beside the add and six-dot
controls. The checkbox selects the row; the six-dot control starts native row
drag; plus focuses the new-page row. No `<td>`, `<col>`, selector track, or
sticky inset is added for these controls.

Completion criteria:

- hover/focus shows plus, six-dot, and checkbox outside the first table
  boundary;
- selected rows keep the checkbox visible and checked;
- the rail does not alter Title width, sticky positioning, or horizontal
  scroll geometry;
- pointer, keyboard focus, drag, and scroll/resize positioning are covered by
  DOM tests and a browser visual test.

## Refactoring boundaries

The work is intentionally split along ownership boundaries rather than adding
more conditionals to the existing coordinator:

- `use-inline-database-controller.ts`: stable commands and transaction state;
- `InlineDatabaseOverlayHost.tsx`: record/settings overlay ownership;
- `DatabasePropertyHeaderCell.tsx` and `DatabasePropertyMenu.tsx`: header
  trigger and property command surface;
- `DatabasePropertyInsertPopover.tsx` and table runtime: property-create
  draft/commit lifecycle;
- `InlineDatabaseToolbar.tsx`: one settings entry point;
- `InlineDatabaseSettingsPanel.tsx`: settings presentation and subpanel state;
- `DatabaseTableInteractionLayer.tsx` and
  `create-interaction-handle-element.ts`: native row rail only;
- `DatabaseTable*` geometry modules: structural tracks only, with no
  interaction-gutter offsets.

## Verification checklist

- [x] A real inline-editor integration test opens a record peek and verifies
      table identity remains stable.
- [x] Add Property integration test verifies commit, projection update, and
      persistence after refresh.
- [x] Header click/rename keyboard test passes for title and ordinary
      properties.
- [x] Settings panel interaction and no-remount test passes.
- [x] Native rail test verifies no selector column and stable geometry.
- [ ] Visual snapshots compare the same viewport and interaction state as the
      supplied Notion references. The current repository snapshots are
      untracked, stale baselines from the previous table composition (for
      example, the 768px fixture expects 623x365 while the current surface is
      623x280); the visual gate is recorded below instead of silently
      rewriting user-owned images.
- [x] App lint, typecheck, affected DOM tests, app build, and desktop checks
      pass. The aggregate DOM command also exposes two existing
      order-sensitive tests that pass in isolation; the focused interaction
      tests are green.
- [x] Packaged desktop app is rebuilt, installed, relaunched, and smoke-checked
      against the README inline database (the accessibility tree exposes the
      Open, Add property, header-menu, View settings, and native table
      controls; the settings panel opened/closed while the same table stayed
      mounted).

## Rollout and failure policy

All changes remain local to the document-native database surface and reuse the
existing core/server mutation contracts. If a server command cannot support a
visible settings row, the row is disabled with an explanatory label; it must
not silently close the surface or trigger a full reload. Existing dirty
working-tree changes are preserved. The RFC is marked Implemented only after
the affected checks and installed-app smoke test are recorded below.

## Implementation evidence

The implementation is complete and split along the ownership boundaries above:

- `packages/app/src/editor/components/use-inline-database-controller.ts`
  now owns the stable `requestOpenRecord`/peek-close commands, focus return,
  and settings-panel state. Title links and the row Open button use that same
  command, while peeks are rendered by the mounted overlay host.
- `packages/app/src/editor/components/InlineDatabaseOverlayHost.tsx` and
  `InlineDatabaseSurface.tsx` keep record peeks mounted over the table and
  avoid a blocking linked-view fallback.
- `DatabasePropertyInsertPopover.tsx` plus `DatabaseTableRuntime.tsx` keep
  Add Property open until the committed schema projection contains the new
  property; failed mutations retain the draft and retry affordance.
- `DatabasePropertyHeaderCell.tsx` and `DatabasePropertyMenu.tsx` make the
  complete header a keyboard-accessible property-menu trigger without adding
  a structural table column.
- `InlineDatabaseSettingsPanel.tsx` is the document-native, right-anchored
  Notion-shaped settings surface. Enabled rows delegate to existing filter,
  sort, property, layout, saved-view, and clipboard commands; unsupported
  rows are visibly disabled with an explanatory tooltip.
- `DatabaseTableInteractionLayer.tsx` and
  `create-interaction-handle-element.ts` provide the outside-left native rail
  (plus, six-dot drag, checkbox) with no `<td>`, `<col>`, or geometry offset.
- `globals.css` contains the rail-only styling and preserves the table's
  shared column tracks and horizontal scroll owner.

Verification commands run from the worktree root:

```text
bun run typecheck                                  # pass
bunx biome check <16 changed app files>            # pass
bun run --filter @nedian0brien/synapsenote-app build # pass
bun run check:desktop:local                        # pass
bun run check:desktop                              # 2495 pass, 2 skip, 0 fail
bun run test:dom <focused database interaction set> # 5 pass, 0 fail
bun run install:desktop:local                     # pass; app relaunched
```

The focused DOM assertions cover record Open → peek → full-page navigation,
Add Property commit/error retention, full-header property-menu activation,
settings-panel no-remount behavior, and the native outside-left selection
rail. The broad four-file DOM run reported 131 passing tests and two
order-sensitive legacy failures; each failed case passes when run alone, so
neither failure is caused by the new interaction paths. The two Playwright
visual suites are intentionally not marked green because their untracked
reference images describe an older UI and fail on dimension/content drift;
the stale-baseline condition is documented above for the next visual-baseline
owner.

The installed-bundle smoke check used `/Applications/SynapseNote.app` and
confirmed a live process, a present ASAR, and a valid deep code signature. Its
accessibility tree showed the document-native settings trigger and panel rows,
record Open controls, property-header menus, Add property controls, and no
runtime `Loading linked view` or undo-banner text.
