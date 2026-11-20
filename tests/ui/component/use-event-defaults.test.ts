/**
 * 统一事件分发器 useEventDefaults 回归测试
 *
 * 验证用户设计的 A/B/C 五步模型：
 * 1. 按事件名称注入系统默认处理方法 A
 * 2. 按事件名称找业务脚本的事件处理方法 B
 * 3. 当 B 不存在直接执行 A
 * 4. 当 B 存在，执行 B，加入是否阻止 A 的参数 C
 * 5. 判断 C，是否执行 A
 */
import { describe, it, expect, vi } from 'vitest'
import { useEventDefaults, type InteractionControl } from '../../../packages/spark-component/src/components/containers/support/index'

// ── 基础 A/B/C 流程 ──────────────────────────────────────────────────────

describe('useEventDefaults — A/B/C 五步模型', () => {
  it('步骤 3: B 不存在 → 直接执行 A', async () => {
    const defaultFn = vi.fn()
    const { dispatch } = useEventDefaults({
      'row-click': { systemDefault: defaultFn },
    }, {})

    const result = await dispatch('row-click', 'arg1', 'arg2')

    expect(defaultFn).toHaveBeenCalledOnce()
    expect(defaultFn).toHaveBeenCalledWith('arg1', 'arg2')
    expect(result.cancel).toBe(false)
  })

  it('步骤 4+5: B 存在且未取消 → 先执行 B，再执行 A', async () => {
    const defaultFn = vi.fn()
    const order: string[] = []

    const bizHandler = vi.fn((_arg: unknown, _control: InteractionControl) => {
      order.push('B')
    })
    defaultFn.mockImplementation(() => { order.push('A') })

    const { dispatch } = useEventDefaults({
      'row-click': { systemDefault: defaultFn },
    }, { onRowClick: bizHandler })

    await dispatch('row-click', 'row-data')

    expect(order).toEqual(['B', 'A'])
    expect(bizHandler).toHaveBeenCalledOnce()
    expect(defaultFn).toHaveBeenCalledOnce()
  })

  it('步骤 5: B 存在且取消 → 执行 B，不执行 A', async () => {
    const defaultFn = vi.fn()
    const bizHandler = vi.fn((_arg: unknown, control: InteractionControl) => {
      control.cancel = true
    })

    const { dispatch } = useEventDefaults({
      'row-click': { systemDefault: defaultFn },
    }, { onRowClick: bizHandler })

    const result = await dispatch('row-click', 'row-data')

    expect(bizHandler).toHaveBeenCalledOnce()
    expect(defaultFn).not.toHaveBeenCalled()
    expect(result.cancel).toBe(true)
  })
})

// ── 无 systemDefault（CRUD 模式）──────────────────────────────────────────

describe('useEventDefaults — CRUD 模式（无 systemDefault）', () => {
  it('无业务回调 → cancel 为 false', async () => {
    const { dispatch } = useEventDefaults({
      'add-row': {},
    }, {})

    const result = await dispatch('add-row', { id: 1 })
    expect(result.cancel).toBe(false)
  })

  it('业务回调未取消 → cancel 为 false', async () => {
    const bizHandler = vi.fn()
    const { dispatch } = useEventDefaults({
      'add-row': {},
    }, { onAddRow: bizHandler })

    const result = await dispatch('add-row', { id: 1 })

    expect(bizHandler).toHaveBeenCalledOnce()
    expect(result.cancel).toBe(false)
  })

  it('业务回调取消 → cancel 为 true', async () => {
    const bizHandler = vi.fn((_row: unknown, control: InteractionControl) => {
      control.cancel = true
    })
    const { dispatch } = useEventDefaults({
      'add-row': {},
    }, { onAddRow: bizHandler })

    const result = await dispatch('add-row', { id: 1 })

    expect(bizHandler).toHaveBeenCalledOnce()
    expect(result.cancel).toBe(true)
  })
})

// ── 事件名 → prop 名转换 ─────────────────────────────────────────────────

describe('useEventDefaults — 事件名/prop 名映射', () => {
  it('row-click → onRowClick', async () => {
    const handler = vi.fn()
    const { dispatch } = useEventDefaults(
      { 'row-click': {} },
      { onRowClick: handler },
    )
    await dispatch('row-click')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('selection-change → onSelectionChange', async () => {
    const handler = vi.fn()
    const { dispatch } = useEventDefaults(
      { 'selection-change': {} },
      { onSelectionChange: handler },
    )
    await dispatch('selection-change', [])
    expect(handler).toHaveBeenCalledOnce()
  })

  it('change → onChange（字段事件）', async () => {
    const handler = vi.fn()
    const { dispatch } = useEventDefaults(
      { 'change': { systemDefault: vi.fn() } },
      { onChange: handler },
    )
    await dispatch('change', 'new-value', 'old-value')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('item-click → onItemClick', async () => {
    const handler = vi.fn()
    const { dispatch } = useEventDefaults(
      { 'item-click': {} },
      { onItemClick: handler },
    )
    await dispatch('item-click', {}, 0, new Event('click'))
    expect(handler).toHaveBeenCalledOnce()
  })
})

// ── 数组回调支持 ──────────────────────────────────────────────────────────

describe('useEventDefaults — 数组回调（Vue attr 合并场景）', () => {
  it('数组中多个回调顺序执行，共享 control', async () => {
    const order: string[] = []
    const handler1 = vi.fn(() => { order.push('h1') })
    const handler2 = vi.fn(() => { order.push('h2') })
    const defaultFn = vi.fn(() => { order.push('A') })

    const { dispatch } = useEventDefaults(
      { 'change': { systemDefault: defaultFn } },
      { onChange: [handler1, handler2] },
    )

    await dispatch('change', 'val')

    expect(order).toEqual(['h1', 'h2', 'A'])
  })

  it('数组中任一回调取消 → 后续回调仍执行但 A 不执行', async () => {
    const handler1 = vi.fn((_v: unknown, control: InteractionControl) => {
      control.cancel = true
    })
    const handler2 = vi.fn()
    const defaultFn = vi.fn()

    const { dispatch } = useEventDefaults(
      { 'change': { systemDefault: defaultFn } },
      { onChange: [handler1, handler2] },
    )

    const result = await dispatch('change', 'val')

    expect(handler1).toHaveBeenCalledOnce()
    expect(handler2).toHaveBeenCalledOnce()
    expect(defaultFn).not.toHaveBeenCalled()
    expect(result.cancel).toBe(true)
  })

  it('空数组 → 等同无业务回调，A 直接执行', async () => {
    const defaultFn = vi.fn()
    const { dispatch } = useEventDefaults(
      { 'change': { systemDefault: defaultFn } },
      { onChange: [] },
    )

    await dispatch('change', 'val')
    expect(defaultFn).toHaveBeenCalledOnce()
  })

  it('数组含非函数元素 → 仅调用函数元素', async () => {
    const handler = vi.fn()
    const { dispatch } = useEventDefaults(
      { 'change': {} },
      { onChange: ['not-a-function', handler, 42] },
    )

    await dispatch('change', 'val')
    expect(handler).toHaveBeenCalledOnce()
  })
})

// ── 异步回调 ──────────────────────────────────────────────────────────────

describe('useEventDefaults — 异步回调', () => {
  it('异步业务回调完成后再执行 A', async () => {
    const order: string[] = []

    const asyncBiz = vi.fn(async () => {
      await new Promise(r => setTimeout(r, 10))
      order.push('B-done')
    })
    const defaultFn = vi.fn(() => { order.push('A') })

    const { dispatch } = useEventDefaults(
      { 'row-click': { systemDefault: defaultFn } },
      { onRowClick: asyncBiz },
    )

    await dispatch('row-click', 'data')

    expect(order).toEqual(['B-done', 'A'])
  })

  it('异步 systemDefault 正确等待', async () => {
    let completed = false
    const asyncDefault = vi.fn(async () => {
      await new Promise(r => setTimeout(r, 10))
      completed = true
    })

    const { dispatch } = useEventDefaults(
      { 'save': { systemDefault: asyncDefault } },
      {},
    )

    await dispatch('save')
    expect(completed).toBe(true)
  })
})

// ── 边界场景 ──────────────────────────────────────────────────────────────

describe('useEventDefaults — 边界场景', () => {
  it('未声明的事件 → 返回 cancel=false 的控制器', async () => {
    const { dispatch } = useEventDefaults({}, {})
    const result = await dispatch('unknown-event', 'arg')
    expect(result.cancel).toBe(false)
  })

  it('handlerSource 中非函数值被忽略', async () => {
    const defaultFn = vi.fn()
    const { dispatch } = useEventDefaults(
      { 'row-click': { systemDefault: defaultFn } },
      { onRowClick: 'not-a-function' },
    )

    await dispatch('row-click', 'data')
    expect(defaultFn).toHaveBeenCalledOnce()
  })

  it('多次 dispatch 互不干扰', async () => {
    const defaultFn = vi.fn()
    const { dispatch } = useEventDefaults(
      { 'click': { systemDefault: defaultFn } },
      {},
    )

    await dispatch('click', 1)
    await dispatch('click', 2)
    await dispatch('click', 3)

    expect(defaultFn).toHaveBeenCalledTimes(3)
    expect(defaultFn).toHaveBeenNthCalledWith(1, 1)
    expect(defaultFn).toHaveBeenNthCalledWith(2, 2)
    expect(defaultFn).toHaveBeenNthCalledWith(3, 3)
  })

  it('args 完整传递给 B 和 A', async () => {
    const defaultFn = vi.fn()
    const bizHandler = vi.fn()

    const { dispatch } = useEventDefaults(
      { 'test': { systemDefault: defaultFn } },
      { onTest: bizHandler },
    )

    await dispatch('test', 'a', 'b', 'c')

    // A 收到原始 args
    expect(defaultFn).toHaveBeenCalledWith('a', 'b', 'c')
    // B 收到 args + control（最后一个参数）
    expect(bizHandler).toHaveBeenCalledWith('a', 'b', 'c', expect.objectContaining({ cancel: false }))
  })
})
