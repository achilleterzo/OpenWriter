# src/main.jsx

Source: [`src/main.jsx`](../../src/main.jsx)

React entry point: under StrictMode it mounts `App` into the `#root` container. Imports `app.js`, `appearance.js`, and `styles.css`, and calls `initLanguage` before rendering so the document language and main-process locale match the saved preference.