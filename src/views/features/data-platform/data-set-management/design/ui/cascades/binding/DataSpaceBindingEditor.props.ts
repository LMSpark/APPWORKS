/**
 * @module app:views/features/data-platform/data-set-management/design/ui/cascades/binding/DataSpaceBindingEditor.props
 * 职责：描述级联端点的配置输入。
 * 边界：正式定义由原会话持有，组件仅投影候选及编辑值。
 * AI用途：复用模型、视图、字段的配置级联。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'
import type {DataView} from '@spark-appworks/spark-data'

/** 当前元数据空间中的端点编辑上下文。 */
export type DataSpaceBindingEditorProps = {
  /** 持有正式定义和元数据的会话。 */
  session: LowcodeDataSpaceDesignSession
  /** 上游刷新信号，不参与持久化。 */
  revision: number
  /** 所属定义视图；嵌套端点通过局部配置视图编辑并写回此草稿。 */
  definitionView: DataView
  /** 所属定义行的正式草稿键。 */
  definitionKey: string | number
  /** 定位原生级联定义中的端点，不接收另一份modelValue。 */
  endpoint: 'target' | 'options' | 'parent' | 'query-parent' | 'query-child' | 'filter-source' | 'filter-target' | 'query-input' | 'query-when'
  /** 父输入或过滤映射的数组下标。 */
  index?: number
  /** 供使用者区分输入、子字段与选项来源的名称。 */
  label: string
  /** 字段为必填、可选或不适用。 */
  fieldMode?: 'required' | 'optional' | 'none'
  /** 子值目标排除主键和计算列。 */
  writableField?: boolean
  /** 查询映射复用已选的两端视图，仅维护字段。 */
  fixedView?: boolean
  /** 编辑占用锁，不是授权依据。 */
  disabled?: boolean
}
