import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, effectScope, h, nextTick, shallowRef, type Component } from 'vue'
import {
  DATA_SOURCE,
  PAGE_PERMISSION_MODE,
  SPARK_REGISTRY_KEY,
  Spark,
  RendererLink,
  RendererButton,
  useSparkComponent,
} from '@spark-appworks/spark-component'
import { SparkData, type DataView, type SparkNode } from '@spark-appworks/spark-data'
import { DataSpaceQueryTable } from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import { useActionButtonRuntime } from '../../../packages/spark-component/src/components/containers/layout/action/RendererButton/useActionButtonRuntime'
import type { BeforeRenderContext } from '../../../packages/spark-component/src/components/support/beforeRender'
import { createCurrentRowScope, createRowScope, createToolbarScope } from '../../../packages/spark-component/src/components/containers/support/scope/scopeFactories'
import { useDataViewState } from '../../../packages/spark-component/src/components/containers/data-views/view-runtime-state'

const ElLinkStub = defineComponent({
  props: ['type', 'underline', 'disabled', 'href', 'target'],
  setup(props, { slots }) {
    return () => h('a', {
      class: 'el-link-stub',
      'data-disabled': String(Boolean(props.disabled)),
      'data-href': String(props.href ?? ''),
    }, slots['default']?.())
  },
})

function mountRendererLinkWithDataSource(dataSource: DataView, componentProps?: Record<string, unknown>, component: Component = RendererLink) {
  const { registry, rootContext } = Spark.createSystem()

  const Provider = defineComponent({
    setup() {
      const node: SparkNode = { type: 'r-toolbar' }
      const { sparkProvide } = useSparkComponent(node, { parentContext: rootContext })
      sparkProvide(DATA_SOURCE, dataSource)
      sparkProvide(PAGE_PERMISSION_MODE, 'none')

      return () => h(component, {
        type: 'r-link',
        label: '批量删除',
        permissionDeniedMode: 'disable',
        ...(componentProps ?? {}),
      })
    },
  })

  return mount(Provider, {
    global: {
      stubs: {
        'el-link': ElLinkStub,
        'el-button': ElLinkStub,
      },
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      },
    },
  })
}

describe('RendererLink 权限作用域', () => {
  async function fixture(allowAdd = false) {
    let fail = false
    const dataSet = SparkData.createDataSet({
      dataSetName: 'RendererLinkPermissionDS',
      scenarioId: 'SCENE',
      tables: {
        Users: {
          tableName: 'Users',
          modelBinding: { modelId: 'MODEL', modelName: 'Users' },
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          views: {
            default: {
              page: 1,
            },
          },
        },
      },
    })

    const view = dataSet.getView('Users', 'default')!
    const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Users' })
    const context = new DataSpaceQueryContext({ identity: table.identity, scope: 'scene', readScope: () => 'scene',
      snapshot: table.applyResult({ Result: { primaryKeyField: 'id', allowAdd, data: {
        Items: [
          { id: 1, name: '允许行', lingma_sys_params: { e: ['name'], d: true, c: true } },
          { id: 2, name: '拒绝行', lingma_sys_params: { e: [], d: false, c: false } },
        ], Count: 2,
      } } }) })
    view.bindQueryExecutor({ executeQuery: async () => {
      if (fail) throw new Error('query failed')
      return context
    } })
    await view.loadFromServer()
    view.setCurrentRowById(1)
    return { dataSet, view, failQuery: () => { fail = true }, recoverQuery: () => { fail = false } }
  }

  it('beforeRender consumes DataView and receives no public permission snapshot', async () => {
    const { dataSet, view } = await fixture()
    view.setCurrentRowById(2)
    const hook = vi.fn((context: BeforeRenderContext) => ({
      disabled: context.dataSource?.fieldAccess(context.row ?? null, 'name').write !== 'allowed',
    }))
    const node: SparkNode = { type: 'r-button', props: { action: 'prompt-edit', field: 'name', onBeforeRender: hook } }
    const scope = effectScope()
    const runtime = scope.run(() => useActionButtonRuntime({ currentNode: computed(() => node),
      resolveView: () => view, resolveScopedRow: () => undefined,
      resolveContext: () => ({ getDataSet: () => dataSet, resolveView: () => view, getPageService: () => null, getRouter: () => null }),
      warn: vi.fn(),
    }))
    if (!runtime) throw new Error('missing action runtime')
    expect(runtime.hostActionDisabled.value).toBe(true)
    const context = hook.mock.calls[0]?.[0]
    expect(context?.dataSource).toBe(view)
    expect(context?.row).toBe(view.currentRow)
    expect(context && Object.hasOwn(context, 'permissionSnapshot')).toBe(false)
    scope.stop()
    dataSet.destroy()
  })

  it('container scopes retain DataView without forwarding a second permission object', async () => {
    const { dataSet, view } = await fixture()
    const row = view.rows[0]!
    const base = { dataSource: view }
    const contexts = [createToolbarScope(base, {}), createRowScope({ ...base, row, index: 0 }),
      createCurrentRowScope({ ...base, row })]
    for (const context of contexts) {
      expect(context.dataSource).toBe(view)
      expect(Object.hasOwn(context, 'permissionSnapshot')).toBe(false)
    }
    dataSet.destroy()
  })

  it('DataView UI state does not project the old public permission snapshot', async () => {
    const { dataSet, view } = await fixture()
    const scope = effectScope()
    const state = scope.run(() => useDataViewState(shallowRef(view)))
    expect(state && Object.hasOwn(state, 'permissionSnapshot')).toBe(false)
    expect(state?.rows.value).toEqual(view.rows)
    scope.stop()
    dataSet.destroy()
  })

  it('多选工具栏应按 selectedRows 做行权限裁决，而不是只看 currentRow', async () => {
    const { dataSet, view } = await fixture()
    view.setSelectedRows([view.rows[0]!])
    const wrapper = mountRendererLinkWithDataSource(view, {
      action: 'delete-selected',
    })
    const link = wrapper.find('.el-link-stub')
    expect(link.exists()).toBe(true)
    expect(link.attributes('data-disabled')).toBe('false')
    view.setSelectedRows(view.rows.slice())
    await nextTick()
    expect(link.attributes('data-disabled')).toBe('true')
    wrapper.unmount()
    dataSet.destroy()
  })

  it.each([RendererLink, RendererButton])('uses the original query for create and tree-parent permissions', async (component) => {
    const { dataSet, view } = await fixture(false)
    const create = mountRendererLinkWithDataSource(view, { permAction: 'create' }, component)
    expect(create.get('.el-link-stub').attributes('data-disabled')).toBe('true')
    const child = mountRendererLinkWithDataSource(view, { permAction: 'create-child' }, component)
    expect(child.get('.el-link-stub').attributes('data-disabled')).toBe('false')
    view.setCurrentRowById(2)
    view.setSelectedRows([view.rows[1]!])
    await nextTick()
    expect(child.get('.el-link-stub').attributes('data-disabled')).toBe('true')
    create.unmount()
    child.unmount()
    dataSet.destroy()
  })

  it.each([RendererLink, RendererButton])('does not authorize forged public row permissions in navigation mode none', async (component) => {
    const { dataSet, view } = await fixture()
    const row = view.rows[1]!
    row.lingma_sys_params = { e: ['name'], r: [], h: [], m: [], d: true }
    view.setCurrentRowById(2)
    view.setSelectedRows([row])
    const wrapper = mountRendererLinkWithDataSource(view, { permAction: 'delete' }, component)
    expect(wrapper.get('.el-link-stub').attributes('data-disabled')).toBe('true')
    wrapper.unmount()
    dataSet.destroy()
  })

  it.each([RendererLink, RendererButton])('pauses actions after query failure and restores them after successful delivery', async (component) => {
    const { dataSet, view, failQuery, recoverQuery } = await fixture()
    const wrapper = mountRendererLinkWithDataSource(view, { permAction: 'delete' }, component)
    expect(wrapper.get('.el-link-stub').attributes('data-disabled')).toBe('false')
    failQuery()
    await expect(view.loadFromServer()).rejects.toThrow('query failed')
    await nextTick()
    expect(wrapper.get('.el-link-stub').attributes('data-disabled')).toBe('true')
    recoverQuery()
    await view.loadFromServer()
    await nextTick()
    expect(wrapper.get('.el-link-stub').attributes('data-disabled')).toBe('false')
    wrapper.unmount()
    dataSet.destroy()
  })
})
