/**
 * @module app:views/features/integration/api-management/ui/api-config-page.props
 * 职责：声明服务商请求方案设计页的目标身份输入。
 * 边界：宿主传入服务商 rowid，场景由原运行实例提供。
 * AI用途：从服务商目录打开原路径配置页时传递同一正式身份。
 */
/** 一次基础配置会话的正式服务商身份。 */
export type ApiConfigPageProps = Readonly<{
  /** 正式服务商 rowid，用于限定配置视图的查询。 */
  providerId: string
}>
