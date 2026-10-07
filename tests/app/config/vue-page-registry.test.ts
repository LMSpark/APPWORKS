import { describe, expect, it } from 'vitest'

import {
  buildPreAuthNavTree,
  getVuePageEntry,
  getPublicPaths,
  getVuePageOptions,
  hasVuePage,
} from '@/registries/vue-page-registry'

describe('Vue page registry', () => {
  it('binds JSON page declarations to route metadata', () => {
    const publicPaths = getPublicPaths()
    const navTree = buildPreAuthNavTree()
    const options = getVuePageOptions()
    const homePage = getVuePageEntry('/')

    expect(homePage?.source).toBe('src/views/platform/HomePage.vue')
    expect(typeof homePage?.load).toBe('function')
    expect(hasVuePage('/about')).toBe(true)
    expect(hasVuePage('/missing')).toBe(false)
    expect(publicPaths.has('/login')).toBe(true)
    expect(publicPaths.has('/dashboard')).toBe(false)
    expect(navTree.homePath).toBe('/')
    expect(navTree.items.some(node => node.path === '/about')).toBe(true)
    expect(options.some(option => option.path === '/dev' && option.scope === 'app')).toBe(true)
    expect(options.some(option => option.path === '/workflow-designs' && option.source === 'src/views/app/WorkflowDesigns.vue')).toBe(true)
    expect(getVuePageEntry('/features/system/cache-management/ui/cache-management-page')?.source)
      .toBe('src/views/tenant/CacheManager.vue')
    expect(options.find(option => option.path === '/features/system/cache-management/ui/cache-management-page')?.shellTool)
      .toBe(false)
    expect([
      '/features/data-platform/database-management/ui/service-management-page',
      '/DataBaseManage/DataBaseManage/index',
      '/features/data-platform/database-management/table-and-view/ui/table-and-view-page',
    ].every(path => getVuePageEntry(path)?.source === 'src/views/app/DBMS.vue')).toBe(true)
    expect(getVuePageEntry('/features/application/application-manager/ui/application-manager-page')?.source)
      .toBe('src/views/tenant/AppList.vue')
  })
})
