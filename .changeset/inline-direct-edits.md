---
"@nedian0brien/synapsenote": patch
---

Make linked inline databases directly editable. Title cells and new-row page
creation now use the same direct-safe mutation policy as the full database
workspace, with optimistic values and compact saving/error states.
