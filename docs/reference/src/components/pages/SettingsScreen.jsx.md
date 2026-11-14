# SettingsScreen.jsx

Source: [`src/components/SettingsScreen.jsx`](../../../../../src/components/SettingsScreen.jsx)

The settings of the application, in the shared frame ([SettingsShell.jsx](SettingsShell.jsx.md)), each section rendered by its own component. The first six tabs are the ones a project has too, with the choices that only concern that project in [ProjectSettings.jsx](ProjectSettings.jsx.md); the rest is only here. The settings of a project are no longer a tab of this window: they open from the Project menu, the file explorer header and the project lists.

- **General**: [GeneralSettings.jsx](GeneralSettings.jsx.md).
- **Appearance**: [AppearanceSettings.jsx](AppearanceSettings.jsx.md).
- **AI**: [AiProviderSettings.jsx](AiProviderSettings.jsx.md).
- **Quick actions**: [QuickActionsSettings.jsx](QuickActionsSettings.jsx.md) (the general ones only).
- **Skills**: the global writing skill library, with an explanation and [SkillsManager.jsx](SkillsManager.jsx.md) in the `global` scope.
- **Services**: [ServicesSettings.jsx](ServicesSettings.jsx.md), the external services (MCP servers) of the computer.
- **Associations**: [AssociationSettings.jsx](AssociationSettings.jsx.md).
- **Local models**: [LocalModelsSettings.jsx](LocalModelsSettings.jsx.md).
- **Agents (MCP)**: [McpSettings.jsx](McpSettings.jsx.md).
- **About**: [AboutSettings.jsx](AboutSettings.jsx.md).

The section can be chosen when the window opens (an unknown one falls back to General).
