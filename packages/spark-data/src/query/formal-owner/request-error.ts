/** 已由正式 SPARK 响应明确拒绝的请求；调用方不得将其转成 unknown save。 */
export class DataSpaceApiError extends Error {
  public constructor(public readonly code: number, message: string) {
    super(message)
    this.name = 'DataSpaceApiError'
  }
}
