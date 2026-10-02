import { describe, expect, it } from 'vitest'
import { AnyRouterAdapter, providerProfileOf } from '../src/adapter.ts'
import { resolveConfig, isUsable } from '../src/config.ts'
import { MODEL_PROFILES_BY_ID } from '../src/model-profiles.generated.ts'

function adapter() {
  const config = resolveConfig({
    models: [
      { id: 'claude-opus-5', protocol: 'claude-code' },
      { id: 'gpt-5.6-sol', protocol: 'codex-responses' },
    ],
  })
  return new AnyRouterAdapter({
    config: () => config,
    resolveApiKey: async () => 'sk-test',
  })
}

describe('AnyRouterAdapter catalog', () => {
  it('advertises synchronized models and exact capacities', async () => {
    const subject = adapter()
    await expect(subject.listModels('anyrouter')).resolves.toEqual([
      expect.objectContaining({ provider: 'anyrouter', id: 'claude-opus-5' }),
      expect.objectContaining({ provider: 'anyrouter', id: 'gpt-5.6-sol' }),
    ])
    await expect(subject.resolveModel('anyrouter', 'claude-opus-5')).resolves.toMatchObject({
      provider: 'anyrouter',
      id: 'claude-opus-5',
      context: { contextWindow: 1_000_000 },
      reasoning: {
        // The selectable set is the GENERATED reference profile's own effort
        // list, not a hand-written expectation: pi-ai's own catalog decides
        // which levels a given model supports, and it moves between releases
        // (first-party Anthropic no longer advertises `off` for its adaptive
        // models, and pi-ai 0.87 dropped `minimal` for the GPT-5.4 rows), so
        // asserting a literal list here would pin the catalog, not this
        // adapter's projection of it.
        efforts: MODEL_PROFILES_BY_ID.get('claude-opus-5')!.efforts
          .map(effort => expect.objectContaining({ id: effort })),
      },
    })
  })

  it('projects every catalog-declared level for a stateful model', async () => {
    // `claude-sonnet-4.5` is budget-thinking (not adaptive), so its reference
    // profile still declares `off`. It is the shape that proves the `off`
    // level reaches the selector at all.
    const config = resolveConfig({
      models: [{ id: 'claude-sonnet-4.5', protocol: 'claude-code' }],
    })
    const subject = new AnyRouterAdapter({ config: () => config, resolveApiKey: async () => 'sk-test' })
    const reference = MODEL_PROFILES_BY_ID.get('claude-sonnet-4.5')!
    expect(reference.efforts).toContain('off')
    await expect(subject.resolveModel('anyrouter', 'claude-sonnet-4.5')).resolves.toMatchObject({
      reasoning: {
        efforts: reference.efforts.map(effort => expect.objectContaining({ id: effort })),
      },
    })
  })

  it('surfaces the persisted default effort per model', async () => {
    const config = resolveConfig({
      models: [
        { id: 'claude-opus-5', protocol: 'claude-code', reasoning: { efforts: ['medium', 'high'], defaultEffort: 'medium' } },
        { id: 'gpt-5.6-sol', protocol: 'codex-responses', reasoning: { efforts: ['low', 'high'] } },
      ],
    })
    const subject = new (await import('../src/adapter.ts')).AnyRouterAdapter({
      config: () => config,
      resolveApiKey: async () => 'sk-test',
    })
    await expect(subject.resolveModel('anyrouter', 'claude-opus-5')).resolves.toMatchObject({
      reasoning: expect.objectContaining({ defaultEffort: 'medium' }),
    })
    await expect(subject.resolveModel('anyrouter', 'gpt-5.6-sol')).resolves.toMatchObject({
      reasoning: expect.not.objectContaining({ defaultEffort: expect.anything() }),
    })
  })

  it('publishes the dedicated provider name and retry policy', () => {
    const subject = adapter()
    expect(subject.providerInfo('anyrouter')).toEqual({ id: 'anyrouter', name: 'AnyRouter' })
    expect(subject.providerRetryPolicy('anyrouter')).toMatchObject({ mode: 'normal', maxRetries: 5 })
  })
})

describe('seam profile contract', () => {
  /**
   * `@deepseek-ai/dsh-llm-pi-ai@0.1.7-rc.2` declares both maps as REQUIRED on
   * `ResolvedPiAiProviderProfile` (`lib/types/config.d.ts:172` `modelErrors`
   * and `:178` `configuredMaxTokens`), so their absence is now a compile error
   * as well as a runtime failure. The seam dereferences them before it builds
   * any request or the model catalog the selector renders, where an absent map
   * fails the entire route with "Cannot read properties of undefined (reading
   * 'get')". This test pins the runtime values, which the type alone cannot.
   */
  it('carries every adapter-owned collection the seam reads unconditionally', () => {
    const configured = resolveConfig({
      models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
    }).providers[0]!
    // The profile is only defined for a provider resolution deemed usable, which
    // is exactly the invariant the type guard encodes.
    if (!isUsable(configured)) throw new Error(`expected a usable provider, got: ${configured.error}`)
    const profile = providerProfileOf(configured)
    expect(profile.modelErrors).toBeInstanceOf(Map)
    expect(profile.modelErrors.size).toBe(0)
    expect(profile.configuredMaxTokens).toBeInstanceOf(Map)
    expect(profile.piProvider).toBeDefined()
  })
})
