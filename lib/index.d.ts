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
 * The validated plugin configuration as `apply()` receives it. Every field is
 * a stable reference rather than a plain value: the Loader commits a live
 * settings edit into these references without remounting the plugin, so a
 * consumer reads the current value through {@link plainOptions} instead of
 * re-reading a settings source.
 */
interface Config {
  apiKeyEnv: Volatile<string>;
  baseURL: Volatile<string>;
  /**
   * An `http://` or `https://` proxy this route alone tunnels through. Empty
   * means direct. It is NOT the harness's global proxy: that one is installed
   * by the launcher from the environment and already covers every provider, so
   * this field exists precisely for the case where only AnyRouter must be
   * proxied.
   */
  proxy: Volatile<string>;
  models: Volatile<AnyRouterModelConfig[]>;
  streamIdleTimeoutMs: Volatile<number>;
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
interface ResolvedConfig {
  apiKeyEnv: CredentialRef;
  baseURL: string;
  /** The canonical tunnel URL, or `undefined` for a direct connection. */
  proxy: string | undefined;
  models: readonly AnyRouterModelConfig[];
  streamIdleTimeoutMs: number;
  retryPolicy: ResolvedRetryPolicy;
}
/**
 * The plugin's configuration schema, which the Host also publishes as this
 * entry's configuration form: `SettingsForms.describe()` reports the entries
 * whose schema declares live fields, and a settings write is committed into
 * the running plugin's references without a remount. Every field is therefore
 * declared volatile — a schema without one is not offered as a form at all,
 * and a write to a non-volatile path is refused.
 */
declare const Config: z<Schemastery.ObjectS<NoInfer<{
  apiKeyEnv: z<string, string, "volatile-defined">;
  baseURL: z<string, string, "volatile-defined">;
  proxy: z<string, string, "volatile-defined">;
  models: z<NoInfer<AnyRouterModelConfig[]>, NoInfer<AnyRouterModelConfig[]>, "volatile-defined">;
  streamIdleTimeoutMs: z<number, number, "volatile-defined">;
  retryPolicy: z<NoInfer<RetryPolicyConfig>, NoInfer<RetryPolicyConfig>, "volatile">;
}>>, Schemastery.ObjectT<NoInfer<{
  apiKeyEnv: z<string, string, "volatile-defined">;
  baseURL: z<string, string, "volatile-defined">;
  proxy: z<string, string, "volatile-defined">;
  models: z<NoInfer<AnyRouterModelConfig[]>, NoInfer<AnyRouterModelConfig[]>, "volatile-defined">;
  streamIdleTimeoutMs: z<number, number, "volatile-defined">;
  retryPolicy: z<NoInfer<RetryPolicyConfig>, NoInfer<RetryPolicyConfig>, "volatile">;
}>>, "plain">;
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
   */
  resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<import("@deepseek-ai/dsh-llm").LlmResolvedModelInfo>;
}
//#endregion
//#region src/discovery.d.ts
declare function discoverAnyRouterModels(options: {
  baseURL: string;
  apiKey: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
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
 * Build the Claude Code transport for one route.
 *
 * The `fetch` is resolved per request rather than captured once, so a live
 * settings edit that changes the proxy URL takes effect on the next request
 * without remounting the plugin. A route that configures no proxy receives the
 * global `fetch`, which is what every release before this seam used.
 * @param resolveFetch - supplies the `fetch` this route must send with.
 * @returns the stream functions pi-ai's provider registry expects.
 */
declare function createClaudeCodeStreams(resolveFetch?: () => typeof globalThis.fetch): ProviderStreams;
/** The direct-connection transport: the route with no proxy configured. */
declare const claudeCodeStreams: ProviderStreams;
//#endregion
//#region src/transports/codex.d.ts
/**
 * Build the Codex Responses transport for one route.
 *
 * Mirrors {@link createClaudeCodeStreams}: the `fetch` is resolved per request
 * so a live proxy edit applies to the next request, and a route with no proxy
 * gets the global `fetch` exactly as before.
 * @param resolveFetch - supplies the `fetch` this route must send with.
 * @returns the stream functions pi-ai's provider registry expects.
 */
declare function createCodexResponsesStreams(resolveFetch?: () => typeof globalThis.fetch): ProviderStreams;
/** The direct-connection transport: the route with no proxy configured. */
declare const codexResponsesStreams: ProviderStreams;
//#endregion
//#region src/index.d.ts
declare const name = "dsh-anyrouter";
declare const inject: string[];
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { AnyRouterAdapter, type AnyRouterModelConfig, type AnyRouterProtocol, Config, type Options, type ResolvedConfig, apply, claudeCodeStreams, codexResponsesStreams, createClaudeCodeStreams, createCodexResponsesStreams, discoverAnyRouterModels, disposeProxyAgents, inject, isLoopbackHost, name, normalizeProxyURL, plainOptions, proxyFetch, redactProxyURL, resolveConfig };
//# sourceMappingURL=index.d.ts.map