---

# quickActions.js

Source: [`src/lib/quickActions.js`](../../../../src/lib/quickActions.js)

The chat quick actions (the pills above the message box). The default actions have a fixed id (`proofread`, `rewrite`, `summarize`, `lengthen`, `review`) and cannot be deleted, only edited and restored. Settings store only what the user changed (order, edited texts, own actions), so an untouched text follows the interface language and the application updates; `settings.quickActions` absent means all defaults.

- `resolveQuickActions(entries)`: the actions to show, in the chosen order, as `[{ id, label, prompt, isDefault, modified }]`. Unknown ids are dropped unless they carry a label and a prompt, and a missing default is appended at the end.
- `toEntry(action)`: the entry to save; for a default action only the texts that differ from the original are kept.
- `defaultTextOf(id)`: the original `{ label, prompt }` of a default action, or `null` for a user action.
- `quickActionsOf(settings)`: the resolved actions of a settings object.
- `newCustomId()`: the id of a new user action.
- Limits: `MAX_CUSTOM_QUICK_ACTIONS` (12), `MAX_QUICK_LABEL` (40), `MAX_QUICK_PROMPT` (2000).

