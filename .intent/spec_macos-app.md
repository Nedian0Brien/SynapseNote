---
title: macOS 앱 첫 판 — 서버 원본 위의 문서 편집과 에이전트
slug: macos-app
stage: spec
status: accepted
intent: .intent/intent_macos-app.md
date: 2026-10-16
---

# macOS 앱 첫 판 — 명세

## 현재 상태 (조사, 2026-10-16)

- **문서 API.** `GET /api/documents?showAll=true&dir=<rel>&depth=1`이 한 단계씩 트리를 준다(`server/src/api-extension.ts:6029`,
  응답 `core/src/schemas/api/document-read.ts`). 생성은 `POST /api/create-page {path:"a/b.md"}` → `{docName}`,
  `POST /api/create-folder {path}`. 문서 이름은 콘텐츠 폴더 기준 경로에서 `.md`를 뗀 것이다.
- **변경 알림.** SSE는 없다. `__system__` Hocuspocus 문서의 CC1 stateless 메시지(`{v:1,ch:'files',seq}` 등)가 유일한 채널이고
  다시 보내 주지 않는다. 웹은 재연결마다 목록을 다시 받는다(`app/src/components/SystemDocSubscriber.tsx:194`).
- **접근 규칙.** `/collab`은 출처 검사 없이 토큰 `{}`를 받는다. HTTP는 Origin이 없으면 통과하고, 변경 요청은 loopback 주소와
  `Host: 127.0.0.1|localhost`를 요구한다(`server/src/loopback.ts`). 서버 포트는 고정값이 없다(`.ok/local/server.lock`, `GET /api/config`).
- **CRDT 상태.** 서버는 Y 상태를 저장하지 않는다. `onLoadDocument`(`server/src/persistence.ts:2124`)가 Markdown으로 문서를 만들고
  lineage epoch를 새로 발급한다(`:2232`). 문서는 서버가 살아 있는 동안 내리지 않는다(`server-factory.ts:1560`). 디스크 수정은
  `applyDiskContentToDoc`(`server/src/external-change.ts:88`)이 `Y.Text`에 diff로 반영한다. 에이전트가 파일을 직접 고쳐도 기기에 간다.
- **편집 규칙.** web-source-editor의 `core/src/editing-model/`이 `computeLayout`(숨김·위젯 범위, UTF-16), `applyActions`(입력·삭제·
  Enter·붙여넣기 규칙), `SPEC.md`, fixture 221개(hide 42·edit 125·widget 54)를 가진다.
- **JavaScriptCore 시험.** 위 모듈을 IIFE 한 파일(1.06MB)로 묶어 macOS `jsc`에서 돌렸다. 5,000줄 전체 레이아웃 352ms, 한 문단
  레이아웃 p95 1ms. 조건 두 가지가 필요했다: `decode-named-character-reference`를 DOM 판 대신 `index.js`로 묶고, `console`을
  주입한다. 앱 안 `JSContext`(App Sandbox, hardened runtime)의 속도는 재지 않았다.
- **에이전트 채팅.** 명령 조립 `desktop/src/main/cli-chat-command.ts`(211줄), 기록 읽기 `cli-chat-sessions.ts`(580줄),
  지시문(41줄), 출력 해석 `app/src/components/chat/parsing/stream-parser.ts`(346줄), 프롬프트 조립 `composeCliChatPrompt`는
  Electron에 의존하지 않는다. 실행·스트리밍·취소는 `desktop/src/main/index.ts:3243-3324`에 Electron IPC로 묶여 있다.
  도구 승인 대화는 없다(`--print`, `approval_policy="never"`). 현재 문서는 프롬프트의 `<current_document>`와
  `__system__` awareness의 `currentView`(`GET /api/current-document`)로 전달된다.
- **스파이크 자산.** `yrs-ffi`(yrs 0.28 + 서로게이트 패치, UniFFI 222줄), Swift Hocuspocus 클라이언트(315줄)는 동작이 검증됐다.

## 기존 편집기 동등성

**기준.** 사용자가 쓰는 기존 편집기(Tiptap 시각 편집기)와 같은 일을 할 수 있어야 한다. 동작 규칙은 core `SPEC.md`를 따른다. 기호는 항상 숨기고,
SPEC이 기존 편집기와 일부러 다르게 둔 네 가지(링크 끝 입력, 블록 기호 변환 시점 등)는 SPEC대로 한다. 웹 live 모드에도 없는 기능은 core에
편집 규칙을 먼저 더하고 웹과 네이티브가 같이 쓴다.

**목록.** 조사 2026-10-16. 위치는 `.intent/handoff_web-source-editor.md`와 `packages/app/src/editor/`. ✅ 됨 · ◐ 일부 · ✗ 없음.

| 기능 | 웹 live | 편집 규칙 | 네이티브 | 단계 |
|---|---|---|---|---|
| 굵게·기울임·취소선·강조·인라인 코드(숨김, 서식, ⌘B/I/E·⇧⌘X/H) | ✅ | core | ✅ 표시·서식 메뉴 단축키(키 입력은 직접 확인 전) | P1 |
| 링크·위키 링크·태그 칩·각주 참조·문자 참조·이스케이프 | ✅ | core | ◐ ⌘클릭 이동·태그 칩·각주 위첨자 됨, 문자 참조 위젯 없음 | P1 |
| 제목, 목록(글머리표·번호·체크박스), 인용 막대, 수평선 | ✅ | core | ✅ | P1 |
| 체크박스 클릭으로 완료 표시 | ✅ | UI(원문 `[ ]`↔`[x]` 한 글자 교체) | ✅ 같은 방식 | P1 |
| 입력 규칙·Enter·Backspace·Tab·블록 이동(⇧⌘↑↓)·붙여넣기·복사 | ✅ | core | ✅ fixture 통과, 목록 Enter·Backspace 화면 확인 | P1 |
| 실행 취소·다시 실행 | ◐ | UI | ✅ yrs UndoManager, 메뉴로 확인 | P1 |
| 찾기·바꾸기 | ◐ | UI | ◐ 찾기 막대 연결, 직접 확인 전 | P1 |
| IME(한글 조합) | ◐ | UI | ◐ 구현, 직접 확인 전(자동 입력 도구가 한글 조합을 보내지 못한다) | P1 |
| 코드 블록(울타리 숨김, 언어, 고정폭 배경) | ✅ | core | ◐ 울타리 보임 | P3 |
| 코드 구문 강조 | ✗ | — | ✗ | P3 |
| 코드 블록 도구(복사·삭제·제목·Ask AI) | ✗ | UI | ✗ | P4 |
| 콜아웃(GFM·MDX), 아코디언·`<details>`(접기), Tabs | ✅ | core 범위 + UI | ✗ 원문 보임 | P3 |
| 표 칸 편집 | ✅ | core | ✗ | P3 |
| 표 구조 편집(행·열 추가·삭제, 머리글, 재정렬, 머리글 고정) | ✗ | → core에 추가 | ✗ | P3 |
| 블록 수식, Mermaid | ✅ | core 범위 + UI 렌더 | ✗ | P3 |
| 인라인 수식 `$…$` | ✗ | → core에 추가 | ✗ | P3 |
| 이미지(MD·위키·MDX·참조), 비디오·오디오, 파일·Embed·Bookmark | ✅ | core 범위 + UI | ✗ | P3 |
| 이미지 확대·정렬·크기 조절 | ✗ | UI | ✗ | P4 |
| 각주 정의, 링크 참조 정의, 주석 `%%…%%` | ✅ | core | ✗ | P3 |
| frontmatter 속성 패널 | ✅ | 숨김은 core, 패널 UI | ✗ | P3 |
| 원시 HTML 블록, 인라인 JSX | ✗ | → core에 추가 | ✗ | P3 |
| 밑줄(⌘U) | ✗ | → core에 추가 | ✗ | P4 |
| 슬래시 메뉴(블록·컴포넌트·데이터베이스·스타터) | ✅ | 변환은 core, 메뉴 UI | ✗ | P4 |
| 선택 서식 막대 | ◐ | 명령은 core | ✗ | P4 |
| 링크 대화상자 ⌘K, `[[` 위키 링크 선택기, `#` 태그 선택기, 태그 대화상자 | ✅ / ✗(태그 대화상자) | core + UI | ✗ | P4 |
| 각주 삽입, 메모 작성·표시·이동 | ✅ | core + UI | ✗ | P4 |
| `[text](url)` 입력·자동 링크, URL 붙여넣기 형식 메뉴 | ✗ | → core에 추가 | ✗ | P4 |
| 파일 드롭·붙여넣기 업로드, 사이드바 문서 드롭 | ✅ / ✗ | UI | ✗ | P4 |
| 블록 드래그 손잡이·"+", 블록 키보드 탐색 | ✗ | UI | ✗ | P4 |
| Edit with AI(⇧⌘I, 막대 버튼) | ◐ | UI | ✗ | P4 |
| DatabaseView(새·연결·인라인), Mirror, HTML 미리보기, PDF 뷰어 | ✅ | UI | ✗ | P5 |
| MDX 속성 패널(아이콘·색·src 선택기), 미등록 MDX 원문 블록 | ◐ | core + UI | ✗ | P5 |
| 협업 커서·presence, 에이전트 쓰기 표시 | ◐ | UI | ✗ | P5 |
| 아웃라인 이동, 글자 수·선택 통계 | ◐ / ✅ | UI | ✗ | P5 |
| PDF 내보내기 | ✗ | UI | ✗ | P5 |

## 요구사항

**P0 기반 (완료, `plan_macos-app-p0.md`)**
- [x] R1. core 스크립트가 편집 규칙 번들(`synapsenote-editing.js`)을 만들고, 번들은 `JSContext`에서 로드된다.
- [x] R2. Swift 테스트가 번들로 `hide.json` 42건·`edit.json` 125건을 TS와 같은 결과로 통과한다.
- [x] R3. Release 빌드, 5,000줄 문서 입력 시 키 입력 → 화면 반영 p95 15.84ms(기준 16ms). `allow-jit` 권한이 필요하다.

**P1 서버 연결·목록·기본 블록**
- [x] R4. 설정에서 서버 주소를 입력하면 `GET /api/config`로 확인하고 저장한다. 연결이 끊기면 자동으로 다시 붙는다.
- [x] R5. 사이드바가 폴더를 펼칠 때 한 단계씩 받는다. CC1 `files`와 재연결 때 다시 받는다. 새 문서·새 폴더를 만든다.
- [x] R6. 키 입력은 `EditAction` → 원문 변경 → `Y.Text` 트랜잭션으로 간다. 원격 편집은 선택 위치를 유지하며 반영된다. 원문 보기를 켜면 원문 전체가 보인다.
- [x] R7. 연 문서를 `__system__` awareness `currentView`로 알린다. `GET /api/current-document`가 그 문서를 돌려준다.
- [ ] R8. 메뉴·단축키: 새 문서(⌘N), 실행 취소·다시 실행, 찾기·바꾸기(⌘F), 원문 보기, 채팅 패널, 웹 live와 같은 서식·블록 단축키.
- [ ] R18. 동등성 목록의 P1 행: 목록 기호·체크박스(클릭 완료 포함)·인용 막대·수평선을 그리고, 링크·위키 링크 ⌘클릭 이동, 태그·각주 칩, 한글 IME를 화면에서 확인한다.

**P2 에이전트**
- [ ] R9. 서버 WebSocket `/api/agent-chat`(loopback·Host 검사)이 `send`·`cancel`을 받는다. 기존 명령 조립으로 CLI를 띄우고, 해석된
  `ChatEvent`를 보낸다. 한 대화에 한 턴씩만 돈다. `cancel`은 프로세스 그룹에 SIGINT를 보낸다.
- [ ] R10. 연결이 끊겨도 턴은 계속 돈다. 서버는 진행 중인 턴의 이벤트를 메모리에 두고, 다시 붙은 클라이언트가 `chatId`로 이어 받는다.
- [ ] R11. `GET /api/agent-chat/sessions`, `GET /api/agent-chat/sessions/:cli/:id`가 기존 기록 읽기 결과를 준다.
- [ ] R12. Electron 채팅 동작은 그대로다. 옮긴 모듈을 desktop이 가져다 쓰고 기존 테스트가 통과한다.
- [ ] R13. 앱 채팅 패널: 현재 문서를 문맥으로 보내기, 스트리밍, 중지, 이전 대화 이어 가기, 모델·권한 선택.

**P3 블록 위젯**
- [ ] R19. 동등성 목록의 P3 행을 네이티브 위젯으로 그리고 편집한다. 위젯 편집은 core `block-widget.ts`(`BlockWidgetEdit`)로 원문 범위만 바꾸고,
  `widget.json` 54건을 Swift 테스트로 통과한다.
- [ ] R20. 웹 live에도 없는 표 구조 편집·인라인 수식·원시 HTML·인라인 JSX는 core 편집 규칙과 fixture를 먼저 더하고 웹 live에도 연결한다.

**P4 편집 도구**
- [ ] R21. 동등성 목록의 P4 행. 슬래시 메뉴 항목과 선택 막대 구성은 기존 편집기와 같다(밑줄 포함).

**P5 데이터·외부 위젯과 주변 UI**
- [ ] R22. 동등성 목록의 P5 행. DatabaseView는 `/api/databases/*`로 네이티브 표를 그린다.

**P6 상태 보존·오프라인**
- [ ] R14. 서버가 문서 Y 상태를 `.ok/local/ydoc/`에 저장한다. 다시 로드할 때 저장된 상태를 먼저 적용하고 epoch를 유지한 뒤, 디스크
  내용이 다르면 `applyDiskContentToDoc`으로 diff를 반영한다.
- [ ] R15. 디스크 변경 없이 서버를 재시작하면 epoch가 같다. 오프라인 동안 앱에서 친 편집이 재연결 후 서버 파일에 들어간다(테스트).
- [ ] R16. 앱이 문서별 `{서버, 문서 이름, epoch, Y update}`를 앱 컨테이너에 저장하고, 서버 없이 연다. 재연결 때 `expectedDocLineageEpoch`·
  `expectedBranch`를 보낸다. lineage가 거부되면(삭제·이름 변경) 앱의 미전송 내용을 `<이름> (오프라인 사본 <날짜>).md`로 만들어 보존한다.
- [ ] R17. 오프라인 표시와, 새 문서·에이전트 비활성화.

**단계마다 지킬 것.** 위젯이 늘 때마다 R3 측정을 다시 하고 p95 16ms를 지킨다. 단계가 끝나면 동등성 목록의 네이티브 열을 고친다.

**단계별 열린 질문.** 수식(KaTeX는 DOM이 필요하다)과 Mermaid를 네이티브로 그릴 방법, 코드 구문 강조 방식(core 번들에 lowlight를 넣을지)은
P3 plan에서 조사해 정한다. DatabaseView 표의 범위는 P5 plan에서 정한다.

## 설계

- **배치.** `native/` 아래에 둔다. `native/yrs-ffi`(스파이크 crate 이동, Y 상태 저장·`lifecycle` epoch 읽기 추가),
  `native/SynapseKit`(Swift 패키지: `Sync` Hocuspocus 클라이언트, `Store` 기기 저장, `EditingCore` JSContext 실행, `ServerAPI`,
  `AgentChat`), `native/macOS`(SwiftUI 앱 + AppKit 편집기, xcodegen `project.yml`). iOS 앱은 나중에 `SynapseKit`을 쓴다.
- **편집기.** `NSTextView`(TextKit 2)가 원문 전체를 담고, 숨김 범위는 레이아웃 단계에서 0폭으로 그리며, 위젯은 텍스트 첨부·오버레이로 그린다.
  선택·키 입력은 원문 오프셋으로 바꿔 `applyActions`에 넘긴다. 레이아웃은 `IncrementalLayout`으로 바뀐 블록만 다시 계산한다.
- **에이전트.** 순수 모듈(명령 조립·기록 읽기·지시문·출력 해석·프롬프트 조립)을 core로 옮긴다(파일 읽기는 core의 Node 전용 진입점).
  desktop과 app은 core에서 가져온다. 서버에 `agent-chat` 모듈을 새로 두어 실행 레지스트리(`chatId` 기준)·스트리밍·취소를 맡긴다.
- **상태 보존.** 서버 저장 시점(`onStoreDocument`)마다 `Y.encodeStateAsUpdate`를 원자적으로 쓴다. 로드 순서: 저장 상태 적용 → epoch 유지 →
  디스크와 비교·diff 반영. 저장 상태가 없으면 지금처럼 Markdown에서 만들고 epoch를 새로 발급한다.
- **빌드.** core 번들은 `bun run --filter @nedian0brien/synapsenote-core build:native-bundle`로 만들고 앱 리소스로 복사한다(산출물은 gitignore).
  xcframework는 `aarch64-apple-darwin`(macOS)·`aarch64-apple-ios`·`aarch64-apple-ios-sim`을 담는다.

## 버린 대안

- **Catalyst 앱.** 메뉴·창·키보드가 iPad 동작이다.
- **Swift 파서 이식.** core 파서(약 14,000줄) 동작을 맞추는 비용이 크고 웹과 결과가 갈라진다.
- **로컬 우선 앱(서버 없음).** 여러 기기가 같은 내용을 보는 요구를 못 맞춘다.
- **새 서버.** 데이터베이스·검색·MCP·로그인·원격 배포를 다시 만들어야 하고, 상태 보존과 에이전트 실행은 여전히 필요하다.
- **오프라인 텍스트 3-way 병합.** 서버가 상태를 보존하면 CRDT가 합친다. 남는 경우(삭제·이름 변경)는 사본으로 보존한다.

## 함정

- 앱은 `expectedServerInstanceId`를 보내지 않는다. 재시작마다 바뀌어 저장 상태가 있어도 연결이 거부된다.
- `JSContext`에는 `console`이 없고, 브라우저 조건으로 묶으면 DOM을 쓰는 모듈이 들어온다. 앱은 `com.apple.security.cs.allow-jit`가 있어야 JIT로 돈다(없으면 키 입력 약 50ms, P0 측정).
- 오프셋은 UTF-16이다. 서로게이트 쌍이 쪼개지는 update는 yrs 패치가 Yjs와 같게 처리한다.
- 웹 편집기를 함께 열면 숨겨진 Tiptap이 fragment를 다시 쓰고, 세 작성자 중복이 생긴다(기존 문제, 범위 밖).
- CC1은 다시 보내 주지 않는다. 재연결 때 목록·현재 문서를 다시 받는다.
- 에이전트 `full-access`는 서버에서 임의 명령 실행이다. 이번 API는 loopback에서만 받는다.
- 서버의 자기 쓰기 감지(`writeTracker`)가 Y 상태 파일 쓰기와 섞이지 않게 `.ok/local/` 아래는 감시 대상에서 빠지는지 확인한다.

## 완료 기준

- P0: 완료(`plan_macos-app-p0.md` 결과).
- P1: 맥에 설치한 앱에서 문서 목록·열기·편집·새 문서·원문 보기와 동등성 P1 행을 확인하고, 웹·`/api/agent-patch` 편집이 앱에 보이는 것을 확인한다.
- P2: 서버 `agent-chat` 테스트(manifest 등록) 통과, desktop 채팅 테스트 통과, 앱에서 Claude Code·Codex 요청·중지·이어 가기와 문서 수정 반영 확인.
- P3·P4·P5: 동등성 목록의 해당 행을 기존 편집기와 같은 문서로 나란히 열어 비교하고, R3을 다시 잰다.
- P6: 서버 재시작 상태 보존 테스트 통과, 앱 오프라인 편집 → 서버 재시작 → 재연결 후 파일 반영 확인.
