---

# synonymCache.js

Source: [`src/lib/synonymCache.js`](../../../../src/lib/synonymCache.js)

Cache of the synonyms asked to the language model for the Home search ([queryExpansion.js](queryExpansion.js.md)): the same word, with the same model, is not asked twice, also between sessions. `createSynonymCache({ read, write, now, ttlMs, max })` keeps a JSON text (in the app preferences, `openwriter.synonymCache`) with, per key, the terms, when they were written and when they were last used: `get(key)` returns the terms (and marks them as used) or null, `set(key, terms)` stores them, entries expire after 30 days and at most 300 are kept (the least recently used leave first). An empty answer is not stored (it could have been a failure) and a broken text starts again from zero. `synonymKey(query, modelId)` is the model (another model gives other synonyms) plus the query without capitals, accents and double spaces.
