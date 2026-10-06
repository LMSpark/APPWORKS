import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { FieldText, FieldCheckbox, FieldSlider, FieldRate, FieldColor, FieldMention } from '@spark-appworks/spark-component'
import { DATA_ROW, DATA_SOURCE, SPARK_REGISTRY_KEY, Spark, useSparkComponent } from '@spark-appworks/spark-component'
import { SUBTREE_FIELD_POLICY } from '../../packages/spark-component/src/permission'
import { SparkData, type DataView } from '@spark-appworks/spark-data'
import { mountFieldInContext } from '../helpers/mount-field-in-context'
import { mount } from '@vue/test-utils'
import { DataSpaceQueryTable } from '../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElInputStub = defineComponent({
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-input-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-disabled': String(Boolean(props.disabled)),
    })
  },
})

const ElCheckboxStub = defineComponent({
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-checkbox-stub',
      'data-value': String(Boolean(props.modelValue)),
      'data-disabled': String(Boolean(props.disabled)),
    }, slots['default']?.())
  },
})

const ElSliderStub = defineComponent({
  props: ['modelValue', 'min', 'max', 'step', 'disabled', 'showInput'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-slider-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-min': String(props.min ?? ''),
      'data-max': String(props.max ?? ''),
    })
  },
})

const ElRateStub = defineComponent({
  props: ['modelValue', 'max', 'allowHalf', 'disabled'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-rate-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-max': String(props.max ?? ''),
    })
  },
})

const ElColorPickerStub = defineComponent({
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-color-picker-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-disabled': String(Boolean(props.disabled)),
    })
  },
})

const ElMentionStub = defineComponent({
  props: ['modelValue', 'options', 'prefix', 'split', 'disabled'],
  emits: ['update:model-value', 'select', 'search'],
  setup(props) {
    return () => h('div', {
      class: 'el-mention-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-disabled': String(Boolean(props.disabled)),
    })
  },
})

async function createCurrentRowDataView(row: Record<string, unknown>, failOnRefresh = false): Promise<DataView> {
  const dataSet = SparkData.createDataSet({
    dataSetName: 'FieldBasicValueControlsDS',
    scenarioId: 'SCENE',
    tables: {
      Fields: {
        tableName: 'Fields',
        modelBinding: { modelId: 'MODEL', modelName: 'Fields' },
        columns: [
          { name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'name', type: 'string' },
          { name: 'assignee', type: 'string' },
          { name: 'phone', type: 'string' },
          { name: 'secret', type: 'string' },
        ],
        views: {
          default: {
            autoCurrentFirst: false,
            autoSelectFirst: false,
          },
        },
      },
    },
  })

  const view = dataSet.getView('Fields', 'default')
  if (!view) throw new Error('测试 DataView 创建失败: Fields@default')
  const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Fields' })
  const result = new DataSpaceQueryContext({ identity: table.identity, scope: 'field', readScope: () => 'field',
    snapshot: table.applyResult({ Result: { primaryKeyField: 'id', data: { Items: [{
      id: 'current', lingma_sys_params: { e: ['name', 'assignee'], d: false }, ...row,
    }], Count: 1 } } }) })
  let loads = 0
  view.bindQueryExecutor({ executeQuery: async () => {
    if (loads++ > 0 && failOnRefresh) throw new Error('query failed')
    return result
  } })
  await view.loadFromServer()
  const currentRow = view.rows[0]
  if (!currentRow) throw new Error('测试 DataView 缺少 currentRow')
  view.setCurrentRow(currentRow)
  return view
}

function readCurrentFieldValue(view: DataView, field: string): unknown {
  const currentRow = view.currentRow
  if (!currentRow) throw new Error('测试 DataView 未设置 currentRow')
  const rowId = view.getPkKey(currentRow)
  if (rowId === undefined) return currentRow[field]
  return view.getEditingRow(rowId)?.[field] ?? currentRow[field]
}

function mountBasicField(
  component: object,
  type: 'r-text' | 'r-checkbox' | 'r-slider' | 'r-rate' | 'r-color',
  model: Record<string, unknown>,
  fieldName: string,
  componentProps?: Record<string, unknown>,
) {
  return mountFieldInContext({
    component,
    type,
    model,
    fieldName,
    componentProps,
    global: {
      stubs: {
        'el-form-item': ElFormItemStub,
        'el-input': ElInputStub,
        'el-checkbox': ElCheckboxStub,
        'el-slider': ElSliderStub,
        'el-rate': ElRateStub,
        'el-color-picker': ElColorPickerStub,
        'el-mention': ElMentionStub,
        'el-table-column': defineComponent({
          setup() { return () => h('div', { class: 'el-table-column-stub' }) },
        }),
      },
    },
  })
}

describe('基础值字段组件', () => {
  it('FieldText 应继续将输入值写回 contextData', async () => {
    const model = reactive<Record<string, unknown>>({ name: '' })
    const wrapper = mountBasicField(FieldText, 'r-text', model, 'name')

    const input = wrapper.findComponent(ElInputStub)
    input.vm.$emit('update:modelValue', 'Alice')
    await nextTick()

    expect(model['name']).toBe('Alice')
    expect(wrapper.find('.el-input-stub').attributes('data-value')).toBe('Alice')
  })

  it('FieldCheckbox 应继续同步布尔值', async () => {
    const model = reactive<Record<string, unknown>>({ agreed: false })
    const wrapper = mountBasicField(FieldCheckbox, 'r-checkbox', model, 'agreed', {
      checkboxText: '同意协议',
    })

    const checkbox = wrapper.findComponent(ElCheckboxStub)
    checkbox.vm.$emit('update:modelValue', true)
    await nextTick()

    expect(model['agreed']).toBe(true)
    expect(wrapper.find('.el-checkbox-stub').text()).toContain('同意协议')
  })

  it('FieldSlider 应继续同步数字值', async () => {
    const model = reactive<Record<string, unknown>>({ score: 10 })
    const wrapper = mountBasicField(FieldSlider, 'r-slider', model, 'score', {
      min: 0,
      max: 100,
      step: 5,
    })

    const slider = wrapper.findComponent(ElSliderStub)
    slider.vm.$emit('update:modelValue', 25)
    await nextTick()

    expect(model['score']).toBe(25)
  })

  it('FieldRate 应继续同步评分值', async () => {
    const model = reactive<Record<string, unknown>>({ rating: 2 })
    const wrapper = mountBasicField(FieldRate, 'r-rate', model, 'rating', {
      max: 5,
      allowHalf: true,
    })

    const rate = wrapper.findComponent(ElRateStub)
    rate.vm.$emit('update:modelValue', 4)
    await nextTick()

    expect(model['rating']).toBe(4)
    expect(wrapper.find('.el-rate-stub').attributes('data-value')).toBe('4')
  })

  it('FieldColor 应继续将 null 归一为空字符串', async () => {
    const model = reactive<Record<string, unknown>>({ color: '#409eff' })
    const wrapper = mountBasicField(FieldColor, 'r-color', model, 'color')

    const colorPicker = wrapper.findComponent(ElColorPickerStub)
    colorPicker.vm.$emit('update:modelValue', null)
    await nextTick()

    expect(model['color']).toBe('')
    expect(wrapper.find('.el-color-picker-stub').attributes('data-value')).toBe('')
  })

  it('FieldText 在缺失 DATA_ROW 时应通过 DATA_SOURCE.currentRow 读写', async () => {
    const view = await createCurrentRowDataView({ name: '' })
    const { registry, rootContext } = Spark.createSystem()

    const Provider = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'r-form' }, { parentContext: rootContext })
        sparkProvide(DATA_SOURCE, view)
        return () => h(FieldText, { type: 'r-text', field: 'name' })
      },
    })

    const wrapper = mount(Provider, {
      global: {
        provide: {
          [SPARK_REGISTRY_KEY]: registry,
        },
        stubs: {
          'el-form-item': ElFormItemStub,
          'el-input': ElInputStub,
          'el-checkbox': ElCheckboxStub,
          'el-slider': ElSliderStub,
          'el-rate': ElRateStub,
          'el-color-picker': ElColorPickerStub,
          'el-mention': ElMentionStub,
          'el-table-column': defineComponent({
            setup() { return () => h('div', { class: 'el-table-column-stub' }) },
          }),
        },
      },
    })

    const input = wrapper.findComponent(ElInputStub)
    input.vm.$emit('update:modelValue', 'Bob')
    await nextTick()

    expect(readCurrentFieldValue(view, 'name')).toBe('Bob')
    expect(wrapper.find('.el-input-stub').attributes('data-value')).toBe('Bob')
  })

  it('FieldMention 在缺失 DATA_ROW 时应通过 DATA_SOURCE.currentRow 写回字段', async () => {
    const view = await createCurrentRowDataView({ assignee: '' })
    const { registry, rootContext } = Spark.createSystem()

    const Provider = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'r-form' }, { parentContext: rootContext })
        sparkProvide(DATA_SOURCE, view)
        return () => h(FieldMention, {
          type: 'r-mention',
          field: 'assignee',
          mentionTriggers: [{ prefix: '@', split: ' ' }],
          options: [{ value: 'alice', label: 'Alice' }],
        })
      },
    })

    const wrapper = mount(Provider, {
      global: {
        provide: {
          [SPARK_REGISTRY_KEY]: registry,
        },
        stubs: {
          'el-form-item': ElFormItemStub,
          'el-input': ElInputStub,
          'el-checkbox': ElCheckboxStub,
          'el-slider': ElSliderStub,
          'el-rate': ElRateStub,
          'el-color-picker': ElColorPickerStub,
          'el-mention': ElMentionStub,
          'el-table-column': defineComponent({
            setup() { return () => h('div', { class: 'el-table-column-stub' }) },
          }),
        },
      },
    })

    const mention = wrapper.findComponent(ElMentionStub)
    mention.vm.$emit('update:model-value', 'Alice')
    await nextTick()

    expect(readCurrentFieldValue(view, 'assignee')).toBe('Alice')
    expect(wrapper.find('.el-mention-stub').attributes('data-value')).toBe('Alice')
  })
})

describe('原查询字段双通道呈现', () => {
  async function fixture(failOnRefresh = false) {
    return createCurrentRowDataView({ name: null, phone: null, secret: null,
      lingma_sys_params: { e: ['name', 'phone'], r: ['name'], h: ['name', 'secret'], m: ['phone'], d: false },
    }, failOnRefresh)
  }

  function mountBoundText(view: DataView, fieldName: string) {
    return mountFieldInContext({ component: FieldText, type: 'r-text', model: view.currentRow!, fieldName, dataSource: view,
      componentProps: { modelValue: 'must not reveal protected input' },
      global: { stubs: { 'el-input': ElInputStub, 'el-form-item': ElFormItemStub } },
    })
  }

  it.each(['name', 'phone'])('renders protected but writable %s as a blank input', async (fieldName) => {
    const view = await fixture()
    const wrapper = mountBoundText(view, fieldName)
    expect(wrapper.get('.el-input-stub').attributes('data-value')).toBe('')
    expect(wrapper.get('.el-input-stub').attributes('data-disabled')).toBe('false')
    expect(view.hasEditingChanges()).toBe(false)
    wrapper.findComponent(ElInputStub).vm.$emit('update:modelValue', 'new explicit value')
    await nextTick()
    expect(view.getEditingRow('current')?.[fieldName]).toBe('new explicit value')
    expect(view.currentRow?.[fieldName]).toBeNull()
    wrapper.unmount()
    view.destroy()
  })

  it('decorates required fields from the current original R set', async () => {
    const view = await fixture()
    const wrapper = mountBoundText(view, 'name')
    expect(wrapper.findComponent(ElFormItemStub).props('rules')).toEqual(expect.arrayContaining([expect.objectContaining({ required: true })]))
    wrapper.unmount()
    view.destroy()
  })

  it('does not render a hidden readonly field despite a forged public E set', async () => {
    const view = await fixture()
    if (!view.currentRow) throw new Error('missing current row')
    view.currentRow['lingma_sys_params'] = { e: ['secret'], h: [], m: [], r: [], d: false }
    const wrapper = mountBoundText(view, 'secret')
    expect(wrapper.find('.el-input-stub').exists()).toBe(false)
    wrapper.unmount()
    view.destroy()
  })

  it('keeps visible false and zero values from returned rows', async () => {
    for (const value of [false, 0]) {
      const view = await createCurrentRowDataView({ name: value })
      const wrapper = mountFieldInContext({ component: FieldText, type: 'r-text', model: view.currentRow!, fieldName: 'name', dataSource: view,
        global: { stubs: { 'el-input': ElInputStub, 'el-form-item': ElFormItemStub } },
      })
      expect(wrapper.get('.el-input-stub').attributes('data-value')).toBe(String(value))
      wrapper.unmount()
      view.destroy()
    }
  })

  it('pauses the field write channel after a query error', async () => {
    const view = await fixture(true)
    const wrapper = mountBoundText(view, 'phone')
    await expect(view.loadFromServer()).rejects.toThrow('query failed')
    await nextTick()
    expect(wrapper.get('.el-input-stub').attributes('data-disabled')).toBe('true')
    wrapper.findComponent(ElInputStub).vm.$emit('update:modelValue', 'stale write')
    await nextTick()
    expect(view.hasEditingChanges()).toBe(false)
    wrapper.unmount()
    view.destroy()
  })

  it('keeps local filter input separate from a business draft with the same key', async () => {
    const view = await createCurrentRowDataView({ name: 'business' })
    view.updateEditingValue('current', 'name', 'business draft')
    const filter = reactive({ id: 'current', name: 'filter' })
    const { registry, rootContext } = Spark.createSystem()
    const Provider = defineComponent({ setup() {
      const { sparkProvide } = useSparkComponent({ type: 'r-form' }, { parentContext: rootContext })
      sparkProvide(DATA_SOURCE, view)
      sparkProvide(DATA_ROW, filter)
      sparkProvide(SUBTREE_FIELD_POLICY, 'unrestricted')
      return () => h(FieldText, { type: 'r-text', field: 'name' })
    } })
    const wrapper = mount(Provider, { global: {
      provide: { [SPARK_REGISTRY_KEY]: registry },
      stubs: { 'el-input': ElInputStub, 'el-form-item': ElFormItemStub },
    } })
    expect(wrapper.get('.el-input-stub').attributes('data-value')).toBe('filter')
    wrapper.findComponent(ElInputStub).vm.$emit('update:modelValue', 'new filter')
    await nextTick()
    expect(filter.name).toBe('new filter')
    expect(view.getEditingRow('current')?.['name']).toBe('business draft')
    wrapper.unmount()
    view.destroy()
  })
})
