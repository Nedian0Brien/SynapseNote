---
'@nedian0brien/synapsenote': patch
---

Give the graph view real controls. A new settings popover in the graph header
adds four sections: **Filters** (search the graph, and show or hide external
links, uncreated pages, orphans, and tags as nodes), **Groups** (color pages
that match a search of your own), **Display** (node size, link thickness,
arrows, and how far you have to zoom in before labels appear), and **Forces**
(center, repel, and link strength plus link distance). Hovering a node now
highlights it and its direct neighbors and dims the rest, and a new button
frames the whole graph in view.

The docked graph in the right rail and the expanded full-screen graph keep
separate settings, so tuning one leaves the other alone. Both are remembered
between sessions, and "Restore defaults" puts either back the way it was.
