# globals.css 모듈화 리팩토링 계획

- 상태: Proposed
- 작성일: 2026-07-25
- 대상: `packages/app/src/globals.css`
- 성격: 동작과 디자인을 바꾸지 않는 구조 리팩토링

## 1. 요약

`packages/app/src/globals.css`는 현재 5,790줄, 약 191KB이며 다음 책임을 한 파일에서 동시에 담당한다.

- Tailwind·shadcn·애니메이션 스타일 진입점
- 라이트·다크 테마 토큰과 Tailwind `@theme` 매핑
- Electron 전용 투명도·타이틀바·드래그 영역 정책
- 편집기 레이아웃과 ProseMirror 문서 스타일
- CodeMirror 소스 편집기 스타일
- 협업 커서, 에이전트 상태, 메모 하이라이트
- 표, 코드 블록, 링크, 이미지 등 Markdown 노드 스타일
- JSX 컴포넌트 선택 halo, 리사이즈 핸들, hover chrome
- Callout, Video, PDF, File, Accordion, Tabs 등 개별 기능 스타일
- 접근성 미디어 쿼리와 다크 모드 보정
- 페이지 헤더, 토스트, PDF 인쇄 스타일

문제는 파일 크기 자체보다 서로 다른 소유권과 캐스케이드 계약이 하나의 물리 파일에 결합되어 있다는 점이다. 현재 빌드 플러그인, 토큰 생성 스크립트, 정적 회귀 테스트도 `globals.css`를 직접 읽는다. 따라서 단순한 잘라내기 방식은 테마 토큰 추출, 테스트 가드, 스타일 우선순위를 동시에 깨뜨릴 수 있다.

리팩토링은 다음 원칙을 따른다.

1. `globals.css`는 공개 진입점으로 유지하되 import manifest로 축소한다.
2. 첫 번째 추출 단계에서는 선택자, 선언, 규칙 순서를 바꾸지 않는다.
3. 물리 경로에 결합된 빌드·테스트 코드를 먼저 분리 가능한 형태로 바꾼다.
4. import 그래프는 평평하게 유지하고, 캐스케이드 순서는 하나의 manifest에서 확인 가능하게 한다.
5. 기계적 분리와 CSS 개선·중복 제거를 별도 변경으로 진행한다.

## 2. 현황과 구조적 문제

### 2.1 정량 현황

2026-07-25 기준:

| 항목 | 값 |
| --- | ---: |
| `globals.css` 줄 수 | 5,790 |
| `globals.css` 크기 | 191,561 bytes |
| `@keyframes` 블록 | 20 |
| 최상위 `@media` 블록 | 22 |
| `@container` 블록 | 1 |
| `@apply` 사용 | 32 |
| `.ProseMirror`가 포함된 줄 | 251 |
| CodeMirror 관련 줄 | 171 |
| PDF 관련 줄 | 94 |
| JSX 컴포넌트 관련 줄 | 67 |

수치는 리팩토링 우선순위를 정하기 위한 기준이며, 줄 수를 줄이는 것 자체가 목표는 아니다.

### 2.2 책임 혼합

현재 파일에는 다음 세 종류의 스타일이 섞여 있다.

- 전역이어야 하는 스타일: 테마 토큰, reset, Electron host, print root
- DOM을 직접 소유하지 못해 전역 선택자가 필요한 스타일: ProseMirror가 생성하는 노드, CodeMirror 내부 DOM, 포털·서드파티 DOM
- 컴포넌트에 가까운 기능 스타일: PDF, File, Tabs, Callout, page header 등

세 종류가 한 파일에 있으면 특정 기능 수정 시 전체 캐스케이드를 탐색해야 하고, 인접하지 않은 다크 모드 보정이나 미디어 쿼리를 놓치기 쉽다.

### 2.3 순서 의존성과 회귀 위험

CSS는 동일한 specificity일 때 뒤에 선언된 규칙이 우선한다. 현재 파일 후반부의 다크 모드 보정, STOP rule, 서드파티 override는 앞부분의 기본 스타일을 의도적으로 덮는다. 의미만 보고 파일을 나누거나 알파벳 순서로 import하면 시각 회귀가 발생할 수 있다.

특히 다음 계약은 순서에 민감하다.

- Tailwind·shadcn import와 앱 override의 선후 관계
- `:root`, `.dark`, `@theme`, `@theme inline` 간 토큰 매핑
- ProseMirror 기본 스타일과 JSX 컴포넌트별 override
- 서드파티 스타일과 `.dark` 전용 보정
- 일반 화면 스타일과 `@media print` 최종 override
- Electron alpha-aware 규칙과 `prefers-reduced-transparency` revert

### 2.4 물리 파일 경로에 대한 결합

다음 계층이 `globals.css`를 직접 읽거나 내부 섹션 문자열에 의존한다.

- `chrome-tokens-vite-plugin`
- chrome·preview theme token 생성 및 drift 테스트
- alpha-aware·reduced-transparency 정적 테스트
- page-header·image-zoom 정적 테스트
- Electron drag-region 정적 테스트
- integration STOP-rule 테스트
- 여러 컴포넌트와 확장의 코드 주석

예를 들어 chrome token resolver는 `globals.css` 안의 정확한 `:root`와 `.dark` 블록에서 `--sidebar`를 찾는다. 토큰을 별도 파일로 옮기기 전에 이 경로 계약부터 변경해야 한다.

### 2.5 변경 충돌과 소유권 불명확

모든 스타일 변경이 한 파일에 집중되므로 기능적으로 무관한 PR끼리도 충돌한다. 또한 PDF 스타일과 editor table 스타일처럼 담당 영역이 다른 규칙도 동일 파일에 있으므로 리뷰어가 변경 범위를 빠르게 판단하기 어렵다.

## 3. 목표

### 3.1 핵심 목표

- `globals.css`를 안정적인 import manifest로 축소한다.
- 스타일을 책임과 런타임 소유권에 따라 모듈화한다.
- 기존 캐스케이드 순서와 computed style을 보존한다.
- 빌드·토큰 생성·정적 테스트가 물리적인 단일 CSS 파일에 의존하지 않게 한다.
- 새 스타일이 들어갈 위치와 전역 스타일 허용 기준을 명시한다.
- 파일 크기와 import 구조를 자동 검증해 다시 거대 모듈로 회귀하지 않게 한다.

### 3.2 완료 후 기대 상태

- `globals.css`에는 외부 import, 로컬 import, 짧은 구조 설명만 남는다.
- 기능별 CSS 소유자가 파일명과 디렉터리로 드러난다.
- 각 파일은 단일 기능군 또는 단일 플랫폼 계약을 담당한다.
- 정적 테스트는 해당 스타일 모듈을 직접 읽거나 전체 style manifest를 안전하게 펼친다.
- 토큰 resolver는 명시적인 token source를 읽는다.
- 신규 CSS 변경은 전체 5,000줄을 탐색하지 않고 관련 모듈에서 완료할 수 있다.

## 4. 비목표

이 RFC의 첫 구현에서는 다음을 하지 않는다.

- 기존 디자인, 간격, 색상, 애니메이션 변경
- 선택자 specificity 개선 또는 selector rename
- 중복 선언 제거
- CSS Modules로의 일괄 전환
- Tailwind utility로의 일괄 치환
- cascade layer의 즉시 도입
- 서드파티 스타일 라이브러리 교체
- CSS minification 또는 번들 분할 정책 변경

이 항목들은 모듈 분리가 안정화된 뒤 별도 변경으로 다룬다. 기계적 이동과 스타일 개선을 한 PR에 섞지 않는다.

## 5. 반드시 보존할 불변 조건

1. 라이트·다크 모드의 computed style이 동일해야 한다.
2. Web과 Electron renderer의 바깥 canvas·안쪽 editor surface 관계가 동일해야 한다.
3. `prefers-reduced-motion`, `prefers-reduced-transparency`, forced colors 동작이 동일해야 한다.
4. ProseMirror, CodeMirror, Radix portal, Sonner, react-medium-image-zoom 등 외부 DOM의 override가 유지되어야 한다.
5. PDF export의 print media 출력이 동일해야 한다.
6. `--sidebar`와 preview theme token의 생성·drift 검사가 계속 동작해야 한다.
7. Tailwind v4가 모든 분리 파일의 class와 `@apply`를 정상 처리해야 한다.
8. import 순서는 코드 리뷰에서 한눈에 확인할 수 있어야 한다.
9. 로컬 CSS 파일 간 순환 import가 없어야 한다.
10. 첫 기계적 추출 PR에서는 생성된 production CSS의 규칙·선언 순서가 유지되어야 한다.

## 6. 제안 디렉터리 구조

최종 목표 구조는 다음과 같다.

```text
packages/app/src/
├── globals.css                         # 안정적인 공개 진입점/import manifest
├── cmd-f.css                           # 기존 독립 스타일 유지
└── styles/
    ├── foundation/
    │   ├── tokens.css                  # :root, .dark, @theme, @theme inline
    │   ├── base.css                    # @layer base와 공통 element base
    │   ├── accessibility.css           # 공통 motion/transparency/forced-colors 정책
    │   └── platform-electron.css       # electron-mode, titlebar, drag-region 계약
    ├── shell/
    │   ├── activity-panel.css
    │   ├── editor-layout.css
    │   ├── composer.css
    │   ├── page-header.css
    │   └── mascot.css
    ├── editor/
    │   ├── prose-base.css              # heading, paragraph, list, quote, hr
    │   ├── collaboration.css           # cursor, presence, agent/memo feedback
    │   ├── code-block.css
    │   ├── links.css
    │   ├── tables.css
    │   ├── media.css                   # image/embed/video 공통 문서 스타일
    │   ├── interaction-handles.css     # block/table handles와 resize chrome
    │   ├── component-chrome.css        # JSX wrapper, halo, prop chrome, add child
    │   ├── source-mode.css             # CodeMirror source polish
    │   └── large-document.css          # chunk/content-visibility 계약
    ├── components/
    │   ├── callout-footnotes.css
    │   ├── pdf.css
    │   ├── file.css
    │   ├── tabs-accordion.css
    │   └── code-editors.css            # nested CodeMirror/prop/code preview
    ├── overrides/
    │   ├── third-party.css              # rmiz, Sonner 등 명시적 외부 override
    │   └── dark.css                     # 아직 feature와 co-locate하지 못한 순서 민감 보정
    └── print/
        └── pdf-export.css
```

### 6.1 `globals.css`의 최종 역할

`globals.css`는 이름을 유지한다. 이유는 다음과 같다.

- `main.tsx`의 기존 진입점 유지
- shadcn `components.json`의 CSS 경로 유지
- 외부 도구와 개발자 문서의 안정적인 참조점 유지
- 캐스케이드 순서를 한 파일에서 검토 가능

최종 파일은 대략 다음 형태가 된다.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./cmd-f.css";

@import "./styles/foundation/tokens.css";
@import "./styles/foundation/base.css";
@import "./styles/foundation/platform-electron.css";
@import "./styles/shell/activity-panel.css";
@import "./styles/shell/editor-layout.css";
/* ...순서가 명시된 feature imports... */
@import "./styles/overrides/dark.css";
@import "./styles/overrides/third-party.css";
@import "./styles/print/pdf-export.css";
```

로컬 leaf CSS는 다른 leaf CSS를 import하지 않는다. 모든 순서는 `globals.css`만 소유한다. 이 규칙은 숨은 의존성과 순환 import를 방지한다.

## 7. 모듈 경계 규칙

### 7.1 전역 CSS 허용 기준

다음 중 하나에 해당할 때만 `styles/`의 전역 CSS를 사용한다.

- 라이브러리가 생성해 React 컴포넌트가 className을 직접 소유하지 못하는 DOM
- ProseMirror·CodeMirror처럼 문서 스키마가 생성하는 markup
- portal root 또는 Electron host처럼 앱 전역 상태가 필요한 selector
- theme token, media query, print surface처럼 애플리케이션 전역 계약

일반 React 컴포넌트가 DOM을 직접 소유하고 selector가 해당 컴포넌트에만 쓰인다면 우선순위는 다음과 같다.

1. 기존 Tailwind utility와 variant
2. 컴포넌트 전용 CSS module
3. 불가피한 경우에만 feature-scoped global CSS

### 7.2 선택자 소유권

- `.ProseMirror ...` 규칙은 `styles/editor/`가 소유한다.
- `.cm-...`, `.CodeMirror...` 규칙은 source mode 또는 code editor 모듈이 소유한다.
- `.jsx-component-wrapper...` 규칙은 `component-chrome.css`가 소유한다.
- `.ok-pdf...` 규칙은 `components/pdf.css`가 소유한다.
- `html.electron-mode...` 규칙은 `platform-electron.css`가 소유한다.
- `#ok-pdf-export-root`와 `@media print`는 `print/pdf-export.css`가 소유한다.
- 외부 라이브러리 data attribute override는 `overrides/third-party.css`가 소유한다.

한 selector family가 두 파일에 걸쳐야 한다면 파일 상단에 이유와 선후 관계를 명시한다.

### 7.3 keyframe과 custom property

- feature 전용 keyframe은 사용처와 같은 파일에 둔다.
- 둘 이상의 feature가 공유하는 motion token만 foundation으로 승격한다.
- 전역 semantic token은 `tokens.css`에서만 선언한다.
- feature 전용 custom property는 가능한 가장 좁은 root selector에서 선언한다.

### 7.4 파일 크기 기준

- 권장: 100~500줄
- 경고 기준: 600줄 초과
- 임시 상한: 800줄
- 800줄을 초과하는 파일은 분리하거나 RFC에 예외 사유를 기록한다.
- `globals.css`는 주석과 import를 포함해 120줄 이하로 유지한다.

숫자는 기계적인 품질 점수가 아니라 다시 단일 거대 파일로 회귀하는 것을 막는 경계값이다.

## 8. 단계별 실행 계획

### Phase 0. 기준선 고정과 inventory

### 작업

- 현재 `globals.css`의 최상위 섹션, selector family, keyframe, media query를 inventory로 기록한다.
- light/dark, Web/Electron, visual/source editor, print의 기준 스크린샷을 만든다.
- production build의 최종 CSS 파일 크기와 gzip 크기를 기록한다.
- `globals.css`를 직접 읽는 코드와 테스트 목록을 확정한다.
- 현재 CSS import 순서를 문서화한다.

### 완료 기준

- 모든 최상위 규칙이 하나의 목표 모듈에 매핑되어 있다.
- 직접 파일을 읽는 소비자가 누락 없이 목록화되어 있다.
- 최소 visual baseline이 light/dark 각각 존재한다.
- build CSS의 baseline hash 또는 정규화된 규칙 순서가 저장되어 비교 가능하다.

### Phase 1. CSS source 계약 분리

파일 이동 전에 빌드와 테스트가 단일 파일에 의존하지 않게 한다.

### 작업

- chrome·preview token resolver가 `globals.css` 전체가 아닌 명시적인 token source를 받도록 API를 정리한다.
- `chrome-tokens-vite-plugin`의 기본 입력을 `styles/foundation/tokens.css`로 변경할 준비를 한다.
- 테스트용 `loadStyleManifest()` 유틸리티를 추가한다.
  - `globals.css`의 로컬 `@import`를 순서대로 해석한다.
  - 외부 package import는 읽지 않는다.
  - 중복 import와 순환 import를 오류로 처리한다.
  - 테스트 오류에는 실제 소유 파일과 줄 번호가 표시되어야 한다.
- 전체 CSS를 검사하는 integration guard는 manifest loader를 사용한다.
- 단일 기능을 검사하는 테스트는 향후 소유 모듈을 직접 읽도록 변경한다.

### 완료 기준

- 빌드 플러그인과 token generation이 token source 경로를 명시적으로 주입받는다.
- 정적 guard가 여러 CSS 파일에서도 동일한 위반을 탐지한다.
- 순환 import·존재하지 않는 import에 대한 단위 테스트가 있다.
- 이 단계만 적용했을 때 runtime CSS와 UI 동작은 바뀌지 않는다.

### Phase 2. 순서 보존형 기계적 추출

처음부터 최종 의미 구조로 재배열하지 않는다. 기존 라인 범위를 원래 순서대로 큰 파일로 옮겨 위험을 낮춘다.

### 임시 추출 단위

| 기존 대략 범위 | 임시 파일 | 주요 내용 |
| --- | --- | --- |
| 7~108 | `00-activity-and-vendor.css` | diff view, image zoom override |
| 109~459 | `01-theme-and-base.css` | variant, theme, root/dark, base |
| 460~857 | `02-feedback-and-mascot.css` | agent flash, collaboration, blob |
| 858~2377 | `03-editor-document.css` | layout, prose, code, links, table, handles |
| 2378~2657 | `04-interaction-motion.css` | presence, button, scroll fade |
| 2658~2954 | `05-runtime-theme.css` | theme inline, Electron alpha-aware |
| 2955~3415 | `06-component-chrome.css` | JSX wrapper, halo, resize |
| 3416~4510 | `07-rich-components-a.css` | Callout, footnote, Video, PDF, File, CM |
| 4511~5065 | `08-rich-components-b.css` | Accordion, Tabs, component chrome tail |
| 5066~5182 | `09-dark-overrides.css` | dark-mode 보정 |
| 5183~5291 | `10-source-mode.css` | CodeMirror source polish |
| 5292~5584 | `11-app-tail.css` | tags, chunking, Electron drag, page header |
| 5585~끝 | `12-print.css` | export surface와 print media |

이 단계의 파일명은 임시이며 selector나 선언을 수정하지 않는다.

### 작업

- `globals.css` 최상단 import 뒤에 위 임시 파일을 기존 순서대로 import한다.
- 각 규칙을 한 번만 이동한다.
- 원본의 주석과 인접 keyframe을 함께 이동한다.
- 이동 중 formatting, selector 병합, 색상 토큰 변경을 하지 않는다.
- 빌드 후 생성 CSS의 규칙·선언 순서를 기준선과 비교한다.

### 완료 기준

- `globals.css`에 feature selector가 남아 있지 않다.
- 생성된 CSS에서 규칙과 선언 순서 차이가 없다.
- light/dark visual baseline이 허용 오차 내에서 동일하다.
- `bun run --filter @nedian0brien/synapsenote-app build`가 성공한다.
- token generation과 drift test가 성공한다.

### Phase 3. Foundation과 플랫폼 모듈 확정

### 작업

- `01-theme-and-base.css`를 `tokens.css`와 `base.css`로 분리한다.
- `05-runtime-theme.css`에서 Electron 규칙을 `platform-electron.css`로 이동한다.
- reduced-transparency 규칙을 기본 규칙과 같은 모듈에 두되 원래 cascade 관계를 유지한다.
- chrome·preview token resolver의 canonical path를 `tokens.css`로 전환한다.
- token 관련 코드 주석과 생성 파일 안내를 갱신한다.

### 완료 기준

- `:root`, `.dark`, `@theme`, `@theme inline`의 소유 파일이 하나로 명확하다.
- `--sidebar` 변경 시 token generation과 drift test가 같은 파일을 읽는다.
- Electron alpha-aware·STOP rule 테스트가 새 소유 파일 기준으로 통과한다.
- Web mode에서 Electron selector가 적용되지 않는 기존 검증이 유지된다.

### Phase 4. 편집기 핵심 스타일 분리

### 작업

- `03-editor-document.css`를 prose base, code block, links, tables, interaction handles로 분리한다.
- collaboration cursor와 memo/agent feedback을 별도 파일로 모은다.
- source-mode CodeMirror 스타일을 `source-mode.css`로 확정한다.
- 큰 문서용 chunk/content-visibility 규칙을 `large-document.css`로 분리한다.
- TypeScript 주석의 `globals.css` 참조를 실제 소유 모듈 경로로 변경한다.

### 완료 기준

- `.ProseMirror` selector family가 책임별 파일로 분류되어 있다.
- table freeze, drag handle, selection halo, source mode 관련 기존 테스트가 통과한다.
- 동일 selector가 여러 파일에 중복 선언된 경우 의도와 순서가 주석으로 설명된다.
- visual editor와 source editor의 전환 전후 레이아웃 차이가 없다.

### Phase 5. JSX 컴포넌트와 rich component 분리

### 작업

- 공통 wrapper·selection halo·resize·chrome 규칙을 `component-chrome.css`로 확정한다.
- Callout/Footnote, Video/Embed, PDF, File, Tabs/Accordion, nested CodeMirror를 기능 파일로 분리한다.
- feature 전용 keyframe과 media query를 해당 파일로 이동한다.
- dark override를 가능한 경우 각 feature 파일의 기본 규칙 가까이에 이동한다.
- 순서 때문에 co-location할 수 없는 override만 `overrides/dark.css`에 남기고 이유를 기록한다.

### 완료 기준

- PDF, File, Tabs, Callout 등 주요 feature가 각각 명시적인 소유 파일을 갖는다.
- 공통 chrome selector와 feature body selector의 경계가 문서화되어 있다.
- JSX selection halo 정적 guard와 e2e가 통과한다.
- 각 feature의 light/dark visual snapshot에 의도하지 않은 차이가 없다.

### Phase 6. 서드파티 override와 print 격리

### 작업

- react-medium-image-zoom, Sonner 등 외부 DOM override를 `third-party.css`로 이동한다.
- 각 override에 대상 라이브러리와 제거 조건을 주석으로 남긴다.
- page header는 shell 모듈로 이동한다.
- PDF export root와 `@media print` 전체를 `print/pdf-export.css`에 둔다.
- print 규칙이 screen cascade의 마지막에 import되도록 고정한다.

### 완료 기준

- 외부 라이브러리 override가 앱 내부 selector와 분리되어 있다.
- image zoom dark override와 Sonner modal interaction 테스트가 통과한다.
- Markdown→PDF 출력에서 page header, table, code, image, accordion이 기준선과 동일하다.
- print 파일이 manifest의 마지막 import라는 자동 검증이 있다.

### Phase 7. 경계 강제와 정리

### 작업

- CSS import graph 검사 테스트를 추가한다.
- 파일별 줄 수 상한을 검사한다.
- `globals.css`에 import 외 규칙이 추가되면 실패하도록 한다.
- 새 전역 selector가 허용 prefix 없이 추가되면 리뷰 경고를 발생시킨다.
- 임시 추출 파일명을 최종 의미 기반 이름으로 전환한다.
- 중복 제거와 selector 단순화는 별도 PR 후보 목록으로만 기록한다.

### 완료 기준

- import cycle, duplicate import, missing import 검사가 자동화되어 있다.
- `globals.css`가 120줄 이하이고 feature rule을 포함하지 않는다.
- 모든 leaf CSS가 800줄 이하이거나 문서화된 예외가 있다.
- 전체 repository 검색에서 오래된 `globals.css` 섹션 참조가 남아 있지 않다.

## 9. 테스트 전략

### 9.1 정적 구조 테스트

- manifest에는 허용된 외부 import와 로컬 import만 존재한다.
- 로컬 import는 평평하며 중복·순환이 없다.
- token source에 필요한 `:root`, `.dark`, `--sidebar`가 존재한다.
- print 모듈은 마지막에 import된다.
- selection halo STOP rule이 새 파일에서도 유지된다.
- Electron alpha-aware selector가 inner editor surface를 대상으로 하지 않는다.

### 9.2 빌드 출력 비교

기계적 추출 전후에 production build를 각각 생성하고 최종 CSS를 비교한다.

- asset hash를 제외한 CSS 본문 비교
- selector 순서 비교
- declaration 순서 비교
- gzip 크기 비교
- `size-limit`의 52KB CSS 예산 확인

기계적 추출 단계에서는 규칙·선언 순서 차이 0을 목표로 한다. 최종 파일 크기 증가는 1%를 초과하지 않아야 하며, 초과하면 원인을 설명하고 승인받는다.

### 9.3 DOM·computed-style 검증

다음 상태에서 핵심 요소의 computed style을 비교한다.

- light / dark
- Web / Electron renderer
- visual editor / source editor
- normal / reduced motion
- normal / reduced transparency
- selected JSX block / nested selected block
- frozen table header / horizontal scroll
- modal·popover가 열린 Electron drag region

### 9.4 Visual QA 매트릭스

| 영역 | Light | Dark | 상호작용 상태 |
| --- | --- | --- | --- |
| 앱 shell + sidebar | 필수 | 필수 | Electron/Web |
| ProseMirror 기본 문서 | 필수 | 필수 | focus/selection |
| 코드 블록 + HTML preview | 필수 | 필수 | hover/edit |
| 표 | 필수 | 필수 | scroll/frozen/resize |
| JSX component chrome | 필수 | 필수 | hover/selected/nested |
| Callout/Tabs/Accordion | 필수 | 필수 | open/closed |
| PDF/File/Video | 필수 | 필수 | toolbar/selection |
| page header | 필수 | 필수 | cover/icon/long title |
| print export | 인쇄 기준 | 인쇄 기준 | multi-page |

### 9.5 실행 명령

구현 중에는 가장 작은 범위부터 실행한다.

```bash
bun run --filter @nedian0brien/synapsenote-app typecheck
bun run --filter @nedian0brien/synapsenote-app lint
bun run --filter @nedian0brien/synapsenote-app test
bun run --filter @nedian0brien/synapsenote-app test:dom
bun run --filter @nedian0brien/synapsenote-app test:integration
bun run --filter @nedian0brien/synapsenote-app test:visual
bun run --filter @nedian0brien/synapsenote-app build
bun run --filter @nedian0brien/synapsenote-app size
```

PR 준비 시에는 repository-wide `bun run check`를 실행한다.

## 10. PR 분할 전략

한 번에 전체 파일을 이동하지 않는다.

1. **PR A — style source infrastructure**
   - manifest loader
   - token source 주입
   - 정적 테스트의 다중 파일 대응
   - runtime CSS 변경 없음
2. **PR B — mechanical extraction**
   - 임시 순서 보존 파일로 이동
   - selector·declaration 변경 없음
3. **PR C — foundation/platform finalization**
   - tokens/base/Electron 분리
4. **PR D — editor core split**
   - prose/code/link/table/handle/source 분리
5. **PR E — component feature split**
   - chrome, media, PDF, File, Tabs, Accordion 분리
6. **PR F — print/third-party/boundary gates**
   - print 격리
   - third-party override 격리
   - 파일 크기·import graph 자동 가드

각 PR은 독립적으로 build 가능하고 시각 회귀가 없어야 한다. PR B 이후에만 `globals.css` 크기 목표를 적용한다.

## 11. 위험과 대응

| 위험 | 영향 | 대응 |
| --- | --- | --- |
| import 순서 변경 | 다크 모드·override 회귀 | 단일 manifest, build CSS 순서 비교 |
| Tailwind가 분리 파일을 누락 | utility 또는 `@apply` 미생성 | production build와 computed-style probe |
| token resolver가 import를 못 따라감 | desktop chrome build 실패 | token source 명시 주입 후 이동 |
| 테스트가 원본 경로만 읽음 | 잘못된 통과 또는 대량 실패 | manifest loader와 owner-file test로 전환 |
| dark override의 성급한 co-location | 동일 specificity 우선순위 변경 | 기계적 분리 후 별도 단계에서 이동 |
| CSS Modules 과사용 | ProseMirror/portal DOM에 class 미적용 | 전역 CSS 허용 기준 유지 |
| 너무 작은 파일로 과분할 | 탐색 비용과 import noise 증가 | 100~500줄 권장, 기능군 단위 분리 |
| 동시 기능 개발과 충돌 | 이동 중 변경 유실 | 단계별 작은 PR, 이동 대상 freeze, `git diff --word-diff` 검토 |
| 번들 크기 증가 | CSS size-limit 실패 | gzip baseline과 1% 허용 기준 |

## 12. 구현 체크리스트

모든 항목은 완료 기준을 포함한다.

### 준비

- [ ] CSS inventory를 생성한다.
  - 완료 기준: `globals.css`의 모든 최상위 규칙이 정확히 하나의 목표 모듈에 매핑된다.
- [ ] 직접 파일 소비자를 확정한다.
  - 완료 기준: build plugin, token script, unit/integration test 목록이 repository search 결과와 일치한다.
- [ ] visual/build 기준선을 저장한다.
  - 완료 기준: light/dark 스크린샷과 production CSS 크기·규칙 순서를 비교할 수 있다.

### 인프라

- [ ] style manifest loader를 구현한다.
  - 완료 기준: 로컬 import를 순서대로 읽고 cycle, duplicate, missing file을 각각 테스트한다.
- [ ] token resolver를 명시적 source 경로 기반으로 바꾼다.
  - 완료 기준: `--sidebar` token generation과 drift test가 새 source로 통과한다.
- [ ] 기존 정적 테스트를 owner file 또는 manifest loader로 전환한다.
  - 완료 기준: `globals.css` 본문에 selector가 없어도 모든 guard가 유효하게 실패·통과한다.

### 기계적 분리

- [ ] 순서 보존 임시 파일을 생성한다.
  - 완료 기준: 원본 규칙이 누락·중복 없이 한 번씩 존재한다.
- [ ] `globals.css`를 import manifest로 전환한다.
  - 완료 기준: feature selector가 없고 import 순서가 원본 cascade와 일치한다.
- [ ] production CSS를 기준선과 비교한다.
  - 완료 기준: selector·declaration 순서 차이가 0이다.

### 의미 기반 모듈화

- [ ] foundation과 Electron 스타일을 분리한다.
  - 완료 기준: token, base, platform 소유권이 겹치지 않고 관련 테스트가 통과한다.
- [ ] 편집기 핵심 스타일을 분리한다.
  - 완료 기준: prose, code, links, tables, handles, source mode가 각각 소유 파일을 갖는다.
- [ ] JSX component chrome을 분리한다.
  - 완료 기준: wrapper/halo/resize/add-child 공통 규칙이 한 모듈에 모이고 nested selection e2e가 통과한다.
- [ ] rich component 스타일을 분리한다.
  - 완료 기준: PDF, File, Tabs/Accordion, Callout, media가 각 feature 파일에 존재한다.
- [ ] third-party와 print 스타일을 분리한다.
  - 완료 기준: 외부 override에 대상 라이브러리 주석이 있고 print 파일은 마지막 import다.

### 회귀 방지

- [ ] import graph guard를 추가한다.
  - 완료 기준: cycle, duplicate, missing import를 CI에서 차단한다.
- [ ] 파일 크기 guard를 추가한다.
  - 완료 기준: `globals.css` 120줄, leaf 800줄 상한을 위반하면 테스트가 실패한다.
- [ ] 코드 주석과 문서 경로를 갱신한다.
  - 완료 기준: feature 규칙을 설명하면서 막연히 `globals.css`만 가리키는 참조가 남지 않는다.
- [ ] 전체 검증을 실행한다.
  - 완료 기준: app test/typecheck/lint/build/visual/size와 repository-wide check가 통과한다.

## 13. 최종 완료 정의

이 리팩토링은 다음 조건을 모두 만족할 때 완료된다.

- `globals.css`는 120줄 이하의 안정적인 import manifest다.
- feature selector와 keyframe이 `globals.css`에 남아 있지 않다.
- 모든 CSS 모듈은 명확한 소유권과 크기 상한을 가진다.
- build·token generation·정적 guard가 단일 물리 파일에 의존하지 않는다.
- import graph가 평평하고 순환·중복이 없다.
- production CSS 번들 크기가 기존 예산 안에 있다.
- light/dark, Web/Electron, visual/source, accessibility, print 회귀 검증이 통과한다.
- 기계적 분리 PR에는 의도적인 디자인 변경이 없다.
- 후속 CSS 개선 항목은 모듈화와 분리된 별도 backlog로 관리된다.
