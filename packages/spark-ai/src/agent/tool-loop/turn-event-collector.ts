/**
 * @module @spark-appworks/spark-ai:agent/tool-loop/turn-event-collector
 * 职责：支撑 Agent tool loop 的 turn event collector 能力，处理工具调用、结果映射、诊断事件或 payload 编解码。
 * 边界：只服务单次 turn 内的工具循环，不定义业务注册协议，也不直接管理 UI 或持久化页面状态。
 * AI用途：排查工具调用为什么继续、完成、失败或被映射成回调事件时，用本模块定位 loop 内部语义。
 */

import type { AiAgentStreamEvent } from '../conversation/chat/chat-types'
import type { AiAgentAppSseEvent } from '../conversation/transport/app-sse-events'
import { isRecord } from '@spark-appworks/spark-utils'
import type {
  AiAgentAppSseEventSource,
  AiAgentStreamTurnInput,
  AiAgentStreamTurnResult,
  AiAgentTransportToolCall,
} from '../conversation/transport/transport-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 常量与内部类型
// ═══════════════════════════════════════════════════════════════

/** APP SSE 事件名：AI frame 事件 */
const AI_FRAME_EVENT_NAME = 'llm-frame'

/** AI turn 事件超时时间（5 分钟） */
const AI_TURN_EVENT_TIMEOUT_MS = 300_000

/** AI turn 事件类型 */
type AiTurnEventKind = 'delta' | 'reasoning' | 'result' | 'error' | 'done'

/** 匹配后的 AI frame 荷载（已校验 sessionId / turnId） */
type AiAgentFramePayload = Readonly<{
  sessionId: string
  turnId: string
  frame: AiAgentFrame
}>

/** AI frame 基本结构 */
type AiAgentFrame = Readonly<{
  type: string
  data?: unknown
}>

/** 收集器的构造输入 */
type TurnEventCollectorInput = Readonly<{
  /** SSE 流轮次输入：sessionId / turn / signal / onDelta / onReasoning / onStreamEvent 等流式回调。 */
  input: AiAgentStreamTurnInput
  /** APP SSE 事件源：提供 on(event, handler) 订阅 llm-frame 事件。 */
  source: AiAgentAppSseEventSource
  /** 绝对上限：整轮 turn 最长等待时间。 */
  timeoutMs?: number
  /** 空闲上限：连续无 SSE 帧超过该毫秒则 fail-fast。 */
  idleTimeoutMs?: number
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 公共接口
// ═══════════════════════════════════════════════════════════════

/** AI turn 事件收集器接口 */
export type TurnEventCollector = Readonly<{
  /** 轮次结果 Promise：resolve 得到 text / reasoning / toolCalls，reject 表示超时/错误/abort。 */
  result: Promise<AiAgentStreamTurnResult>
  /** 主动关闭收集器：停止监听 SSE 事件，释放定时器和监听器。 */
  close(): void
}>

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 工厂函数 — 创建收集器实例
// ═══════════════════════════════════════════════════════════════

/**
 * 创建 turn 事件收集器。
 *
 * 内部流程：
 *   1. 注册 llm-frame 事件监听
 *   2. 设置超时定时器（默认 5 分钟）
 *   3. 设置 AbortSignal 监听
 *   4. 返回 { result: Promise, close() } 接口
 *
 * 每收到一个匹配的 AI frame，委托 TurnEventState 处理。
 * 完成后自动清理监听器和定时器。
 */
export function createTurnEventCollector(options: TurnEventCollectorInput): TurnEventCollector {
  const { input, source } = options
  const timeoutMs = options.timeoutMs ?? AI_TURN_EVENT_TIMEOUT_MS
  const idleTimeoutMs = options.idleTimeoutMs
  const state = new TurnEventState(input)
  const disposers = [source.on(AI_FRAME_EVENT_NAME, (event) => {
    const payload = readMatchingAiAgentFrame(event, input)
    if (payload === null) return
    resetIdleTimer()
    state.handle(toTurnEventKind(payload.frame), event, payload.frame)
  })]

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let idleTimeoutId: ReturnType<typeof setTimeout> | null = null
  let cleaned = false
  const clearTimers = () => {
    if (timeoutId !== null) clearTimeout(timeoutId)
    if (idleTimeoutId !== null) clearTimeout(idleTimeoutId)
    timeoutId = null
    idleTimeoutId = null
  }
  const resetIdleTimer = () => {
    if (cleaned || idleTimeoutMs === undefined) return
    if (idleTimeoutId !== null) clearTimeout(idleTimeoutId)
    idleTimeoutId = setTimeout(() => {
      state.fail(new Error(
        `AI turn idle timeout: no APP SSE events for ${String(idleTimeoutMs)}ms: turnId=${input.turn.turnId}`,
      ))
    }, idleTimeoutMs)
  }
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    for (const dispose of disposers) dispose()
    clearTimers()
  }
  const result = new Promise<AiAgentStreamTurnResult>((resolve, reject) => {
    state.bind({
      resolve: (value) => {
        cleanup()
        resolve(value)
      },
      reject: (error) => {
        cleanup()
        reject(error)
      },
    })
    timeoutId = setTimeout(() => {
      state.fail(new Error(`AI turn timed out waiting for APP SSE events: turnId=${input.turn.turnId}`))
    }, timeoutMs)
    resetIdleTimer()
    input.signal?.addEventListener('abort', () => {
      state.fail(new Error('AI turn aborted'))
    }, { once: true })
  })
  result.finally(cleanup).catch(() => undefined)

  return {
    result,
    close() {
      cleanup()
      state.close()
    },
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 内部状态机 — 事件聚合与结果构造
// ═══════════════════════════════════════════════════════════════

/** Promise sink：完成后注入 resolve/reject */
type TurnEventStateSink = Readonly<{
  resolve(result: AiAgentStreamTurnResult): void
  reject(error: unknown): void
}>

/**
 * Turn 事件状态机。
 *
 * 聚合来自 SSE 流的 delta / reasoning / result / error / done 事件，
 * 维护 text、reasoning 和 toolCalls 的累积状态。
 * settled 标记防止重复完成。
 */
class TurnEventState {
  private text = ''
  private reasoning: string | undefined
  private toolCalls: readonly AiAgentTransportToolCall[] = []
  private sink: TurnEventStateSink | null = null
  private settled = false

  public constructor(private readonly input: AiAgentStreamTurnInput) {}

  /** 绑定 Promise sink（构造函数内部调用） */
  public bind(sink: TurnEventStateSink): void {
    this.sink = sink
  }

  /** 处理单个 AI frame 事件 */
  public handle(kind: AiTurnEventKind, event: AiAgentAppSseEvent, frame: AiAgentFrame): void {
    if (this.settled) return
    this.input.onStreamEvent?.(toStreamEvent(this.input, kind, frame))
    if (!event.ok || kind === 'error') {
      this.fail(new Error(formatTurnEventError(frame.data ?? event.data)))
      return
    }
    if (kind === 'delta') {
      this.appendDelta(frame.data)
      return
    }
    if (kind === 'reasoning') {
      this.appendReasoning(frame.data)
      return
    }
    if (kind === 'result' && isRecord(frame.data)) {
      this.applyResult(frame.data)
      this.complete()
      return
    }
    if (kind === 'done') {
      this.complete()
    }
  }

  /** 失败处理（超时 / error / abort） */
  public fail(error: unknown): void {
    if (this.settled) return
    this.settled = true
    this.sink?.reject(error)
  }

  /** 主动关闭（不再接收事件） */
  public close(): void {
    this.settled = true
  }

  /** 追加文本增量 */
  private appendDelta(data: unknown): void {
    const delta = readFrameText(data, 'delta')
    if (delta === '') return
    this.text += delta
    this.input.onDelta?.(delta)
  }

  /** 追加推理过程增量 */
  private appendReasoning(data: unknown): void {
    const reasoning = readFrameText(data, 'reasoning') || readFrameText(data, 'delta')
    if (reasoning === '') return
    this.reasoning = `${this.reasoning ?? ''}${reasoning}`
    this.input.onReasoning?.(reasoning)
  }

  /** 应用最终结果（覆盖累积的 text/reasoning/toolCalls） */
  private applyResult(data: Readonly<Record<string, unknown>>): void {
    if (typeof data['text'] === 'string') this.text = data['text']
    if (typeof data['reasoning'] === 'string') this.reasoning = data['reasoning']
    const toolCalls = readToolCalls(data['toolCalls']) ?? readToolCalls(data['tool_calls'])
    if (toolCalls !== null && toolCalls.length > 0) {
      this.toolCalls = toolCalls
      return
    }
    const recoveredToolCalls = recoverToolCallsFromText(this.text)
    if (recoveredToolCalls !== null) {
      this.toolCalls = recoveredToolCalls
      this.text = ''
    }
  }

  /** 完成收集：构造 AiAgentStreamTurnResult 并 resolve */
  private complete(): void {
    if (this.settled) return
    if (this.toolCalls.length === 0) {
      const recoveredToolCalls = recoverToolCallsFromText(this.text)
      if (recoveredToolCalls !== null) {
        this.toolCalls = recoveredToolCalls
        this.text = ''
      }
    }
    this.settled = true
    this.sink?.resolve({
      text: this.text,
      ...(this.reasoning === undefined ? {} : { reasoning: this.reasoning }),
      toolCalls: this.toolCalls,
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · SSE 事件解析与规范化
// ═══════════════════════════════════════════════════════════════

/** 读取并校验匹配的 AI frame：校验事件名、sessionId、turnId 和 frame 结构 */
function readMatchingAiAgentFrame(
  event: AiAgentAppSseEvent,
  input: AiAgentStreamTurnInput,
): AiAgentFramePayload | null {
  if (event.name !== AI_FRAME_EVENT_NAME || !isRecord(event.data)) return null
  const sessionId = event.data['sessionId']
  const turnId = event.data['turnId']
  const frame = event.data['frame']
  if (sessionId !== input.sessionId || turnId !== input.turn.turnId || !isRecord(frame)) {
    return null
  }
  const type = frame['type']
  if (typeof type !== 'string') return null
  return {
    sessionId,
    turnId,
    frame: {
      type,
      data: frame['data'],
    },
  }
}

/** 根据 frame.type 推导事件类型 */
function toTurnEventKind(frame: AiAgentFrame): AiTurnEventKind {
  if (frame.type === 'error') return 'error'
  if (frame.type === 'done') return 'done'
  if (frame.type === 'message.completed') return 'result'
  if (frame.type === 'message.delta' && isRecord(frame.data) && frame.data['part'] === 'reasoning') {
    return 'reasoning'
  }
  return 'delta'
}

/** 构造 AiAgentStreamEvent（用于 onStreamEvent 回调） */
function toStreamEvent(
  input: AiAgentStreamTurnInput,
  kind: AiTurnEventKind,
  frame: AiAgentFrame,
): AiAgentStreamEvent {
  return {
    type: kind,
    data: frame.data,
    turnKey: '',
    streamKey: '',
    scope: {
      businessRegistrationId: input.scope.businessRegistrationId,
      businessInstanceId: input.scope.businessInstanceId,
      eventModuleId: 'llm',
      turnId: input.turn.turnId,
    },
  }
}

/** 格式化 turn 错误消息（提取 code / message） */
function formatTurnEventError(data: unknown): string {
  if (typeof data === 'string' && data.trim() !== '') return data
  if (!isRecord(data)) return 'AI turn failed'
  const message = typeof data['message'] === 'string' && data['message'].trim() !== ''
    ? data['message']
    : 'AI turn failed'
  const code = typeof data['code'] === 'string' && data['code'].trim() !== ''
    ? data['code']
    : ''
  return code === '' ? message : `${message} (code=${code})`
}

/** 从 frame data 中安全读取文本字符串 */
function readFrameText(data: unknown, key: string): string {
  if (isRecord(data) && typeof data[key] === 'string') return data[key]
  return typeof data === 'string' ? data : ''
}

/** 从结果中规范化 tool_calls 数组 */
function readToolCalls(value: unknown): readonly AiAgentTransportToolCall[] | null {
  if (!Array.isArray(value)) return null
  return value
    .map(normalizeToolCall)
    .filter((call): call is AiAgentTransportToolCall => call !== null)
}

function recoverToolCallsFromText(text: string): readonly AiAgentTransportToolCall[] | null {
  const calls = [
    ...recoverJsonToolCallsFromText(text),
    ...recoverDsmlToolCallsFromText(text),
    ...recoverInlineObjectToolCallsFromText(text),
    ...recoverBareObjectToolCallsFromText(text),
    ...recoverArgKeyTagToolCallsFromText(text),
  ]
  const normalizedCalls = dedupeRecoveredToolCalls(calls)
  return normalizedCalls.length === 0 ? null : normalizedCalls
}

export function recoverAssistantTextToolCalls(text: string): readonly AiAgentTransportToolCall[] {
  return recoverToolCallsFromText(text) ?? []
}

export function containsPseudoToolCallText(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return false
  return /<tool_call>/i.test(trimmed)
    || /<[|｜]DSML[|｜]tool_calls>/i.test(trimmed)
    || /"tool_call"\s*:/.test(trimmed)
    || /"tool_calls"\s*:/.test(trimmed)
    || containsBareJsonToolCallText(trimmed)
}

function recoverJsonToolCallsFromText(text: string): readonly AiAgentTransportToolCall[] {
  const calls: AiAgentTransportToolCall[] = []
  for (const jsonText of extractJsonCandidates(text)) {
    try {
      const parsed: unknown = JSON.parse(jsonText)
      const toolCalls = readTextToolCalls(parsed)
      if (toolCalls !== null) calls.push(...toolCalls)
    } catch {
      // Ignore malformed text fragments; another candidate may still carry a valid tool call.
    }
  }
  return calls
}

function extractJsonCandidates(text: string): readonly string[] {
  const candidates: string[] = []
  for (const block of extractFencedCodeBlocks(text)) {
    candidates.push(...extractBalancedJsonCandidates(block))
  }
  candidates.push(...extractBalancedJsonCandidates(text))
  return candidates
}

function extractFencedCodeBlocks(text: string): readonly string[] {
  const blocks: string[] = []
  const fencePattern = /```(?:json|JSON)?\s*([\s\S]*?)```/g
  for (const match of text.matchAll(fencePattern)) {
    const block = match[1]?.trim()
    if (block !== undefined && block.length > 0) blocks.push(block)
  }
  return blocks
}

function extractBalancedJsonCandidates(text: string): readonly string[] {
  const candidates: string[] = []
  let start = -1
  let depth = 0
  let quote: '"' | null = null
  let escaping = false
  const stack: string[] = []

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== null) {
      if (escaping) {
        escaping = false
      } else if (char === '\\') {
        escaping = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"') {
      quote = char
      continue
    }

    if (char === '{' || char === '[') {
      if (depth === 0) start = index
      stack.push(char)
      depth += 1
      continue
    }

    if ((char === '}' || char === ']') && depth > 0) {
      const opener = stack[stack.length - 1]
      if ((opener === '{' && char !== '}') || (opener === '[' && char !== ']')) {
        start = -1
        depth = 0
        stack.length = 0
        continue
      }
      stack.pop()
      depth -= 1
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }

  return candidates
}

function readTextToolCalls(value: unknown): readonly AiAgentTransportToolCall[] | null {
  if (Array.isArray(value)) return readLenientToolCalls(value)
  if (!isRecord(value)) return null
  const toolCalls = value['tool_calls'] ?? value['toolCalls']
  if (Array.isArray(toolCalls)) return readLenientToolCalls(toolCalls)
  const single = normalizeTextToolCall(value, 0)
  return single === null ? null : [single]
}

function readLenientToolCalls(value: readonly unknown[]): readonly AiAgentTransportToolCall[] | null {
  const calls = value
    .map((item, index) => normalizeTextToolCall(item, index))
    .filter((call): call is AiAgentTransportToolCall => call !== null)
  return calls.length === 0 ? null : calls
}

function recoverDsmlToolCallsFromText(text: string): readonly AiAgentTransportToolCall[] {
  const calls: AiAgentTransportToolCall[] = []
  const invokePattern = /<[|｜]DSML[|｜]invoke\b([^>]*)>([\s\S]*?)<\/[|｜]DSML[|｜]invoke>/g
  for (const match of text.matchAll(invokePattern)) {
    const attrs = match[1] ?? ''
    const body = match[2] ?? ''
    const name = readDsmlAttr(attrs, 'name')
    if (name === null || name.trim() === '') continue
    calls.push({
      id: `call_dsml_${String(calls.length + 1)}`,
      type: 'function',
      function: {
        name,
        arguments: JSON.stringify(readDsmlParameters(body)),
      },
    })
  }
  return calls
}

/** 部分 OpenAI 兼容网关常见：<tool_call>model_script({"script":"..."})（可无闭合标签）。 */
function recoverInlineObjectToolCallsFromText(text: string): readonly AiAgentTransportToolCall[] {
  const calls: AiAgentTransportToolCall[] = []
  const openerPattern = /<tool_call>\s*([A-Za-z_][\w.-]*)\s*\(/gi
  for (const match of text.matchAll(openerPattern)) {
    const name = match[1]?.trim() ?? ''
    const argsStart = match.index + match[0].length
    const remainder = text.slice(argsStart)
    const jsonCandidates = extractBalancedJsonCandidates(remainder)
    const jsonText = jsonCandidates[0]
    if (name.length === 0 || jsonText === undefined) continue
    const parsed = parseRecoveredObjectArgs(jsonText)
    if (parsed === null) continue
    calls.push(createRecoveredToolCall({ name, args: parsed, index: calls.length, idPrefix: 'call_inline' }))
  }
  return calls
}

const RECOVERABLE_BARE_TOOL_NAMES = [
  'model_query',
  'model_class_guide',
  'model_attribute_guide',
  'model_action_guide',
  'model_script',
  'human_question',
  'agent_complete',
] as const

const BARE_JSON_TOOL_CALL_PATTERN = new RegExp(
  `\\b(${RECOVERABLE_BARE_TOOL_NAMES.join('|')})\\s*\\(`,
  'g',
)

function containsBareJsonToolCallText(text: string): boolean {
  BARE_JSON_TOOL_CALL_PATTERN.lastIndex = 0
  return BARE_JSON_TOOL_CALL_PATTERN.test(text)
}

function recoverBareObjectToolCallsFromText(text: string): readonly AiAgentTransportToolCall[] {
  const calls: AiAgentTransportToolCall[] = []
  BARE_JSON_TOOL_CALL_PATTERN.lastIndex = 0
  for (const match of text.matchAll(BARE_JSON_TOOL_CALL_PATTERN)) {
    const name = match[1]?.trim() ?? ''
    const argsStart = match.index + match[0].length
    const remainder = text.slice(argsStart).trimStart()
    const jsonText = extractBalancedJsonCandidates(remainder)[0]
    if (name.length === 0 || jsonText === undefined) continue
    const parsed = parseRecoveredObjectArgs(jsonText)
    if (parsed === null) continue
    calls.push(createRecoveredToolCall({ name, args: parsed, index: calls.length, idPrefix: 'call_bare' }))
  }
  return calls
}

function parseRecoveredObjectArgs(text: string): Record<string, unknown> | null {
  const strict = parseJsonObjectArgs(text)
  if (strict !== null) return strict
  const normalized = normalizeLenientObjectLiteral(text)
  if (normalized === null) return null
  return parseJsonObjectArgs(normalized)
}

function parseJsonObjectArgs(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function normalizeLenientObjectLiteral(text: string): string | null {
  let normalized = ''
  let index = 0
  while (index < text.length) {
    const char = text.charAt(index)
    if (char === '"') {
      const segment = readDoubleQuotedSegment(text, index)
      if (segment === null) return null
      normalized += segment.text
      index = segment.nextIndex
      continue
    }
    if (char === "'") {
      const segment = readSingleQuotedSegment(text, index)
      if (segment === null) return null
      normalized += segment.text
      index = segment.nextIndex
      continue
    }
    if (char === '`') return null
    if (isIdentifierStart(char)) {
      const segment = readIdentifierSegment(text, index)
      const nextIndex = skipWhitespace(text, segment.nextIndex)
      normalized += text.charAt(nextIndex) === ':' ? JSON.stringify(segment.text) : segment.text
      index = segment.nextIndex
      continue
    }
    normalized += char
    index += 1
  }
  return removeTrailingCommas(normalized)
}

type TextSegment = Readonly<{
  text: string
  nextIndex: number
}>

function readDoubleQuotedSegment(source: string, startIndex: number): TextSegment | null {
  let index = startIndex + 1
  let escaping = false
  while (index < source.length) {
    const char = source.charAt(index)
    if (escaping) {
      escaping = false
    } else if (char === '\\') {
      escaping = true
    } else if (char === '"') {
      return {
        text: source.slice(startIndex, index + 1),
        nextIndex: index + 1,
      }
    }
    index += 1
  }
  return null
}

function readSingleQuotedSegment(source: string, startIndex: number): TextSegment | null {
  let index = startIndex + 1
  let escaping = false
  let value = ''
  while (index < source.length) {
    const char = source.charAt(index)
    if (escaping) {
      value += unescapeSingleQuotedChar(char)
      escaping = false
    } else if (char === '\\') {
      escaping = true
    } else if (char === "'") {
      return {
        text: JSON.stringify(value),
        nextIndex: index + 1,
      }
    } else {
      value += char
    }
    index += 1
  }
  return null
}

function unescapeSingleQuotedChar(char: string): string {
  switch (char) {
    case 'b':
      return '\b'
    case 'f':
      return '\f'
    case 'n':
      return '\n'
    case 'r':
      return '\r'
    case 't':
      return '\t'
    default:
      return char
  }
}

function readIdentifierSegment(source: string, startIndex: number): TextSegment {
  let index = startIndex + 1
  while (index < source.length && isIdentifierPart(source.charAt(index))) {
    index += 1
  }
  return {
    text: source.slice(startIndex, index),
    nextIndex: index,
  }
}

function skipWhitespace(source: string, startIndex: number): number {
  let index = startIndex
  while (index < source.length && /\s/u.test(source.charAt(index))) {
    index += 1
  }
  return index
}

function removeTrailingCommas(text: string): string {
  let normalized = ''
  let index = 0
  while (index < text.length) {
    const char = text.charAt(index)
    if (char === '"') {
      const segment = readDoubleQuotedSegment(text, index)
      if (segment === null) return text
      normalized += segment.text
      index = segment.nextIndex
      continue
    }
    if (char === ',') {
      const nextIndex = skipWhitespace(text, index + 1)
      const nextChar = text.charAt(nextIndex)
      if (nextChar === '}' || nextChar === ']') {
        index += 1
        continue
      }
    }
    normalized += char
    index += 1
  }
  return normalized
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/u.test(char)
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$]/u.test(char)
}

/** glm / 部分 OpenAI 兼容网关会把 tool_call 写进 assistant 文本（arg_key / arg_value 标签）。 */
function recoverArgKeyTagToolCallsFromText(text: string): readonly AiAgentTransportToolCall[] {
  const calls: AiAgentTransportToolCall[] = []
  const blockPattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi
  for (const match of text.matchAll(blockPattern)) {
    const inner = match[1]?.trim() ?? ''
    if (inner.length === 0) continue
    const nameEnd = inner.search(/<arg_key>/i)
    const rawName = (nameEnd >= 0 ? inner.slice(0, nameEnd) : inner).trim()
    if (rawName.length === 0 || rawName.includes('(')) continue
    const args: Record<string, unknown> = {}
    const argsSection = nameEnd >= 0 ? inner.slice(nameEnd) : ''
    const pairPattern = /<arg_key>\s*([\s\S]*?)\s*<\/arg_key>\s*<arg_value>\s*([\s\S]*?)\s*<\/arg_value>/gi
    for (const pair of argsSection.matchAll(pairPattern)) {
      const key = pair[1]?.trim() ?? ''
      if (key.length === 0) continue
      args[key] = pair[2]?.trim() ?? ''
    }
    Object.assign(args, readMalformedArgKeyArguments(argsSection))
    calls.push(createRecoveredToolCall({ name: rawName, args, index: calls.length, idPrefix: 'call_argtag' }))
  }
  return calls
}

function readMalformedArgKeyArguments(argsSection: string): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  const malformedPattern = /<arg_key>\s*([\s\S]*?)\s*<\/arg_value>/gi
  for (const match of argsSection.matchAll(malformedPattern)) {
    const fragment = match[1]?.trim() ?? ''
    if (fragment.length === 0 || fragment.includes('</arg_key>')) continue
    Object.assign(args, parseMalformedArgFragment(fragment))
  }
  return args
}

function parseMalformedArgFragment(fragment: string): Record<string, unknown> {
  const repaired = repairMalformedArgFragment(fragment)
  if (repaired.length === 0) return {}
  return parseRecoveredObjectArgs(`{${repaired}}`) ?? {}
}

function repairMalformedArgFragment(fragment: string): string {
  return fragment
    .trim()
    .replace(/^\{+/u, '')
    .replace(/\}+$/u, '')
    .replace(/\\/gu, '')
    .replace(/(^|,)\s*([A-Za-z_$][A-Za-z0-9_$]*)"\s*:/gu, '$1$2:')
}

type CreateRecoveredToolCallCommand = Readonly<{
  name: string
  args: Record<string, unknown>
  index: number
  idPrefix: string
}>

function createRecoveredToolCall(command: CreateRecoveredToolCallCommand): AiAgentTransportToolCall {
  const { name, args, index, idPrefix } = command
  return {
    id: `${idPrefix}_${String(index + 1)}`,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(normalizeRecoveredToolArguments(name, args)),
    },
  }
}

function normalizeRecoveredToolArguments(
  _toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  return args
}

function readDsmlParameters(body: string): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  const paramPattern = /<[|｜]DSML[|｜]parameter\b([^>]*)>([\s\S]*?)<\/[|｜]DSML[|｜]parameter>/g
  for (const match of body.matchAll(paramPattern)) {
    const attrs = match[1] ?? ''
    const name = readDsmlAttr(attrs, 'name')
    if (name === null || name.trim() === '') continue
    params[name] = readDsmlParameterValue(match[2] ?? '', readDsmlAttr(attrs, 'string'))
  }
  return params
}

function readDsmlParameterValue(rawValue: string, stringFlag: string | null): unknown {
  const value = rawValue.trim()
  if (stringFlag === 'false') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function readDsmlAttr(attrs: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}="([^"]*)"`)
  return pattern.exec(attrs)?.[1] ?? null
}

function dedupeRecoveredToolCalls(
  calls: readonly AiAgentTransportToolCall[],
): readonly AiAgentTransportToolCall[] {
  const seenPayloads = new Set<string>()
  const usedIds = new Set<string>()
  const result: AiAgentTransportToolCall[] = []
  for (const call of calls) {
    const payloadKey = `${call.function.name}\u0000${call.function.arguments}`
    if (seenPayloads.has(payloadKey)) continue
    seenPayloads.add(payloadKey)
    const id = createRecoveredToolCallId(call.id, usedIds, result.length)
    usedIds.add(id)
    result.push({
      ...call,
      id,
    })
  }
  return result
}

function createRecoveredToolCallId(id: string, usedIds: ReadonlySet<string>, index: number): string {
  const normalized = id.trim()
  if (normalized.length > 0 && !usedIds.has(normalized)) return normalized
  let nextIndex = index + 1
  let nextId = `call_text_${String(nextIndex)}`
  while (usedIds.has(nextId)) {
    nextIndex += 1
    nextId = `call_text_${String(nextIndex)}`
  }
  return nextId
}

function normalizeTextToolCall(value: unknown, index: number): AiAgentTransportToolCall | null {
  if (!isRecord(value)) return null
  const fn = isRecord(value['function']) ? value['function'] : null
  const name = fn !== null && typeof fn['name'] === 'string'
    ? fn['name']
    : readTextToolName(value)
  if (name === null || name.trim() === '') return null
  const rawArguments = fn !== null && Object.hasOwn(fn, 'arguments')
    ? fn['arguments']
    : (Object.hasOwn(value, 'arguments') ? value['arguments'] : value['args'])
  const id = typeof value['id'] === 'string' && value['id'].trim() !== ''
    ? value['id']
    : `call_text_${String(index + 1)}`
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: typeof rawArguments === 'string' ? rawArguments : JSON.stringify(rawArguments ?? {}),
    },
  }
}

function readTextToolName(value: Readonly<Record<string, unknown>>): string | null {
  for (const key of ['tool_call', 'toolCall', 'function_name', 'functionName', 'name']) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate
  }
  return null
}

/**
 * 规范化单条 tool_call。
 * 要求：function.name 非空，id 非空（对齐 OpenAI tool_call 规范）。
 * 不合规的 tool_call 被丢弃（后端不生成 id 视为不兼容格式）。
 */
function normalizeToolCall(value: unknown): AiAgentTransportToolCall | null {
  if (!isRecord(value)) return null
  const fn = isRecord(value['function']) ? value['function'] : null
  if (fn === null || typeof fn['name'] !== 'string' || fn['name'].trim() === '') return null
  if (typeof value['id'] !== 'string' || value['id'].trim().length === 0) return null
  const rawArguments = fn['arguments']
  return {
    id: value['id'],
    type: 'function',
    function: {
      name: fn['name'],
      arguments: typeof rawArguments === 'string' ? rawArguments : JSON.stringify(rawArguments ?? {}),
    },
  }
}
