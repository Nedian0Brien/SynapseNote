# RFC 0011 post-v2 refactoring plan

- 기준일: 2026-07-31
- 브랜치: `codex/fix-row-latency-cv-fidelity`
- 선행 문서: RFC 0010 (최적화 종료 보고), RFC 0002 (대형 모듈 경계 — 절반만 실행됨)
- 대상: 이 문서를 받아 작업할 에이전트
- 판정: **Phase 1은 무조건 먼저.** Phase 2는 근거가 확실함. Phase 3은 선택이며 사람의 판단이 필요함

이 문서는 자립적으로 작성되었습니다. 작성 당시 대화 맥락 없이도 실행 가능해야 합니다.

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

### 1b. 서버 API 계약 3건 (**사람의 결정 필요 — 임의로 고치지 말 것**)

**현상** — `bun test packages/server/src/database-*.test.ts`에서 3건 실패:

1. `database-api-schema.test.ts` — `versioned database API schemas > publishes one immutable v1 registry for every required operation family`
2. `database-api-schema.test.ts` — `... > defines content-free task list, get, cancel, progress, result, and problem envelopes`
3. `database-task-service.test.ts:158` — `creates a blank v2 owner table through the reviewed plan without a generated record folder`

**원인** — 이 브랜치가 만든 것입니다. `edbd7ace`(2026-07-27, "harden markdown table v2 migration and routing")가 `DATABASE_API_SCHEMAS.operations`(`packages/server/src/database-data-plane-api.ts:3122`)에 `markdownTableMutation`을 추가했는데, 그 레지스트리를 고정하는 계약 테스트를 갱신하지 않았습니다. 2번은 `DatabaseTaskResponseSchema`의 `preview_migration` 형태가 v2 작업 중 바뀐 것으로 보입니다.

**왜 임의로 고치면 안 되는가** — 1번 테스트는 낡은 assertion이 아니라 **의도적으로 동결된 공개 API 계약**입니다. `DATABASE_API_SCHEMA_VERSION`은 1이고, 테스트는 `Object.isFrozen`과 정확한 연산 목록을 함께 검사합니다. 즉 테스트는 제 역할을 하고 있고, 답해야 할 질문은 이것입니다:

> v2 markdown-table mutation이 **v1 공개 계약에 속하는가?** 속한다면 목록에 추가하고 문서화한다. 속하지 않는다면 레지스트리에서 빼거나 스키마 버전을 올린다.

이건 제품·호환성 판단입니다. 에이전트는 **결정하지 말고**, 세 실패의 정확한 diff를 정리해 사람에게 올립니다. 결정을 받은 뒤에 반영합니다.

**완료 정의** — 결정을 받은 경우: `bun test packages/server/src/database-*.test.ts`가 456 pass / 0 fail. 결정을 못 받은 경우: 3건의 diff와 선택지를 정리한 노트를 남기고 Phase 2로 진행합니다 (이 3건은 Phase 2 작업 영역과 겹치지 않습니다).

---

## Phase 2 — `DatabaseWorkspaceControllerContext` 타입화

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

추가로: `database-workspace-context.ts`에 `Record<string, any>`가 남아있지 않을 것. `useDatabaseWorkspaceMutationCommands.ts:313`의 `typeof refreshNow === 'function'` 런타임 가드는 **일단 그대로 둡니다** (타입이 붙었다고 즉시 제거하면 회귀 시 조용해집니다). 제거 여부는 별도 판단.

### 위험

낮음 — 순수 타입 작업이고 런타임 코드가 바뀌지 않습니다. 유일한 실제 위험은 4번 단계에서 `any`를 실제 타입으로 바꾸다가 좁게 잡는 것입니다. 확신이 없으면 그 키는 남겨두고 보고합니다.

---

## Phase 3 — 선택 (착수 전 사람의 판단 필요)

Phase 1, 2와 달리 여기는 **무엇을 할지 정해져 있지 않습니다.** 두 후보의 근거를 제시하되, 착수는 지시를 받고 합니다.

### 후보 A — 서버 모놀리스 (계획이 아예 없는 영역)

`docs/rfcs/`의 모든 모듈화 계획(0001, 0002, 0003, 0004, globals-css)은 **`packages/app`만** 겨냥합니다. 서버 쪽은 3~4배 크면서 계획이 없습니다.

| 파일 | 줄 수 | 성격 |
| --- | ---: | --- |
| `server/src/api-extension.ts` | **18,831** | 2위의 3배. 라우터 + 파일시스템 워커 + 업로드 서비스 + 텔레메트리. ~160개 라우트 핸들러, 50개 이상 API 표면 |
| `desktop/src/main/index.ts` | 5,852 | `registerIpcHandlers()` 하나가 1,430줄 |
| `server/src/database-plan.ts` | 5,779 | `DatabasePlanEngine`에 멤버 13개인데 `createPlan()` 하나가 ~1,250줄 |
| `server/src/database-data-plane-api.ts` | 5,559 | export 65개 (Zod 스키마) + 핸들러 팩토리 겸업 |
| `server/src/database-data-plane.ts` | 5,237 | 메서드 51개, 8개 이상 무관한 책임. `configure*` 주입 세터 5개 |
| `server/src/server-factory.ts` | 4,782 | `createServer()` 하나가 4,176줄. 전부 하나의 렉시컬 스코프 클로저라 **개별 테스트 불가** |

`api-extension.ts`가 압도적이지만 그만큼 위험합니다. 착수한다면 라우트 그룹 단위로 잘라내되, 반드시 **RFC 0003이 성공한 방식**(경계를 먼저 정의하고, 순수 모듈을 뽑고, 테스트를 붙이고, 크기 예산을 등록)을 따르고, RFC 0002가 실패한 방식(파사드 + Runtime 덩어리 이동)을 피합니다.

### 후보 B — RFC 0002 미완 절반

앱 공통 파일들은 계획만 있고 실행되지 않았습니다. 오히려 커진 것도 있습니다.

| 파일 | RFC 기준선 | 현재 |
| --- | ---: | ---: |
| `components/FileTree.tsx` | 4,756 | 4,549 |
| `components/CommandPalette.tsx` | 1,737 | **1,934 (+197)** |
| `editor/DocumentContext.tsx` | 1,963 | **1,973 (+10)** |
| `components/settings/SettingsDialogBody.tsx` | 1,621 | 1,538 |

계획된 디렉터리는 존재하나 껍데기입니다 (`components/file-tree/`에 3개 파일 234줄, 계획된 `FileTreeRender`/`FileTreeDragDrop`/`FileTreeContextMenu` 등은 없음).

`FileTree.tsx`는 단일 컴포넌트가 ~3,280줄에 `useEffect` 26개이고, 그 안에 **6개의 원시 CSS 블록**(`FILE_TREE_UNSAFE_CSS`)과 손으로 만든 Lucide 스프라이트 시트가 들어 있습니다.

### 참고 — 이미 성공한 사례

RFC 0003(테이블 지오메트리)은 **진짜로 실행되었습니다.** 대상 파일이 전부 100~400줄이 되었고 `database-table*` 계열 ~40개 파일 중 700줄 초과가 없습니다. 방법은 "지오메트리 소유자가 없다"는 단일 근본 원인을 특정하고 순수 모듈(`lib/database-table-geometry.ts` 117줄)을 만든 뒤 나머지를 그 위에 세운 것입니다. Phase 3을 착수한다면 이 문서를 먼저 읽으십시오.

또한 RFC `0001-globals-css-modularization`은 상태가 아직 "Proposed"지만 **실제로는 완료되었습니다** (5,790줄 → 44줄). 헤더만 갱신하면 됩니다 — 사소하지만 문서 신뢰도 문제입니다.

---

## 결정이 필요한 항목 (요약)

에이전트가 임의로 정하면 안 되는 것들입니다.

| # | 항목 | 질문 |
| --- | --- | --- |
| 1 | Phase 1b | v2 markdown-table mutation이 동결된 v1 공개 API 계약에 속하는가? 아니면 스키마 버전을 올리는가? |
| 2 | Phase 3 | 후보 A(서버 모놀리스)와 B(앱 0002 잔여) 중 무엇을, 혹은 둘 다 하지 않을 것인가? |
| 3 | Phase 2 (4단계) | 타입 부착 후 `useDatabaseWorkspaceMutationCommands.ts:313`의 런타임 가드를 제거할 것인가? |

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
