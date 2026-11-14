# The application and the system

File associations, the browser tab and reader view, updates and reliability.

[Back to the technical documentation](../README.md) · [Back to the README](../../README.md)

## Operating system integration

Settings → Associations connects OpenWriter with the operating system, in the way each platform allows:

- **Windows:** offers OpenWriter in "Open with" for `.md`, `.markdown`, and `.mdown` through the user's registry (no administrator rights; Windows does not allow an app to make itself the default, so the page opens the default apps settings and tells you whether OpenWriter is already the default), and adds "Open as OpenWriter project" to the folder menu of File Explorer.
- **Linux:** makes OpenWriter the default app for `text/markdown` with `xdg-mime` (it needs the launcher file of the installed package) and adds the folder entry for Nautilus and Dolphin.
- **macOS:** the document types are declared in the application, so "Open with" works; the default app is chosen in the Finder (Get Info → Open with → Change All…), and the system does not allow an app to add a Finder menu entry.

Nothing is registered in the development version, and where something is not possible the page says why. A folder passed to the application (the file manager entry, the command line, a second launch) opens as a project.

## Several windows

"Open project in a new window" (File menu, the menu of a project in the Projects tab and in the Home) starts another window of the application on the project you choose, to work on two projects side by side. A project is open in one window at a time: asking for it in another window brings the window that has it to the front. The same goes for a folder opened from the file manager. The windows share the settings, the browser session and the bubble layout of the Home; the agent servers (MCP, stdio bridge and HTTP) are run by one window only, and when that window is closed another one takes them over by itself.

## Browser and reader view

A browser tab lets you search and read web pages without leaving the application, and the assistant can read it when web browsing is enabled. The reading view extracts the article from a page and shows it in a clean layout, with adjustable text size and a light or dark theme. The article can be saved as Markdown, with its title and source, into the project. A screenshot of the content of a tab can be saved in the project's `screenshots` folder. Each project keeps its own history of the addresses you visited, offered as suggestions while you type in the address bar (the assistant's browsing is recorded apart, and available to it through a tool). Tabs and logins survive a restart, and the open pages come back where they were.

## Updates and reliability

The application can check for a new version at a schedule you choose in Settings → About (never by itself replacing anything: you are only notified). Sessions and the data in `.ow` (settings, notes, bookmarks, memory, links) are written atomically, so an interruption never leaves a truncated file. If the interface stops responding, the reason is recorded in `crash.log` in the application data, the window is reloaded, and an oversized unsaved draft that kept the startup from completing is set aside in `recovered-drafts` instead of being lost.
