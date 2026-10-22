---
'@nedian0brien/synapsenote': patch
---

Stop callouts from growing a blank first line. Any edit inside a callout rewrote it with the `[!NOTE]` marker on its own line, and reopening the file turned that blank quote line into an empty paragraph at the top of the callout — once per edit-and-reload cycle.
