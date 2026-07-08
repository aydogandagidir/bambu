/**
 * Hub database schema.
 *
 * The interesting case is the in-place upgrade: `hub_sessions` used to be keyed
 * by the raw session token. Renaming that column must not drop the table, and a
 * fresh database must not trip over the rename.
 */

import { describe, it, expect, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HubDatabase } from '../db'
import { createSqliteClient } from '../../db/sqlite'
import { createSessionToken, hashSessionToken } from '../../auth/tokens'

const tempDirs: string[] = []

function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hub-db-'))
  tempDirs.push(dir)
  return join(dir, 'hub.db')
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()!
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch (_err) {
      // `DbClient` exposes no `close()`, so on Windows the SQLite handle keeps
      // the file locked until the test process exits. The OS reclaims %TEMP%.
    }
  }
})

async function seedLegacySchema(path: string, rawToken: string) {
  const db = createSqliteClient(path)
  await db.unsafe(`
    CREATE TABLE hub_users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL, createdAt TEXT NOT NULL
    )
  `)
  // The old shape: primary key `id` holding the bearer token verbatim.
  await db.unsafe(`
    CREATE TABLE hub_sessions (
      id TEXT PRIMARY KEY, userId TEXT NOT NULL, expiresAt INTEGER NOT NULL
    )
  `)
  await db`INSERT INTO hub_users (id, email, passwordHash, createdAt) VALUES ('u1', 'a@b.co', 'x', '2026-01-01')`
  const notYetExpired = Date.now() + 60_000
  await db`INSERT INTO hub_sessions (id, userId, expiresAt) VALUES (${rawToken}, 'u1', ${notYetExpired})`
}

describe('HubDatabase.open', () => {
  it('creates a usable schema on a fresh database', async () => {
    const hub = await HubDatabase.open(tempDbPath())
    const token = createSessionToken()
    const idHash = await hashSessionToken(token)

    await hub.createHubUser({ id: 'u1', email: 'a@b.co', passwordHash: 'x', createdAt: 'now' })
    await hub.createHubSession({ idHash, userId: 'u1', expiresAt: Date.now() + 60_000 })

    expect((await hub.getHubSession(idHash))?.userId).toBe('u1')
  })

  it('stores only the hash — the raw token never lands in the database', async () => {
    const path = tempDbPath()
    const hub = await HubDatabase.open(path)
    const token = createSessionToken()
    const idHash = await hashSessionToken(token)

    await hub.createHubUser({ id: 'u1', email: 'a@b.co', passwordHash: 'x', createdAt: 'now' })
    await hub.createHubSession({ idHash, userId: 'u1', expiresAt: Date.now() + 60_000 })

    // A dump of hub.db must not yield a usable bearer token.
    const rows = await createSqliteClient(path)`SELECT idHash FROM hub_sessions`
    expect(rows.rows.map((row) => row.idHash)).toEqual([idHash])
    expect(idHash).not.toBe(token)
    expect(await hub.getHubSession(token)).toBeNull()
  })

  it('renames the legacy `id` column in place, keeping the table and its rows', async () => {
    const path = tempDbPath()
    const legacyToken = 'legacy-plaintext-session-id'
    await seedLegacySchema(path, legacyToken)

    const hub = await HubDatabase.open(path)

    // Table survived: the row is still there, now under `idHash`.
    const rows = await createSqliteClient(path)`SELECT idHash, userId FROM hub_sessions`
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]!.idHash).toBe(legacyToken)

    // But it is inert — a lookup goes through sha256, which never matches it.
    expect(await hub.getHubSession(await hashSessionToken(legacyToken))).toBeNull()
    expect(await hub.getHubUserById('u1')).not.toBeNull()
  })

  it('is idempotent — a second open does not undo the rename or throw', async () => {
    const path = tempDbPath()
    await seedLegacySchema(path, 'tok')
    await HubDatabase.open(path)
    const hub = await HubDatabase.open(path)

    const idHash = await hashSessionToken(createSessionToken())
    await hub.createHubSession({ idHash, userId: 'u1', expiresAt: Date.now() + 60_000 })
    expect((await hub.getHubSession(idHash))?.userId).toBe('u1')
  })

  it('sweeps expired sessions on open', async () => {
    const path = tempDbPath()
    const hub = await HubDatabase.open(path)
    await hub.createHubUser({ id: 'u1', email: 'a@b.co', passwordHash: 'x', createdAt: 'now' })

    const stale = await hashSessionToken('stale')
    const live = await hashSessionToken('live')
    await hub.createHubSession({ idHash: stale, userId: 'u1', expiresAt: Date.now() - 1 })
    await hub.createHubSession({ idHash: live, userId: 'u1', expiresAt: Date.now() + 60_000 })

    const reopened = await HubDatabase.open(path)
    expect(await reopened.getHubSession(stale)).toBeNull()
    expect(await reopened.getHubSession(live)).not.toBeNull()
  })
})
