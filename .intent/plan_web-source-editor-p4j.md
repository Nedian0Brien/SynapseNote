---
title: P4j 기존 메모 앵커를 원문으로 변환
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4j 기존 메모 앵커를 원문으로 변환

core 파서의 원문 위치로 기존 화면의 문단·인라인 글을 원문에 대응시킨다. 저장된 quote의 exact/prefix/suffix로 찾고 변환한 앵커를 기기 로컬 저장소에 저장한다. 기존 앵커는 legacyAnchor로 보존해 기존 편집기도 사용한다. 찾지 못한 메모는 기존 데이터를 보존한다. 변환은 초기 로딩·메모 저장소 갱신에서만 수행하며 입력마다 전체 문서를 파싱하지 않는다.

## 검증

- 서식·링크·이스케이프·문단·인용·코드·반복 문구의 위치와 문맥 대응.
- 원래 앵커 보존, 재실행 멱등성, unmatched 보존.
- 로컬 저장·원문 표시·이동·새로고침과 기존 편집기의 보존 앵커 해석.
