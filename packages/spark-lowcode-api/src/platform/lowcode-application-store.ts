import { LowcodeApiError } from '../core/lowcode-api-error.js'
import type { LowcodeApplication } from './lowcode-application.js'
import type { LowcodeSessionStorage } from './lowcode-session-store.js'

const DEFAULT_APPLICATION_KEY = 'spark_lowcode_application'

export type LowcodeApplicationContext = Readonly<{
  application: LowcodeApplication
  navigationRootId: string
}>

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

export class LowcodeApplicationStore {
  private readonly storage: LowcodeSessionStorage | undefined
  private readonly applicationKey: string

  public constructor(options: LowcodeApplicationStoreOptions = {}) {
    this.storage = options.storage ?? browserStorage()
    this.applicationKey = options.applicationKey ?? DEFAULT_APPLICATION_KEY
  }

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

  public save(context: LowcodeApplicationContext): void {
    const normalized = parseContext(context)
    this.storage?.setItem(this.applicationKey, JSON.stringify(normalized))
  }

  public clear(): void {
    this.storage?.removeItem(this.applicationKey)
  }
}
