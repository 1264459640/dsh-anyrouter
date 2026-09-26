import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SETTINGS_NS } from '../src/config.ts'
import { REPO_ROOT, insertEntryIds, patchEntryId, patchEntryIds } from './helpers/patch-entry-ids.ts'
import { removedApiTokensIn } from './helpers/removed-api-scan.ts'

/** DSH release this bundle is upgraded to. */
const DSH_RELEASE = '0.1.7-rc.2'

function readText(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8')
}

function readJson(relativePath: string): Record<string, any> {
  return JSON.parse(readText(relativePath)) as Record<string, any>
}

function relativeSourceFiles(dir = 'src'): string[] {
  return readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap(entry => (
    entry.isDirectory()
      ? relativeSourceFiles(join(dir, entry.name))
      : [join(dir, entry.name)]
  ))
}

describe('bundle patch reader', () => {
  // The reader is the instrument every namespace test below depends on, so it
  // is pinned against the dialect it must parse before it guards anything else.
  it('reads inline and indented entry ids from the Loader insert dialect', () => {
    expect(insertEntryIds('- insert:\n    - id: dsh-anyrouter\n      name: dsh-anyrouter\n'))
      .toEqual(['dsh-anyrouter'])
    expect(insertEntryIds('- insert:\n    - name: other-plugin\n      id: other-plugin\n'))
      .toEqual(['other-plugin'])
    expect(insertEntryIds('# c\n- insert:\n    - id: a\n      name: a\n    - id: b\n      name: b\n'))
      .toEqual(['a', 'b'])
    expect(insertEntryIds('- override:\n    - id: ignored\n')).toEqual([])
  })
})

describe('0.1.7-rc.2 settings namespace contract', () => {
  it('the shipped patch inserts exactly one entry, and it is the settings namespace', () => {
    const ids = patchEntryIds()
    expect(ids).toHaveLength(1)
    expect(SETTINGS_NS).toBe(ids[0])
    expect(patchEntryId()).toBe(ids[0])
  })

  it('the host namespace is the plain profile entry id, not the legacy llm-* name', () => {
    expect(SETTINGS_NS).toBe('dsh-anyrouter')
    expect(SETTINGS_NS).not.toMatch(/^llm-/)
  })
})

describe('removed 0.1.1/0.1.2 API is gone from src/', () => {
  it('nothing under src/ references a removed settings seam in executable code', () => {
    // The scan targets CODE, not prose: an explanatory comment naming the old
    // seam it replaced is the documentation of this very migration, so comments
    // are stripped first. `removedApiTokensIn` lives in
    // tests/helpers/removed-api-scan.ts and is fixture-pinned by
    // tests/removed-api-scan.spec.ts, which proves it still catches a genuine
    // `settingsScope.bind(...)` / `installSettingsSection(` reintroduction.
    const offenders: string[] = []
    for (const file of relativeSourceFiles()) {
      for (const token of removedApiTokensIn(readText(file))) {
        offenders.push(`${file}: ${token}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the legacy settings-compat module is unreferenced and exports nothing', () => {
    // The upgrade contract is that the legacy helper has left the module graph.
    // This session has no file-deletion capability, so the module may survive
    // as an empty tombstone (`export {}`); a shell-capable session should
    // `git rm src/settings-compat.ts`. A tombstone passes here, the real helper
    // cannot: it declared `export function installSettingsSection`, which the
    // removed-API scan above rejects independently.
    const files = relativeSourceFiles()
    for (const file of files.filter(candidate => candidate.endsWith('settings-compat.ts'))) {
      const importers = files.filter(other => other !== file && readText(other).includes('settings-compat'))
      expect(importers, `${file} must not be imported`).toEqual([])
      expect(readText(file)).not.toMatch(/^\s*export\s+(?:default\s+)?(?:function|const|class|let|var)\b/m)
    }
  })
})

describe('0.1.7-rc.2 dependency pins', () => {
  const pkg = readJson('package.json')

  it('pins every @deepseek-ai/dsh-* peer and dev dependency to the release', () => {
    for (const section of ['peerDependencies', 'devDependencies']) {
      const deps = (pkg[section] ?? {}) as Record<string, string>
      for (const [name, version] of Object.entries(deps)) {
        if (name.startsWith('@deepseek-ai/dsh-')) {
          expect(version, `${section}.${name}`).toBe(DSH_RELEASE)
        }
      }
    }
  })

  it('pins the cordis, schemastery, and pi-ai toolchain ranges', () => {
    expect((pkg.peerDependencies ?? {})['@deepseek-ai/cordis']).toBe('~4.0.4')
    expect((pkg.devDependencies ?? {})['@deepseek-ai/cordis']).toBe('~4.0.4')
    expect((pkg.dependencies ?? {})['@deepseek-ai/schemastery']).toBe('~3.18.4')
    expect((pkg.dependencies ?? {})['@earendil-works/pi-ai']).toBe('^0.85.1')
  })

  it('keeps no pre-upgrade version pin in the manifest', () => {
    const manifest = readText('package.json')
    for (const stale of ['0.1.1-rc.2', '0.1.2-alpha.3', '0.1.5', '0.82.1', '^4.0.1', '^3.18.1']) {
      expect(manifest.includes(stale), `stale pin ${stale}`).toBe(false)
    }
  })

  it('declares the client packages that provide the 0.1.7 client services', () => {
    const inject = (pkg.dsh?.client?.inject ?? []) as string[]
    expect(inject).toContain('@deepseek-ai/dsh-client-connection')
    expect(inject).toContain('@deepseek-ai/dsh-client-ui-settings')
    expect(inject).toContain('@deepseek-ai/dsh-api-remotes')
  })

  it('keeps dsh.client.inject consistent with the client services the bundle declares', () => {
    // `DshClientManifest.inject` is documented as "informational package-name
    // dependencies, not Cordis service injection"
    // (@deepseek-ai/dsh-package-manifest/lib/types/types.d.ts:79-80). It is
    // therefore loading/prefetch metadata, NOT apply sequencing — so a missing
    // entry does not break activation, but it does drop the prefetch edge for a
    // service this bundle genuinely waits on. Dropping one is a deliberate
    // decision, never a side effect of a dependency-version sweep.
    const manifest = (pkg.dsh?.client?.inject ?? []) as string[]
    const declared = /export const inject = \[([^\]]*)\]/.exec(readText('src/client/index.tsx'))?.[1] ?? ''
    const services = declared
      .split(',')
      .map(entry => entry.trim().replace(/^'|'$/g, ''))
      .filter(entry => entry.length > 0)

    for (const [service, provider] of CLIENT_SERVICE_PACKAGES) {
      if (services.includes(service)) {
        expect(manifest, `the client declares ${service}, provided by ${provider}`).toContain(provider)
      }
    }
  })
})

/** Cordis client service → the client package that provides it. */
const CLIENT_SERVICE_PACKAGES = [
  ['slots', '@deepseek-ai/dsh-client-ui-slots'],
  ['configForms', '@deepseek-ai/dsh-client-ui-settings'],
  ['remote', '@deepseek-ai/dsh-api-remotes'],
] as const

describe('bundled artifact declarations', () => {
  it('the bundled artifact list no longer ships a settings-compat chunk', () => {
    const pkg = readJson('package.json')
    const files = (pkg.files ?? []) as string[]
    expect(files.filter(file => file.includes('settings-compat'))).toEqual([])
  })
})
