/**
 * @module app:services/smart-bid/content-draft-save-rule
 * 职责：向宿主提供WorkingDraft内容结构与规范载荷的原生领域保存规则。
 * 边界：宿主在本次模型实例注册；不查询、不保存、不做服务端版本/请求键/采用授权检查。
 */
import type {DataTableQuerySaveRule} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {canonicalContentNode} from './content-node-hash'
import {validateContentTreeStructure} from './content-tree-structure'
import {readContentNodeLinks} from './content/content-node-links'

/** 数据库 JSON 字段可能以 JSON 文本返回；领域消费者统一获得独立对象副本。 */
export function decodeContentDraftPayload(value: unknown): Record<string, unknown> {
  let decoded = value
  if (typeof decoded === 'string') {
    try {decoded = JSON.parse(decoded)} catch {throw Error('CONTENT_DRAFT_PAYLOAD')}
  }
  if (!isRecord(decoded)) throw Error('CONTENT_DRAFT_PAYLOAD')
  return structuredClone(decoded)
}

/** 保留正式字段原存储格式，避免页面把对象值强制写回文本列的第二格式。 */
export function encodeContentDraftPayload(original: unknown, value: unknown): unknown {
  const decoded = decodeContentDraftPayload(value)
  return typeof original === 'string' ? JSON.stringify(decoded) : decoded
}

/** 校验草稿中本项目的内容树；独立响应内容和提交效力仍由各自领域合同校验。 */
export function validateContentDraftPayload(input: Readonly<{projectId: string; draft: unknown}>): void {
  const {projectId} = input, draft = decodeContentDraftPayload(input.draft)
  if (!projectId.trim() || !Array.isArray(draft['nodes']) || !Array.isArray(draft['responseChanges'])) throw Error('CONTENT_DRAFT_PAYLOAD')
  const nodes = draft['nodes'].map((item: unknown) => {
    canonicalContentNode(item)
    if (!isRecord(item) || typeof item['nodeId'] !== 'string' || typeof item['parentId'] !== 'string'
      || typeof item['index'] !== 'number' || typeof item['type'] !== 'string') throw Error('CONTENT_DRAFT_PAYLOAD')
    if(item['type']==='table')readContentNodeLinks(item)
    return {nodeId: item['nodeId'], parentId: item['parentId'], index: item['index'], type: item['type']}
  })
  const errors = validateContentTreeStructure({projectId, nodes})
  if (errors.length) throw Error(`内容结构无效：${errors.join('；')}`)
}

/** 本次项目模型实例的同步保存规则；使用原DataSet提交、权限、依赖可读性与未知捕获核验。 */
export function contentDraftSaveRule(projectId: string): DataTableQuerySaveRule {
  if (!projectId.trim()) throw Error('CONTENT_DRAFT_PROJECT')
  return {groups: [{fields: ['projectId', 'draft'], validate: ({values}) => {
    if (values['projectId'] !== projectId) throw Error('CONTENT_DRAFT_PROJECT')
    validateContentDraftPayload({projectId, draft: values['draft']})
    return undefined
  }}]}
}
