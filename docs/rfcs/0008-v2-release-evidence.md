# RFC 0008 v1→v2 release evidence

- 기준일: 2026-07-27
- 상태: implementation evidence / release candidate 아님
- 대상: [canonical storage RFC](./0008-markdown-table-canonical-database-storage.md), [implementation checklist](./0008-markdown-table-database-storage-implementation-checklist.md)

이 문서는 체크리스트의 checkbox를 대신하지 않는다. 현재 브랜치에서 실제로 연결된
production path와 focused 검증을 기록하고, 아직 release gate가 아닌 항목을 명시한다.
모든 결과는 fixture가 만든 임시 workspace에서 실행했으며 사용자 문서나 private path를
증거에 포함하지 않는다.

## 1. 현재 단계와 결정

현재 구현은 `v1 read + v2 explicit writer/migration` 단계다.

| 판정 | 의미 | 현재 결정 |
| --- | --- | --- |
| 완료된 foundation | shared core 계약과 해당 server/app path가 연결되고 focused test가 있음 | A-001/002/004/005/006/008/009, B-001~008, C-001~003/005/006, D-001/002/004/008~010, E-001~005/007/008, F-001/002/003~006/008, G-001~003/005, H-001~006/008/009, I-001~010/012, J-001~003/008, L-002/L-005 |
| 구현됐지만 release evidence 부족 | 코드와 단위/통합 검증은 있으나 failure-injection, all-surface, UI 또는 standalone 증거가 부족함 | A-003/007, B-009, C-004/007/008, D-003/005/006/007, E-006, F-007/009, G-004/006/007, H-007/010, I-011, J-004/007/009, L-003/004 |
| 아직 구현하지 않음 | 외부 운영·desktop parity·pilot·retirement처럼 이 브랜치만으로 증명할 수 없는 단계 | J-005/006/010, K-003/009, L-006~012 |

따라서 이 브랜치에서 v2를 새 database의 기본 writer로 전환하거나 v1 writer를
제거하지 않는다. 새 default 전환은 M0–M4와 아래 blocked gate가 모두 닫힌 뒤 별도
release decision으로 수행한다.

## 2. 영역별 완료 기준과 현재 증거

| 영역 | 구체적인 완료 기준 | 이번 evidence | 남은 증거/차단 조건 |
| --- | --- | --- | --- |
| A 계약/스키마 | manifest/marker/lifecycle/revision/capability를 Node와 browser가 동일하게 parse하고 unknown version을 fail-closed | strict schema, lifecycle metadata, capability matrix, title/revision schema가 core/server/API에 연결됨 | A-003 title UI contract와 A-007 cross-surface revision equality |
| B parser/codec | 지원 type의 parse→typed→canonical serialize→parse, invalid raw 보존, malformed/limit 입력의 bounded 실패 | 20개 table/parser/codec assertion, 770개 fuzz assertion, owner/cell/JSON limit fixtures | invalid UTF-8/timeout/OOM을 포함한 dedicated process fuzz |
| C identity/ownership | path/title/alias/move/copy 후 stable identity, duplicate/ambiguous owner를 차단, repair는 preview/approval/undo | document ID reassignment, owner clone, link rewrite, identity repair planning 테스트 | UI choice와 server repair commit/undo, full relation-wide move matrix |
| D mutation/transaction | expected revision + journal + post-write verification + compensation/undo, partial success 금지 | writer가 post-write hash를 다시 읽고 journal checkpoint를 뒤로 미룸; record-index mutation suite; migration activation hook과 독립 child process가 injected failure 뒤 rollback | 일반 mutation의 process-kill/disk-full/intervening-edit matrix와 user-facing redo |
| E read/index/query/export | cache/task DB 없이 owner+manifest+documents만으로 cold rebuild하고 query/search/export snapshot을 재구축 | cold/incremental index, v1/v2 differential query/search provenance, canonical/computed export contract와 HTTP export boundary | generic document/database projection deduplication |
| F Formula/Rollup | pure deterministic evaluator, permission-aware error, dependency/derived revision, migration equivalence | core/server conformance, dependency DAG/reverse index, logical migration equivalence helper | all-surface derived revision equality와 frozen v1/v2 Formula/Rollup corpus |
| G 협업/offline | stable cell key로 different-cell 자동 병합, same-cell/delete-vs-edit는 conflict/recovery-required | semantic diff/merge와 CRDT key/conflict classifier, app queue reconciliation이 canonical record를 fetch해 stable-ID rebase/convergence 후에만 execute | 실제 Yjs/ProseMirror transaction, Git branch recovery, actor history integration |
| H migration plan | write 없이 complete inventory, dependency closure, owner/title 선택, exact plan hash 생성 | owner selection/closure/preflight, explicit title keep/use/custom, task/API/MCP plan binding, frozen derived baseline binding | relation target mapping·Formula/Rollup value/error differential, cross-database relation fixture matrix와 모든 property/limit fixture |
| I migration recovery | verified backup→staging→activation→cold verify→undo→retention cleanup을 durable checkpoint로 재개 | journal cleanup boundary, retention-aware inspect/rollback/cleanup, migration logical equivalence, independent SIGKILL every staging/activation file, post-commit cold rebuild, byte-exact undo/conflict | deferred cleanup rehearsal, disk-full/permission-loss matrix |
| J product/API/UX | web/desktop/server/MCP/CLI가 동일 operation/plan hash/revision/error와 recovery state를 노출 | API/MCP task schemas에 inspect/cleanup, canonical/computed export endpoint, app offline rebase, CLI inspect/cleanup registration | migration preview/progress accessibility, desktop parity, diagnostics repair commit |
| K 성능/보안/신뢰성 | supported-max의 수치 budget, max+1 거부, path/permission/telemetry noninterference, soak 결과 | deterministic 1k–1m corpus, 50k resource bound, parser fuzz, telemetry/path/permission tests | p50/p95/peak-memory report와 반복 soak |
| L conformance/release | core conformance, differential/round-trip/crash/standalone, public docs/runbook, pilot/new-default/retirement decision | core Formula/query conformance, server v1/v2 differential, standalone clone, export and process-crash fixtures, this evidence doc, changesets | full round-trip fixture matrix, public docs/runbook rehearsal, pilot and retirement records |

영역을 완료로 올리려면 해당 행의 첫 번째 기준뿐 아니라 마지막 열의 failure/operational
evidence까지 repository artifact로 남겨야 한다.

## 3. 실행 증거

### 3.1 Core, identity, parser, and derived

| Fixture ID | 명령 | 결과 |
| --- | --- | --- |
| `MT-TITLE-001` | `bun run test:file -- packages/core/src/database/markdown-table-document.test.ts` | 3 pass / 11 assertions; frontmatter/H1/basename title contract |
| `MT-ID-001` | `bun run test:file -- packages/core/src/database/document-identity.test.ts` | 7 pass / 22 assertions; copy/paste reassignment and malformed refusal |
| `MT-OWNER-001` | `bun run test:file -- packages/core/src/database/markdown-table.test.ts` | 20 pass / 79 assertions; marker, source ranges, clone, move link rewrite, codecs, semantic merge |
| `MT-FUZZ-001` | `bun run test:file -- packages/core/src/database/markdown-table-fuzz.test.ts` | 3 pass / 770 assertions; malformed marker/table and owner/cell size bounds |
| `MT-REV-001` | `bun run test:file -- packages/core/src/database/markdown-table-revision.test.ts` | 4 pass / 20 assertions; owner/table/row/cell/document semantic scopes and prose independence |
| `MT-REPAIR-001` | `bun run test:file -- packages/core/src/database/markdown-table-identity-repair.test.ts` | 2 pass / 6 assertions; duplicate/missing/stale-alias diagnostics and read-only repair plan |
| `MT-CRDT-001` | `bun run test:file -- packages/core/src/database/markdown-table-crdt.test.ts` | 3 pass / 4 assertions; stable row/property key and race classification |
| `FORMULA-CONFORMANCE-001` | `bun run test:file -- packages/core/src/database/formula-conformance.test.ts` | 1 pass / 1 assertion; golden deterministic evaluator |
| `QUERY-CONFORMANCE-001` | `bun run test:file -- packages/core/src/database/query-conformance.test.ts` | 2 pass / 3 assertions; portable query diagnostics and result contract |
| `MT-MIG-EQ-001` | `bun run test:file -- packages/core/src/database/markdown-table-migration-equivalence.test.ts` | 3 pass / 11 assertions; IDs/typed/raw/derived logical equality, missing/error mismatches, and a real v1 corpus through the v2 owner materializer plus differential query |
| `MT-TITLE-CHOICE-001` | `bun run test:file -- packages/core/src/database/markdown-table-migration.test.ts` | 7 pass / 31 assertions; explicit keep/use/custom title conflict choices update document title and first wikilink alias, invalid custom title blocks |
| `MT-MIG-PREFLIGHT-001` | `bun run test:file -- packages/core/src/database/markdown-table-migration-preflight.test.ts` | 3 pass / 9 assertions; explicit owner selection, dependency closure, frozen baseline |

### 3.2 Server, API, MCP, migration, and offline

| Fixture ID | 명령 | 결과 |
| --- | --- | --- |
| `INDEX-V2-001` | `bun run test:file -- packages/server/src/database-record-index.test.ts` | 26 pass / 136 assertions; cold rebuild, standalone clone without `.ok/local` state, query/canonical export, incremental invalidation, title/move/lifecycle writer paths |
| `DIFFERENTIAL-V2-001` | `bun run test:file -- packages/server/src/database-v1-v2-differential.test.ts` | 1 pass / 7 assertions; canonical-ID-normalized records, filter/sort/select/aggregate/page cursor and search provenance are equal across v1 and v2 readers |
| `EXPORT-V2-001` | `bun run test:file -- packages/server/src/database-markdown-table-export.test.ts` | 1 pass / 8 assertions; HTTP data-plane canonical Markdown and computed snapshot exports are disjoint and revision-bound |
| `PLANE-V2-001` | `bun run test:file -- packages/server/src/database-data-plane.test.ts` | 46 pass / 309 assertions; permission, query, derived, transaction and migration gates |
| `API-V2-001` | `bun run test:file -- packages/server/src/database-data-plane-api.test.ts` | 35 pass / 338 assertions; strict HTTP schemas and task/mutation/recovery contracts including title-choice bindings |
| `JOURNAL-RECOVERY-001` | `bun run test:file -- packages/server/src/database-migration-journal.test.ts` | 4 pass / 11 assertions; clean retry, unknown-edit recovery-required, retention cleanup boundary |
| `TASK-RECOVERY-001` | `bun run test:file -- packages/server/src/database-task-service.test.ts` | 11 pass / 74 assertions; preview/apply/cold verification/rollback/retry/resume/inspection/retention refusal, derived-baseline hash binding, exact v1 byte restoration, and typed per-path intervening-edit conflict |
| `MIG-CRASH-001` | `bun run test:file -- packages/server/src/database-migration-process-crash.test.ts` | 1 pass / 96 assertions; independent SIGKILL at every staging and canonical activation file index, fresh recovery, v2 cold rebuild and journal activation |
| `MCP-RECOVERY-001` | `bun run test:file -- packages/server/src/mcp/tools/database-task.test.ts` | 3 pass / 19 assertions; task action validation and HTTP forwarding |
| `CLI-RECOVERY-001` | `bun run test:file -- packages/cli/src/commands/database.test.ts` | 12 pass / 43 assertions; machine-readable migration inspect/cleanup command registration and recovery action descriptions |
| `OFFLINE-REBASE-001` | `bun run test:file -- packages/app/src/lib/database-offline-mutation-queue.test.ts` | 12 pass / 27 assertions; environment epoch, stable IDs, wrong-cell conflict, convergence, and production reconcile rebase boundary |

### 3.3 Package type safety

다음 세 명령은 새 core contract를 사용하는 모든 현재 package가 compile되는지 확인한다.

```text
bun run --filter @nedian0brien/synapsenote-core typecheck  # pass
bun run --filter @nedian0brien/synapsenote-server typecheck  # pass
bun run --filter @nedian0brien/synapsenote-app typecheck  # pass
```

## 4. 성능·보안·신뢰성 evidence

| Fixture ID | 명령 | 결과와 한계 |
| --- | --- | --- |
| `BENCH-CORPUS-001` | `bun run test:file -- packages/server/src/database-benchmark-corpus.test.ts` | 4 pass / 41 assertions; deterministic 1k/50k/500k/1m, 30-property distribution and streaming JSONL. Numeric p95 SLO는 아직 별도 report가 필요함 |
| `RESOURCE-BOUND-001` | `bun run test:file -- packages/server/src/database-resource-regression.test.ts` | 1 pass / 2 assertions; 50k retained projection/index/context bound |
| `PATH-SAFETY-001` | `bun run test:file -- packages/server/src/path-utils.test.ts` | 7 pass / 16 assertions; traversal/Windows separator containment. Symlink+disk-full migration matrix는 미완료 |
| `TELEMETRY-PRIVACY-001` | `bun run test:file -- packages/server/src/database-telemetry.test.ts` | 8 pass / 75 assertions; bounded counters, latency normalization, content-free context metrics |
| `FORMULA-SERVER-001` | `bun run test:file -- packages/server/src/database-formula-conformance.test.ts` | 1 pass / 1 assertion; server output equals shared core golden vectors |
| `FORMULA-APP-001` | `bun run test:file -- packages/app/src/lib/database-formula-conformance.test.ts` | 1 pass / 1 assertion; browser output equals shared core golden vectors |

Fuzz corpus는 malformed input이 예외 없이 bounded diagnostic으로 끝나는 것을 보장하지만,
invalid UTF-8 byte stream과 OS-level timeout/OOM은 아직 증명하지 않는다. `MIG-CRASH-001`은
migration process-kill 경계를 닫지만 일반 mutation의 D-005와 Git/Yjs를 포함한 L-004는 이
evidence만으로 닫지 않는다.

## 5. Recovery contract

### 5.1 사용 가능한 복구 표면

- `data_task(action=inspect_migration)`은 task state, checkpoint, before/after hash,
  material presence, undo availability/expiry만 반환하고 Markdown 내용은 반환하지 않는다.
- `data_task(action=cleanup_migration)`은 succeeded migration의 retention expiry와
  expected task revision을 확인한 뒤 task-scoped staging/backup만 정리한다.
- migration `rollback`은 finished task, retention window, current file hash를 모두
  확인하며 intervening edit는 `rollback_blocked`로 멈춘다.
- canonical Markdown export는 owner marker/manifest bytes를 보존하는 interchange output이고,
  computed snapshot export는 marker 없는 timestamp/revision-bound projection이다.

### 5.2 복구 전제와 미완료 경계

복구 material은 retention window 동안 유지되며 cleanup은 별도 action이다. `MIG-029`는
activation hook failure를 주입해 journal rollback과 exact before bytes를 검증하고,
`MIG-CRASH-001`은 독립 child process에서 staging과 canonical activation의 모든 file index에
SIGKILL을 주입한 뒤 fresh task/store/index가 recovery하고 v2 cold rebuild를 완료하는 것을
검증한다. `TASK-RECOVERY-001`은 clean migration의 byte-exact user undo와 intervening-edit
`task_rollback_conflict`를 검증한다. 따라서 migration의 file-boundary checkpoint와 clean
undo/conflict contract와 content-free conflict paths는 재현되지만 deferred cleanup, 일반 mutation의
disk-full/permission/process-kill, 그리고 full fixture round-trip은 아직 별도 gate다.
Release candidate에서는 `MIG-019`–`MIG-023`를 task-scoped same-volume staging,
post-commit cold rebuild, user undo, intervening edit conflict, deferred cleanup까지
실행하고, 각 결과의 `taskId`, `planHash`, file hash만 남긴다.

## 6. 다음 implementation order

1. D/I/L: 일반 mutation의 disk-full/permission/process-kill과 full fixture의
   v1→v2→undo cold round-trip, deferred cleanup rehearsal을 자동화하고
   `MIG-019`–`MIG-023` 결과를 release record로 고정한다.
2. E/F/L: generic document/database projection deduplication과 all-surface
   Formula/Rollup derived revision을 같은 fixture에서 비교하고, export/query/search
   결과를 round-trip fixture에 포함한다.
3. G: Yjs/ProseMirror transaction adapter와 Git branch/rebase recovery를 stable
   `(ownerBlockId, recordId, propertyId)` key로 연결한다.
4. J/K: migration preview/progress/accessibility와 desktop parity를 실행하고,
   benchmark p50/p95/peak-memory 및 repeat soak report를 고정한다.
5. L: opt-in pilot → new-default → v1 writer retirement을 각각 별도 release record와
   rollback window로 승인한다. 이 순서 전에는 default writer를 변경하지 않는다.

## 7. Rollback path

- 구현 PR rollback: branch commit을 revert하고 v1 writer/default routing을 유지한다.
- 실행 중 migration: task cancel(아직 commit 전) 또는 retention 내 rollback(이미 commit 후)을
  사용한다. unknown external edit가 발견되면 자동 복구 대신 recovery-required 상태를
  유지한다.
- rollout rollback: v2 new-default flag를 끄고 v1 read-only/migration path를 유지한다.
  v2 canonical bytes를 v1 writer가 다시 쓰도록 하는 dual-write fallback은 허용하지 않는다.
- cleanup rollback: cleanup 전 backup/journal material을 보존하고, expiry 전에는 cleanup을
  거부한다. expiry 후 material이 없으면 새 migration preview를 생성해야 한다.
