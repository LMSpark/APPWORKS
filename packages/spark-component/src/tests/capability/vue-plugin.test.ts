 
import { describe, it, expect } from 'vitest'
import { Spark, SPARK_REGISTRY_KEY } from '@spark-appworks/spark-component'
import { createApp } from 'vue'

describe('Vue plugin integration', () => {
  it('Spark.createPlugin with default options uses global singleton', () => {
    const app = createApp({})
    const plugin = Spark.createPlugin()
    plugin.install!(app)
    
    // Should provide registry
    expect(Reflect.get(app._context.provides, SPARK_REGISTRY_KEY)).toBeDefined()
  })

  it('Spark.createPlugin with custom registry uses provided registry', () => {
    const registry = Spark.createRegistry()
    const plugin = Spark.createPlugin({ registry })
    const app = createApp({})
    plugin.install!(app)
    
    // Should provide the custom registry
    expect(Reflect.get(app._context.provides, SPARK_REGISTRY_KEY)).toBe(registry)
  })

  it('Spark.register rejects removed path-string registration', () => {
    expect(() => Spark.register('legacy-path', './Legacy.vue')).toThrow(/Path-string registration has been removed/)
    expect(() => Spark.registerAll({ 'legacy-path': './Legacy.vue' })).toThrow(/Path-string registration has been removed/)
  })

  it('registry rejects removed function registration', () => {
    const registry = Spark.createRegistry()
    expect(() => registry.register({
      type: 'legacy-loader',
      component: () => Promise.resolve({ default: {} }),
    })).toThrow(/Function registration has been removed/)
    expect(() => Spark.register('legacy-loader', () => null)).toThrow(/Function registration has been removed/)
  })

  it('Spark.normalizeNode rejects removed fallback type normalization', () => {
    expect(() => Spark.normalizeNode({ type: '' })).toThrow(/type must be a non-empty string/)
  })
})
