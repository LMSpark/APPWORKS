import {RequestState, type DataView} from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'

/** 只转换节点坐标；旧图的边路径及扩展仍由原文件保留。 */
export class LowcodeDataSpaceViewLayout {
  /** 读取旧图的节点坐标；身份归属由调用方当前正式模型查询校验，不把边转为原生关系。 */
  static positions(text: string): Record<string, {x: number; y: number}> {
    let graph: unknown
    try { graph = JSON.parse(text) } catch { throw new Error('DATA_SPACE_LAYOUT_INVALID: 旧布局不是有效 JSON') }
    if (!isRecord(graph) || graph['graphVersion'] !== 1 || !Array.isArray(graph['nodes']) || !Array.isArray(graph['edges'])) {
      throw new Error('DATA_SPACE_LAYOUT_INVALID: 旧布局结构无效')
    }
    const positions: Record<string, {x: number; y: number}> = {}
    for (const node of graph['nodes']) {
      if (!isRecord(node) || typeof node['id'] !== 'string' || node['id'].length === 0 || node['id'].trim() !== node['id'] || Object.hasOwn(positions, node['id'])
        || typeof node['x'] !== 'number' || !Number.isFinite(node['x'])
        || typeof node['y'] !== 'number' || !Number.isFinite(node['y'])) {
        throw new Error('DATA_SPACE_LAYOUT_INVALID: 节点身份重复或坐标无效')
      }
      Object.defineProperty(positions, node['id'], {value: {x: node['x'], y: node['y']}, enumerable: true})
    }
    return positions
  }

  /** 校验本次布局改动引用的正式模型，消费已加载查询，不补查字段或目标空间数据。 */
  static assertModels(base: Readonly<Record<string, unknown>>, config: Readonly<Record<string, unknown>>, targetId: string, models: DataView | undefined, files?: DataView): void {
    if (!models || models.destroyed || models.requestState !== RequestState.Loaded || models.queryContext['dataSpaceId'] !== targetId) throw new Error('DATA_SPACE_LAYOUT_MODEL: 当前模型查询身份失效')
    const fileKeys = new Set(files?.requestState === RequestState.Loaded && files.queryContext['dataSpaceId'] === targetId
      ? files.rows.filter(row => row['dataSetId'] === targetId && row['resourceType'] === 'file'
        && ['dataSetId', 'tableName', 'resourceType'].every(field => files.fieldAccess(row, field).read === 'visible')).map(row => files.getPkKey(row)) : [])
    const oldPositions = isRecord(base['layout']) && isRecord(base['layout']['modelPositions']) ? base['layout']['modelPositions'] : {}
    const positions = isRecord(config['layout']) && isRecord(config['layout']['modelPositions']) ? config['layout']['modelPositions'] : {}
    const changedIds = [...new Set([...Object.keys(oldPositions), ...Object.keys(positions)])]
      .filter(id => JSON.stringify(oldPositions[id]) !== JSON.stringify(positions[id]))
    const layout = isRecord(config['layout']) ? config['layout'] : {}
    const unbound = isRecord(layout['unboundNodes']) ? layout['unboundNodes'] : {}
    const edges = isRecord(layout['unboundEdges']) ? layout['unboundEdges'] : {}
    for (const [id, edge] of Object.entries(edges)) {
      if (!isRecord(edge)) throw new Error('DATA_SPACE_LAYOUT_MODEL: 待配置连线无效')
      for (const endpoint of [edge['source'], edge['target']]) {
        if (typeof endpoint !== 'string') throw new Error('DATA_SPACE_LAYOUT_MODEL: 连线端点无效')
        if (Object.hasOwn(unbound, endpoint) || fileKeys.has(endpoint)) continue
        const matches = models.rows.filter(row => models.getPkKey(row) === endpoint), row = matches[0]
        if (matches.length !== 1 || row?.['dataSetId'] !== targetId
          || ['rowid', 'dataSetId'].some(field => models.fieldAccess(row, field).read !== 'visible')) throw new Error(`DATA_SPACE_LAYOUT_MODEL: 连线端点不存在或不可读 ${endpoint}`)
      }
      if (Array.isArray(config['resourceRelations']) && config['resourceRelations'].some(relation => isRecord(relation) && relation['relationId'] === id)) {
        throw new Error('DATA_SPACE_LAYOUT_MODEL: 待配置连线与正式关系身份冲突')
      }
    }
    for (const id of Object.keys(unbound)) {
      if (fileKeys.has(id) || models.rows.some(row => models.getPkKey(row) === id) || Object.hasOwn(positions, id)) throw new Error(`DATA_SPACE_LAYOUT_MODEL: 未配置节点与正式模型身份冲突 ${id}`)
    }
    const beforeTables = isRecord(base['layout']) && isRecord(base['layout']['tablePositions']) ? base['layout']['tablePositions'] : {}
    const tablePositions = isRecord(layout['tablePositions']) ? layout['tablePositions'] : {}
    const tables = isRecord(config['tables']) ? config['tables'] : {}
    for (const name of new Set([...Object.keys(beforeTables), ...Object.keys(tablePositions)])) {
      if (JSON.stringify(beforeTables[name]) === JSON.stringify(tablePositions[name])) continue
      const table = tables[name]
      if (isRecord(table) && table['resourceType'] === 'file'
        && !files?.rows.some(row => row['tableName'] === name && fileKeys.has(files.getPkKey(row)))) throw new Error(`DATA_SPACE_LAYOUT_MODEL: 文件模型不可读 ${name}`)
    }

    for (const id of changedIds) {
      // 清除布局引用不要求被引用模型继续存在；新增/移动坐标仍核对当前正式模型。
      // 布局字段自身的写入许可由原DataView保存链检查，不能借此新增失效端点。
      if (!Object.hasOwn(positions, id)) continue
      const matches = models.rows.filter(row => models.getPkKey(row) === id)
      const row = matches[0]
      if (!row || matches.length !== 1 || row['rowid'] !== id || row['dataSetId'] !== targetId
        || ['rowid', 'dataSetId'].some(field => models.fieldAccess(row, field).read !== 'visible')) {
        throw new Error(`DATA_SPACE_LAYOUT_MODEL: 模型身份或读取权限已变化 ${id}`)
      }
    }

  }


}
