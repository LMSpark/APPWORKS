/**
 * @module @spark-appworks/spark-ai:class-model/metadata/metadata-graph
 * 职责：维护 @spark-appworks/spark-ai 中 class-model/metadata/metadata-graph 的 AiApiMetadataGraphEdge、AiApiMetadataGraphNode、AiApiNestedApiRecord语义。
 * 边界：只服务 spark-ai 包内部的 Agent/DtsTypeDeclarationModel 能力，不直接耦合应用页面或 Vue 组件。
 * AI用途：定位 spark-ai 公共 API、运行时协议或知识索引字段时，用本模块作为语义入口。
 */
/**
 * metadata 对象图遍历。
 *
 * 协议真源线：模型（AiApiObjectMetadata）→ 属性 || 方法（action）→ 子模块（嵌套 api）。
 * 实例由会话 scope 钉死；LLM 发现走 metadata 图，执行走 model_script 对象链，不用 /kind[id] path。
 */

import type { AiApiObjectMetadata } from './ai-api-object-metadata-schema'

/** 从父模型到子模型的边：经可读/可写属性，或经 action 的 resultApis。 */
export type AiApiMetadataGraphEdge = Readonly<{
  /** 父 API 对象的 kind 标识。 */
  parentKind: string
  /** 到达子 API 的边类型：属性引用或 action 返回值。 */
  via: 'attribute' | 'action'
  /** 边上的属性名或 action 名。 */
  viaName: string
  /** 边指向的子 API 对象元数据。 */
  child: AiApiObjectMetadata
}>

/** metadata 图中的一个节点（含出边）。 */
export type AiApiMetadataGraphNode = Readonly<{
  /** 当前节点对应的 API 对象元数据。 */
  api: AiApiObjectMetadata
  /** 父节点 kind；根节点为 undefined。 */
  parentKind?: string
  /** 从当前节点出发的所有 metadata 边。 */
  edges: readonly AiApiMetadataGraphEdge[]
}>

/** 扁平嵌套 API 记录，供 guide 投影或注册 companion（迁移期）。 */
export type AiApiNestedApiRecord = Readonly<{
  /** 嵌套 API 对象元数据。 */
  api: AiApiObjectMetadata
  /** 首次发现该嵌套 API 时的父 kind。 */
  parentKind: string
  /** 首次发现时的边类型（属性或 action）。 */
  via: AiApiMetadataGraphEdge['via']
  /** 首次发现时的属性名或 action 名。 */
  viaName: string
}>

/**
 * 自 rootApi 深度优先遍历 metadata 图，返回每个节点的出边。
 * 同一 kind 在图中只展开一次（防 resultApis 环）。
 */
export function walkAiApiMetadataGraph(rootApi: AiApiObjectMetadata): readonly AiApiMetadataGraphNode[] {
  const nodes: AiApiMetadataGraphNode[] = []
  const visited = new Set<string>()

  const visit = (api: AiApiObjectMetadata, parentKind?: string): void => {
    const edges = collectOutgoingEdges(api)
    nodes.push({
      api,
      ...(parentKind === undefined ? {} : { parentKind }),
      edges,
    })
    if (visited.has(api.kind)) return
    visited.add(api.kind)
    for (const edge of edges) {
      visit(edge.child, api.kind)
    }
    visited.delete(api.kind)
  }

  visit(rootApi)
  return nodes
}

/** 收集 root 下所有嵌套 API（不含 root），按 kind 去重，保留首次发现的 parent/via。 */
export function collectNestedApiRecords(rootApi: AiApiObjectMetadata): readonly AiApiNestedApiRecord[] {
  const records = new Map<string, AiApiNestedApiRecord>()
  const visited = new Set<string>([rootApi.kind])

  const walk = (ownerApi: AiApiObjectMetadata): void => {
    for (const edge of collectOutgoingEdges(ownerApi)) {
      registerNested(edge, records)
      if (visited.has(edge.child.kind)) continue
      visited.add(edge.child.kind)
      try {
        walk(edge.child)
      } finally {
        visited.delete(edge.child.kind)
      }
    }
  }

  walk(rootApi)
  return [...records.values()]
}

function collectOutgoingEdges(ownerApi: AiApiObjectMetadata): readonly AiApiMetadataGraphEdge[] {
  const edges: AiApiMetadataGraphEdge[] = []

  for (const attribute of ownerApi.attributes ?? []) {
    if (attribute.api === undefined) continue
    edges.push({
      parentKind: ownerApi.kind,
      via: 'attribute',
      viaName: attribute.name,
      child: attribute.api,
    })
  }

  for (const action of ownerApi.actions) {
    for (const resultApi of action.resultApis ?? []) {
      if (resultApi.api === undefined) continue
      edges.push({
        parentKind: ownerApi.kind,
        via: 'action',
        viaName: action.name,
        child: resultApi.api,
      })
    }
  }

  return edges
}

function registerNested(
  edge: AiApiMetadataGraphEdge,
  records: Map<string, AiApiNestedApiRecord>,
): void {
  if (records.has(edge.child.kind)) return
  records.set(edge.child.kind, {
    api: edge.child,
    parentKind: edge.parentKind,
    via: edge.via,
    viaName: edge.viaName,
  })
}
