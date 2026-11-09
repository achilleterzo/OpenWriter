# Knowledge: search, sharing, saved pages

The local index, the search by meaning and its models, sharing between projects, and saved web pages.

[Back to the technical documentation](../README.md) · [Back to the README](../../README.md)

## Search by meaning and local models

OpenWriter keeps, for every project with the search index on, a derived index of its documents in the application data (`knowledge.db`: full-text search plus, optionally, vectors). It is only a copy: the files are the truth, and it is rebuilt if it is damaged.

Search by meaning needs a model that runs on your computer, `multilingual-e5-small`, which is **not** shipped with the application and is downloaded only when you click the button (Settings → Local models, or the first-run window that offers it once):

- **CPU pack** (about 150 MB): works everywhere.
- **Graphics card pack** (about 280 MB, experimental): much faster, needs WebGPU, and runs in a hidden window of the application.

Each pack lives in the application data (never in a project), has pinned sizes and checksums, and can be removed at any time; each has its own vectors, so switching computes only what is missing. Without a pack everything works as before, by words. The vectors are computed in the background without blocking the interface, and no text leaves the computer.

## Sharing knowledge between projects

Two switches in each project's settings decide what the others see:

- **Search index.** Off, and the project is not indexed at all: it is in no search.
- **Share its knowledge.** On by default. It decides only what *other* projects, their assistants, and external agents can find: they see the passages of the projects that share, as `@name/…` read-only folders, exactly like a reference folder. A project that does not share still has its index, and **your own search in the Home covers it** (marked "Not shared"); only the assistants and agents of other projects do not see it.

Reference folders (folders that are not projects) can also be linked and searched. The Home graph connects the projects that share; one that does not share floats without synapses.

## Saved web pages

The star of the browser tab saves the page into the project as a Markdown copy (`.ow/web/…`, indexed in `.ow/web.json`) with a header that says where it comes from and how old it is. The pages are `@web/…` for the assistant and for agents, are searched with the rest of the knowledge, and can be refreshed: a refresh says whether the page is unchanged, changed (and updates the copy, or only checks), and the pages of shared projects are searchable as `@project-web`. Saved pages are read with the page's scripts run, as you see it.
