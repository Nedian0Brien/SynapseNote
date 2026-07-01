# Papers Vault Frontend Evidence

- Scope: `/home/ubuntu/research/papers/wiki` synced into the Research Workspace vault under `Papers/`.
- Token baseline: `DESIGN.md` records the existing SynapseNote app tokens used for this narrow UI addition.
- Anti-slop check: no new shell, card system, or decorative visual language was introduced; the `PDF 열기` action reuses the existing `btn btn-secondary` action style.
- Browser QA: screenshots were captured after logging into the live `https://synapse.lawdigest.kr` deployment.

## Screenshots

- `library-1280.png`: live Library route with synced `Papers/...` content.
- `library-mt-raig-pdf-button-1280.png`: `MT-RAIG` document selected with `PDF 열기` visible.
- `library-768.png`: tablet viewport Library route.
- `library-390.png`: mobile viewport Library route.
- `graph-1280.png`: live Graph route after the synced vault graph loaded.

## API Smoke

- Public app: `https://synapse.lawdigest.kr/` returned `200`.
- Live vault graph: `code=0`, `graph_docs=94`, `papers_docs=59`.
- Live document read: `Papers/concepts/rag/adaptive-retrieval.md` returned `code=0`, `content_chars=2289`.
- Live PDF read: `Papers/raw/ingested/dli-lab-papers-2026/MT_RAIG_acl2025.pdf` returned `200 application/pdf`, `content-length=5584990`.
- Live `PDF 열기` click: browser network captured `/vault/files/...pdf` returning `200 application/pdf`.
