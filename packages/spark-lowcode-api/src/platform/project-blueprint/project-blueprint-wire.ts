/**
 * 项目蓝图 wire 层：GetData 查询体构造与 Base_NavigationInfo 行归一化。
 * 未知 BlueprintNodeKind fail-fast；缺失 kind 的非根节点降级为 unresolved。
 */
import { LowcodeApiError } from '../../core/lowcode-api-error.js'
import { ProjectBlueprintNode } from './project-blueprint.js'

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

function queryItems(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) throw new LowcodeApiError(0, '项目蓝图 Result 不是对象或数组')
  const data = isRecord(value['data']) ? value['data'] : isRecord(value['Data']) ? value['Data'] : value
  const items = data['Items'] ?? data['items'] ?? data['Result'] ?? data['result']
  if (items === undefined || items === null) return []
  if (!Array.isArray(items)) throw new LowcodeApiError(0, '项目蓝图 Result.items 不是数组')
  return items
}

function numberValue(value: unknown): number {
  const normalized = Number(value ?? 0)
  return Number.isFinite(normalized) ? normalized : 0
}

const BLUEPRINT_NODE_KINDS = new Set([
  'project', 'module', 'requirement', 'prototype', 'data-space', 'page', 'sub-page', 'report',
  'workflow', 'integration', 'action', 'external', 'permission-management', 'unresolved',
])

function nodeKind(row: Record<string, unknown>, parentId: string): ProjectBlueprintNode['kind'] {
  const configured = firstText(row, ['BlueprintNodeKind', 'blueprintNodeKind'])
  if (!configured) return parentId === '' || parentId === '0' || parentId === '000000' ? 'project' : 'unresolved'
  if (!BLUEPRINT_NODE_KINDS.has(configured)) {
    throw new LowcodeApiError(0, `未知 BlueprintNodeKind: ${configured}`)
  }
  if (
    configured === 'project' || configured === 'module' || configured === 'requirement'
    || configured === 'prototype' || configured === 'data-space' || configured === 'page'
    || configured === 'sub-page' || configured === 'report' || configured === 'workflow'
    || configured === 'integration' || configured === 'action' || configured === 'external'
    || configured === 'permission-management' || configured === 'unresolved'
  ) return configured
  throw new LowcodeApiError(0, `未知 BlueprintNodeKind: ${configured}`)
}

/** 构造 Base_NavigationInfo 的 GetData 查询体；SysId 过滤须与 projectId 一致。 */
export function projectBlueprintQuery(projectId: string): Readonly<Record<string, unknown>> {
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) throw new LowcodeApiError(0, 'projectId 不能为空')
  return {
    Table: [{
      Name: 'Base_NavigationInfo',
      PrimaryKeyFields: 'rowid',
      OutputType: 'Table',
      Type: '数据库表',
      Filter: {
        Type: 'and',
        Filters: [{
          Type: 'cond',
          Field: 'SysId',
          Operator: 'equal',
          Value: null,
          ValueFun: { Type: 'GetConstValue', Value: normalizedProjectId },
        }],
      },
      inputParams: [],
      DISTINCT: true,
      IsBusinessMain: 1,
      RelationFilterType: 'and',
    }],
  }
}

/** 将 GetData Result 归一化为蓝图节点列表；行级字段缺失时以空串/0 兜底，kind 未知则抛错。 */
export function normalizeProjectBlueprintNodes(value: unknown): readonly ProjectBlueprintNode[] {
  return queryItems(value).map((item, index) => {
    if (!isRecord(item)) throw new LowcodeApiError(0, `项目蓝图第 ${index + 1} 行不是对象`)
    const parentId = firstText(item, ['prowid', 'PROWID', 'prowId'])
    return new ProjectBlueprintNode({
      id: firstText(item, ['rowid', 'ROWID', 'rowId']),
      parentId,
      projectId: firstText(item, ['SysId', 'sysId', 'sysid']),
      title: firstText(item, ['FunName', 'funName', 'name', 'caption']),
      kind: nodeKind(item, parentId),
      description: firstText(item, ['memo', 'Memo', 'htmlDesc', 'HtmlDesc']),
      legacyContentId: firstText(item, ['conid', 'conId', 'ConId']),
      legacyContentType: firstText(item, ['conType', 'ConType', 'contype']),
      runtimeTarget: firstText(item, ['NavigationUrl', 'navigationUrl']),
      runtimeNavigationCandidate: Number(item['IsShowAtNav'] ?? item['isShowAtNav'] ?? 0) === 1,
      order: numberValue(item['FunOrderValue'] ?? item['funOrderValue']),
      source: item,
    })
  })
}
