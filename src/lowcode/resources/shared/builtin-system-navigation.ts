import type {LowcodeApplication} from '@spark-appworks/spark-lowcode-api'
import {getBuiltinApplicationDescriptor} from '@/registries/builtin-application-registry'
import {readRepositoryNavigationText} from './repository-scenarios/repository-scenario-resource'

/** The complete business-field set retained by the repository-owned AppWorks blueprint. */
export const BUILTIN_BLUEPRINT_BUSINESS_FIELDS = [
  'Manhour', 'NavigationUrl', 'funCode', 'Sum', 'personCharge', 'FunName', 'IsShowChildItem', 'Number', 'conid',
  'MobileUrl', 'status', 'FunOrderValue', 'Total', 'memo', 'name', 'ChildItemLocation', 'SysId', 'NavigationShowType',
  'NavigationImageWxz', 'NavigationType', 'conType', 'rowid', 'VersionId', 'IsShowAtNav', 'HorizontalAlignment',
  'DifficultyFactor', 'prowid', 'htmlDesc',
] as const

type BuiltinBlueprintField = typeof BUILTIN_BLUEPRINT_BUSINESS_FIELDS[number]
type BlueprintValue = string | number | null
export type BuiltinBlueprintRecord = Readonly<Record<BuiltinBlueprintField, BlueprintValue> & {
  rowid: string
  SysId: string
  prowid: string
  conType: 'Model' | 'Navitem'
  name: string
  FunName: string
  FunOrderValue: number
}>

type NavigationNode = Readonly<{
  id: string
  parentId: string
  title: string
  order: number
  conid: string
  kind: 'Model' | 'Navitem'
  url?: string
  publishInMenu?: boolean
}>

export type BuiltinSystemNavigation = Readonly<{
  navigationRootId: string
  records: readonly BuiltinBlueprintRecord[]
  publishedNodeIds: readonly string[]
  nodes: readonly NavigationNode[]
}>

/** The AppWorks application identity is defined by the repository manifest. */
export function builtinSystemApplication(): LowcodeApplication {
  const descriptor = getBuiltinApplicationDescriptor()
  return {id: descriptor.id, name: descriptor.name}
}

/** Read the locally declared navigation root for the existing selection-store contract. */
export async function readBuiltinNavigationRootId(applicationId: string, assertCurrent: () => void = () => undefined): Promise<string> {
  const descriptor = getBuiltinApplicationDescriptor()
  if (applicationId !== descriptor.id) throw new Error('BUILTIN_APPLICATION_ID_MISMATCH: 仓内导航根应用身份不匹配')
  return (await readBuiltinSystemNavigation(assertCurrent)).navigationRootId
}

/** Read the single complete 85-record repository blueprint and its fixed menu projection. */
export async function readBuiltinSystemNavigation(assertCurrent: () => void = () => undefined): Promise<BuiltinSystemNavigation> {
  const resource = getBuiltinApplicationDescriptor().navigation
  if (resource.resourceId !== 'repository:navigation:appworks-system'
    || resource.path !== 'config/navigation/appworks-system.json' || resource.path.includes('..')) {
    throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 仓内系统蓝图资源登记无效')
  }
  const raw = await readRepositoryNavigationText(resource, getBuiltinSystemApplicationId(), assertCurrent)
  assertCurrent()
  let value: unknown
  try {value = JSON.parse(raw)} catch {throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 仓内系统蓝图不是有效 JSON')}
  const navigation = parseBuiltinSystemNavigation(value)
  assertCurrent()
  return navigation
}

/** Parse the complete source without normalizing, merging, or dropping any business field values. */
export function parseBuiltinSystemNavigation(value: unknown): BuiltinSystemNavigation {
  if (!isRecord(value) || value['protocol'] !== 'spark-appworks.system-navigation'
    || value['schemaVersion'] !== 2 || typeof value['navigationRootId'] !== 'string'
    || !Array.isArray(value['records']) || !Array.isArray(value['publishedNodeIds'])) {
    throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 仓内系统蓝图协议字段无效')
  }
  const rootId = value['navigationRootId']
  if (rootId !== getBuiltinSystemApplicationId()) throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 仓内应用身份与导航根不一致')
  if (value['records'].length !== 85 || value['publishedNodeIds'].length !== 26) {
    throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 完整业务记录或固定发布选择数量无效')
  }

  const records = value['records'].map(parseBlueprintRecord)
  const recordsById = new Map<string, BuiltinBlueprintRecord>()
  for (const record of records) {
    const id = record['rowid']
    if (recordsById.has(id)) throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 蓝图记录重复 ${id}`)
    if (record['SysId'] !== rootId) throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 蓝图记录 ${id} 属于其他应用`)
    recordsById.set(id, record)
  }
  const root = recordsById.get(rootId)
  if (root?.['prowid'] !== '000000' || records.filter(record => record['prowid'] === '000000').length !== 1
    || root['conType'] !== 'Model') {
    throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 仓内蓝图根记录无效')
  }
  for (const record of records) validateParentChain(record, rootId, recordsById)

  const publishedNodeIds: string[] = []
  const publishedSet = new Set<string>()
  for (const candidate of value['publishedNodeIds']) {
    if (typeof candidate !== 'string' || !/^[A-F0-9]{32}$/.test(candidate) || publishedSet.has(candidate)) {
      throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 发布节点身份缺失、格式无效或重复')
    }
    if (!recordsById.has(candidate)) throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 发布节点 ${candidate} 不存在于完整蓝图`)
    publishedSet.add(candidate)
    publishedNodeIds.push(candidate)
  }
  if (!publishedSet.has(rootId)) throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 发布选择缺少应用根')
  for (const id of publishedNodeIds) {
    if (id === rootId) continue
    const record = recordsById.get(id)
    if (!record) throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 发布节点 ${id} 不存在于完整蓝图`)
    if (record['conType'] === 'Navitem' && (typeof record['NavigationUrl'] !== 'string'
      || !record['NavigationUrl'].startsWith('vue:/') || typeof record['conid'] !== 'string' || !record['conid'].trim())) {
      throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 发布页面 ${id} 的原生页面目标无效`)
    }
    let parentId = String(record['prowid'])
    while (parentId !== rootId) {
      if (!publishedSet.has(parentId)) throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 发布选择缺少 ${id} 的祖先 ${parentId}`)
      parentId = String(recordsById.get(parentId)?.['prowid'] ?? '')
    }
  }

  const nodes = publishedNodeIds.map(id => {
    const record = recordsById.get(id)
    if (!record) throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 发布节点 ${id} 不存在于完整蓝图`)
    return projectPublishedNode(record)
  })
  const pages = nodes.filter(node => node.kind === 'Navitem')
  if (nodes.length !== 26 || pages.length !== 18) throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 固定导航投影范围无效')
  return {navigationRootId: rootId, records, publishedNodeIds, nodes}
}

function parseBlueprintRecord(value: unknown): BuiltinBlueprintRecord {
  if (!isRecord(value) || Object.keys(value).length !== BUILTIN_BLUEPRINT_BUSINESS_FIELDS.length
    || BUILTIN_BLUEPRINT_BUSINESS_FIELDS.some(field => !Object.hasOwn(value, field))) {
    throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 蓝图记录业务字段集合无效')
  }
  if (!isBuiltinBlueprintRecord(value)) {
    throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 蓝图记录身份、类型或显示字段无效')
  }
  return Object.freeze(value)
}

function isBuiltinBlueprintRecord(value: Record<string, unknown>): value is BuiltinBlueprintRecord {
  return BUILTIN_BLUEPRINT_BUSINESS_FIELDS.every(field => isBlueprintValue(value[field]))
    && typeof value['rowid'] === 'string' && /^[A-F0-9]{32}$/.test(value['rowid'])
    && typeof value['SysId'] === 'string' && /^[A-F0-9]{32}$/.test(value['SysId'])
    && typeof value['prowid'] === 'string' && /^(?:[A-F0-9]{32}|000000)$/.test(value['prowid'])
    && (value['conType'] === 'Model' || value['conType'] === 'Navitem')
    && typeof value['name'] === 'string' && Boolean(value['name'].trim())
    && typeof value['FunName'] === 'string' && Boolean(value['FunName'].trim())
    && typeof value['FunOrderValue'] === 'number' && Number.isSafeInteger(value['FunOrderValue'])
}

function isBlueprintValue(value: unknown): value is BlueprintValue {
  return value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

function validateParentChain(record: BuiltinBlueprintRecord, rootId: string,
  records: ReadonlyMap<string, BuiltinBlueprintRecord>): void {
  if (record['rowid'] === rootId) return
  const seen = new Set([record['rowid']])
  let parentId = String(record['prowid'])
  while (parentId !== rootId) {
    if (seen.has(parentId)) throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 蓝图记录 ${record['rowid']} 存在循环父链`)
    seen.add(parentId)
    const parent = records.get(parentId)
    if (!parent) throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 蓝图记录 ${record['rowid']} 的父节点缺失`)
    parentId = String(parent['prowid'])
  }
}

function projectPublishedNode(record: BuiltinBlueprintRecord): NavigationNode {
  const kind = record['conType']
  const url = record['NavigationUrl']
  return {id: String(record['rowid']), parentId: String(record['prowid']), title: String(record['FunName']),
    order: Number(record['FunOrderValue']), conid: typeof record['conid'] === 'string' ? record['conid'] : '', kind,
    ...(kind === 'Navitem' ? {url: String(url), publishInMenu: true} : {})}
}

function getBuiltinSystemApplicationId(): string {
  return getBuiltinApplicationDescriptor().id
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
