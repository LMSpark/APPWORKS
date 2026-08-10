/**
 * 企业目录与企业详情归一化：GetBaseData / 会话 entinfo 的 wire 字段映射。
 * 企业 wire 键多为 PascalCase（ShortName、CName、ent_config 等）；目录按 ShortName 去重。
 */
import { LowcodeApiError } from '../core/lowcode-api-error.js'

/** 企业目录条目；shortName 为登录 entName 与域标识。 */
export type LowcodeEnterpriseCatalogItem = Readonly<{
  id: string
  name: string
  shortName: string
  shortCode: string
}>

/** 企业 ent_config JSON 中的密码与审核策略；wire 键为 snake_case。 */
export type LowcodeEnterprisePolicy = Readonly<{
  userAudit: boolean | null
  passwordMinLength: number | null
  passwordMaxLength: number | null
  passwordRequiresLetter: boolean | null
  passwordRequiresDigit: boolean | null
  passwordRequiresSpecial: boolean | null
  passwordSpecialCharacters: string | null
  verificationCodeLength: number | null
}>

/** 完整企业信息；domainKey 取自 ShortName，缺失时 fail-fast。 */
export type LowcodeEnterpriseInfo = Readonly<{
  id: string | null
  englishName: string | null
  chineseName: string | null
  chineseShortName: string | null
  domainKey: string
  domainName: string | null
  iconUrl: string | null
  portalUrl: string | null
  administratorAccount: string | null
  checkState: number | null
  createdAt: string | null
  loginPolicy: string | null
  storageMode: number | null
  policy: LowcodeEnterprisePolicy | null
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstText(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function nullableText(row: Record<string, unknown>, keys: readonly string[]): string | null {
  return firstText(row, keys) || null
}

function nullableNumber(row: Record<string, unknown>, key: string): number | null {
  const value = row[key]
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  throw new LowcodeApiError(0, `企业信息字段 ${key} 不是数字`)
}

function nullableBoolean(row: Record<string, unknown>, key: string): boolean | null {
  const value = row[key]
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  throw new LowcodeApiError(0, `企业配置字段 ${key} 不是布尔值`)
}

function enterprisePolicy(value: unknown): LowcodeEnterprisePolicy | null {
  if (value === undefined || value === null || value === '') return null
  let source: unknown = value
  if (typeof value === 'string') {
    try {
      source = JSON.parse(value)
    } catch {
      throw new LowcodeApiError(0, '企业信息字段 ent_config 不是有效 JSON')
    }
  }
  if (!isRecord(source)) throw new LowcodeApiError(0, '企业信息字段 ent_config 不是对象')
  return {
    userAudit: nullableBoolean(source, 'user_audit'),
    passwordMinLength: nullableNumber(source, 'pwd_min_length'),
    passwordMaxLength: nullableNumber(source, 'pwd_max_length'),
    passwordRequiresLetter: nullableBoolean(source, 'pwd_require_letter'),
    passwordRequiresDigit: nullableBoolean(source, 'pwd_require_digit'),
    passwordRequiresSpecial: nullableBoolean(source, 'pwd_require_special'),
    passwordSpecialCharacters: nullableText(source, ['pwd_special_chars']),
    verificationCodeLength: nullableNumber(source, 'verification_code_length'),
  }
}

function queryItems(value: unknown): readonly unknown[] {
  if (!isRecord(value)) throw new LowcodeApiError(0, '企业目录 Result 不是对象')
  const data = isRecord(value['data']) ? value['data'] : isRecord(value['Data']) ? value['Data'] : value
  const items = data['Items'] ?? data['items']
  if (items === undefined || items === null) return []
  if (Array.isArray(items)) return items
  throw new LowcodeApiError(0, '企业目录 Result.items 不是数组')
}

/** 构造 Base_Enterprise_Info 企业目录 GetBaseData 查询体。 */
export function enterpriseCatalogQuery(): Readonly<Record<string, unknown>> {
  return {
    Table: [{
      Name: 'Base_Enterprise_Info',
      Type: '数据库表',
      DbName: 'QYVirtualPlat',
      Fields: [
        { Name: 'rowid', FieldType: 'varchar', IsOutput: true },
        { Name: 'ShortCName', FieldType: 'varchar', IsOutput: true },
        { Name: 'ShortName', FieldType: 'varchar', IsOutput: true },
      ],
    }],
  }
}

/** 归一化企业目录；按 ShortName 去重，id 优先 rowid 否则回退 shortName。 */
export function normalizeEnterpriseCatalog(value: unknown): readonly LowcodeEnterpriseCatalogItem[] {
  const seen = new Set<string>()
  return queryItems(value).flatMap((item) => {
    if (!isRecord(item)) return []
    const shortName = firstText(item, ['ShortName'])
    if (!shortName || seen.has(shortName)) return []
    seen.add(shortName)
    const id = firstText(item, ['rowid', 'ROWID', 'row_id']) || shortName
    const shortCode = firstText(item, ['ShortCName'])
    return [{
      id,
      name: shortCode || shortName,
      shortName,
      shortCode,
    }]
  })
}

/** 归一化单条企业 entinfo；ent_config 可为 JSON 字符串或对象。 */
export function normalizeEnterpriseInfo(value: unknown): LowcodeEnterpriseInfo {
  if (!isRecord(value)) throw new LowcodeApiError(0, '企业信息 Result 不是对象')
  const domainKey = firstText(value, ['ShortName'])
  if (!domainKey) throw new LowcodeApiError(0, '企业信息缺少 ShortName 域名标识')
  return {
    id: nullableText(value, ['rowid', 'ROWID']),
    englishName: nullableText(value, ['Name']),
    chineseName: nullableText(value, ['CName']),
    chineseShortName: nullableText(value, ['ShortCName']),
    domainKey,
    domainName: nullableText(value, ['domain_name']),
    iconUrl: nullableText(value, ['EnterpriseIcon']),
    portalUrl: nullableText(value, ['EntUrl']),
    administratorAccount: nullableText(value, ['entadminAccount']),
    checkState: nullableNumber(value, 'CheckState'),
    createdAt: nullableText(value, ['entCreationTime', 'CreateDate']),
    loginPolicy: nullableText(value, ['loginPolicy']),
    storageMode: nullableNumber(value, 'storage_mode'),
    policy: enterprisePolicy(value['ent_config']),
  }
}
