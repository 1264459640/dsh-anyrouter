import type { Context } from '@deepseek-ai/cordis'
// Type-only: this import exists for the `loader/*` event augmentation on
// `Context`, not for a runtime value. It is a declared optional peer, so the
// import is erased at build time and a bundle deployed without it still runs.
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { isDeepStrictEqual } from 'node:util'
import { AnyRouterAdapter } from './adapter.ts'
import {
  PROVIDER,
  SETTINGS_NS,
  plainOptions,
  resolveConfig,
  type Config as AnyRouterConfig,
  type Options as AnyRouterOptions,
  type ResolvedConfig,
} from './config.ts'
import { discoverAnyRouterModels } from './discovery.ts'
import { proxyFetch } from './proxy-transport.ts'

export { AnyRouterAdapter } from './adapter.ts'
export { Config, plainOptions, resolveConfig } from './config.ts'
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
    Object.is(left.apiKeyEnv, right.apiKeyEnv)
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
  // The directory entry is unconditional: configuration surfaces can offer
  // the provider (dormant, `active: false`) before any key exists. The route
  // itself is keyed on the credential — without a key the adapter stays
  // unregistered, so the model selector drops the whole group.
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'AnyRouter', settingsNs: SETTINGS_NS, settingsPath: [] },
  ])

  const keyPresent = async (): Promise<boolean> => {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(options().apiKeyEnv)
      return hit !== undefined && hit.value.length > 0
    }
    // Without the service the environment is the whole credential plane, and
    // it is immutable at runtime — the boot evaluation below is final.
    const ambient = launchEnvironmentOf(ctx).get(options().apiKeyEnv)
    return ambient !== undefined && ambient.value.length > 0
  }

  let registration: ReturnType<typeof ctx.llm.registerAdapter> | undefined
  let registeredPolicy: ReturnType<typeof options>['retryPolicy'] | undefined
  let evaluating = false
  let dirty = false
  let disposed = false
  const ensureRoute = async (): Promise<void> => {
    if (disposed) return
    if (evaluating) {
      dirty = true
      return
    }
    evaluating = true
    try {
      let present: boolean
      try {
        present = await keyPresent()
      } catch (error) {
        ctx.logger.error('dsh-anyrouter: credential presence check failed; keeping the current route state')
        ctx.logger.error(error)
        return
      }
      if (disposed) return
      if (!present) {
        if (registration !== undefined) {
          registration()
          registration = undefined
          registeredPolicy = undefined
        }
        return
      }
      const policy = options().retryPolicy
      if (registration === undefined) {
        registration = ctx.llm.registerAdapter([PROVIDER], adapter)
        registeredPolicy = policy
        return
      }
      if (registeredPolicy === undefined || !isDeepStrictEqual(policy, registeredPolicy)) {
        registration.replace([PROVIDER])
        registeredPolicy = policy
      }
    } finally {
      evaluating = false
      if (dirty && !disposed) {
        dirty = false
        void ensureRoute()
      }
    }
  }
  ctx.effect(() => () => { disposed = true }, 'dsh-anyrouter: route activation lifecycle')
  const scheduleRouteCheck = (): void => { void ensureRoute() }
  void ensureRoute()
  // The bundle can start before the credentials provider. Re-evaluate when that
  // service becomes active (or disappears), otherwise a persisted key loaded
  // later leaves the provider directory visible but the selector route dormant.
  ctx.inject(['credentials'], () => {
    scheduleRouteCheck()
    return () => scheduleRouteCheck()
  })
  ctx.on('credentials/reference-updated', ref => {
    if ((ref as string) === (options().apiKeyEnv as string)) scheduleRouteCheck()
  })
  // A live settings edit is committed into the running configuration
  // references without remounting this plugin, so this Loader event is the
  // only signal that the resolved options — and with them the retry policy
  // captured inside the adapter registration — may have changed.
  onLoaderEvent(ctx, 'loader/volatile-update', scheduleRouteCheck)

  ctx.llm.registerModelDiscovery(SETTINGS_NS, async (request, signal) => {
    const resolved = options()
    const apiKey = request.apiKey ?? await resolveApiKey(resolved.apiKeyEnv)
    return discoverAnyRouterModels({
      baseURL: request.baseURL?.trim() || resolved.baseURL,
      apiKey,
      // Discovery talks to the same endpoint the route does, so it tunnels
      // through the same proxy. The `remote.llm.discoverModels` call carries the
      // settings form's draft endpoint but cannot carry a draft proxy — the Host
      // owns that signature — so the form saves the proxy before it syncs.
      fetch: proxyFetch(resolved.proxy),
      ...signal === undefined ? {} : { signal },
    })
  })
}
