import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Logger,
  addLogTransport,
  removeLogTransport,
  parseLogArgs,
  isRecord,
  type LogTransport,
} from '@spark-appworks/spark-utils'

type CapturedLog = {
  level: string
  message: string
  meta?: Record<string, unknown> | undefined}


describe('Logger diagnostics', () => {
  const captured: CapturedLog[] = []
  const transport: LogTransport = {
    send(level, message, meta) {
      captured.push({ level, message, meta })
    },
  }

  afterEach(() => {
    captured.length = 0
    removeLogTransport(transport)
    vi.restoreAllMocks()
  })

  it('serializes nested Error values in structured meta', () => {
    const error = new Error('nested boom')

    const parsed = parseLogArgs('[Test]', ['failed', { requestId: 'req-1', error }])

    expect(parsed.message).toBe('[Test] failed')
    expect(parsed.meta?.['requestId']).toBe('req-1')
    expect(parsed.meta?.['error']).toEqual(expect.objectContaining({
      name: 'Error',
      message: 'nested boom',
      stack: expect.stringContaining('nested boom'),
    }))
  })

  it('adds the external caller stack to error transport payloads and console output', () => {
    addLogTransport(transport)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function writeLog(): void {
      Logger('Diag').error('failed')
    }

    writeLog()

    const meta = captured[0]?.meta
    expect(meta).toBeDefined()
    const caller = meta?.['logCaller']
    expect(isRecord(caller)).toBe(true)
    if (!isRecord(caller)) throw new Error('Expected logCaller meta')

    expect(caller['stack']).toEqual(expect.stringContaining('logger-diagnostics.test.ts'))
    expect(String(caller['stack'])).not.toContain('packages/spark-utils/src/logger')

    const consoleArgs = errorSpy.mock.calls[0] ?? []
    expect(consoleArgs.some(arg => typeof arg === 'string' && arg.includes('logger-diagnostics.test.ts'))).toBe(true)
  })
})
