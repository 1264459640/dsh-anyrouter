import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import CredentialProvider, { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {
  CredentialInfo,
  CredentialKey,
  CredentialRecord,
  CredentialRecordEntry,
  CredentialRecordInfo,
  CredentialRef,
} from '@deepseek-ai/dsh-credentials'
import { DEFAULT_API_KEY_ENV, SETTINGS_NS } from '../src/config.ts'
import { patchEntryId } from './helpers/patch-entry-ids.ts'
import * as anyrouter from '../src/index.ts'

class MemoryCredentials extends CredentialProvider {
  present = false

  resolve(_ref: CredentialRef) {
    return Promise.resolve(this.present ? { value: 'sk-test', source: 'test' } : undefined)
  }
  describe(_ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: this.present, source: 'test', writable: true })
  }
  set(ref: CredentialRef, _value: string) {
    this.present = true
    this.ctx.emit('credentials/reference-updated', ref)
    return Promise.resolve()
  }
  unset(ref: CredentialRef) {
    this.present = false
    this.ctx.emit('credentials/reference-updated', ref)
    return Promise.resolve()
  }
  readRecord(_key: CredentialKey): Promise<CredentialRecord | undefined> { return Promise.resolve(undefined) }
  describeRecord(_key: CredentialKey): Promise<CredentialRecordInfo> {
    return Promise.resolve({ configured: false, writable: true })
  }
  listRecords(): Promise<readonly CredentialRecordEntry[]> { return Promise.resolve([]) }
  modifyRecord(
    _key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ) { return mutate(undefined) }
  deleteRecord(_key: CredentialKey) { return Promise.resolve() }
}

const settled = () => new Promise(resolve => setTimeout(resolve, 0))

/**
 * Credentials whose presence the test controls PER REFERENCE.
 *
 * `MemoryCredentials` has one boolean for every reference, which is exactly the
 * assumption multi-provider support removes: with several relays configured,
 * some keys are stored and some are not, and the route set has to reflect that
 * per-provider split rather than all-or-nothing.
 */
class PerRefCredentials extends CredentialProvider {
  readonly present = new Set<string>()

  resolve(ref: CredentialRef) {
    return Promise.resolve(this.present.has(ref as string) ? { value: 'sk-test', source: 'test' } : undefined)
  }
  describe(ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: this.present.has(ref as string), source: 'test', writable: true })
  }
  set(ref: CredentialRef, _value: string) {
    this.present.add(ref as string)
    this.ctx.emit('credentials/reference-updated', ref)
    return Promise.resolve()
  }
  unset(ref: CredentialRef) {
    this.present.delete(ref as string)
    this.ctx.emit('credentials/reference-updated', ref)
    return Promise.resolve()
  }
  readRecord(_key: CredentialKey): Promise<CredentialRecord | undefined> { return Promise.resolve(undefined) }
  describeRecord(_key: CredentialKey): Promise<CredentialRecordInfo> {
    return Promise.resolve({ configured: false, writable: true })
  }
  listRecords(): Promise<readonly CredentialRecordEntry[]> { return Promise.resolve([]) }
  modifyRecord(
    _key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ) { return mutate(undefined) }
  deleteRecord(_key: CredentialKey) { return Promise.resolve() }
}

/**
 * Two relays, two credential references, disjoint model sets, and no `providers`
 * schema default standing between them — every route this file asserts on is
 * one this bundle published for a provider the CONFIGURATION named.
 */
function multiProviderConfig() {
  return {
    providers: [
      {
        id: 'relay-a',
        displayName: 'Relay A',
        baseURL: 'https://a.example.com',
        apiKeyEnv: 'RELAY_A_KEY',
        models: [{ id: 'claude-opus-5', protocol: 'claude-code' as const }],
      },
      {
        id: 'relay-b',
        displayName: 'Relay B',
        baseURL: 'https://b.example.com',
        apiKeyEnv: 'RELAY_B_KEY',
        models: [{ id: 'gpt-5.6-sol', protocol: 'codex-responses' as const }],
      },
    ],
  }
}

function withoutAmbientKey<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env[DEFAULT_API_KEY_ENV]
  delete process.env[DEFAULT_API_KEY_ENV]
  return run().finally(() => {
    if (previous === undefined) delete process.env[DEFAULT_API_KEY_ENV]
    else process.env[DEFAULT_API_KEY_ENV] = previous
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('Cordis plugin lifecycle', () => {
  it('registers the catalog, retry policy, and discovery once a key exists', async () => {
    await withoutAmbientKey(async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [
        { id: 'claude-opus-5' },
        { id: 'gpt-5.6-sol' },
        { id: 'gemini-2.5-pro' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } })))
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(MemoryCredentials)
      ;(ctx.get('credentials') as MemoryCredentials).present = true
      const fiber = await ctx.plugin(anyrouter, {
        models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
      })
      await settled()

      await expect(ctx.llm.listModels('anyrouter')).resolves.toEqual([
        expect.objectContaining({ id: 'claude-opus-5' }),
      ])
      expect(ctx.llm.providerRetryPolicy('anyrouter')).toMatchObject({ mode: 'normal', maxRetries: 5 })
      await expect(ctx.llm.discoverModels(SETTINGS_NS, {
        provider: 'anyrouter',
        baseURL: 'https://anyrouter.top',
        apiKey: 'sk-draft',
      })).resolves.toEqual([
        expect.objectContaining({ id: 'claude-opus-5' }),
        expect.objectContaining({ id: 'gpt-5.6-sol' }),
      ])
      expect(ctx.llm.listProviders().map(provider => provider.id)).toContain('anyrouter')

      await fiber.dispose()
      await expect(ctx.llm.listModels('anyrouter')).rejects.toThrow(/not registered|no adapter/i)
    })
  })

  it('stays dormant without a key: declared, discoverable, but absent from the selector', async () => {
    await withoutAmbientKey(async () => {
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(MemoryCredentials)
      const fiber = await ctx.plugin(anyrouter, {
        models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
      })
      await settled()

      expect(ctx.llm.listProviders()).toEqual([])
      expect(ctx.llm.listConfigurableProviders().map(entry => entry.provider)).toContain('anyrouter')
      // The directory entry's settings namespace is what a browser settings
      // surface looks the form up by, so it must be the profile entry id.
      const directory = ctx.llm.listConfigurableProviders().find(entry => entry.provider === 'anyrouter')
      expect(directory?.settingsNs).toBe(patchEntryId())
      expect(directory?.settingsNs).toBe(SETTINGS_NS)
      expect(directory?.settingsPath).toEqual([])
      await expect(ctx.llm.listModels('anyrouter')).rejects.toThrow(/not registered|no adapter/i)

      await fiber.dispose()
    })
  })

  it('honors the 0.1.7 bare-signal discovery signature', async () => {
    await withoutAmbientKey(async () => {
      // A listing that would succeed if the signal were dropped: an ABORTED
      // rejection is therefore evidence the callback read its second argument.
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [
        { id: 'claude-opus-5' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } })))
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(MemoryCredentials)
      ;(ctx.get('credentials') as MemoryCredentials).present = true
      await ctx.plugin(anyrouter, {
        models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
      })
      await settled()

      const controller = new AbortController()
      controller.abort(new Error('cancelled'))
      await expect(ctx.llm.discoverModels(SETTINGS_NS, {
        provider: 'anyrouter',
        baseURL: 'https://anyrouter.top',
        apiKey: 'sk-draft',
      }, controller.signal)).rejects.toMatchObject({ code: 'ABORTED' })
    })
  })

  it('a missing ambient key keeps the route dormant without a credentials service', async () => {
    await withoutAmbientKey(async () => {
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      const fiber = await ctx.plugin(anyrouter, {
        models: [{ id: 'gpt-5.6-sol', protocol: 'codex-responses' }],
      })
      await settled()
      expect(ctx.llm.listProviders()).toEqual([])
      await fiber.dispose()
    })
  })

  it('an ambient key activates the route without a credentials service', async () => {
    const previous = process.env[DEFAULT_API_KEY_ENV]
    process.env[DEFAULT_API_KEY_ENV] = 'sk-ambient'
    try {
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      const fiber = await ctx.plugin(anyrouter, {
        models: [{ id: 'gpt-5.6-sol', protocol: 'codex-responses' }],
      })
      await settled()
      await expect(ctx.llm.listModels('anyrouter')).resolves.toHaveLength(1)
      await fiber.dispose()
    } finally {
      if (previous === undefined) delete process.env[DEFAULT_API_KEY_ENV]
      else process.env[DEFAULT_API_KEY_ENV] = previous
    }
  })

  it('tracks a preconfigured credentials service mounted after the provider plugin', async () => {
    await withoutAmbientKey(async () => {
      class PreconfiguredCredentials extends MemoryCredentials {
        override present = true
      }

      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(anyrouter, {
        models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
      })
      await settled()
      expect(ctx.llm.listProviders()).toEqual([])

      const credentialsFiber = await ctx.plugin(PreconfiguredCredentials)
      await settled()
      await expect(ctx.llm.listModels('anyrouter')).resolves.toHaveLength(1)

      await credentialsFiber.dispose()
      await settled()
      expect(ctx.llm.listProviders()).toEqual([])
      await expect(ctx.llm.listModels('anyrouter')).rejects.toThrow(/not registered|no adapter/i)
    })
  })

  it('credential updates swap the route live', async () => {
    await withoutAmbientKey(async () => {
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(MemoryCredentials)
      const credentials = ctx.get('credentials') as MemoryCredentials
      await ctx.plugin(anyrouter, {
        models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
      })
      await settled()
      expect(ctx.llm.listProviders()).toEqual([])

      await credentials.set(credentialRef(DEFAULT_API_KEY_ENV), 'sk-test')
      await settled()
      await expect(ctx.llm.listModels('anyrouter')).resolves.toHaveLength(1)

      await credentials.unset(credentialRef(DEFAULT_API_KEY_ENV))
      await settled()
      expect(ctx.llm.listProviders()).toEqual([])
      await expect(ctx.llm.listModels('anyrouter')).rejects.toThrow(/not registered|no adapter/i)
    })
  })

  it('mounts and keeps serving while one provider is only half described', async () => {
    // Regression for the reported "add a provider, press save, lose everything".
    // The settings section writes a LIVE configuration, so a relay the user has
    // just added — no endpoint yet — is a state the Host has to survive. It used
    // to make `resolveConfig` throw; the write itself still succeeded, so the
    // throw landed on the next resolve, and at mount time there is no last-good
    // configuration to absorb it: `apply()` threw and the plugin never loaded.
    await withoutAmbientKey(async () => {
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(PerRefCredentials)
      const credentials = ctx.get('credentials') as PerRefCredentials
      await credentials.set(credentialRef('RELAY_A_KEY'), 'sk-a')
      await ctx.plugin(anyrouter, {
        providers: [
          {
            id: 'relay-a',
            displayName: 'Relay A',
            baseURL: 'https://a.example.com',
            apiKeyEnv: 'RELAY_A_KEY',
            models: [{ id: 'claude-opus-5', protocol: 'claude-code' as const }],
          },
          // Exactly what 「新增提供商」 produces before the user fills it in.
          { id: 'relay-2', displayName: 'relay-2', models: [] },
        ],
      })
      await settled()

      // The half-described relay is still OFFERED — it is the row the user needs
      // in order to fix it — carrying the directory's own repair diagnostic.
      expect(ctx.llm.listConfigurableProviders().map(entry => entry.provider).sort())
        .toEqual(['relay-2', 'relay-a'])
      expect(ctx.llm.listConfigurableProviders().find(entry => entry.provider === 'relay-2')?.error)
        .toMatch(/needs a baseURL/)

      // ...while the healthy relay is entirely unaffected.
      expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['relay-a'])
      await expect(ctx.llm.listModels('relay-a')).resolves.toHaveLength(1)
      await expect(ctx.llm.listModels('relay-2')).rejects.toThrow(/not registered|no adapter/i)
    })
  })

  it('registers one route per keyed provider, each serving only its own models', async () => {
    await withoutAmbientKey(async () => {
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(PerRefCredentials)
      const credentials = ctx.get('credentials') as PerRefCredentials
      await ctx.plugin(anyrouter, multiProviderConfig())
      await settled()

      // Configuration alone publishes the DIRECTORY: both relays are offered —
      // and therefore editable — before either one has a key. Naming is per
      // entry because the directory is keyed on `provider`, not on `settingsNs`,
      // so several entries legitimately share this bundle's one settings form.
      expect(ctx.llm.listConfigurableProviders().map(entry => entry.provider).sort())
        .toEqual(['relay-a', 'relay-b'])
      expect(ctx.llm.listConfigurableProviders().every(entry => entry.settingsNs === SETTINGS_NS)).toBe(true)
      expect(ctx.llm.listProviders()).toEqual([])

      await credentials.set(credentialRef('RELAY_A_KEY'), 'sk-a')
      await settled()

      // Only the keyed relay became a route, and it serves only its own models.
      expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['relay-a'])
      await expect(ctx.llm.listModels('relay-a')).resolves.toEqual([
        expect.objectContaining({ provider: 'relay-a', id: 'claude-opus-5' }),
      ])
      await expect(ctx.llm.listModels('relay-b')).rejects.toThrow(/not registered|no adapter/i)

      await credentials.set(credentialRef('RELAY_B_KEY'), 'sk-b')
      await settled()
      expect(ctx.llm.listProviders().map(provider => provider.id).sort()).toEqual(['relay-a', 'relay-b'])
      await expect(ctx.llm.listModels('relay-b')).resolves.toEqual([
        expect.objectContaining({ provider: 'relay-b', id: 'gpt-5.6-sol' }),
      ])

      // Losing one key must not disturb the surviving route: the route set is
      // recomputed per provider, never torn down wholesale.
      await credentials.unset(credentialRef('RELAY_A_KEY'))
      await settled()
      expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['relay-b'])
      await expect(ctx.llm.listModels('relay-b')).resolves.toHaveLength(1)
    })
  })

  it('treats an emptied provider list as authoritative over the legacy fields', async () => {
    await withoutAmbientKey(async () => {
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(MemoryCredentials)
      ;(ctx.get('credentials') as MemoryCredentials).present = true
      await ctx.plugin(anyrouter, {
        providers: [],
        models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
      })
      await settled()

      // `[]` is the user having removed every relay. Folding it into the legacy
      // migration would resurrect that route, and its models, on every read.
      expect(ctx.llm.listConfigurableProviders()).toEqual([])
      expect(ctx.llm.listProviders()).toEqual([])
    })
  })

  it('routes model discovery through the provider the request names', async () => {
    await withoutAmbientKey(async () => {
      const calls: string[] = []
      vi.stubGlobal('fetch', vi.fn(async (input: any) => {
        calls.push(String(input))
        return new Response(JSON.stringify({ data: [{ id: 'gpt-5.6-sol' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }))
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(PerRefCredentials)
      const credentials = ctx.get('credentials') as PerRefCredentials
      await credentials.set(credentialRef('RELAY_B_KEY'), 'sk-b')
      await ctx.plugin(anyrouter, multiProviderConfig())
      await settled()

      // The stored credential is only ever sent to the endpoint it was saved
      // for, so a draft endpoint must bring its own key. No request is made.
      await expect(ctx.llm.discoverModels(SETTINGS_NS, {
        provider: 'relay-b',
        baseURL: 'https://elsewhere.example.com',
      })).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' })
      expect(calls).toEqual([])

      // Naming a configured relay uses that relay's stored endpoint and key —
      // and only that relay's.
      await expect(ctx.llm.discoverModels(SETTINGS_NS, { provider: 'relay-b' }))
        .resolves.toEqual([expect.objectContaining({ id: 'gpt-5.6-sol' })])
      expect(calls).toEqual(['https://b.example.com/v1/models'])

      // A relay that is not configured yet has no stored endpoint and no stored
      // key, so the draft has to supply both — which is exactly the shape the
      // settings section uses to add one.
      await expect(ctx.llm.discoverModels(SETTINGS_NS, {
        provider: 'relay-c',
        baseURL: 'https://c.example.com',
        apiKey: 'sk-c',
      })).resolves.toEqual([expect.objectContaining({ id: 'gpt-5.6-sol' })])
      expect(calls[1]).toBe('https://c.example.com/v1/models')
    })
  })
})
