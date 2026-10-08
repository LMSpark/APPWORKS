import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import DataSpaceDesignGraph from '../../../../src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue'
import type { DataSpaceDesignGraphProps } from '../../../../src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.props'

const firstGraph: DataSpaceDesignGraphProps = {
  nodes: [
    { id: 'MODEL-1', x: -10, y: 20, title: '模型甲', description: '甲描述' },
    { id: 'MODEL-2', x: 300, y: 180, title: '模型乙', description: '乙描述' },
  ],
  edges: [{ id: 'REL-1', source: 'MODEL-1', target: 'MODEL-2', pointsList: [
    { x: 10, y: 20 }, { x: 35, y: 55 }, { x: 70, y: 90 },
  ] }],
}

const secondGraph: DataSpaceDesignGraphProps = {
  nodes: [{ id: 'MODEL-1', x: 900, y: 700, title: '隔离模型', description: '隔离描述' }],
  edges: [],
}

describe('data-space design graph component', () => {
  it('renders immutable positioned paths with read-only controls and isolates simultaneous stores', async () => {
    const inputSnapshot = JSON.stringify([firstGraph, secondGraph])
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {}
      public unobserve(): void {}
      public disconnect(): void {}
    })
    let setFirstMounted: ((value: boolean) => void) | undefined
    const Host = defineComponent({
      setup() {
        const firstMounted = ref(true)
        setFirstMounted = value => { firstMounted.value = value }
        return () => h('main', [
          firstMounted.value ? h(DataSpaceDesignGraph, { ...firstGraph, key: 'first' }) : null,
          h(DataSpaceDesignGraph, { ...secondGraph, key: 'second' }),
        ])
      },
    })

    const wrapper = mount(Host)
    await flushPromises()
    await nextTick()

    const flows = wrapper.findAllComponents(VueFlow)
    expect(flows).toHaveLength(2)
    const firstId = flows[0]?.props('id')
    const secondId = flows[1]?.props('id')
    expect(typeof firstId).toBe('string')
    expect(typeof secondId).toBe('string')
    expect(firstId).not.toBe(secondId)

    for (const flow of flows) {
      expect(flow.props('nodesDraggable')).toBe(false)
      expect(flow.props('nodesConnectable')).toBe(false)
      expect(flow.props('edgesUpdatable')).toBe(false)
      expect(flow.props('elementsSelectable')).toBe(false)
      expect(flow.props('nodesFocusable')).toBe(false)
      expect(flow.props('edgesFocusable')).toBe(false)
      expect(flow.props('selectNodesOnDrag')).toBe(false)
      expect(flow.props('connectOnClick')).toBe(false)
      expect(flow.props('deleteKeyCode')).toBeNull()
      expect(flow.props('selectionKeyCode')).toBeNull()
      expect(flow.props('multiSelectionKeyCode')).toBeNull()
    }

    const firstStore = useVueFlow(String(firstId))
    const secondStore = useVueFlow(String(secondId))
    expect(firstStore).not.toBe(secondStore)

    expect(firstStore.nodes.value.map(node => node.position)).toEqual([{ x: -126, y: -40 }, { x: 184, y: 120 }])
    expect(secondStore.nodes.value.map(node => node.position)).toEqual([{ x: 784, y: 640 }])
    expect(wrapper.text()).toContain('模型甲')
    expect(wrapper.text()).toContain('隔离模型')

    const firstEdge = firstStore.edges.value[0]
    expect(firstEdge?.id).toBe('REL-1')
    expect(firstEdge?.data?.pointsList).toEqual([{ x: 10, y: 20 }, { x: 35, y: 55 }, { x: 70, y: 90 }])
    expect(wrapper.find('.vue-flow__edge-path').attributes('d')).toContain('M10,20 L35,55 L70,90')

    firstStore.updateNodeData('MODEL-1', { title: '仅第一个实例变化' })
    await nextTick()
    expect(firstStore.nodes.value.find(node => node.id === 'MODEL-1')?.data['title']).toBe('仅第一个实例变化')
    expect(secondStore.nodes.value.find(node => node.id === 'MODEL-1')?.data['title']).toBe('隔离模型')
    expect(firstGraph.nodes[0]?.title).toBe('模型甲')
    expect(secondGraph.nodes[0]?.title).toBe('隔离模型')
    expect(JSON.stringify([firstGraph, secondGraph])).toBe(inputSnapshot)

    setFirstMounted?.(false)
    await nextTick()
    await flushPromises()
    expect(wrapper.findAllComponents(VueFlow)).toHaveLength(1)
    expect(secondStore.nodes.value.find(node => node.id === 'MODEL-1')?.data['title']).toBe('隔离模型')

    setFirstMounted?.(true)
    await nextTick()
    await flushPromises()
    const remountedFlows = wrapper.findAllComponents(VueFlow)
    expect(remountedFlows).toHaveLength(2)
    expect(remountedFlows[0]?.props('id')).not.toBe(firstId)
    expect(useVueFlow(String(remountedFlows[0]?.props('id')))).not.toBe(secondStore)
    wrapper.unmount()
    vi.unstubAllGlobals()
  })
})
