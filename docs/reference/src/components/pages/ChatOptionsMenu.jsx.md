# ChatOptionsMenu.jsx

Source: [`src/components/ChatOptionsMenu.jsx`](../../../../../src/components/ChatOptionsMenu.jsx)

A three-dot button with the options of the chat (reasoning effort, temperature, the approve-each-edit switch), in a dropdown that opens above the button. It is a container: the controls themselves arrive as `children`, from [ChatComposer.jsx](ChatComposer.jsx.md) or [AiChatPanel.jsx](AiChatPanel.jsx.md).

- Props: `children`, rendered inside the dropdown only while it is open.
- The button is 26 px high, the height of the model dropdown alone, so that the taller controls beside it centre on it; it carries `aria-label` and `title` "Chat options", `aria-haspopup="dialog"` and `aria-expanded`.
- Opening and closing: a click toggles it; a `mousedown` outside the component closes it; `Escape` closes it and, if the focus was inside, gives the focus back to the button (and consumes the key). The listeners on `document` exist only while the menu is open.
- The dropdown is a `role="dialog"` panel, 64 units wide (never beyond the viewport minus 2rem), anchored `bottom-full right-0` with a small gap.
