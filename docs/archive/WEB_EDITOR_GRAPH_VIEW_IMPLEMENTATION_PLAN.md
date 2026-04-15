# Web Editor 그래프 뷰 구현 문서

## 목적
- Vault 내 Markdown 문서 간 링크 관계를 시각화해 노트 탐색 속도를 높인다.
- 현재 선택한 문서의 연결 관계(연결 수/이웃 노드)를 빠르게 확인할 수 있게 한다.
- 대규모 Vault에서도 렌더링 부담을 제어하며 반응성을 유지한다.

## 범위
- 백엔드: Markdown 링크 파싱 및 그래프 데이터 API 제공
- 프론트엔드: 좌측 사이드바 그래프 탭, 검색/강조/노드 이동 UI
- 인증: 기존 세션/Basic Auth 정책 재사용
- 비범위: 태그 그래프, 실시간 협업 그래프, 물리 엔진 WebWorker 분리

## 사용자 시나리오
- 사용자는 좌측 `Graph View` 탭을 열어 전체 노트 연결 구조를 본다.
- 검색창에 노트명/경로를 입력해 관련 노드와 1-hop 이웃을 즉시 좁혀 본다.
- 노드를 클릭하면 해당 노트를 에디터에서 열고, 관련 노트 목록에서 추가 이동한다.
- 새로고침 버튼으로 그래프를 재계산한다.

## 백엔드 설계

### API
- `GET /api/graph`
- 인증 필요: `@require_auth`
- 성공 시 JSON 반환, 실패 시 `500` + `graph_build_failed`

### 데이터 생성 규칙
1. `list_entries(VAULT_ROOT, recursive=True)`로 `.md` 파일 목록 수집
2. 파일별 본문을 읽어 두 종류 링크를 파싱
- Wiki Link: `[[...]]`
- Markdown Link: `[text](...)`
3. 링크 정규화
- alias(`|...`) 제거
- heading(`#...`) 제거
- 상대경로/절대경로 정규화
- 확장자 생략 시 `.md` 보정
- 동일 stem 단일 매치 시 stem 기반 보정
4. 유효한 내부 링크만 edge로 기록
5. 노드별 inbound/outbound 계산, 고립 노드 집계

### 응답 스키마
```json
{
  "nodes": [
    {
      "id": "folder/note.md",
      "path": "folder/note.md",
      "name": "note",
      "directory": "folder",
      "inbound": 3,
      "outbound": 5
    }
  ],
  "edges": [
    { "source": "a.md", "target": "b.md" }
  ],
  "stats": {
    "nodes": 120,
    "edges": 430,
    "orphan_nodes": 18
  }
}
```

## 프론트엔드 설계

### 진입 구조
- `NavigationRail`의 `graph` 아이템 선택
- `LeftSidebar`에서 `GraphPanel` 렌더링

### GraphPanel 동작
1. 마운트 시 `/api/graph` 호출
2. 로딩/오류 상태 분리 표시
3. 검색어가 있으면 매칭 노드 + 1-hop 이웃만 표시
4. 검색어가 없고 노드 수가 많은 경우(`MAX_RENDER_NODES=140`) degree 상위 노드 우선 표시
5. 호버/현재 파일 기준으로 이웃 노드 강조
6. 노드 클릭 시 `setCurrentFile(path)`로 에디터 이동

### 레이아웃 알고리즘
- 캔버스 고정 크기: `560 x 340`
- 초기 배치: 노드 id 기반 hash로 각도/반경 시드
- 반복 계산:
- 노드 간 반발력 적용
- edge 스프링력 적용
- 중심 복원력 적용
- 감쇠 및 경계 클램프 적용
- 포커스 노드는 중심으로 끌어당겨 가시성 강화

## 성능/안정성 가이드
- 렌더 노드 상한(`140`) 유지
- 그래프 API 재요청은 사용자 명시 액션(새로고침) 중심
- 파일 읽기 예외 발생 시 해당 노드 outbound를 빈 집합으로 처리해 전체 실패를 방지
- 경로 정규화로 경로 이탈(`..`) 차단

## UX 가이드
- 상단 통계 배지: 노트/링크/고립/현재 표시 수
- 검색 입력은 debounce 없이 즉시 반응(현재 구조 단순성 유지)
- 오류 시 원인 코드를 사용자에게 그대로 노출해 디버깅 가능성 확보
- 모바일에서 사이드바 정책과 충돌하지 않도록 기존 패널 닫힘 플로우 유지

## 테스트 체크리스트
- 단위 수준
- `normalize_graph_target`: 상대경로, anchor/alias 제거, stem 매칭 검증
- `extract_links_from_markdown`: wiki/markdown 링크 혼합 케이스 검증
- 통합 수준
- `/api/graph` 응답 스키마 및 통계값 검증
- 404/권한 없음/파싱 실패 시 오류 코드 검증
- UI 수준
- 그래프 탭 진입/새로고침/검색/노드 클릭 동작 검증
- 대용량 Vault(노드 > 140)에서 상한 적용 확인

## 롤아웃 순서
1. 백엔드 그래프 API 확정 및 수동 검증
2. 프론트 `GraphPanel` 연결 및 스타일 조정
3. 실제 Vault 샘플로 성능 점검
4. 문서/운영 가이드 업데이트
5. 배포 후 `http://localhost:3002`에서 기능 확인

## 관련 파일
- `services/web-editor/app.py`
- `services/web-editor/frontend/src/components/GraphPanel.jsx`
- `services/web-editor/frontend/src/components/LeftSidebar.jsx`
- `services/web-editor/frontend/src/components/NavigationRail.jsx`
- `services/web-editor/deploy.sh`
