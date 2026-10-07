import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { FieldCheckboxGroup } from '@spark-appworks/spark-component'
import { mountFieldInContext } from '../../../support/helpers/mount-field-in-context'

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElCheckboxGroupStub = defineComponent({
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-checkbox-group-stub',
      'data-value': JSON.stringify(props.modelValue ?? []),
      'data-disabled': String(Boolean(props.disabled)),
    }, slots['default']?.())
  },
})

const createCheckboxStub = (className: string) => defineComponent({
  props: ['value', 'label', 'disabled'],
  setup(props, { slots }) {
    return () => h('div', {
      class: className,
      'data-value': String(props.value ?? ''),
      'data-label': String(props.label ?? ''),
      'data-disabled': String(Boolean(props.disabled)),
    }, slots['default']?.())
  },
})

const ElCheckboxStub = createCheckboxStub('el-checkbox-stub')
const ElCheckboxButtonStub = createCheckboxStub('el-checkbox-button-stub')

function mountFieldCheckboxGroup(
  model: Record<string, unknown>,
  fieldName: string,
  componentProps?: Record<string, unknown>,
) {
  return mountFieldInContext({
    component: FieldCheckboxGroup,
    type: 'r-checkbox-group',
    model,
    fieldName,
    componentProps,
    global: {
      stubs: {
        'el-form-item': ElFormItemStub,
        'el-checkbox-group': ElCheckboxGroupStub,
        'el-checkbox': ElCheckboxStub,
        'el-checkbox-button': ElCheckboxButtonStub,
        'el-table-column': defineComponent({
          setup() { return () => h('div', { class: 'el-table-column-stub' }) },
        }),
      },
    },
  })
}

describe('FieldCheckboxGroup 复选组组件', () => {
  const departmentOptions = [
    { label: '技术部', value: 'tech' },
    { label: '产品部', value: 'product' },
  ]

  it('应继续向 el-checkbox 传递 label 作为选项值', () => {
    const model = reactive({ departments: ['tech'] })
    const wrapper = mountFieldCheckboxGroup(model, 'departments', {
      options: departmentOptions,
    })

    const checkboxes = wrapper.findAll('.el-checkbox-stub')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]?.attributes('data-label')).toBe('tech')
    expect(checkboxes[0]?.attributes('data-value')).toBe('')
  })

  it('buttonStyle 模式应切换到 el-checkbox-button', () => {
    const model = reactive({ departments: ['product'] })
    const wrapper = mountFieldCheckboxGroup(model, 'departments', {
      options: departmentOptions,
      buttonStyle: true,
    })

    const checkboxes = wrapper.findAll('.el-checkbox-button-stub')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[1]?.attributes('data-label')).toBe('product')
  })

  it('选择后应继续同步写回 contextData', async () => {
    const model = reactive<Record<string, unknown>>({ departments: [] })
    const wrapper = mountFieldCheckboxGroup(model, 'departments', {
      options: departmentOptions,
    })

    const group = wrapper.findComponent(ElCheckboxGroupStub)
    group.vm.$emit('update:modelValue', ['tech', 'product'])
    await nextTick()

    expect(model['departments']).toEqual(['tech', 'product'])
    expect(wrapper.find('.el-checkbox-group-stub').attributes('data-value')).toBe('["tech","product"]')
  })
})
