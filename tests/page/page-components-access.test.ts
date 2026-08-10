import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { buildPageContext } from '../../packages/spark-component/src/page/context/buildPageContext'
import { compileFunctions } from '../../packages/spark-component/src/page/createSandbox'
import { createPageComponentRegistry } from '../../packages/spark-component/src/page/context/page-component-registry'
import type { PageDialogOptions, PageDialogResult, PageServiceCapability } from '@spark-appworks/spark-component'

const mockPageService: PageServiceCapability = {
  showDialog: vi.fn(async (_options: PageDialogOptions): Promise<PageDialogResult> => 'close'),
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

describe('PageContext $components (metadata only)', () => {
  it('should resolve component instance by id and list by type', () => {
    const registry = createPageComponentRegistry()
    registry.registerInstance({ id: 'orders-table', type: 'r-table' })
    registry.registerApi({
      id: 'orders-table',
      type: 'r-table',
      api: { refresh: () => 'ok' },
    })

    const context = buildPageContext({
      getDataSet: () => null,
      getComponentRegistry: () => registry,
      pageRoute: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
      pageContainer: ref<HTMLElement | null>(null),
      pageService: mockPageService,
    })

    const instance = context.$components.get('orders-table')
    expect(instance?.id).toBe('orders-table')
    expect(instance?.type).toBe('r-table')

    expect(context.$components.list('r-table')).toHaveLength(1)
    expect(context.$components.list()).toHaveLength(1)
  })

  it('should return null for unknown id', () => {
    const registry = createPageComponentRegistry()
    const context = buildPageContext({
      getDataSet: () => null,
      getComponentRegistry: () => registry,
      pageRoute: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
      pageContainer: ref<HTMLElement | null>(null),
      pageService: mockPageService,
    })

    expect(context.$components.get('nonexistent')).toBeNull()
    expect(context.$components.list('r-table')).toHaveLength(0)
  })

  it('should expose permission helpers to page scripts', () => {
    const context = buildPageContext({
      getDataSet: () => null,
      pageRoute: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
      pageContainer: ref<HTMLElement | null>(null),
      pageService: mockPageService,
    })

    expect(context.permission.isPermittedAction('create', {
      permissionSnapshot: {
        formKey: 'FORM', dataSpaceId: 'SPACE', modelId: 'MODEL', allowAdd: true,
        systemKey: 'SYSTEM', originalRows: [], authorizedFeatureTags: [],
      },
    })).toBe(true)

    const state = context.permission.resolveFieldPermissionState('name', {
      id: 1,
      name: 'Alice',
      lingma_sys_params: { r: [], e: ['name'], h: [], m: [], d: false },
    })
    expect(state?.editable).toBe(true)
  })

  it('should allow compiled scripts to call injected permission helpers', () => {
    const context = buildPageContext({
      getDataSet: () => null,
      pageRoute: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
      pageContainer: ref<HTMLElement | null>(null),
      pageService: mockPageService,
    })

    const fns = compileFunctions(`
      function canCreate() {
        return permission.isPermittedAction('create', {
          permissionSnapshot: {
            formKey: 'FORM', dataSpaceId: 'SPACE', modelId: 'MODEL', allowAdd: true,
            systemKey: 'SYSTEM', originalRows: [], authorizedFeatureTags: []
          }
        })
      }

      function canEditField() {
        var state = permission.resolveFieldPermissionState('name', {
          id: 1,
          name: 'Alice',
          lingma_sys_params: { r: [], e: ['name'], h: [], m: [], d: false }
        })
        return state ? state.editable : false
      }
    `, context)

    expect(fns['canCreate']!()).toBe(true)
    expect(fns['canEditField']!()).toBe(true)
  })
})
