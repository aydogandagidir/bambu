import { createSqliteClient } from '../db/sqlite'
import type { DbClient } from '../db/client'

export interface Tenant {
  id: string
  domain: string
  email: string
  createdAt: string
  status: 'active' | 'suspended'
}

export class HubDatabase {
  private db: DbClient

  constructor(filename: string) {
    this.db = createSqliteClient(filename)
    this.initSchema()
  }

  private async initSchema() {
    await this.db.unsafe(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        domain TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      )
    `)
  }

  async getTenantByDomain(domain: string): Promise<Tenant | null> {
    const result = await this.db`SELECT * FROM tenants WHERE domain = ${domain}`
    return (result.rows[0] as unknown as Tenant) ?? null
  }

  async createTenant(tenant: Tenant): Promise<void> {
    await this.db`
      INSERT INTO tenants (id, domain, email, createdAt, status)
      VALUES (${tenant.id}, ${tenant.domain}, ${tenant.email}, ${tenant.createdAt}, ${tenant.status})
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
