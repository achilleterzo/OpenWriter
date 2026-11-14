# ServicesSettings.jsx

Source: [`src/components/ServicesSettings.jsx`](../../../../../src/components/ServicesSettings.jsx)

The external services (MCP servers) the assistant can use, in two places: the **Services** section of the general settings ([SettingsScreen.jsx](SettingsScreen.jsx.md), no `project` prop: the services of the computer) and the **Services** tab of the project settings ([ProjectSettings.jsx](ProjectSettings.jsx.md), `project` = the folder: which of the computer's services the project uses, and the ones it defines itself). Unlike the rest of the project settings, everything here is saved at once, through `window.electronAPI.mcp` ([mcp-service.cjs](../../../electron/mcp-service.cjs.md), [mcp-servers-store.cjs](../../../electron/mcp-servers-store.cjs.md)).

- A service card shows its name, whether it is a program or a web address, the command or address in full, how many tools are on, and "credentials missing on this computer" when it applies. Buttons: Test, Edit, Remove (a service inherited from a parent project can only be tested).
- **Test** starts the service (or connects) and lists its tools; each one has a switch (none is on at the start: the assistant only sees the ones switched on) and a label saying whether it only reads or may change things and asks first.
- A project service that the user has not confirmed shows a warning with the command (or address) and the button "I trust it: allow"; the Test button is hidden until then, and the confirmation is asked again if the command, arguments, address or credential names change.
- The form: name, type (program with command and arguments one per line, or web address), environment variables or headers (the values are password fields, stored encrypted on this computer; an existing value is not shown and an empty field keeps it) and "Ask before every call, even for tools that only read".
- A web address can use **OAuth sign-in** instead of fixed headers: client ID, client secret (stored encrypted, an empty field keeps it) and scopes. The card then shows "Signed in" / "Not signed in" with Sign in (opens the browser), Sign in again and Sign out; Test appears once signed in.
- In the project tab, a switch on each service of the computer says whether the project uses it.
