/**
 * Hub portal security layer.
 *
 * The attack this file exists for: a tenant site (`acme.bluedev.dev`) and the
 * portal (`app.bluedev.dev`) are same-site, so `SameSite=Lax` still attaches
 * the session cookie to a POST issued from a tenant page — and that page's
 * HTML is authored by its owner through the CMS. Only the Origin check stops
 * it forging a workspace deploy.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { RateLimiter } from '../../auth/rateLimit'
import { configurePublicOrigins, resetPublicOrigins, stampSocketIp } from '../../auth/security'
import {
  HUB_SESSION_COOKIE_NAME,
  clearHubSessionCookie,
  createCspNonce,
  enforceRateLimit,
  hubOriginViolation,
  hubPortalCsp,
  hubSessionCookie,
  readHubSessionToken,
} from '../security'

const PORTAL = 'http://app.bluedev.dev/api/hub/workspaces'

/**
 * Headers are set AFTER construction: the test preload swaps in a Headers
 * implementation that drops `host` / `origin` / `cookie` when they arrive
 * through `RequestInit`. Every other server test builds requests this way.
 */
function request(init: { method?: string; origin?: string; url?: string; cookie?: string } = {}) {
  const req = new Request(init.url ?? PORTAL, { method: init.method ?? 'POST' })
  req.headers.set('host', 'app.bluedev.dev')
  if (init.origin) req.headers.set('origin', init.origin)
  if (init.cookie) req.headers.set('cookie', init.cookie)
  return req
}

afterEach(() => {
  resetPublicOrigins()
})

// ─────────────────────────────────────────────────────────────────────────────
// CSRF
// ─────────────────────────────────────────────────────────────────────────────

describe('hubOriginViolation', () => {
  it('rejects a POST forged from a tenant site on the same registrable domain', () => {
    const res = hubOriginViolation(request({ origin: 'https://acme.bluedev.dev' }))
    expect(res?.status).toBe(403)
  })

  it('rejects a POST from an unrelated origin', () => {
    expect(hubOriginViolation(request({ origin: 'https://evil.example' }))?.status).toBe(403)
  })

  it('allows a POST from the portal itself', () => {
    expect(hubOriginViolation(request({ origin: 'http://app.bluedev.dev' }))).toBeNull()
    expect(hubOriginViolation(request({ origin: 'https://app.bluedev.dev' }))).toBeNull()
  })

  it('allows a configured public origin', () => {
    configurePublicOrigins(['https://bambu.bluedev.dev'])
    expect(hubOriginViolation(request({ origin: 'https://bambu.bluedev.dev' }))).toBeNull()
  })

  it('allows an Origin-less request — curl and server-to-server, never a browser POST', () => {
    expect(hubOriginViolation(request())).toBeNull()
  })

  it('does not check safe methods', () => {
    const get = request({ method: 'GET', origin: 'https://evil.example' })
    expect(hubOriginViolation(get)).toBeNull()
  })

  it('checks every state-changing method', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = hubOriginViolation(request({ method, origin: 'https://evil.example' }))
      expect(res?.status).toBe(403)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────────────────────

describe('enforceRateLimit', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter({ limit: 2, windowMs: 60_000 })
  })

  it('lets the first `limit` attempts through, then answers 429', () => {
    expect(enforceRateLimit(limiter, '1.2.3.4', 'slow down')).toBeNull()
    expect(enforceRateLimit(limiter, '1.2.3.4', 'slow down')).toBeNull()
    expect(enforceRateLimit(limiter, '1.2.3.4', 'slow down')?.status).toBe(429)
  })

  it('sends Retry-After in seconds', async () => {
    enforceRateLimit(limiter, 'ip', 'slow down')
    enforceRateLimit(limiter, 'ip', 'slow down')
    const blocked = enforceRateLimit(limiter, 'ip', 'slow down')
    expect(Number(blocked?.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(await blocked?.json()).toEqual({ error: 'slow down' })
  })

  it('keys buckets independently', () => {
    enforceRateLimit(limiter, 'a', 'slow down')
    enforceRateLimit(limiter, 'a', 'slow down')
    expect(enforceRateLimit(limiter, 'b', 'slow down')).toBeNull()
  })

  it('skips the limiter when no client IP is available, rather than sharing one bucket', () => {
    for (let i = 0; i < 10; i++) expect(enforceRateLimit(limiter, null, 'slow down')).toBeNull()
  })

  it('is reset by a successful login', () => {
    enforceRateLimit(limiter, 'ip', 'slow down')
    enforceRateLimit(limiter, 'ip', 'slow down')
    limiter.reset('ip')
    expect(enforceRateLimit(limiter, 'ip', 'slow down')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Session cookie
// ─────────────────────────────────────────────────────────────────────────────

describe('hubSessionCookie', () => {
  const expires = new Date('2030-01-01T00:00:00Z')

  it('is HttpOnly, SameSite=Lax and site-wide', () => {
    const cookie = hubSessionCookie(request({ url: 'http://app.bluedev.dev/' }), 'tok', expires)
    expect(cookie).toContain(`${HUB_SESSION_COOKIE_NAME}=tok`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
  })

  it('omits Secure on a plain-HTTP request with no configured origin', () => {
    const cookie = hubSessionCookie(request({ url: 'http://app.bluedev.dev/' }), 'tok', expires)
    expect(cookie).not.toContain('Secure')
  })

  it('sets Secure from the configured public origin, even when the edge hands us HTTP', () => {
    configurePublicOrigins(['https://app.bluedev.dev'])
    const cookie = hubSessionCookie(request({ url: 'http://app.bluedev.dev/' }), 'tok', expires)
    expect(cookie).toContain('Secure')
  })

  it('clears with the same attributes so the browser matches the cookie', () => {
    const cleared = clearHubSessionCookie(request({ url: 'http://app.bluedev.dev/' }))
    expect(cleared).toContain(`${HUB_SESSION_COOKIE_NAME}=;`)
    expect(cleared).toContain('Max-Age=0')
    expect(cleared).toContain('HttpOnly')
  })
})

describe('readHubSessionToken', () => {
  it('reads the token from a multi-cookie header', () => {
    const req = request({ cookie: `theme=dark; ${HUB_SESSION_COOKIE_NAME}=abc123; other=1` })
    expect(readHubSessionToken(req)).toBe('abc123')
  })

  it('splits on the first `=` only, so a value containing one survives intact', () => {
    const req = request({ cookie: `${HUB_SESSION_COOKIE_NAME}=abc==` })
    expect(readHubSessionToken(req)).toBe('abc==')
  })

  it('returns null with no cookie header, no match, or an empty value', () => {
    expect(readHubSessionToken(request())).toBeNull()
    expect(readHubSessionToken(request({ cookie: 'theme=dark' }))).toBeNull()
    expect(readHubSessionToken(request({ cookie: `${HUB_SESSION_COOKIE_NAME}=` }))).toBeNull()
  })

  it('does not match a cookie whose name merely ends with the session name', () => {
    const req = request({ cookie: `not_${HUB_SESSION_COOKIE_NAME}=abc123` })
    expect(readHubSessionToken(req)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CSP
// ─────────────────────────────────────────────────────────────────────────────

describe('hubPortalCsp', () => {
  it('denies everything by default and allows only the portal’s own four sources', () => {
    const csp = hubPortalCsp('n0nce')
    expect(csp).toContain(`default-src 'none'`)
    expect(csp).toContain(`script-src 'nonce-n0nce'`)
    expect(csp).toContain(`style-src 'nonce-n0nce'`)
    expect(csp).toContain(`font-src 'self'`)
    expect(csp).toContain(`connect-src 'self'`)
  })

  it('never allows inline script — that is the whole point of the nonce', () => {
    expect(hubPortalCsp(createCspNonce())).not.toContain('unsafe-inline')
    expect(hubPortalCsp(createCspNonce())).not.toContain('unsafe-eval')
  })

  it('carries its own frame-ancestors, so applySecurityHeaders leaves it alone', () => {
    expect(hubPortalCsp('n')).toContain(`frame-ancestors 'none'`)
  })

  it('mints a fresh 128-bit nonce per response', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createCspNonce()))
    expect(nonces.size).toBe(50)
    expect(Buffer.from([...nonces][0]!, 'base64').length).toBe(16)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Client IP attribution — the rate-limit key depends on it
// ─────────────────────────────────────────────────────────────────────────────

describe('rate-limit keying', () => {
  it('sees the socket IP the Bun.serve boundary stamped before hub routing', async () => {
    const { clientIp } = await import('../../auth/security')
    const req = request()
    stampSocketIp(req, '203.0.113.9')
    expect(clientIp(req)).toBe('203.0.113.9')
  })
})
