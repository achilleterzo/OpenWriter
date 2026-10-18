# electron/project-pack.cjs

Source: [`electron/project-pack.cjs`](../../electron/project-pack.cjs)

The shareable configuration of a project: everything in `.ow` that defines *how the work is done* in the project, in a single JSON file that can be passed to other people.

The pack holds the assistant context (`context.md`) and the other instruction files (`.md` in the root of `.ow`), the writing skills of the project (`.ow/skills/<id>.md`), and the settings: reply and document language, automatic versions, spell-check languages, editor font and the skills active by default (`FORMAT` = `openwriter-project-setup`, version 1). History, conversations, notes, memory, links, references, icon and project name stay out: they are work or identity, not method.

- `buildPack({ settings, directory, appVersion })`: the pack for a project, with limits of 5 MB for the file, 20,000 characters per text and 50 items.
- `parsePack(source)`: reads and checks a file, returning the cleaned pack or a readable error (not a setup file, too large, from a newer version). Names and identifiers are validated so that nothing can be written outside the expected files.
- `summarize(pack)`: the summary shown before importing (date, app, context length, instruction files, skills).
- `applyPack({ pack, file, directory, mode, overwrite, applySettings })`: applies the configuration. The context replaces the current one or is appended (`mode`), instruction files and skills are written only when they do not exist yet (unless `overwrite`), and with `applySettings` the settings are adopted too; the project name is always kept. It returns how much was written and skipped.
