# SynapseNote 디자인 시스템 & 화면 구현 핸드오프

> 대상: 이 문서만 보고 구현을 수행할 다른 에이전트/개발자.
> 작업 위치: `/home/ubuntu/project/SynapseNote/.worktrees/appflowy-web/` (AppFlowy Web 포크, 브랜치 `synapsenote-branding`).
> 비주얼 원천(source of truth): `doc/prototype.html`, `doc/design-system.html` (아래 2절).

---

## 0. 한 줄 목표

AppFlowy(파란 계열)와 기존 SynapseNote(Graph 탭의 웜뉴트럴) 두 디자인으로 갈라진 앱을, **Graph 탭의 SynapseNote 방향성을 원천으로 하나의 디자인 시스템으로 통합**하고, 그 위에서 **Search 탭 → Agent 탭으로 전환**하며 **Home·Library·Agent 화면을 Notion/ChatGPT 수준으로 재구현**한다.

---

## 1. 디자인 원칙 (반드시 준수)

`doc/DESIGN_QUALITY_PLAN.md`를 따른다. 요약:

- **흰색 surface 기본.** 색은 상태·선택에만 제한적으로 쓴다. 베이지/브라운/보라/블루 그라데이션 배경 금지.
- **pill·둥근 모서리는 정체성**이되 모든 요소에 기계적으로 강제하지 않는다. **pill 버튼은 명령형 action에만**, **아이콘 버튼은 정사각형(둥근) 히트 영역**(원형은 Graph 오버레이 한정).
- 문서 편집 영역이 가장 조용해야 한다. 장식·그림자·대비는 사이드바와 떠 있는 메뉴에 집중.
- 정보 밀도를 낮추지 않는다. 여백은 정돈용이지 기능 은폐용이 아니다.
- **모션은 120–180ms opacity/scale 위주.** 과한 spring 남발 금지.
- **Light가 기본 테마.** Dark는 명시적 선택/URL일 때만. Dark는 중립 그레이 기반이며 앰버는 액션 액센트로만 쓴다(아래 5절).
- 노드/타입 구분은 배경색이 아니라 stroke·아이콘·label weight로.

---

## 2. 비주얼 스펙(원천): 프로토타입

구현은 아래 두 HTML을 **실제 토큰으로 렌더된 픽셀 기준**으로 삼는다. 새 색을 발명하지 말 것.

| 파일 | 역할 |
|---|---|
| `doc/prototype.html` | 고충실도 앱 셸. **사이드바 + Home/Library/Graph/Agent** 화면, 라이트/다크 토글, 인터랙션. |
| `doc/design-system.html` | 토큰·컴포넌트 레퍼런스(색·타이포·라운드·그림자·모션·프리미티브 카탈로그). |

**띄우는 법** (loopback, VSCode 포트포워딩으로 접근):

```bash
cd /home/ubuntu/project/SynapseNote/.worktrees/appflowy-web/doc
python3 -m http.server 8123 --bind 127.0.0.1
# http://localhost:8123/prototype.html
# http://localhost:8123/design-system.html
```

> 두 HTML의 `:root` 토큰 블록은 실제 `src/styles/synapsenote.css`를 미러링한 것이다. **CSS 값을 바꿔야 한다면 프로토타입과 실제 토큰 파일을 함께 수정**해 동기화를 유지한다.

---

## 2.5 구현 충실도 규칙 (최우선 — 이 절이 다른 모든 지시에 우선)

**합격 기준 = `prototype.html`을 픽셀 단위까지 동일하게, 모든 기능을 죽은 버튼 없이 구현.** 단순화·근사·생략 금지.

### (A) 픽셀 정합 — "CSS 직접 이식" 전략 (필수)
값을 눈대중으로 옮기지 말 것. 프로토타입의 컴포넌트 CSS를 **그대로 이식**해 정합을 구조적으로 보장한다.

1. `prototype.html`의 `<style>`에서 **토큰 블록(`:root`, `[data-theme]`)을 제외한 모든 컴포넌트 CSS**(`.sb*`, `.tree-row`, `.page`, `.greeting`, `.stat-card`, `.hcard`, `.list/.lrow`, `.tbl/.thead/.trow`, `.agent*`, `.composer*`, `.empty/.scard`, `.btn/.iconbtn/.field/.chip/.seg` …)를 앱 스타일시트로 옮긴다. 권장: `src/styles/synapse-app.css`(화면별로 분할 가능)를 만들고 `src/styles/global.css`의 `synapse-panels.css` 다음에 `@import`.
2. 이식한 CSS는 **토큰을 재정의하지 말고** 이미 전역에 있는 `var(--surface)`·`var(--on-surface)`·`var(--primary-dim)`·`var(--r-*)`·`var(--shadow-*)`·`var(--font-hl)`·`var(--dur*)`·`var(--ease*)`·`var(--sn-favorite)` 등을 그대로 참조한다(앱이 light/dark 자동 테마).
3. 프로토타입의 다크 전용 컴포넌트 규칙(`[data-theme="dark"] .tile.a { … }` 등 카테고리 타일 색)은 앱의 다크 선택자 **`:root[data-dark-mode="true"] .tile.a { … }`**로 바꿔 이식한다. (프로토타입=`data-theme`, 앱=`data-dark-mode`.) `--sn-favorite`는 아직 토큰 파일에 없으니 `synapsenote.css`에 추가(light `#e0a93a` / dark `#e0c36a`).
4. React 컴포넌트는 **동일한 DOM 구조 + 동일한 class 이름**을 출력한다 → 픽셀은 이식한 CSS가 보장.
5. 부득이 Tailwind/인라인으로 처리하는 부분은 **임의값으로 정확히** 맞춘다(`h-[46px]`, `text-[13.5px]`, `gap-[12px]`, `px-[15px]`). 스케일 반올림 금지(13.5px를 `text-sm`으로 대체 금지).
6. `font-hl`(Lexend)·`font-bd`(Inter)·Material Symbols `.icon`은 `index.html`에 이미 로드됨 — 추가 로딩 불필요.

> 7절 프리미티브는 "픽셀을 바꾸는 추상화"가 아니라 **"같은 DOM/CSS를 캡슐화"**하는 용도다. 프리미티브 사용 여부와 무관하게 최종 픽셀은 프로토타입과 동일해야 한다.

### (B) 기능 완전성 (필수)
- **죽은 버튼·플레이스홀더 금지.** 프로토타입에 보이는 모든 컨트롤은 실제 동작.
- 데이터는 4절 **실제 훅에 연결**(목 데이터 금지). 단 서버 API가 아직 없는 부분(예: Agent LLM 응답)은 **네트워크 호출 한 곳만** `// TODO(api)` 함수로 분리해 stub하고, **그 외 UI/상호작용(낙관적 메시지 추가·로딩·스트리밍 렌더·인용·소스·액션바·툴 토글)은 전부 실제 구현**.
- 접근성: 버튼 `aria-label`, 트리 `aria-expanded`, 네비 `aria-current`, 입력 포커스 링 유지.

### (C) 전체 기능 체크리스트 (모두 동작해야 합격)
- **사이드바**: 워크스페이스 스위처 메뉴 · 패널 접기 · 검색(⌘K) 오픈 · Home/Library/Graph/Agent 전환+active · 알림 · 즐겨찾기 섹션 접기/항목 클릭/행 hover 액션 · 트리 스페이스·페이지 펼침(2뎁스+)/active/지연로딩 · 행 hover `⋯`·`+`(하위페이지 생성) · 휴지통·설정·새 페이지.
- **Home**: 통계(실데이터) · 최근 방문 클릭→문서 열기 · 이어서 작업 · 스페이스 클릭→열기 · 섹션 "전체 보기".
- **Library**: 뷰 전환(목록/테이블/보드/갤러리 모두 실동작) · 검색 · 필터 · 정렬 · 그룹 · 행 클릭→열기 · 그룹 접기.
- **Agent**: 모델 셀렉터 메뉴 · 대화기록 · 새 대화 · 빈상태 제안 클릭→입력/전송 · 메시지 전송→응답(인용·소스) · 메시지 액션(복사/좋아요/싫어요/다시생성/공유) · 컴포저 툴 토글(그래프 컨텍스트·웹·멘션) · 전송.
- **공통**: 라이트/다크 토글 일괄 재테마 · 데스크톱/태블릿/375px 반응형(프로토타입 미디어쿼리 준수).

---

## 3. 현재 코드 상태

### 이미 적용됨 (검증 불필요, 그대로 사용)
- **토큰 3계층** — `src/styles/synapsenote.css`
  - Layer 1: 브랜드 프리미티브 `--sn-*` (light + **중립 dark**), `--sn-error`/`--sn-dot` 추가.
  - Layer 2: 전역 시맨틱 토큰을 `:root`로 승격(`--surface`,`--on-surface`,`--primary-dim`,`--r-*`,`--shadow-*`,`--font-hl/bd`, **모션 `--dur-*`/`--ease-*`**, 타입/스페이싱 스케일, `--g-dot`). ← 기존에 Graph CSS가 사용하지만 미정의였던 모션/점격자 토큰을 복구함.
  - Layer 3: AppFlowy 파란색 토큰(`--text-action`,`--fill-theme-*`,`--border-theme-*`,`--surface-container-layer-*`,`--ai-primary` 등)과 shadcn HSL(`--primary`/`--ring`)을 SynapseNote로 재매핑. **특이도 처리 완료**(라이트·다크 모두 적용).
- **Tailwind colors** — `tailwind/colors.cjs`에 `sn.*` 시맨틱 색 그룹 추가(`bg-sn-surface`, `text-sn-ink`, `border-sn-outline`, …).

### 남은 작업 (이 핸드오프의 본체)
1. `tailwind.config.cjs` 확장(폰트/모션/그림자/라운드) — 6절.
2. React 프리미티브 생성 — 7절.
3. Search → Agent 전환 — 9절.
4. Home/Library/Agent/Sidebar 재구현 — 8절.
5. 품질 게이트 통과 + 커밋/푸시 — 10·11절.

---

## 4. 코드베이스 지도

### 네비게이션 / 라우팅 (Search→Agent, 사이드바 작업 대상)
| 파일 | 역할 |
|---|---|
| `src/components/app/navigation/appSections.ts` | `APP_SECTIONS = ['home','library','graph','search']`, `AppSection` 타입, `getAppSectionPath()`. |
| `src/components/app/SideBar.tsx` | 사이드바 셸 + `AppNavigationTabs`(L95–128, 탭 정의 L23–32). |
| `src/components/app/AppRouter.tsx` | 섹션 라우트(L19–22). |
| `src/pages/AppSectionPage.tsx` | 섹션별 화면 분기(home/library/graph/search). **Home·Library·Agent 본문 구현 위치.** |

### 화면 구현에 재사용할 데이터 훅 — `src/components/app/app.hooks.tsx`
| 훅 | 반환/용도 |
|---|---|
| `useUserWorkspaceInfo()` | `selectedWorkspace`(id,name,role) 등. |
| `useCurrentWorkspaceId()` | 현재 워크스페이스 id. |
| `useAppOutline()` | 워크스페이스 전체 아웃라인(뷰 트리). Library/사이드바 트리에 사용. |
| `useAppRecent()` | `{ recentViews, loadRecentViews }`. Home "최근 방문". |
| `useAppFavorites()` | `{ favoriteViews, loadFavoriteViews }`. **즐겨찾기 — 이미 지원됨.** |
| `useAppTrash()` | 휴지통. |
| `useToView()` | `toView(viewId)` 네비게이트. |
| `useAppView(viewId)` / `useLoadViewChildren()` / `useLoadViewChildrenBatch()` | 트리 지연 로딩. |
| `useSidebarSelectedViewId()` | 현재 선택된 뷰(트리 active 표시). |
| `useAIEnabled()` | AI 기능 on/off (Agent 분기). |
| `useRevalidateSidebarOutline()` / `useRefreshOutline()` | 트리 갱신. |

### 재사용할 기존 컴포넌트
| 컴포넌트 | 경로 | 용도 |
|---|---|---|
| `OutlineDrawer` | `@/components/_shared/outline` | 사이드바 드로어 셸(리사이즈/스크롤). |
| `Workspaces` | `@/components/app/workspaces` | 워크스페이스 스위처(아바타+이름). |
| `Outline` (sidebar) | `src/components/app/outline/Outline.tsx` (+ `SpaceItem`, `ViewItem`, `AnimatedCollapse`) | **중첩 페이지 트리** 본체. 사이드바 트리는 이걸 확장. |
| `SharedOutline` | `@/components/_shared/outline/Outline` | Library 트리 렌더. |
| `Favorite` | `src/components/app/favorite/Favorite.tsx` | **즐겨찾기 섹션** — `useAppFavorites()` 사용. 사이드바 즐겨찾기에 재사용/확장. |
| `NewPage` | `@/components/app/view-actions/NewPage` | 새 페이지 버튼. |
| `NotificationBell` | `@/components/notifications` | 알림. |
| `Search` | `@/components/app/search` | `mode='shortcut'`(⌘K) / `mode='page'`. **Agent에서 검색 파트 재사용.** |
| `SearchAIOverview`, `BestMatch`, `ViewList`, `RecentViews` | `src/components/app/search/` | Agent의 AI 답변·결과 목록 재료. |
| `ChatPanel` | `src/features/synapse-graph/ChatPanel.jsx` | 기존 채팅 UI. **Agent 대화 파트의 기반.** |
| `SynapseGraphWorkspace` | `@/features/synapse-graph/SynapseGraphWorkspace` | Graph 탭(그대로 유지). |

### 스타일
| 파일 | 역할 |
|---|---|
| `src/styles/synapsenote.css` | **토큰 단일 원천.** 3계층 + 컴포넌트 오버라이드. |
| `src/styles/synapse-graph.css`, `synapse-panels.css` | Graph/패널 컴포넌트 스타일(`--surface`/`--primary` 등 시맨틱 토큰 사용, 이제 모션 토큰 복구로 정상화). |
| `src/styles/variables/semantic.{light,dark}.css` | AppFlowy 베이스(자동 생성, 직접 수정 금지). Layer 3가 위에서 덮음. |

### 아이콘
- 기존 네비 아이콘: `@/assets/icons/{home,file,hashtag,search}.svg` (SVG ReactComponent).
- Material Symbols Outlined가 `index.html`에 로드돼 있고 `.icon` 클래스(synapsenote.css)로 사용 가능 → 신규 UI(Agent 등)는 이걸 써도 됨.
- **Agent 아이콘 필요**: `auto_awesome`(Material Symbols) 사용 또는 `@/assets/icons/agent.svg` 신규 추가. Library 아이콘은 `folder_open`/`file` 계열로 통일 권장.

---

## 5. 디자인 토큰 (단일 원천 = `src/styles/synapsenote.css`)

새 색을 만들지 말고 아래 토큰만 사용한다. (Tailwind는 `sn.*` 유틸 또는 `var(--…)`.)

### 5.1 브랜드 프리미티브 `--sn-*`

| 토큰 | Light | Dark(중립) | 의미 |
|---|---|---|---|
| `--sn-bg` | `#fbfbfa` | `#1a1a18` | 앱 배경 |
| `--sn-surface` | `#ffffff` | `#242422` | 카드/패널 |
| `--sn-surface-low` | `#f5f5f2` | `#1f1f1d` | 사이드바/저단 |
| `--sn-surface-high` | `#ececea` | `#2e2e2b` | 강조 표면 |
| `--sn-on-surface` | `#222220` | `#ededea` | 제목·본문 |
| `--sn-on-variant` | `#5f5f58` | `#a6a6a0` | 보조 텍스트 |
| `--sn-muted` | `#8a8a82` | `#73736d` | 캡션·placeholder |
| `--sn-outline` | `rgba(36,36,32,.13)` | `rgba(255,255,255,.11)` | 외곽선 |
| `--sn-outline-soft` | `rgba(36,36,32,.07)` | `rgba(255,255,255,.06)` | 옅은 구분선 |
| `--sn-primary` | `#242420` | `#d0a85e` | **액션/선택 액센트** |
| `--sn-primary-icon` | `rgba(255,255,255,.94)` | `rgba(20,18,12,.95)` | primary 위 전경 |
| `--sn-primary-dim` | `rgba(36,36,32,.06)` | `rgba(255,255,255,.07)` | **hover/선택 틴트(중립)** |
| `--sn-error` | `#d24a3a` | `#e6705e` | 상태 전용 |
| `--sn-dot` | `rgba(36,36,32,.10)` | `rgba(255,255,255,.08)` | Graph 점격자 |

> **다크 핵심 규칙**: 앰버(`--sn-primary`)는 **액션 버튼·활성 상태·전송·AI 액센트에만**. 텍스트·외곽선·hover는 전부 중립. (즐겨찾기 별만 관례상 골드 `--sn-favorite`.)

### 5.2 시맨틱/구조 토큰 (`:root`, 자동 테마)
- 색 별칭: `--surface`, `--surface-low`, `--surface-high`, `--on-surface`, `--on-variant`, `--primary-icon`, `--primary-dim`, `--error`, `--bg`. (⚠️ `--primary`/`--muted`는 **전역에서 hex로 쓰지 말 것** — 5.4 함정 참조. 브랜드 잉크/뮤트가 필요하면 `--sn-primary`/`--sn-muted` 사용.)
- 라운드: `--r-xs 8` · `--r-sm 12` · `--r-md 16` · `--r-lg 22` · `--r-xl 28` · `--r-full 9999`.
- 그림자: `--shadow-sm|md|lg`.
- 폰트: `--font-hl`=Lexend(디스플레이/제목/통계), `--font-bd`=Inter(본문/UI).
- 타입 스케일(px): display 28 / title 20 / heading 16 / body 14 / sm 12 / label 11 / micro 9. 라벨은 대문자 + `letter-spacing .08–.12em`.
- 스페이싱(4px base): `--sp-1..--sp-10` (4,8,12,16,20,24,32,40).
- 모션: `--dur-fast 120ms` · `--dur 180ms` · `--dur-slow 320ms` · `--ease` · `--ease-out` · `--ease-spring`.

### 5.3 컴포넌트 패턴 토큰화 (요지)
- 카드/패널: `bg=surface`, `border=1px outline`, `radius=r-lg/r-xl`, `shadow=shadow-md/lg`(떠있을 때만).
- pill: `radius=r-full`. 명령 버튼/칩/검색입력.
- 선택/hover: `background=primary-dim` (중립 틴트), 텍스트 `on-surface`.
- 통계 숫자: `font-hl`, weight 800, `tabular-nums`.

### 5.4 ⚠️ 함정 두 가지 (반드시 인지)
1. **shadcn HSL vs hex 충돌.** shadcn 토큰 `--primary`,`--muted`,`--ring`은 `hsl(var(--primary))` 형태로 소비된다. 전역 `:root`에 `--primary: #hex`를 넣으면 `hsl(#hex)` → 무효 → shadcn 버튼 전부 깨짐. 그래서 Layer 3는 `--primary`를 **HSL 트리플릿**으로 준다(light `60 6% 13%`, dark `39 55% 59%`). Graph/패널 CSS는 `.synapse-graph-route` **스코프 안에서만** `--primary: var(--sn-primary)`(hex)로 재정의하므로 안전(자식은 가장 가까운 조상값 상속).
2. **CSS 특이도.** `semantic.dark.css`는 `:root[data-dark-mode=true]`(0,2,0)로 파란색을 정의한다. 재매핑이 다크에서 이기려면 **동일/상위 특이도**가 필요 → Layer 3는 `:root, :root[data-dark-mode]`(0,2,0)를 쓰고, `synapsenote.css`가 더 늦게 로드되어 소스 순서로 승리한다. 새 토큰 오버라이드를 추가할 때 이 패턴을 따를 것.

---

## 6. Tailwind 설정 확장 (적용할 것)

`tailwind/colors.cjs`의 `sn.*` 그룹은 이미 추가됨. `tailwind.config.cjs`의 `theme.extend`에 아래를 추가한다(폰트/모션/그림자/라운드):

```js
// theme.extend 안에서: 기존 `boxShadow,` 를 아래로 교체하고 나머지 키 추가
boxShadow: {
  ...boxShadow,
  'sn-sm': 'var(--shadow-sm)',
  'sn-md': 'var(--shadow-md)',
  'sn-lg': 'var(--shadow-lg)',
},
fontFamily: {
  hl: ['Lexend', 'system-ui', 'sans-serif'],   // font-hl
  bd: ['Inter', 'system-ui', 'sans-serif'],     // font-bd
},
transitionTimingFunction: {
  sn: 'var(--ease)', 'sn-out': 'var(--ease-out)', 'sn-spring': 'var(--ease-spring)',
},
transitionDuration: {
  'sn-fast': 'var(--dur-fast)', sn: 'var(--dur)', 'sn-slow': 'var(--dur-slow)',
},
borderRadius: {
  100: '4px', 200: '6px', 300: '8px', 400: '12px', 500: '16px', 600: '20px',
  'sn-xs': 'var(--r-xs)', 'sn-sm': 'var(--r-sm)', 'sn-md': 'var(--r-md)',
  'sn-lg': 'var(--r-lg)', 'sn-xl': 'var(--r-xl)',
},
```

→ 사용 예: `bg-sn-surface text-sn-ink border-sn-outline rounded-sn-lg shadow-sn-md font-hl duration-sn ease-sn-spring`.

---

## 7. React 프리미티브 (`src/components/design-system/`)

`cn`은 `@/lib/utils`. shadcn `ui/`와 충돌하지 않게 별도 디렉터리. 각 컴포넌트는 위 토큰/유틸만 사용.

생성 목록 + 스펙:

| 컴포넌트 | props(요지) | 비고 |
|---|---|---|
| `Surface` | `variant: 'flat'\|'raised'\|'floating'`, `interactive?: boolean`, `as?` | flat=outline만, raised=+shadow-sm, floating=blur+shadow-lg. interactive면 hover `translateY(-2px)+shadow-md`(ease-spring). |
| `Pill` | `as?`, children | `inline-flex items-center rounded-sn-full`. 툴바/검색입력 컨테이너 기반. |
| `Chip` | `variant:'default'\|'dim'\|'solid'\|'dashed'`, `icon?` | 태그/칩. default=surface+outline, dim=primary-dim, solid=primary, dashed=점선 제안. |
| `IconButton` | `shape:'square'\|'circle'='square'`, `size`, `variant:'ghost'\|'bordered'\|'primary'`, `aria-label` | **기본 정사각형**(rounded-sn-sm). circle은 Graph 오버레이 전용. hover: square=bg, circle=scale(1.08). |
| `Button` | `variant:'primary'\|'secondary'\|'ghost'`, `size`, `icon?` | **pill(rounded-full)**, 명령 action용. shadcn `ui/button`을 쓰되 SynapseNote 토큰을 상속하므로, 신규 화면은 이 DS Button 또는 shadcn 중 택1로 일관되게. |
| `SectionLabel` | children | 초소형 대문자 트래킹 라벨(`text-[11px] font-bold uppercase tracking-[.09em] text-sn-muted`). |
| `PageHeader` | `title`, `subtitle?`, `actions?` | Lexend 타이틀 + muted 서브 + 우측 actions 슬롯. 하단 `border-b border-sn-outline-soft`. |
| `Stat` | `value`, `label`, `icon?` | 큰 Lexend 숫자(tabular-nums) + 대문자 라벨. `StatCard` 변형(아이콘 타일 포함)도. |
| `ListRow` | `icon`, `title`, `meta?`, `trailing?`, `onClick`, `indent?` | 아이콘 타일 + 제목 + meta + 우측(chevron/칩). hover `bg-primary-dim`. Home/Library/Agent 공용. |
| `DottedBackdrop` | children | `--g-dot` 점격자 배경 래퍼(Hero/Graph 빈상태). |
| `tokens.ts` | — | 모션 등 JS에서 쓸 상수 export(`DUR`, `EASE`). |
| `index.ts` | — | 배럴 export. |

> **픽셀 정합 우선(2.5-A):** 각 프리미티브는 프로토타입의 대응 CSS 클래스(`.btn`,`.iconbtn`,`.chip`,`.card`,`.list .lrow`,`.stat-card`,`.label`,`.page-head` 등)를 **그대로 출력**한다(클래스명·DOM 보존). 프리미티브는 그 마크업을 캡슐화할 뿐, 값을 새로 정의해 픽셀을 바꾸지 않는다. 프리미티브화가 부담되면 화면에서 직접 같은 마크업을 써도 무방하다 — 기준은 "프로토타입과 동일한 픽셀".

---

## 8. 화면 구현 스펙

각 화면은 `doc/prototype.html`의 해당 뷰와 **픽셀 동일(2.5-A) + 전 기능 동작(2.5-B·C)**이어야 한다. 아래는 데이터/재사용 매핑이며, 시각값·간격·인터랙션의 최종 기준은 항상 프로토타입이다. 표현이 모호하면 프로토타입을 따른다.

### 8.1 Sidebar (Notion급) — `SideBar.tsx` 확장
프로토타입 `<aside class="sb">` 참조. 위→아래 구성:
1. **워크스페이스 스위처**: 기존 `Workspaces` 사용(아바타+이름+`unfold_more`). 우측 패널 접기 아이콘.
2. **1차 네비게이션 그룹**(이번 핵심): 검색(⌘K, `Search mode='shortcut'`) → **Home · Library · Graph · Agent** → 받은 알림(`NotificationBell` 배지). `AppNavigationTabs`(L95–128)를 이 그룹으로 재배치. active는 `location.pathname === getAppSectionPath(...)`.
3. **즐겨찾기 섹션**: 접이식 헤더 + `Favorite`/`useAppFavorites()`의 `favoriteViews` 렌더. 행 hover 시 `⋯`/`+` 액션.
4. **워크스페이스 페이지 트리**: 기존 `Outline`(`SpaceItem`/`ViewItem`/`AnimatedCollapse`) 확장 — 중첩 펼침(셰브론 회전), 페이지 아이콘, **hover 시 `⋯`(더보기)·`+`(하위 페이지) 노출**, active=`useSidebarSelectedViewId()`. 지연 로딩은 `useLoadViewChildren`.
5. **하단 고정**: 휴지통(`useAppTrash`) · 설정 · **새 페이지**(`NewPage`).

품질 포인트: 행 치수·패딩·들여쓰기·아이콘 크기는 **이식한 `.sb-item`/`.tree-row`/`.lvl-1`/`.lvl-2`/`.row-acts` CSS 그대로**(근사 금지). hover/active=`primary-dim`+`on-surface`, 섹션 헤더는 `.sb-sec-h` 톤, hover 액션은 `opacity 0→1`(`.row-acts`).

### 8.2 Home — `AppSectionPage.tsx` (section==='home')
프로토타입 `#view-home`. 구성:
- `PageHeader`: 인사말("좋은 저녁이에요, {유저명}")+날짜. (유저명: `useUserWorkspaceInfo`.)
- **통계 카드 4개**(`StatCard`): 문서 수 / **연결 수(hub)** / 스페이스 수 / 오늘 편집. 문서·스페이스·오늘편집은 `useAppOutline`/`useAppRecent`에서 **실제 집계**. 연결 수는 그래프 링크 데이터(`src/features/synapse-graph/`의 `outlineToGraph`/`currentDocumentLinks`)에서 **실제 산출**(엔드포인트가 없으면 링크 파싱으로 계산). 임의의 가짜 숫자 금지.
- **최근 방문**(`useAppRecent` → `recentViews`): 가로 카드 그리드(아이콘 타일+제목+상대시간). 클릭 `useToView`.
- **이어서 작업**: 최근 편집/미완료(가능 데이터로). 없으면 최근으로 대체.
- **스페이스**: `useAppOutline`에서 `extra.is_space && !is_hidden_space` 필터(현 코드 L28–31 로직 재사용) → 카드 그리드.
- 빈 상태: 설명보다 다음 행동(새 문서/스페이스 만들기) 버튼 제시.

### 8.3 Library — `AppSectionPage.tsx` (section==='library')
프로토타입 `#view-library`. 구성:
- `PageHeader`: "Library" + "모든 문서 · {count}" + 우측 `Button`(새 문서).
- 툴바: **뷰 전환 세그먼트**(목록/테이블/보드/갤러리 — **4개 모두 실제 전환·렌더**. 보드/갤러리는 AppFlowy의 기존 뷰 렌더러를 재사용해도 됨. 죽은 탭 금지) + 검색 `field`(실시간 필터) + 필터/정렬/그룹 `Chip`(각각 실제 동작 — 정렬 토글, 그룹 기준 변경, 필터 패널).
- **스페이스별 그룹 테이블**: `useAppOutline` 트리를 그룹 헤더(스페이스) + 행(이름·태그·**연결수(hub)**·수정일)으로. 행 클릭 `useToView`, 그룹 헤더 접기. 기존 `SharedOutline`을 쓰거나 테이블 뷰를 새로 구성(프로토타입의 `.tbl` 픽셀 기준). 좁은 폭에서 태그/날짜 열 숨김(프로토타입 미디어쿼리 그대로).

### 8.4 Agent (ChatGPT급, 하이브리드 검색+AI) — `AppSectionPage.tsx` (section==='agent')
프로토타입 `#view-agent` + 우하단 "Agent 빈 화면" 토글로 본 **두 상태**. `useAIEnabled`로 AI 가용성 분기.
- **헤더**: 모델 셀렉터(`Claude Opus 4.8 ▾`) · 대화기록 · 새 대화.
- **빈 상태**: 로고 + "무엇을 도와드릴까요?" + **제안 카드 4종**(요약/연결 탐색/검색/초안).
- **대화 상태**: 사용자 질문 → **AI 답변**(소제목·불릿·**인용 위첨자 [n]**) → **출처 패널**(문서·발췌·관련도%) → **메시지 액션바**(복사/좋아요/다시생성/공유).
- **컴포저(스티키)**: textarea + 툴(그래프 컨텍스트·웹·문서 멘션) + 전송. 하단 면책 힌트.
- **재사용**: 대화 UI는 `ChatPanel.jsx` 기반, AI 답변/요약은 `SearchAIOverview`, 검색 결과/소스는 `Search`/`BestMatch`/`ViewList`. "그래프 컨텍스트"는 SynapseNote 차별점이므로 살릴 것.
- **모든 인터랙션 실제 구현**(2.5-B·C): 전송→낙관적 사용자 메시지 추가→로딩→응답 스트리밍 렌더→인용/소스/액션바, 빈상태 제안 클릭→입력/전송, 툴 토글, 모델 셀렉터·대화기록·새 대화. **stub은 LLM 네트워크 호출 한 곳(`// TODO(api) sendAgentMessage()`)만** 허용하고 나머지는 전부 동작해야 한다. 기존 AI/검색 엔드포인트가 있으면 그것에 연결.

### 8.5 Graph — 변경 없음
`SynapseGraphWorkspace presentation='inline'` 유지(현 코드). 점격자/모션은 토큰 복구로 자동 정상화.

---

## 9. Search → Agent 전환 (정확한 변경점)

라벨은 i18n이 아닌 하드코딩 문자열이라 단순하다. 4개 파일:

1. `src/components/app/navigation/appSections.ts`
   - `APP_SECTIONS`의 `'search'` → `'agent'`.
2. `src/components/app/SideBar.tsx`
   - `appNavigationItems`(L23–32): `{ section:'search', label:'Search', icon:SearchIcon }` → `{ section:'agent', label:'Agent', icon:<AgentIcon> }`. (검색 ⌘K 단축 `<Search mode='shortcut'/>`는 별개로 유지.)
   - Agent 아이콘 import 추가(신규 `agent.svg` 또는 Material Symbols `auto_awesome`).
3. `src/components/app/AppRouter.tsx`
   - `:workspaceId/search` 라우트(L22) → `:workspaceId/agent`, `section='agent'`. (필요시 `/search` → `/agent` 리다이렉트 추가.)
4. `src/pages/AppSectionPage.tsx`
   - `if (section === 'search')` 분기(L58) → `'agent'`로, 8.4 사양으로 본문 교체.

전체 검색으로 잔존 `'search'` 섹션 참조가 없는지 확인.

---

## 10. 작업 규칙 & 제약 (CLAUDE.md)

- **커밋 메시지**: `{tag}: {message}` 형식, **message는 반드시 한글**. tag=`feat|fix|refactor|docs|chore`.
- 코드 변경 완료 후 **커밋·푸시 자동 수행**. **원본 AppFlowy upstream으로 푸시 금지** — `origin`(github.com/Nedian0Brien/SynapseNote)만.
- 작업 마무리 시 **배포 여부를 사용자에게 질문**.
- 배포(운영): `appflowy-web` 이미지 빌드 후 `appflowy-cloud` compose의 `appflowy_web` 서비스 교체.
  ```bash
  cd .worktrees/appflowy-web && docker build -f docker/Dockerfile -t synapsenote/appflowy-web:local .
  cd ../appflowy-cloud && docker compose up -d --no-deps --force-recreate appflowy_web
  # 확인: curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18080/   및  https://synapse.lawdigest.kr/
  ```

---

## 11. 수용 기준 / 품질 게이트

- `pnpm run type-check` 통과, `pnpm run build` 성공.
- **🎯 픽셀 정합(최우선):** 각 화면을 프로토타입과 **나란히 비교**해 동일해야 한다. 검증 절차:
  - 동일 뷰포트(1280 / 1024 / 768 / 375)에서 실제 앱과 `prototype.html`을 **Playwright 스크린샷으로 캡처해 오버레이/diff**. 간격·폰트크기·라운드·아이콘크기·색이 어긋나면 불합격.
  - 어긋난 부분은 **이식한 CSS 값과 대조**해 수정(스케일 반올림으로 둘러대지 말 것).
- **🎯 기능 완전성(최우선):** 2.5-(C) 체크리스트의 **모든 항목 동작**. 죽은 버튼·미구현 클릭 0건. (LLM 네트워크 호출 1곳만 stub 허용.)
- **AppFlowy 파란/시안(`#00b5ff`,`#0092d6`,`#f8faff`) 재발 없음** — 액센트가 SynapseNote primary로 보일 것.
- **다크 모드가 중립**(텍스트/외곽선/hover에 금색 없음, 앰버는 액션에만).
- 사이드바 1차 네비가 Home·Library·**Agent**·Graph로 동작, active 표시 정확(상단 헤더 세그먼트 없음).
- 라이트/다크 토글 시 사이드바·테이블·챗까지 일괄 재테마.
- 데스크톱/태블릿/375px에서 넘침·겹침·가로스크롤 없음(프로토타입 미디어쿼리 준수).

---

## 12. 권장 작업 순서 (체크리스트)

- [ ] **T1** `tailwind.config.cjs` 확장(6절) + `synapsenote.css`에 `--sn-favorite` 추가 → `pnpm type-check`.
- [ ] **T2** **프로토타입 컴포넌트 CSS 이식**(2.5-A) → `src/styles/synapse-app.css` 생성, `global.css`에 import, 다크 선택자 `data-theme`→`data-dark-mode` 치환.
- [ ] **T3** (선택) `src/components/design-system/` 프리미티브로 이식 마크업 캡슐화(7절) + `doc/design-system.md`.
- [ ] **T4** Search → Agent 전환(9절).
- [ ] **T5** Sidebar 재구현(8.1) — 네비 그룹 + 즐겨찾기 + 트리 hover 액션(전 기능).
- [ ] **T6** Home 재구현(8.2) — 실데이터.
- [ ] **T7** Library 재구현(8.3) — 4개 뷰·검색·필터·정렬·그룹 전부.
- [ ] **T8** Agent 재구현(8.4) — 빈상태/대화/컴포저 전 기능, LLM 호출만 stub.
- [ ] **T9** 검증(11절: Playwright 픽셀 diff + 기능 체크리스트) → 커밋(한글)·푸시(origin) → 배포 여부 질문.

> 각 T 완료 시 동일 뷰포트에서 프로토타입과 **스크린샷 대조**. 토큰을 바꿨다면 `prototype.html`/`design-system.html`/`synapsenote.css` 3곳을 동기화한다. **픽셀 또는 기능이 프로토타입과 다르면 미완료로 간주.**
