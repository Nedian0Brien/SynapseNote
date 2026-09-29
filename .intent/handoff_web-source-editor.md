# 인계: 웹 편집기가 원문을 직접 편집한다 (web-source-editor)

작성 2026-09-29. 다음 세션의 에이전트가 이 문서만 읽고 작업을 이어받을 수 있게 쓴다.

웹 앱에 Markdown 원문(`Y.Text('source')`)을 CodeMirror 6로 직접 편집하면서 기호를 숨기는 `live` 편집 모드가
생겼다. 편집 규칙은 core의 순수 함수이고, 네이티브 앱도 같은 명세와 fixture를 쓴다. P0~P2(뼈대), P2c(기존
편집기 동작 옮기기), P3a(코드 울타리·표 위젯), P3b(수식·Mermaid 위젯), P3c(frontmatter 속성 화면)가 끝났다.
P3의 나머지 블록은 진행 전이다.

## 1. 사용자가 정한 것

바꾸기 전에 사용자에게 묻는다. 모두 이 세션에서 사용자가 직접 답한 내용이다.

- **제품 방향:** 혼자 쓰는 앱. 원격 에이전트가 필요하다. upstream과 독립한다. Craft를 기준으로 삼는다. macOS·iPadOS·iOS
  네이티브 앱이 먼저이고 웹은 나중이다. 네이티브 편집기는 TextKit 2 연속 텍스트다.
- **구조:** 편집 가능한 CRDT를 `Y.Text` 하나로 줄인다. 지금은 `Y.Text`와 `Y.XmlFragment`(Tiptap)를 서버가 원문
  비교로 잇는다. 이 구조가 동시 편집 중복의 근본 원인이다(y-tiptap `updateYText`가 문단 전체에 서식 속성을 다시
  적용해 동시 편집에서 서식이 엉뚱한 글자로 간다). 사용자가 CodeMirror 방식(2번)을 골랐다.
- **진행 방식:** 새 편집기를 기존 편집기와 나란히 두고, 다 되면 교체한다(P6). 편집 규칙 명세는 네이티브와 공유한다.
- **성능 목표:** 5,000줄 문서에서 키 입력→화면 반영 p95 16ms.
- **원문 노출:** 원문은 가급적 보이지 않는다. 커서가 있는 줄과 표에서도 기호를 숨긴다. 표는 칸 단위로 편집한다.
  원문은 명시적인 원문 보기(source 모드)에서만 보인다.
- **P0 결정:** 링크 끝에서 친 글자는 링크 밖으로 간다(기존 편집기와 다르다). soft break는 줄바꿈으로 보인다.
- **블록 기호:** `-` `#` `1.` `>`는 스페이스를 치는 순간 블록이 된다. 코드 블록·수식 블록은 Enter를 치는 순간이다.
  그 전에는 친 기호를 이스케이프해(`\-`) 글자 그대로 보인다.
- **기존 편집기와 일부러 다르게 둔 네 가지:**
  - ```` ``` ````는 언어를 적고 Enter를 칠 때 코드 블록이 된다. 기존 편집기는 세 번째 백틱에서 바로 JavaScript 블록이
    되어 언어를 칠 수 없었다.
  - 제목 첫머리 Backspace는 제목을 문단으로 바꾼다. 기존 편집기는 앞 문단에 글을 붙였다.
  - 체크된 작업 항목에서 Enter를 치면 체크 안 된 새 항목이 생긴다.
  - `[ ] `를 치면 작업 항목이 된다.
- **이식 범위:** "편집기 로직 제대로 완전히 옮겨." 기존 편집기의 편집 동작은 빠짐없이 옮기는 것이 기본이다.

## 2. 작업 위치와 상태

- **브랜치·워크트리:** `codex/web-source-editor`, `.worktree/web-source-editor`
  - P3c 구현 커밋은 이후 `git log -1`로 확인한다. PR은 아직 없다.
  - main에는 사용자가 끝났다고 명시적으로 확인한 뒤에만 병합한다.
- **아티팩트:** `.intent/intent_web-source-editor.md`(수락됨), `spec_web-source-editor.md`(R1~R10, 단계 P0~P6),
  `plan_web-source-editor-p0.md` `-p1.md` `-p2.md` `-p2c.md`. 계획 파일 끝에 단계별 결과가 있다.
- **변경 기록:** `.changeset/live-editor-mode.md`가 이미 있다. P3 이후 사용자에게 보이는 동작이 크게 바뀌면 문구를 고친다.
- **확인 대기:** 사용자는 P2c 결과(블록 기호 전환, Backspace 되돌리기, Tab, 단축키)를 아직 확인하지 않았다. 새 세션은
  사용자의 확인 결과나 다음 지시부터 받는다.

### P3a 추가 (2026-09-29)

- `.intent/plan_web-source-editor-p3a.md`에 범위와 검증 결과를 적었다.
- `packages/core/src/editing-model/block-widget.ts`가 코드 언어·본문과 표 칸의 원문 범위를 계산하고 해당 범위만 고친다.
  `fixtures/widget.json`으로 원문 충실도 사례를 공유한다.
- `packages/app/src/editor/live/block-widgets.ts`가 코드·표를 CodeMirror 블록 위젯으로 그린다. 표 칸은 같은 `live`
  확장을 쓰는 작은 CodeMirror 편집기다. 원격 변경이 와도 활성 칸의 DOM을 유지한다.
- 코드 울타리와 표 정렬선은 화면에서 숨고, 칸의 Markdown 서식도 숨긴다. `|` 입력은 `\|`로 저장한다.
- P3a 브라우저 확인 문서: `http://localhost:5183/#/p3a-widget-review-1790688703232` (기존 임시 콘텐츠 폴더가
  살아 있는 동안만 접근 가능). 코드 본문과 표 칸 편집 후 새로고침해 저장을 확인했다.
- 뒤에 남은 P3: 들여쓴 코드, 수식, Mermaid, 콜아웃·아코디언, 이미지·파일 임베드, MDX, 인라인 데이터베이스,
  frontmatter. P2c 사용자 확인도 아직 별도로 받지 않았다.

### P3b 추가 (2026-09-29)

- `.intent/plan_web-source-editor-p3b.md`에 범위와 검증 결과를 적었다. `diagramWidgetSource`가 `DollarMath`,
  `MathFence`, `MermaidFence`의 본문 범위를 core 파서로 찾고 `diagram-body`가 그 범위만 바꾼다.
- `packages/app/src/editor/live/diagram-widgets.ts`가 기존 KaTeX·Mermaid 렌더러를 위젯 미리보기에 쓴다. 입력은
  별도 본문 칸에서 원문으로 보낸다. 블록 장식의 세로 margin을 제거해 CodeMirror의 높이 계산을 따른다.
- 브라우저 확인 문서: `http://localhost:5183/#/p3b-widget-review-1790690021249` (임시 콘텐츠 폴더가 살아 있는 동안).
  수식·Mermaid 표시와 본문 수정 후 새로고침 저장을 확인했다.
- 뒤에 남은 P3: 콜아웃·아코디언, 이미지·파일 임베드, MDX, 인라인 데이터베이스, frontmatter, 들여쓴 코드.

### P3c 추가 (2026-09-29)

- `.intent/plan_web-source-editor-p3c.md`에 범위와 검증 결과를 적었다.
- `live` 모드가 기존 문서 헤더·속성 패널을 보여 주고 편집기에서는 YAML 원문을 숨긴다. 일반 문서 속성 값 변경은
  기존 바인딩으로 Y.Text에 반영된다. 사용자 입력으로 숨겨진 YAML을 삭제하는 트랜잭션은 막는다.
- 브라우저 확인 문서: `http://localhost:5183/#/p3c-properties-review-1790690376095` (임시 콘텐츠 폴더가 살아 있는 동안).
  `status` 변경 후 원문과 새로고침 상태를 확인했다. `source`는 YAML 원문, `wysiwyg`·`live`는 속성 패널을 보여 준다.
- 실제 데이터베이스 레코드 `untitled_database_creation_f7d8cf21243447af95e2cbc0437bd7f9/rec_89fa230961f9421b93781c6987ee9dc4`
  에서도 `live` 속성 화면이 열렸다. `_sn` 원문이 화면에 보이지 않고 사용자 삭제 트랜잭션은 차단됐다.
- 뒤에 남은 P3: 콜아웃·아코디언, 이미지·파일 임베드, MDX, 인라인 데이터베이스, 들여쓴 코드.

## 3. 끝난 단계

| 단계 | 커밋 | 내용 |
|---|---|---|
| P0 | `86b2d405` | 편집 모델 명세 `packages/core/src/editing-model/SPEC.md`, fixture 형식과 `hide.json`·`edit.json` |
| P1 | `d4e971f3` | core 편집 모델: `layout.ts`(숨김·위젯·서식 범위), `edit.ts`(입력·삭제·Enter·붙여넣기·서식) |
| P2a | `225802bb` | `IncrementalLayout`(편집된 블록만 다시 파싱), `applyActionsInWindow`(커서 주변 블록만 편집) |
| P2b | `20b63281` | 앱 `live` 모드: `packages/app/src/editor/live/live-extension.ts`, `styles/editor/live-mode.css`, 모드 전환 |
| — | `68040e03` | 줄 첫머리 블록 기호는 스페이스·Enter에서 블록이 된다 |
| P2c | `ce0ef92f` | 기존 편집기 동작 이식(아래), 번호 목록 표시 번호, 블록 안 원문 편집, 레이아웃 캐시 |
| P3a | `0791f80f` | 코드 울타리·표의 편집 가능한 블록 위젯과 범위별 원문 변경 |
| P3b | `124a9b53` | 수식·Mermaid의 편집 가능한 미리보기와 범위별 원문 변경 |
| P3c | 구현 커밋은 `git log -1` | `live` 문서 속성 패널과 숨긴 YAML 보호 |

P2c에서 옮긴 동작은 다음과 같다. 각 동작의 근거 파일은 `plan_web-source-editor-p2c.md`에 있다.

- **목록 전환:** 목록 항목 첫머리에서 `1. ` `- ` `[ ] `를 치면 목록 종류가 바뀐다.
- **입력 규칙 되돌리기:** 규칙이 적용된 바로 다음 Backspace는 친 글자를 되살린다.
- **수평선·코드 블록:** `---`, `***␣`, `___␣`는 수평선이 되고, `~~~lang␣`은 코드 블록이 된다.
- **Enter:** 인용을 이어 쓰거나 빠져나가고, 제목을 나누고, 중첩된 빈 항목을 내어 쓰고, 코드 안에서는 줄바꿈을 넣는다.
  Shift-Enter는 코드 블록을 빠져나간다.
- **Tab·Shift-Tab:** 목록 항목을 들이고 내어 쓴다. 번호 목록에서도 중첩되고, 최상위 항목의 Shift-Tab은 문단을 만든다.
- **삭제:** 중첩 항목 Backspace는 목록 밖 문단을 만든다. Delete는 다음 블록을 합친다.
- **단축키:** Cmd+Alt+0~6, Cmd+Shift+7/8/9, Cmd+Shift+B, Cmd+Alt+C, Cmd+Shift+S, Cmd+Shift+↑/↓.
- **붙여넣기:** 기존 편집기와 같은 기준으로 형식을 고른다(`clipboard/is-markdown.ts`, `shift-tracker.ts`를 다시 쓴다).

## 4. 남은 일 (순서대로)

1. **사용자 확인 반영.** 사용자가 P2c에서 빠진 동작을 찾으면 기존 편집기 코드에서 근거를 확인하고 옮긴다. 확인 대상은
   `packages/core/src/extensions/list.ts`, `packages/app/src/editor/extensions/*`, `node_modules/@tiptap/*`다.
   명세(SPEC.md)와 fixture를 먼저 고치고 구현한다.
2. **아직 옮기지 않은 기존 편집기 기능.** 사용자에게 P4로 미룬다고 말해 두었다.
   - 화면 기능: 슬래시 메뉴(`/`), `[[` 위키 링크 선택기, `#` 태그 선택기, Cmd+K 링크 편집 창.
   - 옮기지 않는 기능: 일반 문단 Tab 들여쓰기(탭으로 시작하는 Markdown 줄은 코드 블록이 된다), Cmd+U 밑줄(Markdown
     구문이 없다).
   - 엔진은 `ui: 'slash-menu' | 'wiki-link-suggest'`를 이미 돌려주지만, 앱은 아직 이 값을 쓰지 않는다.
3. **R9 16ms 미달.**
   - P2b 브라우저 측정: 방해 없는 첫 키 입력→화면 반영 약 35ms. 이벤트 처리는 live가 keypress 19ms + input 10ms,
     source가 5ms + 4ms다.
   - live가 더하는 약 20ms 중 우리 코드 몫은 엔진 3.5ms, 레이아웃 2.8ms, 장식 0.2ms, dispatch 6ms다. 나머지 약
     10ms(장식 반영이나 React `input` 처리로 보임)는 아직 나누지 못했다.
   - P2c 뒤 core 창 편집은 p95 5.0ms로 줄었지만 브라우저에서는 다시 재지 않았다.
   - 다음 할 일: `use-document-stats` 문제(5절)를 비켜서 브라우저에서 다시 재고, 장식 반영과 React 처리를 나눠 잰다.
4. **P3 블록 위젯.** 대상: 코드 블록, 표(칸 단위), 수식, Mermaid, 콜아웃·아코디언, 이미지·파일 임베드, MDX 컴포넌트,
   인라인 데이터베이스, frontmatter.
   - 코드 울타리·표·수식·Mermaid는 P3a·P3b에서 위젯으로 옮겼다. frontmatter는 P3c에서 속성 패널로 연결했다.
     들여쓴 코드와 나머지 블록은 아직 원문 그대로 보인다.
   - 남은 위젯을 그리면 `editBlockSource`의 원문 편집 경로를 해당 위젯 편집으로 바꾼다. 속성 변경은 해당 원문 범위만 바꾼다.
5. **P4 기능 이전.**
   - 슬래시 메뉴, 도구 막대, 찾기.
   - 메모: 원문 앵커로 바꾸고, 기존 `wysiwyg` 앵커를 변환한다.
   - 에이전트 쓰기 표시, 협업 커서, 아웃라인 이동.
   - PDF 내보내기: 파싱 → HTML 경로로 바꾼다.
   - 블록 속성 편집: `setNodeMarkup` 대신 원문을 바꾼다.
   - 임베드 `src` 해석.
6. **P5 검증.**
   - 동시 편집: 세 작성자 시뮬레이터(`codex/concurrent-edit-duplication`의 `concurrent-writers.test-helper.ts`)의 웹
     작성자를 새 편집기 명령으로 바꿔 1,000 seed를 돌린다. 실제 서버 soak(38·1,000·5,000줄, 10분)를 돌린다.
   - IME: 조합 중 원격 편집이 와도 조합이 유지되는지 DOM 테스트로 확인한다. P2에서 계획했다가 여기로 미뤘다.
   - 충실도: 편집마다 바뀐 원문 바이트가 명세대로인지 확인한다.
7. **P6 교체와 제거.** 기본 편집기를 `live`로 바꾸고 Tiptap 편집기, 공유 트리, 서버 동기화 계층을 지운다. 지울 파일
   목록은 spec의 "현재 상태"에 있다. 그 뒤 `large-doc-concurrent-load`를 다시 잰다.

## 5. 이 브랜치 밖의 기존 문제

main에도 있는 문제다. 작업 칩 두 개를 사용자에게 제안해 두었다.

- **큰 문서 동기화 끊김.**
  - 모든 모드에서 숨겨진 Tiptap(`.ok-mode-hidden`)이 fragment에 묶여 있다.
  - 5,000줄 문서를 열 때마다 y-tiptap이 ContentFormat 4,704개(약 1.1MB)를 쓴다. 서버가 1MB 메시지 제한
    (`packages/app/src/server/hocuspocus-plugin.ts`의 `MAX_COLLAB_MESSAGE_BYTES`)으로 끊는다. 클라이언트는 1초마다
    재연결하고 편집은 서버에 가지 않는다.
  - 1MB 제한은 올바른 방어다. 고칠 곳은 쓰는 쪽이다. P6에서 사라진다.
- **글자 수 통계.** `packages/app/src/hooks/use-document-stats.ts`가 변경 300ms 뒤 `computeBodyStats`를 돌린다.
  5,000줄에서 한 번에 330~400ms 동안 메인 스레드를 막는다.
- **입력하지 않은 줄.**
  - P2c 브라우저 확인 중 sample 문서에 입력하지 않은 `- 1\. ` 줄이 한 번 생겼다.
  - Y.Text 관찰기를 켜고 되풀이했을 때는 생기지 않았다.
  - 코드를 저장할 때마다 Vite가 페이지를 다시 불러오고, 숨겨진 Tiptap이 fragment를 다시 쓴다. 서버 브리지가 이 쓰기를
    Y.Text에 병합하므로 이 병합이 유력한 원인이다. 확정하지는 못했다.
  - 브라우저에서 입력하지 않은 글자가 보이면 엔진을 의심하기 전에 Y.Text 트랜잭션의 `tr.local`과 origin부터 기록한다.
- **main에서도 실패하는 테스트.**
  - `EditorActivityPool.test.ts`, `EditorActivityPool.lazy.test.ts`, `EditorArea.test.ts`: lingui 매크로가 컴파일 밖에서
    실행된다.
  - `api-agent-patch`와 `surrogate-normalizer`: 한 프로세스에서 같이 돌릴 때만 실패한다.

## 6. 코드 지도

- **core** `packages/core/src/editing-model/`
  - `SPEC.md`: 편집 규칙. 절마다 fixture group id를 괄호로 인용한다. `fixtures.test.ts`가 모든 group이 인용됐는지
    검사한다.
  - `fixtures/hide.json`, `fixtures/edit.json`: 적합성 사례. 표기는 `⟨⟩` 숨김, `⦃⦄` 위젯, `│` 커서, `⟪⟫` 선택이다.
    동작 종류는 `text`·`key`·`toggle`·`block`·`move`·`paste`·`copy`다(`fixtures.ts`의 `EditAction`).
  - `layout.ts`: `computeLayout`은 core 파서의 mdast에서 숨김·위젯·서식·span을 만든다. 번호 항목 위젯은 `label`에
    Markdown이 읽는 번호를 담는다.
  - `edit.ts`: `applyActions`와 `EditState`.
    - `EditState`는 `source`, `anchor`, `head`, `side`, `pending`, `undo`를 담는다.
    - 입력은 `typeCharAt` → `blockMarkerInput`(블록 기호·목록 전환·수평선) → `keepsLayout` → `closesMarkAt`(서식
      규칙) → `literalChar`(글자 그대로 두기) 순으로 처리한다.
    - 키는 `backspace`·`deleteForward`·`enter`·`indentItem`이 처리한다.
    - 블록 동작은 `setBlock`·`moveBlock`, 블록 원문 편집은 `editBlockSource`가 처리한다.
    - `layoutOf`는 마지막 원문의 레이아웃을 캐시한다.
  - `incremental-layout.ts`, `window.ts`: 블록 단위 증분 레이아웃과 커서 주변 창 편집. `undo`는 창 좌표와 문서 좌표
    사이에서 옮긴다.
  - `changes.ts`: `sourceChanges`는 편집 결과를 코드 포인트 경계의 최소 변경으로 바꾼다.
  - `block-widget.ts`: 코드 언어·본문과 표 칸의 원문 범위, 해당 범위만 바꾸는 위젯 편집 규칙.
- **app**
  - `packages/app/src/editor/live/live-extension.ts`: 레이아웃 StateField, 커서 의도 필드(`side`·`pending`·`undo`),
    keymap, inputHandler(IME 조합 중에는 건너뜀), 붙여넣기·복사, 장식과 위젯.
  - `packages/app/src/editor/live/block-widgets.ts`: 코드·표 블록 위젯, 표 칸 안의 작은 live 편집기.
  - `packages/app/src/editor/live/diagram-widgets.ts`: 수식·Mermaid 본문 입력과 기존 렌더러 미리보기.
  - `SourceEditor.tsx`: `variant` Compartment로 source와 live를 바꾼다.
  - `use-editor-mode.ts`: 모드는 `'wysiwyg' | 'source' | 'live'`이고 localStorage 키는 `ok-editor-mode-v1`다.

## 7. 검증

```bash
bun run test:file -- $(ls packages/core/src/editing-model/*.test.ts)
bun run test:file -- packages/app/src/editor/live/live-extension.dom.test.tsx
```

- P2c 결과: core 158개 통과(무작위 편집 2,840건 실패 0, 5,008줄 창 편집 p50 3.4ms / p95 5.0ms). live DOM 108개 통과.
- P3a 추가 검증: core 블록 범위·fixture 테스트 16개와 live DOM 113개 통과. core·app 타입 검사 통과. 브라우저에서
  코드 본문·표 칸 수정 후 새로고침해 저장을 확인했다.
- P3b 추가 검증: core 위젯·fixture 테스트 20개와 live DOM 115개 통과. core·app 타입 검사 통과. 브라우저에서
  수식·Mermaid 렌더링, 편집, 새로고침 저장을 확인했다.
- P3c 추가 검증: live DOM 116개와 app 타입 검사 통과. 브라우저에서 속성 패널 편집·저장 및 모드별 표시를 확인했다.
- **DOM 테스트:** edit fixture를 실제 EditorView의 inputHandler와 keymap으로 재생한다. 키 이벤트는 브라우저처럼
  보낸다(Shift는 글자를 대문자로 바꾸고 `keyCode`를 넣는다). 이렇게 하지 않으면 Cmd+Shift+B가 Cmd+B로 잡힌다.
- **새 동작을 넣는 순서:** SPEC.md 문구 → `edit.json` fixture → `edit.ts` → 앱 keymap → DOM 테스트 대응표.
- **브라우저 측정.**
  - 페이지 안에서 잰다. Event Timing, Long Animation Frame 관찰기를 쓴다. MCP 왕복 시간은 결과를 흐린다.
  - MCP로 키를 몰아 보내면 표시 지연이 쌓인다. 키 사이에 0.4초씩 둔다.
  - 관찰기를 다시 설치하기 전에 이전 관찰기를 끊는다. 끊지 않으면 항목이 두 번 쌓인다.
- **브라우저 창 스크린샷은 늦게 갱신된다.** 원문은 DOM에서 읽는다.
  - 원문: `import('/node_modules/.vite/deps/@codemirror_view.js')` → `EditorView.findFromDOM(document.querySelector('.cm-editor'))`
  - Y.Text: `view.plugins.find(p => p.value?.conf?.ytext).value.conf.ytext`

## 8. 로컬 실행 환경

- **dev 서버.**
  - 메인 체크아웃의 `.claude/launch.json`(git 무시)에 `web-source-editor` 항목이 있다(포트 5183).
  - 명령: `OK_TEST_CONTENT_DIR=<테스트 콘텐츠 폴더> bun run --cwd .worktree/web-source-editor/packages/app dev -- --port 5183 --strictPort`
  - 이 항목은 이전 세션의 임시 폴더를 가리킨다. 새 세션은 자기 임시 폴더에 콘텐츠를 만들고 경로를 고친다.
- **테스트 콘텐츠.**
  - `sample.md`: 제목, 서식, 목록, 번호 목록(원문 번호를 모두 `1.`로 적음), 작업 항목, 인용, 코드 블록, 위키 링크,
    태그를 담는다.
  - `large.md`: 5,000줄. `## Section N` 아래에 서식과 링크가 든 문단 8줄, 작업 항목 2개와 불렛 하나, 인용 한 줄을
    되풀이한다.
- **IndexedDB.** 측정이나 동기화를 확인하기 전에 `ok-ydoc:*` IndexedDB를 지운다. 같은 origin의 다른 경로(예:
  `/favicon.ico`)로 이동한 뒤 `indexedDB.deleteDatabase`를 호출한다.
  - 큰 문서는 5절 문제 때문에 브라우저에서 동기화를 확인할 수 없다. 동기화는 sample 문서로 확인한다.
- **모드 전환.** `localStorage.setItem('ok-editor-mode-v1', 'live')`를 실행한 뒤 새로 고친다. 해시 이동만으로는
  모드가 바뀌지 않는다.

## 9. 저장소 규칙 중 놓치기 쉬운 것

- `gh`는 항상 `--repo Nedian0Brien/SynapseNote`로 쓴다. 기본값은 upstream `inkeep/open-knowledge`로 잡힌다.
- 새 UI 문자열을 넣으면 `packages/app`에서 `bun run i18n`을 돌린다. 이 명령은 관계없는 오래된 항목도 함께 정리한다.
  커밋 메시지에 그 사실을 적는다.
- 사람의 확인은 intent 수락 한 번이다. 단계마다 `plan_*.md`를 쓰고 커밋한 뒤 바로 진행한다. 결과는 같은 plan 파일에
  적는다.
- 스테이징은 파일을 이름으로 지정한다. 다른 세션의 작업이 같은 저장소에 있다.
- 응답의 파일 링크는 `.worktree/web-source-editor/` 접두사를 붙인 경로로 건다.

## 10. 다른 진행 중인 일

| 항목 | 상태 |
|---|---|
| `large-doc-concurrent-load` | intent 수락됨. 이 작업 뒤 진행(워크트리 있음) |
| `native-local-store`, `database-mutation-roundtrips` | intent 초안, 수락 대기 |
| `codex/concurrent-edit-duplication` | web-source-editor로 대체됨. 워크트리 삭제 여부를 사용자에게 물었고 답이 없다 |
| `codex/native-editor-spike`, `codex/server-remote-access` | 푸시됨, 병합 안 됨 |
