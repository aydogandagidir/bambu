import { HubDatabase, getTenantDb, type Tenant, type HubUser } from './db'
import { Type } from '@sinclair/typebox'
import {
  RequestBodyTooLargeError,
  badRequest,
  jsonResponse,
  methodNotAllowed,
  payloadTooLarge,
  readValidatedBody,
} from '../http'
import { runMigrations } from '../db/runMigrations'
import { sqliteMigrations } from '../db/migrations-sqlite'
import { nanoid } from 'nanoid'
import { createSite } from '../repositories/setup'
import { createDataRow } from '../repositories/data'
import { createNode } from '@core/page-tree'
import { pageToCells } from '../../src/core/data/pageFromRow'
import type { Page } from '@core/page-tree'
import { renderHubPortal } from './portalPage'
import { HUB_FONT_PATH, hubFontFile } from './theme'
import { SUBDOMAIN_PATTERN, isReservedSubdomain, workspaceDomain } from './domain'
import {
  createSessionToken,
  getDummyPasswordHash,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from '../auth/tokens'
import { clientIp } from '../auth/security'
import {
  HUB_SESSION_TTL_MS,
  MAX_AUTH_BODY_BYTES,
  clearHubSessionCookie,
  createCspNonce,
  enforceRateLimit,
  hubDeployRateLimit,
  hubLoginPerIpRateLimit,
  hubLoginRateLimit,
  hubOriginViolation,
  hubPortalCsp,
  hubRegisterRateLimit,
  hubSessionCookie,
  readHubSessionToken,
} from './security'

let hubDb: HubDatabase | null = null

export async function initHubDb(dataDir: string) {
  hubDb = await HubDatabase.open(`${dataDir}/hub.db`)
}

function requireHubDb(): HubDatabase {
  if (!hubDb) throw new Error('Hub database used before initHubDb()')
  return hubDb
}

/**
 * Email is bounded but not format-checked: TypeBox's `format` keyword is not
 * registered in this codebase's compiler, so `format: 'email'` would reject
 * valid addresses. The browser's `type="email"` does the shape check; the
 * server only guarantees the value is a sane size.
 */
const CredentialsSchema = Type.Object({
  email: Type.String({ minLength: 3, maxLength: 320 }),
  rawPassword: Type.String({ minLength: 12, maxLength: 200 }),
})

const CreateWorkspaceSchema = Type.Object({
  subdomain: Type.String({ pattern: SUBDOMAIN_PATTERN }),
})

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Mint a session for `userId` and return the `Set-Cookie` header value. The raw
 * token goes to the browser; only its hash is persisted.
 */
async function startSession(req: Request, userId: string): Promise<string> {
  const token = createSessionToken()
  const expiresAt = new Date(Date.now() + HUB_SESSION_TTL_MS)
  await requireHubDb().createHubSession({
    idHash: await hashSessionToken(token),
    userId,
    expiresAt: expiresAt.getTime(),
  })
  return hubSessionCookie(req, token, expiresAt)
}

async function getHubUserFromReq(req: Request): Promise<HubUser | null> {
  const token = readHubSessionToken(req)
  if (!token) return null
  const session = await requireHubDb().getHubSession(await hashSessionToken(token))
  if (!session || session.expiresAt < Date.now()) return null
  return await requireHubDb().getHubUserById(session.userId)
}

/**
 * Hub endpoints answer with the CMS `{ error }` envelope so the portal renders
 * one string it can trust. Internal failures are logged, never echoed — a raw
 * `err.message` here is a SQL/filesystem disclosure on a public host.
 */
function internalError(err: unknown): Response {
  if (err instanceof RequestBodyTooLargeError) return payloadTooLarge('Request body too large.')
  console.error('[hub]', err)
  return jsonResponse({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

async function handleRegister(req: Request): Promise<Response> {
  const ip = clientIp(req)
  const throttled = enforceRateLimit(
    hubRegisterRateLimit,
    ip,
    'Too many accounts created. Try again later.',
  )
  if (throttled) return throttled

  const body = await readValidatedBody(req, CredentialsSchema, { maxBytes: MAX_AUTH_BODY_BYTES })
  if (!body) return badRequest('Enter a valid email and a password of at least 12 characters.')

  const email = normalizeEmail(body.email)
  if (await requireHubDb().getHubUserByEmail(email)) {
    return jsonResponse({ error: 'Email in use' }, { status: 409 })
  }

  const user: HubUser = {
    id: crypto.randomUUID(),
    email,
    passwordHash: await hashPassword(body.rawPassword),
    createdAt: new Date().toISOString(),
  }
  await requireHubDb().createHubUser(user)

  return jsonResponse(
    { success: true },
    { status: 201, headers: { 'Set-Cookie': await startSession(req, user.id) } },
  )
}

async function handleLogin(req: Request): Promise<Response> {
  const ip = clientIp(req)
  const ipThrottled = enforceRateLimit(
    hubLoginPerIpRateLimit,
    ip,
    'Too many login attempts. Try again later.',
  )
  if (ipThrottled) return ipThrottled

  const body = await readValidatedBody(req, CredentialsSchema, { maxBytes: MAX_AUTH_BODY_BYTES })
  // A malformed body must not skip the per-(ip, email) bucket, but there is no
  // email to key it on — the per-IP layer above already covered this caller.
  if (!body) return jsonResponse({ error: 'Invalid credentials' }, { status: 401 })

  const email = normalizeEmail(body.email)
  const tupleKey = `${ip ?? 'unknown'}|${email}`
  const tupleThrottled = enforceRateLimit(
    hubLoginRateLimit,
    tupleKey,
    'Too many login attempts. Try again later.',
  )
  if (tupleThrottled) return tupleThrottled

  // Constant-time path: ALWAYS run argon2id, even with no matching user.
  // Otherwise "no such account" returns in ~5ms and "wrong password" in
  // ~100ms — a timing oracle for enumerating who has a Bambu account.
  const user = await requireHubDb().getHubUserByEmail(email)
  const verifiedHash = user?.passwordHash ?? (await getDummyPasswordHash())
  const passwordOk = await verifyPassword(body.rawPassword, verifiedHash)
  if (!user || !passwordOk) return jsonResponse({ error: 'Invalid credentials' }, { status: 401 })

  hubLoginRateLimit.reset(tupleKey)
  if (ip) hubLoginPerIpRateLimit.reset(ip)

  return jsonResponse(
    { success: true },
    { status: 200, headers: { 'Set-Cookie': await startSession(req, user.id) } },
  )
}

async function handleLogout(req: Request): Promise<Response> {
  const token = readHubSessionToken(req)
  if (token) await requireHubDb().deleteHubSession(await hashSessionToken(token))
  return jsonResponse(
    { success: true },
    { status: 200, headers: { 'Set-Cookie': clearHubSessionCookie(req) } },
  )
}

async function handleCreateWorkspace(req: Request, user: HubUser, dataDir: string): Promise<Response> {
  // Each deploy writes a database file and runs every migration against it —
  // the most expensive thing an authenticated caller can ask of this process.
  const throttled = enforceRateLimit(
    hubDeployRateLimit,
    user.id,
    'Too many workspaces deployed. Try again later.',
  )
  if (throttled) return throttled

  const body = await readValidatedBody(req, CreateWorkspaceSchema, { maxBytes: MAX_AUTH_BODY_BYTES })
  if (!body) return badRequest('Use lowercase letters, numbers and hyphens only.')
  const { subdomain } = body
  if (isReservedSubdomain(subdomain)) return badRequest('That subdomain is reserved.')

  const domain = workspaceDomain(subdomain)
  if (await requireHubDb().getTenantByDomain(domain)) {
    return jsonResponse({ error: 'Subdomain already in use' }, { status: 409 })
  }

  const tenantId = crypto.randomUUID()
  const tenant: Tenant = {
    id: tenantId,
    domain,
    email: user.email,
    createdAt: new Date().toISOString(),
    status: 'active',
    ownerId: user.id,
  }
  await requireHubDb().createTenant(tenant)

  const db = getTenantDb(tenantId, dataDir)
  await runMigrations(db, sqliteMigrations)

  // Auto-provision owner in tenant DB using hub password hash.
  const rolesRes = await db`SELECT id FROM roles WHERE slug = 'owner'`
  if (rolesRes.rows.length > 0) {
    const ownerRoleId = rolesRes.rows[0].id
    await db`
      INSERT INTO users (
        id, email, email_normalized, display_name, password_hash, status, role_id, created_at, updated_at
      ) VALUES (
        ${user.id}, ${user.email}, ${normalizeEmail(user.email)}, 'Workspace Owner', ${user.passwordHash}, 'active', ${ownerRoleId}, ${tenant.createdAt}, ${tenant.createdAt}
      )
    `
  }

  // Complete the setup by creating the site row
  await createSite(db, subdomain, {})

  // Seed a starter homepage
  const rootNode = createNode('base.body')
  const homePage: Page = {
    id: nanoid(),
    title: 'Home',
    slug: 'index',
    nodes: { [rootNode.id]: rootNode },
    rootNodeId: rootNode.id,
  }
  await createDataRow(
    db,
    { id: homePage.id, tableId: 'pages', cells: pageToCells(homePage), slug: homePage.slug },
    user.id,
  )

  return jsonResponse({ success: true, tenant }, { status: 201 })
}

export async function handleHubRequest(req: Request, dataDir: string): Promise<Response> {
  const url = new URL(req.url)

  if (req.method === 'GET' && url.pathname === HUB_FONT_PATH) {
    const font = hubFontFile()
    if (!(await font.exists())) return jsonResponse({ error: 'Font not found' }, { status: 404 })
    return new Response(font, {
      headers: {
        'Content-Type': 'font/woff2',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  // CSRF defense in depth. `SameSite=Lax` withholds the cookie from a request
  // issued by another site, but a workspace at `acme.bluedev.dev` counts as the
  // SAME site as the portal, and its HTML is owner-authored — this check is
  // what stops that page forging a deploy.
  const originViolation = hubOriginViolation(req)
  if (originViolation) return originViolation

  try {
    if (req.method === 'POST' && url.pathname === '/api/hub/auth/register') {
      return await handleRegister(req)
    }

    if (req.method === 'POST' && url.pathname === '/api/hub/auth/login') {
      return await handleLogin(req)
    }

    if (req.method === 'POST' && url.pathname === '/api/hub/auth/logout') {
      return await handleLogout(req)
    }

    if (url.pathname === '/api/hub/workspaces') {
      const user = await getHubUserFromReq(req)
      if (!user) return jsonResponse({ error: 'Unauthorized' }, { status: 401 })

      if (req.method === 'GET') {
        return jsonResponse(await requireHubDb().getTenantsByOwnerId(user.id), { status: 200 })
      }
      if (req.method === 'POST') {
        return await handleCreateWorkspace(req, user, dataDir)
      }
      return methodNotAllowed()
    }

    const activeUser = await getHubUserFromReq(req)
    const nonce = createCspNonce()
    return new Response(renderHubPortal({ authenticated: activeUser !== null, nonce }), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': hubPortalCsp(nonce),
      },
    })
  } catch (err) {
    return internalError(err)
  }
}

export async function resolveTenantDb(host: string, dataDir: string) {
  if (!hubDb) return null
  const tenant = await hubDb.getTenantByDomain(host)
  if (!tenant || tenant.status !== 'active') return null
  return getTenantDb(tenant.id, dataDir)
}
