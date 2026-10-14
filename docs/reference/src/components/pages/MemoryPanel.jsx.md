# MemoryPanel.jsx

Source: [`src/components/MemoryPanel.jsx`](../../../../../src/components/MemoryPanel.jsx)

Project memory panel: the lasting entries saved by the assistant or by the user, in `.ow/memory.json` (see [memory-store.cjs](../../../electron/memory-store.cjs.md)).

At the top a text field adds an entry written by the user, linked to the document open in the editor (shown next to the field); the field is disabled without a project. The list, newest first, shows each entry's author (a robot for the assistant, a person for the user), the date and time of the last change, the sub-project it comes from when it is not the open project, the optional title, and the text — editable in place, with Save and Cancel (Escape cancels) — together with the linked files as chips that open the document, with a button to add the active document or remove a link, and one to delete the entry. Errors are reported in the panel and in the status bar.