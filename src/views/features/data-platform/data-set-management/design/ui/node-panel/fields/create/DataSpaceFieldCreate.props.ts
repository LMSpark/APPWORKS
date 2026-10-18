/**
 * @module app:views/features/data-platform/data-set-management/design/ui/node-panel/fields/create/DataSpaceFieldCreate.props
 * 职责：声明计算字段创建组件的会话、所属模型和刷新修订输入。
 * 边界：只约束组件接入参数，不查询元数据、不提供持久化或授予权限。
 * AI用途：将创建入口绑定到当前设计会话，交互锁定只收紧操作。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'

/** 计算字段新建的会话、所属模型和页面交互边界。 */
export type DataSpaceFieldCreateProps = {
  /** 当前元数据空间会话。 */
  session: LowcodeDataSpaceDesignSession
  /** 目标空间内的正式模型记录ID。 */
  modelId: string
  /** 原DataView事件推进的呈现修订。 */
  revision: number
  /** 只收紧交互，不授予新增权限。 */
  disabled?: boolean
  /** 在元模型紧凑工作区显示原操作入口，保留同一绑定和编辑实例。 */
  workspaceActions?: boolean
}
