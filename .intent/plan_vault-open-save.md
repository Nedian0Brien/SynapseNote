---
title: vault 폴더 열기와 Markdown 저장
slug: vault-open-save
stage: plan
status: accepted
author: Dennis Park
date: 2026-10-19
---

# vault 폴더 열기와 Markdown 저장

## 바뀌는 파일

새로 만드는 파일
- `App/Sources/VaultPaths.swift` — 경로 검사, 숨김·페이지 판별(`vault.cts`와 같은 규칙)
- `App/Sources/VaultFileSystem.swift` — scan, apply, read/write, list, 파일 조정
- `App/Sources/VaultWatcher.swift` — FSEvents(macOS), `NSFilePresenter`(iOS)
- `App/Sources/VaultLocation.swift` — bookmark 저장·복원, 폴더 만들기
- `App/Sources/VaultSchemeHandler.swift` — `synapse-vault://` 제공
- `App/Sources/VaultChooserView.swift` — 첫 화면
- `App/Sources/FileInputPresenter.swift` — `DialogPresenting` 파일 선택
- `App/Tests/VaultPathsTests.swift`, `App/Tests/VaultFileSystemTests.swift`
- `web/src/host/vaultBridge.ts`, `web/src/host/rpc.ts`, `web/src/host/rpc.test.ts`
- `docs/verification/vault-open-save.md`

고치는 파일
- `App/Sources/{EditorBridge,EditorController,ContentView,SynapseNoteApp,Workspace}.swift`
- `App/Tests/{EditorBridgeTests,WorkspaceTests}.swift`
- `web/src/{main.tsx,EditorApp.tsx,bridge.ts,bridge.test.ts}`, `web/src/host/{router,contract}.ts`
- `web/vite.config.ts`(바꿔 끼우는 모듈·금지 목록), `web/index.html`(CSP), `web/package.json`(빌드에서 가이드 생성 제거)
- `project.yml`(권한, Info.plist 키, 엔타이틀먼트 파일)
- `README.md`

지우는 파일
- `web/src/host/{attachments,files,pages}.ts`, `web/scripts/sample-guide.mjs`

## 순서

1. Swift `VaultPaths`, `VaultFileSystem`과 테스트. 확인: macOS `xcodebuild test`에서 경로 검사, 스캔 규칙, `expect` 충돌, 대소문자 rename, `createFile` 비덮어쓰기, `delete` 제한, UTF-8 바이트 보존 테스트 통과.
2. 웹 RPC와 `vaultBridge.ts`, 세션 부팅, 모듈 교체 목록 변경. 확인: `npm --prefix web run typecheck`, `npm --prefix web test`, `npm --prefix web run build`.
3. Swift 메시지 확장, `EditorController` 교체, `VaultLocation`, 첫 화면, 사이드바 동작, 저장 상태, 종료 시 flush. 확인: macOS 빌드, 단위 테스트.
4. `VaultWatcher`, `VaultSchemeHandler`, 파일 선택. 확인: 시험 vault에서 외부 편집 반영, 이미지 표시.
5. macOS·iPad 시뮬레이터 검증. 시험 vault(Obsidian 형식: 하위 폴더, 위키 링크, 콜아웃, frontmatter, 이미지)를 임시 폴더에 만들어 연다. 편집 전후 모든 파일의 SHA-256을 비교해 편집한 파일만 바뀌었는지 본다.
6. 검증 문서, README, 커밋·푸시.

## 가장 위험한 단계

3·4단계의 파일 쓰기. 경로 검사나 rename 순서가 틀리면 사용자 폴더의 파일을 덮어쓰거나 잃을 수 있다. 1단계 테스트를 먼저 통과시키고, 5단계는 사용자 폴더가 아닌 임시 폴더의 시험 vault로만 한다.

되돌리기: 이 브랜치 커밋만 되돌리면 된다. 사용자 vault에 남는 것은 Morrow와 같은 `.morrow/` 폴더뿐이다.

## 검증 명령

```
npm --prefix web ci
npm --prefix web run typecheck
npm --prefix web test
npm --prefix web run build
xcodegen generate
xcodebuild -scheme SynapseNote -destination 'platform=macOS' test
xcodebuild -scheme SynapseNote -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5)' build
```

## 자기 점검

- 깨질 수 있는 것: iCloud Drive의 내려받지 않은 파일(`.icloud` 자리표시자)은 스캔에서 숨김 파일로 빠진다. 이번 범위에서 내려받기를 요청하지 않고 검증 문서에 적는다.
- `WorkspaceSession`이 `storage/repository.ts`를 통해 IndexedDB 코드(`idb`)를 번들에 끌어온다. 쓰이지 않지만 크기가 늘어난다. 금지 목록에 넣지 않고 기록만 한다.
- 버린 대안과의 일치: Swift 포팅, `NSFilePresenter` 단독 감시, `PageEditor.tsx` 원본 사용을 하지 않는다.
