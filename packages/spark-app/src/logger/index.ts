/**
 * @module @spark-appworks/spark-app:logger/index
 * 职责：提供 spark-app 应用壳中的 index 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */

/**
 * 日志级别（与 spark-utils 共享；本模块只 import 使用，不再 re-export）
 */
import type { LogLevel, LogTransport as BaseLogTransport } from '@spark-appworks/spark-utils'
import { sendBeacon } from '@spark-appworks/spark-utils'

/**
 * 应用层 Logger API 接口
 *
 * 与 spark-utils 的 LoggerApi 是不同的接口：
 * - spark-utils LoggerApi: 轻量级，(...args: unknown[]) => void
 * - AppLoggerApi: 结构化参数，(message: string, meta?) => void
 */
export type AppLoggerApi = {
  /** 输出调试级别日志，仅开发环境可见；用于流程跟踪和变量检查 */
  debug(message: string, meta?: Record<string, unknown>): void
  /** 输出信息级别日志，标记正常业务流程关键节点（启动、切换、完成） */
  info(message: string, meta?: Record<string, unknown>): void
  /** 输出警告级别日志，标记可恢复的异常或需要关注的退化情况 */
  warn(message: string, meta?: Record<string, unknown>): void
  /** 输出错误级别日志，自动捕获调用栈；用于不可恢复异常和需要排查的失败 */
  error(message: string, error?: Error | Record<string, unknown>): void
  /** 输出成功标记日志（实际按 info 级别输出，带成功图标），用于关键操作完成确认 */
  success(message: string, meta?: Record<string, unknown>): void}

/**
 * 日志配置
 */
export type AppLoggerConfig = {
  /** 最小日志级别 */
  level?: LogLevel
  /** 是否启用颜色 */
  enableColors?: boolean
  /** 是否显示时间戳 */
  showTimestamp?: boolean
  /** 日志前缀 */
  prefix?: string
  /** error 级别是否避免使用 console.error 输出，防止浏览器自动展开调用栈 */
  suppressErrorConsoleTrace?: boolean
  /** 远程日志端点 */
  remoteEndpoint?: string
  /** 远程上报的最小日志级别（默认 'debug'，即上报所有级别） */
  minRemoteLevel?: LogLevel
  /** 批量上传：队列大小阈值（达到后立即 flush，默认 50） */
  batchSize?: number
  /** 批量上传：定时 flush 间隔（毫秒，默认 5000） */
  flushInterval?: number}

/**
 * 日志传输器接口
 *
 * 继承 spark-utils LogTransport（SSoT）并补充批量传输需要的 flush/destroy。
 */
export type AppLogTransport = BaseLogTransport & {
  /** 立即刷新队列中的日志（批量传输器可选实现） */
    flush?(): void
    /** 销毁传输器，释放定时器等资源 */
    destroy?(): void}

/**
 * 日志级别优先级
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

/**
 * Emoji 图标
 */
const EMOJI_ICONS: Record<string, string> = {
  debug: '🐛',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  success: '✅',
  loading: '⏳'
}

type LogCaller = {
  frame: string
  stack: string}

const LOGGER_INTERNAL_FRAME_RE = /(packages[\\/]+spark-app[\\/]+src[\\/]+logger[\\/]+index\.(ts|js)|spark-app[\\/]+dist[\\/]+logger[\\/]+index\.js)/i

function isLoggerInternalFrame(line: string): boolean {
  return LOGGER_INTERNAL_FRAME_RE.test(line)
    || /\b(captureLogCaller|compactLogCallerStack|AppLogger\.(log|error|debug|info|warn|success)|createLogger|createAppLogger)\b/.test(line)
}

function compactLogCallerStack(stack: string | undefined, maxFrames = 8): LogCaller | undefined {
  if (typeof stack !== 'string' || stack.trim() === '') return undefined

  const frames = stack
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && line !== 'Error')
    .filter(line => !isLoggerInternalFrame(line))

  const frame = frames[0]
  if (frame === undefined) return undefined

  return {
    frame,
    stack: frames.slice(0, maxFrames).join('\n'),
  }
}

function captureLogCaller(): LogCaller | undefined {
  return compactLogCallerStack(new Error().stack)
}

function serializeError(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }
}

function isPlainRecord(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function normalizeLogValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value instanceof Error) return serializeError(value)
  if (Array.isArray(value)) return value.map(item => normalizeLogValue(item, seen))
  if (value === null || typeof value !== 'object') return value
  if (!isPlainRecord(value)) return value

  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  const normalized: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    normalized[key] = normalizeLogValue(item, seen)
  }

  seen.delete(value)
  return normalized
}

function normalizeLogRecord(value: Record<string, unknown>, seen: WeakSet<object>): Record<string, unknown> {
  if (seen.has(value)) return { value: '[Circular]' }
  seen.add(value)

  const normalized: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    normalized[key] = normalizeLogValue(item, seen)
  }

  seen.delete(value)
  return normalized
}

function normalizeLogMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (meta === undefined) return undefined
  return normalizeLogRecord(meta, new WeakSet())
}

function withLogCaller(
  meta: Record<string, unknown> | undefined,
  caller: LogCaller | undefined,
): Record<string, unknown> | undefined {
  const normalized = normalizeLogMeta(meta)
  if (caller === undefined) return normalized
  return { ...(normalized ?? {}), logCaller: caller }
}

function readStack(value: unknown, seen: WeakSet<object>): string | undefined {
  if (value instanceof Error) return value.stack
  if (Array.isArray(value)) {
    for (const item of value) {
      const stack = readStack(item, seen)
      if (stack !== undefined) return stack
    }
    return undefined
  }
  if (value === null || typeof value !== 'object') return undefined
  if (seen.has(value)) return undefined
  seen.add(value)

  const entries = Object.entries(value)
  for (const [key, item] of entries) {
    if (key === 'stack' && typeof item === 'string' && item.trim() !== '') {
      seen.delete(value)
      return item
    }
  }

  for (const [, item] of entries) {
    const nested = readStack(item, seen)
    if (nested !== undefined) {
      seen.delete(value)
      return nested
    }
  }

  seen.delete(value)
  return undefined
}

function buildErrorConsoleMessage(message: string, meta: Record<string, unknown> | undefined, caller: LogCaller | undefined): string {
  const stack = readStack(meta, new WeakSet()) ?? caller?.stack
  return stack === undefined ? message : `${message}\n${stack}`
}

// ─── 全局传输器（所有 AppLogger 实例共享） ────────────────────────────────────

/**
 * 全局共享传输器列表。
 * 通过 `addGlobalTransport()` / `configureRemoteLogger()` 注入，
 * 所有 AppLogger 实例（含已创建的模块级单例）自动生效。
 */
const _globalTransports: AppLogTransport[] = []

/**
 * 添加全局传输器（对所有已创建和未来创建的 AppLogger 生效）
 */
export function addGlobalTransport(transport: AppLogTransport): void {
  _globalTransports.push(transport)
}

/**
 * 移除所有全局传输器（测试用）
 */
export function clearGlobalTransports(): void {
  for (const t of _globalTransports) {
    t.destroy?.()
  }
  _globalTransports.length = 0
}

/**
 * 获取当前全局传输器数量（调试 / 测试用）
 */
export function getGlobalTransportCount(): number {
  return _globalTransports.length
}

// ─── 批量 HTTP 传输器配置 ─────────────────────────────────────────────────────

/** Batch Transport Options 的调用配置。 */
export type BatchTransportOptions = {
  /** 远程端点 URL */
  endpoint: string
  /** 上报的最小日志级别（默认 'debug'） */
  minLevel?: LogLevel
  /** 队列大小阈值（默认 50） */
  batchSize?: number
  /** 定时 flush 间隔 ms（默认 5000） */
  flushInterval?: number
  /** 获取当前页面 ID（每条日志自动附带） */
  getPageId?: () => string | undefined
  /** 会话 ID（整个浏览器生命周期不变，用于日志关联） */
  sessionId?: string}

type LogEntry = {
  level: LogLevel
  message: string
  meta?: Record<string, unknown> | undefined
  timestamp: number
  userAgent?: string | undefined
  /** 当前页面 ID（标识日志来源页面） */
  pageId?: string | undefined
  /** 会话 ID（追踪一次浏览器生命周期内的日志） */
  sessionId?: string | undefined}

/**
 * 创建批量 HTTP 传输器
 *
 * - 日志先缓存在内存队列中
 * - 达到 batchSize 或 flushInterval 到期时批量发送
 * - 页面隐藏 / 卸载时用 `navigator.sendBeacon` 兜底
 */
export function createBatchHttpTransport(options: BatchTransportOptions): AppLogTransport {
  const minLevelPriority = LOG_LEVELS[options.minLevel ?? 'debug']
  const batchSize = options.batchSize ?? 50
  const flushIntervalMs = options.flushInterval ?? 5000
  const endpoint = options.endpoint
  const getPageId = options.getPageId
  const sessionId = options.sessionId

  let queue: LogEntry[] = []
  let timer: ReturnType<typeof setInterval> | null = null

  function flush(): void {
    if (queue.length === 0) return
    const batch = queue
    queue = []
    sendBeacon(endpoint, { logs: batch })
  }

  // 定时刷新
  timer = setInterval(flush, flushIntervalMs)

  // 页面隐藏 / 卸载时兜底刷新
  function onVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      flush()
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  return {
    send(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
      if (LOG_LEVELS[level] < minLevelPriority) return
      queue.push({
        level,
        message,
        meta,
        timestamp: Date.now(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        pageId: getPageId?.(),
        sessionId,
      })
      if (queue.length >= batchSize) {
        flush()
      }
    },
    flush,
    destroy(): void {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      flush() // 销毁前把剩余日志发出
    }
  }
}

/**
 * 将日志发送到调用方明确提供的受治理端点。
 *
 * 内部创建 `createBatchHttpTransport` 并注入到全局传输器列表，
 * 所有已创建的 AppLogger 实例（startupLogger / pageLogger 等）自动生效。
 *
 * @example
 * ```ts
 * import { configureRemoteLogger } from '@spark-appworks/spark-app'
 *
 * configureRemoteLogger({
 *   endpoint: auditEndpoint,
 *   minLevel: 'debug',
 * })
 * ```
 */
export function configureRemoteLogger(options: BatchTransportOptions): AppLogTransport {
  const transport = createBatchHttpTransport(options)
  addGlobalTransport(transport)
  return transport
}

// ─── AppLogger 实现 ──────────────────────────────────────────────────────────

/**
 * 应用层 Logger 实现
 */
class AppLogger {
  private config: Required<Pick<AppLoggerConfig, 'level' | 'enableColors' | 'showTimestamp' | 'prefix' | 'suppressErrorConsoleTrace'>>
  private transports: AppLogTransport[] = []

    /** 创建 App Logger 实例。 */
constructor(config: AppLoggerConfig = {}) {
    this.config = {
      level: config.level ?? (import.meta.env.PROD ? 'info' : 'debug'),
      enableColors: config.enableColors ?? true,
      showTimestamp: config.showTimestamp ?? false,
      prefix: config.prefix ?? '',
      suppressErrorConsoleTrace: config.suppressErrorConsoleTrace ?? false,
    }
  }

  /**
   * 添加实例级传输器
   */
  addTransport(transport: AppLogTransport): void {
    this.transports.push(transport)
  }

  /**
   * 检查是否应该输出日志
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level]
  }

  /**
   * 格式化消息
   */
  private formatMessage(message: string, emoji?: string): string {
    const parts: string[] = []

    if (this.config.showTimestamp) {
      parts.push(`[${new Date().toISOString()}]`)
    }

    if (this.config.prefix) {
      parts.push(`[${this.config.prefix}]`)
    }

    if (emoji) {
      parts.push(emoji)
    }

    parts.push(message)

    return parts.join(' ')
  }

  /**
   * 发送到所有传输器（实例级 + 全局）
   */
  private sendToTransports(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const allTransports = [...this.transports, ..._globalTransports]
    for (const transport of allTransports) {
      try {
        Promise.resolve(transport.send(level, message, meta ?? {})).catch((err: unknown) => {
          console.error('日志传输失败（异步）', err)
        })
      } catch (error) {
        console.error('日志传输失败', error)
      }
    }
  }

  /**
   * 记录日志并触发传输器
   */
  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return

    const caller = level === 'error' ? captureLogCaller() : undefined
    const diagnosticMeta = level === 'error' ? withLogCaller(meta, caller) : normalizeLogMeta(meta)
    const emoji = EMOJI_ICONS[level]
    const formattedMessage = this.formatMessage(message, emoji)
    const consoleMessage = level === 'error'
      ? buildErrorConsoleMessage(formattedMessage, diagnosticMeta, caller)
      : formattedMessage

    // 直接输出到控制台
    // Note: Logger 系统需要使用原生 console API 进行输出
    // eslint-disable-next-line no-console
    const consoleFn = level === 'debug' ? console.debug :
                     level === 'info' ? console.info :
                     level === 'warn' ? console.warn :
                     this.config.suppressErrorConsoleTrace ? console.info :
                     console.error

    if (diagnosticMeta) {
      consoleFn(consoleMessage, diagnosticMeta)
    } else {
      consoleFn(consoleMessage)
    }

    // 触发所有传输器（实例级 + 全局）
    this.sendToTransports(level, message, diagnosticMeta)
  }

  /**
   * Debug 日志
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta)
  }

  /**
   * Info 日志
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta)
  }

  /**
   * Warning 日志
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta)
  }

  /**
   * Error 日志
   */
  error(message: string, error?: Error | Record<string, unknown>): void {
    const meta = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error
    this.log('error', message, meta)
  }

  /**
   * Success 日志（扩展）
   */
  success(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return
    const formattedMessage = this.formatMessage(message, EMOJI_ICONS['success'])
    const args = meta ? [formattedMessage, meta] : [formattedMessage]
    console.info(...args)
    this.sendToTransports('info', message, meta)
  }
}

/**
 * 创建应用 Logger
 */
export function createAppLogger(config?: AppLoggerConfig): AppLogger {
  return new AppLogger(config)
}

/**
 * 创建作用域 Logger
 */
export function createLogger(scope: string, config?: AppLoggerConfig): AppLogger {
  return new AppLogger({
    ...config,
    prefix: scope
  })
}

/**
 * 默认 Logger 实例
 */
export const appLogger = createAppLogger()
