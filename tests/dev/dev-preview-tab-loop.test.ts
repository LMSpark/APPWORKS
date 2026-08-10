import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DevPreviewTab from '@/views/app/dev-system/DevPreviewTab.vue'
import type { DevState } from '@/views/app/dev-system/useDevState'
import type { PageNodeFileName } from '@spark-appworks/spark-project-model'

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
    pageNode: Object,
    pageNodeRevision: Number,
  },
  setup(props) {
    return () => h('div', { class: 'renderer-stub', 'data-page-id': props.pageNode?.['pageId'] })
  },
})

function createPreviewState() {
  const activePageId = ref('cascade-demo')
  const projectRevision = ref(1)
  const files: Record<PageNodeFileName, string> = {
    'rule.json': '[]',
    'pagedata.json': '{"dataSetName":"Demo","tables":{}}',
    'script.js': '',
    'style.css': '',
  }
  const getActivePage = vi.fn(() => ({ pageId: activePageId.value, isLoaded: true }))
  const getActivePageRenderNode = vi.fn(() => ({
    pageId: activePageId.value,
    isLoaded: true,
    load: () => Promise.resolve(),
    toRenderConfig: () => ({
      pageId: activePageId.value,
      blueprintNode: null,
      dataSpaceBinding: null,
      rule: [],
      data: {} as never,
      script: undefined,
      css: undefined,
    }),
  }))
  const readPageFileText = vi.fn((name: PageNodeFileName) => {
    void projectRevision.value
    return files[name]
  })
  const editor = {
    getActivePageRenderNode,
  }
  const project = {
    getActivePage,
    readPageFileText,
  }
  const state: DevState = Object.assign(Object.create(null), {
    activePageId,
    projectRevision,
    editor,
    project,
  })

  return {
    state,
    files,
    projectRevision,
    getActivePage,
    getActivePageRenderNode,
  }
}

describe('DevPreviewTab live refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not rebuild preview when editor revision changes but in-memory page files are unchanged', async () => {
    const { state, files, projectRevision, getActivePage } = createPreviewState()

    mount(DevPreviewTab, {
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

    expect(getActivePage).toHaveBeenCalledTimes(1)

    projectRevision.value += 1
    await nextTick()
    vi.advanceTimersByTime(600)
    await nextTick()

    expect(getActivePage).toHaveBeenCalledTimes(1)

    files['script.js'] = 'console.log("changed")'
    projectRevision.value += 1
    await nextTick()
    vi.advanceTimersByTime(600)
    await nextTick()

    expect(getActivePage).toHaveBeenCalledTimes(2)
  })
})
