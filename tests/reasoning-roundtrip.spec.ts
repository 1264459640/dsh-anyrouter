import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canonicalReasoningProfile,
  REASONING_LEVELS,
  resolveConfig,
  type AnyRouterModelConfig,
  type ReasoningProfile,
} from '../src/config.ts'
import { effectiveReasoning, resolveModel } from '../src/catalog.ts'
import { REPO_ROOT } from './helpers/patch-entry-ids.ts'

/**
 * The persisted reasoning profile is the one piece of this plugin's data model
 * the settings page and the adapter both round-trip: the browser section writes
 * it, `resolveConfig` canonicalizes it, and the adapter projects it into the
 * selector. The 0.1.7 settings-seam migration must not change any of it.
 */
const CASES: Array<{ name: string; profile: ReasoningProfile; protocol: 'claude-code' | 'codex-responses'; id: string }> = [
  { name: 'effort superset', profile: { efforts: ['max', 'low', 'low', 'high'] }, protocol: 'claude-code', id: 'claude-opus-5' },
  { name: 'single effort', profile: { efforts: ['medium'] }, protocol: 'claude-code', id: 'claude-opus-5' },
  { name: 'with default', profile: { efforts: ['medium', 'high'], defaultEffort: 'medium' }, protocol: 'claude-code', id: 'claude-opus-5' },
  { name: 'adaptive on', profile: { efforts: ['low'], adaptive: true }, protocol: 'claude-code', id: 'claude-opus-5' },
  { name: 'adaptive off', profile: { adaptive: false, efforts: ['low'] }, protocol: 'claude-code', id: 'claude-opus-5' },
  { name: 'disabled', profile: { disabled: true, efforts: ['low'], defaultEffort: 'low' }, protocol: 'claude-code', id: 'claude-opus-5' },
  { name: 'codex efforts', profile: { efforts: ['off', 'low', 'high'] }, protocol: 'codex-responses', id: 'gpt-5.6-sol' },
  { name: 'unknown relay id', profile: { efforts: ['low'] }, protocol: 'claude-code', id: 'claude-opus-9' },
]

describe('reasoning profile round-trip', () => {
  it('canonicalization is a fixpoint for every persisted shape', () => {
    for (const testCase of CASES) {
      const once = canonicalReasoningProfile(testCase.profile, testCase.protocol, testCase.id)
      const twice = canonicalReasoningProfile(once, testCase.protocol, testCase.id)
      expect(twice, testCase.name).toEqual(once)
    }
  })

  it('resolveConfig survives re-resolving its own output unchanged', () => {
    // `resolveConfig` refuses duplicate model ids, so the cases (which reuse one
    // relay id across many profile shapes) collapse to one entry per id; the
    // shape variety is covered by the canonicalization fixpoint test above.
    const byId = new Map<string, AnyRouterModelConfig>()
    for (const testCase of CASES) {
      byId.set(testCase.id, {
        id: testCase.id,
        protocol: testCase.protocol,
        reasoning: testCase.profile,
      })
    }
    const source = [...byId.values()]
    expect(source).toHaveLength(byId.size)
    const first = resolveConfig({ models: source })
    const second = resolveConfig({ models: first.models.map(model => ({ ...model })) })
    expect(second.models).toEqual(first.models)
    expect(second.retryPolicy).toEqual(first.retryPolicy)
    expect(second.baseURL).toBe(first.baseURL)
  })

  it('keeps canonical effort order, the persisted default, and the disabled collapse', () => {
    const resolved = resolveConfig({
      models: [
        { id: 'claude-opus-5', protocol: 'claude-code', reasoning: { efforts: ['max', 'low', 'high'], defaultEffort: 'high' } },
        { id: 'claude-opus-6', protocol: 'claude-code', reasoning: { disabled: true, efforts: ['low'], defaultEffort: 'low' } },
      ],
    })
    expect(resolved.models[0]?.reasoning).toEqual({ efforts: ['low', 'high', 'max'], defaultEffort: 'high' })
    expect(resolved.models[1]?.reasoning).toEqual({ disabled: true })
  })

  it('rejects a default outside the effort set and an adaptive codex profile', () => {
    expect(() => canonicalReasoningProfile(
      { efforts: ['low'], defaultEffort: 'high' }, 'claude-code', 'claude-opus-5',
    )).toThrow(/defaultEffort/)
    expect(() => canonicalReasoningProfile(
      { efforts: ['low'], adaptive: true }, 'codex-responses', 'gpt-5.6-sol',
    )).toThrow(/adaptive/)
  })

  it('projects the persisted profile into the selector and the adapter', () => {
    const codex = resolveModel({
      id: 'gpt-5.6-sol',
      protocol: 'codex-responses',
      reasoning: { efforts: ['low', 'high'], defaultEffort: 'low' },
    }, 'https://anyrouter.top')
    expect(codex.thinkingLevelMap).toMatchObject({ off: null, minimal: null, low: 'low', medium: null, high: 'high' })
    expect(effectiveReasoning({
      id: 'gpt-5.6-sol',
      protocol: 'codex-responses',
      reasoning: { efforts: ['low', 'high'], defaultEffort: 'low' },
    })).toMatchObject({ enabled: true, defaultEffort: 'low' })
  })
})

describe('reasoning level vocabulary drift', () => {
  // The browser section keeps its own copy of the level order (a client bundle
  // may not import a Host package), so the two lists are compared directly.
  it('the client LEVELS list matches the host REASONING_LEVELS exactly', () => {
    const source = readFileSync(join(REPO_ROOT, 'src/client/index.tsx'), 'utf8')
    const found = /const LEVELS = \[([^\]]*)\]/.exec(source)
    expect(found, 'client LEVELS declaration').not.toBeNull()
    const levels = (found?.[1] ?? '')
      .split(',')
      .map(entry => entry.trim().replace(/^'|'$/g, ''))
      .filter(entry => entry.length > 0)
    expect(levels).toEqual([...REASONING_LEVELS])
  })
})
