import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root, resolved from this file's location (`tests/helpers/`). */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Extract the profile entry ids a Cordis bundle patch inserts.
 *
 * The Loader dialect is a YAML sequence whose first mapping key is `insert`,
 * holding a list of entries; an entry's id arrives either inline
 * (`- id: x`) or on a following indented line (`- name: x` / `  id: x`).
 * This is deliberately a tiny hand-rolled reader: the verification suite must
 * not depend on a YAML parser that `pnpm install` may not have installed yet.
 * @param source - raw `cordis.patch.yml` text.
 * @returns entry ids in file order.
 */
export function insertEntryIds(source: string): string[] {
  const ids: string[] = []
  let inInsert = false
  let itemHasId = false
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trimEnd()
    if (line.trim().length === 0) continue
    if (/^\s*(?:-\s*)?insert:\s*$/.test(line)) {
      inInsert = true
      itemHasId = false
      continue
    }
    if (!inInsert) continue
    const item = /^(\s*)-\s*(.*)$/.exec(line)
    if (item !== null) {
      itemHasId = false
      const inline = /^id:\s*(\S+)\s*$/.exec(item[2] ?? '')
      if (inline !== null && inline[1] !== undefined) {
        ids.push(inline[1])
        itemHasId = true
      }
      continue
    }
    // A mapping key back at column zero starts the next top-level document.
    if (/^\S/.test(line)) {
      inInsert = false
      continue
    }
    const nested = /^\s+id:\s*(\S+)\s*$/.exec(line)
    if (nested !== null && nested[1] !== undefined && !itemHasId) {
      ids.push(nested[1])
      itemHasId = true
    }
  }
  return ids
}

/** Every profile entry id the shipped bundle patch inserts. */
export function patchEntryIds(): string[] {
  return insertEntryIds(readFileSync(join(REPO_ROOT, 'cordis.patch.yml'), 'utf8'))
}

/**
 * The one profile entry id this bundle installs as. The Host keys settings
 * forms, configurable-provider entries, and model discovery by this id from
 * DSH 0.1.7-rc.2 onward, so host and client must agree on it exactly.
 * @returns the first (and expected only) inserted entry id.
 * @throws When the patch does not insert exactly one identifiable entry.
 */
export function patchEntryId(): string {
  const ids = patchEntryIds()
  if (ids.length !== 1 || ids[0] === undefined) {
    throw new Error(`cordis.patch.yml must insert exactly one identified entry; found ${JSON.stringify(ids)}`)
  }
  return ids[0]
}
