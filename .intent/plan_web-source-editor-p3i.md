---
title: P3i live Tabs와 Tab
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P3i live Tabs와 Tab

기존 Tabs 렌더러는 Tiptap의 자식 NodeView DOM을 읽는다. `live`에서는 core 파서가 찾은 직접 자식 Tab의 범위를 사용해 탭 목록과 활성 패널을 렌더링한다. 탭 라벨과 본문 편집은 해당 자식의 원문 범위만 바꾼다. 캐시된 CodeMirror 뷰를 다시 붙여도 활성 탭과 문서 문맥을 유지한다.

## 검증

- 직접 자식 Tab, 중첩 Tabs, 라벨·본문 원문 변경 fixture를 확인한다.
- 앱 DOM에서 탭 전환, 라벨·본문 편집, 포털 수명을 확인한다.
- core·app 타입 검사와 변경 파일 Biome 검사를 실행한다.

## 결과

- core가 `<Tabs>`의 직접 자식 범위만 모델로 만들고, 라벨·본문·추가·삭제를 해당 원문 위치에 적용한다. 중첩 탭은 부모 패널 본문에서 별도로 인식한다.
- `live` 위젯은 기존 탭 시각 스타일을 사용하며 키보드 좌우·Home·End로 전환한다. 활성 패널의 본문은 중첩 live 편집기로 편집한다.
- 포털 호스트를 다시 붙인 뒤에도 선택한 탭을 유지한다. core 위젯·fixture 56개, 앱 Tabs DOM 3개와 live DOM 124개, core·app 타입 검사가 통과했다.
- 참조 이미지, Mirror의 소스 열기·속성 제어, 복합 MDX 속성 편집, PDF 내용 렌더링 확인은 다음 P3 작업에 남는다.
