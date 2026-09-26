/**
 * The proxy setting's transport half: a `fetch` that tunnels through one proxy
 * URL, and the small agent cache that keeps the tunnel warm.
 *
 * The proxy is deliberately applied per request, through `RequestInit`'s
 * `dispatcher`, and never through `undici`'s global dispatcher. That is the
 * whole point of this module: DSH installs a process-wide dispatcher from
 * `http_proxy`/`https_proxy`/`all_proxy` at boot
 * (`@deepseek-ai/dsh-http-proxy`), and replacing it here would route every
 * other provider, the Web UI's own traffic, and anything else the harness sends
 * through a proxy this setting was never meant to cover. Nothing in this file
 * mutates process state: the returned `fetch` closes over one proxy URL.
 *
 * The `fetch` handed back is `undici`'s own, not the global one, because a
 * dispatcher must come from the same `undici` installation that validates it —
 * the OpenAI SDK documents the same requirement for `ProxyAgent` usage. Both
 * are imported from the single `undici` dependency this route declares.
 * @module dsh-anyrouter/proxy-transport
 */

import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { isLoopbackHost } from './proxy.ts'

/**
 * How many tunnel agents stay warm. A settings edit replaces the proxy URL, and
 * the previous agent must survive long enough for the request that was already
 * in flight through it; four slots cover an edit plus its neighbours without
 * letting a repeatedly edited field grow the process's socket pools.
 */
const MAX_CACHED_AGENTS = 4

/** Insertion-ordered, so the first key is the least recently used. */
const agents = new Map<string, ProxyAgent>()

/**
 * The tunnel agent for one proxy URL, created on first use and reused after.
 * @param proxy - a canonical proxy URL from {@link normalizeProxyURL}.
 * @returns the agent to route a request through.
 */
function agentFor(proxy: string): ProxyAgent {
  const cached = agents.get(proxy)
  if (cached !== undefined) {
    // Re-insert so Map iteration order tracks recency.
    agents.delete(proxy)
    agents.set(proxy, cached)
    return cached
  }
  const agent = new ProxyAgent(proxy)
  agents.set(proxy, agent)
  if (agents.size > MAX_CACHED_AGENTS) {
    const oldest = agents.keys().next().value
    if (oldest !== undefined) {
      const evicted = agents.get(oldest)
      agents.delete(oldest)
      void evicted?.close().catch(() => undefined)
    }
  }
  return agent
}

/**
 * The URL a request targets, whichever form the caller used.
 * @param input - the `fetch` input.
 * @returns the parsed URL, or `undefined` when the input carries none.
 */
function targetOf(input: RequestInfo | URL): URL | undefined {
  const raw = input instanceof Request ? input.url : input.toString()
  try {
    return new URL(raw)
  } catch {
    return undefined
  }
}

/**
 * `RequestInit` plus the non-standard `dispatcher` field `undici` reads.
 *
 * `lib.dom`'s `RequestInit` — the type every SDK here declares, because it
 * types against `globalThis.fetch` — does not carry `dispatcher`, even though
 * `undici`'s own `fetch` honours it. Naming the field locally keeps the one
 * cast in this module honest instead of widening the whole init object.
 */
type DispatcherInit = RequestInit & { dispatcher?: unknown }

/**
 * A `fetch` that sends every request through `proxy`, or the global `fetch`
 * itself when no proxy is configured.
 *
 * The direct case returns the global function rather than a wrapper, so a route
 * with no proxy behaves exactly as it did before this setting existed — and a
 * test that replaces `globalThis.fetch` keeps intercepting it.
 *
 * A loopback target is sent directly even when a proxy is configured: see
 * {@link isLoopbackHost}.
 * @param proxy - the canonical proxy URL, or `undefined` for a direct connection.
 * @returns a `fetch` bound to that route.
 */
export function proxyFetch(proxy: string | undefined): typeof globalThis.fetch {
  if (proxy === undefined) return globalThis.fetch
  // `undici`'s fetch and the global one are the same call shape but nominally
  // different types: `undici`'s `RequestInit` knows `dispatcher`, `lib.dom`'s
  // does not. The public signature stays the global one so callers, the
  // Anthropic client and the OpenAI client all accept it unchanged.
  const send = undiciFetch as unknown as (input: RequestInfo | URL, init?: DispatcherInit) => Promise<Response>
  return ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = targetOf(input)
    if (target !== undefined && isLoopbackHost(target.hostname)) return send(input, init)
    return send(input, { ...init, dispatcher: agentFor(proxy) })
  }) as typeof globalThis.fetch
}

/**
 * Close and forget every cached tunnel agent.
 *
 * Only tests call this: a live route keeps its agent warm on purpose, and
 * closing one mid-request would fail the request that was already using it.
 * @returns a promise settling once every agent has closed.
 */
export async function disposeProxyAgents(): Promise<void> {
  const closing = [...agents.values()].map(agent => agent.close().catch(() => undefined))
  agents.clear()
  await Promise.all(closing)
}
