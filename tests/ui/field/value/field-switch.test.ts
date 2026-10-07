import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, toRaw } from 'vue'
import { FieldSwitch } from '@spark-appworks/spark-component'
import { SparkData, type DataColumn, type DataView } from '@spark-appworks/spark-data'
import { mountFieldInContext } from '../../../support/helpers/mount-field-in-context'
import { DataSpaceQueryTable } from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElSwitchStub = defineComponent({
  props: ['modelValue', 'disabled', 'activeText', 'inactiveText'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-switch-stub',
      'data-value': String(Boolean(props.modelValue)),
    })
  },
})

async function mountFieldSwitch(
  model: Record<string, unknown>,
  fieldName: string,
  componentProps?: Record<string, unknown>,
  columns?: DataColumn[],
  dataSource?: DataView,
) {
  const resolvedDataSource = dataSource ?? (columns !== undefined
    ? await createSwitchDataView(model, columns)
    : undefined)

  return mountFieldInContext({
    component: FieldSwitch,
    type: 'r-switch',
    model,
    fieldName,
    componentProps,
    ...(resolvedDataSource !== undefined
      ? { dataSource: resolvedDataSource }
      : {}),
    global: {
      stubs: {
        'el-form-item': ElFormItemStub,
        'el-switch': ElSwitchStub,
        'el-table-column': defineComponent({
          setup() { return () => h('div', { class: 'el-table-column-stub' }) },
        }),
      },
    },
  })
}

async function createSwitchDataView(model: Record<string, unknown>, columns: DataColumn[]): Promise<DataView> {
  const dataSet = SparkData.createDataSet({
    dataSetName: 'FieldSwitchDS',
    scenarioId: 'SCENE',
    tables: {
      SwitchRows: {
        tableName: 'SwitchRows',
        modelBinding: { modelId: 'MODEL', modelName: 'SwitchRows' },
        columns: withPrimaryKeyColumn(columns),
        views: {
          default: {
            autoCurrentFirst: false,
            autoSelectFirst: false,
          },
        },
      },
    },
  })
  const view = dataSet.getView('SwitchRows', 'default')
  if (!view) throw new Error('测试 DataView 创建失败: SwitchRows@default')
  const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'SwitchRows' })
  const context = new DataSpaceQueryContext({ identity: table.identity, scope: 'switch', readScope: () => 'switch',
    snapshot: table.applyResult({ Result: { primaryKeyField: 'id', data: { Items: [{
      lingma_sys_params: { e: columns.map(column => column.name), r: [], h: [], m: [], d: false }, ...toRaw(model),
    }], Count: 1 } } }),
  })
  view.bindQueryExecutor({ executeQuery: async () => context })
  await view.loadFromServer()
  const currentRow = view.rows[0]
  if (currentRow) view.setCurrentRow(currentRow)
  return view
}

function withPrimaryKeyColumn(columns: DataColumn[]): DataColumn[] {
  if (columns.some(column => column.name === 'id')) return columns
  return [{ name: 'id', type: 'string', isPrimaryKey: true }, ...columns]
}

function readSwitchFieldValue(view: DataView, row: Record<string, unknown>, fieldName: string): unknown {
  const rowId = view.getPkKey(row)
  if (rowId === undefined) return row[fieldName]
  const editingRow = view.getEditingRow(rowId)
  if (editingRow && Object.prototype.hasOwnProperty.call(editingRow, fieldName)) {
    return editingRow[fieldName]
  }
  return row[fieldName]
}

describe('FieldSwitch 业务回调模式', () => {
  it('onChange 可在默认 syncValue 前执行并取消写回', async () => {
    const model = reactive<Record<string, unknown>>({ enabled: false })
    const observed: string[] = []
    const wrapper = await mountFieldSwitch(model, 'enabled', {
      onChange: vi.fn((next: boolean, _prev: boolean, control: { cancel: boolean }) => {
        observed.push(`switch:${String(model['enabled'])}:${String(next)}:${String(control.cancel)}`)
        control.cancel = true
      }),
    })

    const switchComp = wrapper.findComponent(ElSwitchStub)
    switchComp.vm.$emit('update:modelValue', true)
    await nextTick()

    expect(observed).toEqual(['switch:false:true:false'])
    expect(model['enabled']).toBe(false)
  })

  it('应将可空布尔空值归一为 null', async () => {
    const model = reactive<Record<string, unknown>>({ id: 'nullable-row', dividerAfter: '' })
    const dataSource = await createSwitchDataView(model, [
      { name: 'dividerAfter', type: 'boolean', allowDBNull: true },
    ])

    await mountFieldSwitch(model, 'dividerAfter', undefined, undefined, dataSource)

    await nextTick()

    expect(readSwitchFieldValue(dataSource, model, 'dividerAfter')).toBeNull()
  })

  it('应将非可空布尔缺字段归一为 false', async () => {
    const model = reactive<Record<string, unknown>>({ id: 'required-row' })
    const dataSource = await createSwitchDataView(model, [
      { name: 'hidden', type: 'boolean', allowDBNull: false },
    ])

    await mountFieldSwitch(model, 'hidden', undefined, undefined, dataSource)

    await nextTick()

    expect(readSwitchFieldValue(dataSource, model, 'hidden')).toBe(false)
  })

  it('绑定 DataView 且当前行缺少主键时应跳过初始化归一写回', async () => {
    const model = reactive<Record<string, unknown>>({ active: '' })
    const dataSource = await createSwitchDataView(model, [
      { name: 'active', type: 'boolean', allowDBNull: false },
    ])

    await mountFieldSwitch(
      model,
      'active',
      undefined,
      undefined,
      dataSource,
    )

    await nextTick()

    expect(dataSource.getPkKey(model)).toBeUndefined()
    expect(model['active']).toBe('')
  })

  it('应尊重组件 disabled 配置', async () => {
    const model = reactive<Record<string, unknown>>({ id: 'disabled-row', enabled: true })

    const wrapper = await mountFieldSwitch(
      model,
      'enabled',
      { disabled: true },
      [{ name: 'enabled', type: 'boolean', allowDBNull: false }],
    )

    await nextTick()

    const switchComp = wrapper.findComponent(ElSwitchStub)
    expect(switchComp.props('disabled')).toBe(true)
  })

  it('无字段写权限时应保持禁用（默认只读）', async () => {
    const model = reactive<Record<string, unknown>>({
      id: 'readonly-row',
      enabled: false,
      lingma_sys_params: { r: [], e: [], h: [], m: [], d: false },
    })

    const wrapper = await mountFieldSwitch(
      model,
      'enabled',
      undefined,
      [{ name: 'enabled', type: 'boolean', allowDBNull: false }],
    )

    await nextTick()

    const switchComp = wrapper.findComponent(ElSwitchStub)
    expect(switchComp.props('disabled')).toBe(true)
  })
})
