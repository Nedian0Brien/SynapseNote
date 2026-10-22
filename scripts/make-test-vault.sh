#!/bin/bash
# writes an Obsidian style vault for checking the app by hand: folders, wiki links, callouts,
# frontmatter properties, tags, an image, a canvas and another tool's hidden folder
set -euo pipefail
DIR="${1:?usage: make-test-vault.sh <folder>}"
mkdir -p "$DIR/Projects/Launch" "$DIR/attachments" "$DIR/.obsidian"

# Home embeds diagram.png by name although it sits in attachments/: Obsidian and Morrow find embeds by file
# name, so this is a valid vault and the case is worth keeping
cat > "$DIR/Home.md" <<'MD'
# Home

Start at [[Projects]] or read [[Reading notes|the reading notes]].

> [!tip] Callout
> Callouts keep their kind and title.

- [ ] An open task
- [x] A finished task

![[diagram.png]]

#inbox #project/launch
MD

cat > "$DIR/Projects.md" <<'MD'
---
status: active
tags:
  - project
---

Projects live in the folder beside this page.

$$
E = mc^2
$$
MD

cat > "$DIR/Projects/Launch.md" <<'MD'
---
owner: Dennis
due: 2026-11-01
---

Launch plan. See [[Home#Callout]].

| Step | Done |
| --- | --- |
| Draft | yes |
MD

cat > "$DIR/Projects/Launch/Checklist.md" <<'MD'
- [ ] 첫 번째 할 일
- [ ] Second task with ==highlight== and `code`
MD

cat > "$DIR/Reading notes.md" <<'MD'
Notes in **bold**, *italic* and ~~struck~~ text, with a [link](https://example.com).
MD

printf '{"nodes":[{"id":"a","type":"text","text":"Idea","x":0,"y":0,"width":200,"height":80}],"edges":[]}\n' > "$DIR/Board.canvas"
printf '{"theme":"obsidian"}\n' > "$DIR/.obsidian/app.json"
# a 2x2 png
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x02\x00\x00\x00\x02\x08\x02\x00\x00\x00\xfd\xd4\x9as\x00\x00\x00\x16IDATx\x9cc\xf8\xcf\xc0\xf0\x1f\x08\x18\xfe\x03\x00\x1f\xf6\x03\xfd\xb0\xb5\x9a\x8f\x00\x00\x00\x00IEND\xaeB`\x82' > "$DIR/attachments/diagram.png"
# large enough to see in the editor
sips -z 120 240 "$DIR/attachments/diagram.png" >/dev/null 2>&1 || true
echo "test vault written to $DIR"
