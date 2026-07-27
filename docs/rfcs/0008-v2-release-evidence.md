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
| 완료된 foundation | shared core 계약과 해당 server/app path가 연결되고 focused test가 있음 | A-001~009, B-001~009, C-001~007, D-001~010, E-001~008, F-001~009, G-001~003/005/006, H-001~010, I-001~012, J-001~004/008, K-001/002/005~008, L-001~006 |
| 구현됐지만 release evidence 부족 | 코드와 단위/통합 검증은 있으나 UI, Yjs, performance/soak 또는 operator/pilot 증거가 부족함 | C-008, G-004/007, J-005~007/009/010, K-003/004/009, L-007~012 |
| 아직 구현하지 않음 | 외부 운영·desktop parity·pilot·retirement처럼 이 브랜치만으로 증명할 수 없는 단계 | J-005/006/010, K-003/004/009, L-007~012 |

따라서 이 브랜치에서 v2를 새 database의 기본 writer로 전환하거나 v1 writer를
제거하지 않는다. 새 default 전환은 M0–M4와 아래 blocked gate가 모두 닫힌 뒤 별도
release decision으로 수행한다.

## 2. 영역별 완료 기준과 현재 증거

| 영역 | 구체적인 완료 기준 | 이번 evidence | 남은 증거/차단 조건 |
| --- | --- | --- | --- |
| A 계약/스키마 | manifest/marker/lifecycle/revision/capability를 Node와 browser가 동일하게 parse하고 unknown version을 fail-closed | strict schema, lifecycle metadata, capability matrix, title/revision schema가 core/server/API에 연결됨; title conflict와 cross-surface revision equality도 focused contract에서 확인 | 새 schema 변경 시 browser/server conformance fixture를 갱신해야 함 |
| B parser/codec | 지원 type의 parse→typed→canonical serialize→parse, invalid raw 보존, malformed/limit 입력의 bounded 실패 | 20개 table/parser/codec assertion, 773개 fuzz assertion, owner/cell/JSON limit fixtures, invalid UTF-8와 child-process timeout/output cap | true peak-memory/OOM ceiling은 K-003/K-009 soak에서 별도 측정 |
| C identity/ownership | path/title/alias/move/copy 후 stable identity, duplicate/ambiguous owner를 차단, repair는 preview/approval/undo | document ID reassignment, owner marker clone, explicit duplicate-document copy, linked-view reference-only rejection, link rewrite, identity repair planning 테스트 | UI choice와 server repair commit/undo, full relation-wide move matrix |
| D mutation/transaction | expected revision + journal + post-write verification + compensation/undo, partial success 금지 | writer가 post-write hash를 다시 읽고 journal checkpoint를 뒤로 미룸; record-index mutation suite; migration activation hook과 독립 child process가 injected failure 뒤 rollback | 일반 mutation의 process-kill/disk-full/intervening-edit matrix와 user-facing redo |
| E read/index/query/export | cache/task DB 없이 owner+manifest+documents만으로 cold rebuild하고 query/search/export snapshot을 재구축 | cold/incremental index, v1/v2 differential query, permission-scoped search provenance/dedup, canonical/computed export contract와 HTTP export boundary | malformed-owner degraded-state coverage와 UI linked-view evidence |
| F Formula/Rollup | pure deterministic evaluator, permission-aware error, dependency/derived revision, migration equivalence | core/server/app conformance, dependency DAG/reverse index, query/API/MCP/export `derivedRevision` equality, frozen v1→v2 value/error deep comparison, round-trip cold rebuild | 실제 Yjs/Git invalidation과 long-running performance report |
| G 협업/offline | stable cell key로 different-cell 자동 병합, same-cell/delete-vs-edit는 conflict/recovery-required | semantic diff/merge와 CRDT key/conflict classifier, app queue reconciliation, v2 Git branch checkout/cold rebuild, v2 owner merge와 manifest rebase/remote round-trip | 실제 Yjs/ProseMirror transaction, actor history integration |
| H migration plan | write 없이 complete inventory, dependency closure, owner/title 선택, exact plan hash 생성 | owner selection/closure/preflight, explicit title keep/use/custom, task/API/MCP plan binding, frozen derived baseline binding, 7-case generated/existing/inline/full-page/CRLF/BOM/Unicode/invalid/limit matrix, and all stored scalar/link codecs | cross-database relation matrix at supported maximum and repair-choice UX |
| I migration recovery | verified backup→staging→activation→cold verify→undo→retention cleanup을 durable checkpoint로 재개 | journal cleanup boundary, retention-aware inspect/rollback/cleanup preview+approval, migration logical equivalence, independent SIGKILL every staging/activation file, generic owner/document writer crash classification, post-commit cold rebuild, byte-exact undo/conflict, ENOSPC/EACCES failure injection | operator rehearsal for deferred cleanup |
| J product/API/UX | web/desktop/server/MCP/CLI가 동일 operation/plan hash/revision/error와 recovery state를 노출 | API/MCP task schemas에 cleanup preview/approval, canonical/computed export endpoint, app offline rebase, CLI preview-cleanup/cleanup registration, linked-view reference-only/source-delete contract | migration preview/progress accessibility, desktop parity, diagnostics repair commit |
| K 성능/보안/신뢰성 | supported-max의 수치 budget, max+1 거부, path/permission/telemetry noninterference, soak 결과 | deterministic 1k–1m corpus, 50k resource bound, 50k warm-query p50/p95/peak RSS, parser fuzz, telemetry/path tests, partial ENOSPC/EACCES writer/migration matrix | 전체 case-collision/symlink/temp/lock matrix, cold/cell/migration throughput SLO, bounded DOM backpressure, 반복 soak |
| L conformance/release | core conformance, differential/round-trip/crash/standalone, public docs/runbook, pilot/new-default/retirement decision | core Formula/query conformance, server v1/v2 differential, standalone clone, export/process-crash/Git/offline/CRDT fixtures, migration matrix, public v2 storage/recovery docs, this evidence doc, changesets | full Yjs/actor-history/rebase integration, operator rehearsal, pilot and retirement records |

영역을 완료로 올리려면 해당 행의 첫 번째 기준뿐 아니라 마지막 열의 failure/operational
evidence까지 repository artifact로 남겨야 한다.

## 3. 실행 증거

### 3.1 Core, identity, parser, and derived

| Fixture ID | 명령 | 결과 |
| --- | --- | --- |
| `MT-TITLE-001` | `bun run test:file -- packages/core/src/database/markdown-table-document.test.ts` | 3 pass / 11 assertions; frontmatter/H1/basename title contract |
| `MT-ID-001` | `bun run test:file -- packages/core/src/database/document-identity.test.ts` | 7 pass / 22 assertions; copy/paste reassignment and malformed refusal |
| `MT-OWNER-001` | `bun run test:file -- packages/core/src/database/markdown-table.test.ts` | 20 pass / 79 assertions; marker, source ranges, clone, move link rewrite, codecs, semantic merge |
| `MT-FUZZ-001` | `bun run test:file -- packages/core/src/database/markdown-table-fuzz.test.ts` | 5 pass / 773 assertions; malformed marker/table, owner/cell size bounds, invalid UTF-8, and child-process 4s adversarial escape timeout |
| `MT-REV-001` | `bun run test:file -- packages/core/src/database/markdown-table-revision.test.ts` | 4 pass / 20 assertions; owner/table/row/cell/document semantic scopes and prose independence |
| `MT-REPAIR-001` | `bun run test:file -- packages/core/src/database/markdown-table-identity-repair.test.ts` | 2 pass / 6 assertions; duplicate/missing/stale-alias diagnostics and read-only repair plan |
| `MT-CRDT-001` | `bun run test:file -- packages/core/src/database/markdown-table-crdt.test.ts` | 3 pass / 4 assertions; stable row/property key and race classification |
| `FORMULA-CONFORMANCE-001` | `bun run test:file -- packages/core/src/database/formula-conformance.test.ts` | 1 pass / 1 assertion; golden deterministic evaluator |
| `QUERY-CONFORMANCE-001` | `bun run test:file -- packages/core/src/database/query-conformance.test.ts` | 2 pass / 3 assertions; portable query diagnostics and result contract |
| `MT-MIG-EQ-001` | `bun run test:file -- packages/core/src/database/markdown-table-migration-equivalence.test.ts` | 3 pass / 11 assertions; IDs/typed/raw/derived logical equality, missing/error mismatches, and a real v1 corpus through the v2 owner materializer plus differential query |
| `MT-TITLE-CHOICE-001` | `bun run test:file -- packages/core/src/database/markdown-table-migration.test.ts` | 7 pass / 31 assertions; explicit keep/use/custom title conflict choices update document title and first wikilink alias, invalid custom title blocks |
| `MT-MIG-PREFLIGHT-001` | `bun run test:file -- packages/core/src/database/markdown-table-migration-preflight.test.ts` | 3 pass / 9 assertions; explicit owner selection, dependency closure, frozen baseline |
| `MT-MIG-MATRIX-001` | `bun run test:file -- packages/core/src/database/markdown-table-migration-matrix.test.ts` | 7 pass / 46 assertions; generated blank, existing folder, inline/full-page owner, all stored scalar/link types, CRLF/BOM/Unicode preservation, invalid select, and frontmatter limit blocker |

### 3.2 Server, API, MCP, migration, and offline

| Fixture ID | 명령 | 결과 |
| --- | --- | --- |
| `INDEX-V2-001` | `bun run test:file -- packages/server/src/database-record-index.test.ts` | 28 pass / 153 assertions; cold rebuild, standalone clone without `.ok/local` state, query/canonical export, incremental invalidation, title/move/lifecycle/delete semantics, linked source deletion diagnostic, and ENOSPC/EACCES writer rollback |
| `DIFFERENTIAL-V2-001` | `bun run test:file -- packages/server/src/database-v1-v2-differential.test.ts` | 1 pass / 7 assertions; canonical-ID-normalized records, filter/sort/select/aggregate/page cursor and search provenance are equal across v1 and v2 readers |
| `EXPORT-V2-001` | `bun run test:file -- packages/server/src/database-markdown-table-export.test.ts` | 1 pass / 9 assertions; HTTP data-plane canonical Markdown and computed snapshot exports are disjoint and share the Formula-derived revision |
| `PLANE-V2-001` | `bun run test:file -- packages/server/src/database-data-plane.test.ts` | 46 pass / 311 assertions; permission, query, derived, transaction and migration gates with query/trace derived-revision equality |
| `API-V2-001` | `bun run test:file -- packages/server/src/database-data-plane-api.test.ts` | 35 pass / 338 assertions; strict HTTP schemas and task/mutation/recovery contracts including title-choice bindings |
| `API-MCP-DERIVED-001` | `bun run test:file -- packages/server/src/database-api-mcp-contract.test.ts` | 9 pass / 67 assertions; direct/HTTP/MCP Formula computed values and `derivedRevision` equality plus queued migration gate behavior |
| `SEARCH-DEDUP-001` | `bun run test:file -- packages/server/src/api-search.test.ts` | 35 pass / 90 assertions; permission-scoped database provenance, one result per linked record, and no generic page-tier re-entry |
| `JOURNAL-RECOVERY-001` | `bun run test:file -- packages/server/src/database-migration-journal.test.ts` | 4 pass / 11 assertions; clean retry, unknown-edit recovery-required, retention cleanup boundary |
| `TASK-RECOVERY-001` | `bun run test:file -- packages/server/src/database-task-service.test.ts` | 13 pass / 91 assertions; preview/apply/cold verification/rollback/retry/resume/inspection, retention-expired cleanup preview/approval, derived-baseline hash binding, Formula/Rollup value/error verification, exact v1 byte restoration, linked-document preservation, typed per-path intervening-edit conflict, and ENOSPC/EACCES migration rollback |
| `WRITER-CRASH-001` | `bun run test:file -- packages/server/src/database-markdown-table-writer-process-crash.test.ts` | 3 pass / 57 assertions; SIGKILL after each linked-document/owner write, `recovery_required` for mixed bytes, `committed` only for all-after hashes, 25-cycle edit/reload/undo soak, and explicit copy identity/reference-only behavior |
| `MIG-ROUNDTRIP-001` | `bun run test:file -- packages/server/src/database-migration-roundtrip.test.ts` | 1 pass / 11 assertions; frozen Formula/Rollup value and divide-by-zero error parity through v1→v2 apply, cold rebuild, computed export, and byte-exact undo |
| `MIG-CRASH-001` | `bun run test:file -- packages/server/src/database-migration-process-crash.test.ts` | 1 pass / 96 assertions; independent SIGKILL at every staging and canonical activation file index, fresh recovery, v2 cold rebuild and journal activation |
| `MCP-RECOVERY-001` | `bun run test:file -- packages/server/src/mcp/tools/database-task.test.ts` | 3 pass / 21 assertions; task action validation and HTTP forwarding |
| `CLI-RECOVERY-001` | `bun run test:file -- packages/cli/src/commands/database.test.ts` | 12 pass / 43 assertions; machine-readable migration inspect/cleanup command registration and recovery action descriptions |
| `OFFLINE-REBASE-001` | `bun run test:file -- packages/app/src/lib/database-offline-mutation-queue.test.ts` | 12 pass / 27 assertions; environment epoch, stable IDs, wrong-cell conflict, convergence, and production reconcile rebase boundary |
| `GIT-V2-001` | `bun run test:file -- packages/server/src/database-index-git-sync.test.ts` | 2 pass / 13 assertions; branch checkout rebuilds v2 manifest/owner/linked-document index and clears stale branch state; v2 semantic merge and manifest rebase/remote round-trip are covered by `packages/cli/src/commands/database.test.ts` |
| `MIG-FIXTURE-MATRIX-001` | `bun run test:file -- packages/server/src/database-migration-fixture-matrix.test.ts` | 1 pass / 13 assertions; generated/existing/inline/full-page/multi-source/invalid/lifecycle/CRLF-BOM-Unicode/size boundary cases have explicit plan and blocker expectations |
| `MIG-FAILURE-MATRIX-001` | `bun run test:file -- packages/server/src/database-task-service.test.ts` | 13 pass / 91 assertions; migration stage ENOSPC/EACCES failure injection restores every v1 canonical byte and leaves a rolled-back journal |
| `DOC-CONFORMANCE-001` | `bun run test:file -- packages/core/src/database/docs-v2-storage-conformance.test.ts` | 1 pass / 8 assertions; public storage/recovery examples parse against current owner marker/codec and mention known-loss/recovery policy |

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
| `BENCH-CORPUS-001` | `bun run test:file -- packages/server/src/database-benchmark-corpus.test.ts` | 4 pass / 41 assertions; deterministic 1k/50k/500k/1m, 30-property distribution and streaming JSONL. |
| `BENCH-WARM-001` | `bun run test:file -- packages/server/src/database-performance-benchmark.test.ts` | 2 pass / 11 assertions; 1k and 50k warm typed-query gates record p50/p95/p99, peak RSS, and numeric memory budget. The repeatable test records runtime/seed in its result; supported-max baseline and regression policy remain release gates. |
| `RESOURCE-BOUND-001` | `bun run test:file -- packages/server/src/database-resource-regression.test.ts` | 1 pass / 2 assertions; 50k retained projection/index/context bound |
| `QUERY-BOUND-001` | `bun run test:file -- packages/core/src/database/query.test.ts` | 26 pass / 381 assertions; page limit 501 is rejected and a 1,000-row snapshot returns at most the shared 500-row page. |
| `PATH-SAFETY-001` | `bun run test:file -- packages/server/src/path-utils.test.ts` | 7 pass / 16 assertions; traversal/Windows separator containment; combined with writer and migration ENOSPC/EACCES fixtures for partial-state safety |
| `TELEMETRY-PRIVACY-001` | `bun run test:file -- packages/server/src/database-telemetry.test.ts` | 8 pass / 75 assertions; bounded counters, latency normalization, content-free context metrics |
| `FORMULA-SERVER-001` | `bun run test:file -- packages/server/src/database-formula-conformance.test.ts` | 1 pass / 1 assertion; server output equals shared core golden vectors |
| `FORMULA-APP-001` | `bun run test:file -- packages/app/src/lib/database-formula-conformance.test.ts` | 1 pass / 1 assertion; browser output equals shared core golden vectors |
| `WRITER-SOAK-001` | `bun run test:file -- packages/server/src/database-markdown-table-writer-process-crash.test.ts` | 25 repeated edit/reload/undo iterations plus cold rebuild every fifth iteration; no stale lock or snapshot drift. This is a bounded writer soak, not the full Git/migration reliability gate. |

Fuzz corpus는 malformed input이 예외 없이 bounded diagnostic으로 끝나는 것을 보장하고,
invalid UTF-8 byte stream과 4초 child-process timeout 경계도 포함한다. OOM ceiling과
long-running soak는 아직 별도 측정이 필요하다. `MIG-CRASH-001`, `WRITER-CRASH-001`,
`GIT-V2-001`, CRDT/offline fixtures가 L-004의 deterministic crash/conflict matrix를
구성하지만 실제 Yjs/ProseMirror adapter는 G-004 gate로 남는다.

## 5. Recovery contract

### 5.1 사용 가능한 복구 표면

- `data_task(action=inspect_migration)`은 task state, checkpoint, before/after hash,
  material presence, undo availability/expiry만 반환하고 Markdown 내용은 반환하지 않는다.
- `data_task(action=preview_cleanup_migration)`은 retention/terminal-journal/material 상태와
  content-free cleanup plan hash를 반환한다. `cleanup_migration`은 그 hash에 묶인
  `approve:<hash>` token과 expected task revision이 모두 있을 때만 task-scoped
  staging/backup을 정리한다.
- migration `rollback`은 finished task, retention window, current file hash를 모두
  확인하며 intervening edit는 `rollback_blocked`로 멈춘다.
- canonical Markdown export는 owner marker/manifest bytes를 보존하는 interchange output이고,
  computed snapshot export는 marker 없는 timestamp/revision-bound projection이다.

### 5.2 복구 전제와 미완료 경계

복구 material은 retention window 동안 유지되며 cleanup은 별도 preview→approval action이다. `MIG-029`는
activation hook failure를 주입해 journal rollback과 exact before bytes를 검증하고,
`MIG-CRASH-001`은 독립 child process에서 staging과 canonical activation의 모든 file index에
SIGKILL을 주입한 뒤 fresh task/store/index가 recovery하고 v2 cold rebuild를 완료하는 것을
검증한다. `WRITER-CRASH-001`은 linked-document/owner 두 write boundary를 같은
content-free recovery state로 분류하고, `TASK-RECOVERY-001`은 clean migration의
byte-exact user undo, expiry-gated cleanup, intervening-edit `task_rollback_conflict`를
검증한다. `MIG-ROUNDTRIP-001`은 Formula/Rollup value와 divide-by-zero error를 포함한
v1→v2→cold rebuild→undo를 검증한다. `MIG-FAILURE-MATRIX-001`은 stage ENOSPC/EACCES를
검증한다. 따라서 migration/file writer checkpoint, clean undo/conflict/round-trip와
cleanup approval은 재현되지만 deferred-cleanup operator rehearsal, Git/Yjs와
long-running soak는 아직 별도 gate다.
Release candidate에서는 `MIG-019`–`MIG-023`를 task-scoped same-volume staging,
post-commit cold rebuild, user undo, intervening edit conflict, deferred cleanup까지
실행하고, 각 결과의 `taskId`, `planHash`, file hash만 남긴다.

## 6. 다음 implementation order

1. L: deferred cleanup operator rehearsal을 새 clone에서 실행하고 `MIG-019`–`MIG-023`
   결과를 release record로 고정한다.
2. G: Yjs/ProseMirror transaction adapter와 actor history를 stable
   `(ownerBlockId, recordId, propertyId)` key로 연결한다.
3. J/K: migration preview/progress/accessibility와 desktop parity를 실행하고,
   cold/cell/migration-throughput SLO 및 long-running soak report를 고정한다.
4. L: opt-in pilot → new-default → v1 writer retirement을 각각 별도 release record와
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
