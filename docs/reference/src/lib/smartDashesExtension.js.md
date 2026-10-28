# smartDashesExtension.js

Source: [`src/lib/smartDashesExtension.js`](../../../../src/lib/smartDashesExtension.js)

Typographic rules applied while typing in the visual editor (not in the source view): `--` becomes the en dash «–», `–-` (a third dash) the em dash «—», and `...` the true ellipsis «…».

Three things are deliberately not converted:

- dashes at the start of a line, because `---` has to create a horizontal rule;
- anything inside code, inline or in a block, where dashes must stay as they were;
- a `---` typed after another dash is not read as the start of a line.

Right after a conversion, Backspace returns to the typed dashes, as with the other Tiptap input rules. Each rule is an `InputRule` that checks the position with `inCode` before replacing.