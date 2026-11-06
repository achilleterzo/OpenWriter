---

# search-merge.cjs

Source: [`electron/search-merge.cjs`](../../../electron/search-merge.cjs)

Merges the searches of a question and of its synonyms (the Home search, `projects:search` in [main.cjs](main.cjs.md)). `mergeSearches(searches, { limit })` takes `[{ term, original, results }]` with the question first: a passage found by several terms appears once, with the term that values it most (on equal relevance the question wins), ordered by relevance; each result keeps `term`, the searched word that brought it. `cleanTerms(terms, query, max)` cleans the list sent by the interface: no duplicates, not the query itself (also with different accents), at most `max`.
