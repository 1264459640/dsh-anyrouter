import { describe, expect, it } from 'vitest'
import { Config, classifyProtocol, plainOptions, resolveConfig } from '../src/config.ts'
import { metadataForDiscoveredModel, resolveModel } from '../src/catalog.ts'

describe('AnyRouter config and catalog', () => {
  it('resolves defaults and rejects duplicate models', () => {
    const resolved = resolveConfig({})
    expect(resolved).toMatchObject({
      baseURL: 'https://anyrouter.top',
      apiKeyEnv: 'ANYROUTER_API_KEY',
      models: [],
    })
    expect(resolved.retryPolicy).toMatchObject({
      mode: 'normal',
      maxRetries: 5,
      initialDelayMs: 500,
      maxDelayMs: 10_000,
    })

    expect(() => resolveConfig({ models: [
      { id: 'claude-opus-5', protocol: 'claude-code' },
      { id: 'claude-opus-5', protocol: 'claude-code' },
    ] })).toThrow(/duplicate model id/)
  })

  it('locks the credential ref and rejects unsafe endpoint forms', () => {
    expect(() => resolveConfig({ apiKeyEnv: 'OTHER_API_KEY' })).toThrow(/fixed to ANYROUTER_API_KEY/)
    expect(() => resolveConfig({ baseURL: 'http://example.com' })).toThrow(/must use https/)
    expect(() => resolveConfig({ baseURL: 'https://user@example.com' })).toThrow(/user information/)
    expect(() => resolveConfig({ baseURL: 'https://example.com?tenant=x' })).toThrow(/query or fragment/)
    expect(resolveConfig({ baseURL: 'http://127.0.0.1:48124/' }).baseURL).toBe('http://127.0.0.1:48124')
  })

  it('projects the volatile config a live settings write commits', () => {
    // In 0.1.7-rc.2 the Host renders this entry's schemastery `Config` as the
    // settings form and commits an edit into the RUNNING fiber's references
    // (`cordis-plugin-loader` `config/entry.d.ts`, "commit its values into the
    // running fiber's references") instead of remounting the plugin. So
    // `apply(ctx, config)` receives live references, not plain values, and this
    // pins that `plainOptions` unwraps exactly that shape. Every field is
    // `.volatile()`, without which the Host offers no form at all
    // (`SettingsForms.describe` drops a schema whose `volatileForm` is
    // undefined) and refuses every write path.
    const config = Config({ models: [{ id: 'claude-opus-5', protocol: 'claude-code' }] })

    for (const field of ['apiKeyEnv', 'baseURL', 'models', 'streamIdleTimeoutMs'] as const) {
      expect(typeof (config as any)[field]?.get, `${field} is a reference`).toBe('function')
    }
    expect((config.baseURL as any).get()).toBe('https://anyrouter.top')

    const options = plainOptions(config)
    expect(options).toMatchObject({
      apiKeyEnv: 'ANYROUTER_API_KEY',
      baseURL: 'https://anyrouter.top',
      streamIdleTimeoutMs: 300_000,
    })
    expect(resolveConfig(options).models).toHaveLength(1)
  })

  it('reads a plain configuration object as well as a live one', () => {
    // The reference protocol is detected, not assumed, so a caller that builds
    // a plain config by hand (every test above, and any future programmatic
    // mount) still resolves.
    expect(plainOptions({ baseURL: 'https://example.com' } as never)).toEqual({ baseURL: 'https://example.com' })
    expect(resolveConfig({ baseURL: 'https://example.com' }).baseURL).toBe('https://example.com')
  })

  it('classifies only the approved protocol families', () => {
    expect(classifyProtocol('claude-opus-5')).toBe('claude-code')
    expect(classifyProtocol('gpt-5.6-sol')).toBe('codex-responses')
    expect(classifyProtocol('gemini-2.5-pro')).toBeUndefined()
  })

  it('inherits model capacities and reasoning metadata from pi-ai', () => {
    const claude = resolveModel({ id: 'claude-opus-5', protocol: 'claude-code' }, 'https://anyrouter.top')
    expect(claude).toMatchObject({
      provider: 'anyrouter',
      api: 'anthropic-messages',
      contextWindow: 1_000_000,
      maxTokens: 128_000,
      reasoning: true,
    })
    expect(claude.compat).toMatchObject({ forceAdaptiveThinking: true })

    const codex = resolveModel({ id: 'gpt-5.6-sol', protocol: 'codex-responses' }, 'https://anyrouter.top')
    expect(codex).toMatchObject({
      provider: 'anyrouter',
      api: 'openai-responses',
      baseUrl: 'https://anyrouter.top/v1',
      reasoning: true,
    })
    expect(metadataForDiscoveredModel('gpt-5.6-sol', 'codex-responses').maxTokens).toBe(128_000)
  })
})
