import { LowcodeApiError } from '../core/lowcode-api-error.js'
import type { LowcodeSession } from './lowcode-platform-api.js'

const DEFAULT_SESSION_KEY = 'spark_lowcode_session'

export type LowcodeSessionStorage = Readonly<{
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}>

export type LowcodeSessionStoreOptions = Readonly<{
  storage?: LowcodeSessionStorage
  sessionKey?: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key]
  if (typeof value === 'string' && value.trim() !== '') return value
  throw new LowcodeApiError(0, `${context}.${key} 缺少有效字符串`)
}

function nullableString(record: Record<string, unknown>, key: string, context: string): string | null {
  const value = record[key]
  if (value === null) return null
  if (typeof value === 'string') return value
  throw new LowcodeApiError(0, `${context}.${key} 不是字符串或 null`)
}

function requiredNumber(record: Record<string, unknown>, key: string, context: string): number {
  const value = record[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new LowcodeApiError(0, `${context}.${key} 缺少有效数字`)
}

function requiredRecord(record: Record<string, unknown>, key: string, context: string): Record<string, unknown> {
  const value = record[key]
  if (isRecord(value)) return value
  throw new LowcodeApiError(0, `${context}.${key} 缺少有效对象`)
}

function parseSession(value: unknown): LowcodeSession {
  if (!isRecord(value)) throw new LowcodeApiError(0, '持久化 lowcode 会话不是对象')
  const identity = requiredRecord(value, 'identity', '持久化会话')
  const enterprise = requiredRecord(value, 'enterprise', '持久化会话')
  return {
    accessToken: requiredString(value, 'accessToken', '持久化会话'),
    refreshToken: requiredString(value, 'refreshToken', '持久化会话'),
    accessExpiresAt: requiredNumber(value, 'accessExpiresAt', '持久化会话'),
    refreshExpiresAt: requiredNumber(value, 'refreshExpiresAt', '持久化会话'),
    identity: {
      userId: requiredString(identity, 'userId', '持久化会话.identity'),
      account: requiredString(identity, 'account', '持久化会话.identity'),
      displayName: requiredString(identity, 'displayName', '持久化会话.identity'),
      enterpriseId: nullableString(identity, 'enterpriseId', '持久化会话.identity'),
      enterpriseShortName: requiredString(identity, 'enterpriseShortName', '持久化会话.identity'),
      role: nullableString(identity, 'role', '持久化会话.identity'),
      raw: requiredRecord(identity, 'raw', '持久化会话.identity'),
    },
    enterprise: {
      id: nullableString(enterprise, 'id', '持久化会话.enterprise'),
      name: nullableString(enterprise, 'name', '持久化会话.enterprise'),
      code: nullableString(enterprise, 'code', '持久化会话.enterprise'),
      shortName: requiredString(enterprise, 'shortName', '持久化会话.enterprise'),
      shortCode: nullableString(enterprise, 'shortCode', '持久化会话.enterprise'),
      raw: requiredRecord(enterprise, 'raw', '持久化会话.enterprise'),
    },
  }
}

export class LowcodeSessionStore {
  private readonly storage: LowcodeSessionStorage | undefined
  private readonly sessionKey: string
  private memorySession: LowcodeSession | null = null

  public constructor(options: LowcodeSessionStoreOptions = {}) {
    this.storage = options.storage
    this.sessionKey = options.sessionKey ?? DEFAULT_SESSION_KEY
  }

  public get(): LowcodeSession | null {
    if (this.memorySession !== null) return this.memorySession
    const raw = this.storage?.getItem(this.sessionKey)
    if (raw === undefined || raw === null) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new LowcodeApiError(0, '持久化 lowcode 会话不是合法 JSON')
    }
    this.memorySession = parseSession(parsed)
    return this.memorySession
  }

  public save(session: LowcodeSession): void {
    this.memorySession = session
    this.storage?.setItem(this.sessionKey, JSON.stringify(session))
  }

  public clear(): void {
    this.memorySession = null
    this.storage?.removeItem(this.sessionKey)
  }

  public isAuthenticated(now = Date.now()): boolean {
    const session = this.get()
    return session !== null && session.refreshExpiresAt > now
  }
}
