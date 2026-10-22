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

The graph is also redrawn to read calmly at scale. Meaning is carried by weight
rather than by color: well-linked pages are open rings with their link count
inside, ordinary pages are soft dots, and things that are referenced but are not
pages — unresolved links, tags, external URLs — recede into faint outlines
instead of being painted in alarm red. Page-to-page links are drawn more firmly
than links to tags and URLs, and color is spent on one thing only: the document
you came from. Labels sit as plain text under their node and appear at a zoom
that matches how connected the page is, so zooming out thins the graph down to
its landmarks instead of clearing every name at once.

Folders are now part of the graph. Each directory that holds pages becomes a
node of its own, and every page it holds is tied to it — so the layout gathers
each folder into its own region instead of leaving one undifferentiated cloud,
and clicking a folder opens its overview. Nested folders nest, a chain of
single-child folders collapses into one node the way a file tree collapses it,
and a page named after its folder becomes that folder's node rather than a
second dot for the same place. Containment is drawn faintly and carries no
arrow: it is the shape of your vault, not a link you wrote. The project itself
is a node too, pinned at the centre, so the whole tree holds together instead of
drifting into separate islands. Turn it off under **Filters → Folders** — on by
default for the project graph, off for the rail's local one.

The layout itself is readable at the zoom that fits the whole map. Repulsion
between nodes now has a range instead of reaching across the entire graph, which
was quietly crushing every folder into a solid dot while pushing the folders far
apart — so the map came out many times wider than the gap between neighbouring
pages, and no zoom level could show you both. Clusters now sit at a size you can
actually see into, and stay just as well grouped.

Each folder now also paints a soft tinted territory behind everything it holds,
with its name written across it, so you can tell which part of the vault you are
looking at without reading a single node label. Names are drawn at full weight
rather than whispered, far more of them appear at once, a page has to be
genuinely well-connected before it draws as a numbered hub, and arrowheads are
off by default — the graph should tell you what things ARE before it tells you
how many links they have.

Territories behave like an atlas rather than an overlay. Only the ones that are
a useful size at your current zoom are drawn, and each is named in type sized to
fit it, so zooming out shows you the few large places your vault is made of and
zooming in hands the naming over to their contents — one region fading as its
children arrive. A territory is also drawn around where a folder's pages
actually sit rather than stretched to reach its one far-flung outlier, so the
colour marks a place instead of washing the canvas.

