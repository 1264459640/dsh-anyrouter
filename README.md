# dsh-anyrouter

A dedicated [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) provider bundle for [Any Router](https://anyrouter.top) — Claude via a Claude Code compatible transport, GPT/Codex via the Responses API.

## Install (fixed release tag, no arguments)

```bash
npx --yes github:shaomingbo/dsh-anyrouter#v0.3.4
```

The installer defaults to the `web` profile, pins the exact release tag, edits only `dependencies.dsh-anyrouter` and `dsh.profile.bundles` in the profile `package.json`, runs `pnpm install --ignore-scripts` there, and never stops or restarts DSH. Restart DSH manually afterwards and hard-refresh the Web page.

Other commands:

```bash
npx --yes github:shaomingbo/dsh-anyrouter#v0.3.4 status                    # is it installed?
npx --yes github:shaomingbo/dsh-anyrouter#v0.3.4 uninstall                 # idempotent removal
npx --yes github:shaomingbo/dsh-anyrouter#v0.3.4 --profile headless        # another profile
DSH_ANYROUTER_SOURCE=link:/path/to/checkout npx --yes github:shaomingbo/dsh-anyrouter#v0.3.4   # local source override
```

## Compatibility

| DSH version | Status |
|---|---|
| `0.1.7-rc.2` (CLI with Web/Settings/LLM `0.1.7-rc.2`) | **Adapted and repository-verified; live install not yet exercised.** `v0.3.4` retargets the plugin at the current line: the settings namespace is the plugin's own profile entry id `dsh-anyrouter` (a namespace is now "nominal id of one profile plugin entry", and the plugin's schemastery `Config` is the rendered/persisted form), the browser client reads that namespace through `ctx.configForms.get('dsh-anyrouter')` instead of the removed `settingsScope`, and the peer matrix moves to the 0.1.7-rc.2 line (cordis `4.0.4`, schemastery `3.18.4`, pi-ai `0.85.1`; the exact ranges are declared in `package.json`). `pnpm run check` (typecheck → build → vitest → `node:test` installer suites → the host-lifecycle harness against the real 0.1.7-rc.2 runtime) passes, and the built `lib/` carries the new namespace — but no live 0.1.7-rc.2 profile install and no real relay request has been exercised yet, so this row is not the same assurance as the `v0.3.3` row below. |
| `0.1.5-rc.1` CLI with Web/LLM `0.1.5-rc.1` | **Verified with `v0.3.3`** (boot + model catalog + settings section) — the previous target. `v0.3.3` supplies the profile's `modelErrors` map that `@deepseek-ai/dsh-llm-pi-ai@0.1.5-rc.1` dereferences before every request and catalog projection; `v0.3.2` fails the whole `anyrouter` group there with `Cannot read properties of undefined (reading 'get')`. |
| `0.1.2-alpha.3` CLI with Web/Settings `0.1.2-rc.1` | **Verified with `v0.3.2`** (boot + settings section). `v0.3.2` probes settings APIs instead of importing the removed `deepEqualJson` / `installSettingsSection` / `settingsNamespace`. |
| `0.1.2-alpha.3` homogeneous (settings `0.1.1-rc.2`) | **Verified with the legacy-settings-helper path** (legacy settings helpers still work) |
| `0.1.1-rc.2` and earlier | **Unsupported**: those Clients carried credentials and model discovery on `connection.api`, which `0.1.2-alpha.3` removed in favour of `ctx.remote.credentials` / `ctx.remote.llm`. Use `v0.2.3` instead |
| Anything else | Unknown, not verified |

Where a row names a plugin release, that is the release verified on that DSH. This release retargets the settings namespace and the browser-client seam at `0.1.7-rc.2`; on a legacy DSH, pin the plugin version named in that row rather than `v0.3.4`.

The client plugin probes `remote.credentials` / `remote.llm` at activation and fails loudly when either is missing, naming the supported range — it never degrades into a silently blank panel.

If a legacy generic `llm-pi-ai.providers` profile still points at this relay, remove it — the dedicated route owns the request identity.

## Features

- **Key-gated route.** The `anyrouter` provider route is registered only while an API key exists (credentials reference `ANYROUTER_API_KEY`, or the launch environment when no credentials service is installed). Without a key the provider goes dormant — the model selector drops the whole group — and it returns without a restart once the key is stored again.
- **Per-route proxy.** `proxy` tunnels ONLY this provider's outbound requests — model discovery, the Claude Code transport and the Codex Responses transport. Everything else the harness sends keeps its own route. Empty is the default and connects directly.
- **Full model profiles, not bare ids.** Synchronizing a model persists its reasoning parameters — selectable efforts, default effort, adaptive-thinking flag — plus context/output capacities. The model selector and the reasoning selector therefore work for every synchronized model, and every value is user-editable in the picker.
- **Choose which models to include.** **同步模型** lists every Claude/GPT model the relay advertises as a checkbox picker; adopt a subset and edit each row's reasoning profile before saving. `gpt-5-codex` starts unchecked because the relay's Responses endpoint rejects it (`404 当前 API 不支持所选模型`, verified 2026-08-31).
- **Claude Code request identity.** Claude models ride a Claude Code 2.1.239-compatible Anthropic Messages transport: the beta header/query set, Agent SDK identity blocks, session metadata shape, adaptive thinking, context management, and canonical Claude Code tool names.
- **Codex Responses, not Chat Completions.** GPT models ride `POST /v1/responses` with the Codex CLI request shape (`store: false`, `include reasoning.encrypted_content`, codex user agent).
- Reasoning efforts flow through the normal DSH reasoning selector. The API key is stored under the dedicated credential reference; the browser can write or replace it but never reads it back.

## Configuration

Persisted as the `config` of the `dsh-anyrouter` profile plugin entry in the active profile patch (`$DSH_HOME/profiles/<profile>/cordis.patch.yml`). On 0.1.7-rc.2 a settings namespace is the nominal id of one profile plugin entry, and the plugin's own schemastery `Config` is exactly what the settings form renders and writes back — so the section key is the profile entry id `dsh-anyrouter`, not a separate settings namespace:

```yaml
- id: dsh-anyrouter
  name: dsh-anyrouter
  config:
    baseURL: https://anyrouter.top
    proxy: ''                      # per-route proxy; empty means direct
    models:
      - id: claude-opus-5
        protocol: claude-code
        contextWindow: 1000000
        maxTokens: 128000
        reasoning:
          efforts: [off, minimal, low, medium, high, xhigh, max]
          defaultEffort: high
          adaptive: true          # Claude only: adaptive effort instead of a thinking budget
      - id: gpt-5.6-sol
        protocol: codex-responses
        reasoning:
          efforts: [off, low, medium, high]
          defaultEffort: high
```

The same form also carries `apiKeyEnv` (fixed to `ANYROUTER_API_KEY`), `streamIdleTimeoutMs`, and `retryPolicy`. An absent `reasoning` block falls back to the build-time reference profile generated from pi-ai's catalog (`src/model-profiles.generated.ts`); `disabled: true` offers the model without a reasoning control. The API key itself lives in the credentials service (or the launch environment), never in this config.

### Proxying only this provider

`proxy` takes an `http://` or `https://` proxy URL and applies it to this route alone, per request, through `RequestInit`'s `dispatcher`. It deliberately never touches `undici`'s global dispatcher, so no other provider, the Web UI, or anything else the harness sends is affected. Leave it empty to connect directly.

This is not the same setting as the harness's process-wide proxy, which the launcher installs from `http_proxy` / `https_proxy` / `all_proxy` before any plugin mounts and which already covers every provider. Reach for `proxy` when only AnyRouter has to be tunnelled — a blocked or region-restricted relay, for example — and for the environment variables when everything must be.

- **Credentials are allowed here**: `http://user:pass@host:port` is accepted, and every diagnostic reports the URL with its user information masked.
- **SOCKS is refused**, with a message naming it as unsupported rather than malformed. Point the field at the same client's HTTP proxy port (a Clash mixed port at `http://127.0.0.1:7890`, for instance).
- **Loopback is always direct**, including the whole `127.0.0.0/8` block, so a locally hosted relay keeps working once a proxy is configured.
- **It is saved before it is used.** Pressing **同步模型** writes the proxy field first, because the Host's `remote.llm.discoverModels` call carries a draft endpoint but has no field for a draft proxy. A saved edit applies to the next request without a restart.

## Upgrade from 0.3.3

- A legacy `llm-anyrouter:` section in the removed `settings.yaml` is no longer read, and it is **not** migrated onto the `dsh-anyrouter` entry. On 0.1.7-rc.2 the settings document is the profile patch and a namespace is a profile entry id; the one-time importer only remaps the legacy section ids it knows explicitly (`ui-developer-tools`, `ui-onboarding`, `shell`). An `llm-anyrouter:` section therefore fails to import with `No configurable plugin entry "llm-anyrouter"`, is logged as a warning, and survives only in the renamed `settings.yaml.imported`.
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
```

Local development against a running profile:

```bash
DSH_ANYROUTER_SOURCE=link:/absolute/path/to/checkout npx --yes github:shaomingbo/dsh-anyrouter#v0.3.4
```

Live endpoint verification is environment-gated and makes real requests only when `ANYROUTER_LIVE_KEY` is exported:

```bash
ANYROUTER_LIVE_KEY=sk-… pnpm vitest run tests/live.spec.ts
```

Manual fallback (not the preferred path): add the dependency and the `dsh.profile.bundles` entry to the profile `package.json` yourself, then run `pnpm install --ignore-scripts` in the profile directory.

## License

MIT
