# 편집 모델 명세

SynapseNote의 편집기는 Markdown 원문(`Y.Text('source')`)을 직접 편집한다. 화면에는 원문의 Markdown 기호를 숨기고
서식을 그려 보이며, 사용자의 조작을 원문 편집으로 바꾼다. 이 문서는 웹 편집기(CodeMirror 6)와 네이티브 편집기
(TextKit 2)가 함께 따르는 규칙이다. 규칙마다 적합성 사례(`fixtures/*.json`의 id)를 적는다. 두 편집기는 같은 사례로
검사한다.

원문 해석의 기준은 core 파서(`packages/core/src/markdown`)다. 이 문서의 구문 이름은 그 파서의 mdast 노드를 가리킨다.

## 1. 용어

- **원문**: 파일에 저장되는 Markdown 텍스트. 편집의 유일한 대상이다.
- **표시 텍스트**: 원문에서 숨긴 범위를 빼고 위젯을 대신 넣은 것. 사용자가 보는 글자다.
- **숨긴 범위**: 화면에 그리지 않는 원문 범위(서식 기호, 링크 주소 등). 커서는 숨긴 범위 안에 놓이지 않는다.
- **위젯**: 원문 범위 하나를 대신해 그리는 화면 요소. 인라인 위젯(체크박스, 목록 기호, 이미지)과 블록
  위젯(표, 코드 블록, 수식, MDX 컴포넌트 등)이 있다. 위젯의 편집은 그 원문 범위의 바이트만 바꾼다.
- **경계 위치**: 표시 텍스트에서는 한 자리지만 원문에서는 숨긴 범위 양쪽 두 자리인 위치(예: `**굵게**│` 뒤).
  경계 위치의 입력이 어느 쪽으로 들어갈지는 4절이 정한다.

## 2. 원문 보기

원문은 사용자가 원문 보기로 바꿨을 때만 보인다. 편집 화면에서는 커서가 들어간 문단·표에서도 기호를 드러내지 않는다.

## 3. 숨김 규칙

| 구문 | 원문 예 | 숨기는 것 | 그리는 것 | fixture |
|---|---|---|---|---|
| 제목 | `## 제목` | `## ` | 제목 크기·굵기 | hide.heading |
| 굵게·기울임·취소선·강조 | `**a**` `*a*` `_a_` `~~a~~` `==a==` | 여는·닫는 기호 | 서식 | hide.emphasis, hide.nested |
| 인라인 코드 | `` `a` `` | 백틱 | 코드 글꼴 | hide.code |
| 링크 | `[글](주소 "제목")` | `[`와 `](주소 "제목")` | 링크 색. 주소는 링크 패널에서 본다 | hide.link |
| 참조 링크 | `[글][ref]` | `[`와 `][ref]` | 링크 색 | hide.ref-link |
| 자동 링크 | `<https://a.b>` | `<` `>` | 링크 | hide.autolink |
| 위키 링크 | `[[문서|별칭]]` | `[[문서|`와 `]]`(별칭이 없으면 `[[` `]]`) | 링크 색 | hide.wiki-link |
| 태그 | `#태그` | 없음 | 태그 칩 스타일 | hide.tag |
| 이스케이프 | `\*` | `\` | 뒤 글자 | hide.escape |
| 문자 참조 | `&#x20;` `&amp;` | 참조 전체 | 해당 문자(인라인 위젯) | hide.entity |
| 강제 줄바꿈 | `끝\`+줄바꿈 | `\` | 줄바꿈 | hide.hard-break |
| 목록 항목 | `- a` `1. a` | 기호와 공백 | 불릿·번호(인라인 위젯) | hide.list |
| 작업 항목 | `- [ ] a` | `- [ ] ` | 체크박스(인라인 위젯) | hide.task |
| 인용 | `> a` | `> ` | 인용 막대 | hide.quote |
| 이미지 | `![대체](src)` `![[a.png]]` | 전체 | 이미지(위젯) | hide.image |
| 파일 임베드 | `![[report.pdf]]` | 전체 | 파일(위젯) | hide.file |
| 각주 참조 | `[^n]` | 전체 | 위첨자 링크 | hide.footnote |
| 인라인 주석 | `%%메모%%` `<!-- 메모 -->` | 전체 | 주석 칩 | hide.comment |
| 블록 | 표, 코드 블록, 수식, Mermaid, 콜아웃, 아코디언, MDX 컴포넌트, 인라인 데이터베이스, 수평선, HTML 블록, 링크 참조 정의, 각주 정의, frontmatter | 전체 | 블록 위젯 | hide.block-* |

frontmatter는 `live` 편집기에서 YAML 원문 범위를 숨기고, 같은 문서 화면의 기존 속성 패널로 표시·편집한다.
속성 패널은 `Y.Text('source')`의 frontmatter 바인딩에 쓴다. 원문 보기에서는 YAML을 그대로 보여 준다.
`live` 편집기의 입력·삭제는 숨겨진 YAML 범위를 바꿀 수 없다. (hide.block-frontmatter)

코드 블록 위젯은 울타리와 언어·메타데이터를 본문과 분리해 보여 준다. 본문과 언어를 고치면 각각 해당 원문 범위만
바꾼다. 본문에 닫는 울타리와 같은 줄이 생기면 두 울타리를 함께 늘린다. 들여쓴 코드 블록은 네 칸 또는 탭 들여쓰기를
본문에서 감추고, 본문을 고칠 때 해당 들여쓰기를 다시 붙인다. (widget.code-body, widget.code-language)
표 위젯은 각 칸을 따로 편집한다. 칸을 고쳐도 주변 공백·파이프·정렬선·다른 칸의 원문은 그대로 둔다. 칸 안의
파이프는 이스케이프하고 줄바꿈은 공백으로 바꾼다. (widget.table-cell)
수식(`$$`, `\\[`, ` ```math `)과 Mermaid(` ```mermaid `) 위젯은 원문 구분자를 숨기고 기존 렌더러로 미리 보인다.
본문 편집은 구분자 사이의 원문 범위만 바꾼다. (widget.math-body, widget.mermaid-body)
GFM 콜아웃(`> [!TYPE]`)과 MDX `<Callout>`·`<Accordion>`은 기존 컴포넌트로 그리고, 내부 본문은 같은 live 편집
규칙으로 편집한다. GFM의 `>` 접두어는 감춘 채 삽입·삭제·줄바꿈을 원문 위치에 적용한다. 제목·종류 변경은
헤더나 해당 MDX 속성 값만 바꾼다. (widget.callout-body, widget.callout-attribute,
widget.accordion-body, widget.accordion-attribute)
HTML `<details><summary>…</summary>…</details>`도 아코디언으로 보여 준다. 제목은 `<summary>` 내용만, 본문은
`</summary>`와 `</details>` 사이만 고치며 `open`·`name`·`id` 속성을 보존한다. (widget.accordion-body,
widget.accordion-attribute)
Markdown 이미지와 위키 이미지·파일 임베드, MDX `img`·`File`·`Embed`는 미디어 위젯으로 그린다. `src`와 대체
텍스트·표시 이름의 변경은 해당 원문 범위만 바꾼다. 렌더링 전에 앱의 URL 안전 검사와 문서 상대 경로 해석을
적용한다. (widget.media-src, widget.media-label, hide.block-media)
참조 이미지 `![alt][id]`·`![alt][]`·`![id]`는 같은 문서의 첫 번째 정의에서 URL을 읽는다. 이미지 위젯에서
URL을 고치면 공유 정의의 대상 원문 범위만 바뀌고, 대체 텍스트를 고치면 이미지 위치만 바뀐다. 정의 줄은
압축 위젯으로 보여 주고 대상 URL을 고친다. 축약·단축 참조의 대체 텍스트를 바꾸면 원래 정의 ID를 명시형으로
남겨 이미지 연결을 보존한다. (widget.media-src, widget.media-label,
widget.reference-target)
일반 MDX 블록은 등록된 제품 컴포넌트를 앱의 React 문맥에서 그린다. 문자열 속성을 고치면 해당 속성 값 범위만,
본문을 고치면 여닫는 태그 안의 본문 범위만 바꾼다. JSON으로 해석 가능한 리터럴 표현식만 컴포넌트에 전달한다.
숫자·불리언·JSON 리터럴 속성은 같은 형식으로 편집하며, 실행 가능한 표현식은 평가하거나 자동으로 바꾸지 않는다.
(widget.mdx-prop, widget.mdx-body, hide.block-mdx)
각주 정의 위젯은 `[^id]:`와 이어지는 줄의 들여쓰기를 숨기고 본문만 같은 live 규칙으로 편집한다. 각주 참조는
해당 정의로 이동하는 위첨자 링크다. 인라인·블록 주석 위젯은 원문 구분자를 숨기고 본문 변경만 원문에 기록한다.
(widget.footnote-body, widget.comment-body, hide.block-comment)
`<Tabs>`의 직접 자식 `<Tab>`은 탭 목록과 선택한 패널로 보여 준다. 라벨·본문 변경은 해당 자식의 원문 범위만
바꾸고, 탭 추가·삭제는 해당 자식의 원문만 삽입·삭제한다. 중첩된 `<Tabs>`는 부모 탭의 본문 안에서 독립된 탭 목록으로 다룬다. (widget.tabs-label,
widget.tabs-body)

- 문단 안의 한 줄 바꿈(soft break)은 줄바꿈으로 보인다. 원문의 줄 구조를 그대로 보이기 위해서다. (hide.soft-break)
- 블록 사이의 빈 줄은 빈 줄로 보이고, 커서가 놓일 수 있다. (hide.blank-lines)
- 구문이 완성되지 않은 기호(닫히지 않은 `**`, 짝이 없는 `[`)는 글자로 보인다. 원문 그대로다. (hide.unclosed)

## 4. 커서와 선택

- 커서는 표시 텍스트의 글자 사이에만 놓인다. 방향키는 표시 글자 하나씩 움직이고, 숨긴 범위는 건너뛴다.
  (edit.cursor-skip)
- 인라인 위젯(체크박스, 문자 참조, 이미지)은 글자 하나로 센다. 블록 위젯은 줄 하나로 세며, 위젯 안으로 들어가면
  위젯이 자기 커서를 가진다(표의 칸, 코드 블록). (edit.cursor-widget)
- **경계 위치의 입력 방향**(현재 편집기와 같음, 링크만 다름):
  - 굵게·기울임·취소선·강조·인라인 코드의 끝에서 친 글자는 서식 안으로 들어간다. (edit.boundary-end-inside)
  - 같은 서식의 시작에서 친 글자는 서식 밖으로 들어간다. (edit.boundary-start-outside)
  - 인라인 코드 끝에서 오른쪽 방향키를 한 번 더 누르면 커서가 코드 밖으로 나간다. 표시 위치는 같고 입력 방향만
    바뀐다. (edit.code-exit)
  - 링크의 끝에서 친 글자는 링크 밖으로 들어간다. **현재와 다름**: 지금 편집기는 링크를 이어 붙인다
    (`LinkFidelity`의 `autolink: true` → `inclusive`). 링크 뒤에 이어 쓴 글이 링크가 되는 일을 막기 위해 바꾼다.
    (edit.boundary-link)
- 선택을 복사하면 원문 조각(서식 기호 포함)을 `text/plain`과 `text/markdown`으로, 그린 HTML을 `text/html`로 넣는다.
  (edit.copy)

## 5. 입력

- 친 글자는 커서 위치(4절의 방향)에 그대로 들어간다. (edit.type-plain)
- **이스케이프**: 친 글자 때문에 편집한 곳 밖의 해석이 바뀌면(예: 문단의 다른 `*`와 짝이 되어 강조가 생김), 친
  글자 앞에 `\`를 넣는다. 편집은 편집한 곳 밖의 표시를 바꾸지 않는다. (edit.escape-pairing, edit.escape-line-start)
- **입력 규칙**은 이스케이프보다 먼저 적용된다. 입력 규칙은 발동 글자를 친 순간에만 적용된다. 블록 구문은 기호
  뒤의 공백(또는 Enter)이, 인라인 구문은 닫는 기호가 발동 글자다. 발동 글자가 아닌 글자로 구문이 완성되면(예: 이미
  있던 공백 앞에 `1.`을 쳐서 목록이 되는 경우, 여는 기호를 쳐서 뒤에 있던 닫는 기호와 짝이 되는 경우) 친 글자를
  이스케이프한다. (edit.escape-opener, edit.escape-no-trigger)
  - 줄 첫머리 `# `~`###### `: 제목. (edit.rule-heading)
  - `- ` `* ` `1. `: 목록. `[ ] ` `[x] `: 작업 항목. `> `: 인용. (edit.rule-list, edit.rule-task, edit.rule-quote)
  - 줄 첫머리의 블록 기호는 발동 글자를 칠 때까지 친 글자 그대로 보인다. Markdown은 기호만 있는 줄도 블록으로
    읽으므로(`-`는 빈 목록 항목, `#`은 빈 제목, ```` ``` ````는 코드 블록), 친 기호를 이스케이프해 둔다(`\-`, `1\.`,
    ``` ``\` ```). 발동 글자(공백, 코드 블록·수평선·수식 블록은 Enter)를 치면 이스케이프를 풀어 블록으로 바꾼다. 기호
    뒤에 다른 글자를 쳐서 줄이 블록이 되지 않으면(`-5`, `#태그`, `**굵게**`) 이스케이프를 푼다. 줄이 블록이 되면
    (`>a`는 인용) 이스케이프를 남긴다. (edit.rule-list, edit.rule-heading, edit.rule-quote, edit.rule-fence)
  - 목록 항목 글 첫머리에서 친 목록 기호는 그 항목의 목록 종류를 바꾼다. 불렛 항목에서 `1. `(`3. `)는 그 번호로
    시작하는 번호 목록, 번호 항목에서 `- `는 불렛, 작업 항목에서 `- `는 일반 불렛, 불렛 항목에서 `[ ] ` `[x] `는
    작업 항목이 된다. 항목 앞뒤의 같은 목록은 나뉜다. 항목의 하위 항목은 함께 옮겨 간다. (edit.rule-convert)
  - 닫는 기호 입력(`**a**`의 마지막 `*`, `` `a` ``의 닫는 백틱): 강조·코드. (edit.rule-emphasis, edit.rule-code)
  - ` ```lang `+Enter, `$$`+Enter, `~~~lang`+공백: 코드 블록·수식 블록. 세 번째 `-`, `***`+공백, `___`+공백:
    수평선. 수평선 뒤에는 빈 문단이 생기고 커서가 그리로 간다. (edit.rule-fence)
  - 입력 규칙이 적용된 바로 다음의 Backspace는 규칙을 되돌려 친 글자를 글자 그대로 남긴다(`- `는 `\- `, `**a**`는
    `\*\*a\*\*`). 다른 동작을 하나라도 하면 되돌릴 수 없다. (edit.rule-undo)
  - `[[`: 위키 링크 제안. `/`: 슬래시 메뉴. `#`+글자: 태그 제안. (edit.rule-suggest)
- **친 글자를 글자 그대로 두는 방법**은 차례로 시도한다: 그대로 넣기, `\` 이스케이프, 문자 참조(`&#x20;` 등, 공백처럼
  이스케이프가 없는 글자), 같은 화면 위치의 기호 반대편에 넣기. 편집한 곳 밖의 표시가 바뀌지 않는 첫 방법을 쓴다.
  인라인 코드 안의 백틱은 코드 구간의 백틱 울타리를 늘려 넣는다. 인라인 코드와 위키 링크 대상 안에서는 이스케이프와
  문자 참조가 해독되지 않으므로 쓰지 않는다. (edit.escape-entity, edit.code-backtick)
- **한계**: Markdown으로 표현할 수 없는 경우는 친 글자를 그대로 넣고 해석이 바뀐다. 위키 링크 대상 안의 `|` `[` `]`,
  편집 전부터 같은 기호가 넷 이상 붙어 있던 원문(`****`, `====`)이 여기에 해당한다.
- 서식 단축키(Cmd+B/I/E, Shift+Cmd+X 등)와 도구 막대는 선택 범위에 기호를 넣거나 뺀다. 선택이 없으면 다음 입력에
  서식을 건다. (edit.toggle-bold, edit.toggle-off, edit.toggle-empty)

## 6. 삭제

- Backspace·Delete는 표시 글자 하나를 지운다. 숨긴 범위는 표시 글자와 함께 지워질 때만 지운다. (edit.delete-char)
- 서식 안의 글자를 모두 지우면 그 서식의 기호도 지운다. (edit.delete-empties-mark)
- 여러 서식에 걸친 선택을 지우면, 선택에 완전히 든 서식은 기호째 지우고 걸친 서식은 기호를 남긴다.
  (edit.delete-across)
- 줄 첫머리의 Backspace:
  - 목록·작업 항목: 목록 밖 문단으로 바꾼다. 중첩된 항목도 들여쓰기까지 지워 목록 밖으로 나온다. 앞뒤에 목록이
    남으면 빈 줄로 나눈다. (edit.backspace-list)
  - 인용: 인용의 첫 줄은 기호를 지워 문단으로 바꾼다. 같은 인용 안의 다음 줄·다음 문단은 윗줄 글에 합친다.
    (edit.backspace-quote)
  - 제목: `#`을 지워 문단으로 바꾼다. (edit.backspace-heading)
  - 문단: 앞 블록과 합친다(사이의 빈 줄을 지운다). (edit.backspace-join)
- 블록 끝의 Delete는 다음 블록의 글을 이 블록에 합친다(제목·인용 기호, 목록 기호는 지운다). (edit.delete-join)
- 블록 위젯 바로 뒤의 Backspace는 위젯을 선택하고, 한 번 더 누르면 위젯의 원문 범위를 지운다.
  (edit.backspace-widget)

## 7. Enter

- 문단 안: 새 문단(`\n\n`)을 만든다. (edit.enter-paragraph)
- Shift+Enter: 강제 줄바꿈(`\`+줄바꿈)을 넣는다. (edit.enter-hard-break)
- 목록 항목 안: 같은 기호의 새 항목을 만든다. 번호 목록은 다음 번호를 넣는다. 작업 항목은 체크하지 않은 새 작업
  항목을 만든다. 빈 항목에서 Enter는 중첩 항목이면 한 단계 내어 쓰고, 최상위 항목이면 목록을 끝낸다.
  (edit.enter-list, edit.enter-list-empty)
- 제목 끝: 다음 줄에 문단을 만든다. 제목 가운데: 같은 단계의 제목 둘로 나눈다. 제목 첫머리: 제목 위에 새 블록을
  만든다. (edit.enter-heading)
- 인용 안: 인용 안에 새 문단(`>` 빈 줄 + `> `)을 만든다. 인용 안의 빈 문단에서 Enter는 인용을 한 단계 빠져나간다.
  (edit.enter-quote)
- 코드·수식 블록 안(블록 위젯이 그려지기 전까지 원문을 보여 주는 블록 전부): 원문을 그대로 편집한다. Enter는 줄바꿈
  하나, Tab은 공백 두 칸, Shift+Tab은 줄 앞 공백을 두 칸까지 지운다. Shift+Enter는 블록을 빠져나가 뒤에 새 문단을
  만든다. 붙여넣기는 원문 그대로 넣는다. (edit.enter-code)
- Tab은 목록 항목을 위 항목의 글 시작 열까지 들여 그 항목의 하위 목록으로 만든다. 새 하위 목록은 위 항목의 목록
  종류를 따르고 번호 목록은 1부터 시작한다. 목록의 첫 항목에서 Tab은 아무것도 하지 않는다. Shift+Tab은 부모 항목과
  같은 단계로 내어 쓰고, 최상위 항목은 목록 밖 문단으로 바꾼다. 하위 항목은 함께 움직인다. (edit.tab-list)
- 블록 단축키(기존 편집기와 같은 키):
  - Cmd+K: 선택한 텍스트에 링크를 추가하거나 커서의 링크를 편집한다. 대상만 바꾸면 표시 문구의 서식과 제목은
    보존한다. 링크를 해제하면 표시 문구의 원문을 남긴다. 참조 링크의 대상 수정은 공유 정의만 바꾼다. (edit.link)
  - Cmd+Alt+0: 문단. Cmd+Alt+1~6: 제목(같은 단계면 문단으로). (edit.block-heading)
  - Cmd+Shift+8·7·9: 불렛·번호·작업 목록. 같은 종류 안에서는 목록을 풀고, 다른 종류 안에서는 그 단계의 목록 전체를
    바꾸고, 목록 밖에서는 문단을 항목으로 만든다. (edit.block-list)
  - Cmd+Shift+B: 인용을 씌우거나 벗긴다. (edit.block-quote)
  - Cmd+Alt+C: 문단을 코드 블록으로 감싸거나, 코드 블록을 문단으로 푼다. (edit.block-code)
  - Cmd+Shift+↑·↓: 커서가 있는 최상위 블록을 위·아래 블록과 바꾼다. (edit.move-block)
  - Cmd+Shift+S: 취소선(Cmd+Shift+X와 같다).
- 번호 목록의 번호는 Markdown이 읽는 대로 보인다: 첫 항목의 번호에서 시작해 하나씩 늘어난다. 둘째 항목부터의 원문
  번호는 표시에 쓰지 않는다.

## 8. 붙여넣기

- 일반 텍스트는 글자 그대로 보이게 넣는다. 입력 규칙은 발동하지 않는다. 인라인 서식 기호 문자(`\ * _ ` [ ] < > ~ =
  |`)는 모두, 줄 첫머리 기호(`#`, `>`, `-`, `+`, `숫자.`)는 줄 첫머리에 올 때 이스케이프한다. (edit.paste-plain)
- HTML은 Markdown으로 바꿔 넣는다(지금의 붙여넣기 형식 선택을 따른다). (edit.paste-html)
- Markdown 원문으로 붙여넣기를 고르면 원문 그대로 넣는다. (edit.paste-markdown)
- 편집기는 기존 편집기와 같은 판단으로 붙여넣기 형식을 고른다: Cmd+Shift+V는 글자 그대로, Markdown처럼 보이는 일반
  텍스트는 Markdown 원문으로, 그 밖의 HTML은 Markdown으로 바꿔서, 나머지 일반 텍스트는 글자 그대로 넣는다.

## 9. 한글 입력(IME)

- 조합 중인 글자는 원문에 들어가 있어도 숨김·장식을 다시 계산하지 않는다. 조합이 끝나면 한 번 계산한다.
- 조합 중에 다른 사람의 편집이 오면 조합 중인 범위를 옮겨 유지한다.

## 10. fixture 형식

모든 fixture는 `id`(고유), `group`(이 문서가 가리키는 id, 예: `edit.enter-list`), `rule`(절 번호)을 가진다. 이 문서의
id가 `*`로 끝나면 그 접두어로 시작하는 group을 모두 가리킨다.

`fixtures/hide.json`: `{ id, group, rule, marked }`. `marked`는 원문에 숨긴 범위를 `⟨…⟩`, 위젯 범위를 `⦃…⦄`로 표시한
것이다. 표시를 지우면 원문이고, `⟨…⟩`를 빼고 `⦃…⦄`를 `￼` 한 글자로 바꾸면 표시 텍스트다.

`fixtures/edit.json`: `{ id, group, rule, before, actions, after | clipboard | ui }`. `before`·`after`는 원문이고, 커서는
`│`, 선택은 `⟪` `⟫`로 표시한다. 커서가 경계 위치에 있으면 어느 쪽 원문 오프셋으로 적든 같은 위치다(4절이 정한 쪽으로
정규화한다). `actions`는 차례로 적용하는 동작의 목록이다.

`fixtures/widget.json`: `{ id, group, rule, before, from, edit, after }`. `from`은 블록 시작 오프셋이고,
`edit`는 `code-body`·`code-language`·`table-cell`·`diagram-body`·`container-body`·`container-title`·
`container-type`·`media-src`·`media-label`·`mdx-prop`·`mdx-body` 중 하나다. 결과는 바뀐 원문 전체로 비교한다.

- `{ "type": "text", "text": "…" }`: 글자를 하나씩 친다.
- `{ "type": "key", "key": "Backspace" | "Delete" | "Enter" | "Shift-Enter" | "Tab" | "Shift-Tab" | "ArrowRight" |
  "ArrowLeft" }`
- `{ "type": "toggle", "mark": "bold" | "italic" | "code" | "strike" | "highlight" }`
- `{ "type": "paste", "text": "…" }`, `{ "type": "paste", "html": "…" }`, `{ "type": "paste", "text": "…", "as":
  "markdown" }`
- `{ "type": "copy" }`: 기대값은 `clipboard: { "markdown": "…" }`다.

원문이 바뀌지 않고 화면 요소가 열리는 동작은 `ui`(예: `"wiki-link-suggest"`, `"slash-menu"`)로 기대값을 적는다.

コードブロックの preview・表示タイトル・寸法は開始フェンスのメタデータ範囲だけを編集する（`widget.code-meta`）。本文・言語・フェンス文字・周囲の原文は維持する。

각주 삽입(`edit.footnote`)은 한 문단 안의 선택을 참조로 바꾸고 원문 내용을 정의로 옮긴다. 빈 커서는 빈 정의를 만든다. 기존 정의 뒤에 정의를 모으며 전체 문서의 사용 번호 다음 번호를 할당한다. 참조가 포함된 선택은 다시 감싸지 않는다. 참조와 정의 삽입을 한 번에 되돌린다.

중첩 본문의 선택 좌표는 위젯 모델의 원문 범위·경계 배열을 통해 문서 전체 원문으로 대응시킨다. 표 칸·MDX·Tab의 원문 범위는 직접 이동하고, GFM 인용·각주는 접두사를 제외한 경계 배열을 사용한다. 중첩 메모는 이 문서 전체 범위를 저장하고, 이동 시 필요한 탭·접힌 본문을 연다.
