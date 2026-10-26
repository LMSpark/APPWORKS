import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import NodeStateConfig from '@/views/app/dev-system/components/NodeStateConfig.vue'
import type { DevState } from '@/views/app/dev-system/useDevState'

describe('NodeStateConfig navigation display attributes', () => {
  it('edits display mode and horizontal alignment through the existing navigation draft', async () => {
    const access = vi.fn(() => ({ read: true, write: true }))
    const markBlueprintDirty = vi.fn()
    const state = {
      blueprintDraft: {
        navigation: {
          title: 'Reports', order: 1, publishInMenu: true, showChildren: true, beginGroup: false,
          displayMode: 'compact', horizontalAlignment: 'center',
        },
      },
      blueprintNodeFieldAccess: access,
      markBlueprintDirty,
    }
    const Input = defineComponent({
      props: { modelValue: { type: String, default: '' }, disabled: Boolean },
      emits: ['update:modelValue', 'change'],
      template: '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" @change="$emit(\'change\', $event.target.value)" />',
    })
    const FormItem = defineComponent({ props: { label: String }, template: '<label>{{ label }}<slot /></label>' })
    const wrapper = mount(NodeStateConfig, {
      props: { state: state as unknown as DevState },
      global: { stubs: { ElDivider: true, ElFormItem: FormItem, ElInput: Input, ElSwitch: true, ElInputNumber: true } },
    })

    const fields = wrapper.findAllComponents(Input)
    expect(fields.map(field => field.element.getAttribute('value'))).toEqual(['compact', 'center'])
    expect(access).toHaveBeenCalledWith('NavigationShowType')
    expect(access).toHaveBeenCalledWith('HorizontalAlignment')

    await fields[0]!.setValue('wide')
    await fields[0]!.trigger('change')
    await fields[1]!.setValue('right')
    await fields[1]!.trigger('change')

    expect(state.blueprintDraft.navigation.displayMode).toBe('wide')
    expect(state.blueprintDraft.navigation.horizontalAlignment).toBe('right')
    expect(markBlueprintDirty).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('hides unreadable attributes and disables readable attributes without write permission', () => {
    const state = {
      blueprintDraft: { navigation: { displayMode: 'compact', horizontalAlignment: 'center' } },
      blueprintNodeFieldAccess: (field: string) => ({ read: field !== 'NavigationShowType', write: false }),
      markBlueprintDirty: vi.fn(),
    }
    const Input = defineComponent({ props: { modelValue: String, disabled: Boolean }, template: '<input :disabled="disabled" />' })
    const FormItem = defineComponent({ props: { label: String }, template: '<label>{{ label }}<slot /></label>' })
    const wrapper = mount(NodeStateConfig, {
      props: { state: state as unknown as DevState },
      global: { stubs: { ElDivider: true, ElFormItem: FormItem, ElInput: Input, ElSwitch: true, ElInputNumber: true } },
    })

    expect(wrapper.text()).not.toContain('显示方式')
    expect(wrapper.text()).toContain('水平对齐')
    expect(wrapper.findComponent(Input).props('disabled')).toBe(true)
    wrapper.unmount()
  })
})
