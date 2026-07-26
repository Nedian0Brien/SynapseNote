# RFC 0008: Markdown table canonical database storage

- 상태: 방향 승인, 구현 대기
- 작성일: 2026-07-27
- 대상: `packages/core`, `packages/server`, `packages/app`, `packages/cli`, 데이터베이스 저장·인덱스·Git merge·마이그레이션 경계
- 성격: canonical 저장 형식 변경, 단일 데이터베이스 엔진 결정
- 구현 체크리스트: [RFC 0008 implementation checklist](./0008-markdown-table-database-storage-implementation-checklist.md)
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

### 6.3 Title property와 Wikilink 규칙

v2는 새 public `document` property type을 추가하지 않는다. Source의 기존 단일
`title` property ID를 첫 번째 물리 열에 그대로 사용하되, 그 열의 v2 cell codec을
document wikilink로 변경한다. 논리 API에서 Title property는 계속 같은 stable
property ID로 조회되며 값은 linked document의 canonical title projection이다.

- Marker의 `columns` 첫 항목은 source의 유일한 `title` property ID여야 한다.
- 첫 열은 정확히 하나의 non-embed wikilink를 가져야 한다.
- `[[path]]`와 `[[path|alias]]`를 허용한다.
- alias는 표시 문자열일 뿐 document identity의 원본이 아니다. Document title과
  다르면 stale-alias diagnostic을 낼 수 있지만 record resolution은 유지한다.
- heading anchor가 있는 `[[path#heading]]`은 record entity로 허용하지 않는다. relation/reference cell에서는 schema가 허용할 수 있다.
- 링크 target 이동은 existing rename log와 wikilink remap 경계를 통해 갱신한다. `document_id`는 바뀌지 않는다.
- 링크 대상이 없으면 행을 삭제하지 않고 `broken_document_link` diagnostic을 낸다.
- 같은 source에 같은 `document_id`가 두 번 나오면 두 행 모두 byte-preserved invalid 상태로 격리한다.

v1 Title 값은 migration 중 linked document의 ordinary title contract로 옮긴다.
현재 문서 title과 v1 Title이 같으면 bytes를 바꾸지 않는다. v1 Title만 존재하면
일반 문서 title로 materialize할 변경을 preview한다. 두 값이 다르면 어느 쪽도
자동으로 덮어쓰지 않고 사용자가 `keep_document_title`, `use_record_title`,
`custom_title` 중 하나를 선택하기 전까지 migration을 막는다.

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
| `title` | 정확히 하나의 linked-document `[[wikilink]]`; 논리 값은 문서 title projection |
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

- Migration은 preview, backup, exact target set, approval, atomic cutover,
  verification, rollback receipt를 가진 durable task다.
- v1과 v2에 동시에 쓰지 않는다. Compatibility 기간에는 둘 다 읽을 수
  있지만 하나의 database manifest와 그 모든 source에는 active writer가 항상 하나다.
- Migration 전 v1 source는 v1 reader로 정상 조회할 수 있다. 사용자가
  migration plan을 승인하고 write freeze가 시작된 뒤에는 해당 source의
  일반 mutation을 거부한다.
- Staging artifact는 canonical state가 아니다. Manifest가 v2로 cutover되고
  post-commit verification이 통과한 순간부터 v2 owner table만 canonical이다.
- 실패한 migration과 승인된 undo는 manifest, owner document, linked
  documents, 이전 v1 record documents를 recorded SHA-256 bytes로 복구한다.
- Invalid value를 임의로 정상화하거나 버리지 않는다. Raw value와 source
  location을 보존한 채 blocker 또는 explicit preserved-invalid cell로 옮긴다.
- 대형 source를 몰래 다른 저장 엔진으로 넘기지 않는다. v2 byte/row/column
  한계를 넘으면 source split 또는 export를 안내하고 migration을 막는다.

### 17.2 Version 경계와 v2 manifest target

현재 구현의 v1 manifest는 `version: 1`, source별 `folder`와
`includeSubfolders`, record별 `_sn.database_id`, `_sn.source_id`,
`_sn.record_id`, database-owned property frontmatter를 사용한다. v2 manifest는
논리적 database/source/property/view 정의는 유지하면서 source의 물리 저장
계약을 다음처럼 바꾼다.

```yaml
version: 2
id: db_orders
key: orders
name: Orders
sources:
  - id: ds_orders
    key: orders
    name: Orders
    recordMeaning: One order
    storage:
      kind: markdown_table
      formatVersion: 2
      owner:
        path: orders.md
        blockId: dbb_orders_primary
      titlePropertyId: prop_order_title
      storedPropertyIds:
        - prop_order_title
        - prop_quantity
        - prop_price
        - prop_project
    properties:
      # 기존 stable property definitions 유지
```

`storage.owner.path`는 content root 기준 normalized Markdown path이고
`blockId`는 owner marker의 `block`과 일치해야 한다. `storedPropertyIds`는
marker의 `columns`와 정확히 같은 순서여야 하며 Formula, Rollup, audit-derived,
button property를 포함하지 않는다. `titlePropertyId`는 source의 기존 단일
Title property ID이고 `storedPropertyIds`의 첫 항목이어야 한다.

Migration compatibility metadata는 manifest의 bounded `migration` block에
기록한다. 이 block은 값의 두 번째 원본이 아니며 v1 writer나 folder discovery를
활성화하지 않는다.

```yaml
migration:
  fromVersion: 1
  committedAt: 2026-07-27T00:00:00Z
  sourceFolders:
    ds_orders: generated/orders
  legacyRecordIds:
    rec_old_order_001:
      sourceId: ds_orders
      documentId: doc_order_001
      canonicalRecordId: rec_v2_order_001
```

Plan은 migration block을 포함한 manifest가 기존 1 MiB manifest boundary를
넘는지 사전에 계산한다. Alias가 예산을 넘는 source는 alias를 잘라내지 않고
migration 전체를 막는다. 별도 alias artifact를 추가하려면 이 RFC를 개정하여
하나의 versioned canonical 위치와 standalone-clone 계약부터 결정해야 한다.

### 17.3 Canonical ownership 변환표

| v1 state | v2 target | 변환 규칙 |
| --- | --- | --- |
| Manifest `version: 1` | Manifest `version: 2` | 기존 logical IDs/schema/views는 보존하고 source storage shape만 교체한다. |
| `source.folder` / `includeSubfolders` | `source.storage.owner` | 이전 값은 compatibility provenance로만 남고 discovery/write scope로 사용하지 않는다. |
| `_sn.database_id`, `_sn.source_id` | Owner marker와 manifest | Linked document에서는 제거한다. |
| `_sn.record_id` | Derived canonical record ID + `legacyRecordIds` alias | 기존 API ID가 같은 row를 resolve하는지 검증한다. |
| v1 Title frontmatter | Linked document title + 첫 wikilink 열 | 충돌 없는 경우만 자동 변환하고 title conflict는 사용자 선택을 요구한다. |
| Stored property frontmatter | Owner table typed cell | Stable property ID와 raw/typed equivalence를 모두 검증한다. |
| Relation record ID | Target document wikilink | Target source에서 legacy ID를 stable document ID/path로 해석할 수 있어야 한다. |
| Formula/Rollup definition | v2 manifest definition | Stable property-ID AST와 definition revision을 보존한다. 결과 cell은 만들지 않는다. |
| Formula/Rollup cached result | 없음 | 같은 frozen evaluation context에서 재계산한 결과만 비교한다. |
| `_sn.archived_at` | Reserved stored lifecycle column | Manifest가 선언한 stable system property로 변환하고 기본 view에서는 숨긴다. |
| `_sn.created_at/by`, `_sn.last_edited_at/by` | Audit-derived baseline + transaction history | v1 값을 migration verification baseline으로 보존하고 cell에는 쓰지 않는다. |
| `_sn.page_layout_override` | Manifest-owned record layout override | Canonical record ID로 key를 바꾸고 orphan reference를 거부한다. |
| Unrelated frontmatter/body | 같은 linked document | Document ID/title에 필요한 승인 변경 외에는 byte-for-byte 보존한다. |
| v1 record path | Linked document path | Existing-folder 문서는 유지하고 generated path rename은 별도 선택으로 처리한다. |
| Inline/full-page `DatabaseView` | Owner block 또는 linked view | Source마다 정확히 하나만 owner가 되고 나머지는 reference-only linked view가 된다. |

Reserved lifecycle/audit/layout representation은 v2 manifest schema가 확정될 때
strict schema와 size budget을 가져야 한다. 이 세 필드의 canonical target이
구현되지 않은 상태에서는 migration을 출시할 수 없다.

### 17.4 Migration eligibility와 blockers

Inventory는 source마다 다음 항목을 전부 수집한다.

Migration의 최소 write unit은 v1 manifest 하나다. Top-level manifest version이
writer를 선택하므로 사용자가 source 하나만 선택해도 같은 manifest의 다른 source를
전부 write target에 포함한다. 다른 database manifest의 relation/Rollup target은
temporary read dependency가 될 수 있다.

- manifest path, byte revision, declared/supported version
- source folder의 resolved real path와 symlink 여부
- 포함되는 `.md`/`.mdx` record path, byte revision, size, line ending, BOM
- record/database/source ID와 중복 여부
- property별 raw value, typed value, invalid diagnostic
- relation target과 target source resolution
- Formula/Rollup definition revision, dependency graph, frozen computed result
- title source, document body, unrelated frontmatter key와 ownership
- archive/audit/layout override metadata
- inline/full-page/linked `DatabaseView` reference와 potential owner location
- destination document path, marker block ID, expected table bytes

다음 중 하나라도 있으면 plan은 `blocked`이며 apply를 제공하지 않는다.

- malformed/unsupported manifest 또는 알려지지 않은 schema version
- source root 밖의 path, symlink escape, case-folding collision
- duplicate database/source/property/record ID
- missing 또는 mismatched `_sn` database/source/record identity
- unresolved Title conflict 또는 owner 위치 미선택
- owner path 충돌, duplicate owner marker, unsafe destination path
- relation target missing/ambiguous, temporary v1 read dependency로 안전하게 고정할
  수 없음, 또는 migration batch에도 포함되지 않음
- Formula/Rollup parse/type/cycle/permission failure
- cell codec으로 lossless하게 표현할 수 없는 stored value
- v2 owner document, table, manifest 또는 migration alias size limit 초과
- revision을 읽는 동안 manifest/record/view reference가 변경됨
- backup 또는 transaction journal을 durable하게 쓸 수 없음

Invalid-but-preserved v1 property는 해당 v2 codec이 raw representation을
round-trip할 수 있고 UI/API가 같은 invalid diagnostic을 유지할 때만 blocker가
아니다. 그렇지 않으면 사용자가 값을 수정하거나 명시적으로 제외할 때까지 막는다.

### 17.5 Durable task state machine

Migration task는 다음 상태만 사용한다.

```text
discovered
  -> blocked
  -> planned
  -> approved
  -> staging
  -> verifying_staged
  -> committing
  -> verifying_committed
  -> committed

discovered|planned|approved|staging|verifying_staged -> failed
approved|staging|verifying_staged -> cancelled
staging|verifying_staged|committing|verifying_committed -> rolling_back
rolling_back -> rolled_back | rollback_blocked
```

각 전이는 task ID, idempotency key hash, plan hash, actor, expected workspace
snapshot, target file set, per-file before/after hash, checkpoint cursor를 durable
task store에 먼저 기록한다. 같은 idempotency key와 plan hash의 재요청은 기존
task를 반환한다. 같은 key로 다른 plan을 제출하면 거부한다.

`blocked`는 데이터나 사용자 선택 때문에 committable plan을 만들 수 없는 상태이고
`failed`는 I/O 또는 내부 실행 실패지만 canonical cutover가 시작되지 않은 상태다.
`committing` 이후 실패는 바로 `failed`로 끝내지 않고 반드시 `rolling_back` 또는
`rollback_blocked`로 전이하여 active storage 상태를 설명한다.

- `planned` 이전에는 파일을 쓰지 않는다.
- `approved` 이후 staging 전에는 모든 expected revision을 다시 확인한다.
- `committing` 진입 뒤 cancel 요청은 취소가 아니라 rollback 요청이 된다.
- Process restart는 마지막 durable checkpoint에서 재개하되 이미 쓴 파일의
  hash가 expected after hash와 일치할 때만 다음 단계로 간다.
- Unknown bytes가 발견되면 자동 overwrite하지 않고 `rollback_blocked`로 멈춘다.

### 17.6 상세 전환 절차

#### Phase 0 — Format과 구현 경계 동결

1. Manifest v2 schema, owner marker grammar, property cell codec을 versioned core
   contract로 고정한다.
2. Title/document, lifecycle, audit, layout override의 canonical 위치를 결정한다.
3. Parser/serializer limits와 semantic revision 알고리즘을 고정한다.
4. v1 reader와 v2 reader가 동일한 logical `DatabaseRecord` projection을
   반환하는 adapter boundary를 만든다.
5. v2 writer가 없는 상태에서 fixtures를 읽고 equivalence report를 생성한다.

이 phase는 파일 mutation이 전혀 없고, 모든 codec conformance fixture와 manifest
schema test가 통과해야 끝난다.

#### Phase 1 — Read-only inventory와 preflight

1. Workspace snapshot을 획득하고 대상 database manifest의 모든 source를 write
   closure로 만든다.
2. Cross-database relation/rollup dependency는 migration 대상 또는 version-pinned
   temporary read dependency로 closure에 추가한다.
3. v1 reader로 모든 record를 materialize하고 raw bytes와 typed snapshot을 함께
   hash한다.
4. Owner 후보, document title 충돌, destination path 충돌을 분석한다.
5. 각 stored property를 v2 cell codec으로 encode한 뒤 decode하여 typed/raw
   equivalence를 확인한다.
6. 예상 owner table/manifest/document diff와 byte/row/column 예산을 계산한다.
7. Blocker, warning, lossy choice, 사용자 선택이 필요한 항목을 source location과
   함께 반환한다.

Preflight는 read-only이며 incomplete scan을 `complete: true`로 표시해서는 안
된다. 파일 한 개라도 읽지 못하면 committable plan을 만들 수 없다.

#### Phase 2 — Exact plan과 사용자 승인

Plan에는 다음이 전부 포함되어야 한다.

- create/update/rename/delete되는 project-relative path
- 각 기존 파일의 expected SHA-256와 각 결과 파일의 planned SHA-256
- owner marker/table의 exact preview와 property column mapping
- document ID assignment, record ID/legacy alias mapping
- frontmatter key별 `preserve`, `move_to_cell`, `move_to_document_title`, `remove`
- relation ID → target wikilink mapping
- archived/audit/layout metadata mapping
- generated path rename 선택과 모든 rewritten wikilink
- expected logical before/after counts와 revisions
- warning, loss acknowledgement, rollback scope와 estimated bytes

Plan hash는 이 canonical plan 전체에 바인딩한다. Approval UI와 Agent Data Plane은
요약 숫자뿐 아니라 path/record/property별 diff를 inspect할 수 있어야 한다.

#### Phase 3 — Backup, freeze, and staging

1. Apply 직전 workspace/manifest/index revision이 plan과 일치하는지 확인한다.
2. 대상 source에 write freeze를 설치하고 UI/API/MCP/offline queue/automation의
   새 mutation을 `migration_in_progress`로 거부한다.
3. 대상 모든 before bytes와 Git object ID를 recovery journal에 기록한다.
4. 같은 filesystem/volume의 task-scoped staging directory에 v2 manifest,
   owner documents, modified linked documents를 쓴다.
5. 새 파일을 fsync하고 staging hash가 plan의 after hash와 같은지 확인한다.
6. Canonical v1 파일은 이 단계에서 수정하지 않는다.

Backup은 before bytes를 복구할 수 있다는 것을 실제 read-back/hash verification으로
증명해야 한다. 단순히 “Git에 있을 것”이라고 가정하지 않는다.

#### Phase 4 — Staged logical verification

Staging root를 독립 workspace처럼 열어 cache 없이 다음을 검증한다.

1. v2 manifest와 모든 owner marker/table이 strict parse된다.
2. source마다 owner가 정확히 하나이고 marker/manifest binding이 일치한다.
3. 모든 linked document가 content root 안에서 하나의 document ID로 resolve된다.
4. record count, canonical/legacy IDs, stored typed values, invalid raw values가
   v1 frozen snapshot과 일치한다.
5. Title, archive, audit baseline, layout override가 mapping contract와 일치한다.
6. Relation target set과 cardinality가 일치한다.
7. Formula/Rollup을 같은 frozen evaluation timestamp, timezone, permission
   revision으로 계산한 결과와 error state가 일치한다.
8. v1 database-owned frontmatter가 계획대로 제거됐고 unrelated frontmatter/body
   hash는 계획된 title/document-ID edit 외에는 같다.
9. Cache/index 없이 catalog/query/open-record/export smoke scenario가 통과한다.

하나라도 실패하면 canonical files를 건드리지 않고 staging을 폐기하거나 보존하여
diagnostic을 제공한다.

#### Phase 5 — Atomic cutover

1. 모든 expected revision과 write freeze 소유권을 마지막으로 확인한다.
2. Commit 동안 새 reader는 차단하고 기존 reader에는 frozen pre-migration snapshot만
   제공한다.
3. Owner document와 새 destination document처럼 v1 source를 손상하지 않는 additive
   v2 artifact를 transaction journal 순서대로 materialize한다. Existing document를
   그대로 쓰는 경우 v1 `_sn`과 property frontmatter를 유지한 채 범용 document ID처럼
   v1 reader가 무시할 수 있는 필드만 먼저 추가한다.
4. Generated record를 normal path로 옮기는 선택은 destination에 복사본을 먼저 만들고
   v1 original은 그대로 둔다. Owner table은 destination을 참조한다.
5. v2 manifest를 **활성화 write**로 교체한다. 이 전까지 v1이 canonical이고,
   이 write 이후 v2가 canonical이다.
6. Manifest 활성화 후 v1 database-owned frontmatter를 제거하고, 검증된 destination이
   있는 generated original만 cleanup target으로 처리한다.
7. 각 step의 after hash를 journal에 기록하고 directory entry를 fsync한다.

운영체제가 전체 file set에 대한 단일 atomic rename을 제공하지 않으므로 journal과
manifest activation이 논리 transaction 경계다. Activation 전 write는 v1을 계속
읽을 수 있는 additive change여야 하고 activation 후 write는 v2가 이미 읽을 수 있는
state에서 cleanup만 수행해야 한다. Crash recovery는 manifest
version과 journal checkpoint를 읽어 forward-complete 또는 exact rollback 중 하나만
수행하며 mixed writer 상태를 허용하지 않는다.

#### Phase 6 — Post-commit rebuild와 verification

1. 모든 database index/computed cache를 삭제한 조건에서 v2 manifest/table로
   재구축한다.
2. HTTP, MCP, app read model이 같은 snapshot/derived revision을 반환하는지 확인한다.
3. Representative create/edit/move/archive/delete plan을 dry-run하고 target이 owner
   table/document뿐이며 v1 frontmatter writer를 호출하지 않는지 확인한다.
4. Formula/Rollup reverse index와 dependency invalidation smoke test를 실행한다.
5. Git diff에 expected manifest/table/document 변경만 있는지 검사한다.
6. Verification receipt와 undo token을 기록한 뒤 write freeze를 해제한다.

Post-commit verification 실패는 성공으로 보고하지 않는다. 즉시 automatic rollback을
시도하고, unknown external changes 때문에 안전한 rollback이 불가능하면 source를
read-only `recovery_required` 상태로 둔다.

#### Phase 7 — Finalization과 v1 cleanup

Commit 직후 v1 compatibility provenance와 rollback material을 삭제하지 않는다.
정해진 retention window 동안 undo를 제공한다. Retention 종료 뒤에도 다음 조건을
모두 만족해야 cleanup을 제안할 수 있다.

- 같은 v2 snapshot으로 최소 두 번의 cold rebuild 성공
- 사용자가 승인한 v2 mutation과 undo 각 1회 이상 성공 또는 release fixture 증거
- unresolved migration/recovery diagnostic 없음
- 외부 link/reference가 legacy path나 ID를 요구하지 않음
- backup export와 standalone clone rebuild 성공

Cleanup은 별도 destructive plan이다. Generated v1 폴더가 비었더라도 자동 삭제하지
않고 exact target과 recovery 가능성을 보여준다.

### 17.7 Document path와 Title 처리

- Existing-folder source의 문서는 기본적으로 현재 path를 유지한다.
- 앱이 만든 `untitled_database_*`/`rec_*` path는 자동 rename하지 않는다.
  Migration preview가 `keep_path`와 `move_to_normal_document`를 제공한다.
- `move_to_normal_document`는 normalized slug 후보, case-folding collision,
  existing link rewrite, Git rename detection을 보여주고 사용자가 승인해야 한다.
- 같은 record body를 여러 v1 source가 소유한 것으로 발견하면 자동 병합하지 않는다.
- 문서 body가 비어 있어도 `.md` document entity와 document ID를 유지한다.
- v1 Title과 문서 title conflict는 bulk default를 허용할 수 있지만 각 conflict를
  개별 inspect할 수 있어야 하며 선택이 plan hash에 포함된다.

### 17.8 Relation, Formula, Rollup 순서

Relation을 path로 변환하려면 target record mapping이 먼저 필요하므로 apply 순서는
다음으로 고정한다.

1. 전체 dependency closure의 record ID → document ID/path mapping 생성
2. 모든 scalar/title cell encode
3. relation record ID를 target document wikilink로 encode
4. owner table 전체 strict parse 및 relation resolution
5. Formula AST stable property ID resolution/typecheck
6. source 간 Formula/Rollup DAG와 reverse relation index 생성
7. frozen v1/v2 derived result 비교

Target source가 다른 database manifest에 있고 migration 대상이 아니라면 closure에서
version-pinned read dependency로 고정할 수 있다. Target이 v1이면 dependency document에
범용 document ID가 존재하거나 exact plan으로 추가되어야 하고 storage-neutral v1 adapter가
같은 logical target values를 제공해야 한다. 이것은 read compatibility이지 dual-write가
아니다. Cross-version relation/Rollup adapter는 compatibility 기간에만 유지하며 target
revision invalidation과 후속 target migration을 지원해야 한다. 이 조건을 충족하지 못하면
관련 database manifest를 같은 batch에 포함하거나 migration을 막는다.

### 17.9 Verification equivalence matrix

| 대상 | 완료 조건 |
| --- | --- |
| Database/source/schema/view IDs | Set equality와 stable definition revision 일치 |
| Record identity | 모든 canonical ID와 legacy ID lookup이 정확히 한 v2 row를 반환 |
| Record count | Active/archived/invalid/broken 분류별 count가 각각 일치 |
| Stored values | Property ID별 typed deep equality; invalid value는 raw bytes와 diagnostic code 일치 |
| Title/document | v1 logical Title, v2 document title projection, first-cell resolution이 일치 |
| Relations | Source record/property별 ordered target record set과 cardinality 일치 |
| Formula/Rollup | Frozen context에서 value 또는 explicit error code deep equality |
| Body/frontmatter | 계획된 key/title/document-ID edit 외의 normalized-independent byte hash 일치 |
| Permissions | Representative principals별 visible/redacted/error 결과 일치 |
| Query | Filter/sort/group/projection/page cursor 결과 record ID sequence 일치 |
| API/MCP | Logical payload와 completeness/revision semantics 일치; storage path shape만 documented change |
| Standalone clone | Cache/task store 없이 manifest/table/documents에서 catalog와 records 재구축 |
| Rollback | 모든 before-path bytes와 manifest/index logical snapshot이 migration 전 hash와 일치 |

Line ending이나 YAML key order가 달라도 된다고 포괄적으로 허용하지 않는다. 변경이
필요한 정확한 source range만 plan에 기록하며 나머지는 byte equality를 요구한다.

### 17.10 실패, retry, cancel, rollback

| 발생 시점 | 처리 |
| --- | --- |
| Inventory/preflight 실패 | 쓰기 없음; blocker report만 반환 |
| Staging 실패 | canonical v1 유지; staging 정리 또는 resumable checkpoint 보존 |
| Staged verification 실패 | canonical v1 유지; apply 금지 |
| Cutover 중 crash, v1 manifest active | Journal의 partial v2 files를 제거하거나 before bytes로 복구 |
| Cutover 중 crash, v2 manifest active | Journal hash가 맞으면 forward-complete 후 검증; 아니면 rollback |
| Post-commit verification 실패 | Automatic rollback 시도; 불가하면 read-only recovery-required |
| Undo 요청, 이후 변경 없음 | Exact reverse transaction 적용 후 v1 index cold rebuild |
| Undo 요청, 이후 파일 변경 있음 | 덮어쓰지 않고 path별 three-way conflict preview 반환 |

Retry는 같은 plan hash와 expected revisions에서만 가능하다. Blocker를 수정한 뒤에는
새 inventory와 새 plan/approval이 필요하다. Rollback 성공은 파일 복사 성공이 아니라
v1 manifest parse, record index rebuild, logical before snapshot equality까지 확인해야 한다.

### 17.11 Rollout과 compatibility 제거

1. **Read-only foundation**: v2 core schema/parser/codec과 equivalence harness를
   ship하되 production writer와 migration apply는 비활성화한다. Supported read
   versions와 default write version을 별도 상수/capability로 분리하여 이 단계에서
   database creation default를 실수로 v2로 올리지 않는다.
2. **Internal fixtures**: generated blank, existing folder, inline, full-page,
   multi-source relation, Formula/Rollup corpus를 CI에서 반복 migration/rollback한다.
3. **Opt-in pilot**: 새 v2 database와 수동 migration을 feature flag 아래 제한된
   workspace에서 제공하고 v1 writer는 v1 source에만 유지한다.
4. **V2 new-default**: release gate 통과 뒤 새 database 생성은 v2만 사용한다.
   기존 v1 source는 계속 읽히지만 edit 시 migration preview를 요구한다.
5. **Migration recommended**: blocker-free source에 명시적 migration CTA를 제공한다.
   Background auto-migration은 하지 않는다.
6. **V1 writer removal**: supported releases/rollback window가 지난 뒤 v1 mutation
   endpoint와 record-frontmatter writer를 제거한다. V1 reader/importer는 read-only다.
7. **Compatibility retirement**: migration coverage와 release policy가 허용할 때만
   v1 reader와 legacy aliases cleanup을 별도 RFC/release note로 제거한다.

Compatibility 기간의 “둘 다 읽기”는 두 저장 엔진에 쓰는 dual-write가 아니다.
Database manifest version이 그 manifest의 모든 source writer routing에 대한 유일한
권위이며 v2 mutation code에서
v1 record-frontmatter write가 관찰되면 invariant violation으로 commit을 중단한다.

### 17.12 운영 지표와 privacy

Migration telemetry는 content나 cell 값을 기록하지 않고 다음만 집계한다.

- 대상/성공/blocked/rolled-back source와 record count
- phase별 duration, retry, crash recovery, rollback 결과
- blocker/error code와 property type
- before/after byte count, owner table row/column count
- cold rebuild와 Formula/Rollup verification duration
- semantic merge conflict와 post-migration repair count

Path, title, wikilink, cell content, document body, Formula expression, person/email/file
값은 telemetry에 포함하지 않는다. Local diagnostics export는 사용자가 명시적으로
생성하며 redaction preview를 제공한다.

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

세부 작업, 의존성, 영역별 완료 증거와 release gate의 normative tracker는
[RFC 0008 implementation checklist](./0008-markdown-table-database-storage-implementation-checklist.md)다.
아래 순서는 요약이며 checklist 항목이 코드·테스트·운영 증거 없이 체크되어서는
안 된다. RFC 본문과 checklist가 충돌하면 이 RFC의 저장 불변식이 우선한다.

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
- [ ] V1 Title, archive/audit metadata, page layout override가 documented v2 target으로 lossless하게 이동한다.
- [ ] Migration task가 manifest activation boundary와 durable checkpoint로 모든 crash boundary에서 v1 또는 v2 한쪽으로만 복구된다.
- [ ] 같은 manifest의 모든 source가 한 migration batch에 포함되고 cross-database relation/rollup은 migrated target 또는 version-pinned read dependency로 검증되며 mixed writer가 생기지 않는다.
- [ ] Post-commit dry-run에서 v1 frontmatter writer target이 하나라도 발견되면 migration을 성공으로 확정하지 않는다.

### 22.5 Standalone clone

- [ ] SynapseNote 없이 owner Markdown을 열면 stored values와 document links를 읽을 수 있다.
- [ ] Git clone에는 manifest, owner table, linked documents가 모두 존재한다.
- [ ] Index/cache/runtime state 없이 database catalog와 records를 재구축할 수 있다.
- [ ] Computed value가 필요한 외부 사용자는 revision-stamped export snapshot을 만들 수 있다.

## 23. 최종 제품 원칙

이 RFC가 채택하는 제품 원칙은 다음 한 문장으로 요약된다.

> SynapseNote 데이터베이스는 별도 레코드 파일 시스템이 아니라, 일반 Markdown 문서 안의 canonical table과 일반 Markdown 문서를 연결하는 typed projection이다.

사용자가 입력한 값은 읽을 수 있는 Markdown에 남는다. 문서 본문은 정상적인 `.md` 문서로 남는다. Formula/Rollup은 canonical inputs로부터 결정적으로 계산된다. 인라인, 전체 페이지, linked view, 사람 UI, Agent Data Plane은 모두 이 하나의 모델을 사용한다.
