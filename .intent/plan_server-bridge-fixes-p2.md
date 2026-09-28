---
title: 서버 문서 동기화 결함 수정 — P2 이스케이프 누적
slug: server-bridge-fixes
stage: plan
status: accepted
intent: .intent/intent_server-bridge-fixes.md
spec: .intent/spec_server-bridge-fixes.md
date: 2026-09-28
---

# P2 이스케이프 누적 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/core/src/markdown/escapable-chars.ts` (새) | CommonMark가 역슬래시로 이스케이프할 수 있는 ASCII 문장부호 집합 한 곳 |
| `packages/core/src/markdown/position-slice.ts` | 파서가 위 집합을 쓴다(내용 변화 없음) |
| `packages/core/src/markdown/index.ts` | `escapeMark` 직렬화가 위 집합의 글자에만 `\`를 붙인다 |
| `packages/core/src/markdown/escape-mark-spread.test.ts` (새) | 표시가 번진 삽입의 고정 기대 문자열, 재파싱 시 보이는 텍스트에 역슬래시 없음, 반복 삽입의 증가량 상한 |
| `.changeset/stop-escape-accumulation.md` (새) | 릴리스 노트 |

## 작업 순서

1. 공용 집합 모듈을 만들고 파서가 쓰게 한다. 확인: 기존 core markdown 테스트 통과.
2. 직렬화 제한 + 테스트. 확인: 새 테스트가 수정 전 3개 실패, 수정 후 3개 통과.
3. dev 서버(:5181)를 다시 띄워 합성 fragment 작성자 삽입 전용 soak 2분. 확인: P0의 21/99 대비 유실 수.

## 가장 위험한 단계

2번. 직렬화 결과가 바뀌면 기존 문서를 저장할 때 바이트가 달라질 수 있다. 바뀌는 경우는 `escapeMark`가
문장부호가 아닌 글자에 붙은 때뿐이고, 파서는 그런 표시를 만들지 않으므로 번진 표시가 있는 문서만
달라진다. 그런 문서에서는 지금까지 편집마다 역슬래시가 늘어났으므로 바뀌는 쪽이 복구다.

## 검증

```
bun run test:file -- packages/core/src/markdown/escape-mark-spread.test.ts
(cd packages/core && bun test --timeout 30000 src/markdown src/extensions)
bun native/editor-spike/scripts/soak.ts --port 5181 --minutes 2 --insert-only --no-app --no-patch --content-dir <dir>
```

## 결과 (2026-09-28)

- 1·2번: `escape-mark-spread.test.ts` 새 테스트가 수정 전 실패, 수정 후 통과. core markdown 테스트 통과.
- 3번은 따로 돌리지 않고 P3 1번 조합(38줄, 합성 fragment 작성자 단독, 삽입 전용 3분)으로 쟀다: 마커 150개 중
  유실 0(P0 2분 21/99), 크기 617 → 4,066 UTF-16(삽입 3,444, 상한 7,505).
