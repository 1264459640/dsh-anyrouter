import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

/**
 * Resolve an optional package without failing test collection when it is
 * absent. `@deepseek-ai/dsh-settings` is no longer a declared dependency of
 * this bundle (the 0.1.7 Host derives forms from the profile entry's Config),
 * so the surface check below is opportunistic: it runs wherever the package is
 * still present in the install and is skipped otherwise.
 */
function optionalResolve(specifier) {
  try { return require.resolve(specifier) } catch { return undefined }
}

const settingsEntry = optionalResolve('@deepseek-ai/dsh-settings')

/**
 * Exports `@deepseek-ai/dsh-settings` lost in DSH 0.1.7-rc.2. The package's
 * only remaining runtime surface is `SettingsForms` (also the default export),
 * `SettingsConflictError`, and `redactSecrets` — verified against the installed
 * release's `lib/index.js`, whose final statement is
 * `export { SettingsConflictError, SettingsForms, SettingsForms as default, redactSecrets }`.
 */
const REMOVED_SETTINGS_EXPORTS = [
  'installSettingsSection',
  'settingsNamespace',
  'SettingsSectionHooks',
  'SettingsProvider',
]

test(
  'installed dsh-settings exposes only the 0.1.7 SettingsForms surface',
  { skip: settingsEntry === undefined ? '@deepseek-ai/dsh-settings is not installed' : false },
  async () => {
    const settings = await import(pathToFileURL(settingsEntry).href)
    assert.equal(require('@deepseek-ai/dsh-settings/package.json').version, '0.1.7-rc.2')

    for (const name of REMOVED_SETTINGS_EXPORTS) {
      assert.equal(name in settings, false, `dsh-settings must not export the removed ${name}`)
    }
    assert.equal(typeof settings.SettingsForms, 'function')
    assert.equal(settings.default, settings.SettingsForms)
    assert.equal(typeof settings.SettingsConflictError, 'function')
    assert.equal(typeof settings.redactSecrets, 'function')
  },
)

test('built plugin loads without any legacy settings helper', () => {
  const entry = new URL('../lib/index.js', import.meta.url).href
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { registerHooks } from 'node:module';
    const entry = ${JSON.stringify(entry)};
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === '@deepseek-ai/dsh-settings' && context.parentURL === entry) {
          let actual;
          try { actual = nextResolve(specifier, context).url; }
          catch (cause) {
            throw new Error('the built plugin still imports @deepseek-ai/dsh-settings, which is not installed: ' + cause.message);
          }
          // Deliberately narrow: only the 0.1.7 runtime surface is offered, so
          // an import of a removed helper fails to link instead of resolving
          // to undefined at run time.
          const facade = 'export { default, SettingsForms, SettingsConflictError, redactSecrets } from ' + JSON.stringify(actual);
          return { url: 'data:text/javascript,' + encodeURIComponent(facade), shortCircuit: true };
        }
        return nextResolve(specifier, context);
      }
    });
    const plugin = await import(entry);
    if (plugin.name !== 'dsh-anyrouter' || typeof plugin.apply !== 'function') {
      throw new Error('invalid plugin entry');
    }
  `], { encoding: 'utf8', timeout: 15_000 })
  assert.equal(result.status, 0, result.stderr || String(result.error))
})
