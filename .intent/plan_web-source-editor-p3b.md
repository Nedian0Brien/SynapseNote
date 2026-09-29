---
title: P3b 수식과 Mermaid 블록 위젯
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-29
---

# P3b 수식과 Mermaid 블록 위젯

P3a의 원문 범위별 위젯 편집을 수식과 Mermaid에 확장한다. 화면은 앱의 기존 KaTeX·Mermaid 렌더러를 사용한다.

## 구현

1. core 파서가 만든 `DollarMath`·`MathFence`·`MermaidFence` 노드의 원문에서 편집할 본문 범위를 구한다. `$$`와 코드 울타리 모두 구분한다.
2. `live` 모드에 수식·Mermaid 블록 장식을 추가한다. 미리보기와 본문 입력을 함께 제공하고, 입력은 본문 범위에만 쓴다.
3. 원격 변경 중에도 활성 입력을 유지한다. 원문 충실도 fixture와 DOM 테스트로 범위·렌더링·편집을 확인한다.
4. 실제 앱에서 두 블록의 표시와 편집·새로고침을 확인한다.

## 검증

- core의 새 위젯 범위 테스트와 app의 `live-extension.dom.test.tsx`를 실행한다.
- core와 app 타입 검사, 변경 파일의 Biome 검사를 실행한다.

## 결과 (2026-09-29)

- `$$`, `\\[`, `[`, ` ```math `, ` ```mermaid ` 블록의 본문 범위를 core 파서 기준으로 구한다.
- 앱의 기존 KaTeX·Mermaid 컴포넌트를 위젯 미리보기에 재사용했다. 원문 구분자는 숨기고 본문만 입력할 수 있다.
- core 위젯·fixture 테스트 20개, app live DOM 테스트 115개가 통과했다. core·app 타입 검사도 통과했다.
- 브라우저에서 두 미리보기가 렌더링됐고 본문 수정 후 새로고침해 원문 유지와 미리보기 갱신을 확인했다.
- P3의 다음 대상은 콜아웃·아코디언, 이미지·파일 임베드, MDX, 인라인 데이터베이스, frontmatter, 들여쓴 코드다.
