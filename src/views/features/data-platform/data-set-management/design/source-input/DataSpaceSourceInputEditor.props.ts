/**
 * @module app:views/features/data-platform/data-set-management/design/source-input/DataSpaceSourceInputEditor.props
 * 职责：描述来源入参编辑器与原元数据会话的身份连接。
 * 边界：只传会话和正式字段ID，不接收权限副本或独立保存方法。
 * AI用途：按字段节点挂载来源入参编辑器，复用原DataView状态和持久链。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'

/** 来源入参编辑器的当前调用范围。 */
export type DataSpaceSourceInputEditorProps = {
  /** 当前目标空间的元数据会话。 */
  session: LowcodeDataSpaceDesignSession
  /** Base_DataModel_Field正式主键。 */
  fieldId: string
  /** 原数据变化后的呈现修订；不持久化。 */
  revision: number
  /** 页面操作期间只收紧交互，不据此授予权限。 */
  disabled?: boolean
}
