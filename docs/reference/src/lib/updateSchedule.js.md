# updateSchedule.js

Source: [`src/lib/updateSchedule.js`](../../../src/lib/updateSchedule.js)

When the application checks by itself whether a new version exists (GitHub, silently: it warns only when it finds one). The preference is saved through [preferences.js](preferences.js.md) under `openwriter.updateCheck`.

- The schedules are `never` (only on request), `startup` (at startup, the earlier behaviour), and then at startup and at intervals while the application stays open: `1h`, `6h`, `1d`, `1w`. The default is `startup` (`DEFAULT_UPDATE_SCHEDULE`).
- `getUpdateSchedule()` and `scheduleOf(value)`: the current choice and its entry (`{ value, label, interval }`, in milliseconds; 0 means no repeating check).
- `setUpdateSchedule(value)`: changes it, saving it and notifying the subscribers; an unknown value is ignored.
- `subscribeUpdateSchedule(listener)`: listens for changes.
