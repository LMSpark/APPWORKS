/**
 * @module app:views/features/data-platform/data-set-management/design/model/removal/DataSpaceModelRemoval.props
 * 职责：限定删除组件的元数据会话与正式模型身份。
 * 边界：不传递独立数据或保存通道。
 * AI用途：模型删除确认、取消和未决结果核验。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'

/** 模型删除入口的实例范围。 */
export type DataSpaceModelRemovalProps = {
  /** 原元数据会话。 */
  session: LowcodeDataSpaceDesignSession
  /** 当前正式模型主键。 */
  modelId: string
  /** 数据和权限更新后的渲染修订。 */
  revision: number
  /** 其他操作期间禁止开始删除。 */
  disabled?: boolean
}
