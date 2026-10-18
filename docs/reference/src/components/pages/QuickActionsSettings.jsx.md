---
# QuickActionsSettings.jsx

Source: [`src/components/QuickActionsSettings.jsx`](../../../../../src/components/QuickActionsSettings.jsx)

Settings section for the chat quick actions, built on [quickActions.js](../../lib/quickActions.js.md). The list shows the actions in their order, each with its label, a "Modified" badge, its prompt as a subtitle, the arrows to move it, Edit, and a restore or remove button; a default action can be restored but not removed, a user action can be removed.

`ActionDialog` edits one action (label and prompt, both required, capped by `MAX_QUICK_LABEL` and `MAX_QUICK_PROMPT`), with "Reset to default" for a default action. "Add action" creates a user action (up to `MAX_CUSTOM_QUICK_ACTIONS`), and "Reset all to default" asks for confirmation and clears every change. Each change is saved at once, storing only the entries that differ from the defaults (a `null` value when everything is back to default); saving errors are shown below the list.

