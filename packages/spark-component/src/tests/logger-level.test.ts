import { describe, it, expect } from 'vitest'
import { PAGE_RUNTIME_SERVICES } from '../runtime'
import type { CapabilityContext } from '@spark-appworks/spark-utils'
import type { LoggerApi } from '@spark-appworks/spark-utils'
import { createPageRuntimeServices, readPageRuntimeServices } from './logger-test-helpers'

describe('page logger methods', () => {
  it('warn and error stay available through PAGE_RUNTIME_SERVICES.logger', () => {
    let calledWarn = false
    let calledError = false

    const loggerImpl: LoggerApi = {
      debug: (..._args: unknown[]) => {},
      info: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => { calledWarn = true },
      error: (..._args: unknown[]) => { calledError = true }
    }

    const ctx: CapabilityContext = {
      id: 'ctx-level',
      type: 'test',
      capabilities: new Map([[PAGE_RUNTIME_SERVICES, createPageRuntimeServices(loggerImpl)]])
    }

    const pageRuntimeServices = readPageRuntimeServices(ctx)
    pageRuntimeServices.logger.warn('should call warn')
    pageRuntimeServices.logger.error('should call error')

    expect(calledWarn).toBe(true)
    expect(calledError).toBe(true)
  })
})

