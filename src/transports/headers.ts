/**
 * The complete request-header sets this bundle sends, one per client identity.
 *
 * These are the ONLY place a request's identity headers are assembled, which is
 * deliberate: "which headers do we claim" is a fidelity question, and answering
 * it by reading five files is how a stale header survives a CLI upgrade. Every
 * entry below is evidence-backed against the shipped client it reproduces, and
 * the evidence is recorded next to it.
 *
 * ## How the sets were established
 *
 * Both entries were read out of the official clients themselves rather than
 * inferred:
 *
 * - **Claude Code `2.1.286`** — the `@anthropic-ai/claude-code-win32-x64` npm
 *   package ships a single self-contained native binary. Searching its
 *   printable strings yields the header vocabulary it can emit. Present:
 *   `anthropic-beta`, `anthropic-version`, `anthropic-dangerous-direct-browser-access`,
 *   `x-app`, `x-client-request-id`, `X-Claude-Code-Session-Id`, `claude-cli/`,
 *   and the whole `X-Stainless-*` family (`Lang`, `Package-Version`, `OS`,
 *   `Arch`, `Runtime`, `Runtime-Version`, `Retry-Count`, `Timeout`) plus
 *   `x-stainless-helper-method`. `sdk-cli` is present as a client token, which
 *   is what the `(external, sdk-cli)` suffix claims.
 * - **Codex CLI `0.159.3`** — the `@openai/codex` win32-x64 package ships
 *   `codex.exe`, and the workspace source is public. Present: `originator`
 *   (default `codex_cli_rs`), `session-id` and `thread-id`
 *   (`codex-api/src/requests/headers.rs::build_session_headers`),
 *   `x-client-request-id`, `x-codex-beta-features` and `x-codex-turn-state`
 *   (`core/src/client.rs::build_responses_headers`), `x-codex-installation-id`,
 *   and a `user-agent` of the shape `codex_cli_rs/<version> (<os>; <arch>)`.
 *
 * ## What is deliberately NOT claimed
 *
 * - **`OpenAI-Beta: responses=experimental` is gone.** It was the beta gate the
 *   Responses API required while that API was experimental, and it is what this
 *   transport used to send. It no longer appears anywhere in `codex.exe`; the
 *   only `OpenAI-Beta` value the current client carries is
 *   `responses_websockets=2026-02-06`, set on its WebSocket handshake, which
 *   this SSE transport does not perform. Sending it would be asserting a client
 *   generation that no longer exists — the exact drift this module exists to
 *   prevent.
 * - **The per-turn, per-thread and per-deployment Codex headers** are not sent:
 *   `x-codex-turn-state` (a sticky routing token the server hands out and the
 *   client echoes), `x-codex-guardian` (reviewer-only), `chatgpt-account-id`
 *   (ChatGPT subscription auth, not an API key), and
 *   `x-openai-internal-codex-responses-lite` (an internal routing switch driven
 *   by a server-side model config this relay does not serve). They are
 *   conditional state, not client identity; a first request on a fresh
 *   connection carries none of them.
 * - **The `X-Stainless-*` family is not restated for Claude.** Those headers
 *   describe the Stainless-generated client library (its language, package
 *   version, runtime and retry bookkeeping), and the Anthropic SDK sets all of
 *   them truthfully for the SDK this bundle actually links. Hard-coding them
 *   here would either duplicate that truth or, worse, pin a package version
 *   that moves with every dependency bump.
 * @module dsh-anyrouter/transports/headers
 */

import { arch, platform, release } from 'node:os'
import { randomBytes } from 'node:crypto'
import type { ProviderHeaders } from '@earendil-works/pi-ai'

/**
 * The `anthropic-version` every current Anthropic client sends. Found verbatim
 * in the Claude Code binary next to the `2023-06-01` value.
 */
export const ANTHROPIC_API_VERSION = '2023-06-01'
/** The `originator` value the Codex CLI identifies itself with by default. */
export const CODEX_ORIGINATOR = 'codex_cli_rs'

/** Node's platform `arch()` mapped to the spelling the Codex CLI's UA uses. */
const ARCH_LABELS: Readonly<Record<string, string>> = {
  x64: 'x86_64',
  arm64: 'aarch64',
  ia32: 'x86',
  arm: 'arm',
}

/** Node's `platform()` mapped to a human OS name for the Codex UA. */
const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
  freebsd: 'FreeBSD',
}

/**
 * The `(<os> <release>; <arch>)` parenthetical the Codex CLI puts in its
 * `user-agent`.
 *
 * The real client renders it from an OS-info crate, so the exact release
 * spelling differs per platform; what matters for the fingerprint is that the
 * shape and the architecture token match, which this reproduces from Node's own
 * view of the machine rather than from a guess.
 * @returns the parenthetical, without the surrounding space.
 */
export function hostDescriptor(): string {
  const platformName = PLATFORM_LABELS[platform()] ?? platform()
  const archName = ARCH_LABELS[arch()] ?? arch()
  return `${platformName} ${release()}; ${archName}`
}

/**
 * A stable-within-the-process installation id.
 *
 * The real Codex CLI persists this across runs; this bundle has no state
 * directory to persist into, so it generates one per process. The header is
 * opaque server-side bookkeeping, so a fresh id per run is faithful in kind
 * even though it is not durable.
 */
const INSTALLATION_ID = randomBytes(16).toString('hex')

/** Narrow a `ProviderHeaders` value set down to the plain string entries. */
function stringEntries(headers: ProviderHeaders | undefined): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (typeof value === 'string') entries[name] = value
  }
  return entries
}

/**
 * The caller's `user-agent`, kept as a trailing attribution token.
 *
 * The DSH harness names itself in the `user-agent` it passes down, and dropping
 * that would erase which harness made the call. Both official clients append
 * extra tokens to their UA (`codex_cli_rs/<ver> (...)` has the terminal, Claude
 * Code has the client kind), so appending rather than replacing is also the
 * shape-faithful choice.
 * @param overrides - the caller-supplied headers.
 * @returns the attribution suffix, including its leading space, or ''.
 */
function attribution(overrides: ProviderHeaders | undefined): string {
  const value = overrides?.['user-agent']
  return typeof value === 'string' ? ` ${value}` : ''
}

/** Everything the Claude Code identity needs to render its headers. */
export interface ClaudeHeaderInput {
  /** Claude Code version to claim, from the transport's own pin. */
  version: string
  /** Beta features to advertise, already assembled and ordered by the caller. */
  betas: readonly string[]
  /** Host-supplied session id, when the call carries one. */
  sessionId?: string | undefined
  /** Caller-supplied headers; extras survive, identity is authoritative. */
  overrides?: ProviderHeaders | undefined
}

/**
 * The complete Claude Code request-header set.
 *
 * Ordering rule: caller extras come first so any unrelated header the harness
 * set survives, and every identity key below overwrites it. The identity is the
 * bundle's to state, not a caller's to redefine.
 * @param input - version, betas, session and caller headers.
 * @returns the header map to hand the Anthropic client.
 */
export function claudeCodeHeaders(input: ClaudeHeaderInput): Record<string, string> {
  const headers: Record<string, string> = {
    ...stringEntries(input.overrides),
    accept: 'application/json',
    'content-type': 'application/json',
    'anthropic-version': ANTHROPIC_API_VERSION,
    'anthropic-beta': input.betas.join(','),
    'anthropic-dangerous-direct-browser-access': 'true',
    'user-agent': `claude-cli/${input.version} (external, sdk-cli)${attribution(input.overrides)}`,
    'x-app': 'cli',
  }
  if (input.sessionId !== undefined && input.sessionId.length > 0) {
    // Both are emitted with the session in hand: the CLI scopes a conversation
    // by the session id and correlates one request by the client request id.
    headers['x-claude-code-session-id'] = input.sessionId
    headers['x-client-request-id'] = input.sessionId
  }
  return headers
}

/** Everything the Codex identity needs to render its headers. */
export interface CodexHeaderInput {
  /** Codex CLI version to claim, from the transport's own pin. */
  version: string
  /** Host-supplied session id, when the call carries one. */
  sessionId?: string | undefined
  /** Caller-supplied headers; extras survive, identity is authoritative. */
  overrides?: ProviderHeaders | undefined
}

/**
 * The complete Codex Responses request-header set.
 * @param input - version, session and caller headers.
 * @returns the header map to hand the OpenAI client.
 */
export function codexHeaders(input: CodexHeaderInput): Record<string, string> {
  const headers: Record<string, string> = {
    ...stringEntries(input.overrides),
    accept: 'text/event-stream',
    'content-type': 'application/json',
    originator: CODEX_ORIGINATOR,
    'user-agent': `codex_cli_rs/${input.version} (${hostDescriptor()})${attribution(input.overrides)}`,
    'x-codex-installation-id': INSTALLATION_ID,
  }
  if (input.sessionId !== undefined && input.sessionId.length > 0) {
    // The CLI's session headers are `session-id`/`thread-id`; it also echoes the
    // thread as the client request id, which is what keeps a retry correlated
    // with the turn it belongs to.
    headers['session-id'] = input.sessionId
    headers['thread-id'] = input.sessionId
    headers['x-client-request-id'] = input.sessionId
  }
  return headers
}
