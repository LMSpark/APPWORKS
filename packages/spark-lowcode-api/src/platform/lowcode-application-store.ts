/**
 * 当前选中应用上下文持久化：应用元数据 + 导航根 rowid。
 * 默认使用浏览器 localStorage；损坏数据会被清除而非返回半成品上下文。
 */
import { LowcodeApiError } from '../core/lowcode-api-error.js'
import type { LowcodeApplication } from './lowcode-application.js'
import type { LowcodeSessionStorage } from './lowcode-session-store.js'

const DEFAULT_APPLICATION_KEY = 'spark_lowcode_application'

/** 已选应用及其导航根身份；navigationRootId 来自 Base_NavigationInfo 唯一根节点。 */
export type LowcodeApplicationContext = Readonly<{
  application: LowcodeApplication
  navigationRootId: string
}>

/** 应用 store 配置；storage 缺省为 localStorage（非浏览器环境则无持久化）。 */
export type LowcodeApplicationStoreOptions = Readonly<{
  storage?: LowcodeSessionStorage
  applicationKey?: string
}>

function browserStorage(): LowcodeSessionStorage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseContext(value: unknown): LowcodeApplicationContext {
  if (!isRecord(value) || !isRecord(value['application'])) {
    throw new LowcodeApiError(0, '应用上下文格式无效')
  }
  const application = value['application']
  const id = application['id']
  const navigationRootId = value['navigationRootId']
  if (typeof id !== 'string' || !id || typeof navigationRootId !== 'string' || !navigationRootId) {
    throw new LowcodeApiError(0, '应用上下文缺少应用或导航根身份')
  }
  const code = application['code']
  const name = application['name']
  const description = application['description']
  const enterpriseId = application['enterpriseId']
  const enterpriseShortName = application['enterpriseShortName']
  const isDefault = application['isDefault']
  if (
    typeof code !== 'string'
    || typeof name !== 'string'
    || typeof description !== 'string'
    || typeof enterpriseId !== 'string'
    || typeof enterpriseShortName !== 'string'
    || typeof isDefault !== 'boolean'
  ) {
    throw new LowcodeApiError(0, '应用上下文字段格式无效')
  }
  return {
    application: { id, code, name, description, enterpriseId, enterpriseShortName, isDefault },
    navigationRootId,
  }
}

/** 当前选中应用的读写；save 会先校验再写入，避免脏数据落盘。 */
export class LowcodeApplicationStore {
  private readonly storage: LowcodeSessionStorage | undefined
  private readonly applicationKey: string
  private executionRevision = 0

  public get revision(): number { return this.executionRevision }

  public constructor(options: LowcodeApplicationStoreOptions = {}) {
    this.storage = options.storage ?? browserStorage()
    this.applicationKey = options.applicationKey ?? DEFAULT_APPLICATION_KEY
  }

  /** 读取应用上下文；解析失败时清除 storage 并返回 null。 */
  public get(): LowcodeApplicationContext | null {
    const raw = this.storage?.getItem(this.applicationKey)
    if (!raw) return null
    try {
      return parseContext(JSON.parse(raw))
    } catch {
      this.clear()
      return null
    }
  }

  /** 持久化应用上下文；字段格式非法时抛 LowcodeApiError。 */
  public save(context: LowcodeApplicationContext): void {
    const normalized = parseContext(context)
    const previous = this.get()
    if (previous?.application.id !== normalized.application.id
      || previous.application.enterpriseId !== normalized.application.enterpriseId
      || previous.application.enterpriseShortName !== normalized.application.enterpriseShortName) {
      this.executionRevision += 1
    }
    this.storage?.setItem(this.applicationKey, JSON.stringify(normalized))
  }

  /** 清除已选应用上下文。 */
  public clear(): void {
    this.executionRevision += 1
    this.storage?.removeItem(this.applicationKey)
  }
}
