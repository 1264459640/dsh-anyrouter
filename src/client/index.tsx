import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { MODEL_PROFILES_BY_ID } from '../model-profiles.generated.ts'
// `proxy.ts` is the endpoint rules' pure half: no transport, no HTTP client, no
// Node builtins. Importing it here is what keeps the browser's validation and
// the Host's validation the same predicate instead of two copies that drift.
import { isLoopbackHost } from '../proxy.ts'

// DSH 0.2.0 identifies a settings namespace by the nominal id of one profile
// plugin entry. `cordis.patch.yml` inserts our Host half as `id: dsh-anyrouter`,
// so that entry id IS the namespace, replacing the pre-0.1.7 standalone
// `llm-*` section key. It is also the `entryId` `ConfigForms.get` expects, and
// the `ns` the Host reports in `settings.describe`. The Host half was moved to
// the same value. It stays a SINGLE namespace even though a configuration may
// now declare many providers: the Host's model-discovery directory keys entries
// by `provider`, not by namespace, so N relays share this one form.
const SETTINGS_NS = 'dsh-anyrouter'
const PROVIDER = 'anyrouter'
/** The route the pre-multi-provider flat fields migrate to. */
const DEFAULT_PROVIDER_ID = 'anyrouter'
const DEFAULT_DISPLAY_NAME = 'AnyRouter'
const DEFAULT_API_KEY_ENV = 'ANYROUTER_API_KEY'
const DEFAULT_BASE_URL = 'https://anyrouter.top'
/** Empty means direct: only a non-empty value tunnels this provider's traffic. */
const DEFAULT_PROXY = ''
/** A provider id is a request-visible route slug, so it stays lowercase and stable. */
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
type Level = (typeof LEVELS)[number]
type Protocol = 'claude-code' | 'codex-responses'

export interface ReasoningConfig {
  disabled?: boolean
  efforts?: Level[]
  defaultEffort?: Level
  adaptive?: boolean
}

export interface SyncedModel {
  id: string
  name?: string
  protocol: Protocol
  contextWindow?: number
  maxTokens?: number
  reasoning?: ReasoningConfig
}

/**
 * One relay this section configures. `id` is required and is both the pi-ai
 * provider route and the model-discovery directory key, so it has to be a stable
 * slug rather than a display string. Every other field is optional and falls
 * back to the Host's per-provider defaults.
 */
export interface ProviderValue {
  id: string
  displayName?: string
  /** Credential reference this provider's key is stored under. Derived from the id when blank. */
  apiKeyEnv?: string
  baseURL?: string
  proxy?: string
  models?: SyncedModel[]
  /** Carried through untouched: the section has no UI for it. */
  streamIdleTimeoutMs?: number
  /** Carried through untouched: the section has no UI for it. */
  retryPolicy?: unknown
}

/**
 * The persisted form value. `providers` and the flat fields below it are the two
 * halves of one migration seam: an ABSENT `providers` means the stored
 * configuration predates multi-provider support and the flat fields describe the
 * one relay to synthesize, while a present array — including `[]`, which is how
 * the user says "no relays at all" — is authoritative and the flat fields are
 * ignored. That is why the Host schema gives `providers` no default.
 */
export interface SettingsValue {
  providers?: ProviderValue[]
  // Legacy single-relay fields, still written by older releases:
  baseURL?: string
  proxy?: string
  apiKeyEnv?: string
  models?: SyncedModel[]
  streamIdleTimeoutMs?: number
}

/**
 * The editable, string-shaped view of one provider. A settings form edits text,
 * and `ProviderValue` distinguishes "absent" (fall back to the Host default)
 * from "empty string", so the two shapes are kept apart and crossed by the two
 * pure converters below rather than by delete-spread gymnastics in JSX.
 */
export interface ProviderDraft {
  id: string
  displayName: string
  apiKeyEnv: string
  baseURL: string
  proxy: string
  models: SyncedModel[]
  streamIdleTimeoutMs?: number
  retryPolicy?: unknown
}

/** The section's whole editable state: the provider array plus the selected row's draft. */
export interface SectionState {
  draft: ProviderValue[]
  /** Index into `draft`, or -1 when there is no provider at all. */
  selected: number
  /** String-shaped mirror of `draft[selected]`, or null when nothing is selected. */
  form: ProviderDraft | null
}

interface PickerRow {
  id: string
  name?: string
  protocol: Protocol
  contextWindow?: number
  maxTokens?: number
  checked: boolean
  reasoningOn: boolean
  efforts: Level[]
  defaultEffort: Level | undefined
  adaptive: boolean
}

/** Which provider a picker belongs to, and the rows discovered for it. */
interface PickerState {
  providerIndex: number
  rows: PickerRow[]
}

/**
 * The section's slice of `ConfigFormSnapshot<T>`
 * (`@deepseek-ai/dsh-client-ui-settings/lib/types/client/config-form-types.d.ts:6-32`).
 * `idle` is deliberately absent: that state belongs to the shared
 * `SettingsMirrorSnapshot`, while a per-entry form only ever reports
 * `loading | ready | unavailable`.
 */
export interface SettingsFormViewSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value: SettingsValue | undefined
  writable: boolean
  mode: 'host' | 'memory'
}

/** The section's slice of `ConfigForm<T>` (same file, lines 36-74). */
export interface SettingsFormView {
  getSnapshot(): SettingsFormViewSnapshot
  subscribe(listener: () => void): () => void
  /** @returns true when the Host accepted the write, false for refusal. */
  set(field: string, value: unknown): Promise<boolean>
}

/** One model an endpoint reports about itself during discovery. */
interface DiscoveredModel {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
}

/**
 * The Host operations this section needs, bound once in `apply`. The component
 * never holds a Cordis service and never sees a Remote envelope: every call
 * either resolves to a plain value or throws a human-readable Error.
 *
 * Credentials are addressed by REFERENCE, never by a fixed name: each provider
 * owns its own reference, so two relays can never share — and therefore never
 * overwrite — one stored key.
 */
export interface AnyRouterOperations {
  /** Whether the credential reference currently resolves on the Host. */
  credentialConfigured(ref: string): Promise<boolean>
  /** Store an API key under one provider's credential reference. */
  storeCredential(ref: string, value: string): Promise<void>
  /** Interrogate one provider's draft endpoint for the models it serves. */
  discoverModels(providerId: string, baseURL: string): Promise<DiscoveredModel[]>
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown; code?: unknown }
    if (typeof candidate.message === 'string') return candidate.message
    if (typeof candidate.code === 'string') return candidate.code
  }
  return String(error)
}

/**
 * Collapse a Remote result (`{ ok: true, value } | { ok: false, error }`) to
 * its value, turning a refusal into a thrown Error the section can render.
 * @param response - the awaited Remote namespace response.
 * @returns the carried value.
 */
export function unwrapRemote<T>(response: unknown): T {
  const envelope = response as { ok?: unknown; value?: T; error?: unknown } | null | undefined
  if (envelope !== null && envelope !== undefined && envelope.ok === true) return envelope.value as T
  throw new Error(errorMessage(envelope?.error))
}

export function protocolFor(id: string): Protocol | undefined {
  const normalized = id.toLowerCase()
  if (normalized.startsWith('claude-')) return 'claude-code'
  if (normalized.startsWith('gpt-')) return 'codex-responses'
  return undefined
}

/**
 * The credential reference a provider uses when its configuration names none.
 * The migrated legacy route keeps `ANYROUTER_API_KEY` so an upgrade finds the
 * key the user already stored; every other route derives a distinct name from
 * its id, so two relays can never share one stored key.
 * @param id - a provider id (validated by `providerIdProblem`).
 * @returns the default credential reference name.
 */
export function defaultApiKeyEnvFor(id: string): string {
  const value = id.trim()
  if (value === DEFAULT_PROVIDER_ID) return DEFAULT_API_KEY_ENV
  return `${value.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/** Resolve one provider's effective credential reference, defaulting it from the id. */
export function credentialRefFor(provider: { id: string; apiKeyEnv?: string }): string {
  return (provider.apiKeyEnv ?? '').trim() || defaultApiKeyEnvFor(provider.id)
}

/**
 * The provider array a stored value describes. An ABSENT `providers` field is
 * the backwards-compatibility signal: the pre-multi-provider flat fields are
 * restated as exactly one relay, keeping the endpoint, proxy, credential
 * reference and model list the user already had. An EMPTY array is authoritative
 * and stays empty — that is the difference the Host schema's missing default
 * preserves, and re-synthesizing here would resurrect a deleted relay.
 * @param value - the form snapshot value, possibly `undefined` while loading.
 * @returns the provider list to edit.
 */
export function providersFromValue(value: SettingsValue | undefined): ProviderValue[] {
  if (Array.isArray(value?.providers)) return value.providers
  return [{
    id: DEFAULT_PROVIDER_ID,
    displayName: DEFAULT_DISPLAY_NAME,
    apiKeyEnv: value?.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
    baseURL: value?.baseURL ?? DEFAULT_BASE_URL,
    proxy: value?.proxy ?? DEFAULT_PROXY,
    models: Array.isArray(value?.models) ? value.models : [],
  }]
}

/** Project one persisted provider into the string-shaped form draft. */
export function providerDraftFrom(provider: ProviderValue): ProviderDraft {
  return {
    id: provider.id,
    displayName: provider.displayName ?? '',
    apiKeyEnv: provider.apiKeyEnv ?? '',
    baseURL: provider.baseURL ?? '',
    proxy: provider.proxy ?? '',
    models: provider.models ?? [],
    ...provider.streamIdleTimeoutMs === undefined
      ? {}
      : { streamIdleTimeoutMs: provider.streamIdleTimeoutMs },
    ...provider.retryPolicy === undefined ? {} : { retryPolicy: provider.retryPolicy },
  }
}

/**
 * Project the form draft back into the persisted shape. Blank optional strings
 * are OMITTED rather than stored as `''`, which is what lets a user clear a
 * previously-set endpoint or proxy instead of pinning an empty string that the
 * Host would then read as authoritative.
 */
export function providerValueFrom(draft: ProviderDraft): ProviderValue {
  const id = draft.id.trim()
  const displayName = draft.displayName.trim()
  const apiKeyEnv = draft.apiKeyEnv.trim()
  const baseURL = draft.baseURL.trim()
  const proxy = draft.proxy.trim()
  return {
    id,
    ...displayName.length === 0 ? {} : { displayName },
    ...apiKeyEnv.length === 0 ? {} : { apiKeyEnv },
    ...baseURL.length === 0 ? {} : { baseURL },
    ...proxy.length === 0 ? {} : { proxy },
    models: draft.models,
    ...draft.streamIdleTimeoutMs === undefined
      ? {}
      : { streamIdleTimeoutMs: draft.streamIdleTimeoutMs },
    ...draft.retryPolicy === undefined ? {} : { retryPolicy: draft.retryPolicy },
  }
}

/**
 * The seed for the section's editable state. Selection must survive a reseed
 * (a commit re-seeds from the snapshot), so the previous index is clamped rather
 * than reset; a provider array that no longer has that index falls back to the
 * first remaining relay, and an empty array selects nothing.
 * @param value - the form snapshot value.
 * @param previousSelected - the index selected before this seed.
 * @returns the seeded draft, selection and detail form.
 */
export function seedSectionState(value: SettingsValue | undefined, previousSelected = 0): SectionState {
  const draft = providersFromValue(value)
  const selected = previousSelected >= 0 && previousSelected < draft.length
    ? previousSelected
    : draft.length > 0 ? 0 : -1
  const provider = selected < 0 ? undefined : draft[selected]
  return { draft, selected, form: provider === undefined ? null : providerDraftFrom(provider) }
}

/**
 * Validate one provider id against the Host's own rule, plus the uniqueness the
 * Host would reject at write time. Reported inline, and a non-null result also
 * blocks the save buttons, so an invalid id never reaches the Host.
 * @param id - the raw input value.
 * @param providers - the whole current array, for the duplicate check.
 * @param selfIndex - the row being edited, excluded from the duplicate check.
 * @returns a Chinese problem sentence, or null when the id is acceptable.
 */
export function providerIdProblem(
  id: string,
  providers: readonly { id: string }[],
  selfIndex: number,
): string | null {
  const value = id.trim()
  if (value.length === 0) return '提供商 ID 不能为空。'
  if (!PROVIDER_ID_PATTERN.test(value)) {
    return '提供商 ID 只能使用小写字母、数字以及 . _ -，并且必须以字母或数字开头。'
  }
  if (providers.some((provider, index) => index !== selfIndex && provider.id.trim() === value)) {
    return '提供商 ID 已被占用，请换一个。'
  }
  return null
}

/**
 * Validate the optional credential-reference override. Blank is valid and means
 * "derive it from the id"; anything else must be the shell identifier the Host's
 * credential service accepts.
 * @param raw - the raw input value.
 * @returns a Chinese problem sentence, or null when acceptable.
 */
export function credentialRefProblem(raw: string): string | null {
  const value = raw.trim()
  if (value.length === 0) return null
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    return '凭证引用必须是 shell 标识符，例如 ANYROUTER_API_KEY。'
  }
  return null
}

/**
 * Validate the endpoint against the Host's own rule for it. Reported inline, and
 * a non-null result blocks the save buttons, so the Host never receives an
 * endpoint it would have to refuse.
 *
 * This mirrors `normalizeBaseURL` deliberately and is the reason it exists: the
 * write itself is schema-valid whatever the endpoint says, so without a gate
 * here an unusable endpoint gets PERSISTED and only fails on the next resolve.
 * @param raw - the raw input value.
 * @returns a Chinese problem sentence, or null when the endpoint is acceptable.
 */
export function endpointProblem(raw: string): string | null {
  const value = raw.trim()
  if (value.length === 0) return 'API 地址不能为空，请填写中继的端点。'
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return 'API 地址格式不正确，请填写完整 URL，例如 https://anyrouter.top。'
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return 'API 地址不能包含用户名或密码。'
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    return 'API 地址不能带查询串或片段。'
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname))) {
    return 'API 地址必须使用 https（只有本机 loopback 地址允许 http）。'
  }
  return null
}

/** Proxy schemes the Host refuses by name, so the footer can name them too. */
const SOCKS_PROXY_PROTOCOLS = new Set(['socks:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'])

/**
 * Validate the optional per-relay proxy against the Host's own rule for it.
 * Blank is valid and means a direct connection.
 * @param raw - the raw input value.
 * @returns a Chinese problem sentence, or null when acceptable.
 */
export function proxyProblem(raw: string): string | null {
  const value = raw.trim()
  if (value.length === 0) return null
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return '代理地址格式不正确，请填写完整 URL。'
  }
  if (SOCKS_PROXY_PROTOCOLS.has(parsed.protocol)) {
    return '不支持 SOCKS 代理，请改填同一客户端的 HTTP 代理端口，例如 http://127.0.0.1:7890。'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return '代理地址必须以 http:// 或 https:// 开头。'
  }
  return null
}

/**
 * A fresh provider id that collides with nothing in the list. The counter walks
 * from the array length upward so the second relay of a one-relay install is
 * named `relay-2`, not `relay-1`.
 * @param providers - the whole current array.
 * @returns an unused default id.
 */
export function nextProviderId(providers: readonly { id: string }[]): string {
  const taken = new Set(providers.map(provider => provider.id.trim()))
  for (let index = providers.length + 1; ; index += 1) {
    const candidate = `relay-${index}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Replace one row, leaving every other provider object untouched. */
export function replaceProvider(
  providers: readonly ProviderValue[],
  index: number,
  next: ProviderValue,
): ProviderValue[] {
  return providers.map((provider, position) => (position === index ? next : provider))
}

/** Replace one provider's model list, leaving every other provider object untouched. */
export function withProviderModels(
  providers: readonly ProviderValue[],
  index: number,
  models: SyncedModel[],
): ProviderValue[] {
  return providers.map((provider, position) => (
    position === index ? { ...provider, models } : provider
  ))
}

/** Drop one provider, leaving every surviving provider object untouched. */
export function withoutProvider(providers: readonly ProviderValue[], index: number): ProviderValue[] {
  return providers.filter((_provider, position) => position !== index)
}

/**
 * Does a read-back describe the array we just asked the Host to store? The Host
 * round-trips the array through its schema, so equality is asserted on the
 * facts the section renders — provider ids in order and each provider's model
 * ids in order — rather than on object identity or optional-field spelling.
 */
export function providersMatch(stored: unknown, expected: readonly ProviderValue[]): boolean {
  if (!Array.isArray(stored) || stored.length !== expected.length) return false
  return expected.every((provider, index) => {
    const candidate = stored[index] as ProviderValue | undefined
    if (candidate === undefined || candidate.id !== provider.id) return false
    const storedModels = Array.isArray(candidate.models) ? candidate.models : []
    const expectedModels = provider.models ?? []
    return storedModels.length === expectedModels.length
      && expectedModels.every((model, position) => storedModels[position]?.id === model.id)
  })
}

/**
 * Whether the stored value still carries a legacy single-relay model list that
 * the FIRST `providers` write must retire. Without the retirement write the
 * migrated models stay on the legacy field and would resurrect on any later read
 * that falls back to it, so the write is part of the migration, not cleanup.
 */
export function legacyModelsPending(value: SettingsValue | undefined): boolean {
  return Array.isArray(value?.models) && value.models.length > 0
}

/**
 * The only write path for providers. The ENTIRE array is written every time —
 * never one provider's field — because the Host commits the field atomically,
 * and on the first write the legacy model list is retired with `models: []` so
 * the migrated values cannot resurrect.
 *
 * 0.2.0 `ConfigForm.set` resolves `false` when the Host refuses the write and
 * reloads Host state (config-form-types.d.ts:55-65), so a refusal is checked
 * first and a read-back follows: silently accepting a refusal would leave the
 * panel claiming a configuration the Host never committed.
 * @param scope - the section-facing form view.
 * @param providers - the whole provider array to persist.
 * @param active - staleness guard; the section passes its operation token.
 * @throws when the write is refused, the read-back disagrees, or the operation went stale.
 */
export async function persistProviders(
  scope: SettingsFormView,
  providers: readonly ProviderValue[],
  active: () => boolean = () => true,
): Promise<void> {
  const accepted = await scope.set('providers', providers)
  if (!active()) throw new Error('操作已中断。')
  if (accepted === false) {
    throw new Error('提供商配置未能保存：Host 拒绝了写入。如果你刚刚更新了插件代码，请完全重启 DeepSeek Harness（关闭桌面客户端并在托盘图标右键退出后重新启动），以便后端加载新版插件配置。')
  }
  if (!providersMatch(scope.getSnapshot().value?.providers, providers)) {
    throw new Error('提供商配置未能保存：回读数据不一致，请重试。')
  }
  if (!legacyModelsPending(scope.getSnapshot().value)) return
  const cleared = await scope.set('models', [])
  if (!active()) throw new Error('操作已中断。')
  if (cleared === false || legacyModelsPending(scope.getSnapshot().value)) {
    throw new Error('旧版模型列表未能清除，请重试。')
  }
}

// Mirrors the host catalog's DEFAULT_UNCHECKED_MODELS: the relay's Responses
// endpoint answers 404 for gpt-5-codex, so it starts unchecked.
const DEFAULT_UNCHECKED = new Set(['gpt-5-codex'])

function orderedLevels(levels: Iterable<Level>): Level[] {
  const selected = new Set(levels)
  return LEVELS.filter(level => selected.has(level))
}

export function referenceRow(id: string, protocol: Protocol): PickerRow {
  const reference = MODEL_PROFILES_BY_ID.get(id)
  const referenceEfforts = orderedLevels(
    (reference?.efforts ?? []).filter(level => (LEVELS as readonly string[]).includes(level)) as Level[],
  )
  const efforts = referenceEfforts.length > 0 ? referenceEfforts : [...LEVELS]
  const defaultEffort = efforts.includes('high') ? 'high' : efforts[efforts.length - 1]
  return {
    id,
    ...reference?.name === undefined ? {} : { name: reference.name },
    protocol,
    ...reference?.contextWindow === undefined ? {} : { contextWindow: reference.contextWindow },
    ...reference?.maxTokens === undefined ? {} : { maxTokens: reference.maxTokens },
    checked: !DEFAULT_UNCHECKED.has(id),
    reasoningOn: true,
    efforts,
    defaultEffort,
    adaptive: protocol === 'claude-code' && (reference?.adaptive ?? true),
  }
}

export function rowFromSaved(saved: SyncedModel): PickerRow {
  const base = referenceRow(saved.id, saved.protocol)
  const reasoning = saved.reasoning
  const savedEfforts = reasoning?.efforts === undefined ? [] : orderedLevels(reasoning.efforts)
  return {
    ...base,
    ...saved.name === undefined ? {} : { name: saved.name },
    ...saved.contextWindow === undefined ? {} : { contextWindow: saved.contextWindow },
    ...saved.maxTokens === undefined ? {} : { maxTokens: saved.maxTokens },
    checked: true,
    reasoningOn: reasoning?.disabled !== true,
    ...savedEfforts.length > 0 ? { efforts: savedEfforts } : {},
    defaultEffort: reasoning?.defaultEffort !== undefined
      && (savedEfforts.length > 0 ? savedEfforts : base.efforts).includes(reasoning.defaultEffort)
      ? reasoning.defaultEffort
      : base.defaultEffort,
    adaptive: saved.protocol === 'claude-code' ? reasoning?.adaptive ?? base.adaptive : base.adaptive,
  }
}

export function rowToSaved(row: PickerRow): SyncedModel {
  return {
    id: row.id,
    ...row.name === undefined ? {} : { name: row.name },
    protocol: row.protocol,
    ...row.contextWindow === undefined ? {} : { contextWindow: row.contextWindow },
    ...row.maxTokens === undefined ? {} : { maxTokens: row.maxTokens },
    reasoning: {
      ...!row.reasoningOn ? { disabled: true } : {},
      ...row.reasoningOn && row.efforts.length > 0 ? { efforts: orderedLevels(row.efforts) } : {},
      ...row.reasoningOn && row.defaultEffort !== undefined && row.efforts.includes(row.defaultEffort)
        ? { defaultEffort: row.defaultEffort }
        : {},
      ...row.reasoningOn && row.protocol === 'claude-code' ? { adaptive: row.adaptive } : {},
    },
  }
}

// Tokens come from @deepseek-ai/dsh-client-ui-theme: aliases are defined on
// body for the light theme and overridden by body[data-ds-dark-theme], so the
// section follows the host day/night theme automatically. Fallbacks mirror the
// light values and only apply if the host theme stylesheet is missing.
const styles = `
.dsh-any { color: var(--dsw-alias-label-primary, #0f1115); max-width: 880px; padding: 8px 4px 28px; }
.dsh-any h2 { margin: 0 0 8px; font-size: 22px; }
.dsh-any p { color: var(--dsw-alias-label-secondary, #61666b); line-height: 1.55; }
.dsh-any-card { background: var(--dsw-alias-bg-module-platform, #f5f6f7); border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .04)); border-radius: 12px; padding: 18px; margin-top: 16px; }
.dsh-any-field { display: grid; gap: 7px; margin-top: 14px; }
.dsh-any-field label { font-size: 13px; color: var(--dsw-alias-label-secondary, #61666b); }
.dsh-any-field input { width: 100%; box-sizing: border-box; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, .12)); background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #0f1115); padding: 10px 12px; }
.dsh-any-field input::placeholder { color: var(--dsw-alias-label-dimmed, #e1e5ee); }
.dsh-any-field input:focus-visible { outline: 2px solid var(--dsw-alias-button-primary-hover, #43454a); outline-offset: 1px; }
.dsh-any-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.dsh-any button { border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1)); border-radius: 8px; background: var(--dsw-alias-button-elevated-fill, #fff); color: var(--dsw-alias-label-primary, #0f1115); padding: 9px 14px; cursor: pointer; }
.dsh-any button:hover:enabled { background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .06)); }
.dsh-any button:focus-visible { outline: 2px solid var(--dsw-alias-button-primary-hover, #43454a); outline-offset: 1px; }
.dsh-any button[data-primary=true] { background: var(--dsw-alias-button-primary-fill, #0f1115); border-color: transparent; color: var(--dsw-alias-label-primary-foreground, #fff); }
.dsh-any button[data-primary=true]:hover:enabled { background: var(--dsw-alias-button-primary-hover, #43454a); }
.dsh-any button:disabled { opacity: .5; cursor: default; }
.dsh-any-status { display: inline-flex; gap: 7px; align-items: center; font-size: 13px; color: var(--dsw-alias-label-secondary, #61666b); }
.dsh-any-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-state-error-primary, #ec1313); }
.dsh-any-dot[data-ready=true] { background: var(--dsw-alias-state-success-primary, #22c55e); }
.dsh-any-error { margin-top: 12px; color: var(--dsw-alias-state-error-primary, #ec1313); white-space: pre-wrap; }
.dsh-any-success { margin-top: 12px; color: var(--dsw-alias-state-success-primary, #22c55e); }
.dsh-any-models { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 7px; }
.dsh-any-models li { display: flex; gap: 10px; justify-content: space-between; align-items: center; padding: 9px 10px; border-radius: 8px; background: var(--dsw-alias-bg-base, #fff); }
.dsh-any-model-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-any-badge { flex: none; font-size: 11px; border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1)); border-radius: 99px; padding: 3px 7px; color: var(--dsw-alias-label-secondary, #61666b); }
.dsh-any-picker { margin-top: 14px; display: grid; gap: 8px; }
.dsh-any-row { border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1)); border-radius: 10px; padding: 10px 12px; background: var(--dsw-alias-bg-base, #fff); }
.dsh-any-row[data-checked=false] { opacity: .62; }
.dsh-any-row-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dsh-any-row-head label { flex: 1; min-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.dsh-any-row-meta { font-size: 12px; color: var(--dsw-alias-label-tertiary, #81858c); }
.dsh-any-levels { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 9px; }
.dsh-any-levels button { padding: 4px 9px; font-size: 12px; border-radius: 99px; }
.dsh-any-levels button[data-on=true] { background: var(--dsw-alias-button-primary-fill, #0f1115); border-color: transparent; color: var(--dsw-alias-label-primary-foreground, #fff); }
.dsh-any-levels button[data-on=true]:hover:enabled { background: var(--dsw-alias-button-primary-hover, #43454a); }
.dsh-any-levels select { border-radius: 8px; border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, .12)); background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #0f1115); padding: 4px 8px; }
.dsh-any-empty { margin-top: 10px; font-size: 13px; color: var(--dsw-alias-label-caption, #adb2b8); }
.dsh-any-hint { margin: 0; font-size: 12px; color: var(--dsw-alias-label-caption, #adb2b8); }
.dsh-any-providers { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 7px; }
.dsh-any-providers li { display: flex; gap: 8px; align-items: center; }
.dsh-any-providers .dsh-any-dot { flex: none; }
.dsh-any-providers button[data-pick=true] { flex: 1; display: flex; gap: 10px; align-items: center; text-align: left; overflow: hidden; }
.dsh-any-providers button[data-pick=true][data-selected=true] { border-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, .12)); background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, .06)); }
.dsh-any-field-error { margin: 0; font-size: 12px; color: var(--dsw-alias-state-error-primary, #ec1313); }
`

interface SectionProps {
  ops: AnyRouterOperations
  scope: SettingsFormView
  /**
   * Registers the credential-invalidation subscriptions. The callback receives
   * the REFERENCE that changed, so a section with N providers can refresh
   * exactly the affected row; `connection/reset` has no reference and forwards
   * an empty string.
   */
  subscribeCredentials: (refresh: (ref: string) => void) => () => void
}

function LevelChips({ row, onChange }: { row: PickerRow; onChange: (row: PickerRow) => void }): ReactElement {
  if (!row.reasoningOn) return <></>
  const toggle = (level: Level) => {
    const next = row.efforts.includes(level)
      ? row.efforts.filter(candidate => candidate !== level)
      : orderedLevels([...row.efforts, level])
    onChange({
      ...row,
      efforts: next,
      defaultEffort: row.defaultEffort !== undefined && next.includes(row.defaultEffort)
        ? row.defaultEffort
        : next[next.length - 1],
    })
  }
  return (
    <div className="dsh-any-levels" data-testid="reasoning-editor">
      {LEVELS.map(level => (
        <button
          key={level}
          type="button"
          data-on={row.efforts.includes(level)}
          disabled={!row.checked}
          onClick={() => toggle(level)}
        >{level}</button>
      ))}
      <label>
        {' 默认 '}
        <select
          disabled={!row.checked || row.efforts.length === 0}
          value={row.defaultEffort ?? ''}
          onChange={event => onChange({
            ...row,
            defaultEffort: event.target.value === '' ? undefined : event.target.value as Level,
          })}
        >
          {row.defaultEffort === undefined || !row.efforts.includes(row.defaultEffort)
            ? <option value="" />
            : null}
          {row.efforts.map(level => <option key={level} value={level}>{level}</option>)}
        </select>
      </label>
      {row.protocol === 'claude-code'
        ? (
          <label>
            <input
              type="checkbox"
              disabled={!row.checked}
              checked={row.adaptive}
              onChange={event => onChange({ ...row, adaptive: event.target.checked })}
            />
            {' 自适应思考'}
          </label>
        )
        : null}
    </div>
  )
}

function Picker({ rows, onChange }: { rows: PickerRow[]; onChange: (next: PickerRow[]) => void }): ReactElement {
  const update = (row: PickerRow) => onChange(rows.map(candidate => candidate.id === row.id ? row : candidate))
  return (
    <div className="dsh-any-picker" data-testid="model-picker">
      {rows.map(row => (
        <div key={row.id} className="dsh-any-row" data-checked={row.checked}>
          <div className="dsh-any-row-head">
            <label title={row.id}>
              <input
                type="checkbox"
                checked={row.checked}
                onChange={event => update({ ...row, checked: event.target.checked })}
              />
              {' '}
              {row.name ?? row.id}
            </label>
            <span className="dsh-any-badge">{row.protocol === 'claude-code' ? 'Claude' : 'Codex'}</span>
            <span className="dsh-any-row-meta">
              {`${Math.round((row.contextWindow ?? 0) / 1000)}k ctx · ${Math.round((row.maxTokens ?? 0) / 1000)}k out`}
            </span>
          </div>
          <div className="dsh-any-levels">
            <label>
              <input
                type="checkbox"
                disabled={!row.checked}
                checked={row.reasoningOn}
                onChange={event => update({ ...row, reasoningOn: event.target.checked })}
              />
              {' 推理'}
            </label>
          </div>
          <LevelChips row={row} onChange={update} />
        </div>
      ))}
    </div>
  )
}

function ReasoningSummary({ model }: { model: SyncedModel }): ReactElement {
  const reasoning = model.reasoning
  if (reasoning === undefined) {
    return <span className="dsh-any-badge">推理 · 参考默认</span>
  }
  if (reasoning.disabled === true) {
    return <span className="dsh-any-badge">无推理</span>
  }
  const efforts = reasoning.efforts?.length ? reasoning.efforts.join('/') : '参考默认'
  const suffix = reasoning.defaultEffort === undefined ? '' : ` · 默认 ${reasoning.defaultEffort}`
  return <span className="dsh-any-badge">{`推理 ${efforts}${suffix}`}</span>
}

function Section({ ops, scope, subscribeCredentials }: SectionProps): ReactElement {
  const snapshot = useSyncExternalStore(
    listener => scope.subscribe(listener),
    () => scope.getSnapshot(),
    () => scope.getSnapshot(),
  )
  const loading = snapshot.status === 'loading'
  const writable = snapshot.status === 'ready' && snapshot.writable && snapshot.mode === 'host'
  const [state, setState] = useState<SectionState>(() => seedSectionState(snapshot.value, 0))
  const [configured, setConfigured] = useState<Record<string, boolean>>({})
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [credentialRevision, setCredentialRevision] = useState(0)
  const [picker, setPicker] = useState<PickerState | null>(null)
  const alive = useRef(true)
  const generation = useRef(0)
  const activeController = useRef<AbortController | null>(null)

  // The persisted value is re-seeded only when its DATA changes, never when a
  // render merely hands back an equal snapshot: re-seeding on identity alone
  // would replace the draft on every keystroke-induced render. Edits made in the
  // detail form live in `state.form`, so an unrelated snapshot echo cannot wipe
  // them either.
  const seedKey = JSON.stringify({
    providers: snapshot.value?.providers ?? null,
    apiKeyEnv: snapshot.value?.apiKeyEnv ?? null,
    baseURL: snapshot.value?.baseURL ?? null,
    proxy: snapshot.value?.proxy ?? null,
    models: snapshot.value?.models ?? null,
  })
  const lastSeedKey = useRef(seedKey)
  useEffect(() => {
    if (busy) return
    if (lastSeedKey.current === seedKey) return
    lastSeedKey.current = seedKey
    setState(current => seedSectionState(snapshot.value, current.selected))
  }, [busy, seedKey, snapshot.value])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      generation.current += 1
      activeController.current?.abort()
    }
  }, [])

  const refreshCredential = useCallback((_ref: string) => setCredentialRevision(value => value + 1), [])
  useEffect(() => subscribeCredentials(refreshCredential), [refreshCredential, subscribeCredentials])

  // Each provider owns its reference, so the status strip is one probe per
  // distinct reference. `refsKey` is the dependency rather than `refs` because a
  // freshly-built array would re-run this effect on every render.
  const refsKey = useMemo(
    () => [...new Set(state.draft.map(provider => credentialRefFor(provider)))].join('\n'),
    [state.draft],
  )
  useEffect(() => {
    let live = true
    const refs = refsKey.length === 0 ? [] : refsKey.split('\n')
    if (refs.length === 0) {
      setConfigured({})
      return () => { live = false }
    }
    void Promise.all(refs.map(async (ref) => {
      try {
        return [ref, await ops.credentialConfigured(ref)] as const
      } catch (reason) {
        if (live) setError(errorMessage(reason))
        return [ref, false] as const
      }
    })).then(entries => { if (live) setConfigured(Object.fromEntries(entries)) })
    return () => { live = false }
  }, [ops, credentialRevision, refsKey])

  const beginOperation = useCallback(() => {
    activeController.current?.abort()
    const controller = new AbortController()
    activeController.current = controller
    const token = ++generation.current
    const active = (): boolean => alive.current && generation.current === token && !controller.signal.aborted
    return { controller, active }
  }, [])

  const selectedProvider = state.selected < 0 ? undefined : state.draft[state.selected]
  const selectedRef = selectedProvider === undefined ? '' : credentialRefFor(selectedProvider)
  const selectedConfigured = configured[selectedRef] === true
  const idProblem = state.form === null ? null : providerIdProblem(state.form.id, state.draft, state.selected)
  const refProblem = state.form === null ? null : credentialRefProblem(state.form.apiKeyEnv)
  const endpointIssue = state.form === null ? null : endpointProblem(state.form.baseURL)
  const proxyIssue = state.form === null ? null : proxyProblem(state.form.proxy)
  // Every problem that would make the Host disable this relay blocks the save,
  // so nothing unusable is ever written. A provider the Host cannot use is not a
  // failed save — it is a persisted configuration the user then has to dig out.
  const blocked = idProblem !== null || refProblem !== null || endpointIssue !== null || proxyIssue !== null

  const patchForm = (patch: Partial<ProviderDraft>): void => {
    setState(current => {
      if (current.form === null || current.selected < 0) return current
      const updatedForm = { ...current.form, ...patch }
      const updatedValue = providerValueFrom(updatedForm)
      const updatedDraft = replaceProvider(current.draft, current.selected, updatedValue)
      return {
        ...current,
        draft: updatedDraft,
        form: updatedForm,
      }
    })
  }

  const selectProvider = (index: number): void => {
    setState(current => {
      const provider = current.draft[index]
      return provider === undefined
        ? current
        : { ...current, selected: index, form: providerDraftFrom(provider) }
    })
  }

  const addProvider = (): void => {
    setState(current => {
      const id = nextProviderId(current.draft)
      const provider: ProviderValue = { id, displayName: id, models: [] }
      const draft = [...current.draft, provider]
      return { draft, selected: draft.length - 1, form: providerDraftFrom(provider) }
    })
    setError(null)
    setSuccess(null)
  }

  const removeProvider = useCallback(async (index: number) => {
    const provider = state.draft[index]
    if (provider === undefined) return
    const operation = beginOperation()
    setBusy(true)
    setError(null)
    setSuccess(null)
    // Optimistic selection: the provider the user just removed must not stay
    // selected. The reseed effect runs when `busy` clears and re-derives both the
    // array and the selection from whatever the Host actually committed.
    setState(current => {
      const draft = withoutProvider(current.draft, index)
      const selected = current.selected === index
        ? (draft.length > 0 ? 0 : -1)
        : current.selected > index ? current.selected - 1 : current.selected
      const next = selected < 0 ? undefined : draft[selected]
      return { draft, selected, form: next === undefined ? null : providerDraftFrom(next) }
    })
    try {
      await persistProviders(scope, withoutProvider(state.draft, index), operation.active)
      if (!operation.active()) return
      setPicker(null)
      setSuccess(`已移除提供商 ${provider.id}。`)
    } catch (reason) {
      if (operation.active()) setError(errorMessage(reason))
    } finally {
      if (operation.active()) setBusy(false)
    }
  }, [beginOperation, scope, state.draft])

  const save = useCallback(async () => {
    const form = state.form
    if (form === null) return
    // Belt and braces: the buttons are disabled while a problem is showing, and
    // this repeats the check so no other path — a keyboard submit, a future
    // caller — can write a configuration the Host would have to disable.
    const problem = providerIdProblem(form.id, state.draft, state.selected)
      ?? credentialRefProblem(form.apiKeyEnv)
      ?? endpointProblem(form.baseURL)
      ?? proxyProblem(form.proxy)
    if (problem !== null) {
      setError(problem)
      return
    }
    const operation = beginOperation()
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const next = providerValueFrom(form)
      const ref = credentialRefFor(next)
      if (apiKey.trim().length > 0) {
        await ops.storeCredential(ref, apiKey.trim())
        if (!operation.active()) return
      }
      // One write, whole array: the Host commits `providers` atomically, and the
      // helper also retires the legacy model list on the first write.
      await persistProviders(scope, replaceProvider(state.draft, state.selected, next), operation.active)
      if (!operation.active()) return
      setApiKey('')
      setSuccess(`提供商 ${next.id} 已保存。配置了 API Key 的提供商会出现在模型选择器。`)
      refreshCredential(ref)
    } catch (reason) {
      if (operation.active()) setError(errorMessage(reason))
    } finally {
      if (operation.active()) setBusy(false)
    }
  }, [apiKey, beginOperation, ops, refreshCredential, scope, state])

  const discover = useCallback(async () => {
    const form = state.form
    if (form === null) return
    const operation = beginOperation()
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const next = providerValueFrom(form)
      const ref = credentialRefFor(next)
      if (apiKey.trim().length > 0) {
        await ops.storeCredential(ref, apiKey.trim())
        if (!operation.active()) return
      }
      // Unlike the endpoint, the proxy has to be SAVED before discovery runs:
      // the Host's `remote.llm.discoverModels` call can carry a draft baseURL but
      // has no field for a draft proxy, so the Host would still tunnel through
      // the previously saved value. The whole provider entry is committed here,
      // which is what makes "paste proxy, press 同步模型" work in one step. The
      // endpoint is saved with it: the Host only sends the stored key to the
      // saved endpoint, never to an unsaved draft.
      await persistProviders(scope, replaceProvider(state.draft, state.selected, next), operation.active)
      const discovered = await ops.discoverModels(next.id, next.baseURL ?? DEFAULT_BASE_URL)
      if (!operation.active()) return
      const saved = new Map((next.models ?? []).map(model => [model.id, model]))
      const rows: PickerRow[] = []
      for (const row of discovered) {
        const protocol = protocolFor(row.id)
        if (protocol === undefined) continue
        const existing = saved.get(row.id)
        rows.push(existing !== undefined
          ? rowFromSaved({
            ...existing,
            ...typeof row.contextWindow === 'number' && existing.contextWindow === undefined
              ? { contextWindow: row.contextWindow }
              : {},
            ...typeof row.maxTokens === 'number' && existing.maxTokens === undefined
              ? { maxTokens: row.maxTokens }
              : {},
          })
          : {
            ...referenceRow(row.id, protocol),
            ...typeof row.name === 'string' && row.name.length > 0 ? { name: row.name } : {},
            ...typeof row.contextWindow === 'number' ? { contextWindow: row.contextWindow } : {},
            ...typeof row.maxTokens === 'number' ? { maxTokens: row.maxTokens } : {},
          })
      }
      setApiKey('')
      setPicker({ providerIndex: state.selected, rows })
      setSuccess(`发现 ${rows.length} 个 Claude / Codex 模型，勾选后保存所选。`)
      refreshCredential(ref)
    } catch (reason) {
      if (operation.active()) setError(errorMessage(reason))
    } finally {
      if (operation.active()) setBusy(false)
    }
  }, [apiKey, beginOperation, ops, refreshCredential, scope, state])

  const saveSelection = useCallback(async () => {
    if (picker === null) return
    const operation = beginOperation()
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      // Unsaved detail edits for the provider being picked are folded in first,
      // so saving a selection never silently reverts a field the user just typed.
      const base = state.form !== null && picker.providerIndex === state.selected
        ? replaceProvider(state.draft, state.selected, providerValueFrom(state.form))
        : state.draft
      const nextModels = picker.rows.filter(row => row.checked).map(rowToSaved)
      // 0.2.0 answers a refusal with `false` after reloading Host state, so the
      // read-back inside `persistProviders` catches it without a separate check.
      await persistProviders(scope, withProviderModels(base, picker.providerIndex, nextModels), operation.active)
      if (!operation.active()) throw new Error('操作已中断。')
      setPicker(null)
      setSuccess(`已保存 ${nextModels.length} 个模型，含各自推理参数。`)
    } catch (reason) {
      if (operation.active()) setError(errorMessage(reason))
    } finally {
      if (operation.active()) setBusy(false)
    }
  }, [beginOperation, picker, scope, state])

  const removeSaved = useCallback(async (id: string) => {
    const form = state.form
    if (form === null) return
    const operation = beginOperation()
    setBusy(true)
    setError(null)
    try {
      const current = providerValueFrom(form)
      const nextModels = (current.models ?? []).filter(model => model.id !== id)
      // A refused write stays silent otherwise: the summary below is derived
      // from the local draft, not from the snapshot, so it would claim a removal
      // the Host never committed.
      await persistProviders(
        scope,
        replaceProvider(state.draft, state.selected, { ...current, models: nextModels }),
        operation.active,
      )
      if (!operation.active()) throw new Error('操作已中断。')
      if (scope.getSnapshot().value?.providers?.[state.selected]?.models?.some(model => model.id === id)) {
        throw new Error('模型列表未能保存，请重试。')
      }
      setSuccess(`已移除 ${id}。`)
    } catch (reason) {
      if (operation.active()) setError(errorMessage(reason))
    } finally {
      if (operation.active()) setBusy(false)
    }
  }, [beginOperation, scope, state])

  const savedModels = state.form?.models ?? []
  const grouped = useMemo(() => ({
    claude: savedModels.filter(model => model.protocol === 'claude-code').length,
    codex: savedModels.filter(model => model.protocol === 'codex-responses').length,
  }), [savedModels])
  const pickerProviderId = picker === null ? '' : state.draft[picker.providerIndex]?.id ?? ''

  return (
    <section className="dsh-any" aria-label="AnyRouter 设置">
      <h2>AnyRouter</h2>
      <p>配置任意数量的中继（提供商）：每个提供商有自己的 API Key、端点与代理，并分别同步 Claude（Agent SDK 兼容请求）与 GPT/Codex（Responses）模型。</p>
      <div className="dsh-any-card">
        <strong>提供商</strong>
        <p>每个提供商是一条独立路由：密钥、端点、代理与模型都互不影响。</p>
        <ul className="dsh-any-providers" data-testid="provider-list">
          {state.draft.map((provider, index) => {
            // The selected row is rendered from the LIVE draft, so an id or name
            // the user is still typing is reflected in the list immediately;
            // unselected providers keep the stored spelling.
            const shown: ProviderValue = state.form !== null && index === state.selected
              ? {
                ...provider,
                id: state.form.id.trim() || provider.id,
                ...state.form.displayName.trim().length === 0
                  ? {}
                  : { displayName: state.form.displayName.trim() },
                ...state.form.apiKeyEnv.trim().length === 0
                  ? {}
                  : { apiKeyEnv: state.form.apiKeyEnv.trim() },
              }
              : provider
            const ref = credentialRefFor(shown)
            return (
              <li key={`${provider.id}#${index}`}>
                <button
                  type="button"
                  data-pick="true"
                  data-selected={index === state.selected}
                  disabled={busy}
                  onClick={() => selectProvider(index)}
                >
                  <span className="dsh-any-dot" data-ready={configured[ref] === true} />
                  <span className="dsh-any-model-name" title={shown.id}>{shown.displayName ?? shown.id}</span>
                  <span className="dsh-any-badge">{shown.id}</span>
                </button>
                <button type="button" disabled={busy || !writable} onClick={() => removeProvider(index)}>移除</button>
              </li>
            )
          })}
        </ul>
        {state.draft.length === 0
          ? <p className="dsh-any-empty">还没有提供商。点击「新增提供商」添加一个中继。</p>
          : null}
        <div className="dsh-any-actions">
          <button type="button" disabled={busy || loading || !writable} onClick={addProvider}>新增提供商</button>
        </div>
      </div>
      {state.form === null
        ? null
        : (
          <div className="dsh-any-card" data-testid="provider-detail">
            <span className="dsh-any-status">
              <span className="dsh-any-dot" data-ready={selectedConfigured} />
              {selectedConfigured ? 'API Key 已配置（提供方已启用）' : '未配置 API Key（提供方已禁用，不出现在模型选择器）'}
            </span>
            <div className="dsh-any-field">
              <label htmlFor="dsh-any-name">显示名称</label>
              <input
                id="dsh-any-name"
                type="text"
                value={state.form.displayName}
                disabled={busy || !writable}
                onChange={event => patchForm({ displayName: event.target.value })}
              />
            </div>
            <div className="dsh-any-field">
              <label htmlFor="dsh-any-id">提供商 ID（请求里的 provider 路由）</label>
              <input
                id="dsh-any-id"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={state.form.id}
                disabled={busy || !writable}
                onChange={event => patchForm({ id: event.target.value })}
              />
              {idProblem === null ? null : <p className="dsh-any-field-error" role="alert">{idProblem}</p>}
            </div>
            <div className="dsh-any-field">
              <label htmlFor="dsh-any-keyref">凭证引用（API Key 存放的环境变量名）</label>
              <input
                id="dsh-any-keyref"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={defaultApiKeyEnvFor(state.form.id)}
                value={state.form.apiKeyEnv}
                disabled={busy || !writable}
                onChange={event => patchForm({ apiKeyEnv: event.target.value })}
              />
              {refProblem === null ? null : <p className="dsh-any-field-error" role="alert">{refProblem}</p>}
            </div>
            <div className="dsh-any-field">
              <label htmlFor="dsh-any-url">API 地址</label>
              <input
                id="dsh-any-url"
                type="url"
                placeholder={DEFAULT_BASE_URL}
                value={state.form.baseURL}
                disabled={busy || !writable}
                onChange={event => patchForm({ baseURL: event.target.value })}
              />
              {endpointIssue === null ? null : <p className="dsh-any-field-error" role="alert">{endpointIssue}</p>}
            </div>
            <div className="dsh-any-field">
              <label htmlFor="dsh-any-proxy">代理（只作用于本提供方，留空为直连）</label>
              <input
                id="dsh-any-proxy"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="http://127.0.0.1:7890"
                value={state.form.proxy}
                disabled={busy || !writable}
                onChange={event => patchForm({ proxy: event.target.value })}
              />
              <p className="dsh-any-hint">
                只让这一家中继的请求走这个代理，不影响其它提供商，也不改动 DSH 的全局代理。
                填 http:// 或 https:// 代理地址（需要认证可写成 http://user:pass@host:port）；
                SOCKS 不支持，请填同一客户端的 HTTP 端口。localhost 与 127.0.0.1 始终直连。
              </p>
              {proxyIssue === null ? null : <p className="dsh-any-field-error" role="alert">{proxyIssue}</p>}
            </div>
            <div className="dsh-any-field">
              <label htmlFor="dsh-any-key">API Key（仅写入，不回显）</label>
              <input
                id="dsh-any-key"
                type="password"
                autoComplete="off"
                placeholder={selectedConfigured ? '输入新 Key 以替换' : 'sk-…'}
                value={apiKey}
                disabled={busy || !writable}
                onChange={event => setApiKey(event.target.value)}
              />
            </div>
            <p className="dsh-any-hint">
              请求头与 CLI 版本由插件自己维护，设置页不提供覆盖项：插件始终按当前 Claude Code /
              Codex CLI 的完整请求头发送，以确保模拟指纹与官方客户端一致。
            </p>
            <div className="dsh-any-actions">
              <button
                type="button"
                disabled={busy || loading || !writable || blocked || (apiKey.trim().length === 0 && !selectedConfigured)}
                onClick={save}
              >保存配置</button>
              <button
                type="button"
                data-primary="true"
                disabled={busy || loading || !writable || blocked || (apiKey.trim().length === 0 && !selectedConfigured)}
                onClick={discover}
              >
                {busy ? '处理中…' : '同步模型'}
              </button>
            </div>
            {snapshot.status === 'unavailable'
              ? <div className="dsh-any-error" role="alert">当前连接不能修改设置，请在本机 Web 页面操作。</div>
              : null}
            {error === null ? null : <div className="dsh-any-error" role="alert">{error}</div>}
            {success === null ? null : <div className="dsh-any-success" role="status">{success}</div>}
          </div>
        )}
      {picker === null
        ? null
        : (
          <div className="dsh-any-card">
            <strong>{`为 ${pickerProviderId} 选择纳入模型选择器的模型`}</strong>
            <p>勾选模型、调整推理档位与默认力度，然后保存所选。gpt-5-codex 默认不勾选（Responses 端点不支持）。</p>
            <Picker rows={picker.rows} onChange={rows => setPicker(current => current === null ? current : { ...current, rows })} />
            <div className="dsh-any-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPicker(current => current === null
                  ? current
                  : { ...current, rows: current.rows.map(row => ({ ...row, checked: true })) })}
              >全选</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPicker(current => current === null
                  ? current
                  : { ...current, rows: current.rows.map(row => ({ ...row, checked: false })) })}
              >全不选</button>
              <button type="button" data-primary="true" disabled={busy} onClick={saveSelection}>保存所选</button>
              <button type="button" disabled={busy} onClick={() => setPicker(null)}>取消</button>
            </div>
          </div>
        )}
      <div className="dsh-any-card">
        <strong>已保存模型</strong>
        <p>
          {selectedProvider === undefined
            ? '尚未选择提供商。'
            : savedModels.length === 0
              ? `${selectedProvider.id} 尚未保存模型。`
              : `${selectedProvider.id}：Claude ${grouped.claude} 个，Codex ${grouped.codex} 个。`}
        </p>
        <ul className="dsh-any-models">
          {savedModels.map(model => (
            <li key={model.id}>
              <span className="dsh-any-model-name" title={model.id}>{model.name ?? model.id}</span>
              <ReasoningSummary model={model} />
              <button type="button" disabled={busy || !writable} onClick={() => removeSaved(model.id)}>移除</button>
            </li>
          ))}
        </ul>
        <p className="dsh-any-empty">模型列表是建议性的：上游通道不可用或满载时，请求仍可能失败（429/500）。</p>
      </div>
    </section>
  )
}

/**
 * Required services. `remote.credentials` and `remote.llm` are the Host
 * capabilities this section is built on; declaring them keeps activation
 * waiting until both namespaces are mounted rather than crashing the slot.
 * `configForms` replaces the pre-0.1.7 browser settings-scope service and
 * carries the writes. `remote.settings` is deliberately NOT declared: the
 * ConfigForms provider owns that write path and reads `ctx` as its *providing*
 * fiber, so it is the settings plugin — not this consumer — that must inject
 * `remote.settings` (see config-form.d.ts:113-118 and
 * dsh-client-ui-settings/lib/client.js:1503). Declaring it here would be dead
 * weight. `slots` declares the render seat; `settings.section` itself needs no
 * declaration in `inject` because `slots.inject()` already defers registration
 * until the seat exists (the shipped ui-settings-models client does the same).
 */
export const inject = ['slots', 'remote', 'remote.credentials', 'remote.llm', 'configForms']

/**
 * DSH release line whose Client contract this plugin was built and verified
 * against. Informational only — it is not a version gate: the capability probe
 * in `createOperations` is what actually decides whether this Host is usable.
 * The range mirrors the `@deepseek-ai/dsh-*` peer range in `package.json`, which
 * is what the Host's own compatibility gate evaluates, so a Host that admits
 * this plugin is exactly a Host this string names.
 */
const SUPPORTED_HOST = '@deepseek-ai/dsh-web-app ^0.2.0-rc.2'

/**
 * The sole seam between this plugin and the DSH Client contract: every Host
 * call and every version difference lives here, so the section stays free of
 * service lookups and envelope handling.
 * @param ctx - client cordis context carrying the typed Remote namespaces.
 * @returns operations bound to this Host.
 */
function createOperations(ctx: any): AnyRouterOperations {
  const remote = ctx.remote
  // Capability probe: `connection.api` carried these calls up to 0.1.1-rc.2 and
  // was removed in 0.1.2-alpha.3, which moved them onto typed Remote
  // namespaces; 0.2.0 keeps those namespaces and the same `ctx.configForms`
  // seam that replaced the pre-0.1.7 browser settings-scope service. Only the
  // Remote shape is verified here, so a Host without it fails loudly instead of
  // degrading onto an unverified path.
  if (remote?.credentials?.describe === undefined || remote?.llm?.discoverModels === undefined) {
    throw new Error(
      `dsh-anyrouter: this DSH build exposes no remote.credentials/remote.llm namespaces. `
      + `Supported: ${SUPPORTED_HOST}. Upgrade DSH, or install a dsh-anyrouter release matching your Host.`,
    )
  }
  return {
    credentialConfigured: async ref => {
      const value = unwrapRemote<Record<string, { configured?: unknown }>>(
        await remote.credentials.describe([ref]),
      )
      return value?.[ref]?.configured === true
    },
    storeCredential: async (ref, value) => {
      unwrapRemote<unknown>(await remote.credentials.set(ref, value))
    },
    discoverModels: async (providerId, baseURL) => {
      const value = unwrapRemote<unknown>(await remote.llm.discoverModels(SETTINGS_NS, {
        provider: providerId,
        baseURL,
      }))
      // The namespace answers with the model array; tolerate a `{ models }`
      // wrapper so a Host that re-wraps it does not blank the picker.
      const models = Array.isArray(value)
        ? value
        : (value as { models?: unknown } | null)?.models
      return Array.isArray(models) ? models as DiscoveredModel[] : []
    },
  }
}

/**
 * Adapt one 0.2.0 `ConfigForm<SettingsValue>` to the narrow `SettingsFormView` the
 * section consumes, so the component keeps reading `getSnapshot/subscribe/set`
 * without knowing about `ConfigForm` or its extra seats
 * (`base`/`user`/`revision`/`mutate`/`unset`).
 *
 * `ConfigForms.get(entryId)` takes the Host plugin entry id, which is exactly
 * `SETTINGS_NS`; the form's own decoder defaults to the namespace's serialized
 * wire schema, so the hand-written `decode` that the pre-0.1.7 browser
 * settings-scope seam needed is no longer required. A schema that
 * admits a non-object section would emit one whose `value.models`/`value.baseURL`
 * reads both yield undefined, and the section already treats that as empty.
 * @param form - the shared form for our Host entry.
 * @returns the section-facing view of it.
 */
function createScope(form: { getSnapshot(): unknown; subscribe(listener: () => void): () => void; set(field: string, value: unknown): Promise<boolean> }): SettingsFormView {
  return {
    getSnapshot: () => form.getSnapshot() as SettingsFormViewSnapshot,
    subscribe: listener => form.subscribe(listener),
    set: (field, value) => form.set(field, value),
  }
}

export function apply(ctx: any): void {
  const ops = createOperations(ctx)
  // The section edits the namespace owned by our own Host half. `whileServed`
  // keeps the nav entry out of a deployment that mounted this Client bundle
  // without the Host entry — the documented remedy for "a page edits a
  // namespace another plugin owns" (config-form.d.ts:143-156). Without it, such
  // a page could only ever render its permanent `loading` state. The caller
  // owns the returned disposer, so it is wrapped in `ctx.effect`, matching the
  // shipped ui-settings-web-search registration
  // (dsh-client-ui-settings-web-search/lib/client.js:300-314).
  const scope = createScope(ctx.configForms.get(SETTINGS_NS))
  const subscribeCredentials = (refresh: (ref: string) => void): (() => void) => {
    const disposers: Array<() => void> = []
    try {
      // Every provider owns a reference, so a change to ANY of them has to reach
      // the section: the callback narrows by ref, and the section re-probes only
      // the rows it renders.
      disposers.push(ctx.remote.$on(
        'credentials/reference-updated',
        (ref: string) => refresh(ref ?? ''),
      ))
    } catch { /* the Host may not push credential invalidations */ }
    // A connection reset invalidates every cached credential fact at once and
    // names no reference, so the empty string is forwarded as "everything".
    try { disposers.push(ctx.on('connection/reset', () => refresh(''))) } catch { /* optional during tests */ }
    return () => { for (const dispose of disposers) dispose() }
  }
  ctx.effect(() => {
    const element = document.createElement('style')
    element.dataset.plugin = 'dsh-anyrouter'
    element.textContent = styles
    document.head.appendChild(element)
    return () => element.remove()
  }, 'dsh-anyrouter: settings styles')
  const install = (): (() => void) => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: PROVIDER,
    order: 11,
    label: () => 'AnyRouter',
    inject: () => ({ ops, scope, subscribeCredentials }),
  }, Section))
  ctx.effect(
    () => ctx.configForms.whileServed([SETTINGS_NS], install),
    'dsh-anyrouter: settings section',
  )
}
