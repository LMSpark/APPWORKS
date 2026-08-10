/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererTree/zero-code
 * 职责：封装 RendererTree（r-tree）的 zero-code 行为层，向配置动作和脚本暴露稳定的组件操作 API。
 * 边界：只编排 table-level/data-view-container 的运行时能力、原生组件引用和事件控制，不声明视觉 props，也不持久化业务数据。
 * AI用途：当动作、脚本或 ClassModel 需要调用 renderer tree 的选择、刷新、编辑、分页或树/表操作时，使用本模块确认 API 语义。
 */
import { nextTick } from 'vue'
import { isDataRow, type DataView, type DataRow } from '@spark-appworks/spark-data'
import type { LoggerApi } from '@spark-appworks/spark-utils'
import {
  createCancellableControl,
  type CancellableControl,
} from '../../../internal'
import type { ValueRef } from '../../../shared-types.js'
import {
  createContainerCrudContext,
  getNativeRefValue,
} from '../zero-code-shared.js'
import type { RendererTreeApi } from './types'

/** r-tree 对外暴露的树节点数据形态，兼容普通 DataRow 和嵌套 children。 */
export type RendererTreeNode = {
  /** 树节点的业务主键；用于选中、拖拽移动和 Element Plus 节点定位。 */
  id?: string | number
  /** 节点展示文本；优先用于树节点标题。 */
  label?: string
  /** 兼容后端常见字段名的节点展示文本。 */
  name?: string
  /** 子节点集合；存在时按嵌套树数据渲染。 */
  children?: RendererTreeNode[]
  /** 是否禁用该节点的选择、勾选或交互。 */
  disabled?: boolean
  /** 允许保留业务行上的额外字段，供脚本和动作读取。 */
  [key: string]: unknown
}

/** Element Plus 树节点实例的最小结构，供事件回调和拖拽逻辑读取。 */
export type ElTreeNode = {
  /** Element Plus 树节点层级，从根层开始递增。 */
  level: number
  /** Element Plus 树节点当前是否展开。 */
  expanded: boolean
  /** 树节点绑定的原始 DataRow。 */
  data?: DataRow
  /** 父级 Element Plus 树节点；根节点为空。 */
  parent?: ElTreeNode | null
  /** Element Plus 内部节点对象上的额外运行时字段。 */
  [key: string]: unknown
}

/** Element Plus tree 组件实例的最小透传形态。 */
export type ElTreeComponent = {
  /** Element Plus tree 组件实例上的额外运行时方法或状态。 */
  [key: string]: unknown
}

/** r-tree 运行时需要调用的 Element Plus tree 原生能力集合。 */
export type NativeTreeLike = {
  /** 返回当前选中的原生树节点数据。 */
  getCurrentNode?: () => unknown
  /** 按节点 key 设置当前选中节点；传 null 清空选中。 */
  setCurrentKey?: (key: string | number | null) => void
  /** 按关键字触发 Element Plus 树过滤。 */
  filter?: (value: string) => void
  /** 返回当前勾选的节点数据。 */
  getCheckedNodes?: (leafOnly?: boolean, includeHalfChecked?: boolean) => unknown[]
  /** 返回当前勾选节点的 key 集合。 */
  getCheckedKeys?: (leafOnly?: boolean) => Array<string | number>
  /** 设置当前勾选节点的 key 集合。 */
  setCheckedKeys?: (keys: Array<string | number>, leafOnly?: boolean) => void
  /** 将节点数据追加到父节点下。 */
  append?: (data: unknown, parentNode: unknown) => void
  /** 将节点数据插入到参考节点之前。 */
  insertBefore?: (data: unknown, refNode: unknown) => void
  /** 将节点数据插入到参考节点之后。 */
  insertAfter?: (data: unknown, refNode: unknown) => void
  /** 从树中移除节点实例或节点数据。 */
  remove?: (nodeOrData: unknown) => void
  /** 按业务 key 获取原生树节点实例。 */
  getNode?: (key: string | number) => NativeRendererTreeNodeLike | undefined
}

/** Element Plus 原生树节点实例的最小能力集合。 */
export type NativeRendererTreeNodeLike = {
  /** 展开当前原生树节点。 */
  expand?: () => void
  /** 原生树节点绑定的业务行数据。 */
  data?: DataRow
}

/** 树事件回调的默认行为控制器。 */
export type TreeEventControl = {
  /** 事件处理器调用后阻止组件默认行为。 */
  cancel: CancellableControl['cancel']
}

/** r-tree 节点交互事件处理函数。 */
export type TreeEventHandler = {
  /** 树节点交互回调；可通过 control.cancel() 接管默认选中、展开等行为。 */
  (data: RendererTreeNode, node: ElTreeNode, component: ElTreeComponent, control: TreeEventControl): void | Promise<void>
}

/** r-tree 与节点交互相关的行为属性。 */
type RendererTreeBehaviorProps = Readonly<Record<string, unknown>> & {
  /** 节点点击时触发，可取消默认选中当前行行为。 */
  onNodeClick?: TreeEventHandler | undefined
  /** 节点展开时触发，用于懒加载、埋点或自定义展开逻辑。 */
  onNodeExpand?: TreeEventHandler | undefined
  /** 节点收起时触发，用于同步外部状态或埋点。 */
  onNodeCollapse?: TreeEventHandler | undefined
}

/** 创建 r-tree zero-code API 和事件桥接所需的运行时输入。 */
type RendererTreeZeroCodeOptions = {
  /** r-tree 的组件属性集合，包含事件回调和配置透传。 */
  props: RendererTreeBehaviorProps
  /** 当前解析出的 DataView；为空时树 API 只处理原生实例能力。 */
  resolvedView: ValueRef<DataView | null>
  /** 树渲染使用的行数据集合。 */
  treeData: ValueRef<DataRow[]>
  /** Element Plus tree 原生组件 ref。 */
  nativeTreeRef: ValueRef<unknown>
  /** 运行时诊断日志。 */
  logger: LoggerApi
  /** 作为树节点 key 的字段名。 */
  nodeKeyField: ValueRef<string>
  /** 作为树节点 id 的字段名，用于诊断缺主键场景。 */
  treeIdField: ValueRef<string>
}

type TreeEventRunOptions = {
  handler: TreeEventHandler | undefined
  data: RendererTreeNode
  node: ElTreeNode
  component: ElTreeComponent
  autoHandle?: () => void}

function isNativeTreeLike(value: unknown): value is NativeTreeLike {
  if (typeof value !== 'object' || value === null) return false
  return (!('getCurrentNode' in value) || typeof value.getCurrentNode === 'function')
    && (!('setCurrentKey' in value) || typeof value.setCurrentKey === 'function')
    && (!('filter' in value) || typeof value.filter === 'function')
    && (!('getCheckedNodes' in value) || typeof value.getCheckedNodes === 'function')
    && (!('getCheckedKeys' in value) || typeof value.getCheckedKeys === 'function')
    && (!('setCheckedKeys' in value) || typeof value.setCheckedKeys === 'function')
    && (!('append' in value) || typeof value.append === 'function')
    && (!('insertBefore' in value) || typeof value.insertBefore === 'function')
    && (!('insertAfter' in value) || typeof value.insertAfter === 'function')
    && (!('remove' in value) || typeof value.remove === 'function')
    && (!('getNode' in value) || typeof value.getNode === 'function')
}

function isNativeRendererTreeNodeLike(value: unknown): value is NativeRendererTreeNodeLike {
  if (typeof value !== 'object' || value === null) return false
  return (!('expand' in value) || typeof value.expand === 'function')
    && (!('data' in value) || isDataRow(value.data))
}

export function createRendererTreeZeroCode(options: RendererTreeZeroCodeOptions) {
  const {
    props,
    resolvedView,
    treeData,
    nativeTreeRef,
    nodeKeyField,
    treeIdField,
    logger,
  } = options

  function getNodeKey(data: unknown): string | number | null {
    if (!isDataRow(data)) return null
    const key = data[nodeKeyField.value]
    return typeof key === 'string' || typeof key === 'number' ? key : null
  }

  function getNativeTree(): NativeTreeLike | null {
    return getNativeRefValue(nativeTreeRef, isNativeTreeLike)
  }

  function syncCurrentByKey(key: string | number | null | undefined): void {
    const tree = getNativeTree()
    if (key === null || key === undefined) {
      resolvedView.value?.setCurrentRowById(null)
      tree?.setCurrentKey?.(null)
      return
    }
    resolvedView.value?.setCurrentRowById(key)
    tree?.setCurrentKey?.(key)
  }

  const {
    baseMethods: baseCrudMethods,
  } = createContainerCrudContext({
    props,
    resolvedView,
  })
  const { getDataSource, addRow, editRowById, removeRow } = baseCrudMethods

  const treeApi: RendererTreeApi = {
    getDataSource,
    getTreeData() {
      return treeData.value
    },
    getNativeTree() {
      return getNativeTree()
    },
    getCurrentNode() {
      const tree = getNativeTree()
      if (!tree || typeof tree.getCurrentNode !== 'function') return null
      const currentNode = tree.getCurrentNode()
      return isDataRow(currentNode) ? currentNode : null
    },
    setCurrentKey(key) {
      syncCurrentByKey(key)
    },
    async expandToNode(key) {
      const view = resolvedView.value
      if (!view) return

      const path = await view.loadTreePath(key)
      await view.expandTreeToNode(key)
      await nextTick()

      const tree = getNativeTree()
      if (!tree || typeof tree.getNode !== 'function') {
        syncCurrentByKey(key)
        return
      }
      for (const pathId of path.pathIds) {
        const nativeNode = tree.getNode(pathId)
        if (isNativeRendererTreeNodeLike(nativeNode)) {
          nativeNode.expand?.()
        }
      }

      syncCurrentByKey(key)
    },
    filter(keyword) {
      const tree = getNativeTree()
      if (!tree || typeof tree.filter !== 'function') return
      tree.filter(keyword)
    },
    getCheckedNodes(leafOnly, includeHalfChecked) {
      const tree = getNativeTree()
      if (!tree || typeof tree.getCheckedNodes !== 'function') return []
      return tree.getCheckedNodes(leafOnly, includeHalfChecked).filter(isDataRow)
    },
    getCheckedKeys() {
      const tree = getNativeTree()
      if (!tree || typeof tree.getCheckedKeys !== 'function') return []
      return tree.getCheckedKeys()
    },
    setCheckedKeys(keys) {
      const tree = getNativeTree()
      if (!tree || typeof tree.setCheckedKeys !== 'function') return
      tree.setCheckedKeys(keys)
    },
    addRow,
    editRowById,
    removeRow,
    moveNode(nodeId, newParentId, index) {
      const view = resolvedView.value
      if (!view) return Promise.resolve(null)
      return view.moveTreeNode(nodeId, newParentId, index)
    },
    appendNode(parentKey, nodeData) {
      const tree = getNativeTree()
      if (!tree) return
      const parentNode = parentKey !== null ? tree.getNode?.(parentKey) : null
      tree.append?.(nodeData, parentNode ?? undefined)
    },
    insertBefore(refKey, nodeData) {
      const tree = getNativeTree()
      if (!tree) return
      const refNode = tree.getNode?.(refKey)
      if (refNode !== undefined) tree.insertBefore?.(nodeData, refNode)
    },
    insertAfter(refKey, nodeData) {
      const tree = getNativeTree()
      if (!tree) return
      const refNode = tree.getNode?.(refKey)
      if (refNode !== undefined) tree.insertAfter?.(nodeData, refNode)
    },
    updateNode(key, patch) {
      const tree = getNativeTree()
      if (!tree) return false
      const elNode = tree.getNode?.(key)
      if (!isNativeRendererTreeNodeLike(elNode) || elNode.data === undefined) return false
      Object.assign(elNode.data, patch)
      return true
    },
    removeNode(key) {
      const tree = getNativeTree()
      if (!tree) return false
      const elNode = tree.getNode?.(key)
      if (elNode === undefined) return false
      tree.remove?.(elNode)
      return true
    },
  }

  async function runTreeEvent(eventOptions: TreeEventRunOptions): Promise<void> {
    const { handler, data, node, component, autoHandle } = eventOptions
    const control = createCancellableControl()
    await handler?.(data, node, component, control)
    if (!control.cancel) {
      if (autoHandle) {
        autoHandle()
      }
    }
  }

  const handleNodeClick = async (data: RendererTreeNode, node: ElTreeNode, component: ElTreeComponent) => {
    await runTreeEvent({
      handler: props.onNodeClick,
      data,
      node,
      component,
      autoHandle: () => {
      const key = getNodeKey(data)
      if (key === null) {
        logger.warn('RendererTree node-click 跳过自动选中：节点缺少主键', {
          nodeKey: nodeKeyField.value,
          treeIdField: treeIdField.value,
        })
        return
      }
      resolvedView.value?.setCurrentRowById(key)
      },
    })
  }

  const handleNodeExpand = async (data: RendererTreeNode, node: ElTreeNode, component: ElTreeComponent) => {
    await runTreeEvent({ handler: props.onNodeExpand, data, node, component })
  }

  const handleNodeCollapse = async (data: RendererTreeNode, node: ElTreeNode, component: ElTreeComponent) => {
    await runTreeEvent({ handler: props.onNodeCollapse, data, node, component })
  }

  const handleNodeDrop = async (draggingNode: ElTreeNode, dropNode: ElTreeNode, dropType: string) => {
    const view = resolvedView.value
    if (!view) return

    const draggedKey = getNodeKey(draggingNode.data)
    if (draggedKey === null) return

    let newParentId: string | number | null = null
    if (dropType === 'inner') {
      newParentId = getNodeKey(dropNode.data)
    } else {
      // 取 dropNode 在树索引中的 parentId，避免手工解析行字段
      const dropNodeKey = getNodeKey(dropNode.data)
      newParentId = (dropNodeKey !== null ? view.treeManager?.getNode(dropNodeKey)?.parentId : null) ?? null
    }

    const moveTreeNode = ((nextNodeId: string | number, nextParentId: string | number | null, nextIndex?: number) =>
      view.moveTreeNode(nextNodeId, nextParentId, nextIndex))
    await moveTreeNode(draggedKey, newParentId, -1)
  }

  return {
    treeApi,
    getNodeKey,
    syncCurrentByKey,
    handleNodeClick,
    handleNodeExpand,
    handleNodeCollapse,
    handleNodeDrop,
  }
}
