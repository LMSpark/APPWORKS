/**
 * @module app:views/features/data-platform/data-set-management/design/views/preview/DataSpaceQueryPreview.props
 * 职责：声明查询预览的正式模型及命名视图选择。
 * 边界：只传设计会话和身份，不传业务行、授权凭据或另一份配置。
 * AI用途：选中正式模型或命名视图后挂载预览，关闭弹窗即卸载并释放运行实例。
 */
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'
import type {RFilterProps} from '@spark-appworks/spark-component'

/** 预览选择中的tableName是文件内部键，modelName是公开绑定使用的正式注册名。 */
export type DataSpaceQueryPreviewProps = {
  /** 当前目标空间的设计会话，负责校验后创建独立预览。 */
  session: LowcodeDataSpaceDesignSession
  /** 被预览模型的正式记录ID。 */
  modelId?: string
  /** 组件绑定使用的正式模型注册名。 */
  modelName?: string
  /** 文件命名视图的正式资源ID；与数据库模型身份互斥。 */
  fileResourceId?: string
  /** 场景文件内的绑定表键；与viewId同时缺省时预览正式模型，不创建视图配置。 */
  tableName?: string
  /** 当前命名视图ID；须与tableName同时提供，避免将不完整绑定降级为模型预览。 */
  viewId?: string
  /** 标准过滤器查询时机；省略时立即响应多个父输入值变化。 */
  filter?: Pick<RFilterProps, 'autoQuery'>
}
