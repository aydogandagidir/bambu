import { createSqliteClient } from '../db/sqlite'
import type { DbClient } from '../db/client'

export interface HubUser {
  id: string
  email: string
  passwordHash: string
  createdAt: string
}

/**
 * A live portal session.
 *
 * `idHash` is `sha256(token)` — the raw token exists only in the user's cookie.
 * A dump of `hub.db` therefore yields no usable session, the same guarantee the
 * CMS `sessions` table makes with its `id_hash` column.
 */
export interface HubSession {
  idHash: string
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
  private readonly db: DbClient

  private constructor(db: DbClient) {
    this.db = db
  }

  /**
   * Open the hub database and bring its schema up to date before any request
   * can reach it. The schema work is awaited here rather than fired off from a
   * constructor — a floating `initSchema()` promise let the first request race
   * table creation.
   */
  static async open(filename: string): Promise<HubDatabase> {
    const hub = new HubDatabase(createSqliteClient(filename))
    await hub.migrate()
    return hub
  }

  private async migrate() {
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
        idHash TEXT PRIMARY KEY,
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
    } catch (_err) {
      // The column already exists — SQLite has no `ADD COLUMN IF NOT EXISTS`.
    }
    try {
      // Sessions used to be keyed by the raw token. Rename the column in place
      // (non-destructive) so a pre-existing hub.db keeps its rows; those rows
      // hold plaintext ids that no longer match a `sha256(token)` lookup, so
      // they are inert and age out of `deleteExpiredSessions` within the TTL.
      // Everyone gets logged out once. That is the price of not storing
      // bearer tokens at rest.
      await this.db.unsafe(`ALTER TABLE hub_sessions RENAME COLUMN id TO idHash`)
    } catch (_err) {
      // Fresh database — the table was created with `idHash` above.
    }
    await this.deleteExpiredSessions()
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
      INSERT INTO hub_sessions (idHash, userId, expiresAt)
      VALUES (${session.idHash}, ${session.userId}, ${session.expiresAt})
    `
  }

  async getHubSession(idHash: string): Promise<HubSession | null> {
    const result = await this.db`SELECT * FROM hub_sessions WHERE idHash = ${idHash}`
    return (result.rows[0] as unknown as HubSession) ?? null
  }

  async deleteHubSession(idHash: string): Promise<void> {
    await this.db`DELETE FROM hub_sessions WHERE idHash = ${idHash}`
  }

  /** Housekeeping on boot — expired rows are dead weight, never valid sessions. */
  async deleteExpiredSessions(now: number = Date.now()): Promise<void> {
    await this.db`DELETE FROM hub_sessions WHERE expiresAt < ${now}`
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
