# documentStats.js

Source: [`src/lib/documentStats.js`](../../../../src/lib/documentStats.js)

The statistics of a document, for the [Info panel](../components/pages/InfoPanel.jsx.md). Words and sentences are counted with `Intl.Segmenter`, which knows the rules of the language (the apostrophe of "l'anno", hyphens, abbreviations), not by splitting on spaces.

- `textStats(text, locale, sentenceText)`: words, characters (the line breaks between blocks are not characters) with and without spaces, sentences, distinct words, average word length, average and longest sentence, and the reading time (220 words per minute), speaking time (130) and pages (250 words) as numbers. The sentences are counted on `sentenceText` when given, so that titles, table cells and code do not count as sentences.
- `proseOf(doc)`: the text of the document without the front matter (not prose), blocks separated by a line break.
- `sentenceTextOf(doc)`: only the paragraphs and list items, without headings, tables, code, formulas and footnote definitions.
- `structureOf(doc)`: headings, paragraphs, list items, tables, images, links (a link that crosses several pieces of text counts once), code blocks, footnotes and formulas.
- `durationParts(minutes)`: a duration as `short` (under a minute), minutes, or hours and minutes, to be translated by the caller.

