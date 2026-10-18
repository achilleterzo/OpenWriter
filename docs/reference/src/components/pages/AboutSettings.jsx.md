# AboutSettings.jsx

Source: [`src/components/AboutSettings.jsx`](../../../../../src/components/AboutSettings.jsx)

The About section of the settings screen: the app icon with the name and the current version, the one-line description, and an Updates block with the same manual check as [AboutDialog.jsx](AboutDialog.jsx.md) (update available with a button opening the download page, otherwise "Check for updates" with the result).

It also holds the automatic check schedule — never, at startup, every hour, every 6 hours, every day or every week — saved through [updateSchedule.js](../../lib/updateSchedule.js.md); the check is silent and only reports a new version, since the application never updates by itself. Below, the button opening the project on GitHub, and at the bottom, right-aligned, the developer and the licence.