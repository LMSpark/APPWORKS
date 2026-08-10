/**
 * @module app:services/ai-delivery-port
 * 职责：定义 APP 层 AI 交付端口，把 Working Copy 的 save、trace 和 rollback 统一成可回执的结果。
 * 边界：只表达应用交付策略，不进入 spark-ai 内核，也不直接理解 pageDesign/projectPlanning 领域细节。
 * AI用途：排查 Agent Run 结束后如何落盘、如何回执或失败时如何记录交付状态时，用本模块定位统一协议。
 */

export type AiDeliveryMode = 'manual' | 'auto'

/** 单次交付涉及的页面文件或项目蓝图变更摘要。 */
export type AiDeliveryArtifact = Readonly<{
  /** 产物类型。 */
  kind: 'page-file' | 'project-blueprint'
  /** 产物名称（文件名或项目蓝图标识）。 */
  name: string
  /** 产物当前交付状态。 */
  status: 'dirty' | 'saved' | 'skipped' | 'rolledBack'
}>

/** Agent Run 结束后的交付回执，包含模式、状态与产物列表。 */
export type AiDeliveryResult = Readonly<{
  /** 交付模式（手动或自动）。 */
  mode: AiDeliveryMode
  /** 交付最终状态。 */
  status: 'saved' | 'skipped' | 'rolledBack' | 'failed'
  /** 涉及的交付产物列表。 */
  artifacts: readonly AiDeliveryArtifact[]
  /** 可选的状态描述或错误信息。 */
  message?: string
}>

/** 应用层交付端口：负责 save、trace 与 rollback 三阶段契约。 */
export type AiDeliveryPort<TContext> = Readonly<{
  /** 交付模式（manual 需人工确认，auto 自动落盘）。 */
  readonly mode: AiDeliveryMode
  /** 执行交付落盘并返回回执。 */
  save(context: TContext): Promise<AiDeliveryResult>
  /** 记录交付 trace（日志/遥测）。 */
  trace(context: TContext, result: AiDeliveryResult): Promise<void>
  /** 交付失败时执行回滚并返回回执。 */
  rollback(context: TContext, error: Error): Promise<AiDeliveryResult>
}>

/** 附加在 Error 上的交付回执扩展字段。 */
export type AiDeliveryResultExtras = Readonly<{
  /** 关联的交付回执。 */
  delivery: AiDeliveryResult
}>

const AI_DELIVERY_ERROR_EXTRAS_KEY = '__sparkAiDeliveryExtras'

type AiDeliveryErrorCarrier = Error & {
  [AI_DELIVERY_ERROR_EXTRAS_KEY]?: AiDeliveryResultExtras
}

export const noopDeliveryPort: AiDeliveryPort<unknown> = {
  mode: 'manual',
  save() {
    return Promise.resolve(createSkippedAiDeliveryResult('manual'))
  },
  trace() {
    return Promise.resolve()
  },
  rollback() {
    return Promise.resolve(createSkippedAiDeliveryResult('manual'))
  },
}

export function createSkippedAiDeliveryResult(mode: AiDeliveryMode, message?: string): AiDeliveryResult {
  return {
    mode,
    status: 'skipped',
    artifacts: [],
    ...(message === undefined ? {} : { message }),
  }
}

export function createAiDeliveryResultExtras(result: AiDeliveryResult): AiDeliveryResultExtras {
  return { delivery: result }
}

export function attachAiDeliveryResult(error: unknown, result: AiDeliveryResult): Error {
  const normalized = toError(error)
  Object.defineProperty(normalized, AI_DELIVERY_ERROR_EXTRAS_KEY, {
    value: createAiDeliveryResultExtras(result),
    configurable: true,
    enumerable: false,
    writable: true,
  })
  return normalized
}

export function createAiDeliveryFailureError(message: string, result: AiDeliveryResult): Error {
  return attachAiDeliveryResult(new Error(message), result)
}

export function readAiDeliveryErrorExtras(error: unknown): AiDeliveryResultExtras | undefined {
  if (!(error instanceof Error)) return undefined
  return isAiDeliveryErrorCarrier(error) ? error[AI_DELIVERY_ERROR_EXTRAS_KEY] : undefined
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function isAiDeliveryErrorCarrier(error: Error): error is AiDeliveryErrorCarrier {
  return AI_DELIVERY_ERROR_EXTRAS_KEY in error
}
