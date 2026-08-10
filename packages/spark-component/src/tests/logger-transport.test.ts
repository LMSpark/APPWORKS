import { describe, it, expect } from 'vitest'
import { PAGE_RUNTIME_SERVICES } from '../runtime'
import type { CapabilityContext } from '@spark-appworks/spark-utils'
import type { LoggerApi } from '@spark-appworks/spark-utils'
import { createPageRuntimeServices, readPageRuntimeServices } from './logger-test-helpers'

describe('page logger transport payload', () => {
  it('passes structured payload through PAGE_RUNTIME_SERVICES.logger', () => {
    let written = ''
    const loggerImpl: LoggerApi = {
      info: (..._args: unknown[]) => { written += JSON.stringify(_args) },
      debug: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {}
    }

    const ctx: CapabilityContext = {
      id: 'ctx-transport',
      type: 'test',
      capabilities: new Map([[PAGE_RUNTIME_SERVICES, createPageRuntimeServices(loggerImpl)]])
    }

    const pageRuntimeServices = readPageRuntimeServices(ctx)
    pageRuntimeServices.logger.info('hello', { a: 1 })

    expect(written).toContain('hello')
  })
})

