/**
 * @module app:views/features/integration/api-management/ui/api-config-page.props
 * 职责：声明服务商请求方案设计页的目标身份输入。
 * 边界：宿主传入服务商 rowid 和已编译的工具配置，场景由原运行实例提供。
 * AI用途：从服务商目录打开原路径配置页时传递同一正式身份。
 */
import type {SparkNode} from '@spark-appworks/spark-data'

/** 服务商身份与宿主工具编译后的配置。 */
export type ApiConfigPageProps = Readonly<{
  /** 正式服务商 rowid，用于限定配置视图的查询。 */
  providerId: string
  jwtConfig: SparkNode
}>
