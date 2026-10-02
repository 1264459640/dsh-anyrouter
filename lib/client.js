window.__ModuleLoader__.load({id:"dsh-anyrouter",factory:(require)=>{const module={exports:{}};const exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  credentialRefFor: () => credentialRefFor,
  credentialRefProblem: () => credentialRefProblem,
  defaultApiKeyEnvFor: () => defaultApiKeyEnvFor,
  endpointProblem: () => endpointProblem,
  errorMessage: () => errorMessage,
  inject: () => inject,
  legacyModelsPending: () => legacyModelsPending,
  nextProviderId: () => nextProviderId,
  persistProviders: () => persistProviders,
  protocolFor: () => protocolFor,
  providerDraftFrom: () => providerDraftFrom,
  providerIdProblem: () => providerIdProblem,
  providerValueFrom: () => providerValueFrom,
  providersFromValue: () => providersFromValue,
  providersMatch: () => providersMatch,
  proxyProblem: () => proxyProblem,
  referenceRow: () => referenceRow,
  replaceProvider: () => replaceProvider,
  rowFromSaved: () => rowFromSaved,
  rowToSaved: () => rowToSaved,
  seedSectionState: () => seedSectionState,
  unwrapRemote: () => unwrapRemote,
  withProviderModels: () => withProviderModels,
  withoutProvider: () => withoutProvider
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");

// src/model-profiles.generated.ts
var MODEL_PROFILES = [
  { id: "claude-fable-5", protocol: "claude-code", name: "Claude Fable 5", efforts: ["minimal", "low", "medium", "high", "xhigh", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "supportsMidConvoSystemMessages": true, "supportsMidConvoToolChanges": true, "forceAdaptiveThinking": true, "supportsStrictTools": true, "allowedFallbackModels": [{ "provider": "anthropic", "model": "claude-opus-4-8", "cost": { "input": 5, "output": 25, "cacheRead": 0.5, "cacheWrite": 6.25 } }, { "provider": "anthropic", "model": "claude-opus-5", "cost": { "input": 5, "output": 25, "cacheRead": 0.5, "cacheWrite": 6.25 } }] } },
  { id: "claude-fable-5-1", protocol: "claude-code", name: "Claude Fable 5.1", efforts: ["minimal", "low", "medium", "high", "xhigh", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "supportsMidConvoEffort": true, "supportsMidConvoSystemMessages": true, "supportsMidConvoToolChanges": true, "forceAdaptiveThinking": true, "supportsStrictTools": true } },
  { id: "claude-fable-5.1", protocol: "claude-code", name: "Claude Fable 5.1", efforts: ["minimal", "low", "medium", "high", "xhigh", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "sendSessionAffinityHeaders": true, "forceAdaptiveThinking": true } },
  { id: "claude-haiku-4-5", protocol: "claude-code", name: "Claude Haiku 4.5 (latest)", efforts: ["off", "minimal", "low", "medium", "high"], adaptive: false, contextWindow: 2e5, maxTokens: 64e3, compat: { "supportsStrictTools": true } },
  { id: "claude-haiku-4-5-20251001", protocol: "claude-code", name: "Claude Haiku 4.5", efforts: ["off", "minimal", "low", "medium", "high"], adaptive: false, contextWindow: 2e5, maxTokens: 64e3, compat: { "supportsStrictTools": true } },
  { id: "claude-haiku-4.5", protocol: "claude-code", name: "Claude Haiku 4.5 (latest)", efforts: ["off", "minimal", "low", "medium", "high"], adaptive: false, contextWindow: 2e5, maxTokens: 64e3, compat: { "sendSessionAffinityHeaders": true } },
  { id: "claude-opus-4-5", protocol: "claude-code", name: "Claude Opus 4.5 (latest)", efforts: ["off", "minimal", "low", "medium", "high"], adaptive: false, contextWindow: 2e5, maxTokens: 64e3, compat: { "supportsStrictTools": true } },
  { id: "claude-opus-4-5-20251101", protocol: "claude-code", name: "Claude Opus 4.5", efforts: ["off", "minimal", "low", "medium", "high"], adaptive: false, contextWindow: 2e5, maxTokens: 64e3, compat: { "supportsStrictTools": true } },
  { id: "claude-opus-4-6", protocol: "claude-code", name: "Claude Opus 4.6", efforts: ["off", "minimal", "low", "medium", "high", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "forceAdaptiveThinking": true, "supportsStrictTools": true } },
  { id: "claude-opus-4-7", protocol: "claude-code", name: "Claude Opus 4.7", efforts: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "forceAdaptiveThinking": true, "supportsTemperature": false, "supportsStrictTools": true } },
  { id: "claude-opus-4-8", protocol: "claude-code", name: "Claude Opus 4.8", efforts: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "supportsMidConvoSystemMessages": true, "supportsMidConvoToolChanges": true, "forceAdaptiveThinking": true, "supportsTemperature": false, "supportsStrictTools": true } },
  { id: "claude-opus-4.5", protocol: "claude-code", name: "Claude Opus 4.5 (latest)", efforts: ["off", "minimal", "low", "medium", "high"], adaptive: false, contextWindow: 2e5, maxTokens: 64e3, compat: { "sendSessionAffinityHeaders": true } },
  { id: "claude-opus-4.6", protocol: "claude-code", name: "Claude Opus 4.6", efforts: ["off", "minimal", "low", "medium", "high", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "sendSessionAffinityHeaders": true, "forceAdaptiveThinking": true } },
  { id: "claude-opus-4.7", protocol: "claude-code", name: "Claude Opus 4.7", efforts: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "sendSessionAffinityHeaders": true, "forceAdaptiveThinking": true, "supportsTemperature": false } },
  { id: "claude-opus-4.8", protocol: "claude-code", name: "Claude Opus 4.8", efforts: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "sendSessionAffinityHeaders": true, "forceAdaptiveThinking": true, "supportsTemperature": false } },
  { id: "claude-opus-5", protocol: "claude-code", name: "Claude Opus 5", efforts: ["minimal", "low", "medium", "high", "xhigh", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "supportsMidConvoEffort": true, "supportsMidConvoSystemMessages": true, "supportsMidConvoToolChanges": true, "forceAdaptiveThinking": true, "supportsTemperature": false, "supportsStrictTools": true } },
  { id: "claude-opus-5-5", protocol: "claude-code", name: "Claude Opus 5.5", efforts: ["low", "medium", "high", "xhigh", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "supportsMidConvoEffort": true, "supportsMidConvoSystemMessages": true, "supportsMidConvoToolChanges": true, "forceAdaptiveThinking": true, "supportsTemperature": false, "supportsStrictTools": true } },
  { id: "claude-opus-5.5", protocol: "claude-code", name: "Claude Opus 5.5", efforts: ["low", "medium", "high", "xhigh", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "supportsMidConvoSystemMessages": true, "forceAdaptiveThinking": true, "supportsTemperature": false } },
  { id: "claude-sonnet-4", protocol: "claude-code", name: "Claude Sonnet 4", efforts: ["off", "minimal", "low", "medium", "high"], adaptive: false, contextWindow: 2e5, maxTokens: 64e3 },
  { id: "claude-sonnet-4-5", protocol: "claude-code", name: "Claude Sonnet 4.5 (latest)", efforts: ["off", "minimal", "low", "medium", "high"], adaptive: false, contextWindow: 1e6, maxTokens: 64e3, compat: { "supportsStrictTools": true } },
  { id: "claude-sonnet-4-5-20250929", protocol: "claude-code", name: "Claude Sonnet 4.5", efforts: ["off", "minimal", "low", "medium", "high"], adaptive: false, contextWindow: 1e6, maxTokens: 64e3, compat: { "supportsStrictTools": true } },
  { id: "claude-sonnet-4-6", protocol: "claude-code", name: "Claude Sonnet 4.6", efforts: ["off", "minimal", "low", "medium", "high", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "forceAdaptiveThinking": true, "supportsStrictTools": true } },
  { id: "claude-sonnet-4.5", protocol: "claude-code", name: "Claude Sonnet 4.5 (latest)", efforts: ["off", "minimal", "low", "medium", "high"], adaptive: false, contextWindow: 1e6, maxTokens: 64e3, compat: { "sendSessionAffinityHeaders": true } },
  { id: "claude-sonnet-4.6", protocol: "claude-code", name: "Claude Sonnet 4.6", efforts: ["off", "minimal", "low", "medium", "high", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "sendSessionAffinityHeaders": true, "forceAdaptiveThinking": true } },
  { id: "claude-sonnet-5", protocol: "claude-code", name: "Claude Sonnet 5", efforts: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], adaptive: true, contextWindow: 1e6, maxTokens: 128e3, compat: { "forceAdaptiveThinking": true, "supportsStrictTools": true } },
  { id: "gpt-4", protocol: "codex-responses", name: "GPT-4", efforts: [], adaptive: false, contextWindow: 8192, maxTokens: 8192, compat: { "supportsStrictMode": true } },
  { id: "gpt-4-turbo", protocol: "codex-responses", name: "GPT-4 Turbo", efforts: [], adaptive: false, contextWindow: 128e3, maxTokens: 4096, compat: { "supportsStrictMode": true } },
  { id: "gpt-4.1", protocol: "codex-responses", name: "GPT-4.1", efforts: [], adaptive: false, contextWindow: 1047576, maxTokens: 32768, compat: { "supportsStrictMode": true } },
  { id: "gpt-4.1-mini", protocol: "codex-responses", name: "GPT-4.1 mini", efforts: [], adaptive: false, contextWindow: 1047576, maxTokens: 32768, compat: { "supportsStrictMode": true } },
  { id: "gpt-4.1-nano", protocol: "codex-responses", name: "GPT-4.1 nano", efforts: [], adaptive: false, contextWindow: 1047576, maxTokens: 32768, compat: { "supportsStrictMode": true } },
  { id: "gpt-4o", protocol: "codex-responses", name: "GPT-4o", efforts: [], adaptive: false, contextWindow: 128e3, maxTokens: 16384, compat: { "supportsStrictMode": true } },
  { id: "gpt-4o-2024-05-13", protocol: "codex-responses", name: "GPT-4o (2024-05-13)", efforts: [], adaptive: false, contextWindow: 128e3, maxTokens: 4096, compat: { "supportsStrictMode": true } },
  { id: "gpt-4o-2024-08-06", protocol: "codex-responses", name: "GPT-4o (2024-08-06)", efforts: [], adaptive: false, contextWindow: 128e3, maxTokens: 16384, compat: { "supportsStrictMode": true } },
  { id: "gpt-4o-2024-11-20", protocol: "codex-responses", name: "GPT-4o (2024-11-20)", efforts: [], adaptive: false, contextWindow: 128e3, maxTokens: 16384, compat: { "supportsStrictMode": true } },
  { id: "gpt-4o-mini", protocol: "codex-responses", name: "GPT-4o mini", efforts: [], adaptive: false, contextWindow: 128e3, maxTokens: 16384, compat: { "supportsStrictMode": true } },
  { id: "gpt-5", protocol: "codex-responses", name: "GPT-5", efforts: ["minimal", "low", "medium", "high"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5-chat-latest", protocol: "codex-responses", name: "GPT-5 Chat Latest", efforts: [], adaptive: false, contextWindow: 128e3, maxTokens: 16384, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5-codex", protocol: "codex-responses", name: "GPT-5 Codex", efforts: ["low", "medium", "high"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "sessionAffinityFormat": "openai-nosession", "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5-mini", protocol: "codex-responses", name: "GPT-5 Mini", efforts: ["minimal", "low", "medium", "high"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5-nano", protocol: "codex-responses", name: "GPT-5 Nano", efforts: ["minimal", "low", "medium", "high"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5-pro", protocol: "codex-responses", name: "GPT-5 Pro", efforts: ["high"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.1", protocol: "codex-responses", name: "GPT-5.1", efforts: ["off", "low", "medium", "high"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.1-codex", protocol: "codex-responses", name: "GPT-5.1 Codex", efforts: ["low", "medium", "high"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "sessionAffinityFormat": "openai-nosession", "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.1-codex-max", protocol: "codex-responses", name: "GPT-5.1 Codex Max", efforts: ["low", "medium", "high", "xhigh"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "sessionAffinityFormat": "openai-nosession", "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.1-codex-mini", protocol: "codex-responses", name: "GPT-5.1 Codex Mini", efforts: ["low", "medium", "high"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "sessionAffinityFormat": "openai-nosession", "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.2", protocol: "codex-responses", name: "GPT-5.2", efforts: ["off", "low", "medium", "high", "xhigh"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.2-chat-latest", protocol: "codex-responses", name: "GPT-5.2 Chat", efforts: ["medium", "xhigh"], adaptive: false, contextWindow: 128e3, maxTokens: 16384, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.2-codex", protocol: "codex-responses", name: "GPT-5.2 Codex", efforts: ["low", "medium", "high", "xhigh"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "sessionAffinityFormat": "openai-nosession", "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.2-pro", protocol: "codex-responses", name: "GPT-5.2 Pro", efforts: ["medium", "high", "xhigh"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.3-chat-latest", protocol: "codex-responses", name: "GPT-5.3 Chat (latest)", efforts: [], adaptive: false, contextWindow: 128e3, maxTokens: 16384, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.3-codex", protocol: "codex-responses", name: "GPT-5.3 Codex", efforts: ["off", "low", "medium", "high", "xhigh"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.3-codex-spark", protocol: "codex-responses", name: "GPT-5.3 Codex Spark", efforts: ["off", "minimal", "low", "medium", "high", "xhigh"], adaptive: false, contextWindow: 128e3, maxTokens: 128e3, compat: { "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.4", protocol: "codex-responses", name: "GPT-5.4", efforts: ["off", "low", "medium", "high", "xhigh"], adaptive: false, contextWindow: 272e3, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true, "supportsAdditionalTools": true, "supportsToolSearch": true, "supportsMidConvoSystemMessages": true } },
  { id: "gpt-5.4-mini", protocol: "codex-responses", name: "GPT-5.4 mini", efforts: ["off", "low", "medium", "high", "xhigh"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true, "supportsAdditionalTools": true, "supportsToolSearch": true, "supportsMidConvoSystemMessages": true } },
  { id: "gpt-5.4-nano", protocol: "codex-responses", name: "GPT-5.4 nano", efforts: ["off", "low", "medium", "high", "xhigh"], adaptive: false, contextWindow: 4e5, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.4-pro", protocol: "codex-responses", name: "GPT-5.4 Pro", efforts: ["medium", "high", "xhigh"], adaptive: false, contextWindow: 105e4, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true, "supportsAdditionalTools": true, "supportsToolSearch": true, "supportsMidConvoSystemMessages": true } },
  { id: "gpt-5.5", protocol: "codex-responses", name: "GPT-5.5", efforts: ["off", "minimal", "low", "medium", "high", "xhigh"], adaptive: false, contextWindow: 272e3, maxTokens: 128e3, compat: { "supportsOpenAIGrammarTools": true, "supportsToolSearch": true, "supportsMidConvoSystemMessages": true } },
  { id: "gpt-5.5-pro", protocol: "codex-responses", name: "GPT-5.5 Pro", efforts: ["medium", "high", "xhigh"], adaptive: false, contextWindow: 105e4, maxTokens: 128e3, compat: { "supportsStrictMode": true, "supportsOpenAIGrammarTools": true } },
  { id: "gpt-5.6-luna", protocol: "codex-responses", name: "GPT-5.6 Luna", efforts: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], adaptive: false, contextWindow: 272e3, maxTokens: 128e3, compat: { "supportsOpenAIGrammarTools": true, "supportsAdditionalTools": true, "supportsToolSearch": true, "supportsMidConvoSystemMessages": true } },
  { id: "gpt-5.6-sol", protocol: "codex-responses", name: "GPT-5.6 Sol", efforts: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], adaptive: false, contextWindow: 272e3, maxTokens: 128e3, compat: { "supportsOpenAIGrammarTools": true, "supportsAdditionalTools": true, "supportsToolSearch": true, "supportsMidConvoSystemMessages": true } },
  { id: "gpt-5.6-terra", protocol: "codex-responses", name: "GPT-5.6 Terra", efforts: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], adaptive: false, contextWindow: 272e3, maxTokens: 128e3, compat: { "supportsOpenAIGrammarTools": true, "supportsAdditionalTools": true, "supportsToolSearch": true, "supportsMidConvoSystemMessages": true } },
  { id: "gpt-6-astra", protocol: "codex-responses", name: "GPT-6 Astra", efforts: ["minimal", "low", "medium", "high", "xhigh", "max"], adaptive: false, contextWindow: 272e3, maxTokens: 128e3, compat: { "supportsOpenAIGrammarTools": true, "supportsAdditionalTools": true, "supportsToolSearch": true, "supportsMidConvoSystemMessages": true } },
  { id: "gpt-6-luna", protocol: "codex-responses", name: "GPT-6 Luna", efforts: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], adaptive: false, contextWindow: 272e3, maxTokens: 128e3, compat: { "supportsOpenAIGrammarTools": true, "supportsAdditionalTools": true, "supportsToolSearch": true, "supportsMidConvoSystemMessages": true } },
  { id: "gpt-6-sol", protocol: "codex-responses", name: "GPT-6 Sol", efforts: ["off", "minimal", "low", "medium", "high", "xhigh", "max"], adaptive: false, contextWindow: 272e3, maxTokens: 128e3, compat: { "supportsOpenAIGrammarTools": true, "supportsAdditionalTools": true, "supportsToolSearch": true, "supportsMidConvoSystemMessages": true } },
  { id: "gpt-realtime-2.1", protocol: "codex-responses", name: "GPT-Realtime-2.1", efforts: ["minimal", "low", "medium", "high", "xhigh"], adaptive: false, contextWindow: 128e3, maxTokens: 32e3, compat: { "supportsStrictMode": true } }
];
var MODEL_PROFILES_BY_ID = new Map(
  MODEL_PROFILES.map((profile) => [profile.id, profile])
);

// src/proxy.ts
var OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
var LOOPBACK_IPV4 = new RegExp(`^127\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);
function isLoopbackHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "::" || host === "0.0.0.0") return true;
  const mappedHigh = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(host)?.[1];
  if (mappedHigh !== void 0) return Number.parseInt(mappedHigh, 16) >>> 8 === 127;
  return LOOPBACK_IPV4.test(host.startsWith("::ffff:") ? host.slice(7) : host);
}

// src/client/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var SETTINGS_NS = "dsh-anyrouter";
var PROVIDER = "anyrouter";
var DEFAULT_PROVIDER_ID = "anyrouter";
var DEFAULT_DISPLAY_NAME = "AnyRouter";
var DEFAULT_API_KEY_ENV = "ANYROUTER_API_KEY";
var DEFAULT_BASE_URL = "https://anyrouter.top";
var DEFAULT_PROXY = "";
var PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
var LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const candidate = error;
    if (typeof candidate.message === "string") return candidate.message;
    if (typeof candidate.code === "string") return candidate.code;
  }
  return String(error);
}
function unwrapRemote(response) {
  const envelope = response;
  if (envelope !== null && envelope !== void 0 && envelope.ok === true) return envelope.value;
  throw new Error(errorMessage(envelope?.error));
}
function protocolFor(id) {
  const normalized = id.toLowerCase();
  if (normalized.startsWith("claude-")) return "claude-code";
  if (normalized.startsWith("gpt-")) return "codex-responses";
  return void 0;
}
function defaultApiKeyEnvFor(id) {
  const value = id.trim();
  if (value === DEFAULT_PROVIDER_ID) return DEFAULT_API_KEY_ENV;
  return `${value.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}
function credentialRefFor(provider) {
  return (provider.apiKeyEnv ?? "").trim() || defaultApiKeyEnvFor(provider.id);
}
function providersFromValue(value) {
  if (Array.isArray(value?.providers)) return value.providers;
  return [{
    id: DEFAULT_PROVIDER_ID,
    displayName: DEFAULT_DISPLAY_NAME,
    apiKeyEnv: value?.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
    baseURL: value?.baseURL ?? DEFAULT_BASE_URL,
    proxy: value?.proxy ?? DEFAULT_PROXY,
    models: Array.isArray(value?.models) ? value.models : []
  }];
}
function providerDraftFrom(provider) {
  return {
    id: provider.id,
    displayName: provider.displayName ?? "",
    apiKeyEnv: provider.apiKeyEnv ?? "",
    baseURL: provider.baseURL ?? "",
    proxy: provider.proxy ?? "",
    models: provider.models ?? [],
    ...provider.streamIdleTimeoutMs === void 0 ? {} : { streamIdleTimeoutMs: provider.streamIdleTimeoutMs },
    ...provider.retryPolicy === void 0 ? {} : { retryPolicy: provider.retryPolicy }
  };
}
function providerValueFrom(draft) {
  const id = draft.id.trim();
  const displayName = draft.displayName.trim();
  const apiKeyEnv = draft.apiKeyEnv.trim();
  const baseURL = draft.baseURL.trim();
  const proxy = draft.proxy.trim();
  return {
    id,
    ...displayName.length === 0 ? {} : { displayName },
    ...apiKeyEnv.length === 0 ? {} : { apiKeyEnv },
    ...baseURL.length === 0 ? {} : { baseURL },
    ...proxy.length === 0 ? {} : { proxy },
    models: draft.models,
    ...draft.streamIdleTimeoutMs === void 0 ? {} : { streamIdleTimeoutMs: draft.streamIdleTimeoutMs },
    ...draft.retryPolicy === void 0 ? {} : { retryPolicy: draft.retryPolicy }
  };
}
function seedSectionState(value, previousSelected = 0) {
  const draft = providersFromValue(value);
  const selected = previousSelected >= 0 && previousSelected < draft.length ? previousSelected : draft.length > 0 ? 0 : -1;
  const provider = selected < 0 ? void 0 : draft[selected];
  return { draft, selected, form: provider === void 0 ? null : providerDraftFrom(provider) };
}
function providerIdProblem(id, providers, selfIndex) {
  const value = id.trim();
  if (value.length === 0) return "\u63D0\u4F9B\u5546 ID \u4E0D\u80FD\u4E3A\u7A7A\u3002";
  if (!PROVIDER_ID_PATTERN.test(value)) {
    return "\u63D0\u4F9B\u5546 ID \u53EA\u80FD\u4F7F\u7528\u5C0F\u5199\u5B57\u6BCD\u3001\u6570\u5B57\u4EE5\u53CA . _ -\uFF0C\u5E76\u4E14\u5FC5\u987B\u4EE5\u5B57\u6BCD\u6216\u6570\u5B57\u5F00\u5934\u3002";
  }
  if (providers.some((provider, index) => index !== selfIndex && provider.id.trim() === value)) {
    return "\u63D0\u4F9B\u5546 ID \u5DF2\u88AB\u5360\u7528\uFF0C\u8BF7\u6362\u4E00\u4E2A\u3002";
  }
  return null;
}
function credentialRefProblem(raw) {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    return "\u51ED\u8BC1\u5F15\u7528\u5FC5\u987B\u662F shell \u6807\u8BC6\u7B26\uFF0C\u4F8B\u5982 ANYROUTER_API_KEY\u3002";
  }
  return null;
}
function endpointProblem(raw) {
  const value = raw.trim();
  if (value.length === 0) return "API \u5730\u5740\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u8BF7\u586B\u5199\u4E2D\u7EE7\u7684\u7AEF\u70B9\u3002";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "API \u5730\u5740\u683C\u5F0F\u4E0D\u6B63\u786E\uFF0C\u8BF7\u586B\u5199\u5B8C\u6574 URL\uFF0C\u4F8B\u5982 https://anyrouter.top\u3002";
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return "API \u5730\u5740\u4E0D\u80FD\u5305\u542B\u7528\u6237\u540D\u6216\u5BC6\u7801\u3002";
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    return "API \u5730\u5740\u4E0D\u80FD\u5E26\u67E5\u8BE2\u4E32\u6216\u7247\u6BB5\u3002";
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopbackHost(parsed.hostname))) {
    return "API \u5730\u5740\u5FC5\u987B\u4F7F\u7528 https\uFF08\u53EA\u6709\u672C\u673A loopback \u5730\u5740\u5141\u8BB8 http\uFF09\u3002";
  }
  return null;
}
var SOCKS_PROXY_PROTOCOLS = /* @__PURE__ */ new Set(["socks:", "socks4:", "socks4a:", "socks5:", "socks5h:"]);
function proxyProblem(raw) {
  const value = raw.trim();
  if (value.length === 0) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "\u4EE3\u7406\u5730\u5740\u683C\u5F0F\u4E0D\u6B63\u786E\uFF0C\u8BF7\u586B\u5199\u5B8C\u6574 URL\u3002";
  }
  if (SOCKS_PROXY_PROTOCOLS.has(parsed.protocol)) {
    return "\u4E0D\u652F\u6301 SOCKS \u4EE3\u7406\uFF0C\u8BF7\u6539\u586B\u540C\u4E00\u5BA2\u6237\u7AEF\u7684 HTTP \u4EE3\u7406\u7AEF\u53E3\uFF0C\u4F8B\u5982 http://127.0.0.1:7890\u3002";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "\u4EE3\u7406\u5730\u5740\u5FC5\u987B\u4EE5 http:// \u6216 https:// \u5F00\u5934\u3002";
  }
  return null;
}
function nextProviderId(providers) {
  const taken = new Set(providers.map((provider) => provider.id.trim()));
  for (let index = providers.length + 1; ; index += 1) {
    const candidate = `relay-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
}
function replaceProvider(providers, index, next) {
  return providers.map((provider, position) => position === index ? next : provider);
}
function withProviderModels(providers, index, models) {
  return providers.map((provider, position) => position === index ? { ...provider, models } : provider);
}
function withoutProvider(providers, index) {
  return providers.filter((_provider, position) => position !== index);
}
function providersMatch(stored, expected) {
  if (!Array.isArray(stored) || stored.length !== expected.length) return false;
  return expected.every((provider, index) => {
    const candidate = stored[index];
    if (candidate === void 0 || candidate.id !== provider.id) return false;
    const storedModels = Array.isArray(candidate.models) ? candidate.models : [];
    const expectedModels = provider.models ?? [];
    return storedModels.length === expectedModels.length && expectedModels.every((model, position) => storedModels[position]?.id === model.id);
  });
}
function legacyModelsPending(value) {
  return Array.isArray(value?.models) && value.models.length > 0;
}
async function persistProviders(scope, providers, active = () => true) {
  const accepted = await scope.set("providers", providers);
  if (!active()) throw new Error("\u64CD\u4F5C\u5DF2\u4E2D\u65AD\u3002");
  if (accepted === false) {
    throw new Error("\u63D0\u4F9B\u5546\u914D\u7F6E\u672A\u80FD\u4FDD\u5B58\uFF1AHost \u62D2\u7EDD\u4E86\u5199\u5165\u3002\u5982\u679C\u4F60\u521A\u521A\u66F4\u65B0\u4E86\u63D2\u4EF6\u4EE3\u7801\uFF0C\u8BF7\u5B8C\u5168\u91CD\u542F DeepSeek Harness\uFF08\u5173\u95ED\u684C\u9762\u5BA2\u6237\u7AEF\u5E76\u5728\u6258\u76D8\u56FE\u6807\u53F3\u952E\u9000\u51FA\u540E\u91CD\u65B0\u542F\u52A8\uFF09\uFF0C\u4EE5\u4FBF\u540E\u7AEF\u52A0\u8F7D\u65B0\u7248\u63D2\u4EF6\u914D\u7F6E\u3002");
  }
  if (!providersMatch(scope.getSnapshot().value?.providers, providers)) {
    throw new Error("\u63D0\u4F9B\u5546\u914D\u7F6E\u672A\u80FD\u4FDD\u5B58\uFF1A\u56DE\u8BFB\u6570\u636E\u4E0D\u4E00\u81F4\uFF0C\u8BF7\u91CD\u8BD5\u3002");
  }
  if (!legacyModelsPending(scope.getSnapshot().value)) return;
  const cleared = await scope.set("models", []);
  if (!active()) throw new Error("\u64CD\u4F5C\u5DF2\u4E2D\u65AD\u3002");
  if (cleared === false || legacyModelsPending(scope.getSnapshot().value)) {
    throw new Error("\u65E7\u7248\u6A21\u578B\u5217\u8868\u672A\u80FD\u6E05\u9664\uFF0C\u8BF7\u91CD\u8BD5\u3002");
  }
}
var DEFAULT_UNCHECKED = /* @__PURE__ */ new Set(["gpt-5-codex"]);
function orderedLevels(levels) {
  const selected = new Set(levels);
  return LEVELS.filter((level) => selected.has(level));
}
function referenceRow(id, protocol) {
  const reference = MODEL_PROFILES_BY_ID.get(id);
  const referenceEfforts = orderedLevels(
    (reference?.efforts ?? []).filter((level) => LEVELS.includes(level))
  );
  const efforts = referenceEfforts.length > 0 ? referenceEfforts : [...LEVELS];
  const defaultEffort = efforts.includes("high") ? "high" : efforts[efforts.length - 1];
  return {
    id,
    ...reference?.name === void 0 ? {} : { name: reference.name },
    protocol,
    ...reference?.contextWindow === void 0 ? {} : { contextWindow: reference.contextWindow },
    ...reference?.maxTokens === void 0 ? {} : { maxTokens: reference.maxTokens },
    checked: !DEFAULT_UNCHECKED.has(id),
    reasoningOn: true,
    efforts,
    defaultEffort,
    adaptive: protocol === "claude-code" && (reference?.adaptive ?? true)
  };
}
function rowFromSaved(saved) {
  const base = referenceRow(saved.id, saved.protocol);
  const reasoning = saved.reasoning;
  const savedEfforts = reasoning?.efforts === void 0 ? [] : orderedLevels(reasoning.efforts);
  return {
    ...base,
    ...saved.name === void 0 ? {} : { name: saved.name },
    ...saved.contextWindow === void 0 ? {} : { contextWindow: saved.contextWindow },
    ...saved.maxTokens === void 0 ? {} : { maxTokens: saved.maxTokens },
    checked: true,
    reasoningOn: reasoning?.disabled !== true,
    ...savedEfforts.length > 0 ? { efforts: savedEfforts } : {},
    defaultEffort: reasoning?.defaultEffort !== void 0 && (savedEfforts.length > 0 ? savedEfforts : base.efforts).includes(reasoning.defaultEffort) ? reasoning.defaultEffort : base.defaultEffort,
    adaptive: saved.protocol === "claude-code" ? reasoning?.adaptive ?? base.adaptive : base.adaptive
  };
}
function rowToSaved(row) {
  return {
    id: row.id,
    ...row.name === void 0 ? {} : { name: row.name },
    protocol: row.protocol,
    ...row.contextWindow === void 0 ? {} : { contextWindow: row.contextWindow },
    ...row.maxTokens === void 0 ? {} : { maxTokens: row.maxTokens },
    reasoning: {
      ...!row.reasoningOn ? { disabled: true } : {},
      ...row.reasoningOn && row.efforts.length > 0 ? { efforts: orderedLevels(row.efforts) } : {},
      ...row.reasoningOn && row.defaultEffort !== void 0 && row.efforts.includes(row.defaultEffort) ? { defaultEffort: row.defaultEffort } : {},
      ...row.reasoningOn && row.protocol === "claude-code" ? { adaptive: row.adaptive } : {}
    }
  };
}
var styles = `
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
`;
function LevelChips({ row, onChange }) {
  if (!row.reasoningOn) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, {});
  const toggle = (level) => {
    const next = row.efforts.includes(level) ? row.efforts.filter((candidate) => candidate !== level) : orderedLevels([...row.efforts, level]);
    onChange({
      ...row,
      efforts: next,
      defaultEffort: row.defaultEffort !== void 0 && next.includes(row.defaultEffort) ? row.defaultEffort : next[next.length - 1]
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-levels", "data-testid": "reasoning-editor", children: [
    LEVELS.map((level) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        "data-on": row.efforts.includes(level),
        disabled: !row.checked,
        onClick: () => toggle(level),
        children: level
      },
      level
    )),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
      " \u9ED8\u8BA4 ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "select",
        {
          disabled: !row.checked || row.efforts.length === 0,
          value: row.defaultEffort ?? "",
          onChange: (event) => onChange({
            ...row,
            defaultEffort: event.target.value === "" ? void 0 : event.target.value
          }),
          children: [
            row.defaultEffort === void 0 || !row.efforts.includes(row.defaultEffort) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "" }) : null,
            row.efforts.map((level) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: level, children: level }, level))
          ]
        }
      )
    ] }),
    row.protocol === "claude-code" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "checkbox",
          disabled: !row.checked,
          checked: row.adaptive,
          onChange: (event) => onChange({ ...row, adaptive: event.target.checked })
        }
      ),
      " \u81EA\u9002\u5E94\u601D\u8003"
    ] }) : null
  ] });
}
function Picker({ rows, onChange }) {
  const update = (row) => onChange(rows.map((candidate) => candidate.id === row.id ? row : candidate));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-any-picker", "data-testid": "model-picker", children: rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-row", "data-checked": row.checked, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-row-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { title: row.id, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: row.checked,
            onChange: (event) => update({ ...row, checked: event.target.checked })
          }
        ),
        " ",
        row.name ?? row.id
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-any-badge", children: row.protocol === "claude-code" ? "Claude" : "Codex" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-any-row-meta", children: `${Math.round((row.contextWindow ?? 0) / 1e3)}k ctx \xB7 ${Math.round((row.maxTokens ?? 0) / 1e3)}k out` })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-any-levels", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "checkbox",
          disabled: !row.checked,
          checked: row.reasoningOn,
          onChange: (event) => update({ ...row, reasoningOn: event.target.checked })
        }
      ),
      " \u63A8\u7406"
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LevelChips, { row, onChange: update })
  ] }, row.id)) });
}
function ReasoningSummary({ model }) {
  const reasoning = model.reasoning;
  if (reasoning === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-any-badge", children: "\u63A8\u7406 \xB7 \u53C2\u8003\u9ED8\u8BA4" });
  }
  if (reasoning.disabled === true) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-any-badge", children: "\u65E0\u63A8\u7406" });
  }
  const efforts = reasoning.efforts?.length ? reasoning.efforts.join("/") : "\u53C2\u8003\u9ED8\u8BA4";
  const suffix = reasoning.defaultEffort === void 0 ? "" : ` \xB7 \u9ED8\u8BA4 ${reasoning.defaultEffort}`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-any-badge", children: `\u63A8\u7406 ${efforts}${suffix}` });
}
function Section({ ops, scope, subscribeCredentials }) {
  const snapshot = (0, import_react.useSyncExternalStore)(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot(),
    () => scope.getSnapshot()
  );
  const loading = snapshot.status === "loading";
  const writable = snapshot.status === "ready" && snapshot.writable && snapshot.mode === "host";
  const [state, setState] = (0, import_react.useState)(() => seedSectionState(snapshot.value, 0));
  const [configured, setConfigured] = (0, import_react.useState)({});
  const [apiKey, setApiKey] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [success, setSuccess] = (0, import_react.useState)(null);
  const [credentialRevision, setCredentialRevision] = (0, import_react.useState)(0);
  const [picker, setPicker] = (0, import_react.useState)(null);
  const alive = (0, import_react.useRef)(true);
  const generation = (0, import_react.useRef)(0);
  const activeController = (0, import_react.useRef)(null);
  const seedKey = JSON.stringify({
    providers: snapshot.value?.providers ?? null,
    apiKeyEnv: snapshot.value?.apiKeyEnv ?? null,
    baseURL: snapshot.value?.baseURL ?? null,
    proxy: snapshot.value?.proxy ?? null,
    models: snapshot.value?.models ?? null
  });
  const lastSeedKey = (0, import_react.useRef)(seedKey);
  (0, import_react.useEffect)(() => {
    if (busy) return;
    if (lastSeedKey.current === seedKey) return;
    lastSeedKey.current = seedKey;
    setState((current) => seedSectionState(snapshot.value, current.selected));
  }, [busy, seedKey, snapshot.value]);
  (0, import_react.useEffect)(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current += 1;
      activeController.current?.abort();
    };
  }, []);
  const refreshCredential = (0, import_react.useCallback)((_ref) => setCredentialRevision((value) => value + 1), []);
  (0, import_react.useEffect)(() => subscribeCredentials(refreshCredential), [refreshCredential, subscribeCredentials]);
  const refsKey = (0, import_react.useMemo)(
    () => [...new Set(state.draft.map((provider) => credentialRefFor(provider)))].join("\n"),
    [state.draft]
  );
  (0, import_react.useEffect)(() => {
    let live = true;
    const refs = refsKey.length === 0 ? [] : refsKey.split("\n");
    if (refs.length === 0) {
      setConfigured({});
      return () => {
        live = false;
      };
    }
    void Promise.all(refs.map(async (ref) => {
      try {
        return [ref, await ops.credentialConfigured(ref)];
      } catch (reason) {
        if (live) setError(errorMessage(reason));
        return [ref, false];
      }
    })).then((entries) => {
      if (live) setConfigured(Object.fromEntries(entries));
    });
    return () => {
      live = false;
    };
  }, [ops, credentialRevision, refsKey]);
  const beginOperation = (0, import_react.useCallback)(() => {
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    const token = ++generation.current;
    const active = () => alive.current && generation.current === token && !controller.signal.aborted;
    return { controller, active };
  }, []);
  const selectedProvider = state.selected < 0 ? void 0 : state.draft[state.selected];
  const selectedRef = selectedProvider === void 0 ? "" : credentialRefFor(selectedProvider);
  const selectedConfigured = configured[selectedRef] === true;
  const idProblem = state.form === null ? null : providerIdProblem(state.form.id, state.draft, state.selected);
  const refProblem = state.form === null ? null : credentialRefProblem(state.form.apiKeyEnv);
  const endpointIssue = state.form === null ? null : endpointProblem(state.form.baseURL);
  const proxyIssue = state.form === null ? null : proxyProblem(state.form.proxy);
  const blocked = idProblem !== null || refProblem !== null || endpointIssue !== null || proxyIssue !== null;
  const patchForm = (patch) => {
    setState((current) => {
      if (current.form === null || current.selected < 0) return current;
      const updatedForm = { ...current.form, ...patch };
      const updatedValue = providerValueFrom(updatedForm);
      const updatedDraft = replaceProvider(current.draft, current.selected, updatedValue);
      return {
        ...current,
        draft: updatedDraft,
        form: updatedForm
      };
    });
  };
  const selectProvider = (index) => {
    setState((current) => {
      const provider = current.draft[index];
      return provider === void 0 ? current : { ...current, selected: index, form: providerDraftFrom(provider) };
    });
  };
  const addProvider = () => {
    setState((current) => {
      const id = nextProviderId(current.draft);
      const provider = { id, displayName: id, models: [] };
      const draft = [...current.draft, provider];
      return { draft, selected: draft.length - 1, form: providerDraftFrom(provider) };
    });
    setError(null);
    setSuccess(null);
  };
  const removeProvider = (0, import_react.useCallback)(async (index) => {
    const provider = state.draft[index];
    if (provider === void 0) return;
    const operation = beginOperation();
    setBusy(true);
    setError(null);
    setSuccess(null);
    setState((current) => {
      const draft = withoutProvider(current.draft, index);
      const selected = current.selected === index ? draft.length > 0 ? 0 : -1 : current.selected > index ? current.selected - 1 : current.selected;
      const next = selected < 0 ? void 0 : draft[selected];
      return { draft, selected, form: next === void 0 ? null : providerDraftFrom(next) };
    });
    try {
      await persistProviders(scope, withoutProvider(state.draft, index), operation.active);
      if (!operation.active()) return;
      setPicker(null);
      setSuccess(`\u5DF2\u79FB\u9664\u63D0\u4F9B\u5546 ${provider.id}\u3002`);
    } catch (reason) {
      if (operation.active()) setError(errorMessage(reason));
    } finally {
      if (operation.active()) setBusy(false);
    }
  }, [beginOperation, scope, state.draft]);
  const save = (0, import_react.useCallback)(async () => {
    const form = state.form;
    if (form === null) return;
    const problem = providerIdProblem(form.id, state.draft, state.selected) ?? credentialRefProblem(form.apiKeyEnv) ?? endpointProblem(form.baseURL) ?? proxyProblem(form.proxy);
    if (problem !== null) {
      setError(problem);
      return;
    }
    const operation = beginOperation();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const next = providerValueFrom(form);
      const ref = credentialRefFor(next);
      if (apiKey.trim().length > 0) {
        await ops.storeCredential(ref, apiKey.trim());
        if (!operation.active()) return;
      }
      await persistProviders(scope, replaceProvider(state.draft, state.selected, next), operation.active);
      if (!operation.active()) return;
      setApiKey("");
      setSuccess(`\u63D0\u4F9B\u5546 ${next.id} \u5DF2\u4FDD\u5B58\u3002\u914D\u7F6E\u4E86 API Key \u7684\u63D0\u4F9B\u5546\u4F1A\u51FA\u73B0\u5728\u6A21\u578B\u9009\u62E9\u5668\u3002`);
      refreshCredential(ref);
    } catch (reason) {
      if (operation.active()) setError(errorMessage(reason));
    } finally {
      if (operation.active()) setBusy(false);
    }
  }, [apiKey, beginOperation, ops, refreshCredential, scope, state]);
  const discover = (0, import_react.useCallback)(async () => {
    const form = state.form;
    if (form === null) return;
    const operation = beginOperation();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const next = providerValueFrom(form);
      const ref = credentialRefFor(next);
      if (apiKey.trim().length > 0) {
        await ops.storeCredential(ref, apiKey.trim());
        if (!operation.active()) return;
      }
      await persistProviders(scope, replaceProvider(state.draft, state.selected, next), operation.active);
      const discovered = await ops.discoverModels(next.id, next.baseURL ?? DEFAULT_BASE_URL);
      if (!operation.active()) return;
      const saved = new Map((next.models ?? []).map((model) => [model.id, model]));
      const rows = [];
      for (const row of discovered) {
        const protocol = protocolFor(row.id);
        if (protocol === void 0) continue;
        const existing = saved.get(row.id);
        rows.push(existing !== void 0 ? rowFromSaved({
          ...existing,
          ...typeof row.contextWindow === "number" && existing.contextWindow === void 0 ? { contextWindow: row.contextWindow } : {},
          ...typeof row.maxTokens === "number" && existing.maxTokens === void 0 ? { maxTokens: row.maxTokens } : {}
        }) : {
          ...referenceRow(row.id, protocol),
          ...typeof row.name === "string" && row.name.length > 0 ? { name: row.name } : {},
          ...typeof row.contextWindow === "number" ? { contextWindow: row.contextWindow } : {},
          ...typeof row.maxTokens === "number" ? { maxTokens: row.maxTokens } : {}
        });
      }
      setApiKey("");
      setPicker({ providerIndex: state.selected, rows });
      setSuccess(`\u53D1\u73B0 ${rows.length} \u4E2A Claude / Codex \u6A21\u578B\uFF0C\u52FE\u9009\u540E\u4FDD\u5B58\u6240\u9009\u3002`);
      refreshCredential(ref);
    } catch (reason) {
      if (operation.active()) setError(errorMessage(reason));
    } finally {
      if (operation.active()) setBusy(false);
    }
  }, [apiKey, beginOperation, ops, refreshCredential, scope, state]);
  const saveSelection = (0, import_react.useCallback)(async () => {
    if (picker === null) return;
    const operation = beginOperation();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const base = state.form !== null && picker.providerIndex === state.selected ? replaceProvider(state.draft, state.selected, providerValueFrom(state.form)) : state.draft;
      const nextModels = picker.rows.filter((row) => row.checked).map(rowToSaved);
      await persistProviders(scope, withProviderModels(base, picker.providerIndex, nextModels), operation.active);
      if (!operation.active()) throw new Error("\u64CD\u4F5C\u5DF2\u4E2D\u65AD\u3002");
      setPicker(null);
      setSuccess(`\u5DF2\u4FDD\u5B58 ${nextModels.length} \u4E2A\u6A21\u578B\uFF0C\u542B\u5404\u81EA\u63A8\u7406\u53C2\u6570\u3002`);
    } catch (reason) {
      if (operation.active()) setError(errorMessage(reason));
    } finally {
      if (operation.active()) setBusy(false);
    }
  }, [beginOperation, picker, scope, state]);
  const removeSaved = (0, import_react.useCallback)(async (id) => {
    const form = state.form;
    if (form === null) return;
    const operation = beginOperation();
    setBusy(true);
    setError(null);
    try {
      const current = providerValueFrom(form);
      const nextModels = (current.models ?? []).filter((model) => model.id !== id);
      await persistProviders(
        scope,
        replaceProvider(state.draft, state.selected, { ...current, models: nextModels }),
        operation.active
      );
      if (!operation.active()) throw new Error("\u64CD\u4F5C\u5DF2\u4E2D\u65AD\u3002");
      if (scope.getSnapshot().value?.providers?.[state.selected]?.models?.some((model) => model.id === id)) {
        throw new Error("\u6A21\u578B\u5217\u8868\u672A\u80FD\u4FDD\u5B58\uFF0C\u8BF7\u91CD\u8BD5\u3002");
      }
      setSuccess(`\u5DF2\u79FB\u9664 ${id}\u3002`);
    } catch (reason) {
      if (operation.active()) setError(errorMessage(reason));
    } finally {
      if (operation.active()) setBusy(false);
    }
  }, [beginOperation, scope, state]);
  const savedModels = state.form?.models ?? [];
  const grouped = (0, import_react.useMemo)(() => ({
    claude: savedModels.filter((model) => model.protocol === "claude-code").length,
    codex: savedModels.filter((model) => model.protocol === "codex-responses").length
  }), [savedModels]);
  const pickerProviderId = picker === null ? "" : state.draft[picker.providerIndex]?.id ?? "";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsh-any", "aria-label": "AnyRouter \u8BBE\u7F6E", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "AnyRouter" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u914D\u7F6E\u4EFB\u610F\u6570\u91CF\u7684\u4E2D\u7EE7\uFF08\u63D0\u4F9B\u5546\uFF09\uFF1A\u6BCF\u4E2A\u63D0\u4F9B\u5546\u6709\u81EA\u5DF1\u7684 API Key\u3001\u7AEF\u70B9\u4E0E\u4EE3\u7406\uFF0C\u5E76\u5206\u522B\u540C\u6B65 Claude\uFF08Agent SDK \u517C\u5BB9\u8BF7\u6C42\uFF09\u4E0E GPT/Codex\uFF08Responses\uFF09\u6A21\u578B\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u63D0\u4F9B\u5546" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u6BCF\u4E2A\u63D0\u4F9B\u5546\u662F\u4E00\u6761\u72EC\u7ACB\u8DEF\u7531\uFF1A\u5BC6\u94A5\u3001\u7AEF\u70B9\u3001\u4EE3\u7406\u4E0E\u6A21\u578B\u90FD\u4E92\u4E0D\u5F71\u54CD\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dsh-any-providers", "data-testid": "provider-list", children: state.draft.map((provider, index) => {
        const shown = state.form !== null && index === state.selected ? {
          ...provider,
          id: state.form.id.trim() || provider.id,
          ...state.form.displayName.trim().length === 0 ? {} : { displayName: state.form.displayName.trim() },
          ...state.form.apiKeyEnv.trim().length === 0 ? {} : { apiKeyEnv: state.form.apiKeyEnv.trim() }
        } : provider;
        const ref = credentialRefFor(shown);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              "data-pick": "true",
              "data-selected": index === state.selected,
              disabled: busy,
              onClick: () => selectProvider(index),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-any-dot", "data-ready": configured[ref] === true }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-any-model-name", title: shown.id, children: shown.displayName ?? shown.id }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-any-badge", children: shown.id })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: busy || !writable, onClick: () => removeProvider(index), children: "\u79FB\u9664" })
        ] }, `${provider.id}#${index}`);
      }) }),
      state.draft.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-any-empty", children: "\u8FD8\u6CA1\u6709\u63D0\u4F9B\u5546\u3002\u70B9\u51FB\u300C\u65B0\u589E\u63D0\u4F9B\u5546\u300D\u6DFB\u52A0\u4E00\u4E2A\u4E2D\u7EE7\u3002" }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-any-actions", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: busy || loading || !writable, onClick: addProvider, children: "\u65B0\u589E\u63D0\u4F9B\u5546" }) })
    ] }),
    state.form === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-card", "data-testid": "provider-detail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-any-status", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-any-dot", "data-ready": selectedConfigured }),
        selectedConfigured ? "API Key \u5DF2\u914D\u7F6E\uFF08\u63D0\u4F9B\u65B9\u5DF2\u542F\u7528\uFF09" : "\u672A\u914D\u7F6E API Key\uFF08\u63D0\u4F9B\u65B9\u5DF2\u7981\u7528\uFF0C\u4E0D\u51FA\u73B0\u5728\u6A21\u578B\u9009\u62E9\u5668\uFF09"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "dsh-any-name", children: "\u663E\u793A\u540D\u79F0" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            id: "dsh-any-name",
            type: "text",
            value: state.form.displayName,
            disabled: busy || !writable,
            onChange: (event) => patchForm({ displayName: event.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "dsh-any-id", children: "\u63D0\u4F9B\u5546 ID\uFF08\u8BF7\u6C42\u91CC\u7684 provider \u8DEF\u7531\uFF09" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            id: "dsh-any-id",
            type: "text",
            autoComplete: "off",
            spellCheck: false,
            value: state.form.id,
            disabled: busy || !writable,
            onChange: (event) => patchForm({ id: event.target.value })
          }
        ),
        idProblem === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-any-field-error", role: "alert", children: idProblem })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "dsh-any-keyref", children: "\u51ED\u8BC1\u5F15\u7528\uFF08API Key \u5B58\u653E\u7684\u73AF\u5883\u53D8\u91CF\u540D\uFF09" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            id: "dsh-any-keyref",
            type: "text",
            autoComplete: "off",
            spellCheck: false,
            placeholder: defaultApiKeyEnvFor(state.form.id),
            value: state.form.apiKeyEnv,
            disabled: busy || !writable,
            onChange: (event) => patchForm({ apiKeyEnv: event.target.value })
          }
        ),
        refProblem === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-any-field-error", role: "alert", children: refProblem })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "dsh-any-url", children: "API \u5730\u5740" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            id: "dsh-any-url",
            type: "url",
            placeholder: DEFAULT_BASE_URL,
            value: state.form.baseURL,
            disabled: busy || !writable,
            onChange: (event) => patchForm({ baseURL: event.target.value })
          }
        ),
        endpointIssue === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-any-field-error", role: "alert", children: endpointIssue })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "dsh-any-proxy", children: "\u4EE3\u7406\uFF08\u53EA\u4F5C\u7528\u4E8E\u672C\u63D0\u4F9B\u65B9\uFF0C\u7559\u7A7A\u4E3A\u76F4\u8FDE\uFF09" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            id: "dsh-any-proxy",
            type: "text",
            autoComplete: "off",
            spellCheck: false,
            placeholder: "http://127.0.0.1:7890",
            value: state.form.proxy,
            disabled: busy || !writable,
            onChange: (event) => patchForm({ proxy: event.target.value })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-any-hint", children: "\u53EA\u8BA9\u8FD9\u4E00\u5BB6\u4E2D\u7EE7\u7684\u8BF7\u6C42\u8D70\u8FD9\u4E2A\u4EE3\u7406\uFF0C\u4E0D\u5F71\u54CD\u5176\u5B83\u63D0\u4F9B\u5546\uFF0C\u4E5F\u4E0D\u6539\u52A8 DSH \u7684\u5168\u5C40\u4EE3\u7406\u3002 \u586B http:// \u6216 https:// \u4EE3\u7406\u5730\u5740\uFF08\u9700\u8981\u8BA4\u8BC1\u53EF\u5199\u6210 http://user:pass@host:port\uFF09\uFF1B SOCKS \u4E0D\u652F\u6301\uFF0C\u8BF7\u586B\u540C\u4E00\u5BA2\u6237\u7AEF\u7684 HTTP \u7AEF\u53E3\u3002localhost \u4E0E 127.0.0.1 \u59CB\u7EC8\u76F4\u8FDE\u3002" }),
        proxyIssue === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-any-field-error", role: "alert", children: proxyIssue })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "dsh-any-key", children: "API Key\uFF08\u4EC5\u5199\u5165\uFF0C\u4E0D\u56DE\u663E\uFF09" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            id: "dsh-any-key",
            type: "password",
            autoComplete: "off",
            placeholder: selectedConfigured ? "\u8F93\u5165\u65B0 Key \u4EE5\u66FF\u6362" : "sk-\u2026",
            value: apiKey,
            disabled: busy || !writable,
            onChange: (event) => setApiKey(event.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-any-hint", children: "\u8BF7\u6C42\u5934\u4E0E CLI \u7248\u672C\u7531\u63D2\u4EF6\u81EA\u5DF1\u7EF4\u62A4\uFF0C\u8BBE\u7F6E\u9875\u4E0D\u63D0\u4F9B\u8986\u76D6\u9879\uFF1A\u63D2\u4EF6\u59CB\u7EC8\u6309\u5F53\u524D Claude Code / Codex CLI \u7684\u5B8C\u6574\u8BF7\u6C42\u5934\u53D1\u9001\uFF0C\u4EE5\u786E\u4FDD\u6A21\u62DF\u6307\u7EB9\u4E0E\u5B98\u65B9\u5BA2\u6237\u7AEF\u4E00\u81F4\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            disabled: busy || loading || !writable || blocked || apiKey.trim().length === 0 && !selectedConfigured,
            onClick: save,
            children: "\u4FDD\u5B58\u914D\u7F6E"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "data-primary": "true",
            disabled: busy || loading || !writable || blocked || apiKey.trim().length === 0 && !selectedConfigured,
            onClick: discover,
            children: busy ? "\u5904\u7406\u4E2D\u2026" : "\u540C\u6B65\u6A21\u578B"
          }
        )
      ] }),
      snapshot.status === "unavailable" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-any-error", role: "alert", children: "\u5F53\u524D\u8FDE\u63A5\u4E0D\u80FD\u4FEE\u6539\u8BBE\u7F6E\uFF0C\u8BF7\u5728\u672C\u673A Web \u9875\u9762\u64CD\u4F5C\u3002" }) : null,
      error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-any-error", role: "alert", children: error }),
      success === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-any-success", role: "status", children: success })
    ] }),
    picker === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: `\u4E3A ${pickerProviderId} \u9009\u62E9\u7EB3\u5165\u6A21\u578B\u9009\u62E9\u5668\u7684\u6A21\u578B` }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u52FE\u9009\u6A21\u578B\u3001\u8C03\u6574\u63A8\u7406\u6863\u4F4D\u4E0E\u9ED8\u8BA4\u529B\u5EA6\uFF0C\u7136\u540E\u4FDD\u5B58\u6240\u9009\u3002gpt-5-codex \u9ED8\u8BA4\u4E0D\u52FE\u9009\uFF08Responses \u7AEF\u70B9\u4E0D\u652F\u6301\uFF09\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Picker, { rows: picker.rows, onChange: (rows) => setPicker((current) => current === null ? current : { ...current, rows }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            disabled: busy,
            onClick: () => setPicker((current) => current === null ? current : { ...current, rows: current.rows.map((row) => ({ ...row, checked: true })) }),
            children: "\u5168\u9009"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            disabled: busy,
            onClick: () => setPicker((current) => current === null ? current : { ...current, rows: current.rows.map((row) => ({ ...row, checked: false })) }),
            children: "\u5168\u4E0D\u9009"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "data-primary": "true", disabled: busy, onClick: saveSelection, children: "\u4FDD\u5B58\u6240\u9009" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: busy, onClick: () => setPicker(null), children: "\u53D6\u6D88" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-any-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u5DF2\u4FDD\u5B58\u6A21\u578B" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: selectedProvider === void 0 ? "\u5C1A\u672A\u9009\u62E9\u63D0\u4F9B\u5546\u3002" : savedModels.length === 0 ? `${selectedProvider.id} \u5C1A\u672A\u4FDD\u5B58\u6A21\u578B\u3002` : `${selectedProvider.id}\uFF1AClaude ${grouped.claude} \u4E2A\uFF0CCodex ${grouped.codex} \u4E2A\u3002` }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dsh-any-models", children: savedModels.map((model) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-any-model-name", title: model.id, children: model.name ?? model.id }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReasoningSummary, { model }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: busy || !writable, onClick: () => removeSaved(model.id), children: "\u79FB\u9664" })
      ] }, model.id)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-any-empty", children: "\u6A21\u578B\u5217\u8868\u662F\u5EFA\u8BAE\u6027\u7684\uFF1A\u4E0A\u6E38\u901A\u9053\u4E0D\u53EF\u7528\u6216\u6EE1\u8F7D\u65F6\uFF0C\u8BF7\u6C42\u4ECD\u53EF\u80FD\u5931\u8D25\uFF08429/500\uFF09\u3002" })
    ] })
  ] });
}
var inject = ["slots", "remote", "remote.credentials", "remote.llm", "configForms"];
var SUPPORTED_HOST = "@deepseek-ai/dsh-web-app ^0.2.0-rc.2";
function createOperations(ctx) {
  const remote = ctx.remote;
  if (remote?.credentials?.describe === void 0 || remote?.llm?.discoverModels === void 0) {
    throw new Error(
      `dsh-anyrouter: this DSH build exposes no remote.credentials/remote.llm namespaces. Supported: ${SUPPORTED_HOST}. Upgrade DSH, or install a dsh-anyrouter release matching your Host.`
    );
  }
  return {
    credentialConfigured: async (ref) => {
      const value = unwrapRemote(
        await remote.credentials.describe([ref])
      );
      return value?.[ref]?.configured === true;
    },
    storeCredential: async (ref, value) => {
      unwrapRemote(await remote.credentials.set(ref, value));
    },
    discoverModels: async (providerId, baseURL) => {
      const value = unwrapRemote(await remote.llm.discoverModels(SETTINGS_NS, {
        provider: providerId,
        baseURL
      }));
      const models = Array.isArray(value) ? value : value?.models;
      return Array.isArray(models) ? models : [];
    }
  };
}
function createScope(form) {
  return {
    getSnapshot: () => form.getSnapshot(),
    subscribe: (listener) => form.subscribe(listener),
    set: (field, value) => form.set(field, value)
  };
}
function apply(ctx) {
  const ops = createOperations(ctx);
  const scope = createScope(ctx.configForms.get(SETTINGS_NS));
  const subscribeCredentials = (refresh) => {
    const disposers = [];
    try {
      disposers.push(ctx.remote.$on(
        "credentials/reference-updated",
        (ref) => refresh(ref ?? "")
      ));
    } catch {
    }
    try {
      disposers.push(ctx.on("connection/reset", () => refresh("")));
    } catch {
    }
    return () => {
      for (const dispose of disposers) dispose();
    };
  };
  ctx.effect(() => {
    const element = document.createElement("style");
    element.dataset.plugin = "dsh-anyrouter";
    element.textContent = styles;
    document.head.appendChild(element);
    return () => element.remove();
  }, "dsh-anyrouter: settings styles");
  const install = () => ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: PROVIDER,
    order: 11,
    label: () => "AnyRouter",
    inject: () => ({ ops, scope, subscribeCredentials })
  }, Section));
  ctx.effect(
    () => ctx.configForms.whileServed([SETTINGS_NS], install),
    "dsh-anyrouter: settings section"
  );
}
return module.exports;}});
//# sourceMappingURL=client.js.map
