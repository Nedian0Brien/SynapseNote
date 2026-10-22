---
'@nedian0brien/synapsenote': patch
---

Guide built-in Codex and Claude chats to act as safe, source-grounded SynapseNote knowledge stewards that read the existing corpus first, preserve project structure and conflicting evidence, use connected wiki metadata, and request approval before destructive changes. Every chat turn now carries the current editor document's title and path as structured context; the installed project skill and MCP description use `current_document` as the fallback and prohibit Chronicle or screen-history inference.
