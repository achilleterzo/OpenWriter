---

# search-merge.cjs

Source: [`electron/search-merge.cjs`](../../../electron/search-merge.cjs)

Merges the searches of a question and of its synonyms (the Home search, `projects:search` in [main.cjs](main.cjs.md)). `mergeSearches(searches, { limit })` takes `[{ term, original, results }]` with the question first: a passage found by several terms appears once, with the term that values it most (on equal relevance the question wins), ordered by relevance; each result keeps `term`, the searched word that brought it. A passage found through a synonym (not `original`) has its relevance multiplied by `RELATED_WEIGHT` (0.8), and on equal relevance the question wins, then the order in which the searches arrived. 

`cleanTerms(terms, query, max)` cleans the list sent by the interface: no duplicates, not the query itself (also with different accents), at most `max` (8 by default), whitespace collapsed and each term cut at 60 characters.

`markTerms(snippet, query)` marks the words of the question in an excerpt with `«…»`: it does nothing when the excerpt already has marks (a passage found by meaning has none), ignores accents and capitals, counts a searched word also at the beginning of a word (as the search by words does) and only words of 3 letters or more.