/**
 * @module app:views/features/data-platform/data-set-management/design/model/source/DataSpaceModelSource.props
 * 职责：绑定来源选择交互到当前元数据会话。
 * 边界：不提供第二套数据、权限或提交接口。
 * AI用途：待配置节点选择来源与已有模型替换；模型目录通过布局节点进入，不直接挂载创建器。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'

/** 来源创建组件的当前会话范围。 */
export type DataSpaceModelSourceProps = {
  /** 当前目标空间的正式元数据会话。 */
  session: LowcodeDataSpaceDesignSession
  /** 元数据变更后的呈现修订。 */
  revision: number
  /** 页面忙时收紧交互。 */
  disabled?: boolean
  /** 在元模型紧凑工作区显示原操作入口，保留同一绑定和编辑实例。 */
  workspaceActions?: boolean
  /** 新增时点击来源“确定”即沿原owner完成校验及提交；失败进入原预览/核验。已有模型替换仍须确认字段差异。 */
  confirmOnSelection?: boolean
  /** 指定已有模型时执行保留字段合同的来源替换；省略时创建模型。 */
  modelId?: string
}
