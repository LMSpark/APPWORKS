/**
 * @module @spark-appworks/spark-project-model:io/project-blueprint-record-store
 * 职责：通过注入的 SPARK Data owner 读取蓝图记录并确认节点命令回读。
 * 边界：宿主提供已注册模型身份；凭据仍由原查询 owner 持有，不由 source 重建。
 * AI用途：使用正式四组记录编辑蓝图，区分业务保存、授权读取和文档任务提交。
 */
import { DataViewFilter } from '@spark-appworks/spark-data'
import type { DataSpaceQueryIdentity, DataSpaceRuntimeApi } from '@spark-appworks/spark-data'
import {
  validateProjectBlueprintRecords,
  type ProjectBlueprintRecord,
} from '../blueprint/project-blueprint-record'
import { decodeProjectBlueprintRows, encodeProjectBlueprintFields } from './project-blueprint-record-codec'

export const PROJECT_BLUEPRINT_MUTABLE_FIELDS = [
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
type ProjectBlueprintMutableField = typeof PROJECT_BLUEPRINT_MUTABLE_FIELDS[number]
/** 单节点字段变更；不接受权限、签名或请求应用身份作为业务 patch。 */
type BlueprintPatchFields = Partial<Record<ProjectBlueprintMutableField, string | number>>
type ProjectBlueprintRecordPatch = Readonly<BlueprintPatchFields>

function isMutableField(field: string): field is ProjectBlueprintMutableField {
  return PROJECT_BLUEPRINT_MUTABLE_FIELDS.some(candidate => candidate === field)
}

type BlueprintRecordOwner = Pick<DataSpaceRuntimeApi, 'query' | 'save'>
type BlueprintRecordStoreOptions = Readonly<{owner: BlueprintRecordOwner; identity: DataSpaceQueryIdentity}>

function readbackValue(record: ProjectBlueprintRecord, field: ProjectBlueprintMutableField): unknown {
  if (field === 'VersionId') return record.source['VersionId'] ?? record.source['versionId']
  return record.source[field]
}

/** 正式记录 IO 共用原 SPARK Data owner；应用编辑工作区直接使用其 DataView。 */
export class ProjectBlueprintRecordStore {
  readonly #owner: BlueprintRecordOwner
  readonly #identity: DataSpaceQueryIdentity

  /** 注入现有请求与原查询保存 owner；不从公开 source 重建授权凭据。 */
  public constructor(options: BlueprintRecordStoreOptions) {
    this.#owner = options.owner
    this.#identity = Object.freeze({ ...options.identity })
  }

  private async readQuery(projectId: string) {
    const normalizedProjectId = projectId.trim()
    if (!normalizedProjectId) throw new Error('projectId 不能为空')
    const context = await this.#owner.query(this.#identity, {
      filter: DataViewFilter.condition({field:'sysid',operator:'eq',value:normalizedProjectId}),
      page:{index:1,size:50},sort:[{field:'rowid',direction:'asc'}],allPages:true,maxRows:50_000,
    })
    const records = validateProjectBlueprintRecords(normalizedProjectId, decodeProjectBlueprintRows(context.rows))
    return {context, records}
  }

  /** 原模型查询 owner 持权限与保存凭据；正式记录仅包含消费行。 */
  public async readRecords(projectId: string): Promise<readonly ProjectBlueprintRecord[]> {
    return (await this.readQuery(projectId)).records
  }

  /** 只更新一个导航节点的六阶段所属字段，并以正式 GetData 读回确认。 */
  public async updateNodeFields(
    projectId: string,
    nodeId: string,
    patch: ProjectBlueprintRecordPatch,
  ): Promise<ProjectBlueprintRecord> {
    const normalizedNodeId = nodeId.trim()
    if (!normalizedNodeId) throw new Error('nodeId 不能为空')
    const entries = Object.entries(patch)
    if (entries.length === 0) throw new Error('导航节点更新字段不能为空')
    const {context, records} = await this.readQuery(projectId)
    const preimage = records.find(record => record.nodeId === normalizedNodeId)
    if (preimage === undefined) throw new Error(`项目中不存在导航节点 ${normalizedNodeId}`)
    const writes: Array<[ProjectBlueprintMutableField, string | number]> = []
    for (const [field, value] of entries) {
      if (!isMutableField(field)) {
        throw new Error(`导航字段不属于蓝图写入合同：${field}`)
      }
      if (context.fieldAccess(normalizedNodeId, field).write !== 'allowed') throw new Error(`后端权限不允许修改导航字段 ${field}`)
      writes.push([field, value])
    }
    await this.#owner.save({changes:[{identity:this.#identity,context,changes:{changed:[{rowid:normalizedNodeId,...Object.fromEntries(writes)}]}}]})
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
  public async updateNode(projectId: string, node: ProjectBlueprintRecord): Promise<ProjectBlueprintRecord> {
    const before = (await this.readRecords(projectId)).find(record => record.nodeId === node.nodeId)
    if (!before) throw new Error(`项目中不存在导航节点 ${node.nodeId}`)
    const fields = encodeProjectBlueprintFields(node)
    const previous = encodeProjectBlueprintFields(before)
    const patch: Record<string, string | number> = {}
    for (const [field, value] of Object.entries(fields)) if (previous[field] !== value) patch[field] = value
    const version = node.source['VersionId']
    if (typeof version === 'string' && readbackValue(before, 'VersionId') !== version) patch['VersionId'] = version
    return Object.keys(patch).length ? this.updateNodeFields(projectId, node.nodeId, patch) : before
  }

  public async createNode(projectId: string, node: ProjectBlueprintRecord): Promise<ProjectBlueprintRecord> {
    if (node.projectId !== projectId || !node.nodeId.trim()) throw new Error('新增蓝图节点身份不属于当前项目')
    const {context, records} = await this.readQuery(projectId)
    if (records.some(record => record.nodeId === node.nodeId)) throw new Error('新增节点 ID 已存在，禁止重复提交')
    if (node.parentNodeId && !records.some(record => record.nodeId === node.parentNodeId)) throw new Error('新增节点的父节点不存在')
    if (!context.allowAdd || node.parentNodeId && !records.some(record => record.nodeId === node.parentNodeId)) {
      throw new Error('后端权限不允许新增蓝图节点')
    }
    const fields = encodeProjectBlueprintFields(node)
    await this.#owner.save({changes:[{identity:this.#identity,context,changes:{added:[context.prepareNewRow({rowid:node.nodeId,
      SysId:projectId,prowid:node.parentNodeId || '000000',...fields})]}}]})
    const readback = (await this.readRecords(projectId)).find(record => record.nodeId === node.nodeId)
    if (readback?.parentNodeId !== node.parentNodeId) throw new Error('新增已提交，但节点未确认；禁止自动重试')
    for (const [field, value] of Object.entries(fields)) {
      if (String(encodeProjectBlueprintFields(readback)[field]) !== String(value)) throw new Error(`新增节点回读不一致：${field}`)
    }
    return readback
  }

  public async deleteNode(projectId: string, nodeId: string): Promise<ProjectBlueprintRecord> {
    const {context, records} = await this.readQuery(projectId)
    const before = records.find(record => record.nodeId === nodeId)
    if (!before) throw new Error('删除节点不存在')
    if (records.some(record => record.parentNodeId === nodeId)) throw new Error('存在子节点，不能直接删除')
    if (context.deleteActionState(nodeId) !== 'enabled') throw new Error('后端权限不允许删除蓝图节点')
    await this.#owner.save({changes:[{identity:this.#identity,context,changes:{deleted:[{rowid:nodeId}]}}]})
    if ((await this.readRecords(projectId)).some(record => record.nodeId === nodeId)) throw new Error('删除后仍能读取节点')
    return before
  }
}

/** Runtime/publication consumers receive a read-only projection, not a second editing API. */
export function createProjectBlueprintRecordReader(options: BlueprintRecordStoreOptions) {
  const store = new ProjectBlueprintRecordStore(options)
  return { readRecords: (projectId: string) => store.readRecords(projectId) }
}
