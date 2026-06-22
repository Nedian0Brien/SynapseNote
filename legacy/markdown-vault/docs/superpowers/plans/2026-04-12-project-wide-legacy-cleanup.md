# Project-Wide Legacy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 SynapseNote 레포를 `active / reference / archive` 기준으로 재정렬하고, 실제 런타임을 `FastAPI + Vite build + nginx web` 구조에 맞춰 통일하며, 로그인/그래프/에디터/패널 기능은 유지한 채 전반 레거시를 archive 또는 제거 후보로 내린다.

**Architecture:** 먼저 문서와 설정의 진실 소스를 정리한 뒤, 배포/런타임 정의를 실제 구조에 맞춘다. 그 다음 `Flask` 기반 구 런타임과 관련 테스트/스크립트를 archive로 이동하고, 프론트엔드는 기능 중심 구조로 재배치하면서 미사용 설정과 의존성을 제거한다.

**Tech Stack:** React 19, Vite, D3, Vitest, FastAPI, pytest, Docker Compose, nginx, bash, ripgrep

---

## File Structure Lock

### Active paths after cleanup

- `services/web-editor/backend/app/**`
- `services/web-editor/backend/tests/**`
- `services/web-editor/frontend/src/**`
- `services/web-editor/frontend/Dockerfile`
- `services/web-editor/frontend/nginx.conf`
- `docker-compose.yml`
- `deploy/deploy.sh`
- `deploy/README.md`
- `README.md`
- `docs/design-system-preview.html`
- `docs/main-ui-preview.html`

### Archive targets to create

- `docs/archive/2026-04-legacy-cleanup/README.md`
- `docs/archive/2026-04-legacy-cleanup/previews/**`
- `docs/archive/2026-04-legacy-cleanup/design-stitch/**`
- `docs/archive/2026-04-legacy-cleanup/progress/**`
- `docs/archive/2026-04-legacy-cleanup/plans/**`
- `services/web-editor/archive/flask-runtime/**`

### Guardrail files to add/update

- Create: `scripts/verify_legacy_cleanup.sh`
- Modify: `.gitignore`
- Modify: `services/web-editor/.dockerignore`

### Frontend target layout

- Create: `services/web-editor/frontend/src/features/auth/`
- Create: `services/web-editor/frontend/src/features/editor/`
- Create: `services/web-editor/frontend/src/features/workspace/`
- Create: `services/web-editor/frontend/src/features/panels/`
- Create: `services/web-editor/frontend/src/shared/auth/`
- Create: `services/web-editor/frontend/src/shared/theme/`
- Create: `services/web-editor/frontend/src/shared/hooks/`
- Create: `services/web-editor/frontend/src/shared/plugins/`
- Create: `services/web-editor/frontend/src/shared/styles/`

## Task 1: Add Cleanup Guardrails And Archive Index

**Files:**
- Create: `scripts/verify_legacy_cleanup.sh`
- Create: `docs/archive/2026-04-legacy-cleanup/README.md`
- Modify: `.gitignore`
- Modify: `services/web-editor/.dockerignore`
- Test: `scripts/verify_legacy_cleanup.sh`

- [ ] **Step 1: Write the failing guard script**

Create `scripts/verify_legacy_cleanup.sh` with checks for all of the following:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[legacy-check] validating runtime references"

if rg -n "services/web-editor/app.py|services/web-editor/base_routes.py|services/web-editor/deploy.sh" \
  README.md deploy docs services/web-editor/frontend services/web-editor/backend \
  --glob '!docs/archive/**' --glob '!docs/superpowers/**'; then
  echo "[legacy-check] stale Flask/runtime references found"
  exit 1
fi

if rg -n "next\\.config|Next\\.js" \
  README.md deploy services/web-editor/frontend \
  --glob '!docs/archive/**'; then
  echo "[legacy-check] stale Next.js references found"
  exit 1
fi

if git ls-files '*__pycache__*' '*.pyc' | grep -q .; then
  echo "[legacy-check] tracked Python cache artifacts found"
  exit 1
fi

echo "[legacy-check] OK"
```

- [ ] **Step 2: Run script to verify it fails on current tree**

Run:

```bash
bash scripts/verify_legacy_cleanup.sh
```

Expected: FAIL because stale references and tracked generated files still exist.

- [ ] **Step 3: Create archive index document**

Create `docs/archive/2026-04-legacy-cleanup/README.md` with:

- archive 목적
- 이번 이관 범주(`previews`, `design-stitch`, `progress`, `plans`, `flask-runtime`)
- active/reference 자산 규칙
- 나중 삭제 대상이라는 주석

- [ ] **Step 4: Harden ignore rules**

Update `.gitignore` and `services/web-editor/.dockerignore` so these are clearly ignored:

```gitignore
__pycache__/
*.pyc
.pytest_cache/
services/web-editor/archive/
```

- [ ] **Step 5: Commit**

```bash
git add scripts/verify_legacy_cleanup.sh docs/archive/2026-04-legacy-cleanup/README.md .gitignore services/web-editor/.dockerignore
git commit -m "chore: 레거시 정리 가드레일과 아카이브 인덱스 추가"
```

## Task 2: Move Legacy Docs And Design Assets To Archive

**Files:**
- Modify: `docs/base-hierarchy-concept.html`
- Modify: `docs/graph-concept-preview.html`
- Modify: `docs/graph-view-preview.html`
- Modify: `docs/layout-comparison.html`
- Modify: `docs/hub-node-styles.html`
- Modify: `docs/design/stitch/**`
- Modify: `docs/progress/*.md`
- Modify: `docs/plans/synapsenote-frontend-backend-rebuild-plan.md`
- Modify: `docs/known-issues.md`
- Modify: `docs/product_specification.md`
- Modify: `docs/specification.md`
- Create: `docs/archive/2026-04-legacy-cleanup/previews/`
- Create: `docs/archive/2026-04-legacy-cleanup/design-stitch/`
- Create: `docs/archive/2026-04-legacy-cleanup/progress/`
- Create: `docs/archive/2026-04-legacy-cleanup/plans/`
- Test: `scripts/verify_legacy_cleanup.sh`

- [ ] **Step 1: Write the failing reference check**

Run:

```bash
rg -n "graph-view-preview|graph-concept-preview|layout-comparison|base-hierarchy-concept|hub-node-styles|design/stitch" docs README.md
```

Expected: multiple hits outside `docs/archive/**`.

- [ ] **Step 2: Move non-reference preview/design assets into archive**

Move these files into `docs/archive/2026-04-legacy-cleanup/previews/`:

```text
docs/base-hierarchy-concept.html
docs/graph-concept-preview.html
docs/graph-view-preview.html
docs/layout-comparison.html
docs/hub-node-styles.html
```

Move these directories/files into `docs/archive/2026-04-legacy-cleanup/`:

```text
docs/design/stitch/**
docs/progress/sprint-01-foundation-log.md
docs/progress/sprint-02-library-context-log.md
docs/progress/sprint-03-agent-chat-log.md
docs/progress/synapsenote-rebuild-master-progress.md
docs/plans/synapsenote-frontend-backend-rebuild-plan.md
```

- [ ] **Step 3: Update surviving docs to point only at active/reference assets**

Clean references in:

```text
README.md
deploy/README.md
docs/known-issues.md
docs/product_specification.md
docs/specification.md
docs/superpowers/specs/2026-04-12-project-wide-legacy-cleanup-design.md
```

Replace or remove links that still point to moved preview assets when they are not needed for current work.

- [ ] **Step 4: Re-run archive reference search**

Run:

```bash
rg -n "graph-view-preview|graph-concept-preview|layout-comparison|base-hierarchy-concept|hub-node-styles|design/stitch" \
  docs README.md deploy --glob '!docs/archive/**'
```

Expected: no results, or only intentional historical mentions inside the cleanup spec/plan.

- [ ] **Step 5: Re-run guard script**

Run:

```bash
bash scripts/verify_legacy_cleanup.sh
```

Expected: still FAIL because runtime cleanup is not done yet, but archive/reference violations from this task should be gone.

- [ ] **Step 6: Commit**

```bash
git add docs README.md deploy
git commit -m "chore: 레거시 문서와 디자인 자산을 아카이브로 이관"
```

## Task 3: Align Compose, Docker, And Deploy Docs To The Real Runtime

**Files:**
- Modify: `docker-compose.yml`
- Modify: `deploy/deploy.sh`
- Modify: `deploy/README.md`
- Modify: `README.md`
- Modify: `services/web-editor/frontend/nginx.conf`
- Archive: `services/web-editor/Dockerfile`
- Archive: `services/web-editor/deploy.sh`
- Test: `docker compose config`

- [ ] **Step 1: Write the failing runtime topology check**

Run:

```bash
rg -n "synapsenote-api|obsidian-web|Next\\.js|Flask" docker-compose.yml deploy/README.md README.md services/web-editor/deploy.sh services/web-editor/Dockerfile
```

Expected: output showing mixed generations of service names and runtime descriptions.

- [ ] **Step 2: Make compose describe the real split runtime**

Update `docker-compose.yml` so it contains both services:

```yaml
synapsenote-api:
  build:
    context: ./services/web-editor/backend
    dockerfile: Dockerfile
  container_name: synapsenote-api
  environment:
    VAULT_ROOT: /vault
    SYNAPSENOTE_USER_ID: ${SYNAPSENOTE_USER_ID:-solo}
    SYNAPSENOTE_USER_PASSWORD: ${SYNAPSENOTE_USER_PASSWORD:-solo}
    SYNAPSENOTE_SESSION_SECRET: ${SYNAPSENOTE_SESSION_SECRET:-change-me}
    SYNAPSENOTE_CHAT_STORE: ${SYNAPSENOTE_CHAT_STORE:-file}
  volumes:
    - ${VAULT_ROOT:-/home/ubuntu/obsidian}:/vault
  expose:
    - "8000"

synapsenote-web:
  build:
    context: ./services/web-editor
    dockerfile: frontend/Dockerfile
  container_name: synapsenote-web
  depends_on:
    - synapsenote-api
  ports:
    - "127.0.0.1:3002:3000"
```

- [ ] **Step 3: Update deploy script and docs to that topology**

Make `deploy/deploy.sh`, `deploy/README.md`, and `README.md` all reflect:

- 공식 진입점: `bash deploy/deploy.sh`
- 서비스명: `synapsenote-api`, `synapsenote-web`
- 프론트는 `Vite build + nginx`
- 백엔드는 `FastAPI`

Remove mentions of `Next.js`, `Flask`, and `obsidian-web` from active docs.

- [ ] **Step 4: Archive obsolete deploy/runtime entrypoints**

Move these into `services/web-editor/archive/flask-runtime/`:

```text
services/web-editor/Dockerfile
services/web-editor/deploy.sh
services/web-editor/version.txt
```

If `deploy/deploy.sh` still needs commit metadata, replace the old `version.txt` behavior with direct `git log -1 --pretty='%h %s'`.

- [ ] **Step 5: Validate compose**

Run:

```bash
docker compose config >/tmp/synapsenote-compose.out
tail -n 20 /tmp/synapsenote-compose.out
```

Expected: rendered config includes both `synapsenote-api` and `synapsenote-web` without missing-file errors.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml deploy/deploy.sh deploy/README.md README.md services/web-editor
git commit -m "refactor: 배포 구조를 FastAPI와 Vite 기준으로 통일"
```

## Task 4: Retire Flask Runtime Paths And Replace Flask-Specific Tests

**Files:**
- Archive: `services/web-editor/app.py`
- Archive: `services/web-editor/base_routes.py`
- Archive: `services/web-editor/requirements.txt`
- Archive: `services/web-editor/tests/test_graph_view.py`
- Modify: `services/web-editor/tests/conftest.py`
- Modify: `services/web-editor/tests/test_api_app.py`
- Modify: `services/web-editor/backend/tests/test_routers.py`
- Create: `services/web-editor/backend/tests/test_runtime_contract.py`
- Test: `pytest services/web-editor/tests/test_api_app.py services/web-editor/backend/tests/test_routers.py services/web-editor/backend/tests/test_runtime_contract.py -q`

- [ ] **Step 1: Write the failing compatibility test for active runtime**

Create `services/web-editor/backend/tests/test_runtime_contract.py` with checks for:

- `/health` metadata
- `/auth/login` and `/auth/me`
- `/api/graph` schema shape
- `/api/documents/{path}` read/write

Use the existing `TestClient(create_app())` pattern and temporary vault fixtures.

- [ ] **Step 2: Run new backend runtime test and verify failure**

Run:

```bash
pytest services/web-editor/backend/tests/test_runtime_contract.py -q
```

Expected: FAIL until fixture/import path and assertions are fully wired.

- [ ] **Step 3: Convert shared root tests to FastAPI-only responsibility**

Update:

- `services/web-editor/tests/test_api_app.py`
- `services/web-editor/tests/conftest.py`

so they no longer mention “Flask fallback” behavior and clearly act as compatibility tests for the FastAPI app.

- [ ] **Step 4: Archive Flask-only runtime files and tests**

Move to `services/web-editor/archive/flask-runtime/`:

```text
services/web-editor/app.py
services/web-editor/base_routes.py
services/web-editor/requirements.txt
services/web-editor/tests/test_graph_view.py
```

If any helper logic is still needed from those files, copy the exact logic into `backend/app/services/` or `backend/tests/fixtures/` before moving the originals.

- [ ] **Step 5: Expand router integration coverage to absorb the lost Flask test**

Add graph and ignored-directory assertions into `services/web-editor/backend/tests/test_routers.py`:

```python
def test_graph_ignores_pytest_cache(client, vault):
    cache_dir = vault / ".pytest_cache"
    cache_dir.mkdir()
    (cache_dir / "README.md").write_text("cache", encoding="utf-8")
    _login(client)
    response = client.get("/api/graph")
    ids = {node["id"] for node in response.json()["data"]["nodes"]}
    assert ".pytest_cache" not in ids
    assert ".pytest_cache/README.md" not in ids
```

- [ ] **Step 6: Run backend regression suite**

Run:

```bash
pytest services/web-editor/tests/test_api_app.py services/web-editor/backend/tests/test_routers.py services/web-editor/backend/tests/test_runtime_contract.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/web-editor/tests services/web-editor/backend/tests services/web-editor/archive/flask-runtime
git commit -m "refactor: Flask 런타임 경로를 아카이브로 전환"
```

## Task 5: Restructure Frontend Around Maintained Features

**Files:**
- Create: `services/web-editor/frontend/src/features/auth/LoginForm.jsx`
- Create: `services/web-editor/frontend/src/features/editor/EditorView.jsx`
- Create: `services/web-editor/frontend/src/features/workspace/GraphView.jsx`
- Create: `services/web-editor/frontend/src/features/workspace/Shell.jsx`
- Create: `services/web-editor/frontend/src/features/workspace/Sidebar.jsx`
- Create: `services/web-editor/frontend/src/features/workspace/Topbar.jsx`
- Create: `services/web-editor/frontend/src/features/panels/ChatPanel.jsx`
- Create: `services/web-editor/frontend/src/features/panels/ContextPanel.jsx`
- Create: `services/web-editor/frontend/src/shared/auth/AuthContext.jsx`
- Create: `services/web-editor/frontend/src/shared/theme/ThemeContext.jsx`
- Create: `services/web-editor/frontend/src/shared/hooks/useFileContent.js`
- Create: `services/web-editor/frontend/src/shared/hooks/useGraph.js`
- Create: `services/web-editor/frontend/src/shared/hooks/useVaultTree.js`
- Create: `services/web-editor/frontend/src/shared/plugins/wikilinkPlugin.js`
- Create: `services/web-editor/frontend/src/shared/styles/*.css`
- Modify: `services/web-editor/frontend/src/App.jsx`
- Modify: `services/web-editor/frontend/src/main.jsx`
- Delete/replace: existing `src/components/**`, `src/hooks/**`, `src/contexts/**`, `src/plugins/**`, `src/styles/**`
- Delete: `services/web-editor/frontend/next.config.mjs`
- Modify: `services/web-editor/frontend/package.json`
- Modify: `services/web-editor/frontend/README.md`
- Test: `npm run test`, `npm run build`

- [ ] **Step 1: Write the failing import-path change**

Move one leaf module first, for example `ThemeContext`, and update `Topbar.jsx` to import from the new path. Do not move every file in one commit-sized step before checking module resolution.

Run:

```bash
cd services/web-editor/frontend
npm run test -- --runInBand
```

Expected: FAIL after the first move because remaining imports still point at old paths.

- [ ] **Step 2: Move files into the feature/shared layout**

Rehome current files exactly as follows:

```text
src/components/auth/LoginForm.jsx                  -> src/features/auth/LoginForm.jsx
src/components/editor/EditorView.jsx               -> src/features/editor/EditorView.jsx
src/components/graph/GraphView.jsx                 -> src/features/workspace/GraphView.jsx
src/components/shell/Shell.jsx                     -> src/features/workspace/Shell.jsx
src/components/shell/Sidebar.jsx                   -> src/features/workspace/Sidebar.jsx
src/components/shell/Topbar.jsx                    -> src/features/workspace/Topbar.jsx
src/components/panels/ChatPanel.jsx                -> src/features/panels/ChatPanel.jsx
src/components/panels/ContextPanel.jsx             -> src/features/panels/ContextPanel.jsx
src/contexts/AuthContext.jsx                       -> src/shared/auth/AuthContext.jsx
src/contexts/ThemeContext.jsx                      -> src/shared/theme/ThemeContext.jsx
src/hooks/useFileContent.js                        -> src/shared/hooks/useFileContent.js
src/hooks/useGraph.js                              -> src/shared/hooks/useGraph.js
src/hooks/useVaultTree.js                          -> src/shared/hooks/useVaultTree.js
src/plugins/wikilinkPlugin.js                      -> src/shared/plugins/wikilinkPlugin.js
src/styles/tokens.css                              -> src/shared/styles/tokens.css
src/styles/base.css                                -> src/shared/styles/base.css
src/styles/auth.css                                -> src/shared/styles/auth.css
src/styles/shell.css                               -> src/shared/styles/shell.css
src/styles/editor.css                              -> src/shared/styles/editor.css
src/styles/panels.css                              -> src/shared/styles/panels.css
src/styles/graph.css                               -> src/shared/styles/graph.css
```

- [ ] **Step 3: Update imports and tests**

Touch at minimum:

```text
src/App.jsx
src/main.jsx
src/bootstrapDevTools.js
src/bootstrapDevTools.test.js
src/features/workspace/GraphView.test.jsx
src/features/panels/ContextPanel.test.jsx
src/features/panels/ChatPanel.test.jsx
```

Make sure no import path still points at removed `components/`, `hooks/`, `contexts/`, `plugins/`, or `styles/` directories.

- [ ] **Step 4: Remove dead frontend config and unused dependencies**

Delete `services/web-editor/frontend/next.config.mjs`.

Remove unused packages from `package.json` if grep confirms they are not used anymore:

```text
react-router-dom
motion
clsx
tailwind-merge
lucide-react
@tailwindcss/typography
```

Keep only packages still referenced by source, config, or tests.

- [ ] **Step 5: Replace template README with project-specific README**

Rewrite `services/web-editor/frontend/README.md` so it documents:

- app entrypoint
- folder layout
- dev commands
- build/test commands
- design reference docs

- [ ] **Step 6: Run frontend regression suite**

Run:

```bash
cd services/web-editor/frontend
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/web-editor/frontend
git commit -m "refactor: 프론트엔드 구조를 유지 기능 기준으로 재편"
```

## Task 6: Remove Tracked Generated Artifacts And Finalize Cleanup Verification

**Files:**
- Modify: tracked cache artifacts under `services/web-editor/**/__pycache__*`
- Modify: tracked cache artifacts under `.codesight/**` only if intentionally part of repo policy
- Modify: `scripts/verify_legacy_cleanup.sh`
- Test: `git ls-files`, `pytest`, `npm`, `docker compose config`

- [ ] **Step 1: Write the failing generated-file check**

Run:

```bash
git ls-files '*__pycache__*' '*.pyc' '.pytest_cache/*'
```

Expected: FAIL signal because tracked generated files still appear.

- [ ] **Step 2: Untrack generated Python cache artifacts**

Remove tracked cache artifacts from git index and filesystem where they are not source:

```text
services/web-editor/__pycache__/*
services/web-editor/backend/app/__pycache__/*
services/web-editor/tests/__pycache__/*
services/web-editor/.pytest_cache/*
```

Do not touch user-authored `.codesight/**` content unless the repo policy explicitly treats it as generated and disposable.

- [ ] **Step 3: Make guard script strict enough for final tree**

Extend `scripts/verify_legacy_cleanup.sh` so it also checks:

- `services/web-editor/frontend/next.config.mjs` absent
- `services/web-editor/app.py` absent from active tree
- `services/web-editor/deploy.sh` absent from active tree
- stale `obsidian-web` references absent outside archive

- [ ] **Step 4: Run full project verification**

Run:

```bash
bash scripts/verify_legacy_cleanup.sh
pytest services/web-editor/tests/test_api_app.py services/web-editor/tests/test_chat_api.py services/web-editor/tests/test_capture_api.py services/web-editor/tests/test_agent_runtime.py services/web-editor/backend/tests/test_document_service.py services/web-editor/backend/tests/test_graph_service.py services/web-editor/backend/tests/test_routers.py services/web-editor/backend/tests/test_runtime_contract.py -q
cd services/web-editor/frontend && npm run test && npm run build
cd /home/ubuntu/project/SynapseNote && docker compose config >/tmp/synapsenote-compose-final.out
```

Expected:

- guard script: PASS
- pytest suite: PASS
- frontend test/build: PASS
- compose config: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: 프로젝트 전반 레거시 정리를 마무리"
```

## Rollout Notes

- Archive moves happen before destructive cleanup, so rollback is still file-level and low risk.
- Runtime topology must be aligned before removing Flask files; otherwise deploy verification becomes ambiguous.
- Frontend moves should preserve CSS import order from `main.jsx`: `tokens -> base -> auth -> shell -> editor -> panels -> graph`.
- Do not deploy until Task 6 verification passes.

## Final Deployment

After all tasks pass, run:

```bash
bash deploy/deploy.sh
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health
```

Expected:

- frontend returns `200`
- API health returns `200`
