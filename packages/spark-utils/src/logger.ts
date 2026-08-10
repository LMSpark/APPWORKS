/**
 * @module @spark-appworks/spark-utils:logger
 * 职责：提供框架无关基础设施 logger 能力，围绕 LogLevel、LoggerApi、LogTransport 支撑 capability、HTTP、日志、脚本类型或历史快照。
 * 边界：保持底层工具包纯净，不依赖 Vue、spark-data 或应用壳层，也不承载业务配置。
 * AI用途：需要跨包复用基础能力或确认底层协议时，用本模块理解 logger。
 */
// Note: Logger 系统本身需要使用 console 输出日志，禁用 no-console 规则是合理的
/* eslint-disable no-console */

/**
 * SPARK Logger - 轻量级结构化日志
 *
 * 全局传输器：`addLogTransport(transport)` — 结构化接收 `(level, message, meta?)`
 *
 * 传输器由应用层（main.ts）注入，所有 `Logger()` 实例的输出自动流入传输器链，
 * 实现 spark-utils → spark-app → AI 闭环的 **全链路贯穿**。
 */

import { isRecord } from './internal/guards.js'

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Logger API */
export type LoggerApi = {
  /** 输出调试级别日志；仅开发环境可见，用于排查内部状态流转。 */
  debug(...args: unknown[]): void
  /** 输出信息级别日志；记录正常业务流程关键节点。 */
  info(...args: unknown[]): void
  /** 输出警告级别日志；非致命异常或降级路径，需要关注但不阻断流程。 */
  warn(...args: unknown[]): void
  /** 输出错误级别日志；业务失败或运行时异常，自动捕获调用栈并附带传输器诊断。 */
  error(...args: unknown[]): void}

// ─── 全局传输器（结构化，APP 层贯穿） ────────────────────────────────────────

/**
 * 日志传输器接口（SSoT）。应用壳批量传输见 spark-app `AppLogTransport`（额外 flush/destroy）。
 *
 * spark-utils 是最底层包，此接口定义为传输器的基础契约。
 * spark-app 的 AppLogTransport 扩展了 `flush?()` / `destroy?()`，但 send 签名一致，
 * 因此同一个 transport 实例可同时注册到两个系统。
 */
export type LogTransport = {
  /** 将结构化日志发送到传输目标；实现同步或异步均可，异常不会影响日志主流程。 */
  send(level: LogLevel, message: string, meta?: Record<string, unknown>): void | Promise<void>}

/** 全局传输器列表 */
const _transports: LogTransport[] = []

type LogCaller = {
  frame: string
  stack: string}

const LOGGER_INTERNAL_FRAME_RE = /(packages[\\/]+spark-utils[\\/]+src[\\/]+logger\.(ts|js)|spark-utils[\\/]+dist[\\/]+logger\.js)/i

function isLoggerInternalFrame(line: string): boolean {
  return LOGGER_INTERNAL_FRAME_RE.test(line)
    || /\b(captureLogCaller|compactLogCallerStack|withHook|consoleLogger)\b/.test(line)
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

function isPlainRecord(value: Record<string, unknown>): boolean {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function normalizeLogValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value instanceof Error) return serializeError(value)
  if (Array.isArray(value)) return value.map(item => normalizeLogValue(item, seen))
  if (!isRecord(value)) return value
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
  if (!isRecord(value)) return undefined
  if (seen.has(value)) return undefined
  seen.add(value)

  const stack = value['stack']
  if (typeof stack === 'string' && stack.trim() !== '') {
    seen.delete(value)
    return stack
  }

  for (const item of Object.values(value)) {
    const nested = readStack(item, seen)
    if (nested !== undefined) {
      seen.delete(value)
      return nested
    }
  }

  seen.delete(value)
  return undefined
}

function hasTopLevelError(args: unknown[]): boolean {
  return args.some(arg => arg instanceof Error)
}

function readNestedStack(args: unknown[]): string | undefined {
  for (const arg of args) {
    if (arg instanceof Error) continue
    const stack = readStack(arg, new WeakSet())
    if (stack !== undefined) return stack
  }
  return undefined
}

function appendErrorStack(args: unknown[], caller: LogCaller | undefined): unknown[] {
  if (hasTopLevelError(args)) return args
  const stack = readNestedStack(args) ?? caller?.stack
  return stack === undefined ? args : [...args, stack]
}

/**
 * 添加全局传输器。所有通过 `Logger()` 创建的实例在输出控制台后，
 * 会将结构化的 `(level, message, meta)` 发送到每个传输器。
 *
 * 典型用途：AI 闭环日志收集、远程日志上报。
 */
export function addLogTransport(transport: LogTransport): void {
  _transports.push(transport)
}

/**
 * 移除指定传输器
 */
export function removeLogTransport(transport: LogTransport): void {
  const idx = _transports.indexOf(transport)
  if (idx >= 0) _transports.splice(idx, 1)
}

/**
 * 清除所有传输器（测试用）
 */
export function clearLogTransports(): void {
  _transports.length = 0
}

/**
 * 从 Logger 的变长参数中提取结构化的 message + meta
 *
 * 约定：
 * - string 参数 → 拼入 message
 * - Error 对象 → 转为 `{ error, stack }` 合并到 meta
 * - 普通 object → 合并到 meta（如 `{ fileName, error: msg }` ）
 * - 其他类型 → String 化后拼入 message
 */
export function parseLogArgs(prefix: string | undefined, args: unknown[]): { message: string; meta: Record<string, unknown> | undefined } {
  const strings: string[] = prefix !== undefined ? [prefix] : []
  let meta: Record<string, unknown> | undefined

  for (const a of args) {
    if (typeof a === 'string') {
      strings.push(a)
    } else if (a instanceof Error) {
      meta = { ...meta, error: a.message, stack: a.stack }
    } else if (isRecord(a)) {
      meta = { ...meta, ...normalizeLogMeta(a) }
    } else if (a !== undefined) {
      strings.push(String(a))
    }
  }

  return { message: strings.join(' '), meta }
}

// ─── Logger 工厂 ───────────────────────────────────────────────────────────

/** Emoji per log level（与 spark-app AppLogger 一致） */
const LEVEL_EMOJI: Record<LogLevel, string> = {
  debug: '🐛',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
}

function consoleLogger(prefix?: string): LoggerApi {
  const fmt = (_level: LogLevel, args: unknown[]) =>
    [...(prefix ? [prefix] : []), ...args]

  function withHook(level: LogLevel, consoleFn: (...a: unknown[]) => void, args: unknown[]): void {
    const caller = level === 'error' ? captureLogCaller() : undefined
    const consoleArgs = level === 'error' ? appendErrorStack(args, caller) : args
    consoleFn(LEVEL_EMOJI[level], ...fmt(level, consoleArgs))

    // 结构化传输器（推荐路径：APP 层贯穿）
    if (_transports.length > 0) {
      const { message, meta } = parseLogArgs(prefix, args)
      const diagnosticMeta = level === 'error' ? withLogCaller(meta, caller) : meta
      for (const t of _transports) {
        try { void t.send(level, message, diagnosticMeta) } catch { /* transport 异常不影响日志输出 */ }
      }
    }
  }

  return {
    debug: (...a) => withHook('debug', console.debug, a),
    info:  (...a) => withHook('info',  console.info,  a),
    warn:  (...a) => withHook('warn',  console.warn,  a),
    error: (...a) => withHook('error', console.error, a),
  }
}

/**
 * 创建 Logger
 * @param context 字符串标签
 */
export function Logger(context?: string): LoggerApi {
  return consoleLogger(context ? `[${context}]` : undefined)
}
