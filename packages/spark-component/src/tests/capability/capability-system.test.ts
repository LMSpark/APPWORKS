import type { SparkNode } from '@spark-appworks/spark-data'
/**
 * 能力系统集成测试
 *
 * 验证 SPARK 能力系统的核心功能：
 * - Symbol-based CapabilityKey 的 sparkProvide/sparkConsume 流程
 * - 能力符号与契约的配对使用
 * - useSparkComponent / useSparkPageComponent 返回值边界清晰（无 use 别名）
 * - 页面运行时服务契约验证
 */

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { defineCapability, sparkProvide, sparkConsume, isRecord } from '@spark-appworks/spark-utils'
import { PAGE_RUNTIME_SERVICES } from '../../runtime'
import {
  Spark,
  useSparkComponent,
  useSparkConsume,
  useSparkPageComponent,
  PAGE_SERVICE,
  PAGE_COMPONENT_REGISTRY,
} from '@spark-appworks/spark-component'
import type { SparkEventEmitter } from '@spark-appworks/spark-data'
import { createPageComponentRegistry } from '../../page/context/page-component-registry'

function isStringCapability(value: unknown): value is string {
  return typeof value === 'string'
}

function hasCallable(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'function'
}

function sparkNode(type: string, id?: string): SparkNode {
  return id === undefined ? { type } : { type, id }
}

describe('Capability system integration', () => {
  /**
   * 创建测试用 Vue 应用插件
   */
  function createTestPlugin() {
    const registry = Spark.createRegistry()
    return { plugin: Spark.createPlugin({ registry }), registry }
  }

  describe('useSparkComponent return contract', () => {
    it('does NOT return use alias', () => {
      const { plugin } = createTestPlugin()

      const TestComp = defineComponent({
        setup() {
          const result = useSparkComponent(sparkNode('test-comp'))
          // 验证返回值包含 sparkConsume 但不包含 use
          expect(typeof result.sparkConsume).toBe('function')
          expect('use' in result).toBe(false)
          return () => h('div')
        }
      })

      mount(TestComp, {
        global: { plugins: [plugin] }
      })
    })

    it('returns only the shared component API methods', () => {
      const { plugin } = createTestPlugin()

      const TestComp = defineComponent({
        setup() {
          const result = useSparkComponent(sparkNode('test-comp'))

          // 核心状态
          expect(result.provider).toBeDefined()
          expect(result.isVisible).toBeDefined()
          expect(result.isDisabled).toBeDefined()

          // 能力提供 / 消费
          expect(typeof result.sparkProvide).toBe('function')
          expect(typeof result.sparkConsume).toBe('function')

          // 工具
          expect(typeof result.logger).toBe('object')
          expect('registerApi' in result).toBe(false)

          return () => h('div')
        }
      })

      mount(TestComp, {
        global: { plugins: [plugin] }
      })
    })

    it('exposes page-only API registration through useSparkPageComponent', () => {
      const { plugin } = createTestPlugin()

      const TestComp = defineComponent({
        setup() {
          const result = useSparkPageComponent(sparkNode('test-comp'))

          expect(typeof result.sparkProvide).toBe('function')
          expect(typeof result.sparkConsume).toBe('function')
          expect(typeof result.registerApi).toBe('function')

          return () => h('div')
        }
      })

      mount(TestComp, {
        global: { plugins: [plugin] }
      })
    })

    it('child can consume capabilities provided by parent via sparkConsume', () => {
      const { plugin } = createTestPlugin()
      const TEST_CAP = defineCapability<string>('test:parent-marker', isStringCapability)

      const ChildComp = defineComponent({
        setup() {
          const { sparkConsume } = useSparkConsume()
          // 验证能力链正确贯通：子可以消费到祖先提供的能力
          expect(sparkConsume(TEST_CAP)).toBe('parent-comp')
          return () => h('span')
        }
      })

      const ParentComp = defineComponent({
        setup() {
          const { sparkProvide } = useSparkComponent(sparkNode('parent-comp'))
          sparkProvide(TEST_CAP, 'parent-comp')
          return () => h(ChildComp)
        }
      })

      mount(ParentComp, {
        global: { plugins: [plugin] }
      })
    })

    it('child can consume parent-provided capabilities via useSparkComponent', () => {
      const { plugin } = createTestPlugin()
      const TEST_CAP = defineCapability<string>('test:parent-marker-2', isStringCapability)

      const ChildComp = defineComponent({
        setup() {
          const { sparkConsume } = useSparkComponent(sparkNode('child-comp'))
          // 验证能力链正确贯通：子可以消费到祖先提供的能力
          expect(sparkConsume(TEST_CAP)).toBe('parent-comp')
          return () => h('span')
        }
      })

      const ParentComp = defineComponent({
        setup() {
          const { sparkProvide } = useSparkComponent(sparkNode('parent-comp'))
          sparkProvide(TEST_CAP, 'parent-comp')
          return () => h(ChildComp)
        }
      })

      mount(ParentComp, {
        global: { plugins: [plugin] }
      })
    })

    it('reads runtime vnode inputs while component id comes from SparkNode config', () => {
      const { plugin } = createTestPlugin()
      const registry = createPageComponentRegistry()

      const TestComp = defineComponent({
        props: {
          id: String,
          visible: Boolean,
          disabled: Boolean,
          field: String,
        },
        setup() {
          const result = useSparkComponent(sparkNode('test-comp', 'orders-table'))
          const pageRegistry = result.sparkConsume(PAGE_COMPONENT_REGISTRY)

          expect(result.isVisible.value).toBe(false)
          expect(result.isDisabled.value).toBe(true)

          const instance = pageRegistry?.getInstance('orders-table')
          expect(instance?.id).toBe('orders-table')
          expect(instance?.type).toBe('test-comp')
          expect(instance?.props?.['field']).toBe('orderNo')
          expect(instance?.props?.['visible']).toBe(false)
          expect(instance?.props?.['disabled']).toBe(true)

          return () => h('div', { class: 'runtime-input-comp' }, 'ok')
        }
      })

      const RootComp = defineComponent({
        setup() {
          const result = useSparkComponent(sparkNode('root-comp'))
          result.sparkProvide(PAGE_COMPONENT_REGISTRY, registry)
          return () => h(TestComp, {
            visible: false,
            disabled: true,
            field: 'orderNo',
          })
        }
      })

      mount(RootComp, {
        global: { plugins: [plugin] }
      })
    })
  })

  describe('Symbol-based sparkProvide/sparkConsume', () => {
    it('provides and consumes with CapabilityKey via createSystem', () => {
      const { createContext, rootContext } = Spark.createSystem()

      const parentCtx = createContext({ type: 'provider', id: 'p-1' }, rootContext)
      const childCtx = createContext({ type: 'consumer', id: 'c-1' }, parentCtx)

      // 使用纯函数 sparkProvide 注册能力
      sparkProvide(parentCtx, PAGE_RUNTIME_SERVICES, {
        router: { push: async () => {}, replace: async () => {}, back: () => {}, currentRoute: {} },
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
      })

      // consumer 通过 parent chain 找到 capability
      const found = sparkConsume(childCtx, PAGE_RUNTIME_SERVICES)
      expect(found).toBeTruthy()
      expect(found?.router).toBeDefined()
      expect(found?.logger).toBeDefined()
    })

    it('custom capability key with defineCapability', () => {
      const { createContext, rootContext } = Spark.createSystem()
      type CustomCapability = { getValue(): string}
      const CUSTOM = defineCapability<CustomCapability>(
        'test:custom-cap-sys',
        (value): value is CustomCapability => isRecord(value) && hasCallable(value, 'getValue'),
      )

      const parentCtx = createContext({ type: 'provider', id: 'p-2' }, rootContext)
      const childCtx = createContext({ type: 'consumer', id: 'c-2' }, parentCtx)

      sparkProvide(parentCtx, CUSTOM, { getValue: () => 'hello from custom' })

      const found = sparkConsume<CustomCapability>(childCtx, CUSTOM)
      expect(found).toBeTruthy()
      expect(found!.getValue()).toBe('hello from custom')
    })
  })

  describe('EventsCapability usage', () => {
    it('provides events and consumer can subscribe via createSystem', () => {
      const { createContext, rootContext } = Spark.createSystem()

      const gridCtx = createContext({ type: 'grid', id: 'grid-1' }, rootContext)
      const rowCtx = createContext({ type: 'row', id: 'row-1' }, gridCtx)

      // Provider 注册事件能力（使用自定义能力键）
      const TEST_EVENTS = defineCapability<SparkEventEmitter>(
        'test:grid-events',
        (value): value is SparkEventEmitter => isRecord(value)
          && hasCallable(value, 'on')
          && hasCallable(value, 'off')
          && hasCallable(value, 'emit')
          && hasCallable(value, 'removeAllListeners')
          && hasCallable(value, 'listenerCount'),
      )
      const handler = vi.fn()
      const eventBus: Record<string, Array<(...args: unknown[]) => void>> = {}

      const eventImpl: SparkEventEmitter = {
        on(event: string, fn: (...args: unknown[]) => void) {
          if (!eventBus[event]) eventBus[event] = []
          eventBus[event].push(fn)
        },
        off(event: string, fn: (...args: unknown[]) => void) {
          eventBus[event] = (eventBus[event] || []).filter(f => f !== fn)
        },
        emit(event: string, ...args: unknown[]) {
          (eventBus[event] || []).forEach(fn => fn(...args))
        },
        removeAllListeners(event?: string) {
          if (event) { delete eventBus[event] } else { Object.keys(eventBus).forEach(k => delete eventBus[k]) }
        },
        listenerCount(event?: string) {
          if (event) return (eventBus[event] || []).length
          return Object.values(eventBus).reduce((sum, arr) => sum + arr.length, 0)
        }
      }

      sparkProvide(gridCtx, TEST_EVENTS, eventImpl)

      // Consumer 通过 parent chain 找到事件能力
      const found = sparkConsume<SparkEventEmitter>(rowCtx, TEST_EVENTS)
      expect(found).toBeTruthy()

      found!.on('rowClick', handler)
      found!.emit('rowClick', { id: 1 })

      expect(handler).toHaveBeenCalledWith({ id: 1 })
    })
  })

  describe('All capability symbols are defined', () => {
    it('core symbols exist and are unique', () => {
      const symbols = [
        PAGE_RUNTIME_SERVICES,
        PAGE_SERVICE,
      ]

      // 全部有稳定 token
      symbols.forEach(s => expect(typeof s.token).toBe('symbol'))

      // 全部唯一
      const uniqueSet = new Set(symbols)
      expect(uniqueSet.size).toBe(symbols.length)
    })
  })
})

