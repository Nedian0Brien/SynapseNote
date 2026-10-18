---
title: WKWebView 에디터 시제품
slug: webview-editor-spike
stage: spec
status: accepted
author: Dennis Park
date: 2026-10-18
---

# WKWebView 에디터 시제품

## 요구사항

1. `xcodegen generate` 후 `SynapseNote` 스킴이 macOS 26, iOS 26 시뮬레이터(iPhone, iPad) 대상으로 빌드된다. 번들 ID는 `com.synapsenote.native`.
2. 앱 화면은 왼쪽에 문서 목록, 오른쪽에 에디터다. 목록은 Morrow 첫 실행 가이드의 페이지들이고, 선택한 페이지의 `DocNode`가 에디터에 표시된다.
3. 편집이 멈추고 250ms 뒤 `DocNode` JSON이 Swift로 돌아와 메모리의 페이지에 반영된다. 다른 페이지로 갔다가 돌아오면 편집 결과가 그대로 보인다. 파일 저장은 하지 않는다.
4. 에디터 웹 번들은 앱 번들 안의 파일만 읽는다. 원격 요청은 Content-Security-Policy로 막고, 브리지는 정해진 메시지 종류 외에는 무시한다.
5. 가이드 문서에 들어 있는 노드 종류가 모두 렌더된다(`KNOWN_NODE_TYPES` 기준). 렌더되지 않은 노드는 검증 문서에 적는다.
6. 시스템 라이트·다크 모드를 따라 에디터 테마가 바뀐다.
7. 검증 문서 `docs/verification/webview-editor-spike.md`에 intent의 확인 항목별로 플랫폼마다 결과(통과, 실패, 미확인)와 재현 절차가 있다.
8. 앱 화면과 웹 번들 어디에도 "Morrow" 이름이 보이지 않는다. 저장소에는 `NOTICE`와 Morrow의 LICENSE가 있다.

## 설계

**Morrow 코드 반입.** `web/vendor/morrow`에 git submodule로 두고 `a2daae1`에 고정한다. Morrow 파일은 수정하지 않는다.

**웹 에디터(`web/`).** Vite + React 프로젝트. 의존성 버전은 Morrow의 `package-lock.json`을 기준으로 같은 버전을 쓴다. Morrow 파일이 `react`를 import하면 상위 폴더를 따라 `web/node_modules`에서 찾으므로, React 사본이 하나만 생긴다.
- 진입점 `web/src/main.tsx`가 Morrow의 `createExtensions`, `EditorMenus`, `FindBar`, `SourceDialog`를 써서 에디터를 띄운다. 구성은 Morrow `PageEditor.tsx`와 같게 하고, 앱 상태 접근 부분만 브리지 호출로 바꾼다.
- 에디터가 import하는 Morrow 앱 모듈 중 Electron이나 Morrow 앱 상태에 묶인 것은 Vite `resolveId` 플러그인으로 `web/src/host/` 아래 구현으로 바꿔 끼운다. 대상은 `app/router`, `app/actions`, `app/platform/attachments`, `app/platform/desktop`, `app/platform/files`. `app/ui.ts`와 `components/*`는 그대로 쓴다. `app/workspace`, `app/operations`, `storage/`, `electron/`은 에디터가 직접 import하지 않으므로 바꿔 끼우지 않고, 번들에 들어오면 빌드가 실패하게 막는다. host 모듈이 원본과 같은 시그니처인지는 `host/contract.ts`가 컴파일 단계에서 확인한다.
- TipTap 확장의 콜백(`getTitle`, `findPages`, `resolveTarget` 등)은 동기 함수다. 그래서 Swift가 페이지를 열 때 워크스페이스 전체(`pages`, `docs`)를 JS로 보내고, JS 쪽 host 모듈이 그 사본에서 바로 답한다. 새 페이지 생성은 JS가 id를 만들고 Swift에 알린다.
- 빌드 결과는 `App/Resources/Editor/`에 나온다. 이모지 이미지와 폰트, KaTeX, Mermaid 모두 이 안에 들어간다.
- 가이드 문서는 빌드 스크립트가 Morrow `sampleCommands`를 `applyCommand`로 실행해 `App/Resources/Editor/sample-guide.json`으로 만든다. 이때 "Morrow" 이름을 "SynapseNote"로 바꾸고, 가이드에 없는 노드(`blockMath`, `image`, `fileAttachment`, `hardBreak`, `rawBlock`, `link` 마크)와 한글 IME 확인용 블록을 담은 "에디터 검증" 페이지를 더한다.

**네이티브 앱(`App/`).** XcodeGen `project.yml`, 단일 멀티플랫폼 타깃(`supportedDestinations: [iOS, macOS]`).
- `EditorWebView`: `NSViewRepresentable`/`UIViewRepresentable`로 `WKWebView`를 감싼다.
- `EditorSchemeHandler`: `WKURLSchemeHandler`로 `synapse-editor://app/` 요청을 번들 파일로 응답한다. 번들 밖 경로와 `..`는 거부한다.
- `EditorBridge`: JS→Swift는 `WKScriptMessageHandler`, Swift→JS는 `callAsyncJavaScript`. 메시지는 `Codable` enum(`ready`, `docChanged`, `openPage`, `createPage`, `openExternal`, `log`).
- `DocNode`: 임의 JSON을 담는 `Codable` 값 타입. 키 순서를 바꾸지 않고 왕복한다.
- 문서 목록 상태는 `@Observable` 모델 하나가 가진다.

**버린 대안.**
- Morrow 소스를 복사해 직접 수정: 원본 변경을 따라가기 어렵고 수정 범위가 흐려진다.
- `loadFileURL`로 `file://` 로드: Vite가 내는 `type="module"` 스크립트가 `file://`에서 CORS 제한에 걸린다.
- 에디터 콜백을 매번 Swift에 비동기로 묻기: TipTap 확장 API가 동기 반환을 요구한다.

## 범위 밖

intent의 범위 밖과 같다. 추가로, 이미지·파일 첨부 삽입은 저장소가 없어서 이번에는 동작하지 않고, 슬래시 메뉴에서 고르면 vault 폴더가 열려야 추가할 수 있다는 안내가 뜬다(Morrow UI와 같이 영어 문구). 데이터베이스·캔버스 임베드는 표시하지 않는다. 둘 다 검증 문서에 적는다.

## 열린 질문

없음
