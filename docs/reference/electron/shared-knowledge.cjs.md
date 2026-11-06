---

# electron/shared-knowledge.cjs

Source: [`electron/shared-knowledge.cjs`](../../../electron/shared-knowledge.cjs)

One body of knowledge across projects: the relevance search of a project also sees the user's **other projects** (the ones in OpenWriter's project list), except those that opted out. Every other project is shown to the assistant as `@name/…`, read-only, exactly like a reference folder ([project-references.cjs](project-references.cjs.md)); reference folders stay for folders that are not projects. All projects already live in the same `knowledge.db`, each under its own key, so sharing only decides which keys are searched together.

`sharedProjects({ current, projects, references, isShared })` returns `[{ name, path }]`: every project of the list that exists and for which `isShared(path)` is true (the project file says the index and `options.sharedKnowledge` are both on), except the open project, projects that contain it or sit inside it (the same file would be indexed and found twice) and projects already linked as a reference folder. The short name comes from the folder name (`cleanName`) and is unique against the reference names and the other projects (`b`, `b-2`, ...). An error reading one project's settings leaves only that project out.

In `main.cjs`: `sharedFolders()` and `outsideFolders()` (references plus other projects) feed `tools:search-knowledge`, the `@name/…` resolution for the read tools (`outsideRoot`), the root listing (shown as "another project of the user") and the vectors to compute. Other projects are re-scanned when a project opens (at most every two minutes each) and are not watched: a file changed by another program in a project that is not open appears at the next scan. Turning the index or the sharing off in a project removes it from everyone's searches. `outsideFolders({ current, references, projects, isShared })` returns the available reference folders plus the shared projects (`project: true`): the app and the MCP server both use it, so they search and read the same things. The MCP server reads `projects.json` of the data folder and the project settings itself ([mcp-server.cjs](mcp-server.cjs.md)). Tests: [tests/shared-knowledge.test.cjs](../../../tests/shared-knowledge.test.cjs) and [tests/mcp-outside.test.cjs](../../../tests/mcp-outside.test.cjs) (the real MCP server over stdio on fake data).

**Saved web pages as `@web`**: `outsideFolders` takes `webFolderOf` ([web-references.cjs](web-references.cjs.md)) and adds the folder of the pages saved in the project (`@web`) and, after each shared project, its own (`@<project>-web`), unless the name is already taken (a linked reference folder wins). They are indexed, read and searched exactly like reference folders.

The search of the Home does not use the sharing filter: `outsideFor(null, { everything: true })` in [main.cjs](main.cjs.md) passes `searchIndexEnabled` instead of `sharedKnowledgeEnabled` as `isShared`, so every project with an index is searched (sharing keeps limiting what the assistant of another project sees).

The alias `web` is reserved (it is the open project's saved pages): no other project takes it, it gets `web-2` and so on.
