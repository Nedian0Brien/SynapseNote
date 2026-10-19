# Plan: 11b Swift 조회

spec: `spec_phase11b-swift-queries.md`. 브랜치 `feat/swift-queries`(기준 `feat/swift-core`), 워크트리 `.worktree/swift-queries`.

1. **비교 자료** (`web/scripts/core-fixtures.ts` → `queries.json`): 상태 4개 × 조회 13종 × 여러 인자의 답, 고정 시각과 복습 기록·활동 기록 포함. 상태 변화 메시지(`stateDelta`)도 11a 세션 단계마다 만든다.
2. **Swift 조회** (`App/Sources/Core/Queries/`): search, links, tags, graph, insights, flashcards, queries.ts의 답 모양을 `JSValue`로.
3. **거울 상태** (`Core/Session/StateMirror.swift`): 전체·변화 메시지 적용, 순번 확인.
4. **웹** (`web/src/main.tsx`, `bridge.ts`): `report()`에서 변화 메시지 `state`를 보냄. 웹 테스트.
5. **앱** (`EditorController`, `EditorBridge`): 메시지 받아 거울 갱신, `answer()`가 Swift로 계산, DEBUG에서 웹 답과 비교 로그.
6. **테스트**: 조회 비교, 거울 적용, 브리지 메시지 해석.
7. **검증**: iPad 두 vault에서 화면을 쓰며 차이 0, 검증 문서, 로드맵, 푸시, PR #13.
