import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DevFileEditor from '@/views/app/dev-system/DevFileEditor.vue'

const fixture = vi.hoisted(() => ({ save: vi.fn(), confirm: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: fixture.confirm } }))
vi.mock('@/services/project-model-artifacts', () => ({ createRuleJsonSchema: () => ({}), createRuleTreePolicy: () => ({}) }))
vi.mock('@/views/app/dev-system/composables/useDevFileEditor', () => ({
  useDevFileEditor: (state: { dirty: ReturnType<typeof ref<boolean>> }) => ({
    isDirty: state.dirty, isReady: ref(true), text: ref(''),
    isFileDirty: () => state.dirty.value, save: fixture.save, refresh: vi.fn(),
  }),
}))
vi.mock('@spark-appworks/spark-component', () => ({ SparkCodeEditor: {}, JsonTreeEditor: {} }))

const Button = defineComponent({
  props: { disabled: Boolean }, emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
})
const Slot = defineComponent({ template: '<div><slot /></div>' })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function setup() {
  const state = {
    activePageId: ref('page-A'), dirty: ref(false), pageDataError: ref(null), pageIoBusy: ref(false),
    pageFileNames: ['rule.json', 'script.js', 'style.css'], addStatus: vi.fn(),
    project: { getActivePage: () => ({ pageId: state.activePageId.value }), setActivePage: vi.fn() },
    editor: {
      listRemotePageVersions: vi.fn().mockResolvedValue([{ version: 2, fileName: '2__script.js', lastModified: null }]),
      createRemotePageVersion: vi.fn().mockResolvedValue(undefined),
      restoreRemotePageVersion: vi.fn().mockResolvedValue(undefined),
      deleteRemotePageVersion: vi.fn().mockResolvedValue(undefined),
    },
  }
  const wrapper = mount({ ...DevFileEditor, props: ['state', 'activeFile', 'showTabs'] }, {
    props: { state, activeFile: 'script.js', showTabs: false },
    global: { directives: { loading: () => {} }, stubs: {
      ElButton: Button, ElTooltip: Slot, ElButtonGroup: Slot, ElInput: true, ElEmpty: true,
      ElTag: true, NavIcon: true, SparkCodeEditor: true, JsonTreeEditor: true, DevDataSetDesigner: true,
    } },
  })
  const click = async (label: string) => {
    const button = wrapper.findAll('button').find(item => item.text().includes(label))
    if (!button) throw new Error(`按钮缺失：${label}`)
    await button.trigger('click')
  }
  return { state, wrapper, click }
}

describe('DevFileEditor snapshot identity', () => {
  beforeEach(() => { fixture.save.mockReset().mockResolvedValue(undefined); fixture.confirm.mockReset().mockResolvedValue(undefined) })

  it('does not invent a current version or a missing modification time', async () => {
    const { wrapper, click } = setup()
    await click('版本'); await flushPromises()
    expect(wrapper.text()).toContain('v2')
    expect(wrapper.text()).not.toContain('当前')
    expect(wrapper.find('.vs-time').text()).toBe('-')
    wrapper.unmount()
  })

  it('discards a late list after closing and reopening the panel', async () => {
    const { state, wrapper, click } = setup()
    const late = deferred<{ version: number; fileName: string; lastModified: null }[]>()
    state.editor.listRemotePageVersions.mockReturnValueOnce(late.promise)
    await click('版本'); await click('版本'); await click('版本'); await flushPromises()
    late.resolve([{ version: 99, fileName: '99__script.js', lastModified: null }]); await flushPromises()
    expect(wrapper.text()).toContain('v2')
    expect(wrapper.text()).not.toContain('v99')
    wrapper.unmount()
  })

  it('does not create a snapshot for a different file after working save', async () => {
    const { state, wrapper, click } = setup()
    const saved = deferred<void>(); fixture.save.mockReturnValueOnce(saved.promise)
    await click('版本'); await flushPromises(); await click('存档')
    await wrapper.setProps({ activeFile: 'style.css' })
    saved.resolve(); await flushPromises()
    expect(state.editor.createRemotePageVersion).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not create a snapshot when edits occur during working save', async () => {
    const { state, wrapper, click } = setup()
    const saved = deferred<void>(); fixture.save.mockReturnValueOnce(saved.promise)
    await click('版本'); await flushPromises(); await click('存档')
    state.dirty.value = true; saved.resolve(); await flushPromises()
    expect(state.editor.createRemotePageVersion).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not delete a different page after confirmation', async () => {
    const { state, wrapper, click } = setup()
    const confirmed = deferred<void>(); fixture.confirm.mockReturnValueOnce(confirmed.promise)
    await click('版本'); await flushPromises()
    const remove = wrapper.findAll('button').at(-1)
    await remove?.trigger('click')
    state.activePageId.value = 'page-B'; await flushPromises()
    confirmed.resolve(); await flushPromises()
    expect(state.editor.deleteRemotePageVersion).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
