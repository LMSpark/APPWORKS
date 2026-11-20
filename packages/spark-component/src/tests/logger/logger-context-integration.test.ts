/**
 * 页面层 Logger 集成测试
 *
 * 验证 useSparkComponent 返回的 logger 只依赖页面运行时 logger：
 * 1. 页面层未提供 logger 时 fail-fast 抛错
 * 2. 页面根提供 PAGE_RUNTIME_SERVICES.logger 后组件使用该 logger
 * 3. 子组件继承页面层 logger，不再依赖局部 LOGGER 覆盖
 */

import { describe, it, expect } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { PAGE_RUNTIME_SERVICES, type PageRuntimeServicesCapability } from '../../runtime'
import { Spark, useSparkComponent } from '@spark-appworks/spark-component'
import type { LoggerApi } from '@spark-appworks/spark-utils'

function createPageRuntimeServices(logger: LoggerApi): PageRuntimeServicesCapability {
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

describe('Logger Context Integration', () => {
  it('页面层未提供 logger 时 fail-fast 抛错', () => {
    const TestComponent = defineComponent({
      setup() {
        const { logger } = useSparkComponent({ type: 'test-comp' })
        logger.info('test message')

        return () => h('div', {}, 'test')
      }
    })

    expect(() => mount(TestComponent, {
      global: { plugins: [Spark.createPlugin()] }
    })).toThrow('[spark] PAGE_RUNTIME_SERVICES.logger is required but missing. Ensure page root provides PAGE_RUNTIME_SERVICES before components log.')
  })

  it('页面根提供 PAGE_RUNTIME_SERVICES.logger 后组件使用页面 logger', async () => {
    const logs: string[] = []

    const customLogger: LoggerApi = {
      debug: (msg: string) => logs.push(`DEBUG: ${msg}`),
      info: (msg: string) => logs.push(`INFO: ${msg}`),
      warn: (msg: string) => logs.push(`WARN: ${msg}`),
      error: (msg: string) => logs.push(`ERROR: ${msg}`)
    }

    const ChildComponent = defineComponent({
      setup() {
        const { logger } = useSparkComponent({ type: 'test-comp' })
        nextTick(() => {
          logger.info('custom message')
          logger.warn('warning message')
        })
        return () => h('div', {}, 'child')
      }
    })

    const PageRoot = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'page-root' })
        sparkProvide(PAGE_RUNTIME_SERVICES, createPageRuntimeServices(customLogger))
        return () => h(ChildComponent)
      }
    })

    mount(PageRoot, {
      global: { plugins: [Spark.createPlugin()] }
    })

    await nextTick()
    await nextTick()

    expect(logs).toContain('INFO: custom message')
    expect(logs).toContain('WARN: warning message')
  })

  it('子组件继承页面层 PAGE_RUNTIME_SERVICES.logger', async () => {
    const logs: string[] = []

    const customLogger: LoggerApi = {
      debug: (msg: string) => logs.push(`CUSTOM_DEBUG: ${msg}`),
      info: (msg: string) => logs.push(`CUSTOM_INFO: ${msg}`),
      warn: (msg: string) => logs.push(`CUSTOM_WARN: ${msg}`),
      error: (msg: string) => logs.push(`CUSTOM_ERROR: ${msg}`)
    }

    const ChildComponent = defineComponent({
      name: 'ChildComponent',
      setup() {
        const { logger } = useSparkComponent({ type: 'child-comp' })

        logger.info('child message')

        return () => h('div', {}, 'child')
      }
    })

    const PageRoot = defineComponent({
      name: 'PageRoot',
      setup() {
        const { logger, sparkProvide } = useSparkComponent({ type: 'parent-comp' })
        sparkProvide(PAGE_RUNTIME_SERVICES, createPageRuntimeServices(customLogger))
        logger.info('parent message')

        return () => h('div', {}, [
          h('span', 'parent'),
          h(ChildComponent)
        ])
      }
    })

    Spark.register('child-comp', ChildComponent)

    mount(PageRoot, {
      global: { plugins: [Spark.createPlugin()] }
    })

    await nextTick()

    expect(logs).toContain('CUSTOM_INFO: parent message')
    expect(logs).toContain('CUSTOM_INFO: child message')
  })
})

