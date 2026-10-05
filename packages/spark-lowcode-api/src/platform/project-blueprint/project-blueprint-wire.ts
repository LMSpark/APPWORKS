/**
 * 项目蓝图 wire 层：GetData 查询体构造与 Base_NavigationInfo 行归一化。
 * 未知 BlueprintNodeKind fail-fast；缺失 kind 的非根节点降级为 unresolved。
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

function nodeKind(row: Record<string, unknown>, parentId: string): ProjectBlueprintNodeKind {
  const configured = firstText(row, ['BlueprintNodeKind', 'blueprintNodeKind'])
  if (!configured) return parentId === '' || parentId === '0' || parentId === '000000' ? 'project' : 'unresolved'
  if (!isProjectBlueprintNodeKind(configured)) {
    throw new LowcodeApiError(0, `未知 BlueprintNodeKind: ${configured}`)
  }
  return configured
}

/** 构造 Base_NavigationInfo 的 GetData 查询体；SysId 过滤须与 projectId 一致。 */
export function lowcodeProjectBlueprintQuery(projectId: string): Readonly<Record<string, unknown>> {
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
export function normalizeLowcodeProjectBlueprintRecords(value: unknown): readonly LowcodeProjectBlueprintRecord[] {
  return queryItems(value).map((item, index) => {
    if (!isRecord(item)) throw new LowcodeApiError(0, `项目蓝图第 ${index + 1} 行不是对象`)
    const parentId = firstText(item, ['prowid', 'PROWID', 'prowId'])
    return createLowcodeProjectBlueprintRecord({
      id: firstText(item, ['rowid', 'ROWID', 'rowId']),
      parentId,
      projectId: firstText(item, ['SysId', 'sysId', 'sysid']),
      title: firstText(item, ['FunName', 'funName', 'name', 'caption']),
      kind: nodeKind(item, parentId),
      description: firstText(item, ['description', 'Description']),
      planningContent: firstText(item, ['memo', 'Memo']),
      prototypeHtml: firstText(item, ['htmlDesc', 'HtmlDesc']),
      formKey: firstText(item, ['conid', 'conId', 'ConId']),
      dataSpaceType: firstText(item, ['conType', 'ConType']),
      runtimeTarget: firstText(item, ['NavigationUrl', 'navigationUrl']),
      fileVersionId: firstText(item, ['versionId', 'VersionId', 'VERSIONID']),
      difficultyFactor: numberValue(item['DifficultyFactor'] ?? item['difficultyFactor']),
      manhour: numberValue(item['Manhour'] ?? item['manhour']),
      quantity: numberValue(item['Number'] ?? item['number']),
      sum: numberValue(item['Sum'] ?? item['sum']),
      total: numberValue(item['Total'] ?? item['total']),
      personInCharge: firstText(item, ['personCharge', 'PersonCharge']),
      status: firstText(item, ['status', 'Status']),
      navigationType: numberValue(item['NavigationType'] ?? item['navigationType']),
      runtimeNavigationCandidate: Number(item['IsShowAtNav'] ?? item['isShowAtNav'] ?? 0) === 1,
      order: numberValue(item['FunOrderValue'] ?? item['funOrderValue']),
      source: item,
    })
  })
}
