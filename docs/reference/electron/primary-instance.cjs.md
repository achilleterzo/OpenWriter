# electron/primary-instance.cjs

Source: [`electron/primary-instance.cjs`](../../../electron/primary-instance.cjs)

The "primary instance" lock. More windows of the app (several processes, see "Open in a new window") share everything except what cannot exist twice: the bridge and the HTTP server the MCP agents connect to. One instance serves them, the primary one, and it is whoever holds a lock file (`primary-instance.lock` in the app's data, with its pid).

- `createPrimaryLock({ file, onAcquire, onRelease, intervalMs = 2500, pid, alive })` returns `{ start, release, check, isPrimary }`.
- The lock is taken by creating the file exclusively (`wx`), so two instances starting together cannot both get it. If the file already exists, its owner is read: a live owner keeps it and nothing happens; a file that cannot be read, or whose pid no longer exists, is abandoned and removed, and the acquisition is tried once more.
- `start()` checks once and then every `intervalMs` (the timer does not keep the process alive), and returns whether this instance is primary. `check()` is the same pass on its own.
- Losing the role is noticed too: while primary, if the file no longer says our pid, the role is dropped and `onRelease()` runs (the MCP bridge and the HTTP server are stopped).
- `release()` clears the timer, removes the file when it is ours and runs `onRelease()` if the role was held.
- `onAcquire()` runs at every handover, the first start included: that is where the bridge and the HTTP server are started again, so the agents lose the connection for a few seconds and the new instance rewrites the file with the port and the token.
- `isAlive(pid)` is exported as well: it sends signal 0 and counts `EPERM` as alive, since a process of another user still exists.
