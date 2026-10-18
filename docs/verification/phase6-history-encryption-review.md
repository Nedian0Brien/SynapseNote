# 6단계 페이지 히스토리·암호화·플래시카드 검증 결과

- 날짜: 2026-10-19
- 브랜치: `feat/history`(기준 `feat/canvas`)
- 환경: Xcode 27.0, iOS 27.0 시뮬레이터(iPad Pro 13-inch (M5))
- 시험 vault: 앱 문서 폴더의 시험 vault. 시험 암호는 이 시험에만 쓴 값이며 이 문서에 적지 않는다.
- macOS는 이 단계를 시험하는 동안 화면이 잠겨 있어 조작하지 못했다. iPhone은 이 단계에서 조작하지 않았다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` / `test` / `build` | 통과. 웹 테스트 36개(5단계보다 5개 많음): 복습 조회, 채점 저장, 0.8초 뒤 저장, flush, 마감 수 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 62개. 잠긴 페이지 목록이 있는/없는 workspace 메시지 디코딩, `openHistory`·`lockPage`·`unprotectPage`·`gradeCard` 명령 형식, `SidebarCounts.dueCards`·`ReviewData` 디코딩. 기존 테스트 함수에 항목을 더해서 개수는 그대로다 |
| iPad 빌드 | 통과 |
| 번들 검사 | 통과. `HistoryDialog`의 "Morrow keeps a version" 문구가 빌드 시 SynapseNote로 바뀐다 |

## 기능

| 항목 | iPadOS | iPhone | macOS | 확인 방법 · 비고 |
|---|---|---|---|---|
| 암호화 | 통과 | 미확인 | 미확인 | Encrypt with a Password… → 성공 안내. `Secret.md`가 암호문이 되고 본문 문장이 파일에서 사라짐 |
| 암호 규칙 안내 | 미확인 | 미확인 | 미확인 | 8자 미만일 때와 두 칸이 다를 때의 안내, Encrypt 버튼 비활성은 조작으로 확인하지 않음 |
| 지금 잠그기 | 통과 | 미확인 | 미확인 | Lock Now → 본문 자리에 암호 입력 화면 |
| 틀린 암호 | 통과 | 미확인 | 미확인 | "That password is not right." 표시, 입력 칸이 비워짐 |
| 잠금 풀기 | 통과 | 미확인 | 미확인 | 맞는 암호 → 본문이 보임. 앱을 다시 실행하면 다시 잠겨 있고, 다시 풀 수 있음 |
| 암호화 해제 | 통과 | 미확인 | 미확인 | 팔레트 Remove Encryption → `Secret.md`가 평문(본문 문장 그대로)으로 돌아옴 |
| 히스토리: 버전 없음 | 통과 | 미확인 | 미확인 | 버전이 없는 페이지 → "No versions yet. SynapseNote keeps a version…" |
| 히스토리: 목록·비교·미리보기 | 통과 | 미확인 | 미확인 | 오늘 노트를 고친 뒤 Page History → 버전 2개, Changes since then에 줄 단위 비교, That version에 그때 문서 |
| 히스토리: 복원 | 통과 | 미확인 | 미확인 | 이전 버전 Restore → `Journal/2026-10-19.md`가 고치기 전 내용으로 돌아오고 대화상자가 닫힘. 복원 직전 상태가 새 버전으로 남음(버전 2개 → 3개) |
| 대화상자가 열린 채 페이지 이동 | 통과 | 미확인 | 미확인 | 아래 "고친 문제" 1 |
| 카드 복습 | 통과 | 미확인 | 미확인 | `Cards.md`의 `질문 :: 답` 두 줄 → 2 due. Show Answer → Good |
| 복습 기록 | 통과 | 미확인 | 미확인 | `.morrow/review.json`에 그 카드의 `interval: 1`, `ease: 2.5`, `reps: 1`, `due: 2026-10-20`(시험일 다음 날)이 저장됨 |
| Again이 복습 끝으로 가는지, 1~4·Space 키 | 미확인 | 미확인 | 미확인 | 하드웨어 키보드 조작은 macOS에서 확인 필요 |

## 고친 문제

1. **히스토리 대화상자가 페이지를 옮겨도 남음.** Morrow 대화상자는 창 전체를 덮어 다른 조작을 막는다. 이 앱에서는 사이드바와 검색이 WebView 밖에 있어서 대화상자를 연 채 다른 페이지로 갈 수 있다. 이때 대화상자가 그대로 남아 있었다. 다른 페이지를 보여 줄 때 Morrow `closeDialog()`를 부르도록 고쳤다.
2. **잠금을 푼 뒤 찾을 문자열이 다시 선택됨.** 찾기 요청을 한 번 쓰고 지우도록 고쳤다.
3. **Remove Encryption이 동작 표와 메뉴 막대에 없었음.** 페이지 메뉴에만 있던 것을 동작 표(`page.unprotect`)와 메뉴 막대에도 더했다.

## 기록해 둘 동작

- 암호화를 해제한 직후 `Secret`의 히스토리는 비어 있었다. 암호화된 페이지의 평문 버전을 히스토리에 남기지 않는 Morrow 동작과 맞다.
- 앱을 끄기 전 저장(flush)에 복습 기록이 포함된다. Morrow는 채점 0.8초 뒤에만 쓴다.

## 사용자 확인 요청

1. macOS에서 페이지를 암호화하고, 잠그고, 시스템 비밀번호 자동 완성이 암호 칸에 뜨는지 확인한다.
2. macOS 복습 화면에서 Space로 답을 보고 1~4로 채점해 본다. Again을 고른 카드가 이번 복습 끝에 다시 나오는지 본다.
3. 암호화 시트에서 8자 미만 암호와 서로 다른 두 암호를 넣어 안내가 나오는지 본다.
