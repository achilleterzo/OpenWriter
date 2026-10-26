# electron/skills-store.cjs

Source: [`electron/skills-store.cjs`](../../../electron/skills-store.cjs)

Writing skills: reusable packs of style, tone of voice and rules given to the assistant. Each skill is one Markdown file, editable by hand.

## Locations

```text
<userData>/skills/<id>.md          global library, shared by every project
<project>/.ow/skills/<id>.md       skills of a project (or sub-project)
```

The id is the file name without `.md`: lowercase letters, digits and hyphens, at most 60 characters. When the same id exists in several places, the `.ow` nearest to the document wins, then the enclosing projects, then the global library; the others are returned with `shadowed: true`.

## File format

```markdown
---
name: Journalistic tone
description: Short sentences, strong lead, no jargon
---
## Instructions
Free text: style, tone, rules, glossary…

## Examples
A passage in the target style.

---

Another passage.

## Actions
- **Rewrite as news**: Rewrite the selected text applying this skill.
```

- The frontmatter is flat `key: value` lines; only `name` and `description` are read.
- Sections are recognised by their `##` heading (English or Italian names: Instructions/Istruzioni, Examples/Esempi, Actions/Azioni). Without headings the whole body is the instructions; unknown `##` headings stay inside the current section.
- Examples are separated by a line containing only `---`. Actions are `- **Label**: prompt` lines, at most 6.
- A skill needs instructions or at least one example; it is capped at 20,000 characters.

## Operations

- `list(chain)`: every skill visible from a chain of projects (`[{ base, name }]`, outermost first), as `{ skills, problems }`. Unreadable files or invalid names are reported in `problems` and never hide the other skills. At most 100 files per folder.
- `get({ scope, base, id })`: one skill with its raw `markdown` and parsed fields.
- `save({ scope, base, id?, markdown })`: without `id` creates a new skill whose id comes from the name (made unique in the folder); with `id` overwrites it. Writes are atomic.
- `remove({ scope, base, id })`, `openFolder(scope, base)`, `parse(markdown)`.
- `skillFromMarkdown(markdown, fileName)` (module export): parses an imported file; without a `name` in the frontmatter it uses a leading `# Title` or the file name. Throws when the file exceeds `MAX_SKILL_CHARS` (20,000, also exported) or has neither instructions nor examples.

`scope` is `global` or `project`; for `project`, `base` is the project folder and must contain `.ow`.

## Activation

Skills active by default are stored per project in `project.json` → `skills.active` (see [project-file.cjs](project-file.cjs.md)); along a context chain they add up. A conversation can add or remove skills through `skillOverrides` (see [chat-store.cjs](chat-store.cjs.md)). The main process exposes the store through the `skills:*` IPC channels; `skills:list` also returns the chain and the default active ids.