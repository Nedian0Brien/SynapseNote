# SynapseNote — AI Agent 가이드

## 커밋 메시지 규칙
- `{tag}: {message}` 형식 사용
- tag: `feat`, `fix`, `refactor`, `docs`, `chore` 등
- message는 반드시 **한글**로 작성

## 작업 규칙
- 코드 작업을 시작할 때는 먼저 `codebase-onboarding` 스킬을 사용하여 코드베이스를 파악할 것 (npx codesight --wiki 실행 → .codesight/wiki/ 문서 참고)
- 코드 변경 완료 후 커밋·푸시를 자동으로 수행
 - 작업 마무리 시 배포 여부를 사용자에게 질문

## 배포

### 배포 스크립트 (반드시 이것을 사용할 것)
```bash
bash deploy/deploy.sh          # api + web 전체 배포
bash deploy/deploy.sh api      # 백엔드만
bash deploy/deploy.sh web      # 프론트엔드만
```

### 핵심 주의사항
- **`docker compose build`를 직접 사용하지 말 것** — `--no-cache` 없이 빌드하면 캐시된 이전 이미지가 재사용되어 코드 변경이 반영되지 않는다.
- `deploy.sh`는 항상 `--no-cache`로 빌드하며, `--no-deps`로 다른 서비스를 보호한다.
- 배포 상세 설명: [`deploy/README.md`](deploy/README.md)

### 배포 확인
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/   # 200 이어야 함
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/   # 200 이어야 함
```

