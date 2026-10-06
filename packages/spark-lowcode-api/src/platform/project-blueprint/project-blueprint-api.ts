/**
 * @module @spark-appworks/spark-lowcode-api:platform/project-blueprint/project-blueprint-api
 * 职责：经原 SPARK query/save 读写蓝图记录，读取导航授权并提交文档任务。
 * 边界：原权限和签名快照由私有 query context 持有，scope 来自共享 runtime；保存与读回不承诺事务或回滚。
 * AI用途：使用正式四组记录编辑蓝图，区分业务保存、授权读取和文档任务提交。
 */
import { DataViewFilter } from '@spark-appworks/spark-data'
import type { DataSpaceRuntimeApi } from '../data-space/runtime/data-space-runtime-api.js'
import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeClient } from '../../core/lowcode-client.js'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '../lowcode-application.js'
import {
  normalizeLowcodeNavigationAuthorization,
  type LowcodeNavigationAuthorizationEvidence,
} from '../lowcode-navigation.js'
import {
  validateLowcodeProjectBlueprintRecords,
  type LowcodeProjectBlueprintRecord,
} from './project-blueprint.js'
import type {
  LowcodeProjectBlueprintDocumentKind,
  LowcodeProjectBlueprintDocumentSubmitOptions,
  LowcodeProjectBlueprintDocumentTask,
} from './outputs/document/project-blueprint-document.js'
import { normalizeLowcodeProjectBlueprintRecords, lowcodeProjectBlueprintFields } from './project-blueprint-wire.js'

export const LOWCODE_PROJECT_BLUEPRINT_MUTABLE_FIELDS = [
  'name', 'funCode', 'FunName', 'FunOrderValue', 'prowid', 'NavigationImageWxz', 'MobileUrl',
  'IsShowChildItem', 'BeginGroup', 'NavigationShowType', 'ChildItemLocation', 'HorizontalAlignment',
  'memo',
  'htmlDesc',
  'conid',
  'conType',
  'DifficultyFactor',
  'Manhour',
  'Number',
  'Sum',
  'Total',
  'personCharge',
  'status',
  'NavigationUrl',
  'VersionId',
  'IsShowAtNav',
  'NavigationType',
] as const

/** 蓝图可提交的既有 wire 字段；实际写权限仍由原查询上下文 E 白名单决定。 */
export type LowcodeProjectBlueprintMutableField = typeof LOWCODE_PROJECT_BLUEPRINT_MUTABLE_FIELDS[number]
/** 单节点字段变更；不接受权限、签名或请求应用身份作为业务 patch。 */
export type LowcodeProjectBlueprintPatch = Readonly<Partial<Record<LowcodeProjectBlueprintMutableField, string | number>>>

function isMutableField(field: string): field is LowcodeProjectBlueprintMutableField {
  return LOWCODE_PROJECT_BLUEPRINT_MUTABLE_FIELDS.some(candidate => candidate === field)
}

/** HTTP 承接授权与文档端点，共享 runtime 承接正式蓝图 query/save 及请求 scope。 */
type BlueprintApiOptions = Readonly<{http: HttpClientBase; runtime: DataSpaceRuntimeApi}>

function readbackValue(record: LowcodeProjectBlueprintRecord, field: LowcodeProjectBlueprintMutableField): unknown {
  if (field === 'VersionId') return record.source['VersionId'] ?? record.source['versionId']
  return record.source[field]
}

/** 项目蓝图 CRUD 共用原模型查询保存 owner；授权和文档任务保持各自正式端点。 */
export class LowcodeProjectBlueprintApi {
  readonly #client: LowcodeClient

  readonly #runtime: DataSpaceRuntimeApi
  // 原 AppWorks 蓝图设计与现有应用目录共用该已注册场景。
  readonly #identity = Object.freeze({scenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, metaName: 'Base_NavigationInfo'})

  /** 注入现有请求与原查询保存 owner；不从公开 source 重建授权凭据。 */
  public constructor(options: BlueprintApiOptions) {
    this.#client = new LowcodeClient(options.http)
    this.#runtime = options.runtime
  }

  private async readQuery(projectId: string) {
    const normalizedProjectId = projectId.trim()
    if (!normalizedProjectId) throw new Error('projectId 不能为空')
    const context = await this.#runtime.query(this.#identity, {
      filter: DataViewFilter.condition({field:'sysid',operator:'eq',value:normalizedProjectId}),
      page:{index:1,size:50},sort:[{field:'rowid',direction:'asc'}],allPages:true,maxRows:50_000,
    })
    const records = validateLowcodeProjectBlueprintRecords(normalizedProjectId, normalizeLowcodeProjectBlueprintRecords(context.rows))
    return {context, records}
  }

  /** 原模型查询 owner 持权限与保存凭据；正式记录仅包含消费行。 */
  public async readRecords(projectId: string): Promise<readonly LowcodeProjectBlueprintRecord[]> {
    return (await this.readQuery(projectId)).records
  }

  /** 只更新一个导航节点的六阶段所属字段，并以正式 GetData 读回确认。 */
  public async updateNodeFields(
    projectId: string,
    nodeId: string,
    patch: LowcodeProjectBlueprintPatch,
  ): Promise<LowcodeProjectBlueprintRecord> {
    const normalizedNodeId = nodeId.trim()
    if (!normalizedNodeId) throw new Error('nodeId 不能为空')
    const entries = Object.entries(patch)
    if (entries.length === 0) throw new Error('导航节点更新字段不能为空')
    const {context, records} = await this.readQuery(projectId)
    const preimage = records.find(record => record.nodeId === normalizedNodeId)
    if (preimage === undefined) throw new Error(`项目中不存在导航节点 ${normalizedNodeId}`)
    const writes: Array<[LowcodeProjectBlueprintMutableField, string | number]> = []
    for (const [field, value] of entries) {
      if (!isMutableField(field)) {
        throw new Error(`导航字段不属于蓝图写入合同：${field}`)
      }
      if (context.fieldAccess(normalizedNodeId, field).write !== 'allowed') throw new Error(`后端权限不允许修改导航字段 ${field}`)
      writes.push([field, value])
    }
    await this.#runtime.save({changes:[{identity:this.#identity,context,changes:{changed:[{rowid:normalizedNodeId,...Object.fromEntries(writes)}]}}]})
    const readback = (await this.readRecords(projectId)).find(record => record.nodeId === normalizedNodeId)
    if (readback === undefined) throw new Error(`导航节点 ${normalizedNodeId} 更新后无法读回`)
    for (const [field, expected] of writes) {
      const actual = readbackValue(readback, field)
      const matches = typeof expected === 'number'
        ? Number(actual ?? 0) === expected
        : String(actual ?? '') === expected
      if (!matches) {
        throw new Error(`导航字段 ${field} 写入后读回不一致`)
      }
    }
    return readback
  }

  /** 正式分组仅提交发生变化的字段；权限与凭据仍由私有原查询上下文持有。 */
  public async updateNode(projectId: string, node: LowcodeProjectBlueprintRecord): Promise<LowcodeProjectBlueprintRecord> {
    const before = (await this.readRecords(projectId)).find(record => record.nodeId === node.nodeId)
    if (!before) throw new Error(`项目中不存在导航节点 ${node.nodeId}`)
    const fields = lowcodeProjectBlueprintFields(node)
    const previous = lowcodeProjectBlueprintFields(before)
    const patch: Record<string, string | number> = {}
    for (const [field, value] of Object.entries(fields)) if (previous[field] !== value) patch[field] = value
    const version = node.source['VersionId']
    if (typeof version === 'string' && readbackValue(before, 'VersionId') !== version) patch['VersionId'] = version
    return Object.keys(patch).length ? this.updateNodeFields(projectId, node.nodeId, patch) : before
  }

  public async createNode(projectId: string, node: LowcodeProjectBlueprintRecord): Promise<LowcodeProjectBlueprintRecord> {
    if (node.projectId !== projectId || !node.nodeId.trim()) throw new Error('新增蓝图节点身份不属于当前项目')
    const {context, records} = await this.readQuery(projectId)
    if (records.some(record => record.nodeId === node.nodeId)) throw new Error('新增节点 ID 已存在，禁止重复提交')
    if (node.parentNodeId && !records.some(record => record.nodeId === node.parentNodeId)) throw new Error('新增节点的父节点不存在')
    if (node.parentNodeId ? context.createChildActionState(node.parentNodeId) !== 'enabled' : !context.allowAdd) throw new Error('后端权限不允许新增蓝图节点')
    const fields = lowcodeProjectBlueprintFields(node)
    await this.#runtime.save({changes:[{identity:this.#identity,context,changes:{added:[context.prepareNewRow({rowid:node.nodeId,
      SysId:projectId,prowid:node.parentNodeId || '000000',...fields})]}}]})
    const readback = (await this.readRecords(projectId)).find(record => record.nodeId === node.nodeId)
    if (readback?.parentNodeId !== node.parentNodeId) throw new Error('新增已提交，但节点未确认；禁止自动重试')
    for (const [field, value] of Object.entries(fields)) {
      if (String(lowcodeProjectBlueprintFields(readback)[field]) !== String(value)) throw new Error(`新增节点回读不一致：${field}`)
    }
    return readback
  }

  public async deleteNode(projectId: string, nodeId: string): Promise<LowcodeProjectBlueprintRecord> {
    const {context, records} = await this.readQuery(projectId)
    const before = records.find(record => record.nodeId === nodeId)
    if (!before) throw new Error('删除节点不存在')
    if (records.some(record => record.parentNodeId === nodeId)) throw new Error('存在子节点，不能直接删除')
    if (context.deleteActionState(nodeId) !== 'enabled') throw new Error('后端权限不允许删除蓝图节点')
    await this.#runtime.save({changes:[{identity:this.#identity,context,changes:{deleted:[{rowid:nodeId}]}}]})
    if ((await this.readRecords(projectId)).some(record => record.nodeId === nodeId)) throw new Error('删除后仍能读取节点')
    return before
  }

  /** 读取 GetNavigationMenus 的后端授权事实；beginNodeId 为授权树根。 */
  public async readNavigationAuthorization(
    projectId: string,
    beginNodeId: string,
  ): Promise<LowcodeNavigationAuthorizationEvidence> {
    const normalizedProjectId = projectId.trim()
    const normalizedBeginNodeId = beginNodeId.trim()
    if (!normalizedProjectId || !normalizedBeginNodeId) {
      throw new Error('projectId 和 beginNodeId 不能为空')
    }
    const authorization = await this.#client.requestResult({
      path: `/api/FormDesign/GetNavigationMenus/${encodeURIComponent(normalizedProjectId)}/${encodeURIComponent(normalizedBeginNodeId)}`,
      method: 'GET',
    })
    return normalizeLowcodeNavigationAuthorization(authorization)
  }

  /** 提交 legacy 文档导出任务（SRS/SDD/功能设计）；返回 coverage=legacy-menu-scope 的任务回执，不等待生成完成。 */
  public async submitDocument(
    projectId: string,
    kind: LowcodeProjectBlueprintDocumentKind,
    options: LowcodeProjectBlueprintDocumentSubmitOptions = {},
  ): Promise<LowcodeProjectBlueprintDocumentTask> {
    const normalizedProjectId = projectId.trim()
    if (!normalizedProjectId) throw new Error('projectId 不能为空')
    const query = new URLSearchParams({ sysId: normalizedProjectId })
    let endpoint: string
    if (kind === 'requirements-specification') {
      endpoint = '/api/File/exportSRS'
    } else if (kind === 'system-detailed-design') {
      endpoint = '/api/File/exportSDD'
    } else {
      endpoint = '/api/File/exportDesignDoc'
      if (options.level !== undefined) query.set('level', String(options.level))
      query.set('isText', String(options.includeText ?? true))
      query.set('isHtml', String(options.includeHtml ?? true))
    }
    const result = await this.#client.requestResult({
      path: `${endpoint}?${query.toString()}`,
      method: 'GET',
    })
    return {
      projectId: normalizedProjectId,
      kind,
      status: 'submitted',
      coverage: 'legacy-menu-scope',
      message: typeof result === 'string' ? result : '蓝图文档任务已提交',
    }
  }
}
