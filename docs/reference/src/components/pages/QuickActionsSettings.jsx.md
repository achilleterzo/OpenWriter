---

# QuickActionsSettings.jsx

Source: [`src/components/QuickActionsSettings.jsx`](../../../../../src/components/QuickActionsSettings.jsx)

Settings section for the chat quick actions, built on [quickActions.js](../../lib/quickActions.js.md). With a project open, two tabs — **General** (the actions of the whole application) and **This project** — switch between the two lists; without a project only the general ones are shown.

**General.** The list shows the actions in their order, each with its label, a "Modified" badge, its prompt as a subtitle, the arrows to move it, Edit, and a restore or remove button; a default action can be restored but not removed, a user action can be removed.

`ActionDialog` edits one action (label and prompt, both required, capped by `MAX_QUICK_LABEL` and `MAX_QUICK_PROMPT`), with "Reset to default" for a default action. "Add action" creates a user action (up to `MAX_CUSTOM_QUICK_ACTIONS`), and "Reset all to default" asks for confirmation and clears every change. 

Each change is saved at once, storing only the entries that differ from the defaults (a `null` value when everything is back to default); saving errors are shown below the list.

**This project.** The actions that appear only in the open project, before the general ones (to extract documentation from the source code, to check a document against the code…). Same list and dialog (up to `MAX_PROJECT_QUICK_ACTIONS`), saved in `project.json` through `setProjectQuickActions` ([project-file.cjs.md](../../../../electron/project-file.cjs.md)), each save writing the whole `{ actions, general }` object. 

A "Also show the general actions" checkbox decides whether the general ones follow them in the chat, and the project actions are removed with the X (they are not defaults, so there is nothing to restore).

**Import from another project** (`ImportFromProject`): the panel asks the other projects of the list (the open one excluded, missing ones left out) through `listProjects`, reads the quick actions of the chosen one with `getProjectSettingsFor` and offers them as ticked checkboxes, with label and prompt; an action already present here with the same label and prompt is marked "already here" and is not preselected. "Import selected" copies them with a new id (`newProjectActionId`), at most as many as the room left (`MAX_PROJECT_QUICK_ACTIONS`), and warns when the selection exceeds it. A project with no actions of its own says so, and with no other project the panel says there are none.

