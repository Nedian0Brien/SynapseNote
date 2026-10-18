---
title: 1단계 페이지 관리
slug: phase1-page-management
stage: spec
status: accepted
author: Dennis Park
date: 2026-10-19
---

# 1단계 페이지 관리

상위 intent: `intent_morrow-full-port.md`

## 요구사항

1. 네이티브 화면은 Swift 프로토콜 `WorkspaceService`(워크스페이스 상태와 `WorkspaceCommand` 실행)를 거쳐 데이터를 다룬다. 지금은 `EditorController`가 Morrow 명령 JSON을 웹 세션으로 보내 구현한다. 나중에 Swift 코어로 바꿀 때는 이 프로토콜 뒤만 바꾼다.
2. `WorkspaceCommand`: 만들기, 휴지통, 이동(부모·순서), 즐겨찾기, 아이콘, 복제, 복원, 영구 삭제, 휴지통 비우기. Morrow `applyCommand`가 검증하고, 거부되면 Morrow 토스트가 뜬다.
3. 사이드바
   - 즐겨찾기 섹션은 제목 순서(Morrow와 같음)로 둔다.
   - 페이지 트리는 펼치기·접기를 할 수 있고, 펼친 상태는 vault마다 기억한다.
   - 맨 아래에 휴지통 행(개수 표시)을 둔다.
4. 드래그 앤 드롭: 행의 위쪽 25%는 앞, 아래쪽 25%는 뒤, 가운데는 안으로 놓는다(Morrow `zoneFor`와 같은 방식). 자기 자신이나 하위 페이지 안으로는 놓을 수 없다. 형제 순서는 Morrow `onDrop`과 같이 계산한다.
5. 행 메뉴: 하위 페이지 추가, 아이콘, 즐겨찾기, 복제, Move to…, Finder에서 보기(macOS), 휴지통으로.
6. Move to…: 옮길 수 있는 부모(자기와 하위·휴지통 페이지 제외)와 "최상위"를 트리로 보여 준다.
7. 아이콘
   - 이모지 선택 화면은 `emojibase-data/en/compact.json`을 그룹별로 보여 주고, 이름·태그로 찾을 수 있으며, "Remove Icon"으로 아이콘을 지운다.
   - 이모지는 번들의 Fluent 이미지로 그린다. 파일 이름을 찾는 규칙은 Morrow `emojiSrc`와 같다.
   - 페이지 머리의 아이콘이나 "Add icon"을 누르면 같은 선택 화면이 열린다.
8. 휴지통 화면: 휴지통에 직접 보낸 페이지 목록, 복원, 영구 삭제(하위 페이지 수를 알리는 확인), 휴지통 비우기(확인).
9. Finder에서 보기: 웹 세션의 `pathOf`로 파일 경로를 얻어 `NSWorkspace.activateFileViewerSelecting`.
10. vault 전환
    - 최근 vault는 5개까지 기억한다.
    - macOS: File 메뉴의 Open Folder…(⇧⌘O), Open Recent, New Folder….
    - iOS·iPadOS: 사이드바 툴바 메뉴.
    - 바꿀 때 저장 큐를 비우고, 감시를 멈추고, 웹 페이지를 다시 불러와 새 vault를 연다.
11. 웹 프로세스 복구: `WebPage.navigations`가 `webContentProcessTerminated`로 끝나면 페이지를 다시 불러오고, vault와 선택한 페이지를 다시 연다.

## 설계

- 메시지(앱→웹): `command{command}`(Morrow Command JSON 그대로)
- 메시지(웹→앱): `chooseIcon{pageId}`
- 웹 함수: `window.synapse.pathOf(id)`
- Swift 파일
  - `WorkspaceService.swift`: 프로토콜과 `WorkspaceCommand`, Morrow JSON 인코딩
  - `Workspace.swift`: 트리 계산(자식, 하위, 즐겨찾기, 휴지통, 이동 가능 여부)
  - `Sidebar.swift`: 트리 행, 드롭 위치 계산, 메뉴
  - `MoveSheet.swift`
  - `EmojiPicker.swift`(`EmojiCatalog`, `EmojiImage`)
  - `TrashView.swift`
  - `VaultLocation` 최근 목록
- 이모지 데이터: Vite 플러그인이 `emojibase-data/en/compact.json`에서 필요한 필드(unicode, label, group, order, tags)만 골라 `emoji-index.json`으로 내보낸다.
- 버린 대안
  - Morrow `operations.ts`의 확인 대화상자를 웹에서 띄우기: 확인은 네이티브 대화상자로 한다.
  - Swift가 자체 이동 규칙 쓰기: 검증과 순서 계산은 Morrow `applyCommand`가 단일 기준이다.

## 열린 질문

없음
