/**
 * createSandbox 单元测试
 *
 * 覆盖：
 * - 函数名提取（extractNamesFromScript 间接测试）
 * - compileFunctions 编译 & 执行
 * - __init__ 函数
 * - 函数间互相调用
 * - 沙箱上下文变量访问（$page / $route / 自定义）
 * - 原型链访问拦截（prototype pollution 防护）
 * - 边界场景（空脚本、语法错误）
 */

import { describe, it, expect, vi } from 'vitest'
import { compileFunctions } from '../page/createSandbox'
import type { PageContext } from '../page/context/types'
import { SparkData } from '@spark-appworks/spark-data'
import { h } from 'vue'

function createMockComponents(): PageContext['$components'] {
  return {
    get: vi.fn(() => null),
    list: vi.fn(() => []),
    getApi: vi.fn(() => null),
    getApisByType: vi.fn(() => []),
  }
}

function createMockPageService(): PageContext['$page'] {
  return {
    getDataSet: vi.fn(() => undefined), resolveView: vi.fn(() => undefined),
    showDialog: vi.fn(async () => 'confirm' as const),
    selectEntities: vi.fn(async () => []),
    browseFiles: vi.fn(async () => []),
    uploadFiles: vi.fn(async () => []),
    showMessage: vi.fn(),
    showConfirm: vi.fn(async () => true),
    showPrompt: vi.fn(async () => null),
    showAlert: vi.fn(async () => {}),
    showLoading: vi.fn(),
    navigate: vi.fn(),
  }
}

function pageSetTimeout(handler: (...args: unknown[]) => void, timeout?: number): number {
  return window.setTimeout(handler, timeout)
}

function pageClearTimeout(id?: number): void {
  window.clearTimeout(id)
}

function pageSetInterval(handler: (...args: unknown[]) => void, timeout?: number): number {
  return window.setInterval(handler, timeout)
}

function pageClearInterval(id?: number): void {
  window.clearInterval(id)
}

/** 创建最小化的 PageContext mock */
function createMockContext(overrides: Partial<PageContext> = {}): PageContext {
  const base: PageContext = {
    $route: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
    $el: () => null,
    $query: () => null,
    $queryAll: () => document.querySelectorAll('.noop'),
    $components: createMockComponents(),
    $page: createMockPageService(),
    SparkData,
    h,
    setTimeout: pageSetTimeout,
    clearTimeout: pageClearTimeout,
    setInterval: pageSetInterval,
    clearInterval: pageClearInterval,
    console,
    $moduleContext: null,
  }
  return { ...base, ...overrides }
}

describe('createSandbox — compileFunctions', () => {
  // ── 基础编译 ────────────────────────────────────────────────────────────────

  it('空脚本应返回空对象', () => {
    const ctx = createMockContext()
    const fns = compileFunctions('', ctx)
    expect(fns).toEqual({})
  })

  it('应正确提取并返回 function 声明', () => {
    const script = `
      function greet(name) { return 'Hello ' + name }
      function add(a, b) { return a + b }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns).toHaveProperty('greet')
    expect(fns).toHaveProperty('add')
    expect(fns['greet']!('World')).toBe('Hello World')
    expect(fns['add']!(2, 3)).toBe(5)
  })

  it('应正确提取 async function（注意：with() 内 async function 是块级作用域）', () => {
    // async function 声明在 with() 块内是块级作用域（V8 行为），
    // 因此无法从 return 语句访问。用 var = async function 替代。
    const script = `
      var fetchData = async function() { return 42 }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns).toHaveProperty('fetchData')
  })

  it('应正确提取箭头函数赋值（需使用 var 声明）', () => {
    // const/let 在 with() 块内是块级作用域，无法从 return 语句访问。
    // 脚本中应使用 var 或 function 声明。
    const script = `
      var multiply = function(a, b) { return a * b }
      var square = function(x) { return x * x }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns).toHaveProperty('multiply')
    expect(fns).toHaveProperty('square')
    expect(fns['multiply']!(3, 4)).toBe(12)
    expect(fns['square']!(5)).toBe(25)
  })

  it('提取同行顶层声明并排除嵌套或字符串中的声明', () => {
    const fns = compileFunctions(`let count=0; function RenderActions(){ function nested(){return 9}; return ++count }; const next=()=>RenderActions(); const text="function fake(){}"`, createMockContext())
    expect(Object.keys(fns).sort()).toEqual(['RenderActions', 'next'])
    expect(fns['next']?.()).toBe(1)
  })

  // ── __init__ ────────────────────────────────────────────────────────────────

  it('__init__ 函数应被返回', () => {
    const script = `
      function __init__() { return 'initialized' }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns).toHaveProperty('__init__')
    expect(fns['__init__']!()).toBe('initialized')
  })

  it('未定义 __init__ 时不应出现在结果中', () => {
    const script = `
      function other() { return 1 }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns).not.toHaveProperty('__init__')
    expect(fns).toHaveProperty('other')
  })

  // ── 函数间互调 ───────────────────────────────────────────────────────────────

  it('函数之间可以相互调用', () => {
    const script = `
      function double(x) { return x * 2 }
      function quadruple(x) { return double(double(x)) }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['quadruple']!(3)).toBe(12)
  })

  // ── 沙箱上下文访问 ─────────────────────────────────────────────────────────

  it('函数应能访问沙箱上下文变量', () => {
    const ctx = createMockContext()
    const script = `
      function getDataSet() { return $page.getDataSet("SCENE") }
      function callPage() { $page.showMessage('hi', 'info'); return true }
    `
    const fns = compileFunctions(script, ctx)
    expect(fns['getDataSet']!()).toBeUndefined()
    expect(fns['callPage']!()).toBe(true)
    expect(ctx.$page.showMessage).toHaveBeenCalledWith('hi', 'info')
  })

  it('沙箱不注入旧 permission 转发命名空间', () => {
    const ctx = createMockContext()
    const fns = compileFunctions('function oldPermission() { return typeof permission }', ctx)
    expect(fns['oldPermission']!()).toBe('undefined')
  })
  it('应支持通过 $components 使用 ID 寻址访问组件信息', () => {
    const ctx = createMockContext({
      $components: {
        get: vi.fn((id: string) => id === 'orders-table' ? { id, type: 'r-table' } : null),
        list: vi.fn((type?: string) => type === 'r-table' ? [{ id: 'orders-table', type: 'r-table' }] : []),
        getApi: vi.fn(() => null),
        getApisByType: vi.fn(() => []),
      },
    })

    const script = `
      function getTableType() {
        var comp = $components.get('orders-table')
        return comp ? comp.type : 'none'
      }
      function countTables() {
        return $components.list('r-table').length
      }
    `

    const fns = compileFunctions(script, ctx)
    expect(fns['getTableType']!()).toBe('r-table')
    expect(fns['countTables']!()).toBe(1)
  })

  // ── 原型链安全（Proxy 拦截）─────────────────────────────────────────────────

  it('应拦截 __proto__ 访问（返回 undefined）', () => {
    const script = `
      function getProto() { return __proto__ }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getProto']!()).toBeUndefined()
  })

  it('应拦截 constructor 访问', () => {
    const script = `
      function getCtor() { return constructor }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getCtor']!()).toBeUndefined()
  })

  it('应拦截 globalThis 访问', () => {
    const script = `
      function getGlobal() { return globalThis }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getGlobal']!()).toBeUndefined()
  })

  it('应拦截 window 访问', () => {
    const script = `
      function getWindow() { return window }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getWindow']!()).toBeUndefined()
  })

  it('应拦截 eval 访问', () => {
    const script = `
      function getEval() { return eval }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getEval']!()).toBeUndefined()
  })

  it('应拦截 Function 构造函数访问', () => {
    const script = `
      function getFunc() { return Function }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getFunc']!()).toBeUndefined()
  })

  it('应拦截 process/require 访问（Node.js 环境逃逸）', () => {
    const script = `
      function getProcess() { return process }
      function getRequire() { return require }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(fns['getProcess']!()).toBeUndefined()
    expect(fns['getRequire']!()).toBeUndefined()
  })

  // ── 错误处理 ────────────────────────────────────────────────────────────────

  it('语法错误应抛出异常', () => {
    const script = `function broken( { return }`
    expect(() => compileFunctions(script, createMockContext())).toThrow()
  })

  it('运行时错误应抛出异常', () => {
    const script = `
      function willFail() { throw new Error('boom') }
    `
    const fns = compileFunctions(script, createMockContext())
    expect(() => fns['willFail']!()).toThrow('boom')
  })

  // ── with() 块级作用域：return 在块内，声明均可导出 ─────────────────────

  it('const 箭头函数声明可正常导出', () => {
    const script = `
      const hidden = () => 42
    `
    const fns = compileFunctions(script, createMockContext())
    // return 语句在 with 块内部，const 声明可正常访问
    expect(fns).toHaveProperty('hidden')
    expect(fns['hidden']!()).toBe(42)
  })

  it('async function 声明可正常导出', () => {
    const script = `
      async function asyncFn() { return 42 }
    `
    const fns = compileFunctions(script, createMockContext())
    // return 在 with 块内，async function 声明可正常访问
    expect(fns).toHaveProperty('asyncFn')
  })

  // ── SparkPageContext ─────────────────────────────────────

  it('PageContext 脚本可正常编译执行', () => {
    const ctx = createMockContext()
    const script = `
      function getRoute() { return $route.path }
      function callPage() { $page.showMessage('ok', 'success'); return true }
    `
    const fns = compileFunctions(script, ctx)
    expect(fns['getRoute']!()).toBe('/')
    expect(fns['callPage']!()).toBe(true)
    expect(ctx.$page.showMessage).toHaveBeenCalledWith('ok', 'success')
  })

  it('沙箱中访问未注入变量返回 undefined（安全代理）', () => {
    const ctx = createMockContext()
    const script = `
      function tryUnknown() { return typeof $unknownVar }
    `
    const fns = compileFunctions(script, ctx)
    // 未注入的变量通过 with 安全代理返回 undefined
    expect(fns['tryUnknown']!()).toBe('undefined')
  })
})
