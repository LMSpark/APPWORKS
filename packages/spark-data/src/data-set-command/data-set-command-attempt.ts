type DataSetCommandAttemptState = 'prepared' | 'dispatched' | 'failed' | 'unknown' | 'confirmed'

/** One command identity's execution lifecycle; no transport, result, or page state is owned here. */
export class DataSetCommandAttempt {
  #state: DataSetCommandAttemptState = 'prepared'

  public isPrepared(): boolean {return this.#state === 'prepared'}
  public isDispatched(): boolean {return this.#state === 'dispatched'}
  public isFailed(): boolean {return this.#state === 'failed'}
  public isUnknown(): boolean {return this.#state === 'unknown'}
  public isConfirmed(): boolean {return this.#state === 'confirmed'}
  public isActive(): boolean {return this.#state === 'dispatched' || this.#state === 'unknown'}

  public dispatch(): void {
    if (!this.isPrepared()) throw new Error('SPARK_COMMAND_ATTEMPT: 原命令未处于待发送状态')
    this.#state = 'dispatched'
  }

  public confirm(): void {
    if (!this.isDispatched()) throw new Error('SPARK_COMMAND_ATTEMPT: 原命令尚未发送，不能确认')
    this.#state = 'confirmed'
  }

  public fail(): void {
    this.#state = 'failed'
  }

  public unknown(): void {
    this.#state = 'unknown'
  }

  public reset(): void {
    this.#state = 'prepared'
  }
}
