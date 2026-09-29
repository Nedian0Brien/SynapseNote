---
title: P3f 문서 문맥을 잇는 MDX 위젯
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
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

## 결과

- CodeMirror 뷰별 포털 등록소를 `SourceEditor`의 React 트리에 연결했다. 캐시된 뷰를 다른 문서로 이동했다가 다시 붙여도 문서 문맥을 가진 MDX 위젯이 복구된다.
- 일반 MDX의 리터럴 속성과 본문을 원문 범위별로 편집한다. 실행 가능한 MDX 표현식은 평가하지 않는다. `DatabaseView`와 `Math`, 알 수 없는 중첩 컴포넌트를 확인했다.
- 실제 데이터베이스 그리드에서 레코드를 추가하고 서버 저장 후 새로고침해 유지되는 것을 확인했다. 문서 제목·본문·수식 속성도 원문에서 수정하고 새로고침해 확인했다.
- core 위젯·fixture 테스트, app DOM 위젯·포털 테스트, core·app 타입 검사, 변경 파일 Biome 검사를 실행했다.
- PDF 컴포넌트의 외형은 `live`와 기존 `wysiwyg` 양쪽에서 표시됐지만 두 모드 모두 PDF 내용은 `Loading PDF`에서 진행되지 않았다. 내용 렌더링은 추후 다시 확인해야 한다.
- P3에는 Tabs/Tab과 Mirror의 복합 자식, 복합 속성 편집, 들여쓴 코드, 레거시 HTML details, 참조 이미지가 남았다.
