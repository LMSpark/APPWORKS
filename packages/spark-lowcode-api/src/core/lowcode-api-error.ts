/**
 * lowcode 客户端统一业务/协议错误。
 * `code` 取自 AjaxResult.Code；`0` 表示响应体不符合合同或本地校验失败，与 HTTP 状态码无关。
 */
export class LowcodeApiError extends Error {
  public constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = 'LowcodeApiError'
  }
}
