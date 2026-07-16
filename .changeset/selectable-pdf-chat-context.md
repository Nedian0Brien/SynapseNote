---
'@inkeep/open-knowledge': patch
---

Select text directly in the PDF viewer and automatically attach the dragged passage to the chat composer as document context. Sent user messages retain a visible source card with the document, location, and exact passage. Context labels remain human-readable in production builds because the app now extracts new translation messages before compiling. The viewer virtualizes visible pages and resolves selection from PDF glyph geometry, avoiding expensive transparent text-layer DOM during fast scrolling.
