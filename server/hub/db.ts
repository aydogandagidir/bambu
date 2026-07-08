import { createSqliteClient } from '../db/sqlite'
import type { DbClient } from '../db/client'

export interface HubUser {
  id: string
  email: string
  passwordHash: string
  createdAt: string
}

export interface HubSession {
  id: string
  userId: string
  expiresAt: number
}

export interface Tenant {
  id: string
  domain: string
  email: string
  createdAt: string
  status: 'active' | 'suspended'
  ownerId: string
}

export class HubDatabase {
  private db: DbClient

  constructor(filename: string) {
    this.db = createSqliteClient(filename)
    this.initSchema()
  }

  private async initSchema() {
    await this.db.unsafe(`
      CREATE TABLE IF NOT EXISTS hub_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )
    `)
    await this.db.unsafe(`
      CREATE TABLE IF NOT EXISTS hub_sessions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        FOREIGN KEY (userId) REFERENCES hub_users(id) ON DELETE CASCADE
      )
    `)
    await this.db.unsafe(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        domain TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        ownerId TEXT REFERENCES hub_users(id)
      )
    `)
    try {
      await this.db.unsafe(`ALTER TABLE tenants ADD COLUMN ownerId TEXT REFERENCES hub_users(id)`)
    } catch (e) {
      // Ignore error if column already exists
    }
  }

  // --- Users ---
  async getHubUserByEmail(email: string): Promise<HubUser | null> {
    const result = await this.db`SELECT * FROM hub_users WHERE email = ${email}`
    return (result.rows[0] as unknown as HubUser) ?? null
  }

  async getHubUserById(id: string): Promise<HubUser | null> {
    const result = await this.db`SELECT * FROM hub_users WHERE id = ${id}`
    return (result.rows[0] as unknown as HubUser) ?? null
  }

  async createHubUser(user: HubUser): Promise<void> {
    await this.db`
      INSERT INTO hub_users (id, email, passwordHash, createdAt)
      VALUES (${user.id}, ${user.email}, ${user.passwordHash}, ${user.createdAt})
    `
  }

  // --- Sessions ---
  async createHubSession(session: HubSession): Promise<void> {
    await this.db`
      INSERT INTO hub_sessions (id, userId, expiresAt)
      VALUES (${session.id}, ${session.userId}, ${session.expiresAt})
    `
  }

  async getHubSession(id: string): Promise<HubSession | null> {
    const result = await this.db`SELECT * FROM hub_sessions WHERE id = ${id}`
    return (result.rows[0] as unknown as HubSession) ?? null
  }

  async deleteHubSession(id: string): Promise<void> {
    await this.db`DELETE FROM hub_sessions WHERE id = ${id}`
  }

  // --- Tenants ---
  async getTenantByDomain(domain: string): Promise<Tenant | null> {
    const result = await this.db`SELECT * FROM tenants WHERE domain = ${domain}`
    return (result.rows[0] as unknown as Tenant) ?? null
  }

  async getTenantsByOwnerId(ownerId: string): Promise<Tenant[]> {
    const result = await this.db`SELECT * FROM tenants WHERE ownerId = ${ownerId} ORDER BY createdAt DESC`
    return result.rows as unknown as Tenant[]
  }

  async createTenant(tenant: Tenant): Promise<void> {
    await this.db`
      INSERT INTO tenants (id, domain, email, createdAt, status, ownerId)
      VALUES (${tenant.id}, ${tenant.domain}, ${tenant.email}, ${tenant.createdAt}, ${tenant.status}, ${tenant.ownerId})
    `
  }
}

// In-memory cache of tenant DB connections
const tenantDbCache = new Map<string, DbClient>()

/**
 * Get or create a DB connection for a specific tenant ID.
 */
export function getTenantDb(tenantId: string, dataDir: string): DbClient {
  if (tenantDbCache.has(tenantId)) {
    return tenantDbCache.get(tenantId)!
  }
  
  // For SQLite, the database file will be tenant_<id>.db in the dataDir
  const dbPath = `${dataDir}/tenant_${tenantId}.db`
  const db = createSqliteClient(dbPath)
  
  tenantDbCache.set(tenantId, db)
  return db
}
