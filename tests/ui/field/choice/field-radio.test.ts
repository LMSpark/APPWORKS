import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { FieldRadio } from '@spark-appworks/spark-component'
import { mountFieldInContext } from '../../../support/helpers/mount-field-in-context'

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElRadioGroupStub = defineComponent({
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-radio-group-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-disabled': String(Boolean(props.disabled)),
    }, slots['default']?.())
  },
})

const createRadioStub = (className: string) => defineComponent({
  props: ['value', 'label', 'disabled'],
  setup(props, { slots }) {
    return () => h('div', {
      class: className,
      'data-value': String(props.value ?? ''),
      'data-has-label-prop': String(props.label !== undefined),
      'data-disabled': String(Boolean(props.disabled)),
    }, slots['default']?.())
  },
})

const ElRadioStub = createRadioStub('el-radio-stub')
const ElRadioButtonStub = createRadioStub('el-radio-button-stub')

function mountFieldRadio(
  model: Record<string, unknown>,
  fieldName: string,
  componentProps?: Record<string, unknown>,
) {
  return mountFieldInContext({
    component: FieldRadio,
    type: 'r-radio',
    model,
    fieldName,
    componentProps,
    global: {
      stubs: {
        'el-form-item': ElFormItemStub,
        'el-radio-group': ElRadioGroupStub,
        'el-radio': ElRadioStub,
        'el-radio-button': ElRadioButtonStub,
        'el-table-column': defineComponent({
          setup() { return () => h('div', { class: 'el-table-column-stub' }) },
        }),
      },
    },
  })
}

describe('FieldRadio 单选组件', () => {
  const departmentOptions = [
    { label: '技术部', value: 'tech' },
    { label: '产品部', value: 'product' },
  ]

  it('应向 el-radio 传递 value 而不是废弃的 label 值', () => {
    const model = reactive({ department: 'tech' })
    const wrapper = mountFieldRadio(model, 'department', {
      options: departmentOptions,
    })

    const radios = wrapper.findAll('.el-radio-stub')
    expect(radios).toHaveLength(2)
    expect(radios[0]?.attributes('data-value')).toBe('tech')
    expect(radios[0]?.attributes('data-has-label-prop')).toBe('false')
  })

  it('buttonStyle 模式也应向 el-radio-button 传递 value', () => {
    const model = reactive({ department: 'product' })
    const wrapper = mountFieldRadio(model, 'department', {
      options: departmentOptions,
      buttonStyle: true,
    })

    const radios = wrapper.findAll('.el-radio-button-stub')
    expect(radios).toHaveLength(2)
    expect(radios[1]?.attributes('data-value')).toBe('product')
    expect(radios[1]?.attributes('data-has-label-prop')).toBe('false')
  })

  it('选择后应继续同步写回 contextData', async () => {
    const model = reactive<Record<string, unknown>>({ department: undefined })
    const wrapper = mountFieldRadio(model, 'department', {
      options: departmentOptions,
    })

    const group = wrapper.findComponent(ElRadioGroupStub)
    group.vm.$emit('update:modelValue', 'product')
    await nextTick()

    expect(model['department']).toBe('product')
    expect(wrapper.find('.el-radio-group-stub').attributes('data-value')).toBe('product')
  })
})
