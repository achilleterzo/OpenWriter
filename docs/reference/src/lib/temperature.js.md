# src/lib/temperature.js

Source: [`src/lib/temperature.js`](../../../../src/lib/temperature.js)

The renderer side of the temperature: a level from 0 to 1, the same for every provider, shown in the settings and in the chat as a word plus the number. The maxima and the bands must stay aligned with [electron/temperature.cjs](../../../../electron/temperature.cjs.md), which converts the level into the degrees of the provider.

- Constants: `TEMPERATURE_MIN` (0), `TEMPERATURE_MAX` (1), `TEMPERATURE_STEP` (0.02).
- `PROVIDER_MAX` (private): `ollama: 4`, `ollama-cloud: 2`, `openrouter: 2`, `gemini: 2`.
- `BAND_LIMITS` (private): `[0.2, 0.4, 0.6, 0.8]`, the upper limit of each band, in the order of the labels.
- `temperatureLabel(value)`: the name of the band the level falls in — Precise (below 0.2), Careful (below 0.4), Balanced (below 0.6), Creative (below 0.8), Wild (0.8 and above). The labels go through `t()`, so they follow the interface language.
- `formatTemperature(value)`: `"<label> · <value with two decimals>"`, the form shown in the interface.
- `levelOf(provider, degrees)`: a general provider temperature, given in the degrees of that provider, expressed as a level (divided by `PROVIDER_MAX`, clamped 0–1, two decimals); `''` when `degrees` is `''`, null or not a number, and for the providers without a range (the CLIs).
- `firstLevel(...levels)`: the first level that is not `''` and not null — `0` is a valid level — or `''` when none is; it resolves the chain conversation → project → provider.

