# 11d-1단계 화면이 쓰는 core 이식 검증 결과

- 날짜: 2026-10-20
- 브랜치: `feat/swift-ports`(기준 `feat/swift-writer`)
- 환경: Xcode 27.0, macOS 27.0, node(ICU 78.3, 로캘 en-US, `TZ=UTC`)
- 비교 기준: Morrow a2daae1의 `core/database.ts`, `formula.ts`, `diff.ts`, `site.ts`, `portability.ts`, `importer.ts`, `migrations.ts`(`readWorkspace`). 새 스크립트 `npm --prefix web run screen-fixtures`가 node에서 Morrow 코드를 돌려 `App/Tests/Fixtures/core/expected/{formula,database,diff,site,portability,importer}.json`을 쓴다. 시계와 id는 고정이다.
- 앱 동작은 바뀌지 않는다. 이 이식은 11d-2부터의 네이티브 화면과 11e의 내보내기·게시·가져오기·백업이 쓴다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 47개 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 128개(11c-2 120개 + 수식 1, 데이터베이스 3, 내보내기 4) |

## Morrow 결과와의 비교

| 비교 자료 | 내용 | 결과 |
|---|---|---|
| `formula.json` | 수식 94건: 연산자 우선순위, 거듭제곱 결합 방향, 나머지·0으로 나누기, 문자열·숫자 변환, 함수 전부, 날짜 더하기(달 넘침, 윤년, 두 자리 연도, NaN), 날짜 차이, 문법 오류 문구, 길이·깊이 제한 | 값과 오류 문구 모두 같음 |
| `database.json` | 속성 종류 전부(수식 셋: 다른 속성 참조, 순환, 문법 오류)와 값이 다른 행 5개: 값·수식 결과·표시 글, 필터 1,760건, 정렬 11가지, 보기, 묶기 5가지, 종류 변환 전부(13×13=169쌍), 옵션 만들기, 셀 읽기, 종류 추측, CSV 표에서 데이터베이스 만들기, 기본 데이터베이스 | 모두 같음 |
| `diff.json` | 같음·추가·삭제·교체·순서 바뀜·긴 문서·한글·이모지·끝 줄바꿈 10건 | 같음 |
| `site.json` | 가이드 vault + 모든 블록이 든 페이지·암호화 페이지·하위 페이지·비슷한 이름·예약 이름: 전체 사이트(수식 렌더러 있음), 한 페이지 사이트(없음), 가이드 사이트 | 파일마다 HTML 같음, 첨부 파일 경로 같음 |
| `portability.json` | 백업 만들기, 백업 읽기 7건(정상, 이전 버전, 새 버전, 버전 아님, 다른 형식, 불완전, 깨진 레코드), 복원 계획(겹치는 id, 같은 페이지 건너뛰기, 저널·일일 노트), Markdown 가져오기, 페이지마다 Markdown, vault 전체 내보내기와 첨부 파일 이름, 파일 이름 다듬기 10건 | 모두 같음 |
| `importer.json` | Notion 형태 압축(감싸는 폴더, 32자 id, `_all.csv`, 행 페이지의 속성 줄, 첨부 파일, 깊은 폴더, `.DS_Store`·`__MACOSX`, 역슬래시 경로, 빈 CSV), 평평한 폴더, CSV 7건, MIME 5건 | 모두 같음 |

비교가 실제로 일어나는지 보려고 HTML 따옴표 처리, 파일 이름 길이, Notion id 길이, diff의 같은 값 처리를 일부러 바꿔 보았고, 모두 실패했다(되돌림).

## 알려진 차이

- **`Date.parse`**(CSV 셀과 종류 추측): V8의 비 ISO 날짜 해석은 엔진마다 다르다. ISO 형식(날짜만이면 UTC, 시각이 있으면 지역 시각)과 node로 확인한 영어 형식("October 19, 2026", "Oct 19 2026", "19 October 2026", "10/19/2026", "2026/10/19", 월 이름은 앞 세 글자, 넘치는 날은 다음 달로)만 옮겼다. 그 밖의 글은 날짜로 읽지 않는다.
- **수식의 `constructor()` 같은 이름**: Morrow는 함수 표를 일반 객체로 찾아 `Object`의 원형 메서드가 걸린다(`constructor()`가 빈 배열을 돌려줌). Swift는 "There is no function called constructor()"로 답한다.
- **백업 JSON 오류 문구**: 깨진 JSON의 이유 부분은 JSON 해석기의 문구라 다르다. 비교 자료에서는 뺐다.
- **페이지 기록의 키 순서**: 백업과 계획의 페이지 기록은 객체 키 순서가 만들어진 경로마다 달라, 키를 정렬해 비교했다. 문서·HTML·Markdown은 그대로 비교했다.
- 게시 사이트의 수식은 Morrow처럼 `renderMath`로 받는다. Morrow는 KaTeX로 MathML을 만든다. 웹을 없애는 11e에서 네이티브 게시가 KaTeX를 어떻게 부를지 정한다.

## 참고사항

- 11c-2에서 동기화로 받은 파일도 외부 편집 두 단계 경로를 지나게 됐지만 iPad에서 동기화로는 확인하지 않았다. 11e에서 동기화를 손볼 때 기기 두 대로 확인한다.
