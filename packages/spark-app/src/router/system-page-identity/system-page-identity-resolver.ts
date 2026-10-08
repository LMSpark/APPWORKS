import type { Component } from 'vue'
import { shallowRef, type Ref } from 'vue'
import {
  parseQuery,
  type LocationQuery,
  type RouteLocationNormalizedLoaded,
  type Router,
} from 'vue-router'

import { SYSTEM_PAGE_NAVIGATION_ID_QUERY, type RuntimeNavigationItem } from '../../navigation/runtime-navigation'
import { SystemPageIdentityPool, type SystemPageInstance } from './system-page-identity-pool'

export type SystemPageIdentityScope = 'public' | 'tenant' | 'platform'

export type SystemPageIdentityOwner = Readonly<{
  scope: SystemPageIdentityScope
  path: string
  projectId?: string
  nodeId: string
  title: string
  pageId: string
  description?: string
  icon?: string
  permissionMode?: RuntimeNavigationItem['permissionMode']
  explicitQuery: LocationQuery
  blueprintScenarioId?: string
  component: Component
}>

export type SystemPageIdentityOwnerInput = Readonly<{
  scope: SystemPageIdentityScope
  path: string
  projectId?: string
  node: RuntimeNavigationItem
  pageId: string
  component: Component
}>

type ResolvedIdentity = Readonly<{
  owner: SystemPageIdentityOwner | null
  error: string | null
}>

function readExplicitQuery(path: string): LocationQuery {
  const hashIndex = path.indexOf('#')
  const target = path.slice(0, hashIndex < 0 ? undefined : hashIndex)
  const queryIndex = target.indexOf('?')
  return queryIndex < 0 ? {} : parseQuery(target.slice(queryIndex + 1))
}

function sameQueryValue(left: LocationQuery[string] | undefined, right: LocationQuery[string]): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => value === right[index])
  }
  return left === right
}

function explicitQueryMatches(owner: SystemPageIdentityOwner, query: LocationQuery): boolean {
  return Object.entries(owner.explicitQuery).every(([key, expected]) => (
    Object.prototype.hasOwnProperty.call(query, key)
    && query[key] !== undefined
    && sameQueryValue(query[key], expected)
  ))
}

function resolveOwner(
  candidates: readonly SystemPageIdentityOwner[],
  query: LocationQuery,
): ResolvedIdentity {
  const hasMarker = Object.prototype.hasOwnProperty.call(query, SYSTEM_PAGE_NAVIGATION_ID_QUERY)
  if (hasMarker) {
    const marker = query[SYSTEM_PAGE_NAVIGATION_ID_QUERY]
    if (typeof marker !== 'string' || marker.trim() === '') {
      return { owner: null, error: '页面身份标记无效，请从导航菜单重新选择。' }
    }
    const matches = candidates.filter(owner => owner.nodeId === marker)
    if (matches.length !== 1) return { owner: null, error: '页面身份标记未命中当前导航，请从导航菜单重新选择。' }
    const owner = matches[0]
    if (!owner) return { owner: null, error: '页面身份标记未命中当前导航，请从导航菜单重新选择。' }
    return explicitQueryMatches(owner, query)
      ? { owner, error: null }
      : { owner: null, error: '页面身份与显式目标参数冲突，请从导航菜单重新选择。' }
  }

  const scored = candidates.flatMap(owner => {
    const configuredEntries = Object.entries(owner.explicitQuery)
      .filter(([key]) => key !== SYSTEM_PAGE_NAVIGATION_ID_QUERY)
    if (!explicitQueryMatches(owner, query)) return []
    return [{ owner, score: configuredEntries.reduce((count, [, value]) => count + (Array.isArray(value) ? value.length : 1), 0) }]
  })
  if (scored.length === 0) return { owner: null, error: '当前路径没有可用的导航身份，请从导航菜单重新选择。' }
  const highestScore = Math.max(...scored.map(candidate => candidate.score))
  const winners = scored.filter(candidate => candidate.score === highestScore)
  return winners.length === 1
    ? { owner: winners[0]?.owner ?? null, error: null }
    : { owner: null, error: '当前路径对应多个导航项，请从导航菜单重新选择。' }
}

function applyResolvedOwner(route: RouteLocationNormalizedLoaded, result: ResolvedIdentity): void {
  if (result.owner === null) {
    route.meta['systemPageIdentityState'] = 'error'
    route.meta['systemPageIdentityError'] = result.error
    delete route.meta['nodeId']
    delete route.meta['title']
    delete route.meta['pageId']
    delete route.meta['description']
    delete route.meta['icon']
    delete route.meta['permissionMode']
    delete route.meta['blueprintScenarioId']
    return
  }
  route.meta['systemPageIdentityState'] = 'resolved'
  route.meta['systemPageIdentityError'] = null
  route.meta['nodeId'] = result.owner.nodeId
  route.meta['title'] = result.owner.title
  route.meta['pageId'] = result.owner.pageId
  route.meta['description'] = result.owner.description
  route.meta['icon'] = result.owner.icon
  route.meta['permissionMode'] = result.owner.permissionMode
  route.meta['blueprintScenarioId'] = result.owner.blueprintScenarioId
}

export class SystemPageIdentityResolver {
  static readonly #instances = new WeakMap<Router, SystemPageIdentityResolver>()

  #owners: readonly SystemPageIdentityOwner[] = []
  #revision = shallowRef(0)
  #pool = new SystemPageIdentityPool()
  #locked = false
  #router: Router

  private constructor(router: Router) {
    this.#router = router
    router.beforeResolve((to) => {
      if (to.meta['systemPageIdentityHost'] !== true) return
      if (this.#locked) {
        applyResolvedOwner(to, { owner: null, error: '应用范围正在切换，请等待新页面身份提交后重新选择。' })
        return
      }
      const scope = to.meta['systemPageIdentityScope']
      const path = to.meta['systemPageIdentityPath']
      if ((scope !== 'public' && scope !== 'tenant' && scope !== 'platform') || typeof path !== 'string') {
        applyResolvedOwner(to, { owner: null, error: '页面身份范围无效，请从导航菜单重新选择。' })
        return
      }
      const routeProjectId = to.params['projectId']
      const candidates = this.#owners.filter(owner => (
        owner.scope === scope
        && owner.path === path
        && (scope !== 'tenant' || owner.projectId === undefined || typeof routeProjectId !== 'string' || owner.projectId === routeProjectId)
      ))
      applyResolvedOwner(to, resolveOwner(candidates, to.query))
    })
  }

  static forRouter(router: Router): SystemPageIdentityResolver {
    let resolver = this.#instances.get(router)
    if (!resolver) {
      resolver = new SystemPageIdentityResolver(router)
      this.#instances.set(router, resolver)
    }
    return resolver
  }

  replaceOwners(owners: readonly SystemPageIdentityOwner[]): void {
    const previousOwners = this.#owners
    this.#owners = owners
    this.#locked = false
    this.#pool.reconcile(owners)
    const current = this.#router.currentRoute.value
    if (current.meta['systemPageIdentityHost'] === true) {
      const scope = current.meta['systemPageIdentityScope']
      const path = current.meta['systemPageIdentityPath']
      const nodeId = current.meta['nodeId']
      if (typeof scope === 'string' && typeof path === 'string' && typeof nodeId === 'string') {
        const previous = previousOwners.find(owner => owner.scope === scope && owner.path === path && owner.nodeId === nodeId)
        const selected = owners.filter(owner => owner.scope === scope && owner.path === path && owner.nodeId === nodeId
          && (owner.scope !== 'tenant' || owner.projectId === undefined || current.params['projectId'] === owner.projectId))
        const candidate = selected.length === 1 ? selected[0] : undefined
        const owner = candidate && previous && sameOwnerBinding(previous, candidate)
          && explicitQueryMatches(candidate, current.query) ? candidate : null
        applyResolvedOwner(current, owner ? { owner, error: null } : { owner: null, error: '原页面身份已失效，请从导航菜单重新选择。' })
      } else {
        applyResolvedOwner(current, { owner: null, error: '原页面身份已失效，请从导航菜单重新选择。' })
      }
    }
    this.#revision.value++
  }

  get revision(): Readonly<Ref<number>> { return this.#revision }

  getInstance(route: RouteLocationNormalizedLoaded): SystemPageInstance | undefined {
    if (this.#locked || route.meta['systemPageIdentityState'] !== 'resolved') return undefined
    const scope = route.meta['systemPageIdentityScope']
    const path = route.meta['systemPageIdentityPath']
    const nodeId = route.meta['nodeId']
    if (typeof scope !== 'string' || typeof path !== 'string' || typeof nodeId !== 'string') return undefined
    const marker = route.query[SYSTEM_PAGE_NAVIGATION_ID_QUERY]
    if (marker !== undefined && marker !== nodeId) return undefined
    const matching = this.#owners.filter(owner => (
      owner.scope === scope && owner.path === path && owner.nodeId === nodeId
      && (owner.scope !== 'tenant' || owner.projectId === undefined || route.params['projectId'] === owner.projectId)
      && explicitQueryMatches(owner, route.query)
    ))
    if (matching.length !== 1) return undefined
    const owner = matching[0]
    return owner === undefined ? undefined : this.#pool.get(route, owner)
  }

  getInstanceById(instanceId: string): SystemPageInstance | undefined {
    return this.#pool.getById(instanceId)
  }

  closeInstance(instanceId: string): void {
    if (this.#pool.close(instanceId)) this.#revision.value++
  }

  resetInstances(): void {
    this.#locked = true
    this.#pool.reset()
    const current = this.#router.currentRoute.value
    if (current.meta['systemPageIdentityHost'] === true) {
      applyResolvedOwner(current, { owner: null, error: '应用范围已切换，请重新选择页面。' })
    }
    this.#revision.value++
  }

  createOwner(input: SystemPageIdentityOwnerInput): SystemPageIdentityOwner {
    const explicitQuery = readExplicitQuery(input.node.path ?? input.path)
    if (Object.prototype.hasOwnProperty.call(explicitQuery, SYSTEM_PAGE_NAVIGATION_ID_QUERY)) {
      throw new Error(`系统页面目标使用保留身份参数：${input.node.id}`)
    }
    return {
      scope: input.scope,
      path: input.path,
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      nodeId: input.node.id,
      title: input.node.title,
      pageId: input.pageId,
      ...(input.node.description === undefined ? {} : { description: input.node.description }),
      ...(input.node.icon === undefined ? {} : { icon: input.node.icon }),
      ...(input.node.permissionMode === undefined ? {} : { permissionMode: input.node.permissionMode }),
      explicitQuery,
      ...(input.node.blueprintScenarioId === undefined ? {} : { blueprintScenarioId: input.node.blueprintScenarioId }),
      component: input.component,
    }
  }

  hostRouteName(scope: SystemPageIdentityScope, path: string): string {
    return `spark-system-page-host:${scope}:${path}`
  }

  hostRouteMeta(scope: SystemPageIdentityScope, path: string): Record<string, unknown> {
    return {
      type: 'system-page',
      systemPageIdentityHost: true,
      systemPageIdentityScope: scope,
      systemPageIdentityPath: path,
    }
  }

  resolveComponent(route: RouteLocationNormalizedLoaded): Component | undefined {
    return this.getInstance(route)?.view
  }
}

function sameOwnerBinding(left: SystemPageIdentityOwner, right: SystemPageIdentityOwner): boolean {
  return left.scope === right.scope && left.path === right.path && left.projectId === right.projectId
    && left.nodeId === right.nodeId && left.pageId === right.pageId && left.component === right.component
    && left.permissionMode === right.permissionMode && left.blueprintScenarioId === right.blueprintScenarioId
    && sameExplicitQuery(left.explicitQuery, right.explicitQuery)
}

function sameExplicitQuery(left: LocationQuery, right: LocationQuery): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => {
    const rightValue = right[key]
    return key === rightKeys[index] && rightValue !== undefined && sameQueryValue(left[key], rightValue)
  })
}
