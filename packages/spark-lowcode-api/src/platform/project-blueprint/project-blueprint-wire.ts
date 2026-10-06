/**
 * @module @spark-appworks/spark-lowcode-api:platform/project-blueprint/project-blueprint-wire
 * 职责：在 Base_NavigationInfo 消费行与 capability/navigation/dataSpace/prototype 四组之间映射。
 * 边界：conType 决定 kind，未知值保留诊断；不构造查询或授权，不从父节点推断模型。
 * AI用途：核对正式节点与后端字段的读写对应，避免 source 成为权限或模型定义来源。
 */
import { isProjectBlueprintNodeKind, type ProjectBlueprintNodeKind } from '@spark-appworks/spark-utils'
import { LowcodeApiError } from '../../core/lowcode-api-error.js'
import {
  createLowcodeProjectBlueprintRecord,
  type LowcodeProjectBlueprintRecord,
} from './project-blueprint.js'

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

function numberValue(value: unknown): number {
  const normalized = Number(value ?? 0)
  return Number.isFinite(normalized) ? normalized : 0
}

function nodeKind(row: Record<string, unknown>): ProjectBlueprintNodeKind | 'unknown' {
  const configured = firstText(row, ['conType', 'ConType']).toLowerCase()
  if (configured === 'model') return 'module'
  if (configured === 'navitem') return 'page'
  return isProjectBlueprintNodeKind(configured) ? configured : 'unknown'
}

function flag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

type BlueprintNavigation = NonNullable<LowcodeProjectBlueprintRecord['navigation']>

function openMode(value: string): BlueprintNavigation['openMode'] {
  const modes: Record<string, BlueprintNavigation['openMode']> = {
    '4': 'subsystem', '3': 'current', '2': 'new-window', '1': 'modal', '0': 'embedded',
    subsystem: 'subsystem', current: 'current', 'new-window': 'new-window', modal: 'modal', embedded: 'embedded',
  }
  return modes[value.toLowerCase()]
}

function placement(value: string): BlueprintNavigation['placement'] {
  const locations: Record<string, BlueprintNavigation['placement']> = {
    default: 'parent', 跟随父项: 'parent', 菜单栏: 'top', 树导航: 'left', 导航栏: 'right', 页签: 'tabs', 弹窗: 'popup',
    top: 'top', left: 'left', right: 'right', parent: 'parent', tabs: 'tabs', tab: 'tabs', popup: 'popup',
  }
  return locations[value.toLowerCase()]
}

/** 正式分组写回已有导航字段；应用归属只用于设计记录，业务请求作用域仍由请求层注入。 */
export function lowcodeProjectBlueprintFields(node: LowcodeProjectBlueprintRecord): Record<string, string | number> {
  if (node.kind === 'unknown') throw new Error('未知蓝图 kind 不能保存')
  const navigation = node.navigation
  const openModes = { subsystem: '4', current: '3', 'new-window': '2', modal: '1', embedded: '0' }
  const placements = { top: 'Top', left: 'Left', right: 'Right', parent: 'Parent', tabs: 'Tabs', popup: 'Popup' }
  return {
    name: node.capability.name, memo: node.capability.description ?? '', funCode: node.capability.code ?? '',
    personCharge: node.capability.ownerId ?? '', status: node.capability.deliveryStatus ?? '',
    conType: node.kind === 'module' ? 'Model' : node.kind === 'page' ? 'Navitem' : node.kind,
    FunName: navigation?.title ?? '', FunOrderValue: navigation?.order ?? 0,
    NavigationImageWxz: navigation?.icon ?? '', NavigationUrl: navigation?.target ?? '', MobileUrl: navigation?.mobileTarget ?? '',
    NavigationType: navigation?.openMode === undefined ? '' : openModes[navigation.openMode],
    ChildItemLocation: navigation?.placement === undefined ? '' : placements[navigation.placement],
    NavigationShowType: navigation?.displayMode ?? '', HorizontalAlignment: navigation?.horizontalAlignment ?? '',
    IsShowAtNav: navigation?.publishInMenu ? 1 : 0, IsShowChildItem: navigation?.showChildren ? 1 : 0,
    BeginGroup: navigation?.beginGroup ? 1 : 0, conid: node.dataSpace?.scenarioId ?? '',
    htmlDesc: node.prototype?.htmlDescription ?? '',
  }
}

/** 将原 query context 的消费行归一化为蓝图记录，保留未知 kind 供领域层诊断。 */
export function normalizeLowcodeProjectBlueprintRecords(rows: ReadonlyArray<Readonly<Record<string, unknown>>>): readonly LowcodeProjectBlueprintRecord[] {
  return rows.map((item, index) => {
    if (!isRecord(item)) throw new LowcodeApiError(0, `项目蓝图第 ${index + 1} 行不是对象`)
    const parentId = firstText(item, ['prowid', 'PROWID', 'prowId', 'Prowid', 'PRowid', 'ProWid'])
    const title = firstText(item, ['FunName', 'funName', 'caption'])
    const name = firstText(item, ['name', 'Name', 'folderName', 'FolderName']) || title
    const description = firstText(item, ['memo', 'Memo'])
    const code = firstText(item, ['funCode', 'FunCode'])
    const ownerId = firstText(item, ['personCharge', 'PersonCharge'])
    const deliveryStatus = firstText(item, ['status', 'Status'])
    const target = firstText(item, ['NavigationUrl', 'navigationUrl'])
    const icon = firstText(item, ['NavigationImageWxz'])
    const mobileTarget = firstText(item, ['MobileUrl', 'mobileUrl'])
    const location = firstText(item, ['ChildItemLocation', 'childItemLocation'])
    const navigationPlacement = placement(location)
    const navigationOpenMode = openMode(firstText(item, ['NavigationType', 'navigationType']))
    const displayMode = firstText(item, ['NavigationShowType', 'navigationShowType'])
    const horizontalAlignment = firstText(item, ['HorizontalAlignment', 'horizontalAlignment']).toLowerCase()
    const publishInMenu = flag(item['IsShowAtNav'] ?? item['isShowAtNav'])
    const scenarioId = firstText(item, ['conid', 'conId', 'ConId', 'ConID'])
    const htmlDescription = firstText(item, ['htmlDesc', 'HtmlDesc'])
    return createLowcodeProjectBlueprintRecord({
      nodeId: firstText(item, ['rowid', 'ROWID', 'RowID', 'rowId']),
      parentNodeId: parentId === '000000' ? '' : parentId,
      projectId: firstText(item, ['SysId', 'sysId', 'sysid', 'SYSID']),
      kind: nodeKind(item),
      capability: { name, ...(description ? { description } : {}), ...(code ? { code } : {}),
        ...(ownerId ? { ownerId } : {}), ...(deliveryStatus ? { deliveryStatus } : {}) },
      ...(title || target || icon || location || publishInMenu ? {
        navigation: {
          title: title || name, order: numberValue(item['FunOrderValue'] ?? item['funOrderValue']),
          ...(target ? { target } : {}), ...(icon ? { icon } : {}), ...(mobileTarget ? { mobileTarget } : {}),
          ...(navigationPlacement ? { placement: navigationPlacement } : {}),
          ...(navigationOpenMode ? { openMode: navigationOpenMode } : {}),
          ...(displayMode ? { displayMode } : {}), ...(horizontalAlignment ? { horizontalAlignment } : {}),
          publishInMenu, showChildren: flag(item['IsShowChildItem'] ?? item['isShowChildItem']),
          beginGroup: flag(item['BeginGroup'] ?? item['beginGroup']),
        },
      } : {}),
      ...(scenarioId ? { dataSpace: { scenarioId, models: [] } } : {}),
      ...(htmlDescription ? { prototype: { htmlDescription } } : {}),
      source: item,
    })
  })
}
