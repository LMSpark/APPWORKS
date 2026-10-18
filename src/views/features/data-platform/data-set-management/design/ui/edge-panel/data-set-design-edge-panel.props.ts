/**
 * @module app:views/features/data-platform/data-set-management/design/ui/edge-panel/data-set-design-edge-panel.props
 * 职责：连接原生关系编辑器与当前元数据会话。
 * 边界：接收定义行身份，不接收独立关系真源或保存实现。
 * AI用途：在模型关系节点复用原DataSet和场景文件owner。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'

/** 本次页面调用的关系编辑上下文。 */
export type DataSpaceRelationEditorProps = {
  /** 持有元数据定义与共享文件的原会话。 */
  session: LowcodeDataSpaceDesignSession
  /** 元数据关系定义行主键；未选中时提供新增入口。 */
  rowKey: string | number | undefined
  /** 页面重绘修订，不参与持久化。 */
  revision: number
  /** 页面占用锁，不作为业务数据授权。 */
  disabled?: boolean
}
