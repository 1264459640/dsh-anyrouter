import { describe, expect, it } from 'vitest'
import { removedApiTokensIn, stripComments } from './helpers/removed-api-scan.ts'

/**
 * Fixtures for the removed-API scanner. The upgrade contract test only proves
 * today's `src/` is clean; these pin what the scanner would do to the *next*
 * edit, which is the property that actually protects the 0.1.7 migration.
 */
const REINTRODUCTIONS: ReadonlyArray<readonly [string, string]> = [
  ['installSettingsSection', "import { installSettingsSection } from './settings-compat.ts'"],
  ['installSettingsSection', 'export function installSettingsSection(owner, ns, schema, entry, hooks) {}'],
  ['installSection', 'settings.installSection(owner, ns, schema, entry, hooks)'],
  ['settingsNamespace', "import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'"],
  ['SettingsSectionHooks', 'let hooks: SettingsSectionHooks<void>'],
  ['llm-anyrouter', "export const SETTINGS_NS = 'llm-anyrouter'"],
  ['settingsScope', "const scope = ctx.get('settingsScope').bind({ namespace: SETTINGS_NS })"],
  ['settingsScope', 'const scope = ctx.settingsScope.bind({ namespace })'],
  ['SettingsProvider', 'class MemorySettings extends SettingsProvider {}'],
]

describe('removed-API scanner', () => {
  it('flags every removed identifier in executable code', () => {
    for (const [token, source] of REINTRODUCTIONS) {
      expect(removedApiTokensIn(source), source).toContain(token)
    }
  })

  it('would have failed at the pre-fix HEAD', () => {
    // The three shapes the pre-upgrade tree actually had, verbatim.
    expect(removedApiTokensIn("import { installSettingsSection, SETTINGS_NAMESPACE } from './settings-compat.ts'"))
      .toContain('installSettingsSection')
    expect(removedApiTokensIn('export function installSettingsSection<T>(owner, ns) {}'))
      .toContain('installSettingsSection')
    expect(removedApiTokensIn("export const SETTINGS_NS = 'llm-anyrouter'"))
      .toContain('llm-anyrouter')
    expect(removedApiTokensIn("export const inject = ['slots', 'remote', 'settingsScope']"))
      .toContain('settingsScope')
  })

  it('ignores prose in block comments and whole-line comments', () => {
    expect(removedApiTokensIn('/* the removed settingsScope service */\nconst a = 1')).toEqual([])
    expect(removedApiTokensIn('/**\n * installSettingsSection is gone\n */\nconst a = 1')).toEqual([])
    expect(removedApiTokensIn('// settingsScope was removed in 0.1.7\nconst a = 1')).toEqual([])
    expect(removedApiTokensIn('  //   installSection() is gone\nconst a = 1')).toEqual([])
  })

  it('strips a trailing block comment but reports a trailing line comment', () => {
    expect(removedApiTokensIn('const a = 1 /* settingsScope */')).toEqual([])
    // Asymmetric on purpose: see stripComments. Over-reporting fails loudly.
    expect(removedApiTokensIn('const a = 1 // settingsScope')).toContain('settingsScope')
  })

  it('matches whole identifiers, so a longer name is not a false hit', () => {
    expect(removedApiTokensIn('const settingsScopeExtra = 1')).toEqual([])
    expect(removedApiTokensIn('interface SettingsFormViewSnapshot { status: string }')).toEqual([])
    expect(removedApiTokensIn('const SETTINGS_NAMESPACE = 1')).toEqual([])
  })

  it('reports a locally declared SettingsScope, which is why the client renamed it', () => {
    expect(removedApiTokensIn('interface SettingsScope { getSnapshot(): unknown }')).toContain('settingsScope')
  })

  it('leaves a URL string intact instead of swallowing the rest of the line', () => {
    // The reason the line-comment rule is anchored: an unanchored rule would
    // strip from `https://` to end of line and hide `installSettingsSection`.
    const source = "const u = 'https://anyrouter.top'; installSettingsSection()"
    expect(stripComments(source)).toBe(source)
    expect(removedApiTokensIn(source)).toContain('installSettingsSection')
  })
})
