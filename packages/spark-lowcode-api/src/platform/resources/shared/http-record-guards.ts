/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/shared/http-record-guards
 * 设计资源 HTTP 响应解包与对象校验（无 type assertion）。
 */

/** 旧Ajax应答已明确拒绝写入，不能当作传输结果未知。 */
export class DesignResourceRejection extends Error {}

export function unwrapAjaxResult(body: unknown): unknown {
  if (isRecord(body) && ('Code' in body || 'code' in body)) {
    const code = Number(body['Code'] ?? body['code'])
    if (code !== 0 && code !== 200) throw new DesignResourceRejection(String(body['Message'] ?? body['message'] ?? '设计资源请求被拒绝'))
  }
  if (body !== null && typeof body === 'object' && 'Result' in body) return (body).Result
  return body
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message)
  return value
}
