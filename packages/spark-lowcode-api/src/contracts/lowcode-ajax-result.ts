/**
 * lowcode-jdk17 `com.htong.vo.AjaxResult` 的源端点响应合同。
 * 字段大小写与后端 JsonProperty 保持一致；与 `backend-api-contracts/common.ts` 的 AjaxResult 同形（parity 门禁）。
 */
export type AjaxResult<TResult = unknown> = Readonly<{
  Code: number
  Message?: string | null
  Result?: TResult
  Type?: string | null
  Extras?: unknown
  Time?: string | null
}>
