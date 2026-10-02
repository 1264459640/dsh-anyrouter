import { describe, expect, it } from 'vitest'
import {
  Config,
  classifyProtocol,
  defaultApiKeyEnvFor,
  isUsable,
  normalizeProviderId,
  plainOptions,
  resolveConfig,
} from '../src/config.ts'
import { metadataForDiscoveredModel, resolveModel } from '../src/catalog.ts'

describe('AnyRouter config and catalog', () => {
  it('resolves defaults and rejects duplicate models', () => {
    const resolved = resolveConfig({})
    expect(resolved.providers).toHaveLength(1)
    expect(resolved.providers[0]).toMatchObject({
      id: 'anyrouter',
      displayName: 'AnyRouter',
      baseURL: 'https://anyrouter.top',
      apiKeyEnv: 'ANYROUTER_API_KEY',
      models: [],
    })
    expect(resolved.providers[0]!.retryPolicy).toMatchObject({
      mode: 'normal',
      maxRetries: 5,
      initialDelayMs: 500,
      maxDelayMs: 10_000,
    })

    expect(() => resolveConfig({ models: [
      { id: 'claude-opus-5', protocol: 'claude-code' },
      { id: 'claude-opus-5', protocol: 'claude-code' },
    ] })).not.toThrow()

    // A duplicated model row is repaired, not fatal: the relay keeps its
    // endpoint, its credential and its other models.
    const deduped = resolveConfig({ models: [
      { id: 'claude-opus-5', protocol: 'claude-code' },
      { id: 'claude-opus-5', protocol: 'claude-code' },
    ] })
    expect(deduped.providers[0]!.models).toHaveLength(1)
    expect(deduped.providers[0]!.error).toBeUndefined()
    expect(deduped.diagnostics.join(' ')).toMatch(/duplicate model id/)
  })

  it('migrates the legacy flat fields into the one default provider', () => {
    // This is the backwards-compatibility contract: a configuration written
    // before multi-provider support has no `providers` array, and everything it
    // did say about its single relay must survive verbatim — endpoint, proxy,
    // credential reference, model list, timeout and retry policy — on the same
    // route id it always answered as.
    const resolved = resolveConfig({
      baseURL: 'https://relay.example.com',
      proxy: 'http://127.0.0.1:7890',
      apiKeyEnv: 'ANYROUTER_API_KEY',
      streamIdleTimeoutMs: 1234,
      retryPolicy: { mode: 'normal', maxRetries: 2 },
      models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
    })
    expect(resolved.providers).toEqual([
      expect.objectContaining({
        id: 'anyrouter',
        displayName: 'AnyRouter',
        baseURL: 'https://relay.example.com',
        proxy: 'http://127.0.0.1:7890',
        apiKeyEnv: 'ANYROUTER_API_KEY',
        streamIdleTimeoutMs: 1234,
        models: [expect.objectContaining({ id: 'claude-opus-5' })],
      }),
    ])
    expect(resolved.providers[0]!.retryPolicy).toMatchObject({ maxRetries: 2 })
  })

  it('tells an absent provider list from an emptied one', () => {
    // Absent is the migration signal; `[]` is the settings section saying "no
    // relays at all". Collapsing the two would resurrect a deleted provider on
    // the next read, which is why the schema gives `providers` an explicit
    // `undefined` default instead of inheriting the array type's implicit `[]`.
    // The schema-level half of that contract is pinned in the volatile test
    // below; this is the resolution half.
    expect(resolveConfig({}).providers).toHaveLength(1)
    expect(resolveConfig({ providers: [] }).providers).toEqual([])
    expect(resolveConfig({ providers: [], models: [{ id: 'claude-opus-5', protocol: 'claude-code' }] }).providers)
      .toEqual([])
  })

  it('resolves each provider independently, with its own credential reference', () => {
    const resolved = resolveConfig({
      streamIdleTimeoutMs: 300_000,
      retryPolicy: { mode: 'normal', maxRetries: 4 },
      providers: [
        {
          id: 'relay-a',
          displayName: 'Relay A',
          baseURL: 'https://a.example.com',
          apiKeyEnv: 'RELAY_A_KEY',
          proxy: 'http://127.0.0.1:7890',
          models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
        },
        {
          id: 'relay-b',
          baseURL: 'https://b.example.com',
          streamIdleTimeoutMs: 900,
          retryPolicy: { mode: 'normal', maxRetries: 1 },
          models: [{ id: 'gpt-5.6-sol', protocol: 'codex-responses' }],
        },
      ],
    })
    expect(resolved.providers.map(provider => provider.id)).toEqual(['relay-a', 'relay-b'])
    expect(resolved.providers[0]).toMatchObject({
      displayName: 'Relay A',
      apiKeyEnv: 'RELAY_A_KEY',
      proxy: 'http://127.0.0.1:7890',
      streamIdleTimeoutMs: 300_000,
    })
    // A provider that names no reference derives a distinct one from its id, and
    // one that names no timeout or policy inherits the section-wide value.
    expect(resolved.providers[1]).toMatchObject({
      displayName: 'relay-b',
      apiKeyEnv: 'RELAY_B_API_KEY',
      proxy: undefined,
      streamIdleTimeoutMs: 900,
    })
    expect(resolved.providers[1]!.retryPolicy).toMatchObject({ maxRetries: 1 })
    expect(resolved.providers[0]!.retryPolicy).toMatchObject({ maxRetries: 4 })
    expect(defaultApiKeyEnvFor('relay-b')).toBe('RELAY_B_API_KEY')
    expect(defaultApiKeyEnvFor('anyrouter')).toBe('ANYROUTER_API_KEY')
  })

  it('disables, rather than rejects, a provider the user has not finished describing', () => {
    // The settings section edits a LIVE configuration, so every intermediate
    // state of a half-filled form reaches resolution — and "added a relay, has
    // not typed its endpoint yet" is the very first one. Throwing on it used to
    // be fatal exactly where it hurts most: the WRITE succeeds (the schema
    // admits the value), so the throw lands on the next resolve, and at mount
    // time there is no last-good configuration to catch it. The plugin then
    // fails to load, which reads to the user as "my configuration was wiped".
    const draft = resolveConfig({ providers: [{ id: 'relay' }] })
    expect(draft.diagnostics).toEqual([])
    expect(draft.providers).toHaveLength(1)
    expect(draft.providers[0]).toMatchObject({ id: 'relay', baseURL: undefined, models: [] })
    expect(draft.providers[0]!.error).toMatch(/needs a baseURL/)
    expect(isUsable(draft.providers[0]!)).toBe(false)

    // An entry with no representable identity has no route key to hang an error
    // on, so it is dropped — with a diagnostic, and without taking the rest down.
    const mixed = resolveConfig({ providers: [
      { id: 'Relay A', baseURL: 'https://a.example.com' },
      { id: '', baseURL: 'https://b.example.com' },
      { id: 'relay', baseURL: 'https://a.example.com' },
      { id: 'relay', baseURL: 'https://b.example.com' },
    ] })
    expect(mixed.providers.map(provider => provider.id)).toEqual(['relay'])
    expect(mixed.providers[0]!.error).toBeUndefined()
    expect(mixed.diagnostics.join(' ')).toMatch(/must be lowercase alphanumerics/)
    expect(mixed.diagnostics.join(' ')).toMatch(/no id/)
    expect(mixed.diagnostics.join(' ')).toMatch(/duplicate provider id/)

    // A malformed credential reference disables its own provider only, falling
    // back to the derived reference so the entry still has somewhere to store a
    // key once the user fixes it.
    const badRef = resolveConfig({ providers: [
      { id: 'relay', baseURL: 'https://a.example.com', apiKeyEnv: 'not a ref' },
    ] })
    expect(badRef.providers[0]!.error).toMatch(/shell-style identifier/)
    expect(badRef.providers[0]!.apiKeyEnv).toBe('RELAY_API_KEY')

    expect(normalizeProviderId('  relay-a  ')).toBe('relay-a')
    expect(() => normalizeProviderId('')).toThrow(/non-empty/)
  })

  it('disables a provider whose endpoint or proxy is unusable', () => {
    // The endpoint guards are unchanged; what changed is that failing one no
    // longer throws. The provider is disabled, so the unsafe endpoint is still
    // never dialled — the configuration just survives to be corrected.
    for (const [baseURL, pattern] of [
      ['http://example.com', /must use https/],
      ['https://user@example.com', /user information/],
      ['https://example.com?tenant=x', /query or fragment/],
    ] as const) {
      const resolved = resolveConfig({ providers: [{ id: 'relay', baseURL }] })
      expect(resolved.providers[0]!.baseURL, baseURL).toBeUndefined()
      expect(resolved.providers[0]!.error, baseURL).toMatch(pattern)
      expect(isUsable(resolved.providers[0]!), baseURL).toBe(false)
    }

    // A refused proxy disables the relay rather than being silently ignored:
    // pretending traffic is tunnelled when it is not is worse than saying so.
    const socks = resolveConfig({ providers: [
      { id: 'relay', baseURL: 'https://a.example.com', proxy: 'socks5://127.0.0.1:7891' },
    ] })
    expect(socks.providers[0]!.proxy).toBeUndefined()
    expect(socks.providers[0]!.error).toMatch(/cannot tunnel through/)

    // Loopback development over plain http stays supported.
    expect(resolveConfig({ baseURL: 'http://127.0.0.1:48124/' }).providers[0]!.baseURL).toBe('http://127.0.0.1:48124')
    expect(isUsable(resolveConfig({}).providers[0]!)).toBe(true)
  })

  it('keeps the client identity out of the configuration', () => {
    // The version claim and the complete header set belong to the bundle
    // (`src/transports/headers.ts`), never to a user: a version a user picks is a
    // claim they cannot back with a matching request shape, so offering the
    // field invited exactly the drift it looked like it solved.
    //
    // Two guarantees, asserted separately because they fail independently. The
    // declared field set is what the Host renders as the settings form and what
    // a settings write must name, so an identity field absent from it cannot be
    // offered or written at all.
    const declared: string[] = Object.keys((Config as unknown as { dict: Record<string, never> }).dict)
    expect(declared).toEqual([
      'providers', 'apiKeyEnv', 'baseURL', 'proxy', 'models', 'streamIdleTimeoutMs', 'retryPolicy',
    ])
    const providerFields: string[] = Object.keys(
      (Config as unknown as { dict: { providers: { inner: { dict: Record<string, never> } } } })
        .dict.providers.inner.dict,
    )
    expect(providerFields).toEqual([
      'id', 'displayName', 'apiKeyEnv', 'baseURL', 'proxy', 'models', 'streamIdleTimeoutMs', 'retryPolicy',
    ])

    // And a hand-written identity field that reaches `resolveConfig` some other
    // way still cannot survive into a resolved provider, which is the only shape
    // a transport ever reads.
    const handWritten = {
      id: 'relay',
      baseURL: 'https://a.example.com',
      claudeCodeVersion: '9.9.9',
      codexVersion: '9.9.9',
      extraBetas: ['made-up-beta'],
    }
    const resolved = resolveConfig({ providers: [handWritten] } as never).providers[0]!
    for (const key of ['claudeCodeVersion', 'codexVersion', 'extraBetas'] as const) {
      expect(resolved, `resolved provider drops ${key}`).not.toHaveProperty(key)
    }
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

    for (const field of ['providers', 'apiKeyEnv', 'baseURL', 'models', 'streamIdleTimeoutMs'] as const) {
      expect(typeof (config as any)[field]?.get, `${field} is a reference`).toBe('function')
    }
    expect((config.baseURL as any).get()).toBe('https://anyrouter.top')
    // No schema default, so the Host must not turn "absent" into "[]".
    expect((config.providers as any).get()).toBeUndefined()

    const options = plainOptions(config)
    expect(options).toMatchObject({
      apiKeyEnv: 'ANYROUTER_API_KEY',
      baseURL: 'https://anyrouter.top',
      streamIdleTimeoutMs: 300_000,
    })
    expect(options.providers).toBeUndefined()
    expect(resolveConfig(options).providers[0]!.models).toHaveLength(1)

    const written = Config({ providers: [{ id: 'relay-a', baseURL: 'https://a.example.com' }] })
    // The nested array fields pick up schemastery's implicit `[]`; an empty
    // `models` / `extraBetas` means the same thing as an absent one, so only the
    // values that carry meaning are pinned here.
    expect(plainOptions(written).providers).toMatchObject([
      expect.objectContaining({ id: 'relay-a', baseURL: 'https://a.example.com' }),
    ])
  })

  it('reads a plain configuration object as well as a live one', () => {
    // The reference protocol is detected, not assumed, so a caller that builds
    // a plain config by hand (every test above, and any future programmatic
    // mount) still resolves.
    expect(plainOptions({ baseURL: 'https://example.com' } as never)).toEqual({ baseURL: 'https://example.com' })
    expect(resolveConfig({ baseURL: 'https://example.com' }).providers[0]!.baseURL).toBe('https://example.com')
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

    // A model belonging to another relay must carry that relay's route id: the
    // seam matches `Model.provider` against its profiles map, so a stale id
    // would route the request to the wrong profile — or to none.
    expect(resolveModel(
      { id: 'claude-opus-5', protocol: 'claude-code' },
      'https://a.example.com',
      'relay-a',
    )).toMatchObject({ provider: 'relay-a', baseUrl: 'https://a.example.com' })
  })
})
