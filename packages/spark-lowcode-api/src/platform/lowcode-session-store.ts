/**
 * 低代码会话持久化：内存缓存 + 可选 storage 后端。
 * 持久化 JSON 结构须与 {@link LowcodeSession} 一致；解析失败 fail-fast，不静默降级。
 */
import { LowcodeApiError } from '../core/lowcode-api-error.js'
import type { LowcodeSession } from './lowcode-platform-api.js'

const DEFAULT_SESSION_KEY = 'spark_lowcode_session'

/** 会话 storage 契约；与 Web Storage 键值语义一致。 */
export type LowcodeSessionStorage = Readonly<{
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}>

/** 会话 store 配置；未提供 storage 时仅内存持有，刷新页面后丢失。 */
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

/**
 * 低代码会话读写；get 首次命中 storage 后写入内存，后续读内存副本。
 */
export class LowcodeSessionStore {
  private readonly storage: LowcodeSessionStorage | undefined
  private readonly sessionKey: string
  private memorySession: LowcodeSession | null = null

  public constructor(options: LowcodeSessionStoreOptions = {}) {
    this.storage = options.storage
    this.sessionKey = options.sessionKey ?? DEFAULT_SESSION_KEY
  }

  /** 读取当前会话；无数据返回 null，JSON 或字段非法时抛 LowcodeApiError。 */
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

  /** 保存会话到内存与 storage（若已配置）。 */
  public save(session: LowcodeSession): void {
    this.memorySession = session
    this.storage?.setItem(this.sessionKey, JSON.stringify(session))
  }

  /** 清空内存与 storage 中的会话。 */
  public clear(): void {
    this.memorySession = null
    this.storage?.removeItem(this.sessionKey)
  }

  /** 是否仍视为已认证；以 refreshExpiresAt 为准，access token 过期不单独判定。 */
  public isAuthenticated(now = Date.now()): boolean {
    const session = this.get()
    return session !== null && session.refreshExpiresAt > now
  }
}
