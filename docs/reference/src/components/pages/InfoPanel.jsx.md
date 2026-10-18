# InfoPanel.jsx

Source: [`src/components/InfoPanel.jsx`](../../../../../src/components/InfoPanel.jsx)

The **Info** side tab: the statistics of the document in front, in sections.

- **Document**: name, path in the project, the last save (the date of the file on disk, with the exact time as a tooltip and a relative form that stays true as time passes: "3 hours ago"), a note when the editor holds unsaved changes, and the size of the file. A draft that was never saved, or a document outside the project, has no date.
- Two tiles with the **words** and the **characters**.
- **Selection** (only while some text is selected): words, characters, characters without spaces and reading time of the selection.
- **Length**: characters without spaces, sentences, paragraphs, distinct words, pages (250 words each).
- **Time**: reading time (about 220 words per minute) and speaking time (about 130), shown as "less than a minute", minutes, or hours and minutes; the rates are in the tooltips.
- **Style**: average word length, average and longest sentence.
- **Structure**: headings, list items, tables, images, links, code blocks, footnotes, formulas.
- **Review**: the open notes and the bookmarks of the document.

The numbers follow the editor: they are recomputed a moment after typing stops (so long documents stay light) and at every change of the selection. The counting is in [documentStats.js](../../lib/documentStats.js.md). Mounted by [App.jsx](../../App.jsx.md) for the document in front.
