# ModelPicker.jsx

Source: [`src/components/ModelPicker.jsx`](../../../../../src/components/ModelPicker.jsx)

Model selector used in the AI settings ([AiProviderSettings.jsx](AiProviderSettings.jsx.md)) and in the chat composer ([AiChatPanel.jsx](AiChatPanel.jsx.md)). A button opens a popover with a search field (every word must appear in the model id) and a filter by accepted input: all, text only, images, PDF, each with its count. What each model accepts comes from `ai.listModelInputs`, requested on the first opening and cached per provider and endpoint for the session; models with unknown capabilities appear only under "All". Rows show an image or PDF icon for the inputs the model reads. Keyboard: arrows to move, Enter to choose, Escape to close.
