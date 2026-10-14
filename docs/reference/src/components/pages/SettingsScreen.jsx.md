---

# SettingsScreen.jsx

Source: [`src/components/SettingsScreen.jsx`](../../../../../src/components/SettingsScreen.jsx)

Full-screen settings window: a vertical navigation (horizontal on narrow screens) and a scrollable panel, each section rendered by its own component.

- **General**: [GeneralSettings.jsx](GeneralSettings.jsx.md).
- **Project**: [ProjectSettings.jsx](ProjectSettings.jsx.md).
- **Appearance**: [AppearanceSettings.jsx](AppearanceSettings.jsx.md).
- **AI**: [AiProviderSettings.jsx](AiProviderSettings.jsx.md).
- **Quick actions**: [QuickActionsSettings.jsx](QuickActionsSettings.jsx.md).
- **Skills**: the global writing skill library, with an explanation and [SkillsManager.jsx](SkillsManager.jsx.md) in the `global` scope.
- **About**: [AboutSettings.jsx](AboutSettings.jsx.md).

The section can be chosen when the window opens. Escape closes it, and so does a click on the backdrop, but only when press and release both happen there (dragging a selection out of the panel must not close it).