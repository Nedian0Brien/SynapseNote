# 11e-2단계 상태 소유를 Swift로, 웹 제거 검증 결과

- 날짜: 2026-10-21
- 브랜치: `feat/swift-session-owner`(기준 `feat/swift-operations`)
- 환경: Xcode 27.0, macOS 27.0, iPad Pro 13-inch (M5) 시뮬레이터(iOS 27.0, 앱 컨테이너의 시험 vault)
- 비교 기준: Morrow a2daae1의 `src/storage/session.ts`·`saveQueue.ts`, `src/main.tsx`(열기, 환영 안내, 읽지 못한 항목 알림), `src/app/workspace.ts`(`run`), `src/app/review.ts`, `src/app/operations.ts`(`restoreVersion`), `src/app/components/PageView.tsx`(`markOpened`), `src/core/sample.ts`

## 바뀐 것

앱 안에 웹 페이지가 없다. Swift 세션(`SessionHost`/`CoreSession`)이 작업공간을 가지고, 명령을 적용하고, 저장 시점을 정하고, 바깥 편집을 받는다.

- **명령**: 화면이 만든 Morrow 명령을 세션 큐에 바로 넣는다. 거절되면 Morrow `run`처럼 오류 알림.
- **저장**: 세션 큐의 타이머가 마지막 변경 300ms 뒤에 저장하고, 실패하면 1초부터 두 배씩 30초까지 다시 한다(`SaveQueue`, Morrow `saveQueue.ts`). 앱을 내리거나 닫을 때, vault를 바꿀 때, 동기화 전에는 바로 저장한다.
- **보고**: 바뀐 것은 16ms로 묶어 페이지 목록·잠긴 페이지·저장 상태로 화면에 알린다. 사이드바, 저장 표시, 화면 다시 묻기(`revision`)가 이것을 쓴다.
- **바깥 편집**: 열린 편집기·원문·캔버스의 입력을 먼저 세션에 넣고(Morrow `beforeExternal = commitEditors`) 파일을 읽는다. 저장 안 된 페이지는 그대로 두고 다른 쪽 버전은 기록으로 간다(`applyExternal`).
- **열기**: 처음 연 vault에 환영 안내를 넣고 저장한 뒤 `markInitialized`(Morrow `main.tsx` 순서). 다른 기기에서 채울 폴더에는 넣지 않는다. 읽지 못한 항목이 있으면 Morrow 문구의 오류 알림(12초).
- **환영 안내**: `web/scripts/guide-resource.ts`가 Morrow `sampleCommands`에 이 앱의 문구 바꾸기(`web/sampleRenames.ts`)를 적용해 실행하고, 새 id·오늘 기준 날짜·지금 기준 시각을 자리표로 바꿔 `App/Resources/WelcomeGuide.json`에 쓴다. 앱(`WelcomeGuide`)은 열 때 채운다.
- **직접 처리**: 암호화(걸기, 잠그기, 열기, 풀기), 기록 복원(Morrow 알림 문구), 복습 평가(바로 반영, 800ms 뒤 `.morrow/review.json`), 페이지 연 시각(`page.markOpened`, 캔버스 제외).
- **화면 종류**: `PageScreen.web` 대신 `.none`(없음·휴지통·잠김)과 `.invalid`(Morrow가 아는 노드만 있지만 편집기가 열지 못하는 문서, 평문으로 보이고 바꾸지 않음).
- **지움**: `WebPage`, `EditorBridge`, `VaultRPC`, `EditorSchemeHandler`, `FileInputPresenter`, `StateMirror`, `CoreDualRun`, 웹 프로세스 종료 복구, DEBUG 비교, 웹 알림, 테마·설정 메시지, `-nativeEditor`, PDF 스냅숏 경로, 사용자 CSS 설정(사용자 결정, vault의 `.morrow/style.css`는 그대로), Xcode 빌드 전 node 단계(`scripts/build-editor.sh`)와 `App/Resources/Editor`.
- **웹 번들이 주던 자원**: 이모지 그림·목록과 라이선스를 `web/scripts/vendor-emoji.ts`로 `App/Emoji`에 넣었다(3391개 그림, 24MB, App/Renderers와 같은 방식). 라이선스 화면은 `Renderers`·`Emoji`의 THIRD_PARTY_LICENSES를 읽는다.
- **web/**: 앱 페이지와 그 시험을 지우고 비교 자료를 만드는 도구만 남겼다. `vite.config.ts`는 시험에서 환영 안내 문구 바꾸기만 적용한다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| node가 PATH에 없고 Morrow submodule도 없는 새 clone에서 `xcodegen generate` 뒤 `xcodebuild … -destination 'platform=macOS,arch=arm64' build`, `… -destination 'generic/platform=iOS Simulator' build` | 둘 다 BUILD SUCCEEDED |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS,arch=arm64' test` | 통과, 186개 |
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 18개(질의 답, 환영 안내 문구) |
| `npm --prefix web run core-fixtures`(mirror 부분을 뺀 뒤) | 다른 비교 자료가 바이트까지 같음 |

- 시험 수: 11e-1의 194개에서 웹 쪽 시험(`EditorBridgeTests` 4, `EditorSchemeHandlerTests` 3, `StateMirrorTests`, `CoreDualRunTests`, 스냅숏 PDF 1)을 빼고, `SessionHostTests`를 새 API로 다시 쓰고(12개), `WelcomeGuideTests` 2개를 더했다.
- `SessionHostTests`: 열기·이름 바꾸기·저장, 300ms 뒤 스스로 저장, 거절과 전부 아니면 없음, 화면 종류(`.editor`, `.source`, `.unreadable`, `.unknown`, `.invalid`, `.none`), 데이터베이스·캔버스 화면 자료, 캔버스는 연 시각을 남기지 않음, 새 vault의 환영 안내 한 번, 저장 안 된 페이지가 있는 바깥 편집, 암호화(잠김 보고, 틀린 암호, 열기, 풀기), 기록 복원, 복습 평가와 `review.json`, 파일 저장.
- `WelcomeGuideTests`: 자원을 채운 명령이 node `sampleCommands(counter, FIXED_NOW)`(바꾸기 적용, TZ=UTC)와 같음(`guide.json`), 모든 명령을 세션이 읽음. `web/src/guide.test.ts`의 문구 검사(SynapseNote 이름, Mac 키, "open source" 없음).
- DEBUG 세션 비교(11c~11e-1의 받아들이는 기준)는 웹 세션이 없어져 할 수 없다. 그 자리는 아래 iPad 시나리오와 비교 자료가 맡는다.

## iPad에서 확인한 것

| 동작 | 결과 |
|---|---|
| 앱 실행 | 웹 없이 vault가 열리고 홈이 그려짐. 읽지 못한 항목 2개 알림(시험 vault의 `Broken.md`, `Bad board.canvas`) |
| 편집(Editor test) | 저장 표시 Saving… → Saved, 파일에 `Plain typed here` |
| 이름 바꾸기 | 제목을 바꾸면 파일 이름이 따라감, 되돌리기도 같음 |
| 새 페이지(⌘N) | `Untitled 4.md`가 생기고 제목 칸에 커서(아래 고친 것), 제목에서 Return으로 본문 첫 줄 |
| 이동(Move Page To…) | `Embed/Owner check!.md`로 옮겨지고 사이드바 Embed 아래 |
| 휴지통 → Undo | `.trash/`로 갔다가 Undo로 돌아오고 그 페이지가 다시 열림 |
| 휴지통 화면 Restore | 파일이 돌아오고 Open 단추 알림 |
| 암호화 | 파일이 `morrow-encrypted` 머리와 암호문, 잠그기 → 암호 화면, 틀린 암호 "That password is not right.", 맞는 암호로 열림, 열린 채 편집해도 파일은 암호문이고 기록에 평문 없음, Remove Encryption으로 평문 |
| 기록 복원(Editor test, 2:15 AM 버전) | 파일이 그 버전으로, 열린 편집기도 바뀜, "Version restored. The version it replaced is kept in the page history." |
| 복습 평가(Good) | 화면 3 due·1 reviewed, 사이드바 3, 약 1초 뒤 `review.json`에 interval 6, reps 2 |
| 첨부(/image, 파일 선택기에서 그림) | `attachments/cover-picture.png` 저장, 페이지에 그림 |
| Media test 페이지 | 글 안·블록 수식, 그림, PDF 블록, 소리 줄, 웹 그림 안내가 그려짐(`App/Renderers`만 씀) |
| Export Page as PDF…(Media test, 명령 팔레트) | 편집기 scheme을 뺀 뒤에도 1쪽 PDF, 제목·수식(MathML)·파일 이름·코드·원문 블록 글, 크기 156013바이트로 11e-1 결과와 같음 |
| 앱을 내릴 때 저장 | 입력 직후 홈 단추, 0.3초 안에 파일에 들어감 |
| 바깥 편집 | 열린 페이지(Blocks test) 파일을 바깥에서 고치자 화면이 바뀜. vault 안 폴더를 바깥에서 옮기자 그 페이지들이 목록에서 빠짐 |
| 새 vault(빈 폴더를 Open Folder…) | 환영 안내 17쪽, 문구는 SynapseNote와 Mac 키, 날짜는 오늘 기준(`[[2026-10-21]]`, `[[2026-10-22]]`, `[[2026-10-24]]`) |
| 로그 | `com.synapsenote.native`의 오류 없음 |

## 함께 고친 것

- **새 페이지의 제목 칸 초점**: 새 페이지는 세션 보고가 온 뒤 화면이 그려진다. 그보다 먼저 온 제목 초점 요청을 `onChange`로만 받아 놓쳤다. 제목 칸이 나타날 때 남은 요청을 한 번 받는다.
- **제목에서 Return**: 하드웨어 키보드의 Return이 세로 `TextField`에서 줄바꿈 대신 submit으로 와서 본문으로 넘어가지 않았다. `onSubmit`에서도 본문 첫 줄로 간다.

## Morrow와 다른 점

- **편집기가 열 수 없는 문서**: Morrow(TipTap)는 빈 문서로 열어 저장 때 덮어쓸 수 있다. 앱은 평문으로 보이고 바꾸지 않는다.
- **사용자 CSS**: 설정에서 뺐다. vault의 `.morrow/style.css`는 읽지도 지우지도 않는다.

## 알려진 한계

- 확인하지 않은 것: 저장 실패와 재시도(쓰기 실패를 iPad에서 만들지 않음, `SaveQueue` 시험은 11c에 있음), 바깥 편집과 입력이 겹칠 때(시뮬레이터에서 시점을 맞추기 어려움, `SessionHostTests.outsideEditsKeepUnsavedPages`가 맡음), macOS 앱(실제 폴더로 돌리지 않음), iOS 시뮬레이터에서의 단위 시험(이전부터 시험 실행기가 멈추는 문제, 빌드만 확인).
- 홈의 단어 수 카드가 네 자리 수에서 두 줄로 나뉜다(사이드바가 열린 iPad 세로 폭, 이번 단계와 무관하게 이전부터 있던 배치).
- 자동화가 명령 팔레트에 "New Page"를 입력하고 Return을 누르자 다른 페이지(Blocks test)가 열려 그 표에 글이 들어갔다. 파일을 바깥에서 되돌렸다(바깥 편집 확인으로 씀). 다시 해 보니 팔레트는 "New Page" 명령을 첫 줄에 보였고, 처음의 원인은 찾지 못했다.
- NOTICE·LICENSES에 남은 웹 번들 관련 항목(React, TipTap, 글꼴 등)은 라이선스가 사용자 결정이라 손대지 않았다.
