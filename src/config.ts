import z from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/cordis'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import {
  resolveRetryPolicy,
  RetryPolicySchema,
  type ResolvedRetryPolicy,
  type RetryPolicyConfig,
} from '@deepseek-ai/dsh-llm'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { normalizeProxyURL } from './proxy.ts'

export const PROVIDER = 'anyrouter'
/**
 * The profile entry id this bundle owns, and therefore its configuration
 * namespace. `cordis.patch.yml` inserts the entry as `dsh-anyrouter`, and the
 * 0.1.7 Host keys every plugin configuration form by that entry id, so the id
 * is the one string both the configuration surface and the model-discovery
 * directory are addressed by.
 */
export const SETTINGS_NS = 'dsh-anyrouter'
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
 * The validated plugin configuration as `apply()` receives it. Every field is
 * a stable reference rather than a plain value: the Loader commits a live
 * settings edit into these references without remounting the plugin, so a
 * consumer reads the current value through {@link plainOptions} instead of
 * re-reading a settings source.
 */
export interface Config {
  apiKeyEnv: Volatile<string>
  baseURL: Volatile<string>
  /**
   * An `http://` or `https://` proxy this route alone tunnels through. Empty
   * means direct. It is NOT the harness's global proxy: that one is installed
   * by the launcher from the environment and already covers every provider, so
   * this field exists precisely for the case where only AnyRouter must be
   * proxied.
   */
  proxy: Volatile<string>
  models: Volatile<AnyRouterModelConfig[]>
  streamIdleTimeoutMs: Volatile<number>
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
  const apiKeyEnv = valueOf<string>(config.apiKeyEnv)
  const baseURL = valueOf<string>(config.baseURL)
  const proxy = valueOf<string>(config.proxy)
  const models = valueOf<AnyRouterModelConfig[]>(config.models)
  const streamIdleTimeoutMs = valueOf<number>(config.streamIdleTimeoutMs)
  const retryPolicy = valueOf<RetryPolicyConfig | undefined>(config.retryPolicy)
  return {
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

export interface ResolvedConfig {
  apiKeyEnv: CredentialRef
  baseURL: string
  /** The canonical tunnel URL, or `undefined` for a direct connection. */
  proxy: string | undefined
  models: readonly AnyRouterModelConfig[]
  streamIdleTimeoutMs: number
  retryPolicy: ResolvedRetryPolicy
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

/**
 * The plugin's configuration schema, which the Host also publishes as this
 * entry's configuration form: `SettingsForms.describe()` reports the entries
 * whose schema declares live fields, and a settings write is committed into
 * the running plugin's references without a remount. Every field is therefore
 * declared volatile — a schema without one is not offered as a form at all,
 * and a write to a non-volatile path is refused.
 */
export const Config = z.object({
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
  const loopback = parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '[::1]'
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new Error('dsh-anyrouter: baseURL must use https (http is allowed only for loopback development)')
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  return parsed.toString().replace(/\/+$/, '')
}

export function resolveConfig(config: Options): ResolvedConfig {
  const apiKeyEnv = config.apiKeyEnv ?? DEFAULT_API_KEY_ENV
  if (apiKeyEnv !== DEFAULT_API_KEY_ENV) {
    throw new Error(`dsh-anyrouter: apiKeyEnv is fixed to ${DEFAULT_API_KEY_ENV}`)
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`dsh-anyrouter: streamIdleTimeoutMs must be between 0 and ${MAX_TIMER_DELAY_MS}`)
  }

  const models = config.models ?? []
  const seen = new Set<string>()
  for (const model of models) {
    const id = model.id.trim()
    if (id.length === 0) throw new Error('dsh-anyrouter: model ids must be non-empty')
    if (seen.has(id)) throw new Error(`dsh-anyrouter: duplicate model id ${JSON.stringify(id)}`)
    seen.add(id)
    if (model.contextWindow !== undefined
      && (!Number.isSafeInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(`dsh-anyrouter: model ${JSON.stringify(id)} has invalid contextWindow`)
    }
    if (model.maxTokens !== undefined
      && (!Number.isSafeInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(`dsh-anyrouter: model ${JSON.stringify(id)} has invalid maxTokens`)
    }
    if (model.reasoning !== undefined) canonicalReasoningProfile(model.reasoning, model.protocol, id)
  }

  return {
    apiKeyEnv: credentialRef(DEFAULT_API_KEY_ENV),
    baseURL: normalizeBaseURL(config.baseURL),
    proxy: normalizeProxyURL(config.proxy),
    models: models.map(model => ({
      ...model,
      id: model.id.trim(),
      ...model.reasoning === undefined
        ? {}
        : { reasoning: canonicalReasoningProfile(model.reasoning, model.protocol, model.id.trim()) },
    })),
    streamIdleTimeoutMs,
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'dsh-anyrouter: retryPolicy'),
  }
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
