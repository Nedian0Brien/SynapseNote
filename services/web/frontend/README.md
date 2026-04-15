# SynapseNote Frontend

현재 프론트엔드는 `React 19 + Vite` 기반이며, 빌드 결과물은 nginx가 서빙한다.

## 기준 문서

- `/home/ubuntu/project/SynapseNote/docs/design-system-preview.html`
- `/home/ubuntu/project/SynapseNote/docs/main-ui-preview.html`

## 폴더 구조

```txt
src/
├─ features/
│  ├─ auth/
│  ├─ editor/
│  ├─ panels/
│  └─ workspace/
├─ shared/
│  ├─ auth/
│  ├─ hooks/
│  ├─ plugins/
│  ├─ styles/
│  └─ theme/
├─ App.jsx
├─ bootstrapDevTools.js
└─ main.jsx
```

## 명령어

```bash
npm run dev
npm run build
npm run test
npm run lint
```

## 구현 메모

- 인증 API는 `/auth/*`를 사용한다.
- 문서 읽기/저장은 `/api/documents/{path}`를 사용한다.
- 그래프/노드 데이터는 FastAPI 백엔드의 `/api/graph`, `/api/nodes`를 사용한다.
- 스타일 import 순서는 `tokens -> base -> auth -> shell -> editor -> panels -> graph`를 유지한다.

## URL 규칙

문서를 열면 주소창이 자동으로 다음 형식으로 바뀐다.

- `/?view=editor&doc=<문서 경로>`
- `/?view=split&doc=<문서 경로>`
- `/?view=graph` 또는 `/`

예시:

- `/?view=editor&doc=Chats%2Fchat-2026-02-27T12-24-07-323Z.md`

`doc` 값은 URL 인코딩된 문서 경로이며, 사이드바나 그래프에서 문서를 열면 자동으로 갱신된다.
