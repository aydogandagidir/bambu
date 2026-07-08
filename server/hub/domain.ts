/**
 * Workspace domain rules — the single place that knows how a subdomain becomes
 * a tenant host, which subdomains are legal, and which belong to the platform.
 *
 * `SUBDOMAIN_PATTERN` is consumed twice: as the TypeBox `pattern` on the
 * create-workspace request body, and as the `pattern` attribute the portal
 * puts on its input. One regex, so the client never accepts a string the
 * server rejects.
 */

export const WORKSPACE_DOMAIN_SUFFIX = 'bluedev.dev'

/** RFC-1123 label: lowercase alphanumerics + inner hyphens, 1–32 chars. */
export const SUBDOMAIN_PATTERN = '^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$'

/**
 * Hosts the platform serves itself. A tenant row on one of these would be
 * unreachable — `server/index.ts` routes `app.*` / `hub.*` to the portal
 * before tenant resolution ever runs.
 */
const RESERVED_SUBDOMAINS = new Set(['admin', 'api', 'app', 'hub', 'mail', 'www'])

export function isReservedSubdomain(subdomain: string): boolean {
  return RESERVED_SUBDOMAINS.has(subdomain)
}

/**
 * Hosts that serve the portal instead of a tenant site. Matched on the
 * hostname alone — a dev server on any port answers on `app.localhost`, and
 * production hosts never carry one.
 */
export function isHubHost(host: string): boolean {
  const hostname = host.split(':')[0].toLowerCase()
  return (
    hostname === 'app.localhost' ||
    hostname === `app.${WORKSPACE_DOMAIN_SUFFIX}` ||
    hostname === `hub.${WORKSPACE_DOMAIN_SUFFIX}`
  )
}

export function workspaceDomain(subdomain: string): string {
  return `${subdomain}.${WORKSPACE_DOMAIN_SUFFIX}`
}
