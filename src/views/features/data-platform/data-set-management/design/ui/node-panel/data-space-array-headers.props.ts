/**
 * @module app:views/features/data-platform/data-set-management/design/ui/node-panel/data-space-array-headers.props
 * 职责：数组表头窄编辑窗口的输入与确认合同。
 * 边界：标准组件绑定输入视图；正式持久化由父级定义owner处理。
 * AI用途：新建和已有数组共用表头窗口。
 */
import type {ArrayDefinition, LowcodeDataSpaceArrayDraft} from '@/lowcode/data-space/model-source/array/lowcode-data-space-array-draft'
/** 一次未确认的表头编辑；关闭由调用方释放输入视图。 */
export type DataSpaceArrayHeadersProps = {
  /** 表头组件绑定的唯一局部输入视图。 */
  draft:LowcodeDataSpaceArrayDraft
  /** 确认后交回所属定义；抛错时窗口保留可修复的输入。 */
  onConfirm?:(definition:ArrayDefinition)=>void|Promise<void>
}
