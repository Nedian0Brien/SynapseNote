---
'@nedian0brien/synapsenote': patch
---

Typing next to an escaped character (such as `\*`) no longer makes backslashes pile up. Characters typed there were written back with a backslash in front even when Markdown does not treat them as escapable, and each save added another; only punctuation that Markdown can escape is now written with a backslash.
