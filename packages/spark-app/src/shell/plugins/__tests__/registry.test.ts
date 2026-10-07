/**
 * 插件注册表 + 插件管理器 测试
 *
 * 覆盖：
 * - createPluginRegistry CRUD 操作
 * - getGlobalPluginRegistry 单例
 * - PluginManager.loadPlugins（排序、过滤、错误处理）
 * - PluginManager.loadPlugin（单个加载）
 * - normalizeConfig 转换
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createPluginRegistry,
  getGlobalPluginRegistry,
  PluginManager,
} from '../registry'
import type { PluginLoader, PluginRegistry } from '../registry'

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** 构造一个最小可用的 PluginLoader（不含 id，register 会补上） */
function fakeLoader(name: string, overrides?: Partial<Omit<PluginLoader, 'id'>>): Omit<PluginLoader, 'id'> {
  return {
    name,
    module: `fake-${name}`,
    loader: () => Promise.resolve({ default: { install: vi.fn() } }),
    ...overrides,
  }
}

// ─────────────────────────────────────────────
// createPluginRegistry
// ─────────────────────────────────────────────

describe('createPluginRegistry', () => {
  let registry: PluginRegistry

  beforeEach(() => {
    registry = createPluginRegistry()
  })

  it('初始为空', () => {
    expect(registry.getAll()).toHaveLength(0)
    expect(registry.getAllIds()).toEqual([])
    expect(registry.getStats()).toEqual({ total: 0, plugins: [] })
  })

  it('register + has + get 正常工作', () => {
    registry.register('a', fakeLoader('A'))
    expect(registry.has('a')).toBe(true)
    expect(registry.get('a')?.name).toBe('A')
    expect(registry.get('a')?.id).toBe('a')
  })

  it('registerAll 批量注册', () => {
    registry.registerAll({
      x: fakeLoader('X'),
      y: fakeLoader('Y'),
    })
    expect(registry.getAllIds().sort()).toEqual(['x', 'y'])
    expect(registry.getStats().total).toBe(2)
  })

  it('重复注册覆盖旧 loader（不抛错）', () => {
    registry.register('a', fakeLoader('Old'))
    registry.register('a', fakeLoader('New'))
    expect(registry.get('a')?.name).toBe('New')
    expect(registry.getStats().total).toBe(1)
  })

  it('unregister 返回操作结果', () => {
    registry.register('a', fakeLoader('A'))
    expect(registry.unregister('a')).toBe(true)
    expect(registry.unregister('a')).toBe(false) // 已经移除
    expect(registry.has('a')).toBe(false)
  })

  it('clear 清空全部', () => {
    registry.registerAll({ a: fakeLoader('A'), b: fakeLoader('B') })
    registry.clear()
    expect(registry.getAll()).toHaveLength(0)
  })

  it('get 不存在的 id 返回 undefined', () => {
    expect(registry.get('not-exist')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────
// getGlobalPluginRegistry 单例
// ─────────────────────────────────────────────

describe('getGlobalPluginRegistry', () => {
  afterEach(() => {
    // 清理全局状态
    getGlobalPluginRegistry().clear()
  })

  it('多次调用返回同一实例', () => {
    const a = getGlobalPluginRegistry()
    const b = getGlobalPluginRegistry()
    expect(a).toBe(b)
  })

})

// ─────────────────────────────────────────────
// PluginManager
// ─────────────────────────────────────────────

describe('PluginManager', () => {
  let registry: PluginRegistry

  beforeEach(() => {
    registry = createPluginRegistry()
  })

  // ── loadPlugin ──

  describe('loadPlugin', () => {
    it('正常加载已注册插件', async () => {
      const install = vi.fn()
      registry.register('p', fakeLoader('P', {
        loader: () => Promise.resolve({ default: { install } }),
        defaultOptions: { size: 'small' },
      }))

      const instance = await PluginManager.loadPlugin('p', true, registry)

      expect(instance).not.toBeNull()
      expect(instance?.plugin.install).toBe(install)
      expect(instance?.options).toEqual({ size: 'small' })
      expect(instance?.loader.id).toBe('p')
    })

    it('用户选项覆盖 defaultOptions', async () => {
      registry.register('p', fakeLoader('P', {
        defaultOptions: { size: 'small', theme: 'light' },
      }))

      const instance = await PluginManager.loadPlugin(
        'p',
        { enabled: true, options: { size: 'large' } },
        registry,
      )

      expect(instance?.options).toEqual({ size: 'large', theme: 'light' })
    })

    it('disabled → 返回 null', async () => {
      registry.register('p', fakeLoader('P'))
      expect(await PluginManager.loadPlugin('p', false, registry)).toBeNull()
      expect(await PluginManager.loadPlugin('p', { enabled: false }, registry)).toBeNull()
    })

    it('未注册的 id → 返回 null', async () => {
      expect(await PluginManager.loadPlugin('no-such', true, registry)).toBeNull()
    })

    it('loader 抛错 → 返回 null（不影响调用者）', async () => {
      // 预期的错误处理路径：静默 console.error 避免测试输出噪声
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      registry.register('bad', {
        name: 'Bad',
        module: 'bad',
        loader: () => Promise.reject(new Error('boom')),
      })

      const result = await PluginManager.loadPlugin('bad', true, registry)
      expect(result).toBeNull()

      errorSpy.mockRestore()
    })
  })

  // ── loadPlugins ──

  describe('loadPlugins', () => {
    it('按 priority 升序加载', async () => {
      const order: string[] = []

      registry.register('low', fakeLoader('Low', {
        loader: async () => { order.push('low'); return { default: { install: vi.fn() } } },
      }))
      registry.register('high', fakeLoader('High', {
        loader: async () => { order.push('high'); return { default: { install: vi.fn() } } },
      }))

      await PluginManager.loadPlugins(
        {
          low: { enabled: true, priority: 200 },
          high: { enabled: true, priority: 10 },
        },
        registry,
      )

      expect(order).toEqual(['high', 'low'])
    })

    it('disabled 的插件被过滤', async () => {
      registry.register('a', fakeLoader('A'))
      registry.register('b', fakeLoader('B'))

      const result = await PluginManager.loadPlugins(
        { a: true, b: false },
        registry,
      )

      expect(result).toHaveLength(1)
      expect(result[0]?.loader.id).toBe('a')
    })

    it('未注册的插件被跳过', async () => {
      registry.register('a', fakeLoader('A'))

      const result = await PluginManager.loadPlugins(
        { a: true, ghost: true },
        registry,
      )

      expect(result).toHaveLength(1)
    })

    it('单个插件加载失败不影响其余', async () => {
      // 预期的错误处理路径：静默 console.error 避免测试输出噪声
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      registry.register('ok', fakeLoader('OK'))
      registry.register('bad', {
        name: 'Bad',
        module: 'bad',
        loader: () => Promise.reject(new Error('fail')),
      })

      const result = await PluginManager.loadPlugins(
        { ok: true, bad: true },
        registry,
      )

      expect(result).toHaveLength(1)
      expect(result[0]?.loader.id).toBe('ok')

      errorSpy.mockRestore()
    })

    it('空配置 → 返回空数组', async () => {
      const result = await PluginManager.loadPlugins({}, registry)
      expect(result).toEqual([])
    })

    it('布尔值 true 标准化为 { enabled: true }', async () => {
      registry.register('a', fakeLoader('A'))
      const result = await PluginManager.loadPlugins({ a: true }, registry)
      expect(result).toHaveLength(1)
    })
  })
})
