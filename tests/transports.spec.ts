import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeContext, type AssistantMessageEvent, type Context } from '@earendil-works/pi-ai'
import { resolveModel } from '../src/catalog.ts'
import { betaFeaturesOf, claudeCodeStreams, CLAUDE_CODE_VERSION } from '../src/transports/claude.ts'
import { codexResponsesStreams, CODEX_VERSION } from '../src/transports/codex.ts'
import { ANTHROPIC_API_VERSION, CODEX_ORIGINATOR, hostDescriptor } from '../src/transports/headers.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

async function collect(stream: AsyncIterable<AssistantMessageEvent>): Promise<AssistantMessageEvent[]> {
  const events: AssistantMessageEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

function claudeSse(): string {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 2, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }],
    ['message_stop', { type: 'message_stop' }],
  ]
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
}

describe('Claude Code compatibility transport', () => {
  it('sends bearer auth, beta query, identity, 1M beta and adaptive effort', async () => {
    let request: Request | undefined
    globalThis.fetch = vi.fn(async (input, init) => {
      request = new Request(input, init)
      return new Response(claudeSse(), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch
    const model = resolveModel({ id: 'claude-opus-5', protocol: 'claude-code' }, 'https://anyrouter.top')
    const context: Context = {
      systemPrompt: 'DSH system prompt',
      messages: [{ role: 'user', content: 'Reply OK', timestamp: 0 }],
      tools: [{ name: 'read', description: 'Read a file', parameters: { type: 'object', properties: {} } }],
    }

    const events = await collect(claudeCodeStreams.streamSimple(model, normalizeContext(context), {
      apiKey: 'sk-test',
      reasoning: 'high',
      maxTokens: 64,
      sessionId: 'session-1',
      headers: { 'user-agent': 'deepseek-harness/test' },
    }))

    expect(events.some(event => event.type === 'done')).toBe(true)
    expect(request).toBeDefined()
    expect(request!.url).toBe('https://anyrouter.top/v1/messages?beta=true')
    expect(request!.headers.get('authorization')).toBe('Bearer sk-test')
    expect(request!.headers.get('anthropic-beta')).toContain('context-1m-2025-08-07')
    // The COMPLETE Claude Code identity, asserted exactly: a partial set is the
    // failure mode this transport exists to avoid, and an exact user-agent also
    // catches a header being concatenated with the SDK's own rather than
    // replaced by ours.
    expect(request!.headers.get('user-agent')).toBe(`claude-cli/${CLAUDE_CODE_VERSION} (external, sdk-cli) deepseek-harness/test`)
    expect(request!.headers.get('anthropic-version')).toBe(ANTHROPIC_API_VERSION)
    expect(request!.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
    expect(request!.headers.get('x-app')).toBe('cli')
    expect(request!.headers.get('accept')).toBe('application/json')
    expect(request!.headers.get('content-type')).toContain('application/json')
    expect(request!.headers.get('x-claude-code-session-id')).toBe('session-1')
    expect(request!.headers.get('x-client-request-id')).toBe('session-1')
    const body = JSON.parse(await request!.text())
    expect(body.model).toBe('claude-opus-5')
    expect(body.system.some((block: any) => String(block.text).includes('Claude Agent SDK'))).toBe(true)
    expect(body.system.some((block: any) => block.text === 'DSH system prompt')).toBe(true)
    expect(body.tools[0].name).toBe('Read')
    expect(body.thinking).toMatchObject({ type: 'adaptive' })
    expect(body.output_config).toMatchObject({ effort: 'high' })
    expect(body.context_management.edits[0].type).toBe('clear_thinking_20251015')
    const userId = JSON.parse(body.metadata.user_id)
    expect(userId.device_id).toMatch(/^[a-f0-9]{64}$/)
    expect(userId.session_id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/)
  })

  it('clamps budget thinking below the requested output cap', async () => {
    let request: Request | undefined
    globalThis.fetch = vi.fn(async (input, init) => {
      request = new Request(input, init)
      return new Response(claudeSse(), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch
    const model = resolveModel({ id: 'claude-opus-4-1-20250805', protocol: 'claude-code' }, 'https://anyrouter.top')
    await collect(claudeCodeStreams.streamSimple(model, normalizeContext({
      messages: [{ role: 'user', content: 'Reply OK', timestamp: 0 }],
    }), { apiKey: 'sk-test', reasoning: 'high', maxTokens: 2_048 }))
    const body = JSON.parse(await request!.text())
    expect(body.max_tokens).toBe(2_048)
    expect(body.thinking).toMatchObject({ type: 'enabled', budget_tokens: 1_024 })
  })
})

describe('Codex Responses compatibility transport', () => {
  it('targets /v1/responses with Codex headers and Responses request fields', async () => {
    let request: Request | undefined
    globalThis.fetch = vi.fn(async (input, init) => {
      request = new Request(input, init)
      return new Response(JSON.stringify({ error: { message: 'capacity reached', type: 'server_error' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    const model = resolveModel({ id: 'gpt-5.6-sol', protocol: 'codex-responses' }, 'https://anyrouter.top')
    const context: Context = {
      systemPrompt: 'DSH system prompt',
      messages: [{ role: 'user', content: 'Reply OK', timestamp: 0 }],
    }

    const events = await collect(codexResponsesStreams.streamSimple(model, normalizeContext(context), {
      apiKey: 'sk-test',
      reasoning: 'high',
      maxTokens: 64,
      sessionId: 'session-1',
      headers: { 'user-agent': 'deepseek-harness/test' },
    }))

    expect(events.some(event => event.type === 'error')).toBe(true)
    expect(request).toBeDefined()
    expect(request!.url).toBe('https://anyrouter.top/v1/responses')
    expect(request!.headers.get('authorization')).toBe('Bearer sk-test')
    // The COMPLETE Codex CLI identity, asserted exactly.
    expect(request!.headers.get('originator')).toBe(CODEX_ORIGINATOR)
    expect(request!.headers.get('accept')).toBe('text/event-stream')
    expect(request!.headers.get('content-type')).toContain('application/json')
    expect(request!.headers.get('user-agent')).toBe(
      `codex_cli_rs/${CODEX_VERSION} (${hostDescriptor()}) deepseek-harness/test`,
    )
    // Session headers: the shape the CLI's `build_session_headers` produces.
    expect(request!.headers.get('session-id')).toBe('session-1')
    expect(request!.headers.get('thread-id')).toBe('session-1')
    expect(request!.headers.get('x-client-request-id')).toBe('session-1')
    expect(request!.headers.get('x-codex-installation-id')).toMatch(/^[a-f0-9]{32}$/)
    // The Responses API is GA in the generation this transport reproduces: the
    // old beta gate is absent from `codex.exe`, so claiming it would assert a
    // client that no longer exists.
    expect(request!.headers.get('openai-beta')).toBeNull()
    const body = JSON.parse(await request!.text())
    expect(body).toMatchObject({
      model: 'gpt-5.6-sol',
      instructions: 'DSH system prompt',
      store: false,
      stream: true,
      parallel_tool_calls: true,
    })
    expect(body.include).toContain('reasoning.encrypted_content')
    expect(body.reasoning).toMatchObject({ effort: 'high' })
  })

  it('preserves native Responses call and item IDs during replay', async () => {
    let request: Request | undefined
    globalThis.fetch = vi.fn(async (input, init) => {
      request = new Request(input, init)
      return new Response(JSON.stringify({ error: { message: 'captured' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    const model = resolveModel({ id: 'gpt-5.6-sol', protocol: 'codex-responses' }, 'https://anyrouter.top')
    const context = {
      messages: [
        { role: 'user', content: 'Run it', timestamp: 0 },
        {
          role: 'assistant', api: 'openai-responses', provider: 'anyrouter', model: 'gpt-5.6-sol',
          content: [{ type: 'toolCall', id: 'call_1|fc_1', name: 'bash', arguments: { command: 'pwd' } }],
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: 'toolUse', timestamp: 1,
        },
        { role: 'toolResult', toolCallId: 'call_1|fc_1', toolName: 'bash', content: [{ type: 'text', text: '/tmp' }], isError: false, timestamp: 2 },
      ],
      tools: [{ name: 'bash', description: 'Run', parameters: { type: 'object', properties: { command: { type: 'string' } } } }],
    } as Context
    await collect(codexResponsesStreams.streamSimple(model, normalizeContext(context), { apiKey: 'sk-test' }))
    const body = JSON.parse(await request!.text())
    const call = body.input.find((item: any) => item.type === 'function_call')
    const result = body.input.find((item: any) => item.type === 'function_call_output')
    expect(call).toMatchObject({ call_id: 'call_1', id: 'fc_1' })
    expect(result).toMatchObject({ call_id: 'call_1' })
  })
})

/**
 * `COMPAT_BETAS` restates the betas pi-ai would derive itself, because a
 * caller-supplied `anthropic-beta` makes pi-ai's own assembly return the value
 * verbatim instead of evaluating its conditions. pi-ai 0.87 added a
 * transcript-shaped condition for native tool changes
 * (`@earendil-works/pi-ai/dist/api/anthropic-messages.js:801-804`), so these
 * cases pin the replication of it.
 *
 * This is worth a test of its own because the failure is silent and reachable
 * by a routine catalog regeneration: the generated table can switch the gate on
 * for models this route already serves, and the request then carries a
 * `defer_loading` body with no beta authorizing it.
 */
describe('anthropic-beta restatement for native tool changes', () => {
  const NATIVE_TOOL_CHANGES = 'mid-conversation-tool-changes-2026-07-01'
  const readTool = { name: 'read', description: 'Read a file', parameters: { type: 'object', properties: {} } }
  const model = (compat: Record<string, unknown>) => ({ id: 'claude-opus-5', compat }) as never
  const transcript = (tools?: unknown[]) => normalizeContext({
    messages: [{ role: 'user', content: 'hi', timestamp: 0 }],
    ...(tools === undefined ? {} : { tools }),
  } as Context)

  it('adds the beta when both gates are set and a tool is initially declared', () => {
    const compat = { supportsMidConvoSystemMessages: true, supportsMidConvoToolChanges: true }
    expect(betaFeaturesOf(model(compat), transcript([readTool]))).toContain(NATIVE_TOOL_CHANGES)
  })

  it('omits the beta whenever pi-ai would not take its native-tool-changes branch', () => {
    const both = { supportsMidConvoSystemMessages: true, supportsMidConvoToolChanges: true }
    // pi-ai needs an initially declared tool to anchor the deferred ones.
    expect(betaFeaturesOf(model(both), transcript())).not.toContain(NATIVE_TOOL_CHANGES)
    // Each gate alone is not enough.
    expect(betaFeaturesOf(model({ supportsMidConvoSystemMessages: true }), transcript([readTool])))
      .not.toContain(NATIVE_TOOL_CHANGES)
    expect(betaFeaturesOf(model({ supportsMidConvoToolChanges: true }), transcript([readTool])))
      .not.toContain(NATIVE_TOOL_CHANGES)
    // A model that declares no compat at all must stay clean.
    expect(betaFeaturesOf(model({}), transcript([readTool]))).not.toContain(NATIVE_TOOL_CHANGES)
  })

  it('omits the beta when a tool name is redefined, which the block form cannot express', () => {
    // Two system messages redeclare `read` with different schemas, so pi-ai's
    // `hasToolRedefinitions` guard (`:801-804`) keeps its branch off and the
    // beta must not be advertised on its behalf.
    const redefined = normalizeContext({
      systemPrompt: 'p',
      tools: [readTool],
      messages: [{ role: 'system', content: 'more', toolsAdded: [{ ...readTool, description: 'other' }], timestamp: 0 }],
    } as Context)
    const compat = { supportsMidConvoSystemMessages: true, supportsMidConvoToolChanges: true }
    expect(betaFeaturesOf(model(compat), redefined)).not.toContain(NATIVE_TOOL_CHANGES)
  })
})
