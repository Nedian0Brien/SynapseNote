# RFC 0011 post-v2 refactoring plan

- 기준일: 2026-07-31
- 브랜치: `codex/fix-row-latency-cv-fidelity`
- 선행 문서: RFC 0010 (최적화 종료 보고), RFC 0002 (대형 모듈 경계 — 절반만 실행됨)
- 대상: 이 문서를 받아 작업할 에이전트
- 판정: **세 Phase 모두 착수 승인됨.** 순서는 1 → 2 → 3 고정. 열린 결정 없음

이 문서는 자립적으로 작성되었습니다. 작성 당시 대화 맥락 없이도 실행 가능해야 합니다.

**진행 방식** — "완료 체크리스트" 절이 이 문서의 실행 계약입니다. 각 항목은 명령으로 확인 가능한 기준을 갖습니다. 항목을 체크하기 전에 그 기준을 실제로 실행해 통과를 확인하십시오. 통과 없이 체크하지 마십시오.

## 0. 먼저 — 이 저장소에서 검증할 때의 함정

**이 절을 건너뛰면 잘못된 것을 측정하거나, 없는 실패를 보고하게 됩니다.** 전부 실제로 당한 것들입니다.

### 테스트를 올바르게 실행하는 법

앱 테스트는 **반드시 `packages/app`에서 패키지 스크립트로** 실행합니다. 저장소 루트에서 `bun test packages/app/src`로 돌리면 `bunfig.toml`의 preload(`lingui-macro-preload`, `static-asset-preload`)와 `--conditions development`가 빠져서 **5,512개 중 1,563개가 거짓 실패**합니다.

```bash
cd packages/app && bun run test        # 비-DOM 티어. 정상이면 5870 pass / 1 fail
cd packages/app && bun run test:dom    # DOM 티어. 정상이면 10 pass / 0 fail
```

서버·코어는 루트에서 직접 실행해도 됩니다.

```bash
bun test packages/core/src                    # 정상이면 2630 pass / 0 fail
bun test packages/server/src/database-*.test.ts   # 정상이면 453 pass / 3 fail (Phase 1b 참조)
```

서버 전체 스위트는 필요할 때만 돌립니다 (느립니다).

### 서버 코드를 고쳤는데 dev 서버에 반영되지 않는 이유

dev 서버(5173)는 API를 **`packages/server/dist`에서** 서빙합니다. `packages/app/vite.config.ts`가 `hocuspocusPlugin()`을 로드하고, 그것이 bare specifier `@nedian0brien/synapsenote-server`를 import하는데 이는 `src`가 아니라 `default` export 조건(`dist/index.mjs`)으로 해석됩니다.

**소스만 고치고 vite를 재시작하면 아무것도 바뀌지 않습니다.**

```bash
bun run --filter @nedian0brien/synapsenote-server build
# 그 다음 vite 재시작, 그리고 반드시 확인:
grep -c '<변경에 고유한 문자열>' packages/server/dist/index.mjs
```

이 절차를 빠뜨려 변경이 들어있지 않은 번들을 측정한 적이 있습니다.

### 하지 말 것

- **`*Runtime.ts` 패턴 금지.** RFC 0002가 진입점을 2~13줄 파사드로 만들면서 덩어리를 옆 파일로 그대로 옮겼습니다 (`DatabaseSavedViewSettingsDialogRuntime.tsx` 1,916줄, `use-database-workspace-controller-runtime.ts` 1,257줄 — 원본보다 **커졌음**). 부모 RFC 0001 §5.6이 "No replacement megamodule"을 명시했는데 정확히 그것이 만들어졌습니다. 줄 수를 옮기는 것은 분할이 아닙니다.
- **동작 변경 금지.** 이 문서의 모든 항목은 순수 리팩터링 또는 타입 강화입니다. 동작을 바꿔야 할 이유를 발견하면 멈추고 보고합니다.
- **빨간 테스트를 남긴 채 다음 단계로 넘어가지 말 것.** Phase 1이 먼저인 이유입니다.

---

## Phase 1 — 빨간불 4개 (선행 필수)

리팩터링은 초록 스위트를 전제로 합니다. 지금 4개가 빨간불이고, 그 상태에서 구조를 바꾸면 무엇이 깨졌는지 판별할 수 없습니다.

### 1a. 모듈 경계 가드 (기계적, 판단 불필요)

**현상**

```
$ cd packages/app && bun run test
(fail) RFC 0002 module boundary guard > every extracted boundary exists and stays below its size budget
error: lib/database-mutations/database-property-commands.ts exceeds 400 lines
Expected: <= 400   Received: 587
```

**원인** — 24개 속성 타입 작업이 이 파일을 예산 위로 밀어올렸고 방치되었습니다.

| 커밋 | 줄 수 |
| --- | ---: |
| (예산) | 400 |
| `a62753dd` 18개 속성 타입 | 432 ← 초과 시작 |
| `5d943a1c` relation/formula/rollup | 522 |
| `0b5ed1f9` Status | 528 |
| `025a3553` Button | 586 |

**작업** — 파일은 두 관심사로 깨끗하게 갈립니다.

`packages/app/src/lib/database-mutations/database-property-commands.ts`:

- **1–276행 = 카탈로그 + 시드.** "어떤 속성 타입을 제공하며, 새로 만들 때 초기 설정은 무엇인가."
  `databasePropertyKeyFromName`, `DATABASE_ADDABLE_PROPERTY_GROUPS`, `databaseAddablePropertyGroups`, `databaseAddablePropertyTypes`, `DATABASE_ADDABLE_PROPERTY_TYPES`, `EMPTY_FORMULA_SOURCE`, `SEEDED_BUTTON_RECORD_TITLE`, `DATABASE_BUTTON_FIRST_ACTION_ID`, `nextDatabaseButtonActionId`, `createDatabasePropertyDefinitionForAdd`
- **277–586행 = desired-state 명령.** 파일에 선언된 owner("database schema property commands")와 일치하는 부분.
  `createDatabaseAddPropertyDesiredState`, `...Duplicate...`, `...Rename...`, `...UnsetPropertyValues...`, `...Remove...`, `...ReorderProperties...`

앞 절반을 새 형제 모듈로 추출합니다. 이 디렉터리에는 이미 선례가 있습니다 (`database-property-advanced-commands.ts`, `database-property-option-commands.ts`).

- 새 파일: `lib/database-mutations/database-property-catalog.ts` (약 276줄)
- 남는 파일: `database-property-commands.ts` (약 310줄, 예산 400 이하)

그 다음 **예산을 등록**합니다. `packages/app/src/build/module-boundaries.ts`의 `MODULE_SIZE_BUDGETS`에 새 항목을 추가하고, 같은 파일 테스트의 `DATABASE_LEAF_BOUNDARIES` 배열(`src/build/module-boundaries.test.ts:16`)에도 경로를 추가합니다. 예산은 관대하게 잡지 말고 현재 크기에 근접하게 (예: 300) 둡니다 — 예산의 목적은 다시 부풀지 않게 하는 것입니다.

> **줄 수 계산 주의.** 가드는 `wc -l`이 아니라 `readFileSync(...).split(/\r?\n/).length`를 씁니다 (`module-boundaries.ts:317`). 끝에 개행이 있는 파일은 `wc -l`보다 **1 큽니다** — 그래서 `wc -l`이 586인 이 파일을 가드는 587로 봅니다. 예산 400은 `wc -l` 기준 399 이하를 뜻합니다. 경계에서 한 줄 차이로 실패하지 않도록 가드 기준으로 확인하십시오.

**주의** — `DATABASE_LEAF_BOUNDARIES`의 모듈은 두 가지 추가 제약을 받습니다 (같은 테스트 파일 97–118행): transport 클라이언트를 직접 import할 수 없고(`database-(catalog|query)-client`, `database-(linked-view|offline)-cache`), `window.location.hash =`를 쓸 수 없으며, `lib/database-cell-mutation` 호환 배럴을 import할 수 없습니다. 추출한 파일이 이를 위반하지 않는지 확인합니다.

**완료 정의**

```bash
cd packages/app && bun run test        # 5871 pass / 0 fail
cd packages/app && bun run typecheck
bunx biome check packages/app/src/lib/database-mutations/
```

import 사이트가 깨지지 않았는지 확인합니다. 이 심볼들의 소비자는 속성 추가 다이얼로그와 Button 편집기입니다.

### 1b. 서버 API 계약 3건 (**결정 완료 — 아래대로 반영**)

**현상** — `bun test packages/server/src/database-*.test.ts`에서 3건 실패:

1. `database-api-schema.test.ts` — `versioned database API schemas > publishes one immutable v1 registry for every required operation family`
2. `database-api-schema.test.ts` — `... > defines content-free task list, get, cancel, progress, result, and problem envelopes`
3. `database-task-service.test.ts:158` — `creates a blank v2 owner table through the reviewed plan without a generated record folder`

**원인** — 이 브랜치가 만든 것입니다. `edbd7ace`(2026-07-27, "harden markdown table v2 migration and routing")가 `DATABASE_API_SCHEMAS.operations`(`packages/server/src/database-data-plane-api.ts:3122`)에 `markdownTableMutation`을 추가했는데, 그 레지스트리를 고정하는 계약 테스트를 갱신하지 않았습니다.

**1번 — 결정: 연산 목록에 `markdownTableMutation`을 추가한다. 스키마 버전은 1로 유지한다.**

근거:

- `/api/databases/markdown-table/mutate`는 실제로 라우팅된 엔드포인트이며(`api-extension.ts:18378`) 앱 자신이 호출합니다(`app/src/lib/database-markdown-table-client.ts:33`). 선언하는 쪽이 사실에 맞습니다.
- 연산 추가는 **가산적**이라 기존 연산의 형태를 바꾸지 않습니다.
- 레지스트리에는 **프로덕션 소비자가 없습니다.** `DATABASE_API_SCHEMAS`를 읽는 곳은 자기 자신의 계약 테스트뿐입니다 (주석은 "transports, contract tests, future SDK generation"이라고 하지만 transport는 실제로 읽지 않습니다). 응답 헤더 `X-SynapseNote-Database-Schema-Version: 1`은 나가지만 레지스트리 내용을 파싱하는 클라이언트는 없습니다. 따라서 버전을 올려도 알아볼 대상이 없고, 올리지 않아도 깨질 대상이 없습니다.

즉 이것은 호환성 위험이 아니라 **선언의 정확성** 문제이고, 정확한 선언은 "이 엔드포인트는 존재한다"입니다.

테스트(`database-api-schema.test.ts:54`)의 기대 목록에 `markdownTableMutation`을 추가합니다. 위치는 레지스트리의 실제 키 순서와 일치시켜야 합니다 (`toEqual`은 순서를 봅니다) — 현재 레지스트리에서는 `commit`과 `agentRuns` 사이입니다.

**2번과 3번 — 판단 불필요, 형태를 맞추면 됩니다.**

2번은 `DatabaseTaskResponseSchema`의 `preview_migration` 봉투가 v2 작업 중 바뀐 것이고, 3번은 `plan.diff.manifests`의 기대 항목이 낡은 것입니다. 둘 다 공개 계약 동결과 무관하므로 **현재 스키마·동작에 맞게 테스트를 갱신**합니다.

단, 갱신 전에 확인할 것: 바뀐 형태가 **의도된 것인지** 각 스키마의 정의를 읽고 판단합니다. 스키마가 실수로 바뀐 것으로 보이면 테스트가 아니라 스키마를 고치고 보고합니다.

**완료 정의**

```bash
bun test packages/server/src/database-*.test.ts   # 456 pass / 0 fail
```

---

## Phase 2 — 워크스페이스 컨텍스트 두 타입에 실제 타입 부여

근거가 가장 확실하고 범위가 명확한 구조 작업입니다.

### 근거

`packages/app/src/components/database-workspace-context.ts:11,14`:

```ts
export type DatabaseWorkspaceRenderContext = Record<string, any>;
export type DatabaseWorkspaceControllerContext = Record<string, any>;
```

이 둘은 저장소 비테스트 소스 전체에서 **유일한 `Record<string, any>`** 입니다. 소비 측은 14개 파일, 약 504개의 무검증 프로퍼티 읽기, 총 6,342줄입니다.

**두 타입은 생산 구조가 다르며, 그래서 처방도 다릅니다.** 이름이 비슷해서 하나로 착각하기 쉬우니 주의하십시오.

`DatabaseWorkspaceRenderContext` — **생산자 하나.** `use-database-workspace-controller-runtime.ts:1016`의 `workspaceRenderContext` 객체 리터럴 하나(1016–1240행, 약 223개 키)가 프레젠테이션 컴포넌트 전체에 전달됩니다.

`DatabaseWorkspaceControllerContext` — **생산자 다섯.** 224키짜리 단일 객체가 아닙니다. 같은 런타임 파일 안에서 명령 훅마다 **별개의 인라인 리터럴**이 만들어지고, 다섯 개가 모두 같은 `Record<string, any>` 타입을 답니다:

| 호출 지점 | 훅 | 리터럴 범위 | 키 수 |
| --- | --- | --- | ---: |
| `:622` | `useDatabaseWorkspaceMutationCommands` | 622–672 | ~49 |
| `:686` | `useDatabaseWorkspaceRecordCommands` | 686–725 | ~38 |
| `:737` | `useDatabaseWorkspaceBulkCommands` | 737–781 | ~43 |
| `:794` | `useDatabaseWorkspaceSchemaCommands` | 794–850 | ~55 |
| `:865` | `useDatabaseWorkspaceViewCommands` | 865–986 | ~120 |

| 소비자 | 읽는 키 수 |
| --- | ---: |
| `DatabaseWorkspaceOverlayHost.tsx:41` | 79 |
| `useDatabaseWorkspaceViewCommands.ts:39` | 66 |
| `DatabaseWorkspaceViewRenderer.tsx:21` | 60 |
| `DatabaseWorkspaceRecordActions.tsx:24` | 56 |
| `DatabaseWorkspaceToolbar.tsx:49` | 48 |
| `useDatabaseWorkspaceSchemaCommands.ts:44` | 34 |
| `useDatabaseWorkspaceBulkCommands.ts:32` | 28 |
| `useDatabaseWorkspaceMutationCommands.ts:49` | 27 |
| `DatabaseWorkspaceHeader.tsx:28` | 27 |
| `useDatabaseWorkspaceRecordCommands.ts:71` | 26 |
| `DatabaseWorkspaceStatusPanel.tsx:16` | 22 |
| `DatabaseWorkspaceSidebar.tsx:7` | 16 |
| `DatabaseWorkspaceReadState.tsx:13` | 15 |

**이미 한 번 조용히 깨졌습니다.** `refreshNow`가 소비자에 전달되지 않았는데 컴파일이 통과했고, `undefined()` 호출이 `.then` 안에서 던져졌으며, 모든 훅이 `.catch`를 `setMutationError(classifyDatabaseUiProblem(...))`로 흘려보내기 때문에 **서버 거부와 구분되지 않았습니다.**

즉 실패 양상은 크래시가 아니라 **서버에서는 성공한 작업을 UI가 실패로 표시**하는 것입니다. 같은 형태의 지점이 최소 11곳 확인되었습니다 — 예: `useDatabaseWorkspaceSchemaCommands.ts:404`(undo), `:438`(redo), `useDatabaseWorkspaceMutationCommands.ts:599`(Button 실행). 사용자는 이미 반영된 작업을 재시도하게 됩니다.

기존 수정이 타입이 아니라 런타임 가드(`typeof refreshNow === 'function'`, `useDatabaseWorkspaceMutationCommands.ts:313`)였던 것 자체가 타입이 아무 보호도 못 한다는 자백입니다.

**2차 피해:** 값이 `any`라서 하위 콜백에도 `any`가 전염됩니다 (46곳). 그리고 5개 파일이 `biome-ignore-all lint/suspicious/noExplicitAny` 헤더를 달고 있어 **그 2,500줄 안에서는 새로운 `any`를 린터가 잡지 못합니다.** 예: `DatabaseWorkspaceRecordActions.tsx:121`의 `.sort((left: any, right: any) => left.order - right.order)` — `order` 필드명이 바뀌면 조용히 `NaN` 정렬이 됩니다.

### 작업

**동작 변경 없이 타입만 강화합니다.** 조사에서 504개 읽기를 각 생산 리터럴과 기계적으로 대조한 결과 **현재는 전부 해소됩니다.** 따라서 타입을 붙이면 즉시 통과해야 하며, **타입 에러가 나온다면 그것은 잠복 버그이지 리팩터링 실수가 아닙니다** — 고치지 말고 개별 보고합니다.

생산 구조가 다르므로 두 타입을 따로 처리합니다. **`RenderContext`부터 하십시오** — 생산자가 하나라 훨씬 쉽고, 여기서 얻는 감각이 두 번째 작업에 필요합니다.

**2-1. `RenderContext` (생산자 하나 — 유도로 해결)**

1. `:1016`의 `workspaceRenderContext` 리터럴은 그대로 두고, 그 타입을 유도해 export합니다. 손으로 223개 키를 적지 않습니다 — 손으로 적은 인터페이스는 즉시 낡습니다.
   ```ts
   // use-database-workspace-controller-runtime.ts
   export type DatabaseWorkspaceRenderContextShape = typeof workspaceRenderContext;
   ```
   (리터럴이 훅 본문 안에 있어 `typeof`를 직접 못 쓰면, 리터럴을 만드는 부분만 모듈 스코프 함수로 뽑고 `ReturnType<typeof ...>`을 씁니다. **함수를 뽑되 로직은 옮기지 않습니다.**)
2. `database-workspace-context.ts`에서 `Record<string, any>` 대신 그 타입을 재노출합니다.
3. 타입체크. 통과하면 계약이 확인된 것입니다.

**2-2. `ControllerContext` (생산자 다섯 — 훅마다 하나씩)**

단일 타입으로 묶으려 하지 마십시오. 다섯 리터럴은 키 집합이 다르고(49/38/43/55/120), 하나로 합치면 실제로 전달되지 않는 키까지 있다고 주장하게 되어 **지금보다 나빠집니다.**

훅 하나씩, 다음을 반복합니다:

1. 훅이 실제로 구조분해하는 키에서 파라미터 인터페이스를 만듭니다 (예: `useDatabaseWorkspaceBulkCommands`는 28개를 읽습니다).
2. 훅 시그니처의 `context: DatabaseWorkspaceControllerContext`를 그 인터페이스로 교체합니다.
3. 타입체크 → 호출 지점의 인라인 리터럴이 검사됩니다.
4. 통과하면 다음 훅으로. **훅 하나가 곧 커밋 하나입니다.**

키 수가 가장 적은 `useDatabaseWorkspaceRecordCommands`(26개 읽기)부터 시작하고, `ViewCommands`(66개 읽기, 리터럴 120키)를 마지막에 둡니다.

다섯 개가 끝나면 `DatabaseWorkspaceControllerContext` 별칭은 참조가 없어집니다. 그때 삭제합니다.

**2-3. 마무리**

5개 파일의 `biome-ignore-all noExplicitAny` 헤더를 제거하고, 드러나는 46개 `any` 주석을 실제 타입으로 교체합니다. **2-1과 2-2가 모두 통과한 뒤에만** 합니다.

**하지 말 것** — 이 단계에서 컨트롤러를 분해하거나 키를 도메인별로 재배치하지 않습니다. 그건 별개의 큰 작업이고, 타입이 붙은 뒤에 훨씬 안전해집니다. 이 Phase의 성과물은 **타입뿐**이며 런타임 코드는 한 줄도 바뀌지 않아야 합니다.

### 완료 정의

```bash
cd packages/app && bun run typecheck
cd packages/app && bun run test && bun run test:dom
bunx biome check packages/app/src/components/
```

추가로: `database-workspace-context.ts`에 `Record<string, any>`가 남아있지 않을 것.

**결정: `useDatabaseWorkspaceMutationCommands.ts:313`의 `typeof refreshNow === 'function'` 런타임 가드는 유지합니다.** 타입이 붙어도 제거하지 마십시오. 비용이 0이고, 타입은 이 저장소 안에서 컴파일 타임에만 보호합니다. 이 값이 사라졌을 때의 실패 양상이 "서버는 성공했는데 UI가 실패라고 표시"였다는 점을 감안하면, 중복 방어를 남기는 편이 낫습니다.

### 위험

낮음 — 순수 타입 작업이고 런타임 코드가 바뀌지 않습니다. 유일한 실제 위험은 4번 단계에서 `any`를 실제 타입으로 바꾸다가 좁게 잡는 것입니다. 확신이 없으면 그 키는 남겨두고 보고합니다.

---

## Phase 3 — 서버 모놀리스에 첫 경계를 세운다 (**결정 완료 — 범위 한정**)

**결정: 서버 쪽을 한다. 단 `api-extension.ts`를 "리팩터링"하지 않는다.**

18,831줄을 쪼개겠다는 계획은 실패합니다. 대신 **응집된 블록 하나를 뽑아내고, 그 과정에서 서버용 크기 예산 가드를 설치**합니다. 성과물은 두 개입니다: 파일 하나가 작아지는 것, 그리고 **다시 부풀지 못하게 막는 장치**.

가드가 성과물인 이유는 Phase 1a가 증명합니다 — 앱에는 크기 가드가 있어서 위반이 즉시 빨간불로 드러났습니다. 서버에는 아무것도 없어서 18,831줄까지 왔습니다.

### 3-1. 첫 추출 대상: show-all / search 디렉터리 워커

`packages/server/src/api-extension.ts`의 **1321–1975행**. 라우트 파일 안에 사는 파일시스템 워커로, 관심사가 명백히 다릅니다. 연속 블록이고 이미 테스트 훅을 갖고 있어(= 이미 독립 단위로 취급되고 있음) 첫 추출로 가장 안전합니다.

| 행 | 심볼 |
| ---: | --- |
| 1329 | `DEFAULT_SHOWALL_MAX_ENTRIES` |
| 1330 | `getShowAllMaxEntries()` |
| 1349 | `DEFAULT_SEARCH_MAX_ENTRIES` |
| 1350 | `getSearchMaxEntries()` |
| 1371 | `__getShowAllWalkStatsForTesting()` |
| 1377 | `__resetShowAllWalkStatsForTesting()` |
| 1393 | `StreamShowAllOpts` |
| 1425 | `WalkShowAllOpts` |
| 1466 | `streamShowAllEntries()` (async generator) |
| 1918 | `walkContentDirForShowAll()` (버퍼드 어댑터) |

새 모듈: `packages/server/src/content-show-all-walk.ts` (약 650줄). `api-extension.ts`는 그것을 import합니다.

**절차** — RFC 0003이 성공한 방식을 따릅니다:

1. 블록을 그대로 새 파일로 옮깁니다. **로직을 고치지 않습니다.** import/export만 조정합니다.
2. `api-extension.ts`에서 재노출이 필요한지 확인합니다 (외부 소비자가 있으면 배럴 유지, 없으면 직접 import).
3. 타입체크 + 기존 테스트가 초록인지 확인합니다.
4. **그 다음에** 이 모듈에 대한 단위 테스트를 붙입니다. 이미 `__get/__resetShowAllWalkStatsForTesting`이 있으니 테스트 가능한 표면이 마련돼 있습니다.

**하지 말 것** — 옮기면서 동시에 개선하지 마십시오. 순수 이동 커밋 하나, 그 다음 필요하면 개선 커밋. 이동과 수정이 한 커밋에 섞이면 회귀 시 이분 탐색이 불가능합니다.

### 3-2. 서버 크기 예산 가드 설치

앱의 `packages/app/src/build/module-boundaries.ts` + `module-boundaries.test.ts`를 참고해 서버용 등가물을 만듭니다.

**중요 — 현실적인 예산을 잡으십시오.** 서버에는 이미 18,831줄짜리 파일이 있습니다. 모든 파일에 낮은 예산을 강제하면 즉시 빨간불이 되어 가드가 무시됩니다. 앱이 쓰는 방식(`LEGACY_MODULE_EXCEPTIONS` — 명시적 예외를 RFC 단계와 함께 기록)을 그대로 따릅니다:

- 새로 추출한 `content-show-all-walk.ts`에는 실제 크기에 근접한 예산 (예: 700).
- `api-extension.ts`는 **현재 크기를 상한으로 등록**합니다. 줄어들 수는 있어도 늘어날 수는 없게 됩니다. 이것만으로도 지금보다 낫습니다.
- 나머지 대형 파일도 같은 방식으로 현재 크기를 상한으로 박아둡니다.

이렇게 하면 가드가 **첫날부터 초록**이면서 모든 파일에 대해 단조 감소를 강제합니다.

### 참고 — 남은 서버 모놀리스 (이번 Phase 범위 밖, 기록용)

| 파일 | 줄 수 | 성격 |
| --- | ---: | --- |

| 파일 | 줄 수 | 성격 |
| --- | ---: | --- |
| `server/src/api-extension.ts` | **18,831** | 2위의 3배. 라우터 + 파일시스템 워커 + 업로드 서비스 + 텔레메트리. ~160개 라우트 핸들러, 50개 이상 API 표면 |
| `desktop/src/main/index.ts` | 5,852 | `registerIpcHandlers()` 하나가 1,430줄 |
| `server/src/database-plan.ts` | 5,779 | `DatabasePlanEngine`에 멤버 13개인데 `createPlan()` 하나가 ~1,250줄 |
| `server/src/database-data-plane-api.ts` | 5,559 | export 65개 (Zod 스키마) + 핸들러 팩토리 겸업 |
| `server/src/database-data-plane.ts` | 5,237 | 메서드 51개, 8개 이상 무관한 책임. `configure*` 주입 세터 5개 |
| `server/src/server-factory.ts` | 4,782 | `createServer()` 하나가 4,176줄. 전부 하나의 렉시컬 스코프 클로저라 **개별 테스트 불가** |

이들은 Phase 3의 첫 추출이 끝나고 가드가 설치된 뒤, 같은 절차를 반복할 다음 후보입니다. **이번 Phase에서는 손대지 않습니다.**

### 참고 — 다음 순번이 될 앱 쪽 부채 (역시 범위 밖)

RFC 0002의 앱 공통 절반은 계획만 있고 실행되지 않았습니다. 오히려 커진 것도 있습니다.

| 파일 | RFC 기준선 | 현재 |
| --- | ---: | ---: |
| `components/FileTree.tsx` | 4,756 | 4,549 |
| `components/CommandPalette.tsx` | 1,737 | **1,934 (+197)** |
| `editor/DocumentContext.tsx` | 1,963 | **1,973 (+10)** |
| `components/settings/SettingsDialogBody.tsx` | 1,621 | 1,538 |

계획된 디렉터리는 존재하나 껍데기입니다 (`components/file-tree/`에 3개 파일 234줄, 계획된 `FileTreeRender`/`FileTreeDragDrop`/`FileTreeContextMenu` 등은 없음). `FileTree.tsx`는 단일 컴포넌트가 ~3,280줄에 `useEffect` 26개이고, 그 안에 **6개의 원시 CSS 블록**(`FILE_TREE_UNSAFE_CSS`)과 손으로 만든 Lucide 스프라이트 시트가 들어 있습니다.

### 참고 — 이미 성공한 사례

RFC 0003(테이블 지오메트리)은 **진짜로 실행되었습니다.** 대상 파일이 전부 100~400줄이 되었고 `database-table*` 계열 ~40개 파일 중 700줄 초과가 없습니다. 방법은 "지오메트리 소유자가 없다"는 단일 근본 원인을 특정하고 순수 모듈(`lib/database-table-geometry.ts` 117줄)을 만든 뒤 나머지를 그 위에 세운 것입니다. Phase 3을 착수한다면 이 문서를 먼저 읽으십시오.

또한 RFC `0001-globals-css-modularization`은 상태가 아직 "Proposed"지만 **실제로는 완료되었습니다** (5,790줄 → 44줄). 헤더만 갱신하면 됩니다 — 사소하지만 문서 신뢰도 문제입니다.

---

## 이미 결정된 항목 (다시 묻지 말 것)

세 건 모두 2026-07-31에 결정되었습니다. 에이전트는 이대로 진행하고, **재론하지 않습니다.**

| # | 항목 | 결정 |
| --- | --- | --- |
| 1 | Phase 1b | `markdownTableMutation`을 v1 연산 목록에 **추가**한다. 스키마 버전은 1 유지 |
| 2 | Phase 3 | **서버** 쪽을 한다. 단 `api-extension.ts` 전면 리팩터링이 아니라, show-all 워커 1개 추출 + 크기 가드 설치로 범위를 한정 |
| 3 | Phase 2 | `useDatabaseWorkspaceMutationCommands.ts:313`의 런타임 가드는 **유지**한다 |

새로운 결정이 필요한 상황이 생기면 **멈추고 물어봅니다.** 특히 Phase 2에서 타입 에러가 나오는 경우(= 잠복 버그 발견), Phase 3에서 순수 이동이 불가능한 경우가 그렇습니다.

---

## 완료 체크리스트

각 항목은 **명령으로 확인 가능한 기준**을 갖습니다. 기준을 통과하지 못하면 그 항목은 완료가 아닙니다. 상위 Phase가 초록이 되기 전에 다음 Phase로 넘어가지 않습니다.

### Phase 1a — 모듈 경계 가드 복구

- [x] **1a-1** `database-property-commands.ts`의 카탈로그/시드 절반(1–276행, 표 참조)을 `lib/database-mutations/database-property-catalog.ts`로 이동
  - 기준: 새 파일이 존재하고, 이동한 심볼 10개가 전부 거기서 export된다. `git diff`에서 **로직 변경이 0줄**이다 (이동과 import 조정만).
- [x] **1a-2** `database-property-commands.ts`가 예산 이하로 내려감
  - 기준: `awk 'END{print NR+1}' packages/app/src/lib/database-mutations/database-property-commands.ts` 가 **400 이하** (가드는 `wc -l`+1로 셈)
- [x] **1a-3** 새 파일에 예산 등록
  - 기준: `MODULE_SIZE_BUDGETS`(`packages/app/src/build/module-boundaries.ts`)에 `database-property-catalog.ts` 항목이 있고, `DATABASE_LEAF_BOUNDARIES`(`module-boundaries.test.ts:16`)에도 경로가 있다
- [x] **1a-4** 새 파일이 leaf 제약을 위반하지 않음
  - 기준: `bun run test`가 `database leaves do not own transport, snapshot, or route writes`와 `database command modules do not regress to the compatibility barrel` 둘 다 통과
- [x] **1a-5** 앱 스위트 초록
  - 기준: `cd packages/app && bun run test` → **fail 0** (현재 5870 pass / 1 fail → 5871 pass / 0 fail)
  - 기준: `cd packages/app && bun run test:dom` → 10 pass / 0 fail
  - 기준: `cd packages/app && bun run typecheck` 종료코드 0
  - 기준: `bunx biome check packages/app/src/lib/database-mutations/` 경고 외 오류 0

### Phase 1b — 서버 계약 3건

- [x] **1b-1** `markdownTableMutation`을 계약 테스트 기대 목록에 추가
  - 기준: `database-api-schema.test.ts:54`의 배열에 `'markdownTableMutation'`이 있고, 위치가 레지스트리 실제 키 순서와 같다 (`commit`과 `agentRuns` 사이). `toEqual`은 순서를 봄
  - 기준: `DATABASE_API_SCHEMA_VERSION`은 **1에서 바뀌지 않았다**
- [x] **1b-2** `preview_migration` 봉투 실패 해소
  - 기준: 스키마 정의를 읽고 **변경이 의도된 것인지 판단한 근거를 커밋 메시지에 남겼다**. 의도된 변경이면 테스트를 갱신, 실수면 스키마를 고치고 보고
- [x] **1b-3** `database-task-service.test.ts:158` 실패 해소
  - 기준: 1b-2와 동일한 판단 절차를 거쳤다
- [x] **1b-4** 서버 데이터베이스 스위트 초록
  - 기준: `bun test packages/server/src/database-*.test.ts` → **456 pass / 0 fail**

### Phase 2 — 워크스페이스 컨텍스트 타입화

- [x] **2-1** `RenderContext`를 생산자에서 유도
  - 기준: `database-workspace-context.ts`의 `DatabaseWorkspaceRenderContext`가 더 이상 `Record<string, any>`가 아니고, 223개 키를 손으로 적지 않았다 (`typeof`/`ReturnType` 사용)
  - 기준: `cd packages/app && bun run typecheck` 종료코드 0
- [x] **2-2** 명령 훅 5개에 각각 파라미터 인터페이스 부여 (커밋 5개)
  - 기준: `useDatabaseWorkspaceRecordCommands` → `MutationCommands` → `BulkCommands` → `SchemaCommands` → `ViewCommands` 순으로, **각 훅마다 별도 커밋**이고 각 커밋 시점에 `bun run typecheck`가 통과
  - 기준: 다섯 인터페이스를 하나로 합치지 않았다 (키 집합이 49/38/43/55/120으로 다름)
- [x] **2-3** 별칭 제거
  - 기준: `grep -rn "Record<string, any>" packages/app/src packages/server/src packages/core/src` 결과가 **0건** (테스트 파일 제외)
  - 기준: `DatabaseWorkspaceControllerContext` 별칭이 삭제되었거나, 남았다면 참조가 0건임을 확인
- [x] **2-4** `any` 억제 헤더 제거
  - 기준: 5개 파일(`DatabaseWorkspaceRecordActions/Toolbar/StatusPanel/ViewRenderer/ReadState`)에 `biome-ignore-all lint/suspicious/noExplicitAny`가 남아있지 않다
  - 기준: `bunx biome check packages/app/src/components/` 통과
- [x] **2-5** 런타임 코드 무변경 확인
  - 기준: `git diff` 전체에서 **런타임 동작을 바꾸는 변경이 0줄**이다. 타입 주석·인터페이스·import만 바뀐다
  - 기준: `useDatabaseWorkspaceMutationCommands.ts`의 `typeof refreshNow === 'function'` 가드가 **그대로 남아 있다**
- [x] **2-6** 앱 스위트 초록
  - 기준: `cd packages/app && bun run test && bun run test:dom` 둘 다 fail 0
- [x] **2-7** 발견된 잠복 버그 보고
  - 기준: 타입 부착 중 나온 타입 에러가 있었다면, **고치지 않고** 파일·심볼·예상 실패 양상을 정리해 보고했다. 없었다면 "없음"을 명시

Phase 2 검증 기록: `DatabaseWorkspaceRenderContext`는 컨트롤러 반환형에서 유도하며,
명령 훅 5개는 Record → Mutation → Bulk → Schema → View 순서의 독립 커밋으로
타입화했다. 비테스트 소스의 `Record<string, any>`와 임시 컨트롤러 별칭은 0건이고,
컴포넌트 Biome 검사, 앱 typecheck, 비 DOM 5,872개 및 DOM 2,363개 테스트가 모두
실패 0건으로 통과했다. 타입 부착 과정에서 (1) canvas presentation 좁힘,
(2) 성공 컨텍스트의 description/source/result 좁힘, (3) React `Map` 상태 setter를
`ReadonlyMap`으로 넓히던 콜백 주석이라는 잠복 타입 계약 3건을 발견했다. 원 계획은
보고만 요구했지만 사용자 승인에 따라 각각 동일 조건식의 직접 좁힘, 동일 런타임
조건을 담은 타입 가드, 불필요한 명시 주석 제거로 해결했다. 따라서 런타임 동작은
바뀌지 않았고 `typeof refreshNow === 'function'` 가드도 유지된다.

### Phase 3 — 서버 첫 경계 + 크기 가드

- [x] **3-1** show-all 워커를 순수 이동
  - 기준: `packages/server/src/content-show-all-walk.ts`가 존재하고 표의 심볼 10개를 export한다
  - 기준: **이동 커밋에 로직 변경이 없다.** 리뷰어가 `git show --stat`과 diff로 "옮기기만 했다"를 확인할 수 있어야 한다
- [x] **3-2** `api-extension.ts` 축소 확인
  - 기준: `wc -l packages/server/src/api-extension.ts`가 이전보다 **최소 600줄 줄었다** (18,831 → 약 18,200 이하)
- [x] **3-3** 관련 스위트 초록
  - 기준: `bun test packages/server/src/database-*.test.ts` fail 0 (Phase 1b가 끝났다는 전제)
  - 기준: show-all/search 워커를 덮는 테스트 파일을 찾아 실행하고 통과 — 최소한 `bun test packages/server/src/api-extension*.test.ts`
  - 기준: `bun run --filter @nedian0brien/synapsenote-server typecheck` 종료코드 0
  - **서버 전체 스위트(`bun test packages/server/src`)는 10분 이상 걸립니다.** 돌린다면 Phase 종료 시 한 번만 돌리고, **fail 0을 요구하지 말고 착수 전 기준선과 비교**하십시오 (무관한 선재 실패가 있을 수 있음). 기준선을 모른 채 실패를 보면 자기 변경 탓으로 오진합니다
- [x] **3-4** 추출한 모듈에 단위 테스트 추가
  - 기준: `content-show-all-walk.test.ts`가 존재하고, `__getShowAllWalkStatsForTesting`을 사용해 **워크 횟수를 실제로 검증**한다
  - 기준: 그 테스트가 변경 없이는 실패함을 확인했다 (일부러 깨뜨려 확인 — 이 저장소에서 "실패할 수 없는 테스트"를 만든 전례가 있음)
- [x] **3-5** 서버 크기 예산 가드 설치
  - 기준: 앱의 `module-boundaries.ts`/`.test.ts`에 대응하는 서버용 모듈과 테스트가 존재한다
  - 기준: 가드가 **첫 실행부터 초록**이다. 대형 파일은 현재 크기를 상한으로 등록해 단조 감소만 강제한다
  - 기준: `api-extension.ts`가 상한과 함께 등록되어 있어, 한 줄이라도 늘리면 빨간불이 된다
- [x] **3-6** 가드가 실제로 작동함을 확인
  - 기준: `api-extension.ts`에 임시로 빈 줄 몇 개를 넣었을 때 가드가 **실패**하는 것을 확인하고 되돌렸다

Phase 3 검증 기록: `content-show-all-walk.ts`로 표의 10개 심볼과 필요한 내부
자산 확장자 helper를 순수 이동하고, 기존 API facade에는 10개 호환성 re-export를
유지했다. `api-extension.ts`는 18,831줄에서 18,228줄로 603줄 줄었으며 split-line
가드 상한은 정확히 18,229다. 새 워커 테스트는 실제 문서 2개를 순회한 뒤
`{ invocations: 1, aborts: 0 }`을 검증한다. 기대 호출 수를 2로 바꿨을 때 실패하는
것을 확인하고 되돌렸고, `api-extension.ts`에 빈 줄을 추가했을 때도 예산 가드가
실패하는 것을 확인하고 되돌렸다. 워커/가드 41개, API extension 111개,
데이터베이스 456개 테스트와 서버 manifest/typecheck가 모두 통과했다. 최종 Sol
통합 리뷰도 차단 결함 없이 승인했다.

### 전체 종료 기준

빠른 것부터 나열했습니다. 위 4개는 매 커밋마다 돌려도 부담이 없습니다.

- [x] `bun test packages/core/src` → 2630 pass / 0 fail *(~10초)*
- [x] `cd packages/app && bun run test` → fail 0 *(~20초)*
- [x] `cd packages/app && bun run test:dom` → fail 0 *(~1초)*
- [x] `bun test packages/server/src/database-*.test.ts` → fail 0 *(~70초)*
- [x] 각 패키지 `typecheck` 종료코드 0
- [x] `bunx biome check` 오류 0
- [x] 이 문서의 결정 3건이 코드에 그대로 반영되어 있다 (버전 1 유지, 런타임 가드 유지, 서버 가드 설치)

전체 종료 검증 기록: core 2,630개, 앱 비 DOM 5,872개, 앱 DOM 2,363개,
서버 데이터베이스 456개가 모두 실패 0건으로 통과했고 Turbo의 8개 패키지
typecheck가 성공했다. 변경 파일 34개에 대한 `bunx biome check`는 오류 0건
(경고 9건)이다. 인자 없는 저장소 전체 명령은 이번 변경 밖의 의도적 Biome plugin
실패 fixture와 기존 미포맷 성능 baseline까지 검사해 선재 오류를 보고하므로,
이 항목은 변경 집합 검사를 완료 기준으로 적용했다. 스키마 버전 1,
`typeof refreshNow === 'function'`, 서버 크기 가드도 최종 코드에서 다시 확인했다.

**서버 전체 스위트는 이 목록에 없습니다.** 10분 이상 걸리고, 이 계획의 변경은 데이터베이스 관련 모듈과 `api-extension.ts`에 한정되므로 위 범위로 충분합니다. 굳이 돌린다면 **작업 시작 전에 한 번 돌려 기준선을 기록**해 두십시오 — 그래야 끝나고 나온 실패가 자기 것인지 원래 것인지 구분됩니다.

## 범위 밖 (이번에 하지 않기로 한 것)

- **성능 최적화 일체.** RFC 0010에서 종료했습니다. 쓰기 비용은 40행에서 300행까지 평평합니다. 다시 열려면 그 문서의 "배제된 가설" 표를 먼저 읽으십시오 — 여섯 개가 이미 측정으로 죽었습니다.
- **`core/markdown/*`의 캐스트 정리** (~45곳). 대부분 upstream mdast 유니온에 대한 기계적 widening이라 위험도가 낮고 이득이 적습니다.
- **`core/src/index.ts` 배럴** (2,092줄, `export ... from` 168개). 크지만 로직이 아닌 공개 표면 선언이라 분할 이득이 불명확합니다.
- **`desktop/src/main/index.ts`의 `as unknown as BrowserWindowLike` 39곳.** 저장소 최다이지만 실제 Electron 객체의 구조적 좁힘이라 사이트당 위험은 낮습니다.

## 참고 — 저장소가 이미 잘 하고 있는 것

재감사에 시간을 쓰지 않도록 기록합니다.

- 린트가 깨끗합니다. server + core + app 전체 경고 14개.
- 진짜 `as any`가 비테스트 소스 ~3,300개 파일에 14개뿐이고, 프로덕션 `@ts-expect-error`/`@ts-ignore`는 0개, `any[]`도 0개입니다.
- `createContext` 12곳 전부 제대로 타입되어 있습니다 (예외는 vendored shadcn `ui/form.tsx:27,69`).
- 데스크톱 IPC는 `shared/ipc-send.ts`의 `EventChannels` 맵과 커스텀 린트 플러그인(`no-loosely-typed-webcontents-ipc`)으로 실제로 타입 안전합니다.
- `core` 테스트 2,630개가 전부 통과합니다.

즉 이 저장소의 타입 부채는 분포가 아니라 **압도적 1위 하나(Phase 2)와 긴 꼬리**입니다.
