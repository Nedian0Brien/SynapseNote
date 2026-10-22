# Spec: 11b Swift 조회

상위: `intent_morrow-full-port.md`(수락됨), 구조는 `spec_phase11a-swift-data-core.md`. 쓰는 쪽은 여전히 웹이다.

## 범위

네이티브 화면이 읽는 조회를 Swift가 계산한다. 지금은 `EditorController`가 편집기 페이지에 `window.synapse.query`로 묻고 `web/src/queries.ts`가 Morrow 코어로 답한다.

- 옮길 Morrow 코드: `search.ts`(searchWorkspace, findPagesByTitle 등), `links.ts`(linksInDoc, backlinksTo, unlinkedMentions), `tags.ts`, `graph.ts`, `insights.ts`, `flashcards.ts`(카드 수집·기한·`schedule`·기록 읽기), `history.ts`의 순수 함수, `web/src/queries.ts`의 답 모양
- 조회 13종: search, recent, home, backlinks, mentions, outline, tags, tagPages, tasks, templates, counts, review, graph

## 상태: 웹 세션의 거울

Swift가 조회에 답하려면 웹 세션과 같은 상태가 있어야 한다.

- 웹은 상태가 바뀔 때(지금의 `workspace` 보고와 같은 때) 이전에 보낸 상태와 비교해 바뀐 페이지·문서, 사라진 id, 읽지 못한 페이지, 활동 기록(`repository.activity`), 복습 기록(`reviews.log`)을 순번(`revision`)과 함께 보낸다. Morrow 상태는 불변 객체라 참조 비교로 바뀐 것만 찾는다.
- 처음 한 번은 전체를 보낸다. Swift는 순번이 더 큰 것만 적용한다.
- 11c에서는 이 거울 상태가 Swift 세션이 되고 방향이 뒤집힌다.

## 지켜야 할 것

- 11a의 JS 규칙(UTF-16, 키 순서, 안정 정렬, `localeCompare`, 로캘 날짜)을 그대로 쓴다.
- `iu` 정규식(연결 안 된 언급)과 `u` 정규식(본문 태그)은 Unicode 속성과 대소문자 규칙을 맞춘다.
- 시각(`Date.now`, `new Date()`)은 인자로 받는다.

## 받아들이는 기준

- 비교 자료: 가이드 vault, 11a 세션 편집 뒤 상태, Obsidian vault, 한글·악센트가 든 상태에서 13종 조회를 여러 인자로 node에서 돌린 답과 Swift 답이 JSON 값으로 같다.
- 거울 상태: 비교 자료의 상태 변화(11a 세션 단계)를 보고 메시지로 흘려 Swift 거울이 웹 상태와 같아진다.
- 앱: 조회는 Swift가 답한다. DEBUG 빌드에서는 웹에도 물어 답이 다르면 로그(category `core`)에 남긴다. iPad 시뮬레이터 두 vault에서 화면(홈, 검색, 백링크, 태그, 작업, 그래프, 복습)을 쓰며 차이 0.
- PR #13(기준 `feat/swift-core`).

## 범위 밖

쓰기 권한(11c), 데이터베이스 수식(11c), 편집기(11d).
