// Reports whether the CLI generations this bundle reproduces are still current.
//
// The bundle OWNS the version claim — see `src/transports/headers.ts` for why it
// is not a settings field — so that the client identity stays reproducible and a
// user cannot assert a generation whose request shape nobody matches. Owning it
// has one cost: the pinned value goes stale silently the moment upstream ships.
// This script is that cost's mitigation. It compares each pinned constant with
// the package's npm `latest` dist-tag and exits non-zero on drift.
//
// It is deliberately NOT wired into `pnpm run check`: a normal build and test
// run must not depend on a network round trip to a third-party registry, and a
// registry outage must never look like a code failure.
//
//   node scripts/check-cli-versions.mjs
//   node scripts/check-cli-versions.mjs --quiet   # exit code only
//
// Exit codes: 0 = every pin is current, 1 = at least one pin is behind,
// 2 = the registry could not be reached, so nothing was proven either way.

import { readFile } from 'node:fs/promises'

const REGISTRY = 'https://registry.npmjs.org'

/**
 * The pins this bundle owns, and the package each one claims to reproduce.
 *
 * `constant` is read out of the source rather than duplicated here: a checker
 * with its own copy of the version would drift from the code it is supposed to
 * be checking, which is the one failure mode it must not have.
 */
const PINS = [
  {
    label: 'Claude Code',
    file: new URL('../src/transports/claude.ts', import.meta.url),
    constant: 'CLAUDE_CODE_VERSION',
    package: '@anthropic-ai/claude-code',
  },
  {
    label: 'Codex CLI',
    file: new URL('../src/transports/codex.ts', import.meta.url),
    constant: 'CODEX_VERSION',
    package: '@openai/codex',
  },
]

/**
 * Read one pinned version out of its source file.
 * @param pin - the pin descriptor.
 * @returns the pinned version string.
 * @throws when the constant is missing, which means this script is stale.
 */
async function pinnedVersion(pin) {
  const source = await readFile(pin.file, 'utf8')
  const match = new RegExp(`export const ${pin.constant} = '([^']+)'`, 'u').exec(source)
  if (match === null) {
    throw new Error(`could not find \`export const ${pin.constant}\` in ${pin.file.pathname}`)
  }
  return match[1]
}

/**
 * Ask the registry for a package's current `latest` version.
 * @param name - the npm package name.
 * @returns the version string, or undefined when the registry could not answer.
 */
async function latestVersion(name) {
  try {
    const response = await fetch(`${REGISTRY}/${name}/latest`, {
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return undefined
    const body = await response.json()
    return typeof body.version === 'string' ? body.version : undefined
  } catch {
    return undefined
  }
}

const quiet = process.argv.includes('--quiet')
const rows = []
let unreachable = 0

for (const pin of PINS) {
  const pinned = await pinnedVersion(pin)
  const latest = await latestVersion(pin.package)
  if (latest === undefined) unreachable += 1
  rows.push({ ...pin, pinned, latest })
}

if (!quiet) {
  const width = Math.max(...rows.map(row => row.label.length))
  for (const row of rows) {
    const state = row.latest === undefined
      ? 'registry unreachable'
      : row.latest === row.pinned ? 'current' : `BEHIND by pin -> ${row.latest}`
    console.log(`${row.label.padEnd(width)}  ${row.pinned.padEnd(12)}  ${state}`)
  }
}

const behind = rows.filter(row => row.latest !== undefined && row.latest !== row.pinned)
if (behind.length > 0 && !quiet) {
  console.log('')
  for (const row of behind) {
    console.log(`${row.label}: ${row.pinned} -> ${row.latest} (${row.package})`)
  }
  console.log('\nBump the pin in its transport module, then re-read that client\'s request shape')
  console.log('(betas, fields, headers) and re-run the live suite before releasing.')
}

if (behind.length > 0) process.exitCode = 1
else if (unreachable > 0) {
  if (!quiet) console.log(`\n${unreachable} pin(s) could not be checked; nothing was proven.`)
  process.exitCode = 2
}
