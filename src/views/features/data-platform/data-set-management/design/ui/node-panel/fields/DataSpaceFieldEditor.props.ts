/**
 * @module app:views/features/data-platform/data-set-management/design/ui/node-panel/fields/DataSpaceFieldEditor.props
 * 职责：连接正式字段配置编辑器与当前元数据会话。
 * 边界：只传当前会话和字段身份，不传数据或权限副本。
 * AI用途：在已确认所属模型的字段节点挂载编辑器。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'

/** 正式字段配置编辑器的当前调用范围。 */
export type DataSpaceFieldEditorProps = {
  /** 当前目标空间的元数据会话。 */
  session: LowcodeDataSpaceDesignSession
  /** Base_DataModel_Field的正式主键；批量空模型传空串，仅保留模型级入口，不创建字段编辑流程。 */
  fieldId: string
  /** 批量模式下同一模型的正式字段主键；草稿仍在原DataView。 */
  fieldIds?: readonly string[] | undefined
  /** 元模型列表与表单共同绑定modelFields；独立字段入口使用default。 */
  viewId?: 'default' | 'modelFields'
  /** 原生视图事件触发的呈现修订。 */
  revision: number
  /** 页面操作只收紧交互，不授予数据权限。 */
  disabled?: boolean
  /** 模型窗口合并保存时的模型ID；省略时只维护当前字段批次。 */
  workspaceModelId?: string | undefined
}
