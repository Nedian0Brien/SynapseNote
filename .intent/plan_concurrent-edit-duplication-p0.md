---
title: 세 작성자 동시 편집의 중복·삭제 — P0 결정적 재현
slug: concurrent-edit-duplication
stage: plan
status: accepted
intent: .intent/intent_concurrent-edit-duplication.md
spec: .intent/spec_concurrent-edit-duplication.md
date: 2026-09-29
---

# P0 결정적 재현 — 구현 계획

## 만들 것

| 파일 | 무엇을 |
|---|---|
| `packages/server/src/concurrent-writers.test-helper.ts` (새) | 시뮬레이터. 서버 `Y.Doc`(Hocuspocus `Document`)에 `setupServerObservers`와 서로게이트 정규화를 붙이고, 앱·웹 클라이언트 `Y.Doc`을 둔다. 방향별 FIFO 큐로 update를 전달한다(서버가 받은 update는 연결별 origin, 클라이언트로는 보낸 연결을 뺀 전부). 작성자: 앱은 soak의 토큰(`*`, `\n\n`, `- `, `# ` 등)과 10번에 한 번 마커를 `Y.Text` 임의 위치에, 웹은 문단 임의 위치에 ProseMirror `insertText` → `updateYFragment`로 ` 편집` 또는 마커를, 에이전트는 서버 `Y.Text`의 12글자를 찾아 뒤에 마커를 붙이는 patch를 `AGENT_WRITE_ORIGIN`으로 쓴다. 모든 무작위는 seed 하나에서 나온다. 판정기는 spec R2(중복·쪼개짐·삭제)와 수렴(세 문서의 `Y.Text` 같음)을 본다 |
| `packages/server/scripts/concurrent-writers-fuzz.ts` (새) | seed 범위를 돌려 seed별 중복·삭제 수를 출력하고, 실패 seed의 첫 사례(마커, 주변 텍스트)를 보여 준다 |

## 작업 순서

1. 시뮬레이터 + 판정기. 확인: 작성자를 하나씩만 켠 실행(앱만, 웹만, 에이전트만)은 중복·삭제 0.
2. 세 작성자 실행 200 seed. 확인: 중복이 재현되면 실패 seed를 기록한다. 재현되지 않으면 전달 방식(큐 묶음 크기,
   지연)을 soak에 가깝게 바꿔 다시 본다.
3. 실패 seed를 작성자 조합별로 나눠(앱+웹, 앱+에이전트, 웹+에이전트) 어느 조합에서 나는지 본다. 그 결과로 H1~H3
   중 무엇이 맞는지 판정하고 아래 결과에 적는다.

## 가장 위험한 단계

2번. 시뮬레이터가 실제 서버와 다르게 동작하면(예: Hocuspocus 전달 순서, 저장 경로의 재조정) 재현이 안 되거나
엉뚱한 원인을 찾는다. 대응: 재현되지 않으면 persistence의 저장 재조정을 붙여 본다. 찾은 원인은 실제 서버 soak에서
다시 확인한다.

## 검증

```
bun packages/server/scripts/concurrent-writers-fuzz.ts --seeds 0-199 --writers app,web,agent
bun packages/server/scripts/concurrent-writers-fuzz.ts --seeds 0-49 --writers app
```

## 결과 (2026-09-29)

- 작성자 하나만 켠 실행(앱·웹·에이전트 각 20 seed): 중복·삭제 0.
- 세 작성자 200 seed(각 400단계, 38줄 문서 3개 절): 68 seed에서 중복 90건, 삭제 1건. 모두 수렴.
- 작성자 쌍(각 100 seed): 앱+에이전트 0, 앱+웹 8 seed(중복 8), 웹+에이전트 8 seed(중복 19). 중복은 fragment 작성자(웹)와
  `Y.Text` 작성자(앱·에이전트)가 함께일 때만 난다.
- 추적(서버 `Y.Text`에서 삽입한 글자를 걷어 낸 뒤 원문 링크 URL이 한 번씩, 제 문단 줄에 있는지): 깨지는 단계는 매번
  웹 클라이언트의 update가 서버에 도착한 때다. 서버 fragment에서 링크 표시(link mark)의 범위가 어긋난다. 링크가 다음
  문장까지 늘어나거나, 두 조각으로 갈리거나, 다른 글자에 붙는다. Observer A는 그 문단을 직렬화해 `Y.Text`에 쓰고, 두
  조각이 된 링크는 같은 URL을 두 번 쓴다. URL 안에 들어간 마커가 그래서 두 번 나온다.
- 최소 재현: 서버가 링크 `href`만 바뀐 텍스트를 파싱해 fragment를 갱신하는 동안(앱·에이전트가 URL 안에 글자를 넣은
  경우의 Observer B, 또는 paired write), 웹이 같은 문단의 링크 바로 앞에 글자 하나를 넣는다. 병합 결과 웹이 넣은
  글자에 새 `href` 링크가 붙고 원래 링크 텍스트는 옛 `href`로 남는다(49개 위치 중 1곳). y-tiptap `updateYText`는
  문단 전체에 서식을 `retain`+속성으로 다시 적용하고, Yjs 서식은 경계 위치의 서식 항목으로 저장된다. 두 쪽이 같은
  경계에 동시에 쓰면 병합 순서에 따라 서식이 다른 글자에 붙는다.
- 판정: H2(뒤처진 기준본 병합)와 H1(paired write 재구성)은 이번 재현의 원인이 아니다. 원인은 H3의 변형이다. 서버가
  `Y.Text`에서 파생한 서식 변경과 클라이언트의 fragment 편집이 같은 서식 경계에서 겹치면, Yjs 병합이 서식을 잘못
  배정하고, Observer A가 그 fragment를 원문으로 직렬화한다.
