---
title: 브라우저 로그인 — 패스키와 비밀번호
slug: browser-login-passkey
stage: spec
status: accepted
author: Dennis Park
date: 2026-09-09
---

# 브라우저 로그인 — 패스키와 비밀번호

## 요구사항

### 계정

- R1. 계정은 하나다. 두 번째 계정을 만들려 하면 CLI가 거부한다.
- R2. 계정은 사용자명, 비밀번호 해시, 패스키 목록을 가진다.
- R3. 저장 위치는 `<projectDir>/.ok/local/accounts.json`. 0600, 임시파일+rename.
      `.ok/local/`은 `.ok/.gitignore`의 `local/` 규칙이 덮으므로 동기화에 섞이지 않는다.
- R4. 비밀번호는 scrypt로 저장한다. 파라미터(N=2^15, r=8, p=1, 32바이트 키, 16바이트 솔트)를
      레코드에 함께 적어, 나중에 세게 바꿔도 옛 레코드를 읽을 수 있다.
- R5. 검증은 `timingSafeEqual`로 한다.

### 비밀번호 로그인

- R6. `POST /api/auth/password` — `{username, password}` → 200 + 세션 쿠키.
- R7. 실패는 사용자명 오류와 비밀번호 오류를 구분하지 않는다. 같은 401, 같은 본문.
- R8. 존재하지 않는 사용자명에도 scrypt를 한 번 수행한다. 응답 시간으로 계정 존재 여부가
      드러나지 않게 한다.
- R9. 시도 제한: 같은 계정에 대해 15분 창에서 10회 실패하면 15분 잠근다. 잠긴 동안은
      비밀번호가 맞아도 429를 반환한다. 카운터는 프로세스 메모리에 둔다 — 재시작으로
      풀리지만, 재시작을 유발할 수 있는 상대는 이미 서버를 쥔 상대다.
- R10. 패스키 로그인은 이 제한의 대상이 아니다. 서명 위조는 시도 횟수로 뚫는 대상이 아니다.

### 패스키

- R11. `POST /api/auth/passkey/authenticate/options` — 인증 옵션. 자격증명 불필요.
- R12. `POST /api/auth/passkey/authenticate/verify` — 검증 성공 시 세션 쿠키.
- R13. `POST /api/auth/passkey/register/options` — 등록 옵션. **기존 세션 필요.**
- R14. `POST /api/auth/passkey/register/verify` — 등록 완료. **기존 세션 필요.**
- R15. 챌린지는 서버가 만들고 5분 안에 만료된다. 한 번 쓰면 사라진다.
- R16. `requireUserVerification: true`. Touch ID·Face ID를 실제로 거치게 한다.
- R17. `rpID`는 `OK_PUBLIC_ORIGIN`의 호스트명, `expectedOrigin`은 그 origin 자체다.
- R18. 서명 카운터가 뒤로 가면 거절하고 그 사실을 로그에 남긴다. 복제된 인증기의 신호다.
- R19. 패스키 목록·삭제는 `GET`/`DELETE /api/auth/passkey/:id`. 세션 필요. 마지막 하나를
      지우는 것은 허용한다 — 비밀번호가 남아 있으므로 잠기지 않는다.

### 브라우저

- R20. `SignInGate`에 액세스 토큰 입력 칸이 없다.
- R21. 패스키를 지원하는 브라우저에서는 패스키 버튼이 먼저 보인다. 지원하지 않으면
      비밀번호 폼만 보인다.
- R22. 비밀번호 폼은 언제나 있다. 패스키가 실패하면 그 자리에서 비밀번호로 넘어간다.
- R23. 로그인 성공 시 페이지를 다시 읽는다. 지금 게이트가 하는 것과 같다.
- R24. 설정 화면에서 패스키를 등록·삭제할 수 있다.

### OAuth 동의 화면

- R25. 동의 화면의 로그인 단계가 토큰 칸 대신 사용자명·비밀번호 폼을 쓴다.
- R26. 패스키는 이 화면에서 쓰지 않는다. 서버 렌더 페이지이고 JavaScript 없이 동작해야
      하는데 WebAuthn은 JavaScript를 요구한다. 비밀번호로 로그인한 뒤 승인한다.

### 하위 호환

- R27. 액세스 토큰은 `Authorization: Bearer`로 계속 동작한다. MCP·CLI 경로 불변.
- R28. 로컬 모드는 아무것도 바뀌지 않는다. 계정이 없어도 부팅한다.
- R29. 원격 모드 부팅 검사에 계정 요구를 **추가하지 않는다.** 토큰만 있고 계정이 없는
      기존 배포가 부팅에 실패하면 안 된다. 계정이 없으면 로그인 화면이 그렇게 말한다.

### CLI

- R30. `synapsenote access account create <username>` — 비밀번호를 대화형으로 두 번 받는다.
       인자로 받지 않는다.
- R31. `synapsenote access account passwd` — 비밀번호 변경. 역시 대화형.
- R32. `synapsenote access account show` — 사용자명, 생성 시각, 등록된 패스키 수.
- R33. 비대화형 실행(파이프)에서는 거부한다. 조용히 빈 비밀번호를 만들지 않는다.

## 설계

### 모듈

```
packages/server/src/auth/
  password-hash.ts     scrypt 해시·검증. secret-hash.ts와 분리 — 저엔트로피 비밀은
                       다른 규칙을 따른다
  account-store.ts     계정 + 패스키 레코드. 기존 두 저장소와 같은 파일 규약
  login-throttle.ts    계정별 실패 카운터
packages/server/src/webauthn/
  ceremony.ts          @simplewebauthn 호출 래핑. 챌린지 저장소 포함
```

`account-store.ts`는 `access-store.ts`·`oauth/store.ts`와 같은 모양을 따른다 —
버전 필드, 손상 시 큰 소리로 실패, mtime 기반 재적재.

### 자격증명 계층

지금 `CredentialVerifier`는 `bearer`와 `session` 두 scheme을 안다. 세션은 이미
액세스 토큰 교환으로 만들어진다. 로그인은 **같은 세션을 다른 방법으로 만드는 것**이다.
`access-store`의 `createSession`이 토큰 id에 묶여 있으므로, 계정 로그인으로 만든 세션을
표현할 자리가 필요하다.

선택: `SessionRecord.tokenId`를 `subject: {kind:'token', id} | {kind:'account', id}`로
넓힌다. 기존 레코드는 마이그레이션 없이 읽히도록 `tokenId`가 있으면 토큰 주체로 해석한다.

### WebAuthn 호출 (설치본 v14.0.1의 실제 시그니처)

```ts
generateRegistrationOptions({ rpName, rpID, userName, userID?: Uint8Array,
  excludeCredentials?, authenticatorSelection? })
verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin,
  expectedRPID?, requireUserVerification? })
  → { verified, registrationInfo: { credential: WebAuthnCredential,
      credentialDeviceType, credentialBackedUp } }
generateAuthenticationOptions({ rpID, allowCredentials?, userVerification? })
verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin,
  expectedRPID, credential, requireUserVerification? })
  → { verified, authenticationInfo: { newCounter } }

WebAuthnCredential = { id: Base64URLString, publicKey: Uint8Array,
                       counter: number, transports?: string[] }
```

`publicKey`가 `Uint8Array`이므로 JSON 저장 시 base64url로 인코딩하고 읽을 때 되돌린다.

### 게이트 면제

`/api/auth/password`와 `/api/auth/passkey/authenticate/*`는 자격증명 없이 닿아야 한다.
지금 `/api/auth/session` 하나만 면제되어 있으므로 면제 목록을 경로 집합으로 넓힌다.
`/api/auth/passkey/register/*`는 면제하지 않는다 — 등록은 로그인한 뒤의 일이다.

## 검증 가능한 수용 기준

- A1. 계정이 없는 원격 서버가 정상 부팅한다.
- A2. `access account create` 후 `POST /api/auth/password`가 200과 세션 쿠키를 반환한다.
- A3. 틀린 비밀번호와 없는 사용자명이 같은 401 본문을 반환한다.
- A4. 11번째 실패가 429를 반환하고, 그 뒤 맞는 비밀번호도 429를 받는다.
- A5. 패스키 등록이 세션 없이는 401이다.
- A6. 등록한 패스키로 인증하면 세션 쿠키가 나온다.
- A7. 같은 챌린지를 두 번 쓰면 거절된다.
- A8. 카운터가 감소한 응답이 거절된다.
- A9. 브라우저 번들 어디에도 토큰 입력 UI가 없다.
- A10. 액세스 토큰으로 `/mcp`가 여전히 200이다.
- A11. 로컬 모드에서 `/api/auth/password`가 404다.

## 열린 질문

없음.
