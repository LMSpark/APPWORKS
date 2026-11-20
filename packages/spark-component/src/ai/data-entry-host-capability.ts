/**
 * @module @spark-appworks/spark-component:ai/data-entry-host-capability
 * 职责：定义通用AI批量新增组件与应用级会话owner之间的窄能力合同。
 * 边界：只暴露当前目标DataView、标准录入/候选/轮次视图和正式会话动作；不依赖spark-lowcode-api，也不承载Agent配置或系统提示词。
 * AI用途：应用宿主通过此能力把已配置的AI录入会话附着到标准组件，临时卸载时只撤销附件。
 */
import {defineCapability, isCallable, isRecord} from '@spark-appworks/spark-utils'
import {DataView} from '@spark-appworks/spark-data'

/** 标准组件消费的单次批量录入会话表面；实际状态由正式DataView和会话owner提供。 */
export type AiDataEntrySessionSurface = Readonly<{
  /** 不可变业务目标，确认结果只暂存到此DataView。 */
  targetView: DataView
  /** 由标准表单编辑businessPrompt的单行输入DataView。 */
  input: DataView
  /** 由正式轮次读回填充的只读候选DataView。 */
  candidates: DataView
  /** 同一DataSet中由AiTurnResource持有的正式轮次状态DataView。 */
  turn: DataView
  /** 已受理的正式轮次标识；未收到可信回执时为空。 */
  turnId: string | undefined
  /** 由正式轮次状态视图推导的状态。 */
  status: string | undefined
  /** 当前命令或异步读取是否正在执行。 */
  busy: boolean
  /** 是否存在必须由原轮次owner核验的未知保存结果。 */
  hasUnconfirmedSave: boolean
  /** 是否需要阻止工作区关闭或切换目标。 */
  blocksWorkspace: boolean
  /** 是否有输入、候选、命令或错误需要保留。 */
  pending: boolean
  /** 最近的本地验证或轮次错误。 */
  error: string
  /** 当前输入可否发起一个新轮次。 */
  canStart: boolean
  /** 当前轮次或原始未知命令可否安全查询。 */
  canRefresh: boolean
  /** 当前已知非终态轮次可否停止。 */
  canCancel: boolean
  /** 当前候选批次可否通过统一预检并暂存。 */
  canConfirm: boolean
  /** 与确认资格对应的用户可读原因。 */
  confirmationError: string
  /** 宿主可否继续自动查询正式轮次状态。 */
  shouldAutoRefresh: boolean
  /** 订阅DataView/会话状态变更并返回取消订阅函数。 */
  subscribe(listener: () => void): () => void
  /** 从当前businessPrompt草稿创建一次正式轮次。 */
  start(): Promise<void>
  /** 沿原正式轮次资源查询状态并解析候选。 */
  refresh(): Promise<void>
  /** 把通过预检的整批候选暂存到原业务DataView。 */
  confirm(): Promise<void>
  /** 对已知非终态轮次发起停止并沿正式资源核验。 */
  cancel(): Promise<void>
  /** 放弃可安全丢弃的本地输入/候选；未知命令仍被拒绝。 */
  discard(): Promise<void>
}>

/** 当前renderer与应用host之间的一次附件；host可通过signal同步撤销局部订阅和timer。 */
export type AiDataEntryAttachment = Readonly<{
  /** 当前应用owner持有的正式会话。 */
  session: AiDataEntrySessionSurface
  /** host释放或撤销附件时触发。 */
  signal: AbortSignal
  /** 幂等撤销本组件附件，不销毁仍待核验的会话。 */
  detach(): void
}>

/** 在应用运行实例中打开一个与精确业务DataView绑定的录入会话。 */
export type AiDataEntryHostCapability = Readonly<{
  /** 返回目标完全一致的活动附件；目标不匹配时调用方不得误拆其他owner。 */
  openSession(targetView: DataView): AiDataEntryAttachment
}>

function isSessionSurface(value: unknown): value is AiDataEntrySessionSurface {
  return isRecord(value) && value['targetView'] instanceof DataView
    && value['input'] instanceof DataView && value['candidates'] instanceof DataView && value['turn'] instanceof DataView
    && isCallable(value['subscribe']) && isCallable(value['start']) && isCallable(value['refresh'])
    && isCallable(value['confirm']) && isCallable(value['cancel']) && isCallable(value['discard'])
}

function isAttachment(value: unknown): value is AiDataEntryAttachment {
  return isRecord(value) && isSessionSurface(value['session'])
    && typeof AbortSignal !== 'undefined' && value['signal'] instanceof AbortSignal
    && isCallable(value['detach'])
}

function isHostCapability(value: unknown): value is AiDataEntryHostCapability {
  return isRecord(value) && isCallable(value['openSession'])
}

/** 标准AI录入renderer按完整PAGE_RUNTIME解析目标后消费的宿主能力键。 */
export const AI_DATA_ENTRY_HOST = defineCapability<AiDataEntryHostCapability>(
  'spark:capability:ai-data-entry-host', isHostCapability,
)

/** 便于能力边界验证的附件合同守卫。 */
export function isAiDataEntryAttachment(value: unknown): value is AiDataEntryAttachment {
  return isAttachment(value)
}
