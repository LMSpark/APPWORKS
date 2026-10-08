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
  it('emits a moved center and connected polyline while keeping the fixed end', async () => {
    vi.stubGlobal('ResizeObserver', class { public observe(): void {} public unobserve(): void {} public disconnect(): void {} })
    const input = JSON.stringify(firstGraph)
    const wrapper = mount(DataSpaceDesignGraph, {props: {...firstGraph, contextKey: 'SPACE:1', disabled: false}})
    await flushPromises()
    const flow = wrapper.findComponent(VueFlow)
    flow.vm.$emit('nodeDragStart', {node: {id: 'MODEL-1', position: {x: -126, y: -40}}})
    flow.vm.$emit('nodeDrag', {node: {id: 'MODEL-1', position: {x: -106, y: -30}}})
    await nextTick()
    expect(wrapper.find('.vue-flow__edge-path').attributes('d')).toContain('M30,30 L55,65 L70,90')
    flow.vm.$emit('nodeDragStop', {node: {id: 'MODEL-1', position: {x: -106, y: -30}}})
    expect(wrapper.emitted('move')?.[0]?.[0]).toMatchObject({contextKey: 'SPACE:1', id: 'MODEL-1', x: 10, y: 30,
      edges: [{id: 'REL-1', pointsList: [{x: 30, y: 30}, {x: 55, y: 65}, {x: 70, y: 90}]}]})
    expect(JSON.stringify(firstGraph)).toBe(input)
    wrapper.unmount()
    vi.unstubAllGlobals()
  })
  it('keeps a two-point fixed endpoint, moves self edges, and ignores disabled or stale drags', async () => {
    vi.stubGlobal('ResizeObserver', class { public observe(): void {} public unobserve(): void {} public disconnect(): void {} })
    const nodes = [{id: 'A', x: 0, y: 0, title: 'A', description: ''}, {id: 'B', x: 100, y: 0, title: 'B', description: ''}]
    const edges = [
      {id: 'IN', source: 'B', target: 'A', pointsList: [{x: 100, y: 0}, {x: 0, y: 0}]},
      {id: 'SELF', source: 'A', target: 'A', pointsList: [{x: 0, y: 0}, {x: 10, y: 20}, {x: 0, y: 0}]},
    ]
    const wrapper = mount(DataSpaceDesignGraph, {props: {nodes, edges, contextKey: 'K', disabled: false}})
    await flushPromises()
    const flow = wrapper.findComponent(VueFlow)
    flow.vm.$emit('nodeDragStart', {node: {id: 'A', position: {x: -116, y: -60}}})
    flow.vm.$emit('nodeDragStop', {node: {id: 'A', position: {x: -116, y: -40}}})
    expect(wrapper.emitted('move')?.[0]?.[0]).toMatchObject({x: 0, y: 20, edges: [
      {id: 'IN', pointsList: [{x: 100, y: 0}, {x: 0, y: 0}, {x: 0, y: 20}]},
      {id: 'SELF', pointsList: [{x: 0, y: 20}, {x: 10, y: 40}, {x: 0, y: 20}]},
    ]})
    flow.vm.$emit('nodeClick', {node: {id: 'A'}})
    flow.vm.$emit('edgeDoubleClick', {edge: {id: 'IN'}})
    expect(wrapper.emitted('select')?.map(event => event[0])).toMatchObject([
      {contextKey: 'K', type: 'node', id: 'A', open: false}, {contextKey: 'K', type: 'edge', id: 'IN', open: true},
    ])
    await wrapper.setProps({disabled: true})
    flow.vm.$emit('nodeClick', {node: {id: 'B'}})
    flow.vm.$emit('nodeDragStart', {node: {id: 'A', position: {x: -116, y: -60}}})
    flow.vm.$emit('nodeDragStop', {node: {id: 'A', position: {x: -100, y: -60}}})
    expect(wrapper.emitted('move')).toHaveLength(1)
    expect(wrapper.emitted('select')).toHaveLength(2)
    await wrapper.setProps({disabled: false})
    flow.vm.$emit('nodeDragStart', {node: {id: 'A', position: {x: -116, y: -60}}})
    flow.vm.$emit('nodeDrag', {node: {id: 'A', position: {x: -100, y: -60}}})
    await nextTick()
    expect(wrapper.find('.vue-flow__edge-path').attributes('d')).toContain('L16,0')
    await wrapper.setProps({contextKey: 'K2'})
    expect(wrapper.find('.vue-flow__edge-path').attributes('d')).not.toContain('L16,0')
    flow.vm.$emit('nodeDragStop', {node: {id: 'A', position: {x: -100, y: -60}}})
    expect(wrapper.emitted('move')).toHaveLength(1)
    await wrapper.setProps({draggableIds: ['B']})
    expect(flow.props('nodes')?.find((node: {id: string}) => node.id === 'A')?.draggable).toBe(false)
    flow.vm.$emit('nodeDragStart', {node: {id: 'A', position: {x: -116, y: -60}}})
    flow.vm.$emit('nodeDragStop', {node: {id: 'A', position: {x: -100, y: -60}}})
    expect(wrapper.emitted('move')).toHaveLength(1)
    wrapper.unmount()
    vi.unstubAllGlobals()
  })
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
