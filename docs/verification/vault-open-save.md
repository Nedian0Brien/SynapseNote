# vault 폴더 열기와 Markdown 저장 검증 결과

- 날짜: 2026-10-19
- 브랜치: `feat/vault-markdown-port`, Morrow `a2daae1`
- 환경: Xcode 27.0, macOS 27 호스트, iOS 27.0 시뮬레이터(iPad Pro 13-inch (M5))
- 시험 vault: `scripts/make-test-vault.sh`로 만든 Obsidian 형식 폴더(하위 폴더, 위키 링크, 콜아웃, frontmatter 속성, 태그, 이미지, 캔버스, `.obsidian/`). 사용자 폴더가 아닌 앱 컨테이너 안에서만 시험했다.
- 파일 변경 여부는 조작 전후 모든 파일의 SHA-256을 비교해 판단했다(`.morrow/` 제외).

결과 표기: **통과**는 화면이나 파일로 확인한 것, **미확인**은 이번에 판단하지 못한 것이다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 14개 |
| `npm --prefix web run build` | 통과(번들에 Morrow 이름이 남으면 실패하는 검사 포함) |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 29개(경로 검사, 스캔 규칙, `expect` 충돌, 대소문자 rename, 비덮어쓰기, `.morrow` 전용 삭제, 휴지통 대체 경로, 심볼릭 링크 차단, UTF-8 바이트 보존, RPC) |
| iPad 시뮬레이터 빌드, macOS Release 빌드 | 통과. Release 엔타이틀먼트는 sandbox, network.client, user-selected.read-write, bookmarks.app-scope(디버그용 임시 예외 없음) |

## 기능

| 항목 | macOS | iPadOS | 재현 절차 · 비고 |
|---|---|---|---|
| 첫 화면(Open Folder / New Folder) | 미확인 | 통과 | iPad는 "New Folder on This Device"로 앱 문서 폴더를 엶. macOS 저장 대화상자(`~/Documents/SynapseNote`)와 두 플랫폼의 폴더 선택 대화상자는 시스템 대화상자라 자동 조작하지 못했다. macOS는 디버그 전용 `-SynapseNoteDebugVault`로 열었다 |
| 다음 실행 때 같은 vault 다시 열기 | 미확인 | 통과 | iPad: 재설치 후 실행하면 앱 문서 폴더가 바로 열림. macOS bookmark 복원은 대화상자를 거쳐야 해서 확인하지 못했다 |
| 폴더 구조대로 페이지 목록 | 통과 | 통과 | 하위 폴더 페이지가 들여쓰기로 표시 |
| 위키 링크, 콜아웃, 체크리스트, 태그, 이미지 표시 | 통과 | 통과 | 이미지는 `synapse-vault://`로 vault에서 읽음 |
| 열기만 했을 때 파일 변경 없음 | 통과 | 통과 | `.morrow/workspace.json`, `recent.json`만 생김(Morrow와 같음) |
| 모든 페이지를 보기만 했을 때 파일 변경 없음 | 통과 | 통과 | 아래 "구현 중 발견" 2번 수정 후 |
| 본문 편집이 해당 파일에 저장, 다른 파일은 그대로 | 통과(일부) | 통과 | macOS는 백그라운드 입력이 일부만 들어가 저장 경로만 확인. iPad는 붙여넣기로 입력 |
| 새 페이지 | 통과 | 통과 | macOS File > New Page(⌘N), iPad 툴바 버튼. `Untitled.md` 생성 |
| 제목 변경 → 파일 이름 변경, 다른 페이지 링크 갱신 | 미확인 | 통과 | iPad: "Home" → `Home page.md`, `Launch.md`의 `[[Home#Callout]]`이 `[[Home page#Callout]]`로 바뀜 |
| 휴지통으로 보내기 | 통과 | 통과 | macOS File > Move Page to Trash, iPad 길게 눌러 Move to Trash. 파일이 vault의 `.trash/`로 이동, Undo 토스트 표시 |
| 휴지통 Undo | 미확인 | 미확인 | macOS는 토스트가 클릭 전에 사라짐 |
| 외부 변경 반영(앱이 열려 있는 동안) | 통과 | 미확인 | macOS FSEvents: 열린 페이지에 추가된 줄 표시, 밖에서 바꾼 파일 이름이 사이드바에 반영 |
| 외부 변경 반영(앱이 백그라운드였을 때) | 해당 없음 | 통과 | iPad: 홈으로 나간 사이 파일을 고치고 다시 앞으로 오면 반영(같은 프로세스) |
| 캔버스·데이터베이스·모르는 노드 페이지 보호 | 통과 | 통과 | 에디터로 열지 않고 안내 표시, 파일 그대로 |
| 저장 상태 표시 | 통과 | 통과 | Saved / Saving… |
| 한글 IME 조합 | 미확인 | 미확인 | 에디터의 입력 처리는 이번 변경에서 바뀌지 않았고 시제품 검증(iPadOS 통과)을 따른다. 이번에는 시뮬레이터 입력 도구가 키 입력 대신 붙여넣기만 해서 다시 시험하지 못했다. 제목 칸은 조합 중 Enter를 무시하도록 처리했다 |
| 웹 파일 선택(슬래시 메뉴 Image) | 미확인 | 미확인 | |
| 종료 전 저장 큐 비우기 | 미확인 | 미확인 | |
| iCloud Drive 폴더 | 미확인 | 미확인 | 내려받지 않은 파일(`.icloud` 자리표시자)은 숨김 파일로 빠진다 |

## 구현 중 발견하고 고친 것

1. **캔버스 내용이 지워짐**: 첫 페이지로 캔버스가 선택되자 텍스트 에디터가 캔버스 문서를 열었다. 이 과정에서 문서가 정규화되며 저장이 일어나 `Board.canvas`의 노드가 비었다. Morrow `PageView`와 같은 규칙으로 캔버스, 데이터베이스, 읽을 수 없는 페이지, 모르는 노드가 있는 페이지는 에디터로 열지 않게 했다.
2. **보기만 해도 파일이 다시 쓰임**: 에디터가 문서를 불러오며 바꾸는 부분(`![[diagram.png]]` → `![](attachments/diagram.png)`, frontmatter 뒤 빈 줄 제거)이 저장되어, 편집하지 않은 Markdown 파일이 Morrow 직렬화 형식으로 바뀌었다. 사용자가 입력·붙여넣기·끌어다 놓기·클릭하기 전의 변경은 저장하지 않고, 내용이 불러온 상태와 같으면 쓰지 않게 했다.
3. **삭제 이벤트가 버려짐**: Swift `Codable`이 `nil`인 `text`를 키째 빼서, 웹 쪽 검사가 파일 삭제 변경을 거부했다. 항상 `null`로 쓰게 했다(단위 테스트로 발견).
4. **가려진 창에서 vault가 열리지 않음**: 페이지 목록 보고를 `requestAnimationFrame`으로 보냈는데, WebKit이 가려진 창에서는 이를 실행하지 않았다. 타이머로 바꿨다.
5. **새 페이지가 빈 화면으로 열림**: 새 페이지 선택이 페이지 목록보다 먼저 도착해 Swift가 `show(nil)`을 보냈다. 표시 가능 여부 판단을 웹 쪽에만 두었다.
6. **창이 여러 개 생길 수 있음**: `WebPage` 하나를 두 창에서 쓰지 않도록 macOS는 단일 `Window` 장면, iPadOS는 다중 창을 껐다.

## 편집할 때 바뀌는 형식 (Morrow 동작)

편집한 페이지는 Morrow 직렬화 규칙으로 다시 쓴다. 예: 위키 임베드 `![[그림.png]]`는 `![](attachments/그림.png)`가 되고, frontmatter 뒤 빈 줄이 빠진다. 제목이 파일 이름과 다르면 frontmatter에 `title`이 들어간다. Obsidian은 이 형식을 읽는다.

## 사용자 확인 요청

1. macOS에서 첫 화면의 "New Folder…"로 `~/Documents/SynapseNote`를 만들고, 앱을 끄고 다시 켜서 같은 폴더가 열리는지 본다.
2. macOS에서 "Open Folder…"로 기존 Obsidian vault의 사본을 열어, 페이지를 둘러본 뒤 원본과 비교해 바뀐 파일이 없는지 본다(`.morrow/`만 생김).
3. 본문과 제목을 한글로 편집하고 Finder에서 파일 이름과 내용을 확인한다.
4. 앱이 열린 상태에서 다른 편집기로 같은 파일을 고쳐 반영되는지 본다.
5. 슬래시 메뉴의 Image로 그림을 넣어 `attachments/`에 저장되는지 본다.
