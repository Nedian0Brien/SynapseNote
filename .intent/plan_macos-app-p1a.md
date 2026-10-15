---
title: macOS 앱 첫 판 — P1a 서버 동기화와 문서 목록
slug: macos-app
stage: plan
status: accepted
intent: .intent/intent_macos-app.md
spec: .intent/spec_macos-app.md
date: 2026-10-16
---

# P1a — 서버 동기화, 문서 목록, 실행 취소·찾기·메뉴 (R4–R8)

P1을 둘로 나눈다. P1a는 서버에 붙어 문서를 고르고 편집하는 흐름, P1b는 기본 블록 표시(R18: 목록 기호·체크박스·인용 막대·링크 이동·칩·IME 확인)다.

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `native/yrs-ffi/` (스파이크에서 이동) | `SpikeDoc` → `SourceDoc`. 여러 변경을 한 트랜잭션으로(`local_edits`), yrs `UndoManager`(로컬 origin만 추적, 500ms 묶음)로 `undo`·`redo`. undo·원격 변경은 delta로 돌려준다 |
| `native/yrs-patches/0001-split-surrogate-like-yjs.patch` (이동) | 서로게이트 쌍 처리 패치 |
| `native/scripts/prepare-yrs.sh`, `native/scripts/build-yrs.sh` (이동·수정) | crates.io yrs 0.28.0 검증·패치, `aarch64-apple-darwin`·`aarch64-apple-ios`·`aarch64-apple-ios-sim` xcframework와 UniFFI Swift 바인딩 생성 |
| `native/SynapseKit/Package.swift` | `YrsFFI`(binary), `SyncCore`, `ServerAPI` 타깃과 테스트 |
| `native/SynapseKit/Sources/SyncCore/` (새) | `Lib0`, `HocuspocusFrame`, `HocuspocusConnection`(문서 하나, 재연결, keepalive, stateless·awareness), `DocumentSync`(`SourceDoc` + 연결, 로컬 변경 → update, 원격 delta → `SourceChange` 순서열), `SystemChannel`(`__system__`: CC1 `files` 알림, `currentView` awareness) |
| `native/SynapseKit/Sources/ServerAPI/` (새) | `ServerClient`: `GET /api/config`, `GET /api/documents?showAll=true&dir=&depth=1`, `POST /api/create-page`, `POST /api/create-folder`. 응답 타입은 `core/src/schemas/api/document-read.ts`를 따른다 |
| `native/SynapseKit/Tests/SyncCoreTests/`, `ServerAPITests/` (새) | delta → 변경 변환, awareness 인코딩, 두 `SourceDoc` 사이 동기화·undo, documents 응답 디코딩 |
| `native/macOS/project.yml` | `SyncCore`·`ServerAPI` 의존, 빌드 전 단계에 `build-yrs.sh` 확인 |
| `native/macOS/App/AppModel.swift` (새) | 서버 주소(UserDefaults), 연결 상태, 폴더 트리, 선택 문서, `SystemChannel` |
| `native/macOS/App/Views/` (새) | `MainView`(NavigationSplitView, 새 문서·새 폴더 이름 창), `SidebarView`(폴더별 지연 로드), `DocumentPane`(편집기 + 동기화 상태), `ServerConnectView`(창과 Settings 장면의 주소 입력·확인) |
| `native/macOS/App/Editor/DocumentController.swift` (새) | 문서 하나의 `DocumentSync`와 텍스트 뷰를 잇는다. 첫 동기화 후 원문을 싣고, 원격 변경·실행 취소를 뷰에 넘기고, 뷰와 `Y.Text` 길이가 어긋나면 다시 싣는다 |
| `native/macOS/App/Editor/SourceTextView.swift` | 로컬 편집 → `Y.Text`, 원격 delta·실행 취소 → `EditorSession.applyRemote` → 저장소. 원문 보기·찾아 바꾸기처럼 텍스트 시스템이 직접 바꾼 저장소 편집도 `applyRemote`와 `Y.Text`로 보낸다(core에 새 API가 필요 없다). 실행 취소·다시 실행은 yrs `UndoManager`. 찾기는 `NSTextFinder` 찾기 막대 |
| `native/macOS/App/Editor/LiveStyler.swift` | 원문 보기에서는 숨김·위젯 없이 고정폭 원문만 그린다 |
| `native/macOS/App/Commands.swift` (새) | 새 문서 ⌘N, 새 폴더 ⇧⌘N, 원문 보기 ⇧⌘E, 찾기 ⌘F·바꾸기 ⌥⌘F, 서식·블록 단축키(웹 live `live-extension.ts:273-302`와 같게) |
| `native/macOS/App/SynapseNoteApp.swift`, `EditorView.swift` | 시험 문서 대신 서버 문서를 연다. `KeystrokeProbe`는 `-perfSeconds`일 때만 로컬 문서로 돈다 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. yrs-ffi 이동과 확장, 맥용 빌드 — `cargo test --manifest-path native/yrs-ffi/Cargo.toml`, `native/scripts/build-yrs.sh` 후 xcframework에 `macos-arm64` 조각이 있다.
2. `SyncCore`·`ServerAPI`와 테스트 — `swift test --package-path native/SynapseKit` 통과.
3. 로컬 서버를 띄워 `SyncCore`가 문서를 받고 편집을 보내는지 확인 — 앱에서 친 글자가 서버 파일에 들어가고, `/api/agent-patch`로 바꾼 내용이 앱에 보인다.
4. 앱 화면: 설정, 사이드바, 문서 열기, 새 문서·새 폴더, 연결 상태 — 맥 앱에서 직접 확인.
5. 실행 취소·다시 실행, 찾기·바꾸기, 원문 보기, 단축키 — 직접 확인. 실행 취소는 다른 기기의 편집을 되돌리지 않는다.
6. `GET /api/current-document`가 앱에서 연 문서를 돌려준다. R3을 다시 잰다(p95 16ms).

## 가장 위험한 단계

3번. 원격 delta와 로컬 편집이 섞일 때 저장소·`EditorSession`·`Y.Text` 세 곳의 원문이 어긋날 수 있다. 원격 delta를 적용한 뒤 세 원문의 길이를 비교하고,
어긋나면 `Y.Text` 원문으로 세션과 저장소를 다시 만든다(로그를 남긴다). 되돌림: 앱과 SynapseKit만 바뀌고 서버는 바뀌지 않는다.

## 검증

```
cargo test --manifest-path native/yrs-ffi/Cargo.toml
native/scripts/build-yrs.sh
bun run test:file -- packages/core/src/editing-model/native-session.test.ts
swift test --package-path native/SynapseKit
(cd native/macOS && xcodegen generate) && xcodebuild -project native/macOS/SynapseNote.xcodeproj -scheme SynapseNote -configuration Release build
```

화면: 설정에 로컬 서버 주소 입력 → 사이드바 폴더 펼치기 → 문서 열기·편집 → 웹 앱에서 같은 문서 편집이 보임 → `/api/agent-patch` 편집이 보임 →
새 문서·새 폴더 → ⌘Z·⇧⌘Z → ⌘F → ⇧⌘E 원문 보기.
