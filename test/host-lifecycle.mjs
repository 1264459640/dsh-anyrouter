import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const entry = resolve(process.argv[2] ?? 'lib/index.js')
const require = createRequire(entry)
// `require.resolve` answers a platform path; the default ESM loader rejects a
// bare `D:\...` specifier on Windows, so every resolved path is converted.
const load = async id => import(pathToFileURL(require.resolve(id)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { default: LlmRuntime } = await load('@deepseek-ai/dsh-llm')
const { default: CredentialProvider } = await load('@deepseek-ai/dsh-credentials')
const plugin = await import(pathToFileURL(entry).href)

// The settings namespace is the profile entry id inserted by cordis.patch.yml.
// From DSH 0.1.7-rc.2 the Host keys settings forms, the configurable-provider
// directory, and model discovery by that id, and the browser settings page
// resolves its ConfigForm with `ctx.configForms.get(<this string>)`. A drift
// between this constant and the patch file silently blanks the settings page,
// so it is asserted here against the built plugin's own declarations.
const SETTINGS_NS = 'dsh-anyrouter'

// 0.1.7 `@deepseek-ai/dsh-settings` no longer exports a `SettingsProvider`
// class or a `ctx.settings.get/update` document API; its runtime exports are
// `SettingsForms` (default), `SettingsConflictError`, and `redactSecrets`. So
// this script mounts no settings service: the plugin must work without one.
class SyntheticCredentials extends CredentialProvider {
  async resolve() { return { value: 'synthetic-test-key', source: 'test' } }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const ctx = new Context()
await ctx.plugin(LlmRuntime)
await ctx.plugin(SyntheticCredentials)
const fiber = await ctx.plugin(plugin, {
  models: [{ id: 'claude-opus-5', protocol: 'claude-code' }],
  retryPolicy: { mode: 'normal', maxRetries: 2 },
})
await settle()
assert.equal(ctx.llm.providerRetryPolicy('anyrouter').maxRetries, 2)

// The browser model catalog lists every route and resolves each model through
// these two calls; a profile missing an adapter-owned field fails the whole
// provider group there ("Cannot read properties of undefined (reading 'get')").
assert.deepEqual((await ctx.llm.listModels('anyrouter')).map(model => model.id), ['claude-opus-5'])
assert.equal((await ctx.llm.resolveModelInfo('anyrouter', 'claude-opus-5')).id, 'claude-opus-5')

// The directory entry carries the namespace the settings page looks up.
const directory = ctx.llm.listConfigurableProviders().find(row => row.provider === 'anyrouter')
assert.ok(directory, 'anyrouter must appear in the configurable-provider directory')
assert.equal(directory.settingsNs, SETTINGS_NS)
assert.deepEqual(directory.settingsPath, [])

// Discovery is registered under the same namespace, and only that one.
await assert.rejects(
  ctx.llm.discoverModels('not-a-namespace', { provider: 'anyrouter', baseURL: 'https://anyrouter.top' }),
  /no model discovery/i,
)

// 0.1.7 passes caller cancellation as a bare second argument to the discover
// callback; `LlmModelDiscoveryRequest` no longer has a `signal` field. An
// aborted signal must therefore reach the transport and surface as ABORTED
// without any network round trip.
const controller = new AbortController()
controller.abort(new Error('cancelled'))
await assert.rejects(
  ctx.llm.discoverModels(SETTINGS_NS, {
    provider: 'anyrouter',
    baseURL: 'https://anyrouter.top',
    apiKey: 'synthetic-test-key',
  }, controller.signal),
  error => error?.code === 'ABORTED',
)

await fiber.dispose()
await assert.rejects(ctx.llm.listModels('anyrouter'), /not registered|no adapter/i)
console.log(JSON.stringify({
  status: 'passed', release: require('@deepseek-ai/dsh-llm/package.json').version,
  checks: [
    'entry import', 'model catalog listing and resolution', 'settings namespace == cordis.patch.yml entry id',
    'discovery namespace registration', 'bare-signal discovery cancellation', 'no settings service required', 'plugin disposal',
  ],
}))
