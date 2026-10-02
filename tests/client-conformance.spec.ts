import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT, patchEntryId } from './helpers/patch-entry-ids.ts'

/**
 * Conformance lock for the browser-side LOADER contract of the DSH 0.2.0 line.
 *
 * The shipped browser bundle is not an ES module and is not imported by any
 * other test: it is registered by executing
 * `window.__ModuleLoader__.load({id, factory})`, where the facade lives in the
 * DSH web frontend and resolves `factory`'s `require` against the boot graph.
 * A clean `tsc --noEmit` cannot see any of that, so the few facts the bundle
 * depends on are pinned here from the real DSH 0.2.0 sources:
 *
 * - `@deepseek-ai/dsh-client-modules/lib/index.js:453-475` builds the queue-mode
 *   facade as `{mode:"queue", pendingQueue, load(registration){...}, create(...)}`
 *   and `lib/client.js:563-580` swaps `load` for `register(registration)` once
 *   the module system exists; `register` reads exactly `registration.id` and
 *   `registration.factory`. Same file, lines 17 and 91-100, document the
 *   contract as `load({id, factory})` and normalize `<pkg>/client` onto `<pkg>`.
 * - `@deepseek-ai/dsh-web-frontend` seeds `require` with the static table
 *   `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`,
 *   `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`,
 *   `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`,
 *   `@deepseek-ai/dsh-client-ui-dockkit` (index bundle, `staticModules`).
 * - Everything else a factory requires must be a graph row whose factory is
 *   already registered: `arriveGraphRow` (`lib/client.js:643-661`) loads each
 *   `row.inject` package before its consumer, which is why the `/client`
 *   subpaths below must appear in `dsh.client.inject`.
 */
const BUILD_CLIENT = readFileSync(join(REPO_ROOT, 'scripts/build-client.mjs'), 'utf8')
const MANIFEST = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
  exports: Record<string, unknown>
  dsh: { client: { inject?: string[]; platform?: string } }
  peerDependencies?: Record<string, string>
  devDependencies: Record<string, string>
}
const CLIENT_SOURCE = readFileSync(join(REPO_ROOT, 'src/client/index.tsx'), 'utf8')

/** Modules the frontend provides through the static seed table, not the graph. */
const SEED_WORDS = ['react', 'react/jsx-runtime'] as const
/** Packages whose `/<pkg>/client` subpath the bundle requires as a graph row. */
const GRAPH_PACKAGES = [
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-client-ui-settings',
] as const

/** The `external:` array esbuild is configured with, in source order. */
function externalSpecifiers(): string[] {
  const block = /external:\s*\[([\s\S]*?)\]/.exec(BUILD_CLIENT)
  if (block?.[1] === undefined) throw new Error('scripts/build-client.mjs declares no external array')
  return [...block[1].matchAll(/'([^']+)'/g)].map(match => match[1] as string)
}

/** The registration id the esbuild banner hands to `__ModuleLoader__.load`. */
function bundleId(): string {
  const declaration = /pluginId\s*=\s*'([^']+)'/.exec(BUILD_CLIENT)
  if (declaration?.[1] === undefined) throw new Error('scripts/build-client.mjs declares no pluginId')
  return declaration[1]
}

describe('browser bundle conformance with the DSH 0.2.0 module loader', () => {
  it('registers under the id the profile entry is inserted as', () => {
    // `register()` keys factories by the registration id and `arrive()` matches
    // that id against the boot-graph row id, which is the loader entry id from
    // cordis.patch.yml. A mismatch loads the bundle and then reports it as
    // "loaded without registering `<row id>` via __ModuleLoader__.load".
    expect(bundleId()).toBe(patchEntryId())
    expect(bundleId()).toBe('dsh-anyrouter')
  })

  it('wraps the bundle in the load({id, factory}) registration shape', () => {
    // The facade accepts exactly one registration object; the id and factory
    // keys are the whole contract. Both halves are asserted so a rewrite that
    // drops either one fails here rather than in a browser.
    expect(BUILD_CLIENT).toContain('window.__ModuleLoader__.load(')
    expect(BUILD_CLIENT).toMatch(/load\(\{id:\$\{JSON\.stringify\(pluginId\)\},factory:\(require\)=>\{/)
    expect(BUILD_CLIENT).toContain('return module.exports;}});')
  })

  it('externalizes only the seed words and graph rows the DSH 0.2.0 loader resolves', () => {
    expect([...externalSpecifiers()].sort()).toEqual([
      ...SEED_WORDS,
      ...GRAPH_PACKAGES.map(name => `${name}/client`),
    ].sort())
  })

  it('declares the packages that own the graph rows its require calls resolve', () => {
    // `makeRequire` only finds already-registered factories, and the only thing
    // that guarantees arrival before this factory materializes is the
    // `dsh.client.inject` list the host composes into our graph row.
    const inject = MANIFEST.dsh.client.inject ?? []
    for (const name of GRAPH_PACKAGES) expect(inject).toContain(name)
    // Seed words come from the frontend's static table, so listing them here
    // would add a graph edge with no row to arrive.
    for (const name of SEED_WORDS) expect(inject).not.toContain(name)
  })

  it('exports a ./client bundle, which the host scan requires', () => {
    // `resolveMeta` throws "declares dsh.client but exports no ./client bundle"
    // for a package that declares the browser half without this subpath.
    expect(MANIFEST.dsh.client.platform).toBe('web')
    expect(MANIFEST.exports['./client']).toBe('./lib/client.js')
  })

  it('claims exactly the peer range the Host compatibility gate evaluates', () => {
    // SUPPORTED_HOST is user-facing: it is interpolated into the capability
    // error the section throws on an unsupported Host, and lib/ is tracked and
    // shipped, so a stale string ships a false claim. It must mirror the
    // `@deepseek-ai/dsh-*` peer range — the value DSH's own
    // `evaluatePluginCompatibility` feeds to `semver.satisfies` — and NOT the
    // dev pin, which is only the single release this repository was verified
    // against. Coupling the claim to an exact pin is what made the 0.2.0-rc.1
    // build reject 0.2.0-rc.2.
    const claim = /const SUPPORTED_HOST = '([^']+)'/.exec(CLIENT_SOURCE)
    expect(claim?.[1]).toBeDefined()
    const range = /(\^\S+)/.exec(claim?.[1] as string)?.[1]

    const peers = MANIFEST.peerDependencies ?? {}
    const declared = new Set(
      Object.entries(peers)
        .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
        .map(([, version]) => version),
    )
    expect(declared.size, 'every @deepseek-ai/dsh-* peer must declare one range').toBe(1)
    expect(range).toBe([...declared][0])
  })

  it('ships a built bundle that starts with that registration when lib/ exists', () => {
    const bundle = join(REPO_ROOT, 'lib/client.js')
    // `pnpm run clean` removes lib/ before tsdown rebuilds it; a run in that
    // window is not a conformance failure, so only the artifacts that are
    // actually present are checked.
    if (!existsSync(bundle)) return
    const built = readFileSync(bundle, 'utf8')
    expect(built.startsWith(`window.__ModuleLoader__.load({id:${JSON.stringify(bundleId())},factory:(require)=>{`)).toBe(true)
    const withoutSourceMap = built.replace(/^\/\/# sourceMappingURL=.*$/m, '').trimEnd()
    expect(withoutSourceMap.endsWith('return module.exports;}});')).toBe(true)
  })
})
