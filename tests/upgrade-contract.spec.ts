import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SETTINGS_NS } from '../src/config.ts'
import { REPO_ROOT, insertEntryIds, patchEntryId, patchEntryIds } from './helpers/patch-entry-ids.ts'
import { removedApiTokensIn } from './helpers/removed-api-scan.ts'

/**
 * The `@deepseek-ai/dsh-*` peer range this bundle declares. Peers are a RANGE,
 * not a pin: DSH's own `evaluatePluginCompatibility` passes the peer string
 * straight to `semver.satisfies(runtimeVersion, requirement, { includePrerelease
 * : true })`, so an exact pin admits exactly one DSH build and rejects every
 * other — which is how the 0.2.0-rc.1 build came to reject 0.2.0-rc.2.
 *
 * The floor is `rc.2` rather than `rc.1`, and that is forced, not chosen:
 * `@deepseek-ai/dsh-llm-pi-ai` moved its `@earendil-works/pi-ai` dependency from
 * `^0.85.1` to `^0.87.1` between those two builds, and this bundle imports that
 * package directly (`createProvider`, `Provider`, `pi-ai/api/*` stream
 * internals). One build can therefore only link against one pi-ai generation. A
 * range wider than the generation it was built against would advertise
 * compatibility this bundle cannot deliver — and cannot even typecheck.
 */
const DSH_PEER_RANGE = '^0.2.0-rc.2'

/**
 * The one DSH release this repository is actually developed and verified
 * against, pinned exactly in `devDependencies` so the toolchain and the test
 * suite resolve to a reproducible build. It must stay inside `DSH_PEER_RANGE`.
 */
const DSH_RELEASE = '0.2.0-rc.2'

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

describe('0.2.0 settings namespace contract', () => {
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

describe('0.2.0 dependency contract', () => {
  const pkg = readJson('package.json')

  /** Every `@deepseek-ai/dsh-*` entry in one manifest section. */
  function dshSpecifiers(section: string): [string, string][] {
    return Object.entries((pkg[section] ?? {}) as Record<string, string>)
      .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
  }

  it('declares the peer range, and only that range, for every dsh peer', () => {
    // A RANGE, not a pin, and that is load-bearing: DSH's
    // `evaluatePluginCompatibility` hands the peer string to
    // `semver.satisfies(runtimeVersion, requirement, { includePrerelease: true })`
    // so an exact peer admits exactly one DSH build. Pinning `0.2.0-rc.1` is
    // precisely what made this bundle rejected by `0.2.0-rc.2`.
    const peers = dshSpecifiers('peerDependencies')
    expect(peers.length).toBeGreaterThan(0)
    for (const [name, range] of peers) {
      expect(range, `peerDependencies.${name}`).toBe(DSH_PEER_RANGE)
    }
  })

  it('pins every dsh dev dependency to the exact verified release', () => {
    for (const [name, version] of dshSpecifiers('devDependencies')) {
      expect(version, `devDependencies.${name}`).toBe(DSH_RELEASE)
    }
  })

  it('covers exactly the same dsh packages in both sections', () => {
    // A half-finished sweep that moves one section and not the other must fail.
    const peers = dshSpecifiers('peerDependencies').map(([name]) => name).sort()
    const devs = dshSpecifiers('devDependencies').map(([name]) => name).sort()
    expect(peers.length).toBeGreaterThan(0)
    expect(devs).toEqual(peers)
  })

  it('keeps the verified release inside the declared peer range', () => {
    // Guards the pair against drifting apart: bumping the dev pin to a new DSH
    // line without moving the peer floor (or the reverse) would leave the
    // manifest advertising a range this repository never builds against.
    const floor = DSH_PEER_RANGE.replace(/^\^|^~/, '')
    const base = (version: string) => version.split('-')[0]
    expect(base(DSH_RELEASE)).toBe(base(floor))

    // `^0.2.0-rc.1` admits every `0.2.x`, so any `0.2.0-rc.N` dev pin is inside
    // it. Compare the prerelease ordinal so a floor *above* the verified release
    // cannot slip through; a stable release outranks its own prereleases.
    const ordinal = (version: string) => {
      const prerelease = version.split('-')[1]
      if (prerelease === undefined) return Number.POSITIVE_INFINITY
      return Number(/^rc\.(\d+)$/.exec(prerelease)?.[1] ?? Number.NaN)
    }
    expect(ordinal(DSH_RELEASE)).toBeGreaterThanOrEqual(ordinal(floor))
  })

  it('pins the cordis, schemastery, and pi-ai toolchain ranges', () => {
    expect((pkg.peerDependencies ?? {})['@deepseek-ai/cordis']).toBe('~4.0.4')
    expect((pkg.devDependencies ?? {})['@deepseek-ai/cordis']).toBe('~4.0.4')
    expect((pkg.dependencies ?? {})['@deepseek-ai/schemastery']).toBe('~3.18.4')
    expect((pkg.dependencies ?? {})['@earendil-works/pi-ai']).toBe('^0.87.1')
  })

  it('keeps its pi-ai generation identical to the one dsh-llm-pi-ai links', () => {
    // This bundle both imports `@earendil-works/pi-ai` directly and subclasses
    // `PiAiAdapter`, whose `Provider`/`Context` types ARE pi-ai types. If the
    // two specifiers disagree, the install carries two generations, `tsc` sees
    // two structurally unrelated `Provider` types, and `src/adapter.ts` stops
    // compiling — the exact failure the 0.2.0-rc.2 retarget had to fix, where
    // the Host moved to pi-ai 0.87.1 while this manifest still asked for
    // `^0.85.1`.
    //
    // Equality (not mere intersection) is deliberate: two ranges that merely
    // overlap can still resolve to two copies, which is the condition that
    // breaks the seam.
    const specifier = (pkg.dependencies ?? {})['@earendil-works/pi-ai']
    expect(specifier, 'this bundle must declare @earendil-works/pi-ai').toBeDefined()

    const hostSpecifier = readJson(
      'node_modules/@deepseek-ai/dsh-llm-pi-ai/package.json',
    ).dependencies?.['@earendil-works/pi-ai']
    expect(hostSpecifier, 'dsh-llm-pi-ai must declare @earendil-works/pi-ai').toBeDefined()

    expect(specifier, 'a DSH-line bump must move the pi-ai pin with it').toBe(hostSpecifier)
  })

  it('keeps its Anthropic SDK copy identical to the one pi-ai links', () => {
    // `src/transports/claude.ts` constructs an `Anthropic` client from this SDK
    // (via `@earendil-works/pi-ai/api/anthropic-messages` internals) and hands it
    // to a pi-ai stream function, so the SDK class crosses the package boundary.
    // TypeScript compares the two copies nominally — the SDK's client carries a
    // `#private` field, which makes structurally identical builds from different
    // versions mutually unassignable. The failure this guards against is the one
    // the 0.2.0-rc.2 retarget had to fix: "Property '#private' is missing in type
    // '...Anthropic' but required in type '...Anthropic'" from two SDK copies.
    //
    // Both sides are read from the installed manifests, so a pi-ai bump that
    // moves its SDK pin fails here until this bundle moves with it — no version
    // string is hardcoded in this test to rot on its own.
    //
    // Equality (not mere intersection) is deliberate, for the same reason as the
    // pi-ai guard above: two ranges that merely overlap can still resolve to two
    // copies of the class, which is the condition that breaks the seam.
    const specifier = (pkg.dependencies ?? {})['@anthropic-ai/sdk']
    expect(specifier, 'this bundle must declare @anthropic-ai/sdk').toBeDefined()

    const piAiSpecifier = readJson(
      'node_modules/@earendil-works/pi-ai/package.json',
    ).dependencies?.['@anthropic-ai/sdk']
    expect(piAiSpecifier, 'pi-ai must declare @anthropic-ai/sdk').toBeDefined()

    expect(specifier, 'a pi-ai bump must move the Anthropic SDK pin with it').toBe(piAiSpecifier)
  })

  it('keeps no pre-upgrade version pin in the manifest', () => {
    const manifest = readText('package.json')
    // `0.1.7-rc.2` is the pin this retarget moved off, so it joins the older
    // pins: a half-finished sweep that bumps some sections and not others
    // leaves the release string behind and must fail here.
    for (const stale of ['0.1.1-rc.2', '0.1.2-alpha.3', '0.1.5', '0.1.7-rc.2', '0.82.1', '^4.0.1', '^3.18.1']) {
      expect(manifest.includes(stale), `stale pin ${stale}`).toBe(false)
    }
  })

  it('declares the client packages that provide the 0.2.0 client services', () => {
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
