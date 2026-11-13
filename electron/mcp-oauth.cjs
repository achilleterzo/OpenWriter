/**
 * Accesso OAuth ai servizi MCP che lo richiedono (per esempio Google Docs): codice di autorizzazione con PKCE, risposta su un indirizzo locale
 * (127.0.0.1, porta a caso), rinnovo del token. Il client OAuth (ID e segreto) lo crea l'utente presso il servizio: Google non permette la registrazione automatica.
 * Gli indirizzi di autorizzazione e dei token si scoprono dal server (metadati OAuth), non sono scritti qui.
 */
const http = require('node:http')
const crypto = require('node:crypto')

const SIGN_IN_TIMEOUT_MS = 3 * 60 * 1000
const base64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function getJson(fetchImpl, url) {
  const answer = await fetchImpl(url, { headers: { Accept: 'application/json' } })
  if (!answer.ok) throw new Error(`HTTP ${answer.status}`)
  return answer.json()
}

/** Gli indirizzi OAuth di un server MCP: dai metadati della risorsa protetta e del server di autorizzazione. */
async function discover(serverUrl, fetchImpl = fetch) {
  const resource = new URL(serverUrl)
  let issuer = resource.origin
  try {
    const metadata = await getJson(fetchImpl, `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname === '/' ? '' : resource.pathname}`)
    if (Array.isArray(metadata.authorization_servers) && metadata.authorization_servers[0]) issuer = String(metadata.authorization_servers[0])
  } catch { /* senza metadati della risorsa il server di autorizzazione è lo stesso sito */ }
  issuer = issuer.replace(/\/+$/, '')
  for (const suffix of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration']) {
    try {
      const metadata = await getJson(fetchImpl, `${issuer}${suffix}`)
      if (metadata.authorization_endpoint && metadata.token_endpoint) return { authorizationEndpoint: String(metadata.authorization_endpoint), tokenEndpoint: String(metadata.token_endpoint) }
    } catch { /* si prova l'altro indirizzo */ }
  }
  throw new Error('This service does not describe how to sign in (no OAuth metadata found)')
}

async function tokenRequest(fetchImpl, tokenEndpoint, fields) {
  const answer = await fetchImpl(tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(fields).toString() })
  let body = {}
  try { body = await answer.json() } catch { /* corpo non JSON */ }
  if (!answer.ok || !body.access_token) {
    const error = new Error(`Sign-in failed: ${body.error_description || body.error || `HTTP ${answer.status}`}`)
    error.code = body.error
    throw error
  }
  return { accessToken: String(body.access_token), refreshToken: body.refresh_token ? String(body.refresh_token) : '', expiresAt: Date.now() + Math.max(60, Number(body.expires_in) || 3600) * 1000 }
}

/**
 * L'accesso completo: apre il browser sulla pagina di consenso e aspetta il ritorno su 127.0.0.1.
 * `openExternal(url)` apre l'indirizzo nel browser. → { accessToken, refreshToken, expiresAt }.
 */
async function authorize({ serverUrl, clientId, clientSecret = '', scopes = [], openExternal, fetchImpl = fetch, timeoutMs = SIGN_IN_TIMEOUT_MS }) {
  if (!clientId) throw new Error('Give the client ID of the OAuth client first')
  const { authorizationEndpoint, tokenEndpoint } = await discover(serverUrl, fetchImpl)
  const verifier = base64url(crypto.randomBytes(48))
  const state = base64url(crypto.randomBytes(16))

  let finish
  const waiting = new Promise((resolve, reject) => { finish = { resolve, reject } })
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.pathname !== '/callback') { response.writeHead(404).end(); return }
    const done = (status, text, outcome) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(text)
      outcome()
    }
    if (url.searchParams.get('state') !== state) return done(400, 'Invalid request.', () => {})
    if (url.searchParams.get('error')) return done(200, 'Sign-in was not completed. You can close this page.', () => finish.reject(new Error(`Sign-in was not completed: ${url.searchParams.get('error')}`)))
    const code = url.searchParams.get('code')
    if (!code) return done(400, 'Invalid request.', () => {})
    return done(200, 'Signed in. You can close this page and go back to OpenWriter.', () => finish.resolve(code))
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const redirectUri = `http://127.0.0.1:${server.address().port}/callback`
  let timer
  try {
    const consent = new URL(authorizationEndpoint)
    consent.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      code_challenge: base64url(crypto.createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
      // Google dà il token di rinnovo solo così; gli altri servizi ignorano questi due.
      access_type: 'offline',
      prompt: 'consent',
    }).toString()
    await openExternal(consent.toString())
    const code = await Promise.race([waiting, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Sign-in timed out')), timeoutMs) })])
    return await tokenRequest(fetchImpl, tokenEndpoint, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}), code_verifier: verifier })
  } finally {
    clearTimeout(timer)
    server.close()
    server.closeAllConnections?.()
  }
}

/** Un nuovo token di accesso dal token di rinnovo. Un rinnovo rifiutato (`invalid_grant`) ha `error.code`: l'accesso è scaduto o revocato. */
async function refresh({ serverUrl, clientId, clientSecret = '', refreshToken, fetchImpl = fetch }) {
  const { tokenEndpoint } = await discover(serverUrl, fetchImpl)
  const tokens = await tokenRequest(fetchImpl, tokenEndpoint, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}) })
  return { ...tokens, refreshToken: tokens.refreshToken || refreshToken }
}

module.exports = { discover, authorize, refresh }
