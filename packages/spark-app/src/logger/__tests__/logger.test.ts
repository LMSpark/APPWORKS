/**
 * AppLogger 测试
 *
 * 覆盖：
 * - 日志级别过滤
 * - 前缀 & 时间戳格式化
 * - Transport 触发与错误隔离
 * - error() 方法处理 Error 对象 vs 普通对象
 * - success() 使用 console.info
 * - createLogger 前缀设置
 * - createBatchHttpTransport 批量发送与级别过滤
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createAppLogger,
  createLogger,
  createBatchHttpTransport,
} from '../index'
import type { AppLogTransport } from '../index'
import { isRecord } from '@spark-appworks/spark-utils'

/** 安全取 mock.calls 第 N 次调用 */
function callArgs(spy: ReturnType<typeof vi.spyOn>, n = 0): unknown[] {
  return spy.mock.calls[n] ?? []
}

function readFetchBody(options: unknown): string {
  if (!isRecord(options)) return '{}'
  return String(options['body'] ?? '{}')
}

describe('AppLogger', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>
  let infoSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── 日志级别过滤 ──

  describe('日志级别过滤', () => {
    it('level=warn → debug/info 被过滤，warn/error 输出', () => {
      const logger = createAppLogger({ level: 'warn' })

      logger.debug('d')
      logger.info('i')
      logger.warn('w')
      logger.error('e')

      expect(debugSpy).not.toHaveBeenCalled()
      expect(infoSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('level=debug → 所有级别输出', () => {
      const logger = createAppLogger({ level: 'debug' })

      logger.debug('d')
      logger.info('i')
      logger.warn('w')
      logger.error('e')

      expect(debugSpy).toHaveBeenCalledTimes(1)
      expect(infoSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('level=error → 仅 error 输出', () => {
      const logger = createAppLogger({ level: 'error' })

      logger.debug('d')
      logger.info('i')
      logger.warn('w')
      logger.error('e')

      expect(debugSpy).not.toHaveBeenCalled()
      expect(infoSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })
  })

  // ── 前缀 ──

  describe('前缀格式化', () => {
    it('prefix 出现在输出中', () => {
      const logger = createAppLogger({ level: 'info', prefix: 'API' })
      logger.info('hello')

      expect(infoSpy).toHaveBeenCalledTimes(1)
      const msg = String(callArgs(infoSpy)[0])
      expect(msg).toContain('[API]')
      expect(msg).toContain('hello')
    })

    it('无 prefix 时不含方括号', () => {
      const logger = createAppLogger({ level: 'info' })
      logger.info('hello')

      const msg = String(callArgs(infoSpy)[0])
      expect(msg).not.toContain('[undefined]')
    })
  })

  // ── 时间戳 ──

  describe('时间戳', () => {
    it('showTimestamp=true → 输出包含 ISO 格式时间', () => {
      const logger = createAppLogger({ level: 'info', showTimestamp: true })
      logger.info('test')

      const msg = String(callArgs(infoSpy)[0])
      expect(msg).toMatch(/\[\d{4}-\d{2}-\d{2}T/)
    })
  })

  // ── meta / error 对象 ──

  describe('meta 与 Error 处理', () => {
    it('info 带 meta 对象', () => {
      const logger = createAppLogger({ level: 'info' })
      const meta = { key: 'value' }
      logger.info('msg', meta)

      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('msg'), meta)
    })

    it('error 传入 Error 对象 → 提取 message + stack', () => {
      const logger = createAppLogger({ level: 'error' })
      const err = new Error('boom')
      logger.error('failed', err)

      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(String(callArgs(errorSpy)[0])).toContain('Error: boom')
      const meta = callArgs(errorSpy)[1]
      expect(meta).toHaveProperty('message', 'boom')
      expect(meta).toHaveProperty('stack')
      expect(meta).toHaveProperty('logCaller')
    })

    it('error 传入普通对象 → 直通', () => {
      const logger = createAppLogger({ level: 'error' })
      const obj = { code: 500, detail: 'bad' }
      logger.error('failed', obj)

      const meta = callArgs(errorSpy)[1]
      expect(meta).toEqual(expect.objectContaining(obj))
      expect(meta).toHaveProperty('logCaller')
    })

    it('error 缺少 Error 对象时，补充调用点栈', () => {
      const transport: AppLogTransport = { send: vi.fn() }
      const logger = createAppLogger({ level: 'error' })
      logger.addTransport(transport)

      function writeLog(): void {
        logger.error('failed')
      }

      writeLog()

      expect(String(callArgs(errorSpy)[0])).toContain('logger.test.ts')
      expect(transport.send).toHaveBeenCalledWith('error', 'failed', expect.objectContaining({
        logCaller: expect.objectContaining({
          stack: expect.stringContaining('logger.test.ts'),
        }),
      }))
    })

    it('suppressErrorConsoleTrace=true → 控制台不用 console.error，但 transport 保持 error 级别', () => {
      const transport: AppLogTransport = { send: vi.fn() }
      const logger = createAppLogger({ level: 'error', suppressErrorConsoleTrace: true })
      const meta = { code: 500 }
      logger.addTransport(transport)

      logger.error('failed', meta)

      expect(errorSpy).not.toHaveBeenCalled()
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('failed'), expect.objectContaining(meta))
      expect(transport.send).toHaveBeenCalledWith('error', 'failed', expect.objectContaining(meta))
    })
  })

  // ── success ──

  describe('success', () => {
    it('success 使用 console.info + ✅ emoji', () => {
      const logger = createAppLogger({ level: 'info' })
      logger.success('done')

      expect(infoSpy).toHaveBeenCalledTimes(1)
      const msg = String(callArgs(infoSpy)[0])
      expect(msg).toContain('✅')
      expect(msg).toContain('done')
    })
  })

  // ── Transport ──

  describe('Transport', () => {
    it('每条日志触发所有 transport', () => {
      const transport: AppLogTransport = { send: vi.fn() }
      const logger = createAppLogger({ level: 'debug' })
      logger.addTransport(transport)

      logger.info('hello')
      logger.warn('warning')

      expect(transport.send).toHaveBeenCalledTimes(2)
      expect(transport.send).toHaveBeenCalledWith('info', 'hello', {})
      expect(transport.send).toHaveBeenCalledWith('warn', 'warning', {})
    })

    it('transport 抛错不影响日志输出', () => {
      const badTransport: AppLogTransport = {
        send: () => { throw new Error('transport failure') },
      }
      const logger = createAppLogger({ level: 'info' })
      logger.addTransport(badTransport)

      expect(() => logger.info('test')).not.toThrow()
      expect(infoSpy).toHaveBeenCalledTimes(1)
    })
  })

  // ── createLogger ──

  describe('createLogger', () => {
    it('scope 作为前缀', () => {
      const logger = createLogger('Router', { level: 'info' })
      logger.info('navigated')

      const msg = String(callArgs(infoSpy)[0])
      expect(msg).toContain('[Router]')
    })
  })

  // ── createBatchHttpTransport ──

  describe('createBatchHttpTransport', () => {
    beforeEach(() => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    })

    it('按 minLevel 过滤并在达到 batchSize 后发送', () => {
      const transport = createBatchHttpTransport({ endpoint: '/api/logs', minLevel: 'warn', batchSize: 2, flushInterval: 60_000 })

      transport.send('debug', 'debug msg')
      transport.send('info', 'info msg')
      transport.send('warn', 'warn msg')
      transport.send('error', 'error msg')

      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      transport.destroy?.()
    })

    it('发送 JSON body 包含 logs 批次', () => {
      const transport = createBatchHttpTransport({ endpoint: '/api/logs', batchSize: 1, flushInterval: 60_000 })
      transport.send('error', 'boom', { code: 500 })

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/logs',
        expect.objectContaining({
          method: 'POST',
          keepalive: true,
          body: expect.stringContaining('"logs"'),
        }),
      )

      // 解析 body 验证完整结构
      const fetchSpy = vi.mocked(globalThis.fetch)
      const sentBody = readFetchBody(fetchSpy.mock.calls[0]?.[1])
      const body: unknown = JSON.parse(sentBody)
      if (!isRecord(body)) throw new Error('Expected log payload object')
      const logs = body['logs']
      if (!Array.isArray(logs) || !logs.every(isRecord)) {
        throw new Error('Expected log payload logs array')
      }
      expect(logs).toHaveLength(1)
      expect(logs[0]?.['level']).toBe('error')
      expect(logs[0]?.['message']).toBe('boom')
      expect(logs[0]?.['meta']).toEqual({ code: 500 })
      expect(logs[0]?.['timestamp']).toBeTypeOf('number')
      transport.destroy?.()
    })

    it('fetch 失败静默（不抛错）', () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('network'))
      const transport = createBatchHttpTransport({ endpoint: '/api/logs', batchSize: 1, flushInterval: 60_000 })

      expect(() => transport.send('error', 'msg')).not.toThrow()
      transport.destroy?.()
    })
  })
})
