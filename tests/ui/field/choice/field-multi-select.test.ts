import { describe, expect, it } from 'vitest'
import { defineComponent, h, reactive } from 'vue'
import { FieldMultiSelect } from '@spark-appworks/spark-component'
import { mountFieldInContext } from '../../../support/helpers/mount-field-in-context'

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElSelectStub = defineComponent({
  props: {
    modelValue: { type: Array, default: () => [] },
    placeholder: { type: String, default: '' },
    clearable: { type: Boolean, default: false },
    filterable: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    multiple: { type: Boolean, default: false },
    collapseTags: { type: Boolean, default: false },
    collapseTagsTooltip: { type: Boolean, default: false },
    maxCollapseTags: { type: Number, default: undefined },
  },
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-select-stub',
      'data-multiple': String(props.multiple ?? false),
      'data-collapse-tags': String(props.collapseTags ?? false),
      'data-collapse-tags-tooltip': String(props.collapseTagsTooltip ?? false),
      'data-max-collapse-tags': String(props.maxCollapseTags ?? ''),
      'data-value': JSON.stringify(props.modelValue ?? []),
    }, slots['default']?.())
  },
})

const ElOptionStub = defineComponent({
  props: ['label', 'value', 'disabled'],
  setup(props) {
    return () => h('div', { class: 'el-option-stub', 'data-label': props.label }, props.label)
  },
})

function mountFieldMultiSelect(
  model: Record<string, unknown>,
  fieldName: string,
  componentProps?: Record<string, unknown>,
) {
  return mountFieldInContext({
    component: FieldMultiSelect,
    type: 'r-multi-select',
    model,
    fieldName,
    componentProps,
    global: {
      stubs: {
        'el-form-item': ElFormItemStub,
        'el-select': ElSelectStub,
        'el-option': ElOptionStub,
        'el-table-column': defineComponent({
          setup() {
            return () => h('div', { class: 'el-table-column-stub' })
          },
        }),
      },
    },
  })
}

describe('FieldMultiSelect 显示策略', () => {
  const options = [
    { label: '在职', value: '在职' },
    { label: '离职', value: '离职' },
    { label: '试用', value: '试用' },
  ]

  it('默认不折叠标签，便于过滤面板直接阅读已选值', () => {
    const wrapper = mountFieldMultiSelect(reactive({ status: ['在职', '离职'] }), 'status', { options })
    const select = wrapper.find('.el-select-stub')

    expect(select.attributes('data-multiple')).toBe('true')
    expect(select.attributes('data-collapse-tags')).toBe('false')
    expect(select.attributes('data-collapse-tags-tooltip')).toBe('false')
    expect(select.attributes('data-max-collapse-tags')).toBe('1')
  })

  it('支持显式开启折叠标签', () => {
    const wrapper = mountFieldMultiSelect(reactive({ status: ['在职', '离职'] }), 'status', {
      options,
      collapseTags: true,
      collapseTagsTooltip: true,
      maxCollapseTags: 2,
    })
    const select = wrapper.find('.el-select-stub')

    expect(select.attributes('data-collapse-tags')).toBe('true')
    expect(select.attributes('data-collapse-tags-tooltip')).toBe('true')
    expect(select.attributes('data-max-collapse-tags')).toBe('2')
  })
})
