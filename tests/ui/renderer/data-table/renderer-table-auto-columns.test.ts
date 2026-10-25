import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, effectScope, h, onBeforeUnmount, shallowRef, type Ref} from 'vue'
import ElementPlus, {ElTable, ElTableColumn} from 'element-plus'
import {FieldText, RendererTable, Spark, PAGE_RUNTIME, useSparkComponent, type RTableProps} from '@spark-appworks/spark-component'
import {DataSet, resolveDataViewMember, type SparkNode} from '@spark-appworks/spark-data'
import {Logger} from '@spark-appworks/spark-utils'
import {createRendererTableZeroCode} from '../../../../packages/spark-component/src/components/containers/data-views/RendererTable/zero-code'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {useDataViewState} from '../../../../packages/spark-component/src/components/containers/data-views/view-runtime-state'

const originalStubs = config.global.stubs
afterEach(() => {config.global.stubs = originalStubs; vi.unstubAllGlobals()})

async function tableFixture(children?: SparkNode[], keyless = false, editable = false, options: {
  rows?: readonly {id: string; name: string}[]
  otherRows?: readonly {id: string; name: string}[]
  initialCurrentRowId?: string | null
  otherCurrentRowId?: string | null
  onCurrentChange?: RTableProps['onCurrentChange']
  onRowClick?: RTableProps['onRowClick']
  binding?: Ref<string>
} = {}) {
  const stubs = {...config.global.stubs}
  delete stubs['el-table']; delete stubs['el-table-column']
  delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'Preview', tables: {Orders: {
    tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'}, columns: [
      {name: 'id', type: 'string', isPrimaryKey: true, label: '编号'}, {name: 'name', type: 'string', label: '名称'},
      {name: 'secret', type: 'string', label: '隐藏内容'}, {name: 'masked', type: 'string', label: '脱敏内容'},
    ], views: {default: {}, other: {}},
  }}})
  const view = dataSet.getView('Orders', 'default')!
  if (keyless) {
    view.primaryKey = ''
    view.configure({autoCurrentFirst: false, autoSelectFirst: false, selectionDelimiter: '', valueField: 'id', labelField: 'name'})
  }
  const source = new DataSpaceQueryTable({scenarioId: 'SPACE', metaName: 'Orders'})
  const otherSource = new DataSpaceQueryTable({scenarioId: 'SPACE', metaName: 'Orders'})
  const otherView = dataSet.getView('Orders', 'other')!
  const queryRows = options.rows ?? [{id: 'O1', name: '可读结果'}]
  const otherQueryRows = options.otherRows ?? queryRows
  const queryExecutor = (querySource: DataSpaceQueryTable, rows: readonly {id: string; name: string}[]) => ({
    executeQuery: async () => {
      const result = querySource.applyResult({Result: {
        primaryKeyField: keyless ? null : 'id',
        data: {Items: rows.map(row => ({...row, secret: '不可泄漏隐藏值', masked: '不可泄漏脱敏值',
          lingma_sys_params: {r: [], e: editable ? ['name', 'secret', 'masked'] : [], h: ['secret'], m: ['masked'], d: false}})), Count: rows.length},
      }})
      return new DataSpaceQueryContext({identity: querySource.identity, scope: 'query', readScope: () => 'query', snapshot: result})
    },
  })
  view.bindQueryExecutor(queryExecutor(source, queryRows))
  otherView.bindQueryExecutor(queryExecutor(otherSource, otherQueryRows))
  await view.refresh()
  await otherView.refresh()
  if (options.initialCurrentRowId !== undefined) {
    if (options.initialCurrentRowId === null) view.setCurrentRow(null)
    else view.setCurrentRowById(options.initialCurrentRowId)
    if (!keyless) otherView.setCurrentRowById(options.otherCurrentRowId ?? options.initialCurrentRowId ?? null)
  }
  const registry = Spark.createRegistry()
  registry.register({type: 'r-text', component: FieldText})
  const runtime = new PageRuntime({pageId: 'table-test', scenarioIds: ['SPACE'], loadScenario: async () => dataSet})
  await runtime.load()
  const rowClassName = shallowRef<RTableProps['rowClassName']>()
  const Host = defineComponent({setup() {
    useSparkComponent({type: 'table-test'}).sparkProvide(PAGE_RUNTIME, runtime)
    onBeforeUnmount(() => runtime.dispose())
    return () => h(RendererTable, {dataViewKey: options.binding?.value ?? 'SPACE@Orders@default', autoColumns: true, highlightCurrentRow: true, showPagination: false,
      showDataViewMeta: false, ...(options.onCurrentChange ? {onCurrentChange: options.onCurrentChange} : {}),
      ...(options.onRowClick ? {onRowClick: options.onRowClick} : {}),
      ...(rowClassName.value ? {rowClassName: rowClassName.value} : {}), ...(children ? {children} : {})})
  }})
  const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin({registry})],
    components: {'el-table': ElTable, 'el-table-column': ElTableColumn},
    stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn}}})
  await flushPromises()
  return {wrapper, dataSet, rowClassName, async reloadResult(nextKeyless: boolean) {
    keyless = nextKeyless
    await view.refresh()
    await flushPromises()
  }}
}

describe('RendererTable automatic columns', () => {
  it('reflects the existing DataView selection when the table mounts after the query has completed', async () => {
    const {wrapper, dataSet} = await tableFixture()
    const view = dataSet.getView('Orders')!
    try {
      expect(view.getSelectedValues()).toEqual(['O1'])
      expect(wrapper.get('tbody input[type="checkbox"]').element).toHaveProperty('checked', true)
      view.clearSelectedRows(); await flushPromises()
      expect(wrapper.get('tbody input[type="checkbox"]').element).toHaveProperty('checked', false)
      expect(wrapper.get('tbody tr').classes()).not.toContain('spark-selection-row')
      view.setSelectedRows([view.rows[0]!]); await flushPromises()
      expect(wrapper.get('tbody input[type="checkbox"]').element).toHaveProperty('checked', true)
    } finally {wrapper.unmount(); dataSet.destroy()}
  })

  it('updates result identity without changing the model when a bound query switches between keyed and keyless rows', async () => {
    const {wrapper, dataSet, reloadResult} = await tableFixture()
    const view = dataSet.getView('Orders')!, scope = effectScope()
    const state = scope.run(() => useDataViewState(shallowRef(view)))!
    try {
      expect(state.primaryKey.value).toBe('id')
      const originalRow = view.rows[0]!
      await reloadResult(true)
      expect(view.primaryKey).toBe('')
      expect(state.primaryKey.value).toBe('')
      expect(view.currentRow).not.toBe(originalRow)
      expect(view.dataTable!.columns.filter(column => column.isPrimaryKey).map(column => column.name)).toEqual(['id'])
      expect(view.fieldAccess(view.rows[0]!, 'name').write).toBe('denied')
      await reloadResult(false)
      expect(state.primaryKey.value).toBe('id')
      expect(view.dataTable!.columns.filter(column => column.isPrimaryKey).map(column => column.name)).toEqual(['id'])
      expect(wrapper.get('tbody tr').classes()).toContain('spark-selection-row')
    } finally {scope.stop(); wrapper.unmount(); dataSet.destroy()}
  })

  it('keeps keyless multi-selection, row highlighting and public values aligned through real table checkboxes', async () => {
    const {wrapper, dataSet} = await tableFixture(undefined, true)
    const view = dataSet.getView('Orders')!, row = view.rows[0]!
    try {
      view.configure({selectionDelimiter: ','}); await flushPromises()
      await wrapper.get('tbody input[type="checkbox"]').setValue(true); await flushPromises()
      expect(view.selectedRows).toEqual([row])
      expect(view.getSelectedValues()).toEqual(['O1'])
      expect(view.value).toBe('O1')
      expect(wrapper.get('tbody tr').classes()).toContain('spark-selection-row')
      expect(wrapper.text()).not.toContain('不可泄漏')
      expect(view.fieldAccess(row, 'name').write).toBe('denied')
      delete view.valueField
      expect(view.selectedRows).toEqual([row])
      expect(() => view.getSelectedValues()).toThrow('DATA_VIEW_VALUE_KEY')
      view.valueField = 'id'
      view.clearSelectedRows(); await flushPromises()
      expect(wrapper.get('tbody input[type="checkbox"]').element).toHaveProperty('checked', false)
      expect(wrapper.get('tbody tr').classes()).not.toContain('spark-selection-row')
      view.setSelectedRows([row]); await flushPromises()
      expect(wrapper.get('tbody input[type="checkbox"]').element).toHaveProperty('checked', true)
      await view.refresh(); await flushPromises()
      expect(view.selectedRows).toEqual([])
      expect(wrapper.get('tbody tr').classes()).not.toContain('spark-selection-row')
      view.setSelectedRows([row]); await flushPromises()
      expect(view.selectedRows).toEqual([])
    } finally {wrapper.unmount(); dataSet.destroy()}
  })

  it('passes flexible child widths to the table without turning them into fixed widths', async () => {
    const {wrapper, dataSet} = await tableFixture([{type: 'r-text', props: {field: 'name', label: '可伸缩名称', minWidth: 180}}])
    try {
      const field = wrapper.findAllComponents({name: 'ElTableColumn'}).find(column => column.props('prop') === 'name')
      expect(field?.props('minWidth')).toBe(180)
      expect(field?.props('width')).toBe('')
      expect(wrapper.text()).toContain('可读结果')
    } finally {wrapper.unmount(); dataSet.destroy()}
  })

  it('renders standard child groups as two-level headers and retains editing overlays and field permissions', async () => {
    const {wrapper, dataSet} = await tableFixture([{type: 'r-text', props: {label: '输出信息'}, children: [
      {type: 'r-text', props: {field: 'name', label: '名称'}},
      {type: 'r-text', props: {field: 'secret', label: '隐藏内容'}},
      {type: 'r-text', props: {field: 'masked', label: '脱敏内容'}},
    ]}], false, true)
    try {
      const view = dataSet.getView('Orders', 'default')
      if (!view) throw new Error('missing view')
      const headers = wrapper.findAll('thead tr')
      expect(headers).toHaveLength(2)
      expect(headers[0]?.findAll('th').find(item => item.text() === '输出信息')?.attributes('colspan')).toBe('3')
      expect(headers[1]?.findAll('th').map(item => item.text())).toEqual(['名称', '隐藏内容', '脱敏内容'])
      view.updateEditingValue('O1', 'name', '分组中的草稿'); await flushPromises()
      expect(wrapper.text()).toContain('分组中的草稿')
      expect(wrapper.text()).not.toContain('不可泄漏')
      expect(wrapper.text()).toContain('••••')
      view.discardEditingRows(); await flushPromises()
      expect(wrapper.text()).not.toContain('分组中的草稿')
      expect(wrapper.text()).toContain('可读结果')
    } finally {wrapper.unmount(); dataSet.destroy()}
  })

  it('combines row presentation classes with selection without replacing the DataView rows or drafts', async () => {
    const {wrapper, dataSet, rowClassName} = await tableFixture(undefined, false, true)
    const view = dataSet.getView('Orders', 'default')!, row = view.rows[0]!
    try {
      view.setSelectedRows([row]); view.setCurrentRow(row)
      view.updateEditingValue('O1', 'name', '保留草稿')
      rowClassName.value = ({row, rowIndex}) => row['id'] === 'O1' && rowIndex === 0 ? 'classified-row' : ''
      await flushPromises()
      expect(wrapper.get('tbody tr').classes()).toContain('classified-row')
      expect(wrapper.get('tbody tr').classes()).toContain('spark-selection-row')
      rowClassName.value = undefined; await flushPromises()
      expect(wrapper.get('tbody tr').classes()).not.toContain('classified-row')
      expect(wrapper.get('tbody tr').classes()).toContain('spark-selection-row')
      expect(view.rows[0]).toBe(row); expect(view.currentRow).toBe(row)
      expect(view.getEditingPatch('O1')?.['name']).toBe('保留草稿')
      expect(wrapper.text()).toContain('保留草稿')
    } finally {wrapper.unmount(); dataSet.destroy()}
  })

  it('displays DataView editing overlays without changing stored rows or exposing masked fields, and reverts on cancel', async () => {
    const {wrapper, dataSet} = await tableFixture(undefined, false, true)
    const view = dataSet.getView('Orders', 'default')!
    try {
      view.setCurrentRow(null)
      view.updateEditingValue('O1', 'name', '编辑中的名称')
      view.updateEditingValue('O1', 'secret', '不可泄漏隐藏草稿')
      view.updateEditingValue('O1', 'masked', '不可泄漏脱敏草稿')
      await flushPromises()
      expect(wrapper.text()).toContain('编辑中的名称')
      expect(wrapper.text()).not.toContain('不可泄漏')
      expect(wrapper.text()).toContain('••••')
      expect(view.rows[0]?.['name']).toBe('可读结果')
      view.discardEditingRows()
      await flushPromises()
      expect(wrapper.text()).toContain('可读结果')
      expect(wrapper.text()).not.toContain('编辑中的名称')
    } finally {wrapper.unmount(); dataSet.destroy()}
  })

  it('preserves keyless query permissions and a read-only current-row pointer through real table proxies', async () => {
    const {wrapper, dataSet} = await tableFixture(undefined, true)
    const view = dataSet.getView('Orders', 'default')!
    try {
      expect(wrapper.text()).toContain('可读结果')
      expect(wrapper.text()).toContain('••••')
      expect(wrapper.text()).not.toContain('不可泄漏')
      const row = view.rows[0]!
      await wrapper.find('tbody tr').trigger('click')
      await flushPromises()
      expect(view.currentRow).toBe(row)
      expect(view.primaryKey).toBe('')
      expect(view.selectedRows).toEqual([row])
      expect(wrapper.get('tbody tr').classes()).toContain('spark-selection-row')
      expect(view.value).toBe('O1')
      const {tableApi} = createRendererTableZeroCode({props: {}, resolvedView: {value: view}, nativeTableRef: {value: null}, logger: Logger('value-test')})
      expect(tableApi.getValue()).toEqual(['O1'])
      expect(resolveDataViewMember({dataViewKey: 'SPACE@Orders@default', dataMember: 'value'}, dataSet)).toEqual(['O1'])
      view.clearSelectedRows()
      expect(view.currentRow).toBe(row)
      expect(tableApi.getValue()).toEqual([])
      view.value = 'O1'
      expect(tableApi.getValue()).toEqual(['O1'])
      view.valueField = 'secret'
      expect(() => tableApi.getValue()).toThrow('DATA_VIEW_VALUE_READ')
      expect(() => view.value).toThrow('DATA_VIEW_VALUE_READ')
      view.valueField = 'id'
      expect(view.fieldAccess(row, 'name').write).toBe('denied')
      view.setCurrentRow({...row})
      expect(view.currentRow).toBe(row)
      await view.refresh()
      expect(view.currentRow).toBeNull()
      expect(tableApi.getValue()).toEqual([])
      view.setCurrentRow(row)
      expect(view.currentRow).toBeNull()
      view.setCurrentRow(view.rows[0]!)
      expect(view.currentRow).toBe(view.rows[0])
      view.setCurrentRowById(null)
      expect(view.currentRow).toBeNull()
      view.setCurrentRow(view.rows[0]!)
      view.clearAll()
      expect(view.currentRow).toBeNull()
      expect(tableApi.getValue()).toEqual([])
    } finally {wrapper.unmount(); dataSet.destroy()}
  })

  it.each([
    ['existing row', 'O1'],
    ['null current row', null],
  ] as const)('restores the rendered current row after a cancelled current-change from %s', async (_label, initialCurrentRowId) => {
    const onCurrentChange: NonNullable<RTableProps['onCurrentChange']> = (_row, _previous, control) => {control.cancel = true}
    const onRowClick: NonNullable<RTableProps['onRowClick']> = (_row, _column, _event, control) => {control.cancel = true}
    const callback = vi.fn(onCurrentChange)
    const {wrapper, dataSet} = await tableFixture(undefined, false, false, {
      rows: [{id: 'O1', name: '原当前行'}, {id: 'O2', name: '点击目标'}],
      initialCurrentRowId,
      onCurrentChange: callback,
      onRowClick,
    })
    const view = dataSet.getView('Orders')!
    try {
      if (initialCurrentRowId !== null) {
        view.setCurrentRow(null)
        await flushPromises()
        view.setCurrentRowById(initialCurrentRowId)
        await flushPromises()
        expect(view.currentRow?.['id']).toBe(initialCurrentRowId)
        expect(wrapper.findAll('tbody tr')[0]!.classes()).toContain('current-row')
      }
      const rows = wrapper.findAll('tbody tr')
      expect(rows).toHaveLength(2)
      await rows[1]!.trigger('click')
      await flushPromises()
      await flushPromises()

      expect(view.currentRow?.['id'] ?? null).toBe(initialCurrentRowId)
      if (initialCurrentRowId === null) {
        expect(wrapper.findAll('tbody tr').every(row => !row.classes().includes('current-row'))).toBe(true)
      } else {
        expect(wrapper.findAll('tbody tr')[0]!.classes()).toContain('current-row')
        expect(wrapper.findAll('tbody tr')[1]!.classes()).not.toContain('current-row')
      }
      expect(callback.mock.calls.filter(call => call[0]?.['id'] === 'O2')).toHaveLength(1)
    } finally {wrapper.unmount(); dataSet.destroy()}
  })

  it('keeps the default current-row selection when current-change is not cancelled', async () => {
    const onCurrentChange = vi.fn<NonNullable<RTableProps['onCurrentChange']>>()
    const {wrapper, dataSet} = await tableFixture(undefined, false, false, {
      rows: [{id: 'O1', name: '原当前行'}, {id: 'O2', name: '点击目标'}],
      initialCurrentRowId: 'O1',
      onCurrentChange,
    })
    const view = dataSet.getView('Orders')!
    try {
      await wrapper.findAll('tbody tr')[1]!.trigger('click')
      await flushPromises()
      expect(view.currentRow?.['id']).toBe('O2')
      expect(wrapper.findAll('tbody tr')[1]!.classes()).toContain('current-row')
    } finally {wrapper.unmount(); dataSet.destroy()}
  })

  it('syncs a cancelled asynchronous current-change to the newly bound DataView', async () => {
    const binding = shallowRef('SPACE@Orders@default')
    const onCurrentChange = vi.fn<NonNullable<RTableProps['onCurrentChange']>>(async (row, _previous, control) => {
      if (row?.['id'] === 'O2') {
        control.cancel = true
        binding.value = 'SPACE@Orders@other'
        await Promise.resolve()
      }
    })
    const onRowClick: NonNullable<RTableProps['onRowClick']> = (_row, _column, _event, control) => {control.cancel = true}
    const {wrapper, dataSet} = await tableFixture(undefined, false, false, {
      rows: [{id: 'O1', name: '原当前行'}, {id: 'O2', name: '点击目标'}],
      otherRows: [{id: 'X1', name: '新绑定已有当前行'}],
      initialCurrentRowId: 'O1',
      otherCurrentRowId: 'X1',
      onCurrentChange,
      onRowClick,
      binding,
    })
    const view = dataSet.getView('Orders')!, other = dataSet.getView('Orders', 'other')!
    try {
      await wrapper.findAll('tbody tr')[1]!.trigger('click')
      await flushPromises()
      await flushPromises()
      await flushPromises()

      expect(view.currentRow?.['id']).toBe('O1')
      expect(other.currentRow?.['id']).toBe('X1')
      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.findAll('tbody tr')[0]!.classes()).toContain('current-row')
      expect(onCurrentChange.mock.calls.filter(call => call[0]?.['id'] === 'O2')).toHaveLength(1)
    } finally {wrapper.unmount(); dataSet.destroy()}
  })

  it('renders column labels and visible values while applying the original row field permissions', async () => {
    const {wrapper, dataSet} = await tableFixture()
    try {
      expect(wrapper.findAll('th').map(node => node.text())).toEqual(expect.arrayContaining(['编号', '名称', '隐藏内容', '脱敏内容']))
      expect(wrapper.text()).toContain('可读结果')
      expect(wrapper.text()).toContain('••••')
      expect(wrapper.text()).not.toContain('不可泄漏')
    } finally {wrapper.unmount(); dataSet.destroy()}
  })

  it('preserves explicit field columns instead of adding automatic duplicates', async () => {
    const {wrapper, dataSet} = await tableFixture([{type: 'r-text', props: {field: 'name', label: '自定义名称'}}])
    try {
      expect(wrapper.findAll('th').map(node => node.text())).toEqual(['', '自定义名称'])
      expect(wrapper.text()).toContain('可读结果')
    } finally {wrapper.unmount(); dataSet.destroy()}
  })
})
