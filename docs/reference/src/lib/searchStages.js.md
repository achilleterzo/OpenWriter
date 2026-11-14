# searchStages.js

Source: [`src/lib/searchStages.js`](../../../src/lib/searchStages.js)

Rules for the stages of a search that arrives little by little (the Home search, see `projects:search` in [main.cjs](../../electron/main.cjs.md)). A stage can hold less than what is already on the list: the search by words alone does not have the passages found through synonyms or meaning, and replacing the list with it would make them vanish and come back.

- `hitKey(hit)` identifies a passage: project, file and start line.
- `keepsHits(shown, next)` is `true` when every passage shown is still in `next` (which may add others and reorder them), or when nothing is shown yet. A stage is applied only then; the final answer always replaces the list.
