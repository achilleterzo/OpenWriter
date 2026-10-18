# Dialogs.jsx

Source: [`src/components/Dialogs.jsx`](../../../../../src/components/Dialogs.jsx)

Internal dialog window for confirmations and text requests, used instead of `window.confirm` and `window.prompt`: in Electron `prompt` does not exist and `confirm` leaves the window with a broken focus (fields and selects cannot be selected).

- `DialogProvider`: wraps the application and renders the open dialog. It returns the focus to the element that opened it when the dialog closes, and it also answers the confirmations asked by the main process (deleting, moving…): they come through `onDialogAsk` with a message, an optional detail, a confirm label and the danger flag, and the answer goes back with `answerDialog`.
- `useDialogs()`: the API of the current provider:
  - `confirm(message, options)`: a yes/no confirmation, resolving to a boolean; `danger` colors the confirm button red, `confirmLabel` replaces "OK", and `detail` adds a second, smaller line under the message.
  - `choose(message, choices)`: a choice among several buttons, resolving to the chosen `value` or `null` when cancelled; each choice can be `primary` or `danger`.
  - `prompt(message, initial, options)`: a single-line text request, resolving to the text or `null`.

`DialogBox` is the shared window: a form with the message and the optional detail, an input for `prompt`, and the buttons. Escape or a click on the backdrop cancels (resolving to `false`, or `null` for `prompt` and `choose`).