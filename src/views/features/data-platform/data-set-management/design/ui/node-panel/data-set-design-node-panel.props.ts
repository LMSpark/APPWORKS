/**
 * @module app:views/features/data-platform/data-set-management/design/ui/node-panel/data-set-design-node-panel.props
 * 职责：将模型配置编辑绑定到当前元数据会话与正式模型身份。
 * 边界：不传递独立数据、权限或保存通道。
 * AI用途：在模型节点挂载配置编辑器，并接入页面脏状态与修订通知。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'

/** 模型配置编辑器的当前调用范围。 */
export type DataSpaceModelEditorProps = {
  /** 当前目标空间的元数据会话。 */
  session: LowcodeDataSpaceDesignSession
  /** Base_DataModel正式主键。 */
  modelId: string
  /** 元数据更新后的呈现修订。 */
  revision: number
  /** 其他编辑器或页面操作期间只收紧交互。 */
  disabled?: boolean
  /** 由模型工作区的统一顶部动作触发保存，隐藏局部保存按钮。 */
  workspaceActions?: boolean
}
