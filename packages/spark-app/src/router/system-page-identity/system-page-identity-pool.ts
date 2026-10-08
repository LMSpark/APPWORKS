import { defineComponent, h, markRaw, provide, type Component } from 'vue'
import { routeLocationKey, type RouteLocationNormalizedLoaded } from 'vue-router'

import type { SystemPageIdentityOwner } from './system-page-identity-resolver'
import { SYSTEM_PAGE_NAVIGATION_ID_QUERY } from '../../navigation/runtime-navigation'

type SystemPageRouteKeyInput = Readonly<{
  scope: string
  tenantId?: string
  projectId?: string
  nodeId: string
  path: string
  query: Readonly<Record<string, unknown>>
  hash: string
}>

export type SystemPageInstance = Readonly<{
  instanceId: string
  componentName: string
  view: Component
}>

type SystemPagePoolEntry = Readonly<{
  instanceId: string
  componentName: string
  view: Component
  owner: SystemPageIdentityOwner
  key: string
  fingerprint: string
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
  return JSON.stringify([input.scope, input.tenantId ?? null, input.projectId ?? null, input.nodeId, input.path, stableValue(query), input.hash])
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

export class SystemPageIdentityPool {
  #instances = new Map<string, SystemPagePoolEntry>()
  #nextId = 0

  get(route: RouteLocationNormalizedLoaded, owner: SystemPageIdentityOwner): SystemPageInstance {
    const tenantId = typeof route.params['tenantId'] === 'string' ? route.params['tenantId'] : undefined
    const projectId = typeof route.params['projectId'] === 'string' ? route.params['projectId'] : owner.projectId
    const key = canonicalSystemPageRouteKey({
      scope: owner.scope,
      ...(tenantId === undefined ? {} : { tenantId }),
      ...(projectId === undefined ? {} : { projectId }),
      nodeId: owner.nodeId,
      path: route.path,
      query: route.query,
      hash: route.hash,
    })
    const fingerprint = ownerFingerprint(owner)
    const existing = this.#instances.get(key)
    if (existing?.fingerprint === fingerprint && existing.owner.component === owner.component) {
      return { instanceId: existing.instanceId, componentName: existing.componentName, view: existing.view }
    }
    if (existing) this.#instances.delete(key)

    const instanceId = `system-page-${++this.#nextId}`
    const componentName = uniqueComponentName()
    const snapshot = snapshotRoute(route)
    const view = markRaw(defineComponent({
      name: componentName,
      setup(_, { attrs, slots }) {
        provide(routeLocationKey, snapshot)
        return () => h(owner.component, { ...attrs }, slots)
      },
    }))
    const instance: SystemPagePoolEntry = { instanceId, componentName, view, owner, key, fingerprint }
    this.#instances.set(key, instance)
    return { instanceId, componentName, view }
  }

  getById(instanceId: string): SystemPageInstance | undefined {
    const instance = [...this.#instances.values()].find(candidate => candidate.instanceId === instanceId)
    return instance === undefined ? undefined : {
      instanceId: instance.instanceId,
      componentName: instance.componentName,
      view: instance.view,
    }
  }

  close(instanceId: string): boolean {
    for (const [key, instance] of this.#instances) {
      if (instance.instanceId !== instanceId) continue
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
