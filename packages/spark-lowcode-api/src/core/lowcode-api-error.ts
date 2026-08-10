export class LowcodeApiError extends Error {
  public constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = 'LowcodeApiError'
  }
}
