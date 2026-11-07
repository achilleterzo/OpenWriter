---

# FirstRunModelsDialog.jsx

Source: [`src/components/FirstRunModelsDialog.jsx`](../../../../../src/components/FirstRunModelsDialog.jsx)

The first-configuration window: it explains the search by meaning (a model that runs on this computer, no text leaves it) and shows the same choice as Settings → Local models (`SemanticModelPicker` of [LocalModelsSettings.jsx](LocalModelsSettings.jsx.md)): use it or not, CPU or graphics card, download. One button, "Done", closes it (also Esc); closing changes nothing by itself.

[App.jsx](../../App.jsx.md) opens it once the app is ready, if the preference `openwriter.localModelsIntro` is not set and no model pack is installed (and the model has not been turned off); in every case the preference is set to `done`, so it is never offered again. It can always be reviewed in Settings → Local models.
