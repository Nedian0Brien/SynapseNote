---
'@nedian0brien/synapsenote': patch
---

Editing an emoji no longer corrupts it. When an agent or an external file edit changed one emoji into another that shares its first half (😀 → 😁), the document ended up with a replacement character instead of the new emoji. Text written to documents now always changes whole characters, agent edits carrying half of a surrogate pair are rejected, and any stray half in a document is replaced with the same character every connected client already shows.
