---
'@nedian0brien/synapsenote': patch
---

Fix docked LLM chats that could remain in the running state when Codex started without a configured SynapseNote MCP server or a CLI command exited before emitting its normal completion event. Codex web searches now appear in the conversation as live tool activity with the completed search query, and searched web references render outside the answer bubble as OpenGraph source previews with thumbnails and site metadata.
