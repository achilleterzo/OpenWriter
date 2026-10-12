# src/styles.css

Source: [`src/styles.css`](../../src/styles.css)

Global stylesheet built on Tailwind CSS (base, components, utilities).

- Theme variables: the slate palette is defined as RGB triplets and inverted for `data-theme="light"`; `color-scheme` follows the theme.
- Accent variables (`--accent-300`…`--accent-600`) per accent (`violet`, `cyan`, `emerald`, `rose`, `amber`), with darker variants in light theme; plus emerald, rose, amber, and teal tokens used by the interface.
- Editor variables set by `src/appearance.js`: `--editor-font`, `--editor-size`, `--editor-line-height`, `--editor-width`, with the document editor capped at that width and responsive padding under 640 px.
- Editor typography: H1–H7 headings, paragraphs, lists (accented markers), blockquote, code block and inline code, links.
- Editor decorations: anchored notes (`.ow-note-comment` accented, `.ow-note-suggestion` amber wavy underline, `.ow-note-active`) and find matches (`.ow-find`, `.ow-find-current`) rendered by the annotation and search extensions.

