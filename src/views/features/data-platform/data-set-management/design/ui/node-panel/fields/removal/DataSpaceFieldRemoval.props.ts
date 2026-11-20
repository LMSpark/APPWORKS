/**
 * @module app:views/features/data-platform/data-set-management/design/ui/node-panel/fields/removal/DataSpaceFieldRemoval.props
 * 职责：定义计算字段删除弹窗的当前会话及记录身份。
 * 边界：不传行数据或权限副本，操作归元数据DataView。
 * AI用途：在页面稳定位置挂载，使字段消失后仍可核验。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'

/** 当前字段删除的调用范围。 */
export type DataSpaceFieldRemovalProps = {
  /** 原生页面持有的元数据会话。 */
  session: LowcodeDataSpaceDesignSession
  /** 待删计算字段的正式记录ID。 */
  fieldId: string
  /** 发起删除的实际字段视图；不从未加载的default查找目标。 */
  fieldViewId: 'default' | 'modelFields'
  /** 原DataView事件引起的呈现修订。 */
  revision: number
}
