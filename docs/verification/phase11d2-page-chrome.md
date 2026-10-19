# 11d-2단계 페이지 머리·원문 편집·알림 검증 결과

- 날짜: 2026-10-20
- 브랜치: `feat/swift-chrome`(기준 `feat/swift-ports`)
- 환경: Xcode 27.0, macOS 27.0, iPad Pro 13-inch (M5) 시뮬레이터(iOS 27.0, 앱 컨테이너의 시험 vault)
- 비교 기준: Morrow a2daae1의 `src/app/components/PageView.tsx`, `SourceEditor.tsx`, `Cover.tsx`, `TagsView.tsx`(PageTags)

## 바뀐 것

| 화면 | 그리는 쪽 |
|---|---|
| 읽지 못한 페이지(머리말이 키 목록이 아닌 파일 등) | 네이티브. 커버·머리·Morrow 문구의 오류 알림 |
| 이 버전이 모르는 블록이 든 페이지 | 네이티브. 머리·알림·평문 |
| Markdown 원문으로 보는 페이지 | 네이티브. 커버·머리(아이콘·커버 추가, 제목, 태그)·알림과 편집기로 돌아가기·원문 |
| 그 밖의 텍스트 페이지, 데이터베이스, 캔버스 | 웹(11d-3~11d-5에서 옮김) |

화면을 고르는 순서는 Morrow PageView와 같다: 잠긴 페이지 → 읽지 못한 페이지 → 원문 → 모르는 블록 → 편집기. 웹 `Page()`는 네이티브가 그리는 경우에 빈 화면을 그린다. 문서가 없는 페이지(노트 없는 폴더)는 Morrow처럼 빈 문서로 연다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 47개(명령 메시지를 JSON 텍스트로 받고 키 순서를 지키는지 포함) |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 129개(11d-1 128개 + 화면 고르기·원문 읽고 쓰기 1개, 명령 모양 테스트 확장) |

`SessionHostTests.choosesPageScreensAndReadsSourceAsMorrowDoes`는 실제 폴더에서 화면 고르기(읽지 못함, 원문, 모르는 블록보다 원문이 먼저, 없는 페이지), 원문 열기(링크는 제목, 파일은 vault 경로), 다시 읽기(페이지 링크, 파일을 경로와 대소문자 다른 이름으로 찾기, 깨진 `%` 이스케이프는 저장 안 함)를 본다. 원문·모르는 블록 순서를 바꾸고 파일 이름 대소문자 무시를 빼 보았고, 둘 다 실패했다(되돌림).

## iPad에서 확인한 것

| 동작 | 결과 |
|---|---|
| 깨진 머리말 파일(`Broken.md`) 열기 | 네이티브 알림, Morrow 오류 문구. 머리는 읽기 전용, 파일은 그대로 |
| 원문 보기(페이지 메뉴 Edit as Markdown) | Morrow `docToMarkdown` 그대로의 원문 |
| 원문에 입력 | 500ms 뒤 파일에 저장(`- two and three`) |
| 제목 입력 | 입력마다 이름 바꾸기, 파일 이름이 `Source test renamed.md`로. 리턴은 줄바꿈 없이 원문으로 이동 |
| 태그 `alpha beta,` 입력 | 쉼표에서 두 태그로 나뉘어 머리말 `tags`에 저장. ×로 하나 지우기 |
| 커버 추가 → 그라디언트 | 고른 그라디언트가 배너로 |
| 커버 추가 → Use an image → 파일 선택 | `attachments/cover-picture.png`로 복사, 머리말 `cover`에 경로, 배너에 그림 |
| 편집기로 돌아가기 | 웹 편집기가 같은 내용·커버·태그로 열림 |
| DEBUG 세션 비교 | 21번 중 20번 차이 0. 1번(revision 9)은 제목을 빠르게 입력하는 동안 Swift 세션이 웹이 보고한 상태보다 한 글자 앞서 있었고 다음 비교(revision 10)부터 다시 0 |

revision 9의 차이는 비교가 두 사본을 서로 다른 순간에 읽은 결과다. 웹은 명령을 보낸 뒤 16ms 모아서 상태를 보고하고, 비교는 그 보고를 받은 뒤 세션을 읽는데, 그 사이에 다음 글자의 명령이 세션에 먼저 적용됐다. 두 사본이 갈라진 것이 아니다.

## Morrow와 다른 점

- **읽지 못한 페이지의 머리**: Morrow는 제목·아이콘·커버를 바꿀 수 있게 두지만, vault 저장소가 그 파일을 쓰지 않아(`vaultRepository`의 `locked`) vault를 다시 열면 사라진다. 저장되지 않는 편집을 받지 않도록 읽기 전용으로 했다.
- **원문 영역 크기**: Morrow textarea처럼 글에 맞춰 늘어나고 페이지가 스크롤된다(최소 320). macOS에서의 높이 계산은 확인하지 못했다.
- **알림 문구의 앱 이름**: "content from a newer version of Morrow"는 이전 단계부터 쓰던 "content SynapseNote does not know yet"로 둔다.

## 알려진 한계

- **사용자 CSS**: vault의 `.morrow/style.css`는 웹이 그리는 부분에만 적용된다. 시험 vault의 `.page-title { color: … }`가 편집기 페이지 제목에는 보이고 원문 페이지 제목에는 보이지 않았다. 웹을 없애는 11e 전에 사용자 CSS를 어떻게 다룰지 정해야 한다.
- 원문을 읽지 못하는 경우(문서가 너무 크거나 깊음)의 오류 문구는 화면에서 만들지 못해 자동 검사로만 확인했다.
- 한글 제목·태그 입력은 시뮬레이터 자동 입력이 영문 자판만 지원해 확인하지 못했다. 제목 칸은 포커스가 있는 동안 자기 글을 유지하도록 했다.
- macOS 앱 화면은 실제 사용자 폴더를 열기 때문에 실행하지 않았다.
