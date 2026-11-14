# electron/instance-registry.cjs

Source: [`electron/instance-registry.cjs`](../../../electron/instance-registry.cjs)

Which project each window (each instance of the app) has open. Every instance writes a small `<pid>.json` file in the `instances` folder of the app's data, holding `{ pid, project }`. It is there for two reasons: two windows must not work on the same project (they would trip over each other's session, history and index), and when that is asked for, the window that already has the project is brought to the front.

- `createInstanceRegistry({ directory, samePath, pid, alive })` returns `{ others, register, holder, requestFocus, watchFocus, unregister }`.
- `others()` reads the folder and returns the live instances as `[{ pid, project }]`: the files of processes that no longer exist (`isAlive` from [primary-instance.cjs](primary-instance.cjs.md)) are ignored and deleted, together with their focus file, and a file that is being written or is unreadable is skipped for now.
- `register(project)` writes this instance's file (`null` means no project); `unregister()` removes it and its focus file.
- `holder(project)` is the other instance that has that project open, compared with `samePath`, or `null`. The caller then asks it to come forward instead of opening a second window on the same folder.
- `requestFocus(target)` writes `<pid>.focus` for that instance; the target reads it in `watchFocus(onFocus, intervalMs = 800)`, which polls (the timer does not keep the process alive), deletes the file and calls `onFocus()`, so the window comes to the front from inside itself. `watchFocus` returns the function that stops watching.
