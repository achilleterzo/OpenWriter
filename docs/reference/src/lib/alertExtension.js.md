# alertExtension.js

Source: [`src/lib/alertExtension.js`](../../../../src/lib/alertExtension.js)

GitHub alerts: a blockquote whose first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` (`ALERT_TYPES`). In the editor it is a blockquote with a coloured label; in the file it keeps the GitHub form. Without this extension the `[!NOTE]` was written as `\[!NOTE\]` and the alert stopped working.

`AlertBlockquote` extends Tiptap's blockquote with an `alert` attribute (`data-alert` in the HTML). Reading, the tokenizer detects the marker on the first paragraph, removes those characters from its inline tokens and creates the same blockquote with `alert` set; writing, it puts `> [!TYPE]` back as the first line and prefixes every line of the content with `>`, separating the blocks with a bare `>`. An alert with no text (a single empty paragraph) is not written.

When the marker cannot be removed safely from the inline tokens, the blockquote is left as a plain one, so no text is lost.