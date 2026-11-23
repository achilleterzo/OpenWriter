# electron/unicode-text.cjs

Source: [`electron/unicode-text.cjs`](../../../electron/unicode-text.cjs)

Plain text "formatted" with look-alike Unicode characters (the technique of the online social-media text formatters: 𝗯𝗼𝗹𝗱, 𝘪𝘵𝘢𝘭𝘪𝘤, 𝚖𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎…), and the conversion in both directions with Markdown. Pure functions, no Electron; the text reader uses them through IPC (see below). It reuses the Markdown lexer of [markdown-tokens.cjs](markdown-tokens.cjs.md), so what counts as code, a list or a quote is decided as the editor decides it.

## Functions

- `stylize(text, style, { accents })`: the text in a style of `STYLES` (an identifier, or a list: one style plus the decorations `'underline'` and `'strike'`, which add a combining mark after every non-space character). Spaces, punctuation, symbols, emoji and other alphabets have no variants and stay as they are. `accents`: `'combine'` (the default of the functions) styles the base letter and leaves it the combining accent (è → 𝗲 + accent), which many programs draw badly (Windows Notepad shows the accent detached or as an empty box); `'keep'` leaves accented letters unstyled — the choice the text reader makes by default (its IPC calls default to `'keep'`). An unknown style throws.
- `applyStyle(text, style, { accents })`: a style applied to a text that may already have one, like the bold button of an editor. An alphabet style **replaces** the one that is there (bold over italic gives bold, with no reset needed) and, when all the text already has that style, **removes** it; underline and strikethrough **add** to the style and are removed when they are already on all the text. Accents and decorations already present stay, and what the new style does not have (digits in italic, capitals in small capitals) goes back to normal. This is what the menu of the text reader calls (`stylize` is the plain function that styles normal letters).
- `unstyle(text)`: every styled letter or digit back to the normal one, decorations removed, accents recomposed.
- `analyze(text)`: the units (character, normal letter, style, decorations, accents) and the list of styles found.
- `markdownToText(markdown, { family, links, accents })` → `{ text, lost, kept }`. `family`: `'sans'` (default, 𝗯𝗼𝗹𝗱 and 𝘪𝘵𝘢𝘭𝘪𝘤 without serifs) or `'serif'`; `links`: `'inline'` (default, `text (address)`) or `'text'`.
- `textToMarkdown(text, { escape, unmapped, hardBreaks })` → `{ markdown, lost, kept }`. `escape` (default true) protects the normal text so that `* _ \` [ < ~`, a leading `# - +` or `===` do not turn into formatting; with `false`, text that already follows Markdown conventions keeps them. `unmapped`: `'keep'` (default) leaves the styles that have no Markdown mark as they were, `'plain'` turns them into normal letters. `hardBreaks`: `'spaces'` (default) or `'backslash'`, how a line break inside a paragraph is kept.
- `lost` and `kept` say what the conversion could not carry (identifiers such as `table`, `image`, `heading-level`, `code-language`, `style-unavailable`, `indentation`) and what was left as it was (`style:script`…).
- `styleMenu()`: the styles as the text reader offers them — `{ id, label, group, marks }`, the most used first (`STYLE_GROUPS.common`: bold, italic and bold italic without serifs, monospace, underline, strikethrough; then `other`) — which includes the two decorations. The tests check that every alphabet is in it once and that every entry works.
- `STYLES`: the alphabets (id, label, and the Markdown mark the style stands for, if any). `COVERAGE`: the table below as data, so that an interface can tell the user in advance what passes; the tests check it against the functions.

## The styles

Bold, italic and bold italic (serif and sans-serif), monospace, script and bold script, fraktur and bold fraktur, double-struck, circled, fullwidth, small capitals, squared and negative squared (capitals only), plus sans-serif plain. Letters that the Unicode blocks do not contain (ℎ, ℬ, ℰ, ℭ, ℝ…) are taken from where Unicode put them; digits missing from italic styles stay normal, and bold italic uses the digits of bold. Small capitals have two letters that Unicode does have but that almost no font draws (the small capital S and F, U+A731 and U+A730, in Latin Extended-D: on a computer with about a hundred fonts only three had them, and they show as an empty box even where the text is typed): the `s` is left as it is (at that height it is the same shape) and the `f` becomes `F`, so that small capitals never produce those characters; the two real letters are still read as `s` and `f`. The `q` uses `ǫ` (q with an ogonek, the usual stand-in) and the `x` has no small capital. Every table is checked in the tests against the Unicode compatibility normalisation, which brings each character back to the plain letter. Each styled character belongs to one style only (the module refuses to load otherwise).

## What passes (`COVERAGE`)

| Markdown | Text | Comes back |
|---|---|---|
| `**x**`, `*x*`, `***x***` | bold, italic, bold italic (sans or serif; both families are read) | yes |
| `` `x` `` | monospace | yes (one line) |
| `~~x~~`, `<u>x</u>` | combining strikethrough and underline | yes |
| `è à ü ñ` | styled base letter + combining accent | yes (some fonts draw the accent badly) |
| `- x`, nested | `• x`, `◦`, `▪` | yes |
| `1. x`, `> x`, `---` | `1. x`, `> x`, `──────────` | yes |
| `- [ ] x`, `- [x] x` | `☐ x`, `☑ x` | yes |
| code block | monospace lines, no fence | two or more lines yes; the language is lost; one line comes back as inline code |
| `# Title` | bold line | no: the heading level is lost |
| `[x](url)` | `x (url)` | no: it becomes text |
| `![x](url)`, tables, HTML | alt text / rows with ` \| ` / dropped | no |
| footnotes, formulas | raw text | they no longer behave as such |
| bold or italic on CJK, Cyrillic, Greek, ß æ ø ł… | unchanged | no: no variant exists (reported as `style-unavailable`) |
| script, fraktur, double-struck, circled, fullwidth, small caps, squared | those characters | no Markdown mark: kept as they are going to Markdown |

Punctuation has no variants either: a comma or a full stop at the edge of a styled stretch comes back outside it (`**Ciao, mondo!**` → `**Ciao, mondo**!`, the same appearance), and two bold words separated by a space come back as one stretch.

## Reading a styled text

A normal accented letter next to a styled letter of the same word (`perché` with the `é` normal) belongs to the stretch and takes its style, also through several accented letters in a row; one separated by spaces (`ciao è bello`) is a normal word, and a word of only accented letters has no letter that can carry a style.

Consecutive characters of the same style form a stretch, which continues across spaces, digits and punctuation (they have no variants) but not across normal letters or a line break; styles with the same Markdown marks (bold with and without serifs) are one stretch. Overlapping marks are nested without crossing: the longest stretch opens first, so an underline inside a bold stays inside it. Spaces at the edges of a stretch go outside the delimiters, and a space not covered by a mark closes it. A block of code is two or more lines written entirely in monospace, plus the lines of only punctuation (`}`, a fence) that follow them. A run of at least four spaces outside a list is stripped so that it does not become an indented code block.

## Limits to tell the user

They are mathematical letters, not formatting (on a typical Windows computer only Cambria Math, and a few fonts that do not ship with the system, have the letters of the styles; the classic Notepad does not fall back to another font, so with Consolas it shows empty boxes while browsers and editors with font fallback show the letters): screen readers read them badly, text search does not find them, a font without the glyphs shows empty boxes, and which platforms accept them (and with which fonts) has to be tried case by case.
