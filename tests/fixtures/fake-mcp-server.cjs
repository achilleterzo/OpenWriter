// Server MCP di prova (stdio) per i test del client: tre strumenti, uno di sola lettura, uno che scrive, uno che sbaglia.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')

const server = new McpServer({ name: 'fake', version: '1.0.0' })
server.registerTool('echo', { description: 'Returns the text', inputSchema: { text: z.string() }, annotations: { readOnlyHint: true } }, async ({ text }) => ({ content: [{ type: 'text', text: `echo: ${text}` }] }))
server.registerTool('env', { description: 'Returns the value of FAKE_TOKEN', inputSchema: {}, annotations: { readOnlyHint: true } }, async () => ({ content: [{ type: 'text', text: String(process.env.FAKE_TOKEN || '') }] }))
server.registerTool('write', { description: 'Pretends to write', inputSchema: { value: z.string() } }, async ({ value }) => ({ content: [{ type: 'text', text: `wrote ${value}` }] }))
server.registerTool('big', { description: 'A very long answer', inputSchema: {}, annotations: { readOnlyHint: true } }, async () => ({ content: [{ type: 'text', text: 'x'.repeat(50000) }] }))
server.registerTool('fail', { description: 'Always fails', inputSchema: {}, annotations: { readOnlyHint: true } }, async () => ({ isError: true, content: [{ type: 'text', text: 'something went wrong' }] }))

server.connect(new StdioServerTransport())
