# src/lib/skills.js

Source: [`src/lib/skills.js`](../../../../src/lib/skills.js)

Renderer helpers for writing skills (the parser lives in [skills-store.cjs](../../electron/skills-store.cjs.md)).

- `serializeSkill(fields)`: editor fields → `.md` file with frontmatter; empty sections are omitted.
- `activeSkillIds(defaults, overrides, available)`: skills active in a conversation = project defaults ∪ `overrides.add` − `overrides.remove`, keeping only skills that still exist and are not shadowed.
- `skillsPromptText(skills)`: the "Writing skills" block of the system prompt (instructions and examples of each active skill, capped at 30,000 characters). Later skills prevail on conflicts.
- `skillGenerationMessages({ source, text, language, hint })`: messages that ask the model to write a skill from a sample text (`source: 'text'`, it describes the style, not the content) or from a conversation transcript (`source: 'conversation'`, it turns the writer's preferences into general rules).
- `cleanGeneratedSkill(reply)`: strips visible reasoning, code fences and any preamble from the model reply.
