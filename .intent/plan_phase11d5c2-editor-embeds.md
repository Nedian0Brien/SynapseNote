# Plan: 11d-5c-2 끼워 넣기·행 속성 줄·기록 창·기본 편집기

spec: `spec_phase11d-native-screens.md`(11d-5c-2). 브랜치 `feat/swift-editor-embeds`(기준 `feat/swift-editor-media`), 워크트리 `.worktree/swift-editor-embeds`, PR 기준 `feat/swift-editor-media`.

1. **읽기 전용 그리기**: 편집기 블록 뷰(`BlockList` 이하)가 `editable`을 따르게 한다. 텍스트 뷰는 편집·포커스·메뉴 없이 그리고, 링크·날짜 칩 누르기와 수식·그림 표시는 그대로. 다른 페이지의 문서는 읽기 전용 `EditorStore`로 연다. 끼워 넣기 안의 끼워 넣기는 Morrow `docToHtml`처럼 링크로만 그린다.
2. **페이지 끼워 넣기**(PageLink `renderEmbed`): `![[페이지]]`가 있는 글 블록 아래에 그 페이지를 읽기 전용으로(`.page-embed`: 왼쪽 강조 선, 옅은 배경, 높이 420 넘으면 스크롤). 링크 칩은 `↳ `. 대상이 없거나 휴지통·암호 페이지·자기 자신이면 몸통 없음.
3. **살아 있는 끼워 넣기**(`mountEmbed`): 데이터베이스는 머리(아이콘·제목 단추, Open as a full page)와 11d-3 `DatabaseBody`, 캔버스는 같은 머리와 11d-4 `CanvasBoard`를 높이 420(Morrow 기본)의 틀에, 모서리를 끌어 크기 조절(최소 360×180, 최대 높이 1600, Morrow `canvasSizes` 설정에 저장). 링크 칩은 감춤(`.is-live > .page-link`).
4. **슬래시 메뉴**: Inline database, Inline canvas(하위 페이지를 만들고 끼워 넣기 링크, Morrow `linkChild(…, true)`).
5. **행 속성 줄**(RowProperties): 데이터베이스 행 페이지의 머리 아래에 속성 이름과 11d-3 `PropertyInput`, 편집 가능하면 Add a property(`NewPropertyForm`).
6. **기록 창**(HistoryDialog): 버전 목록(날짜·상대 시간·단어 수), Changes since then(core `Diff.diffLines`, 같은 줄 6개 넘게 이어지면 접기)과 That version(읽기 전용 그리기), Restore this version. 복원은 상태를 가진 웹 쪽이 하도록 브리지 명령(`restoreVersion`)으로 보낸다(11e에서 Swift로). 페이지 메뉴와 단축키의 기록 열기를 네이티브 창으로.
7. **기본 편집기**: 실행 인자 없이도 네이티브 편집기. `-nativeEditor NO`로만 웹 편집기(11e에서 제거). `EditorScreen.draws`에서 끼워 넣기 제외를 없앤다.
8. **확인**: 단위 테스트(끼워 넣기 대상 찾기, diff 접기, 캔버스 크기 제한), iPad 확인, 문서·로드맵·PR.
