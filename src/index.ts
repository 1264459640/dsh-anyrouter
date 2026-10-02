import type { Context } from '@deepseek-ai/cordis'
// Type-only: this import exists for the `loader/*` event augmentation on
// `Context`, not for a runtime value. It is a declared optional peer, so the
// import is erased at build time and a bundle deployed without it still runs.
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import {
  assertUsableApiKey,
  LlmError,
  type AdapterRegistrationHandle,
  type DirectoryRegistrationHandle,
} from '@deepseek-ai/dsh-llm'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { isDeepStrictEqual } from 'node:util'
import { AnyRouterAdapter } from './adapter.ts'
import {
  isUsable,
  PROVIDER,
  SETTINGS_NS,
  normalizeBaseURL,
  plainOptions,
  resolveConfig,
  type Config as AnyRouterConfig,
  type Options as AnyRouterOptions,
  type ResolvedConfig,
  type UsableProvider,
} from './config.ts'
import { discoverAnyRouterModels } from './discovery.ts'
import { proxyFetch } from './proxy-transport.ts'

export { AnyRouterAdapter } from './adapter.ts'
export {
  Config,
  defaultApiKeyEnvFor,
  normalizeProviderId,
  plainOptions,
  resolveConfig,
} from './config.ts'
export { discoverAnyRouterModels } from './discovery.ts'
export { isLoopbackHost, normalizeProxyURL, redactProxyURL } from './proxy.ts'
export { disposeProxyAgents, proxyFetch } from './proxy-transport.ts'
export {
  claudeCodeStreams,
  codexResponsesStreams,
  createClaudeCodeStreams,
  createCodexResponsesStreams,
} from './transports/index.ts'
export type * from './types.ts'

export const name = 'dsh-anyrouter'
export const inject = ['llm']

/**
 * Subscribe to one Loader event. `loader/volatile-update` is declared by
 * `@deepseek-ai/cordis-plugin-loader`'s event augmentation, which the type-only
 * import above brings into scope; `ctx.on` therefore registers the listener on
 * this plugin's fiber, which disposes it with the plugin.
 * @param ctx - the plugin's own context.
 * @param event - the Loader event name to listen for.
 * @param listener - called on every dispatch of that event.
 */
function onLoaderEvent(ctx: Context, event: 'loader/volatile-update', listener: () => void): void {
  ctx.on(event, () => listener())
}

/**
 * A route-set signature: the ids that currently hold a key, each paired with
 * the retry policy that was in force when it was registered.
 *
 * The Host captures a route's retry policy when it registers the route rather
 * than re-reading it per request, so a policy edit only reaches the registry
 * through `registration.replace()`. Comparing this string is what decides
 * whether that replacement is needed: an edit that changes neither the active
 * key set nor any policy leaves the registration alone.
 * @param providers - the providers whose keys resolved.
 * @returns a stable signature for that route set.
 */
function routeSignature(providers: readonly UsableProvider[]): string {
  return providers.map(provider => `${provider.id}\u0000${JSON.stringify(provider.retryPolicy)}`).join('\u0001')
}

export function apply(ctx: Context, config: AnyRouterConfig): void {
  // A live settings edit is committed into `config`'s references in place, so
  // the configuration object's identity survives it. The resolved options are
  // therefore memoized on the values behind those references: a reference
  // holding an unchanged snapshot keeps its identity, and any real change
  // produces a new one.
  let goodFrom: AnyRouterOptions | undefined
  let lastGood: ResolvedConfig | undefined
  let badFrom: AnyRouterOptions | undefined
  const sameOptions = (left: AnyRouterOptions, right: AnyRouterOptions): boolean =>
    Object.is(left.providers, right.providers)
    && Object.is(left.apiKeyEnv, right.apiKeyEnv)
    && Object.is(left.baseURL, right.baseURL)
    && Object.is(left.proxy, right.proxy)
    && Object.is(left.models, right.models)
    && Object.is(left.streamIdleTimeoutMs, right.streamIdleTimeoutMs)
    && Object.is(left.retryPolicy, right.retryPolicy)
  const options = (): ResolvedConfig => {
    const raw = plainOptions(config)
    if (lastGood !== undefined) {
      if (goodFrom !== undefined && sameOptions(raw, goodFrom)) return lastGood
      if (badFrom !== undefined && sameOptions(raw, badFrom)) return lastGood
    }
    try {
      const next = resolveConfig(raw)
      goodFrom = raw
      lastGood = next
      badFrom = undefined
      return next
    } catch (error) {
      if (lastGood === undefined) throw error
      badFrom = raw
      ctx.logger.error('dsh-anyrouter: keeping the last good configuration after an invalid settings update')
      ctx.logger.error(error)
      return lastGood
    }
  }
  options()

  const resolveApiKey = async (ref: CredentialRef): Promise<string> => {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      if (hit !== undefined) return assertUsableApiKey(hit.value, 'dsh-anyrouter', ref)
    } else {
      const ambient = launchEnvironmentOf(ctx).get(ref)
      if (ambient !== undefined && ambient.value.length > 0) {
        return assertUsableApiKey(ambient.value, 'dsh-anyrouter', ref)
      }
    }
    throw new LlmError(
      `dsh-anyrouter: no API key; store ${ref} in the credentials service or export it before launching DSH`,
      'MISSING_CREDENTIAL',
    )
  }

  const adapter = new AnyRouterAdapter({
    config: options,
    resolveApiKey,
    resolveAttachments: () => ctx.get('attachments'),
  })

  let disposed = false
  let directory: DirectoryRegistrationHandle | undefined
  /**
   * Publish one directory entry per configured provider.
   *
   * The directory is what lets a configuration surface offer the provider
   * (dormant, `active: false`) before any key exists, so every configured
   * provider is listed unconditionally — including one whose key is missing or
   * unreadable. Naming is per provider because the directory is keyed on
   * `provider`, not on `settingsNs`: several entries share this bundle's one
   * settings form, which is exactly how a single section configures N relays.
   *
   * Entries are derived from the CONFIGURED providers rather than the active
   * ones, so adding a relay in the settings section makes it appear (and become
   * configurable) before a key is ever stored.
   *
   * That includes a provider the user has not finished describing. It is
   * published with `error` set — the directory's own repair diagnostic — rather
   * than withheld, because withholding it would take the very row the user needs
   * to fix out of the surface they use to fix it.
   */
  const syncDirectory = (): void => {
    if (disposed) return
    const entries = options().providers.map(provider => ({
      provider: provider.id,
      displayName: provider.displayName,
      settingsNs: SETTINGS_NS,
      settingsPath: [] as readonly string[],
      ...provider.error === undefined ? {} : { error: provider.error },
    }))
    try {
      if (entries.length === 0) {
        if (directory !== undefined) {
          directory()
          directory = undefined
        }
        return
      }
      // A first registration must be non-empty (`registerConfigurableProviders`
      // rejects an empty candidate set), which is why the empty case above is a
      // release rather than a `replace([])`.
      if (directory === undefined) directory = ctx.llm.registerConfigurableProviders(entries)
      else directory.replace(entries)
    } catch (error) {
      ctx.logger.error('dsh-anyrouter: keeping the previous provider directory after a rejected update')
      ctx.logger.error(error)
    }
  }

  const keyPresent = async (ref: CredentialRef): Promise<boolean> => {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      return hit !== undefined && hit.value.length > 0
    }
    // Without the service the environment is the whole credential plane, and
    // it is immutable at runtime — the boot evaluation below is final.
    const ambient = launchEnvironmentOf(ctx).get(ref)
    return ambient !== undefined && ambient.value.length > 0
  }

  /**
   * Whether a configured provider is also a registered route.
   *
   * The condition is the credential, not the configuration: a configured relay
   * with no key stays dormant (its models vanish from the selector) while
   * remaining listed and editable in the directory. Each provider is judged on
   * its own reference, so one relay going keyless never disturbs another.
   */
  let registration: AdapterRegistrationHandle | undefined
  let registeredSignature: string | undefined
  let evaluating = false
  let dirty = false
  const ensureRoute = async (): Promise<void> => {
    if (disposed) return
    if (evaluating) {
      dirty = true
      return
    }
    evaluating = true
    try {
      const providers = options().providers
      const active: UsableProvider[] = []
      try {
        for (const provider of providers) {
          // A provider still being filled in has no endpoint and no profile, so
          // it can hold no route however resolvable its credential is.
          if (isUsable(provider) && await keyPresent(provider.apiKeyEnv)) active.push(provider)
        }
      } catch (error) {
        ctx.logger.error('dsh-anyrouter: credential presence check failed; keeping the current route state')
        ctx.logger.error(error)
        return
      }
      if (disposed) return

      if (active.length === 0) {
        if (registration !== undefined) {
          registration()
          registration = undefined
          registeredSignature = undefined
        }
        return
      }

      const ids = active.map(provider => provider.id)
      const signature = routeSignature(active)
      try {
        if (registration === undefined) {
          // An initial registration must be non-empty, which the branch above
          // guarantees. A collision with another adapter (a user naming a relay
          // after a route another plugin already owns) throws here and is
          // reported rather than left to fail an unrelated request later.
          registration = ctx.llm.registerAdapter(ids, adapter)
          registeredSignature = signature
          return
        }
        if (registeredSignature !== signature) {
          // `replace` is the only path that re-reads retry policies: the Host
          // captured them at registration time. It is also atomic, so no request
          // observes a gap while the route set moves.
          registration.replace(ids)
          registeredSignature = signature
        }
      } catch (error) {
        ctx.logger.error('dsh-anyrouter: could not register the configured provider routes')
        ctx.logger.error(error)
      }
    } finally {
      evaluating = false
      if (dirty && !disposed) {
        dirty = false
        void ensureRoute()
      }
    }
  }

  /**
   * Re-publish the directory and re-evaluate routes after a configuration change,
   * reporting anything resolution had to drop.
   *
   * The diagnostics are logged once per distinct resolved configuration rather
   * than on every reconcile: `options()` memoizes on the values behind the live
   * references, so identity is exactly the "something really changed" signal and
   * a repeated settings write cannot spam the log with the same complaint.
   */
  let reportedConfig: ResolvedConfig | undefined
  const reconcileConfig = (): void => {
    const resolved = options()
    if (resolved !== reportedConfig) {
      reportedConfig = resolved
      for (const diagnostic of resolved.diagnostics) {
        ctx.logger.error(`dsh-anyrouter: ${diagnostic}`)
      }
      for (const provider of resolved.providers) {
        if (provider.error !== undefined) {
          ctx.logger.error(`dsh-anyrouter: provider ${JSON.stringify(provider.id)} is disabled: ${provider.error}`)
        }
      }
    }
    syncDirectory()
    void ensureRoute()
  }

  ctx.effect(() => () => { disposed = true }, 'dsh-anyrouter: route activation lifecycle')
  const scheduleRouteCheck = (): void => { void ensureRoute() }
  reconcileConfig()
  // The bundle can start before the credentials provider. Re-evaluate when that
  // service becomes active (or disappears), otherwise a persisted key loaded
  // later leaves the provider directory visible but the selector route dormant.
  ctx.inject(['credentials'], () => {
    scheduleRouteCheck()
    return () => scheduleRouteCheck()
  })
  ctx.on('credentials/reference-updated', ref => {
    // Only a reference this bundle actually uses can change a route's state;
    // an unrelated provider's credential event is not our business.
    if (options().providers.some(provider => (provider.apiKeyEnv as string) === (ref as string))) scheduleRouteCheck()
  })
  // A live settings edit is committed into the running configuration
  // references without remounting this plugin, so this Loader event is the
  // only signal that the resolved options — the provider set, the retry
  // policies captured inside the registration, and the directory entries — may
  // have changed.
  onLoaderEvent(ctx, 'loader/volatile-update', reconcileConfig)

  ctx.llm.registerModelDiscovery(SETTINGS_NS, async (request, signal) => {
    const resolved = options()
    // An unnnamed draft means "the section's own provider", which is the
    // migrated legacy route; a named one must be configured. A name that is
    // NOT yet configured is the "adding a relay" case: there is no stored
    // endpoint or credential to fall back on, so the draft must carry both.
    const stored = request.provider === undefined
      ? resolved.providers[0]
      : resolved.providers.find(provider => provider.id === request.provider)
    const draft = request.baseURL?.trim()
    const baseURL = draft ? normalizeBaseURL(draft) : stored?.baseURL
    if (baseURL === undefined) {
      throw new LlmError(
        'dsh-anyrouter: model discovery needs an endpoint; save the provider or supply a draft baseURL',
        'DISCOVERY_FAILED',
      )
    }
    // The stored credential is only ever sent to the endpoint it was saved
    // for. A draft endpoint must bring its own key, otherwise a caller could
    // exfiltrate the stored key simply by pointing discovery elsewhere.
    if (request.apiKey === undefined && baseURL !== stored?.baseURL) {
      throw new LlmError(
        'dsh-anyrouter: save the endpoint before syncing models, or supply an API key for the new endpoint',
        'INVALID_CREDENTIAL',
      )
    }
    const apiKey = request.apiKey
      ?? (stored === undefined ? undefined : await resolveApiKey(stored.apiKeyEnv))
    if (apiKey === undefined) {
      throw new LlmError(
        'dsh-anyrouter: no stored API key for this provider; supply one to sync its models',
        'MISSING_CREDENTIAL',
      )
    }
    return discoverAnyRouterModels({
      baseURL,
      apiKey,
      label: stored?.displayName ?? request.provider ?? PROVIDER,
      // Discovery talks to the same endpoint the route does, so it tunnels
      // through the same proxy. The `remote.llm.discoverModels` call carries the
      // settings form's draft endpoint but cannot carry a draft proxy — the Host
      // owns that signature — so the form saves the proxy before it syncs. A
      // relay that is not configured yet has no stored proxy to tunnel through.
      fetch: proxyFetch(stored?.proxy),
      ...signal === undefined ? {} : { signal },
    })
  })
}
