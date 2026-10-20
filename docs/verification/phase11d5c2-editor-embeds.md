# 11d-5c-2단계 끼워 넣기·행 속성 줄·기록 창·기본 편집기 검증 결과

- 날짜: 2026-10-21
- 브랜치: `feat/swift-editor-embeds`(기준 `feat/swift-editor-media`)
- 환경: Xcode 27.0, macOS 27.0, iPad Pro 13-inch (M5) 시뮬레이터(iOS 27.0, 앱 컨테이너의 시험 vault), 실행 인자 없음(네이티브 편집기가 기본)
- 비교 기준: Morrow a2daae1의 `src/app/editor/PageLink.ts`, `SlashCommand.ts`(linkChild), `src/app/components/{database/EmbeddedDatabase,EmbeddedCanvas,database/RowProperties,HistoryDialog}.tsx`, `src/app/platform/preferences.ts`(canvasSizes), `blocks.css`·`color.css`·`features.css`, web `src/EditorApp.tsx`(mountEmbed, embedHtml)

## 바뀐 것

이 단계로 Morrow가 아는 모든 노드·마크(`Doc.knownNodeTypes`, `knownMarkTypes`)를 네이티브 편집기가 그린다. 실행 인자 없이도 네이티브 편집기가 열리고, `-nativeEditor NO`일 때만 웹 편집기다(11e에서 제거).

- **읽기 전용 그리기**(`EditorStore.editable`, `embedDepth`): 다른 페이지 안에 보이는 페이지와 기록의 버전은 같은 블록 뷰로 그리되 바꾸지 않는다. 링크·날짜 칩, 수식, 그림은 그대로이고, 접기·접는 콜아웃은 그 자리에서만 열고 닫힌다(HTML details처럼). 보이는 페이지 안의 끼워 넣기는 Morrow `docToHtml`처럼 링크로만 그린다.
- **페이지 끼워 넣기**(`Editor/EditorEmbeds.swift`): `![[페이지]]`가 있는 글 블록 아래에 그 페이지를 읽기 전용으로(`.page-embed`: 왼쪽 강조 선, 옅은 배경, 420pt 넘으면 스크롤). 링크는 `↳ ` 다음에 아이콘과 제목. 없는 페이지, 휴지통, 암호 페이지, 자기 자신은 몸통 없음.
- **살아 있는 끼워 넣기**(mountEmbed): 데이터베이스는 머리(아이콘·제목, Open as a full page)와 11d-3 화면 전체(보기 탭, 도구 막대, 행), 캔버스는 같은 머리와 11d-4 캔버스를 높이 420pt 틀에. 모서리를 끌어 크기를 바꾸고(너비 360~페이지 폭, 높이 180~1600, 페이지 폭이면 너비 없음) `canvasSizes` 설정에 기억한다. 이때 링크는 감춘다.
- **슬래시 메뉴**: Inline database, Inline canvas(하위 페이지를 만들고 끼워 넣기 링크).
- **행 속성 줄**(`Database/RowPropertiesView.swift`): 데이터베이스 행 페이지의 머리 아래에 속성 이름(150pt)과 11d-3 값 편집기, Add a property.
- **기록 창**(`Pages/HistorySheet.swift`): 버전 목록(날짜·상대 시간·단어 수), Changes since then(core `Diff.diffLines`, 같은 줄이 6개 넘게 이어지면 앞뒤 2줄 남기고 접기), That version(읽기 전용 그리기), Restore this version. 복원은 작업 공간을 가진 웹이 Morrow `restoreVersion`으로 하도록 `restoreVersion` 메시지를 보낸다. 페이지 메뉴의 Page History가 이 창을 연다.
- **PDF 내보내기**: Morrow처럼 웹 편집기 화면을 인쇄한다. 네이티브로 연 페이지는 인쇄하는 동안만 웹에 그리고 다시 네이티브로 돌린다.
- 함께 고친 것: 페이지 링크·날짜가 있는 블록은 작업 공간이 바뀌면 다시 그린다(새로 만든·이름 바꾼·휴지통으로 간 페이지).

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 47개(`restoreVersion` 메시지 읽기 포함) |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 185개(11d-5c-1 182개 + `EditorEmbedsTests` 3개) |

- `EditorEmbedsTests`: Morrow가 아는 노드·마크 전부가 네이티브 목록에 있음, 끼워 넣기 문서도 네이티브, 기록 창 접기(node에서 DiffView 코드로 낸 값), 단어 수(`\s` 기준), 캔버스 크기 제한과 `canvasSizes` 읽기.
- 변형 확인: 접기 기준을 7로, 페이지 폭 너비를 그대로 두게 바꿔 보았고 둘 다 실패했다(되돌림).

## iPad에서 확인한 것

| 동작 | 결과 |
|---|---|
| 실행 인자 없이 시험 페이지 열기 | 네이티브 편집기 |
| `![[Home]]`, `![[Task list]]`, `![[Board]]` | Home은 읽기 전용(콜아웃·할 일·그림·태그), Task list는 보기 탭·정렬·행이 있는 데이터베이스, Board는 도구 막대가 있는 캔버스 |
| 캔버스 안에서 끌기 | 캔버스가 움직이고 페이지는 스크롤되지 않음 |
| 캔버스 모서리 끌기 | 360×839로 줄었다가 페이지 폭으로 다시 넓어짐, 설정에 저장 |
| `/inline data` + Enter | `Embed test/Untitled` 데이터베이스가 만들어지고 `![[Embed test/Untitled]]`, 표가 그 자리에 |
| 행 페이지(Photo row) | Status·Date·Points 줄, Points에 5 입력 → 파일 머리말 `Points: 5` |
| Page History(Media test, 7개 버전) | 목록, 바뀐 줄(+ 초록, 30줄 접힘), That version에 수식·그림 |
| Restore this version | 파일이 그 버전으로 바뀌고 편집기가 다시 읽음 |
| Export Page as PDF(Photo row, 명령 팔레트로) | 저장한 PDF 1쪽에 제목, 속성 값, 할 일 글 |
| DEBUG 세션 비교 | 40분 동안 162번, 차이 0 |

## Morrow와 다른 점

- **끼워 넣은 페이지**: Morrow는 그 페이지의 HTML(`docToHtml`)을 0.95em 글자로 보이고, 여기서는 편집기 블록 뷰로 읽기 전용으로 그린다. 글자 크기는 본문과 같다.
- **글 블록 안 끼워 넣기 위치**: Morrow는 링크 자리에서 블록으로 펼치고, 여기서는 그 글 블록 아래에 차례로 그린다. `![[페이지]]`만 있는 줄에서는 같아 보인다.
- **캔버스 크기 설정**: Morrow는 페이지(localStorage)의 설정에, 여기서는 앱 설정(`UserDefaults`)에 둔다. 웹 편집기와는 공유하지 않는다.
- **좁은 캔버스**: 너비 360pt에서는 캔버스 도구 막대 오른쪽이 잘린다.

## 알려진 한계

- PDF 내보내기와 기록 복원은 11e까지 웹을 거친다. 웹의 HistoryDialog 코드는 11e에서 웹과 함께 지운다.
- 페이지 메뉴의 Export Page as PDF·Export Page as Markdown을 자동화 도구로 누르면 저장 창이 뜨지 않았다. 같은 메뉴의 Page History·Edit as Markdown은 열리고, 같은 동작을 명령 팔레트로 실행하면 내보내기가 된다. 이 단계 이전 빌드(11d-5c-1, 웹 편집기)에서도 메뉴로는 똑같이 뜨지 않아 이 단계의 변경 때문은 아니다. 손으로 누르기 확인이 필요하다.
- 확인하지 않은 것: Inline canvas, 끼워 넣은 데이터베이스에서 행 추가·값 편집, macOS 앱, 한글 조합 입력.
