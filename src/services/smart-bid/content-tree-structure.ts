/**
 * @module app:services/smart-bid/content-tree-structure
 * 职责：核对投标规格§1的逻辑内容树结构；不保存草稿、不采用修订。
 * 边界：只校验身份、结构和顺序；正文引用、哈希及权限由各自合同继续核验。
 */

/** 固定修订中一个节点的结构投影；项目根不另造节点。 */
export type ContentStructureNode = Readonly<{
  /** 项目内稳定节点身份。 */
  nodeId: string
  /** document 指向项目，其余指向册内节点。 */
  parentId: string
  /** 同级从零连续的位置。 */
  index: number
  /** 规格定义的业务语义类型。 */
  type: string
}>

const childrenAllowed: Readonly<Record<string, readonly string[]>> = {
  document: ['toc', 'chapter'], chapter: ['heading', 'paragraph', 'list', 'table', 'figure', 'quote', 'raw', 'chapter'],
  list: ['item'], item: ['paragraph', 'list', 'table'], figure: ['image', 'caption'], quote: ['paragraph'],
  toc: [], heading: [], paragraph: [], table: [], image: [], caption: [], raw: [],
}

/** 返回结构缺项；空数组只证明结构成立，不证明正文可交付或正式采用成功。 */
export function validateContentTreeStructure(input: Readonly<{projectId: string; nodes: readonly ContentStructureNode[]}>): string[] {
  const errors: string[] = [], byId = new Map<string, ContentStructureNode>(), groups = new Map<string, ContentStructureNode[]>()
  if (!input.projectId.trim()) errors.push('PROJECT_ID')
  for (const node of input.nodes) {
    if (!node.nodeId.trim() || node.nodeId === input.projectId || byId.has(node.nodeId)) errors.push(`NODE_ID:${node.nodeId}`)
    byId.set(node.nodeId, node)
    const siblings = groups.get(node.parentId) ?? []
    siblings.push(node); groups.set(node.parentId, siblings)
    if (!Object.hasOwn(childrenAllowed, node.type)) errors.push(`TYPE:${node.nodeId}`)
  }
  for (const [parentId, siblings] of groups) {
    siblings.sort((a, b) => a.index - b.index)
    if (siblings.some((node, index) => !Number.isSafeInteger(node.index) || node.index !== index)) errors.push(`ORDER:${parentId}`)
    const parent = byId.get(parentId)
    const allowed = parentId === input.projectId ? ['document']
      : parent !== undefined && Object.hasOwn(childrenAllowed, parent.type) ? childrenAllowed[parent.type] ?? [] : []
    for (const child of siblings) if (!allowed.includes(child.type)) errors.push(`PARENT:${child.nodeId}`)
  }
  for (const node of input.nodes) {
    const children = groups.get(node.nodeId) ?? [], kinds = children.map(child => child.type)
    if (node.type === 'document' && (kinds.filter(kind => kind === 'toc').length > 1 || kinds.includes('toc') && kinds[0] !== 'toc' || !kinds.includes('chapter'))) errors.push(`DOCUMENT:${node.nodeId}`)
    if (node.type === 'chapter' && (kinds[0] !== 'heading' || kinds.filter(kind => kind === 'heading').length !== 1)) errors.push(`CHAPTER_HEADING:${node.nodeId}`)
    if (['list', 'item', 'quote'].includes(node.type) && children.length === 0) errors.push(`EMPTY_CONTAINER:${node.nodeId}`)
    if (node.type === 'figure' && (kinds[0] !== 'image' || kinds.filter(kind => kind === 'image').length !== 1 || kinds.filter(kind => kind === 'caption').length > 1)) errors.push(`FIGURE:${node.nodeId}`)
    const seen = new Set<string>(); let current: ContentStructureNode | undefined = node, chapters = 0
    while (current !== undefined) {
      if (seen.has(current.nodeId)) {errors.push(`CYCLE:${node.nodeId}`); break}
      seen.add(current.nodeId)
      if (current.type === 'chapter') chapters++
      current = byId.get(current.parentId)
    }
    if (chapters > 6) errors.push(`CHAPTER_DEPTH:${node.nodeId}`)
  }
  return errors
}
