/**
 * @module app:views/features/data-platform/data-set-management/design/views/DataSpaceViewEditor.props
 * 职责：定义命名视图编辑器接收的正式模型身份、元表行定位和调用会话。
 * 边界：只描述页面与编辑器的连接合同；不接收独立文件副本，不提供业务数据授权。
 * AI用途：组装数据空间设计页时据此传入原会话和当前模型，避免把内部表键当模型名称。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'

/** 已在页面按正式权限和身份定位的模型上下文；文件定义仍属于原会话。 */
export type DataSpaceViewEditorProps = {
  /** 当前调用拥有的元数据和场景文件会话。 */
  session: LowcodeDataSpaceDesignSession
  /** 所属正式模型记录 ID。 */
  modelId?: string
  /** 正式注册模型名称，不是内部绑定表键或来源名。 */
  modelName?: string
  /** 文件模型使用原生表名与资源ID；不得同时提供数据库模型身份。 */
  fileResource?: Readonly<{tableName: string; resourceId: string}>
  /** 定义元表中的主键；未选中视图时为 undefined。 */
  rowKey: string | number | undefined
  /** 原会话数据变化后的呈现修订，不参与持久化。 */
  revision: number
  /** 页面操作占用期间锁定编辑，不能据此授予数据权限。 */
  disabled?: boolean
}
