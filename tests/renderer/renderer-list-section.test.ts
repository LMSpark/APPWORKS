import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { RendererList, RendererSection, Spark, useSparkComponent } from '@spark-appworks/spark-component'
import { defineCapability } from '@spark-appworks/spark-utils'
import { SparkData } from '@spark-appworks/spark-data'
import { getMountedComponentApi, mountWithPageDataSet } from '../helpers/mount-with-page-dataset'
import { requireFunction, requireRecord, requireString } from '../helpers/runtime-guards'

function setPermissionSnapshot(view: object, authorizedFeatureTags: string[]): void {
  Reflect.set(view, 'permissionSnapshot', {
    formKey: 'FORM', dataSpaceId: 'SPACE', modelId: 'MODEL', allowAdd: false,
    systemKey: 'SYSTEM', originalRows: [], authorizedFeatureTags,
  })
}

function readConfigType(config: unknown): string {
  return requireString(requireRecord(config, 'action config')['type'], 'action config type')
}

const SparkActionStub = defineComponent({
  props: {
    config: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => h('button', {
      class: 'spark-action-stub',
      'data-type': readConfigType(props.config),
    }, readConfigType(props.config))
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
    setPermissionSnapshot(listView, ['export'])

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

  it('should keep structured item actions visible even when permDeniedBehavior is hide', () => {
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
          props: { position: 'left', permDeniedBehavior: 'hide' },
          children: [{ type: 'list-item-delete', props: { permAction: 'delete' } }],
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
