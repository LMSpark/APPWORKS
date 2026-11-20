import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { FieldTransfer } from '@spark-appworks/spark-component'
import { mountFieldInContext } from '../../../support/helpers/mount-field-in-context'
import { requireRecord } from '../../../support/helpers/runtime-guards'

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElTransferStub = defineComponent({
  props: ['modelValue', 'data', 'titles', 'filterable', 'filterPlaceholder', 'targetOrder', 'disabled'],
  emits: ['update:modelValue'],
  setup(props) {
    const rows = Array.isArray(props.data) ? props.data : []
    const firstRow = rows[0] !== undefined ? requireRecord(rows[0], 'transfer first row') : undefined
    return () => h('div', {
      class: 'el-transfer-stub',
      'data-value': JSON.stringify(props.modelValue ?? []),
      'data-size': String(rows.length),
      'data-first-key': String(firstRow?.['key'] ?? ''),
      'data-first-label': String(firstRow?.['label'] ?? ''),
      'data-target-order': String(props.targetOrder ?? ''),
    })
  },
})

function mountFieldTransfer(
  model: Record<string, unknown>,
  fieldName: string,
  componentProps?: Record<string, unknown>,
) {
  return mountFieldInContext({
    component: FieldTransfer,
    type: 'r-transfer',
    model,
    fieldName,
    componentProps,
    global: {
      stubs: {
        'el-form-item': ElFormItemStub,
        'el-transfer': ElTransferStub,
        'el-table-column': defineComponent({
          setup() {
            return () => h('div', { class: 'el-table-column-stub' })
          },
        }),
      },
    },
  })
}

describe('FieldTransfer 穿梭框字段', () => {
  const options = [
    { label: '技术部', value: 'tech' },
    { label: '产品部', value: 'product' },
  ]

  it('应继续将 options 映射为 transferData', () => {
    const wrapper = mountFieldTransfer(reactive({ departments: ['tech'] }), 'departments', { options })
    const transfer = wrapper.find('.el-transfer-stub')

    expect(transfer.attributes('data-size')).toBe('2')
    expect(transfer.attributes('data-first-key')).toBe('tech')
    expect(transfer.attributes('data-first-label')).toBe('技术部')
  })

  it('选择后应继续同步写回 contextData', async () => {
    const model = reactive<Record<string, unknown>>({ departments: [] })
    const wrapper = mountFieldTransfer(model, 'departments', { options, targetOrder: 'push' })
    const transfer = wrapper.findComponent(ElTransferStub)

    transfer.vm.$emit('update:modelValue', ['tech', 'product'])
    await nextTick()

    expect(model['departments']).toEqual(['tech', 'product'])
    expect(wrapper.find('.el-transfer-stub').attributes('data-value')).toBe('["tech","product"]')
    expect(wrapper.find('.el-transfer-stub').attributes('data-target-order')).toBe('push')
  })
})
