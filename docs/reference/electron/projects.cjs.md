# electron/projects.cjs

Source: [`electron/projects.cjs`](../../electron/projects.cjs)

Persistent list of recently opened projects, stored by the main process in the Electron user data directory as `projects.json`. Records each opened or created project, deduplicates entries case-insensitively, and supplies the list shown by the projects home panel.