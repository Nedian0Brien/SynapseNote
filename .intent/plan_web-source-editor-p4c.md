---
title: P4c live 링크 편집
slug: web-source-editor
stage: plan
status: active
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
