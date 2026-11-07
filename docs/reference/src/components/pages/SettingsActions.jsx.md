---

# SettingsActions.jsx

Source: [`src/components/SettingsActions.jsx`](../../../../../src/components/SettingsActions.jsx)

The actions of a settings section (for example "Save settings") live at the right of the settings window header, always in view. [SettingsScreen.jsx](SettingsScreen.jsx.md) provides the place (`SettingsActionsContext`, an element of its header); a section brings its actions there with `<SettingsHeaderActions fallback={…}>…</SettingsHeaderActions>`, which renders the children in that element through a portal, or the `fallback` when there is no settings window around (for example in the window of a single project). Any other tab that needs a save button, or other actions, reuses it the same way.
