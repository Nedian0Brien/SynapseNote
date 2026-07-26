# RFC 0008: Markdown table canonical database storage

- 상태: 방향 승인, 구현 대기
- 작성일: 2026-07-27
- 대상: `packages/core`, `packages/server`, `packages/app`, `packages/cli`, 데이터베이스 저장·인덱스·Git merge·마이그레이션 경계
- 성격: canonical 저장 형식 변경, 단일 데이터베이스 엔진 결정
- 선행 문서:
  - [RFC 0001: File-native databases and the Agent Data Plane](./0001-databases-and-agent-data-plane.md)
  - [RFC 0005: Document-native database interaction parity](./0005-database-document-native-interaction-parity-plan.md)
  - [RFC 0006: Database navigation, overlay, and command reliability](./0006-database-navigation-overlay-and-command-reliability-plan.md)

## 1. 결정

SynapseNote 데이터베이스의 canonical 값 저장 형식을 **데이터베이스 구분자가 붙은 GFM Markdown table**로 통일한다.

```text
Database = schema/view metadata + exactly one owner Markdown table
Record   = one row in the owner table
Document = a normal .md document referenced by [[wikilink]]
Scalar   = a literal value stored in the corresponding table cell
Derived  = a Formula/Rollup value computed from canonical inputs and never stored
View     = a non-owning projection over the canonical table
```

인라인 데이터베이스와 전체 페이지 데이터베이스는 서로 다른 저장 엔진이 아니다. 둘은 같은 owner table이 어디에 놓이는지만 다르다.

- **인라인 데이터베이스**: 기존 Markdown 문서 안에 구분자와 owner table을 둔다.
- **전체 페이지 데이터베이스**: 전용 Markdown 문서 안에 같은 구분자와 owner table을 둔다.
- **Linked view**: owner table의 stable database/source/view ID만 참조한다. 레코드를 복사하지 않는다.
- **기존 폴더 가져오기**: 폴더의 Markdown 문서를 wikilink 행으로 변환하는 일회성 onboarding이다. 폴더와 테이블을 영구적으로 양방향 동기화하지 않는다.

이 결정이 구현되면 RFC 0001의 다음 canonical 저장 계약을 대체한다.

- source별 콘텐츠 폴더가 데이터베이스 값을 소유하는 계약
- 레코드마다 `_sn.database_id`, `_sn.source_id`, `_sn.record_id`와 typed property frontmatter를 보유하는 계약
- 앱이 만든 데이터베이스마다 별도 폴더와 `rec_*` Markdown 파일을 생성하는 계약

RFC 0001의 stable ID, typed schema, permission, exact plan/commit, audit, recovery, query, agent data plane 계약은 유지한다. 변경되는 것은 canonical record value의 물리적 저장 위치와 materialization 방식이다.

## 2. 배경과 문제

현재 blank/inline 데이터베이스 생성은 database key를 content source folder로 사용한다. 이름 없는 데이터베이스는 다음과 같은 사용자 비의도 산출물을 만든다.

```text
untitled_database_<generated-suffix>/
  rec_<generated-id>.md
```

이 구조는 구현 관점에서는 레코드별 revision, 파일 감시, Git merge가 단순하지만 제품 관점에서는 다음 문제가 있다.

1. 내부 ID와 저장 세부사항이 일반 파일 탐색기에 노출된다.
2. 사용자가 만든 문서와 데이터베이스 엔진이 만든 레코드 파일의 소유권이 구분되지 않는다.
3. inline table을 만들었는데 원본 문서에는 stable reference만 남고 실제 값은 다른 폴더에 흩어진다.
4. 사용자가 Finder, IDE, Git에서 내부 폴더를 이동·삭제하면 데이터베이스가 손상될 수 있다.
5. 일반 문서 검색과 데이터베이스 검색이 같은 Markdown 레코드를 중복 수집하지 않도록 별도 제외 규칙이 필요하다.
6. `*.md` 전체에 데이터베이스 record merge driver를 적용하는 등 저장 경계보다 넓은 운영 규칙이 필요하다.

단순히 파일 트리에서 이 경로를 숨기면 화면상의 증상만 사라진다. 저장 소유권과 canonical source의 불일치는 남는다. 반대로 앱 생성 데이터베이스와 기존 폴더 데이터베이스에 서로 다른 저장 엔진을 두면 parser, index, mutation, undo, Git merge, permission, migration, 테스트가 두 벌이 된다.

따라서 이 RFC는 UX 문제를 필터로 해결하지 않고, 모든 데이터베이스 surface가 공유하는 단일 canonical table 모델을 정의한다.

## 3. 목표와 비목표

### 3.1 목표

- 원본 Markdown만 읽어도 데이터베이스의 저장 값을 이해할 수 있다.
- SynapseNote 없이 GitHub나 다른 Markdown 편집기에서 owner table과 문서 관계를 볼 수 있다.
- inline, full-page, linked view가 하나의 parser, serializer, index, mutation, undo 엔진을 사용한다.
- 문서 제목·본문과 데이터베이스 scalar 값의 canonical ownership을 명확히 분리한다.
- Formula/Rollup을 두 번째 저장소나 캐시 열 없이 동일한 derived-value 엔진으로 계산한다.
- stable database/source/property/view/document/record identity를 이름과 경로 변경에서 보호한다.
- 외부 Markdown 편집을 byte-preserving validation과 명시적 diagnostics로 수용한다.
- Git clone만으로 canonical schema, owner table, linked documents를 복구할 수 있다.
- 현재의 exact plan, approval, verification, undo, permission, Agent Data Plane 계약을 유지한다.

### 3.2 비목표

- SQL 데이터베이스나 opaque binary store를 도입하지 않는다.
- Formula/Rollup 결과를 canonical Markdown에 캐시하지 않는다.
- 기존 폴더와 owner table을 지속적으로 양방향 동기화하지 않는다.
- 하나의 database source를 여러 owner table에 복제하지 않는다.
- 대용량 한계를 피하기 위해 별도의 row-file 저장 엔진으로 자동 전환하지 않는다.
- 마이그레이션 전후 저장 형식에 동시에 쓰는 영구 dual-write 경로를 만들지 않는다.
- source Markdown table의 필터·정렬 결과를 canonical row order로 간주하지 않는다.

## 4. 핵심 불변식

| ID | 불변식 |
| --- | --- |
| INV-01 | 하나의 data source는 정확히 하나의 owner table을 가진다. |
| INV-02 | 모든 저장 속성 값은 owner table cell에만 존재한다. 동일 값을 linked document frontmatter나 index에 복사해 canonical로 취급하지 않는다. |
| INV-03 | 모든 page-like record는 첫 저장 열에서 정확히 하나의 `.md` document entity를 wikilink로 참조한다. |
| INV-04 | linked document는 범용 stable `document_id`를 소유하고 데이터베이스별 identity를 소유하지 않는다. |
| INV-05 | source 안에서 하나의 `document_id`는 최대 한 행에만 나타난다. |
| INV-06 | Formula/Rollup은 manifest-owned 정의와 canonical input으로부터 계산하며 결과를 Markdown에 쓰지 않는다. |
| INV-07 | filter, sort, hidden property, layout은 view state다. canonical table의 값 집합을 소유하지 않는다. |
| INV-08 | linked view는 레코드 행을 복사하지 않는다. |
| INV-09 | 행 삭제는 database membership만 제거한다. linked document 삭제는 별도 명시적 파괴 작업이다. |
| INV-10 | broken wikilink, invalid cell, ambiguous relation, derived error는 원본을 보존한 채 진단 상태로 나타난다. |
| INV-11 | index와 computed cache는 canonical source가 아니며 owner table과 manifest에서 완전히 재구축할 수 있다. |
| INV-12 | 구버전 저장 형식은 read-only compatibility reader 또는 명시적 migration으로 처리하며 새 형식과 동시에 쓰지 않는다. |

## 5. Canonical Markdown 형식

### 5.1 Owner marker

Owner table 바로 앞에는 한 개의 versioned HTML comment marker가 온다. HTML comment는 일반 Markdown renderer에서 보이지 않고 standalone clone에서 보존된다.

초기 문법은 다음 정보를 반드시 가져야 한다.

```md
<!-- synapsenote:database
version=2
database=db_orders
source=ds_orders
block=dbb_orders_primary
columns=prop_document,prop_quantity,prop_price,prop_project
-->
```

필드 의미는 다음과 같다.

| 필드 | 의미 |
| --- | --- |
| `version` | owner-table serialization version |
| `database` | stable database ID |
| `source` | stable data source ID |
| `block` | 문서 안에서 owner table을 식별하는 stable block ID |
| `columns` | Markdown table 열 순서에 대응하는 stored property ID 목록 |

표시용 header 문자열은 property identity가 아니다. header 이름 변경, 번역, alias, 중복 표시에 상관없이 `columns`의 stable property ID가 schema binding의 권위다.

Marker는 바로 뒤의 첫 GFM table 하나만 소유한다. marker와 table 사이에는 빈 줄 외의 block을 허용하지 않는다. marker만 있거나 table만 있거나 `columns` 수와 실제 열 수가 다르면 source는 invalid 상태가 되고 원본 bytes는 보존된다.

### 5.2 예시

```md
# Orders

This page owns the canonical order database.

<!-- synapsenote:database
version=2
database=db_orders
source=ds_orders
block=dbb_orders_primary
columns=prop_document,prop_quantity,prop_price,prop_project
-->

| 문서 | 수량 | 단가 | 프로젝트 |
| --- | ---: | ---: | --- |
| [[orders/order-001]] | 2 | 15000 | [[projects/alpha]] |
| [[orders/order-002|Order 002]] | 3 | 8000 | [[projects/beta]] |
```

SynapseNote는 manifest의 view projection을 적용하여 source에 저장되지 않은 Formula/Rollup과 hidden/computed properties까지 렌더링할 수 있다.

### 5.3 Owner와 linked view

Owner table은 canonical 값을 포함한다. 다른 문서에서 같은 source를 표시할 때는 현재 `DatabaseView`의 reference-only 원칙을 유지한다.

```mdx
<DatabaseView
  databaseId="db_orders"
  sourceId="ds_orders"
  viewId="view_open_orders"
/>
```

Owner block을 이동하면 `database`, `source`, `block` identity를 유지한다. Owner block을 복사하거나 붙여넣을 때는 다음 중 하나를 명시적으로 선택해야 한다.

- 새 database/source/block ID를 할당하여 독립 데이터베이스 생성
- 레코드를 제거하고 `DatabaseView` reference로 변환

두 owner가 같은 source ID를 주장하면 store는 쓰기를 거부하고 duplicate-owner diagnostic을 반환한다.

## 6. 문서 엔티티와 행 identity

### 6.1 범용 document identity

Database record가 참조하는 문서는 일반 `.md` 문서다. 문서에는 데이터베이스별 metadata 대신 범용 stable document identity만 둔다.

```md
---
_sn:
  document_id: doc_01K0...
---

# Order 001

Customer context and long-form notes live here.
```

하나의 문서는 여러 데이터베이스 source에서 재사용할 수 있다. 각 source의 status, score, date 같은 값은 해당 source owner table에 독립적으로 저장된다.

### 6.2 Record identity

새 레코드의 stable record ID는 stable source ID와 stable document ID로부터 결정적으로 생성한다.

```text
record_id = rec_<base32(sha256(source_id + NUL + document_id))>
```

이 규칙은 다음을 보장한다.

- 문서 파일 이름과 경로가 바뀌어도 record ID가 유지된다.
- 같은 문서가 다른 source에 들어가면 source별로 다른 record ID를 가진다.
- row ID를 별도의 visible cell이나 `rec_*` 파일명으로 저장하지 않아도 된다.
- 동일 source에서 같은 문서가 중복되면 같은 record ID가 되므로 명확히 거부할 수 있다.

기존 v1 `rec_*` ID는 API와 relation compatibility를 위해 migration manifest의 bounded `legacyRecordIds` mapping으로 보존한다. 새 ID 조회와 기존 ID 조회는 같은 canonical row를 반환하며, 새 mutation receipt는 canonical derived ID와 legacy alias를 함께 기록한다. Alias는 migration compatibility metadata이며 record value의 두 번째 원본이 아니다.

### 6.3 Wikilink 규칙

- 첫 stored property는 `document` 유형이며 정확히 하나의 non-embed wikilink를 가져야 한다.
- `[[path]]`와 `[[path|alias]]`를 허용한다.
- alias는 표시 문자열일 뿐 document title 또는 identity의 원본이 아니다.
- heading anchor가 있는 `[[path#heading]]`은 record entity로 허용하지 않는다. relation/reference cell에서는 schema가 허용할 수 있다.
- 링크 target 이동은 existing rename log와 wikilink remap 경계를 통해 갱신한다. `document_id`는 바뀌지 않는다.
- 링크 대상이 없으면 행을 삭제하지 않고 `broken_document_link` diagnostic을 낸다.
- 같은 source에 같은 `document_id`가 두 번 나오면 두 행 모두 byte-preserved invalid 상태로 격리한다.

### 6.4 삭제 의미

| 동작 | 결과 |
| --- | --- |
| 행 삭제 | database membership과 scalar cell values만 삭제, 문서는 유지 |
| 문서 삭제 | 행은 broken-link 상태로 유지, 자동 행 삭제 금지 |
| Delete record and document | 별도 고위험 plan으로 행과 문서를 함께 삭제 |
| Database 삭제 | owner marker/table과 manifest 삭제, linked documents는 기본적으로 유지 |

## 7. Stored property cell codec

Manifest가 property type과 stable option IDs/keys를 소유한다. Markdown cell은 해당 type의 versioned canonical text codec을 사용한다.

공통 규칙은 다음과 같다.

- 빈 cell은 `null`이다.
- 빈 문자열은 `""`로 쓴다.
- GFM table의 `|`와 backslash는 표준 escape 규칙을 따른다.
- database text는 단일행 값이다. 긴 설명과 여러 문단은 linked document body에 둔다.
- serializer는 유효한 외부 표현을 의미 변경 없이 보존할 수 있지만, SynapseNote가 새로 쓰는 값은 canonical 표현을 사용한다.
- 파싱 실패는 raw cell text를 보존하고 typed value 대신 explicit invalid value를 materialize한다.

| Property type | Canonical cell representation |
| --- | --- |
| `document` / title | 정확히 하나의 `[[wikilink]]` |
| `text` | literal single-line text; `""` means empty string |
| `number` | locale-independent finite decimal, grouping separator 없음 |
| `checkbox` | `[x]` 또는 `[ ]`; 빈 cell은 null |
| `date` | ISO date 또는 RFC 3339 timestamp/range |
| `select`, `status` | manifest-owned stable option key |
| `multi_select` | JSON string array of stable option keys |
| `url`, `email`, `phone` | validated literal string |
| `relation` | 하나 이상의 wikilink; target source는 schema가 지정 |
| `person` | person document wikilink; target people source는 schema가 지정 |
| `files` | Markdown link 또는 wiki-embed 목록 |
| `unique_id` | positive integer; prefix/watermark는 manifest 소유 |
| `place` | versioned compact JSON object with canonical keys |
| `created_time/by`, `last_edited_time/by` | 저장하지 않는 audit-derived virtual property |
| `formula`, `rollup` | 저장하지 않는 schema-derived virtual property |
| `button`, `verification` | action/derived state; canonical result cell 없음 |

Complex codec은 사람이 읽을 수 있으면서도 parse ambiguity가 없어야 한다. JSON을 쓰는 cell은 canonical key order와 whitespace 규칙을 정하고 GFM escape를 적용한다. 구현 전에 각 property type의 parse → serialize → parse conformance fixture를 추가한다.

## 8. Formula

### 8.1 저장 계약

Formula definition은 manifest의 property schema에 저장한다. Formula 결과 열과 결과 cell은 owner Markdown table에 저장하지 않는다.

```yaml
- id: prop_total
  key: total
  name: Total
  type: formula
  expression: quantity * price
```

사용자는 이름 또는 stable key로 식을 작성할 수 있지만 저장 시 property reference를 stable property ID AST로 컴파일한다.

```text
"quantity * price"
  -> multiply(property(prop_quantity), property(prop_price))
```

### 8.2 컴파일

Schema plan 단계에서 다음을 수행한다.

1. expression tokenize/parse
2. property name/key/alias를 stable property ID로 resolve
3. operand와 function signature typecheck
4. formula 및 rollup dependency graph 생성
5. cycle detection
6. deterministic normalized AST와 definition revision 생성

Ambiguous property resolution, type mismatch, unsupported function, dependency cycle이 있으면 schema commit을 거부한다. JavaScript `eval`, arbitrary code, network, filesystem, ambient locale, ambient current time, random source를 사용하지 않는다. 시간 의존 함수가 필요하면 query/automation이 명시한 frozen evaluation timestamp를 입력으로 받는다.

### 8.3 평가와 invalidation

Formula evaluator는 core의 pure deterministic engine 하나를 UI optimistic preview와 server authoritative query가 공유한다.

```text
prop_quantity ─┐
               ├─ prop_total ── prop_total_with_tax
prop_price ────┘
```

한 행의 `prop_quantity`가 바뀌면 그 행에서 `prop_total`과 `prop_total_with_tax`만 무효화한다. 다른 행과 unrelated formula는 다시 계산하지 않는다.

Cache key는 최소 다음을 포함한다.

```text
sourceTableRevision
recordId
formulaDefinitionRevision
dependencyValueRevisions
evaluationContextRevision
```

Cache는 재구축 가능하며 Git이나 canonical Markdown에 쓰지 않는다.

## 9. Rollup

### 9.1 저장 계약

Rollup definition도 manifest schema에 저장하고 결과는 owner table에 저장하지 않는다.

```yaml
- id: prop_project_budget
  key: project_budget
  name: Project budget
  type: rollup
  relationPropertyId: prop_project
  targetSourceId: ds_projects
  targetPropertyId: prop_budget
  function: sum
```

Relation cell은 대상 document entity를 wikilink로 저장한다.

```md
| 문서 | 프로젝트 |
| --- | --- |
| [[orders/order-001]] | [[projects/alpha]] |
```

### 9.2 Resolution

Rollup은 다음 순서로 평가한다.

1. relation cell의 wikilink target을 stable `document_id`로 resolve한다.
2. `targetSourceId`의 owner table에서 해당 document ID의 row를 찾는다.
3. `targetPropertyId`의 stored 또는 derived value를 읽는다.
4. schema가 선언한 aggregate function을 적용한다.

`targetSourceId`가 relation definition에 있으므로 같은 문서가 여러 database에 참여해도 대상 source가 모호하지 않다. Target source에 문서가 없거나 중복되어 있으면 각각 `#REF!`, `#AMBIGUOUS!` 결과를 낸다.

### 9.3 Reverse relation index

전체 database를 매번 다시 계산하지 않도록 다음 reverse index를 재구축 가능 projection으로 유지한다.

```text
(targetSourceId, targetDocumentId)
  -> [(sourceId, sourceRecordId, relationPropertyId), ...]
```

대상 row 값이 변경되면 그 row를 참조하는 source rows와 downstream formula/rollup만 무효화한다. Formula와 Rollup을 하나의 property dependency DAG에 넣고 source 간 cycle도 schema plan에서 거부한다.

## 10. Derived snapshot과 오류

Formula/Rollup이 포함된 query/view/export는 같은 revision-bound derived snapshot을 사용한다.

```text
derivedRevision = hash(
  manifestRevision,
  ownerTableRevisions,
  dependencySourceRevisions,
  permissionRevision,
  evaluationContextRevision
)
```

UI, HTTP, MCP, filter, sort, automation, export가 서로 다른 계산 시점을 사용하면 안 된다. Query receipt는 input source revisions와 derived revision을 함께 반환한다.

대표 오류는 다음과 같다.

| 표시 | 원인 |
| --- | --- |
| `#TYPE!` | operand 또는 aggregate input type mismatch |
| `#REF!` | document, relation target, property target가 없음 |
| `#CYCLE!` | formula/rollup dependency cycle |
| `#AMBIGUOUS!` | 같은 target source에 동일 document entity가 중복됨 |
| `#INVALID!` | canonical source cell이 schema codec에 맞지 않음 |
| `#PERMISSION!` | 요청 principal이 target value를 볼 수 없음 |

오류는 null이나 빈 문자열로 바꾸지 않는다. 원본 stored cell과 linked document bytes는 그대로 유지한다.

## 11. Plain Markdown과 export

일반 Markdown renderer는 canonical stored columns만 표시한다. Formula/Rollup 결과가 plain Markdown owner table에 보이지 않는 것은 의도된 tradeoff다.

계산 결과를 canonical table에 캐시하면 다음 문제가 생기므로 금지한다.

- 하나의 input 변경이 수백 개 derived cell rewrite를 일으킨다.
- cross-source rollup 변경이 다른 owner 문서의 Git diff를 연쇄 생성한다.
- 외부 편집 후 cache freshness를 별도로 판단해야 한다.
- 사용자가 편집한 derived cell과 evaluator 결과 중 무엇이 원본인지 모호해진다.
- background recompute가 사용자 문서를 수정하고 Git 충돌을 증가시킨다.

외부 공유가 계산 결과를 요구할 때는 명시적 snapshot 기능을 사용한다.

- Export Markdown snapshot
- Export CSV/JSON
- Copy table with computed values
- Publish rendered view

Snapshot에는 source/derived revisions와 생성 시각을 표시하고 canonical owner marker를 포함하지 않는다. 다시 import하면 새 stored database proposal이지 기존 source의 owner가 아니다.

## 12. Index와 materialization

### 12.1 Discovery

Content watcher가 `.md` 변경을 전달하면 database table coordinator가 해당 문서의 marker/table block만 파싱한다.

```text
Markdown change
  -> locate versioned database markers
  -> parse bound GFM tables
  -> validate manifest/property bindings
  -> resolve document wikilinks
  -> materialize stored records
  -> update typed/lexical/relation/derived indexes
```

Source folder recursive scan은 canonical record discovery에서 제거한다. 일반 document index와 database index는 같은 파일 이벤트를 받을 수 있지만 역할이 다르다.

- 일반 document index: owner document와 linked document를 일반 문서로 색인
- database index: marker가 소유한 table rows를 typed records로 색인

Database search는 owner table의 raw Markdown page tier를 통해 typed cell을 중복 노출하지 않도록 marker-owned table ranges를 제외하고 permission-scoped record projection을 사용한다.

### 12.2 Revision

Source table revision은 owner document 전체 hash가 아니라 marker + bound table의 normalized structural hash를 사용한다. 같은 문서의 unrelated prose edit가 모든 database row revision을 바꾸면 안 된다.

Record revision은 최소 다음으로 결정한다.

```text
recordRevision = hash(
  sourceId,
  documentId,
  storedPropertyIdsAndRawCanonicalCells,
  referencedDocumentRevisionWhenBodyIsRequested
)
```

Typed-only query는 linked document body 변경 때문에 불필요하게 invalidation되지 않는다. `full_body` pack, backlinks, lexical evidence처럼 body를 요청하는 surface만 document revision을 receipt에 포함한다.

## 13. Mutation과 transaction

### 13.1 Cell mutation

Stored cell edit는 owner Markdown document에서 해당 cell source range만 splice한다. 전체 table을 다시 serialize하지 않는다. 기존 table-fidelity의 outer pipes, alignment, padding과 unrelated prose bytes를 보존한다.

Mutation plan은 다음 guard를 가진다.

- manifest revision
- source table structural revision
- record revision
- property ID와 codec version
- exact previous raw cell bytes

Commit 후 table을 다시 parse하고 typed value, record revision, dependent derived values를 검증한다.

### 13.2 Row creation

Page-like row creation은 한 transaction에서 다음을 수행한다.

1. 사용자가 지정하거나 template이 결정한 정상적인 document path에 `.md` 생성
2. 범용 `document_id` 할당
3. owner table에 `[[wikilink]]`와 initial stored values 행 추가
4. parse/materialize 검증
5. Git/shadow snapshot과 undo receipt 기록

`rec_*` 파일명이나 generated database folder는 만들지 않는다. 경로가 필요하지만 사용자가 정하지 않은 경우 데이터베이스가 가진 명시적 document placement policy와 title-based conflict preview를 사용한다. 충돌을 무시하고 임의 suffix 파일을 조용히 만들지 않는다.

기존 문서를 행으로 추가할 때는 문서를 복사하지 않고 stable document ID를 보장한 뒤 wikilink만 추가한다.

### 13.3 Row and document deletion

행 삭제와 문서 삭제는 서로 다른 action이다. 결합 삭제는 frozen owner row revision과 document revision을 모두 요구하는 별도 high-risk plan이다. Undo는 owner table cell/row bytes와 document bytes를 독립 target으로 기록한다.

## 14. 동시 편집과 Git merge

한 owner table이 여러 행을 소유하므로 row-file 모델보다 파일 단위 Git 충돌 가능성이 높다. 이를 두 번째 저장 엔진으로 회피하지 않고 table-aware semantic merge로 해결한다.

Merge key는 다음과 같다.

- table: stable `block` ID
- column: marker의 stable property ID
- row: resolved/recorded stable record ID
- cell: `(blockId, recordId, propertyId)`

서로 다른 row 또는 column cell 변경은 병합한다. 같은 cell의 양쪽 변경은 명시적 conflict다. Row reorder와 row value change를 분리하여 manual order property가 없는 view sort를 source row reorder로 오인하지 않는다.

Yjs/ProseMirror collaboration은 owner Markdown document 하나를 공유하지만 database UI mutation은 table structural map을 사용해 cell-local transaction을 생성한다. 외부 source edit가 GFM 구조를 깨면 last-known-good 값을 덮어쓰지 않고 invalid source diagnostic을 표시한다.

## 15. 크기와 성능 경계

단일 Markdown table은 저장 엔진을 단순하게 만드는 대신 한 문서의 크기와 conflict domain을 키운다. 이 RFC는 크기에 따라 row-file engine으로 자동 전환하는 fallback을 허용하지 않는다.

초기 구현은 다음 원칙을 따른다.

- owner document는 기존 public document-open byte boundary를 초과할 수 없다.
- stored row/column/property-type별 parse budget을 설정한다.
- viewport rendering과 typed query는 전체 DOM materialization을 요구하지 않는다.
- parser/index benchmark로 row/column hard limit을 정하고 manifest와 API에 동일하게 노출한다.
- 한계에 가까워지면 filter를 권하는 것이 아니라 source split/export/migration을 명시적으로 안내한다.
- 한계를 넘는 write는 partial 파일을 만들지 않고 plan 단계에서 거부한다.

구체적인 row/column 기본값은 구현 전 benchmark와 기존 512 KiB document boundary를 함께 측정한 뒤 implementation checklist에 고정한다. 측정 없이 높은 숫자를 약속하거나 숨은 alternate store로 넘기지 않는다.

## 16. 기존 폴더 onboarding

Existing folder 기능은 별도 live storage mode가 아니라 다음 일회성 변환이다.

1. 대상 폴더의 Markdown 문서 목록과 frontmatter를 read-only preview한다.
2. 각 문서에 범용 `document_id`가 없으면 추가 계획을 만든다.
3. 선택한 frontmatter key를 typed table property로 mapping한다.
4. 새 owner document 또는 현재 문서에 marker/table을 생성한다.
5. 첫 열에 기존 문서 wikilink를 쓰고 mapped scalar values를 cell에 쓴다.
6. 승인된 database-owned frontmatter만 제거하고 unrelated frontmatter/body는 byte-preserve한다.
7. table과 document edits를 하나의 verified transaction으로 commit한다.

변환 후 scalar 값의 canonical source는 table이다. 외부 도구가 예전 frontmatter를 계속 수정해도 자동으로 table에 반영하지 않는다. 사용자는 재-import preview 또는 explicit update command를 사용해야 한다.

## 17. v1 migration

### 17.1 원칙

- migration은 preview, backup, exact target set, approval, atomic commit, verification, rollback receipt를 가진다.
- v1과 v2에 동시에 쓰지 않는다.
- migration 전 v1 source는 compatibility reader로 열 수 있지만 mutation은 migration을 요구한다.
- 실패한 migration은 manifest, owner table, linked documents를 정확한 이전 bytes로 복구한다.

### 17.2 절차

1. v1 manifest와 모든 indexed record revision을 freeze한다.
2. 각 record document에 범용 `document_id`를 배정한다.
3. database-owned frontmatter property를 typed canonical cell text로 변환한다.
4. inline `DatabaseView`가 source owner 역할을 하던 경우 그 block 위치에 marker/table을 생성한다.
5. standalone database는 사용자가 선택한 normal Markdown owner document에 marker/table을 생성한다.
6. 기존 폴더에서 시작한 record 문서는 현재 path를 유지한다.
7. 앱이 만든 generated folder/`rec_*` 문서는 title-based normal document path로 이동하는 preview를 제공하고 충돌을 명시한다.
8. record body와 unrelated frontmatter를 유지하고 database-specific `_sn` identity/property fields를 제거한다.
9. 기존 stable record ID를 `legacyRecordIds` compatibility mapping으로 보존한다.
10. manifest를 owner document/block 및 stored column codec 계약으로 갱신한다.
11. v2 table parser/index로 재구축하고 record count, IDs, values, relations, formulas, rollups를 비교한다.
12. 검증 성공 후 v1 source folder ownership을 해제하고 transaction receipt를 반환한다.

Synthetic 문서의 자동 rename은 충돌·링크 rewrite·사용자 경로 선택을 preview하지 않고 실행하지 않는다. 문서 body가 없는 레코드도 page-like entity 계약에 따라 정상적인 `.md` 문서를 유지한다.

## 18. API와 Agent Data Plane 영향

Public API의 logical database model은 유지한다.

- `databaseId`, `sourceId`, `propertyId`, `viewId`, `recordId`는 계속 stable ID다.
- record lookup의 `path`는 generated record storage path가 아니라 linked document path다.
- stored values는 owner table에서, body/title/backlinks는 linked document에서 projection한다.
- query/filter/sort는 stored와 derived property를 같은 typed projection으로 본다.
- plan diff는 `manifest`, `ownerTable`, `document` target을 구분한다.
- commit/undo receipt는 exact Markdown source ranges 또는 verified whole-file before/after bytes를 기록한다.
- Agent는 raw owner table을 직접 patch하지 않고 기존 desired-state plan/commit 경계를 사용한다.

Agent context pack은 table 원본을 통째로 복사하지 않는다. Permission-scoped materialized rows와 requested document body만 포함한다.

## 19. 보안과 권한

- 일반 Markdown page 검색은 marker-owned table range의 typed values를 중복 색인하지 않는다.
- Database record 검색과 Formula/Rollup은 기존 row/property permission을 적용한다.
- Rollup 대상 값이 보이지 않으면 aggregate에서 조용히 제외하지 않고 permission policy가 정한 redacted/error semantics를 따른다.
- HTML comment marker와 compact JSON cell은 strict bounded parser를 사용한다.
- Wikilink resolution은 content root 밖으로 나가는 path, symlink escape, ambiguous basename을 거부한다.
- Linked document body와 table scalar sensitivity는 각각의 disclosure level에서 독립적으로 검사한다.
- External Markdown edit는 approval을 우회한 것으로 가장하지 않는다. 파일 시스템 provenance로 index에 반영하되 invalid/permission diagnostics와 audit attribution을 유지한다.

## 20. 거부한 대안

### 20.1 파일 트리에서 generated paths만 숨기기

UX 증상만 완화하고 내부 저장 소유권, accidental delete, duplicate search, wide merge-driver 문제를 남기므로 거부한다.

### 20.2 레코드 파일을 `.ok/databases/**`로 이동하기

파일 트리는 깨끗해지지만 user data가 숨은 managed tree에 남고 ordinary Markdown document portability가 약해진다. 프로젝트별 `.ok` sharing mode와도 추가 계약이 필요하므로 거부한다.

### 20.3 Inline table과 row-file source를 모두 지원하기

두 parser, 두 writer, 두 index discovery, 두 merge/undo path, 두 migration matrix를 영구 유지해야 하므로 거부한다.

### 20.4 Formula/Rollup 결과를 Markdown cell에 저장하기

Stale cache, cascading writes, Git noise, 두 개의 원본을 만들므로 거부한다.

### 20.5 Linked view마다 Markdown table 복사하기

여러 owner와 divergent values를 만들므로 거부한다.

### 20.6 Header 표시명으로 property를 식별하기

Rename, localization, duplicate labels에서 identity가 깨지므로 거부한다. Marker의 property ID 목록이 권위다.

## 21. 구현 순서

이 RFC는 한 번에 저장 형식을 바꾸는 대규모 patch를 요구하지 않는다. 그러나 각 단계는 최종 단일 엔진을 향해야 하며 영구 dual-write를 추가해서는 안 된다.

1. **Core format**
   - marker grammar와 versioned cell codec
   - GFM table ↔ typed row parser/serializer
   - stable document/record identity
   - conformance, fuzz, size-limit tests
2. **Read model**
   - owner discovery와 duplicate-owner diagnostics
   - table record index와 structural revisions
   - relation reverse index
3. **Derived engine**
   - stable-ID Formula AST compile/typecheck
   - cross-source dependency DAG
   - incremental Formula/Rollup invalidation
   - revision-bound derived snapshots
4. **Mutation engine**
   - cell-local source splice
   - row/document atomic create/delete
   - exact plan/commit/undo integration
5. **UI integration**
   - GFM table owner NodeView/database renderer
   - inline/full-page 동일 controller/read model
   - linked view reference-only rendering
   - source mode diagnostics and repair actions
6. **Git and collaboration**
   - stable block/row/property semantic merge
   - Yjs cell-local transactions
   - history attribution and conflict recovery
7. **Migration**
   - v1 read-only compatibility reader
   - preview/backup/apply/verify/rollback task
   - legacy record ID aliases
8. **Removal**
   - v1 writer와 source-folder record ownership 제거
   - generated folder creation 제거
   - obsolete tests/docs/merge rules 정리

각 단계의 behavior change는 changeset과 가장 좁은 관련 테스트를 동반한다. 저장 format, cross-package contract, migration이 실제로 변경되는 구현 PR은 repository-level verification 대상이다.

## 22. Acceptance criteria

### 22.1 Format

- [ ] Marker/table이 parse → serialize → parse에서 stable identity와 typed values를 보존한다.
- [ ] 일반 GFM table은 database marker가 없으면 기존 table로 동작한다.
- [ ] Marker만 있거나 malformed table이면 원본 bytes를 보존하고 diagnostic을 표시한다.
- [ ] Property rename/reorder/localization 후에도 stable property binding이 유지된다.
- [ ] Wikilink alias/path rename 후에도 stable document/record identity가 유지된다.

### 22.2 Single engine

- [ ] Inline과 full-page 생성이 같은 owner-table writer를 사용한다.
- [ ] Linked view는 owner values를 복사하지 않는다.
- [ ] Existing folder는 one-time onboarding이며 live dual-source sync가 없다.
- [ ] 새 데이터베이스 생성이 generated source folder나 `rec_*` filename을 만들지 않는다.
- [ ] V2 mutation 중 v1 record frontmatter를 동시에 쓰는 경로가 없다.

### 22.3 Formula/Rollup

- [ ] Formula/Rollup 결과가 canonical Markdown과 Git diff에 기록되지 않는다.
- [ ] Formula name/key references가 stable property ID AST로 컴파일된다.
- [ ] Formula/Rollup cross-source cycle이 commit 전에 거부된다.
- [ ] Stored cell 하나의 수정은 exact downstream rows/properties만 무효화한다.
- [ ] UI, HTTP, MCP, export가 같은 derived revision의 결과를 사용한다.
- [ ] Broken relation, invalid type, ambiguity, permission error가 명시적 derived error로 유지된다.

### 22.4 Mutation, recovery, and migration

- [ ] Cell edit가 unrelated table formatting/prose bytes를 바꾸지 않는다.
- [ ] Row creation이 normal document와 wikilink row를 원자적으로 생성한다.
- [ ] Row deletion이 linked document를 암묵적으로 삭제하지 않는다.
- [ ] Semantic merge가 서로 다른 cell 변경을 합치고 같은 cell 충돌을 표시한다.
- [ ] V1 migration이 record count, stable IDs/aliases, stored values, relations, Formula/Rollup 결과를 검증한다.
- [ ] Migration failure와 undo가 manifest, owner table, linked documents를 정확히 복구한다.

### 22.5 Standalone clone

- [ ] SynapseNote 없이 owner Markdown을 열면 stored values와 document links를 읽을 수 있다.
- [ ] Git clone에는 manifest, owner table, linked documents가 모두 존재한다.
- [ ] Index/cache/runtime state 없이 database catalog와 records를 재구축할 수 있다.
- [ ] Computed value가 필요한 외부 사용자는 revision-stamped export snapshot을 만들 수 있다.

## 23. 최종 제품 원칙

이 RFC가 채택하는 제품 원칙은 다음 한 문장으로 요약된다.

> SynapseNote 데이터베이스는 별도 레코드 파일 시스템이 아니라, 일반 Markdown 문서 안의 canonical table과 일반 Markdown 문서를 연결하는 typed projection이다.

사용자가 입력한 값은 읽을 수 있는 Markdown에 남는다. 문서 본문은 정상적인 `.md` 문서로 남는다. Formula/Rollup은 canonical inputs로부터 결정적으로 계산된다. 인라인, 전체 페이지, linked view, 사람 UI, Agent Data Plane은 모두 이 하나의 모델을 사용한다.
