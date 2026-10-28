import { describe, expect, it } from 'vitest'
import { config, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, markRaw } from 'vue'
import ElementPlus from 'element-plus'
import { RendererToolbar, RendererList, RendererTable, RendererSection, RendererButton, FieldText, PAGE_RUNTIME, Spark, useSparkComponent } from '@spark-appworks/spark-component'
import { defineCapability } from '@spark-appworks/spark-utils'
import { SparkData, getSparkNodeChildren, nodeInputProps, isSparkNode } from '@spark-appworks/spark-data'
import type { DataRow, DataView, SparkNode } from '@spark-appworks/spark-data'
import { PageRuntime } from '@spark-appworks/spark-project-model'
import { DataSpaceQueryTable } from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import { getMountedComponentApi, mountWithPageDataSet } from '../../support/helpers/mount-with-page-dataset'
import { requireFunction, requireRecord, requireString } from '../../support/helpers/runtime-guards'

function readConfigType(config: unknown): string {
  return requireString(requireRecord(config, 'action config')['type'], 'action config type')
}

async function loadListFieldQuery(view: DataView, metaName: string): Promise<void> {
  const table = new DataSpaceQueryTable({scenarioId: view.dataSet?.scenarioId ?? 'SCENE', metaName})
  const context = new DataSpaceQueryContext({identity: table.identity, scope: 'form', readScope: () => 'form',
    snapshot: table.applyResult({Result: {primaryKeyField: 'rowid', data: {Items: view.rows, Count: view.rows.length}}}),
  })
  view.bindQueryExecutor({executeQuery: async () => context})
  await view.loadFromServer()
}

const SparkActionStub = defineComponent({
  props: {
    config: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => {
      const type = readConfigType(props.config)
      if (type === 'r-toolbar') {
        if (!isSparkNode(props.config)) throw new TypeError('Invalid toolbar node')
        const node = props.config
        return h('div', {class: 'spark-action-stub', 'data-type': type}, [
          h(RendererToolbar, {...nodeInputProps(node), children: getSparkNodeChildren(node['children'])}),
        ])
      }
      return h('button', {class: 'spark-action-stub', 'data-type': type}, type)
    }
  },
})

function isStringCapability(value: unknown): value is string {
  return typeof value === 'string'
}

const ElCardStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { class: 'el-card-stub' }, [
      slots['header']?.(),
      slots['default']?.(),
    ])
  },
})

describe('RendererList and RendererSection container integration', () => {
  it('separates outer list spacing from item content spacing and updates inherited defaults', async () => {
    const ds = SparkData.createDataSet({scenarioId: 'SCENE', dataSetName: 'ListItemGridGap', tables: {Users: {
      tableName: 'Users',
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}],
      views: {default: {rows: [{id: 'APP-A'}, {id: 'APP-B'}]}},
    }}})
    const runtime = new PageRuntime({pageId: 'list-item-gap-test', scenarioIds: ['SCENE'], mainScenarioId: 'SCENE', loadScenario: async () => ds})
    await runtime.load()
    const Host = defineComponent({setup() {
      const {sparkProvide} = useSparkComponent({type: 'list-item-gap-test-root'})
      sparkProvide(PAGE_RUNTIME, runtime)
      const listProps = {dataViewKey: 'Users@default', gridColumns: 24, gridGap: 20, itemGridGap: 0,
        columns: 4, itemColSpan: 6, useCard: true, showPagination: false, children: [{type: 'list-card-content'}]}
      return () => h(RendererList, listProps as never)
    }})
    const previousStubs = config.global.stubs
    const stubs = {...previousStubs}
    delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']
    config.global.stubs = stubs
    const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {'el-card': ElCardStub}}})
    try {
      expect(wrapper.find('.renderer-list').attributes('style')).toContain('gap: 20px;')
      expect(wrapper.find('.renderer-list-item-body').attributes('style')).toContain('gap: 0px;')
      expect(wrapper.findAll('.renderer-list-cell')).toHaveLength(2)

      await wrapper.setProps({itemGridGap: undefined} as never)
      expect(wrapper.find('.renderer-list').attributes('style')).toContain('gap: 20px;')
      expect(wrapper.find('.renderer-list-item-body').attributes('style')).toContain('gap: 20px;')

      await wrapper.setProps({itemGridGap: 6} as never)
      expect(wrapper.find('.renderer-list').attributes('style')).toContain('gap: 20px;')
      expect(wrapper.find('.renderer-list-item-body').attributes('style')).toContain('gap: 6px;')
    } finally {config.global.stubs = previousStubs; wrapper.unmount(); runtime.dispose(); ds.destroy()}
  })

  it('keeps a full-width item toolbar button bound to its rendered row, not DataView currentRow', async () => {
    const scenarioId = 'APP-CATALOG'
    const dataViewKey = `${scenarioId}@Base_AppSystemList@default`
    const ds = SparkData.createDataSet({scenarioId, dataSetName: 'ToolbarItemRows', tables: {Base_AppSystemList: {
      tableName: 'Base_AppSystemList', modelBinding: {modelId: 'APP-MODEL', modelName: 'Base_AppSystemList'},
      columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}],
      views: {default: {rows: [{rowid: 'APP-A'}, {rowid: 'APP-B'}]}},
    }}})
    const view = ds.getView('Base_AppSystemList', 'default')!
    view.setCurrentRowById('APP-A')
    const runtime = new PageRuntime({pageId: 'list-item-toolbar-context', scenarioIds: [scenarioId], mainScenarioId: scenarioId,
      loadScenario: async () => ds})
    const clickedRows: Array<{clickedId: string; currentId: string | null}> = []
    const originalStubs = config.global.stubs
    let wrapper: ReturnType<typeof mount> | undefined
    try {
      await runtime.load()
      const registry = Spark.createRegistry()
      registry.register({type: 'r-toolbar', component: RendererToolbar})
      registry.register({type: 'r-button', component: RendererButton})
      const children: SparkNode[] = [{type: 'r-toolbar', id: 'app-actions', props: {wrap: true, gridColSpan: 24}, children: [
        {type: 'r-button', id: 'hidden-action', props: {label: '隐藏动作', onBeforeRender: () => false}},
        {type: 'r-button', id: 'enter', props: {dataViewKey, label: '进入应用', onClick: (row: DataRow) => clickedRows.push({
          clickedId: String(row['rowid']), currentId: String(view.currentRow?.['rowid'] ?? '') || null,
        })}},
      ]}]
      const Host = defineComponent({setup() {
        const {sparkProvide} = useSparkComponent({type: 'list-item-toolbar-context-test'})
        sparkProvide(PAGE_RUNTIME, runtime)
        return () => h(RendererList, {dataViewKey, children, gridColumns: 24, gridGap: 20, itemGridGap: 0,
          columns: 4, itemColSpan: 6, useCard: true, showPagination: false} as never)
      }})
      const stubs = {...originalStubs}
      delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']
      config.global.stubs = stubs
      wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin({registry})], stubs: {'el-card': ElCardStub}}})

      const rows = wrapper.findAll('.renderer-list-item-shell')
      expect(rows).toHaveLength(2)
      expect(wrapper.findAll('.renderer-list-grid-item')).toHaveLength(2)
      expect(wrapper.findAll('button').map(button => button.text())).toEqual(['进入应用', '进入应用'])
      await rows[1]!.find('button').trigger('click')

      expect(clickedRows).toEqual([{clickedId: 'APP-B', currentId: 'APP-A'}])
    } finally {
      config.global.stubs = originalStubs
      wrapper?.unmount(); runtime.dispose(); ds.destroy()
    }
  })

  it('binds each FieldText card to its own row independently of the view currentRow', async () => {
    const scenarioId = 'APP-CATALOG'
    const dataViewKey = `${scenarioId}@Base_AppSystemList@default`
    const rows = [
      {rowid: 'APP-A', AppDesc: 'Application Alpha', AppName: 'alpha', lingma_sys_params: {r: ['AppDesc', 'AppName'], e: [], h: [], m: [], d: false}},
      {rowid: 'APP-B', AppDesc: 'Application Beta', AppName: 'beta', lingma_sys_params: {r: ['AppDesc', 'AppName'], e: [], h: [], m: [], d: false}},
      {rowid: 'APP-CURRENT', AppDesc: 'Different current row', AppName: 'current', lingma_sys_params: {r: ['AppDesc', 'AppName'], e: [], h: [], m: [], d: false}},
    ]
    const ds = SparkData.createDataSet({scenarioId, dataSetName: 'ApplicationCatalog', tables: {Base_AppSystemList: {
      tableName: 'Base_AppSystemList', modelBinding: {modelId: 'APP-MODEL', modelName: 'Base_AppSystemList'},
      columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'AppDesc', type: 'string'}, {name: 'AppName', type: 'string'}],
      views: {default: {autoCurrentFirst: false, rows}},
    }}})
    const view = ds.getView('Base_AppSystemList', 'default')!
    const children: SparkNode[] = [
      {type: 'r-text', id: 'app-name', props: {dataViewKey, dataMember: 'currentRow', dataField: 'AppDesc', label: '应用名称'}},
      {type: 'r-text', id: 'app-description', props: {dataViewKey, dataMember: 'currentRow', dataField: 'AppDesc', label: '描述'}},
    ]
    const stubs = {...config.global.stubs}
    delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']
    const previousStubs = config.global.stubs
    let runtime: PageRuntime | undefined
    let wrapper: ReturnType<typeof mount> | undefined
    try {
      await loadListFieldQuery(view, 'Base_AppSystemList')
      view.setCurrentRowById('APP-CURRENT')
      config.global.stubs = stubs
      const currentRuntime = new PageRuntime({pageId: 'app-catalog-list-test', scenarioIds: [scenarioId], mainScenarioId: scenarioId,
        loadScenario: async () => ds})
      runtime = currentRuntime
      await currentRuntime.load()
      const registry = Spark.createRegistry()
      registry.register({type: 'r-text', component: FieldText})
      const Harness = defineComponent({setup() {
        const {sparkProvide} = useSparkComponent({type: 'app-catalog-list-test-root'})
        sparkProvide(PAGE_RUNTIME, currentRuntime)
        return () => h(RendererList, {dataViewKey, children, useCard: true, showPagination: false})
      }})
      wrapper = mount(Harness, {global: {plugins: [Spark.createPlugin({registry}), ElementPlus], stubs: {'el-card': ElCardStub}}})
      const cards = wrapper.findAll('.renderer-list-cell')
      expect(cards).toHaveLength(3)
      expect(cards.map(card => card.find('.field-value').text())).toEqual([
        'Application Alpha', 'Application Beta', 'Different current row',
      ])
    } finally {config.global.stubs = previousStubs; wrapper?.unmount(); runtime?.dispose(); ds.destroy()}
  })

  it.each([['table', RendererTable], ['list', RendererList]] as const)('%s follows DataView pagination and preserves an explicit opt-out', async (kind, component) => {
    const ds = SparkData.createDataSet({dataSetName: 'Paging', tables: {Nodes: {tableName: 'Nodes',
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}}}}})
    const view = ds.getView('Nodes', 'default')!
    view.updateFromServer({rows: [{id: 'A'}], total: 1})
    const wrapper = mount(component, {props: {dataSource: markRaw(view)}, global: {plugins: [ElementPlus]}})
    const pagination = () => wrapper.find(`.renderer-${kind}-pagination`).exists()
    try {
      expect(pagination()).toBe(true)
      view.queryConfig = {tree: {keyField: 'id', parentField: 'pid', nodeId: 'root'}}
      await nextTick()
      expect(pagination()).toBe(false)
      view.queryConfig = {outputType: 'Table', allPages: true}
      await nextTick()
      expect(pagination()).toBe(false)
      view.queryConfig = {outputType: 'Table'}
      await nextTick()
      expect(pagination()).toBe(true)
      await wrapper.setProps({showPagination: false})
      expect(pagination()).toBe(false)
    } finally {wrapper.unmount(); ds.destroy()}
  })

  it('should render list toolbar children, item actions and template-driven item rendering with grid layout', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'ListDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [
                { id: 1, name: 'Alice', lingma_sys_params: { r: [], e: [], h: [], m: [], d: true } },
                { id: 2, name: 'Bob', lingma_sys_params: { r: [], e: [], h: [], m: [], d: false } },
              ],
            },
          },
        },
      },
    })
    const listView = ds.getView('Users', 'default')!

    const wrapper = mountWithPageDataSet(RendererList, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
        gridGap: 12,
        itemColSpan: 12,
        toolbar: { position: 'bottom', children: [{ type: 'list-toolbar-action' }] },
        actions: { position: 'left', children: [{ type: 'list-item-delete', props: { permAction: 'delete' } }] },
      },
      slots: {
        default: ({ row, rowIndex }: Record<string, unknown>) => h('div', {
          class: 'biz-list-item',
          'data-row-id': String(requireRecord(row, 'list slot row')['id'] ?? ''),
          'data-row-index': String(rowIndex ?? ''),
        }, 'biz-list-item'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })

    expect(wrapper.find('.renderer-list-layout--bottom').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="list-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.find('.renderer-list-item-shell--left').exists()).toBe(true)
    expect(wrapper.findAll('.biz-list-item')).toHaveLength(2)
    expect(wrapper.findAll('.biz-list-item')[1]?.attributes('data-row-id')).toBe('2')
    const renderedItemActions = wrapper.findAll('.renderer-list-item-actions .spark-action-stub[data-type="r-toolbar"]')
    expect(renderedItemActions).toHaveLength(2)
    expect(wrapper.find('.renderer-list').attributes('style')).toContain('grid-template-columns: repeat(24, minmax(0, 1fr));')
    expect(wrapper.find('.renderer-list').attributes('style')).toContain('gap: 12px;')
    expect(wrapper.find('.renderer-list-cell').attributes('style')).toContain('grid-column: span 12 / span 12;')

    await nextTick()
  })

  it('leaves permission presentation to the action children', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'ListPermDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [
                { id: 1, name: 'Alice', lingma_sys_params: { r: [], e: [], h: [], m: [], d: false } },
              ],
            },
          },
        },
      },
    })

    const wrapper = mountWithPageDataSet(RendererList, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
        actions: {
          type: 'r-toolbar',
          position: 'left',
          children: [{ type: 'list-item-delete', props: { permAction: 'delete', permissionDeniedMode: 'hide' } }],
        },
      },
      slots: {
        default: ({ row, rowIndex }: Record<string, unknown>) => h('div', {
          class: 'biz-list-item',
          'data-row-id': String(requireRecord(row, 'list permission slot row')['id'] ?? ''),
          'data-row-index': String(rowIndex ?? ''),
        }, 'biz-list-item'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })

    const itemActionToolbar = wrapper.find('.renderer-list-item-actions .spark-action-stub[data-type="r-toolbar"]')
    expect(itemActionToolbar.exists()).toBe(true)
    expect(wrapper.find('.renderer-list-item-actions').exists()).toBe(true)
  })

  it('should expose r-table-aligned list api for current row and row mutations', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'ListApiDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const, isPrimaryKey: true },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
            },
          },
        },
      },
    })

    const wrapper = mountWithPageDataSet(RendererList, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })

    const api = getMountedComponentApi<{
      getRows(): Array<Record<string, unknown>>
      getCurrentRow(): Record<string, unknown> | null
      getItemCount(): number
      setCurrentRowById(id: number | null): boolean
      appendRow(row: Record<string, unknown>): void
      updateRowById(id: number, patch: Record<string, unknown>): boolean
      deleteRowById(id: number): boolean
      addRow(row: Record<string, unknown>): Promise<unknown>
      editRowById(id: number, patch: Record<string, unknown>): Promise<unknown>
      removeRow(id: number): Promise<unknown>
    }>(wrapper, 'r-list')

    expect(api.getItemCount()).toBe(2)
    expect(api.getCurrentRow()).toBeNull()

    expect(api.setCurrentRowById(2)).toBe(true)
    expect(api.getCurrentRow()?.['id']).toBe(2)

    api.appendRow({ id: 3, name: 'Carol' })
    await nextTick()
    expect(api.getItemCount()).toBe(3)

    expect(api.updateRowById(3, { name: 'Caroline' })).toBe(true)
    await nextTick()
    expect(api.getRows().find(row => row['id'] === 3)?.['name']).toBe('Caroline')

    expect(api.deleteRowById(1)).toBe(true)
    await nextTick()
    expect(api.getRows().map(row => row['id'])).toEqual([2, 3])

    await api.addRow({ id: 4, name: 'Dave' })
    await nextTick()
    expect(api.getRows().map(row => row['id'])).toEqual([2, 3, 4])

    await api.editRowById(4, { name: 'David' })
    await nextTick()
    expect(api.getRows().find(row => row['id'] === 4)?.['name']).toBe('David')

    await api.removeRow(4)
    await nextTick()
    expect(api.getRows().map(row => row['id'])).toEqual([2, 3])
  })

  it('should run list item click business handler before default current row sync and allow cancel', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'ListClickDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const, isPrimaryKey: true },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }],
            },
          },
        },
      },
    })
    const view = ds.getView('Users', 'default')!
    const observed: string[] = []

    const wrapper = mountWithPageDataSet(RendererList, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
        onItemClick: async (_row: unknown, _index: number, _event: Event, control: { cancel: boolean }) => {
          observed.push(`item:${String(view.currentRow?.['id'] ?? 'null')}:${String(control.cancel)}`)
          control.cancel = true
        },
      },
      slots: {
        default: ({ row }: Record<string, unknown>) => h('div', {
          class: 'biz-list-item',
          'data-row-id': String(requireRecord(row, 'list click slot row')['id'] ?? ''),
        }, 'biz-list-item'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })

    await wrapper.find('.renderer-list-item-shell').trigger('click')
    await nextTick()

    expect(observed).toEqual(['item:null:false'])
    expect(view.currentRow).toBeNull()
  })

  it('should allow section header slot and default slot scopes to control collapse state', async () => {
    const wrapper = mount(RendererSection, {
      props: {
        title: '基础信息',
        description: 'desc',
        collapsible: true,
        defaultCollapsed: true,
        header: { type: 'r-header', children: [{ type: 'section-header-action' }] },
      },
      slots: {
        'header-actions': ({ collapsed, toggleCollapsed }: Record<string, unknown>) => h('button', {
          class: 'biz-section-header-action',
          'data-collapsed': String(collapsed ?? ''),
          onClick: () => {
            requireFunction(toggleCollapsed, 'section toggleCollapsed')()
          },
        }, 'biz-section-header-action'),
        default: ({ title, collapsed }: Record<string, unknown>) => h('div', {
          class: 'biz-section-body',
          'data-title': String(title ?? ''),
          'data-collapsed': String(collapsed ?? ''),
        }, 'biz-section-body'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="section-header-action"]').exists()).toBe(true)
    expect(wrapper.find('.biz-section-header-action').attributes('data-collapsed')).toBe('true')
    expect(wrapper.find('.biz-section-body').attributes('data-title')).toBe('基础信息')
    expect(wrapper.find('.biz-section-body').attributes('data-collapsed')).toBe('true')

    await wrapper.find('.biz-section-header-action').trigger('click')
    await nextTick()

    expect(wrapper.find('.biz-section-body').attributes('data-collapsed')).toBe('false')
  })

  it('should keep section body on CSS Grid and honor child spans', () => {
    const wrapper = mount(RendererSection, {
      props: {
        title: '布局区块',
        gridGap: 16,
        children: [
          { type: 'child-a', props: { colSpan: 12, rowSpan: 2 } },
          { type: 'child-b', props: { colSpan: 12 } },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })

    expect(wrapper.find('.renderer-section-body').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-section-body').attributes('style')).toContain('grid-template-columns: repeat(24, minmax(0, 1fr));')
    expect(wrapper.find('.renderer-section-body').attributes('style')).toContain('gap: 16px;')
    const gridItems = wrapper.findAll('.renderer-section-grid-item')
    expect(gridItems).toHaveLength(2)
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 12 / span 12;')
    expect(gridItems[0]?.attributes('style')).toContain('grid-row: span 2 / span 2;')
  })

  it('should honor child span props in section grid layout', () => {
    const wrapper = mount(RendererSection, {
      props: {
        title: '根级布局区块',
        gridGap: 10,
        children: [
          { type: 'child-a', props: { colSpan: 7, rowSpan: 2 } },
          { type: 'child-b', props: { colSpan: 17 } },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-card': ElCardStub,
        },
      },
    })

    expect(wrapper.find('.renderer-section-body').attributes('style')).toContain('gap: 10px;')
    const gridItems = wrapper.findAll('.renderer-section-grid-item')
    expect(gridItems).toHaveLength(2)
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 7 / span 7;')
    expect(gridItems[0]?.attributes('style')).toContain('grid-row: span 2 / span 2;')
    expect(gridItems[1]?.attributes('style')).toContain('grid-column: span 17 / span 17;')
  })
})

// 验证 RendererSection slot 子组件能沿 Spark 上下文链消费到祖先提供的能力
const SECTION_BRIDGE_MARKER = defineCapability<string>('test:section-bridge-marker', isStringCapability)

describe('RendererSection direct Vue children bridge', () => {
  // ContextProbe 消费外层提供的标记能力：能消费到 → 上下文链穿过 RendererSection slot 正常工作
  const ContextProbe = defineComponent({
    name: 'ContextProbe',
    setup() {
      const { sparkConsume } = useSparkComponent({ type: 'probe-field' })
      const marker = sparkConsume(SECTION_BRIDGE_MARKER)
      return () => h('div', {
        class: 'context-probe',
        'data-connected': marker ?? 'none',
      }, 'probe')
    },
  })

  it('should propagate r-section parent context to direct Vue slot children', () => {
    const plugin = Spark.createPlugin()
    // OuterProvider 通过 sparkProvide 注入标记能力，验证 RendererSection slot 子组件能透过上下文链消费到
    const OuterProvider = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'outer-provider' })
        sparkProvide(SECTION_BRIDGE_MARKER, 'connected')
        return () => h(RendererSection, { title: '分区' }, { default: () => h(ContextProbe) })
      },
    })
    const wrapper = mount(OuterProvider, {
      global: {
        plugins: [plugin],
        stubs: { 'el-card': ElCardStub },
      },
    })

    expect(wrapper.find('.context-probe').attributes('data-connected')).toBe('connected')
  })

  it('should propagate r-section parent context in card mode', () => {
    const plugin = Spark.createPlugin()
    const OuterProvider = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'outer-provider' })
        sparkProvide(SECTION_BRIDGE_MARKER, 'connected')
        return () => h(RendererSection, { title: '卡片分区', useCard: true }, { default: () => h(ContextProbe) })
      },
    })
    const wrapper = mount(OuterProvider, {
      global: {
        plugins: [plugin],
        stubs: { 'el-card': ElCardStub },
      },
    })

    expect(wrapper.find('.context-probe').attributes('data-connected')).toBe('connected')
  })
})
