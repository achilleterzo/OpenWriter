# aiTools.js

Source: [`src/lib/aiTools.js`](../../../src/lib/aiTools.js)

Renderer-side tool layer of the assistant: defines the tool catalog (names, descriptions, parameters) sent with chat requests and executes tool calls received from the model.

- Read tools: `list_directory`, `read_file`, `read editor content`, current document text, notes listing.
- Edit tools: editor insert and replace (with anchoring), note creation with suggestions, file creation, directory creation, file move and delete through workspace operations.
- Interactive tools: browser navigation and reading, screenshot and image reading, choice questions and questionnaires.
- Provides path helpers relative to the project root and errors for documents not open in a tab.