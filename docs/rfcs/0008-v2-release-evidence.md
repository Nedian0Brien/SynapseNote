# RFC 0008 v1→v2 release evidence

- 기준일: 2026-07-27
- 상태: v2 new-default implementation evidence / public release candidate 아님
- 대상: [canonical storage RFC](./0008-markdown-table-canonical-database-storage.md), [implementation checklist](./0008-markdown-table-database-storage-implementation-checklist.md)

이 문서는 체크리스트의 checkbox를 대신하지 않는다. 현재 브랜치에서 실제로 연결된
production path와 focused 검증을 기록하고, 아직 release gate가 아닌 항목을 명시한다.
모든 결과는 fixture가 만든 임시 workspace에서 실행했으며 사용자 문서나 private path를
증거에 포함하지 않는다.

## 1. 현재 단계와 결정

현재 구현은 `v2 new/default creation + v1 read/export/migration compatibility` 단계다. 새
blank/template/inline/delimited database 생성과 일반 v2 row 생성은 v2 owner-table storage를
사용하고, existing-folder onboarding은 명시적인 v1 compatibility source를 유지한다. Production
Data Plane, automation, and common commit callers reject existing-v1 writes before filesystem
mutation. 실제
public rollout은 별도 operator sign-off, bounded pilot, release record 승인 전까지 staged로
취급한다.

| 판정 | 의미 | 현재 결정 |
| --- | --- | --- |
| 완료된 foundation | shared core 계약과 해당 server/app path가 연결되고 focused test가 있음 | A-001~009, B-001~009, C-001~008, D-001~010, E-001~008, F-001~009, G-001~007, H-001~010, I-001~012, J-001~009, K-001~009, L-001~007 |
| 구현됐지만 release evidence 부족 | 코드와 focused 검증은 있으나 repository-wide 데스크톱 gate 또는 운영 기록이 부족함 | J-010, deferred-cleanup operator sign-off, external rollout record |
| 아직 실행·승인하지 않음 | 외부 운영·desktop gate·release decision처럼 이 브랜치만으로 증명할 수 없는 단계 | public pilot, operator sign-off, final new-default approval |

따라서 이 브랜치는 새 blank/template database의 v2 기본 writer 경로와 v1 product-mutation
guard까지 포함하지만, 실제 public default rollout과 legacy writer retirement는 M0–M4,
desktop/UX gate, bounded pilot, operator sign-off가 모두 닫힌 뒤 별도 release decision으로
수행한다.

## 2. 영역별 완료 기준과 현재 증거

| 영역 | 구체적인 완료 기준 | 이번 evidence | 남은 증거/차단 조건 |
| --- | --- | --- | --- |
| A 계약/스키마 | manifest/marker/lifecycle/revision/capability를 Node와 browser가 동일하게 parse하고 unknown version을 fail-closed | strict schema, lifecycle metadata, capability matrix, title/revision schema가 core/server/API에 연결됨; title conflict와 cross-surface revision equality도 focused contract에서 확인 | 새 schema 변경 시 browser/server conformance fixture를 갱신해야 함 |
| B parser/codec | 지원 type의 parse→typed→canonical serialize→parse, invalid raw 보존, malformed/limit 입력의 bounded 실패 | 20개 table/parser/codec assertion, 773개 fuzz assertion, owner/cell/JSON limit fixtures, invalid UTF-8와 child-process timeout/output cap | true process-wide OOM ceiling은 별도 운영 관찰 대상이며 parser는 bounded failure를 보장함 |
| C identity/ownership | path/title/alias/move/copy 후 stable identity, duplicate/ambiguous owner를 차단, repair는 preview/approval/undo | document ID reassignment, owner marker clone, explicit duplicate-document copy, linked-view reference-only rejection, link rewrite, content-free identity repair plan, approval, durable undo, restart/intervening-edit guard | UI choice와 full relation-wide move matrix |
| D mutation/transaction | expected revision + journal + post-write verification + compensation/undo, partial success 금지 | writer가 post-write hash를 다시 읽고 journal checkpoint를 뒤로 미룸; record-index mutation suite; migration activation hook과 독립 child process가 injected failure 뒤 rollback | 일반 mutation의 process-kill/disk-full/intervening-edit matrix와 user-facing redo |
| E read/index/query/export | cache/task DB 없이 owner+manifest+documents만으로 cold rebuild하고 query/search/export snapshot을 재구축 | cold/incremental index, v1/v2 differential query, permission-scoped search provenance/dedup, canonical/computed export contract와 HTTP export boundary | malformed-owner degraded-state coverage와 UI linked-view evidence |
| F Formula/Rollup | pure deterministic evaluator, permission-aware error, dependency/derived revision, migration equivalence | core/server/app conformance, dependency DAG/reverse index, query/API/MCP/export `derivedRevision` equality, frozen v1→v2 value/error deep comparison, round-trip cold rebuild | cross-editor invalidation soak and desktop collaboration parity |
| G 협업/offline | stable cell key로 different-cell 자동 병합, same-cell/delete-vs-edit는 conflict/recovery-required | semantic diff/merge와 stable CRDT key, 실제 두 Yjs client의 ProseMirror metadata mapping/convergence/conflict classifier, app queue reconciliation, v2 Git branch checkout/cold rebuild, v2 owner merge와 manifest rebase/remote round-trip, durable actor/history journal | cross-editor production soak와 desktop collaboration parity |
| H migration plan | write 없이 complete inventory, dependency closure, owner/title 선택, exact plan hash 생성 | owner selection/closure/preflight, explicit title keep/use/custom, task/API/MCP plan binding, frozen derived baseline binding, 7-case generated/existing/inline/full-page/CRLF/BOM/Unicode/invalid/limit matrix, and all stored scalar/link codecs | cross-database relation matrix at supported maximum and repair-choice UX |
| I migration recovery | verified backup→staging→activation→cold verify→undo→retention cleanup을 durable checkpoint로 재개 | journal cleanup boundary, retention-aware inspect/rollback/cleanup preview+approval, migration logical equivalence, independent SIGKILL every staging/activation file, generic owner/document writer crash classification, post-commit cold rebuild, byte-exact undo/conflict, ENOSPC/EACCES failure injection, fresh Git clone runbook rehearsal | deferred-cleanup rehearsal on a production-like clone and operator sign-off |
| J product/API/UX | web/desktop/server/MCP/CLI가 동일 operation/plan hash/revision/error와 recovery state를 노출 | API/MCP task schemas에 cleanup preview/approval, canonical/computed export endpoint, app offline rebase, CLI preview-cleanup/cleanup registration, linked-view reference-only/source-delete contract, diagnostics identity repair preview/apply/undo UI, stable migration-required problem mapping, workspace/inline-connected migration recovery panel with exact preview binding and durable polling, persisted task reconnect, retry/rollback affordances, content-free title/owner-choice controls, multi-database selection/hash binding, app/API/MCP/automation migration CTA parity, focused desktop cold-reload/reveal/Git parity | repository-wide desktop gate remains blocked by the pre-existing ephemeral lifecycle timeout; focused v2 parity is green |
| K 성능/보안/신뢰성 | supported-max의 수치 budget, max+1 거부, path/permission/telemetry noninterference, soak 결과 | deterministic 1k–1m corpus, 50k resource bound, 50k warm-query p50/p95/peak RSS, 50k DOM/query cancellation bound, 1k cold/index/incremental/derived, 100-row cell-commit, 1k migration-throughput, and 50k context p95 lifecycle report, process-relative RSS budget/regression policy, parser fuzz, telemetry/path tests, partial ENOSPC/EACCES writer/migration matrix, and the 50k-row/10-iteration reliability soak | release-sized multi-process OOM ceiling remains an operational observation, not a v2 storage correctness blocker |
| L conformance/release | core conformance, differential/round-trip/crash/standalone, public docs/runbook, pilot/new-default/retirement decision | core Formula/query conformance, server v1/v2 differential, standalone clone, export/process-crash/Git/offline/real-Yjs/actor-history fixtures, migration matrix, public v2 storage/recovery docs, executable runbook rehearsal, content-free pilot schema/report, v1 compatibility RFC, this evidence doc, changesets | bounded external pilot, deferred-cleanup operator sign-off, final new-default release record, future compatibility-retirement audits |

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
| `MT-CRDT-001` | `bun run test:file -- packages/core/src/database/markdown-table-crdt.test.ts` | 5 pass / 8 assertions; stable row/property key, ProseMirror metadata mapping, real two-client Yjs different-cell convergence, and same-cell/delete-vs-edit race classification |
| `FORMULA-CONFORMANCE-001` | `bun run test:file -- packages/core/src/database/formula-conformance.test.ts` | 1 pass / 1 assertion; golden deterministic evaluator |
| `QUERY-CONFORMANCE-001` | `bun run test:file -- packages/core/src/database/query-conformance.test.ts` | 2 pass / 3 assertions; portable query diagnostics and result contract |
| `MT-MIG-EQ-001` | `bun run test:file -- packages/core/src/database/markdown-table-migration-equivalence.test.ts` | 3 pass / 11 assertions; IDs/typed/raw/derived logical equality, missing/error mismatches, and a real v1 corpus through the v2 owner materializer plus differential query |
| `MT-TITLE-CHOICE-001` | `bun run test:file -- packages/core/src/database/markdown-table-migration.test.ts` | 7 pass / 31 assertions; explicit keep/use/custom title conflict choices update document title and first wikilink alias, invalid custom title blocks |
| `MT-MIG-PREFLIGHT-001` | `bun run test:file -- packages/core/src/database/markdown-table-migration-preflight.test.ts` | 3 pass / 9 assertions; explicit owner selection, dependency closure, frozen baseline |
| `MT-MIG-MATRIX-001` | `bun run test:file -- packages/core/src/database/markdown-table-migration-matrix.test.ts` | 7 pass / 46 assertions; generated blank, existing folder, inline/full-page owner, all stored scalar/link types, CRLF/BOM/Unicode preservation, invalid select, and frontmatter limit blocker |

### 3.2 Server, API, MCP, migration, and offline

| Fixture ID | 명령 | 결과 |
| --- | --- | --- |
| `INDEX-V2-001` | `bun run test:file -- packages/server/src/database-record-index.test.ts` | 28 pass / 175 assertions; cold rebuild, standalone clone without `.ok/local` state, query/canonical export, incremental invalidation, title/move/lifecycle/delete semantics, linked source deletion diagnostic, actor/history journal attribution for human/agent/sync/filesystem/system actors, and ENOSPC/EACCES writer rollback |
| `DIFFERENTIAL-V2-001` | `bun run test:file -- packages/server/src/database-v1-v2-differential.test.ts` | 1 pass / 7 assertions; canonical-ID-normalized records, filter/sort/select/aggregate/page cursor and search provenance are equal across v1 and v2 readers |
| `EXPORT-V2-001` | `bun run test:file -- packages/server/src/database-markdown-table-export.test.ts` | 1 pass / 9 assertions; HTTP data-plane canonical Markdown and computed snapshot exports are disjoint and share the Formula-derived revision |
| `PLANE-V2-001` | `bun run test:file -- packages/server/src/database-data-plane.test.ts` | 47 pass / 313 assertions; permission, query, derived, transaction, migration, and production v1 compatibility gates with query/trace derived-revision equality |
| `PLAN-V2-IDENTITY-001` | `bun run test:file -- packages/server/src/database-plan.test.ts` | 34 pass / 179 assertions; explicit v2 caller-supplied record IDs without a stable `documentId` are blocked before commit, while existing rows remain revision-bound |
| `API-V2-001` | `bun run test:file -- packages/server/src/database-data-plane-api.test.ts` | 35 pass / 343 assertions; strict HTTP schemas and task/mutation/recovery contracts including title-choice bindings, identity-repair undo, and content-free migration blocker metadata |
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
| `RUNBOOK-REHEARSAL-001` | `bun run test:file -- packages/server/src/database-recovery-runbook.test.ts` | 2 pass / 10 assertions; a fresh Git clone follows inspect→rollback→cleanup and verifies duplicate-owner/missing-ID diagnostics without writing identity bytes |
| `REPAIR-V2-IDENTITY-001` | `bun run test:file -- packages/server/src/database-repair.test.ts packages/server/src/database-data-plane-api.test.ts packages/server/src/mcp/tools/database-repair.test.ts` | 6 + 35 + 3 pass; v2 missing-ID/stale-alias repair is previewed with explicit choices, applied only with plan hash/approval, undo survives server restart and restores exact bytes, and intervening edits are blocked; HTTP/MCP/app diagnostics use the same contract |
| `REPAIR-UI-001` | `bun run --cwd packages/app test:dom src/components/DatabaseDiagnosticsDialog.dom.test.tsx` | 10 pass / 27 assertions; diagnostics exposes missing document-ID choices, preview/apply state, exact repair undo, and error/recovery status without hiding blockers |
| `MIGRATION-UX-001` | `bun run --cwd packages/app test:dom src/components/DatabaseMigrationDialog.dom.test.tsx` | 8 pass / 28 assertions; migration preview is bounded to 50 items, binds start to the exact preview hash/timestamp and title/owner choices, scopes a batch to selected database IDs, exposes manifest/owner/linked-document changes and blockers, separates non-lossless acknowledgement from approval, and renders durable progress/cancel/retry/resume/rollback states plus persisted task reattachment |
| `V1-GUARD-UI-001` | `bun run test:file -- packages/app/src/lib/database-ui-problem.test.ts` | 10 pass / 33 assertions; migration-required guard maps to one non-retryable migration CTA and stable product copy; read paths remain separate from the write classification |
| `V1-GUARD-API-MCP-001` | `bun run test:file -- packages/server/src/database-data-plane.test.ts packages/server/src/database-problem.test.ts packages/server/src/mcp/tools/database-commit.test.ts` | 47 pass / 313 Data Plane assertions plus 12 pass / 37 problem/MCP assertions; a synthetic v1 product mutation returns one `storage_read_only`/migration-required policy and the plan conflict/MCP refusal map to the same non-retryable `start_migration` recovery action |
| `V1-GUARD-AUTOMATION-001` | `bun run test:file -- packages/server/src/database-automation.test.ts` | 5 pass / 19 assertions; legacy automation record mutation is terminal `migration_required`, emits no retry, and preserves the read/dry-run conflict details |
| `DESKTOP-V2-PARITY-001` | `bun test packages/desktop/src/main/database-v2-parity.test.ts packages/desktop/src/main/database-determinism-conformance.test.ts` | 3 pass / 12 assertions; desktop cold reload sees the same owner/document result, reveal/open targets the linked Markdown document, Git checkout uses the same server route, and shared Formula/query vectors remain equal |
| `DESKTOP-GATE-001` | `bun run check:desktop` | 2,478 pass / 2 skip / 1 fail across 2,481 desktop tests; blocked by one pre-existing `tests/integration/ephemeral-lifecycle.test.ts` `server.lock` timeout after 30s. The v2-specific focused parity fixture above passes |
| `PILOT-SCHEMA-001` | `bun run test:file -- packages/server/src/database-v2-pilot.test.ts` | 2 pass / 6 assertions; content-free aggregate opt-in rehearsal schema produces go/no-go and rejects recovery/high-severity defects. This is not an external customer pilot. |
| `V2-COMMIT-001` | `bun run test:file -- packages/server/src/database-commit.test.ts` | 50 pass / 530 assertions; v2 normal row creation, generic property update/delete, title/lifecycle writer routing, exact owner/document deltas, common-engine production-path v1 guard, and preview/apply undo are covered; no v2 `rec_*.md` path is created |
| `APP-CREATION-001` | `bun run test:file -- packages/app/src/lib/database-creation.test.ts` | 11 pass / 70 assertions; blank/template/inline/delimited creation defaults to `markdown_table`, while existing-folder binding remains explicit `record_files` compatibility unless overridden |
| `V1-COMPAT-001` | `bun run test:file -- packages/server/src/database-v1-compatibility.test.ts` | 2 pass / 8 assertions; policy/classification fixture verifies read/export/migration/import compatibility is retained while production product mutation is the only blocked context |

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
| `BENCH-WARM-001` | `bun run test:file -- packages/server/src/database-performance-benchmark.test.ts` | 2 pass / 11 assertions; 1k and 50k warm typed-query gates record p50/p95/p99, peak RSS, and numeric memory budget. The repeatable test records runtime/seed in its result; lifecycle benchmark owns the cross-path p95/RSS regression policy. |
| `LIFECYCLE-BENCH-001` | `bun run test:file -- packages/server/src/database-lifecycle-benchmark.test.ts` | 1 pass / 39 assertions; latest five-sample p95 on the reference machine (Bun 1.3.14, Node 24.3.0, macOS 27 arm64): cold startup 17.234ms/250ms, initial index 3896.143ms/5000ms, incremental index 4.564ms/50ms, Formula/Rollup propagation 48.271ms/500ms, 50k context packing 44.862ms/150ms, 100-row cell commit 126.840ms/250ms, and 1k migration planning 714.965ms/2000ms. The same run measured 1,140,916,224-byte peak RSS delta against a 2,147,483,648-byte budget. Seed `1511464998` and corpus digest `sha256:58f5fc9d7191a141130daf8b0f5811b34f39d7fba491f27024fe56175af19caa` are fixed; p95/RSS regression fails closed without an approved baseline update. |
| `RESOURCE-BOUND-001` | `bun run test:file -- packages/server/src/database-resource-regression.test.ts` | 1 pass / 2 assertions; 50k retained projection/index/context bound |
| `QUERY-BOUND-001` | `bun run test:file -- packages/core/src/database/query.test.ts` | 26 pass / 381 assertions; page limit 501 is rejected and a 1,000-row snapshot returns at most the shared 500-row page. |
| `DOM-BOUND-001` | `bun run --cwd packages/app test:dom src/components/DatabaseTable.performance.dom.test.tsx` | 3 pass / 17 assertions; latest standalone 1k-row p95 was 340.963ms/500ms and the supported 50k-row projection completed in 499.74ms while mounting fewer than 40 rows. |
| `PATH-SAFETY-001` | `bun run test:file -- packages/server/src/path-utils.test.ts` | 7 pass / 16 assertions; traversal/Windows separator containment; combined with writer and migration ENOSPC/EACCES fixtures for partial-state safety |
| `TELEMETRY-PRIVACY-001` | `bun run test:file -- packages/server/src/database-telemetry.test.ts` | 8 pass / 75 assertions; bounded counters, latency normalization, content-free context metrics |
| `FORMULA-SERVER-001` | `bun run test:file -- packages/server/src/database-formula-conformance.test.ts` | 1 pass / 1 assertion; server output equals shared core golden vectors |
| `FORMULA-APP-001` | `bun run test:file -- packages/app/src/lib/database-formula-conformance.test.ts` | 1 pass / 1 assertion; browser output equals shared core golden vectors |
| `WRITER-SOAK-001` | `bun run test:file -- packages/server/src/database-markdown-table-writer-process-crash.test.ts` | 25 repeated edit/reload/undo iterations plus cold rebuild every fifth iteration; no stale lock or snapshot drift. This is a bounded writer soak, not the full Git/migration reliability gate. |
| `V2-RELIABILITY-SOAK-001` | `bun run test:file -- packages/server/src/database-v2-reliability-soak.test.ts` | 1 pass / 56 assertions in 11.90s; 50,000-row v2 owner with 5,000 linked Markdown documents and 45,000 intentionally unmaterialized wikilinks, 10 edit→commit/push/fetch→Git branch checkout→migration rollback→cleanup iterations, cold store/parser reload on odd iterations, exact owner restoration, zero in-flight journals, zero leaked commit lock, and <768 MiB heap delta. This closes K-009 as a bounded release-gate soak; process-wide OOM ceilings and cross-editor production soak remain operational monitoring. |
| `HISTORY-V2-001` | `bun run test:file -- packages/server/src/database-record-index.test.ts` | 28 pass / 175 assertions include actor-bound v2 cell receipts for human/agent/sync/filesystem/system actors and durable journal history with database/source/record/property identity and before/after owner revisions. |

Fuzz corpus는 malformed input이 예외 없이 bounded diagnostic으로 끝나는 것을 보장하고,
invalid UTF-8 byte stream과 4초 child-process timeout 경계도 포함한다. Process-wide OOM
ceiling은 별도 운영 측정 대상이다. `MIG-CRASH-001`, `WRITER-CRASH-001`,
`GIT-V2-001`, real-Yjs/ProseMirror CRDT와 offline fixtures가 L-004의 deterministic
crash/conflict matrix를 구성한다. v2 desktop cold/reveal/Git parity는 focused fixture로
검증됐지만 cross-editor production soak는 release 이후 운영 관찰 항목이다.

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
cleanup approval, Git cold rebuild, Yjs semantic conflict classification, fresh Git clone의
inspect→rollback→cleanup runbook, 그리고 50k-row reliability soak는 재현된다. Deferred-cleanup
production-like operator sign-off remains a release-operations gate.
Release candidate에서는 `MIG-019`–`MIG-023`를 task-scoped same-volume staging,
post-commit cold rebuild, user undo, intervening edit conflict, deferred cleanup까지
실행하고, 각 결과의 `taskId`, `planHash`, file hash만 남긴다.

## 6. 다음 implementation order

1. L/I: deferred-cleanup operator rehearsal을 production-like 새 clone에서 실행하고
   `MIG-019`–`MIG-023` 결과, task hash, operator sign-off를 release record로 고정한다.
2. J: 기존 desktop `server.lock` lifecycle 실패를 별도 이슈로 해소하거나 명시적 waiver한
   뒤 `DESKTOP-GATE-001`을 재실행한다. v2 focused parity는 이 gate와 독립적으로 유지한다.
3. L: 실제 bounded opt-in pilot → new-default public rollout → legacy writer retirement을
   각각 별도 release record와 rollback window로 승인한다. RFC 0009의 compatibility
   retirement audit는 2.x 지원 창과 두 번의 zero-inventory audit 이후에만 시작한다.

## 7. Rollback path

- 구현 PR rollback: branch commit을 revert하고 새 database creation routing을 v1
  compatibility mode로 되돌린다. 이미 생성된 v2 owner-table은 v2 read/write 또는 migration
  recovery path로만 다룬다. v2 owner-table 파일을 v1 record writer가 다시 쓰는 dual-write
  fallback은 금지한다.
- 실행 중 migration: task cancel(아직 commit 전) 또는 retention 내 rollback(이미 commit 후)을
  사용한다. unknown external edit가 발견되면 자동 복구 대신 recovery-required 상태를
  유지한다.
- rollout rollback: 새 database creation policy를 v1 compatibility mode로 되돌리고, 이미 생성된
  v2 database는 v2 read/write 또는 migration recovery path를 유지한다. v2 canonical bytes를
  v1 writer가 다시 쓰도록 하는 dual-write fallback은 허용하지 않는다.
- cleanup rollback: cleanup 전 backup/journal material을 보존하고, expiry 전에는 cleanup을
  거부한다. expiry 후 material이 없으면 새 migration preview를 생성해야 한다.
