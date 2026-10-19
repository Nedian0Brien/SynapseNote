# Plan: 11c-1 저장소 나머지 이식

spec: `spec_phase11c-swift-session.md`. 브랜치 `feat/swift-session`(기준 `feat/swift-queries`), 워크트리 `.worktree/swift-session`, PR 기준 `feat/swift-queries`. 앱 동작은 바뀌지 않는다(쓰는 쪽은 여전히 웹).

1. **비교 자료** (`web/scripts/core-fixtures.ts`): `crypto.getRandomValues`를 고정 수열로 바꾸고 다음을 쓴다.
   - `crypto.json`: 비밀번호·salt·iv·평문 조합의 `encryptPage` 결과와 `decryptPage`, `readEncrypted`(잘못된 머리말 포함).
   - `storage.json`: Morrow `WorkspaceSession` + `VaultRepository` + `MemoryVault`로 돌린 단계별 기록. 단계마다 명령 또는 동작, 시계, vault에 넘긴 파일 작업 전부(기록 파일 포함), 외부 편집 패치와 받아들인 id, 세션 상태, 활동 기록.
     단계: 가이드 vault 생성, 10분 간격 편집(기록 생성)과 52번 편집(정리), 기록 복원, 다른 앱의 편집(저장 안 된 변경 없음/있음 → 충돌과 디스크 판 보관), 새 파일, 삭제, 이름 바꾸기, 폴더 삭제, 자기 쓰기 메아리, 암호화(보호·잠금·열기·편집·해제, 틀린 비밀번호), 첨부 파일 이름 겹침과 삭제, 메타 쓰기·읽기.
   - `save-queue.json`: 가상 시계로 돌린 Morrow `SaveQueue`(묶음, 실패 2번 뒤 성공, 재시도 간격, `flush`)의 상태 변화와 묶음.
2. **암호화** (`Core/Vault/PageCrypto.swift` 확장): PBKDF2-SHA256(CommonCrypto `CCKeyDerivationPBKDF`), AES-256-GCM(CryptoKit), 파일 형식, 난수는 주입.
3. **저장 예약** (`Core/Session/SaveQueue.swift`): Morrow `SaveQueue`의 상태 기계. 타이머는 `SaveTimer` 프로토콜로 주입.
4. **저장소** (`Core/Session/VaultWriter` 확장 파일들): 기록(`+History`), 암호화된 페이지 쓰기와 열쇠(`+Crypto`), 외부 편집 읽기 `readChanges`와 확정(`+External`), 첨부 파일·메타·활동(`+Files`). `VaultBridge`에 `readText`, `readBytes`, `createFile`, `exists`, `listFiles` 추가.
5. **세션** (`CoreSession`): 저장 예약 연결, 기록 시점(`snapshotDue`), 열기·잠그기·보호·해제, 기록 복원·가져오기, 외부 패치 두 단계(만들기 → 받아들인 id로 확정), 첨부 파일.
6. **테스트**: `CryptoTests`, `StorageTests`(단계 재현, 파일 작업·패치·상태 비교), `SaveQueueTests`. 테스트용 `MemoryVault`에 외부 편집과 읽기 추가.
7. **문서·PR**: 라이선스 고지 확인(새 의존성 없음), `docs/verification/phase11c1-storage-port.md`, 로드맵 11c 행 갱신, PR(기준 `feat/swift-queries`).
