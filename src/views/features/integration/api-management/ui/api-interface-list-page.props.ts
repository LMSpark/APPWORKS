/**
 * @module app:views/features/integration/api-management/ui/api-interface-list-page.props
 * 职责：声明原接口设计页的目标身份。
 * 边界：不传业务数组或凭据；正式空间由组合根装配。
 * AI用途：目录选中的服务商主键作为独立方案窗口输入。
 */
export type ApiInterfaceListPageProps = {
  /** 正式服务商主键。 */
  providerId: string
}
