/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/data-space-model-command-error
 * 职责：标识正式模型命令进入一次执行能力之前的明确拒绝。
 * 边界：不用于传输、回执或派发后的身份失效，不能证明已进入执行能力的请求未生效。
 */
export class DataSpaceModelCommandNotDispatchedError extends Error {
 constructor(cause:unknown){
  super(cause instanceof Error?cause.message:String(cause),{cause})
  this.name='DataSpaceModelCommandNotDispatchedError'
 }
}
