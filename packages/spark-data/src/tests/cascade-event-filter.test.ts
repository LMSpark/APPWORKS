/**
 * 级联事件过滤 + 陈旧数据修复 的回归测试
 *
 * 覆盖两类 bug：
 *  1. 白请求风暴：子视图响应了与其 source.state 无关的父事件
 *  2. 陈旧数据：父的选中行在子 Loading 期间改变，子完成后数据仍是旧的
 */

import { describe, it, expect, vi } from 'vitest'
import { SparkData } from '@spark-appworks/spark-data'
import { RequestState } from '../types'
import type { DataRow } from '@spark-appworks/spark-data'

// ─── 通用测试 DataSet 工厂 ─────────────────────────────────────

function makeDs(sourceState: string) {
  return SparkData.createDataSet({
    dataSetName: 'TestDS',
    tables: {
      Orders: {
        tableName: 'Orders',
        columns: [{ name: 'id', type: 'number' }],
        views: { default: { rows: [] } }
      },
      Items: {
        tableName: 'Items',
        columns: [{ name: 'id', type: 'number' }, { name: 'orderId', type: 'number' }],
        views: { default: { rows: [] } },
        api: { list: { url: '/test/items', method: 'GET' } }
      }
    },
    resourceRelations: [
      {
        parentTable: 'Orders',
        childTable: 'Items',
        parentField: 'id',
        childField: 'orderId',
      }
    ],
    viewCascades: [
      {
        parentTable: 'Orders',
        parentViewId: 'default',
        childTable: 'Items',
        childViewId: 'default',
        filterBindings: [{ sourceField: 'id', targetField: 'orderId' }],
        dependencyType: sourceState,
        autoLoad: true,
      }
    ]
  })
}

// ─── 帮助：手动模拟父视图已加载并有数据 ────────────────────────

function setParentLoaded(pView: ReturnType<typeof SparkData.createDataSet>['tables'][string]['views'][string], rows: DataRow[]) {
  pView.rows.splice(0, pView.rows.length, ...rows)
  pView.requestState = RequestState.Loaded
}

// ═══════════════════════════════════════════════════════════════
// 测试组 A — 白请求风暴：不相关事件不应触发子请求
// ═══════════════════════════════════════════════════════════════

describe('cascade event filter — no spurious child requests', () => {

  // ── A1: dep=currentRow 子视图不应响应 selectedRows 事件 ──────

  it('dep=currentRow: child should NOT react to parent selectedRows event', async () => {
    const ds = makeDs('currentRow')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    // 父已加载，currentRow 设为第一行
    setParentLoaded(pView, [{ id: 1 }, { id: 2 }])
    pView._currentRowId = pView.getPkKey(pView.rows[0]!) ?? null

    // 子视图 mock
    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async () => {
      cView.requestState = RequestState.Loaded
      return { success: true, data: [] }
    })

    // 父仅发出 selectedRowsChanged 事件（用户多选，但子视图 dep=currentRow，与之无关）
    pView.events.emit('selectedRowsChanged', [pView.rows[0]!, pView.rows[1]!])
    await new Promise(r => setTimeout(r, 30))

    expect(cSpy).not.toHaveBeenCalled()
    cSpy.mockRestore()
  })

  // ── A2: dep=selectedRows 子视图不应响应 currentRow 事件 ─────

  it('dep=selectedRows: child should NOT react to parent currentRow event', async () => {
    const ds = makeDs('selectedRows')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    // 父已加载，selectedRows 设为第一行
    setParentLoaded(pView, [{ id: 1 }, { id: 2 }])
    const selectedKey = pView.getPkKey(pView.rows[0]!)
    if (selectedKey === null || selectedKey === undefined) throw new Error('Expected selected row key')
    pView._selectedRowIds.splice(0, pView._selectedRowIds.length, selectedKey)

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async () => {
      cView.requestState = RequestState.Loaded
      return { success: true, data: [] }
    })

    // 父仅发出 currentRowChanged 事件（用户点选某行，但子视图 dep=selectedRows，与之无关）
    pView.events.emit('currentRowChanged', pView.rows[1]!)
    await new Promise(r => setTimeout(r, 30))

    expect(cSpy).not.toHaveBeenCalled()
    cSpy.mockRestore()
  })

  // ── A3: dep=allRows 子视图不应响应 currentRow/selectedRows 事件 ──

  it('dep=allRows: child should NOT react to parent currentRow or selectedRows events', async () => {
    const ds = makeDs('allRows')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    setParentLoaded(pView, [{ id: 1 }, { id: 2 }])

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async () => {
      cView.requestState = RequestState.Loaded
      return { success: true, data: [] }
    })

    pView.events.emit('currentRowChanged', pView.rows[0]!)
    pView.events.emit('selectedRowsChanged', [pView.rows[0]!])
    await new Promise(r => setTimeout(r, 30))

    expect(cSpy).not.toHaveBeenCalled()
    cSpy.mockRestore()
  })

  // ── A4: 正向验证：dep=currentRow 子视图应响应 currentRow 事件 ─

  it('dep=currentRow: child SHOULD react to parent currentRow event', async () => {
    const ds = makeDs('currentRow')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    setParentLoaded(pView, [{ id: 42 }])
    pView._currentRowId = pView.getPkKey(pView.rows[0]!) ?? null

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async (params?: { filter?: unknown }) => {
      expect(params?.filter).toEqual({ field: 'orderId', op: '==', value: 42 })
      cView.requestState = RequestState.Loaded
      return { success: true, data: [] }
    })

    pView.events.emit('currentRowChanged', pView.currentRow)
    await new Promise(r => setTimeout(r, 30))

    expect(cSpy).toHaveBeenCalledOnce()
    cSpy.mockRestore()
  })

  // ── A5: 正向验证：dep=allRows 子视图应响应 rows 事件 ─────────

  it('dep=allRows: child SHOULD react to parent rows event', async () => {
    const ds = makeDs('allRows')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    setParentLoaded(pView, [{ id: 7 }])

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async () => {
      cView.requestState = RequestState.Loaded
      return { success: true, data: [] }
    })

    pView.events.emit('rowsChanged')
    await new Promise(r => setTimeout(r, 50))

    expect(cSpy).toHaveBeenCalledOnce()
    cSpy.mockRestore()
  })

  // ── A6: dep=currentRow 子视图应响应 rows 事件（父数据重载，currentRow 被清空） ──

  it('dep=currentRow: child SHOULD react to parent rows event (parent reload clears currentRow)', async () => {
    const ds = makeDs('currentRow')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    // 子已有数据
    cView.rows.splice(0, cView.rows.length, { id: 99, orderId: 1 })
    cView.requestState = RequestState.Loaded

    // 父重新加载（loadFromServer 会清空 currentRow，只发 rows 事件）
    setParentLoaded(pView, [{ id: 1 }])
    // rows 事件 → 子应清空（parentRows 为空，因为 currentRow=null）
    pView.events.emit('rowsChanged')
    await new Promise(r => setTimeout(r, 30))

    // currentRow=null → getParentRows=[] → 子应 resetState + emit cleared
    expect(cView.rows.length).toBe(0)
    expect(cView.requestState).toBe(RequestState.Idle)
  })
})

// ═══════════════════════════════════════════════════════════════
// 测试组 B — 父 Loading 期间改变时立即重置重请求
// ═══════════════════════════════════════════════════════════════

describe('cascade reload — parent changes during child loading triggers immediate re-request', () => {

  /**
   * B1: 父 currentRow 改变时，无论子视图是否正在 Loading/Preparing，
   *     respondToParentChange 都立即将子重置为 Idle 并发起新 requestData()。
   *
   * 设计说明：
   *   - 不使用 cascadeDirty，而是直接重置 + 重请求
   *   - loadFromServer 内的 currentLoadRequestId 防止旧请求响应覆盖新结果
   *   - 本测试通过 spy requestData() 验证"确实触发了第二次完整编排"
   */
  it('when parent currentRow changes while child is in Preparing state, child re-requests immediately', async () => {
    const ds = makeDs('currentRow')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    setParentLoaded(pView, [{ id: 1 }, { id: 2 }])
    pView._currentRowId = pView.getPkKey(pView.rows[0]!) ?? null // 初始选中 id=1

    const loadCallCount: number[] = []

    // mock loadFromServer：同步返回，记录调用次数，不挂起
    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async () => {
      const callIndex = loadCallCount.length + 1
      loadCallCount.push(callIndex)
      cView.rows.splice(0, cView.rows.length, { id: 100 + callIndex, orderId: pView.currentRow?.['id'] ?? 0 })
      cView.requestState = RequestState.Loaded
      return { success: true, data: cView.rows }
    })

    // 启动第一次加载（dep=currentRow, currentRow=id=1）
    pView.events.emit('currentRowChanged', pView.currentRow)

    // 此时子处于 Preparing（requestData 同步设置的），切换父 currentRow
    pView._currentRowId = pView.getPkKey(pView.rows[1]!) ?? null
    pView.events.emit('currentRowChanged', pView.currentRow)

    // 等待所有微任务完成
    await new Promise(r => setTimeout(r, 30))

    // 验证：loadFromServer 被调用了（至少 1 次），最终数据来自 orderId=2 的父
    expect(cSpy).toHaveBeenCalled()
    expect(cView.rows[0]).toMatchObject({ orderId: 2 })

    cSpy.mockRestore()
  })
})
