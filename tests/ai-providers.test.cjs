const test = require('node:test')
const assert = require('node:assert/strict')
const { claudeIsolationArgs } = require('../electron/ai-providers.cjs')

test('ai-providers: Claude parte senza i server MCP e senza le skill dell\'utente', () => {
  const args = claudeIsolationArgs('C:/dati/claude-empty-mcp.json')
  assert.ok(args.includes('--strict-mcp-config'), 'solo i server della configurazione data, cioè nessuno')
  assert.equal(args[args.indexOf('--mcp-config') + 1], 'C:/dati/claude-empty-mcp.json')
  assert.ok(args.includes('--disable-slash-commands'))
})
