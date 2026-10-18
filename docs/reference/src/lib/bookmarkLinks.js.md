# bookmarkLinks.js

Source: [`src/lib/bookmarkLinks.js`](../../../src/lib/bookmarkLinks.js)

Links to bookmarks: `file.md#name`, or `#name` inside the same document. The fragment names a bookmark of the document; when there is none, it falls back to a heading with that name, as on GitHub (lower case, words joined by hyphens).

- `headingSlug(text)`: the fragment GitHub derives from a heading — lower case, punctuation removed, spaces turned into hyphens.
- `findFragmentTarget(editor, bookmarks, fragment)`: where the fragment leads in an editor, `{ from, to, kind }` with `kind` `bookmark` or `heading`, or `null`. Both names are compared without accents and without case, so a link keeps working when the reader's keyboard renders it differently.
- `relativeLink(fromFile, toFile)`: the relative path for a link between two documents, (`D:/p/a/one.md`, `D:/p/b/two.md`) → `../b/two.md`, comparing folders without case.
