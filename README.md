# dsh-anyrouter

A dedicated [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) provider bundle for [Any Router](https://anyrouter.top) — Claude via a Claude Code compatible transport, GPT/Codex via the Responses API.

## Install (fixed release tag, no arguments)

```bash
npx --yes github:1264459640/dsh-anyrouter#v0.4.0
```

The installer defaults to the `web` profile, pins the exact release tag, edits only `dependencies.dsh-anyrouter` and `dsh.profile.bundles` in the profile `package.json`, runs `pnpm install --ignore-scripts` there, and never stops or restarts DSH. Restart DSH manually afterwards and hard-refresh the Web page.

Other commands:

```bash
npx --yes github:1264459640/dsh-anyrouter#v0.4.0 status                    # is it installed?
npx --yes github:1264459640/dsh-anyrouter#v0.4.0 uninstall                 # idempotent removal
npx --yes github:1264459640/dsh-anyrouter#v0.4.0 --profile headless        # another profile
DSH_ANYROUTER_SOURCE=link:/path/to/checkout npx --yes github:1264459640/dsh-anyrouter#v0.4.0   # local source override
```

## Compatibility

| DSH version | Status |
|---|---|
| `0.2.0-rc.2` (CLI with Web/Settings/LLM `0.2.0-rc.2`) | **Adapted and repository-verified; live install not yet exercised.** `v0.4.0` targets the DSH `0.2.0` line and declares it as a peer **range** (`^0.2.0-rc.2`) instead of an exact pin, which is the point of the release: DSH's own `evaluatePluginCompatibility` hands the peer string to `semver.satisfies`, so an exact pin admits exactly one DSH build and rejects every other — that is how the `0.2.0-rc.1` build came to reject `0.2.0-rc.2`. The floor is `rc.2` rather than `rc.1` because `@deepseek-ai/dsh-llm-pi-ai` moved its `@earendil-works/pi-ai` dependency from `^0.85.1` to `^0.87.1` between those builds and this bundle imports pi-ai directly (`createProvider`, `Provider`, `pi-ai/api/*` stream internals), so one build can only ever link one pi-ai generation. The upgrade is therefore a migration rather than a pin bump: pi-ai 0.87 branded its provider-facing context, so the transports no longer read `context.systemPrompt` / `context.tools` — `normalizeContext` folds both into a leading system message — and replay the transcript instead; `@anthropic-ai/sdk` moved `0.123.0` -> `0.124.0` to stay in step with pi-ai; and `src/model-profiles.generated.ts` was regenerated from pi-ai's new builtin catalog, which changes reasoning levels, capacity and compat flags for the models the relay advertises (itemized under "Upgrade from 0.3.4"). `pnpm run check` (typecheck -> build -> vitest -> `node:test` installer suites -> the host-lifecycle harness against the real `0.2.0-rc.2` runtime) passes — but no live `0.2.0-rc.2` profile install and no real relay request has been exercised yet. |
| `0.2.0-rc.1` | **Superseded by `v0.4.0`; NOT supported by it.** Retargeting to this build changed only the `@deepseek-ai/dsh-*` pins — diffing the complete installed `0.1.7-rc.2` and `0.2.0-rc.1` trees across all 21 packages showed 0 files removed, 0 files added and 0 `.d.ts` identifiers lost, the only behavioural change being an additive `productAnalytics` remote descriptor in `@deepseek-ai/dsh-api-remotes`. It is nevertheless incompatible with `v0.4.0`, because `rc.2` moved the pi-ai generation this bundle is compiled against. Pair `v0.4.0` only with `0.2.0-rc.2` or a later build inside the declared range. |
| `0.1.7-rc.2` (CLI with Web/Settings/LLM `0.1.7-rc.2`) | **Verified with `v0.3.4`** (the repository suite against the real `0.1.7-rc.2` runtime; no live install exercised) — the previous target, superseded by `v0.4.0` above. `v0.3.4` moved the settings namespace to the plugin's own profile entry id `dsh-anyrouter` (a namespace is now "nominal id of one profile plugin entry", and the plugin's schemastery `Config` is the rendered/persisted form), moved the browser client to `ctx.configForms.get('dsh-anyrouter')` instead of the removed `settingsScope`, and set the peer matrix to this line (cordis `4.0.4`, schemastery `3.18.4`, pi-ai `0.85.1`). |
| `0.1.5-rc.1` CLI with Web/LLM `0.1.5-rc.1` | **Verified with `v0.3.3`** (boot + model catalog + settings section) — the previous target. `v0.3.3` supplies the profile's `modelErrors` map that `@deepseek-ai/dsh-llm-pi-ai@0.1.5-rc.1` dereferences before every request and catalog projection; `v0.3.2` fails the whole `anyrouter` group there with `Cannot read properties of undefined (reading 'get')`. |
| `0.1.2-alpha.3` CLI with Web/Settings `0.1.2-rc.1` | **Verified with `v0.3.2`** (boot + settings section). `v0.3.2` probes settings APIs instead of importing the removed `deepEqualJson` / `installSettingsSection` / `settingsNamespace`. |
| `0.1.2-alpha.3` homogeneous (settings `0.1.1-rc.2`) | **Verified with the legacy-settings-helper path** (legacy settings helpers still work) |
| `0.1.1-rc.2` and earlier | **Unsupported**: those Clients carried credentials and model discovery on `connection.api`, which `0.1.2-alpha.3` removed in favour of `ctx.remote.credentials` / `ctx.remote.llm`. Use `v0.2.3` instead |
| Anything else | Unknown, not verified |

Where a row names a plugin release, that is the release verified on that DSH. `v0.4.0` moves the `@deepseek-ai/dsh-*` peer matrix to the `0.2.0` line as a **range** and migrates the transports to pi-ai 0.87; the settings-namespace and browser-client seams established in `v0.3.4` carry over unchanged. On a DSH outside the declared peer range — including `0.2.0-rc.1` — pin the plugin version named in that row rather than `v0.4.0`.

The client plugin probes `remote.credentials` / `remote.llm` at activation and fails loudly when either is missing, naming the supported range — it never degrades into a silently blank panel.

If a legacy generic `llm-pi-ai.providers` profile still points at this relay, remove it — the dedicated route owns the request identity.

## Features

- **Many relays, each self-contained.** The configuration is a `providers` list: every relay owns its own id, display name, endpoint, credential reference, proxy and model list, and none of them affects another. The settings section offers **新增提供商** / **移除** and edits one relay at a time.
- **Key-gated route, per relay.** Each `providers` entry registers its route only while ITS credential reference resolves (or the launch environment when no credentials service is installed). A relay without a key goes dormant on its own — the model selector drops that one group while the others keep serving — and it returns without a restart once the key is stored again.
- **Per-provider proxy.** Each relay's `proxy` tunnels ONLY that relay's outbound requests — model discovery, the Claude Code transport and the Codex Responses transport. Everything else the harness sends keeps its own route. Empty is the default and connects directly, and two relays may tunnel through different proxies.
- **Identity the plugin owns, not the user.** The CLI versions and the entire request-header set are maintained by the bundle, and the settings section offers no override. See the section below for why.
- **Full model profiles, not bare ids.** Synchronizing a model persists its reasoning parameters — selectable efforts, default effort, adaptive-thinking flag — plus context/output capacities. The model selector and the reasoning selector therefore work for every synchronized model, and every value is user-editable in the picker.
- **Choose which models to include.** **同步模型** lists every Claude/GPT model the relay advertises as a checkbox picker; adopt a subset and edit each row's reasoning profile before saving. `gpt-5-codex` starts unchecked because the relay's Responses endpoint rejects it (`404 当前 API 不支持所选模型`, verified 2026-08-31).
- **Claude Code request identity.** Claude models ride a Claude Code 2.1.286-compatible Anthropic Messages transport: the beta header/query set, Agent SDK identity blocks, session metadata shape, adaptive thinking, context management, and canonical Claude Code tool names.
- **Codex Responses, not Chat Completions.** GPT models ride `POST /v1/responses` with the Codex CLI 0.159.3 request shape (`store: false`, `include reasoning.encrypted_content`, `originator`/`session-id`/`thread-id` headers).
- Reasoning efforts flow through the normal DSH reasoning selector. Each relay's API key is stored under its own credential reference; the browser can write or replace it but never reads it back.

## Request headers and CLI versions: owned by the plugin

**Why there is no setting for it.** A version string changes only the CLAIM in `user-agent`, never the request shape. Letting a user pick one therefore permits asserting a generation whose shape nobody matches: raising the number while the beta set and fields stay on the old generation makes the claimed identity less true, not more. Both values belong to the bundle, and moving them is a source change reviewed alongside the shape — not a settings edit.

**What the plugin sends.** Each identity's complete request-header set is defined in one place (`src/transports/headers.ts`), and it was read off the official clients themselves rather than guessed:

| | Claude Code 2.1.286 | Codex CLI 0.159.3 |
|---|---|---|
| Evidence | the native binary inside `@anthropic-ai/claude-code-win32-x64`, searched for its header literals | the `codex.exe` binary plus the public Rust source (`codex-api/src/requests/headers.rs`, `core/src/client.rs`) |
| Identity | `user-agent: claude-cli/2.1.286 (external, sdk-cli)`, `x-app: cli`, `anthropic-version`, `anthropic-beta`, `anthropic-dangerous-direct-browser-access`, `x-claude-code-session-id`, `x-client-request-id` | `originator: codex_cli_rs`, `user-agent: codex_cli_rs/0.159.3 (<os>; <arch>)`, `session-id`, `thread-id`, `x-client-request-id`, `x-codex-installation-id` |
| Transport | `accept`, `content-type` | `accept: text/event-stream`, `content-type` |
| Deliberately NOT sent | — | `OpenAI-Beta: responses=experimental` |

**About `OpenAI-Beta`.** This transport used to send `responses=experimental`, the gate the Responses API required while it was experimental. That value is now absent from `codex.exe` entirely — the client's only `OpenAI-Beta` is `responses_websockets=2026-02-06` on its WebSocket handshake, which this SSE transport does not perform. Keeping it would assert a client generation that no longer exists, so it is gone.

**About `X-Stainless-*`.** The Claude Code binary does carry the whole `X-Stainless-*` family (Lang / Package-Version / OS / Arch / Runtime / Runtime-Version / Retry-Count / Timeout) plus `x-stainless-helper-method`. Those describe the Stainless-generated client library itself, and the Anthropic SDK fills them in truthfully for the SDK this bundle actually links, so they are not restated here — hard-coding them would only pin a package version that moves with every dependency bump.

**A pin goes stale, so drift is checked:**

```bash
node scripts/check-cli-versions.mjs          # compare against npm latest; exit 1 when behind
node scripts/check-cli-versions.mjs --quiet  # exit code only
```

It is deliberately **not** wired into `pnpm run check`: a normal build and test run must not depend on a network round trip to a third-party registry, and a registry outage must never look like a code failure. Exit codes: 0 = every pin is current, 1 = at least one is behind, 2 = the registry was unreachable, so nothing was proven.

## Multiple providers

One relay is one entry in the `providers` list. **新增提供商** generates a collision-free id (such as `relay-2`, which you can rename) and derives that relay's default credential reference from it — every id except the migrated `anyrouter` uses `<ID with non-alphanumerics folded to _>_API_KEY`, so two relays can never share, and therefore never overwrite, one stored key.

Identifier rules: `id` is lowercase alphanumerics plus `.` `_` `-`, and it IS the pi-ai route name — do not reuse a name another plugin already owns (say `openai`), or that route's registration is refused and reported in the log. `baseURL` must be https (http only for loopback) and must carry no user information, query or fragment; the proxy accepts only `http://` or `https://`.

These are the configurable fields. `streamIdleTimeoutMs` and `retryPolicy` are section-wide with a per-relay override (no settings UI yet; carried through untouched):

| Field | Effect |
|---|---|
| `id` / `displayName` | Route name and label |
| `apiKeyEnv` | That relay's credential reference (derived from the id when blank) |
| `baseURL` / `proxy` | Endpoint and that relay's own proxy |
| `models` | The models synchronized for that relay, with their reasoning profiles |
| `streamIdleTimeoutMs` / `retryPolicy` | Optional overrides of the section-wide defaults |

### A half-filled provider is a survivable state

**A relay with no endpoint, a mistyped proxy, or a malformed credential reference is DISABLED — it never makes the configuration itself an error.**

Disabled means: it stays in the provider list (still editable, still carrying the reason), but registers no route, contributes nothing to the model selector, and leaves every other relay untouched. The log names which relay and why.

That design was forced by a real failure. The settings section writes a LIVE configuration, so "just pressed 新增提供商, has not typed an endpoint yet" is a state resolution is guaranteed to see. It used to throw — and because the write itself is schema-valid (the schema does not check endpoints), the throw landed on the NEXT resolve. At a DSH restart there is no last-good configuration to absorb it, so the plugin failed to load entirely, which reads to the user as "my configuration was wiped". Resolution is now TOTAL over anything a user can express: it degrades instead of throwing.

Model rows are repaired the same way rather than being fatal: a duplicated row is skipped and reported, an unusable capacity falls back to the reference profile, and neither takes the relay offline.

The settings section runs the same checks BEFORE writing and disables the save buttons with the reason shown inline, so a configuration that would be disabled is never persisted in the first place.

## Upgrade from 0.4.0

- **The configuration is fully backwards compatible.** A stored config has no `providers` field, only the flat `baseURL` / `proxy` / `apiKeyEnv` / `models`. It is read as ONE relay with id `anyrouter`, keeping its endpoint, proxy, credential reference, model list, timeout and retry policy, and the key already in the credentials service still resolves. The settings section shows exactly that one relay, and saving rewrites it into the `providers` shape and retires the legacy model list (`models: []`), so the migrated values cannot resurrect later.
- **`providers: []` is authoritative for "no relays at all"**, the opposite of an absent field, so it is never reinterpreted as the legacy shape. Removing the last relay drops every model this bundle contributed from the selector; **新增提供商** adds one back at any time.
- **`apiKeyEnv` is no longer locked to `ANYROUTER_API_KEY`.** That lock is what made independent per-relay gating impossible. The migrated `anyrouter` entry still defaults to `ANYROUTER_API_KEY`.

## Configuration

Persisted as the `config` of the `dsh-anyrouter` profile plugin entry in the active profile patch (`$DSH_HOME/profiles/<profile>/cordis.patch.yml`). Since 0.1.7-rc.2 a settings namespace is the nominal id of one profile plugin entry, and the plugin's own schemastery `Config` is exactly what the settings form renders and writes back — so the section key is the profile entry id `dsh-anyrouter`, not a separate settings namespace:

```yaml
- id: dsh-anyrouter
  name: dsh-anyrouter
  config:
    providers:
      - id: anyrouter               # route name, and the key in the settings section
        displayName: AnyRouter
        baseURL: https://anyrouter.top
        apiKeyEnv: ANYROUTER_API_KEY # each relay owns its own reference
        proxy: ''                   # proxy for THIS relay; empty means direct
        models:
          - id: claude-opus-5
            protocol: claude-code
            contextWindow: 1000000
            maxTokens: 128000
            reasoning:
              efforts: [off, minimal, low, medium, high, xhigh, max]
              defaultEffort: high
              adaptive: true        # Claude only: adaptive effort instead of a thinking budget
          - id: gpt-5.6-sol
            protocol: codex-responses
            reasoning:
              efforts: [off, low, medium, high]
              defaultEffort: high
        # the models synchronized for this relay; headers and CLI versions are NOT config
      - id: my-relay
        displayName: My Relay
        baseURL: https://relay.example.com
        apiKeyEnv: MY_RELAY_API_KEY
        models:
          - id: claude-opus-5
            protocol: claude-code
    # section-wide defaults, used by any relay that does not override them
    streamIdleTimeoutMs: 300000
    retryPolicy:
      mode: normal
      maxRetries: 5
```

A relay that omits `streamIdleTimeoutMs` or `retryPolicy` inherits the section-wide value. An absent `reasoning` block falls back to the build-time reference profile generated from pi-ai's catalog (`src/model-profiles.generated.ts`); `disabled: true` offers the model without a reasoning control. The API key itself lives in the credentials service (or the launch environment), never in this config.

### Proxying only one provider

Each relay's `proxy` takes an `http://` or `https://` proxy URL and applies it to THAT relay alone, per request, through `RequestInit`'s `dispatcher`. It deliberately never touches `undici`'s global dispatcher, so no other provider, the Web UI, or anything else the harness sends is affected. Leave it empty to connect directly; two relays may tunnel through different proxies.

This is not the same setting as the harness's process-wide proxy, which the launcher installs from `http_proxy` / `https_proxy` / `all_proxy` before any plugin mounts and which already covers every provider. Reach for `proxy` when only AnyRouter has to be tunnelled — a blocked or region-restricted relay, for example — and for the environment variables when everything must be.

- **Credentials are allowed here**: `http://user:pass@host:port` is accepted, and every diagnostic reports the URL with its user information masked.
- **SOCKS is refused**, with a message naming it as unsupported rather than malformed. Point the field at the same client's HTTP proxy port (a Clash mixed port at `http://127.0.0.1:7890`, for instance).
- **Loopback is always direct**, including the whole `127.0.0.0/8` block, so a locally hosted relay keeps working once a proxy is configured.
- **It is saved before it is used.** Pressing **同步模型** writes the proxy field first, because the Host's `remote.llm.discoverModels` call carries a draft endpoint but has no field for a draft proxy. A saved edit applies to the next request without a restart.

## Upgrade from 0.3.4

- `v0.4.0` retargets the plugin from the DSH `0.2.0-rc.1` build to the `0.2.0` line, and fixes the compatibility bug that made the earlier `v0.4.0` draft unusable on `0.2.0-rc.2`. The `@deepseek-ai/dsh-*` **peer** specifiers become the range `^0.2.0-rc.2` (they were exact pins, and DSH evaluates peers with `semver.satisfies`, so an exact pin rejects every build but one), while **dev** dependencies stay pinned to the exact `0.2.0-rc.2` this release is verified against.
- The upgrade is not a no-op for the model table. `@earendil-works/pi-ai` moved `^0.85.1` -> `^0.87.1` and `@anthropic-ai/sdk` moved `0.123.0` -> `0.124.0` to stay in step with `@deepseek-ai/dsh-llm-pi-ai`; pi-ai 0.87 branded the provider-facing context, so the transports now replay the transcript instead of reading `context.systemPrompt` / `context.tools`; and `src/model-profiles.generated.ts` was regenerated from pi-ai's new builtin catalog. For any model the relay advertises whose id is in that table, the regeneration **changes visible behaviour**: `gpt-5.4` and `gpt-5.4-mini` no longer offer the `minimal` reasoning level (pi-ai dropped it upstream), `gpt-5.4-mini` reports a 400000-token context window instead of 272000, and 12 existing models gain mid-conversation-system-message and/or tool-change compat flags that change how their requests are shaped. Four ids are newly listed (`claude-opus-5-5`, `claude-opus-5.5`, `gpt-6-luna`, `gpt-6-sol`) but stay unrouted until the relay advertises them.
- Everything you configured carries over unchanged: the `dsh-anyrouter` profile entry, its `config` (`baseURL`, `proxy`, the synchronized model list and each model's reasoning profile) and the API key in the credentials store.

## Upgrade from 0.3.3

- A legacy `llm-anyrouter:` section in the removed `settings.yaml` is no longer read, and it is **not** migrated onto the `dsh-anyrouter` entry. Since 0.1.7-rc.2 the settings document is the profile patch and a namespace is a profile entry id; the one-time importer only remaps the legacy section ids it knows explicitly (`ui-developer-tools`, `ui-onboarding`, `shell`). An `llm-anyrouter:` section therefore fails to import with `No configurable plugin entry "llm-anyrouter"`, is logged as a warning, and survives only in the renamed `settings.yaml.imported`.
- Your synchronized model list and `baseURL` do not carry over. Open **Settings → AnyRouter** once and run **同步模型** (Sync models) to rebuild the list, then re-check each row's reasoning profile.
- Your API key does survive: it lives in the credentials service under `ANYROUTER_API_KEY` (or the launch environment), not in that section.
- Nothing else changes: install as usual, restart DSH, and hard-refresh the Web page.

## The model list is advisory

A synchronized model can still answer `429`/`500` when the relay has no healthy upstream channel or is at capacity — synchronization deliberately makes no paid probe calls per model. Errors name the model and status; retry later.

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run test        # vitest + node:test installer suites
pnpm run build       # host bundle + browser client
pnpm run check       # everything above + install.js syntax check
node scripts/generate-model-profiles.mjs   # regenerate after a pi-ai bump; commit the diff
node scripts/check-cli-versions.mjs        # are the Claude Code / Codex CLI pins behind? (exit 1 = yes)
```

Local development against a running profile:

```bash
DSH_ANYROUTER_SOURCE=link:/absolute/path/to/checkout npx --yes github:1264459640/dsh-anyrouter#v0.4.0
```

Live endpoint verification is environment-gated and makes real requests only when `ANYROUTER_LIVE_KEY` is exported:

```bash
ANYROUTER_LIVE_KEY=sk-… pnpm vitest run tests/live.spec.ts
```

Manual fallback (not the preferred path): add the dependency and the `dsh.profile.bundles` entry to the profile `package.json` yourself, then run `pnpm install --ignore-scripts` in the profile directory.

## License

MIT
