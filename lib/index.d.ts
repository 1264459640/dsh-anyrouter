import { LlmDiscoveredModel, ResolvedRetryPolicy, RetryPolicyConfig } from "@deepseek-ai/dsh-llm";
import { ProviderStreams } from "@earendil-works/pi-ai";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import z from "@deepseek-ai/schemastery";
import { CredentialRef } from "@deepseek-ai/dsh-credentials";
import { Context, Volatile } from "@deepseek-ai/cordis";
import { AttachmentStore } from "@deepseek-ai/dsh-attachment";
//#region src/config.d.ts
declare const REASONING_LEVELS: readonly ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
type ReasoningLevel = (typeof REASONING_LEVELS)[number];
type AnyRouterProtocol = 'claude-code' | 'codex-responses';
/**
 * Persisted reasoning profile for one synchronized model. `efforts` is the
 * authoritative enable flag: an empty (or absent) list keeps whatever the
 * generated reference profile says, and a non-empty list replaces it.
 */
interface ReasoningProfile {
  /** Explicitly offer the model without a reasoning control. */
  disabled?: boolean;
  /** Selectable levels in canonical order; empty falls back to the reference. */
  efforts?: ReasoningLevel[];
  /** Level the model selector marks as default; must be one of `efforts`. */
  defaultEffort?: ReasoningLevel;
  /** Claude-only: send adaptive `effort` instead of a thinking budget. */
  adaptive?: boolean;
}
interface AnyRouterModelConfig {
  id: string;
  name?: string;
  protocol: AnyRouterProtocol;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: ReasoningProfile;
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
interface AnyRouterProviderConfig {
  /** Provider route id; lowercase alphanumerics with `.`, `_` and `-`. */
  id: string;
  /** Label shown by the selector and the settings section. Defaults to the id. */
  displayName?: string;
  /**
   * Credential reference this provider's key is stored under. Defaults to
   * `ANYROUTER_API_KEY` on the migrated route and to a name derived from the id
   * elsewhere. Each provider owns its own reference, so keys never cross.
   */
  apiKeyEnv?: string;
  /** Relay endpoint. Required once `providers` is used, defaulted for the migrated route. */
  baseURL?: string;
  /**
   * An `http://` or `https://` proxy this provider alone tunnels through.
   * Empty means direct. It is NOT the harness's global proxy: that one is
   * installed by the launcher from the environment and already covers every
   * provider, so this field exists precisely for the case where only this
   * relay must be proxied.
   */
  proxy?: string;
  models?: AnyRouterModelConfig[];
  /** Overrides the section-wide idle timeout for this provider alone. */
  streamIdleTimeoutMs?: number;
  /** Overrides the section-wide retry policy for this provider alone. */
  retryPolicy?: RetryPolicyConfig;
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
interface Config {
  providers: Volatile<AnyRouterProviderConfig[] | undefined>;
  /** Legacy single-route endpoint; folds into the migrated provider. */
  apiKeyEnv: Volatile<string>;
  /** Legacy single-route endpoint; folds into the migrated provider. */
  baseURL: Volatile<string>;
  /** Legacy single-route proxy; folds into the migrated provider. */
  proxy: Volatile<string>;
  /** Legacy single-route model list; folds into the migrated provider. */
  models: Volatile<AnyRouterModelConfig[]>;
  /** Section-wide idle timeout; a provider may override it. */
  streamIdleTimeoutMs: Volatile<number>;
  /** Section-wide retry policy; a provider may override it. */
  retryPolicy: Volatile<RetryPolicyConfig | undefined>;
}
/** Plain values behind every reference of a validated {@link Config}. */
type Options = { [K in keyof Config]?: Config[K] extends Volatile<infer T> ? Exclude<T, undefined> : never; };
/**
 * Read the current value behind every reference of a validated Config. The
 * reference protocol is detected rather than assumed, so a plain configuration
 * object still reads correctly when a caller builds one by hand.
 */
declare function plainOptions(config: Config): Options;
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
interface ResolvedProviderConfig {
  id: string;
  displayName: string;
  apiKeyEnv: CredentialRef;
  /** The endpoint, or `undefined` while the provider has none to use. */
  baseURL: string | undefined;
  /** The canonical tunnel URL, or `undefined` for a direct connection. */
  proxy: string | undefined;
  models: readonly AnyRouterModelConfig[];
  streamIdleTimeoutMs: number;
  retryPolicy: ResolvedRetryPolicy;
  /** Why this provider is disabled; absent means it is usable. */
  error?: string | undefined;
}
interface ResolvedConfig {
  providers: readonly ResolvedProviderConfig[];
  /**
   * One message per provider entry that could not be represented at all —
   * a missing or malformed id, or a duplicate of an earlier entry. Those have
   * no route key to carry an `error`, so they are dropped from `providers` and
   * reported here instead. The plugin logs them and keeps running.
   */
  diagnostics: readonly string[];
}
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
declare const Config: z<Schemastery.ObjectS<NoInfer<{
  providers: z<NoInfer<AnyRouterProviderConfig[]>, NoInfer<AnyRouterProviderConfig[]>, "volatile-defined">;
  apiKeyEnv: z<string, string, "volatile-defined">;
  baseURL: z<string, string, "volatile-defined">;
  proxy: z<string, string, "volatile-defined">;
  models: z<NoInfer<AnyRouterModelConfig[]>, NoInfer<AnyRouterModelConfig[]>, "volatile-defined">;
  streamIdleTimeoutMs: z<number, number, "volatile-defined">;
  retryPolicy: z<NoInfer<RetryPolicyConfig>, NoInfer<RetryPolicyConfig>, "volatile">;
}>>, Schemastery.ObjectT<NoInfer<{
  providers: z<NoInfer<AnyRouterProviderConfig[]>, NoInfer<AnyRouterProviderConfig[]>, "volatile-defined">;
  apiKeyEnv: z<string, string, "volatile-defined">;
  baseURL: z<string, string, "volatile-defined">;
  proxy: z<string, string, "volatile-defined">;
  models: z<NoInfer<AnyRouterModelConfig[]>, NoInfer<AnyRouterModelConfig[]>, "volatile-defined">;
  streamIdleTimeoutMs: z<number, number, "volatile-defined">;
  retryPolicy: z<NoInfer<RetryPolicyConfig>, NoInfer<RetryPolicyConfig>, "volatile">;
}>>, "plain">;
/**
 * Validate one provider route id.
 * @param raw - the configured id.
 * @returns the trimmed id.
 * @throws when the id is empty or outside {@link PROVIDER_ID_PATTERN}.
 */
declare function normalizeProviderId(raw: string): string;
/**
 * The credential reference a provider uses when its configuration names none.
 * The migrated legacy route keeps `ANYROUTER_API_KEY` so an upgrade finds the
 * key the user already stored; every other route derives a distinct name from
 * its id, so two relays can never share — and therefore never overwrite — one
 * stored key.
 * @param providerId - a validated provider id.
 * @returns the default credential reference name.
 */
declare function defaultApiKeyEnvFor(providerId: string): string;
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
declare function resolveConfig(config: Options): ResolvedConfig;
//#endregion
//#region src/adapter.d.ts
declare class AnyRouterAdapter extends PiAiAdapter {
  constructor(options: {
    config: () => ResolvedConfig;
    resolveApiKey: (ref: CredentialRef) => Promise<string>;
    resolveAttachments?: () => AttachmentStore | undefined;
  });
  private readonly modelOptions;
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
  resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<import("@deepseek-ai/dsh-llm").LlmResolvedModelInfo>;
}
//#endregion
//#region src/discovery.d.ts
/**
 * Interrogate one relay for the models it advertises.
 *
 * The name survives from the single-provider era but the function is not tied
 * to it: `label` names the provider in every diagnostic, because with several
 * relays configured a bare "model listing is not an OpenAI-compatible data
 * array" would not say which endpoint misbehaved.
 * @param options - endpoint, one-shot credential, cancellation and label.
 * @returns the Claude/GPT models the endpoint reports, in endpoint order.
 */
declare function discoverAnyRouterModels(options: {
  baseURL: string;
  apiKey: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  /** Provider name for diagnostics; defaults to the migrated route's name. */
  label?: string;
}): Promise<LlmDiscoveredModel[]>;
//#endregion
//#region src/proxy.d.ts
/**
 * The proxy setting's pure half: validation, canonicalization, the loopback
 * bypass predicate, and diagnostic redaction.
 *
 * Nothing here imports a transport, so the module is loadable wherever the
 * configuration schema is — the Host bundle, a test, or any future consumer
 * that must validate the field without owning an HTTP client. The half that
 * actually tunnels is `./proxy-transport.ts`, which is the only file that
 * imports `undici`.
 * @module dsh-anyrouter/proxy
 */
/**
 * Render a proxy URL safe to put in an error message or a log line.
 *
 * A proxy URL routinely carries the credential that authorises the tunnel
 * (`http://user:pass@host:port`), and unlike the endpoint setting this field
 * deliberately accepts user information. Redaction is therefore the caller's
 * job at every reporting site, not a property of the stored value.
 * @param value - the proxy URL exactly as configured.
 * @returns the URL with any user information masked, or a placeholder when it cannot be parsed.
 */
declare function redactProxyURL(value: string): string;
/**
 * Validate and canonicalize the one proxy URL this route may tunnel through.
 *
 * An empty or absent value means a direct connection, which is the default and
 * the behaviour every release before this field had. User information IS
 * accepted here, unlike {@link normalizeBaseURL}: a proxy URL carries the
 * tunnel's credential, and refusing it would make every authenticated proxy
 * unusable.
 * @param raw - the configured value, as the settings form or a hand-built object holds it.
 * @returns the canonical proxy URL, or `undefined` for a direct connection.
 * @throws when the value is present but unusable, naming the redacted URL.
 */
declare function normalizeProxyURL(raw: string | undefined): string | undefined;
/**
 * Whether a host names this machine, and therefore must not be sent to a
 * proxy.
 *
 * A proxy cannot usefully reach a loopback address: it would resolve that
 * address in its own network, and a proxy running locally would reach a service
 * that only listens on this machine. The harness's own global proxy policy
 * bypasses loopback for exactly this reason, and a route-scoped proxy must
 * agree, or a locally hosted relay would break the moment a proxy is
 * configured. The whole `127.0.0.0/8` block is matched rather than the four
 * literal entries a naive list carries.
 * @param hostname - a URL's hostname, bracketed or not.
 * @returns true when the host is loopback or the unspecified address.
 */
declare function isLoopbackHost(hostname: string): boolean;
//#endregion
//#region src/proxy-transport.d.ts
/**
 * The proxy setting's transport half: a `fetch` that tunnels through one proxy
 * URL, and the small agent cache that keeps the tunnel warm.
 *
 * The proxy is deliberately applied per request, through `RequestInit`'s
 * `dispatcher`, and never through `undici`'s global dispatcher. That is the
 * whole point of this module: DSH installs a process-wide dispatcher from
 * `http_proxy`/`https_proxy`/`all_proxy` at boot
 * (`@deepseek-ai/dsh-http-proxy`), and replacing it here would route every
 * other provider, the Web UI's own traffic, and anything else the harness sends
 * through a proxy this setting was never meant to cover. Nothing in this file
 * mutates process state: the returned `fetch` closes over one proxy URL.
 *
 * The `fetch` handed back is `undici`'s own, not the global one, because a
 * dispatcher must come from the same `undici` installation that validates it —
 * the OpenAI SDK documents the same requirement for `ProxyAgent` usage. Both
 * are imported from the single `undici` dependency this route declares.
 * @module dsh-anyrouter/proxy-transport
 */
/**
 * A `fetch` that sends every request through `proxy`, or the global `fetch`
 * itself when no proxy is configured.
 *
 * The direct case returns the global function rather than a wrapper, so a route
 * with no proxy behaves exactly as it did before this setting existed — and a
 * test that replaces `globalThis.fetch` keeps intercepting it.
 *
 * A loopback target is sent directly even when a proxy is configured: see
 * {@link isLoopbackHost}.
 * @param proxy - the canonical proxy URL, or `undefined` for a direct connection.
 * @returns a `fetch` bound to that route.
 */
declare function proxyFetch(proxy: string | undefined): typeof globalThis.fetch;
/**
 * Close and forget every cached tunnel agent.
 *
 * Only tests call this: a live route keeps its agent warm on purpose, and
 * closing one mid-request would fail the request that was already using it.
 * @returns a promise settling once every agent has closed.
 */
declare function disposeProxyAgents(): Promise<void>;
//#endregion
//#region src/transports/claude.d.ts
/**
 * The per-route fact the Claude Code transport cannot read off the model: the
 * route id it answers as. One bundle instance may serve several relays at once,
 * and each has its own route id, so it is not a module constant.
 *
 * Nothing about the client IDENTITY lives here. The version claim and the
 * complete header set are the bundle's own (`./headers.ts`), which is what
 * makes the fingerprint reproducible rather than user-dependent.
 */
interface ClaudeCodeTransportOptions {
  /** Provider route id this transport belongs to; replaces the bundle default. */
  providerId?: string;
}
/**
 * Build the Claude Code transport for one route.
 *
 * The `fetch` is resolved per request rather than captured once, so a live
 * settings edit that changes the proxy URL takes effect on the next request
 * without remounting the plugin. A route that configures no proxy receives the
 * global `fetch`, which is what every release before this seam used.
 *
 * The transport is otherwise parameterized by `transport`, which is what lets
 * ONE bundle serve several relays: the route id it answers as, the CLI version
 * it claims, and the extra betas it advertises all come from the provider entry
 * that built it rather than from this module's constants.
 * @param resolveFetch - supplies the `fetch` this route must send with.
 * @param transport - the owning provider's identity and beta overrides.
 * @returns the stream functions pi-ai's provider registry expects.
 */
declare function createClaudeCodeStreams(resolveFetch?: () => typeof globalThis.fetch, transport?: ClaudeCodeTransportOptions): ProviderStreams;
/** The direct-connection transport: the route with no proxy configured. */
declare const claudeCodeStreams: ProviderStreams;
//#endregion
//#region src/transports/codex.d.ts
/**
 * The per-route fact the Codex Responses transport cannot read off the model:
 * the route id it answers as. One bundle instance may serve several relays at
 * once, and each has its own route id, so it is not a module constant.
 *
 * Nothing about the client IDENTITY lives here — see `./headers.ts`.
 */
interface CodexTransportOptions {
  /** Provider route id this transport belongs to; replaces the bundle default. */
  providerId?: string;
}
/**
 * Build the Codex Responses transport for one route.
 *
 * Mirrors {@link createClaudeCodeStreams}: the `fetch` is resolved per request
 * so a live proxy edit applies to the next request, a route with no proxy gets
 * the global `fetch` exactly as before, and `transport` supplies the identity
 * this particular route answers as — which is what lets one bundle serve
 * several relays without sharing a `user-agent`.
 * @param resolveFetch - supplies the `fetch` this route must send with.
 * @param transport - the owning provider's route id and version override.
 * @returns the stream functions pi-ai's provider registry expects.
 */
declare function createCodexResponsesStreams(resolveFetch?: () => typeof globalThis.fetch, transport?: CodexTransportOptions): ProviderStreams;
/** The direct-connection transport: the route with no proxy configured. */
declare const codexResponsesStreams: ProviderStreams;
//#endregion
//#region src/index.d.ts
declare const name = "dsh-anyrouter";
declare const inject: string[];
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { AnyRouterAdapter, type AnyRouterModelConfig, type AnyRouterProtocol, type AnyRouterProviderConfig, Config, type Options, type ReasoningProfile, type ResolvedConfig, type ResolvedProviderConfig, apply, claudeCodeStreams, codexResponsesStreams, createClaudeCodeStreams, createCodexResponsesStreams, defaultApiKeyEnvFor, discoverAnyRouterModels, disposeProxyAgents, inject, isLoopbackHost, name, normalizeProviderId, normalizeProxyURL, plainOptions, proxyFetch, redactProxyURL, resolveConfig };
//# sourceMappingURL=index.d.ts.map