import { HubDatabase, getTenantDb, type Tenant, type HubUser } from './db'
import { Type } from '@sinclair/typebox'
import { badRequest, jsonResponse, readValidatedBody } from '../http'
import { runMigrations } from '../db/runMigrations'
import { sqliteMigrations } from '../db/migrations-sqlite'
import { password } from 'bun'
import { nanoid } from 'nanoid'
import { createSite } from '../repositories/setup'
import { createDataRow } from '../repositories/data'
import { createNode } from '@core/page-tree'
import { pageToCells } from '../../src/core/data/pageFromRow'
import type { Page } from '@core/page-tree'
import { renderHubPortal } from './portalPage'
import { HUB_FONT_PATH, hubFontFile } from './theme'
import { SUBDOMAIN_PATTERN, isReservedSubdomain, workspaceDomain } from './domain'

let hubDb: HubDatabase | null = null

export function initHubDb(dataDir: string) {
  hubDb = new HubDatabase(`${dataDir}/hub.db`)
}

const CredentialsSchema = Type.Object({ email: Type.String(), rawPassword: Type.String() })
const CreateWorkspaceSchema = Type.Object({ subdomain: Type.String({ pattern: SUBDOMAIN_PATTERN }) })

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

function sessionCookie(sessionId: string): string {
  return `hub_session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
}

function parseCookies(req: Request) {
  const cookieHeader = req.headers.get('Cookie')
  if (!cookieHeader) return {}
  return Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=')))
}

async function getHubUserFromReq(req: Request): Promise<HubUser | null> {
  const cookies = parseCookies(req)
  const sessionId = cookies['hub_session_id']
  if (!sessionId) return null
  const session = await hubDb!.getHubSession(sessionId)
  if (!session || session.expiresAt < Date.now()) return null
  return await hubDb!.getHubUserById(session.userId)
}

/**
 * Hub endpoints answer with the CMS `{ error }` envelope so the portal renders
 * one string it can trust. Internal failures are logged, never echoed — a raw
 * `err.message` here is a SQL/filesystem disclosure on a public host.
 */
function internalError(err: unknown): Response {
  console.error('[hub]', err)
  return jsonResponse({ error: 'Something went wrong. Please try again.' }, { status: 500 })
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

  // Auth API
  if (req.method === 'POST' && url.pathname === '/api/hub/auth/register') {
    try {
      const body = await readValidatedBody(req, CredentialsSchema)
      if (!body) return badRequest('Email and password are required.')
      const { email, rawPassword } = body

      const existing = await hubDb!.getHubUserByEmail(email)
      if (existing) return jsonResponse({ error: 'Email in use' }, { status: 409 })

      const user: HubUser = {
        id: crypto.randomUUID(),
        email,
        passwordHash: await password.hash(rawPassword),
        createdAt: new Date().toISOString()
      }
      await hubDb!.createHubUser(user)

      const sessionId = crypto.randomUUID()
      await hubDb!.createHubSession({
        id: sessionId,
        userId: user.id,
        expiresAt: Date.now() + SESSION_TTL_MS
      })

      return jsonResponse({ success: true }, {
        status: 201,
        headers: { 'Set-Cookie': sessionCookie(sessionId) }
      })
    } catch (err) { return internalError(err) }
  }

  if (req.method === 'POST' && url.pathname === '/api/hub/auth/login') {
    try {
      const body = await readValidatedBody(req, CredentialsSchema)
      if (!body) return jsonResponse({ error: 'Invalid credentials' }, { status: 401 })
      const { email, rawPassword } = body
      const user = await hubDb!.getHubUserByEmail(email)
      if (!user) return jsonResponse({ error: 'Invalid credentials' }, { status: 401 })

      const isValid = await password.verify(rawPassword, user.passwordHash)
      if (!isValid) return jsonResponse({ error: 'Invalid credentials' }, { status: 401 })

      const sessionId = crypto.randomUUID()
      await hubDb!.createHubSession({
        id: sessionId,
        userId: user.id,
        expiresAt: Date.now() + SESSION_TTL_MS
      })

      return jsonResponse({ success: true }, {
        status: 200,
        headers: { 'Set-Cookie': sessionCookie(sessionId) }
      })
    } catch (err) { return internalError(err) }
  }

  if (req.method === 'POST' && url.pathname === '/api/hub/auth/logout') {
    const cookies = parseCookies(req)
    if (cookies['hub_session_id']) {
      await hubDb!.deleteHubSession(cookies['hub_session_id'])
    }
    return jsonResponse({ success: true }, {
      status: 200,
      headers: { 'Set-Cookie': `hub_session_id=; Path=/; HttpOnly; Max-Age=0` }
    })
  }

  if (req.method === 'GET' && url.pathname === '/api/hub/workspaces') {
    const user = await getHubUserFromReq(req)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
    const workspaces = await hubDb!.getTenantsByOwnerId(user.id)
    return jsonResponse(workspaces, { status: 200 })
  }

  if (req.method === 'POST' && url.pathname === '/api/hub/workspaces') {
    try {
      const user = await getHubUserFromReq(req)
      if (!user) return jsonResponse({ error: 'Unauthorized' }, { status: 401 })

      const body = await readValidatedBody(req, CreateWorkspaceSchema)
      if (!body) return badRequest('Use lowercase letters, numbers and hyphens only.')
      const { subdomain } = body
      if (isReservedSubdomain(subdomain)) return badRequest('That subdomain is reserved.')

      const domain = workspaceDomain(subdomain)
      if (await hubDb!.getTenantByDomain(domain)) {
        return jsonResponse({ error: 'Subdomain already in use' }, { status: 409 })
      }

      const tenantId = crypto.randomUUID()
      const tenant: Tenant = {
        id: tenantId,
        domain,
        email: user.email,
        createdAt: new Date().toISOString(),
        status: 'active',
        ownerId: user.id
      }
      await hubDb!.createTenant(tenant)

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
            ${user.id}, ${user.email}, ${user.email.toLowerCase()}, 'Workspace Owner', ${user.passwordHash}, 'active', ${ownerRoleId}, ${tenant.createdAt}, ${tenant.createdAt}
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
    } catch (err) { return internalError(err) }
  }

  const activeUser = await getHubUserFromReq(req)
  return new Response(renderHubPortal({ authenticated: activeUser !== null }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}

export async function resolveTenantDb(host: string, dataDir: string) {
  if (!hubDb) return null
  const tenant = await hubDb.getTenantByDomain(host)
  if (!tenant || tenant.status !== 'active') return null
  return getTenantDb(tenant.id, dataDir)
}
