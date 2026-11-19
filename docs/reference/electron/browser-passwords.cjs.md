# electron/browser-passwords.cjs

Source: [`electron/browser-passwords.cjs`](../../../electron/browser-passwords.cjs)

The passwords of the sites of the internal browser. They are stored encrypted (Electron `safeStorage`) in `browser-passwords.json` in the app data, never in a project, and tied to the **origin** of the site (`https://site.com`; plain `http` only for the computer itself). The file also keeps the sites for which the user chose "Never".

- `createPasswordStore({ directory, secrets })`: `list()` / `listFor(origin)` (site and user only), `find(origin, username)` and `get(id)` (with the password: only for comparing and filling), `save`, `remove`, `clear`, `isNever` / `neverList` / `addNever` / `removeNever`. Without system encryption nothing is saved (never in clear text).
- `CAPTURE_SCRIPT`: runs in the page in an **isolated JavaScript world** (the scripts of the site cannot see or call it). It notices the submission of a form with a password field (submit, click on a button, Enter) and writes a console line that starts with a marker; `parseCapture` recognises it.
- `fillScript({ username, password })`: fills the user and password fields of the page, firing the `input` and `change` events.

The wiring is in [main.cjs](main.cjs.md) (`watchPasswordForms`, the `browser-passwords:*` handlers): the offer to save goes to the interface **without the password**, which stays in the main process until the user answers; filling is allowed only on a page of the same origin as the saved password. The assistant has no tool that reads or fills passwords. Tested in `tests/browser-passwords.test.cjs`.
