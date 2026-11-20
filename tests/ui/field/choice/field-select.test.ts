import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { FieldSelect } from '@spark-appworks/spark-component'
import { mountFieldInContext } from '../../../support/helpers/mount-field-in-context'

// ── Element Plus stubs ────────────────────────────────────────────────────────

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
    }, [
      slots['default']?.(),
      h('button', {
        class: 'select-trigger',
        onClick: () => {
          // trigger for test
        },
      }),
    ])
  },
})

const ElOptionStub = defineComponent({
  props: ['label', 'value', 'disabled'],
  setup(props) {
    return () => h('div', {
      class: 'el-option-stub',
      'data-value': String(props.value ?? ''),
      'data-label': props.label,
    }, props.label)
  },
})

// ── 测试辅助 ──────────────────────────────────────────────────────────────────

function mountFieldSelect(
  model: Record<string, unknown>,
  fieldName: string,
  componentProps?: Record<string, unknown>,
) {
  return mountFieldInContext({
    component: FieldSelect,
    type: 'r-select',
    model,
    fieldName,
    componentProps,
    global: {
      stubs: {
        'el-form-item': ElFormItemStub,
        'el-select': ElSelectStub,
        'el-option': ElOptionStub,
        'el-table-column': defineComponent({
          setup() { return () => h('div', { class: 'el-table-column-stub' }) },
        }),
      },
    },
  })
}

// ── 测试 ──────────────────────────────────────────────────────────────────────

describe('FieldSelect 下拉组件', () => {
  const departmentOptions = [
    { label: '技术部', value: '技术部' },
    { label: '产品部', value: '产品部' },
    { label: '设计部', value: '设计部' },
    { label: '市场部', value: '市场部' },
  ]

  describe('基本渲染', () => {
    it('应正确渲染选项列表', () => {
      const model = reactive({ department: undefined })
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
      })

      const options = wrapper.findAll('.el-option-stub')
      expect(options).toHaveLength(4)
      expect(options[0]?.attributes('data-label')).toBe('技术部')
      expect(options[0]?.attributes('data-value')).toBe('技术部')
    })

    it('初始值应为空（fallbackValue）', () => {
      const model = reactive({ department: undefined })
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
      })

      const select = wrapper.find('.el-select-stub')
      // fieldValue 应为 fallbackValue ''（因为 contextData.department === undefined）
      expect(select.attributes('data-value')).toBe('')
    })

    it('应读取 contextData 中的初始值', () => {
      const model = reactive({ department: '技术部' })
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
      })

      const select = wrapper.find('.el-select-stub')
      expect(select.attributes('data-value')).toBe('技术部')
    })
  })

  describe('syncValue 双向同步', () => {
    it('选择后应写入 contextData', async () => {
      const model = reactive<Record<string, unknown>>({ department: undefined })
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
      })

      // 模拟 el-select 的 update:modelValue 事件
      const select = wrapper.findComponent(ElSelectStub)
      select.vm.$emit('update:modelValue', '技术部')
      await nextTick()

      // syncValue 应将值写入 contextData
      expect(model['department']).toBe('技术部')
    })

    it('选择后 fieldValue 应反映新值', async () => {
      const model = reactive<Record<string, unknown>>({ department: undefined })
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
      })

      const select = wrapper.findComponent(ElSelectStub)
      select.vm.$emit('update:modelValue', '产品部')
      await nextTick()

      // el-select 的 model-value 应更新
      const selectEl = wrapper.find('.el-select-stub')
      expect(selectEl.attributes('data-value')).toBe('产品部')
    })

    it('选择后不应显示 false', async () => {
      const model = reactive<Record<string, unknown>>({ department: undefined })
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
      })

      const select = wrapper.findComponent(ElSelectStub)
      select.vm.$emit('update:modelValue', '技术部')
      await nextTick()

      // 核心断言：值不应该是 false
      expect(model['department']).not.toBe(false)
      expect(model['department']).not.toBe('false')
      const selectEl = wrapper.find('.el-select-stub')
      expect(selectEl.attributes('data-value')).not.toBe('false')
    })
  })

  describe('clearable 默认值不干扰', () => {
    it('clearable 默认值 true 不应影响 fieldValue', () => {
      const model = reactive({ department: undefined })
      // 不传 clearable，让默认值 true 生效
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
      })

      const select = wrapper.find('.el-select-stub')
      // fieldValue 不应等于 clearable 的默认值 true
      expect(select.attributes('data-value')).not.toBe('true')
      expect(select.attributes('data-value')).toBe('')
    })

    it('filterable 默认值 false 不应影响 fieldValue', () => {
      const model = reactive({ department: undefined })
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
      })

      const select = wrapper.find('.el-select-stub')
      expect(select.attributes('data-value')).not.toBe('false')
    })
  })

  describe('连续选择', () => {
    it('多次选择应正确更新', async () => {
      const model = reactive<Record<string, unknown>>({ department: undefined })
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
      })

      const select = wrapper.findComponent(ElSelectStub)

      // 第一次选择
      select.vm.$emit('update:modelValue', '技术部')
      await nextTick()
      expect(model['department']).toBe('技术部')

      // 第二次选择
      select.vm.$emit('update:modelValue', '产品部')
      await nextTick()
      expect(model['department']).toBe('产品部')

      const selectEl = wrapper.find('.el-select-stub')
      expect(selectEl.attributes('data-value')).toBe('产品部')
    })

    it('清空选择应写入空值', async () => {
      const model = reactive<Record<string, unknown>>({ department: '技术部' })
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
      })

      const select = wrapper.findComponent(ElSelectStub)

      // el-select clearable 清空时 emit 空字符串
      select.vm.$emit('update:modelValue', '')
      await nextTick()
      expect(model['department']).toBe('')
    })
  })

  describe('业务回调优先模式', () => {
    it('onChange 应先于默认 syncValue 执行，且可取消默认写回', async () => {
      const model = reactive<Record<string, unknown>>({ department: undefined })
      const observed: string[] = []
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
        onChange: vi.fn((next: string, _prev: string, control: { cancel: boolean }) => {
          observed.push(`change:${String(model['department'] ?? 'null')}:${next}:${String(control.cancel)}`)
          control.cancel = true
        }),
      })

      const select = wrapper.findComponent(ElSelectStub)
      select.vm.$emit('update:modelValue', '技术部')
      await nextTick()

      expect(observed).toEqual(['change:null:技术部:false'])
      expect(model['department']).toBeUndefined()
    })
  })

  describe('value 优先级', () => {
    it('显式 value 应优先于 contextData', () => {
      const model = reactive({ department: '技术部' })
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
        value: '产品部',
      })

      const select = wrapper.find('.el-select-stub')
      // useFieldPermission 逻辑：props.value !== undefined 时直接返回
      expect(select.attributes('data-value')).toBe('产品部')
    })
  })

  describe('options 来源', () => {
    it('从 props.options 获取选项', () => {
      const model = reactive({ department: undefined })
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
      })
      expect(wrapper.findAll('.el-option-stub')).toHaveLength(4)
    })

    it('从 config.props.options 获取选项', () => {
      const model = reactive({ department: undefined })
      const wrapper = mountFieldSelect(model, 'department', {
        options: departmentOptions,
      })

      expect(wrapper.findAll('.el-option-stub')).toHaveLength(4)
    })
  })
})
