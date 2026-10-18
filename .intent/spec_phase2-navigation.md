# Spec: 2단계 탐색

상위 intent: `intent_morrow-full-port.md` (수락됨). 기준은 Morrow a2daae1의 `Home.tsx`, `CommandPalette.tsx`, `tabs.ts`, `TabBar.tsx`, `PageView.tsx`(백링크·언급·아웃라인), `actions.ts`, `Dialogs.tsx`(단축키), `core/search.ts`, `core/insights.ts`, `core/links.ts`.

## 요구사항

1. **조회 경로.** 네이티브 화면은 TS 코어가 계산한 결과를 받아 그린다. Swift가 `window.synapse.query(name, params)`를 부르고, 페이지는 결과를 `JSON.stringify`한 문자열로 돌려주며, Swift는 이를 `JSONDecoder`로 Codable 타입으로 읽는다. 세션이 준비되지 않았으면 `null`을 돌려준다. 조회 종류는 `search`, `recent`, `home`, `backlinks`, `mentions`, `outline`이다. `WorkspaceService`에 조회 메서드를 추가해서, 나중에 Swift 코어가 같은 인터페이스를 구현할 수 있게 한다.
2. **열람 기록.** 페이지를 보여 줄 때 Morrow `PageView`처럼 `page.markOpened`를 실행한다. 포팅에서 빠져 있던 부분이다.
3. **찾을 문자열을 가지고 열기.** `show`에 `find`를 함께 보낼 수 있다. 편집기는 `PageEditor.tsx`처럼 첫 일치 위치를 선택하고 화면에 보이게 스크롤한다. 주소를 다시 바꾸는 Morrow의 마지막 동작은 가져오지 않는다. 그 동작이 Swift에 `openPage`를 다시 보내기 때문이다.
4. **홈.** 사이드바 맨 위에 Home이 있고, vault를 열면 처음 보이는 화면이다. Morrow 홈과 같은 항목을 보여 준다.
   - 날짜, 인사말, 연속 기록 일수, 페이지 수, 단어 수, 열린 작업 수
   - Jump back in: 최근 6개. journal과 templates 종류는 빼고 `max(lastOpenedAt, updatedAt)` 순으로 정렬한다.
   - 53주 활동 히트맵
   - On this day, Rediscover
   - 열린 작업 6개. 체크하면 `task.setChecked`, 누르면 해당 페이지를 작업 문구를 찾을 문자열로 해서 연다.
   - vault가 비어 있을 때는 "Create a page"만 보여 준다. 가져오기는 7단계, 이름 설정은 9단계, 작업 화면 이동은 3단계에서 붙인다.
5. **명령 팔레트(⌘K).** 검색어가 없으면 최근에 연 페이지 6개와 동작 목록을 보여 준다. 검색어가 있으면 `searchWorkspace` 결과 30개(제목, 경로, 발췌)와 동작 5개를 보여 준다. `>`로 시작하면 동작만 보여 준다. `#tag`는 태그로 거른다. 화살표, Enter, Esc로 조작한다. 제목이 일치하지 않은 결과는 `firstMatch`를 찾을 문자열로 해서 연다. 결과는 요청 순번으로 관리해서, 늦게 도착한 이전 요청의 결과는 버린다.
6. **동작 표.** Swift에 동작 하나당 이름, 단축키, 사용 가능 조건, 실행 내용을 한 표로 둔다. 메뉴 명령, 팔레트, 단축키 안내가 모두 이 표를 쓴다. 이 빌드에서 실제로 동작하는 것만 넣는다.
   - New Page, New Subpage
   - New Tab, Close Tab, Open in New Tab, Next Tab, Previous Tab
   - Home, Trash
   - Favorite, Find in Page, Move To, Duplicate, Move to Trash
   - Open Folder, Show Vault Folder (macOS)
   - Sidebar, Inspector, Focus Mode, Keyboard Shortcuts
7. **탭.** 탭은 Swift가 관리한다. 탭마다 목적지(Home, page, trash) 하나를 가지며, 열린 탭이 사이드바 선택을 따라간다. 동작은 Morrow `tabs.ts`와 같다.
   - 최대 20개. 새 탭은 현재 탭 바로 오른쪽에 생긴다.
   - 닫으면 같은 위치의 탭이 열린다. 마지막 탭은 닫지 않는다.
   - 순환 이동과 끌어서 순서 바꾸기를 지원한다.
   - vault마다 UserDefaults에 저장한다.
   - 탭 막대는 regular 너비에서 탭이 2개 이상일 때만 보인다. 페이지 메뉴에 "Open in New Tab"을 두고, 편집기 안의 페이지 링크를 ⌘-클릭하면 새 탭으로 연다.
   - 열린 페이지가 휴지통으로 가거나 사라지면 그 탭은 Home으로 바뀐다.
8. **인스펙터.** 페이지를 볼 때 열 수 있다. 내용은 다음과 같다.
   - On this page: 제목 목록. 누르면 해당 제목으로 스크롤한다. Morrow는 제목이 3개 이상일 때만 보여 주지만, 인스펙터는 따로 연 화면이므로 1개부터 보여 준다.
   - Linked from N pages: 문맥 한 줄을 함께 보여 준다.
   - 연결되지 않은 언급: 버튼을 눌러야 계산한다. 결과를 누르면 그 페이지를 제목을 찾을 문자열로 해서 연다.
9. **집중 모드(⇧⌘F).** 사이드바, 인스펙터, 탭 막대를 숨긴다. Esc나 같은 명령으로 빠져나온다.
10. **단축키 안내(⌘/).** 동작 표에서 단축키가 있는 항목과 Morrow 편집 단축키 표를 보여 준다.

## 단축키 처리

- macOS에서는 WKWebView가 키 입력을 먼저 받고, 페이지가 처리하지 않은 키 조합은 메뉴로 넘어간다. 이것은 빌드한 앱에서 확인한다.
- ⌘K: 편집기에 선택한 글이 있으면 링크 편집을 연다(Morrow와 같다). 없으면 팔레트를 연다. iOS에서는 네이티브 명령이 먼저 받기 때문에, Swift가 `linkSelection` 조회로 편집기에 먼저 묻는다.
- ⌘F: 편집기의 찾기 막대를 연다(`find` 메시지).
- ⌘W: 탭이 2개 이상이면 탭을 닫는다. 탭이 하나면 macOS 기본 동작대로 창을 닫는다.
- Esc: 집중 모드일 때만 집중 모드를 끈다. 편집기에 포커스가 있으면 웹이 Esc를 받으므로, 웹이 `shortcut` 이벤트로 Swift에 알린다.

## 받아들이는 기준

- `npm --prefix web test`와 Swift 테스트가 통과한다. 조회 결과의 JSON 형태, 탭 동작 규칙, 명령 JSON을 테스트한다.
- macOS, iPad, iPhone 시뮬레이터에서 홈, 검색, 팔레트, 탭, 인스펙터, 집중 모드, 단축키 안내를 실제로 조작해 확인하고, `docs/verification/phase2-navigation.md`에 기록한다. 도구 제약으로 조작하지 못한 항목은 "미확인"으로 적는다.
- 페이지를 보기만 해서는 파일이 다시 쓰이지 않는다. 다만 `lastOpenedAt`은 `.morrow/recent.json`에 기록된다(Morrow와 같다).

## 범위 밖

작업 화면, 태그 화면, 그래프, 히스토리, 가져오기·내보내기, 테마 전환, 설정. 각각 해당 단계에서 동작 표에 추가한다.
