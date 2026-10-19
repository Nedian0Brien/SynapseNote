# Spec: 11c Swift 세션이 유일한 작성자

상위: `intent_morrow-full-port.md`(수락됨). 구조는 `spec_phase11a-swift-data-core.md`, 조회는 11b.

## 결정: 명령은 양쪽에서 적용하고, 파일은 Swift만 쓴다

- 웹 `WorkspaceSession`은 지금처럼 명령을 바로 적용해 화면(TipTap, 데이터베이스, 캔버스, 기록 창)을 그린다. 적용되어 상태가 바뀐 명령은 순번과 함께 Swift로 보낸다(`command`). Morrow 화면은 `execute`가 동기라고 가정하므로 웹이 Swift의 답을 기다릴 수 없다.
- Swift `CoreSession`은 같은 명령을 적용하고, 저장 예약에 따라 파일을 쓴다. 명령은 시각과 id를 인자로 받으므로 결과가 같다(11a `session.json`으로 확인). 웹의 저장소는 페이지 파일을 쓰지 않는다(`ReplicaRepository`).
- 네이티브 화면의 명령은 11c에서도 웹을 거친다(웹이 적용하고 Swift로 보냄). 같은 명령이 두 번 적용되는 경로가 없다. 네이티브 화면이 Swift에 직접 명령하는 것은 웹이 없어지는 11d에서 한다.
- 버린 대안: (1) 웹이 Swift에 명령하고 답을 기다림: 동기 가정이 깨진다. (2) Swift는 웹 저장소 역할만: 11d에서 상태 소유를 다시 옮겨야 한다.

## Swift에서 시작되는 변화: 외부 편집

Morrow의 순서를 지킨다. Swift가 파일 감시 결과를 읽어(`readChanges`) 바뀐 페이지를 만들고, Swift에 저장 안 된 변경이 있는 페이지는 뺀 채 웹에 보낸다. 웹은 열린 편집기를 먼저 저장한 뒤(`beforeExternal`) `applyExternal`로 받아들일 페이지를 정해 답한다. Swift는 그 페이지만 세션에 적용하고 디스크 기록을 갱신한다. 받아들이지 않은 페이지는 다음 저장 때 충돌로 잡혀 디스크 판이 기록에 남는다. Swift 자신의 쓰기는 디스크 내용 기록과 같아서 무시된다. 동기화로 받은 파일도 같은 경로다.

## Swift로 옮기는 저장소 기능 (`vaultRepository.ts`, `session.ts`, `saveQueue.ts`의 나머지)

- 저장 예약: 300ms 묶음, 실패하면 1초부터 두 배씩 최대 30초 재시도, `flush`. vault를 닫을 때, 앱이 백그라운드로 갈 때, 종료할 때 `flush`. 저장 상태(saved, pending, saving, error)는 Swift가 계산해 화면과 동기화에 쓴다.
- 페이지 기록: 10분 간격(`snapshotDue`), 페이지당 50개(`snapshotsToPrune`), `.morrow/history/<id>.json` 읽기·쓰기, 충돌 때 디스크 판 보관(`keepDiskVersion`), 복원 전 현재 판 보관.
- 암호화(`crypto.ts`): PBKDF2-SHA256 600,000회, AES-256-GCM, 파일 형식 그대로. 열기·잠그기·보호·해제. 열쇠와 평문은 Swift 메모리에만 둔다.
- 첨부 파일(이름 정하기, 목록, 삭제), `.morrow/*.json` 메타(복습 기록), 저장 횟수(활동 기록), 처음 실행 표시.
- 웹 쪽: `ReplicaRepository`의 `load`는 Swift가 읽은 상태를 받고, 나머지는 Swift 호출이다. 웹은 VaultRPC의 `apply`·`createFile`을 부르지 않는다. 조회(11b)는 거울 대신 `CoreSession` 상태로 답하고, 거울은 DEBUG 비교에만 쓴다.

## 불일치 처리

Swift가 웹에서 성공한 명령을 거절하면 오류로 기록하고, Swift 상태를 기준으로 해당 페이지를 웹에 다시 보낸다(`applyExternal`과 같은 경로). DEBUG 빌드는 저장할 때마다 웹 상태(거울)와 Swift 세션을 비교해 로그(category `core`)에 남긴다.

## 받아들이는 기준

- 비교 자료(node에서 Morrow 코드로): 암호화(고정 salt·iv에서 같은 파일, 양쪽 복호화), 기록 정리와 기록 파일, 외부 편집 시나리오(다른 앱의 편집·새 파일·삭제·이름 바꾸기·자기 쓰기 무시·충돌), 첨부 파일 이름, 가상 시계로 돌린 저장 예약.
- 앱(iPad 두 vault, macOS): 편집, 이름 바꾸기, 이동, 휴지통·복원, 잠그기·열기, 기록 복원, 복습 평가, 시뮬레이터 컨테이너 파일을 직접 고친 외부 편집. DEBUG 비교 차이 0. 시험 비밀번호는 문서와 비교 자료에 쓰지 않는다.
- PR 두 개: 11c-1(이식과 비교 자료, 앱 동작 그대로, 기준 `feat/swift-queries`), 11c-2(전환과 검증, 기준 11c-1).

## 범위 밖

데이터베이스 수식(`formula.ts`)과 표 표시용 함수, 캔버스 표시: 웹 화면에서만 쓰여 네이티브 화면과 함께 11d로 옮긴다. 게시·가져오기·백업(`site`, `importer`, `portability`)은 웹에 남고 명령과 첨부 파일 경로로 Swift를 거친다.
