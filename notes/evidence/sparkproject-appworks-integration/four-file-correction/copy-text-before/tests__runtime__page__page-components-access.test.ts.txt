import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { flushPromises } from '@vue/test-utils'
import { buildPageService } from '../../../packages/spark-component/src/page/services/buildPageService'
import { buildPageContext } from '../../../packages/spark-component/src/page/context/buildPageContext'
import { compileFunctions } from '../../../packages/spark-component/src/page/createSandbox'
import { createPageComponentRegistry } from '../../../packages/spark-component/src/page/context/page-component-registry'
import type { PageDialogOptions, PageDialogResult, PageServiceCapability } from '@spark-appworks/spark-component'
import { SparkData } from '@spark-appworks/spark-data'
import { PageRuntime, PageTool } from '@spark-appworks/spark-project-model'
import type { DataSet } from '@spark-appworks/spark-data'
import { DataSpaceQueryTable } from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

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

function contextRuntime(dataSet?: DataSet): PageRuntime {
  const tool = new PageTool({ pageId: 'tool' })
  tool.hydrateFileText('rule.json', '[]')
  tool.markLoaded()
  const scenarioId = dataSet?.scenarioId
  if (dataSet !== undefined && scenarioId === undefined) throw new Error('fixture requires scenarioId')
  return new PageRuntime({ tool, scenarioIds: scenarioId === undefined ? [] : [scenarioId],
    loadScenario: async () => { if (dataSet === undefined) throw new Error('unexpected scene'); return dataSet } })
}

describe('PageContext $components (metadata only)', () => {
  it('preserves repeated scenario arguments and primitive query values when scripts navigate', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/tool', component: { render: () => null } }] })
    const service = buildPageService(router)
    service.navigate('/tool', { scenarioId: 'S1', additionalScenarioIds: ['S2', 'S3'], blank: '', zero: 0, enabled: false, bare: null })
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ scenarioId: 'S1', additionalScenarioIds: ['S2', 'S3'], blank: '', zero: '0', enabled: 'false', bare: null })
  })
  it('should resolve component instance by id and list by type', () => {
    const registry = createPageComponentRegistry()
    registry.registerInstance({ id: 'orders-table', type: 'r-table' })
    registry.registerApi({
      id: 'orders-table',
      type: 'r-table',
      api: { refresh: () => 'ok' },
    })

    const context = buildPageContext({
      pageRuntime: contextRuntime(), signal: new AbortController().signal,
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
      pageRuntime: contextRuntime(), signal: new AbortController().signal,
      getComponentRegistry: () => registry,
      pageRoute: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
      pageContainer: ref<HTMLElement | null>(null),
      pageService: mockPageService,
    })

    expect(context.$components.get('nonexistent')).toBeNull()
    expect(context.$components.list('r-table')).toHaveLength(0)
  })

  it('does not expose a second permission namespace to page scripts', () => {
    const context = buildPageContext({
      pageRuntime: contextRuntime(), signal: new AbortController().signal,
      pageRoute: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
      pageContainer: ref<HTMLElement | null>(null),
      pageService: mockPageService,
    })

    expect(Object.hasOwn(context, 'permission')).toBe(false)
    const fns = compileFunctions('function oldPermission() { return typeof permission }', context)
    expect(fns['oldPermission']!()).toBe('undefined')
  })

  it('compiled scripts consume the current DataView query owner and ignore public authorization', async () => {
    const ds = SparkData.createDataSet({ dataSetName: 'ScriptDS', scenarioId: 'SCENE', tables: {
      Users: { tableName: 'Users', modelBinding: { modelId: 'MODEL', modelName: 'Users' },
        columns: [{ name: 'id', type: 'string', isPrimaryKey: true }, { name: 'name', type: 'string' }],
        views: { default: { autoCurrentFirst: false, autoSelectFirst: false } },
      },
    } })
    const view = ds.getView('Users', 'default')
    if (!view) throw new Error('missing test view')
    let scope = 'script'
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Users' })
    const result = new DataSpaceQueryContext({ identity: table.identity, scope, readScope: () => scope,
      snapshot: table.applyResult({ Result: { primaryKeyField: 'id', allowAdd: true, data: { Items: [
        { id: 'editable', name: null, lingma_sys_params: { e: ['name'], r: ['name'], h: ['name'], m: [], d: true, c: true } },
        { id: 'readonly', name: 'Bob', lingma_sys_params: { e: [], r: [], h: [], m: [], d: false, c: false } },
      ], Count: 2 } } }),
    })
    view.bindQueryExecutor({ executeQuery: async () => result })
    await view.loadFromServer()
    const runtime = contextRuntime(ds)
    await runtime.load()
    const context = buildPageContext({
      pageRuntime: runtime, signal: new AbortController().signal,
      pageRoute: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
      pageContainer: ref<HTMLElement | null>(null),
      pageService: mockPageService,
    })

    const fns = compileFunctions(`
      function canCreate() {
        return $page.resolveView('#SCENE@Users@default').addActionState()
      }
      function fieldAccess(row) {
        return $page.resolveView('#SCENE@Users@default').fieldAccess(row, 'name')
      }
      function rowActions(row) {
        var view = $page.resolveView('#SCENE@Users@default')
        return [view.editActionState(row), view.deleteActionState(row), view.createChildActionState(row)]
      }
    `, context)

    expect(fns['canCreate']!()).toBe('enabled')
    expect(fns['fieldAccess']!({ id: 'editable' })).toMatchObject({ write: 'allowed', required: true, read: 'invisible' })
    expect(fns['rowActions']!({ id: 'editable' })).toEqual(['enabled', 'enabled', 'enabled'])
    const forged = { id: 'readonly', name: 'Bob', lingma_sys_params: { e: ['name'], r: ['name'], h: [], m: [], d: true } }
    expect(fns['fieldAccess']!(forged)).toMatchObject({ write: 'denied', required: false })
    expect(fns['rowActions']!(forged)).toEqual(['hidden', 'hidden', 'hidden'])
    expect(fns['fieldAccess']!({ ...forged, id: 'unknown' })).toMatchObject({ write: 'denied', read: 'invisible' })
    scope = 'another request identity'
    expect(() => fns['fieldAccess']!({ id: 'editable' })).toThrow('SPARK_QUERY_CONTEXT_STALE')
    expect(() => fns['canCreate']!()).toThrow('SPARK_QUERY_CONTEXT_STALE')
    view.destroy()
  })
})
