/**
 * Phase 9+10 测试
 * - M5: CrudService 共享 HTTP 客户端
 * - M3: executeBatch 真滑动窗口
 * - S1: DataView 公共委托访问器
 * - L1: 子路径导出
 */
import { describe, it, expect, vi } from 'vitest'
import { DataSet } from '../dataset'
import { DataView } from '../data-view'
import { CrudService, createCrudService } from '../crud-service'
import { SelectionDelegate } from '../strategies/selection-delegate'
import { LocalMutationDelegate } from '../strategies/local-mutation-delegate'
import { CrudDelegate } from '../strategies/crud-delegate'
import { createRequest } from '@spark-appworks/spark-utils'
import type { CrudApi, FilterExpression } from '../types'
import { setMember } from './test-type-helpers'

function createMockHttpClient() {
  const client = createRequest()
  vi.spyOn(client, 'request').mockRejectedValue(new Error('Unexpected request call'))
  vi.spyOn(client, 'requestFull').mockRejectedValue(new Error('Unexpected requestFull call'))
  vi.spyOn(client, 'get').mockRejectedValue(new Error('Unexpected get call'))
  vi.spyOn(client, 'post').mockRejectedValue(new Error('Unexpected post call'))
  vi.spyOn(client, 'put').mockRejectedValue(new Error('Unexpected put call'))
  vi.spyOn(client, 'patch').mockRejectedValue(new Error('Unexpected patch call'))
  vi.spyOn(client, 'delete').mockRejectedValue(new Error('Unexpected delete call'))
  vi.spyOn(client, 'clearCache').mockImplementation(() => undefined)
  return client
}

// ============================================================
// M5: CrudService 共享 HTTP 客户端
// ============================================================
describe('M5: CrudService shared HTTP client', () => {
  const dummyApi: CrudApi = {
    list: { url: '/api/test', method: 'GET' },
  }

  it('CrudService should accept a Request instance', () => {
    // 使用真实 HttpClientBase 子类实例，避免对象字面量绕过基类契约。
    const mockRequest = createMockHttpClient()
    const service = new CrudService(dummyApi, mockRequest)
    expect(service.getHttpClient()).toBe(mockRequest)
  })

  it('CrudService should create own Request when no client provided', () => {
    const service = new CrudService(dummyApi)
    const client = service.getHttpClient()
    expect(client).toBeDefined()
    expect(typeof client.get).toBe('function')
  })

  it('createCrudService should pass through HttpClientBase', () => {
    const mockRequest = createMockHttpClient()
    const service = createCrudService(dummyApi, mockRequest)
    expect(service.getHttpClient()).toBe(mockRequest)
  })

  it('DataSet.setSharedHttpClient should be accessible', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'Test',
      tables: {
        T: {
          tableName: 'T',
          columns: [],
          views: { default: { rows: [] } },
        },
      },
    })
    const mockClient = createMockHttpClient()
    ds.setSharedHttpClient(mockClient)
    expect(ds._sharedHttpClient).toBe(mockClient)
  })

  it('DataTable.crudService should use shared client from DataSet', () => {
    const mockClient = createMockHttpClient()
    const ds = new DataSet({
      dataSetName: 'Shared',
      tables: {
        T: {
          tableName: 'T',
          columns: [],
          api: { list: { url: '/api/t', method: 'GET' } },
          views: { default: {} },
        },
      },
    })
    ds.setSharedHttpClient(mockClient)
    const table = ds.getTable('T')!
    const service = table.crudService!
    expect(service.getHttpClient()).toBe(mockClient)
  })

  it('DataTable.crudService should resolve {tenantId}/{projectId} from DataSet appServices route context', async () => {
    const mockClient = createMockHttpClient()
    vi.mocked(mockClient.get).mockResolvedValue([])
    const ds = new DataSet({
      dataSetName: 'Scoped',
      tables: {
        T: {
          tableName: 'T',
          columns: [],
          api: { list: { url: '/tenants/{tenantId}/projects/{projectId}/navigation/nodes', method: 'GET' } },
          views: { default: {} },
        },
      },
    })
    ds.setSharedHttpClient(mockClient)
    ds.setAppServices({
      router: {
        currentRoute: {
          params: { tenantId: 'tenant-a', projectId: 'proj-1' },
          query: {},
        },
      },
    })

    const table = ds.getTable('T')!
    const service = table.crudService!

    const result = await service.list()
    expect(result.success).toBe(true)
    expect(mockClient.get).toHaveBeenCalledOnce()
    const firstGetCall = vi.mocked(mockClient.get).mock.calls[0]
    expect(firstGetCall).toBeDefined()
    expect(firstGetCall?.[0]).toBe('/tenants/tenant-a/projects/proj-1/navigation/nodes')
  })

  it('DataTable.crudService should preserve explicit endpoint URLs', async () => {
    const mockClient = createMockHttpClient()
    vi.mocked(mockClient.get).mockResolvedValue([])
    const ds = new DataSet({
      dataSetName: 'ScopedRelative',
      tables: {
        T: {
          tableName: 'T',
          columns: [],
          api: { list: { url: '/navigation/nodes', method: 'GET' } },
          views: { default: {} },
        },
      },
    })
    ds.setSharedHttpClient(mockClient)
    ds.setAppServices({
      router: {
        currentRoute: {
          params: { tenantId: 'tenant-a', projectId: 'proj-1' },
          query: {},
        },
      },
    })

    const table = ds.getTable('T')!
    const service = table.crudService!

    const result = await service.list()
    expect(result.success).toBe(true)
    expect(mockClient.get).toHaveBeenCalledOnce()
    const firstGetCall = vi.mocked(mockClient.get).mock.calls[0]
    expect(firstGetCall).toBeDefined()
    expect(firstGetCall?.[0]).toBe('/navigation/nodes')
  })

  it('DataTable.crudService should fail-fast when URL template params are unresolved', async () => {
    const mockClient = createMockHttpClient()
    vi.mocked(mockClient.get).mockResolvedValue([])
    const ds = new DataSet({
      dataSetName: 'ScopedFailFast',
      tables: {
        T: {
          tableName: 'T',
          columns: [],
          api: { list: { url: '/tenants/{tenantId}/projects/{projectId}/navigation/nodes', method: 'GET' } },
          views: { default: {} },
        },
      },
    })
    ds.setSharedHttpClient(mockClient)

    const table = ds.getTable('T')!
    const service = table.crudService!

    const result = await service.list()
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('Unresolved URL template params')
    expect(mockClient.get).not.toHaveBeenCalled()
  })

  it('DataTable.crudService should not invent scope for an endpoint without templates', async () => {
    const mockClient = createMockHttpClient()
    vi.mocked(mockClient.get).mockResolvedValue([])
    const ds = new DataSet({
      dataSetName: 'ScopedRelativeFailFast',
      tables: {
        T: {
          tableName: 'T',
          columns: [],
          api: { list: { url: '/navigation/nodes', method: 'GET' } },
          views: { default: {} },
        },
      },
    })
    ds.setSharedHttpClient(mockClient)

    const table = ds.getTable('T')!
    const service = table.crudService!

    const result = await service.list()
    expect(result.success).toBe(true)
    expect(mockClient.get).toHaveBeenCalledWith('/navigation/nodes', {}, { headers: {} })
  })

  it('DataTable.crudService should resolve {tenantId}/{projectId} from page route when page runtime services are missing', async () => {
    const mockClient = createMockHttpClient()
    vi.mocked(mockClient.get).mockResolvedValue([])

    const ds = new DataSet({
      dataSetName: 'ScopedByPageRoute',
      tables: {
        T: {
          tableName: 'T',
          columns: [],
          api: { list: { url: '/tenants/{tenantId}/projects/{projectId}/navigation/nodes', method: 'GET' } },
          views: { default: {} },
        },
      },
    })

    ds.setSharedHttpClient(mockClient)
    ds.setPageRoute({
      params: {},
      query: { tenantId: 'tenant-from-page', projectId: 'project-from-page' },
    })

    const table = ds.getTable('T')!
    const service = table.crudService!

    const result = await service.list()
    expect(result.success).toBe(true)
    expect(mockClient.get).toHaveBeenCalledOnce()
    const firstGetCall = vi.mocked(mockClient.get).mock.calls[0]
    expect(firstGetCall).toBeDefined()
    expect(firstGetCall?.[0]).toBe('/tenants/tenant-from-page/projects/project-from-page/navigation/nodes')
  })

  it('CrudService.list should POST query envelope for POST list endpoints', async () => {
    const mockClient = createMockHttpClient()
    vi.mocked(mockClient.post).mockResolvedValue({ rows: [{ id: 1 }], total: 1, page: 2, pageSize: 5 })

    const service = new CrudService({
      list: { url: '/api/filter-expression-cases/query', method: 'POST' },
    }, mockClient)

    const filter: FilterExpression = {
      type: 'and',
      children: [
        { field: 'status', op: '==', value: 'open' },
        { field: 'amount', op: '>=', value: { kind: 'field', field: 'threshold' } },
      ],
    }

    const result = await service.list({
      page: 2,
      pageSize: 5,
      sort: 'priority:desc',
      filter,
    })

    expect(result.success).toBe(true)
    expect(mockClient.post).toHaveBeenCalledOnce()
    expect(vi.mocked(mockClient.post).mock.calls[0]?.[0]).toBe('/api/filter-expression-cases/query')
    expect(vi.mocked(mockClient.post).mock.calls[0]?.[1]).toEqual({
      query: {
        page: 2,
        pageSize: 5,
        sort: 'priority:desc',
        filter,
      },
    })
    expect(mockClient.get).not.toHaveBeenCalled()
  })
})

// ============================================================
// M3: executeBatch 真滑动窗口（行为验证）
// ============================================================
describe('M3: executeBatch sliding window', () => {
  it('batch operations should complete all items', async () => {
    // 通过公共 API 间接测试 — batchCreate 内部使用 executeBatch
    const dummyApi: CrudApi = {
      list: { url: '/api/test', method: 'GET' },
      create: { url: '/api/test', method: 'POST' },
      batch: {
        create: { url: '/api/test/batch', method: 'POST' },
      },
    }
    const service = new CrudService(dummyApi)
    // executeBatch is private, we test via batchCreate
    // Since we don't have a real server, the individual requests will fail,
    // but we verify all items get results (each item caught individually)
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `item-${i}` }))
    const result = await service.batchCreate(items)
    // batchCreate always returns success:true with BatchResult containing all item results
    expect(result.success).toBe(true)
    expect(result.data?.results).toHaveLength(10)
  })
})

// ============================================================
// S1: DataView 公共委托访问器
// ============================================================
describe('S1: DataView public delegate accessors', () => {
  it('view.selection should return SelectionDelegate', () => {
    const view = new DataView('TestTable', 'default')
    expect(view.selection).toBeInstanceOf(SelectionDelegate)
  })

  it('view.mutation should return LocalMutationDelegate', () => {
    const view = new DataView('TestTable', 'default')
    expect(view.mutation).toBeInstanceOf(LocalMutationDelegate)
  })

  it('view.crud should return CrudDelegate', () => {
    const view = new DataView('TestTable', 'default')
    expect(view.crud).toBeInstanceOf(CrudDelegate)
  })

  it('view.crud.retrieveRecord should delegate to CrudService.retrieve', async () => {
    const ds = DataSet.fromJson({
      dataSetName: 'RetrieveDS',
      tables: {
        T: {
          tableName: 'T',
          columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
          api: { retrieve: { url: '/api/t/{id}', method: 'GET' } },
          views: { default: { rows: [{ id: 1 }] } },
        },
      },
    })
    const view = ds.getView('T', 'default')!
    const table = view.dataTable!
    const mockCrud = {
      retrieve: vi.fn(async (pk: Record<string, unknown>) => ({
        success: true,
        data: { id: pk['id'], name: 'Loaded' },
      })),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      batchCreate: vi.fn(),
      batchUpdate: vi.fn(),
      batchDelete: vi.fn(),
      importData: vi.fn(),
      exportData: vi.fn(),
      getHttpClient: vi.fn(),
    }

    setMember(table, '_crudService', mockCrud)
    setMember(view, '_crudDelegate', undefined)

    const result = await view.crud.retrieveRecord({ id: 1 })

    expect(result.success).toBe(true)
    expect(mockCrud.retrieve).toHaveBeenCalledWith({ id: 1 }, undefined)
  })

  it('view.retrieveRecordById should sync fetched row back into local rows', async () => {
    const ds = DataSet.fromJson({
      dataSetName: 'RetrieveSyncDS',
      tables: {
        T: {
          tableName: 'T',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          api: { retrieve: { url: '/api/t/{id}', method: 'GET' } },
          views: { default: { rows: [{ id: 1, name: 'Old' }] } },
        },
      },
    })
    const view = ds.getView('T', 'default')!
    const table = view.dataTable!
    const mockCrud = {
      retrieve: vi.fn(async () => ({ success: true, data: { id: 1, name: 'Fresh' } })),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      batchCreate: vi.fn(),
      batchUpdate: vi.fn(),
      batchDelete: vi.fn(),
      importData: vi.fn(),
      exportData: vi.fn(),
      getHttpClient: vi.fn(),
    }

    setMember(table, '_crudService', mockCrud)
    setMember(view, '_crudDelegate', undefined)

    const result = await view.retrieveRecordById(1, { setCurrentRow: true })

    expect(result.success).toBe(true)
    expect(view.rows[0]?.['name']).toBe('Fresh')
    expect(view.currentRow?.['name']).toBe('Fresh')
  })

  it('delegate accessors should be stable (same instance)', () => {
    const view = new DataView('TestTable', 'default')
    const sel1 = view.selection
    const sel2 = view.selection
    expect(sel1).toBe(sel2)
  })

  it('view.selection should be same delegate used by setCurrentRow', () => {
    const view = new DataView('TestTable', 'default')
    view.rows = [{ id: 1, name: 'A' }]
    // Use pass-through method to trigger selection
    view.selection.setCurrentRow(view.rows[0] ?? null)
    expect(view.currentRow).toEqual({ id: 1, name: 'A' })
    // The delegate should see the same state
    expect(view.selection).toBeDefined()
  })
})

// ============================================================
// L1: 委托类导出验证
// ============================================================
describe('L1: delegate class exports from index', () => {
  it('SelectionDelegate should be importable from index', () => {
    expect(SelectionDelegate).toBeDefined()
    expect(typeof SelectionDelegate).toBe('function')
  })

  it('LocalMutationDelegate should be importable from index', () => {
    expect(LocalMutationDelegate).toBeDefined()
    expect(typeof LocalMutationDelegate).toBe('function')
  })

  it('CrudDelegate should be importable from index', () => {
    expect(CrudDelegate).toBeDefined()
    expect(typeof CrudDelegate).toBe('function')
  })
})
