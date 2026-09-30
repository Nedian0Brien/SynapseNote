# 인계: 웹 편집기가 원문을 직접 편집한다 (web-source-editor)

갱신 2026-09-30. 다음 세션의 에이전트가 이 문서만 읽고 작업을 이어받을 수 있게 쓴다.

웹 앱에 Markdown 원문(`Y.Text('source')`)을 CodeMirror 6로 직접 편집하면서 기호를 숨기는 `live` 편집 모드가
생겼다. 편집 규칙은 core의 순수 함수이고, 네이티브 앱도 같은 명세와 fixture를 쓴다. P0~P2(뼈대), P2c(기존
편집기 동작 옮기기), P3a(코드 울타리·표 위젯), P3b(수식·Mermaid 위젯), P3c(frontmatter 속성 화면),
P3d(콜아웃·아코디언 위젯), P3e(이미지·파일 임베드 위젯), P3f(문서 문맥 MDX 위젯), P3g(들여쓴 코드 위젯), P3h(HTML details 아코디언), P3i(Tabs/Tab), P3j(참조 이미지), P3k(MDX 속성·Mirror), P3l(PDFium 로딩), P3m(수평선·각주·주석)가 끝났다.
P3 일반 HTML 해석 점검이 남아 있고 P4a 슬래시 명령과 P4b 태그·중첩 선택기와 P4c 링크 편집과 P4d 슬래시 컴포넌트·데이터베이스와 P4e 파일 업로드와 P4f HTML 코드 미리보기와 P4g 기본 선택 서식 막대와 P4h 원문 메모를 구현했다. P4의 나머지 기능과 P5~P6는 진행 전이다.

### P4c 추가 (2026-09-30)

- Cmd+K는 선택한 텍스트 또는 기존 Markdown 링크에서 기존 문서·앵커·외부 링크 대화상자를 연다. 링크 추가·대상 변경·문구 변경·해제를 core 원문 명령으로 적용한다.
- 변경하지 않은 서식·제목을 보존하며 참조 링크는 공유 정의의 URL을 고친다. 대화상자 범위는 원격 변경에 따라 이동하고 원격 삭제된 링크는 저장으로 복원하지 않는다.
- core 편집·fixture 127개, live DOM 129개, 링크 대화상자 DOM 3개, 기존 패널 DOM 5개, core·app 타입 검사 통과. 브라우저에서 수정·추가·해제를 확인했다.
- 브라우저 확인 문서: `http://localhost:5183/#/notes/p4c-link-review-1790696700000`.
- 숨겨진 Tiptap이 새로고침할 때 링크의 Markdown 서식 위치를 정규화하는 기존 구조 문제를 확인했다. P6에서 동기화 계층을 제거한 뒤 다시 검증한다.
- 다음 P4 구간: 슬래시 메뉴의 컴포넌트·미디어·데이터베이스 작업, 툴바, 메모·앵커, 협업 표시, PDF 내보내기. P3 일반 HTML 지원과 P5~P6도 남아 있다.

### P4d 추가 (2026-09-30)

- 슬래시 메뉴는 core canonical 명세의 항목·기본 속성을 사용한다. Tabs는 두 Tab을 준비한다. 링크와 태그는 기존 대화상자·선택기로 연결한다.
- 새 데이터베이스는 기존 생성 이벤트를 사용하고, 연결된 데이터베이스는 인라인 선택기를, 인라인 데이터베이스는 creationId 생성 흐름을 사용한다. 내부 DB/source/view ID 입력란은 선택기가 관리하도록 숨겼다.
- 슬래시 DOM 8개, 링크 DOM 4개, MDX 속성 DOM 3개, app 타입 검사 통과. 브라우저에서 Tabs·데이터베이스 선택·생성·인라인 표·링크 취소·태그 제안을 확인했고 원문 저장과 pageerror 없음도 확인했다.
- 확인 문서: `http://localhost:5183/#/notes/p4d-slash-review`.
- 다음 P4: 파일 업로드·HTML preview starter 및 메뉴 미리보기, 서식 도구 막대, 메모·앵커, 협업 표시, PDF 내보내기.

### P4e 추가 (2026-09-30)

- 슬래시 File, 파일 붙여넣기·드롭은 같은 live 업로드 경로를 사용한다. 로딩 표시·삽입 위치가 원격 변경을 따라 이동하고, 실패·편집기 폐기 시 정리된다.
- 기존 API·분류를 공유하며 JSX 이미지·동영상·음악, 파일 위키 임베드, Markdown 문서 위키 링크, 기타 상대 Markdown 링크를 원문에 넣는다. 업로드로 바뀐 Markdown 파일명은 반환된 이름을 사용한다.
- 업로드 DOM 4개, API 14개, 분류 10개, 경로 9개, 슬래시 DOM 8개, app 타입 검사 통과. 브라우저에서 파일 선택·붙여넣기·드롭과 새로고침 후 이미지 세 개의 정상 로딩·저장을 확인했다. pageerror 없음.
- 확인 문서: `http://localhost:5183/#/notes/p4e-upload-review`.
- 다음 P4: HTML preview starter·코드 블록 미리보기, 메뉴 미리보기, 서식 도구 막대, 메모·앵커, 협업 표시, PDF 내보내기. P3 일반 HTML 및 P5~P6도 남아 있다.

### P4f 추가 (2026-09-30)

- live 코드 위젯은 기존 공통 iframe 헤더·테마·CSP 차단 보고·자동 높이·소스 편집 창·확대 창·ResizeHandles를 사용한다. 원문 설정은 core code-meta 명령으로 시작 펜스의 메타 범위만 변경한다.
- 빈 HTML과 네 예제 본문·검색 별칭은 두 편집기가 공유한다. 일반 코드에는 React portal을 등록하지 않는다.
- core 위젯 63개·fixture 8개, live DOM 129개·슬래시 9개·미리보기 2개, 기존 예제 메뉴 6개, core·app 타입 검사 통과. 기존 예제 메뉴는 app test:dom runner로 실행해야 Lingui 매크로가 변환된다.
- 브라우저에서 렌더링·편집 창 저장·제목·확대·새로고침 저장, 예제 슬라이더의 2500→2600 실행, 손잡이 드래그의 w/h 원문 저장을 확인했다.
- 확인 문서: `http://localhost:5183/#/notes/p4f-preview-review`.
- 다음 작업: P3 일반 HTML, 슬래시 메뉴 미리보기, 코드 블록의 기타 도구, 서식 도구 막대, 메모·앵커, 협업 표시, PDF 내보내기, P5~P6.

### P4g 추가 (2026-09-30)

- 선택 서식 막대가 core의 굵게·기울임·취소선·인라인 코드·강조, 문단·제목·목록·인용·코드 블록 명령과 링크 대화상자를 실행한다. shadcn Button·DropdownMenu를 CodeMirror tooltip에 렌더링한다.
- 원격 편집 후 현재 선택에 적용한다. 문단 메뉴 종료 후 편집기 포커스를 복원하고, 코드·빈 선택에서 막대를 숨긴다.
- DOM 2개·app 타입 검사 통과. 브라우저에서 굵게·문단·링크 및 메뉴 종료 후 이어 입력을 확인했고 pageerror는 없었다.
- 확인 문서: `http://localhost:5183/#/notes/p4g-toolbar-review`.
- 밑줄은 현재 core가 `<u>`를 일반 텍스트로 읽어 파서·편집 모델 지원이 필요하다. 각주·메모·AI 편집·미디어 도구도 후속 구간에서 옮긴다. P3 일반 HTML과 P4 전체·P5~P6는 완료 전이다.

### P4h 추가 (2026-09-30)

- root live 선택 막대의 Memo 버튼이 원문 앵커를 기존 메모 작성 패널로 전달한다. SourceEditor의 source·live 모드에 표시·이동 구독을 연결했다.
- 앵커는 정확 위치와 문맥으로 찾고 원격 변경 후 표시 범위를 매핑한다. 저장소 갱신 시 다시 해석하며 입력마다 저장하지 않는다. source 메모 카드 이동 버튼과 표시 클릭의 reveal 이벤트를 연결했다.
- 메모 DOM 2개·막대 DOM 3개·MemoPanel DOM 12개, app 타입 검사 통과. 브라우저 작성·저장·표시·원문 이동·새로고침 복원과 pageerror 없음을 확인했다.
- 확인 문서: `http://localhost:5183/#/notes/p4h-memo-review`. 메모는 기기 로컬 저장소이므로 다른 브라우저에서는 직접 선택→Memo로 생성해 확인한다.
- 다음: 기존 wysiwyg 앵커 변환, 중첩 위젯의 원문 좌표 연결, native highlight, 각주 삽입. P3 일반 HTML·밑줄·기타 P4·P5~P6도 남아 있다.

## 1. 사용자가 정한 것

바꾸기 전에 사용자에게 묻는다. 모두 이 세션에서 사용자가 직접 답한 내용이다.

- **제품 방향:** 혼자 쓰는 앱. 원격 에이전트가 필요하다. upstream과 독립한다. Craft를 기준으로 삼는다. macOS·iPadOS·iOS
  네이티브 앱이 먼저이고 웹은 나중이다. 네이티브 편집기는 TextKit 2 연속 텍스트다.
- **구조:** 편집 가능한 CRDT를 `Y.Text` 하나로 줄인다. 지금은 `Y.Text`와 `Y.XmlFragment`(Tiptap)를 서버가 원문
  비교로 잇는다. 이 구조가 동시 편집 중복의 근본 원인이다(y-tiptap `updateYText`가 문단 전체에 서식 속성을 다시
  적용해 동시 편집에서 서식이 엉뚱한 글자로 간다). 사용자가 CodeMirror 방식(2번)을 골랐다.
- **진행 방식:** 새 편집기를 기존 편집기와 나란히 두고, 다 되면 교체한다(P6). 편집 규칙 명세는 네이티브와 공유한다.
- **성능 목표:** 5,000줄 문서에서 키 입력→화면 반영 p95 16ms.
- **원문 노출:** 원문은 가급적 보이지 않는다. 커서가 있는 줄과 표에서도 기호를 숨긴다. 표는 칸 단위로 편집한다.
  원문은 명시적인 원문 보기(source 모드)에서만 보인다.
- **P0 결정:** 링크 끝에서 친 글자는 링크 밖으로 간다(기존 편집기와 다르다). soft break는 줄바꿈으로 보인다.
- **블록 기호:** `-` `#` `1.` `>`는 스페이스를 치는 순간 블록이 된다. 코드 블록·수식 블록은 Enter를 치는 순간이다.
  그 전에는 친 기호를 이스케이프해(`\-`) 글자 그대로 보인다.
- **기존 편집기와 일부러 다르게 둔 네 가지:**
  - ```` ``` ````는 언어를 적고 Enter를 칠 때 코드 블록이 된다. 기존 편집기는 세 번째 백틱에서 바로 JavaScript 블록이
    되어 언어를 칠 수 없었다.
  - 제목 첫머리 Backspace는 제목을 문단으로 바꾼다. 기존 편집기는 앞 문단에 글을 붙였다.
  - 체크된 작업 항목에서 Enter를 치면 체크 안 된 새 항목이 생긴다.
  - `[ ] `를 치면 작업 항목이 된다.
- **이식 범위:** "편집기 로직 제대로 완전히 옮겨." 기존 편집기의 편집 동작은 빠짐없이 옮기는 것이 기본이다.

## 2. 작업 위치와 상태

- **브랜치·워크트리:** `codex/web-source-editor`, `.worktree/web-source-editor`
  - P3e 구현 커밋은 `5d99661f`, P3f 구현 커밋은 `2948fd42`다. PR은 아직 없다.
  - main에는 사용자가 끝났다고 명시적으로 확인한 뒤에만 병합한다.
- **아티팩트:** `.intent/intent_web-source-editor.md`(수락됨), `spec_web-source-editor.md`(R1~R10, 단계 P0~P6),
  `plan_web-source-editor-p0.md` `-p1.md` `-p2.md` `-p2c.md`. 계획 파일 끝에 단계별 결과가 있다.
- **변경 기록:** `.changeset/live-editor-mode.md`가 이미 있다. P3 이후 사용자에게 보이는 동작이 크게 바뀌면 문구를 고친다.
- **확인 대기:** 사용자는 P2c 결과(블록 기호 전환, Backspace 되돌리기, Tab, 단축키)를 아직 확인하지 않았다. 새 세션은
  사용자의 확인 결과나 다음 지시부터 받는다.

### P3a 추가 (2026-09-29)

- `.intent/plan_web-source-editor-p3a.md`에 범위와 검증 결과를 적었다.
- `packages/core/src/editing-model/block-widget.ts`가 코드 언어·본문과 표 칸의 원문 범위를 계산하고 해당 범위만 고친다.
  `fixtures/widget.json`으로 원문 충실도 사례를 공유한다.
- `packages/app/src/editor/live/block-widgets.ts`가 코드·표를 CodeMirror 블록 위젯으로 그린다. 표 칸은 같은 `live`
  확장을 쓰는 작은 CodeMirror 편집기다. 원격 변경이 와도 활성 칸의 DOM을 유지한다.
- 코드 울타리와 표 정렬선은 화면에서 숨고, 칸의 Markdown 서식도 숨긴다. `|` 입력은 `\|`로 저장한다.
- P3a 브라우저 확인 문서: `http://localhost:5183/#/p3a-widget-review-1790688703232` (기존 임시 콘텐츠 폴더가
  살아 있는 동안만 접근 가능). 코드 본문과 표 칸 편집 후 새로고침해 저장을 확인했다.
- 뒤에 남은 P3: 들여쓴 코드, 수식, Mermaid, 콜아웃·아코디언, 이미지·파일 임베드, MDX, 인라인 데이터베이스,
  frontmatter. P2c 사용자 확인도 아직 별도로 받지 않았다.

### P3b 추가 (2026-09-29)

- `.intent/plan_web-source-editor-p3b.md`에 범위와 검증 결과를 적었다. `diagramWidgetSource`가 `DollarMath`,
  `MathFence`, `MermaidFence`의 본문 범위를 core 파서로 찾고 `diagram-body`가 그 범위만 바꾼다.
- `packages/app/src/editor/live/diagram-widgets.ts`가 기존 KaTeX·Mermaid 렌더러를 위젯 미리보기에 쓴다. 입력은
  별도 본문 칸에서 원문으로 보낸다. 블록 장식의 세로 margin을 제거해 CodeMirror의 높이 계산을 따른다.
- 브라우저 확인 문서: `http://localhost:5183/#/p3b-widget-review-1790690021249` (임시 콘텐츠 폴더가 살아 있는 동안).
  수식·Mermaid 표시와 본문 수정 후 새로고침 저장을 확인했다.
- 뒤에 남은 P3: 콜아웃·아코디언, 이미지·파일 임베드, MDX, 인라인 데이터베이스, frontmatter, 들여쓴 코드.

### P3c 추가 (2026-09-29)

- `.intent/plan_web-source-editor-p3c.md`에 범위와 검증 결과를 적었다.
- `live` 모드가 기존 문서 헤더·속성 패널을 보여 주고 편집기에서는 YAML 원문을 숨긴다. 일반 문서 속성 값 변경은
  기존 바인딩으로 Y.Text에 반영된다. 사용자 입력으로 숨겨진 YAML을 삭제하는 트랜잭션은 막는다.
- 브라우저 확인 문서: `http://localhost:5183/#/p3c-properties-review-1790690376095` (임시 콘텐츠 폴더가 살아 있는 동안).
  `status` 변경 후 원문과 새로고침 상태를 확인했다. `source`는 YAML 원문, `wysiwyg`·`live`는 속성 패널을 보여 준다.
- 실제 데이터베이스 레코드 `untitled_database_creation_f7d8cf21243447af95e2cbc0437bd7f9/rec_89fa230961f9421b93781c6987ee9dc4`
  에서도 `live` 속성 화면이 열렸다. `_sn` 원문이 화면에 보이지 않고 사용자 삭제 트랜잭션은 차단됐다.
- 뒤에 남은 P3: 콜아웃·아코디언, 이미지·파일 임베드, MDX, 인라인 데이터베이스, 들여쓴 코드.

### P3d 추가 (2026-09-29)

- `.intent/plan_web-source-editor-p3d.md`에 범위와 결과를 적었다.
- `containerWidgetSource`가 GFM 콜아웃과 MDX Callout·Accordion의 제목·종류·본문 원문 위치를 구한다.
  GFM 본문의 `>` 접두어는 화면에서 숨기고 오프셋 매핑으로 편집한다.
- `packages/app/src/editor/live/container-widgets.tsx`가 기존 Callout·Accordion 렌더러 안에 작은 live 편집기를 둔다.
- 기존 컴포넌트의 `titleSlot`으로 제목 입력을 렌더링해 별도 제목 줄이 중복되지 않는다. 콜아웃 종류 선택기는 상단에 둔다.
- 브라우저 확인 문서: `http://localhost:5183/#/p3d-container-review-1790692005552` (임시 콘텐츠 폴더가 살아 있는 동안).
  세 위젯의 제목·종류·본문을 수정하고 새로고침 뒤 원문 유지를 확인했다.
- 뒤에 남은 P3: 이미지·파일 임베드, 일반 MDX 컴포넌트, 인라인 데이터베이스, 들여쓴 코드, 레거시 HTML details.

### P3e 추가 (2026-09-29)

- `.intent/plan_web-source-editor-p3e.md`에 범위와 결과를 적었다.
- `mediaWidgetSource`가 Markdown·위키·MDX 이미지·파일·Embed의 편집 가능한 원문 범위를 찾는다.
  `packages/app/src/editor/live/media-widgets.tsx`가 기존 Image·File·Embed 컴포넌트를 블록·인라인 위젯으로 그린다.
- SourceEditor가 문서 이름과 자산·파일 목록을 live 확장에 전달한다. 기존 URL 안전 검사, 문서 상대 경로,
  위키 파일명 해석을 적용한다. 위험한 URL의 `#`을 문서 경로로 바꾸던 공통 정규화 문제도 고쳤다.
- 브라우저 확인 문서: `http://localhost:5183/#/notes/p3e-media-review-1790693239824` (임시 콘텐츠 폴더가 살아 있는 동안).
  네 이미지가 같은 테스트 자산으로 표시됐고 Markdown·위키·MDX 속성을 편집·새로고침했다.
- 뒤에 남은 P3: 일반 MDX, 인라인 데이터베이스, 들여쓴 코드, 레거시 HTML details, 참조 이미지, 명시적 PDF 뷰어.

### P3f 추가 (2026-09-30)

- `.intent/plan_web-source-editor-p3f.md`에 범위와 결과를 적었다.
- `live-portals.tsx`가 CodeMirror 뷰별 위젯 포털을 `SourceEditor`의 React 문맥에서 그린다. 캐시된 뷰를 다시 붙여도 문맥이 유지된다.
- core `mdx-widget.ts`가 일반 MDX의 리터럴 속성과 본문 원문 범위를 계산한다. 실행 가능한 MDX 표현식은 평가하지 않는다.
- `mdx-widgets.tsx`가 기존 컴포넌트 맵으로 `DatabaseView`, `Math`, 알 수 없는 MDX를 그린다. 인라인 데이터베이스 그리드에서 레코드를 추가하고 저장·새로고침을 확인했다.
- 브라우저 확인 문서: `http://localhost:5183/#/notes/p3f-mdx-review-1790694262228` (임시 콘텐츠 폴더가 살아 있는 동안). 중첩 컴포넌트 확인 문서는 `http://localhost:5183/#/notes/p3f-nested-mdx-1790694898070`다.
- PDF 외형은 표시됐지만 내용은 `live`·기존 `wysiwyg` 양쪽에서 `Loading PDF`에 머물렀다. PDF 내용 렌더링은 확인되지 않았다.
- 뒤에 남은 P3: Tabs/Tab과 Mirror의 복합 자식, 복합 속성 편집, 들여쓴 코드, 레거시 HTML details, 참조 이미지.

### P3g 추가 (2026-09-30)

- `.intent/plan_web-source-editor-p3g.md`에 범위와 결과를 적었다.
- 네 칸·탭 들여쓰기 코드의 접두어를 위젯에서 숨기고, 본문 입력을 기존 들여쓰기 종류로 원문에 기록한다. 들여쓴 코드에는 언어 입력이 보이지 않는다.
- core 위젯·fixture와 앱 live DOM 테스트에서 들여쓴 코드 편집 및 기존 울타리 코드 동작을 확인했다.
- 뒤에 남은 P3: Tabs/Tab과 Mirror의 복합 자식, 복합 속성 편집, 레거시 HTML details, 참조 이미지. PDF 내용 렌더링도 다시 확인해야 한다.

### P3h 추가 (2026-09-30)

- `.intent/plan_web-source-editor-p3h.md`에 범위와 결과를 적었다.
- core 파서가 `HtmlDetailsAccordion`으로 판별한 `<details>`를 기존 아코디언 위젯으로 연결했다. 제목과 본문만 원문 범위별로 고치고 `open`·`name`·`id`를 보존한다.
- core 위젯·fixture 51개와 앱 live DOM 124개 테스트가 통과했다.
- 뒤에 남은 P3: Tabs/Tab과 Mirror의 복합 자식, 복합 속성 편집, 참조 이미지. PDF 내용 렌더링도 다시 확인해야 한다.

### P3i 추가 (2026-09-30)

- `.intent/plan_web-source-editor-p3i.md`에 범위와 결과를 적었다.
- core `tabs-widget.ts`가 직접 자식 Tab의 원문 범위를 찾고 라벨·본문·추가·삭제를 해당 범위에 적용한다. 중첩 Tabs는 부모의 본문 안에서 별도로 그린다.
- 앱 `tabs-widgets.tsx`가 React 포털에서 탭 목록, 키보드 전환, 활성 패널 본문 편집을 그린다. 캐시된 뷰의 포털 호스트를 다시 붙여도 활성 탭을 유지한다.
- core 위젯·fixture 56개, 앱 Tabs DOM 3개와 기존 live DOM 124개, core·app 타입 검사가 통과했다. 이후 브라우저에서 `http://localhost:5183/#/notes/p3i-tabs-review-1790696000000`의 탭 전환과 라벨·본문 수정, 디스크 저장을 확인했다.
- 뒤에 남은 P3: 참조 이미지, Mirror의 소스 열기·속성 제어, 복합 MDX 속성 편집. PDF 내용 렌더링도 다시 확인해야 한다.

### P3j 추가 (2026-09-30)

- `.intent/plan_web-source-editor-p3j.md`에 범위와 결과를 적었다.
- `reference-definition.ts`가 증분 레이아웃의 정의 블록을 색인한다. 참조 이미지 세 형태가 같은 정의 URL을 렌더링하고 이미지·정의 위젯의 편집이 해당 원문 범위로 간다.
- 브라우저 확인 문서: `http://localhost:5183/#/notes/p3j-reference-review-1790696100000` (임시 콘텐츠 폴더가 살아 있는 동안). 세 이미지 표시, URL·대체 텍스트 편집, 저장·새로고침, 입력 포커스 유지를 확인했다.
- core 관련 65개, 앱 live DOM 125개 테스트와 core·app 타입 검사가 통과했다.
- 뒤에 남은 P3: Mirror의 소스 열기·속성 제어, 복합 MDX 속성 편집. PDF 내용 렌더링도 다시 확인해야 한다.

### P3k 추가 (2026-09-30)

- `.intent/plan_web-source-editor-p3k.md`에 범위와 결과를 적었다.
- 일반 MDX에서 문자열·숫자·불리언·JSON 리터럴 속성을 원문 범위별로 수정하고 등록된 속성을 추가한다. 실행 가능한 표현식은 평가하지 않는다. 잘못된 JSON은 원문을 보존하고 오류를 표시한다.
- Mirror에 소스 열기 링크를 달았다. 브라우저 확인 문서: `http://localhost:5183/#/notes/p3k-mirror-review-1790696200000` (임시 콘텐츠 폴더가 살아 있는 동안). MirrorSource를 별도 문서에서 편집하면 열린 Mirror가 갱신됐고 링크 이동·속성 저장도 확인했다.
- core 위젯·fixture 66개, 앱 live DOM 125개와 MDX DOM 3개, core·app 타입 검사가 통과했다.
- 뒤에 남은 P3: PDF 내용 렌더링 확인 및 발견되는 블록 충실도 결함. 그 뒤 P4 기능 이전으로 넘어간다.

### P3l 추가 (2026-09-30)

- `.intent/plan_web-source-editor-p3l.md`에 범위와 결과를 적었다.
- PDFium Blob 워커가 상대 WASM URL을 파싱하지 못해 `wasmError`를 보냈다. `pdfium-engine.ts`가 절대 URL을 전달하도록 고쳐 워커의 `ready`·`result` 응답을 확인했다.
- P3f의 `real-draft.pdf` QA 자산은 xref·트레일러가 없는 잘못된 파일이었다. `pdfinfo`를 통과한 유효한 1페이지 PDF로 다시 시험했다.
- 브라우저 확인 문서: `http://localhost:5183/#/notes/p3l-valid-pdf-review-1790696300000` (임시 콘텐츠 폴더가 살아 있는 동안). `live`와 기존 시각 편집기 모두 1페이지를 렌더링했고, `live` 페이지 이미지에서 `SynapseNote PDF QA` 문구를 확인했다.
- PDF DOM 11개, app 타입 검사와 변경 파일 Biome 검사가 통과했다. P3에서 알려진 PDF 로딩 미확인 항목은 해소됐다.
- 다음은 P3 명세의 블록 목록과 실제 위젯을 대조해 남은 항목을 채운 뒤 P4 기능 이전, P5 검증, P6 교체·제거다.

### P3m 추가 (2026-09-30)

- `.intent/plan_web-source-editor-p3m.md`에 범위와 결과를 적었다.
- core 주석 프로모터가 블록 주석의 mdast 위치를 보존한다. `live`는 수평선, 각주 참조·정의, 인라인·블록 주석의 원문 기호를 위젯으로 가리고 본문 편집을 원문 범위에 쓴다.
- 브라우저 확인 문서: `http://localhost:5183/#/notes/p3m-block-review-1790696400000` (임시 콘텐츠 폴더가 살아 있는 동안). 위젯 표시, 각주·주석 편집, 디스크 저장·새로고침을 확인했다.
- core 관련 112개, 앱 live DOM 128개 테스트와 core·app 타입 검사가 통과했다.
- 남은 P3 점검: SPEC의 일반 HTML 블록은 현재 core 파서에서 문단 텍스트로 나온다. 이 차이를 해결하고 나머지 블록 누락을 대조한 뒤 P4로 간다.

## 3. 끝난 단계

### P4a 추가 (2026-09-30)

- `.intent/plan_web-source-editor-p4a.md`에 범위와 결과를 적었다. `live/slash-suggestions.ts`가 기본 블록 명령과 표·수평선·수식·Mermaid·주석을 기존 CodeMirror 자동완성에 등록한다.
- 메뉴의 Enter·Tab·화살표·Escape가 live 편집 키맵보다 먼저 처리된다. 빈 문단 제목 변환도 core에서 고쳤다.
- 브라우저 확인 문서: `http://localhost:5183/#/notes/p4a-slash-review-1790696500000`. `/h2` 메뉴·Enter 선택·제목 입력·디스크 저장을 확인했다.
- 위키 링크 자동완성은 기존 `createNestedCMExtensions`에서 이미 top-level live에 등록되어 있었다. 실제 동작 검증과 태그·링크 편집·중첩 선택기는 후속 P4에서 처리한다.
- 데이터베이스 생성·미디어 업로드·전체 컴포넌트 카탈로그는 아직 슬래시 메뉴에 옮기지 않았다.

### P4b 추가 (2026-09-30)

- `.intent/plan_web-source-editor-p4b.md`에 범위와 결과를 적었다. `tag-suggestion-data.ts`의 공통 API·순위·새 태그 판별을 기존 편집기와 live가 공유한다.
- live 태그 선택은 `#태그 `를 원문에 쓰고, 중첩 live 편집기에 위키·태그·슬래시 자동완성을 연결했다. 코드 영역에서는 선택기를 막는다.
- 브라우저 확인 문서: `http://localhost:5183/#/notes/p4b-suggestions-review-1790696600000`. top-level 태그·위키 링크와 콜아웃 내부 태그·위키 선택·디스크 저장을 확인했다.
- 기존 태그 24개, live 태그·중첩 DOM 4개, slash DOM 4개, live DOM 129개와 app 타입 검사가 통과했다.
- 다음 P4는 링크 편집 창, 전체 슬래시 작업 흐름, 도구 막대·메모·협업 표시·내보내기다. P3 HTML 해석 차이와 P5~P6도 남아 있다.

| 단계 | 커밋 | 내용 |
|---|---|---|
| P0 | `86b2d405` | 편집 모델 명세 `packages/core/src/editing-model/SPEC.md`, fixture 형식과 `hide.json`·`edit.json` |
| P1 | `d4e971f3` | core 편집 모델: `layout.ts`(숨김·위젯·서식 범위), `edit.ts`(입력·삭제·Enter·붙여넣기·서식) |
| P2a | `225802bb` | `IncrementalLayout`(편집된 블록만 다시 파싱), `applyActionsInWindow`(커서 주변 블록만 편집) |
| P2b | `20b63281` | 앱 `live` 모드: `packages/app/src/editor/live/live-extension.ts`, `styles/editor/live-mode.css`, 모드 전환 |
| — | `68040e03` | 줄 첫머리 블록 기호는 스페이스·Enter에서 블록이 된다 |
| P2c | `ce0ef92f` | 기존 편집기 동작 이식(아래), 번호 목록 표시 번호, 블록 안 원문 편집, 레이아웃 캐시 |
| P3a | `0791f80f` | 코드 울타리·표의 편집 가능한 블록 위젯과 범위별 원문 변경 |
| P3b | `124a9b53` | 수식·Mermaid의 편집 가능한 미리보기와 범위별 원문 변경 |
| P3c | `02c7dd76` | `live` 문서 속성 패널과 숨긴 YAML 보호 |
| P3d | `ea1f2f51` | GFM·MDX 콜아웃과 아코디언의 편집 가능한 블록 위젯 |
| P3e | `5d99661f` | Markdown·위키·MDX 이미지·파일 임베드 위젯 |
| P3f | `2948fd42` | React 문맥을 가진 일반 MDX·인라인 데이터베이스 위젯 |
| P3g | `4839148b` | 네 칸·탭 들여쓰기 코드 위젯 |
| P3h | `b471aa42` | HTML details 아코디언 위젯 |
| P3i | `7fe9ed4d` | Tabs/Tab 전환·편집 위젯 |
| P3j | `e1328035` | 참조 이미지와 정의 위젯 |
| P3k | `957ef47a` | MDX 리터럴 속성 편집과 Mirror 소스 이동 |
| P3l | `98ab051f` | PDFium 워커 절대 URL과 실제 페이지 렌더링 |
| P3m | `09adf41d` | 수평선·각주·주석 위젯 |
| P4a | `63b969aa` | 기본 live 슬래시 명령 |
| P4b | 구현 커밋은 `git log -1` | 태그·중첩 위키/슬래시 선택기 |

P2c에서 옮긴 동작은 다음과 같다. 각 동작의 근거 파일은 `plan_web-source-editor-p2c.md`에 있다.

- **목록 전환:** 목록 항목 첫머리에서 `1. ` `- ` `[ ] `를 치면 목록 종류가 바뀐다.
- **입력 규칙 되돌리기:** 규칙이 적용된 바로 다음 Backspace는 친 글자를 되살린다.
- **수평선·코드 블록:** `---`, `***␣`, `___␣`는 수평선이 되고, `~~~lang␣`은 코드 블록이 된다.
- **Enter:** 인용을 이어 쓰거나 빠져나가고, 제목을 나누고, 중첩된 빈 항목을 내어 쓰고, 코드 안에서는 줄바꿈을 넣는다.
  Shift-Enter는 코드 블록을 빠져나간다.
- **Tab·Shift-Tab:** 목록 항목을 들이고 내어 쓴다. 번호 목록에서도 중첩되고, 최상위 항목의 Shift-Tab은 문단을 만든다.
- **삭제:** 중첩 항목 Backspace는 목록 밖 문단을 만든다. Delete는 다음 블록을 합친다.
- **단축키:** Cmd+Alt+0~6, Cmd+Shift+7/8/9, Cmd+Shift+B, Cmd+Alt+C, Cmd+Shift+S, Cmd+Shift+↑/↓.
- **붙여넣기:** 기존 편집기와 같은 기준으로 형식을 고른다(`clipboard/is-markdown.ts`, `shift-tracker.ts`를 다시 쓴다).

## 4. 남은 일 (순서대로)

1. **사용자 확인 반영.** 사용자가 P2c에서 빠진 동작을 찾으면 기존 편집기 코드에서 근거를 확인하고 옮긴다. 확인 대상은
   `packages/core/src/extensions/list.ts`, `packages/app/src/editor/extensions/*`, `node_modules/@tiptap/*`다.
   명세(SPEC.md)와 fixture를 먼저 고치고 구현한다.
2. **아직 옮기지 않은 기존 편집기 기능.** 사용자에게 P4로 미룬다고 말해 두었다.
   - 화면 기능: 슬래시 메뉴(`/`), `[[` 위키 링크 선택기, `#` 태그 선택기, Cmd+K 링크 편집 창.
   - 옮기지 않는 기능: 일반 문단 Tab 들여쓰기(탭으로 시작하는 Markdown 줄은 코드 블록이 된다), Cmd+U 밑줄(Markdown
     구문이 없다).
   - 엔진은 `ui: 'slash-menu' | 'wiki-link-suggest'`를 이미 돌려주지만, 앱은 아직 이 값을 쓰지 않는다.
3. **R9 16ms 미달.**
   - P2b 브라우저 측정: 방해 없는 첫 키 입력→화면 반영 약 35ms. 이벤트 처리는 live가 keypress 19ms + input 10ms,
     source가 5ms + 4ms다.
   - live가 더하는 약 20ms 중 우리 코드 몫은 엔진 3.5ms, 레이아웃 2.8ms, 장식 0.2ms, dispatch 6ms다. 나머지 약
     10ms(장식 반영이나 React `input` 처리로 보임)는 아직 나누지 못했다.
   - P2c 뒤 core 창 편집은 p95 5.0ms로 줄었지만 브라우저에서는 다시 재지 않았다.
   - 다음 할 일: `use-document-stats` 문제(5절)를 비켜서 브라우저에서 다시 재고, 장식 반영과 React 처리를 나눠 잰다.
4. **P3 블록 위젯.** 대상: 코드 블록, 표(칸 단위), 수식, Mermaid, 콜아웃·아코디언, 이미지·파일 임베드, MDX 컴포넌트,
   인라인 데이터베이스, frontmatter.
   - 코드 울타리·표·수식·Mermaid·콜아웃·아코디언·이미지·파일 임베드는 P3a·P3b·P3d·P3e에서 위젯으로 옮겼다.
     frontmatter는 P3c에서 속성 패널로 연결했다.
     들여쓴 코드는 P3g에서 위젯으로 옮겼다. 나머지 블록은 아직 원문 그대로 보인다.
   - 남은 위젯을 그리면 `editBlockSource`의 원문 편집 경로를 해당 위젯 편집으로 바꾼다. 속성 변경은 해당 원문 범위만 바꾼다.
5. **P4 기능 이전.**
   - 슬래시 메뉴, 도구 막대, 찾기.
   - 메모: 원문 앵커로 바꾸고, 기존 `wysiwyg` 앵커를 변환한다.
   - 에이전트 쓰기 표시, 협업 커서, 아웃라인 이동.
   - PDF 내보내기: 파싱 → HTML 경로로 바꾼다.
   - 블록 속성 편집: `setNodeMarkup` 대신 원문을 바꾼다.
   - 임베드 `src` 해석.
6. **P5 검증.**
   - 동시 편집: 세 작성자 시뮬레이터(`codex/concurrent-edit-duplication`의 `concurrent-writers.test-helper.ts`)의 웹
     작성자를 새 편집기 명령으로 바꿔 1,000 seed를 돌린다. 실제 서버 soak(38·1,000·5,000줄, 10분)를 돌린다.
   - IME: 조합 중 원격 편집이 와도 조합이 유지되는지 DOM 테스트로 확인한다. P2에서 계획했다가 여기로 미뤘다.
   - 충실도: 편집마다 바뀐 원문 바이트가 명세대로인지 확인한다.
7. **P6 교체와 제거.** 기본 편집기를 `live`로 바꾸고 Tiptap 편집기, 공유 트리, 서버 동기화 계층을 지운다. 지울 파일
   목록은 spec의 "현재 상태"에 있다. 그 뒤 `large-doc-concurrent-load`를 다시 잰다.

## 5. 이 브랜치 밖의 기존 문제

main에도 있는 문제다. 작업 칩 두 개를 사용자에게 제안해 두었다.

- **큰 문서 동기화 끊김.**
  - 모든 모드에서 숨겨진 Tiptap(`.ok-mode-hidden`)이 fragment에 묶여 있다.
  - 5,000줄 문서를 열 때마다 y-tiptap이 ContentFormat 4,704개(약 1.1MB)를 쓴다. 서버가 1MB 메시지 제한
    (`packages/app/src/server/hocuspocus-plugin.ts`의 `MAX_COLLAB_MESSAGE_BYTES`)으로 끊는다. 클라이언트는 1초마다
    재연결하고 편집은 서버에 가지 않는다.
  - 1MB 제한은 올바른 방어다. 고칠 곳은 쓰는 쪽이다. P6에서 사라진다.
- **글자 수 통계.** `packages/app/src/hooks/use-document-stats.ts`가 변경 300ms 뒤 `computeBodyStats`를 돌린다.
  5,000줄에서 한 번에 330~400ms 동안 메인 스레드를 막는다.
- **입력하지 않은 줄.**
  - P2c 브라우저 확인 중 sample 문서에 입력하지 않은 `- 1\. ` 줄이 한 번 생겼다.
  - Y.Text 관찰기를 켜고 되풀이했을 때는 생기지 않았다.
  - 코드를 저장할 때마다 Vite가 페이지를 다시 불러오고, 숨겨진 Tiptap이 fragment를 다시 쓴다. 서버 브리지가 이 쓰기를
    Y.Text에 병합하므로 이 병합이 유력한 원인이다. 확정하지는 못했다.
  - 브라우저에서 입력하지 않은 글자가 보이면 엔진을 의심하기 전에 Y.Text 트랜잭션의 `tr.local`과 origin부터 기록한다.
- **main에서도 실패하는 테스트.**
  - `EditorActivityPool.test.ts`, `EditorActivityPool.lazy.test.ts`, `EditorArea.test.ts`: lingui 매크로가 컴파일 밖에서
    실행된다.
  - `api-agent-patch`와 `surrogate-normalizer`: 한 프로세스에서 같이 돌릴 때만 실패한다.

## 6. 코드 지도

- **core** `packages/core/src/editing-model/`
  - `SPEC.md`: 편집 규칙. 절마다 fixture group id를 괄호로 인용한다. `fixtures.test.ts`가 모든 group이 인용됐는지
    검사한다.
  - `fixtures/hide.json`, `fixtures/edit.json`: 적합성 사례. 표기는 `⟨⟩` 숨김, `⦃⦄` 위젯, `│` 커서, `⟪⟫` 선택이다.
    동작 종류는 `text`·`key`·`toggle`·`block`·`move`·`paste`·`copy`다(`fixtures.ts`의 `EditAction`).
  - `layout.ts`: `computeLayout`은 core 파서의 mdast에서 숨김·위젯·서식·span을 만든다. 번호 항목 위젯은 `label`에
    Markdown이 읽는 번호를 담는다.
  - `edit.ts`: `applyActions`와 `EditState`.
    - `EditState`는 `source`, `anchor`, `head`, `side`, `pending`, `undo`를 담는다.
    - 입력은 `typeCharAt` → `blockMarkerInput`(블록 기호·목록 전환·수평선) → `keepsLayout` → `closesMarkAt`(서식
      규칙) → `literalChar`(글자 그대로 두기) 순으로 처리한다.
    - 키는 `backspace`·`deleteForward`·`enter`·`indentItem`이 처리한다.
    - 블록 동작은 `setBlock`·`moveBlock`, 블록 원문 편집은 `editBlockSource`가 처리한다.
    - `layoutOf`는 마지막 원문의 레이아웃을 캐시한다.
  - `incremental-layout.ts`, `window.ts`: 블록 단위 증분 레이아웃과 커서 주변 창 편집. `undo`는 창 좌표와 문서 좌표
    사이에서 옮긴다.
  - `changes.ts`: `sourceChanges`는 편집 결과를 코드 포인트 경계의 최소 변경으로 바꾼다.
  - `block-widget.ts`: 코드 언어·본문과 표 칸의 원문 범위, 해당 범위만 바꾸는 위젯 편집 규칙.
    P3e에서는 미디어 속성 범위도 여기에 추가했다.
- **app**
  - `packages/app/src/editor/live/live-extension.ts`: 레이아웃 StateField, 커서 의도 필드(`side`·`pending`·`undo`),
    keymap, inputHandler(IME 조합 중에는 건너뜀), 붙여넣기·복사, 장식과 위젯.
  - `packages/app/src/editor/live/block-widgets.ts`: 코드·표 블록 위젯, 표 칸 안의 작은 live 편집기.
  - `packages/app/src/editor/live/diagram-widgets.ts`: 수식·Mermaid 본문 입력과 기존 렌더러 미리보기.
  - `packages/app/src/editor/live/container-widgets.tsx`: 콜아웃·아코디언 렌더링과 내부 live 편집기.
  - `packages/app/src/editor/live/media-widgets.tsx`: 이미지·파일·Embed 미리보기와 속성 편집.
  - `SourceEditor.tsx`: `variant` Compartment로 source와 live를 바꾼다.
  - `use-editor-mode.ts`: 모드는 `'wysiwyg' | 'source' | 'live'`이고 localStorage 키는 `ok-editor-mode-v1`다.

## 7. 검증

```bash
bun run test:file -- $(ls packages/core/src/editing-model/*.test.ts)
bun run test:file -- packages/app/src/editor/live/live-extension.dom.test.tsx
```

- P2c 결과: core 158개 통과(무작위 편집 2,840건 실패 0, 5,008줄 창 편집 p50 3.4ms / p95 5.0ms). live DOM 108개 통과.
- P3a 추가 검증: core 블록 범위·fixture 테스트 16개와 live DOM 113개 통과. core·app 타입 검사 통과. 브라우저에서
  코드 본문·표 칸 수정 후 새로고침해 저장을 확인했다.
- P3b 추가 검증: core 위젯·fixture 테스트 20개와 live DOM 115개 통과. core·app 타입 검사 통과. 브라우저에서
  수식·Mermaid 렌더링, 편집, 새로고침 저장을 확인했다.
- P3c 추가 검증: live DOM 116개와 app 타입 검사 통과. 브라우저에서 속성 패널 편집·저장 및 모드별 표시를 확인했다.
- P3d 추가 검증: core 관련 테스트 66개, live DOM 118개, 기존 컴포넌트 테스트 10개 통과. core·app 타입 검사 통과. 브라우저에서
  GFM·MDX 콜아웃과 아코디언 표시·편집·새로고침 저장을 확인했다.
- P3e 추가 검증: core 관련 테스트 79개, live DOM 121개, 미디어 경로 테스트 통과. core·app 타입 검사 통과.
  브라우저에서 문서 상대·위키 파일명 경로, 편집·새로고침, 위험 URL 렌더링 제한을 확인했다.
- **DOM 테스트:** edit fixture를 실제 EditorView의 inputHandler와 keymap으로 재생한다. 키 이벤트는 브라우저처럼
  보낸다(Shift는 글자를 대문자로 바꾸고 `keyCode`를 넣는다). 이렇게 하지 않으면 Cmd+Shift+B가 Cmd+B로 잡힌다.
- **새 동작을 넣는 순서:** SPEC.md 문구 → `edit.json` fixture → `edit.ts` → 앱 keymap → DOM 테스트 대응표.
- **브라우저 측정.**
  - 페이지 안에서 잰다. Event Timing, Long Animation Frame 관찰기를 쓴다. MCP 왕복 시간은 결과를 흐린다.
  - MCP로 키를 몰아 보내면 표시 지연이 쌓인다. 키 사이에 0.4초씩 둔다.
  - 관찰기를 다시 설치하기 전에 이전 관찰기를 끊는다. 끊지 않으면 항목이 두 번 쌓인다.
- **브라우저 창 스크린샷은 늦게 갱신된다.** 원문은 DOM에서 읽는다.
  - 원문: `import('/node_modules/.vite/deps/@codemirror_view.js')` → `EditorView.findFromDOM(document.querySelector('.cm-editor'))`
  - Y.Text: `view.plugins.find(p => p.value?.conf?.ytext).value.conf.ytext`

## 8. 로컬 실행 환경

- **dev 서버.**
  - 메인 체크아웃의 `.claude/launch.json`(git 무시)에 `web-source-editor` 항목이 있다(포트 5183).
  - 명령: `OK_TEST_CONTENT_DIR=<테스트 콘텐츠 폴더> bun run --cwd .worktree/web-source-editor/packages/app dev -- --port 5183 --strictPort`
  - 이 항목은 이전 세션의 임시 폴더를 가리킨다. 새 세션은 자기 임시 폴더에 콘텐츠를 만들고 경로를 고친다.
- **테스트 콘텐츠.**
  - `sample.md`: 제목, 서식, 목록, 번호 목록(원문 번호를 모두 `1.`로 적음), 작업 항목, 인용, 코드 블록, 위키 링크,
    태그를 담는다.
  - `large.md`: 5,000줄. `## Section N` 아래에 서식과 링크가 든 문단 8줄, 작업 항목 2개와 불렛 하나, 인용 한 줄을
    되풀이한다.
- **IndexedDB.** 측정이나 동기화를 확인하기 전에 `ok-ydoc:*` IndexedDB를 지운다. 같은 origin의 다른 경로(예:
  `/favicon.ico`)로 이동한 뒤 `indexedDB.deleteDatabase`를 호출한다.
  - 큰 문서는 5절 문제 때문에 브라우저에서 동기화를 확인할 수 없다. 동기화는 sample 문서로 확인한다.
- **모드 전환.** `localStorage.setItem('ok-editor-mode-v1', 'live')`를 실행한 뒤 새로 고친다. 해시 이동만으로는
  모드가 바뀌지 않는다.

## 9. 저장소 규칙 중 놓치기 쉬운 것

- `gh`는 항상 `--repo Nedian0Brien/SynapseNote`로 쓴다. 기본값은 upstream `inkeep/open-knowledge`로 잡힌다.
- 새 UI 문자열을 넣으면 `packages/app`에서 `bun run i18n`을 돌린다. 이 명령은 관계없는 오래된 항목도 함께 정리한다.
  커밋 메시지에 그 사실을 적는다.
- 사람의 확인은 intent 수락 한 번이다. 단계마다 `plan_*.md`를 쓰고 커밋한 뒤 바로 진행한다. 결과는 같은 plan 파일에
  적는다.
- 스테이징은 파일을 이름으로 지정한다. 다른 세션의 작업이 같은 저장소에 있다.
- 응답의 파일 링크는 `.worktree/web-source-editor/` 접두사를 붙인 경로로 건다.

## 10. 다른 진행 중인 일

| 항목 | 상태 |
|---|---|
| `large-doc-concurrent-load` | intent 수락됨. 이 작업 뒤 진행(워크트리 있음) |
| `native-local-store`, `database-mutation-roundtrips` | intent 초안, 수락 대기 |
| `codex/concurrent-edit-duplication` | web-source-editor로 대체됨. 워크트리 삭제 여부를 사용자에게 물었고 답이 없다 |
| `codex/native-editor-spike`, `codex/server-remote-access` | 푸시됨, 병합 안 됨 |
