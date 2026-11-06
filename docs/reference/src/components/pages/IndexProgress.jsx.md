---

# IndexProgress.jsx

Source: [`src/components/IndexProgress.jsx`](../../../../../src/components/IndexProgress.jsx)

The progress bar of the search index in the status bar at the bottom of the window, on the right, before the last status message. It polls `getIndexActivity` every 2 s for the open project and shows nothing when there is nothing to do. While the files are being scanned or updated it shows "Updating the index…" with an indeterminate bar (it takes little); while the vectors of the search by meaning are being computed it shows the percentage and a bar (it can take minutes: the tooltip says "n of m"). The data comes from the IPC `knowledge:activity` of the main process.
