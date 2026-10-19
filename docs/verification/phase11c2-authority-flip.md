# 11c-2단계 쓰기 권한 전환 검증 결과

- 날짜: 2026-10-20
- 브랜치: `feat/swift-writer`(기준 `feat/swift-session`)
- 환경: Xcode 27.0, macOS 27.0, iOS 27.0 iPad Pro 13-inch (M5) 시뮬레이터
- 바뀐 동작: vault 파일을 쓰는 쪽이 웹에서 Swift 세션으로 바뀌었다. 웹은 명령을 바로 적용해 화면을 그리고 같은 명령을 앱으로 보낸다. Swift 세션(`SessionHost`)이 같은 명령을 적용하고, 웹 저장 큐가 `flush`를 요청할 때 파일을 쓴다. 웹에서 파일을 쓰는 호출(`scan`, `apply`, `createFile`, `readText` 등)은 없앴다. 다른 앱의 편집은 Swift가 먼저 읽고, 웹이 받아들인 페이지만 확정한다. 네이티브 화면의 조회는 Swift 세션 상태로 답한다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 47개(11c-1 43개 − 이전 vault 브리지 2개 + `replica.test.ts` 6개) |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 120개(11c-1 114개 − 이전 RPC 1개 + `SessionHostTests` 7개) |

`SessionHostTests`는 임시 폴더에서 돈다: 열기·명령·저장과 파일 이름 바꾸기, 새 vault의 안내 페이지는 한 번만, 다른 앱의 편집에 웹이 답할 때까지 저장이 기다리는지(웹이 받아들이지 않은 페이지는 웹의 편집이 이기고 다른 앱의 판은 기록에 남음), 웹이 없을 때 Swift 혼자 받아들이기와 웹이 준비될 때까지 미루기, Swift가 거절한 명령의 되돌림, 웹이 파일 호출을 할 수 없음, 첨부 파일·메타·복습 기록.

## iPad 시뮬레이터 (DEBUG)

DEBUG 빌드는 웹이 상태 변화분을 보내고, 앱은 `workspace` 메시지마다 웹 상태와 Swift 세션을 비교해 `core session: same as the page` 또는 차이를 로그(`com.synapsenote.native`, category `core`)에 남긴다. 11b의 조회 비교(`core query …`)도 그대로 돈다.

| 동작(가이드 vault) | 확인한 것 |
|---|---|
| 열기 | Swift가 읽은 상태로 웹이 열림, `17 pages, 17 docs` 같음 |
| Home에서 작업 체크 | Swift가 `Layouts, diagrams and media.md`에 `- [x] Walk`를 씀 |
| 다른 앱의 편집(셸에서 같은 파일을 고침) 뒤 백그라운드·포그라운드 | 열린 작업 11개로 돌아오고 단어 수 +4, 비교 같음 |
| 편집기에 입력 | `Make it yours.md`에 입력한 글, 페이지 기록 파일 생성 |
| 새 페이지, 제목 입력 | `Untitled.md` → `Session check.md`로 이름 바뀜 |
| 보호(비밀번호 설정) | 파일이 Morrow 형식으로 암호화되고 이 페이지의 평문 기록 파일이 지워짐 |
| 암호화된 페이지 편집 | 새 iv로 다시 암호화, 파일에 평문 없음, 기록 없음 |
| 잠그기, 틀린 비밀번호, 맞는 비밀번호 | 틀린 비밀번호는 거절, 맞는 비밀번호로 Swift가 복호화한 내용이 열림 |
| 암호화 해제 | 평문 파일로 다시 씀 |
| 기록 창, 이전 판 복원 | Swift가 읽은 기록 2개 표시, 복원 전 현재 판을 기록에 남기고 이전 판으로 바뀜 |
| 복습 평가 2번 | `.morrow/review.json`에 기록, `counts`·`review` 답이 웹과 같음 |
| 다른 페이지 안으로 옮기기, 휴지통, 복원 | 파일이 폴더 안으로, `.trash/`로, 원래 자리로 옮겨짐 |
| WebContent 프로세스를 강제로 끝냄 | 앱이 페이지를 다시 열고, 디스크를 다시 읽지 않고 Swift 세션 상태로 열림(안내 페이지를 다시 만들지 않음), 비교 같음 |
| 일상 vault로 전환 | 이전 vault는 닫으며 저장, 새 vault가 Swift 세션으로 열림(휴지통 포함 23페이지), 비교 같음 |

이 과정에서 `core session`·`core query` 비교의 차이는 0이었다(아래 고친 결함은 고친 뒤 다시 확인).

### 검증 중 고친 결함

- **기록 시각의 소수 밀리초**(194de88): Swift가 쓴 기록 파일의 `createdAt`에 `1792429886799.663` 같은 값이 들어갔다. 시각을 `JSEnvironment.now()`(정수 밀리초, `Date.now()`와 같음)로 모았다. 고치기 전에 가이드 vault의 `Make it yours` 기록 파일에 쓰인 값 하나는 그대로 남아 있다(숫자라 읽는 데 문제는 없다).
- **복습 평가 직후 늦은 답**(6489d6a): 웹은 `review.json`을 800ms 뒤에 쓰는데 네이티브 화면은 평가 직후 다시 물어, Swift의 `counts`·`review` 답이 한 단계 늦었다. 평가할 때 바뀐 복습 기록을 `reviewLog` 메시지로 먼저 보낸다. 파일은 지금처럼 웹이 늦춰 쓴다.

## 알려진 한계

- **macOS 앱 화면 확인은 하지 않았다.** macOS 앱은 사람이 고른 실제 폴더를 vault로 연다. 시험 vault가 아닌 폴더에 새 쓰기 경로를 돌리지 않으려고 macOS는 단위 테스트(임시 폴더의 `SessionHostTests` 포함)로만 확인했다. 백그라운드 저장, 종료 저장은 같은 코드(`EditorController.flush` → `SessionHost.flushAlone`)를 쓴다.
- **첨부 파일 추가는 화면에서 하지 않았다.** 시뮬레이터에서 파일 선택기를 자동으로 다루기 어려워, `putFiles`·`getFile`은 단위 테스트(임시 폴더)와 11c-1 비교 자료로만 확인했다.
- **웹 프로세스가 끝나기 직전 300ms 안의 편집**: 웹이 Swift에 보낸 명령은 Swift 세션에 남아 저장된다. TipTap이 아직 웹 세션에 넘기지 않은 입력(편집기의 짧은 묶음 시간 안의 글자)은 웹 프로세스와 함께 사라진다. 이번 전환 전과 같다.
- **Swift가 거절한 명령**: 같은 명령을 양쪽이 적용하므로 일어나지 않아야 한다. 일어나면 오류 로그를 남기고 Swift 세션의 해당 페이지를 웹에 다시 보낸다. 이 경로는 단위 테스트로만 확인했다.

## 참고사항

- 저장 시점은 웹 저장 큐가 정한다(spec 11c-2 수정). Swift `SaveQueue`의 타이머로 스스로 정하는 것은 웹이 없어지는 11d에서 쓴다.
- 시험에서 쓴 비밀번호는 시뮬레이터 시험용으로 만든 임의 값이며 문서에 적지 않았다. 가이드 vault에는 시험으로 만든 `Session check` 페이지와 `Make it yours`의 기록이 남아 있다.
- iOS 시뮬레이터 단위 테스트는 11a부터와 같은 이유로 macOS에서만 돌렸다.
