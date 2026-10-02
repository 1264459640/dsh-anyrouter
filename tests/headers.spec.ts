import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_API_VERSION,
  CLAUDE_CODE_VERSION,
  CODEX_ORIGINATOR,
  CODEX_VERSION,
  claudeCodeHeaders,
  codexHeaders,
  hostDescriptor,
} from '../src/transports/index.ts'

/**
 * The identity table is the one place a request's client identity is assembled,
 * so these tests pin the properties that make it worth centralizing: the set is
 * COMPLETE, the caller cannot redefine it, and nothing is claimed that the
 * client being reproduced does not send.
 */
describe('Claude Code identity headers', () => {
  it('sends the complete set, with the version the bundle owns', () => {
    const headers = claudeCodeHeaders({ version: CLAUDE_CODE_VERSION, betas: ['a-2025-01-01', 'b-2025-02-02'] })
    expect(headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_API_VERSION,
      'anthropic-beta': 'a-2025-01-01,b-2025-02-02',
      'anthropic-dangerous-direct-browser-access': 'true',
      'user-agent': `claude-cli/${CLAUDE_CODE_VERSION} (external, sdk-cli)`,
      'x-app': 'cli',
    })
  })

  it('adds the session headers only when a session is in hand', () => {
    const without = claudeCodeHeaders({ version: CLAUDE_CODE_VERSION, betas: [] })
    expect(without).not.toHaveProperty('x-claude-code-session-id')
    expect(without).not.toHaveProperty('x-client-request-id')
    const with_ = claudeCodeHeaders({ version: CLAUDE_CODE_VERSION, betas: [], sessionId: 'session-1' })
    expect(with_['x-claude-code-session-id']).toBe('session-1')
    expect(with_['x-client-request-id']).toBe('session-1')
    // An empty session id is "no session", not a session named "".
    const blank = claudeCodeHeaders({ version: CLAUDE_CODE_VERSION, betas: [], sessionId: '' })
    expect(blank).not.toHaveProperty('x-claude-code-session-id')
  })

  it('keeps caller extras but never lets them redefine the identity', () => {
    const headers = claudeCodeHeaders({
      version: CLAUDE_CODE_VERSION,
      betas: ['a'],
      overrides: {
        'user-agent': 'deepseek-harness/test',
        'x-tenant': 'acme',
        'x-app': 'not-cli',
        'anthropic-version': '1999-01-01',
      },
    })
    // An unrelated caller header survives...
    expect(headers['x-tenant']).toBe('acme')
    // ...the caller's own user-agent is kept as an attribution token...
    expect(headers['user-agent']).toBe(`claude-cli/${CLAUDE_CODE_VERSION} (external, sdk-cli) deepseek-harness/test`)
    // ...and the identity keys are the bundle's, not the caller's.
    expect(headers['x-app']).toBe('cli')
    expect(headers['anthropic-version']).toBe(ANTHROPIC_API_VERSION)
  })
})

describe('Codex identity headers', () => {
  it('sends the complete set, with the version the bundle owns', () => {
    const headers = codexHeaders({ version: CODEX_VERSION, sessionId: 'session-1' })
    expect(headers['accept']).toBe('text/event-stream')
    expect(headers['content-type']).toBe('application/json')
    expect(headers['originator']).toBe(CODEX_ORIGINATOR)
    expect(headers['user-agent']).toBe(`codex_cli_rs/${CODEX_VERSION} (${hostDescriptor()})`)
    expect(headers['session-id']).toBe('session-1')
    expect(headers['thread-id']).toBe('session-1')
    expect(headers['x-client-request-id']).toBe('session-1')
    expect(headers['x-codex-installation-id']).toMatch(/^[a-f0-9]{32}$/)
  })

  it('does not resurrect the retired Responses beta gate', () => {
    // `responses=experimental` was the beta gate the Responses API needed while
    // it was experimental. It is absent from the Codex CLI this transport
    // reproduces — the client's only `OpenAI-Beta` value is its WebSocket
    // handshake token — so sending it would assert a generation that no longer
    // exists.
    const headers = codexHeaders({ version: CODEX_VERSION, sessionId: 'session-1' })
    expect(Object.keys(headers).map(key => key.toLowerCase())).not.toContain('openai-beta')
    expect(Object.values(headers).join(' ')).not.toContain('responses=experimental')
  })

  it('omits the session headers when there is no session', () => {
    const headers = codexHeaders({ version: CODEX_VERSION })
    for (const key of ['session-id', 'thread-id', 'x-client-request-id']) {
      expect(headers).not.toHaveProperty(key)
    }
  })

  it('keeps the caller attribution on the user-agent', () => {
    const headers = codexHeaders({
      version: CODEX_VERSION,
      overrides: { 'user-agent': 'deepseek-harness/test' },
    })
    expect(headers['user-agent']).toBe(`codex_cli_rs/${CODEX_VERSION} (${hostDescriptor()}) deepseek-harness/test`)
  })
})
