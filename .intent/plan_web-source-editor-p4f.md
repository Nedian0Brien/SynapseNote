---
title: P4f live 코드 미리보기·HTML 예제
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4f live 코드 미리보기·HTML 예제

기존 HTML preview 코드 블록의 공통 헤더·테마·CSP 보고·자동 높이·편집 창·확대 창·크기 조절을 live 위젯에 연결한다. core는 코드 울타리 메타 범위를 제공하고 설정은 해당 범위만 고친다. 슬래시 HTML·기존 예제 항목은 동일한 원문 예제를 삽입한다.

## 검증

- core 메타·본문 범위 변경과 원문 보존 fixture.
- live DOM 미리보기 표시·토글·설정·원격 변경 시 상태 유지.
- 브라우저 실제 iframe 렌더링·편집·예제 삽입·저장 및 관련 타입 검사.

## 결과

- live HTML 코드 위젯은 공통 iframe 헤더·테마 메시지·CSP 차단 보고·자동 높이·소스 편집 창·확대 창·ResizeHandles를 사용한다. 미리보기 설정은 core code-meta 명령으로 해당 범위만 수정한다.
- 일반 코드 블록은 미리보기 React portal을 등록하지 않는다. 미리보기의 iframe은 원격 앞쪽 편집에도 유지된다.
- 빈 HTML 본문과 기존 예제 검색 별칭을 공통 모듈로 분리했다. live 메뉴의 빈 HTML·네 예제는 기존 본문을 그대로 삽입한다.
- core 위젯 63개·fixture 8개, live DOM 129개·슬래시 9개·미리보기 2개, 기존 예제 메뉴 6개 통과. core·app 타입 검사와 변경 파일 검사 통과.
- 기존 예제 메뉴 테스트는 Lingui JSX를 변환하는 app test:dom runner로 실행했다. test:file의 일반 unit 경로는 매크로 컴파일 환경을 제공하지 않는다.
- 브라우저에서 HTML 삽입·실제 렌더링·편집 창 저장·제목·확대·새로고침 저장을 확인했다. 예제 슬라이더의 실제 스크립트 실행으로 2500→2600 갱신을 확인했다. 크기 손잡이의 CSS를 live에도 적용하고 드래그 뒤 w=574px h=120px 저장을 확인했다.
- P3 일반 HTML, 슬래시 메뉴 미리보기, 코드 블록의 기타 도구·서식 도구 막대·메모·앵커·협업 표시·PDF 내보내기 및 P5~P6는 남아 있다.
