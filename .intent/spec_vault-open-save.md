---
title: vault 폴더 열기와 Markdown 저장
slug: vault-open-save
stage: spec
status: accepted
author: Dennis Park
date: 2026-10-19
---

# vault 폴더 열기와 Markdown 저장

## 요구사항

1. vault가 정해지지 않았으면 "Open Folder"와 "New Folder" 화면이 나온다.
   - Open Folder: SwiftUI `fileImporter`(폴더)로 고른다.
   - New Folder: macOS는 `~/Documents`에 `SynapseNote` 이름이 채워진 저장 대화상자로 만든다. 샌드박스 앱은 사용자가 대화상자에서 고르지 않은 `~/Documents`에 쓸 수 없다. iOS·iPadOS는 대화상자 없이 앱 문서 폴더를 vault로 쓴다.
2. 고른 폴더는 security-scoped bookmark로 저장하고 다음 실행 때 다시 연다. 폴더가 없어졌거나 권한을 잃으면 1번 화면으로 돌아가고 이유를 보여 준다.
3. 웹 쪽에서 Morrow의 `VaultRepository`와 `WorkspaceSession`을 수정 없이 쓴다. Swift는 `VaultBridge`의 동작을 Morrow `electron/vault.cts`와 같게 구현한다.
   - 경로 검사(상대 경로만, vault 밖 거부, 심볼릭 링크로 나가는 쓰기 거부)
   - 스캔 규칙(`.`으로 시작하는 경로는 최상위 `.trash`를 빼고 숨김, 임시 파일·심볼릭 링크 제외, 32MB 넘는 페이지는 기타 파일로 분류)
   - `write`의 `expect` 충돌 검사, 원자적 쓰기
   - 대소문자만 다른 `rename` 허용
   - `remove`는 시스템 휴지통, 실패하면 `.morrow/deleted/`
   - `delete`는 `.morrow/` 아래만, `rmdir`는 빈 폴더만
   - `createFile`은 덮어쓰지 않음
4. Swift는 받은 텍스트를 바이트 그대로 UTF-8로 쓴다(줄바꿈, BOM, 이모지를 바꾸지 않음). 편집하지 않은 파일은 쓰지 않는다.
5. 외부 변경 감지: macOS는 FSEvents(파일 단위 이벤트), iOS·iPadOS는 `NSFilePresenter`와 앱이 앞으로 올 때 다시 스캔. 이벤트를 150ms 단위로 모아 Morrow `VaultChange` 형식으로 보낸다.
6. 사이드바는 웹 세션의 페이지 목록으로 그린다. Swift에서 새 페이지 만들기, 휴지통으로 보내기를 할 수 있고, 에디터 위 제목 칸에서 제목을 바꾼다(Morrow `TitleField`와 같이 입력할 때마다 `page.rename`).
7. vault의 이미지·첨부 파일은 `synapse-vault://vault/<경로>`로 표시한다. 붙여넣기·끌어다 놓기·파일 선택으로 추가한 파일은 Morrow 원래 동작대로 `attachments/`에 저장한다. 웹 페이지의 파일 선택은 `WebPage.DialogPresenting.handleFileInputPrompt`로 시스템 파일 선택 화면을 띄운다.
8. 저장 상태(저장됨, 저장 중, 저장 실패)를 툴바에 표시한다. 앱이 백그라운드로 가거나 macOS에서 종료할 때 저장 큐를 비운 뒤 넘어간다(최대 3초).
9. 시험용 페이지 목록과 `sample-guide.json` 생성은 앱에서 뺀다. 새 vault에 가이드 문서를 넣지 않는다.

## 설계

**메시지.** 시제품의 `EditorEvent`/`EditorCommand`를 넓힌다.
- 웹→앱: `ready`, `rpc{id,method,params}`(VaultBridge 호출), `workspace{pages,saveStatus}`, `openPage`, `selectPage`(새 페이지를 만든 뒤 선택), `openExternal`, `log`, `vaultFailed{message}`
- 앱→웹: `openVault{name}`, `show{pageId}`, `rpcResult{id,ok,value|error}`, `vaultChanges{changes}`, `createPage{parentId}`, `trashPage{pageId}`, `theme`, `flush`(완료까지 기다림)
- 바이너리(`readBytes`, `createFile`)는 base64로 주고받는다.

**웹(`web/src`).**
- `host/vaultBridge.ts`: `VaultBridge`를 RPC로 구현한다.
- `main.tsx`: `openVault`를 받으면 `VaultRepository` → `WorkspaceSession.open` → Morrow `setSession`. 세션이 바뀔 때마다 페이지 목록과 저장 상태를 보낸다.
- 바꿔 끼우는 모듈은 `router`, `actions`, `platform/desktop` 셋으로 줄인다. `workspace`, `operations`, `platform/attachments`, `platform/files`는 Morrow 원본을 쓴다. 번들 금지 대상은 `electron/`와 `app/legacy.ts`다.
- CSP에 `synapse-vault:`(img, media, frame)를 더한다.

**네이티브(`App/Sources`).**
- `VaultLocation`: bookmark 저장·복원, 폴더 열기·만들기
- `VaultFileSystem`: VaultBridge 동작. 모든 읽기·쓰기에 `NSFileCoordinator`를 쓴다.
- `VaultWatcher`: FSEvents / `NSFilePresenter`
- `VaultSchemeHandler`: vault 파일 제공. 경로 검사는 `VaultFileSystem`과 같은 함수를 쓴다.
- `EditorController`: 메모리 워크스페이스 대신 웹 세션의 페이지 목록을 보관하고 RPC를 처리한다.
- 권한: macOS `ENABLE_USER_SELECTED_FILES = readwrite`와 `com.apple.security.files.bookmarks.app-scope`. iOS `UIFileSharingEnabled`, `LSSupportsOpeningDocumentsInPlace`.

**버린 대안.**
- Swift로 저장 계층 포팅: 사용자 결정(2026-10-19)으로 TS를 재사용한다.
- `NSFilePresenter`만으로 macOS 감시: 파일 조정을 쓰지 않는 다른 편집기의 저장을 놓친다.
- Morrow `PageEditor.tsx`를 그대로 쓰기: 데이터베이스·캔버스 임베드 컴포넌트까지 딸려 와 범위가 커진다. 시제품의 `EditorApp`을 유지한다.

## 범위 밖

intent와 같다.

## 열린 질문

없음
