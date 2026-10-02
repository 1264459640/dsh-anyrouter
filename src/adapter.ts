import { createProvider, type Api, type Model, type Provider } from '@earendil-works/pi-ai'
import { PiAiAdapter, type PiAiAdapterOptions, type ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { ResolvedConfig, ResolvedProviderConfig, UsableProvider } from './config.ts'
import { isUsable } from './config.ts'
import { effectiveReasoning, resolveModel } from './catalog.ts'
import { proxyFetch } from './proxy-transport.ts'
import {
  createClaudeCodeStreams,
  type ClaudeCodeTransportOptions,
} from './transports/claude.ts'
import {
  createCodexResponsesStreams,
  type CodexTransportOptions,
} from './transports/codex.ts'

const ambientAuth = {
  apiKey: {
    name: 'Provider API key',
    resolve: ({ credential }: { credential?: { key?: string } }) => Promise.resolve(
      credential?.key === undefined
        ? undefined
        : { auth: { apiKey: credential.key }, source: 'DSH credential seam' },
    ),
  },
}

/**
 * Build the pi-ai provider for ONE configured relay.
 *
 * Everything route-specific is read from `provider` and closed over per
 * instance — the endpoint, the model set, the proxy, the identity the two
 * transports claim, and the extra betas they advertise. Nothing here is a
 * module constant any more, which is the whole point: one adapter instance
 * serves a map of these, so two relays can never share an identity or a tunnel.
 * @param provider - one resolved provider that passed `isUsable`.
 * @returns the pi-ai provider this route answers through.
 */
function providerOf(provider: UsableProvider): Provider {
  const models: Model<Api>[] = provider.models.map(model => resolveModel(model, provider.baseURL, provider.id))
  // Both transports resolve their `fetch` per request from this closure, so the
  // proxy is read from this route's *current* resolved config rather than
  // captured at provider-construction time — a live settings edit reaches the
  // next request without remounting the route. `proxyFetch(undefined)` is the
  // global `fetch`, so an unproxied route is byte-for-byte the pre-proxy
  // behaviour.
  const resolveFetch = (): typeof globalThis.fetch => proxyFetch(provider.proxy)
  // The only per-route fact either transport takes is the route id it answers
  // as: the version claim and the complete header set belong to the transport,
  // not to a provider's configuration.
  const claude: ClaudeCodeTransportOptions = { providerId: provider.id }
  const codex: CodexTransportOptions = { providerId: provider.id }
  return createProvider({
    id: provider.id,
    name: provider.displayName,
    baseUrl: provider.baseURL,
    auth: ambientAuth,
    models,
    api: {
      'anthropic-messages': createClaudeCodeStreams(resolveFetch, claude),
      'openai-responses': createCodexResponsesStreams(resolveFetch, codex),
    },
  })
}

/**
 * The resolved profile this route hands the seam. `modelErrors` and
 * `configuredMaxTokens` are adapter-owned and dereferenced before every
 * request and every model-catalog projection; the seam requires both, so the
 * alias now only names the Host's own type rather than widening it. Older
 * Hosts that predate the maps ignore the extra keys, so one profile shape
 * serves every supported release.
 */
export type HostResolvedProfile = ResolvedPiAiProviderProfile

/**
 * The resolved profile for ONE provider, in the shape the seam publishes. The
 * adapter builds one of these per configured route and keys them by
 * `profile.provider`, so this function — not the adapter — owns everything a
 * single route needs to be addressable.
 *
 * Exported for the contract tests that pin the adapter-owned fields: the seam
 * dereferences `modelErrors` and `configuredMaxTokens` before a request, so an
 * absent map fails the whole route — including the model catalog the selector
 * renders — with "Cannot read properties of undefined (reading 'get')".
 * @param provider - one resolved provider that passed `isUsable`.
 * @returns that route's profile, ready for `PiAiAdapter`.
 */
export function providerProfileOf(provider: UsableProvider): HostResolvedProfile {
  const profile: HostResolvedProfile = {
    provider: provider.id,
    displayName: provider.displayName,
    apiKeyEnv: provider.apiKeyEnv,
    baseURL: provider.baseURL,
    streamIdleTimeoutMs: provider.streamIdleTimeoutMs,
    maxRequestImageBytes: 32 * 1024 * 1024,
    requestImagePixelBudget: 100_000_000,
    requestImageMaxBytes: 32 * 1024 * 1024,
    retryPolicy: provider.retryPolicy,
    piProvider: providerOf(provider),
    // Both maps are read unconditionally by the seam: `modelErrors` before every
    // request and catalog projection, and `configuredMaxTokens` when a request
    // names no cap of its own. This route builds its models from validated
    // settings, so it reports no per-model construction failure and configures
    // no cap here.
    modelErrors: new Map(),
    configuredMaxTokens: new Map(),
    transport: 'sse',
  }
  return profile
}

export class AnyRouterAdapter extends PiAiAdapter {
  constructor(options: {
    config: () => ResolvedConfig
    resolveApiKey: (ref: CredentialRef) => Promise<string>
    resolveAttachments?: () => AttachmentStore | undefined
  }) {
    let snapshotConfig: ResolvedConfig | undefined
    let snapshotProfiles: ReadonlyMap<string, ResolvedPiAiProviderProfile> | undefined
    // One sealed snapshot per resolved configuration, keyed by provider route.
    // `options.config()` is memoized upstream on the values behind the live
    // references, so an unchanged configuration keeps its identity and this
    // rebuilds only when something really moved. A configuration change
    // therefore builds a NEW map rather than mutating the one in use, and a
    // request that started under one configuration never finishes under another.
    const profiles = (): ReadonlyMap<string, ResolvedPiAiProviderProfile> => {
      const config = options.config()
      if (config === snapshotConfig && snapshotProfiles !== undefined) return snapshotProfiles
      snapshotConfig = config
      snapshotProfiles = new Map(
        // A disabled provider — one the user has not finished describing — gets
        // no profile at all. Its route is not registered either, so the seam
        // never sees an id it would have to answer for.
        config.providers.filter(isUsable).map(provider => [provider.id, providerProfileOf(provider)]),
      )
      return snapshotProfiles
    }
    const auth: PiAiAdapterOptions['auth'] = {
      credentials: {
        read: () => Promise.resolve(undefined),
        list: () => Promise.resolve([]),
        modify: (_providerId: string, update: (current: undefined) => Promise<undefined>) => update(undefined),
        delete: () => Promise.resolve(),
      },
      authContext: {
        env: (name: string) => Promise.resolve(process.env[name]),
        fileExists: () => Promise.resolve(false),
      },
    }
    super({
      profiles,
      resolveApiKey: async (_provider, profile) => {
        if (profile.apiKeyEnv === undefined) throw new Error('dsh-anyrouter: resolved profile lost its credential ref')
        return options.resolveApiKey(profile.apiKeyEnv)
      },
      auth,
      resolveAttachments: options.resolveAttachments ?? (() => undefined),
    })
    this.modelOptions = options
  }

  private readonly modelOptions: {
    config: () => ResolvedConfig
    resolveApiKey: (ref: CredentialRef) => Promise<string>
    resolveAttachments?: () => AttachmentStore | undefined
  }

  /**
   * Surface the per-model default effort the persisted reasoning profile
   * carries. The generic adapter can only mark a profile-wide default, which
   * for a multi-model route like this one would be wrong for every model but
   * one; patching the resolved info keeps the selector's marked default equal
   * to what the settings section saved.
   *
   * The lookup is scoped to the route the request came in on: with several
   * relays configured, the same model id may exist under more than one, and
   * each carries its own saved profile.
   */
  override async resolveModel(provider: string, model: string, signal?: AbortSignal) {
    const info = await super.resolveModel(provider, model, signal)
    if (info.reasoning === undefined) return info
    const row = this.modelOptions.config().providers
      .find(candidate => candidate.id === provider)?.models
      .find(candidate => candidate.id === model)
    const defaultEffort = row === undefined ? undefined : effectiveReasoning(row).defaultEffort
    if (row === undefined || defaultEffort === undefined) return info
    return {
      ...info,
      reasoning: { ...info.reasoning, defaultEffort: ReasoningEffortId(defaultEffort) },
    }
  }
}
