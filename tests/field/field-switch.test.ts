import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { FieldSwitch } from '@spark-appworks/spark-component'
import { SparkData, type DataColumn, type DataView } from '@spark-appworks/spark-data'
import { mountFieldInContext } from '../helpers/mount-field-in-context'

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

function mountFieldSwitch(
  model: Record<string, unknown>,
  fieldName: string,
  componentProps?: Record<string, unknown>,
  columns?: DataColumn[],
  dataSource?: DataView,
) {
  const resolvedDataSource = dataSource ?? (columns !== undefined
    ? createSwitchDataView(model, columns)
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

function createSwitchDataView(model: Record<string, unknown>, columns: DataColumn[]): DataView {
  const dataSet = SparkData.createDataSet({
    dataSetName: 'FieldSwitchDS',
    tables: {
      SwitchRows: {
        tableName: 'SwitchRows',
        columns: withPrimaryKeyColumn(columns),
        views: {
          default: {
            rows: [model],
            autoCurrentFirst: false,
            autoSelectFirst: false,
          },
        },
      },
    },
  })
  const view = dataSet.getView('SwitchRows', 'default')
  if (!view) throw new Error('测试 DataView 创建失败: SwitchRows@default')
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
    const wrapper = mountFieldSwitch(model, 'enabled', {
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
    const dataSource = createSwitchDataView(model, [
      { name: 'dividerAfter', type: 'boolean', allowDBNull: true },
    ])

    mountFieldSwitch(model, 'dividerAfter', undefined, undefined, dataSource)

    await nextTick()

    expect(readSwitchFieldValue(dataSource, model, 'dividerAfter')).toBeNull()
  })

  it('应将非可空布尔缺字段归一为 false', async () => {
    const model = reactive<Record<string, unknown>>({ id: 'required-row' })
    const dataSource = createSwitchDataView(model, [
      { name: 'hidden', type: 'boolean', allowDBNull: false },
    ])

    mountFieldSwitch(model, 'hidden', undefined, undefined, dataSource)

    await nextTick()

    expect(readSwitchFieldValue(dataSource, model, 'hidden')).toBe(false)
  })

  it('绑定 DataView 且当前行缺少主键时应跳过初始化归一写回', async () => {
    const model = reactive<Record<string, unknown>>({ active: '' })
    const dataSource = createSwitchDataView(model, [
      { name: 'active', type: 'boolean', allowDBNull: false },
    ])

    mountFieldSwitch(
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
    const model = reactive<Record<string, unknown>>({ enabled: true })

    const wrapper = mountFieldSwitch(
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
      enabled: false,
      lingma_sys_params: { r: [], e: [], h: [], m: [], d: false },
    })

    const wrapper = mountFieldSwitch(
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
