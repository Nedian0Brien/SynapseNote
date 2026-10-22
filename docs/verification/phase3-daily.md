# 3단계 일상 기록 검증 결과

- 날짜: 2026-10-19
- 브랜치: `feat/daily`(기준 `feat/navigation`)
- 환경: Xcode 27.0, macOS 27, iOS 27.0 시뮬레이터(iPad Pro 13-inch (M5), iPhone 17 Pro Max)
- 시험 vault: `scripts/make-test-vault.sh`로 만든 vault. macOS는 앱 컨테이너의 `TestVault`, iOS는 앱 문서 폴더를 썼다. 템플릿과 날짜 칩 페이지는 다른 앱에서 고친 것처럼 vault 파일을 직접 써서 넣었다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` / `test` | 통과, 29개. 태그(색, 하위 태그 포함), 작업, 템플릿, 개수 조회, 새 메시지 파싱 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 56개. 2단계에서 저장한 탭 형식 복원, 새 목적지 저장, 조회 디코딩, 새 명령 JSON, 날짜 키(로컬 날짜), 아이콘 규칙 |
| macOS, iPad, iPhone 빌드 | 통과 |

## 기능

| 항목 | macOS | iPadOS | iPhone | 확인 방법 · 비고 |
|---|---|---|---|---|
| Today | 통과 | 통과 | 미확인 | macOS: `Journal.md`(kind: journal)와 `Journal/2026-10-19.md`가 생기고 열림. 제목은 시스템 언어의 긴 날짜 형식 |
| Daily note 템플릿 적용 | 미확인 | 통과 | 미확인 | `## Plan for {{date:dddd}}` → `## Plan for Monday`, `{{title}}` → `Monday, October 19, 2026` |
| `@날짜` 칩 | 미확인 | 미확인 | 통과 | `[[2026-10-21]]` 칩을 누르면 `Journal/2026-10-21.md`가 생기고 열림. 칩이 있는 페이지 파일은 그대로 |
| 템플릿 없음 안내 · Make a Template | 통과 | 미확인 | 미확인 | 첫 번째: `Templates.md`(kind: templates) 생성. 두 번째: `Templates/New template.md` 생성 |
| 템플릿으로 새 페이지 | 미확인 | 통과 | 미확인 | Meeting 템플릿 → `Untitled.md`에 `Meeting notes from 2026-10-19`, `#meeting` |
| Save Page as Template | 미확인 | 통과 | 미확인 | 오늘 노트 → `Templates/Monday, October 19, 2026.md` |
| 태그 화면 · 태그 하나의 화면 | 미확인 | 통과 | 미확인 | Morrow 색 칩과 페이지 수, `#meeting` → 페이지 2개(최근 수정 순, 경로, 시각) |
| 페이지 태그 추가 | 미확인 | 미확인 | 통과 | 한글 태그 `가나다`가 frontmatter `tags`에 기록됨(아래 3번 수정 뒤) |
| 작업 화면 | 미확인 | 미확인 | 통과 | Open/Done/All, 페이지별 묶음. 체크 → `Checklist.md`가 `- [x] 첫 번째 할 일` |
| 사이드바 개수 | 통과 | 통과 | 통과 | Tasks·Tags 옆 숫자, 작업을 체크하면 줄어듦 |
| 외부에서 만든 템플릿 인식 | 통과 | 통과 | 해당 없음 | 다른 앱처럼 파일을 써 넣은 뒤 템플릿 목록과 홈에 나타남 |

macOS는 시험 도중 화면이 잠겨 창 조작과 캡처가 막혔다. 그 뒤의 항목은 iPad·iPhone에서 확인했다.

## 구현 중 발견하고 고친 것

1. **Morrow `TagsView.tsx`를 불러오면 번들이 깨짐**: 이 모듈이 Morrow 사이드바를 거쳐 번들에서 금지한 `legacy.ts`까지 불러온다. `PageTags`만 같은 마크업으로 `web/src/PageTags.tsx`에 옮겼다.
2. **편집기에서 만든 페이지의 상위 페이지가 사이드바에서 펼쳐지지 않음**: 페이지가 열린 뒤에 Swift가 그 페이지를 알게 되므로, 새 페이지가 들어온 시점에 펼친다.
3. **iPhone에서 한글 태그가 저장되지 않음**: 태그 입력 칸이 포커스를 잃을 때 React 상태가 아니라 입력 칸의 실제 값을 읽는다. 조합 중 Enter도 무시한다.
4. **iOS에서 태그 입력 칸에 포커스가 가면 화면이 확대된 채로 남음**: iOS는 16px보다 작은 입력 칸에서 확대한다. 터치 기기에서는 `input`·`select` 글자를 16px 이상으로 둔다.
5. **터치 기기에서 Add icon·Add tag가 보이지 않음**: Morrow는 포인터를 올렸을 때만 보인다. 호버가 없는 기기에서는 항상 보이게 했다.

## 기록해 둘 동작

- 편집 중인 페이지의 본문 `#태그`는 ⌘(Ctrl)-클릭해야 태그 화면으로 간다. Morrow와 같다(그냥 누르면 글을 고친다). 제목 아래 태그 칩은 그냥 눌러도 간다.
- 템플릿 페이지도 일반 페이지라서 홈의 Jump back in과 작업 목록에 나온다. Morrow와 같다.
- 시뮬레이터 자동 입력 중 태그 입력 칸이 마지막 글자 뒤에 바로 포커스를 잃은 적이 있다. 매번 일어나지는 않았고, 입력 도구 때문인지 확인하지 못했다.

## 사용자 확인 요청

1. macOS에서 Today, 템플릿으로 새 페이지(⌥⌘T), 태그·작업 화면을 사용해 본다.
2. 실기기 iPhone·iPad에서 제목 아래 Add tag에 한글 태그를 입력하고 Return으로 저장한다. 입력 중에 포커스가 빠지는지 본다.
3. 본문에서 `@`로 날짜를 넣고 그 칩을 눌러 본다.
