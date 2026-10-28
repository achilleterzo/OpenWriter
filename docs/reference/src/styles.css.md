# src/styles.css

Source: [`src/styles.css`](../../../src/styles.css)

Global stylesheet built on Tailwind CSS (base, components, utilities).

- Theme variables: the slate palette is defined as RGB triplets and inverted for `data-theme="light"`; `color-scheme` follows the theme.
- Accent variables (`--accent-300`…`--accent-600`) per accent (`ash`, `violet`, `cyan`, `emerald`, `rose`, `amber`), with darker variants in light theme; plus emerald, rose, amber and teal tokens used by the interface.
- Editor variables set by [appearance.js](appearance.js.md): `--editor-font`, `--editor-size`, `--editor-line-height`, `--editor-width`, with the document editor capped at that width and responsive padding under 640 px.
- Editor typography: H1–H7 headings, paragraphs, lists with their markers restored (also nested) and task lists, blockquotes, tables, images (block, never wider than the page), code block and inline code, links.
- Raw Markdown blocks: front matter, HTML blocks, footnote definitions and LaTeX blocks shown as monospaced raw text (`ow-raw-block`), and inline HTML tags as a small chip (`ow-html-inline`), so the source stays readable.
- Assistant edits to review: the new block highlighted in green (`ow-pending-new`), the finer marks on words (`ow-pending-added`, `ow-pending-touched`, `ow-pending-removed`, `ow-pending-same`), the widget with its bar and the Accept (green) and Reject (red) buttons.
- Other editor decorations: anchored notes (`.ow-note-comment` accented, `.ow-note-suggestion` amber wavy underline, `.ow-note-active`), bookmarks (`ow-bookmark-marker`, `ow-bookmark-range`, the flagged and active variants), footnote references, find matches (`.ow-find`, `.ow-find-current`), and the kept selection (`ow-selection-kept`).
- The source view: the monospaced text area with its line-number column (`source-wrap`, `source-lines`, `source-input`), and the stage of the image tab.

