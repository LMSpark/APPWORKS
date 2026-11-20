/**
 * FileLoader 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createFileLoader, FileLoader } from '@spark-appworks/spark-utils'
import type { AxiosRequestConfig } from 'axios'

type FakeStorageRecord = {
  value: string}

function parseNumberArray(raw: string): number[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'number')) {
    throw new Error('Expected JSON number array')
  }
  return parsed
}

// Mock axios.create
const mockAxiosRequest = vi.hoisted(() =>
  vi.fn<(config: AxiosRequestConfig) => Promise<unknown>>()
)

vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => ({ request: mockAxiosRequest })),
      isAxiosError: (value: unknown): boolean =>
        value instanceof Error && Object.prototype.hasOwnProperty.call(value, 'isAxiosError'),
    },
  }
})

describe('FileLoader', () => {
  let loader: FileLoader

  beforeEach(() => {
    mockAxiosRequest.mockReset()
    // 清理所有缓存
    localStorage.clear()
    sessionStorage.clear()

    // 创建测试加载器
    loader = createFileLoader({
      baseUrl: '/api/config',
      storage: 'memory',  // 使用内存存储，避免污染 localStorage
      timeout: 5000
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('基本加载功能', () => {
    it('应该能够加载文件（首次加载）', async () => {
      // 设置mock响应
      mockAxiosRequest.mockResolvedValue({
        data: {
          content: '{"test": "data"}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'test.json', method: 'GET' }
      })

      const result = await loader.load('test.json')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ test: 'data' })
      expect(result.timestamp).toBe('2024-02-11T10:00:00Z')
      expect(result.fromCache).toBe(false)

      // 验证request被调用
      expect(mockAxiosRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'test.json',
          method: 'GET',
        })
      )
    })

    it('应该能够加载 V4 信封包装的文件响应', async () => {
      mockAxiosRequest.mockResolvedValue({
        data: {
          protocolVersion: 4,
          ok: true,
          data: {
            content: '{"test":"v4"}',
            timestamp: '2026-05-24T02:00:00Z',
          },
          error: null,
          context: { requestId: 'request-1' },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'v4.json', method: 'GET' },
      })

      const result = await loader.load('v4.json')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ test: 'v4' })
      expect(result.timestamp).toBe('2026-05-24T02:00:00Z')
      expect(result.fromCache).toBe(false)
    })

    it('应该解析 JSON 文件', async () => {
      mockAxiosRequest.mockResolvedValue({
        data: {
          content: '{"name": "test", "value": 123}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      const result = await loader.load('test.json', { parseJSON: true })

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ name: 'test', value: 123 })
    })

    it('应该加载文本文件（不解析 JSON）', async () => {
      mockAxiosRequest.mockResolvedValue({
        data: {
          content: 'function test() { return 42; }',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      const result = await loader.load('script.js', { parseJSON: false })

      expect(result.success).toBe(true)
      expect(result.data).toBe('function test() { return 42; }')
    })
  })

  describe('缓存机制', () => {
    it('应该缓存加载的文件', async () => {
      mockAxiosRequest.mockResolvedValue({
        data: {
          content: '{"cached": true}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      // 首次加载
      await loader.load('cache-test.json')

      // 检查缓存
      expect(loader.hasCache('cache-test.json')).toBe(true)
      expect(loader.getTimestamp('cache-test.json')).toBe('2024-02-11T10:00:00Z')
    })

    it('应该在文件未修改时使用缓存（notModified 标志）', async () => {
      // 首次加载
      mockAxiosRequest.mockResolvedValueOnce({
        data: {
          content: '{"version": 1}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      await loader.load('version.json')

      // 再次加载，服务器返回 notModified=true
      mockAxiosRequest.mockResolvedValueOnce({
        data: {
          notModified: true
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      const result = await loader.load('version.json')

      expect(result.success).toBe(true)
      expect(result.fromCache).toBe(true)
      expect(result.notModified).toBe(true)
      expect(result.timestamp).toBe('2024-02-11T10:00:00Z')
      expect(mockAxiosRequest).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          params: { timestamp: '2024-02-11T10:00:00Z' },
        }),
      )
    })

    it('应该把后端 timestamp 原样作为下一次请求参数', async () => {
      const sourceTimestamp = '1711111111123'

      mockAxiosRequest.mockResolvedValueOnce({
        data: {
          content: 'plain-content',
          timestamp: sourceTimestamp,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      })

      await loader.load('mtime.txt', { parseJSON: false })

      mockAxiosRequest.mockResolvedValueOnce({
        data: {
          notModified: true,
          timestamp: sourceTimestamp,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      })

      const result = await loader.load('mtime.txt', { parseJSON: false })

      expect(result.success).toBe(true)
      expect(result.data).toBe('plain-content')
      expect(result.fromCache).toBe(true)
      expect(result.notModified).toBe(true)
      expect(result.timestamp).toBe(sourceTimestamp)
      expect(mockAxiosRequest).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          params: { timestamp: sourceTimestamp },
        }),
      )
    })

    it('应该在强制刷新时忽略缓存', async () => {
      // 首次加载
      mockAxiosRequest.mockResolvedValueOnce({
        data: {
          content: '{"version": 1}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      await loader.load('refresh.json')

      // 强制刷新
      mockAxiosRequest.mockResolvedValueOnce({
        data: {
          content: '{"version": 2}',
          timestamp: '2024-02-11T11:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      const result = await loader.load('refresh.json', { forceRefresh: true })

      expect(result.success).toBe(true)
      expect(result.fromCache).toBe(false)
      expect(result.data).toEqual({ version: 2 })
      expect(result.timestamp).toBe('2024-02-11T11:00:00Z')
    })
  })

  describe('自动降级', () => {
    it('应该在网络失败时自动降级到缓存', async () => {
      // 首次加载成功
      mockAxiosRequest.mockResolvedValueOnce({
        data: {
          content: '{"data": "cached"}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      await loader.load('fallback.json')

      // 网络失败
      mockAxiosRequest.mockRejectedValueOnce(new Error('Network error'))

      const result = await loader.load('fallback.json')

      expect(result.success).toBe(true)
      expect(result.fromCache).toBe(true)
      expect(result.data).toEqual({ data: 'cached' })
      expect(result.error).toContain('Network error')
    })

    it('应该在无缓存时返回失败', async () => {
      mockAxiosRequest.mockRejectedValue(new Error('Network error'))

      const result = await loader.load('no-cache.json')

      expect(result.success).toBe(false)
      expect(result.fromCache).toBe(false)
      expect(result.error).toContain('Network error')
    })

    it('应该支持禁用自动降级', async () => {
      const strictLoader = createFileLoader({
        baseUrl: '/api/config',
        storage: 'memory',
        fallbackToCache: false
      })

      // 首次加载成功
      mockAxiosRequest.mockResolvedValueOnce({
        data: {
          content: '{"data": "test"}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      await strictLoader.load('strict.json')

      // 网络失败，不使用缓存
      mockAxiosRequest.mockRejectedValueOnce(new Error('Network error'))

      const result = await strictLoader.load('strict.json')

      expect(result.success).toBe(false)
      expect(result.fromCache).toBe(false)
    })
  })

  describe('批量加载', () => {
    it('应该并行加载多个文件', async () => {
      mockAxiosRequest
        .mockResolvedValueOnce({
          data: {
            content: '{"file": "1"}',
            timestamp: '2024-02-11T10:00:00Z'
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        })
        .mockResolvedValueOnce({
          data: {
            content: '{"file": "2"}',
            timestamp: '2024-02-11T10:00:00Z'
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        })
        .mockResolvedValueOnce({
          data: {
            content: '{"file": "3"}',
            timestamp: '2024-02-11T10:00:00Z'
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        })

      const results = await loader.loadBatch([
        'file1.json',
        'file2.json',
        'file3.json'
      ])

      expect(results.size).toBe(3)
      expect(results.get('file1.json')?.success).toBe(true)
      expect(results.get('file2.json')?.success).toBe(true)
      expect(results.get('file3.json')?.success).toBe(true)
    })
  })

  describe('缓存管理', () => {
    it('应该清除特定文件缓存', async () => {
      mockAxiosRequest.mockResolvedValue({
        data: {
          content: '{"test": "data"}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      await loader.load('clear-test.json')
      expect(loader.hasCache('clear-test.json')).toBe(true)

      loader.clearCache('clear-test.json')
      expect(loader.hasCache('clear-test.json')).toBe(false)
    })

    it('应该清除所有缓存', async () => {
      mockAxiosRequest.mockResolvedValue({
        data: {
          content: '{"test": "data"}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      await loader.load('file1.json')
      await loader.load('file2.json')

      loader.clearCache()
      expect(loader.hasCache('file1.json')).toBe(false)
      expect(loader.hasCache('file2.json')).toBe(false)
    })

    it('应该返回缓存统计信息', async () => {
      mockAxiosRequest.mockResolvedValue({
        data: {
          content: '{"test": "data"}',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      await loader.load('stats1.json')
      await loader.load('stats2.json')

      // 验证缓存存在
      expect(loader.hasCache('stats1.json')).toBe(true)
      expect(loader.hasCache('stats2.json')).toBe(true)
      expect(loader.getTimestamp('stats1.json')).toBe('2024-02-11T10:00:00Z')
      expect(loader.getTimestamp('stats2.json')).toBe('2024-02-11T10:00:00Z')
    })

    it('localStorage 缓存项格式无效时应删除，避免重复缓存 miss', () => {
      class FakeStorage implements Storage {
        private readonly map = new Map<string, FakeStorageRecord>()

        get length(): number {
          return this.map.size
        }

        clear(): void {
          this.map.clear()
        }

        getItem(key: string): string | null {
          return this.map.get(key)?.value ?? null
        }

        key(index: number): string | null {
          return Array.from(this.map.keys())[index] ?? null
        }

        removeItem(key: string): void {
          this.map.delete(key)
        }

        setItem(key: string, value: string): void {
          this.map.set(key, { value })
        }
      }

      const cacheKey = 'spark_page_bad.json'
      const fakeStorage = new FakeStorage()
      const now = Date.now()
      fakeStorage.setItem(cacheKey, JSON.stringify({
        data: 'bad-content',
        timestamp: 'old-field-name',
        cachedAt: now,
        lastAccess: now,
        expirationLevel: 3,
      }))

      vi.stubGlobal('localStorage', fakeStorage)
      const localLoader = createFileLoader({
        baseUrl: '/api/config',
        storage: 'localStorage',
        cachePrefix: 'spark_page_',
      })

      expect(localLoader.hasCache('bad.json')).toBe(false)
      expect(fakeStorage.getItem(cacheKey)).toBeNull()
    })

    it('localStorage 超过字节预算时应先按 LRU 清理', () => {
      class FakeStorage implements Storage {
        private readonly map = new Map<string, FakeStorageRecord>()

        get length(): number {
          return this.map.size
        }

        clear(): void {
          this.map.clear()
        }

        getItem(key: string): string | null {
          return this.map.get(key)?.value ?? null
        }

        key(index: number): string | null {
          return Array.from(this.map.keys())[index] ?? null
        }

        removeItem(key: string): void {
          this.map.delete(key)
        }

        setItem(key: string, value: string): void {
          this.map.set(key, { value })
        }
      }

      const fakeStorage = new FakeStorage()
      const now = Date.now()
      fakeStorage.setItem('spark_page_old-a.json', JSON.stringify({
        data: 'a'.repeat(120),
        sourceTimestamp: 'ts-old-a',
        cachedAt: now - 2000,
        lastAccess: now - 2000,
        expirationLevel: 3,
      }))
      fakeStorage.setItem('spark_page_old-b.json', JSON.stringify({
        data: 'b'.repeat(120),
        sourceTimestamp: 'ts-old-b',
        cachedAt: now - 1000,
        lastAccess: now - 1000,
        expirationLevel: 3,
      }))

      vi.stubGlobal('localStorage', fakeStorage)
      const localLoader = createFileLoader({
        baseUrl: '/api/config',
        storage: 'localStorage',
        cachePrefix: 'spark_page_',
        maxStorageBytes: 700,
      })

      localLoader.store({ key: 'new.json', data: 'n'.repeat(120), sourceTimestamp: 'ts-new' })

      expect(fakeStorage.getItem('spark_page_new.json')).not.toBeNull()
      expect(fakeStorage.getItem('spark_page_old-a.json')).toBeNull()
    })

    it('localStorage 单个缓存项超过预算时应跳过持久化', () => {
      class FakeStorage implements Storage {
        private readonly map = new Map<string, FakeStorageRecord>()

        get length(): number {
          return this.map.size
        }

        clear(): void {
          this.map.clear()
        }

        getItem(key: string): string | null {
          return this.map.get(key)?.value ?? null
        }

        key(index: number): string | null {
          return Array.from(this.map.keys())[index] ?? null
        }

        removeItem(key: string): void {
          this.map.delete(key)
        }

        setItem(key: string, value: string): void {
          this.map.set(key, { value })
        }
      }

      const fakeStorage = new FakeStorage()
      vi.stubGlobal('localStorage', fakeStorage)
      const localLoader = createFileLoader({
        baseUrl: '/api/config',
        storage: 'localStorage',
        cachePrefix: 'spark_page_',
        maxEntryStorageBytes: 300,
      })

      localLoader.store({ key: 'huge.json', data: 'x'.repeat(500), sourceTimestamp: 'ts-huge' })

      expect(fakeStorage.getItem('spark_page_huge.json')).toBeNull()
    })

    it('localStorage 总量超过预算时只驱逐 spark_page 缓存', () => {
      class FakeStorage implements Storage {
        private readonly map = new Map<string, FakeStorageRecord>()

        get length(): number {
          return this.map.size
        }

        clear(): void {
          this.map.clear()
        }

        getItem(key: string): string | null {
          return this.map.get(key)?.value ?? null
        }

        key(index: number): string | null {
          return Array.from(this.map.keys())[index] ?? null
        }

        removeItem(key: string): void {
          this.map.delete(key)
        }

        setItem(key: string, value: string): void {
          this.map.set(key, { value })
        }
      }

      const fakeStorage = new FakeStorage()
      const now = Date.now()
      fakeStorage.setItem('other_app_state', 'x'.repeat(500))
      fakeStorage.setItem('spark_page_old-a.json', JSON.stringify({
        data: 'a'.repeat(120),
        sourceTimestamp: 'ts-old-a',
        cachedAt: now - 2000,
        lastAccess: now - 2000,
        expirationLevel: 3,
      }))
      fakeStorage.setItem('spark_page_old-b.json', JSON.stringify({
        data: 'b'.repeat(120),
        sourceTimestamp: 'ts-old-b',
        cachedAt: now - 1000,
        lastAccess: now - 1000,
        expirationLevel: 3,
      }))

      vi.stubGlobal('localStorage', fakeStorage)
      const localLoader = createFileLoader({
        baseUrl: '/api/config',
        storage: 'localStorage',
        cachePrefix: 'spark_page_',
        maxStorageTotalBytes: 900,
      })

      localLoader.store({ key: 'new.json', data: 'n'.repeat(120), sourceTimestamp: 'ts-new' })

      expect(fakeStorage.getItem('other_app_state')).not.toBeNull()
      expect(fakeStorage.getItem('spark_page_new.json')).not.toBeNull()
      expect(fakeStorage.getItem('spark_page_old-a.json')).toBeNull()
    })

    it('localStorage 配额不足时应按 lastAccess 驱逐，不按 sourceTimestamp 驱逐', () => {
      class FakeStorage implements Storage {
        private readonly map = new Map<string, FakeStorageRecord>()
        private readonly quotaTargetKey: string

        constructor(quotaTargetKey: string) {
          this.quotaTargetKey = quotaTargetKey
        }

        get length(): number {
          return this.map.size
        }

        clear(): void {
          this.map.clear()
        }

        getItem(key: string): string | null {
          return this.map.get(key)?.value ?? null
        }

        key(index: number): string | null {
          return Array.from(this.map.keys())[index] ?? null
        }

        removeItem(key: string): void {
          this.map.delete(key)
        }

        setItem(key: string, value: string): void {
          if (key === this.quotaTargetKey && this.map.size >= 2) {
            throw new DOMException('Quota exceeded', 'QuotaExceededError')
          }
          this.map.set(key, { value })
        }
      }

      const quotaTarget = 'spark_page_new.json'
      const fakeStorage = new FakeStorage(quotaTarget)
      const now = Date.now()

      fakeStorage.setItem('spark_page_old-a.json', JSON.stringify({
        data: 'a'.repeat(160_000),
        sourceTimestamp: '9999',
        cachedAt: now - 1000,
        lastAccess: now - 1000,
        expirationLevel: 3,
      }))
      fakeStorage.setItem('spark_page_old-b.json', JSON.stringify({
        data: 'b',
        sourceTimestamp: '1000',
        cachedAt: now - 500,
        lastAccess: now - 500,
        expirationLevel: 3,
      }))

      vi.stubGlobal('localStorage', fakeStorage)
      const localLoader = createFileLoader({
        baseUrl: '/api/config',
        storage: 'localStorage',
        cachePrefix: 'spark_page_',
      })

      localLoader.store({ key: 'new.json', data: 'new-content', sourceTimestamp: 'ts-new' })

      expect(fakeStorage.getItem(quotaTarget)).not.toBeNull()
      // old-a 的 sourceTimestamp 更新，但本地访问更旧；清理顺序必须仍然优先驱逐 old-a。
      expect(fakeStorage.getItem('spark_page_old-a.json')).toBeNull()
      expect(fakeStorage.getItem('spark_page_old-b.json')).not.toBeNull()
    })

    it('读取缓存更新 lastAccess 遇到配额不足时不应驱逐缓存', () => {
      class TouchFailingStorage implements Storage {
        private readonly map = new Map<string, FakeStorageRecord>()
        private blockedKey: string | null = null

        get length(): number {
          return this.map.size
        }

        blockSetItem(key: string): void {
          this.blockedKey = key
        }

        clear(): void {
          this.map.clear()
        }

        getItem(key: string): string | null {
          return this.map.get(key)?.value ?? null
        }

        key(index: number): string | null {
          return Array.from(this.map.keys())[index] ?? null
        }

        removeItem(key: string): void {
          this.map.delete(key)
        }

        setItem(key: string, value: string): void {
          if (key === this.blockedKey) {
            throw new DOMException('Quota exceeded', 'QuotaExceededError')
          }
          this.map.set(key, { value })
        }
      }

      const cacheKey = 'spark_page_kept.json'
      const otherKey = 'spark_page_other.json'
      const fakeStorage = new TouchFailingStorage()
      const now = Date.now()

      fakeStorage.setItem(cacheKey, JSON.stringify({
        data: 'kept-content',
        sourceTimestamp: 'ts-kept',
        cachedAt: now,
        lastAccess: now,
        expirationLevel: 3,
      }))
      fakeStorage.setItem(otherKey, JSON.stringify({
        data: 'other-content',
        sourceTimestamp: 'ts-other',
        cachedAt: now,
        lastAccess: now,
        expirationLevel: 3,
      }))
      fakeStorage.blockSetItem(cacheKey)

      vi.stubGlobal('localStorage', fakeStorage)
      const localLoader = createFileLoader({
        baseUrl: '/api/config',
        storage: 'localStorage',
        cachePrefix: 'spark_page_',
      })

      const data = localLoader.retrieve('kept.json', 'ts-kept')

      expect(data).toBe('kept-content')
      expect(fakeStorage.getItem(cacheKey)).not.toBeNull()
      expect(fakeStorage.getItem(otherKey)).not.toBeNull()
    })
  })

  describe('错误处理', () => {
    it('应该处理 HTTP 错误', async () => {
      const error = Object.assign(
        new Error('Request failed with status code 404'),
        {
          response: {
            status: 404,
            statusText: 'Not Found',
            data: {}
          }
        }
      )
      mockAxiosRequest.mockRejectedValue(error)

      const result = await loader.load('not-found.json')

      expect(result.success).toBe(false)
      expect(result.error).toContain('404')
    })

    it('应该处理无效的响应格式', async () => {
      mockAxiosRequest.mockResolvedValue({
        data: {
          // 缺少 content 或 timestamp
          invalid: true
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      const result = await loader.load('invalid.json')

      expect(result.success).toBe(false)
      expect(result.error).toContain('响应格式错误')
    })

    it('应该接受空字符串文件内容', async () => {
      mockAxiosRequest.mockResolvedValue({
        data: {
          content: '',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      const result = await loader.load('empty.css', { parseJSON: false })

      expect(result.success).toBe(true)
      expect(result.data).toBe('')
    })

    it('应该处理 JSON 解析错误', async () => {
      mockAxiosRequest.mockResolvedValue({
        data: {
          content: 'invalid json {',
          timestamp: '2024-02-11T10:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      })

      const result = await loader.load('parse-error.json')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  // ────────────────────────────────────────────────────────────────
  // withTransform / load({ transform }) — 变换缓存
  // ────────────────────────────────────────────────────────────────

  describe('load() 内联 transform', () => {
    it('transform 正常执行并返回变换结果', async () => {
      mockAxiosRequest.mockResolvedValueOnce({
        data: { content: '{"value":1}', timestamp: 'ts-1' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      const toUpper = (raw: string) => raw.toUpperCase()
      const result = await loader.load('t.json', { transform: toUpper })

      expect(result.success).toBe(true)
      expect(result.data).toBe('{"VALUE":1}')
      expect(result.fromCache).toBe(false)
    })

    it('内联 transform 每次调用保持一次性语义', async () => {
      // 首次：HTTP 请求
      mockAxiosRequest.mockResolvedValue({
        data: { content: '{"x":42}', timestamp: 'ts-same' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      let callCount = 0
      function countedTransform(raw: string): string {
        callCount++
        return `${raw  }-transformed`
      }

      await loader.load('cached-transform.json', {
        transform: countedTransform,
      })

      // 第二次请求返回 notModified（timestamp 不变）
      mockAxiosRequest.mockResolvedValue({
        data: { notModified: true },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      const result2 = await loader.load('cached-transform.json', {
        transform: countedTransform,
      })

      expect(result2.success).toBe(true)
      expect(result2.fromCache).toBe(true)
      expect(callCount).toBe(2)
      expect(mockAxiosRequest).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          params: { timestamp: 'ts-same' },
        }),
      )
    })

    it('forceRefresh 跳过变换缓存，重新执行 transform', async () => {
      mockAxiosRequest.mockResolvedValue({
        data: { content: '{"n":1}', timestamp: 'ts-x' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      let callCount = 0
      const fn = (raw: string) => { callCount++; return raw }

      await loader.load('force.json', { transform: fn })
      expect(callCount).toBe(1)

      mockAxiosRequest.mockResolvedValue({
        data: { content: '{"n":2}', timestamp: 'ts-x' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      await loader.load('force.json', {
        transform: fn,
        forceRefresh: true
      })
      expect(callCount).toBe(2)
    })

    it('transform 抛出异常时返回 success: false', async () => {
      mockAxiosRequest.mockResolvedValueOnce({
        data: { content: '{}', timestamp: 'ts-err' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      const brokenFn = (_raw: string) => { throw new Error('解析崩了') }
      const result = await loader.load('err.json', { transform: brokenFn })

      expect(result.success).toBe(false)
      // error 包含原始异常消息（FileLoader 直接返回 error.message，不添加前缀）
      expect(result.error).toContain('解析崩了')
    })
  })

  describe('withTransform() 子加载器', () => {
    it('子加载器 .load() 返回变换结果', async () => {
      mockAxiosRequest.mockResolvedValueOnce({
        data: { content: '[1,2,3]', timestamp: 'ts-w1' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      const numLoader = loader.withTransform(parseNumberArray)
      const result = await numLoader.load('nums.json')

      expect(result.success).toBe(true)
      expect(result.data).toEqual([1, 2, 3])
    })

    it('子加载器 .loadBatch() 返回 Map', async () => {
      mockAxiosRequest
        .mockResolvedValueOnce({
          data: { content: '[1]', timestamp: 'ts-b1' },
          status: 200, statusText: 'OK', headers: {}, config: {}
        })
        .mockResolvedValueOnce({
          data: { content: '[2,3]', timestamp: 'ts-b2' },
          status: 200, statusText: 'OK', headers: {}, config: {}
        })

      const numLoader = loader.withTransform(parseNumberArray)
      const map = await numLoader.loadBatch(['a.json', 'b.json'])

      expect(map.size).toBe(2)
      expect(map.get('a.json')?.data).toEqual([1])
      expect(map.get('b.json')?.data).toEqual([2, 3])
    })

    it('不同 transform key 互不污染缓存', async () => {
      const baseContent = '{"v":1}'
      mockAxiosRequest.mockResolvedValue({
        data: { content: baseContent, timestamp: 'ts-key' },
        status: 200, statusText: 'OK', headers: {}, config: {}
      })

      const loaderA = loader.withTransform((r) => `${r  }-A`)
      const loaderB = loader.withTransform((r) => `${r  }-B`)

      const ra = await loaderA.load('shared.json')
      const rb = await loaderB.load('shared.json')

      expect(ra.data).toBe(`${baseContent  }-A`)
      expect(rb.data).toBe(`${baseContent  }-B`)
    })
  })

  describe('store() / retrieve() 高级 API', () => {
    it('store 后 retrieve 命中（timestamp 匹配）', () => {
      loader.store({ key: 'my-key', data: { computed: true }, sourceTimestamp: 'ts-store' })
      const result = loader.retrieve('my-key', 'ts-store')
      expect(result).toEqual({ computed: true })
    })

    it('timestamp 不匹配时 retrieve 返回 null', () => {
      loader.store({ key: 'stale-key', data: { old: true }, sourceTimestamp: 'ts-old' })
      const result = loader.retrieve('stale-key', 'ts-new')
      expect(result).toBeNull()
    })

    it('key 不存在时 retrieve 返回 null', () => {
      expect(loader.retrieve('nonexistent', 'ts-any')).toBeNull()
    })
  })
})
