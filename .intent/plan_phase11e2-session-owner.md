# Plan: 11e-2 상태 소유를 Swift로, 웹 제거

상위: `spec_phase11e-web-removal.md`의 11e-2. 브랜치 `feat/swift-session-owner`(기준 `feat/swift-operations`).

## 순서(각 단계가 빌드되고 시험이 통과한다)

1. **환영 안내 자료**: `web/scripts/guide-resource.ts`가 `SAMPLE_RENAMES`를 `sample.ts` 원문에 적용해 실행한다(rolldown 플러그인, vite가 하던 것과 같은 바꾸기, 맞지 않으면 멈춤). id는 순번 자리표, `now`는 큰 기준값으로 실행해 `day(N)` 문자열은 날짜 차이 자리표로, `now - k` 숫자는 밀리초 차이 자리표로 바꿔 `App/Resources/WelcomeGuide.json`에 쓴다. Swift `WelcomeGuide.commands(newId:now:)`가 지금 시각과 지역 날짜(`Daily.dateKey`)로 채운다. 비교 자료 `guide.json`: node `sampleCommands(counter, FIXED_NOW)`(바꾸기 적용, TZ=UTC)와 Swift 결과가 같음. `guide.test.ts`의 세 검사를 Swift로 옮긴다.
2. **SessionHost가 주인**: `begin(guide:)`이 열고, 첫 실행이면 안내를 넣고 저장한 뒤 `markInitialized`(Morrow 순서), 읽지 못한 항목 수를 알린다. 저장 타이머는 세션 큐의 `DispatchWorkItem`(`SaveTimer`, 300ms, 재시도는 `SaveQueue`). 바뀔 때마다 16ms로 묶어 화면에 보고: 페이지(`PageMeta`), 잠긴 페이지(`unreadable ∩ encrypted`), 저장 상태. 직접 호출: `perform`/`performAll`(실패 사유 반환), `protect`/`unlock`/`lock`/`unprotect`, `restore(snapshot)`, `grade(cardId, grade)`(800ms 뒤 `review.json`, 닫거나 저장할 때 바로), `flush`, `changed(paths)` → `session.receive`. RPC·웹 대기(`awaiting`, `held`, `deferred`, `webReady`)·resync를 지운다. `SessionHostTests`를 새 API로 다시 쓴다.
3. **EditorController 연결**: `Workspace`를 `PageMeta`로 만든다(`PageInfo.init(PageMeta)`). 첫 보고에서 `.ready`. 명령 실패는 Morrow `run`처럼 오류 알림. 바깥 편집은 열린 편집기·캔버스 등(`waitingSaves`)을 먼저 세션에 넣은 뒤 읽는다(Morrow `beforeExternal = commitEditors`). 저장됨으로 바뀌면 `sync.savesSettled()`, 오류는 `.failed`. 보여 줄 페이지가 바뀌면 `page.markOpened`(캔버스 제외). 원문 보기는 컨트롤러 상태. 기록 복원·암호화·복습 평가는 host 직접, Morrow 알림 문구. `flush` 순서: 편집기 → host(세션, 복습) → 자동 백업.
4. **제거**: `WebPage`·`EditorBridge`·`VaultRPC`·`EditorSchemeHandler`·`FileInputPresenter`·`StateMirror`·`CoreDualRun`, 웹 프로세스 종료 복구, DEBUG 비교, `PDFExporter`의 스냅숏 경로와 편집기 scheme, `PageScreen.web`(→ `.none`과 `.invalid(plain:)`), `-nativeEditor`, 테마·설정 메시지, 웹 알림, 사용자 CSS 상태와 설정 화면, `ContentView`의 `WebView`·`fileRequest`. `project.yml`의 빌드 전 스크립트·`App/Resources/Editor`·`ENABLE_USER_SCRIPT_SANDBOXING: NO`, `scripts/build-editor.sh`, `.gitignore` 줄. 시험: `EditorBridgeTests`, `EditorSchemeHandlerTests`, `StateMirrorTests`, `CoreDualRunTests`, 스냅숏 PDF 시험.
5. **web/ 정리**: 앱 페이지(`main.tsx`, `bridge.ts`, `EditorApp.tsx`, `Page*.tsx`, `Subpages.tsx`, `host/`, `review.ts`, `stateDelta.ts`, `editor.css`, `index.html`)와 그 시험, `build` 스크립트를 지운다. `queries.ts`(core-fixtures가 씀), `guide.test.ts`, vite 바꾸기 플러그인(vitest가 씀)은 둔다. core-fixtures의 mirror 부분과 `mirror.json`을 뺀다. 문서의 node 빌드 안내를 고친다.
6. **확인과 문서**: 아래 표, `docs/verification/phase11e2-session-owner.md`, roadmap, PR.

## 확인

| 무엇 | 방법 |
|---|---|
| 앱 빌드에 node가 필요 없음 | `App/Resources/Editor`가 없는 상태에서 PATH에서 node를 뺀 `xcodebuild` |
| 시험 | macOS `xcodebuild test`, `npm --prefix web run typecheck`, `npm --prefix web test` |
| 환영 안내 | 비교 자료 같음, 새 vault에 안내가 한 번만 |
| 11c 시나리오(iPad, 시험 vault) | 편집, 이름 바꾸기, 이동, 휴지통·복원, 잠그기·열기, 기록 복원, 복습 평가, 첨부, 바깥 편집(열린 페이지 포함), 앱을 내렸다 올릴 때 저장 |

DEBUG 세션 비교(11c~11e-1의 기준)는 웹과 함께 없어진다. 그 자리는 위 시나리오와 비교 자료가 맡는다.

## 범위 밖

NOTICE·LICENSES의 React·TipTap·글꼴 항목 정리(라이선스는 사용자 결정, PR 참고사항에 적음). 실기기, 서명.
