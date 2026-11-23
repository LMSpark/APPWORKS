/** 应用目录 GetData 请求头 x-FormKey 固定值。 */
export const LOWCODE_APPLICATION_CATALOG_FORM_KEY = '7AB874097A1E8711A42FD845939A6E05'

/**
 * 通过正式 Base_AppSystemList DataView 投影的应用条目；id 为 rowid。
 * 可选目录元信息仅在正式来源返回且当前调用可读时提供；缺省表示未知/不可用，不从登录会话补造归属。
 */
export type LowcodeApplication = Readonly<{
  id: string
  name: string
  /** 可读的正式 AppName 代码。 */
  code?: string
  /** 可读的正式 Memo 描述；空值保留为空字符串。 */
  description?: string
  /** 可读的正式 EntId；不会从当前会话推断。 */
  enterpriseId?: string
  /** 可读的正式 EntShortName；不会从当前会话推断。 */
  enterpriseShortName?: string
  /** 仅可读正式 IsSys=1/0 映射为 true/false；undefined 表示未知。 */
  isDefault?: boolean
}>
