---

# queryExpansion.js

Source: [`src/lib/queryExpansion.js`](../../../../src/lib/queryExpansion.js)

Synonyms for a search, asked to the language model configured in the app (like an agent that thinks of other words before searching). `expansionMessages(query)` builds the request: the model sees only the searched word or phrase, never the documents, and must reply with a JSON array of at most 8 synonyms, near-synonyms and related terms in the language of the query (plus at most two English equivalents). `parseExpansion(reply, query)` reads the answer: a JSON list (also inside text or a code block, `<think>` parts removed) or one term per line or separated by commas, with bullets or numbers; it drops duplicates, the query itself and anything that looks like a sentence. Used by [ProjectsHome.jsx](../components/pages/ProjectsHome.jsx.md).
