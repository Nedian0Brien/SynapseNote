---
title: WKWebView 에디터 시제품
slug: webview-editor-spike
stage: plan
status: accepted
author: Dennis Park
date: 2026-10-18
---

# WKWebView 에디터 시제품

## 바뀌는 파일

새로 만드는 파일 (기존 파일 없음)

- `.gitignore`, `.gitmodules`, `NOTICE`, `LICENSES/Morrow-Apache-2.0.txt`, `README.md`
- `web/vendor/morrow` — submodule, `a2daae1`
- `web/package.json`, `web/package-lock.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`
- `web/src/main.tsx`, `web/src/EditorApp.tsx` — 에디터 진입점과 구성
- `web/src/bridge.ts` — JS↔Swift 메시지 타입과 송수신
- `web/src/host/{router,actions,attachments,desktop,files}.ts` — 바꿔 끼우는 Morrow 앱 모듈
- `web/src/host/contract.ts` — host 모듈과 원본의 시그니처 일치 확인
- `web/src/host/pages.ts` — Swift가 보낸 워크스페이스 사본
- `web/src/editor.css` — 에디터 단독 화면 레이아웃
- `web/src/bridge.test.ts`, `web/src/host/host.test.ts` — bridge와 host 단위 테스트
- `web/scripts/sample-guide.mjs` — 가이드와 검증 페이지 JSON 생성
- `scripts/build-editor.sh` — Xcode 빌드 단계에서 웹 번들 생성
- `project.yml`
- `App/Sources/{SynapseNoteApp,ContentView,PageStore,DocNode,EditorWebView,EditorBridge,EditorSchemeHandler}.swift`
- `App/Tests/{DocNodeTests,EditorBridgeTests,EditorSchemeHandlerTests}.swift`
- `docs/verification/webview-editor-spike.md`

## 순서

1. 저장소 골격과 submodule, NOTICE·LICENSE. 확인: `git submodule status`가 `a2daae1`.
2. `web/` 의존성 설치와 host 모듈, 진입점. 확인: `npm --prefix web run typecheck`, `npm --prefix web test`.
3. 웹 번들과 가이드 JSON 빌드. 확인: `npm --prefix web run build` 후 `App/Resources/Editor/index.html`, `sample-guide.json` 존재. 번들에 `http://`, `https://` 원격 로드 코드가 없는지 grep으로 본다(라이선스 문자열 제외).
4. Swift 앱, 스킴 핸들러, 브리지, 테스트. 확인: `xcodegen generate`, macOS `xcodebuild test`.
5. iOS·iPadOS 시뮬레이터 빌드와 실행. 확인: 시뮬레이터 스크린샷에서 가이드 문서가 렌더된다.
6. 확인 항목 검증과 결과 기록. macOS는 앱을 직접 조작하고, 시뮬레이터는 XcodeBuildMCP로 조작한다. 한글 IME처럼 자동 조작으로 판단할 수 없는 항목은 미확인으로 두고 사용자 확인 절차를 적는다.
7. 커밋·푸시. 원격 저장소가 없으면 푸시 대상을 사용자에게 묻는다.

## 가장 위험한 단계

2단계. Morrow 에디터가 바꿔 끼운 host 모듈 외의 앱 상태(예: `useWorkspace`를 쓰는 컴포넌트)를 간접적으로 import하면 Electron 코드나 IndexedDB 저장소가 번들에 딸려 들어온다. `vite.config.ts`의 `hostModules` 플러그인이 이런 import를 만나면 빌드를 실패시킨다. 바꿔 끼울 모듈이 늘어나면 이 문서와 spec을 같은 커밋에서 고친다.

되돌리기: 이 브랜치의 커밋만 되돌리면 된다. 기존 저장소에 닿는 변경이 없다.

## 검증 명령

```
git submodule status
npm --prefix web ci
npm --prefix web run typecheck
npm --prefix web test
npm --prefix web run build
xcodegen generate
xcodebuild -scheme SynapseNote -destination 'platform=macOS' test
xcodebuild -scheme SynapseNote -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' build
xcodebuild -scheme SynapseNote -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5)' build
```

## 자기 점검

- 깨질 수 있는 것: Morrow CSS가 전체 앱 레이아웃을 전제하고 있어 에디터 단독 화면에서 여백이나 메뉴 위치가 어긋날 수 있다. 6단계에서 스크린샷으로 확인한다.
- 버린 방법과의 일치: spec의 버린 대안(소스 복사, `file://` 로드, 비동기 콜백)을 쓰지 않는다.
