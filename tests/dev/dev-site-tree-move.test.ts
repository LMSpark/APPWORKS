import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ProjectBlueprintTree from '@/views/app/dev-system/ProjectBlueprintTree.vue'
import type { ProjectBlueprintTreeNodeData } from '@spark-appworks/spark-project-model'
import { useDevState, type DevState } from '@/views/app/dev-system/useDevState'
import { isolateAppProjectWorkspaceForTest, seedDevStateConfigPages } from './dev-state-test-fixture'

function createState(node: ProjectBlueprintTreeNodeData): DevState {
  isolateAppProjectWorkspaceForTest()
  const state = useDevState()
  seedDevStateConfigPages(state, [{
    pageId: 'orders',
    nodeId: node.id,
    title: node.title,
    ...(node.path !== undefined ? { path: node.path } : {}),
  }])
  state.hasReservedRootGroup = vi.fn<DevState['hasReservedRootGroup']>(() => false)
  state.restoreReservedRootGroup = vi.fn<DevState['restoreReservedRootGroup']>(async () => {})
  state.addRootNode = vi.fn<DevState['addRootNode']>()
  state.addChildNode = vi.fn<DevState['addChildNode']>()
  state.isSystemRootDirectory = vi.fn<DevState['isSystemRootDirectory']>(() => false)
  state.removeNodeFromTree = vi.fn<DevState['removeNodeFromTree']>()
  state.selectNode = vi.fn<DevState['selectNode']>(async () => {})
  state.moveNodeInTree = vi.fn<DevState['moveNodeInTree']>(async () => {})
  return state
}

const ElTreeDropStub = defineComponent({
  props: {
    data: {
      type: Array,
      default: () => [],
    },
  },
  emits: ['node-drop'],
  template: '<button class="emit-drop" @click="$emit(\'node-drop\', { data: data[0] })">drop</button>',
})

describe('ProjectBlueprintTree move persistence', () => {
  it('persists drag-drop through moveNodeInTree', async () => {
    const node: ProjectBlueprintTreeNodeData = { id: 'orders', title: 'Orders', nodeKind: 'page', path: '/orders' }
    const state = createState(node)

    const wrapper = mount(ProjectBlueprintTree, {
      props: { state },
      global: {
        stubs: {
          NavIcon: true,
          ElButton: true,
          ElDropdown: true,
          ElDropdownItem: true,
          ElDropdownMenu: true,
          ElEmpty: true,
          ElInput: true,
          ElTag: true,
          ElTree: ElTreeDropStub,
        },
      },
    })

    await wrapper.find('.emit-drop').trigger('click')

    expect(state.moveNodeInTree).toHaveBeenCalledWith(node)
  })
})
