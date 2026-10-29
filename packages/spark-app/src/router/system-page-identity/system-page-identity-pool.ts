/**
 * @module @spark-appworks/spark-app:router/system-page-identity/system-page-identity-pool
 * 职责：按导航身份与调用参数隔离原生系统页及其路由快照。
 * 边界：脏状态由页面owner提供；实例池不保存业务草稿，不阻止强制身份撤销。
 * AI用途：定位原生页标签复用、关闭保护和生命周期释放。
 */
import { defineComponent, h, inject, markRaw, onScopeDispose, provide, type Component, type InjectionKey } from 'vue'
import { routeLocationKey, type RouteLocationNormalizedLoaded } from 'vue-router'

import type { SystemPageIdentityOwner } from './system-page-identity-resolver'
import { SYSTEM_PAGE_NAVIGATION_ID_QUERY } from '../../navigation/runtime-navigation'

type SystemPageRouteKeyInput = Readonly<{
  scope: string
  projectId?: string
  nodeId: string
  path: string
  query: Readonly<Record<string, unknown>>
  hash: string
}>

/** 系统页实例的公开投影，不暴露导航owner、缓存键或内部脏源集合。 */
export type SystemPageInstance = Readonly<{
  /** 当前调用实例身份，同页面不同参数分离。 */
  instanceId: string
  /** KeepAlive使用的独立组件名称。 */
  componentName: string
  /** 提供本次不可变路由快照的宿主组件。 */
  view: Component
  /** 原生页草稿或待核验提交仍由页面owner持有；壳只读取是否允许释放。 */
  isDirty: boolean
}>

/** 原owner的只读释放条件；可用getter反映草稿、在途或待核验提交。 */
type SystemPageDirtySource = Readonly<{
  /** true表示主动关闭或切换作用域前仍需处理；不表示数据权限。 */
  isDirty: boolean
}>
const dirtySourcesKey: InjectionKey<Set<SystemPageDirtySource>> = Symbol('system-page-dirty-sources')

/** 在系统页setup中登记原owner的脏状态；只保护该调用实例，不复制草稿或承担保存。 */
export function useSystemPageDirtySource(source: SystemPageDirtySource): void {
  const sources = inject(dirtySourcesKey)
  if (!sources) throw new Error('SYSTEM_PAGE_OWNER_REQUIRED: 原生编辑页缺少系统页实例owner')
  sources.add(source)
  onScopeDispose(() => sources.delete(source))
}

type SystemPagePoolEntry = Readonly<{
  instanceId: string
  componentName: string
  view: Component
  owner: SystemPageIdentityOwner
  key: string
  fingerprint: string
  isDirty: boolean
}>

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(Reflect.get(value, key))]))
  }
  return value
}

function canonicalSystemPageRouteKey(input: SystemPageRouteKeyInput): string {
  const query = Object.fromEntries(Object.entries(input.query)
    .filter(([key]) => key !== SYSTEM_PAGE_NAVIGATION_ID_QUERY)
    .sort(([left], [right]) => left.localeCompare(right)))
  return JSON.stringify([input.scope, input.projectId ?? null, input.nodeId, input.path, stableValue(query), input.hash])
}

function ownerFingerprint(owner: SystemPageIdentityOwner): string {
  return JSON.stringify([
    owner.scope, owner.projectId ?? null, owner.path, owner.nodeId, owner.pageId,
    owner.permissionMode ?? null, stableValue(owner.explicitQuery), owner.blueprintScenarioId ?? null,
  ])
}

function cloneSnapshotValue<T extends object>(value: T): T
function cloneSnapshotValue(value: unknown): unknown
function cloneSnapshotValue(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneSnapshotValue))
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return cloneSnapshotObject(value)
  return value
}

function cloneSnapshotObject<T extends object>(value: T): T
function cloneSnapshotObject(value: object): object {
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneSnapshotValue(child)])))
}

function snapshotRoute(route: RouteLocationNormalizedLoaded): RouteLocationNormalizedLoaded {
  const query = cloneSnapshotValue(route.query)
  const params = cloneSnapshotValue(route.params)
  const meta = cloneSnapshotValue(route.meta)
  const snapshot: RouteLocationNormalizedLoaded = {
    ...route,
    params,
    query,
    meta,
    matched: [...route.matched],
  }
  return Object.freeze(snapshot)
}

function uniqueComponentName(): string {
  return `SparkSystemPage_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function instanceView(instance: SystemPagePoolEntry): SystemPageInstance {
  return {instanceId: instance.instanceId, componentName: instance.componentName, view: instance.view,
    get isDirty() {return instance.isDirty}}
}

export class SystemPageIdentityPool {
  #instances = new Map<string, SystemPagePoolEntry>()
  #nextId = 0

  get(route: RouteLocationNormalizedLoaded, owner: SystemPageIdentityOwner): SystemPageInstance {
    const projectId = typeof route.params['projectId'] === 'string' ? route.params['projectId'] : owner.projectId
    const key = canonicalSystemPageRouteKey({
      scope: owner.scope,
      ...(projectId === undefined ? {} : { projectId }),
      nodeId: owner.nodeId,
      path: route.path,
      query: route.query,
      hash: route.hash,
    })
    const fingerprint = ownerFingerprint(owner)
    const existing = this.#instances.get(key)
    if (existing?.fingerprint === fingerprint && existing.owner.component === owner.component) {
      return instanceView(existing)
    }
    if (existing) this.#instances.delete(key)

    const instanceId = `system-page-${++this.#nextId}`
    const componentName = uniqueComponentName()
    const snapshot = snapshotRoute(route)
    const sources = new Set<SystemPageDirtySource>()
    const view = markRaw(defineComponent({
      name: componentName,
      setup(_, { attrs, slots }) {
        provide(routeLocationKey, snapshot)
        provide(dirtySourcesKey, sources)
        return () => h(owner.component, { ...attrs }, slots)
      },
    }))
    const instance: SystemPagePoolEntry = { instanceId, componentName, view, owner, key, fingerprint,
      get isDirty() { return [...sources].some(source => source.isDirty) } }
    this.#instances.set(key, instance)
    return instanceView(instance)
  }

  getById(instanceId: string): SystemPageInstance | undefined {
    const instance = [...this.#instances.values()].find(candidate => candidate.instanceId === instanceId)
    return instance === undefined ? undefined : instanceView(instance)
  }

  /** 应用切换等主动释放前检查；身份撤销与强制退出仍直接清除实例。 */
  assertClean(): void {
    if ([...this.#instances.values()].some(instance => instance.isDirty)) throw new Error('系统页面有未保存修改或待核验提交，必须先保存或明确处理')
  }

  close(instanceId: string): boolean {
    for (const [key, instance] of this.#instances) {
      if (instance.instanceId !== instanceId) continue
      if (instance.isDirty) throw new Error('系统页面有未保存修改或待核验提交，必须先保存或明确处理')
      this.#instances.delete(key)
      return true
    }
    return false
  }

  reconcile(owners: readonly SystemPageIdentityOwner[]): boolean {
    let changed = false
    for (const [key, instance] of this.#instances) {
      const matchingOwner = owners.find(owner => owner.nodeId === instance.owner.nodeId
        && `${owner.nodeId}:${ownerFingerprint(owner)}` === `${instance.owner.nodeId}:${instance.fingerprint}`
        && owner.component === instance.owner.component)
      if (matchingOwner) continue
      this.#instances.delete(key)
      changed = true
    }
    return changed
  }

  reset(): boolean {
    const changed = this.#instances.size > 0
    this.#instances.clear()
    return changed
  }
}
