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
    nodeId: node.nodeId,
    title: node.navigation?.title ?? node.capability.name,
    ...(node.navigation?.target !== undefined ? { path: node.navigation?.target } : {}),
  }])
  state.addRootNode = vi.fn<DevState['addRootNode']>()
  state.addChildNode = vi.fn<DevState['addChildNode']>()
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
    const node: ProjectBlueprintTreeNodeData = {nodeId:'orders',parentNodeId:'homepage_root',projectId:'homepage',kind:'page',capability:{name:'Orders'},navigation:{title:'Orders',target:'cfg:orders',order:0,publishInMenu:true,showChildren:true,beginGroup:false},source:{}}
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

    expect(state.moveNodeInTree).toHaveBeenCalledWith(expect.objectContaining({nodeId:node.nodeId,kind:node.kind}))
  })
})
