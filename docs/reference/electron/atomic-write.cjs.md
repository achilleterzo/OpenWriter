# electron/atomic-write.cjs

Source: [`electron/atomic-write.cjs`](../../electron/atomic-write.cjs)

`writeFileAtomic(file, content)`: the content goes first to `<file>.tmp` and then replaces the file, so a crash halfway does not leave a truncated file. It is the write used by the stores in `.ow`.

On Windows renaming over an existing file can fail (`EPERM`, `EBUSY`, `EACCES`) while another process holds it open — antivirus, the search indexer, a cloud sync client, a development server watching the files. Those errors are retried with growing pauses (20, 40, 80, 160, 320 ms, through `Atomics.wait`, which blocks synchronously); if the rename is still blocked, the last resort is writing in place, which is not atomic but does not lose the work.
