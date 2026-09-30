---
title: P4c live 링크 편집
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4c live 링크 편집

선택한 텍스트 또는 Markdown 링크 안에서 Cmd+K를 누르면 기존 문서·앵커·외부 링크 대화상자를 연다. core가 링크 추가·대상 수정·표시 문구 수정·해제를 원문 범위별로 적용한다. 변경하지 않은 서식과 제목은 보존한다. 열린 대화상자의 원문 범위는 원격 트랜잭션에 따라 이동한다.

## 검증

- core fixture의 링크 추가·수정·해제·참조 대상 편집과 주변 원문 보존.
- live DOM Cmd+K·저장·취소와 실제 브라우저 저장·새로고침.
- core·app 타입 검사 및 변경 파일 Biome 검사.

## 결과

- Cmd+K에서 기존 문서·앵커·외부 링크 대화상자를 사용한다. 선택한 텍스트에 링크를 추가하고 링크 대상·문구를 수정하거나 해제한다.
- URL만 고칠 때 기존 표시 문구의 서식·제목을 보존한다. 참조 링크는 정의의 대상 범위를 수정한다.
- 열린 대화상자의 범위를 원격 트랜잭션에 따라 이동시키고, 원격 삭제된 링크를 저장으로 재생성하지 않는다.
- core 편집·fixture 테스트 127개, live DOM 129개, 링크 대화상자 DOM 3개, 기존 링크 패널 DOM 5개 통과. core·app 타입 검사 통과.
- 브라우저에서 Cmd+K 대상 수정·새 링크 추가·해제를 확인했고 런타임 오류가 없었다.
- 기존 숨겨진 Tiptap이 새로고침할 때 `[**label**](url)`을 `**[label](url)**`로 정규화하는 현상을 확인했다. P6에서 기존 동기화 계층 제거 후 원문 충실도를 다시 검증한다.
