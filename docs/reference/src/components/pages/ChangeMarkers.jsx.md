# ChangeMarkers.jsx

Source: [`src/components/ChangeMarkers.jsx`](../../../../../src/components/ChangeMarkers.jsx)

A strip of markers down the left side of the document, like a scrollbar with marks: one for each assistant edit still to review (green), for each open suggestion (amber) and for each open comment (accent colour). The position is proportional to the point in the document, and a click scrolls there and, for a note, selects it.

`containerRef` is the `relative` element holding the document scrolling (`[data-document-scroll]`). The positions are recomputed on every editor transaction and on resize, through `requestAnimationFrame` and a `ResizeObserver` (decorations are drawn after the transaction, and the content also changes height when images load); the state changes only when a marker really moved. A note split into several pieces of text (bold, links…) counts once, at its first piece.

Markers closer than 6 px stay stacked: each one is still clickable, and the last is on top. The strip is exposed as a group labelled "Edits and notes to review".
