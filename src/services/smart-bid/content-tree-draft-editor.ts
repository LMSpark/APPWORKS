/**
 * @module app:services/smart-bid/content-tree-draft-editor
 * 职责：编排人工内容树的草稿编辑，变更只写绑定WorkingDraft视图的draft字段。
 * 边界：不持有页面草稿、不保存或采用修订；取消和持久化继续由原DataView/DataSet承担。
 */
import type {DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {validateContentDraftPayload} from './content-draft-save-rule'

type Node = {nodeId: string; parentId: string; index: number; type: string; class: string[]; value: string; data: Record<string, unknown>}
type ChapterInput = Readonly<{chapterId: string; headingId: string; title: string}>
type ParagraphInput = Readonly<{paragraphId: string; value: string; data?: Readonly<Record<string, unknown>>}>
function node(input: Readonly<{nodeId: string; parentId: string; type: string; value?: string}>): Node {
  return {...input, index: 0, class: [], value: input.value ?? '', data: {}}
}
function reorder(nodes: Node[], parentId: string): void {
  nodes.filter(item => item.parentId === parentId).sort((a, b) => a.index - b.index).forEach((item, index) => {item.index = index})
}
function insert(nodes: Node[], next: Node, at?: number): void {
  const siblings = nodes.filter(item => item.parentId === next.parentId).sort((a, b) => a.index - b.index)
  const index = at ?? siblings.length
  if (!Number.isSafeInteger(index) || index < 0 || index > siblings.length) throw Error('内容插入位置无效')
  siblings.slice(index).forEach(item => {item.index++})
  next.index = index; nodes.push(next)
}
function paragraph(parentId: string, input: ParagraphInput): Node {
  return {...node({nodeId: input.paragraphId, parentId, type: 'paragraph', value: input.value}), data: structuredClone(input.data ?? {})}
}

/** 对指定项目和草稿行执行语义动作；每次操作重新读取原视图编辑覆盖和当前字段权限。 */
export class ContentTreeDraftEditor {
  constructor(private readonly view: DataView, private readonly draftId: string | number, private readonly projectId: string) {}

  private edit(change: (nodes: Node[]) => void): void {
    const row = this.view.getEditingRow(this.draftId)
    if (!row || !this.projectId.trim() || row['projectId'] !== this.projectId
      || this.view.fieldAccess(row, 'projectId').read !== 'visible'
      || this.view.fieldAccess(row, 'draft').read !== 'visible'
      || this.view.fieldAccess(row, 'draft').write !== 'allowed') throw Error('当前项目草稿不可编辑')
    const draft: unknown = structuredClone(row['draft'])
    if (!isRecord(draft) || !Array.isArray(draft['nodes']) || !Array.isArray(draft['responseChanges'])) throw Error('草稿内容结构无效')
    const nodes: Node[] = draft['nodes'].map((value: unknown) => {
      if (!isRecord(value) || typeof value['nodeId'] !== 'string' || typeof value['parentId'] !== 'string'
        || typeof value['index'] !== 'number' || typeof value['type'] !== 'string' || typeof value['value'] !== 'string'
        || !Array.isArray(value['class']) || !value['class'].every((item: unknown) => typeof item === 'string')
        || !isRecord(value['data'])) throw Error('草稿节点结构无效')
      return {...value, nodeId: value['nodeId'], parentId: value['parentId'], index: value['index'], type: value['type'],
        class: value['class'], value: value['value'], data: value['data']}
    })
    change(nodes)
    // 正式载荷校验先于唯一写回；失败不污染原DataView编辑覆盖，也不重算/覆盖历史摘要。
    validateContentDraftPayload({projectId: this.projectId, draft: {...draft, nodes}})
    const ordered: Node[] = []
    const visit = (parentId: string) => {
      for (const child of nodes.filter(item => item.parentId === parentId).sort((a, b) => a.index - b.index)) {
        ordered.push(child); visit(child.nodeId)
      }
    }
    visit(this.projectId)
    this.view.updateEditingValue(this.draftId, 'draft', {...draft, nodes: ordered})
  }

  /** 新增逻辑册并建立首章及标题，册不是文件格式。 */
  addDocument(input: ChapterInput & Readonly<{documentId: string}>): void {
    this.edit(nodes => {
      insert(nodes, node({nodeId: input.documentId, parentId: this.projectId, type: 'document'}))
      nodes.push(node({nodeId: input.chapterId, parentId: input.documentId, type: 'chapter'}),
        node({nodeId: input.headingId, parentId: input.chapterId, type: 'heading', value: input.title}))
    })
  }

  /** 在逻辑册或章节下新增章节及唯一首标题。 */
  addChapter(parentId: string, input: ChapterInput, index?: number): void {
    this.edit(nodes => {
      insert(nodes, node({nodeId: input.chapterId, parentId, type: 'chapter'}), index)
      nodes.push(node({nodeId: input.headingId, parentId: input.chapterId, type: 'heading', value: input.title}))
    })
  }

  /** 新增正文段落；字段引用留在同一节点data，不展开成另份正文。 */
  addParagraph(parentId: string, input: Readonly<{nodeId: string; value: string; data?: Readonly<Record<string, unknown>>}>, index?: number): void {
    this.edit(nodes => insert(nodes, {...node({nodeId: input.nodeId, parentId, type: 'paragraph', value: input.value}), data: structuredClone(input.data ?? {})}, index))
  }

  /** 新建完整非空列表；ordered仅为语义类，编号和布局仍交模板。 */
  addList(parentId: string, input: ParagraphInput & Readonly<{listId: string; itemId: string; ordered?: boolean}>, index?: number): void {
    this.edit(nodes => {
      const list = node({nodeId: input.listId, parentId, type: 'list'})
      if (input.ordered === true) list.class = ['ordered']
      insert(nodes, list, index)
      nodes.push(node({nodeId: input.itemId, parentId: input.listId, type: 'item'}), paragraph(input.itemId, input))
    })
  }

  /** 在原列表中插入带首段的条目；不产生空容器或另一份条目正文。 */
  addListItem(listId: string, input: ParagraphInput & Readonly<{itemId: string}>, index?: number): void {
    this.edit(nodes => {
      insert(nodes, node({nodeId: input.itemId, parentId: listId, type: 'item'}), index)
      nodes.push(paragraph(input.itemId, input))
    })
  }

  /** 引文按quote及其原段落表达，文字不转换为Markdown引用块。 */
  addQuote(parentId: string, input: ParagraphInput & Readonly<{quoteId: string}>, index?: number): void {
    this.edit(nodes => {
      insert(nodes, node({nodeId: input.quoteId, parentId, type: 'quote'}), index)
      nodes.push(paragraph(input.quoteId, input))
    })
  }

  /** 册首唯一目录要求；目录项由标题派生，不写入节点数据。 */
  addTableOfContents(documentId: string, nodeId: string): void {
    this.edit(nodes => insert(nodes, node({nodeId, parentId: documentId, type: 'toc'}), 0))
  }

  /** 编辑标题、正文或题注；语义类型和稳定身份不变，正式引用/交付校验另行执行。 */
  updateText(nodeId: string, value: string, data?: Readonly<Record<string, unknown>>): void {
    this.edit(nodes => {
      const target = nodes.find(item => item.nodeId === nodeId)
      if (!target || !['heading', 'paragraph', 'caption'].includes(target.type)) throw Error('该节点不是可编辑正文')
      target.value = value
      if (data !== undefined) target.data = structuredClone(data)
    })
  }

  /** 按移除后的目标同级位置移动完整子树；非法父、环或六级限制不产生部分编辑。 */
  move(nodeId: string, parentId: string, index: number): void {
    this.edit(nodes => {
      const position = nodes.findIndex(item => item.nodeId === nodeId), target = nodes[position]
      if (!target) throw Error('内容节点不存在')
      nodes.splice(position, 1); reorder(nodes, target.parentId)
      target.parentId = parentId; insert(nodes, target, index)
    })
  }

  /** 删除指定子树；剩余内容仍须符合逻辑册及章节结构。 */
  remove(nodeId: string): void {
    this.edit(nodes => {
      if (!nodes.some(item => item.nodeId === nodeId)) throw Error('内容节点不存在')
      const removed = new Set([nodeId])
      let count = 0
      while (count !== removed.size) {
        count = removed.size
        nodes.forEach(item => {if (removed.has(item.parentId)) removed.add(item.nodeId)})
      }
      for (let index = nodes.length - 1; index >= 0; index--) {
        const item = nodes[index]
        if (item && removed.has(item.nodeId)) nodes.splice(index, 1)
      }
      new Set(nodes.map(item => item.parentId)).forEach(parent => reorder(nodes, parent))
    })
  }
}
