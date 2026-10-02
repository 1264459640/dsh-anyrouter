import z from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/cordis'
import { credentialRef, isCredentialRefName, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import {
  resolveRetryPolicy,
  RetryPolicySchema,
  type ResolvedRetryPolicy,
  type RetryPolicyConfig,
} from '@deepseek-ai/dsh-llm'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { isLoopbackHost, normalizeProxyURL } from './proxy.ts'

/**
 * The route id the legacy single-provider configuration migrates to. Nothing
 * downstream treats it as special any more — it is only the id the pre-`v0.5.0`
 * flat fields (`baseURL` / `proxy` / `models`) synthesize when a configuration
 * carries no `providers` array, so an upgraded install keeps answering on the
 * same route it always did.
 */
export const PROVIDER = 'anyrouter'
/**
 * The profile entry id this bundle owns, and therefore the configuration
 * namespace every provider in this bundle is configured through.
 * `cordis.patch.yml` inserts the entry as `dsh-anyrouter`, and the Host keys
 * every plugin configuration form by that entry id — `SettingsForms` reports
 * forms keyed by unique profile entry ids and resolves both reads and writes
 * through `entry.options.id` — so the id is the one string both the
 * configuration surface and the model-discovery directory are addressed by.
 *
 * It stays a SINGLE namespace even though a configuration may now declare many
 * providers: the directory keys entries by `provider`, not by `settingsNs`
 * (`@deepseek-ai/dsh-llm` `lib/index.js:1926`), so N provider entries may share
 * this one form.
 */
export const SETTINGS_NS = 'dsh-anyrouter'
export const DEFAULT_PROVIDER_ID = PROVIDER
export const DEFAULT_DISPLAY_NAME = 'AnyRouter'
export const DEFAULT_API_KEY_ENV = 'ANYROUTER_API_KEY'
export const DEFAULT_BASE_URL = 'https://anyrouter.top'
/**
 * No proxy. An empty value means this route connects directly, which is the
 * behaviour every release before this setting had, and keeps the harness's own
 * process-wide proxy policy (`@deepseek-ai/dsh-http-proxy`) in charge of
 * everything else.
 */
export const DEFAULT_PROXY = ''
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/** Wire routes this bundle can serve. Each is a pi-ai provider route id. */
export const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

export const REASONING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type ReasoningLevel = (typeof REASONING_LEVELS)[number]

export type AnyRouterProtocol = 'claude-code' | 'codex-responses'

/**
 * Persisted reasoning profile for one synchronized model. `efforts` is the
 * authoritative enable flag: an empty (or absent) list keeps whatever the
 * generated reference profile says, and a non-empty list replaces it.
 */
export interface ReasoningProfile {
  /** Explicitly offer the model without a reasoning control. */
  disabled?: boolean
  /** Selectable levels in canonical order; empty falls back to the reference. */
  efforts?: ReasoningLevel[]
  /** Level the model selector marks as default; must be one of `efforts`. */
  defaultEffort?: ReasoningLevel
  /** Claude-only: send adaptive `effort` instead of a thinking budget. */
  adaptive?: boolean
}

export interface AnyRouterModelConfig {
  id: string
  name?: string
  protocol: AnyRouterProtocol
  contextWindow?: number
  maxTokens?: number
  reasoning?: ReasoningProfile
}

/**
 * One relay this bundle speaks to. Every field but `id` is optional and falls
 * back to the bundle defaults, so a hand-written entry may be as short as
 * `{ id: 'anyrouter', baseURL: 'https://anyrouter.top' }`.
 *
 * `id` is both the pi-ai provider route and the directory key: it is what a
 * request selects with `GenerateOptions.provider`, so it has to be a stable
 * slug rather than a display string.
 */
export interface AnyRouterProviderConfig {
  /** Provider route id; lowercase alphanumerics with `.`, `_` and `-`. */
  id: string
  /** Label shown by the selector and the settings section. Defaults to the id. */
  displayName?: string
  /**
   * Credential reference this provider's key is stored under. Defaults to
   * `ANYROUTER_API_KEY` on the migrated route and to a name derived from the id
   * elsewhere. Each provider owns its own reference, so keys never cross.
   */
  apiKeyEnv?: string
  /** Relay endpoint. Required once `providers` is used, defaulted for the migrated route. */
  baseURL?: string
  /**
   * An `http://` or `https://` proxy this provider alone tunnels through.
   * Empty means direct. It is NOT the harness's global proxy: that one is
   * installed by the launcher from the environment and already covers every
   * provider, so this field exists precisely for the case where only this
   * relay must be proxied.
   */
  proxy?: string
  models?: AnyRouterModelConfig[]
  /** Overrides the section-wide idle timeout for this provider alone. */
  streamIdleTimeoutMs?: number
  /** Overrides the section-wide retry policy for this provider alone. */
  retryPolicy?: RetryPolicyConfig
}

/**
 * The validated plugin configuration as `apply()` receives it. Every field is
 * a stable reference rather than a plain value: the Loader commits a live
 * settings edit into these references without remounting the plugin, so a
 * consumer reads the current value through {@link plainOptions} instead of
 * re-reading a settings source.
 *
 * `providers` and the flat fields below it are the two halves of one migration
 * seam. `providers` absent means "this configuration predates multi-provider
 * support" and the flat fields describe the one route to synthesize; `providers`
 * present — including an empty array, which is how the settings section says
 * "no relays at all" — is authoritative and the flat fields are ignored.
 */
export interface Config {
  providers: Volatile<AnyRouterProviderConfig[] | undefined>
  /** Legacy single-route endpoint; folds into the migrated provider. */
  apiKeyEnv: Volatile<string>
  /** Legacy single-route endpoint; folds into the migrated provider. */
  baseURL: Volatile<string>
  /** Legacy single-route proxy; folds into the migrated provider. */
  proxy: Volatile<string>
  /** Legacy single-route model list; folds into the migrated provider. */
  models: Volatile<AnyRouterModelConfig[]>
  /** Section-wide idle timeout; a provider may override it. */
  streamIdleTimeoutMs: Volatile<number>
  /** Section-wide retry policy; a provider may override it. */
  retryPolicy: Volatile<RetryPolicyConfig | undefined>
}

/** Plain values behind every reference of a validated {@link Config}. */
export type Options = {
  [K in keyof Config]?: Config[K] extends Volatile<infer T> ? Exclude<T, undefined> : never
}

/**
 * Read the current value behind every reference of a validated Config. The
 * reference protocol is detected rather than assumed, so a plain configuration
 * object still reads correctly when a caller builds one by hand.
 */
export function plainOptions(config: Config): Options {
  const providers = valueOf<AnyRouterProviderConfig[] | undefined>(config.providers)
  const apiKeyEnv = valueOf<string>(config.apiKeyEnv)
  const baseURL = valueOf<string>(config.baseURL)
  const proxy = valueOf<string>(config.proxy)
  const models = valueOf<AnyRouterModelConfig[]>(config.models)
  const streamIdleTimeoutMs = valueOf<number>(config.streamIdleTimeoutMs)
  const retryPolicy = valueOf<RetryPolicyConfig | undefined>(config.retryPolicy)
  return {
    ...providers === undefined ? {} : { providers },
    ...apiKeyEnv === undefined ? {} : { apiKeyEnv },
    ...baseURL === undefined ? {} : { baseURL },
    ...proxy === undefined ? {} : { proxy },
    ...models === undefined ? {} : { models },
    ...streamIdleTimeoutMs === undefined ? {} : { streamIdleTimeoutMs },
    ...retryPolicy === undefined ? {} : { retryPolicy },
  }
}

/**
 * The value behind one configuration field: a schema-declared reference when
 * the Host resolved the field, or the field itself when it did not. A snapshot
 * is deeply readonly, which this package only reads, so the declared field type
 * is the useful one to hand back.
 */
function valueOf<T>(field: Volatile<T> | T | undefined): T | undefined {
  const reference = field as Volatile<T> | undefined
  return typeof reference?.get === 'function'
    ? reference.get() as unknown as T
    : field as T | undefined
}

/**
 * One relay, fully resolved.
 *
 * `error` is the difference between "configured" and "usable": a provider the
 * user has not finished describing — no endpoint yet, a proxy with an
 * unsupported scheme — is still resolved, still listed, and still editable, but
 * it carries the reason it cannot serve and contributes no route and no model.
 * Treating that state as a thrown error instead is what once made a half-filled
 * settings form able to stop the whole plugin from mounting.
 */
export interface ResolvedProviderConfig {
  id: string
  displayName: string
  apiKeyEnv: CredentialRef
  /** The endpoint, or `undefined` while the provider has none to use. */
  baseURL: string | undefined
  /** The canonical tunnel URL, or `undefined` for a direct connection. */
  proxy: string | undefined
  models: readonly AnyRouterModelConfig[]
  streamIdleTimeoutMs: number
  retryPolicy: ResolvedRetryPolicy
  /** Why this provider is disabled; absent means it is usable. */
  error?: string | undefined
}

export interface ResolvedConfig {
  providers: readonly ResolvedProviderConfig[]
  /**
   * One message per provider entry that could not be represented at all —
   * a missing or malformed id, or a duplicate of an earlier entry. Those have
   * no route key to carry an `error`, so they are dropped from `providers` and
   * reported here instead. The plugin logs them and keeps running.
   */
  diagnostics: readonly string[]
}

/**
 * A resolved provider that can actually serve: it has an endpoint and carries
 * no problem. Narrowing to this type is what makes "the settings form is still
 * half filled in" a compile-time distinction rather than a runtime guess, so no
 * caller can build a route out of a provider that has nowhere to send it.
 */
export interface UsableProvider extends ResolvedProviderConfig {
  baseURL: string
  error?: undefined
}
/**
 * Whether a resolved provider is usable, as a type guard.
 * @param provider - one resolved provider.
 * @returns true when it has an endpoint and no recorded problem.
 */
export function isUsable(provider: ResolvedProviderConfig): provider is UsableProvider {
  return provider.error === undefined && provider.baseURL !== undefined
}

const ReasoningProfileSchema: z<ReasoningProfile> = z.object({
  disabled: z.boolean(),
  efforts: z.array(z.union([...REASONING_LEVELS])),
  defaultEffort: z.union([...REASONING_LEVELS]),
  adaptive: z.boolean(),
})

const ModelSchema: z<AnyRouterModelConfig> = z.object({
  id: z.string().required(),
  name: z.string(),
  protocol: z.union(['claude-code', 'codex-responses']).required(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  reasoning: ReasoningProfileSchema,
})

const ProviderSchema: z<AnyRouterProviderConfig> = z.object({
  id: z.string().required(),
  displayName: z.string(),
  apiKeyEnv: z.string().role('credential-ref'),
  baseURL: z.string(),
  proxy: z.string(),
  models: z.array(ModelSchema),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS),
  retryPolicy: RetryPolicySchema,
})

/**
 * The plugin's configuration schema, which the Host also publishes as this
 * entry's configuration form: `SettingsForms.describe()` reports the entries
 * whose schema declares live fields, and a settings write is committed into
 * the running plugin's references without a remount. Every field is therefore
 * declared volatile — a schema without one is not offered as a form at all,
 * and a write to a non-volatile path is refused.
 *
 * `providers` deliberately carries an explicit `undefined` default rather than
 * the array type's implicit `[]`. An absent field and an empty array must stay
 * distinguishable, because they mean opposite things: absent is "legacy
 * configuration, synthesize the one route the flat fields describe", while `[]`
 * is "the user removed every relay". Without the explicit default, schemastery
 * materializes `[]` for a field the configuration never mentioned, which
 * silently reports every pre-multi-provider install as having no relays at all.
 */
export const Config = z.object({
  // `default()`'s signature admits only `T | Partial<S>`, so the cast below is
  // type-only: `undefined` is the one value that yields the "field absent"
  // semantics this needs, and the runtime honours it (pinned by the
  // `plainOptions` test, which asserts an absent field reads as `undefined`
  // while an explicit `[]` survives).
  providers: z.array(ProviderSchema)
    .default(undefined as unknown as AnyRouterProviderConfig[])
    .volatile(),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV).volatile(),
  baseURL: z.string().default(DEFAULT_BASE_URL).volatile(),
  proxy: z.string().default(DEFAULT_PROXY).volatile(),
  models: z.array(ModelSchema).default([]).volatile(),
  streamIdleTimeoutMs: z.number()
    .min(Number.MIN_VALUE)
    .max(MAX_TIMER_DELAY_MS)
    .default(DEFAULT_STREAM_IDLE_TIMEOUT_MS)
    .volatile(),
  retryPolicy: RetryPolicySchema.volatile(),
})

export function normalizeBaseURL(raw: string | undefined): string {
  const value = (raw ?? DEFAULT_BASE_URL).trim()
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch (cause) {
    throw new Error(`dsh-anyrouter: invalid baseURL ${JSON.stringify(value)}`, { cause })
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error('dsh-anyrouter: baseURL must not contain user information')
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new Error('dsh-anyrouter: baseURL must not contain a query or fragment')
  }
  const loopback = isLoopbackHost(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new Error('dsh-anyrouter: baseURL must use https (http is allowed only for loopback development)')
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  return parsed.toString().replace(/\/+$/, '')
}

/**
 * Validate one provider route id.
 * @param raw - the configured id.
 * @returns the trimmed id.
 * @throws when the id is empty or outside {@link PROVIDER_ID_PATTERN}.
 */
export function normalizeProviderId(raw: string): string {
  const value = raw.trim()
  if (value.length === 0) throw new Error('dsh-anyrouter: provider ids must be non-empty')
  if (!PROVIDER_ID_PATTERN.test(value)) {
    throw new Error(
      `dsh-anyrouter: provider id ${JSON.stringify(value)} must be lowercase alphanumerics `
      + 'with "." "_" or "-", starting with a letter or digit',
    )
  }
  return value
}

/**
 * The credential reference a provider uses when its configuration names none.
 * The migrated legacy route keeps `ANYROUTER_API_KEY` so an upgrade finds the
 * key the user already stored; every other route derives a distinct name from
 * its id, so two relays can never share — and therefore never overwrite — one
 * stored key.
 * @param providerId - a validated provider id.
 * @returns the default credential reference name.
 */
export function defaultApiKeyEnvFor(providerId: string): string {
  return providerId === DEFAULT_PROVIDER_ID
    ? DEFAULT_API_KEY_ENV
    : `${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/** Resolve one provider's credential reference, defaulting it from the id. */
function resolveCredentialRef(raw: string | undefined, providerId: string): CredentialRef {
  const value = (raw ?? '').trim() || defaultApiKeyEnvFor(providerId)
  if (!isCredentialRefName(value)) {
    throw new Error(
      `dsh-anyrouter: provider ${JSON.stringify(providerId)} apiKeyEnv ${JSON.stringify(value)} `
      + 'must be a shell-style identifier such as ANYROUTER_API_KEY',
    )
  }
  return credentialRef(value)
}

/** Validate one idle timeout, whether section-wide or per provider. */
function resolveTimeout(raw: number | undefined): number {
  const value = raw ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMER_DELAY_MS) {
    throw new Error(`dsh-anyrouter: streamIdleTimeoutMs must be between 0 and ${MAX_TIMER_DELAY_MS}`)
  }
  return value
}

/**
 * Validate and canonicalize one provider's synchronized model list.
 *
 * Model rows are repaired, never fatal. A row that cannot be represented is
 * skipped and an unusable field on an otherwise fine row is dropped, each with a
 * warning. Disabling the whole relay over one bad row would be disproportionate:
 * the endpoint, credential and every other model are unaffected, and a relay
 * that disappears because of a typo in a single capacity field is far harder to
 * diagnose than one that keeps serving and says what it ignored.
 * @param models - the configured rows.
 * @param warnings - collects one message per repaired row.
 * @returns the rows that could be represented, in configuration order.
 */
function resolveModels(
  models: readonly AnyRouterModelConfig[],
  warnings: string[],
): readonly AnyRouterModelConfig[] {
  const seen = new Set<string>()
  const resolved: AnyRouterModelConfig[] = []
  for (const model of models) {
    const id = (model.id ?? '').trim()
    if (id.length === 0) {
      warnings.push('ignoring a model row with no id')
      continue
    }
    if (seen.has(id)) {
      warnings.push(`ignoring duplicate model id ${JSON.stringify(id)}`)
      continue
    }
    seen.add(id)

    const capacity = (value: number | undefined, label: string): number | undefined => {
      if (value === undefined) return undefined
      if (Number.isSafeInteger(value) && value > 0) return value
      warnings.push(`model ${JSON.stringify(id)} has an unusable ${label}; falling back to the reference capacity`)
      return undefined
    }
    const contextWindow = capacity(model.contextWindow, 'contextWindow')
    const maxTokens = capacity(model.maxTokens, 'maxTokens')

    let reasoning: ReasoningProfile | undefined
    if (model.reasoning !== undefined) {
      try {
        reasoning = canonicalReasoningProfile(model.reasoning, model.protocol, id)
      } catch (error) {
        warnings.push(
          `model ${JSON.stringify(id)} has an unusable reasoning profile `
          + `(${error instanceof Error ? error.message : String(error)}); using the reference profile`,
        )
      }
    }

    // `reasoning` is dropped from the spread so a repaired profile cannot leave
    // the unusable original sitting on the row alongside the replacement.
    const { reasoning: _original, ...rest } = model
    resolved.push({
      ...rest,
      id,
      ...contextWindow === undefined ? {} : { contextWindow },
      ...maxTokens === undefined ? {} : { maxTokens },
      ...reasoning === undefined ? {} : { reasoning },
    })
  }
  return resolved
}

/**
 * The single provider a configuration without `providers` describes: the
 * pre-multi-provider flat fields, restated as one relay entry. This is the
 * whole backwards-compatibility story — an upgraded install resolves through
 * exactly the same validation and the same route as before, keeping its
 * endpoint, proxy, model list, credential reference and stored key.
 * @param config - plain values of the validated configuration.
 * @returns the synthesized provider entry.
 */
function legacyProviderEntry(config: Options): AnyRouterProviderConfig {
  return {
    id: DEFAULT_PROVIDER_ID,
    displayName: DEFAULT_DISPLAY_NAME,
    apiKeyEnv: config.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
    baseURL: config.baseURL ?? DEFAULT_BASE_URL,
    proxy: config.proxy ?? DEFAULT_PROXY,
    models: config.models ?? [],
    streamIdleTimeoutMs: config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    ...config.retryPolicy === undefined ? {} : { retryPolicy: config.retryPolicy },
  }
}

/**
 * Run one resolution step, recording its failure instead of propagating it.
 *
 * Resolution must be TOTAL over anything a user can express. The settings
 * section edits a live configuration, so every intermediate state of a form the
 * user is still filling in — a provider added but not yet given an endpoint, a
 * proxy typed with the wrong scheme — reaches this function. Throwing on one of
 * them used to be fatal in the worst possible way: the write itself succeeds
 * (the schema admits the value), so the throw lands on the NEXT resolve, and at
 * mount time there is no last-good configuration to fall back to, leaving the
 * plugin unable to load at all. Recording the problem instead keeps the plugin
 * mountable and its settings section reachable, which is what lets the user fix
 * the very value that caused it.
 * @param run - the resolution step.
 * @param problems - collects one message per failure.
 * @returns the step's value, or undefined when it failed.
 */
function attempt<T>(run: () => T, problems: string[]): T | undefined {
  try {
    return run()
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error))
    return undefined
  }
}

/**
 * Resolve one provider entry defensively: every recoverable problem becomes a
 * message on the result rather than an exception, and a provider that carries
 * one is DISABLED rather than absent. It keeps its place in the directory — so
 * the settings section still shows it and the user can repair it — while
 * contributing no route and no model to the selector.
 * @param entry - the configured provider entry.
 * @param id - its validated route id.
 * @param defaults - section-wide values a provider may override.
 * @param warnings - collects repairs that do NOT disable the provider.
 * @returns the resolved provider, carrying `error` when it is unusable.
 */
function resolveProviderSafely(
  entry: AnyRouterProviderConfig,
  id: string,
  defaults: { streamIdleTimeoutMs: number; retryPolicy: ResolvedRetryPolicy },
  warnings: string[],
): ResolvedProviderConfig {
  const problems: string[] = []

  // An endpoint is what makes a relay usable; absent, the provider is a draft.
  const configuredBaseURL = (entry.baseURL ?? '').trim()
  let baseURL: string | undefined
  if (configuredBaseURL.length === 0 && id !== DEFAULT_PROVIDER_ID) {
    problems.push(`provider ${JSON.stringify(id)} needs a baseURL`)
  } else {
    baseURL = attempt(
      () => normalizeBaseURL(configuredBaseURL.length === 0 ? undefined : configuredBaseURL),
      problems,
    )
  }

  const proxy = attempt(() => normalizeProxyURL(entry.proxy), problems)
  const apiKeyEnv = attempt(() => resolveCredentialRef(entry.apiKeyEnv, id), problems)
    ?? credentialRef(defaultApiKeyEnvFor(id))
  const models = resolveModels(entry.models ?? [], warnings)
  const streamIdleTimeoutMs = attempt(
    () => entry.streamIdleTimeoutMs === undefined
      ? defaults.streamIdleTimeoutMs
      : resolveTimeout(entry.streamIdleTimeoutMs),
    problems,
  ) ?? defaults.streamIdleTimeoutMs
  const retryPolicy = attempt(
    () => entry.retryPolicy === undefined
      ? defaults.retryPolicy
      : resolveRetryPolicy(entry.retryPolicy, `dsh-anyrouter: provider ${id} retryPolicy`),
    problems,
  ) ?? defaults.retryPolicy

  const displayName = (entry.displayName ?? '').trim()
    || (id === DEFAULT_PROVIDER_ID ? DEFAULT_DISPLAY_NAME : id)

  return {
    id,
    displayName,
    apiKeyEnv,
    baseURL,
    proxy,
    models: problems.length === 0 ? models : [],
    streamIdleTimeoutMs,
    retryPolicy,
    ...problems.length === 0 ? {} : { error: problems.join('; ') },
  }
}

/**
 * Resolve a whole configuration.
 *
 * This function does not throw for anything a user can type. A provider whose id
 * cannot be a route key (missing, malformed) or that duplicates an earlier one
 * is dropped with a diagnostic, because it has no representable identity to
 * carry an error on; every other provider is kept, disabled and annotated. The
 * distinction matters at mount time: a dropped diagnostic still leaves the
 * plugin running with the remaining providers, whereas a throw would leave it
 * running with none.
 * @param config - plain values of the validated configuration.
 * @returns the providers that can serve, plus one message per dropped entry.
 */
export function resolveConfig(config: Options): ResolvedConfig {
  const diagnostics: string[] = []
  const streamIdleTimeoutMs = attempt(() => resolveTimeout(config.streamIdleTimeoutMs), diagnostics)
    ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  const retryPolicy = attempt(
    () => resolveRetryPolicy(config.retryPolicy, 'dsh-anyrouter: retryPolicy'),
    diagnostics,
  ) ?? resolveRetryPolicy(undefined, 'dsh-anyrouter: retryPolicy')

  // An absent `providers` field is the migration signal; an empty array is a
  // deliberate "no relays". Only the former folds in the legacy flat fields.
  const raw = config.providers === undefined ? [legacyProviderEntry(config)] : config.providers

  const seen = new Set<string>()
  const providers: ResolvedProviderConfig[] = []
  for (const entry of raw) {
    const candidate = (entry?.id ?? '').trim()
    if (candidate.length === 0) {
      diagnostics.push('ignoring a provider entry with no id')
      continue
    }
    if (!PROVIDER_ID_PATTERN.test(candidate)) {
      diagnostics.push(
        `ignoring provider ${JSON.stringify(candidate)}: an id must be lowercase alphanumerics `
        + 'with "." "_" or "-", starting with a letter or digit',
      )
      continue
    }
    if (seen.has(candidate)) {
      diagnostics.push(`ignoring duplicate provider id ${JSON.stringify(candidate)}`)
      continue
    }
    seen.add(candidate)
    providers.push(resolveProviderSafely(entry, candidate, { streamIdleTimeoutMs, retryPolicy }, diagnostics))
  }

  return { providers, diagnostics }
}

export function classifyProtocol(id: string): AnyRouterProtocol | undefined {
  const normalized = id.toLowerCase()
  if (normalized.startsWith('claude-')) return 'claude-code'
  if (normalized.startsWith('gpt-')) return 'codex-responses'
  return undefined
}

const LEVEL_SET: ReadonlySet<string> = new Set(REASONING_LEVELS)

/**
 * Validate and canonicalize one persisted reasoning profile: efforts are
 * deduplicated into canonical order, `defaultEffort` must be selectable, and
 * `adaptive` is a Claude-only statement (it switches the transport from a
 * thinking budget to the adaptive `effort` field).
 */
export function canonicalReasoningProfile(
  reasoning: ReasoningProfile,
  protocol: AnyRouterProtocol,
  id: string,
): ReasoningProfile {
  const label = `dsh-anyrouter: model ${JSON.stringify(id)} reasoning`
  const selected = new Set((reasoning.efforts ?? []).filter(level => LEVEL_SET.has(level)))
  const efforts = REASONING_LEVELS.filter(level => selected.has(level))
  if (reasoning.defaultEffort !== undefined && !efforts.includes(reasoning.defaultEffort)) {
    throw new Error(`${label}.defaultEffort ${JSON.stringify(reasoning.defaultEffort)} must be one of its efforts`)
  }
  if (reasoning.adaptive === true && protocol !== 'claude-code') {
    throw new Error(`${label}.adaptive is only valid for claude-code models`)
  }
  if (reasoning.disabled === true) {
    return { disabled: true }
  }
  return {
    ...efforts.length === 0 ? {} : { efforts },
    ...reasoning.defaultEffort === undefined ? {} : { defaultEffort: reasoning.defaultEffort },
    ...reasoning.adaptive === undefined ? {} : { adaptive: reasoning.adaptive },
  }
}
