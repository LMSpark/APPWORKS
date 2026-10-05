/**
 * Phase 7 安全护栏测试
 *
 * S2: DataView 未绑定 DataTable 时的 checkDataTableAttached 守卫
 * S3: TreeManager 共享 HTTP 客户端（CrudService.getHttpClient）
 * L3: updateRowById 拒绝主键变更
 */

import { describe, it, expect } from 'vitest'
import { DataSet, DataView } from '@spark-appworks/spark-data'
import { TreeManager } from '../tree-manager'
import { CrudService } from '../crud-service'

// ─────────────────────────────────────────────
// S2: dataTable 守卫
// ─────────────────────────────────────────────

describe('S2: checkDataTableAttached guard', () => {
  it('standalone DataView — primaryKey getter falls back to "id" without error', () => {
    // standalone DataView 没有 dataTable，primaryKey getter 应安全回退到 'id'
    const view = new DataView('Users', 'default')
    expect(view.primaryKey).toBe('id')
  })

  it('standalone DataView — accessing dataSet throws descriptive error', () => {
    const view = new DataView('Users', 'default')
    expect(() => view.dataSet).toThrow(/尚未关联 DataTable/)
    expect(() => view.dataSet).toThrow(/DataView Users:default/)
  })

  it('standalone DataView — accessing crudService throws descriptive error', () => {
    const view = new DataView('Users', 'default')
    expect(() => view.crudService).toThrow(/尚未关联 DataTable/)
  })

  it('standalone DataView — accessing crudConfig throws descriptive error', () => {
    const view = new DataView('Users', 'default')
    expect(() => view.crudConfig).toThrow(/尚未关联 DataTable/)
  })

  it('standalone DataView — accessing validator throws descriptive error', () => {
    const view = new DataView('Users', 'default')
    expect(() => view.validator).toThrow(/尚未关联 DataTable/)
  })

  it('attached DataView — accessors work normally', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'Test',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }],
          views: { default: { rows: [] } },
        },
      },
    })
    const view = ds.getView('Users', 'default')!
    // 不应抛错；dataSet 可能被外部代理包装，只检查 dataSetName 等价
    expect(view.dataSet?.dataSetName).toBe('Test')
    expect(view.crudService).toBeUndefined()  // 未配置 api
    expect(view.crudConfig).toBeUndefined()
  })
})

// ─────────────────────────────────────────────
// S3: TreeManager HTTP 客户端共享
// ─────────────────────────────────────────────

describe('S3: TreeManager HTTP client sharing', () => {
  it('CrudService.getHttpClient() returns its internal Request instance', () => {
    const svc = new CrudService({ list: { url: '/api/test' } })
    const http = svc.getHttpClient()
    expect(http).toBeDefined()
    // 多次调用返回同一实例
    expect(svc.getHttpClient()).toBe(http)
  })

  it('TreeManager accepts injected httpClient', () => {
    const svc = new CrudService({ list: { url: '/api/test' } })
    const http = svc.getHttpClient()
    // 传入 httpClient 后，TreeManager 不会自行创建新实例
    const tm = new TreeManager({
      config: { idField: 'id', parentIdField: 'pid', textField: 'name' },
      httpClient: http,
    })
    // 确认 TreeManager 被正确构造
    expect(tm.getConfig().idField).toBe('id')
  })

  it('TreeManager without httpClient remains available for local tree operations', () => {
    const tm = new TreeManager({
      config: { idField: 'id', parentIdField: 'parentId' },
      initialNodes: [{ id: 'root', parentId: null, name: '根节点' }],
    })
    expect(tm.getRoots()).toEqual([{ id: 'root', parentId: null, name: '根节点' }])
  })

  it('TreeManager remote operations require the owning DataTable HTTP client', async () => {
    const tm = new TreeManager({
      config: { idField: 'id', parentIdField: 'pid' },
      api: { children: { url: '/tree/children', method: 'GET' } },
    })

    await expect(tm.fetchChildren(null)).rejects.toThrow(/必须注入 DataTable HTTP 客户端/u)
  })
})

// ─────────────────────────────────────────────
// L3: updateRowById 主键变更拦截
// ─────────────────────────────────────────────

describe('L3: updateRowById rejects primary key mutation', () => {
  function createTestDS() {
    return DataSet.fromJson({
      dataSetName: 'Test',
      tables: {
        Items: {
          tableName: 'Items',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          views: {
            default: {
              rows: [
                { id: 1, name: 'A' },
                { id: 2, name: 'B' },
              ],
            },
          },
        },
      },
    })
  }

  it('data with same PK value passes through (no error)', () => {
    const ds = createTestDS()
    const view = ds.getView('Items', 'default')!
    // 显式传入 id: 1（与原值相同）不应报错
    const ok = view.updateRowById(1, { id: 1, name: 'Updated' })
    expect(ok).toBe(true)
    expect(view.rows.find(r => r['id'] === 1)?.['name']).toBe('Updated')
  })

  it('data without PK field passes through (no error)', () => {
    const ds = createTestDS()
    const view = ds.getView('Items', 'default')!
    const ok = view.updateRowById(2, { name: 'Changed' })
    expect(ok).toBe(true)
    expect(view.rows.find(r => r['id'] === 2)?.['name']).toBe('Changed')
  })

  it('data with different PK value throws', () => {
    const ds = createTestDS()
    const view = ds.getView('Items', 'default')!
    expect(() => view.updateRowById(1, { id: 999, name: 'Bad' }))
      .toThrow(/不允许修改主键字段/)
    // 原数据未被修改
    expect(view.rows.find(r => r['id'] === 1)?.['name']).toBe('A')
  })

  it('multi-pk: rejects if any PK field changes', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'Test',
      tables: {
        Items: {
          tableName: 'Items',
          columns: [
            { name: 'tenantId', type: 'string', isPrimaryKey: true },
            { name: 'itemId', type: 'number', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          views: { default: { rows: [{ tenantId: 'A', itemId: 1, name: 'Item1' }] } },
        },
      },
    })
    const view = ds.getView('Items', 'default')!
    // 复合主键自动合成 _pk，getPkKey 返回 'A+1'
    expect(view.primaryKey).toBe('_pk')
    const pkKey = view.getPkKey(view.rows[0]!)
    expect(pkKey).toBe('A+1')
    // 尝试修改真实 PK 字段 tenantId
    expect(() => view.updateRowById(pkKey!, { tenantId: 'B', name: 'Bad' }))
      .toThrow(/不允许修改主键字段 "tenantId"/)
    // 原数据未改
    expect(view.rows[0]?.['tenantId']).toBe('A')
  })

  it('non-existent row returns false (no error)', () => {
    const ds = createTestDS()
    const view = ds.getView('Items', 'default')!
    const ok = view.updateRowById(9999, { name: 'Ghost' })
    expect(ok).toBe(false)
  })
})
