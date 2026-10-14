# SkillsManager.jsx

Source: [`src/components/SkillsManager.jsx`](../../../../../src/components/SkillsManager.jsx)

Management UI for writing skills.

- Default export `SkillsManager({ scope, projectPath, onChanged })`:
  - `scope: 'global'` (Settings → Skills) lists the global library.
  - `scope: 'project'` (project and sub-project settings) lists every skill that is not shadowed, with a checkbox for the skills active by default. Skills activated by an enclosing project are shown as inherited.
  - "Import from a Markdown file…" reads a file through `skills.importFile` and opens it in the editor for review before saving.
  - It also creates, edits, deletes and copies skills between the project and the global library, opens the folder, and lists files that could not be read.
- `SkillEditor({ initial, targets, onSaved, onClose })`: modal editor for name, description, instructions, reference examples and quick actions. For a new skill, `targets` lists where it can be saved.
- `GenerateSkillDialog({ source, text, onGenerated, onClose })`: asks the active AI provider for a skill from a sample text or from a conversation, then hands the fields to the editor for review. Nothing is saved automatically.

The chat panel ([AiChatPanel.jsx](AiChatPanel.jsx.md)) reuses `SkillEditor` and `GenerateSkillDialog` for "Create a writing skill".
