---

# GeneralSettings.jsx

Source: [`src/components/GeneralSettings.jsx`](../../../../../src/components/GeneralSettings.jsx)

Settings screen section with three blocks.

- **Language**: the interface language (automatic, following the system, or one of the supported ones). Changing it reloads the window while tabs and drafts are kept.
- **Project**: the project folder as the working directory, shown as a path, with the button that opens or changes it through the folder chooser; each project remembers its own open tabs and drafts.
- **Spell checker**: the languages used to underline mistakes in the editor and in the chat, through [SpellcheckLanguages.jsx](SpellcheckLanguages.jsx.md), with the global list and the note that a project can choose others in Settings → Project and that dictionaries are downloaded on first use.

