import { LlmError, ReasoningEffortId, RetryPolicySchema, assertUsableApiKey, attributionHeaders, normalizeApiKey, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { createProvider, getCurrentSystemPrompt, getCurrentTools, getInitialSystemMessage, hasToolRedefinitions, normalizeContext } from "@earendil-works/pi-ai";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import z from "@deepseek-ai/schemastery";
import { credentialRef, isCredentialRefName } from "@deepseek-ai/dsh-credentials";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import { ProxyAgent, fetch as fetch$1 } from "undici";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { stream } from "@earendil-works/pi-ai/api/anthropic-messages";
import { arch, platform, release } from "node:os";
import { streamSimple } from "@earendil-works/pi-ai/api/openai-responses";
//#region src/proxy.ts
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
/** Proxy schemes this route can tunnel through. */
const SUPPORTED_PROXY_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:"]);
/**
* Schemes recognised well enough to be named in the diagnostic rather than
* reported as malformed. They are refused because neither `undici`'s
* `ProxyAgent` nor the harness's own global proxy policy speaks them; the
* answer is to point the setting at the proxy's HTTP port, which every popular
* local client (Clash, V2Ray, sing-box) also exposes.
*/
const SOCKS_PROXY_PROTOCOLS = /* @__PURE__ */ new Set([
	"socks:",
	"socks4:",
	"socks4a:",
	"socks5:",
	"socks5h:"
]);
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
function redactProxyURL(value) {
	try {
		const parsed = new URL(value);
		if (parsed.username.length === 0 && parsed.password.length === 0) return value;
		parsed.username = "***";
		parsed.password = "";
		return parsed.toString();
	} catch {
		return "<unparseable>";
	}
}
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
function normalizeProxyURL(raw) {
	const value = (raw ?? "").trim();
	if (value.length === 0) return void 0;
	let parsed;
	try {
		parsed = new URL(value);
	} catch (cause) {
		throw new Error(`dsh-anyrouter: invalid proxy ${JSON.stringify(redactProxyURL(value))}`, { cause });
	}
	if (SOCKS_PROXY_PROTOCOLS.has(parsed.protocol)) throw new Error(`dsh-anyrouter: proxy ${redactProxyURL(value)} uses ${parsed.protocol}//, which this route cannot tunnel through; point it at the same client's HTTP proxy port instead (for example http://127.0.0.1:7890)`);
	if (!SUPPORTED_PROXY_PROTOCOLS.has(parsed.protocol)) throw new Error(`dsh-anyrouter: proxy ${redactProxyURL(value)} must use http:// or https://`);
	parsed.hash = "";
	const canonical = parsed.toString();
	return parsed.pathname === "/" && parsed.search.length === 0 ? canonical.replace(/\/+$/, "") : canonical;
}
/** One IPv4 octet, so a loopback match cannot accept `127.999.1.1`. */
const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
/** The whole `127.0.0.0/8` block, not just its first address. */
const LOOPBACK_IPV4 = new RegExp(`^127\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);
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
function isLoopbackHost(hostname) {
	const host = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
	if (host === "localhost" || host.endsWith(".localhost")) return true;
	if (host === "::1" || host === "::" || host === "0.0.0.0") return true;
	const mappedHigh = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(host)?.[1];
	if (mappedHigh !== void 0) return Number.parseInt(mappedHigh, 16) >>> 8 === 127;
	return LOOPBACK_IPV4.test(host.startsWith("::ffff:") ? host.slice(7) : host);
}
//#endregion
//#region src/config.ts
/**
* The route id the legacy single-provider configuration migrates to. Nothing
* downstream treats it as special any more — it is only the id the pre-`v0.5.0`
* flat fields (`baseURL` / `proxy` / `models`) synthesize when a configuration
* carries no `providers` array, so an upgraded install keeps answering on the
* same route it always did.
*/
const PROVIDER = "anyrouter";
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
const SETTINGS_NS = "dsh-anyrouter";
const DEFAULT_PROVIDER_ID = PROVIDER;
const DEFAULT_DISPLAY_NAME = "AnyRouter";
const DEFAULT_API_KEY_ENV = "ANYROUTER_API_KEY";
const DEFAULT_BASE_URL = "https://anyrouter.top";
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
/** Wire routes this bundle can serve. Each is a pi-ai provider route id. */
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const REASONING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
/**
* Read the current value behind every reference of a validated Config. The
* reference protocol is detected rather than assumed, so a plain configuration
* object still reads correctly when a caller builds one by hand.
*/
function plainOptions(config) {
	const providers = valueOf(config.providers);
	const apiKeyEnv = valueOf(config.apiKeyEnv);
	const baseURL = valueOf(config.baseURL);
	const proxy = valueOf(config.proxy);
	const models = valueOf(config.models);
	const streamIdleTimeoutMs = valueOf(config.streamIdleTimeoutMs);
	const retryPolicy = valueOf(config.retryPolicy);
	return {
		...providers === void 0 ? {} : { providers },
		...apiKeyEnv === void 0 ? {} : { apiKeyEnv },
		...baseURL === void 0 ? {} : { baseURL },
		...proxy === void 0 ? {} : { proxy },
		...models === void 0 ? {} : { models },
		...streamIdleTimeoutMs === void 0 ? {} : { streamIdleTimeoutMs },
		...retryPolicy === void 0 ? {} : { retryPolicy }
	};
}
/**
* The value behind one configuration field: a schema-declared reference when
* the Host resolved the field, or the field itself when it did not. A snapshot
* is deeply readonly, which this package only reads, so the declared field type
* is the useful one to hand back.
*/
function valueOf(field) {
	const reference = field;
	return typeof reference?.get === "function" ? reference.get() : field;
}
/**
* Whether a resolved provider is usable, as a type guard.
* @param provider - one resolved provider.
* @returns true when it has an endpoint and no recorded problem.
*/
function isUsable(provider) {
	return provider.error === void 0 && provider.baseURL !== void 0;
}
const ReasoningProfileSchema = z.object({
	disabled: z.boolean(),
	efforts: z.array(z.union([...REASONING_LEVELS])),
	defaultEffort: z.union([...REASONING_LEVELS]),
	adaptive: z.boolean()
});
const ModelSchema = z.object({
	id: z.string().required(),
	name: z.string(),
	protocol: z.union(["claude-code", "codex-responses"]).required(),
	contextWindow: z.number().step(1).min(1),
	maxTokens: z.number().step(1).min(1),
	reasoning: ReasoningProfileSchema
});
const ProviderSchema = z.object({
	id: z.string().required(),
	displayName: z.string(),
	apiKeyEnv: z.string().role("credential-ref"),
	baseURL: z.string(),
	proxy: z.string(),
	models: z.array(ModelSchema),
	streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS),
	retryPolicy: RetryPolicySchema
});
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
const Config = z.object({
	providers: z.array(ProviderSchema).default(void 0).volatile(),
	apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV).volatile(),
	baseURL: z.string().default(DEFAULT_BASE_URL).volatile(),
	proxy: z.string().default("").volatile(),
	models: z.array(ModelSchema).default([]).volatile(),
	streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS).volatile(),
	retryPolicy: RetryPolicySchema.volatile()
});
function normalizeBaseURL(raw) {
	const value = (raw ?? "https://anyrouter.top").trim();
	let parsed;
	try {
		parsed = new URL(value);
	} catch (cause) {
		throw new Error(`dsh-anyrouter: invalid baseURL ${JSON.stringify(value)}`, { cause });
	}
	if (parsed.username.length > 0 || parsed.password.length > 0) throw new Error("dsh-anyrouter: baseURL must not contain user information");
	if (parsed.search.length > 0 || parsed.hash.length > 0) throw new Error("dsh-anyrouter: baseURL must not contain a query or fragment");
	const loopback = isLoopbackHost(parsed.hostname);
	if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) throw new Error("dsh-anyrouter: baseURL must use https (http is allowed only for loopback development)");
	parsed.pathname = parsed.pathname.replace(/\/+$/, "");
	return parsed.toString().replace(/\/+$/, "");
}
/**
* Validate one provider route id.
* @param raw - the configured id.
* @returns the trimmed id.
* @throws when the id is empty or outside {@link PROVIDER_ID_PATTERN}.
*/
function normalizeProviderId(raw) {
	const value = raw.trim();
	if (value.length === 0) throw new Error("dsh-anyrouter: provider ids must be non-empty");
	if (!PROVIDER_ID_PATTERN.test(value)) throw new Error(`dsh-anyrouter: provider id ${JSON.stringify(value)} must be lowercase alphanumerics with "." "_" or "-", starting with a letter or digit`);
	return value;
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
function defaultApiKeyEnvFor(providerId) {
	return providerId === "anyrouter" ? DEFAULT_API_KEY_ENV : `${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}
/** Resolve one provider's credential reference, defaulting it from the id. */
function resolveCredentialRef(raw, providerId) {
	const value = (raw ?? "").trim() || defaultApiKeyEnvFor(providerId);
	if (!isCredentialRefName(value)) throw new Error(`dsh-anyrouter: provider ${JSON.stringify(providerId)} apiKeyEnv ${JSON.stringify(value)} must be a shell-style identifier such as ANYROUTER_API_KEY`);
	return credentialRef(value);
}
/** Validate one idle timeout, whether section-wide or per provider. */
function resolveTimeout(raw) {
	const value = raw ?? 3e5;
	if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMER_DELAY_MS) throw new Error(`dsh-anyrouter: streamIdleTimeoutMs must be between 0 and ${MAX_TIMER_DELAY_MS}`);
	return value;
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
function resolveModels(models, warnings) {
	const seen = /* @__PURE__ */ new Set();
	const resolved = [];
	for (const model of models) {
		const id = (model.id ?? "").trim();
		if (id.length === 0) {
			warnings.push("ignoring a model row with no id");
			continue;
		}
		if (seen.has(id)) {
			warnings.push(`ignoring duplicate model id ${JSON.stringify(id)}`);
			continue;
		}
		seen.add(id);
		const capacity = (value, label) => {
			if (value === void 0) return void 0;
			if (Number.isSafeInteger(value) && value > 0) return value;
			warnings.push(`model ${JSON.stringify(id)} has an unusable ${label}; falling back to the reference capacity`);
		};
		const contextWindow = capacity(model.contextWindow, "contextWindow");
		const maxTokens = capacity(model.maxTokens, "maxTokens");
		let reasoning;
		if (model.reasoning !== void 0) try {
			reasoning = canonicalReasoningProfile(model.reasoning, model.protocol, id);
		} catch (error) {
			warnings.push(`model ${JSON.stringify(id)} has an unusable reasoning profile (${error instanceof Error ? error.message : String(error)}); using the reference profile`);
		}
		const { reasoning: _original, ...rest } = model;
		resolved.push({
			...rest,
			id,
			...contextWindow === void 0 ? {} : { contextWindow },
			...maxTokens === void 0 ? {} : { maxTokens },
			...reasoning === void 0 ? {} : { reasoning }
		});
	}
	return resolved;
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
function legacyProviderEntry(config) {
	return {
		id: DEFAULT_PROVIDER_ID,
		displayName: DEFAULT_DISPLAY_NAME,
		apiKeyEnv: config.apiKeyEnv ?? "ANYROUTER_API_KEY",
		baseURL: config.baseURL ?? "https://anyrouter.top",
		proxy: config.proxy ?? "",
		models: config.models ?? [],
		streamIdleTimeoutMs: config.streamIdleTimeoutMs ?? 3e5,
		...config.retryPolicy === void 0 ? {} : { retryPolicy: config.retryPolicy }
	};
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
function attempt(run, problems) {
	try {
		return run();
	} catch (error) {
		problems.push(error instanceof Error ? error.message : String(error));
		return;
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
function resolveProviderSafely(entry, id, defaults, warnings) {
	const problems = [];
	const configuredBaseURL = (entry.baseURL ?? "").trim();
	let baseURL;
	if (configuredBaseURL.length === 0 && id !== "anyrouter") problems.push(`provider ${JSON.stringify(id)} needs a baseURL`);
	else baseURL = attempt(() => normalizeBaseURL(configuredBaseURL.length === 0 ? void 0 : configuredBaseURL), problems);
	const proxy = attempt(() => normalizeProxyURL(entry.proxy), problems);
	const apiKeyEnv = attempt(() => resolveCredentialRef(entry.apiKeyEnv, id), problems) ?? credentialRef(defaultApiKeyEnvFor(id));
	const models = resolveModels(entry.models ?? [], warnings);
	const streamIdleTimeoutMs = attempt(() => entry.streamIdleTimeoutMs === void 0 ? defaults.streamIdleTimeoutMs : resolveTimeout(entry.streamIdleTimeoutMs), problems) ?? defaults.streamIdleTimeoutMs;
	const retryPolicy = attempt(() => entry.retryPolicy === void 0 ? defaults.retryPolicy : resolveRetryPolicy(entry.retryPolicy, `dsh-anyrouter: provider ${id} retryPolicy`), problems) ?? defaults.retryPolicy;
	return {
		id,
		displayName: (entry.displayName ?? "").trim() || (id === "anyrouter" ? "AnyRouter" : id),
		apiKeyEnv,
		baseURL,
		proxy,
		models: problems.length === 0 ? models : [],
		streamIdleTimeoutMs,
		retryPolicy,
		...problems.length === 0 ? {} : { error: problems.join("; ") }
	};
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
function resolveConfig(config) {
	const diagnostics = [];
	const streamIdleTimeoutMs = attempt(() => resolveTimeout(config.streamIdleTimeoutMs), diagnostics) ?? 3e5;
	const retryPolicy = attempt(() => resolveRetryPolicy(config.retryPolicy, "dsh-anyrouter: retryPolicy"), diagnostics) ?? resolveRetryPolicy(void 0, "dsh-anyrouter: retryPolicy");
	const raw = config.providers === void 0 ? [legacyProviderEntry(config)] : config.providers;
	const seen = /* @__PURE__ */ new Set();
	const providers = [];
	for (const entry of raw) {
		const candidate = (entry?.id ?? "").trim();
		if (candidate.length === 0) {
			diagnostics.push("ignoring a provider entry with no id");
			continue;
		}
		if (!PROVIDER_ID_PATTERN.test(candidate)) {
			diagnostics.push(`ignoring provider ${JSON.stringify(candidate)}: an id must be lowercase alphanumerics with "." "_" or "-", starting with a letter or digit`);
			continue;
		}
		if (seen.has(candidate)) {
			diagnostics.push(`ignoring duplicate provider id ${JSON.stringify(candidate)}`);
			continue;
		}
		seen.add(candidate);
		providers.push(resolveProviderSafely(entry, candidate, {
			streamIdleTimeoutMs,
			retryPolicy
		}, diagnostics));
	}
	return {
		providers,
		diagnostics
	};
}
function classifyProtocol(id) {
	const normalized = id.toLowerCase();
	if (normalized.startsWith("claude-")) return "claude-code";
	if (normalized.startsWith("gpt-")) return "codex-responses";
}
const LEVEL_SET = new Set(REASONING_LEVELS);
/**
* Validate and canonicalize one persisted reasoning profile: efforts are
* deduplicated into canonical order, `defaultEffort` must be selectable, and
* `adaptive` is a Claude-only statement (it switches the transport from a
* thinking budget to the adaptive `effort` field).
*/
function canonicalReasoningProfile(reasoning, protocol, id) {
	const label = `dsh-anyrouter: model ${JSON.stringify(id)} reasoning`;
	const selected = new Set((reasoning.efforts ?? []).filter((level) => LEVEL_SET.has(level)));
	const efforts = REASONING_LEVELS.filter((level) => selected.has(level));
	if (reasoning.defaultEffort !== void 0 && !efforts.includes(reasoning.defaultEffort)) throw new Error(`${label}.defaultEffort ${JSON.stringify(reasoning.defaultEffort)} must be one of its efforts`);
	if (reasoning.adaptive === true && protocol !== "claude-code") throw new Error(`${label}.adaptive is only valid for claude-code models`);
	if (reasoning.disabled === true) return { disabled: true };
	return {
		...efforts.length === 0 ? {} : { efforts },
		...reasoning.defaultEffort === void 0 ? {} : { defaultEffort: reasoning.defaultEffort },
		...reasoning.adaptive === void 0 ? {} : { adaptive: reasoning.adaptive }
	};
}
const MODEL_PROFILES_BY_ID = new Map([
	{
		id: "claude-fable-5",
		protocol: "claude-code",
		name: "Claude Fable 5",
		efforts: [
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"supportsMidConvoSystemMessages": true,
			"supportsMidConvoToolChanges": true,
			"forceAdaptiveThinking": true,
			"supportsStrictTools": true,
			"allowedFallbackModels": [{
				"provider": "anthropic",
				"model": "claude-opus-4-8",
				"cost": {
					"input": 5,
					"output": 25,
					"cacheRead": .5,
					"cacheWrite": 6.25
				}
			}, {
				"provider": "anthropic",
				"model": "claude-opus-5",
				"cost": {
					"input": 5,
					"output": 25,
					"cacheRead": .5,
					"cacheWrite": 6.25
				}
			}]
		}
	},
	{
		id: "claude-fable-5-1",
		protocol: "claude-code",
		name: "Claude Fable 5.1",
		efforts: [
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"supportsMidConvoEffort": true,
			"supportsMidConvoSystemMessages": true,
			"supportsMidConvoToolChanges": true,
			"forceAdaptiveThinking": true,
			"supportsStrictTools": true
		}
	},
	{
		id: "claude-fable-5.1",
		protocol: "claude-code",
		name: "Claude Fable 5.1",
		efforts: [
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"sendSessionAffinityHeaders": true,
			"forceAdaptiveThinking": true
		}
	},
	{
		id: "claude-haiku-4-5",
		protocol: "claude-code",
		name: "Claude Haiku 4.5 (latest)",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 2e5,
		maxTokens: 64e3,
		compat: { "supportsStrictTools": true }
	},
	{
		id: "claude-haiku-4-5-20251001",
		protocol: "claude-code",
		name: "Claude Haiku 4.5",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 2e5,
		maxTokens: 64e3,
		compat: { "supportsStrictTools": true }
	},
	{
		id: "claude-haiku-4.5",
		protocol: "claude-code",
		name: "Claude Haiku 4.5 (latest)",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 2e5,
		maxTokens: 64e3,
		compat: { "sendSessionAffinityHeaders": true }
	},
	{
		id: "claude-opus-4-5",
		protocol: "claude-code",
		name: "Claude Opus 4.5 (latest)",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 2e5,
		maxTokens: 64e3,
		compat: { "supportsStrictTools": true }
	},
	{
		id: "claude-opus-4-5-20251101",
		protocol: "claude-code",
		name: "Claude Opus 4.5",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 2e5,
		maxTokens: 64e3,
		compat: { "supportsStrictTools": true }
	},
	{
		id: "claude-opus-4-6",
		protocol: "claude-code",
		name: "Claude Opus 4.6",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"forceAdaptiveThinking": true,
			"supportsStrictTools": true
		}
	},
	{
		id: "claude-opus-4-7",
		protocol: "claude-code",
		name: "Claude Opus 4.7",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"forceAdaptiveThinking": true,
			"supportsTemperature": false,
			"supportsStrictTools": true
		}
	},
	{
		id: "claude-opus-4-8",
		protocol: "claude-code",
		name: "Claude Opus 4.8",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"supportsMidConvoSystemMessages": true,
			"supportsMidConvoToolChanges": true,
			"forceAdaptiveThinking": true,
			"supportsTemperature": false,
			"supportsStrictTools": true
		}
	},
	{
		id: "claude-opus-4.5",
		protocol: "claude-code",
		name: "Claude Opus 4.5 (latest)",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 2e5,
		maxTokens: 64e3,
		compat: { "sendSessionAffinityHeaders": true }
	},
	{
		id: "claude-opus-4.6",
		protocol: "claude-code",
		name: "Claude Opus 4.6",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"sendSessionAffinityHeaders": true,
			"forceAdaptiveThinking": true
		}
	},
	{
		id: "claude-opus-4.7",
		protocol: "claude-code",
		name: "Claude Opus 4.7",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"sendSessionAffinityHeaders": true,
			"forceAdaptiveThinking": true,
			"supportsTemperature": false
		}
	},
	{
		id: "claude-opus-4.8",
		protocol: "claude-code",
		name: "Claude Opus 4.8",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"sendSessionAffinityHeaders": true,
			"forceAdaptiveThinking": true,
			"supportsTemperature": false
		}
	},
	{
		id: "claude-opus-5",
		protocol: "claude-code",
		name: "Claude Opus 5",
		efforts: [
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"supportsMidConvoEffort": true,
			"supportsMidConvoSystemMessages": true,
			"supportsMidConvoToolChanges": true,
			"forceAdaptiveThinking": true,
			"supportsTemperature": false,
			"supportsStrictTools": true
		}
	},
	{
		id: "claude-opus-5-5",
		protocol: "claude-code",
		name: "Claude Opus 5.5",
		efforts: [
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"supportsMidConvoEffort": true,
			"supportsMidConvoSystemMessages": true,
			"supportsMidConvoToolChanges": true,
			"forceAdaptiveThinking": true,
			"supportsTemperature": false,
			"supportsStrictTools": true
		}
	},
	{
		id: "claude-opus-5.5",
		protocol: "claude-code",
		name: "Claude Opus 5.5",
		efforts: [
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"supportsMidConvoSystemMessages": true,
			"forceAdaptiveThinking": true,
			"supportsTemperature": false
		}
	},
	{
		id: "claude-sonnet-4",
		protocol: "claude-code",
		name: "Claude Sonnet 4",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 2e5,
		maxTokens: 64e3
	},
	{
		id: "claude-sonnet-4-5",
		protocol: "claude-code",
		name: "Claude Sonnet 4.5 (latest)",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 1e6,
		maxTokens: 64e3,
		compat: { "supportsStrictTools": true }
	},
	{
		id: "claude-sonnet-4-5-20250929",
		protocol: "claude-code",
		name: "Claude Sonnet 4.5",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 1e6,
		maxTokens: 64e3,
		compat: { "supportsStrictTools": true }
	},
	{
		id: "claude-sonnet-4-6",
		protocol: "claude-code",
		name: "Claude Sonnet 4.6",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"forceAdaptiveThinking": true,
			"supportsStrictTools": true
		}
	},
	{
		id: "claude-sonnet-4.5",
		protocol: "claude-code",
		name: "Claude Sonnet 4.5 (latest)",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 1e6,
		maxTokens: 64e3,
		compat: { "sendSessionAffinityHeaders": true }
	},
	{
		id: "claude-sonnet-4.6",
		protocol: "claude-code",
		name: "Claude Sonnet 4.6",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"sendSessionAffinityHeaders": true,
			"forceAdaptiveThinking": true
		}
	},
	{
		id: "claude-sonnet-5",
		protocol: "claude-code",
		name: "Claude Sonnet 5",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: true,
		contextWindow: 1e6,
		maxTokens: 128e3,
		compat: {
			"forceAdaptiveThinking": true,
			"supportsStrictTools": true
		}
	},
	{
		id: "gpt-4",
		protocol: "codex-responses",
		name: "GPT-4",
		efforts: [],
		adaptive: false,
		contextWindow: 8192,
		maxTokens: 8192,
		compat: { "supportsStrictMode": true }
	},
	{
		id: "gpt-4-turbo",
		protocol: "codex-responses",
		name: "GPT-4 Turbo",
		efforts: [],
		adaptive: false,
		contextWindow: 128e3,
		maxTokens: 4096,
		compat: { "supportsStrictMode": true }
	},
	{
		id: "gpt-4.1",
		protocol: "codex-responses",
		name: "GPT-4.1",
		efforts: [],
		adaptive: false,
		contextWindow: 1047576,
		maxTokens: 32768,
		compat: { "supportsStrictMode": true }
	},
	{
		id: "gpt-4.1-mini",
		protocol: "codex-responses",
		name: "GPT-4.1 mini",
		efforts: [],
		adaptive: false,
		contextWindow: 1047576,
		maxTokens: 32768,
		compat: { "supportsStrictMode": true }
	},
	{
		id: "gpt-4.1-nano",
		protocol: "codex-responses",
		name: "GPT-4.1 nano",
		efforts: [],
		adaptive: false,
		contextWindow: 1047576,
		maxTokens: 32768,
		compat: { "supportsStrictMode": true }
	},
	{
		id: "gpt-4o",
		protocol: "codex-responses",
		name: "GPT-4o",
		efforts: [],
		adaptive: false,
		contextWindow: 128e3,
		maxTokens: 16384,
		compat: { "supportsStrictMode": true }
	},
	{
		id: "gpt-4o-2024-05-13",
		protocol: "codex-responses",
		name: "GPT-4o (2024-05-13)",
		efforts: [],
		adaptive: false,
		contextWindow: 128e3,
		maxTokens: 4096,
		compat: { "supportsStrictMode": true }
	},
	{
		id: "gpt-4o-2024-08-06",
		protocol: "codex-responses",
		name: "GPT-4o (2024-08-06)",
		efforts: [],
		adaptive: false,
		contextWindow: 128e3,
		maxTokens: 16384,
		compat: { "supportsStrictMode": true }
	},
	{
		id: "gpt-4o-2024-11-20",
		protocol: "codex-responses",
		name: "GPT-4o (2024-11-20)",
		efforts: [],
		adaptive: false,
		contextWindow: 128e3,
		maxTokens: 16384,
		compat: { "supportsStrictMode": true }
	},
	{
		id: "gpt-4o-mini",
		protocol: "codex-responses",
		name: "GPT-4o mini",
		efforts: [],
		adaptive: false,
		contextWindow: 128e3,
		maxTokens: 16384,
		compat: { "supportsStrictMode": true }
	},
	{
		id: "gpt-5",
		protocol: "codex-responses",
		name: "GPT-5",
		efforts: [
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5-chat-latest",
		protocol: "codex-responses",
		name: "GPT-5 Chat Latest",
		efforts: [],
		adaptive: false,
		contextWindow: 128e3,
		maxTokens: 16384,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5-codex",
		protocol: "codex-responses",
		name: "GPT-5 Codex",
		efforts: [
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"sessionAffinityFormat": "openai-nosession",
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5-mini",
		protocol: "codex-responses",
		name: "GPT-5 Mini",
		efforts: [
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5-nano",
		protocol: "codex-responses",
		name: "GPT-5 Nano",
		efforts: [
			"minimal",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5-pro",
		protocol: "codex-responses",
		name: "GPT-5 Pro",
		efforts: ["high"],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.1",
		protocol: "codex-responses",
		name: "GPT-5.1",
		efforts: [
			"off",
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.1-codex",
		protocol: "codex-responses",
		name: "GPT-5.1 Codex",
		efforts: [
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"sessionAffinityFormat": "openai-nosession",
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.1-codex-max",
		protocol: "codex-responses",
		name: "GPT-5.1 Codex Max",
		efforts: [
			"low",
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"sessionAffinityFormat": "openai-nosession",
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.1-codex-mini",
		protocol: "codex-responses",
		name: "GPT-5.1 Codex Mini",
		efforts: [
			"low",
			"medium",
			"high"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"sessionAffinityFormat": "openai-nosession",
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.2",
		protocol: "codex-responses",
		name: "GPT-5.2",
		efforts: [
			"off",
			"low",
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.2-chat-latest",
		protocol: "codex-responses",
		name: "GPT-5.2 Chat",
		efforts: ["medium", "xhigh"],
		adaptive: false,
		contextWindow: 128e3,
		maxTokens: 16384,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.2-codex",
		protocol: "codex-responses",
		name: "GPT-5.2 Codex",
		efforts: [
			"low",
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"sessionAffinityFormat": "openai-nosession",
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.2-pro",
		protocol: "codex-responses",
		name: "GPT-5.2 Pro",
		efforts: [
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.3-chat-latest",
		protocol: "codex-responses",
		name: "GPT-5.3 Chat (latest)",
		efforts: [],
		adaptive: false,
		contextWindow: 128e3,
		maxTokens: 16384,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.3-codex",
		protocol: "codex-responses",
		name: "GPT-5.3 Codex",
		efforts: [
			"off",
			"low",
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.3-codex-spark",
		protocol: "codex-responses",
		name: "GPT-5.3 Codex Spark",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 128e3,
		maxTokens: 128e3,
		compat: { "supportsOpenAIGrammarTools": true }
	},
	{
		id: "gpt-5.4",
		protocol: "codex-responses",
		name: "GPT-5.4",
		efforts: [
			"off",
			"low",
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 272e3,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true,
			"supportsMidConvoSystemMessages": true
		}
	},
	{
		id: "gpt-5.4-mini",
		protocol: "codex-responses",
		name: "GPT-5.4 mini",
		efforts: [
			"off",
			"low",
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true,
			"supportsMidConvoSystemMessages": true
		}
	},
	{
		id: "gpt-5.4-nano",
		protocol: "codex-responses",
		name: "GPT-5.4 nano",
		efforts: [
			"off",
			"low",
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 4e5,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.4-pro",
		protocol: "codex-responses",
		name: "GPT-5.4 Pro",
		efforts: [
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 105e4,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true,
			"supportsMidConvoSystemMessages": true
		}
	},
	{
		id: "gpt-5.5",
		protocol: "codex-responses",
		name: "GPT-5.5",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 272e3,
		maxTokens: 128e3,
		compat: {
			"supportsOpenAIGrammarTools": true,
			"supportsToolSearch": true,
			"supportsMidConvoSystemMessages": true
		}
	},
	{
		id: "gpt-5.5-pro",
		protocol: "codex-responses",
		name: "GPT-5.5 Pro",
		efforts: [
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 105e4,
		maxTokens: 128e3,
		compat: {
			"supportsStrictMode": true,
			"supportsOpenAIGrammarTools": true
		}
	},
	{
		id: "gpt-5.6-luna",
		protocol: "codex-responses",
		name: "GPT-5.6 Luna",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: false,
		contextWindow: 272e3,
		maxTokens: 128e3,
		compat: {
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true,
			"supportsMidConvoSystemMessages": true
		}
	},
	{
		id: "gpt-5.6-sol",
		protocol: "codex-responses",
		name: "GPT-5.6 Sol",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: false,
		contextWindow: 272e3,
		maxTokens: 128e3,
		compat: {
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true,
			"supportsMidConvoSystemMessages": true
		}
	},
	{
		id: "gpt-5.6-terra",
		protocol: "codex-responses",
		name: "GPT-5.6 Terra",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: false,
		contextWindow: 272e3,
		maxTokens: 128e3,
		compat: {
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true,
			"supportsMidConvoSystemMessages": true
		}
	},
	{
		id: "gpt-6-astra",
		protocol: "codex-responses",
		name: "GPT-6 Astra",
		efforts: [
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: false,
		contextWindow: 272e3,
		maxTokens: 128e3,
		compat: {
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true,
			"supportsMidConvoSystemMessages": true
		}
	},
	{
		id: "gpt-6-luna",
		protocol: "codex-responses",
		name: "GPT-6 Luna",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: false,
		contextWindow: 272e3,
		maxTokens: 128e3,
		compat: {
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true,
			"supportsMidConvoSystemMessages": true
		}
	},
	{
		id: "gpt-6-sol",
		protocol: "codex-responses",
		name: "GPT-6 Sol",
		efforts: [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		adaptive: false,
		contextWindow: 272e3,
		maxTokens: 128e3,
		compat: {
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true,
			"supportsMidConvoSystemMessages": true
		}
	},
	{
		id: "gpt-realtime-2.1",
		protocol: "codex-responses",
		name: "GPT-Realtime-2.1",
		efforts: [
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh"
		],
		adaptive: false,
		contextWindow: 128e3,
		maxTokens: 32e3,
		compat: { "supportsStrictMode": true }
	}
].map((profile) => [profile.id, profile]));
//#endregion
//#region src/catalog.ts
const FALLBACK_CONTEXT = {
	"claude-code": 1e6,
	"codex-responses": 4e5
};
const FALLBACK_MAX_TOKENS = {
	"claude-code": 128e3,
	"codex-responses": 128e3
};
/** Wire value each protocol family sends for a selectable level. */
const LEVEL_WIRE = {
	"claude-code": {
		off: "off",
		minimal: "low"
	},
	"codex-responses": {
		off: "none",
		minimal: "low"
	}
};
/**
* The reasoning profile one synchronized model runs with. A persisted profile
* (written by the settings section's picker) wins; anything it leaves empty
* falls back to the build-time reference profile from pi-ai's catalog, and a
* model neither knows falls back to the protocol default — the Claude
* fingerprint's adaptive efforts, or the Codex Responses set.
*/
function effectiveReasoning(config) {
	if (config.reasoning?.disabled === true) return {
		enabled: false,
		efforts: [],
		adaptive: false
	};
	const reference = MODEL_PROFILES_BY_ID.get(config.id);
	const referenceEfforts = (reference?.efforts ?? []).filter((level) => REASONING_LEVELS.includes(level));
	const persisted = config.reasoning;
	const efforts = persisted?.efforts !== void 0 && persisted.efforts.length > 0 ? persisted.efforts : referenceEfforts.length > 0 ? referenceEfforts : [...REASONING_LEVELS];
	const adaptive = persisted?.adaptive ?? reference?.adaptive ?? config.protocol === "claude-code";
	return {
		enabled: efforts.length > 0,
		efforts,
		...persisted?.defaultEffort === void 0 ? {} : { defaultEffort: persisted.defaultEffort },
		adaptive: adaptive && config.protocol === "claude-code"
	};
}
/**
* pi-ai's `getSupportedThinkingLevels` rules, inverted: every canonical level
* maps to its wire value when selectable and to `null` (explicitly absent)
* when not, so the level list offered by the model selector is exactly the
* persisted effort set.
*/
function thinkingLevelMapOf(protocol, efforts) {
	const selected = new Set(efforts);
	const map = {};
	for (const level of REASONING_LEVELS) map[level] = selected.has(level) ? LEVEL_WIRE[protocol][level] ?? level : null;
	return map;
}
function referenceProfile(id) {
	return MODEL_PROFILES_BY_ID.get(id);
}
/**
* Project one synchronized model into the pi-ai descriptor the transports and
* the seam both read.
*
* `providerId` is the route this model belongs to, and it is why this function
* takes one: a bundle may now serve several relays, and a model's `provider`
* field is what routes the request — and what the seam matches against its
* profiles map. It defaults to the migrated legacy route so a hand-built call
* keeps answering as it always did.
* @param config - the persisted model row.
* @param baseURL - the owning provider's endpoint.
* @param providerId - the owning provider's route id.
* @returns the resolved pi-ai model.
*/
function resolveModel(config, baseURL, providerId = PROVIDER) {
	const reference = referenceProfile(config.id);
	const api = config.protocol === "claude-code" ? "anthropic-messages" : "openai-responses";
	const reasoning = effectiveReasoning(config);
	const compatSource = reference?.compat;
	const compat = config.protocol === "claude-code" && config.reasoning?.adaptive !== void 0 ? {
		...compatSource,
		forceAdaptiveThinking: reasoning.adaptive
	} : compatSource;
	const model = {
		id: config.id,
		name: config.name ?? reference?.name ?? config.id,
		api,
		provider: providerId,
		baseUrl: config.protocol === "codex-responses" ? `${baseURL}/v1` : baseURL,
		reasoning: reasoning.enabled,
		input: ["text", "image"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0
		},
		contextWindow: config.contextWindow ?? reference?.contextWindow ?? FALLBACK_CONTEXT[config.protocol],
		maxTokens: config.maxTokens ?? reference?.maxTokens ?? FALLBACK_MAX_TOKENS[config.protocol]
	};
	if (reasoning.enabled) model.thinkingLevelMap = thinkingLevelMapOf(config.protocol, reasoning.efforts);
	if (compat !== void 0) model.compat = { ...compat };
	return model;
}
/**
* Advisory metadata for one discovered row: capacities and display name from
* the build-time reference profile, with protocol fallbacks for relay-only
* ids pi-ai has never heard of.
*/
function metadataForDiscoveredModel(id, protocol) {
	const reference = referenceProfile(id);
	if (reference === void 0) return {
		contextWindow: FALLBACK_CONTEXT[protocol],
		maxTokens: FALLBACK_MAX_TOKENS[protocol]
	};
	return {
		name: reference.name,
		contextWindow: reference.contextWindow,
		maxTokens: reference.maxTokens
	};
}
//#endregion
//#region src/proxy-transport.ts
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
* How many tunnel agents stay warm. A settings edit replaces the proxy URL, and
* the previous agent must survive long enough for the request that was already
* in flight through it; four slots cover an edit plus its neighbours without
* letting a repeatedly edited field grow the process's socket pools.
*/
const MAX_CACHED_AGENTS = 4;
/** Insertion-ordered, so the first key is the least recently used. */
const agents = /* @__PURE__ */ new Map();
/**
* The tunnel agent for one proxy URL, created on first use and reused after.
* @param proxy - a canonical proxy URL from {@link normalizeProxyURL}.
* @returns the agent to route a request through.
*/
function agentFor(proxy) {
	const cached = agents.get(proxy);
	if (cached !== void 0) {
		agents.delete(proxy);
		agents.set(proxy, cached);
		return cached;
	}
	const agent = new ProxyAgent(proxy);
	agents.set(proxy, agent);
	if (agents.size > MAX_CACHED_AGENTS) {
		const oldest = agents.keys().next().value;
		if (oldest !== void 0) {
			const evicted = agents.get(oldest);
			agents.delete(oldest);
			evicted?.close().catch(() => void 0);
		}
	}
	return agent;
}
/**
* The URL a request targets, whichever form the caller used.
* @param input - the `fetch` input.
* @returns the parsed URL, or `undefined` when the input carries none.
*/
function targetOf(input) {
	const raw = input instanceof Request ? input.url : input.toString();
	try {
		return new URL(raw);
	} catch {
		return;
	}
}
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
function proxyFetch(proxy) {
	if (proxy === void 0) return globalThis.fetch;
	const send = fetch$1;
	return ((input, init) => {
		const target = targetOf(input);
		if (target !== void 0 && isLoopbackHost(target.hostname)) return send(input, init);
		return send(input, {
			...init,
			dispatcher: agentFor(proxy)
		});
	});
}
/**
* Close and forget every cached tunnel agent.
*
* Only tests call this: a live route keeps its agent warm on purpose, and
* closing one mid-request would fail the request that was already using it.
* @returns a promise settling once every agent has closed.
*/
async function disposeProxyAgents() {
	const closing = [...agents.values()].map((agent) => agent.close().catch(() => void 0));
	agents.clear();
	await Promise.all(closing);
}
//#endregion
//#region src/transports/headers.ts
/**
* The complete request-header sets this bundle sends, one per client identity.
*
* These are the ONLY place a request's identity headers are assembled, which is
* deliberate: "which headers do we claim" is a fidelity question, and answering
* it by reading five files is how a stale header survives a CLI upgrade. Every
* entry below is evidence-backed against the shipped client it reproduces, and
* the evidence is recorded next to it.
*
* ## How the sets were established
*
* Both entries were read out of the official clients themselves rather than
* inferred:
*
* - **Claude Code `2.1.286`** — the `@anthropic-ai/claude-code-win32-x64` npm
*   package ships a single self-contained native binary. Searching its
*   printable strings yields the header vocabulary it can emit. Present:
*   `anthropic-beta`, `anthropic-version`, `anthropic-dangerous-direct-browser-access`,
*   `x-app`, `x-client-request-id`, `X-Claude-Code-Session-Id`, `claude-cli/`,
*   and the whole `X-Stainless-*` family (`Lang`, `Package-Version`, `OS`,
*   `Arch`, `Runtime`, `Runtime-Version`, `Retry-Count`, `Timeout`) plus
*   `x-stainless-helper-method`. `sdk-cli` is present as a client token, which
*   is what the `(external, sdk-cli)` suffix claims.
* - **Codex CLI `0.159.3`** — the `@openai/codex` win32-x64 package ships
*   `codex.exe`, and the workspace source is public. Present: `originator`
*   (default `codex_cli_rs`), `session-id` and `thread-id`
*   (`codex-api/src/requests/headers.rs::build_session_headers`),
*   `x-client-request-id`, `x-codex-beta-features` and `x-codex-turn-state`
*   (`core/src/client.rs::build_responses_headers`), `x-codex-installation-id`,
*   and a `user-agent` of the shape `codex_cli_rs/<version> (<os>; <arch>)`.
*
* ## What is deliberately NOT claimed
*
* - **`OpenAI-Beta: responses=experimental` is gone.** It was the beta gate the
*   Responses API required while that API was experimental, and it is what this
*   transport used to send. It no longer appears anywhere in `codex.exe`; the
*   only `OpenAI-Beta` value the current client carries is
*   `responses_websockets=2026-02-06`, set on its WebSocket handshake, which
*   this SSE transport does not perform. Sending it would be asserting a client
*   generation that no longer exists — the exact drift this module exists to
*   prevent.
* - **The per-turn, per-thread and per-deployment Codex headers** are not sent:
*   `x-codex-turn-state` (a sticky routing token the server hands out and the
*   client echoes), `x-codex-guardian` (reviewer-only), `chatgpt-account-id`
*   (ChatGPT subscription auth, not an API key), and
*   `x-openai-internal-codex-responses-lite` (an internal routing switch driven
*   by a server-side model config this relay does not serve). They are
*   conditional state, not client identity; a first request on a fresh
*   connection carries none of them.
* - **The `X-Stainless-*` family is not restated for Claude.** Those headers
*   describe the Stainless-generated client library (its language, package
*   version, runtime and retry bookkeeping), and the Anthropic SDK sets all of
*   them truthfully for the SDK this bundle actually links. Hard-coding them
*   here would either duplicate that truth or, worse, pin a package version
*   that moves with every dependency bump.
* @module dsh-anyrouter/transports/headers
*/
/**
* The `anthropic-version` every current Anthropic client sends. Found verbatim
* in the Claude Code binary next to the `2023-06-01` value.
*/
const ANTHROPIC_API_VERSION = "2023-06-01";
/** The `originator` value the Codex CLI identifies itself with by default. */
const CODEX_ORIGINATOR = "codex_cli_rs";
/** Node's platform `arch()` mapped to the spelling the Codex CLI's UA uses. */
const ARCH_LABELS = {
	x64: "x86_64",
	arm64: "aarch64",
	ia32: "x86",
	arm: "arm"
};
/** Node's `platform()` mapped to a human OS name for the Codex UA. */
const PLATFORM_LABELS = {
	win32: "Windows",
	darwin: "macOS",
	linux: "Linux",
	freebsd: "FreeBSD"
};
/**
* The `(<os> <release>; <arch>)` parenthetical the Codex CLI puts in its
* `user-agent`.
*
* The real client renders it from an OS-info crate, so the exact release
* spelling differs per platform; what matters for the fingerprint is that the
* shape and the architecture token match, which this reproduces from Node's own
* view of the machine rather than from a guess.
* @returns the parenthetical, without the surrounding space.
*/
function hostDescriptor() {
	const platformName = PLATFORM_LABELS[platform()] ?? platform();
	const archName = ARCH_LABELS[arch()] ?? arch();
	return `${platformName} ${release()}; ${archName}`;
}
/**
* A stable-within-the-process installation id.
*
* The real Codex CLI persists this across runs; this bundle has no state
* directory to persist into, so it generates one per process. The header is
* opaque server-side bookkeeping, so a fresh id per run is faithful in kind
* even though it is not durable.
*/
const INSTALLATION_ID = randomBytes(16).toString("hex");
/** Narrow a `ProviderHeaders` value set down to the plain string entries. */
function stringEntries(headers) {
	const entries = {};
	for (const [name, value] of Object.entries(headers ?? {})) if (typeof value === "string") entries[name] = value;
	return entries;
}
/**
* The caller's `user-agent`, kept as a trailing attribution token.
*
* The DSH harness names itself in the `user-agent` it passes down, and dropping
* that would erase which harness made the call. Both official clients append
* extra tokens to their UA (`codex_cli_rs/<ver> (...)` has the terminal, Claude
* Code has the client kind), so appending rather than replacing is also the
* shape-faithful choice.
* @param overrides - the caller-supplied headers.
* @returns the attribution suffix, including its leading space, or ''.
*/
function attribution(overrides) {
	const value = overrides?.["user-agent"];
	return typeof value === "string" ? ` ${value}` : "";
}
/**
* The complete Claude Code request-header set.
*
* Ordering rule: caller extras come first so any unrelated header the harness
* set survives, and every identity key below overwrites it. The identity is the
* bundle's to state, not a caller's to redefine.
* @param input - version, betas, session and caller headers.
* @returns the header map to hand the Anthropic client.
*/
function claudeCodeHeaders(input) {
	const headers = {
		...stringEntries(input.overrides),
		accept: "application/json",
		"content-type": "application/json",
		"anthropic-version": ANTHROPIC_API_VERSION,
		"anthropic-beta": input.betas.join(","),
		"anthropic-dangerous-direct-browser-access": "true",
		"user-agent": `claude-cli/${input.version} (external, sdk-cli)${attribution(input.overrides)}`,
		"x-app": "cli"
	};
	if (input.sessionId !== void 0 && input.sessionId.length > 0) {
		headers["x-claude-code-session-id"] = input.sessionId;
		headers["x-client-request-id"] = input.sessionId;
	}
	return headers;
}
/**
* The complete Codex Responses request-header set.
* @param input - version, session and caller headers.
* @returns the header map to hand the OpenAI client.
*/
function codexHeaders(input) {
	const headers = {
		...stringEntries(input.overrides),
		accept: "text/event-stream",
		"content-type": "application/json",
		originator: CODEX_ORIGINATOR,
		"user-agent": `codex_cli_rs/${input.version} (${hostDescriptor()})${attribution(input.overrides)}`,
		"x-codex-installation-id": INSTALLATION_ID
	};
	if (input.sessionId !== void 0 && input.sessionId.length > 0) {
		headers["session-id"] = input.sessionId;
		headers["thread-id"] = input.sessionId;
		headers["x-client-request-id"] = input.sessionId;
	}
	return headers;
}
//#endregion
//#region src/transports/claude.ts
/**
* The Claude Code release this transport reproduces.
*
* The plugin owns this value; it is deliberately NOT a configuration field.
* A user-chosen version string is a claim the user cannot back with a matching
* request shape, so exposing it invited exactly the drift it appeared to solve.
* Bumping it is a source change reviewed alongside `CLAUDE_CODE_BETAS` and the
* header table in `./headers.ts`, and `scripts/check-cli-versions.mjs` reports
* when a newer release exists.
*/
const CLAUDE_CODE_VERSION = "2.1.286";
/** The route id used when a caller builds a transport without naming one. */
const DEFAULT_TRANSPORT_PROVIDER$1 = "anyrouter";
const CLAUDE_CODE_BETAS = [
	"claude-code-20250219",
	"context-1m-2025-08-07",
	"interleaved-thinking-2025-05-14",
	"thinking-token-count-2026-05-13",
	"context-management-2025-06-27",
	"prompt-caching-scope-2026-01-05",
	"mid-conversation-system-2026-04-07",
	"effort-2025-11-24",
	"fallback-credit-2026-06-01"
];
const COMPAT_BETAS = [
	{
		when: (compat) => compat.supportsMidConvoEffort === true,
		betas: ["mid-conversation-output-config-2026-07-01", "thinking-binding-controls-2026-08-01"]
	},
	{
		when: (compat) => (compat.allowedFallbackModels?.length ?? 0) > 0,
		betas: ["server-side-fallback-2026-07-01"]
	},
	{
		when: (compat, context) => compat.supportsMidConvoSystemMessages === true && compat.supportsMidConvoToolChanges === true && (getInitialSystemMessage(context.messages)?.toolsAdded?.length ?? 0) > 0 && !hasToolRedefinitions(context.messages),
		betas: ["mid-conversation-tool-changes-2026-07-01"]
	}
];
/**
* The complete `anthropic-beta` feature list for one model: the curated Claude
* Code set, every flag that model's compatibility declaration requires, and any
* feature the caller explicitly asked for (a route's configured `headers`).
* @param model - the resolved pi-ai model about to be called.
* @param context - the transcript pi-ai will receive, for conditions that need
* it rather than `compat` alone.
* @param extra - caller-supplied feature names, appended verbatim.
* @returns the ordered, de-duplicated feature list.
*/
function betaFeaturesOf(model, context, extra = []) {
	const compat = model.compat;
	return [.../* @__PURE__ */ new Set([
		...CLAUDE_CODE_BETAS,
		...compat === void 0 ? [] : COMPAT_BETAS.flatMap((entry) => entry.when(compat, context) ? entry.betas : []),
		...extra
	])];
}
/**
* Split one caller-supplied `anthropic-beta` header value into feature names.
* @param headers - the route's configured request headers, if any.
* @returns the declared features, in order, without blanks.
*/
function requestedBetas(headers) {
	return Object.entries(headers ?? {}).filter(([name]) => name.toLowerCase() === "anthropic-beta").flatMap(([, value]) => typeof value === "string" ? value.split(",") : []).map((feature) => feature.trim()).filter((feature) => feature.length > 0);
}
const BILLING_IDENTITY = `x-anthropic-billing-header: cc_version=${CLAUDE_CODE_VERSION}.f32; cc_entrypoint=sdk-cli;`;
const AGENT_IDENTITY = "You are a Claude agent, built on Anthropic's Claude Agent SDK.";
const CLAUDE_TOOL_NAMES = {
	read: "Read",
	write: "Write",
	edit: "Edit",
	bash: "Bash",
	grep: "Grep",
	glob: "Glob",
	ask_user_question: "AskUserQuestion",
	enter_plan_mode: "EnterPlanMode",
	exit_plan_mode: "ExitPlanMode",
	kill_shell: "KillShell",
	notebook_edit: "NotebookEdit",
	task: "Task",
	task_output: "TaskOutput",
	skill: "Skill",
	todo_write: "TodoWrite",
	web_fetch: "WebFetch",
	web_search: "WebSearch"
};
function wireToolName(name) {
	return CLAUDE_TOOL_NAMES[name.toLowerCase()] ?? name;
}
function mappedContext(context) {
	const fromWire = /* @__PURE__ */ new Map();
	for (const tool of getCurrentTools(context.messages)) fromWire.set(wireToolName(tool.name).toLowerCase(), tool.name);
	const remap = (name) => {
		const wire = wireToolName(name);
		if (!fromWire.has(wire.toLowerCase())) fromWire.set(wire.toLowerCase(), name);
		return wire;
	};
	const remapTool = (tool) => ({
		...tool,
		name: remap(tool.name)
	});
	const remapSystem = (message) => {
		const toolsAdded = message.toolsAdded?.map(remapTool);
		const toolsRemoved = message.toolsRemoved?.map((reference) => ({
			...reference,
			name: remap(reference.name)
		}));
		if (toolsAdded === void 0 && toolsRemoved === void 0) return message;
		const remapped = { ...message };
		if (toolsAdded !== void 0) remapped.toolsAdded = toolsAdded;
		if (toolsRemoved !== void 0) remapped.toolsRemoved = toolsRemoved;
		return remapped;
	};
	const messages = context.messages.map((message) => {
		if (message.role === "system") return remapSystem(message);
		if (message.role === "assistant") return {
			...message,
			content: message.content.map((block) => block.type === "toolCall" ? {
				...block,
				name: remap(block.name)
			} : block)
		};
		if (message.role === "toolResult") return {
			...message,
			toolName: remap(message.toolName)
		};
		return message;
	});
	return {
		context: normalizeContext({ messages }),
		fromWire
	};
}
function restoreName(value, fromWire) {
	if (typeof value !== "object" || value === null) return;
	const record = value;
	if (record.type === "toolCall" && typeof record.name === "string") record.name = fromWire.get(record.name.toLowerCase()) ?? record.name;
	for (const key of [
		"content",
		"partial",
		"message",
		"error",
		"toolCall"
	]) {
		const child = record[key];
		if (Array.isArray(child)) child.forEach((entry) => restoreName(entry, fromWire));
		else restoreName(child, fromWire);
	}
}
async function* restoredEvents$1(events, fromWire) {
	for await (const event of events) {
		restoreName(event, fromWire);
		yield event;
	}
}
function appendBetaQuery(input) {
	if (input instanceof Request) {
		const url = new URL(input.url);
		if (url.pathname.endsWith("/v1/messages")) url.searchParams.set("beta", "true");
		return new Request(url, input);
	}
	const url = new URL(input.toString());
	if (url.pathname.endsWith("/v1/messages")) url.searchParams.set("beta", "true");
	return typeof input === "string" ? url.toString() : url;
}
function createClient(model, apiKey, sessionId, headers, betas, send, version) {
	return new Anthropic({
		apiKey: null,
		authToken: apiKey,
		baseURL: model.baseUrl,
		maxRetries: 0,
		defaultHeaders: claudeCodeHeaders({
			version,
			betas,
			sessionId,
			overrides: headers
		}),
		fetch: (input, init) => send(appendBetaQuery(input), init)
	});
}
const DEVICE_ID = randomBytes(32).toString("hex");
function sessionUuid(sessionId) {
	if (sessionId === void 0) return randomUUID();
	const value = createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
	return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20)}`;
}
function compatiblePayload$1(payload, sessionId) {
	if (typeof payload !== "object" || payload === null) return payload;
	const source = payload;
	const currentSystem = Array.isArray(source.system) ? source.system : [];
	const systemText = new Set(currentSystem.flatMap((block) => typeof block === "object" && block !== null && typeof block.text === "string" ? [block.text] : []));
	const system = [...[{
		type: "text",
		text: BILLING_IDENTITY
	}, {
		type: "text",
		text: AGENT_IDENTITY,
		cache_control: { type: "ephemeral" }
	}].filter((block) => !systemText.has(block.text)), ...currentSystem.map((block) => typeof block === "object" && block !== null ? {
		...block,
		cache_control: { type: "ephemeral" }
	} : block)];
	const messages = Array.isArray(source.messages) ? source.messages.map((message, index, all) => {
		if (index !== all.length - 1 || typeof message !== "object" || message === null) return message;
		const content = message.content;
		if (!Array.isArray(content) || content.length === 0) return message;
		return {
			...message,
			content: content.map((block, blockIndex) => blockIndex === content.length - 1 && typeof block === "object" && block !== null && block.type === "text" ? {
				...block,
				cache_control: { type: "ephemeral" }
			} : block)
		};
	}) : source.messages;
	const sourceTools = Array.isArray(source.tools) ? source.tools : void 0;
	const tools = sourceTools !== void 0 && sourceTools.length > 0 ? sourceTools.map((tool, index) => index === sourceTools.length - 1 && typeof tool === "object" && tool !== null ? {
		...tool,
		cache_control: { type: "ephemeral" }
	} : tool) : source.tools;
	return {
		...source,
		system,
		messages,
		tools,
		metadata: {
			...typeof source.metadata === "object" && source.metadata !== null ? source.metadata : {},
			user_id: JSON.stringify({
				device_id: DEVICE_ID,
				account_uuid: "",
				session_id: sessionUuid(sessionId)
			})
		},
		context_management: { edits: [{
			type: "clear_thinking_20251015",
			keep: "all"
		}] }
	};
}
function effortOf(level) {
	if (level === "minimal" || level === "low") return "low";
	return level;
}
function budgetOf(level) {
	switch (level) {
		case "minimal": return 1024;
		case "low": return 2048;
		case "medium": return 8192;
		case "high":
		case "xhigh":
		case "max": return 16384;
	}
}
function runClaude(model, context, options, send, transport) {
	const providerId = transport.providerId ?? DEFAULT_TRANSPORT_PROVIDER$1;
	const cliVersion = CLAUDE_CODE_VERSION;
	const apiKey = options?.apiKey;
	if (apiKey === void 0 || apiKey.trim().length === 0) throw new Error(`No API key for provider: ${providerId}`);
	const mapped = mappedContext(context);
	const reasoning = options?.reasoning;
	const anthropicModel = model;
	const adaptive = anthropicModel.compat?.forceAdaptiveThinking === true;
	const { apiKey: _apiKey, reasoning: _reasoning, headers, ...baseOptions } = options ?? {};
	const requestedMaxTokens = baseOptions.maxTokens ?? anthropicModel.maxTokens;
	const thinkingBudget = reasoning === void 0 || adaptive ? void 0 : Math.min(budgetOf(reasoning), Math.max(0, requestedMaxTokens - 1024));
	const thinkingEnabled = reasoning !== void 0 && (adaptive || (thinkingBudget ?? 0) >= 1024);
	const betas = betaFeaturesOf(model, mapped.context, requestedBetas(headers));
	const anthropicOptions = {
		...baseOptions,
		client: createClient(model, apiKey, options?.sessionId, headers, betas, send, cliVersion),
		headers: {
			...headers,
			"anthropic-beta": betas.join(",")
		},
		thinkingDisplay: "omitted",
		maxRetries: 0,
		thinkingEnabled,
		...reasoning === void 0 || !thinkingEnabled ? {} : adaptive ? { effort: effortOf(reasoning) } : { thinkingBudgetTokens: thinkingBudget },
		onPayload: async (payload, payloadModel) => {
			const compatible = compatiblePayload$1(payload, options?.sessionId);
			return options?.onPayload === void 0 ? compatible : await options.onPayload(compatible, payloadModel) ?? compatible;
		}
	};
	return restoredEvents$1(stream(anthropicModel, mapped.context, anthropicOptions), mapped.fromWire);
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
function createClaudeCodeStreams(resolveFetch = () => globalThis.fetch, transport = {}) {
	return {
		stream(model, context, options) {
			return runClaude(model, context, options, resolveFetch(), transport);
		},
		streamSimple(model, context, options) {
			return runClaude(model, context, options, resolveFetch(), transport);
		}
	};
}
/** The direct-connection transport: the route with no proxy configured. */
const claudeCodeStreams = createClaudeCodeStreams();
//#endregion
//#region src/transports/codex.ts
/**
* The Codex CLI release this transport reproduces.
*
* As on the Claude side, the plugin owns this value and it is deliberately NOT
* a configuration field: a user-chosen version string claims a generation whose
* request shape nobody can match from the settings page.
* `scripts/check-cli-versions.mjs` reports when a newer release exists.
*/
const CODEX_VERSION = "0.159.3";
/** The route id used when a caller builds a transport without naming one. */
const DEFAULT_TRANSPORT_PROVIDER = "anyrouter";
function compatiblePayload(payload, systemPrompt) {
	if (typeof payload !== "object" || payload === null) return payload;
	const source = payload;
	const input = Array.isArray(source.input) ? source.input : [];
	const filtered = systemPrompt === void 0 ? input : input.filter((item) => !(typeof item === "object" && item !== null && (item.role === "developer" || item.role === "system") && item.content === systemPrompt));
	return {
		...source,
		instructions: systemPrompt ?? source.instructions ?? "You are a coding agent.",
		input: filtered,
		store: false,
		stream: true,
		tool_choice: source.tool_choice ?? "auto",
		parallel_tool_calls: source.parallel_tool_calls ?? true,
		text: source.text ?? { verbosity: "low" },
		include: Array.isArray(source.include) ? [.../* @__PURE__ */ new Set([...source.include, "reasoning.encrypted_content"])] : ["reasoning.encrypted_content"]
	};
}
/**
* The prompt the transcript currently carries, in the shape {@link compatiblePayload}
* expects: `undefined` when there is no system message at all.
*
* pi-ai 0.87 removed the flat `Context.systemPrompt`, so the prompt is read back
* out of the transcript with `getCurrentSystemPrompt`, which replays the system
* messages into the current prompt. For the single folded system message pi-ai's
* `Models.streamSimple` produces, that is exactly the pre-0.87 `systemPrompt`.
* The helper reports an absent prompt as `""`, while the rewrite below
* distinguishes `undefined` (fall back to the response's own instructions) from
* an empty string, so the empty replay is mapped back to `undefined` to keep the
* payload byte-identical.
*/
function currentSystemPrompt(context) {
	const prompt = getCurrentSystemPrompt(context.messages);
	return prompt.length === 0 ? void 0 : prompt;
}
function nativeContext(context) {
	return normalizeContext({ messages: context.messages.map((message) => message.role === "assistant" ? {
		...message,
		provider: "openai-codex"
	} : message) });
}
function restoreProvider(value, providerId) {
	if (typeof value !== "object" || value === null) return;
	const record = value;
	if (record.provider === "openai-codex") record.provider = providerId;
	for (const key of [
		"content",
		"partial",
		"message",
		"error"
	]) {
		const child = record[key];
		if (Array.isArray(child)) child.forEach((entry) => restoreProvider(entry, providerId));
		else restoreProvider(child, providerId);
	}
}
async function* restoredEvents(events, providerId) {
	for await (const event of events) {
		restoreProvider(event, providerId);
		yield event;
	}
}
function runCodex(model, context, options, send, transport) {
	const providerId = transport.providerId ?? DEFAULT_TRANSPORT_PROVIDER;
	const systemPrompt = currentSystemPrompt(context);
	const nativeModel = {
		...model,
		provider: "openai-codex"
	};
	return restoredEvents(streamSimple(nativeModel, nativeContext(context), {
		...options,
		transport: "sse",
		fetch: send,
		headers: codexHeaders({
			version: CODEX_VERSION,
			sessionId: options?.sessionId,
			overrides: options?.headers
		}),
		maxRetries: 0,
		onPayload: async (payload) => {
			const compatible = compatiblePayload(payload, systemPrompt);
			return options?.onPayload === void 0 ? compatible : await options.onPayload(compatible, model) ?? compatible;
		}
	}), providerId);
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
function createCodexResponsesStreams(resolveFetch = () => globalThis.fetch, transport = {}) {
	return {
		stream(model, context, options) {
			return runCodex(model, context, options, resolveFetch(), transport);
		},
		streamSimple(model, context, options) {
			return runCodex(model, context, options, resolveFetch(), transport);
		}
	};
}
/** The direct-connection transport: the route with no proxy configured. */
const codexResponsesStreams = createCodexResponsesStreams();
//#endregion
//#region src/adapter.ts
const ambientAuth = { apiKey: {
	name: "Provider API key",
	resolve: ({ credential }) => Promise.resolve(credential?.key === void 0 ? void 0 : {
		auth: { apiKey: credential.key },
		source: "DSH credential seam"
	})
} };
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
function providerOf(provider) {
	const models = provider.models.map((model) => resolveModel(model, provider.baseURL, provider.id));
	const resolveFetch = () => proxyFetch(provider.proxy);
	const claude = { providerId: provider.id };
	const codex = { providerId: provider.id };
	return createProvider({
		id: provider.id,
		name: provider.displayName,
		baseUrl: provider.baseURL,
		auth: ambientAuth,
		models,
		api: {
			"anthropic-messages": createClaudeCodeStreams(resolveFetch, claude),
			"openai-responses": createCodexResponsesStreams(resolveFetch, codex)
		}
	});
}
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
function providerProfileOf(provider) {
	return {
		provider: provider.id,
		displayName: provider.displayName,
		apiKeyEnv: provider.apiKeyEnv,
		baseURL: provider.baseURL,
		streamIdleTimeoutMs: provider.streamIdleTimeoutMs,
		maxRequestImageBytes: 33554432,
		requestImagePixelBudget: 1e8,
		requestImageMaxBytes: 33554432,
		retryPolicy: provider.retryPolicy,
		piProvider: providerOf(provider),
		modelErrors: /* @__PURE__ */ new Map(),
		configuredMaxTokens: /* @__PURE__ */ new Map(),
		transport: "sse"
	};
}
var AnyRouterAdapter = class extends PiAiAdapter {
	constructor(options) {
		let snapshotConfig;
		let snapshotProfiles;
		const profiles = () => {
			const config = options.config();
			if (config === snapshotConfig && snapshotProfiles !== void 0) return snapshotProfiles;
			snapshotConfig = config;
			snapshotProfiles = new Map(config.providers.filter(isUsable).map((provider) => [provider.id, providerProfileOf(provider)]));
			return snapshotProfiles;
		};
		super({
			profiles,
			resolveApiKey: async (_provider, profile) => {
				if (profile.apiKeyEnv === void 0) throw new Error("dsh-anyrouter: resolved profile lost its credential ref");
				return options.resolveApiKey(profile.apiKeyEnv);
			},
			auth: {
				credentials: {
					read: () => Promise.resolve(void 0),
					list: () => Promise.resolve([]),
					modify: (_providerId, update) => update(void 0),
					delete: () => Promise.resolve()
				},
				authContext: {
					env: (name) => Promise.resolve(process.env[name]),
					fileExists: () => Promise.resolve(false)
				}
			},
			resolveAttachments: options.resolveAttachments ?? (() => void 0)
		});
		this.modelOptions = options;
	}
	modelOptions;
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
	async resolveModel(provider, model, signal) {
		const info = await super.resolveModel(provider, model, signal);
		if (info.reasoning === void 0) return info;
		const row = this.modelOptions.config().providers.find((candidate) => candidate.id === provider)?.models.find((candidate) => candidate.id === model);
		const defaultEffort = row === void 0 ? void 0 : effectiveReasoning(row).defaultEffort;
		if (row === void 0 || defaultEffort === void 0) return info;
		return {
			...info,
			reasoning: {
				...info.reasoning,
				defaultEffort: ReasoningEffortId(defaultEffort)
			}
		};
	}
};
//#endregion
//#region src/discovery.ts
const MAX_RESPONSE_BYTES = 4194304;
function positiveInteger(...values) {
	return values.find((value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0);
}
function nonEmptyString(...values) {
	return values.find((value) => typeof value === "string" && value.length > 0);
}
function modelURL(baseURL) {
	const url = new URL(baseURL);
	url.pathname = `${url.pathname.replace(/\/+$/, "")}/v1/models`;
	url.search = "";
	url.hash = "";
	return url.toString();
}
async function readBounded(response, label, signal) {
	if (response.body === null) return "";
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0;
	let text = "";
	try {
		while (true) {
			if (signal?.aborted) throw signal.reason;
			const next = await reader.read();
			if (next.done) break;
			bytes += next.value.byteLength;
			if (bytes > MAX_RESPONSE_BYTES) throw new LlmError(`${label} model listing exceeds ${MAX_RESPONSE_BYTES} bytes`, "DISCOVERY_FAILED");
			text += decoder.decode(next.value, { stream: true });
		}
		text += decoder.decode();
		return text;
	} finally {
		await reader.cancel().catch(() => void 0);
	}
}
function rowsOf(body, label) {
	if (typeof body !== "object" || body === null || !Array.isArray(body.data)) throw new LlmError(`${label} model listing is not an OpenAI-compatible data array`, "DISCOVERY_FAILED");
	return body.data.filter((row) => typeof row === "object" && row !== null);
}
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
async function discoverAnyRouterModels(options) {
	const label = options.label ?? "AnyRouter";
	const keyCheck = normalizeApiKey(options.apiKey);
	if (!keyCheck.ok) throw new LlmError(`${label} model discovery received an unusable API key (${keyCheck.reason})`, "INVALID_CREDENTIAL");
	const key = keyCheck.value;
	const url = modelURL(normalizeBaseURL(options.baseURL));
	let response;
	try {
		response = await (options.fetch ?? fetch)(url, {
			headers: {
				...attributionHeaders(),
				accept: "application/json",
				authorization: `Bearer ${key}`
			},
			...options.signal === void 0 ? {} : { signal: options.signal }
		});
	} catch (cause) {
		if (options.signal?.aborted) throw new LlmError(`${label} model discovery aborted`, "ABORTED", { cause });
		throw new LlmError(`failed to fetch ${label} models from ${url}`, "DISCOVERY_FAILED", { cause });
	}
	if (!response.ok) throw new LlmError(`${url} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`, response.status === 401 || response.status === 403 ? "INVALID_CREDENTIAL" : "DISCOVERY_FAILED");
	let text;
	try {
		text = await readBounded(response, label, options.signal);
	} catch (cause) {
		if (options.signal?.aborted) throw new LlmError(`${label} model discovery aborted`, "ABORTED", { cause });
		throw new LlmError(`failed to read ${label} models from ${url}`, "DISCOVERY_FAILED", { cause });
	}
	let body;
	try {
		body = JSON.parse(text);
	} catch (cause) {
		throw new LlmError(`${url} did not answer with JSON`, "DISCOVERY_FAILED", { cause });
	}
	const discovered = [];
	const seen = /* @__PURE__ */ new Set();
	for (const row of rowsOf(body, label)) {
		if (typeof row.id !== "string" || row.id.length === 0 || seen.has(row.id)) continue;
		const protocol = classifyProtocol(row.id);
		if (protocol === void 0) continue;
		seen.add(row.id);
		const fallback = metadataForDiscoveredModel(row.id, protocol);
		const name = nonEmptyString(row.name, row.display_name, fallback.name);
		const contextWindow = positiveInteger(row.context_window, row.context_length, fallback.contextWindow);
		const maxTokens = positiveInteger(row.max_tokens, row.max_output_tokens, fallback.maxTokens);
		discovered.push({
			id: row.id,
			...name === void 0 ? {} : { name },
			...contextWindow === void 0 ? {} : { contextWindow },
			...maxTokens === void 0 ? {} : { maxTokens }
		});
	}
	return discovered;
}
//#endregion
//#region src/index.ts
const name = "dsh-anyrouter";
const inject = ["llm"];
/**
* Subscribe to one Loader event. `loader/volatile-update` is declared by
* `@deepseek-ai/cordis-plugin-loader`'s event augmentation, which the type-only
* import above brings into scope; `ctx.on` therefore registers the listener on
* this plugin's fiber, which disposes it with the plugin.
* @param ctx - the plugin's own context.
* @param event - the Loader event name to listen for.
* @param listener - called on every dispatch of that event.
*/
function onLoaderEvent(ctx, event, listener) {
	ctx.on(event, () => listener());
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
function routeSignature(providers) {
	return providers.map((provider) => `${provider.id}\u0000${JSON.stringify(provider.retryPolicy)}`).join("");
}
function apply(ctx, config) {
	let goodFrom;
	let lastGood;
	let badFrom;
	const sameOptions = (left, right) => Object.is(left.providers, right.providers) && Object.is(left.apiKeyEnv, right.apiKeyEnv) && Object.is(left.baseURL, right.baseURL) && Object.is(left.proxy, right.proxy) && Object.is(left.models, right.models) && Object.is(left.streamIdleTimeoutMs, right.streamIdleTimeoutMs) && Object.is(left.retryPolicy, right.retryPolicy);
	const options = () => {
		const raw = plainOptions(config);
		if (lastGood !== void 0) {
			if (goodFrom !== void 0 && sameOptions(raw, goodFrom)) return lastGood;
			if (badFrom !== void 0 && sameOptions(raw, badFrom)) return lastGood;
		}
		try {
			const next = resolveConfig(raw);
			goodFrom = raw;
			lastGood = next;
			badFrom = void 0;
			return next;
		} catch (error) {
			if (lastGood === void 0) throw error;
			badFrom = raw;
			ctx.logger.error("dsh-anyrouter: keeping the last good configuration after an invalid settings update");
			ctx.logger.error(error);
			return lastGood;
		}
	};
	options();
	const resolveApiKey = async (ref) => {
		const credentials = ctx.get("credentials");
		if (credentials !== void 0) {
			const hit = await credentials.resolve(ref);
			if (hit !== void 0) return assertUsableApiKey(hit.value, "dsh-anyrouter", ref);
		} else {
			const ambient = launchEnvironmentOf(ctx).get(ref);
			if (ambient !== void 0 && ambient.value.length > 0) return assertUsableApiKey(ambient.value, "dsh-anyrouter", ref);
		}
		throw new LlmError(`dsh-anyrouter: no API key; store ${ref} in the credentials service or export it before launching DSH`, "MISSING_CREDENTIAL");
	};
	const adapter = new AnyRouterAdapter({
		config: options,
		resolveApiKey,
		resolveAttachments: () => ctx.get("attachments")
	});
	let disposed = false;
	let directory;
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
	const syncDirectory = () => {
		if (disposed) return;
		const entries = options().providers.map((provider) => ({
			provider: provider.id,
			displayName: provider.displayName,
			settingsNs: SETTINGS_NS,
			settingsPath: [],
			...provider.error === void 0 ? {} : { error: provider.error }
		}));
		try {
			if (entries.length === 0) {
				if (directory !== void 0) {
					directory();
					directory = void 0;
				}
				return;
			}
			if (directory === void 0) directory = ctx.llm.registerConfigurableProviders(entries);
			else directory.replace(entries);
		} catch (error) {
			ctx.logger.error("dsh-anyrouter: keeping the previous provider directory after a rejected update");
			ctx.logger.error(error);
		}
	};
	const keyPresent = async (ref) => {
		const credentials = ctx.get("credentials");
		if (credentials !== void 0) {
			const hit = await credentials.resolve(ref);
			return hit !== void 0 && hit.value.length > 0;
		}
		const ambient = launchEnvironmentOf(ctx).get(ref);
		return ambient !== void 0 && ambient.value.length > 0;
	};
	/**
	* Whether a configured provider is also a registered route.
	*
	* The condition is the credential, not the configuration: a configured relay
	* with no key stays dormant (its models vanish from the selector) while
	* remaining listed and editable in the directory. Each provider is judged on
	* its own reference, so one relay going keyless never disturbs another.
	*/
	let registration;
	let registeredSignature;
	let evaluating = false;
	let dirty = false;
	const ensureRoute = async () => {
		if (disposed) return;
		if (evaluating) {
			dirty = true;
			return;
		}
		evaluating = true;
		try {
			const providers = options().providers;
			const active = [];
			try {
				for (const provider of providers) if (isUsable(provider) && await keyPresent(provider.apiKeyEnv)) active.push(provider);
			} catch (error) {
				ctx.logger.error("dsh-anyrouter: credential presence check failed; keeping the current route state");
				ctx.logger.error(error);
				return;
			}
			if (disposed) return;
			if (active.length === 0) {
				if (registration !== void 0) {
					registration();
					registration = void 0;
					registeredSignature = void 0;
				}
				return;
			}
			const ids = active.map((provider) => provider.id);
			const signature = routeSignature(active);
			try {
				if (registration === void 0) {
					registration = ctx.llm.registerAdapter(ids, adapter);
					registeredSignature = signature;
					return;
				}
				if (registeredSignature !== signature) {
					registration.replace(ids);
					registeredSignature = signature;
				}
			} catch (error) {
				ctx.logger.error("dsh-anyrouter: could not register the configured provider routes");
				ctx.logger.error(error);
			}
		} finally {
			evaluating = false;
			if (dirty && !disposed) {
				dirty = false;
				ensureRoute();
			}
		}
	};
	/**
	* Re-publish the directory and re-evaluate routes after a configuration change,
	* reporting anything resolution had to drop.
	*
	* The diagnostics are logged once per distinct resolved configuration rather
	* than on every reconcile: `options()` memoizes on the values behind the live
	* references, so identity is exactly the "something really changed" signal and
	* a repeated settings write cannot spam the log with the same complaint.
	*/
	let reportedConfig;
	const reconcileConfig = () => {
		const resolved = options();
		if (resolved !== reportedConfig) {
			reportedConfig = resolved;
			for (const diagnostic of resolved.diagnostics) ctx.logger.error(`dsh-anyrouter: ${diagnostic}`);
			for (const provider of resolved.providers) if (provider.error !== void 0) ctx.logger.error(`dsh-anyrouter: provider ${JSON.stringify(provider.id)} is disabled: ${provider.error}`);
		}
		syncDirectory();
		ensureRoute();
	};
	ctx.effect(() => () => {
		disposed = true;
	}, "dsh-anyrouter: route activation lifecycle");
	const scheduleRouteCheck = () => {
		ensureRoute();
	};
	reconcileConfig();
	ctx.inject(["credentials"], () => {
		scheduleRouteCheck();
		return () => scheduleRouteCheck();
	});
	ctx.on("credentials/reference-updated", (ref) => {
		if (options().providers.some((provider) => provider.apiKeyEnv === ref)) scheduleRouteCheck();
	});
	onLoaderEvent(ctx, "loader/volatile-update", reconcileConfig);
	ctx.llm.registerModelDiscovery(SETTINGS_NS, async (request, signal) => {
		const resolved = options();
		const stored = request.provider === void 0 ? resolved.providers[0] : resolved.providers.find((provider) => provider.id === request.provider);
		const draft = request.baseURL?.trim();
		const baseURL = draft ? normalizeBaseURL(draft) : stored?.baseURL;
		if (baseURL === void 0) throw new LlmError("dsh-anyrouter: model discovery needs an endpoint; save the provider or supply a draft baseURL", "DISCOVERY_FAILED");
		if (request.apiKey === void 0 && baseURL !== stored?.baseURL) throw new LlmError("dsh-anyrouter: save the endpoint before syncing models, or supply an API key for the new endpoint", "INVALID_CREDENTIAL");
		const apiKey = request.apiKey ?? (stored === void 0 ? void 0 : await resolveApiKey(stored.apiKeyEnv));
		if (apiKey === void 0) throw new LlmError("dsh-anyrouter: no stored API key for this provider; supply one to sync its models", "MISSING_CREDENTIAL");
		return discoverAnyRouterModels({
			baseURL,
			apiKey,
			label: stored?.displayName ?? request.provider ?? "anyrouter",
			fetch: proxyFetch(stored?.proxy),
			...signal === void 0 ? {} : { signal }
		});
	});
}
//#endregion
export { AnyRouterAdapter, Config, apply, claudeCodeStreams, codexResponsesStreams, createClaudeCodeStreams, createCodexResponsesStreams, defaultApiKeyEnvFor, discoverAnyRouterModels, disposeProxyAgents, inject, isLoopbackHost, name, normalizeProviderId, normalizeProxyURL, plainOptions, proxyFetch, redactProxyURL, resolveConfig };

//# sourceMappingURL=index.js.map