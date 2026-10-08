import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DevPreviewTab from '@/views/app/dev-system/DevPreviewTab.vue'
import { createDevStateWithConfigPages, isolateAppProjectWorkspaceForTest } from './dev-state-test-fixture'

const SwitchStub = defineComponent({
  name: 'ElSwitch',
  props: {
    modelValue: Boolean,
  },
  emits: ['update:modelValue'],
  setup() {
    return () => h('span', { class: 'el-switch-stub' })
  },
})

const ButtonStub = defineComponent({
  name: 'ElButton',
  emits: ['click'],
  setup(_, { emit, slots }) {
    return () => h('button', { type: 'button', onClick: () => emit('click') }, slots['default']?.())
  },
})

const RendererStub = defineComponent({
  name: 'SparkPageRenderer',
  props: {
    pageRuntime: Object,
    routeSnapshot: Object,
  },
  setup(props) {
    return () => h('div', { class: 'renderer-stub', 'data-page-id': props.pageRuntime?.['pageId'] })
  },
})

function createPreviewState() {
  isolateAppProjectWorkspaceForTest()
  const state = createDevStateWithConfigPages([{pageId:'cascade-demo',nodeId:'cascade-node',title:'Cascade'}], 'cascade-demo')
  state.project.getActivePage()?.markLoaded()
  const getActivePage = vi.spyOn(state.project,'getActivePage')
  return {state,projectRevision:state.projectRevision,getActivePage}
}

describe('DevPreviewTab live refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not rebuild preview when editor revision changes but in-memory page files are unchanged', async () => {
    const { state, projectRevision } = createPreviewState()

    const wrapper = mount(DevPreviewTab, {
      props: {
        state,
        refreshToken: 0,
      },
      global: {
        stubs: {
          ElAlert: true,
          ElButton: ButtonStub,
          ElEmpty: true,
          ElIcon: true,
          ElSwitch: SwitchStub,
          Loading: true,
          NavIcon: true,
          SparkPageRenderer: RendererStub,
        },
      },
    })

    await flushPromises()
    const instance = wrapper.findComponent(RendererStub).props('pageRuntime')

    projectRevision.value += 1
    await nextTick()
    vi.advanceTimersByTime(600)
    await nextTick()

    await flushPromises()
    expect(wrapper.findComponent(RendererStub).props('pageRuntime')).toBe(instance)

    state.project.writePageFile({fileName:'script.js',text:'console.log("changed")'})
    projectRevision.value += 1
    await nextTick()
    vi.advanceTimersByTime(600)
    await nextTick()

    await flushPromises()
    const replacement = wrapper.findComponent(RendererStub).props('pageRuntime')
    expect(replacement).not.toBe(instance)
    expect(instance?.['destroyed']).toBe(true)
    wrapper.unmount()
    expect(replacement?.['destroyed']).toBe(true)
  })
})
