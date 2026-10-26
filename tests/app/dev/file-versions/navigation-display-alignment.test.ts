import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import NodeStateConfig from '@/views/app/dev-system/components/NodeStateConfig.vue'
import type { DevState } from '@/views/app/dev-system/useDevState'

describe('NodeStateConfig navigation display attributes', () => {
  it('binds navigation display attributes to formal option views and refreshes external dirty state', async () => {
    const access = vi.fn(() => ({ read: true, write: true }))
    const notifyExternalDataViewChanged = vi.fn()
    const loadNavigationDictionaryOptions = vi.fn(async () => {})
    const state = {
      blueprintDraft: {
        navigation: {
          title: 'Reports', order: 1, publishInMenu: true, showChildren: true, beginGroup: false,
          displayMode: 'compact', horizontalAlignment: 'center',
        },
      },
      blueprintNodeFieldAccess: access,
      notifyExternalDataViewChanged,
      loadNavigationDictionaryOptions,
    }
    const FieldSelectStub = defineComponent({
      props: { dataViewKey: String, dataMember: String, dataField: String, optionDataViewKey: String, optionValueField: String, optionLabelField: String, readonly: Boolean },
      emits: ['update:modelValue'],
      template: '<button :data-field="dataField" :disabled="readonly" />',
    })
    const FormItem = defineComponent({ props: { label: String }, template: '<label>{{ label }}<slot /></label>' })
    const wrapper = mount(NodeStateConfig, {
      props: { state: state as unknown as DevState },
      global: { stubs: { ElDivider: true, ElFormItem: FormItem, ElAlert: true, FieldSelect: FieldSelectStub, ElInput: true, ElSwitch: true, ElInputNumber: true } },
    })

    await nextTick()
    await Promise.resolve()
    await nextTick()
    expect(loadNavigationDictionaryOptions).toHaveBeenCalledOnce()
    const fields = wrapper.findAllComponents(FieldSelectStub)
    expect(fields.map(field => field.props('dataField'))).toEqual(['NavigationShowType', 'HorizontalAlignment'])
    expect(fields[0]?.props()).toMatchObject({dataMember: 'currentRow', optionValueField: 'val', optionLabelField: 'txt', readonly: false})
    expect(fields[0]?.props('optionDataViewKey')).toContain('NavigationShowType_Content')
    expect(fields[1]?.props('optionDataViewKey')).toContain('Navigationposition')
    expect(access).toHaveBeenCalledWith('NavigationShowType')
    expect(access).toHaveBeenCalledWith('HorizontalAlignment')

    fields[0]!.vm.$emit('update:modelValue', '1')
    fields[1]!.vm.$emit('update:modelValue', 'Right')
    expect(notifyExternalDataViewChanged).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('hides unreadable attributes and disables readable attributes without write permission', () => {
    const state = {
      blueprintDraft: { navigation: { displayMode: 'compact', horizontalAlignment: 'center' } },
      blueprintNodeFieldAccess: (field: string) => ({ read: field !== 'NavigationShowType', write: false }),
      notifyExternalDataViewChanged: vi.fn(),
      loadNavigationDictionaryOptions: vi.fn(async () => {}),
    }
    const FieldSelectStub = defineComponent({ props: { dataField: String, readonly: Boolean }, template: '<input :data-field="dataField" :disabled="readonly" />' })
    const FormItem = defineComponent({ props: { label: String }, template: '<label>{{ label }}<slot /></label>' })
    const wrapper = mount(NodeStateConfig, {
      props: { state: state as unknown as DevState },
      global: { stubs: { ElDivider: true, ElFormItem: FormItem, ElAlert: true, FieldSelect: FieldSelectStub, ElInput: true, ElSwitch: true, ElInputNumber: true } },
    })

    expect(wrapper.text()).not.toContain('显示方式')
    expect(wrapper.text()).toContain('水平对齐')
    expect(wrapper.findComponent(FieldSelectStub).props('readonly')).toBe(true)
    wrapper.unmount()
  })
})
