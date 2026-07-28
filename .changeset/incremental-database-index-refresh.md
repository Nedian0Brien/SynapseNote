---
'@nedian0brien/synapsenote': patch
---

Refresh the database index incrementally after a table write instead of rebuilding it, so adding a row responds without a multi-second pause.
