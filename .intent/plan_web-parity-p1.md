---
title: 웹 동등성 P1 — 게이트가 이름대로 동작한다
slug: web-parity-p1
stage: plan
status: accepted
intent: .intent/intent_web-parity.md
spec: .intent/spec_web-parity.md
date: 2026-09-09
---

# P1 — 게이트가 이름대로 동작한다 — 구현 계획

R1~R7을 만족시킨다. 이 단계는 **엔드포인트를 하나도 열지 않는다.** 게이트의
의미만 바꾸고, 28개 호출 지점 전부를 "지금과 같은 규칙"으로 명시적으로 표시한다.
P2~P4가 그 표시를 하나씩 바꾼다.

이렇게 쪼개는 이유는 되돌리기다. 게이트 재설계와 엔드포인트 개방이 한 커밋에
있으면, 개방이 잘못됐을 때 재설계까지 같이 되돌아간다.

## 바뀌는 파일

### 새로 만드는 것

| 파일 | 무엇을 |
|---|---|
| `packages/server/src/local-op-security.remote.test.ts` | 원격 정책에서의 게이트 판정 |

### 고치는 것

| 파일 | 무엇을 |
|---|---|
| `packages/core/src/schemas/api/_envelope.ts` | `urn:ok:error:desktop-only` 추가 |
| `packages/server/src/access-control.ts` | `AccessPrincipal.kind`에 `'account-session'` |
| `packages/server/src/auth/access-store.ts` | 계정 세션을 `'account-session'`으로 반환 |
| `packages/server/src/auth/access-store.test.ts` | 위 구분 케이스 |
| `packages/server/src/local-op-security.ts` | `checkLocalOpSecurity`를 정책 인지형으로 |
| `packages/server/src/local-op-security.test.ts` | 기존 케이스를 새 시그니처로 |
| `packages/server/src/api-extension.ts` | 28개 호출 지점 + 주체 전달 |
| `packages/server/src/server-factory.ts` | 필요 시 정책 전달 |

## 설계 결정 두 가지

**1. 새 인자에 기본값을 두지 않는다.** `checkLocalOpSecurity`가 받을 새 인자
(`policy`, `principal`, 그리고 원격 허용 여부)는 전부 필수다. 기본값을 주면
28곳 중 빠뜨린 곳이 조용히 동작하고, 그게 이 작업의 가장 큰 위험이다.
컴파일러가 대신 세게 한다.

**2. 원격 허용 여부는 호출 지점이 선언한다.** 게이트에 경로 목록을 두지 않는다.
목록은 새 핸들러가 생겼을 때 갱신을 잊는다. 각 호출 지점이
`{ remote: 'account-session' }` 또는 `{ remote: 'never' }`를 적고, 그 값이
없으면 타입 에러가 난다.

P1에서는 **28곳 전부 `remote: 'never'`** 로 둔다. 지금 동작과 같다 — 다만 지금은
Origin을 빼면 뚫리고, 바뀐 뒤에는 안 뚫린다.

## 작업 순서

각 단계 끝에 해당 테스트가 초록이어야 다음으로 간다.

1. **`account-session` 주체 구분** — `AccessPrincipal.kind` 확장,
   `access-store.verify`가 계정 세션을 구분해 반환.
   확인: `bun test packages/server/src/auth/access-store.test.ts packages/server/src/access-control.test.ts`

2. **`desktop-only` 문제 유형** — 코어 열거형에 추가, 스냅샷 재생성.
   확인: `bun run schema:dump && bash scripts/check-schema-snapshot-clean.sh`

3. **게이트 재작성** — `checkLocalOpSecurity(req, res, { handler, policy, principal, remote })`.
   로컬 분기는 그대로, 원격 분기는 `kind === 'account-session'` 요구.
   확인: `bun test packages/server/src/local-op-security.test.ts packages/server/src/local-op-security.remote.test.ts`

4. **주체를 핸들러까지 전달** — `onRequest`가 `authorizeRequest` 결과를 버리지
   않고 요청별로 들고 있게 한다.
   확인: `bun run --filter @nedian0brien/synapsenote-server typecheck`

5. **28개 호출 지점** — 전부 `remote: 'never'`. 타입 에러가 0이 되면 빠뜨린 곳이
   없다는 뜻이다.
   확인: `bun run --filter @nedian0brien/synapsenote-server typecheck` + 호출
   지점 수를 세는 테스트

6. **회귀** — 서버 전체 + 데스크톱 경로.
   확인: `test:unit`, `test:contract`

## 가장 위험한 단계

**4단계, 주체 전달.** `onRequest`는 이 서버의 모든 `/api/*` 요청이 지나는 곳이다.
여기서 실수하면 로그인 자체가 깨진다.

방어: `authorizeRequest`의 반환값을 버리지 않고 보관만 한다. 판정 로직은 건드리지
않는다. 보관 방식은 요청 객체에 심볼 키로 붙이는 것 — `AsyncLocalStorage`는 이
코드베이스가 쓰지 않는 도구이고, 핸들러 시그니처를 전부 바꾸는 것은 28곳보다 훨씬
넓은 변경이다.

되돌리기: 이 단계는 단일 커밋으로 남긴다.

**두 번째 위험: 로컬 분기를 건드리는 것.** 데스크톱 앱은 이 서버를 로컬 정책으로
띄운다. 로컬 분기가 바뀌면 원격보다 먼저 데스크톱이 깨진다. 기존
`local-op-security.test.ts`를 한 줄도 지우지 않고 새 시그니처로만 옮긴다 —
케이스가 줄면 그만큼 보호가 준 것이다.

## 검증

### 자동

```
bun test packages/server/src/local-op-security.test.ts \
         packages/server/src/local-op-security.remote.test.ts \
         packages/server/src/auth/ packages/server/src/access-control.test.ts
bun run --filter @nedian0brien/synapsenote-server test:unit
bun run --filter @nedian0brien/synapsenote-server test:contract
bash scripts/check-schema-snapshot-clean.sh
```

### 원격 모드 실서버

P1의 관찰 가능한 변화는 하나다 — **Origin을 빼서 뚫던 구멍이 막힌다.**

```
# 전: 202 (실제로 git이 돌았다)   후: 403 desktop-only
curl -X POST -H "Authorization: Bearer $TOKEN" .../api/sync/trigger

# 전: 200                        후: 403 desktop-only
curl -X POST -H "Authorization: Bearer $TOKEN" .../api/local-op/auth/status

# 브라우저와 같은 헤더: 전 403 loopback-required → 후 403 desktop-only
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Origin: https://<origin>" .../api/sync/trigger
```

### 데스크톱

로컬 모드가 안 깨졌는지 확인한다.

```
bun run install:desktop:local
```

앱을 열어 설정 → 계정에서 GitHub 상태가 뜨고, 사이드바 동기화가 동작하는지 본다.
이 둘이 `local-op` 게이트를 지나는 대표 경로다.

## 다음 단계

P1이 끝나면 P2로 간다. 남은 단계는 intent의 표에 있다. **P1만 하고 멈추면
사용자가 겪던 문제는 하나도 해결되지 않는다** — 오히려 뚫려 있던 우회로가
막힐 뿐이다.
