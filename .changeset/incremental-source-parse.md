---
'@nedian0brien/synapsenote': patch
---

Long documents stay responsive while you type in source mode or while an agent edits them. The server used to re-read the whole document on every keystroke, which took about two seconds on a 5,000-line note and stalled every other request meanwhile; it now re-reads only the blocks around the edit (about 6 ms on the same note) and falls back to a full read whenever that could give a different result.
