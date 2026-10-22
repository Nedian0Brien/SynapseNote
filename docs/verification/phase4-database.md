# 4단계 데이터베이스 검증 결과

- 날짜: 2026-10-19
- 브랜치: `feat/database`(기준 `feat/daily`)
- 환경: Xcode 27.0, iOS 27.0 시뮬레이터(iPad Pro 13-inch (M5), iPhone 17 Pro Max)
- 시험 vault: 앱 문서 폴더의 시험 vault. 인라인 데이터베이스 페이지는 다른 앱에서 쓴 것처럼 파일을 직접 넣었다.
- macOS는 이 단계를 시험하는 동안 화면이 잠겨 있어 조작하지 못했다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` / `test` / `build` | 통과, 웹 테스트 29개. 번들 검사(금지 모듈 `legacy.ts`·electron, Morrow 이름)도 통과 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 56개. `createPage` 명령의 kind, 자물쇠 아이콘 |
| macOS, iPad, iPhone 빌드 | 통과 |

## 기능

| 항목 | iPadOS | iPhone | macOS | 확인 방법 · 비고 |
|---|---|---|---|---|
| New Database | 통과 | 통과 | 미확인 | 팔레트 → `Untitled 2.md`가 kind: database, Status(select: To do·Doing·Done)·Date 속성, Table·Board·Calendar 뷰로 생김 |
| 행 추가 · 이름 | 통과 | 미확인 | 미확인 | + New → `Untitled 2/Untitled.md` 생성. 이름을 입력하면 `Untitled 2/Write spec.md`로 바뀜 |
| select 값 | 통과 | 미확인 | 미확인 | Status 칸 → 선택 창 → Doing → 행 frontmatter `Status: Doing` |
| 보드 · 캘린더 | 통과 | 미확인 | 미확인 | 보드는 Status별 열에 행이 나뉨. 캘린더는 이번 달과 오늘 표시 |
| 뷰 추가 | 통과 | 미확인 | 미확인 | + → Gallery → 폴더 노트에 `type: gallery` 뷰 추가, 카드에 Doing 칩 |
| 행 페이지 속성 | 통과 | 미확인 | 미확인 | 카드 → 행 페이지 제목 아래 Status·Date·Add a property |
| 인라인 데이터베이스 | 통과 | 미확인 | 미확인 | `![[Untitled 2]]`가 든 페이지 → 미리보기가 아니라 실제 데이터베이스 뷰(뷰 탭, 필터, 행). 페이지 파일은 다시 쓰이지 않음 |
| 필터 | 통과(창 열림) | 미확인 | 미확인 | "No filters…"와 Add a filter. 규칙 추가 후 결과는 미확인 |
| 정렬 · 그룹 · 숨긴 속성 · 속성 종류 9종 | 미확인 | 미확인 | 미확인 | Morrow 코드 그대로이며 조작 확인은 하지 못했다 |
| `/` 메뉴의 Database | 미확인 | 미확인 | 미확인 | 편집기에서 `/` 입력을 자동 조작으로 넣지 못했다 |
| 좁은 화면 배치 | 해당 없음 | 통과 | 해당 없음 | 도구 줄이 두 줄로 나뉘고 표는 가로로 넘친다(Morrow 배치) |
| 하위 페이지 목록 | 미확인 | 미확인 | 미확인 | 화면에 하위 페이지가 있는 페이지를 열지 않았다 |

## 구현 중 정한 것

- **데이터베이스 화면은 편집기 WebView에서 그린다**(spec의 설계 결정). 인라인 데이터베이스가 TipTap 문서 안에 있으므로 두 곳을 같은 Morrow 코드로 그리고, 11단계에서 편집기와 함께 Swift로 옮긴다.
- **`components/Sidebar.tsx` 교체**: 데이터베이스 컴포넌트가 `PageIcon` 때문에 Morrow 사이드바를 불러오고, 사이드바는 번들에서 금지한 `legacy.ts`까지 불러온다. `hostModules`에서 같은 구현의 `PageIcon`만 있는 `host/sidebar.tsx`로 바꾼다.

## 기록해 둘 동작

- Morrow는 마지막으로 고른 뷰를 브라우저 저장소에 기억한다. 이 앱의 편집기 페이지는 저장소를 실행 사이에 남기지 않으므로, 앱을 다시 열면 첫 번째 뷰가 보인다.

## 사용자 확인 요청

1. macOS에서 데이터베이스를 만들고 속성 종류(Number, Multi-select, Checkbox, Link, Relation, Formula)를 추가해 값을 넣어 본다.
2. 필터·정렬·그룹을 걸고 보드에서 카드를 끌어 열을 옮겨 본다.
3. 페이지 본문에서 `/` → Database로 인라인 데이터베이스를 만든다.
