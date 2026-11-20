/**
 * Tests for Batch 5 field components:
 * - FieldTimePicker (r-time-picker)
 * - FieldTimeSelect (r-time-select)
 * - FieldAutocomplete (r-autocomplete)
 */
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { FieldTimePicker, FieldTimeSelect, FieldAutocomplete } from '@spark-appworks/spark-component'
import { mountFieldInContext } from '../../../support/helpers/mount-field-in-context'

// ── Stubs ──

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElTableColumnStub = defineComponent({
  setup() { return () => h('div', { class: 'el-table-column-stub' }) },
})

const ElTimePickerStub = defineComponent({
  props: ['modelValue', 'isRange', 'arrowControl', 'format', 'clearable', 'disabled'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-time-picker-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-is-range': String(props.isRange ?? false),
    })
  },
})

const ElTimeSelectStub = defineComponent({
  props: ['modelValue', 'start', 'end', 'step', 'minTime', 'maxTime', 'clearable', 'disabled'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-time-select-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-start': props.start ?? '',
      'data-end': props.end ?? '',
      'data-step': props.step ?? '',
    })
  },
})

const ElAutocompleteStub = defineComponent({
  props: ['modelValue', 'fetchSuggestions', 'placeholder', 'clearable', 'disabled', 'triggerOnFocus', 'highlightFirstItem', 'valueKey'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-autocomplete-stub',
      'data-value': String(props.modelValue ?? ''),
    })
  },
})

const globalStubsTimePicker = {
  stubs: {
    'el-time-picker': ElTimePickerStub,
    'el-form-item': ElFormItemStub,
    'el-table-column': ElTableColumnStub,
  },
}

const globalStubsTimeSelect = {
  stubs: {
    'el-time-select': ElTimeSelectStub,
    'el-form-item': ElFormItemStub,
    'el-table-column': ElTableColumnStub,
  },
}

const globalStubsAutocomplete = {
  stubs: {
    'el-autocomplete': ElAutocompleteStub,
    'el-form-item': ElFormItemStub,
    'el-table-column': ElTableColumnStub,
  },
}

// ── Tests ──

describe('FieldTimePicker (r-time-picker)', () => {
  it('should render and bind time value', () => {
    const model = reactive({ startTime: '09:00' })
    const wrapper = mountFieldInContext({
      component: FieldTimePicker,
      type: 'r-time-picker',
      model,
      fieldName: 'startTime',
      global: globalStubsTimePicker,
    })

    expect(wrapper.find('.el-time-picker-stub').exists()).toBe(true)
  })

  it('should update model on time change', async () => {
    const model = reactive({ startTime: '09:00' })
    const wrapper = mountFieldInContext({
      component: FieldTimePicker,
      type: 'r-time-picker',
      model,
      fieldName: 'startTime',
      global: globalStubsTimePicker,
    })

    const stub = wrapper.findComponent(ElTimePickerStub)
    stub.vm.$emit('update:modelValue', '10:30')
    await nextTick()
    expect(model.startTime).toBe('10:30')
  })

  it('should support range mode via isRange prop', () => {
    const model = reactive({ timeRange: null })
    const wrapper = mountFieldInContext({
      component: FieldTimePicker,
      type: 'r-time-picker',
      model,
      fieldName: 'timeRange',
      componentProps: { isRange: true },
      global: globalStubsTimePicker,
    })

    expect(wrapper.find('.el-time-picker-stub').attributes('data-is-range')).toBe('true')
  })

  it('onChange callback can cancel write-back', async () => {
    const model = reactive({ startTime: '09:00' })
    // InteractionControl is passed as the last arg; set control.cancel = true to prevent default
    const onChange = vi.fn((_next: unknown, _prev: unknown, control: { cancel: boolean }) => {
      control.cancel = true
    })
    const wrapper = mountFieldInContext({
      component: FieldTimePicker,
      type: 'r-time-picker',
      model,
      fieldName: 'startTime',
      componentProps: { onChange },
      global: globalStubsTimePicker,
    })

    const stub = wrapper.findComponent(ElTimePickerStub)
    stub.vm.$emit('update:modelValue', '11:00')
    await nextTick()
    expect(onChange).toHaveBeenCalled()
    expect(model.startTime).toBe('09:00')
  })
})

describe('FieldTimeSelect (r-time-select)', () => {
  it('should render and bind time value', () => {
    const model = reactive({ lunchTime: '12:00' })
    const wrapper = mountFieldInContext({
      component: FieldTimeSelect,
      type: 'r-time-select',
      model,
      fieldName: 'lunchTime',
      global: globalStubsTimeSelect,
    })

    expect(wrapper.find('.el-time-select-stub').exists()).toBe(true)
  })

  it('should update model on selection change', async () => {
    const model = reactive({ lunchTime: '12:00' })
    const wrapper = mountFieldInContext({
      component: FieldTimeSelect,
      type: 'r-time-select',
      model,
      fieldName: 'lunchTime',
      global: globalStubsTimeSelect,
    })

    const stub = wrapper.findComponent(ElTimeSelectStub)
    stub.vm.$emit('update:modelValue', '13:00')
    await nextTick()
    expect(model.lunchTime).toBe('13:00')
  })

  it('should pass start/end/step props to el-time-select', () => {
    const model = reactive({ lunchTime: '12:00' })
    const wrapper = mountFieldInContext({
      component: FieldTimeSelect,
      type: 'r-time-select',
      model,
      fieldName: 'lunchTime',
      componentProps: { start: '08:00', end: '18:00', step: '00:15' },
      global: globalStubsTimeSelect,
    })

    const stub = wrapper.findComponent(ElTimeSelectStub)
    expect(stub.props('start')).toBe('08:00')
    expect(stub.props('end')).toBe('18:00')
    expect(stub.props('step')).toBe('00:15')
  })
})

describe('FieldAutocomplete (r-autocomplete)', () => {
  it('should render and bind text value', () => {
    const model = reactive({ city: '北京' })
    const wrapper = mountFieldInContext({
      component: FieldAutocomplete,
      type: 'r-autocomplete',
      model,
      fieldName: 'city',
      global: globalStubsAutocomplete,
    })

    expect(wrapper.find('.el-autocomplete-stub').exists()).toBe(true)
  })

  it('should update model on input change', async () => {
    const model = reactive({ city: '北京' })
    const wrapper = mountFieldInContext({
      component: FieldAutocomplete,
      type: 'r-autocomplete',
      model,
      fieldName: 'city',
      global: globalStubsAutocomplete,
    })

    const stub = wrapper.findComponent(ElAutocompleteStub)
    stub.vm.$emit('update:modelValue', '上海')
    await nextTick()
    expect(model.city).toBe('上海')
  })

  it('should pass fetchSuggestions callback', () => {
    const fetchFn = vi.fn()
    const model = reactive({ city: '' })
    const wrapper = mountFieldInContext({
      component: FieldAutocomplete,
      type: 'r-autocomplete',
      model,
      fieldName: 'city',
      componentProps: { fetchSuggestions: fetchFn },
      global: globalStubsAutocomplete,
    })

    const stub = wrapper.findComponent(ElAutocompleteStub)
    expect(stub.props('fetchSuggestions')).toBe(fetchFn)
  })

  it('onChange callback can cancel write-back', async () => {
    const model = reactive({ city: '北京' })
    // InteractionControl is passed as the last arg; set control.cancel = true to prevent default
    const onChange = vi.fn((_next: unknown, _prev: unknown, control: { cancel: boolean }) => {
      control.cancel = true
    })
    const wrapper = mountFieldInContext({
      component: FieldAutocomplete,
      type: 'r-autocomplete',
      model,
      fieldName: 'city',
      componentProps: { onChange },
      global: globalStubsAutocomplete,
    })

    const stub = wrapper.findComponent(ElAutocompleteStub)
    stub.vm.$emit('update:modelValue', '上海')
    await nextTick()
    expect(onChange).toHaveBeenCalled()
    expect(model.city).toBe('北京')
  })
})
