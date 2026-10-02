import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeContext, type AssistantMessageEvent, type Context } from '@earendil-works/pi-ai'
import { resolveConfig } from '../src/config.ts'
import { resolveModel } from '../src/catalog.ts'
import { discoverAnyRouterModels } from '../src/discovery.ts'
import { isLoopbackHost, normalizeProxyURL, redactProxyURL } from '../src/proxy.ts'
import { disposeProxyAgents, proxyFetch } from '../src/proxy-transport.ts'
import { createClaudeCodeStreams } from '../src/transports/claude.ts'
import { createCodexResponsesStreams } from '../src/transports/codex.ts'

interface LocalEndpoint {
  port: number
  seen: string[]
  close(): Promise<void>
}

/**
 * A real HTTP proxy on a real socket.
 *
 * Plain requests are answered here with a model listing, so a test can tell
 * "went through the proxy" from "reached the origin" by looking at what each
 * side recorded. A CONNECT is recorded and then refused: the point of that case
 * is only to observe that an `https:` target was tunnelled to the proxy rather
 * than dialled directly, which a recorded CONNECT proves on its own.
 */
function startProxy(): Promise<LocalEndpoint> {
  const seen: string[] = []
  const server = createServer((request, response) => {
    seen.push(`${request.method ?? 'GET'} ${request.url ?? ''}`)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ object: 'list', data: [{ id: 'claude-opus-5', name: 'From proxy' }] }))
  })
  server.on('connect', (request, socket) => {
    seen.push(`CONNECT ${request.url ?? ''}`)
    socket.destroy()
  })
  return listen(server, seen)
}

/** A direct origin: answering here means the proxy was NOT used. */
function startOrigin(): Promise<LocalEndpoint> {
  const seen: string[] = []
  const server = createServer((request, response) => {
    seen.push(`${request.method ?? 'GET'} ${request.url ?? ''}`)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ object: 'list', data: [{ id: 'claude-opus-5', name: 'Direct' }] }))
  })
  return listen(server, seen)
}

function listen(server: Server, seen: string[]): Promise<LocalEndpoint> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      resolve({
        port,
        seen,
        close: () => new Promise<void>((done, fail) => {
          server.closeAllConnections?.()
          server.close(error => (error === undefined ? done() : fail(error)))
        }),
      })
    })
  })
}

async function collect(stream: AsyncIterable<AssistantMessageEvent>): Promise<AssistantMessageEvent[]> {
  const events: AssistantMessageEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

/** The smallest Anthropic SSE stream that completes a message. */
function claudeSse(): string {
  const events: [string, unknown][] = [
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }],
    ['message_stop', { type: 'message_stop' }],
  ]
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
}

afterEach(async () => {
  await disposeProxyAgents()
})

describe('proxy setting validation', () => {
  it('treats an absent or blank value as a direct connection', () => {
    expect(normalizeProxyURL(undefined)).toBeUndefined()
    expect(normalizeProxyURL('')).toBeUndefined()
    expect(normalizeProxyURL('   ')).toBeUndefined()
  })

  it('canonicalizes an http or https proxy and keeps its credentials', () => {
    expect(normalizeProxyURL('http://127.0.0.1:7890')).toBe('http://127.0.0.1:7890')
    expect(normalizeProxyURL('  http://127.0.0.1:7890/  ')).toBe('http://127.0.0.1:7890')
    expect(normalizeProxyURL('https://proxy.example:8443')).toBe('https://proxy.example:8443')
    // User information is legitimate here — a proxy URL carries the tunnel's
    // credential, unlike the endpoint setting which refuses it.
    expect(normalizeProxyURL('http://user:secret@127.0.0.1:7890')).toBe('http://user:secret@127.0.0.1:7890')
  })

  it('names SOCKS as unsupported rather than reporting it as malformed', () => {
    for (const value of ['socks5://127.0.0.1:7891', 'socks5h://127.0.0.1:7891', 'socks4://127.0.0.1:1080']) {
      expect(() => normalizeProxyURL(value)).toThrow(/cannot tunnel through/)
      expect(() => normalizeProxyURL(value)).toThrow(/HTTP proxy port/)
    }
    expect(() => normalizeProxyURL('ftp://proxy.example')).toThrow(/must use http:\/\/ or https:\/\//)
    expect(() => normalizeProxyURL('not a url')).toThrow(/invalid proxy/)
  })

  it('never prints the tunnel credential in a diagnostic', () => {
    expect(redactProxyURL('http://user:secret@127.0.0.1:7890')).not.toContain('secret')
    expect(redactProxyURL('http://user:secret@127.0.0.1:7890')).toContain('***')
    let message = ''
    try {
      normalizeProxyURL('socks5://user:secret@127.0.0.1:7891')
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('cannot tunnel through')
    expect(message).not.toContain('secret')
  })

  it('bypasses loopback hosts, including the whole 127/8 block', () => {
    for (const host of ['localhost', 'api.localhost', '127.0.0.1', '127.9.9.9', '::1', '[::1]', '0.0.0.0']) {
      expect(isLoopbackHost(host), host).toBe(true)
    }
    for (const host of ['anyrouter.top', '128.0.0.1', 'example.com', '127.0.0.256']) {
      expect(isLoopbackHost(host), host).toBe(false)
    }
  })

  it('resolves the setting through the plugin configuration', () => {
    expect(resolveConfig({}).providers[0]!.proxy).toBeUndefined()
    expect(resolveConfig({ proxy: 'http://127.0.0.1:7890' }).providers[0]!.proxy).toBe('http://127.0.0.1:7890')
    // A refused proxy DISABLES its provider rather than throwing: resolution has
    // to stay total, or a half-typed proxy in the settings form could stop the
    // plugin from mounting at all.
    const socks = resolveConfig({ providers: [
      { id: 'relay', baseURL: 'https://a.example.com', proxy: 'socks5://127.0.0.1:7891' },
    ] })
    expect(socks.providers[0]!.proxy).toBeUndefined()
    expect(socks.providers[0]!.error).toMatch(/cannot tunnel through/)
  })
})

describe('route-scoped proxy transport', () => {
  it('is the global fetch itself when no proxy is configured', () => {
    expect(proxyFetch(undefined)).toBe(globalThis.fetch)
  })

  it('sends an http target to the proxy as an absolute-form request', async () => {
    const proxy = await startProxy()
    try {
      const response = await proxyFetch(`http://127.0.0.1:${proxy.port}`)('http://anyrouter.test:1234/v1/models')
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ object: 'list' })
      // The origin-form path would be `/v1/models`; absolute-form proves the
      // request was addressed to the proxy.
      expect(proxy.seen).toEqual(['GET http://anyrouter.test:1234/v1/models'])
    } finally {
      await proxy.close()
    }
  })

  it('tunnels an https target with CONNECT instead of dialling it', async () => {
    const proxy = await startProxy()
    try {
      await expect(proxyFetch(`http://127.0.0.1:${proxy.port}`)('https://anyrouter.test/v1/models')).rejects.toThrow()
      expect(proxy.seen).toEqual(['CONNECT anyrouter.test:443'])
    } finally {
      await proxy.close()
    }
  })

  it('keeps a loopback target direct even when a proxy is configured', async () => {
    const origin = await startOrigin()
    const proxy = await startProxy()
    try {
      const response = await proxyFetch(`http://127.0.0.1:${proxy.port}`)(`http://127.0.0.1:${origin.port}/v1/models`)
      expect(response.status).toBe(200)
      expect(origin.seen).toEqual(['GET /v1/models'])
      expect(proxy.seen).toEqual([])
    } finally {
      await origin.close()
      await proxy.close()
    }
  })

  it('routes model discovery through the proxy rather than the endpoint', async () => {
    const proxy = await startProxy()
    try {
      // A direct dial would fail on DNS for this name and the proxy would see
      // nothing; the recorded CONNECT is what proves discovery was tunnelled.
      await expect(discoverAnyRouterModels({
        baseURL: 'https://anyrouter.test',
        apiKey: 'sk-test',
        fetch: proxyFetch(`http://127.0.0.1:${proxy.port}`),
      })).rejects.toMatchObject({ code: 'DISCOVERY_FAILED' })
      expect(proxy.seen).toEqual(['CONNECT anyrouter.test:443'])
    } finally {
      await proxy.close()
    }
  })
})

describe('transports accept a route-bound fetch', () => {
  it('binds one fetch into the Claude Code transport', async () => {
    let request: Request | undefined
    const send = (async (input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init)
      return new Response(claudeSse(), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof globalThis.fetch
    const streams = createClaudeCodeStreams(() => send)
    const model = resolveModel({ id: 'claude-opus-5', protocol: 'claude-code' }, 'https://anyrouter.top')
    const context: Context = { messages: [{ role: 'user', content: 'Reply OK', timestamp: 0 }] }

    const events = await collect(streams.streamSimple(model, normalizeContext(context), { apiKey: 'sk-test' }))

    expect(events.some(event => event.type === 'done')).toBe(true)
    expect(request?.url).toBe('https://anyrouter.top/v1/messages?beta=true')
  })

  it('binds one fetch into the Codex Responses transport', async () => {
    let request: Request | undefined
    const send = (async (input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init)
      return new Response(JSON.stringify({ error: { message: 'proxied' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof globalThis.fetch
    const streams = createCodexResponsesStreams(() => send)
    const model = resolveModel({ id: 'gpt-5.6-sol', protocol: 'codex-responses' }, 'https://anyrouter.top')
    const context: Context = { messages: [{ role: 'user', content: 'Reply OK', timestamp: 0 }] }

    const events = await collect(streams.streamSimple(model, normalizeContext(context), { apiKey: 'sk-test' }))

    expect(events.some(event => event.type === 'error')).toBe(true)
    // The fetch reached the OpenAI client pi-ai builds, which is the seam the
    // proxy depends on: pi-ai passes `options.fetch` straight through.
    expect(request?.url).toBe('https://anyrouter.top/v1/responses')
  })
})
