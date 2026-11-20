import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { FieldIcon } from '@spark-appworks/spark-component'
import { mountFieldInContext } from '../../../support/helpers/mount-field-in-context'

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElSelectStub = defineComponent({
  props: ['modelValue', 'placeholder', 'clearable', 'filterable', 'disabled'],
  emits: ['update:modelValue'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-select-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-disabled': String(Boolean(props.disabled)),
    }, slots['default']?.())
  },
})

const ElOptionStub = defineComponent({
  props: ['label', 'value', 'disabled'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-option-stub',
      'data-label': String(props.label ?? ''),
      'data-value': String(props.value ?? ''),
    }, slots['default']?.())
  },
})

function mountFieldIcon(
  model: Record<string, unknown>,
  fieldName: string,
  componentProps?: Record<string, unknown>,
) {
  return mountFieldInContext({
    component: FieldIcon,
    type: 'r-icon',
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

describe('FieldIcon 图标字段', () => {
  const options = [
    { label: '用户', value: 'user' },
    { label: '设置', value: 'settings' },
  ]

  it('应继续渲染图标选项列表', () => {
    const wrapper = mountFieldIcon(reactive({ iconName: 'user' }), 'iconName', { options })
    const renderedOptions = wrapper.findAll('.el-option-stub')

    expect(renderedOptions).toHaveLength(2)
    expect(renderedOptions[0]?.attributes('data-label')).toBe('用户')
    expect(renderedOptions[0]?.attributes('data-value')).toBe('user')
  })

  it('选择后应继续写回字符串值', async () => {
    const model = reactive<Record<string, unknown>>({ iconName: '' })
    const wrapper = mountFieldIcon(model, 'iconName', { options })
    const select = wrapper.findComponent(ElSelectStub)

    select.vm.$emit('update:modelValue', 'settings')
    await nextTick()

    expect(model['iconName']).toBe('settings')
    expect(wrapper.find('.el-select-stub').attributes('data-value')).toBe('settings')
  })

  it('非字符串值也应归一为字符串后写回', async () => {
    const model = reactive<Record<string, unknown>>({ iconName: '' })
    const wrapper = mountFieldIcon(model, 'iconName', { options: [{ label: '数字', value: 42 }] })
    const select = wrapper.findComponent(ElSelectStub)

    select.vm.$emit('update:modelValue', 42)
    await nextTick()

    expect(model['iconName']).toBe('42')
    expect(wrapper.find('.el-select-stub').attributes('data-value')).toBe('42')
  })
})
