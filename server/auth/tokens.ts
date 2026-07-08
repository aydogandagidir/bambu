import { createHash, randomBytes } from 'node:crypto'

export const SESSION_COOKIE_NAME = 'instatic_admin_session'
const SESSION_ABSOLUTE_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 90

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'argon2id' })
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash)
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export async function hashSessionToken(token: string): Promise<string> {
  return createHash('sha256').update(token).digest('hex')
}

export function sessionExpiry(now = Date.now()): Date {
  return new Date(now + SESSION_ABSOLUTE_TIMEOUT_MS)
}

/**
 * A fixed argon2id hash, computed once per process. Login handlers verify
 * against it on the "no such user" branch so the response time stays constant
 * and an attacker can't enumerate accounts by timing — without it, an unknown
 * email returns in ~5ms while a known one pays ~100ms of argon2id.
 *
 * The hashed plaintext is deliberately not a real password and never grants
 * access; `verifyPassword` against this hash returns false for every input.
 *
 * Eagerly kicked off at module load so the very first unknown-email login
 * doesn't pay the one-time hashing cost and stand out as slower than the
 * steady state.
 */
const dummyPasswordHashCache: Promise<string> = hashPassword('not-a-real-account-placeholder')

export function getDummyPasswordHash(): Promise<string> {
  return dummyPasswordHashCache
}
