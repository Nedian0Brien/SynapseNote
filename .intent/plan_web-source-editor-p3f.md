---
title: P3f 문서 문맥을 잇는 MDX 위젯
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-29
---

# P3f 문서 문맥을 잇는 MDX 위젯

일반 MDX·인라인 데이터베이스·PDF는 React 문서 문맥을 사용한다. CodeMirror 위젯 자리에 `SourceEditor` 트리에서 포털을 렌더링한다.

## 구현

1. CodeMirror 뷰별 포털 등록소를 만들고, 캐시된 뷰가 주차·재연결돼도 `SourceEditor`의 React 문맥에서 위젯을 그린다.
2. core 파서가 만든 MDX 노드의 속성과 원문 범위를 모델로 내보낸다. 인라인 데이터베이스 `DatabaseView`를 첫 문맥 보존 위젯으로 연결한다.
3. 기존 컴포넌트 맵과 렌더링 전 속성 안전 검사를 사용한다. 속성 변경은 해당 원문 범위만 바꾼다.
4. 실제 데이터베이스가 있는 문서에서 그리드와 편집·새로고침을 확인한다.

## 검증

- core 위젯 fixture, app DOM 포털·캐시 수명 테스트, core·app 타입 검사와 변경 파일 Biome 검사를 실행한다.
- 기존 독립 루트 위젯과 문서 모드 전환도 영향을 받지 않는지 확인한다.
