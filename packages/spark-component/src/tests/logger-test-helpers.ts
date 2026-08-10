import { PAGE_RUNTIME_SERVICES, type PageRuntimeServicesCapability } from '../runtime'
import type { CapabilityContext } from '@spark-appworks/spark-utils'
import type { LoggerApi } from '@spark-appworks/spark-utils'

type LoggerRouter = NonNullable<PageRuntimeServicesCapability['router']>

export type LoggerTestRuntimeServices = Omit<PageRuntimeServicesCapability, 'logger' | 'router'> & {
  logger: LoggerApi
    router: LoggerRouter}

export function createPageRuntimeServices(logger: LoggerApi): LoggerTestRuntimeServices {
  return {
    router: {
      push: async () => undefined,
      replace: async () => undefined,
      back: () => undefined,
      currentRoute: undefined,
    },
    logger,
  }
}

function hasLoggerAndRouter(value: PageRuntimeServicesCapability | null): value is LoggerTestRuntimeServices {
  return value !== null && value.logger !== undefined && value.router !== undefined
}

export function readPageRuntimeServices(ctx: CapabilityContext): LoggerTestRuntimeServices {
  const value = PAGE_RUNTIME_SERVICES.read(ctx.capabilities.get(PAGE_RUNTIME_SERVICES))
  if (hasLoggerAndRouter(value)) return value
  throw new TypeError('PAGE_RUNTIME_SERVICES payload missing logger/router')
}

