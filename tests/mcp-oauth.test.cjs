const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const oauth = require('../electron/mcp-oauth.cjs')
const { createMcpServersStore } = require('../electron/mcp-servers-store.cjs')

// Un servizio finto: metadati della risorsa e del server di autorizzazione, pagina di consenso (risponde subito con il codice) e token.
async function fakeProvider(context) {
  const seen = { authorize: null, token: [] }
  let revoked = false
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://x')
    const json = (value, status = 200) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value))
    const origin = `http://127.0.0.1:${server.address().port}`
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp/v1') return json({ authorization_servers: [`${origin}/`] })
    if (url.pathname === '/.well-known/openid-configuration') return json({ authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token` })
    if (url.pathname === '/authorize') {
      seen.authorize = Object.fromEntries(url.searchParams)
      return response.writeHead(302, { Location: `${url.searchParams.get('redirect_uri')}?code=the-code&state=${url.searchParams.get('state')}` }).end()
    }
    if (url.pathname === '/token') {
      let body = ''
      request.on('data', (chunk) => { body += chunk })
      request.on('end', () => {
        const fields = Object.fromEntries(new URLSearchParams(body))
        seen.token.push(fields)
        if (fields.grant_type === 'refresh_token' && revoked) return json({ error: 'invalid_grant' }, 400)
        if (fields.grant_type === 'authorization_code') return json({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 })
        return json({ access_token: 'access-2', expires_in: 3600 })
      })
      return undefined
    }
    return response.writeHead(404).end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => { server.close(); server.closeAllConnections?.() })
  return { url: `http://127.0.0.1:${server.address().port}/mcp/v1`, seen, revoke: () => { revoked = true } }
}

test('oauth: accesso con PKCE, ritorno su indirizzo locale, rinnovo del token e rinnovo rifiutato', async (context) => {
  const provider = await fakeProvider(context)
  const tokens = await oauth.authorize({
    serverUrl: provider.url,
    clientId: 'client-1',
    clientSecret: 'secret-1',
    scopes: ['docs.read', 'drive.read'],
    // Il "browser": apre la pagina di consenso e segue il ritorno su 127.0.0.1.
    openExternal: (url) => { fetch(url).catch(() => {}) },
  })
  assert.equal(tokens.accessToken, 'access-1')
  assert.equal(tokens.refreshToken, 'refresh-1')
  assert.ok(tokens.expiresAt > Date.now())
  assert.equal(provider.seen.authorize.code_challenge_method, 'S256')
  assert.equal(provider.seen.authorize.scope, 'docs.read drive.read')
  assert.match(provider.seen.authorize.redirect_uri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/)
  const exchange = provider.seen.token[0]
  assert.equal(exchange.code, 'the-code')
  assert.equal(exchange.client_secret, 'secret-1')
  assert.ok(exchange.code_verifier.length >= 43, 'il verificatore PKCE parte dal client')

  const renewed = await oauth.refresh({ serverUrl: provider.url, clientId: 'client-1', clientSecret: 'secret-1', refreshToken: 'refresh-1' })
  assert.equal(renewed.accessToken, 'access-2')
  assert.equal(renewed.refreshToken, 'refresh-1', 'se il servizio non ne dà uno nuovo resta il vecchio')

  provider.revoke()
  await assert.rejects(oauth.refresh({ serverUrl: provider.url, clientId: 'client-1', refreshToken: 'refresh-1' }), (error) => error.code === 'invalid_grant')
})

test('oauth: senza ID del client non si parte, e un consenso negato è un errore', async (context) => {
  const provider = await fakeProvider(context)
  await assert.rejects(oauth.authorize({ serverUrl: provider.url, clientId: '', openExternal() {} }), /client ID/)
  await assert.rejects(oauth.authorize({ serverUrl: provider.url, clientId: 'c', timeoutMs: 200, openExternal() {} }), /timed out/)
})

test('oauth: nell\'archivio il segreto e i token sono cifrati; finché non si accede il server risulta senza credenziali', () => {
  const secrets = { available: () => true, encrypt: (text) => Buffer.from(text, 'utf8').reverse().toString('base64'), decrypt: (value) => Buffer.from(value, 'base64').reverse().toString('utf8') }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-oauth-'))
  const store = createMcpServersStore({ directory: root, secrets })
  const saved = store.save({ server: { name: 'Docs', type: 'http', url: 'https://docsmcp.googleapis.com/mcp/v1', auth: 'oauth', clientId: 'abc.apps.example', scopes: ['s1', 's1', 's2'] }, credentials: { oauth: { clientSecret: 'shh-secret' } } })
  assert.deepEqual(saved.scopes, ['s1', 's2'])
  assert.equal(saved.signedIn, false)
  assert.equal(saved.hasClientSecret, true)
  assert.equal(saved.missingCredentials, true)
  store.setOauth(saved.id, { accessToken: 'tok-a', refreshToken: 'tok-r', expiresAt: Date.now() + 1000 })
  const listed = store.list(null).global[0]
  assert.equal(listed.signedIn, true)
  assert.equal(listed.missingCredentials, false)
  assert.ok(!fs.readFileSync(path.join(root, 'mcp-secrets.json'), 'utf8').match(/shh-secret|tok-r|tok-a/), 'nel file non c\'è nulla in chiaro')
  assert.ok(!fs.readFileSync(path.join(root, 'mcp-servers.json'), 'utf8').match(/shh-secret|tok-r/), 'nemmeno nella configurazione')
  // Esce: i token vanno, il segreto del client resta.
  store.setOauth(saved.id, null)
  assert.equal(store.list(null).global[0].signedIn, false)
  assert.equal(store.list(null).global[0].hasClientSecret, true)
  // Un altro client OAuth invalida i token di prima.
  store.setOauth(saved.id, { refreshToken: 'tok-r2' })
  store.save({ server: { ...saved, clientId: 'other' } })
  assert.equal(store.list(null).global[0].signedIn, false)
})
