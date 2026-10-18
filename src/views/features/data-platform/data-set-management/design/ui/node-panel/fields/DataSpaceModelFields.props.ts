/**
 * @module app:views/features/data-platform/data-set-management/design/ui/node-panel/fields/DataSpaceModelFields.props
 * 职责：定义统一模型字段工作区的目标与生命周期输入。
 * 边界：只传会话及身份，不传字段行或权限副本。
 * AI用途：模型字段与共用字段规则绑定同一modelFields命名视图。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'

/** 统一模型字段工作区参数。 */
export type DataSpaceModelFieldsProps = {
  /** 当前设计会话。 */
  session: LowcodeDataSpaceDesignSession
  /** 当前目标空间内的正式模型ID。 */
  modelId: string
  /** 目录增删字段后重新读取，身份列表不替代绑定视图的数据。 */
  fieldIds: readonly string[]
  /** 当前会话修订，用于刷新字段操作状态。 */
  revision: number
  /** 其他定义操作对本工作区的交互限制。 */
  disabled?: boolean
  /** 使用模型窗口顶部保存；字段属性与当前模型记录的修改同批提交。 */
  workspaceActions?: boolean
}
