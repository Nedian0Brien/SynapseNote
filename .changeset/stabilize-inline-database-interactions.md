---
'@nedian0brien/synapsenote': patch
---

Make document-native database controls interactive in place, preserve mounted database views across schema and background refreshes, retain the last ready view after recoverable refresh failures, and provide reliable advanced-action loading feedback. Database tables now use stable shared column tracks so under-filled tables remain continuous, overflowing tables scroll through one owner, and property widths do not drift between headers, rows, and actions.
