# RFC 0008 implementation checklist: Markdown table database storage

- 상태: Active, staged implementation (core/read contract, server writer/API, durable migration
  journal/task gate, app cell/row adapter, title/move writer, native lifecycle metadata/writer,
  capability response, derived/export contracts implemented; semantic merge, independent
  migration recovery evidence, performance/security evidence, and new-default rollout remain gated)
- 최종 수정: 2026-07-27
- Companion RFC: [Markdown table canonical database storage](./0008-markdown-table-canonical-database-storage.md)
- Current v1 tracker: [RFC 0001 implementation checklist](./0001-databases-implementation-checklist.md)

## 1. 이 checklist를 사용하는 방법

이 문서는 record-per-file v1에서 owner Markdown table v2로 전환하기 위한
normative implementation tracker다. RFC 0001의 기존 체크 표시는 v1 capability가
존재한다는 증거일 뿐이며 이 문서의 항목을 자동으로 완료시키지 않는다.

각 항목은 다음 증거가 모두 있을 때만 체크한다.

- 실제 production path가 shared core contract를 사용하고 mock 또는 한 surface의
  local adapter로만 구현되지 않았다.
- 변경된 behavior에 대한 focused test file과 실행 결과가 있다.
- Cross-package storage/API contract를 바꾸는 단계는 관련 domain/package 검사와
  필요한 repository compatibility gate를 통과했다.
- Parser, filesystem, migration 항목은 정상 경로뿐 아니라 malformed input,
  revision race, permission failure, process kill, disk-full 또는 rollback 중 해당되는
  failure case를 검증했다.
- Canonical bytes, logical typed state, stable identity, standalone clone 중 해당되는
  equivalence 증거가 있다.
- User-visible behavior에는 changeset과 public documentation이 있다. Test-only,
  docs-only implementation support에는 changeset이 필요하지 않다.
- PR 또는 release evidence에는 사용한 fixture, 명령, 통과한 assertion 수, 알려진
  한계가 기록되어 있다.

부분 구현, feature flag, unit test만 통과한 prototype은 항목 설명에 진행 증거를
추가할 수 있지만 checkbox를 완료하지 않는다. 한 항목이 여러 package를 열거하면
모든 package 경계가 연결되어야 완료다.

## 1.2 영역별 완료 판정 규칙

아래 표는 각 영역의 checkbox를 닫기 위한 최소 산출물이다. `구현됨`은 코드가
존재한다는 뜻이고, `완료`는 표의 모든 증거와 해당 영역의 개별 완료 기준을 통과했다는
뜻이다. 숫자 없는 “정상 동작” 설명이나 단일 happy-path unit test만으로는 완료로
판정하지 않는다.

| 영역 | 완료되어야 하는 구체적 결과 | 필수 증거와 실패 시 판정 |
| --- | --- | --- |
| A 계약/스키마 | manifest, marker, lifecycle metadata, capability matrix가 한 versioned schema로 parse되고 unknown version은 fail-closed | core schema fixture + Node/browser 동일 결과 + API `storageCapabilities` contract test. 한 surface가 다른 default writer를 선택하면 미완료 |
| B parser/codec | supported type 전부가 parse→typed value→canonical serialize→parse를 통과하고 invalid raw bytes를 보존 | type별 golden/limit±1/malformed fixture와 source-range assertion. parser가 cache나 last-known-good를 반환하면 미완료 |
| C identity/ownership | path/title/alias 변경에도 document/record ID가 불변이고 owner/link 중복은 명시적으로 차단 | rename/move/basename/alias/ambiguous/symlink fixture, duplicate owner/record diagnostic. first-match 추정이나 silent dedupe가 있으면 미완료 |
| D mutation/transaction | cell/row/document/lifecycle 변경이 expected revision, journal, compensation, undo를 거친다 | stale/permission/disk-full/process-kill/intervening-edit injection과 exact receipt. 일부 파일만 성공한 채 success를 반환하면 미완료 |
| E read/index/query | cache/task DB 삭제 후 owner+manifest+documents만으로 같은 record/query/search/export snapshot을 재구축 | cold rebuild, incremental invalidation, query cursor, malformed-owner degraded state, provenance dedup test. stale row가 fresh로 노출되면 미완료 |
| F Formula/Rollup | stable-ID AST/DAG, permission-aware evaluation, derived revision, no-persistence가 모든 read surface에서 동일 | formula/rollup value·error corpus, cycle/permission/error propagation, query/API/MCP/export revision equality. hidden target를 empty aggregate로 숨기면 미완료 |
| G 협업/Git/offline | different-cell edit는 자동 병합되고 same-cell/delete-vs-edit는 conflict 또는 recovery-required가 된다 | deterministic three-way/Yjs/offline/branch fixture와 cold rebuild equality. line-based fallback이 성공으로 오판하면 미완료 |
| H migration plan | 완전한 inventory, dependency closure, owner/title 선택, alias/metadata map, exact plan hash를 write 없이 생성 | unreadable/changed/symlink/limit fixture가 `complete:false` 또는 blocker를 반환하고 plan 밖 path가 0건. 누락된 key를 silently discard하면 미완료 |
| I migration apply/recovery | verified backup→isolated staging→activation→cold verification→rollback/undo 순서가 durable checkpoint로 재개된다 | backup read-back hash, checkpoint별 kill, unknown edit `rollback_blocked`, user undo, cleanup retention evidence. Git 존재만으로 backup을 대체하면 미완료 |
| J product/API/UX | Web/desktop/server/MCP/CLI가 같은 operation, plan hash, revision/error를 사용하고 recovery/accessibility 상태를 노출한다 | primary journey parity, strict API/MCP schema, UI restart/reconnect, keyboard/screen-reader/error-state test. raw generated path를 사용자에게 요구하면 미완료 |
| K 성능/보안/신뢰성 | hard limit, p50/p95/peak-memory budget, path safety, noninterference, telemetry allowlist가 수치로 고정된다 | seeded benchmark report, max+1 rejection, fuzz/timeout, symlink/disk-full/security matrix, content-free telemetry snapshot. “추후 측정”이면 미완료 |
| L conformance/release/removal | v1↔v2 differential, round-trip, standalone clone, docs/runbook, pilot/new-default/retirement decision이 traceable하다 | fixture ID별 결과와 release record, changeset, launch evidence, rollback path. checkbox만 있고 실행 명령/결과가 없으면 미완료 |

각 영역의 완료 기록에는 최소 `fixture ID`, 실행 명령, 통과 assertion 수 또는 수치,
실패 주입 지점, known limit, rollback 경로를 함께 남긴다. 이 기록이 없으면 코드는
병합할 수 있어도 checklist checkbox는 닫지 않는다.

## 1.1 현재 구현 증거와 미완료 경계

현재 branch에는 다음 foundation이 구현되어 있다. 이 목록은 milestone checkbox를
자동으로 완료시키지 않으며, 각 항목의 전체 완료 기준을 충족할 때만 본문
checkbox를 체크한다.

- Core manifest는 v1 active writer를 유지하면서 v2를 read-compatible version으로
  검증하고, source별 `markdown_table` storage binding과 migration alias metadata를
  strict schema로 검사한다.
- Core owner marker/GFM parser와 typed cell codec이 source range, escaped pipe,
  invalid raw value, document/relation wikilink, source-preserving cell/row splice를
  제공한다.
- 범용 `_sn.document_id`, source+document 기반 deterministic record ID, v1 legacy
  ID alias를 위한 순수 migration planner와 document identity insertion이 있다.
- Server record index가 v2 owner 문서만 발견하고 linked Markdown 문서를 cold rebuild하며,
  owner/document watcher edit를 재구성한다. 문서 ID가 없으면 path를 추정하지 않고
  explicit diagnostic을 남긴다.
- Server의 v2 writer가 expected owner/row/cell revision을 확인한 뒤 source-preserving
  cell/row splice, document-backed row 생성, row 삭제, post-write index rebuild, durable
  byte-exact receipt/undo를 수행한다. Title/move는 linked document와 owner wikilink를
  함께 journal하고, archive/restore/layout은 manifest `storageMetadata.recordLifecycle`
  metadata만 갱신한다. Data Plane HTTP route와 strict request/response
  schema, MCP tool, CLI/status surfaces가 이 boundary를 사용하며 v1 plan/commit은 v2
  schema/record-file target을 계속 차단한다.
- App에는 `/api/databases/markdown-table/mutate` 전용 client/gateway와 owner revision을
  운반하는 `storageRevision` read field가 있다. Full-page/inline cell edit와 기본 row
  create/delete는 v2 source에서 이 adapter를 선택하고 optimistic patch를
  conflict/refresh semantics와 함께 정리한다. Row create는 source folder 안의 normal
  Markdown document를 만들며, 기존 title/body template, Unique ID allocation, receipt-backed
  UI undo는 아직 gated다.
- Core/server에는 stable-ID Formula compile 및 cross-source dependency graph, shared
  wikilink resolver, semantic revision set, `canonical_markdown`/`computed_snapshot` export
  contract, 그리고 `storageCapabilities` compatibility matrix가 있다.
- Migration service는 preview/apply/verification/rollback/retry/resume를 durable task store와
  project journal로 연결한다. `.ok/local/database-migrations`의 before/after hash와
  migration gate를 재시작 시 복원하고 frozen v1 index issue는 preview blocker로 반환한다.
- v1 `assignRecordId`, folder onboarding, 기존 record-file commit은 v2 source에서
  `v2_storage_read_only` guard로 차단된다. 이는 v2 writer가 연결되기 전 dual-write를
  허용하지 않기 위한 안전장치다.

현재 production default로 활성화하지 않은 범위는 다음과 같다.

- v2 owner-table mutation은 dedicated storage-aware API/MCP/app route로 활성화되며, cell과
  기본 row create/delete/title/move/lifecycle가 이 route를 사용한다. 기존 generic
  desired-state plan/commit을 v2 row writer로 재사용하지 않는다. Native lifecycle의
  server receipt/undo는 구현됐지만 renderer-level receipt-backed UI undo/redo와
  new-default rollout은 아직 gated다.
- Durable v1→v2 migration task의 journal/gate와 cold verification은 연결되어 있다. 다만
  staged-root independent verification, crash-at-every-file checkpoint suite, user undo의
  full v1 byte restoration, deferred cleanup은 아직 release-candidate evidence가 아니다.
- Formula/Rollup은 owner table에 저장하지 않도록 schema가 보장하고, stable-ID compile/
  cross-source dependency contract, permission-denied derived error, derived revision
  transport, canonical/computed export contract가 core/server boundary에 있다. Relation
  wikilink resolver와 semantic diff/merge도 shared core를 사용한다. 다만 all-surface
  conformance, migration freeze equivalence, benchmark/security report는 미완료다.

## 2. 전환 중 절대 깨면 안 되는 stop conditions

다음 조건이 하나라도 발생하면 해당 source의 v2 write 또는 migration release를
중단한다.

- 한 source에 v1 frontmatter와 v2 table을 동시에 쓰는 code path가 존재한다.
- Database manifest와 그 모든 source의 active writer를 manifest version 하나로 결정할 수 없다.
- Owner table parse 실패 후 last-known-good 값을 canonical처럼 반환한다.
- Unknown 또는 invalid cell 값을 null, 빈 문자열, text로 silently coerce한다.
- Migration verification이 실패했는데 v1 cleanup을 수행한다.
- Rollback이 unknown external edit를 덮어쓴다.
- Formula/Rollup 결과를 owner table에 canonical cache로 기록한다.
- Relation/Rollup permission failure를 empty aggregate로 숨긴다.
- Generated source folder 또는 `rec_*` filename이 새 v2 database 생성 과정에 생긴다.
- Cache/task database 없이는 v2 catalog와 record를 재구축할 수 없다.

## 3. Milestones와 release gates

### V2-M0 — Contract freeze

Manifest v2, marker, cell codec, identity, lifecycle metadata, revision, transaction,
migration equivalence 계약이 코드와 fixture로 고정되어 있다. Production write는
아직 허용하지 않는다.

완료 기준:

- A와 B 영역이 모두 완료됐다.
- 모든 supported stored property가 golden fixture에서 parse/serialize round-trip한다.
- Title, archive/audit/layout override의 canonical target에 open design question이 없다.
- v1/v2 logical record adapter가 같은 transport-neutral type을 반환한다.

### V2-M1 — Read-only reconstruction

Standalone v2 fixture를 cache 없이 열어 catalog, records, relation, Formula/Rollup,
query를 읽을 수 있다.

완료 기준:

- C와 E의 read-only 항목 및 F의 deterministic evaluation 항목이 완료됐다.
- App/server/CLI가 v2 source를 mutation 없이 동일하게 조회한다.
- Duplicate owner, broken link, invalid cell, cycle, permission 오류가 explicit하다.

### V2-M2 — V2 mutation alpha

새 v2 database에서 create/edit/move/archive/delete/undo가 v1 writer 없이 동작한다.

완료 기준:

- D 영역이 완료됐다.
- Cell-local edit와 row/document multi-file transaction이 crash suite를 통과했다.
- Inline/full-page가 같은 writer를 사용하고 linked view는 reference-only다.
- 새 database 생성 후 content tree에 generated folder/file이 생기지 않는다.

### V2-M3 — Collaborative beta

Git, Yjs, offline queue, relation/Formula/Rollup의 동시 편집과 conflict recovery가
의미론적으로 안전하다.

완료 기준:

- F와 G 영역이 완료됐다.
- 다른 cell 변경은 자동 병합되고 같은 cell 변경만 conflict가 된다.
- Cross-source derived invalidation이 exact downstream만 갱신한다.
- Supported maximum fixture에서 numeric performance budget을 통과한다.

### V2-M4 — Migration release candidate

V1 source를 preview/approve/apply/verify/rollback할 수 있고 모든 데이터 손실 gate를
통과한다.

완료 기준:

- H와 I 영역이 완료됐다.
- 전체 migration fixture matrix가 v1→v2→v1 logical/byte equivalence를 통과했다.
- 모든 crash checkpoint에서 v1 또는 v2 한쪽의 valid state로만 복구된다.
- Existing v1 source는 migration 전까지 정상 read-only로 열리고 background
  auto-migration은 발생하지 않는다.

### V2-M5 — New-default

새 database는 v2로만 생성되고 v1 edit는 migration preview를 요구한다.

완료 기준:

- J, K, L의 new-default gate가 완료됐다.
- Web/desktop/CLI/API/MCP primary journeys가 동일한 writer routing을 증명한다.
- Pilot 기간의 critical data-loss, rollback, identity defect가 0건이다.
- Public release note, migration guide, recovery guide가 게시됐다.

### V2-M6 — V1 writer retirement

V1은 read-only import/migration source로만 남고 production mutation path에서 제거된다.

완료 기준:

- Runtime call graph와 focused guard test가 v1 writer 진입점 부재를 증명한다.
- V1 source에 대한 모든 mutation surface가 같은 migration-required error를 반환한다.
- V1 cleanup은 별도 승인/undo 가능한 destructive plan이다.
- Compatibility reader 제거는 별도 RFC와 release policy 없이는 수행하지 않는다.

## 4. 의존성 순서

```text
A. Contract/schema
  -> B. Parser/codec
  -> C. Identity/ownership
  -> E. Read model/index
  -> F. Formula/Rollup
  -> D. Mutation/transaction
  -> G. Collaboration/Git
  -> H. Migration planning
  -> I. Migration apply/recovery
  -> J. Product surfaces
  -> K. Performance/security
  -> L. Release/removal
```

D의 transaction primitive는 E/F와 병렬 개발할 수 있지만 production v2 writer는
B/C/E의 완료 전 활성화하지 않는다. Migration apply는 모든 앞선 storage/read/write
contract가 고정된 뒤에만 구현한다.

## A. Architecture, schema, and compatibility contract

- [x] **V2-A-001 — Manifest v2 strict schema.** `version: 2`와 source
  `storage.kind`, `formatVersion`, `owner.path`, `owner.blockId`,
  `titlePropertyId`, `storedPropertyIds`를 browser/Node 공용 core schema에 추가한다.
  Supported read versions와 default write version을 별도 contract로 둔다. 완료 기준:
  unknown key/version을 source-located diagnostic으로 거부하고 deterministic YAML
  parse/serialize와 1 MiB boundary test가 통과하며 M5 전에는 v2 read 지원이 새 database
  write default를 바꾸지 않는다.
- [x] **V2-A-002 — Stored/derived property partition.** Title과 모든 stored
  property만 `storedPropertyIds`에 허용하고 Formula, Rollup, audit-derived, button은
  거부한다. 완료 기준: property reorder/rename 후에도 ID binding이 유지되고 duplicate,
  missing title, unknown property, derived-column fixture가 모두 명시적으로 실패한다.
- [ ] **V2-A-003 — Title/document contract.** 기존 단일 Title property ID를 첫
  document-link 열에 유지하고 linked document title을 logical Title 값으로 정의한다.
  완료 기준: table edit, document title edit, path rename, alias stale, v1 title conflict의
  expected behavior가 core test와 UI contract test에서 동일하다.
- [x] **V2-A-004 — Lifecycle/audit/layout representation.** Migration baseline의
  `archivedAt`, created/edited time/actor, record layout override와 native v2
  `storageMetadata.recordLifecycle`를 strict schema에 보존한다. 완료 기준: v1 metadata
  fixture가 alias와 cold rebuild projection에서 손실 없이 매핑되고, native archive/restore/
  layout write가 manifest revision/journal/undo receipt를 사용하며 linked document에
  database 전용 frontmatter를 남기지 않는다.
- [x] **V2-A-005 — Record identity compatibility.** Native v2 deterministic ID와
  migrated v1 legacy alias의 생성, lookup, collision, deletion, non-reuse 규칙을 구현한다.
  완료 기준: old/new ID가 같은 row를 resolve하고 alias byte budget 초과와 duplicate
  alias는 plan 단계에서 막히며 receipt가 두 ID를 모두 기록한다.
- [x] **V2-A-006 — Active writer routing.** Top-level manifest version을 해당 database의
  모든 source writer 선택에 대한 유일한 권위로 만든다. 완료 기준: v1/v2 read compatibility는 가능하지만 한 mutation
  transaction이 두 writer target을 포함하면 invariant error로 실패하는 guard test가 있다.
- [ ] **V2-A-007 — Revision contract.** Manifest, owner document, table structure,
  row, cell, document, derived snapshot revision 계산을 명세하고 구현한다. 완료 기준:
  unrelated prose/row 변경이 해당하지 않는 semantic revision을 바꾸지 않고 모든
  transport가 같은 revision을 직렬화한다.
- [x] **V2-A-008 — Limits contract.** Marker bytes, owner document bytes, row,
  column, cell, complex JSON, relation targets, alias count의 hard limit을 core constants와
  public error schema에 둔다. 완료 기준: limit-1/limit/limit+1 fixtures가 app/server/CLI에서
  같은 결과를 내고 limit 초과 write가 파일을 만들지 않는다. 현재 값은 marker 16 KiB,
  owner 4 MiB, 100k rows, 200 columns, cell 64 KiB, JSON 128 KiB/depth 16, relation
  targets 100, alias 512 bytes, migration aliases 10k, manifest 1 MiB다.
- [x] **V2-A-009 — Compatibility matrix.** Supported app version × manifest/table
  version × writer/read-only behavior를 문서와 machine-readable capability response에
  추가한다. 완료 기준: newer unknown version은 downgrade write 없이 read-only/unsupported
  상태를 명시하고 UI/API/MCP 메시지가 일치한다. Core matrix와 full describe response가
  같은 four-state vocabulary를 반환한다.

### A 영역 완료 기준

- Manifest/marker/identity/lifecycle 계약에 `TBD`나 surface별 예외가 없다.
- Schema fixture가 standalone clone에 포함되고 browser와 Node parse 결과가 같다.
- V1과 v2의 logical `DatabaseDefinition`/`DatabaseRecord` 차이는 storage adapter 아래로
  격리되어 query, permission, Agent Data Plane type이 분기되지 않는다.
- Storage format 변경에 대한 changeset과 compatibility documentation draft가 준비됐다.

완료 증거: `packages/core/src/database/schema.ts`, `markdown-table.ts`,
`markdown-table-migration.ts`, `document-identity.ts`와
`markdown-table-storage.test.ts`, `markdown-table-migration.test.ts`,
`markdown-table.test.ts`, `storage-capability.test.ts`, `markdown-table-revision.test.ts`가 공용 계약을 검증한다. `bun run --cwd packages/core typecheck`
및 관련 core focused tests가 통과했고, changeset은
`.changeset/v2-markdown-table-foundation.md`다. Native lifecycle schema/writer와 capability
response는 구현 증거에 포함되지만 new-default 활성화는 M5 gate다.

## B. Owner marker, GFM table parser, and cell codec

- [x] **V2-B-001 — Marker scanner.** Markdown AST/source에서 versioned
  `synapsenote:database` marker와 immediate GFM table range를 찾는다. 완료 기준:
  fenced code, inline HTML, quoted marker, nested list, malformed comment를 owner로 오인하지
  않고 line/column/source range diagnostic을 반환한다.
- [x] **V2-B-002 — Owner table structural parser.** Header/separator/row/column을
  source range와 함께 parse한다. 완료 기준: CRLF/LF, BOM, Unicode, escaped pipe/backslash,
  empty cell, alignment marker, trailing spaces fixture를 의미 손실 없이 처리한다.
- [x] **V2-B-003 — Marker/schema binding.** Marker IDs와 manifest owner/property
  IDs를 bind한다. 완료 기준: wrong database/source/block, column count/order mismatch,
  duplicate owner가 explicit invalid source가 되며 raw bytes는 보존된다.
- [x] **V2-B-004 — Primitive codecs.** Text, number, checkbox, date, select,
  status, URL, email, phone, unique ID codec을 구현한다. 완료 기준: 각 타입별 canonical,
  accepted-noncanonical, invalid, null, empty-string golden corpus가 parse→serialize→parse에서
  typed equality와 invalid raw preservation을 통과한다.
- [x] **V2-B-005 — Structured codecs.** Multi-select, person, files, place와
  versioned compact JSON 값을 구현한다. 완료 기준: canonical key order, duplicate detection,
  escape, maximum depth/item count/bytes, unknown field behavior가 fixture로 고정된다.
- [x] **V2-B-006 — Document and relation codecs.** Title cell의 단일 document
  wikilink와 relation cardinality one/many wikilink를 구현한다. 완료 기준: alias, encoded
  path, ambiguous basename, missing target, heading/embed prohibition, duplicate target가 stable
  diagnostic code로 materialize된다.
- [x] **V2-B-007 — Invalid raw preservation.** Invalid cell을 typed null로 바꾸지
  않고 raw text와 issue를 유지한다. 완료 기준: unrelated cell edit 후 invalid cell의 exact
  bytes가 같고 API가 `invalidValues`와 source location을 반환한다.
- [x] **V2-B-008 — Source-preserving serializer.** Cell/row/column structural map을
  이용해 최소 source range만 splice한다. 완료 기준: 한 셀 edit fixture에서 owner 문서의
  나머지 bytes hash가 같고 external alignment/header/prose formatting을 재작성하지 않는다.
- [ ] **V2-B-009 — Parser security and fuzzing.** Bounded parser와 fuzz corpus를
  추가한다. 완료 기준: oversized rows, adversarial escapes, deeply nested JSON, invalid UTF-8
  boundary, catastrophic-pattern inputs가 정해진 CPU/memory limit에서 crash/hang 없이
  실패하며 corpus가 regression test에 등록된다.

### B 영역 완료 기준

- 모든 supported stored property에 codec conformance table과 golden fixture가 있다.
- Parse와 serialize는 locale/timezone/platform에 독립적이며 Web/Node 결과가 byte 또는
  documented canonical equivalence를 만족한다.
- Malformed source에 대한 어떠한 repair도 preview/approval 없이 원본을 쓰지 않는다.
- Table parser가 generic Markdown table behavior를 변경하지 않고 marker-owned range에만
  활성화된다는 editor regression test가 통과한다.

완료 증거: `packages/core/src/database/markdown-table.ts`의 bounded scanner/codec과
`markdown-table.test.ts`, `markdown-table-storage.test.ts`,
`markdown-table-record.test.ts`, `markdown-table-links.test.ts`가 source range, escaped
pipes, typed/structured values, invalid raw, limit boundary와 source-preserving splice,
relative/basename/alias/ambiguous wikilink resolution을 검증한다. Fuzz/timeout corpus는
B-009 release gate로 남아 있다.

## C. Document, record, and owner identity

- [x] **V2-C-001 — Generic document ID.** 일반 Markdown document의
  `_sn.document_id` parse/assign/collision/rename contract를 구현한다. 완료 기준: database에
  속하지 않은 문서에도 같은 ID contract를 사용하고 assignment가 unrelated frontmatter와
  body bytes를 보존한다.
- [x] **V2-C-002 — Deterministic record ID.** `(sourceId, documentId)`로 native v2
  record ID를 생성한다. 완료 기준: 경로/title 변경에서 불변이고 같은 document가 다른
  source에 참여할 때 다른 ID를 가지며 platform-independent test vector가 고정된다.
- [x] **V2-C-003 — Owner uniqueness.** Workspace 전체에서 source별 owner를 찾고
  0/1/2개 상태를 구분한다. 완료 기준: duplicate block/source ID는 양쪽 위치를 포함한
  diagnostic과 repair preview를 반환하고 mutation을 거부한다.
- [ ] **V2-C-004 — Copy/paste identity.** Owner block 또는 owner document 복사 시
  새 독립 DB와 linked view 중 명시적 선택을 요구한다. 완료 기준: silent duplicate owner가
  만들어지지 않고 undo가 원본/복사본 identity를 정확히 복구한다.
- [x] **V2-C-005 — Wikilink resolution.** Relative/path-qualified/basename/alias
  resolution을 content root와 case-sensitivity contract에 맞춘다. 완료 기준: ambiguous,
  missing, symlink escape, outside-root가 동일한 core resolver에서 실패한다.
- [ ] **V2-C-006 — Document rename/move.** Existing rename log와 transaction으로
  Title/relation cells의 path를 갱신한다. 완료 기준: document ID/record ID는 유지되고 모든
  affected owner range가 exact plan에 나타나며 partial rewrite가 rollback된다.
- [ ] **V2-C-007 — Membership/delete semantics.** Row removal, document deletion,
  record+document deletion, database deletion을 별도 intent로 구현한다. 완료 기준: 기본 row
  delete는 문서를 보존하고 broken link는 행을 자동 삭제하지 않으며 destructive plan에
  exact document targets가 표시된다.
- [ ] **V2-C-008 — Identity repair.** Missing/duplicate document ID, duplicate row,
  stale alias를 read-only diagnose하고 repair plan을 생성한다. 완료 기준: repair가 stable
  reference rewrite scope와 potential loss를 보여주며 approval/undo를 거친다.

C-001~003 및 C-005 완료 증거: `packages/core/src/database/document-identity.ts`,
`markdown-table-migration.ts`, `packages/server/src/database-record-index.ts`와
`markdown-table-migration.test.ts`, `database-record-index.test.ts`가 generic identity,
source+document deterministic ID, duplicate owner/record diagnostics와 shared wikilink
resolver의 path/basename/alias diagnostics를 검증한다. Copy/paste, relation-wide
rename/move repair와 identity repair는 아직 release gate다.

### C 영역 완료 기준

- Path, title, alias, view order가 database/source/property/document/record identity를
  바꾸지 않는 metamorphic test가 통과한다.
- 한 document가 여러 source에 참여하는 fixture에서 membership과 scalar values가 source별로
  분리된다.
- 모든 identity 문제는 silent dedupe 없이 explicit diagnostic 또는 blocked mutation이다.
- Existing record-open, backlinks, graph, search가 generated storage path가 아닌 linked
  document path를 사용한다.

## D. Mutation, transaction, undo, and filesystem recovery

- [x] **V2-D-001 — Cell-local mutation.** Stable block/record/property ID와 expected
  revisions로 한 cell을 update한다. 완료 기준: unrelated bytes와 semantic revisions가
  유지되고 stale cell/table/document revision은 source-located conflict를 반환한다.
- [x] **V2-D-002 — Row creation.** Normal Markdown document와 wikilink row를 한
  plan/transaction으로 생성한다. 완료 기준: title/path collision, required/default/unique ID,
  document ID assignment을 preview하고 어느 write가 실패해도 둘 다 canonical로 남지 않는다.
- [ ] **V2-D-003 — Title edit.** Table Title edit와 document H1/title edit가 같은
  stable-ID mutation path를 사용한다. 완료 기준: path를 자동 rename하지 않고 두 surface의
  optimistic state/commit/undo가 동일한 logical result를 낸다.
- [x] **V2-D-004 — Multi-cell/bulk mutation.** 여러 row/property 변경을 structural
  ranges로 계획하고 한 owner document splice로 합친다. 완료 기준: overlapping range를
  deterministic하게 거부/병합하고 partial table serialization을 만들지 않는다.
- [ ] **V2-D-005 — Multi-file journal.** Manifest, owner, linked documents 변경의
  before/after hash, order, checkpoint를 durable하게 저장한다. 완료 기준: process kill을
  각 checkpoint에 주입해 restart가 exact forward-complete 또는 rollback을 수행한다.
- [ ] **V2-D-006 — Manifest activation boundary.** Activation 전 write는 v1을 계속
  읽을 수 있는 additive artifact로 제한하고 v2 manifest switch 뒤에 v1 cleanup을 수행한다.
  완료 기준: crash fixture 어느 시점에서도 reader가 v1/v2 mixed active state를 canonical로
  materialize하지 않는다.
- [ ] **V2-D-007 — Verified commit.** Commit 후 cold parse/index와 intended logical
  diff를 검증한다. 완료 기준: plan/actual file hash와 logical row/property diff equality가
  100%이며 verification 실패 시 success receipt를 발행하지 않는다.
- [x] **V2-D-008 — Undo/rollback.** Expected result revision과 before bytes에 묶인
  reverse transaction을 제공한다. 완료 기준: unchanged state는 byte-exact 복구되고 intervening
  edit는 덮어쓰지 않고 path/cell conflict preview를 반환한다.
- [x] **V2-D-009 — External edit ingestion.** File watcher가 owner/document external
  edit를 structural event로 materialize한다. 완료 기준: incomplete save, atomic rename,
  malformed table, rapid duplicate event가 last-known-good overwrite 없이 정확히 진단된다.
- [x] **V2-D-010 — V1 writer prohibition.** V2 transaction target builder에서
  database-owned record frontmatter write를 구조적으로 불가능하게 한다. 완료 기준: runtime
  assertion, focused call-path test, static search allowlist가 모두 v2 mutation의 v1 writer
  invocation을 잡는다.

### D 영역 완료 기준

- Create/edit/move/archive/delete(활성 lifecycle metadata 정리 포함)/bulk/undo가 web-independent server/core contract test에서
  먼저 통과한다.
- Disk full, permission loss, stale lock, interrupted rename, process kill, external edit race의
  failure-injection matrix가 expected recovery state를 증명한다.
- Transaction receipt만으로 exact touched paths, hashes, source IDs, plan, actor, verification,
  undo availability를 설명할 수 있다.
- 어떤 실패도 temporary/staging file을 content tree의 사용자 문서로 노출하지 않는다.

완료 증거: `packages/server/src/database-markdown-table-writer.ts`와
`database-markdown-table-journal.ts`가 owner revision, row/cell splice, create-row
multi-file compensation, delete-row, receipt/undo, symlink/path guard와 index refresh를
제공한다. `database-markdown-table-journal.test.ts`, `database-record-index.test.ts`,
`database-data-plane.test.ts`에서 stale/external edit, rollback, v1 guard를 검증하고,
`database-data-plane-api.test.ts`/`mcp/tools/database-markdown-table.test.ts`가 production
route를 검증한다. Native server archive/audit/layout mutation과 title/move receipt/undo는
구현되어 있지만 process-kill-at-every-file, user-facing receipt-backed redo와 full
renderer parity가 미완료이므로 D 영역 전체 gate는 닫히지 않았다.

## E. Materialization, index, query, search, and export

- [x] **V2-E-001 — Storage-neutral record adapter.** V1 frontmatter reader와 v2 table
  reader가 같은 logical record type을 반환한다. 완료 기준: transport/query code에 storage
  version switch가 없고 differential fixture의 typed snapshots가 같다.
- [x] **V2-E-002 — Cold catalog rebuild.** Manifest와 owner documents만 scan하여
  database/source/owner catalog를 만든다. 완료 기준: cache 삭제 후 duplicate/missing owner
  diagnostic과 정상 catalog를 deterministic order로 반환한다.
- [x] **V2-E-003 — Table record index.** Row source range, document ID/path, canonical/
  legacy record ID, typed/invalid values를 index한다. 완료 기준: restart/cache loss 후 row count,
  revisions, issues가 canonical parse와 일치한다.
- [x] **V2-E-004 — Incremental invalidation.** Owner cell/row/schema/document rename
  event가 exact index entry와 downstream dependency만 갱신한다. 완료 기준: instrumentation
  test가 unrelated source/row recomputation 0건을 확인한다.
- [ ] **V2-E-005 — Snapshot query parity.** Filter/sort/group/projection/pagination이
  v1과 같은 logical semantics를 유지한다. 완료 기준: differential corpus에서 record ID
  sequence, completeness, cursors, invalid/error handling이 일치한다.
- [ ] **V2-E-006 — Search deduplication.** Generic document body/title와 database cell
  index가 같은 내용을 duplicate result로 만들지 않는다. 완료 기준: result provenance가
  document/database projection을 구분하고 permission filtering이 동일하다.
- [x] **V2-E-007 — Record open/navigation.** Query row가 linked normal document를
  연다. 완료 기준: tabs/backlinks/graph/history가 record storage folder를 요구하지 않고 broken
  document는 repair action과 함께 남는다.
- [ ] **V2-E-008 — Export semantics.** Canonical Markdown export와 computed snapshot
  export를 분리한다. 완료 기준: computed snapshot은 revisions/timestamp를 표시하고 owner
  marker가 없어 re-import 시 duplicate owner가 되지 않는다.

### E 영역 완료 기준

- Cold rebuild, incremental watcher update, query, search, export가 cache를 canonical로 취급하지
  않는다.
- V1/v2 differential suite가 supported property/query matrix에서 logical parity를 증명한다.
- UI, HTTP, MCP가 같은 snapshot revision과 invalid/partial semantics를 반환한다.
- Owner table이 malformed면 stale rows를 fresh로 표시하지 않고 source 전체 상태를 explicit하게
  degraded/invalid로 반환한다.

완료 증거: `packages/server/src/database-record-index.ts`는 v2 owner/linked document만
cold scan하고 `storageRevision`, canonical/legacy ID alias, lifecycle projection, invalid
issues를 storage-neutral `DatabaseRecord`로 반환한다. `database-record-index.test.ts`의
v2 rebuild/incremental/lifecycle/duplicate-owner tests와 core `markdown-table-record.test.ts`
가 cache 없는 rebuild와 source-preserving refresh를 검증한다. Differential query/export와
search provenance는 아직 E-005/E-006/E-008 gate다.

## F. Formula, Rollup, relation graph, and derived snapshots

- [x] **V2-F-001 — Stable-ID Formula compile.** User expression의 name/key/alias를
  stable property ID AST로 compile/typecheck한다. 완료 기준: rename 후 AST/revision이 안정적이고
  ambiguous/unknown/type mismatch/unsupported function이 commit 전에 실패한다.
- [ ] **V2-F-002 — Deterministic evaluator.** Web/server가 같은 pure evaluator와
  frozen time/timezone/locale context를 사용한다. 완료 기준: conformance corpus의 value/error와
  serialization이 OS/runtime별 같다.
- [x] **V2-F-003 — No derived persistence.** Formula/Rollup 결과를 owner table,
  manifest, linked document에 쓰지 않는다. 완료 기준: compute/filter/sort/export 후 Git diff가
  없고 cache 삭제 후 같은 derived result를 재구축한다.
- [x] **V2-F-004 — Relation resolution.** Relation wikilink를 target source의 document/
  record ID로 resolve한다. 완료 기준: one/many cardinality, order/set semantics, missing,
  ambiguous, duplicate, permission fixture가 explicit value/error를 낸다.
- [x] **V2-F-005 — Cross-source dependency DAG.** Formula/Rollup을 하나의 graph로
  compile하고 source 간 cycle을 검출한다. 완료 기준: self, same-source, multi-source cycle
  fixture가 schema commit 전에 exact dependency path와 함께 거부된다.
- [x] **V2-F-006 — Reverse relation index.** Target value 변경에서 incoming relation과
  downstream derived property를 찾는다. 완료 기준: one cell 변경 시 expected dependent
  row/property set과 actual invalidation set이 정확히 같다.
- [ ] **V2-F-007 — Derived revision.** Manifest/table/dependency/permission/evaluation
  context revision을 hash한 snapshot을 모든 surface가 공유한다. 완료 기준: filter/sort/view/API/
  MCP/export가 하나의 query에서 서로 다른 derived revision을 섞지 않는다.
- [x] **V2-F-008 — Permission-safe aggregation.** Hidden target를 silently exclude하지
  않는 policy를 적용한다. 완료 기준: count/sum/show-original 등 rollup 함수별 allowed/redacted/
  denied principal 결과가 security fixture와 일치한다.
- [ ] **V2-F-009 — Migration equivalence.** Frozen v1 input과 v2 staged input으로
  Formula/Rollup을 재평가한다. 완료 기준: value 또는 `#TYPE!/#REF!/#CYCLE!/#AMBIGUOUS!/
  #INVALID!/#PERMISSION!` code가 property/record별 deep-equal이다.

### F 영역 완료 기준

- Formula/Rollup 결과의 canonical write path가 코드와 format에 존재하지 않는다.
- 한 input 변경에 대한 invalidation fan-out이 dependency oracle과 exact-match한다.
- Cross-version relation은 storage-neutral read adapter로만 동작하고 어느 source에도
  mixed writer를 만들지 않는다. Compatibility adapter 제거 gate와 target revision
  invalidation test가 있다.
- Web/server/worker에서 같은 conformance vectors와 numeric/date semantics가 통과한다.

완료 증거: `packages/core/src/database/derived-records.ts`, `derived-contract.ts`,
`derived-contract.test.ts`, `markdown-table-derived.test.ts`, `relation-dependency.ts`와
`relation-dependency.test.ts`가 stable-ID Formula compile, cross-source dependency graph,
storage-neutral Formula/Rollup evaluation, relation wikilink projection, reverse edge와
permission/evaluation-bound derived revision을 검증한다. Hidden target가 있는 Rollup은
`permission_denied` derived error로 유지하며 query/preview test가 값을 숨긴다.
Migration equivalence와 all-surface derived revision/export transport는 F-002/F-007/F-009
release gate다.

## G. Git, realtime collaboration, offline, and conflict recovery

- [x] **V2-G-001 — Semantic table diff.** Block/record/property ID 단위 변경을 추출한다.
  완료 기준: formatting-only, row reorder, header rename, cell value, row insert/delete가 서로 다른
  semantic operation으로 분류된다.
- [x] **V2-G-002 — Three-way semantic merge.** Base/ours/theirs table을 cell 단위로
  병합한다. 완료 기준: 서로 다른 cell은 자동 병합, 같은 cell divergent edit는 conflict,
  delete-vs-edit와 duplicate owner는 명시적 conflict가 된다.
- [x] **V2-G-003 — Formatting preservation in merge.** Value merge가 unrelated prose,
  table alignment, newline style을 전면 재작성하지 않는다. 완료 기준: golden merge fixture의
  unaffected byte ranges가 base/selected side와 같다.
- [ ] **V2-G-004 — Yjs/ProseMirror mapping.** Database UI mutation을 owner document의
  cell-local CRDT transaction으로 변환한다. 완료 기준: two-client different-cell/same-cell/
  row-delete race가 semantic merge contract와 같은 결과를 낸다.
- [ ] **V2-G-005 — Offline queue rebase.** Queued mutation을 stable IDs와 expected
  revisions로 rebase한다. 완료 기준: moved document, reordered table, changed schema,
  deleted row에서 silent wrong-cell write 없이 apply 또는 user-resolvable conflict가 된다.
- [ ] **V2-G-006 — Git branch/sync recovery.** Branch switch/rebase/merge 뒤 owner
  discovery와 index를 재구축한다. 완료 기준: duplicate owner, missing target, partial migration
  journal을 감지하고 stale cache를 fresh로 노출하지 않는다.
- [ ] **V2-G-007 — Attribution/history.** Cell/document/schema transaction의 actor와
  before/after를 history에 연결한다. 완료 기준: human/agent/sync/filesystem actor가 같은 logical
  row/property identity로 조회되고 undo target이 명확하다.

### G 영역 완료 기준

- Deterministic conflict corpus가 human/human, human/agent, agent/agent, filesystem/CRDT,
  Git/CRDT 조합을 포함한다.
- Line-based fallback이 owner table conflict를 무해한 성공으로 오판하지 않는다.
- Offline/Git recovery 후 cold rebuild snapshot이 merge 결과와 일치한다.
- Collaboration path가 v1 record files나 generated source folder를 다시 만들지 않는다.

완료 증거: `packages/core/src/database/markdown-table-diff.ts`와
`markdown-table.test.ts`가 formatting-only/cell/row/header/reorder diff, different-cell
three-way merge, same-cell/delete-vs-edit conflict와 unaffected byte preservation을
검증한다. Caller가 resolved record ID를 `rowKey`로 제공하는 semantic identity binding,
Yjs/offline/Git production integration은 아직 G-004~007 gate다.

## H. V1 migration discovery, preflight, and exact planning

- [x] **V2-H-001 — Complete inventory.** Manifest/source/records/view references,
  revisions, raw/typed values, identity, metadata, dependencies를 read-only scan한다. 완료 기준:
  unreadable file 한 개라도 있으면 `complete: false` 또는 blocked가 되고 committable plan을
  반환하지 않는다.
- [ ] **V2-H-002 — Dependency closure.** 선택한 v1 manifest의 모든 source를 write
  closure에 포함하고 cross-database Relation/Rollup target을 version-pinned read dependency
  또는 migration target으로 포함한다. 완료 기준: unresolved target이나 mixed writer를 만들
  subset은 exact missing dependencies와 함께 막힌다.
- [x] **V2-H-003 — Cell round-trip preflight.** 모든 stored raw value를 v2 codec으로
  encode/decode한다. 완료 기준: property/record/path별 typed equivalence 또는 preserved-invalid
  proof가 없으면 apply 불가다.
- [ ] **V2-H-004 — Owner selection.** Inline/full-page/새 normal document 후보를
  source마다 preview한다. 완료 기준: duplicate/missing owner, occupied path, unsafe path,
  user choice가 plan hash에 포함된다.
- [ ] **V2-H-005 — Title and document plan.** Document ID assignment, v1/document title
  conflict, generated path rename, wikilink rewrite를 계획한다. 완료 기준: 각 conflict가
  keep/use/custom 선택을 요구하고 preview 없는 rename이 없다.
- [x] **V2-H-006 — Identity/metadata plan.** Legacy record alias, archive/audit/layout
  mapping과 byte budget을 계산한다. 완료 기준: alias collision/orphan/manifest limit 초과는
  truncation 없이 blocker다.
- [ ] **V2-H-007 — Relation/derived preflight.** Relation target mapping과 frozen
  Formula/Rollup baseline을 만든다. 완료 기준: evaluation timestamp/timezone/permission revision이
  plan에 고정되고 unresolved target/cycle/error mismatch가 explicit하다.
- [x] **V2-H-008 — Exact file diff.** Create/update/rename/delete path와 before/after hash,
  frontmatter key disposition, owner table preview를 만든다. 완료 기준: plan에 없는 path/range를
  apply engine이 쓸 수 없고 summary count가 detailed target set과 일치한다.
- [x] **V2-H-009 — Approval and plan binding.** User/agent approval을 canonical plan hash,
  expected snapshot, warnings/loss acknowledgements에 bind한다. 완료 기준: 어느 revision이나
  choice가 바뀌어도 기존 approval 재사용이 거부된다.
- [ ] **V2-H-010 — Migration fixture matrix.** Generated blank, existing folder,
  inline/full-page, multi-source relation, all property types, invalid raw, archive/layout,
  CRLF/BOM/Unicode, size boundary fixture를 준비한다. 완료 기준: fixture마다 documented expected
  plan과 blocker/warning/result가 있다.

### H 영역 완료 기준

- Preflight는 어떠한 canonical file도 쓰지 않는다는 filesystem snapshot test가 통과한다.
- Plan UI/API/MCP가 같은 target count, warnings, blockers, hashes, choices를 반환한다.
- Every v1-owned frontmatter key가 preserve/move/remove 중 정확히 하나로 분류된다.
- 사용자에게 보이지 않는 lossy default, partial inventory, auto-rename, auto-owner-selection이 없다.

완료 증거: `packages/core/src/database/markdown-table-migration.ts`의 pure planner가
document ID 삽입, typed/raw codec round-trip, title conflict, alias/lifecycle mapping,
owner/manifest size와 exact linked/owner bytes를 계산한다. `database-task-service.ts`는
frozen index issues를 blocker로 연결하고 `database-task-service.test.ts`의 no-write preview,
plan hash/`migrationCommittedAt` binding, invalid-index blocker tests가 통과한다. Cross-database
dependency closure와 user-selected owner candidates는 H-002/H-004/H-007/H-010 gate다.

## I. Migration apply, verification, retry, rollback, and cleanup

- [x] **V2-I-001 — Durable task state machine.** RFC의 discovered→committed/
  rollback states와 legal transition을 구현한다. 완료 기준: restart/resume/idempotency test가
  duplicate apply나 skipped verification을 만들지 않는다.
- [x] **V2-I-002 — Source write freeze.** Apply 전에 app/API/MCP/offline/automation
  mutation을 막는다. 완료 기준: 모든 data-plane mutation surface가 same retryable
  `transaction_in_progress`/`migration_in_progress` problem과 task ID를 반환하고, active
  transition 중에는 stale read 대신 fail-closed diagnostic을 반환한다.
- [x] **V2-I-003 — Verified backup.** 대상 before bytes/Git blobs/journal을 durable하게
  저장하고 read-back hash를 검사한다. 완료 기준: backup verification 실패 시 staging에
  진입하지 않고 Git availability만으로 복구 가능성을 가정하지 않는다.
- [ ] **V2-I-004 — Isolated staging.** v2 manifest/owner/documents를 task-scoped same-volume
  staging에 생성한다. 완료 기준: canonical v1 bytes가 변하지 않고 staging result hash가
  approved plan과 정확히 같다.
- [x] **V2-I-005 — Staged cold verification.** Migration output을 cache 없는 workspace로
  열어 equivalence matrix를 검사한다. 완료 기준: IDs/counts/values/invalid/raw/title/relations/
  derived/permissions/query/body hashes가 모두 pass해야 committing 상태로 전이한다.
- [ ] **V2-I-006 — Manifest activation cutover.** V1-readable additive artifact를
  먼저 쓰고 v2 manifest를 활성화한 뒤 v1 cleanup을 수행한다. 완료 기준: 각 write boundary
  process-kill test가 mixed active writer 없이 valid v1 또는 valid v2로 recovery된다.
- [ ] **V2-I-007 — Post-commit cold rebuild.** Cache/index 삭제 후 v2 catalog/query를
  재구축하고 v2 mutation dry-run을 실행한다. 완료 기준: v1 writer target 0개, logical planned/
  actual equality, derived revision consistency가 확인돼야 success receipt를 발행한다.
- [x] **V2-I-008 — Automatic failure rollback.** Cutover/post-verification 실패 시
  before bytes를 복구한다. 완료 기준: v1 manifest/index/logical snapshot hash가 exact before와
  일치하고 unknown external edit는 overwrite 대신 `rollback_blocked`가 된다.
- [ ] **V2-I-009 — User undo.** Committed migration을 retention window 안에 reverse한다.
  완료 기준: no-intervening-change는 byte-exact v1 복구, intervening-change는 per-path/cell
  conflict preview, expired/missing backup은 명시적 refusal이다.
- [x] **V2-I-010 — Cancel/retry semantics.** Commit 전 cancel과 commit 후 rollback을
  구분한다. 완료 기준: same plan retry는 idempotent하고 blocker 수정 뒤 old plan/approval은
  재사용되지 않는다.
- [ ] **V2-I-011 — Deferred cleanup.** V1 generated artifacts와 migration compatibility
  metadata cleanup을 별도 destructive plan으로 구현한다. 완료 기준: retention/cold rebuild/
  mutation/undo/standalone clone gates가 모두 통과하고 linked documents는 기본 보존된다.
- [ ] **V2-I-012 — Recovery tooling.** Interrupted task inspect, resume, rollback,
  export diagnostics 명령을 제공한다. 완료 기준: UI 없이 CLI/server recovery가 가능하고
  content-redacted support bundle이 task state/hashes/errors를 설명한다.

### I 영역 완료 기준

- Failure injection이 모든 durable transition과 file-operation checkpoint를 커버한다.
- V1→v2 성공, 실패 rollback, 사용자 undo 각각에서 cold logical snapshot evidence가 있다.
- 성공/실패/rollback receipt가 exact files, IDs, revisions, verification checks를 포함한다.
- Cleanup 전까지 recovery material이 유지되고 cleanup 자체도 preview/approval/undo policy를
  따른다.

완료 증거: `database-task-service.ts`의 task-scoped verified `backup.json` before-image,
`database-migration-journal.ts`,
`database-migration-gate.ts`가 task checkpoint, project-scoped before/after hash journal,
restart gate hydration, stale snapshot/plan timestamp binding, rollback/retry/resume를
연결한다. `database-migration-journal.test.ts`, `database-migration-gate.test.ts`,
`database-task-service.test.ts`, `database-data-plane.test.ts`가 clean retry, unknown-edit
recovery-required, active write/read freeze, cold v2 verification을 검증한다. Backup file
count/revision read-back은 I-003 evidence이고, isolated staging root, process-kill-at-every-file,
user undo/deferred cleanup은 I-004/I-006/I-009/I-011/I-012 release gates다.

## J. App, desktop, server API, MCP, CLI, and user experience

- [x] **V2-J-001 — Versioned API contract.** Catalog/describe/query/plan/commit/undo/task가
  storage-neutral logical types와 v2 revision/error를 노출한다. 완료 기준: app/MCP contract
  tests가 동일 payload semantics를 확인하고 raw filesystem path는 승인된 preview 외에 노출하지
  않는다.
- [x] **V2-J-002 — Owner table editor integration (cell alpha).** Marker-owned GFM table을
  database renderer로 열고 source mode와 visual mode가 같은 bytes를 편집한다. 완료 기준:
  v2 cell edit가 owner revision을 전송하고 stale conflict/reload를 거치며 generic table
  regression 없이 server API route로 도달한다. Row lifecycle/receipt-backed UI undo는 별도 gate다.
- [x] **V2-J-003 — Unified inline/full-page controller (cell path).** 두 surface가 같은
  read model과 storage-aware cell writer를 사용한다. 완료 기준: v2 source에서 두 surface가
  `storageRevision` precondition을 쓰고 generated folder branch를 만들지 않는다. 전체
  property/row lifecycle parity는 별도 gate다.
- [ ] **V2-J-004 — Linked view reference-only behavior.** Linked view가 owner source를
  projection하고 row를 복사하지 않는다. 완료 기준: view copy/filter/sort/delete가 owner bytes를
  값 복제 목적으로 쓰지 않고 source deletion diagnostic이 explicit하다.
- [ ] **V2-J-005 — Migration preview UX.** Source/record/property/path diff, blockers,
  warnings, title/path choices, backup/rollback을 단계별로 표시한다. 완료 기준: keyboard/screen
  reader로 모든 선택과 approval이 가능하고 destructive/loss acknowledgement가 분리된다.
- [ ] **V2-J-006 — Progress/recovery UX.** Durable task phase, progress, cancelability,
  retry, rollback, recovery-required를 표시한다. 완료 기준: app restart 후 같은 task를 재연결하고
  stale optimistic state를 success로 표시하지 않는다.
- [ ] **V2-J-007 — V1 edit interception.** V1 source edit에서 silent auto-migration 대신
  read-only 설명과 migration CTA를 제공한다. 완료 기준: table/page/API/MCP/automation 모두 같은
  policy를 따르고 read/export는 계속 가능하다.
- [x] **V2-J-008 — CLI/headless flow.** Inventory/plan/apply/status/resume/rollback을
  machine-readable JSON과 human summary로 제공한다. 완료 기준: explicit approval token/plan hash
  없이는 apply하지 않고 CI fixture migration을 UI 없이 실행할 수 있다.
- [ ] **V2-J-009 — Diagnostics and repair.** Duplicate owner, malformed table, broken link,
  invalid cell, stale alias, interrupted migration에 actionable repair preview를 제공한다. 완료 기준:
  repair가 원본 bytes를 임의로 정상화하지 않고 plan/commit/undo를 사용한다.
- [ ] **V2-J-010 — Web/desktop parity.** File watcher, reveal/open, Git integration을 포함한
  primary journey가 web과 desktop에서 같은 canonical result를 낸다. 완료 기준: desktop-specific
  affected tests와 required desktop check가 통과한다.

### J 영역 완료 기준

- 사용자는 generated internal folder나 `rec_*` filename을 보거나 선택할 필요 없이 새 v2
  database를 생성·편집할 수 있다.
- Migration과 recovery가 loading/empty/error/offline/permission/accessibility 상태를 모두 가진다.
- UI/API/MCP/CLI가 blocker를 서로 다르게 우회하지 않고 같은 plan hash와 task를 공유한다.
- Record open은 정상 Markdown document이고 source mode에는 marker/table이 읽을 수 있게 남는다.

완료 증거: `database-data-plane-api.ts`의 strict v2 mutation/preview/task schemas와
`storageCapabilities` matrix,
`mcp/tools/database-markdown-table.ts`, app `database-markdown-table-client.ts`와
`database-mutation-gateway.ts`, CLI `commands/database.ts`가 같은 storage-aware boundary와
hash/approval semantics를 사용한다. Focused API/MCP/app/CLI tests가 route, response receipt,
strict output, owner revision, approval hash와 migration status history를 검증한다. Server
title/move/lifecycle route와 capability response는 구현됐지만 full renderer title/archive/move/
duplicate lifecycle, desktop parity, migration preview/recovery
accessibility는 J-004~J-010 gate다.

## K. Performance, scalability, security, and reliability gates

- [ ] **V2-K-001 — Reference benchmark corpus.** 100-row, 1k-row, supported-max,
  max+1 table과 10/30/max column, relation/Formula/Rollup 분포를 고정한다. 완료 기준: fixture
  generator seed, reference machine, source bytes, expected logical hash가 repository에 기록된다.
- [ ] **V2-K-002 — Numeric hard limits.** Benchmark로 owner bytes/rows/columns/cell/
  relation target limits를 확정한다. 완료 기준: 실제 숫자가 core constants, API capability,
  UI guidance, docs에 동일하고 max+1 plan이 write 전에 거부된다.
- [ ] **V2-K-003 — Latency/memory budgets.** Cold parse/index, warm open, cell commit,
  incremental Formula/Rollup, migration throughput의 p50/p95와 peak memory budget을 정한다.
  완료 기준: CI 또는 repeatable benchmark가 numeric threshold를 통과하고 baseline 대비 regression
  policy가 문서화된다.
- [ ] **V2-K-004 — Bounded rendering/query.** Viewport DOM, query, export, context pack이
  전체 table DOM/body load를 요구하지 않는다. 완료 기준: supported-max fixture에서 responsive
  cancellation/backpressure와 bounded memory가 측정된다.
- [ ] **V2-K-005 — Filesystem safety.** Path traversal, symlink escape, case collision,
  permission loss, disk full, stale temp/lock을 방어한다. 완료 기준: adversarial fixture가 content
  root 밖 write와 partial canonical state 0건을 증명한다.
- [ ] **V2-K-006 — Parser resource safety.** Marker/GFM/JSON/wikilink parser의 bytes,
  depth, nodes, tokens, time budget을 강제한다. 완료 기준: fuzz/timeout suite에서 hang/OOM/crash 없이
  bounded diagnostic을 반환한다.
- [ ] **V2-K-007 — Permission noninterference.** Relation/Rollup/query/search/export/migration
  preview가 unauthorized value나 existence를 누출하지 않는다. 완료 기준: principal-pair security
  matrix에 unauthorized read/write와 permission-as-empty outcome이 0건이다.
- [ ] **V2-K-008 — Telemetry privacy.** Migration/performance metrics에서 path/title/cell/
  body/expression/person data를 제외한다. 완료 기준: payload schema allowlist test와 redacted local
  diagnostics snapshot이 통과한다.
- [ ] **V2-K-009 — Reliability soak.** Repeated edit/reload/Git sync/migration/rollback을
  supported-max fixture에서 수행한다. 완료 기준: 정한 반복/시간 동안 snapshot drift, leaked lock,
  unrecoverable journal, unbounded memory growth가 없다.

### K 영역 완료 기준

- “추후 benchmark”가 아니라 실제 numeric limits와 measurement report가 committed evidence로 있다.
- Supported-max까지는 documented SLO를 만족하고 max+1은 빠르고 안전하게 거부된다.
- Security/failure tests가 source bytes와 permission을 침해하지 않으며 telemetry에 content가 없다.
- Critical data-loss, path escape, unauthorized disclosure, deterministic mismatch defect가 0건이다.

## L. Test matrix, documentation, rollout, and v1 removal

- [ ] **V2-L-001 — Core conformance suite.** Manifest/marker/codec/identity/revision/
  formula vectors를 browser/Node에서 공유한다. 완료 기준: 같은 fixture가 동일 typed/error result와
  documented canonical bytes를 생성한다.
- [ ] **V2-L-002 — Differential v1/v2 suite.** 같은 logical corpus를 두 reader로
  materialize/query한다. 완료 기준: storage-specific path/revision 차이를 제외한 record/schema/
  query/permission/derived snapshot이 deep-equal이다.
- [ ] **V2-L-003 — Migration round-trip suite.** Fixture마다 v1→v2 apply, cold rebuild,
  v2 mutation dry-run, undo→v1 cold rebuild을 수행한다. 완료 기준: expected logical equality와
  preserved byte ranges가 모두 통과한다.
- [ ] **V2-L-004 — Crash/conflict suite.** Transaction/migration/Git/Yjs/offline checkpoint에
  deterministic failure를 주입한다. 완료 기준: valid state 또는 explicit recovery-required만
  나오고 mixed writer/silent overwrite가 0건이다.
- [ ] **V2-L-005 — Standalone clone suite.** Cache, local task DB, server state를 제거한
  clone에서 v2 catalog/query/open/export를 실행한다. 완료 기준: manifest/table/documents만으로
  expected snapshot을 재구축한다.
- [ ] **V2-L-006 — Public documentation.** Canonical format, raw Markdown editing,
  Formula/Rollup visibility, migration preview, limits, backup/rollback, troubleshooting을 게시한다.
  완료 기준: docs example가 current fixture와 schema validation을 통과하고 known-loss matrix가 있다.
- [ ] **V2-L-007 — Operator/recovery runbook.** Interrupted migration inspect/resume/
  rollback, duplicate owner, malformed table, alias overflow 절차를 문서화한다. 완료 기준: 새 clone의
  maintainer가 runbook만으로 seeded failure를 복구하는 rehearsal이 통과한다.
- [ ] **V2-L-008 — Opt-in pilot gate.** 제한된 workspace에서 v2 new/create/migrate를
  운영한다. 완료 기준: 기간, dataset mix, task counts, rollback counts, defect severity와 go/no-go
  decision이 content-free report로 남는다.
- [ ] **V2-L-009 — New-default gate.** 새 database writer default를 v2로 바꾼다.
  완료 기준: M0–M4와 relevant accessibility/performance/security/data-loss gates가 통과하고
  changeset/release note/upgrade guidance가 준비된다.
- [ ] **V2-L-010 — V1 writer removal.** Record-frontmatter create/update/delete와 generated
  source-folder creation path를 제거한다. 완료 기준: runtime/static guard, focused regression,
  public API behavior가 migration-required/read-only policy를 증명한다.
- [ ] **V2-L-011 — Obsolete rule cleanup.** V1-only watcher exclusions, merge rules,
  search dedupe, tests/docs를 삭제하거나 compatibility reader scope로 격리한다. 완료 기준: v2
  standalone/repository compatibility check가 통과하고 retained v1 read path가 명시돼 있다.
- [ ] **V2-L-012 — Compatibility retirement decision.** V1 reader와 legacy alias 제거 여부를
  별도 RFC/release로 결정한다. 완료 기준: supported release window, remaining v1 inventory,
  downgrade/export path, user notice가 없으면 제거 PR을 시작하지 않는다.

### L 영역 완료 기준

- M0–M5의 모든 checkbox와 증거 링크가 release record에서 추적 가능하다.
- Public docs와 실제 marker/manifest/CLI output이 drift하지 않는 executable fixture 검사가 있다.
- V1 writer removal 뒤에도 v1 read/export/migration policy가 명확하고 silent mutation이 없다.
- Task branch별 changeset, focused tests, 필요한 cross-package/repository gate, web/desktop launch
  evidence가 repository workflow에 맞게 완료됐다.

## 5. 초기 package/file 작업 지도

이 표는 첫 구현 분해를 위한 영향 지도다. 실제 PR에서 파일을 더 작게 나눌 수 있지만
storage-neutral core → server persistence → product surface 의존 방향은 뒤집지 않는다.

| 영역 | 현재 주요 경계 | v2 책임과 예상 산출물 |
| --- | --- | --- |
| Core manifest | [`packages/core/src/database/schema.ts`](../../packages/core/src/database/schema.ts), [`manifest.ts`](../../packages/core/src/database/manifest.ts), [`migration.ts`](../../packages/core/src/database/migration.ts) | Manifest v2 strict schema, v1/v2 compatibility matrix, migration plan type, limits |
| Core record model | [`packages/core/src/database/record.ts`](../../packages/core/src/database/record.ts), [`record-identity.ts`](../../packages/core/src/database/record-identity.ts) | Storage-neutral logical record, document/record identity, v1/v2 adapters |
| Core table format | [`packages/core/src/database/markdown-table.ts`](../../packages/core/src/database/markdown-table.ts), [`markdown-table-record.ts`](../../packages/core/src/database/markdown-table-record.ts), [`markdown-table-diff.ts`](../../packages/core/src/database/markdown-table-diff.ts) | Marker scanner, structural map, typed codecs, source-preserving splice, semantic diff/merge |
| Core derived engine | [`formula.ts`](../../packages/core/src/database/formula.ts), [`rollup.ts`](../../packages/core/src/database/rollup.ts), derived-record modules | Stable-ID DAG, relation wikilink resolution, reverse index contract, derived revision |
| Transaction contract | [`packages/core/src/database/transaction.ts`](../../packages/core/src/database/transaction.ts) | Table/document file deltas, migration checkpoints, verification/undo receipt versioning |
| Server store/index | [`database-store.ts`](../../packages/server/src/database-store.ts), [`database-record-index.ts`](../../packages/server/src/database-record-index.ts), index coordinator/watcher modules | Owner discovery, v2 materialization, cold rebuild, incremental structural events, writer routing |
| Server plan/commit | [`database-plan.ts`](../../packages/server/src/database-plan.ts), [`database-commit.ts`](../../packages/server/src/database-commit.ts) | Cell-local exact plan, multi-file journal, manifest activation, v1 writer guard |
| Durable migration | [`database-task-service.ts`](../../packages/server/src/database-task-service.ts), [`database-migration-journal.ts`](../../packages/server/src/database-migration-journal.ts), [`database-migration-gate.ts`](../../packages/server/src/database-migration-gate.ts), task runner/store modules | Inventory/preflight/apply state machine, hash journal, restart gate, resume, rollback |
| Git/recovery | [`packages/core/src/database/markdown-table-diff.ts`](../../packages/core/src/database/markdown-table-diff.ts), Database Git recovery/sync modules under `packages/server/src` | Semantic table diff/merge, branch recovery, migration journal detection |
| Server API/MCP | [`database-data-plane-api.ts`](../../packages/server/src/database-data-plane-api.ts), [`database-markdown-table-writer.ts`](../../packages/server/src/database-markdown-table-writer.ts), `packages/server/src/mcp/tools/database-*` | Versioned migration preview/task/recovery schemas, storage-aware owner-table reads/writes |
| App read/write model | [`database-markdown-table-client.ts`](../../packages/app/src/lib/database-markdown-table-client.ts), mutation gateway, [`DatabaseTableDialog`](../../packages/app/src/components/DatabaseTableDialog.tsx) | Unified v2 owner/linked read model, owner revision, explicit cell adapter, optimistic state, diagnostics |
| Editor integration | `packages/app/src/editor`, source guard/database node modules | Marker-owned table renderer, source-preserving visual edit, malformed source recovery |
| Desktop/CLI | `packages/desktop`, `packages/cli` database entrypoints | File watcher parity, headless inventory/plan/apply/status/rollback, recovery UX |
| Public docs | `docs/content/features`, `docs/content/migrate`, `docs/content/reference` | v2 format, migration, limits, Formula/Rollup export, recovery documentation |

현재 foundation PR은 schema/parser와 fixture뿐 아니라 explicit storage-aware writer/API,
MCP/CLI route, durable migration journal/gate, app cell adapter까지 포함한다. 단,
new-default 전환과 native lifecycle mutation, full migration release는 아래 release gate를
통과하기 전에는 켜지지 않는다. App UI는 server/core mutation contract를 우회해 Markdown을
직접 patch하지 않는다.

## 6. 필수 migration fixture catalog

아래 fixture ID는 migration release candidate 전에 모두 존재해야 한다.

| ID | Fixture | 반드시 검증할 결과 |
| --- | --- | --- |
| `MIG-001` | Empty generated blank database | Generated folder 없이 owner marker와 empty table 생성 |
| `MIG-002` | Basic records | Title/document IDs/scalars/record aliases 보존 |
| `MIG-003` | Every stored property codec | Typed/raw round-trip과 invalid preservation |
| `MIG-004` | Inline owner candidate | 선택한 block만 owner가 되고 다른 reference는 linked view |
| `MIG-005` | Full-page database | Normal owner document와 open/navigation 동작 |
| `MIG-006` | Existing-folder source | 기존 document path/body/unrelated frontmatter 보존 |
| `MIG-007` | Generated `rec_*` source | keep/move 선택, path collision, wikilink rewrite preview |
| `MIG-008` | Title conflict | keep/use/custom 선택 없이는 blocked |
| `MIG-009` | Relation one/many | Ordered target set, missing/ambiguous/duplicate semantics |
| `MIG-010` | Formula chain | Stable-ID AST, frozen deterministic result, exact invalidation |
| `MIG-011` | Cross-source Rollup | Dependency closure, permission, cycle, reverse index |
| `MIG-012` | Archived/audit/layout state | 모든 v1 metadata의 documented v2 projection 보존 |
| `MIG-013` | Invalid raw values | Raw bytes/diagnostic 유지 또는 explicit blocker |
| `MIG-014` | CRLF/BOM/Unicode/escaped pipes | Source-preserving parse/edit/rollback |
| `MIG-015` | Duplicate IDs/owners | Source locations와 repair preview를 포함한 blocker |
| `MIG-016` | Symlink/outside-root/case collision | Unsafe target write 0건 |
| `MIG-017` | Limit boundary | limit-1/limit 성공, limit+1 preflight 거부 |
| `MIG-018` | Concurrent external edit | Stale plan 거부, unknown bytes overwrite 0건 |
| `MIG-019` | Process kill at every checkpoint | Valid v1/v2 또는 explicit recovery-required |
| `MIG-020` | Post-commit verification failure | Automatic byte-exact rollback과 v1 cold rebuild |
| `MIG-021` | User undo after clean commit | V1 exact restoration and receipt |
| `MIG-022` | User undo after intervening edit | Three-way conflict preview, silent overwrite 0건 |
| `MIG-023` | Standalone clone | Cache 없이 catalog/records/derived snapshot rebuild |
| `MIG-024` | Alias/manifest byte overflow | Truncation 없는 blocker와 source split/export guidance |

## 7. PR 완료 증거 template

각 implementation PR은 description 또는 연결된 evidence 문서에 다음을 남긴다.

```md
Checklist IDs: V2-X-000, V2-Y-000
Canonical formats changed: yes/no
Writer routing changed: yes/no
Migration behavior changed: yes/no
Fixtures exercised: MIG-000, ...
Focused checks:
  - command
  - result / assertions
Failure injection:
  - checkpoint and expected recovery
Standalone clone impact:
  - result
Performance/security impact:
  - measured result or not applicable reason
Changeset/docs:
  - paths
Known limits:
  - explicit list
```

Checkbox를 체크하는 commit은 evidence 위치를 같은 항목 아래에 추가한다. “테스트 통과”라는
요약만으로는 완료 증거가 아니며 test path, 실행 범위, 검증한 failure boundary를 적어야 한다.
