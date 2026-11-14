# src/styles.css

Source: [`src/styles.css`](../../../src/styles.css)

Global stylesheet built on Tailwind CSS (base, components, utilities).

- Theme variables: the slate palette is defined as RGB triplets and inverted for `data-theme="light"`; `color-scheme` follows the theme.
- Accent variables (`--accent-300`…`--accent-600`) per accent (`ash`, `violet`, `cyan`, `emerald`, `rose`, `amber`), with darker variants in light theme; plus emerald, rose, amber and teal tokens used by the interface.
- Editor variables set by [appearance.js](appearance.js.md): `--editor-font`, `--editor-size`, `--editor-line-height`, `--editor-width`, with the document editor capped at that width and responsive padding under 640 px.
- Editor typography: H1–H7 headings, paragraphs, lists with their markers restored (also nested) and task lists, blockquotes, images (block, never wider than the page), code block and inline code, links.
- Tables (GFM): fixed layout, full width, bordered cells with a header row on the panel colour and paragraphs without bottom margin; a selected cell gets an accent overlay (`.selectedCell`).
- Footnotes: the reference in superscript in the accent colour (`.ow-footnote-ref`), and the definition as raw text with the syntax marks hidden, the label in superscript (`.ow-footnote-syntax`, `.ow-footnote-label`, `pre.ow-footnote-definition`).
- Formulae: shown as raw monospaced text on a panel background (`.ow-math`), since they are not drawn.
- GitHub alerts: a blockquote with `data-alert` gets a coloured left border, a tinted background and an uppercase label (Note, Tip, Important, Warning, Caution), each in its own colour.
- Horizontal rule: its own height with the line drawn by a pseudo-element, so it is visible in both themes, has room above and below and can be selected (accent line when selected).
- Pages view (`Visualizza → Pagine`, `:root[data-view='pages']`): A4 sheets on a work surface, with the print margins (20 mm), a shadow and a repeating background that draws the gap between one sheet and the next; a visual rendering only — the text still scrolls continuously.
- Raw Markdown blocks: front matter, HTML blocks, footnote definitions and LaTeX blocks shown as monospaced raw text (`ow-raw-block`), and inline HTML tags as a small chip (`ow-html-inline`), so the source stays readable.
- Assistant edits to review: the new block highlighted in green (`ow-pending-new`), the finer marks on words (`ow-pending-added`, `ow-pending-touched`, `ow-pending-removed`, `ow-pending-same`), the widget with its bar and the Accept (green) and Reject (red) buttons.
- Other editor decorations: anchored notes (`.ow-note-comment` accented, `.ow-note-suggestion` amber wavy underline, `.ow-note-active`), closed notes (`ow-note-done`, a light accent highlight with its active variant; also the selected card of the notes list, `.note-card-active`), bookmarks (`ow-bookmark-marker`, `ow-bookmark-range`, the flagged variants in amber and the active one), footnote references, find matches (`.ow-find`, `.ow-find-current`), and the kept selection (`ow-selection-kept`).
- The source view: the monospaced text area with its line-number column (`source-wrap`, `source-lines`, `source-line`, `source-line-number`, `source-line-text`, `source-input`, the gutter width in `--source-gutter`), and the search marks drawn behind the field (`source-mark`, `source-mark-current`); a plain reader without line numbers or separator is `.source-plain`. The stage of the image tab follows.
- Chat composer (`.chat-composer .tiptap`): the restricted Markdown of the message field, with the list markers restored by hand (Tailwind's reset removes them), compact paragraphs, inline code and links.
- Projects Home (`.home-dark`): the Home keeps a dark gradient background whatever the theme, re-declaring the dark palette and the accent (in its dark form) so bubbles, synapses, texts and panels stay readable; the graph labels (`.graph-label`, with its `data-active` and `data-muted` variants) follow the theme of the app through `--label-bg`, `--label-fg` and `--label-border` instead.

