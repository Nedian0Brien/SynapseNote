---
title: 웹 동등성 P2 — 동기화
slug: web-parity-p2
stage: plan
status: accepted
intent: .intent/intent_web-parity.md
spec: .intent/spec_web-parity.md
date: 2026-09-09
---

# P2 — 동기화 — 구현 계획

R8~R11을 만족시킨다. 사용자가 실제로 막혀 있던 지점이다 — 원격 웹에서
동기화 충돌이 있는지 없는지 알 수 없다.

P1이 게이트를 준비했으므로 서버 변경은 작다. 호출 지점 5곳의 `remote`를
`'never'`에서 `'account-session'`으로 바꾸는 것이 전부다.

## 바뀌는 파일

### 새로 만드는 것

| 파일 | 무엇을 |
|---|---|
| `packages/server/src/api-sync-remote.test.ts` | 5개 경로의 자격증명별 판정 |

### 고치는 것

| 파일 | 무엇을 |
|---|---|
| `packages/server/src/api-extension.ts` | `sync-*` 5곳의 `remote` 값 |
| `packages/app/src/hooks/use-conflicts.ts` | 필요 시 없음 — 서버가 200을 주면 그대로 동작 |

## 왜 앱 변경이 거의 없나

`use-conflicts.ts`는 `/api/sync/conflicts`가 200을 주면 목록을 그리고, 아니면
오류를 그린다. 지금 403이라 오류가 뜨는 것이므로, 서버가 200을 주기 시작하면
배너는 저절로 사라진다. 배지도 같다.

충돌 **해결** 버튼은 P2에서 함께 열린다(`sync-resolve-conflict`). 그래서 P1
계획에 적었던 "해결 버튼을 비활성화한다"는 처리는 필요 없어졌다 — 눌리면
동작한다.

## 작업 순서

1. **5개 호출 지점** — `sync-status`, `sync-conflicts`, `sync-trigger`,
   `sync-resolve-conflict`, `sync-conflict-content`를 `remote: 'account-session'`.
   확인: `bun test packages/server/src/api-sync-remote.test.ts`

2. **회귀** — 나머지 23곳이 `'never'`로 남았는지.
   확인: 호출 지점 수를 세는 어서션 + `test:unit`

3. **실서버 확인** — 계정 세션 200, 베어러 403, Origin 없는 토큰 403.

## 위험

**`/api/sync/trigger`는 실제로 git push를 돌린다.** 원격에 여는 순간 계정 세션
요구가 유일한 방어선이 된다. P1이 그 방어선을 세웠고, 이 단계의 테스트가
베어러 토큰과 토큰 교환 세션 둘 다 막히는지 확인한다.

**동기화가 GitHub 자격증명을 쓴다.** 원격 사용자가 그 자격증명으로 push하게
된다. 그것이 이 서버의 목적이므로 의도된 동작이지만, 계정 하나가 곧 GitHub
접근이라는 뜻이다. 비밀번호가 약하면 GitHub 저장소가 위험하다 — 배포 문서에
적는다.

## 검증

```
bun test packages/server/src/api-sync-remote.test.ts \
         packages/server/src/local-op-security.remote.test.ts
bun run --filter @nedian0brien/synapsenote-server test:unit
```

원격 모드 실서버에서:

```
# 계정 세션 → 200
curl -H "Cookie: synapsenote_session=<account>" .../api/sync/conflicts

# 베어러 토큰 → 403 desktop-only
curl -H "Authorization: Bearer <token>" .../api/sync/conflicts

# 토큰에서 교환한 세션 → 403 desktop-only
curl -H "Cookie: synapsenote_session=<from-token>" .../api/sync/conflicts
```

배포 후 `https://synapse.lawdigest.kr`에서 충돌 배너가 사라지는 것까지가
이 단계의 완료다.
