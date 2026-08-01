# Module Responsibility Separation Delivery Plan

**Status:** Proposed; this document authorizes planning, not implementation.
**Prepared:** 2026-08-01
**Predecessor:** `docs/rfcs/0011-post-v2-refactoring-plan.md`

**User-visible outcome:** SynapseNote keeps its current behavior while the largest application,
server, and desktop coordinators become small composition surfaces backed by responsibility-owned,
independently tested modules. A contributor can find one owner for a state transition or transport
boundary without reading a multi-thousand-line file.

**First slice:** Replace the literal NUL byte in `packages/server/src/api-extension.ts` with an
escaped representation, prove byte-equivalent cache keys, and restore full-file search and Biome
visibility. This is the smallest end-to-end result and must ship before structural extraction.

**Deliberately deferred:** Performance optimization, public API or storage changes, database schema
version changes, removal of defensive runtime guards, bulk Markdown AST cast cleanup, Electron
structural-cast cleanup, `packages/core/src/index.ts` barrel redesign, and splitting declaration-only
schema files solely to reduce line counts.

**Verification:** Every milestone uses its focused tests, package typecheck, changed-file Biome, and
one runnable smoke surface. Repository-wide gates are reserved for the final integration milestone.

## 1. Baseline and non-negotiable rules

| Area | Current module | Physical lines | Dominant mixed responsibilities |
| --- | --- | ---: | --- |
| Server facade | `packages/server/src/api-extension.ts` | 18,228 | HTTP dispatch, upload, rename, search, content operations |
| Desktop main | `packages/desktop/src/main/index.ts` | 5,852 | boot, windows, menus, IPC registration, integrations |
| Server planning | `packages/server/src/database-plan.ts` | 5,779 | schemas, normalization, validation, planning engine |
| Server API | `packages/server/src/database-data-plane-api.ts` | 5,559 | wire schemas, error mapping, HTTP handlers |
| Server data plane | `packages/server/src/database-data-plane.ts` | 5,237 | query, retrieval, mutation, forms, sharing |
| App file tree | `packages/app/src/components/FileTree.tsx` | 4,549 | render, virtualization, mutations, DnD, lazy traversal |
| Editor provider pool | `packages/app/src/editor/provider-pool.ts` | 2,860 | lifecycle, persistence, replay, observer ownership |
| Saved-view settings | `DatabaseSavedViewSettingsDialogRuntime.tsx` | 1,916 | draft state, all layout editors, validation, rendering |
| Document context | `packages/app/src/editor/DocumentContext.tsx` | 1,973 | provider composition and several state domains |
| Command palette | `packages/app/src/components/CommandPalette.tsx` | 1,934 | indexing, commands, keyboard state, rendering |
| JSX NodeView | `packages/app/src/editor/extensions/JsxComponentView.tsx` | 1,599 | lifecycle, parsing, interaction, rendering |
| Settings body | `packages/app/src/components/settings/SettingsDialogBody.tsx` | 1,538 | section registry, state, validation, rendering |
| Editor cache | `packages/app/src/editor/editor-cache.ts` | 1,425 | cache policy, mount lifecycle, eviction, replay |
| Editor area | `packages/app/src/components/EditorArea.tsx` | 1,350 | editor layout, conflict, asset, share, overlay composition |
| Editor tabs | `packages/app/src/components/EditorTabs.tsx` | 1,293 | tab state, DnD, keyboard, rendering |
| Workspace controller | `use-database-workspace-controller-runtime.ts` | 1,257 | read state, overlays, commands, render context |

Rules for every extraction:

- [ ] Preserve runtime behavior, persisted bytes, public exports, route/channel names, and error shapes.
- [ ] Add or identify a behavior-defining test before moving production code.
- [ ] Move one cohesive responsibility per commit; do not mix extraction with cleanup or redesign.
- [ ] Do not create a replacement `*Runtime`, `manager`, `utils`, or `helpers` megamodule.
- [ ] Give every new module one owner sentence and a near-current size budget.
- [ ] Keep facades declarative: imports, hook/service composition, and returned/rendered surface only.
- [ ] Lower the source monolith's size budget in the same commit as each extraction.
- [ ] Keep dependency direction one-way; leaf modules may receive callbacks but may not import their
      former controller/facade.
- [ ] Run only focused checks during a milestone and stop once changed behavior is covered.
- [ ] Require one review at the end of each package wave, not after every extraction commit.
- [ ] Add a changeset only if an extraction causes an intentional user-visible behavior change.

## 2. Target dependency shape

```text
facade / route / hook
  -> responsibility coordinator
       -> pure policy and state-transition modules
       -> narrow transport or platform adapters

Forbidden:
leaf -> facade
app domain -> server transport implementation
generic UI -> database or file-tree controller
desktop IPC handler -> renderer-owned state
```

The implementation order is fixed because later waves depend on trustworthy static analysis and
typed app boundaries:

1. static-analysis visibility;
2. database app runtimes;
3. FileTree and remaining RFC 0002 app exceptions;
4. editor provider/cache ownership;
5. server facade slices;
6. desktop IPC registrars;
7. database server layers;
8. final integration and documentation.

## 3. Milestone 1 — Runnable static-analysis slice

### Scope

`packages/server/src/api-extension.ts:16448` contains a literal NUL byte inside the workspace search
cache key. Runtime code intends a NUL separator, but the source byte makes `rg` stop at that point and
causes Biome to misclassify imports used later in the file.

### Checklist

- [x] Add `api-extension-source-hygiene.test.ts`; first run must fail because the production source
      contains a literal NUL byte, then retain it as a regression guard.
- [x] Extract a pure `createWorkspaceSearchCacheKey` helper and test that its runtime separator is
      exactly one U+0000 character and cannot collide across content/project pairs.
- [x] Replace the literal byte with `\0` or `\u0000` source text without changing the runtime value.
- [x] Confirm `rg` scans through the end of `api-extension.ts` without a binary-file warning.
- [x] Confirm Biome no longer reports the extraction-related false-positive unused `relative` import.
- [x] Register the new test exactly once in the server manifest and run search/API focused tests.
- [x] Run server typecheck and changed-file Biome.
- [x] Deliver the running web editor and record the exact URL before starting Milestone 2
      (`http://localhost:5174/`, HTTP 200 on 2026-08-01).

### Verification

```bash
bun test packages/server/src/api-extension-source-hygiene.test.ts
bun test packages/server/src/api-search.test.ts packages/server/src/api-search-semantic.test.ts
bun run --filter @nedian0brien/synapsenote-server test:manifest
bun run --filter @nedian0brien/synapsenote-server typecheck
bunx biome check packages/server/src/api-extension.ts
```

Completion: source and runtime cache-key bytes are equivalent, static-analysis tools see the entire
file, focused tests pass, and there is no structural extraction in this commit.

## 4. Milestone 2 — Remove database app replacement megamodules

### 2A. Saved-view settings ownership

Target files:

- `packages/app/src/components/database-saved-view-settings/DatabaseSavedViewSettingsDialogRuntime.tsx`
- `DatabaseSavedViewSettingsCommonPanel.tsx`
- `DatabaseSavedViewSettingsLayoutPanel.tsx`
- `database-saved-view-settings-draft.ts`
- `database-saved-view-settings-utils.ts`

Target boundaries:

- draft creation/reconciliation;
- query, projection, and common display settings;
- layout-family panels: table/list/gallery, board/timeline/calendar, chart/dashboard, form/map/feed;
- validation and desired-state compilation;
- dialog composition.

Checklist:

- [x] Characterize save, cancel, layout switching, and draft-reset behavior in the existing DOM test.
- [x] Move draft initialization/reconciliation into a pure, tested module.
- [x] Move validation and desired-state compilation into a pure, tested module.
- [x] Extract layout-family panels with narrow typed props and no controller imports.
- [x] Make `DatabaseSavedViewSettingsLayoutPanel.tsx` a real dispatcher, not a pass-through facade.
- [x] Remove `DatabaseSavedViewSettingsDialogRuntime.tsx` after the facade composes the real panels.
- [x] Register each new module in `MODULE_SIZE_BUDGETS`; normal leaf ceiling is 350 lines.
- [x] Keep `DatabaseSavedViewSettingsDialog.tsx` at or below its existing 80-line budget.

Verification:

```bash
cd packages/app
bun run test:dom src/components/DatabaseSavedViewSettingsDialog.dom.test.tsx
bun run typecheck
bunx biome check src/components/database-saved-view-settings/ src/components/DatabaseSavedViewSettingsDialog.tsx
```

### 2B. Workspace controller ownership

Target boundaries:

- source/catalog/read lifecycle;
- selected-view and route reconciliation;
- dialog/overlay state;
- command-context construction for the five typed command hooks;
- render-context construction;
- top-level hook composition.

Checklist:

- [x] Add focused contract tests for selected-view restoration and render-context production.
- [x] Extract read and projection lifecycle without moving mutation behavior.
- [x] Extract overlay/dialog state without importing command hooks.
- [x] Extract the five command input builders as typed factories or narrow hooks.
- [x] Extract render-context construction using the already-derived Phase 2 type.
- [x] Remove `use-database-workspace-controller-runtime.ts`.
- [x] Keep `use-database-workspace-controller.ts` at or below 300 lines.
- [x] Preserve `typeof refreshNow === 'function'` exactly.
- [x] Prove database table DOM identity and route/hash behavior remain unchanged.

Verification:

```bash
cd packages/app
bun run test:file -- src/components/database-table/database-workspace-contract.test.ts
bun run test:dom src/components/DatabaseTableDialog.dom.test.tsx
bun run typecheck
bunx biome check src/components/use-database-workspace-* src/components/DatabaseWorkspace*
```

Milestone 2 completion: both `*Runtime` files are gone, no replacement file exceeds 450 lines, and
the database workspace remains runnable with the same route, mutation, and saved-view behavior.

## 5. Milestone 3 — FileTree and RFC 0002 app exceptions

### 3A. FileTree vertical slices

Target boundaries:

- `useFileTreeShowAll`: lazy depth-one traversal, truncation, reconnect, refresh supersession;
- `useFileTreeMutations`: create, rename, duplicate, trash, optimistic cleanup;
- `useFileTreeSelection`: selection mirror, focus, keyboard navigation;
- `useFileTreeDragAndDrop`: internal move and external file-drop state;
- `FileTreeViewport`: virtualized render only;
- `FileTreeMenu`: menu presentation and callback dispatch only.

Checklist:

- [ ] Pin existing lazy-show-all, mutation, selection, and drag/drop behavior before extraction.
- [ ] Extract show-all state first and run only the show-all DOM tests.
- [ ] Extract mutation state second and run create/duplicate tests.
- [ ] Extract selection state third and run selection-mirror tests.
- [ ] Extract drag/drop state fourth with a focused external-drop test.
- [ ] Move virtualized row rendering into `FileTreeViewport` without recalculating state there.
- [ ] Reduce `FileTree.tsx` to composition and imperative-handle wiring, target 400 lines or fewer.
- [ ] Replace the RFC 0002 legacy exception with budgets for the final modules.

Verification:

```bash
cd packages/app
bun run test:dom src/components/FileTree.showall-lazy.dom.test.tsx
bun run test:dom src/components/FileTree.showall-lifecycle.dom.test.tsx
bun run test:dom src/components/FileTree.create.dom.test.tsx
bun run test:dom src/components/FileTree.duplicate.dom.test.tsx
bun run test:dom src/components/FileTree.selection-mirror.dom.test.tsx
bun run typecheck
```

### 3B. Remaining RFC 0002 exceptions

Each row is an independent extraction and commit series. Do not run them in parallel when they edit
shared app shell state.

| Legacy module | Required owner boundaries | Focused evidence |
| --- | --- | --- |
| `editor/DocumentContext.tsx` | navigation, tabs, panels, collaboration, provider composition | existing document-context tests + typecheck |
| `components/CommandPalette.tsx` | query/index, command registry, keyboard state, result rendering | command-palette tests |
| `editor/extensions/JsxComponentView.tsx` | NodeView lifecycle, attribute policy, interaction, render | JSX component-view tests |
| `components/settings/SettingsDialogBody.tsx` | registry, per-section panels, validation, shell | settings DOM tests |
| `components/EditorArea.tsx` | editor shell, conflict surface, asset/share receive, overlays | directly affected EditorArea DOM tests |
| `components/EditorTabs.tsx` | tab model, DnD, keyboard commands, strip rendering | EditorTabs DOM tests |

Checklist for every row:

- [ ] Name one state owner and one render owner before editing.
- [ ] Add the target modules and their budgets before removing the exception.
- [ ] Move state transitions before JSX presentation.
- [ ] Keep extracted leaves free of imports from the original facade.
- [ ] Run the directly affected test file and app typecheck.
- [ ] Remove the corresponding `LEGACY_MODULE_EXCEPTIONS` entry.

Milestone 3 completion: `LEGACY_MODULE_EXCEPTIONS` is empty and its guard test is changed to require
an empty list, preventing new indefinite exceptions.

## 6. Milestone 4 — Editor provider and cache ownership

These modules are stateful and order-sensitive. Split them only after app shell exceptions are gone,
so failures have fewer possible owners.

Target boundaries:

- provider entry state machine and discriminated states;
- persistence adapter lifecycle;
- replay and revision handling;
- observer installation/accounting;
- pool eviction/recycling;
- editor mount cache and DOM container lifecycle.

Checklist:

- [ ] Add state-machine characterization tests for attach, teardown, replay, and eviction.
- [ ] Extract pure transition functions before extracting side effects.
- [ ] Extract persistence and observer adapters with explicit disposal contracts.
- [ ] Keep `ProviderPool` as the orchestration class; target 600 lines or fewer.
- [ ] Split editor-cache policy from DOM mount ownership; each target 450 lines or fewer.
- [ ] Preserve provider object identity, teardown ordering, and stored lineage behavior.
- [ ] Add budgets and dependency tests preventing cache/provider cycles.

Verification:

```bash
cd packages/app
bun run test:file -- src/editor/provider-pool.attach-boundary.test.ts
bun run test:file -- src/editor/provider-pool.test.ts
bun run test:file -- src/editor/editor-cache.test.ts
bun run typecheck
```

## 7. Milestone 5 — Continue server facade extraction

Never refactor all of `api-extension.ts` at once. Each subsection is a pure-move milestone with its
own tests and a lowered exact budget.

### 5A. Upload and asset ingestion

Target: upload destination resolution, streaming body, duplicate hashing, filename safety, and upload
result construction. The HTTP route retains request parsing and response dispatch.

- [ ] Add/confirm unit coverage for destination, collision, streaming, and error mapping.
- [ ] Extract to `content-upload-service.ts` and narrow policy modules where useful.
- [ ] Preserve path containment, size caps, temp-file cleanup, and response schemas.
- [ ] Re-export only compatibility symbols used outside the facade.
- [ ] Lower the exact `api-extension.ts` budget and register new modules.

Verification:

```bash
bun test packages/server/src/api-extension.test.ts
bun test packages/server/src/resolve-upload-dest-dir.test.ts
bun test packages/server/src/upload-streaming.test.ts packages/server/src/upload-errors.test.ts
bun run --filter @nedian0brien/synapsenote-server typecheck
```

### 5B. Managed rename orchestration

Target: path validation, copy collection, journal/rewrite planning, Git-aware rename, rollback summary,
and telemetry inputs. Route parsing and HTTP response ownership remain in the facade.

- [ ] Freeze symlink, traversal, case-only rename, race, crash, and rollback behavior.
- [ ] Extract pure path/name policy before filesystem orchestration.
- [ ] Extract the managed rename coordinator with injected filesystem/Git collaborators.
- [ ] Preserve journal ordering and compensation behavior byte-for-byte.
- [ ] Run one security-focused review because this slice can move or overwrite user files.
- [ ] Lower the exact facade budget and prove `+1` line still fails the guard.

Verification:

```bash
bun test packages/server/src/managed-rename*.test.ts
bun test packages/server/src/apply-managed-rename.test.ts
bun test packages/server/src/api-rename-*.test.ts
bun test packages/server/src/api-folder-rename-disk-enum.test.ts
bun run --filter @nedian0brien/synapsenote-server typecheck
```

Milestone 5 completion: both cohesive services are outside the HTTP facade, facade behavior remains
route-oriented, and the server budget is monotonically lower than 18,229 split lines.

## 8. Milestone 6 — Desktop IPC registrar boundaries

`registerIpcHandlers()` is split by trust boundary, not merely by channel prefix.

Target registrars:

- terminal and PTY lifecycle;
- asset open/reveal and native context menu;
- project, recent, worktree, and create-new-project;
- application state/theme/menu;
- bug report and local operations;
- integrations and settings.

Each registrar receives an explicit dependency object containing only main-process capabilities it
needs. It must not import renderer state or create hidden process-wide singletons.

Checklist:

- [ ] Add a registry test that asserts every canonical IPC channel is registered exactly once.
- [ ] Extract one registrar per commit, starting with terminal and asset handlers with existing tests.
- [ ] Validate untrusted payloads at each registrar boundary.
- [ ] Preserve caller-window and project-scope derivation in main, never from renderer input.
- [ ] Keep destructive filesystem handlers behind existing containment/membership checks.
- [ ] Reduce `registerIpcHandlers()` to registrar composition, target 150 lines or fewer.
- [ ] Reduce `main/index.ts` below 4,000 lines without moving boot orchestration wholesale.
- [ ] Add desktop module budgets and dependency-direction tests.

Verification:

```bash
bun test packages/desktop/tests/main/terminal-*.test.ts
bun test packages/desktop/tests/main/asset-*.test.ts
bun test packages/desktop/tests/main/ipc-handlers.test.ts
bun test packages/desktop/tests/integration/ipc-channel-count-ratchet.test.ts
bun test packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts
bun run --filter @nedian0brien/synapsenote-desktop typecheck
bun run check:desktop
```

## 9. Milestone 7 — Database server layer ownership

This is the last wave because it has the broadest contract surface. No schema, storage, or response
shape changes are allowed.

### 7A. Wire schemas versus HTTP handlers

- [ ] Move request/response Zod schemas and inferred public types from
      `database-data-plane-api.ts` into operation-family contract modules.
- [ ] Keep one immutable `DATABASE_API_SCHEMAS` registry with schema version 1.
- [ ] Move error-to-response mapping into a shared API problem responder.
- [ ] Split handler creation by catalog/query, mutation/commit, task/migration, and
      permission/share/autonomy families.
- [ ] Keep `createDatabaseDataPlaneApiHandlers` as composition only, target 250 lines.
- [ ] Register exact size budgets for contracts and handler families.

### 7B. Planning schemas versus planning engine

- [ ] Extract desired-state draft schemas and public plan artifact types.
- [ ] Extract normalization and convergence policy as pure functions.
- [ ] Extract write-guard and conflict compilation.
- [ ] Keep `DatabasePlanEngine` responsible only for orchestration and dependency calls.
- [ ] Preserve plan hashes, approval codes, diff ordering, and diagnostics exactly.

### 7C. Data-plane service domains

- [ ] Extract catalog/describe/read projection.
- [ ] Extract query/filter/retrieval and explain-trace production.
- [ ] Extract form submission and external capability policy.
- [ ] Extract public sharing and permission projection.
- [ ] Extract Markdown-table mutation/export adapters.
- [ ] Keep `DatabaseDataPlane` as dependency composition or replace it with explicit domain ports;
      do not create another all-purpose service object.

Verification:

```bash
bun test packages/server/src/database-api-schema.test.ts
bun test packages/server/src/database-plan.test.ts
bun test packages/server/src/database-data-plane.test.ts
bun test packages/server/src/database-data-plane-api.test.ts
bun run --filter @nedian0brien/synapsenote-server typecheck
bun run --filter @nedian0brien/synapsenote-server test:manifest
```

Milestone 7 completion: schema version remains 1, public response bytes and plan hashes are stable,
the three original monolith budgets are materially lower, and each operation family has one contract
owner and one implementation owner.

## 10. Final integration checklist

Run these only after all approved milestones are implemented. Counts may legitimately increase as
new tests are added; zero failures and exit code are authoritative.

- [ ] `rg` and Biome scan all changed source files without binary-file truncation.
- [ ] `MODULE_SIZE_BUDGETS` covers every new app module and all entries are green.
- [ ] `LEGACY_MODULE_EXCEPTIONS` is empty and guarded as empty.
- [ ] `SERVER_MODULE_SIZE_BUDGETS` contains exact, monotonically reduced ceilings.
- [ ] Desktop has an equivalent module-size/dependency guard.
- [ ] No production `*Runtime` replacement megamodule was introduced.
- [ ] No leaf imports its former facade/controller.
- [ ] No route name, IPC channel, schema version, plan hash, storage version, or error envelope changed.
- [ ] `typeof refreshNow === 'function'` remains in the mutation command path.
- [ ] Core focused/affected tests pass with zero failures.
- [ ] App non-DOM and DOM affected suites pass with zero failures.
- [ ] Server database, API, upload, rename, and manifest checks pass with zero failures.
- [ ] Desktop affected tests and `check:desktop` pass with zero failures.
- [ ] `bun run typecheck` succeeds for all packages.
- [ ] Biome reports zero errors for the complete change set; pre-existing unrelated repository
      diagnostics are recorded separately rather than silently expanded into this plan.
- [ ] One final Sol integration review reports no blocking ownership, security, or contract defects.
- [ ] Behavior-neutral milestones have no changeset; any intentional behavior change has a focused
      changeset and separate user approval.
- [ ] Branch is pushed and the web editor is launched from the task worktree for user verification.
- [ ] Worktree and branch remain recoverable until the user explicitly approves merge and cleanup.

## 11. Review and commit policy

- Commit naming: `refactor(<package>): extract <responsibility>`; guards/tests use separate focused
  commits when they are independently useful.
- A pure-move commit must be reviewable with `git show --stat` and a whitespace-insensitive diff.
- Review once after each package wave: app, server facade, desktop, database server. Security-sensitive
  rename and destructive IPC work may receive an additional focused review.
- Batch all blocking findings from a review into at most one fix dispatch and close them with focused
  controller verification. Do not run an open-ended reviewer loop.
- If one extraction turn cannot produce a green runnable artifact, stop and shrink that boundary;
  never compensate by moving the remainder into a replacement megamodule.

## 12. Backlog explicitly outside completion

- `packages/core/src/index.ts` barrel decomposition without a demonstrated ownership problem.
- `packages/core/src/database/schema.ts` splitting solely because declarations are long.
- Bulk removal of `as unknown as` in Markdown AST and Electron structural boundaries.
- Test-file splitting solely for line counts; split tests only when fixture ownership or feedback time
  materially improves.
- Performance work without a new measured regression and an approved performance RFC.
- Repository-wide formatting cleanup unrelated to touched modules.
