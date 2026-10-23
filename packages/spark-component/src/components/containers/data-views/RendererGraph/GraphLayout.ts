/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererGraph/GraphLayout
 * 职责：为标准关系图计算确定性的有向层次坐标。
 * 边界：只消费已校验的节点身份和边，不读取数据、推导关系或保存布局。
 * AI用途：缺失布局时生成可预览的全模型位置，持久化交回所属业务owner。
 */
/** 节点的原始主键，保留字符串或数字类型。 */
type GraphKey = string | number
/** 已由调用方核对身份和读取权限的有向边。 */
type GraphEdge = Readonly<{
  /** 父节点主键，必须在节点集合中。 */
  source: GraphKey
  /** 子节点主键，必须在节点集合中。 */
  target: GraphKey
}>
/** 生成的节点中心坐标；由调用方预览并决定是否保存。 */
type GraphPosition = Readonly<{
  /** 对应输入集合中的原始节点主键。 */
  id: GraphKey
  /** 中心横坐标，按关系层次排列。 */
  x: number
  /** 中心纵坐标，同层按输入顺序排列。 */
  y: number
}>

/** 标准232×120节点的层次排列；同层保持输入顺序，环内节点按每四个一层回退。 */
export class GraphLayout {
  /** 按当前横坐标、纵坐标稳定排序后网格对齐；宽度为画布像素，坐标仍为节点中心。不改变关系或输入节点。 */
  static grid(nodes: readonly GraphPosition[], width: number): readonly GraphPosition[] {
    if (!Number.isFinite(width) || width <= 0 || nodes.some(node => !Number.isFinite(node.x) || !Number.isFinite(node.y))) throw new Error('画布尺寸或节点坐标无效')
    GraphLayout.positions(nodes.map(node => node.id), [])
    const gapX = 276, gapY = 148, startX = 170, startY = 110
    const columns = Math.max(1, Math.floor(Math.max(width - startX * 2, 0) / gapX) + 1)
    return [...nodes].sort((a, b) => a.x - b.x || a.y - b.y).map((node, index) => ({
      id: node.id, x: startX + index % columns * gapX, y: startY + Math.floor(index / columns) * gapY,
    }))
  }

  /** 坐标为节点中心；无效、重复身份及失效端点拒绝生成，调用方先核数据权限。 */
  static positions(keys: readonly GraphKey[], edges: readonly GraphEdge[]): readonly GraphPosition[] {
    const ids = new Set(keys)
    if (ids.size !== keys.length || keys.some(id => typeof id === 'number' ? !Number.isFinite(id) : !id.trim() || id.trim() !== id)) throw new Error('图节点身份无效或重复')
    const children = new Map<GraphKey, GraphKey[]>(keys.map(id => [id, []]))
    const degrees = new Map(keys.map(id => [id, 0]))
    for (const edge of edges) {
      if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error('图关系端点不存在')
      children.get(edge.source)?.push(edge.target)
      degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1)
    }
    const levels = new Map<GraphKey, number>(), queue = keys.filter(id => degrees.get(id) === 0)
    for (const id of queue) levels.set(id, 0)
    for (const id of queue) {
      for (const child of children.get(id) ?? []) {
        levels.set(child, Math.max(levels.get(child) ?? 0, (levels.get(id) ?? 0) + 1))
        degrees.set(child, (degrees.get(child) ?? 0) - 1)
        if (degrees.get(child) === 0) queue.push(child)
      }
    }
    const rows = new Map<number, number>()
    return keys.map((id, index) => {
      const level = levels.get(id) ?? Math.floor(index / 4), row = rows.get(level) ?? 0
      rows.set(level, row + 1)
      return {id, x: 250 + level * 334, y: 150 + row * 206}
    })
  }
}
