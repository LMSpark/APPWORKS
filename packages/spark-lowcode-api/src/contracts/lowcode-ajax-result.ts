/**
 * lowcode-jdk17 `com.htong.vo.AjaxResult` 的源端点响应合同。
 * 字段大小写与后端 JsonProperty 保持一致，供差分和 wire-level 工具使用。
 */
export type LowcodeAjaxResult<TResult = unknown> = Readonly<{
  Code: number
  Message?: string | null
  Result?: TResult
  Type?: string | null
  Extras?: unknown
  Time?: string | null
}>
