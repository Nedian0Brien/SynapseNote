---
title: 1단계 페이지 관리
slug: phase1-page-management
stage: plan
status: accepted
author: Dennis Park
date: 2026-10-19
---

# 1단계 페이지 관리

## 바뀌는 파일

새로 만드는 파일
- `App/Sources/{WorkspaceService,Sidebar,MoveSheet,EmojiPicker,TrashView}.swift`
- `App/Tests/{WorkspaceServiceTests,EmojiCatalogTests}.swift`
- `docs/verification/phase1-page-management.md`

고치는 파일
- `App/Sources/{Workspace,EditorController,EditorBridge,ContentView,SynapseNoteApp,VaultLocation}.swift`
- `App/Tests/{WorkspaceTests,EditorBridgeTests}.swift`
- `web/src/{bridge.ts,main.tsx,EditorApp.tsx,bridge.test.ts}`, `web/vite.config.ts`(이모지 목록)
- `docs/roadmap.md`(상태)

## 순서

1. Swift 모델·명령(`Workspace` 트리, `WorkspaceService`) + 테스트. 확인: `xcodebuild test`
2. 웹: `command` 처리, `chooseIcon`, `pathOf`, 머리 아이콘 버튼, 이모지 목록 생성. 확인: typecheck, test, build
3. Swift 화면: 사이드바(즐겨찾기, 펼치기, 드래그, 메뉴, 휴지통 행), Move 시트, 이모지 선택, 휴지통 화면, Finder 보기. 확인: macOS·iOS 빌드
4. vault 최근 목록·전환, 웹 프로세스 복구. 확인: 빌드, 단위 테스트
5. 검증: macOS(메뉴·클릭으로 가능한 것), iPad 시뮬레이터(터치). 시험 vault에서 이동·복원·영구 삭제 후 파일 위치와 `.morrow/workspace.json` 확인
6. 검증 문서, 로드맵 상태, 커밋·푸시·PR

## 가장 위험한 단계

영구 삭제와 이동. 파일이 잘못 옮겨지거나 지워질 수 있다. 판단과 파일 작업은 Morrow 코드와 단위 테스트를 거친 `VaultFileSystem`이 하고, Swift는 명령만 보낸다. 시험 vault로만 검증한다.

## 검증 명령

```
npm --prefix web run typecheck && npm --prefix web test && npm --prefix web run build
xcodebuild -scheme SynapseNote -destination 'platform=macOS' test
xcodebuild -scheme SynapseNote -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5)' build
```
