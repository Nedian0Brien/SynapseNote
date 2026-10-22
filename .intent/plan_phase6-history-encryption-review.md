# Plan: 6단계 페이지 히스토리·암호화 페이지·플래시카드

spec: `spec_phase6-history-encryption-review.md`. 브랜치 `feat/history`(기준 `feat/canvas`), 워크트리 `.worktree/history`.

## 순서

1. **웹** (`main.tsx`, `bridge.ts`, `queries.ts`, `review.ts` 신규)
   - 받는 메시지
     - `openHistory {pageId}`: Morrow `openDialog({kind:'history'})`로 열고, `Host`가 `HistoryDialog`를 그린다.
     - `lockPage {pageId}`, `unprotectPage {pageId}`, `gradeCard {cardId, grade}`
   - 호스트 호출(답을 기다림): `encryption(action, params)`
     - action은 protect·unlock이다.
     - `{ok, error}`를 JSON으로 돌려준다.
   - 워크스페이스 메시지에 `locked`(세션의 unreadable 중 암호화된 페이지)를 더한다.
   - 조회 추가
     - `review`: 전체 카드, 마감 카드 id, 기록 유무
     - `counts`: `dueCards` 수를 더한다.
   - `review.ts`: 복습 기록을 불러오고, 채점하고, 0.8초 뒤 저장하며, flush를 지원한다. `flush()`에 포함한다.
   - 테스트: `queries.test.ts`(review), `review.test.ts`(채점과 flush, 메모리 저장소), `bridge.test.ts`
2. **Swift 데이터**
   - `EditorCommand`·`EditorEvent` 변경, `Workspace.locked`
   - `WorkspaceQuery.review`, `ReviewData`·`Card` 타입
   - `Destination.review`
   - 컨트롤러: `encrypt`, `unlock`(async, 결과 반환), `lock`, `removeEncryption`, `openHistory`, `grade`
3. **화면**
   - `EncryptSheet.swift`, `UnlockView.swift`, `ReviewView.swift` 신규
   - `ContentView`: 잠긴 페이지 겹침, 암호화 시트, review 목적지
   - `Sidebar`(Review 행과 수, 페이지 메뉴 항목), `TabStrip`, `AppAction`(Page History, Review Flashcards, Encrypt, Lock, Remove Encryption)
4. **검증**: 테스트, iPad·iPhone·macOS 조작, 검증 문서, 로드맵, 푸시, PR #7(기준 `feat/canvas`)
