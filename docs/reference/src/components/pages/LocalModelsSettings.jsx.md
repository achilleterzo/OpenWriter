---

# LocalModelsSettings.jsx

Source: [`src/components/LocalModelsSettings.jsx`](../../../../../src/components/LocalModelsSettings.jsx)

Settings section for the models that run on this computer: downloaded once, kept in the app data (never in a project) and used by a project only if it asks for them in its own settings. Each model is a card in the `models` list (a new model, for vision, images or audio, is a new entry with the same card): name, description, state, a progress bar while downloading, the **Use this model** switch, and the **Download** / **Remove** buttons.

For now the only model is the one of the search by meaning (see [semantic-pack.cjs](../../../electron/semantic-pack.cjs.md)): `getSemanticStatus` (polled every 4 s, every second while downloading), `installSemanticPack` (nothing is downloaded unless the user clicks), `removeSemanticPack` (removes the model and its vectors) and `setSemanticEnabled`, the global switch: off, no project uses the model and nothing is computed even if it is installed (preference `openwriter.localModels.embeddings`, handled by the main process). The per-project checkbox stays in [ProjectSettings.jsx](ProjectSettings.jsx.md), where a note says when the model is turned off here.
