---
'@nedian0brien/synapsenote': patch
---

Reduce database edit latency by recording exact before-and-after shadow Git commits through a bounded transaction path instead of spawning Git separately for every snapshot and blob.
