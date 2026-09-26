import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.tsx'
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
 * A Client context shaped like DSH 0.1.7-rc.2. The browser settings seam is
 * the `configForms` service: `ctx.configForms.get(entryId)` returns a
 * `ConfigForm` with `getSnapshot`/`subscribe`/`set`/`unset`/`mutate`
 * (`@deepseek-ai/dsh-client-ui-settings` 0.1.7-rc.2 `lib/types/client/config-form.d.ts`).
 * The old `settingsScope` service does not exist anywhere in that release.
 */
function createContext(options: { remoteOverride?: any } = {}) {
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
  // `ConfigFormSnapshot` in 0.1.7 carries base/user/revision beside the old
  // status/value/writable/mode quartet.
  const form = {
    getSnapshot: () => ({
      status: 'ready',
      value: {},
      base: undefined,
      user: undefined,
      revision: 1,
      writable: true,
      mode: 'host',
    }),
    subscribe: vi.fn(() => vi.fn()),
    set: vi.fn(async () => true),
    unset: vi.fn(async () => true),
    mutate: vi.fn(async () => true),
  }
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

/** Every option key the 0.1.7 `settings.section` (list-kind) registration admits. */
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
  it('declares the 0.1.7 services it calls and no removed settingsScope', () => {
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

  it('registers a settings.section entry in the 0.1.7 list-kind shape', async () => {
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
    // The 0.1.7 list-kind contract is id/order/label (+ priority); a stale key
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
    await props.scope.set('baseURL', 'https://example.com')
    expect(form.set).toHaveBeenCalledWith('baseURL', 'https://example.com')
    expect(typeof props.ops.credentialConfigured).toBe('function')

    const refresh = vi.fn()
    const dispose = props.subscribeCredentials(refresh)
    listeners.get('credentials/reference-updated')?.('OTHER_API_KEY')
    expect(refresh).not.toHaveBeenCalled()
    listeners.get('credentials/reference-updated')?.('ANYROUTER_API_KEY')
    expect(refresh).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('binds Host operations to the Remote namespaces and unwraps their envelopes', async () => {
    stubDocument([])
    const { ctx, credentials, llm, slotRegistrations } = createContext()

    apply(ctx)
    const { ops } = slotRegistrations[0].spec.inject()

    await expect(ops.credentialConfigured()).resolves.toBe(true)
    expect(credentials.describe).toHaveBeenCalledWith(['ANYROUTER_API_KEY'])

    await ops.storeCredential('sk-test')
    expect(credentials.set).toHaveBeenCalledWith('ANYROUTER_API_KEY', 'sk-test')

    await expect(ops.discoverModels('https://anyrouter.top')).resolves.toEqual([{ id: 'claude-opus-5' }])
    // Discovery is addressed by the same namespace the Host registered the
    // configurable provider directory entry and the discovery handler under.
    expect(llm.discoverModels).toHaveBeenCalledWith(patchEntryId(), {
      provider: 'anyrouter',
      baseURL: 'https://anyrouter.top',
    })
  })

  it('surfaces a refused Remote call as an error instead of a blank panel', async () => {
    stubDocument([])
    const { ctx, credentials, slotRegistrations } = createContext()
    credentials.describe.mockResolvedValueOnce({ ok: false, error: { message: 'refused' } } as any)

    apply(ctx)
    const { ops } = slotRegistrations[0].spec.inject()

    await expect(ops.credentialConfigured()).rejects.toThrow('refused')
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
