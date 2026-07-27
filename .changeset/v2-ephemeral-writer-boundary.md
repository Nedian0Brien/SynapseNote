---
'@nedian0brien/synapsenote': patch
---

Keep standalone single-file sessions writable without placing locks or database journals beside the user's Markdown file. The v2 owner-table writer now permits the external content directory only for the isolated ephemeral session; regular project servers remain project-root confined.
