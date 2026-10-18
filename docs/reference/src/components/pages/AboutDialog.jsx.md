---
# AboutDialog.jsx

Source: [`src/components/AboutDialog.jsx`](../../../../../src/components/AboutDialog.jsx)

The "About OpenWriter" dialog: the app icon, the name, the current version, and a one-line description.

Its lower part handles updates: when a new release is known it shows "Update available: v{version}" with a button opening the download page (`openRelease`); otherwise a "Check for updates" button runs the check and reports "You are up to date." or a failure. A further button opens the project on GitHub. `checkOnOpen` runs the check as soon as the dialog appears. Escape closes it, as does a click on the backdrop.

