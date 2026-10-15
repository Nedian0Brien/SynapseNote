---
title: macOS 앱 첫 판 — P0 편집 규칙 번들과 입력 성능
slug: macos-app
stage: plan
status: accepted
intent: .intent/intent_macos-app.md
spec: .intent/spec_macos-app.md
date: 2026-10-16
---

# P0 — 편집 규칙 번들, SynapseKit, 입력 성능 측정 (R1–R3)

서버 없이 끝난다. 이 단계의 목적은 "core를 JavaScriptCore로 돌려 p95 16ms를 지키는가"를 앱 안에서 확인하는 것이다.

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/core/src/editing-model/native-session.ts` (새) | `NativeEditorSession`: 원문·커서 상태·`IncrementalLayout`을 JS 쪽에 두고, `select`·`edit(actions)`·`applyRemote(changes)`가 원문 변경과 다시 그릴 범위의 레이아웃만 JSON으로 돌려준다(키마다 원문 전체를 넘기지 않는다) |
| `packages/core/src/editing-model/native-session.test.ts` (새) | 입력·dirty 범위 레이아웃·원격 변경 선택 이동·snapshot |
| `packages/core/src/editing-model/native-entry.ts` (새) | `globalThis.SynapseEditing`에 `createSession`·`computeLayout`을 붙인다 |
| `packages/core/scripts/build-native-bundle.ts` (새) | `Bun.build`(browser, iife, minify). `decode-named-character-reference`를 `index.js`로 바꾸는 plugin. 결과를 `native/SynapseKit/Sources/EditingCore/Resources/synapsenote-editing.js`에 쓴다 |
| `packages/core/package.json` | `build:native-bundle` 스크립트 |
| `.gitignore` | `native/**/Resources/synapsenote-editing.js`, `native/**/*.xcodeproj`, `native/build/`, `native/**/.build/` |
| `native/README.md` (새) | 준비물(Xcode 27, xcodegen, bun)과 빌드 순서 |
| `native/SynapseKit/Package.swift` (새) | Swift 6, macOS 26·iOS 26, 타깃 `EditingCore`, `EditingCoreTests` |
| `native/SynapseKit/Sources/EditingCore/EditingRuntime.swift` (새) | `JSContext` 생성, `console` 주입, 번들 로드, 예외를 Swift 오류로 |
| `native/SynapseKit/Sources/EditingCore/EditorSession.swift` (새) | `NativeEditorSession` 감싸기와 `Layout`·`EditAction`·결과의 Swift 타입(`NSRange`) |
| `native/SynapseKit/Tests/EditingCoreTests/FixtureTests.swift` (새) | core `fixtures/hide.json`·`edit.json`을 읽어 `parseMarked`·`parseCursor`와 같은 규칙으로 비교 |
| `native/macOS/project.yml` (새) | 앱 타깃 `SynapseNote`(macOS 26, App Sandbox, SynapseKit 의존), 빌드 전 단계에서 번들 생성 |
| `native/macOS/App/SynapseNoteApp.swift` (새) | SwiftUI `App`, 창 하나에 편집기. P0은 앱 번들 안 시험 문서를 연다 |
| `native/macOS/App/Editor/SourceTextView.swift` (새) | `NSTextView`(TextKit 2) 하위 클래스. 키 입력·IME 확정·붙여넣기를 `EditAction`으로 바꿔 `EditorSession`에 넘기고, 결과를 `NSTextContentStorage.performEditingTransaction` 안에서 저장소에 쓴다 |
| `native/macOS/App/Editor/LiveStyler.swift` (새) | `Layout`의 숨김 범위를 0.01pt 글꼴·투명색으로, marks를 굵게·기울임·코드 속성으로. 바뀐 블록만 다시 칠한다 |
| `native/macOS/App/Editor/EditorView.swift` (새) | `NSViewRepresentable` |
| `native/macOS/App/Perf/KeystrokeProbe.swift` (새) | `-perfSeconds N -caretLine L` 인자로 초당 10회 입력, 단계별 시간(편집 규칙·레이아웃·화면 반영)을 앱 컨테이너 파일에 쓴다 |
| `native/macOS/App/Resources/sample.md` (새) | 앱이 여는 시험 문서(스파이크 fixture). 5,000줄 측정 문서는 `KeystrokeProbe.swift`의 `LargeDocument`가 실행 때 같은 규칙(스파이크 `gen-fixture.ts`)으로 만든다 |
| `native/macOS/App/SynapseNote.entitlements` (새) | App Sandbox, 네트워크 클라이언트, `com.apple.security.cs.allow-jit`(없으면 `JSContext`가 JIT 없이 돌아 키 입력이 약 50ms 걸린다) |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `native-entry.ts`와 번들 스크립트 — `bun run --filter @nedian0brien/synapsenote-core build:native-bundle` 후 `jsc`로 로드해 `computeLayout` 결과가 나온다.
2. SynapseKit `EditingCore`와 fixture 테스트 — `swift test --package-path native/SynapseKit`에서 hide 42·edit 125건이 통과한다.
3. macOS 앱 골격과 편집기 — `xcodegen` 후 `xcodebuild -scheme SynapseNote build`, 앱을 열어 기호가 숨고 입력이 원문에 맞게 들어간다.
4. 입력 성능 측정 — Release 빌드로 `-perfSeconds 60 -caretLine 2500`을 돌려 p50·p95·최대를 보고한다. p95가 16ms를 넘으면 단계별 시간과 함께 멈추고 보고한다.
5. 맥 `~/Applications`에 설치해 띄우고 사용자 확인을 받는다.

## 가장 위험한 단계

4번. App Sandbox·hardened runtime 안의 `JSContext`가 JIT 없이 돌면 jsc 셸 측정(문단 p95 1ms)보다 느릴 수 있다. 또 `IncrementalLayout.update`와
`applyActions`가 원문 전체 문자열을 받으므로 237k 글자를 키마다 JS로 넘기는 비용이 있다. 넘으면 `applyActionsInWindow`·블록 단위 전달로 줄이고,
그래도 넘으면 사용자에게 선택지를 가져온다. 되돌림: P0은 새 디렉터리와 core 스크립트만 더하므로 브랜치 커밋을 되돌리면 된다.

## 검증

```
bun run --filter @nedian0brien/synapsenote-core build:native-bundle
bun run test:file -- packages/core/src/editing-model/fixtures.test.ts
swift test --package-path native/SynapseKit
(cd native/macOS && xcodegen generate) && xcodebuild -project native/macOS/SynapseNote.xcodeproj -scheme SynapseNote -configuration Release build
```

화면: 앱에서 시험 문서를 열어 굵게·링크·목록·체크박스 기호가 숨는지, 입력·삭제·Enter가 SPEC대로 원문을 바꾸는지 본다.

## 결과 (2026-10-16)

- 테스트: core `fixtures.test.ts`·`native-session.test.ts` 13개 통과, SynapseKit `swift test` 5개 통과(hide 42·edit 125건을 세션 경로로 실행).
- 입력 성능(R3): Release 빌드, App Sandbox·hardened runtime, 5,000줄 문서 2,500번째 줄, 초당 10회 60초 600회.

| 단계 | p50 | p95 | 최대 |
|---|---|---|---|
| 전체(키 → 화면 반영) | 13.91 | **15.84** | 27.59 |
| 편집 규칙(JavaScriptCore) | 8.83 | 10.27 | 18.72 |
| 저장소 반영·다시 칠하기 | 3.59 | 4.76 | 7.62 |
| 레이아웃·그리기 | 1.30 | 1.92 | 3.88 |

- `allow-jit` 없이 잰 값은 전체 p95 56.93ms였다. hardened runtime을 끄거나 App Sandbox를 꺼도 같았고(p95 55·54ms), `JSContext` 안에서만 200회 편집을 돌려도
  1회 45ms였다. 같은 번들이 `jsc` 셸(`allow-jit` 보유)에서는 p95 4ms다. JIT 허용이 원인이다.
- 16ms 기준은 통과했지만 여유가 0.16ms다. 편집 규칙 단계가 jsc 셸(4ms)보다 6ms 느린 이유는 아직 나누어 재지 않았다. 위젯이 늘면 다시 잰다.
