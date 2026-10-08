import { createTestPageRuntime } from '../../support/helpers/create-test-page-runtime'
/**
 * 零代码事件机制端到端测试
 *
 * 验证 action descriptor 从 rule.json 配置 → normalizeRuleEvents/normalizeOnProps 包装
 * → 容器 runControlledInteraction / 字段 useControlledFieldChange 全链路贯通。
 *
 * 测试范围：
 * 1. cancelDefault 机制：action descriptor 的 cancelDefault 通过执行器控制器传播取消容器/字段默认行为
 * 2. 数组折叠：多个 handler 折叠为单 async 函数，顺序执行，cancel 标志正确传播
 * 3. navigate 事件行插值：从事件参数行优先提取插值，回退到 currentRow
 * 4. 集成测试：RendererTable + action descriptor cancelDefault 全链路
 */

import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { SparkData } from '@spark-appworks/spark-data'
import type { DataRow } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'
import { RendererTable } from '@spark-appworks/spark-component'
import { normalizeRuleEvents, normalizeOnProps } from '../../../packages/spark-component/src/page/binding/bind-normalize'
import { executeActionDescriptor } from '../../../packages/spark-component/src/page/actions/action-executor'
import type { ActionExecutionContext, ActionDescriptor } from '../../../packages/spark-component/src/page/actions/action-types'
import type { PageDialogOptions, PageDialogResult, PageMessageType, PageServiceCapability } from '@spark-appworks/spark-component'
import { mountWithPageDataSet } from '../../support/helpers/mount-with-page-dataset'

// ── 工具函数 ───────────────────────────────────────────────────────────────

function createPageService(overrides: Partial<PageServiceCapability> = {}): PageServiceCapability {
  return {
    copyText: vi.fn(async () => {}),
    showMessage: vi.fn(),
    showConfirm: vi.fn(async () => true),
    showPrompt: vi.fn(async () => null),
    showAlert: vi.fn(async () => {}),
    showLoading: vi.fn(),
    showDialog: vi.fn(async (_options: PageDialogOptions): Promise<PageDialogResult> => 'close'),
    navigate: vi.fn(),
    selectEntities: vi.fn(async () => []),
    browseFiles: vi.fn(async () => []),
    uploadFiles: vi.fn(async () => []),
    ...overrides,
  }
}

function requireHandler(value: unknown): (...args: unknown[]) => unknown {
  if (typeof value === 'function') {
    return (...args: unknown[]) => Reflect.apply(value, undefined, args)
  }
  throw new Error('Expected normalized event handler')
}


function readRecordRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    if (isRecord(item)) return item
    throw new Error(`Expected table row object at index ${index}`)
  })
}

function createActionContext(overrides?: Partial<ActionExecutionContext>): ActionExecutionContext {
  const ds = SparkData.createDataSet({
    dataSetName: 'ZeroCodeDS',
    tables: {
      Users: {
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'number' },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: {
            rows: [{ id: 1, name: 'Alice' }],
          },
        },
      },
    },
  })
  return {
    getDataSet: () => ds,
    resolveView: binding => createTestPageRuntime(ds).resolveView(binding) ?? null,
    getPageService: () => createPageService(),
    getRouter: () => null,
    ...overrides,
  }
}

function createInlineDataSet(tableName: string, rows: DataRow[]) {
  return SparkData.createDataSet({
    dataSetName: `ZC-${tableName}`,
    tables: {
      [tableName]: {
        tableName,
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: {
            rows,
          },
        },
      },
    },
  })
}

// ── Stubs ──────────────────────────────────────────────────────────────────

const ElTableStub = defineComponent({
  emits: ['row-click', 'selection-change', 'current-change'],
  props: {
    data: { type: Array, default: () => [] },
    rowKey: { type: [String, Function], default: undefined },
    treeProps: { type: Object, default: undefined },
  },
  setup(props, { slots, emit }) {
    return () => {
      const rows = readRecordRows(props.data)
      const firstRow = rows[0]
      return h('div', { class: 'el-table-stub' }, [
        h('button', {
          class: 'el-table-row-click-trigger',
          onClick: () => { if (firstRow) emit('row-click', firstRow) },
        }, 'row-click'),
        h('button', {
          class: 'el-table-selection-trigger',
          onClick: () => { emit('selection-change', firstRow ? [firstRow] : []) },
        }, 'selection-change'),
        slots['default']?.(),
      ])
    }
  },
})

const SparkColumnRendererStub = defineComponent({
  props: { config: Object },
  setup() { return () => h('div', 'col-stub') },
})

// ── Section 1: cancelDefault 控制器传播 ───────────────────────────────────

describe('cancelDefault — 控制器传播 + action descriptor', () => {
  it('normalizeRuleEvents: action descriptor with cancelDefault sets control.cancel = true', async () => {
    const pageService = createPageService()
    const actionCtx = createActionContext({ getPageService: () => pageService })

    const on: Record<string, unknown> = {
      'row-click': {
        action: 'show-message',
        message: 'clicked',
        messageType: 'info',
        cancelDefault: true,
      },
    }

    const result = normalizeRuleEvents(on, vi.fn(), actionCtx)

    // 返回的是包装后的 async 闭包
    expect(typeof result['row-click']).toBe('function')

    // 模拟 runControlledInteraction 调用模式：handler(...args, control)
    const control = { cancel: false }
    const row = { id: 1, name: 'Alice' }
    await requireHandler(result['row-click'])(row, null, null, control)

    // cancelDefault 应通过执行器控制传播将 control.cancel 设为 true
    expect(control.cancel).toBe(true)
    // action 本身应被执行（showMessage 被调用）
    expect(pageService.showMessage).toHaveBeenCalledWith('clicked', 'info')
  })

  it('normalizeRuleEvents: action descriptor WITHOUT cancelDefault does not set control.cancel', async () => {
    const pageService = createPageService()
    const actionCtx = createActionContext({ getPageService: () => pageService })

    const on: Record<string, unknown> = {
      'click': { action: 'show-message', message: 'hello' },
    }

    const result = normalizeRuleEvents(on, vi.fn(), actionCtx)
    const control = { cancel: false }
    await requireHandler(result['click'])(control)

    // 无 cancelDefault → cancel 保持 false
    expect(control.cancel).toBe(false)
    expect(pageService.showMessage).toHaveBeenCalledWith('hello', 'info')
  })

  it('normalizeOnProps: action descriptor with cancelDefault works on onXxx props', async () => {
    const pageService = createPageService()
    const actionCtx = createActionContext({ getPageService: () => pageService })

    const props: Record<string, unknown> = {
      onRowClick: {
        action: 'show-message',
        message: 'row clicked!',
        messageType: 'success',
        cancelDefault: true,
      },
      dataViewKey: 'Users@default',
      dataMember: 'rows',
    }

    normalizeOnProps(props, vi.fn(), actionCtx)

    // onRowClick 应被包装为闭包
    expect(typeof props['onRowClick']).toBe('function')
    // dataViewKey / dataMember 不应被动
    expect(props['dataViewKey']).toBe('Users@default')
    expect(props['dataMember']).toBe('rows')

    // 模拟 runControlledInteraction 调用模式
    const control = { cancel: false }
    await requireHandler(props['onRowClick'])({ id: 1 }, null, null, control)
    expect(control.cancel).toBe(true)
    expect(pageService.showMessage).toHaveBeenCalledWith('row clicked!', 'success')
  })

  it('cancelDefault works with FieldChangeControl (field event pattern)', async () => {
    const pageService = createPageService()
    const actionCtx = createActionContext({ getPageService: () => pageService })

    const props: Record<string, unknown> = {
      onChange: {
        action: 'show-message',
        message: 'value changed',
        cancelDefault: true,
      },
    }

    normalizeOnProps(props, vi.fn(), actionCtx)

    // 模拟 useControlledFieldChange 调用模式：handler(nextValue, prevValue, control)
    const control = { cancel: false }
    await requireHandler(props['onChange'])('new-val', 'old-val', control)
    expect(control.cancel).toBe(true)
    expect(pageService.showMessage).toHaveBeenCalledWith('value changed', 'info')
  })

  it('cancelDefault does NOT crash when no control arg exists', async () => {
    const pageService = createPageService()
    const actionCtx = createActionContext({ getPageService: () => pageService })

    const on: Record<string, unknown> = {
      'click': { action: 'show-message', message: 'ok', cancelDefault: true },
    }

    const result = normalizeRuleEvents(on, vi.fn(), actionCtx)

    // 无控制对象调用 — 不应抛异常
    await requireHandler(result['click'])()
    expect(pageService.showMessage).toHaveBeenCalledWith('ok', 'info')
  })

  it('cancelDefault ignores non-control trailing args (e.g. Event)', async () => {
    const pageService = createPageService()
    const actionCtx = createActionContext({ getPageService: () => pageService })

    const on: Record<string, unknown> = {
      'click': { action: 'show-message', message: 'ok', cancelDefault: true },
    }

    const result = normalizeRuleEvents(on, vi.fn(), actionCtx)

    // 最后一个参数是字符串，不是控制对象 → 不设 cancel
    await requireHandler(result['click'])('some-string')
    expect(pageService.showMessage).toHaveBeenCalled()
  })
})

// ── Section 2: 数组折叠 ──────────────────────────────────────────────────

describe('数组折叠 — 多 handler 折叠为单函数', () => {
  it('normalizeRuleEvents: array of handlers collapses to single async function', async () => {
    const callFunc = vi.fn()
    const pageService = createPageService()
    const actionCtx = createActionContext({ getPageService: () => pageService })

    const on: Record<string, unknown> = {
      'click': [
        'handleClick',
        { action: 'show-message', message: 'action-done' },
      ],
    }

    const result = normalizeRuleEvents(on, callFunc, actionCtx)

    expect(typeof result['click']).toBe('function')

    await requireHandler(result['click'])('arg1')

    // 1. string handler → callFunc
    expect(callFunc).toHaveBeenCalledWith('handleClick', 'arg1')
    // 2. action descriptor → showMessage
    expect(pageService.showMessage).toHaveBeenCalledWith('action-done', 'info')
  })

  it('array with cancelDefault descriptor cancels default for composited handler', async () => {
    const callFunc = vi.fn()
    const pageService = createPageService()
    const actionCtx = createActionContext({ getPageService: () => pageService })

    const on: Record<string, unknown> = {
      'row-click': [
        'handleRowClick',
        { action: 'show-message', message: 'logged', cancelDefault: true },
      ],
    }

    const result = normalizeRuleEvents(on, callFunc, actionCtx)
    const control = { cancel: false }
    await requireHandler(result['row-click'])({ id: 1 }, null, null, control)

    // callFunc 先执行
    expect(callFunc).toHaveBeenCalledWith('handleRowClick', { id: 1 }, null, null, control)
    // action 执行
    expect(pageService.showMessage).toHaveBeenCalledWith('logged', 'info')
    // cancelDefault 控制传播生效
    expect(control.cancel).toBe(true)
  })

  it('normalizeOnProps: array in props.onXxx is collapsed', async () => {
    const callFunc = vi.fn()
    const pageService = createPageService()
    const actionCtx = createActionContext({ getPageService: () => pageService })

    const props: Record<string, unknown> = {
      onSelectionChange: [
        'handleSelection',
        { action: 'show-message', message: 'selection logged' },
      ],
    }

    normalizeOnProps(props, callFunc, actionCtx)
    expect(typeof props['onSelectionChange']).toBe('function')

    await requireHandler(props['onSelectionChange'])([{ id: 1 }])

    expect(callFunc).toHaveBeenCalledWith('handleSelection', [{ id: 1 }])
    expect(pageService.showMessage).toHaveBeenCalledWith('selection logged', 'info')
  })

  it('array execution is sequential (each handler awaited before next)', async () => {
    const order: string[] = []
    const showMessage = vi.fn((_message: string, _type?: PageMessageType) => {
      order.push('action')
    })
    const actionCtx = createActionContext({
      getPageService: () => createPageService({
        showMessage,
      }),
    })

    const slowFn = async () => {
      await new Promise(r => setTimeout(r, 10))
      order.push('slow')
    }

    const on: Record<string, unknown> = {
      'click': [
        slowFn,
        { action: 'show-message', message: 'second' },
      ],
    }

    const result = normalizeRuleEvents(on, vi.fn(), actionCtx)
    await requireHandler(result['click'])()

    // slow 先完成，然后 action
    expect(order).toEqual(['slow', 'action'])
  })
})

// ── Section 3: string handler 透传（脚本函数绑定）─────────────────────────

describe('string handler — callFunc 透传', () => {
  it('normalizeRuleEvents: string handler calls callFunc', async () => {
    const callFunc = vi.fn()

    const on: Record<string, unknown> = { 'click': 'handleClick' }
    const result = normalizeRuleEvents(on, callFunc)

    await requireHandler(result['click'])('a', 'b')
    expect(callFunc).toHaveBeenCalledWith('handleClick', 'a', 'b')
  })

  it('normalizeOnProps: string in onXxx calls callFunc', async () => {
    const callFunc = vi.fn()

    const props: Record<string, unknown> = { onRowClick: 'handleRowClick' }
    normalizeOnProps(props, callFunc)

    await requireHandler(props['onRowClick'])('row', 'col')
    expect(callFunc).toHaveBeenCalledWith('handleRowClick', 'row', 'col')
  })

  it('normalizeOnProps: non-onXxx keys are not touched', () => {
    const callFunc = vi.fn()

    const props: Record<string, unknown> = {
      dataViewKey: 'Users@default',
      dataMember: 'rows',
      label: '姓名',
      onRowClick: 'fn1',
    }

    normalizeOnProps(props, callFunc)

    expect(props['dataViewKey']).toBe('Users@default')
    expect(props['dataMember']).toBe('rows')
    expect(props['label']).toBe('姓名')
    expect(typeof props['onRowClick']).toBe('function')
  })
})

// ── Section 4: function 透传 ──────────────────────────────────────────────

describe('function handler — 直接透传', () => {
  it('normalizeRuleEvents: function handler passed through', () => {
    const fn = vi.fn()
    const result = normalizeRuleEvents({ 'click': fn }, vi.fn())
    expect(result['click']).toBe(fn)
  })

  it('normalizeOnProps: function in onXxx not re-wrapped', () => {
    const fn = vi.fn()
    const props: Record<string, unknown> = { onRowClick: fn }
    normalizeOnProps(props, vi.fn())
    expect(props['onRowClick']).toBe(fn)
  })
})

// ── Section 5: navigate 事件行插值 ────────────────────────────────────────

describe('navigate action — 事件行插值', () => {
  it('interpolates path from event row (first arg)', async () => {
    const navigate = vi.fn()
    const pageService = createPageService({ navigate })
    const ds = SparkData.createDataSet({
      dataSetName: 'NavDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' },
            { name: 'name', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }],
            },
          },
        },
      },
    })

    const router = { push: vi.fn() }
    const actionCtx: ActionExecutionContext = {
      getDataSet: () => ds,
    resolveView: binding => createTestPageRuntime(ds).resolveView(binding) ?? null,
      getPageService: () => pageService,
      getRouter: () => router,
    }

    // 直接测试 executeActionDescriptor
    const desc: ActionDescriptor = { action: 'navigate', path: '/user/{id}' }
    const eventRow = { id: 42, name: 'Bob' }
    await executeActionDescriptor(desc, actionCtx, { eventArgs: [eventRow] })

    // 应从 eventRow 插值 id=42，而非 currentRow
    expect(router.push).toHaveBeenCalledWith('/user/42')
  })

  it('falls back to currentRow when no event row exists', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'NavDS2',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' },
            { name: 'name', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: 99, name: 'Charlie' }],
            },
          },
        },
      },
    })
    const view = ds.getView('Users', 'default')!
    view.selection.setCurrentRow({ id: 99, name: 'Charlie' })

    const router = { push: vi.fn() }
    const actionCtx: ActionExecutionContext = {
      getDataSet: () => ds,
    resolveView: binding => createTestPageRuntime(ds).resolveView(binding) ?? null,
      getPageService: () => createPageService(),
      getRouter: () => router,
    }

    const desc: ActionDescriptor = { action: 'navigate', path: '/user/{name}' }
    // 无事件行 → 回退到 currentRow
    await executeActionDescriptor(desc, {...actionCtx, getDataSource: () => view})

    // currentRow.name = 'Charlie'
    expect(router.push).toHaveBeenCalledWith('/user/Charlie')
  })

  it('navigate through normalizeRuleEvents wrapper uses event row', async () => {
    const router = { push: vi.fn() }
    const pageService = createPageService()
    const ds = SparkData.createDataSet({
      dataSetName: 'NavDS3',
      tables: {
        T: {
          tableName: 'T',
          columns: [],
          views: {
            default: {
              rows: [],
            },
          },
        },
      },
    })
    const actionCtx: ActionExecutionContext = {
      getDataSet: () => ds,
    resolveView: binding => createTestPageRuntime(ds).resolveView(binding) ?? null,
      getPageService: () => pageService,
      getRouter: () => router,
    }

    const on: Record<string, unknown> = {
      'row-click': { action: 'navigate', path: '/detail/{id}' },
    }

    const result = normalizeRuleEvents(on, vi.fn(), actionCtx)
    // 模拟 row-click 事件参数
    await requireHandler(result['row-click'])({ id: 7, name: 'Test' }, null, null)

    expect(router.push).toHaveBeenCalledWith('/detail/7')
  })
})

// ── Section 6: action descriptor then 链式 ────────────────────────────────

describe('action descriptor — then 链式执行', () => {
  it('executes then chain after primary action', async () => {
    const pageService = createPageService()
    const actionCtx = createActionContext({ getPageService: () => pageService })

    const on: Record<string, unknown> = {
      'click': {
        action: 'show-message',
        message: 'first',
        messageType: 'info',
        then: {
          action: 'show-message',
          message: 'second',
          messageType: 'success',
        },
      },
    }

    const result = normalizeRuleEvents(on, vi.fn(), actionCtx)
    await requireHandler(result['click'])()

    expect(pageService.showMessage).toHaveBeenCalledTimes(2)
    expect(pageService.showMessage).toHaveBeenNthCalledWith(1, 'first', 'info')
    expect(pageService.showMessage).toHaveBeenNthCalledWith(2, 'second', 'success')
  })

  it('propagates control through then chain', async () => {
    const control = { cancel: false }
    const actionCtx = createActionContext({ getPageService: () => createPageService() })

    const desc: ActionDescriptor = {
      action: 'show-message',
      message: 'first',
      then: {
        action: 'show-message',
        message: 'second',
        cancelDefault: true,
      },
    }

    await executeActionDescriptor(desc, actionCtx, { eventArgs: ['evt'], control })

    expect(control.cancel).toBe(true)
  })

  it('propagates control through confirm onConfirm branch', async () => {
    const control = { cancel: false }
    const pageService = createPageService({ showConfirm: vi.fn(async () => true) })
    const actionCtx = createActionContext({ getPageService: () => pageService })

    const desc: ActionDescriptor = {
      action: 'confirm',
      message: '确认执行？',
      onConfirm: {
        action: 'show-message',
        message: 'confirmed',
        cancelDefault: true,
      },
    }

    await executeActionDescriptor(desc, actionCtx, { eventArgs: ['evt'], control })

    expect(control.cancel).toBe(true)
    expect(pageService.showMessage).toHaveBeenCalledWith('confirmed', 'info')
  })
})

// ── Section 7: 集成测试 — RendererTable + cancelDefault ──────────────────

describe('集成测试 — RendererTable cancelDefault 全链路', () => {
  it('action descriptor as onRowClick cancels setCurrentRow via cancelDefault', async () => {
    const ds = createInlineDataSet('Users', [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ])
    const view = ds.getView('Users', 'default')!
    const observed: string[] = []

    // 直接传 已包装的 action descriptor 闭包（模拟 normalizeOnProps 输出）
    const showMessage = vi.fn((_message: string, _type?: PageMessageType) => {
      observed.push('msg')
    })
    const pageService = createPageService({
      showMessage,
    })
    const actionCtx = createActionContext({
      getDataSet: () => ds,
    resolveView: binding => createTestPageRuntime(ds).resolveView(binding) ?? null,
      getPageService: () => pageService,
    })

    // 使用 normalizeOnProps 包装 action descriptor
    const nodeProps: Record<string, unknown> = {
      dataViewKey: 'Users@default',
      onRowClick: {
        action: 'show-message',
        message: 'clicked-row',
        cancelDefault: true,
      },
    }
    normalizeOnProps(nodeProps, vi.fn(), actionCtx)

    const wrapper = mountWithPageDataSet(RendererTable, {
      dataSet: ds,
      props: nodeProps,
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': { template: '<div />' },
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    await nextTick()
    await flushPromises()

    // 点击行
    await wrapper.find('.el-table-row-click-trigger').trigger('click')
    await nextTick()
    await flushPromises()

    // action 应执行（showMessage 被调用）
    expect(pageService.showMessage).toHaveBeenCalledWith('clicked-row', 'info')
    // cancelDefault 生效 → currentRow 不应被设置
    expect(view.currentRow).toBeNull()
  })

  it('action descriptor as onSelectionChange cancels setSelectedRows via cancelDefault', async () => {
    const ds = createInlineDataSet('Users', [
      { id: 1, name: 'Alice' },
    ])
    const view = ds.getView('Users', 'default')!

    const pageService = createPageService()
    const actionCtx = createActionContext({
      getDataSet: () => ds,
    resolveView: binding => createTestPageRuntime(ds).resolveView(binding) ?? null,
      getPageService: () => pageService,
    })

    const nodeProps: Record<string, unknown> = {
      dataViewKey: 'Users@default',
      onSelectionChange: {
        action: 'show-message',
        message: 'selection-changed',
        cancelDefault: true,
      },
    }
    normalizeOnProps(nodeProps, vi.fn(), actionCtx)

    const wrapper = mountWithPageDataSet(RendererTable, {
      dataSet: ds,
      props: nodeProps,
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': { template: '<div />' },
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    await nextTick()
    await flushPromises()

    await wrapper.find('.el-table-selection-trigger').trigger('click')
    await nextTick()
    await flushPromises()

    expect(pageService.showMessage).toHaveBeenCalledWith('selection-changed', 'info')
    // cancelDefault → selectedRows 不应被设置
    expect(view.selectedRows).toEqual([])
  })

  it('action descriptor WITHOUT cancelDefault allows default setCurrentRow', async () => {
    const ds = createInlineDataSet('Users', [
      { id: 1, name: 'Alice' },
    ])
    const view = ds.getView('Users', 'default')!

    const pageService = createPageService()
    const actionCtx = createActionContext({
      getDataSet: () => ds,
    resolveView: binding => createTestPageRuntime(ds).resolveView(binding) ?? null,
      getPageService: () => pageService,
    })

    const nodeProps: Record<string, unknown> = {
      dataViewKey: 'Users@default',
      onRowClick: {
        action: 'show-message',
        message: 'clicked',
        // 无 cancelDefault
      },
    }
    normalizeOnProps(nodeProps, vi.fn(), actionCtx)

    const wrapper = mountWithPageDataSet(RendererTable, {
      dataSet: ds,
      props: nodeProps,
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': { template: '<div />' },
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    await nextTick()
    await flushPromises()

    await wrapper.find('.el-table-row-click-trigger').trigger('click')
    await nextTick()
    await flushPromises()

    // action 执行
    expect(pageService.showMessage).toHaveBeenCalledWith('clicked', 'info')
    // 无 cancelDefault → 默认行为应执行 → currentRow 被设置
    expect(view.currentRow).toMatchObject({ id: 1, name: 'Alice' })
  })
})
