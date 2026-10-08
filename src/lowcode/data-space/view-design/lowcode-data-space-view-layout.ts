import type { DataSet } from '@spark-appworks/spark-data'
import type { ScenarioViewFile } from '@spark-appworks/spark-project-model'
import { isRecord } from '@spark-appworks/spark-utils'

/** 只转换节点坐标；旧图的边路径及扩展仍由原文件保留。 */
export class LowcodeDataSpaceViewLayout {
  static merge(text: string, file: ScenarioViewFile, dataSet: DataSet): string {
    let graph: unknown
    try { graph = JSON.parse(text) } catch { throw new Error('DATA_SPACE_LAYOUT_INVALID: 旧布局不是有效 JSON') }
    if (!isRecord(graph) || graph['graphVersion'] !== 1 || !Array.isArray(graph['nodes']) || !Array.isArray(graph['edges'])) {
      throw new Error('DATA_SPACE_LAYOUT_INVALID: 旧布局结构无效')
    }
    const positions = new Map(Object.entries(dataSet.layout?.tablePositions ?? {}))
    const seen = new Set<string>()
    let changed = false
    for (const node of graph['nodes']) {
      if (!isRecord(node) || typeof node['id'] !== 'string' || !node['id'] || seen.has(node['id'])
        || typeof node['x'] !== 'number' || !Number.isFinite(node['x'])
        || typeof node['y'] !== 'number' || !Number.isFinite(node['y'])) {
        throw new Error('DATA_SPACE_LAYOUT_INVALID: 节点身份重复或坐标无效')
      }
      seen.add(node['id'])
      const matches = Object.entries(dataSet.tables).filter(([, table]) => table.modelBinding?.modelId === node['id'])
      const matched = matches[0]
      if (matches.length !== 1 || !matched) throw new Error(`DATA_SPACE_LAYOUT_MODEL: 模型未唯一绑定 ${node['id']}`)
      const [tableName] = matched
      const existing = positions.get(tableName)
      if (existing && (existing.x !== node['x'] || existing.y !== node['y'])) {
        throw new Error(`DATA_SPACE_LAYOUT_CONFLICT: 原生位置与旧布局不同 ${tableName}`)
      }
      if (!existing) {
        positions.set(tableName, {x: node['x'], y: node['y']})
        changed = true
      }
    }
    return changed ? JSON.stringify({...file.value.toJSON(),
      layout: {...dataSet.layout, tablePositions: Object.fromEntries(positions)}}) : file.getText()
  }
}
