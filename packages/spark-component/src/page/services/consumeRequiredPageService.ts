import {PAGE_SERVICE} from '../../core/capability-keys.js'
import type {PageServiceCapability} from '../../runtime/app-services.js'
import type {CapabilityKey} from '@spark-appworks/spark-utils'

type SparkCapabilityConsumer = {
  <T>(name: CapabilityKey<T>): T | null
}

/** 消费宿主注入的 PAGE_SERVICE；系统页与业务页在运行时必须由 App 宿主提供。 */
export function consumeRequiredPageService(
  sparkConsume: SparkCapabilityConsumer,
  origin: string,
): PageServiceCapability {
  const pageService = sparkConsume(PAGE_SERVICE)
  if (!pageService) throw new Error(`PAGE_SERVICE_MISSING: ${origin}`)
  return pageService
}