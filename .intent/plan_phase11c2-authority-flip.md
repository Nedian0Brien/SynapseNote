# Plan: 11c-2 쓰기 권한 전환

spec: `spec_phase11c-swift-session.md`(11c-2 수정 포함). 브랜치 `feat/swift-writer`(기준 `feat/swift-session`), 워크트리 `.worktree/swift-writer`, PR 기준 `feat/swift-session`.

1. **Swift 호스트** (`Core/Session/SessionHost.swift`): 직렬 큐 하나가 `CoreSession`과 `VaultWriter`를 가진다. 메인에서 받은 순서대로 큐에 넣는 것이 순서 보장의 전부다. 외부 편집 읽기가 웹의 답을 기다리는 동안 `flush`와 다음 외부 읽기는 FIFO로 미룬다(같은 경로를 다시 읽지 않는다). 웹이 답하지 못하면 Swift 혼자 적용·확정한다. `FileVaultBridge`가 `VaultFileSystem`을 `VaultBridge`로 감싸고, 스캔 때 `.morrow/workspace.json`·`recent.json`은 텍스트로 읽어 키 순서를 지킨다.
2. **RPC** (`VaultRPC.swift`): `open`(세션이 있으면 그 상태), `markInitialized`, `flush`, `lock`, `unlock`, `protect`, `unprotect`, `restoreSnapshot`, `listSnapshots`, `allSnapshots`, `putFiles`, `getFile`, `listFiles`, `deleteFiles`, `readMeta`, `writeMeta`. `open`·`flush`·외부 확정 뒤에는 활동 기록과 페이지 경로를 함께 보낸다. `scan`·`apply`·`createFile`과 나머지 파일 호출은 없앤다.
3. **메시지** (`EditorBridge.swift`, `web/src/bridge.ts`): 웹→앱 `command`(명령 목록, 묶음 여부), `externalAccepted`(id, 받아들인 id). 앱→웹 `external`(id, 패치), `openVault`에 DEBUG 비교 여부. `vaultChanges`는 없앤다.
4. **웹** (`web/src/host/replica.ts`, `main.tsx`): `ReplicaRepository`와 세션 감싸기(`execute`·`executeAll`은 상태가 바뀐 명령만 보냄, `restoreSnapshot`은 Swift에서 하고 같은 `setDoc`을 보내지 않고 적용). 저장 큐의 기록 묶음은 무시한다. `nativeVaultBridge`는 `fileUrl`만 남긴다. 상태 변화분은 DEBUG 비교 때만 보낸다. vitest 테스트.
5. **앱** (`EditorController.swift`): vault를 열 때 호스트를 만들고, 닫기·전환·백그라운드·종료·웹 프로세스 종료 때 Swift가 직접 `flush`. 파일 감시와 동기화가 본 변경은 호스트의 외부 편집 경로로. 조회는 세션 상태와 복습 기록(`.morrow/review.json`, Morrow `readReviewLog` 이식)으로 답한다. DEBUG에서는 `workspace` 메시지마다 거울(웹 상태)과 세션을 비교해 로그에 남긴다. 열 때의 `CoreDualRun`과 `state` 질의는 없앤다.
6. **테스트**: `SessionHostTests`(FIFO, 외부 편집 두 단계, 웹 없이 적용), `FileVaultBridgeTests`(임시 폴더), 복습 기록 읽기, 브리지 메시지 해석, 웹 `replica.test.ts`.
7. **검증·문서·PR**: iPad 두 vault와 macOS에서 편집, 이름 바꾸기, 이동, 휴지통·복원, 보호·잠그기·열기·해제, 기록 복원, 복습 평가, 첨부 파일, 시뮬레이터 컨테이너 파일을 직접 고친 외부 편집. DEBUG 비교 차이 0, 웹이 파일 쓰기 호출을 하지 않음. `docs/verification/phase11c2-authority-flip.md`, 로드맵, PR(번호는 `gh pr create` 결과로).
