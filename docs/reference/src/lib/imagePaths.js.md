# imagePaths.js

Source: [`src/lib/imagePaths.js`](../../../src/lib/imagePaths.js)

Resolves image paths found in a document: relative image references are turned into `ow-file://` URLs served in read-only mode by the main process, so images inside the project render without copying files.