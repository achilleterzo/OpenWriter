# electron/pdf-import.cjs

Source: [`electron/pdf-import.cjs`](../../electron/pdf-import.cjs)

Reads a PDF and returns its text with a marker where each image stood, in the reading order of the page, plus the images as PNG.

- `parsePdf(buffer)`: `{ text, images }`, where `images[i]` corresponds to the marker `MARKER(i)` (`\u0001IMG<i>\u0001`). The text of each page is rebuilt from the positioned text items, inserting a line break when the vertical position changes, and each image marker is placed at the right height of the page. Small marks (rules, dots, one-pixel backgrounds) are ignored (`MIN_SIDE` = 24 px) and at most 300 images are collected.
- JPEG images are taken as they are: pdf.js decodes them through `new Image()`, which does not exist in Node, so a minimal shim (alive only for the duration of the read) preserves the original `data:` source.
- Other images (grey 1-bit, RGB, RGBA) are encoded as PNG by `encodePng`, with a hand-written zlib/PNG writer (CRC32, `IHDR`, `IDAT`, `IEND`).
- Fonts cannot be mounted without a DOM, so `disableFontFace` is set: the text is extracted anyway, and only the images matter here.

The main process puts the images back where the markers were, embedded as `data:`, so that on save they become files in `images/` ([document-images.cjs](document-images.cjs.md)).
