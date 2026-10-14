# VersionDiffDialog.jsx

Source: [`src/components/VersionDiffDialog.jsx`](../../../../../src/components/VersionDiffDialog.jsx)

Modal dialog comparing a saved version with the current text of a document. The diff comes from [lineDiff.js](../../lib/lineDiff.js.md) (`lineDiff` plus `collapseDiff`), so unchanged stretches are collapsed into gaps.

Each row is monospaced and coloured: added lines in green, removed ones in red, unchanged ones in grey, gaps centred. The header shows the title and the legend ("− saved version", "+ current text"); when the two texts match, it says so instead of showing rows. Buttons: "Restore this version" and close — Escape or a click on the backdrop also closes it.