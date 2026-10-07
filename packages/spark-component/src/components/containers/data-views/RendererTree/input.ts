/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererTree/input
 * 职责：支撑 RendererTree（r-enderer-tree-input）在 table-level/data-view-container 中的运行时协作，补齐配置、状态或渲染器之间的连接逻辑。
 * 边界：只覆盖当前组件目录 containers/data-views 的局部能力，不定义全局页面模型，也不越级操作业务数据源。
 * AI用途：需要判断 renderer tree 的组件分层、辅助类型或内部接线时，用本模块作为局部语义入口。
 */
import { computed } from 'vue'

import type { REditorProps } from '../../zones/RendererEditor.types'
import type { RToolbarProps } from '../../layout/action/RendererToolbar/RendererToolbar.types'
import { useContainerToolbar } from '../../runtime/container-ui'
import { type SparkNode, getSparkNodeChildren } from '@spark-appworks/spark-data'

/** Renderer Tree Input Props 的属性契约。 */
type RendererTreeInputProps = {
    /** 子节点集合。 */
children?: SparkNode['children'] | undefined
    /** toolbar 字段。 */
toolbar?: RToolbarProps | undefined
    /** actions 字段。 */
actions?: RToolbarProps | undefined
    /** editor 字段。 */
editor?: REditorProps | undefined}

/** Renderer Tree Input Options 的调用配置。 */
type RendererTreeInputOptions = {
    /** 组件属性集合。 */
props: RendererTreeInputProps}

export function useRendererTreeInput(options: RendererTreeInputOptions) {
  // 优先消费结构化 props.toolbar / props.actions / props.editor；children 不再做结构分流。
  const toolbarNode = computed(() => options.props.toolbar)
  const actionsNode = computed(() => options.props.actions)
  const editorNode = computed(() => options.props.editor)

  const nodeContentChildren = computed<SparkNode[]>(() => {
    return getSparkNodeChildren(options.props.children)
  })
  const nodeActionConfigs = computed(() => getSparkNodeChildren(actionsNode.value?.children))
  const hasNodeActions = computed(() => nodeActionConfigs.value.length > 0)
  const {
    visibleToolbarConfigs: toolbarConfigs,
    toolbarPositionValue,
    toolbarClassValue,
  } = useContainerToolbar({
    toolbarNode,
    defaultClass: '',
  })
  const nodeActionClassValue = computed<string>(() => {
    const className = actionsNode.value?.class
    return typeof className === 'string' ? className : ''
  })
  const {
    visibleToolbarConfigs: editorConfigs,
    toolbarPositionValue: editorPositionValue,
    toolbarClassValue: editorClassValue,
  } = useContainerToolbar({ toolbarNode: editorNode, defaultPosition: 'right', defaultClass: '' })
  const editorStyleValue = computed<Record<string, string>>(() => {
    const width = editorNode.value?.width
    if (typeof width === 'number' && Number.isFinite(width)) {
      return {
        width: `${width}px`,
        flexBasis: `${width}px`,
      }
    }
    if (typeof width === 'string' && width.trim().length > 0) {
      return {
        width,
        flexBasis: width,
      }
    }
    return {}
  })

  const showEditor = computed(() => editorConfigs.value.length > 0)

  return {
    nodeContentChildren,
    toolbarConfigs,
    toolbarPositionValue,
    toolbarClassValue,
    nodeActionConfigs,
    nodeActionClassValue,
    hasNodeActions,
    editorConfigs,
    editorPositionValue,
    editorClassValue,
    editorStyleValue,
    showEditor,
  }
}
