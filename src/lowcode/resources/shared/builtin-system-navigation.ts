import type {LowcodeApplication} from '@spark-appworks/spark-lowcode-api'
import {getBuiltinApplicationDescriptor} from '@/registries/builtin-application-registry'
import {readRepositoryNavigationText} from './repository-scenarios/repository-scenario-resource'

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

/** Load one registered repository navigation source; no remote blueprint fallback is available. */
export async function readBuiltinSystemNavigation(assertCurrent: () => void = () => undefined): Promise<BuiltinSystemNavigation> {
  const resource = getBuiltinApplicationDescriptor().navigation
  if (resource.resourceId !== 'repository:navigation:appworks-system'
    || resource.path !== 'config/navigation/appworks-system.json' || resource.path.includes('..')) {
    throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 仓内系统导航资源登记无效')
  }
  const raw = await readRepositoryNavigationText(resource, getBuiltinApplicationDescriptor().id, assertCurrent)
  assertCurrent()
  let value: unknown
  try {value = JSON.parse(raw)} catch {throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 仓内系统导航不是有效 JSON')}
  return parseBuiltinSystemNavigation(value)
}

export function parseBuiltinSystemNavigation(value: unknown): BuiltinSystemNavigation {
  if (!isRecord(value) || value['protocol'] !== 'spark-appworks.system-navigation'
    || value['schemaVersion'] !== 1 || typeof value['navigationRootId'] !== 'string'
    || !Array.isArray(value['nodes'])) {
    throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 仓内系统导航协议字段无效')
  }
  const ids = new Set<string>()
  const nodes: NavigationNode[] = []
  for (const candidate of value['nodes']) {
    const node = parseNode(candidate)
    if (ids.has(node.id)) throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 导航节点重复 ${node.id}`)
    ids.add(node.id)
    nodes.push(node)
  }
  const rootId = value['navigationRootId']
  if (rootId !== getBuiltinApplicationDescriptor().id || !ids.has(rootId)
    || nodes.find(node => node.id === rootId)?.kind !== 'Model'
    || nodes.filter(node => node.parentId === '000000').length !== 1
    || nodes.find(node => node.id === rootId)?.parentId !== '000000') {
    throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 仓内导航根节点不存在或类型无效')
  }
  for (const node of nodes) {
    if (node.id === rootId) continue
    if (node.parentId === node.id || !ids.has(node.parentId)) {
      throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 导航节点 ${node.id} 的父节点无效`)
    }
    const ancestors = new Set([node.id])
    let parentId = node.parentId
    while (parentId !== rootId) {
      if (ancestors.has(parentId)) throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 导航节点 ${node.id} 存在循环父链`)
      ancestors.add(parentId)
      const parent = nodes.find(candidate => candidate.id === parentId)
      if (!parent || parent.parentId === '000000') {
        throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 导航节点 ${node.id} 未连接到应用根`)
      }
      parentId = parent.parentId
    }
  }
  return {navigationRootId: rootId, nodes}
}

function parseNode(value: unknown): NavigationNode {
  if (!isRecord(value) || typeof value['id'] !== 'string' || !/^[A-F0-9]{32}$/.test(value['id'])
    || typeof value['parentId'] !== 'string' || !/^(?:[A-F0-9]{32}|000000)$/.test(value['parentId'])
    || typeof value['title'] !== 'string' || !value['title'].trim()
    || typeof value['order'] !== 'number' || !Number.isSafeInteger(value['order'])
    || typeof value['conid'] !== 'string' || (value['kind'] !== 'Model' && value['kind'] !== 'Navitem')) {
    throw new Error('BUILTIN_NAVIGATION_SOURCE_INVALID: 仓内导航节点字段无效')
  }
  const url = value['url']
  const publishInMenu = value['publishInMenu']
  if (value['kind'] === 'Navitem' && (typeof url !== 'string' || !url.startsWith('vue:/')
    || publishInMenu !== true || !value['conid'])) {
    throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 原生页面节点 ${value['id']} 字段无效`)
  }
  if (value['kind'] === 'Model' && (url !== undefined || publishInMenu !== undefined)) {
    throw new Error(`BUILTIN_NAVIGATION_SOURCE_INVALID: 分组节点 ${value['id']} 不应含页面目标`)
  }
  return {id: value['id'], parentId: value['parentId'], title: value['title'], order: value['order'],
    conid: value['conid'], kind: value['kind'], ...(typeof url === 'string' ? {url} : {}),
    ...(publishInMenu === true ? {publishInMenu: true} : {})}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
