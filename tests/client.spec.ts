import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  apply,
  credentialRefFor,
  credentialRefProblem,
  defaultApiKeyEnvFor,
  endpointProblem,
  inject,
  legacyModelsPending,
  nextProviderId,
  persistProviders,
  providerIdProblem,
  providersFromValue,
  proxyProblem,
  seedSectionState,
  withProviderModels,
  withoutProvider,
  replaceProvider,
} from '../src/client/index.tsx'
import type { ProviderValue, SettingsFormViewSnapshot, SettingsValue } from '../src/client/index.tsx'
import { patchEntryId } from './helpers/patch-entry-ids.ts'

afterEach(() => vi.unstubAllGlobals())

/** Minimal browser surface the section's style effect needs. */
function stubDocument(appended: any[]): void {
  vi.stubGlobal('document', {
    createElement: () => ({ dataset: {}, remove: vi.fn(), textContent: '' }),
    head: { appendChild: (element: any) => appended.push(element) },
  })
}

/**
 * A `ConfigForm`-shaped form whose `set` really commits into the snapshot. The
 * write path verifies its writes by reading the snapshot back
 * (`ConfigForm.set` resolves `false` on refusal and reloads Host state), so a
 * stub that always answers `true` without committing would make every
 * read-back assertion vacuous.
 */
function createForm(value: SettingsValue = {}) {
  let current: SettingsValue = value
  return {
    set: vi.fn(async (field: string, next: unknown): Promise<boolean> => {
      current = { ...current, [field]: next } as SettingsValue
      return true
    }),
    getSnapshot: (): SettingsFormViewSnapshot => ({
      status: 'ready',
      value: current,
      writable: true,
      mode: 'host',
    }),
    subscribe: vi.fn(() => vi.fn()),
    unset: vi.fn(async () => true),
    mutate: vi.fn(async () => true),
  }
}

/**
 * A form snapshot presenting the two halves of the migration seam: an ABSENT
 * `providers` key beside the legacy flat fields.
 */
const LEGACY_VALUE: SettingsValue = {
  apiKeyEnv: 'LEGACY_KEY_REF',
  baseURL: 'https://legacy.example',
  proxy: 'http://127.0.0.1:7890',
  models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
}

/**
 * A Client context shaped like DSH 0.2.0. The browser settings seam is the
 * `configForms` service: `ctx.configForms.get(entryId)` returns a `ConfigForm`
 * with `getSnapshot`/`subscribe`/`set`/`unset`/`mutate`
 * (`@deepseek-ai/dsh-client-ui-settings` `lib/types/client/config-form.d.ts`).
 */
function createContext(options: { remoteOverride?: any; value?: SettingsValue } = {}) {
  const listeners = new Map<string, (...args: any[]) => void>()
  const slotRegistrations: any[] = []
  const credentials = {
    describe: vi.fn(async (refs: string[]) => ({
      ok: true,
      value: Object.fromEntries(refs.map(ref => [ref, { configured: true, writable: true }])),
    })),
    set: vi.fn(async () => ({ ok: true, value: undefined })),
  }
  const llm = {
    discoverModels: vi.fn(async () => ({ ok: true, value: [{ id: 'claude-opus-5' }] })),
  }
  const remote = options.remoteOverride ?? {
    credentials,
    llm,
    $on: vi.fn((event: string, listener: (...args: any[]) => void) => {
      listeners.set(event, listener)
      return vi.fn()
    }),
  }
  const form = createForm(options.value ?? {})
  const configForms = {
    get: vi.fn((_entryId: string) => form),
    describe: vi.fn(() => ({})),
    // The real `whileServed` runs `register` once the namespace appears in the
    // Host describe mirror; the fake serves it immediately.
    whileServed: vi.fn((
      namespaces: readonly string[],
      register: (served: ReadonlySet<string>) => () => void,
    ) => {
      const installed = register(new Set(namespaces))
      return () => { if (typeof installed === 'function') installed() }
    }),
  }
  const ctx: any = {
    remote,
    configForms,
    get: (name: string) => (name === 'configForms' ? configForms : remote),
    effect: (effect: () => () => void) => effect(),
    on: vi.fn(() => vi.fn()),
    slots: {
      inject: (_name: string, install: () => void) => install(),
      register: (spec: any, component: any) => {
        slotRegistrations.push({ spec, component })
        return vi.fn()
      },
    },
  }
  return { ctx, credentials, listeners, llm, form, configForms, slotRegistrations }
}

/** Every option key the 0.2.0 `settings.section` (list-kind) registration admits. */
const SECTION_OPTION_KEYS = [
  'name',
  'id',
  'order',
  'label',
  'priority',
  'children',
  'store',
  'locale',
  'registrant',
  'inject',
] as const

describe('AnyRouter settings client composition', () => {
  it('declares the 0.2.0 services it calls and no removed settingsScope', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.credentials', 'remote.llm', 'configForms'])
    expect(inject).not.toContain('settingsScope')
  })

  it('resolves its form for the profile entry id in cordis.patch.yml', () => {
    stubDocument([])
    const { ctx, configForms } = createContext()

    apply(ctx)

    expect(configForms.get).toHaveBeenCalledTimes(1)
    expect(configForms.get).toHaveBeenCalledWith(patchEntryId())
  })

  it('registers a settings.section entry in the 0.2.0 list-kind shape', async () => {
    const appended: any[] = []
    stubDocument(appended)
    const { ctx, listeners, form, slotRegistrations } = createContext()

    apply(ctx)

    expect(appended).toHaveLength(1)
    expect(appended[0].dataset.plugin).toBe('dsh-anyrouter')
    expect(slotRegistrations).toHaveLength(1)

    const spec = slotRegistrations[0].spec
    expect(spec).toMatchObject({ name: 'settings.section', id: 'anyrouter', order: 11 })
    expect(spec.label()).toBe('AnyRouter')
    // The list-kind contract is id/order/label (+ priority); a stale key
    // silently disappears from the nav row, so hold the whole option set.
    for (const key of Object.keys(spec)) {
      expect(SECTION_OPTION_KEYS as readonly string[]).toContain(key)
    }
    expect(typeof spec.inject).toBe('function')

    const props = spec.inject()
    // The injected share must expose a section-facing view of the live
    // ConfigForm: the section subscribes through it and writes through `set`.
    expect(typeof props.scope.getSnapshot).toBe('function')
    expect(typeof props.scope.subscribe).toBe('function')
    expect(typeof props.scope.set).toBe('function')
    expect(props.scope.getSnapshot()).toEqual(form.getSnapshot())
    await props.scope.set('providers', [])
    expect(form.set).toHaveBeenCalledWith('providers', [])
    expect(typeof props.ops.credentialConfigured).toBe('function')

    // Each provider owns a reference, so the subscription forwards WHICH
    // reference changed instead of filtering for one fixed name. `connection/reset`
    // names none and forwards the empty string.
    const refresh = vi.fn()
    const dispose = props.subscribeCredentials(refresh)
    listeners.get('credentials/reference-updated')?.('RELAY_B_API_KEY')
    expect(refresh).toHaveBeenCalledWith('RELAY_B_API_KEY')
    listeners.get('credentials/reference-updated')?.('ANYROUTER_API_KEY')
    expect(refresh).toHaveBeenCalledTimes(2)
    dispose()
  })

  it('binds Host operations to the Remote namespaces and unwraps their envelopes', async () => {
    stubDocument([])
    const { ctx, credentials, llm, slotRegistrations } = createContext()

    apply(ctx)
    const { ops } = slotRegistrations[0].spec.inject()

    await expect(ops.credentialConfigured('ANYROUTER_API_KEY')).resolves.toBe(true)
    expect(credentials.describe).toHaveBeenCalledWith(['ANYROUTER_API_KEY'])

    await ops.storeCredential('ANYROUTER_API_KEY', 'sk-test')
    expect(credentials.set).toHaveBeenCalledWith('ANYROUTER_API_KEY', 'sk-test')

    await expect(ops.discoverModels('anyrouter', 'https://anyrouter.top'))
      .resolves.toEqual([{ id: 'claude-opus-5' }])
    // Discovery is addressed by the same namespace the Host registered the
    // configurable provider directory entry and the discovery handler under,
    // and by the PROVIDER id the draft edits.
    expect(llm.discoverModels).toHaveBeenCalledWith(patchEntryId(), {
      provider: 'anyrouter',
      baseURL: 'https://anyrouter.top',
    })
  })

  it('addresses a non-default provider by its own derived credential reference', async () => {
    stubDocument([])
    const { ctx, credentials, llm, slotRegistrations } = createContext()

    apply(ctx)
    const { ops } = slotRegistrations[0].spec.inject()

    // `providerProfileOf`-style per-provider refs: the reference reaches the
    // credentials namespace verbatim, and the provider id reaches discovery.
    await expect(ops.credentialConfigured('RELAY_B_API_KEY')).resolves.toBe(true)
    expect(credentials.describe).toHaveBeenCalledWith(['RELAY_B_API_KEY'])

    await ops.storeCredential('RELAY_B_API_KEY', 'sk-relay-b')
    expect(credentials.set).toHaveBeenCalledWith('RELAY_B_API_KEY', 'sk-relay-b')

    await expect(ops.discoverModels('relay-b', 'https://relay-b.example'))
      .resolves.toEqual([{ id: 'claude-opus-5' }])
    expect(llm.discoverModels).toHaveBeenCalledWith(patchEntryId(), {
      provider: 'relay-b',
      baseURL: 'https://relay-b.example',
    })
  })

  it('tolerates a Host that re-wraps the discovered models', async () => {
    stubDocument([])
    const { ctx, llm, slotRegistrations } = createContext()
    llm.discoverModels.mockResolvedValueOnce({ ok: true, value: { models: [{ id: 'gpt-5.6-sol' }] } } as any)

    apply(ctx)
    const { ops } = slotRegistrations[0].spec.inject()

    await expect(ops.discoverModels('anyrouter', 'https://anyrouter.top'))
      .resolves.toEqual([{ id: 'gpt-5.6-sol' }])
  })

  it('surfaces a refused Remote call as an error instead of a blank panel', async () => {
    stubDocument([])
    const { ctx, credentials, slotRegistrations } = createContext()
    credentials.describe.mockResolvedValueOnce({ ok: false, error: { message: 'refused' } } as any)

    apply(ctx)
    const { ops } = slotRegistrations[0].spec.inject()

    await expect(ops.credentialConfigured('ANYROUTER_API_KEY')).rejects.toThrow('refused')
  })

  it('fails loudly on a Host without the required Remote namespaces', () => {
    stubDocument([])
    const { ctx } = createContext({ remoteOverride: { $on: vi.fn() } })

    expect(() => apply(ctx)).toThrow(/remote\.credentials\/remote\.llm/)
  })

  it('does not gate the section on a DSH version string', () => {
    const { ctx } = createContext({ remoteOverride: { $on: vi.fn() } })
    let message = ''
    try {
      apply(ctx)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).not.toContain('0.1.2-alpha.3')
    expect(message).not.toContain('0.1.1')
  })
})

describe('legacy single-relay migration', () => {
  it('synthesizes the one anyrouter provider when providers is absent', () => {
    const providers = providersFromValue(LEGACY_VALUE)
    expect(providers).toEqual([{
      id: 'anyrouter',
      displayName: 'AnyRouter',
      apiKeyEnv: 'LEGACY_KEY_REF',
      baseURL: 'https://legacy.example',
      proxy: 'http://127.0.0.1:7890',
      models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
    }])
  })

  it('falls back to the bundle defaults for a value that names none of the legacy fields', () => {
    expect(providersFromValue({})).toEqual([{
      id: 'anyrouter',
      displayName: 'AnyRouter',
      apiKeyEnv: 'ANYROUTER_API_KEY',
      baseURL: 'https://anyrouter.top',
      proxy: '',
      models: [],
    }])
    expect(providersFromValue(undefined)).toEqual(providersFromValue({}))
  })

  it('seeds the section with that one provider selected and its fields editable', () => {
    // No React renderer is installed in this repository, so "the section shows
    // one synthesized provider" is pinned at the seeding seam the component
    // itself uses: the draft array and the string-shaped detail draft.
    const state = seedSectionState(LEGACY_VALUE, 0)
    expect(state.draft).toEqual(providersFromValue(LEGACY_VALUE))
    expect(state.selected).toBe(0)
    expect(state.form).toMatchObject({
      id: 'anyrouter',
      displayName: 'AnyRouter',
      apiKeyEnv: 'LEGACY_KEY_REF',
      baseURL: 'https://legacy.example',
      proxy: 'http://127.0.0.1:7890',
      models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
    })
  })

  it('keeps an empty providers array empty instead of re-synthesizing the legacy relay', () => {
    expect(providersFromValue({ providers: [], baseURL: 'https://legacy.example' })).toEqual([])
    const state = seedSectionState({ providers: [] }, 0)
    expect(state.draft).toEqual([])
    expect(state.selected).toBe(-1)
    expect(state.form).toBeNull()
  })

  it('keeps a present providers array authoritative, legacy fields and all', () => {
    const provider: ProviderValue = { id: 'relay-b', baseURL: 'https://relay-b.example' }
    expect(providersFromValue({ providers: [provider], baseURL: 'https://legacy.example' }))
      .toEqual([provider])
  })

  it('clamps the previous selection onto the reseeded array', () => {
    expect(seedSectionState({ providers: [{ id: 'relay-b' }] }, 7).selected).toBe(0)
    expect(seedSectionState({ providers: [{ id: 'a' }, { id: 'b' }] }, 1).selected).toBe(1)
  })
})

describe('provider helpers', () => {
  it('derives a distinct credential reference per provider id', () => {
    expect(defaultApiKeyEnvFor('anyrouter')).toBe('ANYROUTER_API_KEY')
    expect(defaultApiKeyEnvFor('relay-b')).toBe('RELAY_B_API_KEY')
    expect(defaultApiKeyEnvFor('relay.b-2')).toBe('RELAY_B_2_API_KEY')
    expect(credentialRefFor({ id: 'relay-b' })).toBe('RELAY_B_API_KEY')
    expect(credentialRefFor({ id: 'relay-b', apiKeyEnv: 'CUSTOM_KEY' })).toBe('CUSTOM_KEY')
    // A blank override is "derive it", not "use an empty name".
    expect(credentialRefFor({ id: 'relay-b', apiKeyEnv: '  ' })).toBe('RELAY_B_API_KEY')
  })

  it('validates provider ids against the route slug pattern and uniqueness', () => {
    const providers = [{ id: 'anyrouter' }, { id: 'relay-b' }]
    expect(providerIdProblem('relay-c', providers, 0)).toBeNull()
    expect(providerIdProblem('relay-b', providers, 0)).toMatch(/已被占用/)
    // The row being edited is excluded from the uniqueness check.
    expect(providerIdProblem('relay-b', providers, 1)).toBeNull()
    expect(providerIdProblem('', providers, 0)).toMatch(/不能为空/)
    expect(providerIdProblem('Relay-B', providers, 0)).toMatch(/小写字母/)
    expect(providerIdProblem('-relay', providers, 0)).toMatch(/小写字母/)
  })

  it('rejects an endpoint the Host would have to disable the relay over', () => {
    // The reason this gate exists: the WRITE is schema-valid whatever the
    // endpoint says, so without it an unusable endpoint is persisted and only
    // fails on the next resolve — where, at mount time, there is no last-good
    // configuration and the plugin cannot load at all.
    expect(endpointProblem('https://anyrouter.top')).toBeNull()
    expect(endpointProblem('  https://a.example.com/  ')).toBeNull()
    // Loopback development over plain http stays allowed, matching the Host.
    expect(endpointProblem('http://127.0.0.1:48124')).toBeNull()
    expect(endpointProblem('http://localhost:8080')).toBeNull()

    // A brand-new provider starts exactly here, which is the reported bug.
    expect(endpointProblem('')).toMatch(/不能为空/)
    expect(endpointProblem('   ')).toMatch(/不能为空/)
    expect(endpointProblem('anyrouter.top')).toMatch(/格式不正确/)
    expect(endpointProblem('http://a.example.com')).toMatch(/必须使用 https/)
    expect(endpointProblem('https://user:pass@a.example.com')).toMatch(/用户名或密码/)
    expect(endpointProblem('https://a.example.com?tenant=x')).toMatch(/查询串或片段/)
    expect(endpointProblem('https://a.example.com#frag')).toMatch(/查询串或片段/)
  })

  it('rejects a proxy the Host would have to disable the relay over', () => {
    // Blank is "direct", not a problem.
    expect(proxyProblem('')).toBeNull()
    expect(proxyProblem('   ')).toBeNull()
    expect(proxyProblem('http://127.0.0.1:7890')).toBeNull()
    expect(proxyProblem('https://proxy.example.com:8443')).toBeNull()
    // Credentials are allowed on a proxy, unlike on the endpoint.
    expect(proxyProblem('http://user:pass@127.0.0.1:7890')).toBeNull()

    expect(proxyProblem('socks5://127.0.0.1:7891')).toMatch(/SOCKS/)
    expect(proxyProblem('socks4a://127.0.0.1:7891')).toMatch(/SOCKS/)
    expect(proxyProblem('ftp://proxy.example.com')).toMatch(/http:\/\/ 或 https:\/\//)
    expect(proxyProblem('not a url')).toMatch(/格式不正确/)
  })

  it('accepts only a shell identifier as a credential reference', () => {
    // Blank is valid and means "derive it from the id".
    expect(credentialRefProblem('')).toBeNull()
    expect(credentialRefProblem('   ')).toBeNull()
    expect(credentialRefProblem('ANYROUTER_API_KEY')).toBeNull()
    expect(credentialRefProblem('_relay_key9')).toBeNull()
    expect(credentialRefProblem('not a ref')).toMatch(/shell 标识符/)
    expect(credentialRefProblem('9KEY')).toMatch(/shell 标识符/)
  })

  it('generates a default id that collides with nothing', () => {
    expect(nextProviderId([])).toBe('relay-1')
    expect(nextProviderId([{ id: 'anyrouter' }])).toBe('relay-2')
    // A taken candidate is skipped rather than reused.
    expect(nextProviderId([{ id: 'relay-2' }, { id: 'relay-3' }])).toBe('relay-4')
    expect(nextProviderId([{ id: 'relay-3' }])).toBe('relay-2')
  })

  it('replaces only the addressed provider, leaving the others identical', () => {
    const first: ProviderValue = { id: 'anyrouter', models: [{ id: 'claude-opus-5', protocol: 'claude-code' }] }
    const second: ProviderValue = { id: 'relay-b', streamIdleTimeoutMs: 1234, retryPolicy: { attempts: 3 } }
    const providers = [first, second]

    const replaced = replaceProvider(providers, 1, { id: 'relay-b', models: [] })
    expect(replaced[0]).toBe(first)
    expect(replaced[1]).toEqual({ id: 'relay-b', models: [] })

    const modelled = withProviderModels(providers, 0, [])
    expect(modelled[0]).toEqual({ id: 'anyrouter', models: [] })
    // An unselected provider keeps every field the section has no UI for.
    expect(modelled[1]).toBe(second)

    const removed = withoutProvider(providers, 0)
    expect(removed).toEqual([second])
    expect(removed[0]).toBe(second)
    // Removing the last provider round-trips as an empty array, never a resurrection.
    expect(providersFromValue({ providers: withoutProvider(providers, 1) })).toEqual([first])
  })

  it('detects which values still carry a legacy model list to retire', () => {
    expect(legacyModelsPending(LEGACY_VALUE)).toBe(true)
    expect(legacyModelsPending({ models: [] })).toBe(false)
    expect(legacyModelsPending({})).toBe(false)
    expect(legacyModelsPending(undefined)).toBe(false)
  })
})

describe('provider write path', () => {
  it('writes the whole providers array and retires the legacy model list on the first write', async () => {
    const form = createForm(LEGACY_VALUE)
    const providers = providersFromValue(form.getSnapshot().value)

    await persistProviders(form, providers)

    expect(form.set).toHaveBeenCalledWith('providers', providers)
    expect(form.set).toHaveBeenCalledWith('models', [])
    expect(form.getSnapshot().value?.providers).toEqual(providers)
    // The retired list cannot resurrect: the write lands as an empty array, not
    // as an absent field the Host would re-default.
    expect(form.getSnapshot().value?.models).toEqual([])
  })

  it('does not rewrite an already-retired legacy model list', async () => {
    const form = createForm({ providers: [{ id: 'relay-b' }], models: [] })

    await persistProviders(form, [{ id: 'relay-b' }])

    expect(form.set).toHaveBeenCalledTimes(1)
    expect(form.set).toHaveBeenCalledWith('providers', [{ id: 'relay-b' }])
  })

  it('round-trips an empty provider array', async () => {
    const form = createForm({ providers: [], models: [] })
    await persistProviders(form, [])
    expect(form.getSnapshot().value?.providers).toEqual([])
    expect(providersFromValue(form.getSnapshot().value)).toEqual([])
  })

  it('throws when the Host refuses the providers write', async () => {
    const form = createForm(LEGACY_VALUE)
    form.set.mockResolvedValueOnce(false as never)

    await expect(persistProviders(form, [{ id: 'anyrouter', models: [] }]))
      .rejects.toThrow('提供商配置未能保存')
    expect(form.getSnapshot().value?.models).toEqual(LEGACY_VALUE.models)
  })

  it('throws when the read-back disagrees with the write', async () => {
    const form = createForm(LEGACY_VALUE)
    // An accepted-but-not-committed write is exactly what a refusal looks like
    // after the Host reloads its own state.
    form.set.mockImplementationOnce(async () => true)

    await expect(persistProviders(form, [{ id: 'anyrouter', models: [] }]))
      .rejects.toThrow('提供商配置未能保存')
  })

  it('throws when the operation went stale mid-write', async () => {
    const form = createForm(LEGACY_VALUE)
    await expect(persistProviders(form, providersFromValue(LEGACY_VALUE), () => false))
      .rejects.toThrow('操作已中断')
  })
})
