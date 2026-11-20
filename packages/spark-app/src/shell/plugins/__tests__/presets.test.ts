import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getGlobalPluginRegistry } from '../registry'
import { registerBuiltinPlugins } from '../presets'

const namespaceDefaults = vi.hoisted((): { elementPlus: unknown; vxeTable: unknown } => ({
  elementPlus: { get install() { return () => {} } },
  vxeTable: { get install() { return () => {} } },
}))

vi.mock('element-plus', () => ({
  get default() {
    return namespaceDefaults.elementPlus
  },
  install: undefined,
}))

vi.mock('vxe-table', () => ({
  get default() {
    return namespaceDefaults.vxeTable
  },
  install: undefined,
}))

describe('built-in plugin presets', () => {
  const registry = getGlobalPluginRegistry()

  beforeEach(() => {
    namespaceDefaults.elementPlus = { get install() { return () => {} } }
    namespaceDefaults.vxeTable = { get install() { return () => {} } }
    registry.clear()
    registerBuiltinPlugins()
  })

  afterEach(() => {
    registry.clear()
  })

  it('preserves builtin registration names and default options', () => {
    expect(registry.getAllIds().sort()).toEqual(['element-plus', 'vxe-table'])
    expect(registry.get('element-plus')).toMatchObject({
      name: 'Element Plus',
      module: 'element-plus',
      defaultOptions: { size: 'default', zIndex: 2000 },
    })
    expect(registry.get('vxe-table')).toMatchObject({
      name: 'VXE Table',
      module: 'vxe-table',
      defaultOptions: {},
    })
  })

  it.each([
    ['element-plus', 'elementPlus'],
    ['vxe-table', 'vxeTable'],
  ] satisfies Array<readonly [string, 'elementPlus' | 'vxeTable']>)('loads %s when the module default is a namespace getter', async (id, fixtureName) => {
    const moduleNamespace = id === 'element-plus' ? await import('element-plus') : await import('vxe-table')
    expect(Object.getOwnPropertyDescriptor(moduleNamespace, 'default')?.get).toBeTypeOf('function')

    const loader = registry.get(id)
    if (loader === undefined) throw new Error(`Expected builtin loader ${id}`)
    const loadedModule = await loader.loader()
    const expectedPlugin = fixtureName === 'elementPlus'
      ? namespaceDefaults.elementPlus
      : namespaceDefaults.vxeTable

    expect(loadedModule.default).toBe(expectedPlugin)
  })

  it('rejects a namespace getter whose default is not a Vue plugin', async () => {
    namespaceDefaults.elementPlus = { install: 'not a function' }
    const moduleNamespace = await import('element-plus')
    expect(Object.getOwnPropertyDescriptor(moduleNamespace, 'default')?.get).toBeTypeOf('function')

    const loader = registry.get('element-plus')
    if (loader === undefined) throw new Error('Expected builtin loader element-plus')
    await expect(loader.loader()).rejects.toThrow('插件模块 element-plus 未提供有效的 Vue Plugin 默认导出')
  })
})
