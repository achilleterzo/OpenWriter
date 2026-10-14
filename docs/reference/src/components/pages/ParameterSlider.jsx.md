---
# ParameterSlider.jsx

Source: [`src/components/ParameterSlider.jsx`](../../../../../src/components/ParameterSlider.jsx)

A numeric model parameter as a slider, used in the AI settings.

An empty value (`''`) means "model default": the slider stays dimmed until it is moved, the header shows "Default", and a Reset button (`onChange('')`) brings it back to that state. With `stops` (values growing exponentially, such as token or context sizes) the slider moves between fixed steps and the position is the nearest one in logarithmic distance; without it, the slider moves between `min` and `max` and the value is rounded to two decimals. The value is formatted through `format`.

The module also exports `InfoTip`, the small (i) icon showing an explanation on hover or keyboard focus, to be placed inside a `relative` container.

