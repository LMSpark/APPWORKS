/**
 * @module app:services/page-design/page-design-operation-guard
 * 职责：按 allowedOperations 为 pageDesign 编辑器生成对象级受限门面，未放行操作域的方法调用即失败。
 * 边界：只拦截方法调用与 nodeTree 属性读取，不改变领域对象状态；交付保存与闸门评估仍使用原编辑器。
 * AI用途：排查 model_script 为何被拒绝调用某个编辑方法时，用本模块确认操作域映射。
 */
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type { PageDesignAllowedOperations } from '@/services/page-design/page-design-gates'

type OperationDomain = keyof PageDesignAllowedOperations

const METHOD_DOMAINS: Readonly<Record<string, OperationDomain>> = {
  editNodeTree: 'nodeTree',
  getNodeTree: 'nodeTree',
  nodeTree: 'nodeTree',
  loadScenarioViews: 'dataSet',
  createScenarioViews: 'dataSet',
  getScenarioViews: 'dataSet',
  saveScenarioViews: 'dataSet',
  replaceBlueprintChildren: 'blueprint',
  replaceBlueprintTree: 'blueprint',
  readBlueprintPlanningInputs: 'blueprint',
  readProjectPlanningInput: 'blueprint',
}

const FILE_METHODS = new Set(['setFileText', 'getFileText', 'writePageFile'])

const FILE_DOMAINS: Readonly<Record<string, OperationDomain>> = {
  'rule.json': 'nodeTree',
  'script.js': 'script',
  'style.css': 'style',
}

function readFileName(args: readonly unknown[]): string | undefined {
  const first = args[0]
  if (typeof first === 'string') return first
  if (first !== null && typeof first === 'object' && 'fileName' in first && typeof first.fileName === 'string') return first.fileName
  return undefined
}

function resolveDomain(name: string, args: readonly unknown[]): OperationDomain | undefined {
  if (FILE_METHODS.has(name)) {
    const fileName = readFileName(args)
    return fileName === undefined ? undefined : FILE_DOMAINS[fileName]
  }
  return METHOD_DOMAINS[name]
}

function isWrappable(value: unknown): value is object {
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value) || value instanceof Promise) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto !== null && proto !== Object.prototype
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return value instanceof Promise
}

function isValidProjectWorkspace(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false
  return 'project' in value && 'loadScenarioViews' in value
}

type WrapEditorContext = Readonly<{
  assertAllowed: (name: string, args: readonly unknown[]) => void
  wrapResult: (value: unknown) => unknown
  proxies: WeakMap<object, object>
}>

function wrapEditorTarget(target: ProjectWorkspace, context: WrapEditorContext): ProjectWorkspace
function wrapEditorTarget(target: object, context: WrapEditorContext): object
function wrapEditorTarget(target: object, context: WrapEditorContext): object {
  const cached = context.proxies.get(target)
  if (cached !== undefined) return cached
  const proxy = new Proxy(target, {
    get(raw, property) {
      const value: unknown = Reflect.get(raw, property, raw)
      if (typeof property !== 'string') return value
      if (typeof value === 'function') {
        return (...args: unknown[]): unknown => {
          context.assertAllowed(property, args)
          return context.wrapResult(Reflect.apply(value, raw, args))
        }
      }
      context.assertAllowed(property, [])
      return context.wrapResult(value)
    },
  })
  context.proxies.set(target, proxy)
  return proxy
}

/** 返回受限门面；allowedOperations 缺省时原样返回编辑器。 */
export function guardPageDesignEditor(editor: ProjectWorkspace, allowedOperations: PageDesignAllowedOperations | undefined): ProjectWorkspace {
  if (allowedOperations === undefined) return editor
  const proxies = new WeakMap<object, object>()
  const assertAllowed = (name: string, args: readonly unknown[]): void => {
    const domain = resolveDomain(name, args)
    if (domain !== undefined && allowedOperations[domain] === false) {
      throw new Error(`PAGE_DESIGN_OPERATION_FORBIDDEN: ${name} 属于未放行的操作域 ${domain}`)
    }
  }
  const wrapResult = (value: unknown): unknown => {
    if (isPromiseLike(value)) return value.then(wrapResult)
    if (isWrappable(value)) return wrapEditorTarget(value, { assertAllowed, wrapResult, proxies })
    return value
  }
  const facade = wrapEditorTarget(editor, { assertAllowed, wrapResult, proxies })
  if (!isValidProjectWorkspace(facade)) throw new Error('PAGE_DESIGN_GUARD_FAILED: 门面构造失败')
  return facade
}
