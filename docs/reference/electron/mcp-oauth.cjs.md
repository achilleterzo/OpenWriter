# electron/mcp-oauth.cjs

Source: [`electron/mcp-oauth.cjs`](../../../electron/mcp-oauth.cjs)

OAuth sign-in for the MCP services that need it (for example Google Docs, `https://docsmcp.googleapis.com/mcp/v1`). The OAuth client (ID and secret) is created by the user with the service provider: Google does not register clients automatically.

- `discover(serverUrl)`: the authorization and token addresses, from the OAuth metadata of the protected resource (`/.well-known/oauth-protected-resource…`) and then of its authorization server (`oauth-authorization-server` or `openid-configuration`); nothing is hard-coded.
- `authorize({ serverUrl, clientId, clientSecret, scopes, openExternal })`: authorization code flow with PKCE (S256) and a `state`. It listens on `127.0.0.1` on a random port, opens the consent page in the browser (`access_type=offline` and `prompt=consent` are sent so Google gives a refresh token) and waits up to 3 minutes for the redirect, then exchanges the code. Returns `{ accessToken, refreshToken, expiresAt }`.
- `refresh({ serverUrl, clientId, clientSecret, refreshToken })`: a new access token; a refresh the service rejects (`invalid_grant`) carries `error.code`, meaning the sign-in expired or was revoked.

The secret and the tokens are kept encrypted by [mcp-servers-store.cjs](mcp-servers-store.cjs.md) (`getOauth`, `setOauth`); [mcp-service.cjs](mcp-service.cjs.md) renews the token before each request and exposes `signIn` / `signOut`. Tested against a fake provider in `tests/mcp-oauth.test.cjs`.
