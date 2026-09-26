/**
 * The proxy setting's pure half: validation, canonicalization, the loopback
 * bypass predicate, and diagnostic redaction.
 *
 * Nothing here imports a transport, so the module is loadable wherever the
 * configuration schema is — the Host bundle, a test, or any future consumer
 * that must validate the field without owning an HTTP client. The half that
 * actually tunnels is `./proxy-transport.ts`, which is the only file that
 * imports `undici`.
 * @module dsh-anyrouter/proxy
 */

/** Proxy schemes this route can tunnel through. */
const SUPPORTED_PROXY_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Schemes recognised well enough to be named in the diagnostic rather than
 * reported as malformed. They are refused because neither `undici`'s
 * `ProxyAgent` nor the harness's own global proxy policy speaks them; the
 * answer is to point the setting at the proxy's HTTP port, which every popular
 * local client (Clash, V2Ray, sing-box) also exposes.
 */
const SOCKS_PROXY_PROTOCOLS = new Set(['socks:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'])

/**
 * Render a proxy URL safe to put in an error message or a log line.
 *
 * A proxy URL routinely carries the credential that authorises the tunnel
 * (`http://user:pass@host:port`), and unlike the endpoint setting this field
 * deliberately accepts user information. Redaction is therefore the caller's
 * job at every reporting site, not a property of the stored value.
 * @param value - the proxy URL exactly as configured.
 * @returns the URL with any user information masked, or a placeholder when it cannot be parsed.
 */
export function redactProxyURL(value: string): string {
  try {
    const parsed = new URL(value)
    if (parsed.username.length === 0 && parsed.password.length === 0) return value
    parsed.username = '***'
    parsed.password = ''
    return parsed.toString()
  } catch {
    return '<unparseable>'
  }
}

/**
 * Validate and canonicalize the one proxy URL this route may tunnel through.
 *
 * An empty or absent value means a direct connection, which is the default and
 * the behaviour every release before this field had. User information IS
 * accepted here, unlike {@link normalizeBaseURL}: a proxy URL carries the
 * tunnel's credential, and refusing it would make every authenticated proxy
 * unusable.
 * @param raw - the configured value, as the settings form or a hand-built object holds it.
 * @returns the canonical proxy URL, or `undefined` for a direct connection.
 * @throws when the value is present but unusable, naming the redacted URL.
 */
export function normalizeProxyURL(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim()
  if (value.length === 0) return undefined
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch (cause) {
    throw new Error(`dsh-anyrouter: invalid proxy ${JSON.stringify(redactProxyURL(value))}`, { cause })
  }
  if (SOCKS_PROXY_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `dsh-anyrouter: proxy ${redactProxyURL(value)} uses ${parsed.protocol}//, which this route cannot tunnel through; `
      + 'point it at the same client\'s HTTP proxy port instead (for example http://127.0.0.1:7890)',
    )
  }
  if (!SUPPORTED_PROXY_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`dsh-anyrouter: proxy ${redactProxyURL(value)} must use http:// or https://`)
  }
  parsed.hash = ''
  const canonical = parsed.toString()
  return parsed.pathname === '/' && parsed.search.length === 0
    ? canonical.replace(/\/+$/, '')
    : canonical
}

/** One IPv4 octet, so a loopback match cannot accept `127.999.1.1`. */
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'

/** The whole `127.0.0.0/8` block, not just its first address. */
const LOOPBACK_IPV4 = new RegExp(`^127\\.${OCTET}\\.${OCTET}\\.${OCTET}$`)

/**
 * Whether a host names this machine, and therefore must not be sent to a
 * proxy.
 *
 * A proxy cannot usefully reach a loopback address: it would resolve that
 * address in its own network, and a proxy running locally would reach a service
 * that only listens on this machine. The harness's own global proxy policy
 * bypasses loopback for exactly this reason, and a route-scoped proxy must
 * agree, or a locally hosted relay would break the moment a proxy is
 * configured. The whole `127.0.0.0/8` block is matched rather than the four
 * literal entries a naive list carries.
 * @param hostname - a URL's hostname, bracketed or not.
 * @returns true when the host is loopback or the unspecified address.
 */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '::' || host === '0.0.0.0') return true
  const mappedHigh = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(host)?.[1]
  if (mappedHigh !== undefined) return Number.parseInt(mappedHigh, 16) >>> 8 === 127
  return LOOPBACK_IPV4.test(host.startsWith('::ffff:') ? host.slice(7) : host)
}
