/**
 * Hub portal security layer.
 *
 * The portal reuses the CMS's primitives — `RateLimiter`, `originAllowed`,
 * `publicOriginIsHttps`, argon2id hashing — instead of growing a second,
 * weaker auth stack next to the first. What it does NOT share is *state*: the
 * rate-limit buckets below are hub-owned, so portal traffic and admin traffic
 * can never exhaust each other's quota.
 *
 * Why the Origin check matters here specifically. A tenant site
 * (`acme.bluedev.dev`) and the portal (`app.bluedev.dev`) share a registrable
 * domain, so they are *same-site*: `SameSite=Lax` still attaches the hub
 * session cookie to a POST issued from a tenant page. And a tenant page's HTML
 * is authored by its owner, through the CMS. The Origin check is the only
 * thing standing between that page and `POST /api/hub/workspaces`.
 *
 * Why a CSP nonce. The portal is the surface where a customer types a
 * password. Its `<style>` and `<script>` are the only ones it should ever
 * execute, and it can prove that per-response — no `'unsafe-inline'`, so an
 * injected `<script>` never runs even if a sink is reintroduced.
 */

import { randomBytes } from 'node:crypto'
import { RateLimiter } from '../auth/rateLimit'
import { isStateChangingMethod, originAllowed, publicOriginIsHttps } from '../auth/security'
import { jsonResponse } from '../http'

export const HUB_SESSION_COOKIE_NAME = 'hub_session_id'
export const HUB_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

/** Auth bodies carry an email and a password. Nothing legitimate is larger. */
export const MAX_AUTH_BODY_BYTES = 4 * 1024

// ── Rate limiters ───────────────────────────────────────────────────────────
// Same shapes as the CMS login limiters, separate buckets. Deploy gets its own
// because a single deploy provisions a database file and runs every migration
// against it — the most expensive thing an authenticated caller can ask for.

/** Per-IP blanket limit: one attacker IP grinding through many accounts. */
export const hubLoginPerIpRateLimit = new RateLimiter({ limit: 30, windowMs: 10 * 60 * 1000 })

/** Per-(IP, email): defends one account across many IPs, and vice versa. */
export const hubLoginRateLimit = new RateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 })

/** Per-IP account creation — caps automated signup floods. */
export const hubRegisterRateLimit = new RateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 })

/** Per-user workspace provisioning. */
export const hubDeployRateLimit = new RateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 })

function rateLimitedResponse(message: string, retryAfterMs: number): Response {
  return jsonResponse(
    { error: message },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
  )
}

/**
 * Consume one slot from `limiter` for `key`. Returns a ready-to-send `429` when
 * the caller is over budget, or `null` to proceed.
 *
 * A `null` key (no client IP surfaced — `Bun.serve` without a proxy in front)
 * skips the limiter rather than lumping every caller into one shared bucket.
 */
export function enforceRateLimit(
  limiter: RateLimiter,
  key: string | null,
  message: string,
): Response | null {
  if (key === null) return null
  const decision = limiter.consume(key)
  return decision.ok ? null : rateLimitedResponse(message, decision.retryAfterMs)
}

// ── CSRF ────────────────────────────────────────────────────────────────────

/**
 * Reject a state-changing request whose `Origin` doesn't match the portal.
 * Safe methods are not checked — they don't mutate state by definition.
 */
export function hubOriginViolation(req: Request): Response | null {
  if (!isStateChangingMethod(req.method)) return null
  if (originAllowed(req)) return null
  return jsonResponse({ error: 'Forbidden: invalid origin' }, { status: 403 })
}

// ── Session cookie ──────────────────────────────────────────────────────────

/**
 * True when the browser reached us over HTTPS. A configured public origin is
 * authoritative, so the `Secure` flag survives a TLS-terminating edge that
 * hands the container plain HTTP — no untrusted `X-Forwarded-Proto` is read.
 */
function requestIsHttps(req: Request): boolean {
  if (publicOriginIsHttps()) return true
  return req.url.startsWith('https://')
}

function cookieAttributes(secure: boolean): string {
  // HttpOnly     — the portal's own JS never needs to read it (XSS mitigation)
  // SameSite=Lax — withheld from a POST issued by another site; the Origin
  //                check above covers the same-site-different-subdomain hole
  //                that Lax leaves open
  // Secure       — HTTPS only, when we know we're on HTTPS
  const base = `Path=/; HttpOnly; SameSite=Lax`
  return secure ? `${base}; Secure` : base
}

export function hubSessionCookie(req: Request, token: string, expiresAt: Date): string {
  return `${HUB_SESSION_COOKIE_NAME}=${token}; ${cookieAttributes(requestIsHttps(req))}; Expires=${expiresAt.toUTCString()}`
}

export function clearHubSessionCookie(req: Request): string {
  return `${HUB_SESSION_COOKIE_NAME}=; ${cookieAttributes(requestIsHttps(req))}; Max-Age=0`
}

/**
 * Read the session token out of the `Cookie` header.
 *
 * Splits on the FIRST `=` only: a cookie value may legally contain more, and
 * a naive `split('=')` would silently hand back a truncated token.
 */
export function readHubSessionToken(req: Request): string | null {
  const header = req.headers.get('Cookie')
  if (!header) return null
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=')
    if (separator === -1) continue
    if (pair.slice(0, separator).trim() !== HUB_SESSION_COOKIE_NAME) continue
    const value = pair.slice(separator + 1).trim()
    return value === '' ? null : value
  }
  return null
}

// ── Content Security Policy ─────────────────────────────────────────────────

export function createCspNonce(): string {
  return randomBytes(16).toString('base64')
}

/**
 * The portal loads exactly four things: its own inline style, its own inline
 * script, its own font, and its own API. Everything else is denied outright.
 *
 * `form-action 'self'` rather than `'none'`: the login form is submitted by
 * JS with `preventDefault()`, but if the script fails to load the browser
 * falls back to a native submit, and blocking that would be a silent dead end.
 */
export function hubPortalCsp(nonce: string): string {
  return [
    `default-src 'none'`,
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `img-src 'none'`,
    `form-action 'self'`,
    `base-uri 'none'`,
    `frame-ancestors 'none'`,
  ].join('; ')
}
