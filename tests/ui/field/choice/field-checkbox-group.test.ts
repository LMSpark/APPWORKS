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
  it('decodes explicitly separated values and writes the same string field without a second model',async()=>{
    const model=reactive<Record<string,unknown>>({operations:'add,edit'})
    const wrapper=mountFieldCheckboxGroup(model,'operations',{valueMode:'separated-string',valueSeparator:',',options:[{label:'添加',value:'add'},{label:'编辑',value:'edit'},{label:'删除',value:'delete'}]})
    const group=wrapper.findComponent(ElCheckboxGroupStub)
    expect(group.props('modelValue')).toEqual(['add','edit'])
    group.vm.$emit('update:modelValue',['edit','delete']);await nextTick()
    expect(model['operations']).toBe('edit,delete')
    group.vm.$emit('update:modelValue',[]);await nextTick();expect(model['operations']).toBe('')
    wrapper.unmount()
  })
  it.each([['auto','tech','tech,product'],['auto',['tech'],['tech','product']],['array','tech',['tech','product']]] as const)('honors explicit %s storage using the current field shape',async(valueMode,initial,expected)=>{
    const model=reactive<Record<string,unknown>>({departments:initial})
    const wrapper=mountFieldCheckboxGroup(model,'departments',{valueMode,options:[{label:'技术',value:'tech'},{label:'产品',value:'product'}]})
    const group=wrapper.findComponent(ElCheckboxGroupStub)
    expect(group.props('modelValue')).toEqual(['tech'])
    group.vm.$emit('update:modelValue',['tech','product']);await nextTick()
    expect(model['departments']).toEqual(expected);wrapper.unmount()
  })
  it('resolves numeric candidates with a custom separator and preserves readonly values',async()=>{
    const model=reactive<Record<string,unknown>>({departments:'1|2'})
    const wrapper=mountFieldCheckboxGroup(model,'departments',{valueMode:'separated-string',valueSeparator:'|',options:[{label:'一',value:1},{label:'二',value:2}],readonly:true})
    const group=wrapper.findComponent(ElCheckboxGroupStub)
    expect(group.props('modelValue')).toEqual([1,2]);expect(group.props('disabled')).toBe(true)
    group.vm.$emit('update:modelValue',[2]);await nextTick();expect(model['departments']).toBe('1|2');wrapper.unmount()
  })
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
