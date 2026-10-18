/**
 * @module app:views/features/integration/api-management/ui/api-config-page.props
 * 职责：声明服务商请求方案设计页的目标身份输入。
 * 边界：只接收服务商rowid，配置空间由宿主封装，不接收行副本或权限。
 * AI用途：从服务商目录打开原路径配置页时传递同一正式身份。
 */
/** 服务商请求方案设计页只接受一个服务商身份。 */
export type ApiConfigPageProps = Readonly<{
  /** 正式服务商rowid，切换后独立装配DataSet和全部视图。 */
  providerId: string
}>
