# Plan: 11d-2 페이지 머리, 원문 편집, 알림

spec: `spec_phase11d-native-screens.md`(11d-2 수정 포함). 브랜치 `feat/swift-chrome`(기준 `feat/swift-ports`), 워크트리 `.worktree/swift-chrome`, PR 기준 `feat/swift-ports`.

1. **명령 경로**: 네이티브 화면의 명령은 11c 규칙대로 웹을 거친다. 키 순서를 지키려고 JSON 텍스트로 보내는 `EditorCommand.commandText`와 웹 처리(`run(JSON.parse(...))`)를 더한다. 문서처럼 큰 값도 이 경로로 보낸다.
2. **페이지 머리** (`App/Sources/Pages/PageHeaderView.swift`, `CoverPicker.swift`): 커버(그라디언트 12개는 `CoverGradient` 재사용, 그림은 vault 파일), 커버 바꾸기·지우기·그림 쓰기(파일 선택 → 세션 `putFiles` → `page.setCover`), 아이콘(기존 이모지 선택), 제목(입력마다 `page.rename`), 태그(눌러서 태그 화면, 지우기, 추가는 `Frontmatter.normalizeTag`로 쉼표·공백 나눔). `PageInfo`에 `tags`를 더한다.
3. **원문 편집** (`SourcePageView.swift`): 머리, "You are editing this page as Markdown." 알림과 편집기로 돌아가기, 편집 영역. 처음 글은 세션 문서의 `docToMarkdown`(파일 경로는 id 그대로), 입력 500ms 뒤와 포커스를 잃을 때 `markdownToDoc`(페이지는 `resolveLinkTarget`, 파일은 id·이름으로 찾기) → 검증 → `page.setDoc`. 읽을 수 없으면 Morrow 문구로 알림.
4. **알림 화면** (`PageNoticeView.swift`): 읽지 못한 페이지, 모르는 블록이 든 페이지(평문으로 보여 줌). Morrow 문구 그대로.
5. **배치**: `ContentView`의 페이지 위에 네이티브 화면을 겹친다(잠긴 페이지와 같은 방식). 웹 `Page()`는 이 경우 빈 화면을 그린다. 판단에 쓰는 문서·읽지 못함은 세션 호스트에서 읽는다.
6. **테스트·검증**: 명령 JSON 테스트, 브리지 테스트. iPad에서 원문 편집(파일 확인), 제목·태그·커버·아이콘 바꾸기, 깨진 머리말 파일로 알림 화면, DEBUG 비교 차이 0. 문서·로드맵·PR.

## 구현하며 바뀐 것

- 네이티브 머리는 네이티브가 그리는 화면(원문, 알림)에만 쓴다. 편집기 페이지는 머리와 본문이 한 스크롤이라 웹 머리를 11d-5까지 둔다.
- 화면 순서는 Morrow PageView를 따른다: 읽지 못함 → 원문 → 모르는 블록(원문이 모르는 블록보다 먼저). 문서가 없으면 빈 문서.
- 알림 화면도 Morrow처럼 머리를 그린다. 읽지 못한 페이지의 머리는 읽기 전용(vault가 그 파일을 쓰지 않음).
- 기존 `command` 메시지 자체를 JSON 텍스트로 바꿨다(`commandText`를 따로 두지 않음).
