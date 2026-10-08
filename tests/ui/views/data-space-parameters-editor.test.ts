import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import DataSpaceParametersEditor from '../../../src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.vue'
import type { DataSpaceParameterItem } from '../../../src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.props'

describe('DataSpaceParametersEditor', () => {
  it('edits aliased parameter names without changing identity or dropping unknown properties', async () => {
    const input = [{ name: '原参数名', Description: '旧描述', RowID: 'PARAM-1', extra: { retained: true } }]
    const wrapper = mount(DataSpaceParametersEditor, { props: { modelValue: input } })

    expect(wrapper.get('input[aria-label="名称 1"]').element).toHaveProperty('value', '原参数名')
    await wrapper.get('input[aria-label="名称 1"]').setValue(' 新参数名 ')

    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual([
      { name: '原参数名', Description: '旧描述', RowID: 'PARAM-1', extra: { retained: true }, Name: ' 新参数名 ' },
    ])
  })

  it('keeps a historical item without an ID readable when secure ID generation is unavailable', () => {
    vi.stubGlobal('crypto', undefined)
    try {
      const wrapper = mount(DataSpaceParametersEditor, { props: { modelValue: [{ Name: '历史参数名' }] } })
      expect(wrapper.get('input[aria-label="名称 1"]').element).toHaveProperty('value', '历史参数名')
      expect(wrapper.get('input[aria-label="名称 1"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[role="alert"]').text()).toContain('无 ID 参数保持只读')
      wrapper.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('assigns one stable rowid on first edit of a legacy item and leaves other rows unchanged', async () => {
    const input = [{ name: '旧名', extra: '保留' }, { Id: 'EXISTING-2', Name: '已有身份' }]
    const wrapper = mount(DataSpaceParametersEditor, { props: { modelValue: input } })

    await wrapper.get('input[aria-label="名称 1"]').setValue(' 新名 ')
    const firstPayload = wrapper.emitted('change')?.[0]?.[0]
    expect(firstPayload).toMatchObject([
      { name: '旧名', extra: '保留', Name: ' 新名 ', rowid: expect.stringMatching(/^[A-F0-9]{32}$/) },
      { Id: 'EXISTING-2', Name: '已有身份' },
    ])
    const generatedId = firstRowId(firstPayload)

    await wrapper.get('input[aria-label="名称 1"]').setValue('再次修改')

    expect(firstRowId(wrapper.emitted('change')?.[1]?.[0])).toBe(generatedId)
    expect(wrapper.emitted('change')?.[1]?.[0]).toMatchObject([
      { name: '旧名', extra: '保留', Name: '再次修改', rowid: generatedId },
      { Id: 'EXISTING-2', Name: '已有身份' },
    ])
  })

  it('does not generate IDs or changes when the editor opens without interaction', () => {
    const wrapper = mount(DataSpaceParametersEditor, { props: { modelValue: [{ Name: '旧参数' }] } })

    expect(wrapper.get('input[aria-label="名称 1"]').element).toHaveProperty('value', '旧参数')
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('toggles the business parameter from the native checkbox control', async () => {
    const Host = defineComponent({
      setup() {
        const items = ref<DataSpaceParameterItem[]>([{ rowid: 'PARAM-1', Name: '客户号', IsBusParam: false }])
        return () => h(DataSpaceParametersEditor, { modelValue: items.value,
          onChange: (nextItems: DataSpaceParameterItem[]) => { items.value = nextItems } })
      },
    })
    const wrapper = mount(Host)
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await nextTick()

    expect(wrapper.get('input[type="checkbox"]').element).toHaveProperty('checked', true)
    expect(wrapper.findComponent(DataSpaceParametersEditor).emitted('change')?.[0]?.[0])
      .toMatchObject([{ IsBusParam: true }])
    wrapper.unmount()
  })

  it('keeps the same focused input after the first edit assigns a legacy row ID', async () => {
    const Host = defineComponent({
      setup() {
        const items = ref<DataSpaceParameterItem[]>([{ Name: '' }])
        return () => h(DataSpaceParametersEditor, { modelValue: items.value,
          onChange: (nextItems: DataSpaceParameterItem[]) => { items.value = nextItems } })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    const input = document.body.querySelector<HTMLInputElement>('input[aria-label="名称 1"]')
    if (!input) throw new Error('parameter input is missing')
    input.focus()
    input.value = 'x'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(document.activeElement).toBe(input)
    expect(wrapper.get('input[aria-label="名称 1"]').element).toBe(input)
    wrapper.unmount()
  })

  it('keeps list keys unique when deleting a preceding row after a legacy edit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const Host = defineComponent({
      setup() {
        const items = ref<DataSpaceParameterItem[]>([
          { rowid: 'EXISTING-X', Name: '先删除' }, { Name: '旧参数A' }, { Name: '旧参数B' },
        ])
        return () => h(DataSpaceParametersEditor, { modelValue: items.value,
          onChange: (nextItems: DataSpaceParameterItem[]) => { items.value = nextItems } })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    await wrapper.get('input[aria-label="名称 2"]').setValue('编辑后的A')
    await wrapper.get('button[aria-label="删除参数 1"]').trigger('click')

    expect(warn.mock.calls.flat().join(' ')).not.toContain('Duplicate keys')
    const names = Array.from(document.body.querySelectorAll<HTMLInputElement>('input[aria-label^="名称 "]'), input => input.value)
    expect(names).toEqual(['编辑后的A', '旧参数B'])
    wrapper.unmount()
    warn.mockRestore()
  })
})

function firstRowId(value: unknown): string {
  if (!Array.isArray(value)) throw new Error('parameter editor did not emit an array')
  const first = value[0]
  if (!first || typeof first !== 'object' || !('rowid' in first) || typeof first.rowid !== 'string') {
    throw new Error('parameter editor did not emit a stable rowid')
  }
  return first.rowid
}
