# electron/images.cjs

Source: [`electron/images.cjs`](../../../electron/images.cjs)

Image helper for the assistant conversations. Exposed functions: `fetchImage`, `prepareImage`, `prepareBuffer`, `assertPublicUrl`, `isPrivateAddress`, `MAX_DOWNLOAD_BYTES`.

- `fetchImage(url)`: downloads an http(s) image or decodes a `data:` URL (SVG rejected), then returns a normalized payload `{ mime, data (base64), width, height }`. Max 8 MB (also per redirect hop), 15 s timeout, at most 3 redirects; the content type must be `image/*`.
- SSRF protection: `assertPublicUrl` resolves the host through DNS and rejects addresses that are loopback, private, link-local, CGNAT, or local IPv6 (validated at every redirect, so DNS-based bypasses do not work).
- `prepareImage` (used by `prepareBuffer` for project images and downloads) resizes images with the longest side above 1568 px and re-encodes as PNG, falling back to JPEG (quality 85) when the PNG exceeds 1.5 MB — formats accepted by all vision models.

