/**
 * The removed-API scanner shared by the upgrade contract suite.
 *
 * Kept in its own module so the predicate can be pinned by fixtures
 * (`tests/removed-api-scan.spec.ts`) instead of being validated only by the
 * fact that today's `src/` happens to be clean — a scan that can never fail
 * proves nothing about the next change.
 */

/**
 * Identifiers the pre-0.1.7 upgrade removed or renamed — some from the Host,
 * some from this plugin — and that the scan still rejects.
 *
 * Removed from `@deepseek-ai/dsh-settings` before 0.1.7, i.e. present in the
 * installed 0.1.5-rc.2 tree and absent from 0.1.7-rc.1 onward: `settingsScope`
 * (a browser service; 57 lowercase hits across 10 `dsh-client-*` packages),
 * `installSection` (98 hits), `SettingsSectionHooks` (34 hits),
 * `SettingsProvider` (152 hits). The package's only runtime exports are now
 * `SettingsForms` (default), `SettingsConflictError` and `redactSecrets`.
 *
 * Removed from THIS PLUGIN, not from a DSH package: `installSettingsSection`
 * and `SETTINGS_NAMESPACE` were exports of `src/settings-compat.ts`, deleted in
 * commit `2ca5e34`. `llm-anyrouter` was this plugin's old settings namespace,
 * replaced by the profile entry id.
 *
 * The array therefore mixes two provenances: Host removals, plus guards against
 * this plugin reintroducing its own deleted seam. Neither a "the Host removed
 * it" nor a "we removed it" reading alone describes the whole list.
 *
 * Re-verified for the 0.2.0-rc.1 retarget and deliberately left unchanged: the
 * whole-tree comparison of the installed 0.1.7-rc.2 and 0.2.0-rc.1 trees removed
 * 0 files, added 0 files, and lost 0 `.d.ts` identifiers across all 21 installed
 * `@deepseek-ai/dsh-*` packages, so no new token qualifies. The list only grows
 * for a token genuinely present in the previous release and gone from the new
 * one.
 *
 * Re-checked again for the 0.2.0-rc.2 retarget, which is a narrower diff: only
 * four consumed packages changed at all between rc.1 and rc.2 — `dsh-llm`
 * `lib/typert.host.js`, `dsh-llm-pi-ai` `lib/index.js` plus two `.d.ts`, and
 * `dsh-api-remotes` `lib/client.js` plus two client types — and none of those
 * files contains any token in this list, so nothing new qualifies there either.
 * Note that the rc.2 upgrade did move real behaviour (`@earendil-works/pi-ai`
 * 0.85 -> 0.87 and the Anthropic SDK with it); that is a dependency-generation
 * change, not a removed settings API, so it belongs in the manifest and the
 * README rather than in this array.
 *
 * CAUTION — `settingsNamespace` is NOT absent from either tree, and must not be
 * read that way. `@deepseek-ai/dsh-settings` still ships the *type*
 * `SettingsNamespace` (`lib/types/index.d.ts:6`, byte-identical in both
 * releases). Because `removedApiTokensIn` matches case-insensitively, this token
 * also matches that live type. That is the deliberate over-report documented
 * there, not evidence that the package is gone — if `src/` ever legitimately
 * needs `SettingsNamespace`, this scan WILL flag it, and the right fix is to
 * rename the local usage, not to drop the token.
 */
export const REMOVED_API = [
  'installSettingsSection',
  'settingsNamespace',
  'SettingsSectionHooks',
  'installSection',
  'llm-anyrouter',
  'settingsScope',
  'SettingsProvider',
] as const

/**
 * Remove prose so the scan reports CODE, not the documentation of the
 * migration that names what it replaced.
 *
 * Two deliberate asymmetries:
 * - A block comment is stripped wherever it appears, so a trailing
 *   `/* settingsScope *\/` is ignored.
 * - The line-comment rule is anchored to the line start, so a trailing
 *   `// settingsScope` is REPORTED. Stripping every `//` to end of line would
 *   eat the `//` in a URL string (`'https://anyrouter.top'`) and could swallow
 *   real code after it on the same line, which would be a genuine blind spot.
 *   The cost is over-reporting, which fails loudly and harmlessly.
 * @param source - raw file text.
 * @returns the text with comments blanked to spaces.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
}

/**
 * Every removed identifier that survives as a whole word in executable code.
 *
 * Matching is case-insensitive and whole-identifier, so `settingsNamespace`
 * also catches the `SettingsNamespace` type spelling and a longer name such as
 * `settingsScopeExtra` is not a hit. One consequence is deliberate and load
 * bearing: a locally declared `SettingsScope` (the section's own view
 * interface) IS reported, because case-insensitivity cannot tell it apart from
 * the removed lowercase service. That is why those local interfaces were
 * renamed to `SettingsFormView` in the client.
 * @param source - raw file text.
 * @returns the offending tokens, in declaration order.
 */
export function removedApiTokensIn(source: string): string[] {
  const code = stripComments(source)
  return REMOVED_API.filter(token =>
    new RegExp(`(?<![A-Za-z0-9_$])${token}(?![A-Za-z0-9_$])`, 'i').test(code))
}
