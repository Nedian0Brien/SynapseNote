# AppFlowy 위에 SynapseNote 그래프부터 올리기

**작성일**: 2026-06-21  
**AppFlowy 기준 커밋**: `4af02cdc87468be10ab15dbb4afd27fbf53ce89b`  
**AppFlowy 위치**: `.worktrees/appflowy-upstream`  
**SynapseNote 보존 브랜치**: `archive/synapsenote-before-appflowy`

## 현재 기준

AppFlowy 원본을 먼저 띄우고, 그 위에 SynapseNote의 그래프 기능만 얇게 추가한다. 기존 SynapseNote 전체를 AppFlowy로 옮기거나, 백엔드와 배포 체계를 한 번에 합치지 않는다.

이번 기준에서 확인한 사실은 다음과 같다.

- AppFlowy는 Flutter 3.27.4와 Rust 1.85.1 기반으로 빌드된다.
- 이 호스트는 Ubuntu 22.04 aarch64라서 `development-linux-aarch64` 프로필로 빌드했다.
- 빌드 산출물은 `frontend/appflowy_flutter/build/linux/arm64/debug/bundle/AppFlowy`에 생성됐다.
- `xvfb` 실행에서 앱 초기화는 진행됐지만, 헤드리스 환경에 `org.freedesktop.NetworkManager` DBus 서비스가 없어 connectivity 예외가 로그에 남았다. 실제 데스크톱 환경 실행 또는 개발용 보정이 필요하다.

## SynapseNote 그래프에서 가져올 것

1차 이식 대상은 그래프의 제품 경험과 데이터 계약이다.

- 노드: 디렉터리, 문서
- 엣지: 디렉터리 포함 관계, 문서 링크 관계
- 상태: 선택한 노드, 이웃 강조, 검색 필터, 확대/축소
- 행동: 노드 클릭 시 AppFlowy 문서 열기
- 통계: 노드 수, 엣지 수, 구조 엣지 수, 고립 노드 수

가져오지 않을 것은 다음과 같다.

- SynapseNote FastAPI 서버
- Vault 파일 감시기
- 기존 React/Pixi/D3 화면 코드의 직접 포팅
- AI 채팅, Capture, Context Manager, Learn 기능
- semantic edge 재계산

## AppFlowy에 붙이는 위치

1차 후보는 Flutter 쪽 새 플러그인이다.

- UI 후보: `frontend/appflowy_flutter/lib/plugins/knowledge_graph`
- 진입점 후보: 기존 workspace 사이드바 또는 command palette
- 데이터 후보: `flowy-folder`의 View tree를 읽어 graph projection 생성
- 다음 단계 후보: 문서 링크 추출은 먼저 비워두고, directory edge만으로 화면을 완성한 뒤 붙인다.

Rust 저장 모델을 바꾸지 않는다. 그래프는 AppFlowy 데이터를 읽어서 만든 projection으로 시작한다.

## 1차 작업 순서

1. AppFlowy 로컬 실행 보정  
   검증: `xvfb` 또는 실제 데스크톱에서 AppFlowy 창이 첫 화면까지 뜬다.

2. graph projection 모델 정의  
   검증: AppFlowy View tree 샘플에서 `{ nodes, edges, stats }`가 생성된다.

3. Flutter graph 화면 뼈대 추가  
   검증: 20개 안팎의 샘플 노드가 보이고 확대/축소와 선택이 된다.

4. AppFlowy 문서 열기 연결  
   검증: 그래프 노드를 클릭하면 해당 AppFlowy view/document가 열린다.

5. SynapseNote 그래프 UX 최소 이식  
   검증: 검색, 선택 노드 이웃 강조, 고립 노드 표시가 작동한다.

## 성공 기준

- AppFlowy 원본 문서 생성/열기 흐름을 깨지 않는다.
- 그래프는 AppFlowy 내부 데이터만 읽고, 별도 SynapseNote 서버에 의존하지 않는다.
- 첫 버전은 작고 확실해야 한다. directory graph가 제품 안에서 열리고 문서로 이동되면 1차 성공으로 본다.
- 문서 링크, backlinks, AI context 연결은 1차 성공 뒤에 붙인다.
