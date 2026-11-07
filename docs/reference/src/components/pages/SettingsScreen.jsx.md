# SettingsScreen.jsx

Source: [`src/components/SettingsScreen.jsx`](../../../../../src/components/SettingsScreen.jsx)

Full-screen settings window: a vertical navigation (horizontal on narrow screens) and a scrollable panel, each section rendered by its own component.

- **General**: [GeneralSettings.jsx](GeneralSettings.jsx.md).
- **Project**: [ProjectSettings.jsx](ProjectSettings.jsx.md).
- **Appearance**: [AppearanceSettings.jsx](AppearanceSettings.jsx.md).
- **AI**: [AiProviderSettings.jsx](AiProviderSettings.jsx.md).
- **Local models**: [LocalModelsSettings.jsx](LocalModelsSettings.jsx.md).
- **Quick actions**: [QuickActionsSettings.jsx](QuickActionsSettings.jsx.md).
- **Skills**: the global writing skill library, with an explanation and [SkillsManager.jsx](SkillsManager.jsx.md) in the `global` scope.
- **Agents (MCP)**: [McpSettings.jsx](McpSettings.jsx.md).
- **About**: [AboutSettings.jsx](AboutSettings.jsx.md).

The section can be chosen when the window opens. Escape closes it, and so does a click on the backdrop, but only when press and release both happen there (dragging a selection out of the panel must not close it).
The settings window is larger too (up to 6xl wide and 900 px high, within the window): several tabs hold a lot of data.

The header has, at the right, the place for the actions of the current section ([SettingsActions.jsx](SettingsActions.jsx.md)): the project tab puts "Save settings" there.
