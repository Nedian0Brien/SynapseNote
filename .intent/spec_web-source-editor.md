---
title: 웹 편집기가 원문을 직접 편집한다
slug: web-source-editor
stage: spec
status: accepted
intent: .intent/intent_web-source-editor.md
date: 2026-09-29
---

# 웹 편집기가 원문을 직접 편집한다 — spec

## 현재 상태 (조사, 2026-09-29)

- 원문 모드 `app/src/editor/SourceEditor.tsx`가 CodeMirror 6 + `yCollab(ytext, awareness)`로 `Y.Text`를 편집하고,
  Markdown 장식(`source-polish`), 위키 링크(`plugins/wiki-link-source.ts`), 에이전트 쓰기 표시
  (`plugins/agent-flash-source.ts`, 서버 `activity-log.ts`의 `Y.Map('agent-effects')`), 원문 클립보드를 가진다.
- 공유 트리에 기대는 비테스트 파일은 app 12·server 16·core 3개다.
  - **편집기 결속:** `TiptapEditor.tsx`, `binding-staleness-guard.ts`, `mount-promise.ts`, `walk-currency-*`는 편집기와
    함께 지운다.
  - **서버 동기화 계층:** `server-observers.ts`(2,478줄), `server-observer-extension.ts`, `map-driven-splice.ts`,
    `incremental-block-parse.ts`, `fragment-derivation.ts`, `bridge-watchdog.ts`는 지운다. `persistence.ts`,
    `bridge-intake.ts`, `agent-sessions.ts`는 원문 부분만 남긴다. paired-write origin 타입은 다른 파일로 옮긴다.
- **다시 설계가 필요한 기능:**
  - 메모: 앵커가 기기 로컬 저장소(`lib/document-memo-store.ts`)에 있고, 기존 앵커는 렌더링된 텍스트 기준
    (`surface: 'wysiwyg'`)이다.
  - 블록 속성 편집: 데이터베이스·Mermaid·임베드·태그 속성 편집이 ProseMirror `setNodeMarkup`을 거친다.
  - 블록 선택 ID: `bridge-id-plugin.ts`.
  - PDF 내보내기: 렌더링된 ProseMirror DOM을 읽는다(`lib/pdf-export.ts`).
  - 임베드 경로: 서버가 임베드 `src`를 트리에 미리 풀어 넣는다(`server-factory.ts` `rerenderDocsReferencingAssetBasename`).
- 메모 외의 주석(`%%…%%`, `==강조==`)과 검색·색인(`live-derived-index.ts`)은 이미 원문 기준이다.

## 요구사항

- [ ] R1 편집 모델 명세: 기호 숨김, 커서·선택, 서식 경계에서의 입력, 삭제, 입력 규칙, 이스케이프, 복사·붙여넣기
      규칙을 한 문서로 둔다. 네이티브 앱도 이 문서를 따른다. 규칙마다 적합성 사례(원문, 커서, 동작 → 원문,
      커서)를 JSON으로 두어 웹과 네이티브가 같은 사례로 검사한다.
- [ ] R2 편집 모델 구현은 core의 순수 함수(원문·블록 범위·인라인 위치 → 숨김 범위, 편집 결과)이고, 적합성 사례를
      모두 통과한다. 원문 해석은 core 파서만 쓴다.
- [ ] R3 새 편집기는 설정으로 켠다(기본은 기존 편집기). 문단·제목·목록·작업 목록·인용·강조·링크·인라인 코드·위키
      링크·태그·각주를 기호 없이 그리고 편집한다.
- [ ] R4 블록을 위젯으로 편집한다: 코드 블록, 표(칸 단위), 수식, Mermaid, 콜아웃·아코디언, 이미지·파일 임베드,
      MDX 컴포넌트, 인라인 데이터베이스, frontmatter(속성). 위젯의 속성 변경은 원문의 해당 바이트만 바꾼다.
- [ ] R5 기존 편집기 기능을 옮긴다:
      - 입력·명령: 슬래시 메뉴, 서식 단축키·도구 막대, 붙여넣기(HTML → Markdown), 찾기.
      - 표시: 메모(원문 앵커, 기존 `wysiwyg` 앵커 변환), 에이전트 쓰기 표시, 협업 커서, 아웃라인 이동.
      - 내보내기: PDF 내보내기(파싱 → HTML 경로).
- [ ] R6 원문 충실도: 편집마다 바뀐 원문 바이트가 R1이 정한 편집 결과와 같다(속성 테스트: 무작위 문서·무작위 편집).
- [ ] R7 동시 편집: 재현 도구의 웹 작성자를 새 편집기의 편집 명령으로 바꾼 세 작성자 1,000 seed와 실제 서버
      soak(38·1,000·5,000줄, 10분)에서 중복·삭제 0.
- [ ] R8 한글 입력: IME 조합 중 기호 숨김이 조합을 끊지 않고, 조합 중 원격 편집이 와도 조합이 유지된다(DOM 테스트).
- [ ] R9 성능: 5,000줄 문서에서 키 입력이 화면에 반영되기까지 p95 16ms 이하(브라우저 안 측정).
- [ ] R10 교체와 제거: 기본값을 새 편집기로 바꾼 뒤 Tiptap 편집기, 공유 트리, 서버 동기화 계층을 지운다. 지운 뒤
      `large-doc-concurrent-load`의 soak를 다시 잰다.

## 설계

- **명세 위치.** `packages/core/src/editing-model/SPEC.md`와 `fixtures/*.json`. 네이티브 앱은 같은 fixture를 읽는
  테스트를 둔다.
- **파서.** 숨김 범위와 위젯 범위는 core 파서의 mdast 위치에서 나온다. 문서 전체를 다시 파싱하지 않도록 서버에서
  만든 증분 블록 파서(`incremental-block-parse.ts`)를 core로 옮겨 편집기가 쓴다(서버에서는 R10에서 지운다).
  Lezer Markdown 파서는 쓰지 않는다. 파서가 둘이 되지 않게 하기 위해서다.
- **CodeMirror 구성.**
  - 숨김: 숨긴 기호는 `Decoration.replace`와 `atomicRanges`로 둬서, 커서가 그 안에 멈추지 않는다.
  - 서식: 서식은 `Decoration.mark`로 그린다.
  - 블록: 블록은 `Decoration.replace({ block: true, widget })`로 그리고, 위젯의 편집은 원문 트랜잭션으로 바꾼다.
  - 입력: 입력은 `EditorView.inputHandler`와 transaction filter에서 R2의 편집 함수로 바꾼다.
  - 동기화: `yCollab`이 원문과 커서를 동기화한다.
- **단계.** 한 단계씩 계획(plan)을 쓰고 진행한다.
  - P0: 편집 모델 명세와 fixture 형식.
  - P1: core 편집 모델(인라인·문단 블록).
  - P2: 새 편집기 뼈대(설정, 인라인 숨김, 입력, 성능 측정).
  - P3: 블록 위젯.
  - P4: 기능 이전.
  - P5: 동시 편집·IME·충실도 검증.
  - P6: 교체와 제거.

## 버린 대안

- **ProseMirror 로컬 투영.** 화면을 유지하지만 편집 경로에 블록 직렬화가 남아 원문 충실도(R6)를 맞출 수 없다.
  사용자가 2번(CodeMirror)을 골랐다.
- **Lezer Markdown으로 장식.** 빠르고 증분이지만 core 파서와 문법 해석이 달라진다(콜아웃, 수식, 위키 임베드, MDX).
- **서버 쪽 연산 변환(Observer A가 글자 삽입을 원문에 직접 반영).** 공유 CRDT 두 개와 양방향 동기화가 남아 서식
  경합이 다른 모양으로 남는다.
