---
'@nedian0brien/synapsenote': patch
---

Rework the graph view around the split Obsidian uses: the right rail keeps the
**local** graph — the neighborhood around the page you are writing — and the
whole-project graph becomes a content surface of its own. Press **⌘G** (Ctrl-G)
to open it as a tab beside your documents, so the rail stays free for outline,
links, and chat while you explore. The rail's expand button opens the same tab
instead of inflating the panel over the window, and Explore / Orphans / Hubs now
live there.

Both graphs also gain real controls, in a new settings popover with four
sections: **Filters** (search the graph, and show or hide external links,
uncreated pages, orphans, and tags as nodes), **Groups** (color pages that match
a search of your own), **Display** (node size, link thickness, arrows, and how
far you have to zoom in before labels appear), and **Forces** (center, repel,
and link strength plus link distance). Hovering a node highlights it and its
direct neighbors and dims the rest, and a new button frames the whole graph in
view.

The local and project graphs keep separate settings, so tuning one leaves the
other alone. Both are remembered between sessions, and "Restore defaults" puts
either back the way it was.

Zoom now drives the project graph rather than just scaling it. Select a node and
zoom in and the graph **stops drifting** — the selection is pinned and the
centering force released, so the neighborhood stays where you can read and click
it. Keep zooming and the neighbors become **cards** with their titles, paths, and
tags at full size; zoom back out and you return to exactly the view you left.

Labels and folders follow the same idea. A page's name now appears at a zoom
that matches how connected it is, so zooming out thins the graph down to its
landmarks instead of clearing every name at once. Folders are drawn as named
regions behind the nodes that live in them, giving the graph the shape of a map.
