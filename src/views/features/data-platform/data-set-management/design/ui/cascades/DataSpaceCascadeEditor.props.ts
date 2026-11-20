/**
 * @module app:views/features/data-platform/data-set-management/design/ui/cascades/DataSpaceCascadeEditor.props
 * 职责：连接数据级联配置与当前元数据会话。
 * 边界：接收元数据行身份，复用原文件保存与校验责任方。
 * AI用途：在层次页面维护两种原生级联。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'

/** 数据级联编辑器的当前调用上下文。 */
export type DataSpaceCascadeEditorProps = {
  /** 元数据及场景文件的原会话。 */
  session: LowcodeDataSpaceDesignSession
  /** 原生级联定义行主键；无值时编辑集合。 */
  rowKey: string | number | undefined
  /** 页面刷新信号。 */
  revision: number
  /** 页面占用锁，不扩大数据权限。 */
  disabled?: boolean
}
