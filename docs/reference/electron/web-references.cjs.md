---

# electron/web-references.cjs

Source: [`electron/web-references.cjs`](../../../electron/web-references.cjs)

Web references of the project: web pages that the user (the star of the browser tab), the assistant or an external agent (MCP) add to the context, each with a **copy in Markdown**, so they stay readable offline and the assistant can read and search them. They live inside `.ow`: `.ow/web.json` (`[{ id, url, title, siteName, savedAt, updatedAt, checkedAt, source, hash, file }]`, written atomically) and `.ow/web/<title-slug>-<id>.md`. The copy is produced in the interface ([webReferences.js](../../src/lib/webReferences.js.md): the page is read like the reading view does, so with its scripts run; when no article can be extracted, the plain text of the page) and stored here **with a header**.

**Header** (YAML between two `---` lines, not indexed: the chunker skips it, see [knowledge-index.cjs](knowledge-index.cjs.md)): `url`, `title`, `site`, `saved` (first time), `updated` (last time the content changed), `checked` (last verification against the live page), `saved_by` (`user`, `assistant` or `agent`) and `content_hash` (a hash of the text, ignoring spaces). Whoever reads the file knows where it comes from and how old it is, and can decide to refresh it. The address kept is the one the user visited without `#anchor` and tracking parameters.

- `createWebReferencesStore({ getProjectPath })`: `list()` (most recent first; each entry also has the absolute `path` and `exists`), `find(url)`, `resolve(reference)` (an id, a file name, also `@web/…`, an address or part of the title), `save(...)`, `remove(id)`, `folder()`.
  - `save({ url, title, markdown, siteName, source, checkOnly })` saves a new page or **refreshes** the one with the same normalized address (`normalizeUrl`: only http and https; no `#anchor`, no tracking parameters such as `utm_*` or `fbclid`, host in lower case, parameters sorted, no trailing `/`; the same page never duplicates). The answer carries `change`: `created`; `unchanged` (same text: only `checked` moves); `updated` (new text, `updated` moves, `saved` and the file stay); `changed` (only with `checkOnly`: the live page differs, nothing is rewritten except `checked`); and `diff { added, removed }`, the lines that appear only in the new text and those that disappeared. The first one who saved a page stays `saved_by`. At most 300 pages and 1.5 million characters per copy.
  - `remove(id)` deletes the copy; removing the last one also removes `.ow/web`.
- `webFolderOf(directory)`: `.ow/web` of a project if it holds at least one Markdown copy, otherwise `null`.

**`@web`**: for search and reading the folder `.ow/web` is an automatic **reference folder** named `@web` (see [shared-knowledge.cjs](shared-knowledge.cjs.md)): the passages are indexed under their own key and found by `search_knowledge` as `@web/<file>.md` (also by meaning), the assistant reads them with `read_file`, the MCP server with `read_document`, and the root listing shows them as "saved web pages". The pages saved in the other projects that share their knowledge appear as `@<project>-web`. A reference folder that the user linked with the name `web` has precedence. The assistant gets the list of saved pages (title, address, `@web/…` path, saved and last checked dates, who saved it), up to 30, in the conversation, like the project memory.

**Freshness**: the assistant (`refresh_web_reference`, `save_web_reference`) and the MCP server (`list_web_references`, `refresh_web_reference`, `save_web_reference`) can compare the dates with today, verify a page against the live one (`check_only`) and update the copy, and save pages that they find important for the work.

In `main.cjs`: the IPC `webrefs:list`, `webrefs:find`, `webrefs:save` (with `source` and `checkOnly`), `webrefs:remove` (preload `webRefs`); saving or removing re-aligns the index at once (`webReferencesChanged`: starts watching the folder, scans it or clears it, recomputes the vectors; the vectors of unchanged passages are reused).

Tests: [tests/web-references.test.cjs](../../../tests/web-references.test.cjs).
