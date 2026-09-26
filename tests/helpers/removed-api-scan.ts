/**
 * The removed-API scanner shared by the upgrade contract suite.
 *
 * Kept in its own module so the predicate can be pinned by fixtures
 * (`tests/removed-api-scan.spec.ts`) instead of being validated only by the
 * fact that today's `src/` happens to be clean — a scan that can never fail
 * proves nothing about the next change.
 */

/**
 * Identifiers the 0.1.7-rc.2 Host removed or renamed.
 *
 * `settingsScope` was a browser service that does not exist anywhere in the
 * release (verified by grepping every shipped `.d.ts` under the installed
 * `.pnpm` tree: zero matches); `installSettingsSection` / `settingsNamespace` /
 * `SettingsSectionHooks` disappeared from `@deepseek-ai/dsh-settings`, whose
 * only runtime exports are now `SettingsForms` (default),
 * `SettingsConflictError`, and `redactSecrets`; `llm-anyrouter` was the old
 * settings namespace, replaced by the profile entry id.
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
