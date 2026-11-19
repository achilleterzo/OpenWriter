# src/lib/providerIcon.js

Source: [`src/lib/providerIcon.js`](../../../../src/lib/providerIcon.js)

The custom icon of an AI provider. `imageToIcon(file, size = 64)` reads an image chosen by the user (any browser-readable format, SVG included), scales it to fit a square of `size` pixels keeping its proportions on a transparent background, and returns it as a PNG data URL, so that it takes a few KB in the settings and an SVG can never reach them. It rejects when the file is not an image or cannot be decoded. Used by [AiProviderSettings.jsx](../components/pages/AiProviderSettings.jsx.md).
