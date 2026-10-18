import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, shallowReactive, watch} from 'vue'
import ElementPlus from 'element-plus'
import {VueFlow, useVueFlow} from '@vue-flow/core'
import {SparkData, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {GraphLayout, PAGE_RUNTIME, RendererGraph, registerAllRenderers, Spark, useSparkComponent, type RGraphProps} from '@spark-appworks/spark-component'
import type {BeforeRenderContext} from '../../../packages/spark-component/src/components/support/beforeRender'
import {DataSpaceQueryContext} from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {DataSpaceQueryTable} from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'

const cleanup: Array<() => void> = []
describe('standard graph layout', () => {
  it('aligns by existing horizontal then vertical order using the available viewport width', () => {
    const nodes = [{id: 'C', x: 600, y: 50}, {id: 'B', x: 50, y: 200}, {id: 'A', x: 50, y: 20}]
    expect(GraphLayout.grid(nodes, 700)).toEqual([
      {id: 'A', x: 170, y: 110}, {id: 'B', x: 446, y: 110}, {id: 'C', x: 170, y: 258},
    ])
    expect(GraphLayout.grid(nodes, 320).map(node => node.x)).toEqual([170, 170, 170])
    expect(() => GraphLayout.grid(nodes, 0)).toThrow()
    expect(() => GraphLayout.grid([...nodes, nodes[0]!], 700)).toThrow()
    expect(() => GraphLayout.grid([{id: 'A', x: NaN, y: 0}], 700)).toThrow()
  })
  it('uses directed longest levels, stable order, and finite cycle fallback', () => {
    expect(GraphLayout.positions(['A', 'B', 'C'], [{source: 'A', target: 'B'}, {source: 'B', target: 'C'}, {source: 'A', target: 'C'}]))
      .toEqual([{id: 'A', x: 250, y: 150}, {id: 'B', x: 584, y: 150}, {id: 'C', x: 918, y: 150}])
    expect(GraphLayout.positions(['A', 'B'], [{source: 'A', target: 'B'}, {source: 'B', target: 'A'}]))
      .toEqual([{id: 'A', x: 250, y: 150}, {id: 'B', x: 250, y: 356}])
    expect(GraphLayout.positions([], [])).toEqual([])
    expect(() => GraphLayout.positions(['A', 'A'], [])).toThrow()
    expect(() => GraphLayout.positions(['A'], [{source: 'A', target: 'B'}])).toThrow()
  })
})
afterEach(() => {cleanup.splice(0).reverse().forEach(dispose => dispose()); vi.unstubAllGlobals()})

async function loadNodes(view: DataView, protect: boolean, hideIdentity = false): Promise<void> {
  const table = new DataSpaceQueryTable({scenarioId: 'G', metaName: 'Nodes'})
  const context = new DataSpaceQueryContext({identity: table.identity, scope: 'graph', readScope: () => 'graph',
    snapshot: table.applyResult({Result: {primaryKeyField: 'id', data: {Items: (protect ? view.rows.slice(0, 1) : view.rows).map(row => ({...row,
      ...(protect ? {name: 'secret', note: 'masked secret'} : {}),
      lingma_sys_params: {r: [], e: [], h: [...protect ? ['name'] : [], ...hideIdentity ? ['id'] : []], m: protect ? ['note'] : [], d: false}})), Count: protect ? 1 : view.rows.length}}}),
  })
  view.bindQueryExecutor({executeQuery: async () => context}); await view.loadFromServer()
}

async function fixture(props: Partial<RGraphProps> = {}, protect = false, hideIdentity = false) {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const ds = SparkData.createDataSet({dataSetName: 'graph', scenarioId: 'G', tables: {
    Nodes: {tableName: 'Nodes', modelBinding: {modelId: 'N', modelName: 'Nodes'}, columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'}, {name: 'note', type: 'string'}],
      views: {default: {rows: [{id: 'A', name: 'Alpha', note: 'first'}, {id: 'B', name: 'Beta', note: 'second'}]}, other: {rows: [{id: 'C', name: 'Gamma'}]}}},
    Edges: {tableName: 'Edges', resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'from', type: 'string'}, {name: 'to', type: 'string'}],
      views: {default: {rows: [{id: 'AB', from: 'AliasA', to: 'AliasB'}]}}},
    ProtectedEdges: {tableName: 'ProtectedEdges', modelBinding: {modelId: 'PE', modelName: 'ProtectedEdges'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'from', type: 'string'}, {name: 'to', type: 'string'}], views: {default: {}}},
  }})
  const runtime = new PageRuntime({pageId: 'graph', scenarioIds: ['G'], loadScenario: async () => ds})
  await runtime.load()
  await loadNodes(ds.getView('Nodes', 'default')!, protect, hideIdentity); await loadNodes(ds.getView('Nodes', 'other')!, protect, hideIdentity)
  cleanup.push(() => runtime.dispose())
  const input = shallowReactive<RGraphProps>({dataViewKey: 'G@Nodes@default', edgeDataViewKey: 'G@Edges@default', labelField: 'name', descriptionField: 'note',
    edgeSourceField: 'from', edgeTargetField: 'to', edgeNodeKeys: {AliasA: 'A', AliasB: 'B'}, ...props})
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'graph-test'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(RendererGraph, input)
  }})
  registerAllRenderers()
  const stubs = {...config.global.stubs}
  delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']
  const original = config.global.stubs; config.global.stubs = stubs
  cleanup.push(() => {config.global.stubs = original})
  const wrapper = mount(Host, {global: {plugins: [Spark.createPlugin(), ElementPlus]}})
  cleanup.push(() => wrapper.unmount())
  await flushPromises()
  return {wrapper, input, ds, nodes: ds.getView('Nodes', 'default')!}
}

describe('standard graph DataView binding', () => {
  it('offers controlled alignment through original keys without changing node or edge data', async () => {
    const onArrange = vi.fn()
    const {wrapper, input, nodes, ds} = await fixture({draggableKeys: ['A', 'B'], onArrange,
      nodePositions: {A: {x: 900, y: 50}, B: {x: 100, y: 100}}, edgePaths: {AB: [{x: 1000, y: 50}, {x: 0, y: 100}]}})
    const canvas = wrapper.get('.graph-canvas').element
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({width: 700, height: 500} as DOMRect)
    const api = wrapper.getComponent(RendererGraph).vm
    const originalRows = [...nodes.rows], edges = [...ds.getView('Edges')!.rows]
    expect(await api.arrange()).toBe(true)
    expect(onArrange).toHaveBeenCalledOnce()
    const event = onArrange.mock.calls[0]![0]
    expect(event.nodes).toEqual([{id: 'B', x: 170, y: 110}, {id: 'A', x: 446, y: 110}])
    expect(event.edges).toEqual([{id: 'AB', pointsList: [{x: 562, y: 110}, {x: 308, y: 110}, {x: 308, y: 110}, {x: 54, y: 110}]}])
    expect(nodes.rows).toEqual(originalRows); expect(ds.getView('Edges')!.rows).toEqual(edges)
    expect(nodes.hasEditingChanges()).toBe(false)
    expect(wrapper.getComponent(VueFlow).props('nodes')![0]!.position.x).toBe(784)
    input.onArrange = event => {event.control.cancel = true}; await flushPromises()
    expect(await api.arrange()).toBe(false)
    input.onArrange = onArrange; input.draggableKeys = ['A']; await flushPromises()
    expect(await api.arrange()).toBe(false)
    input.draggableKeys = ['A', 'B']; input.disabled = true; await flushPromises()
    expect(await api.arrange()).toBe(false)
    expect(onArrange).toHaveBeenCalledOnce()
  })

  it('reapplies the current node or edge highlight without changing DataView values or emitting selection', async () => {
    const onSelect = vi.fn()
    const {wrapper, nodes, ds, input} = await fixture({onSelect})
    const flow = wrapper.getComponent(VueFlow), store = useVueFlow(flow.props('id'))
    const api = wrapper.getComponent(RendererGraph).vm
    nodes.setCurrentRowById('B'); await flushPromises()
    const pointer = nodes.currentRow, selected = [...nodes.selectedRows], value = nodes.value
    store.setNodes(store.nodes.value.map(node => ({...node, selected: false})))
    expect(store.nodes.value.some(node => node.selected)).toBe(false)
    expect(await api.selectCurrent()).toBe(true)
    expect(store.nodes.value.filter(node => node.selected).map(node => node.data.title)).toEqual(['Beta'])
    expect(nodes.currentRow).toBe(pointer); expect(nodes.selectedRows).toEqual(selected); expect(nodes.value).toEqual(value)
    const edge = flow.props('edges')![0]!
    flow.vm.$emit('edgeClick', {edge: {id: edge.id}}); await flushPromises()
    const edgePointer = ds.getView('Edges')!.currentRow
    onSelect.mockClear()
    store.setEdges(store.edges.value.map(item => ({...item, selected: false})))
    expect(await api.selectCurrent()).toBe(true)
    expect(store.edges.value.filter(item => item.selected).map(item => item.id)).toEqual([edge.id])
    expect(ds.getView('Edges')!.currentRow).toBe(edgePointer)
    input.current = null; await flushPromises()
    store.setNodes(store.nodes.value.map(node => ({...node, selected: true})))
    expect(await api.selectCurrent()).toBe(true)
    expect(store.nodes.value.some(node => node.selected)).toBe(false)
    expect(store.edges.value.some(item => item.selected)).toBe(false)
    expect(onSelect).not.toHaveBeenCalled()
    expect(nodes.hasEditingChanges()).toBe(false); expect(ds.getView('Edges')!.hasEditingChanges()).toBe(false)
  })

  it('rejects a pending reselect after rebinding and refuses invalid, disabled or destroyed graph targets', async () => {
    const {wrapper, input, nodes, ds} = await fixture()
    const api = wrapper.getComponent(RendererGraph).vm, pointer = nodes.currentRow
    const pending = api.selectCurrent()
    input.dataViewKey = 'G@Nodes@other'
    expect(await pending).toBe(false)
    await flushPromises()
    expect(await api.selectCurrent()).toBe(true)
    expect(nodes.currentRow).toBe(pointer)
    const changingCurrent = api.selectCurrent()
    input.current = null
    expect(await changingCurrent).toBe(false)
    input.current = {kind: 'node', id: 'missing'}; await flushPromises()
    expect(await api.selectCurrent()).toBe(false)
    input.current = null; input.disabled = true; await flushPromises()
    expect(await api.selectCurrent()).toBe(false)
    input.disabled = false; await flushPromises()
    ds.getView('Nodes', 'other')!.destroy()
    expect(await api.selectCurrent()).toBe(false)
    wrapper.unmount()
    expect(await api.selectCurrent()).toBe(false)
  })

  it('keeps center pan-only, fits separately, and refuses retained APIs after unmount', async () => {
    const {wrapper} = await fixture({nodePositions: {A: {x: 100, y: 50}, B: {x: 600, y: 350}}})
    const store = useVueFlow(wrapper.getComponent(VueFlow).props('id'))
    const center = vi.spyOn(store, 'setCenter').mockResolvedValue(true)
    const fit = vi.spyOn(store, 'fitBounds').mockResolvedValue(true)
    vi.spyOn(store, 'getViewport').mockReturnValue({x: -100, y: 80, zoom: 0.7})
    const api = wrapper.getComponent(RendererGraph).vm
    expect(await api.center()).toBe(true)
    expect(center).toHaveBeenCalledWith(350, 200, {zoom: 0.7})
    expect(fit).not.toHaveBeenCalled()
    expect(await api.fitView()).toBe(true)
    expect(fit).toHaveBeenCalledOnce()
    wrapper.unmount()
    expect(await api.center()).toBe(false); expect(await api.fitView()).toBe(false)
    expect(center).toHaveBeenCalledOnce(); expect(fit).toHaveBeenCalledOnce()
  })

  it('aligns only visible nodes and refuses broken projections or a disposed binding', async () => {
    const onArrange = vi.fn()
    const {wrapper, input, ds} = await fixture({onArrange, draggableKeys: ['A'], hiddenNodeKeys: ['B']})
    vi.spyOn(wrapper.get('.graph-canvas').element, 'getBoundingClientRect').mockReturnValue({width: 700, height: 500} as DOMRect)
    const api = wrapper.getComponent(RendererGraph).vm
    expect(await api.arrange()).toBe(true)
    expect(onArrange.mock.calls[0]![0].nodes).toEqual([{id: 'A', x: 170, y: 110}])
    input.edgeNodeKeys = {AliasA: 'A', AliasB: 'MISSING'}; await flushPromises()
    expect(await api.arrange()).toBe(false)
    input.edgeNodeKeys = {AliasA: 'A', AliasB: 'B'}; await flushPromises()
    ds.getView('Nodes')!.destroy(); await flushPromises()
    expect(await api.arrange()).toBe(false)
    expect(onArrange).toHaveBeenCalledOnce()
  })

  it('fits accepted positions even before rebuilt flow nodes are measured', async () => {
    const {wrapper, input} = await fixture({draggableKeys: ['A', 'B']})
    vi.spyOn(wrapper.get('.graph-canvas').element, 'getBoundingClientRect').mockReturnValue({width: 700, height: 500} as DOMRect)
    const store = useVueFlow(wrapper.getComponent(VueFlow).props('id'))
    const fit = vi.spyOn(store, 'fitBounds').mockResolvedValue(true)
    input.onArrange = event => {input.nodePositions = Object.fromEntries(event.nodes.map(node => [node.id, {x: node.x, y: node.y}]))}
    await flushPromises()
    expect(await wrapper.getComponent(RendererGraph).vm.arrange()).toBe(true)
    expect(fit).toHaveBeenCalledWith({x: 54, y: 50, width: 508, height: 120}, {padding: 0.1})
  })

  it('hides explicit layout nodes and incident edges without changing either DataView, and expires old events', async () => {
    const onSelect = vi.fn(), onNodeMove = vi.fn(), onConnect = vi.fn()
    const {wrapper, input, ds, nodes} = await fixture({onSelect, onNodeMove, onConnect, draggableKeys: ['A'], connectableKeys: ['A', 'B']})
    const flow = wrapper.getComponent(VueFlow), alpha = flow.props('nodes')![0]!, beta = flow.props('nodes')![1]!
    const originalRows = [...nodes.rows], originalCurrent = nodes.currentRow
    flow.vm.$emit('nodeDragStart', {node: alpha})
    input.hiddenNodeKeys = ['A']; await flushPromises()
    expect(flow.props('nodes')!.map(node => node.data.title)).toEqual(['Beta'])
    expect(flow.props('edges')).toHaveLength(0)
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
    flow.vm.$emit('nodeDoubleClick', {node: alpha})
    flow.vm.$emit('nodeDragStop', {node: {...alpha, position: {x: 80, y: 90}}})
    flow.vm.$emit('connect', {source: alpha.id, target: beta.id})
    expect(onSelect).not.toHaveBeenCalled(); expect(onNodeMove).not.toHaveBeenCalled(); expect(onConnect).not.toHaveBeenCalled()
    expect(nodes.rows).toEqual(originalRows); expect(nodes.currentRow).toBe(originalCurrent)
    expect(ds.getView('Edges')!.rows).toHaveLength(1)
    delete input.hiddenNodeKeys; await flushPromises()
    expect(flow.props('nodes')).toHaveLength(2); expect(flow.props('edges')).toHaveLength(1)
    flow.vm.$emit('nodeDoubleClick', {node: alpha})
    expect(onSelect).not.toHaveBeenCalled()
    input.hiddenNodeKeys = ['A', 'B']; await flushPromises()
    expect(flow.props('nodes')).toHaveLength(0); expect(flow.props('edges')).toHaveLength(0)
    input.hiddenNodeKeys = []; await flushPromises()
    expect(flow.props('nodes')).toHaveLength(2)
    expect(useVueFlow(flow.props('id')).edges.value).toHaveLength(1)
  })

  it('does not use hidden keys to conceal unreadable identities or genuinely unbound edge endpoints', async () => {
    const protectedGraph = await fixture({hiddenNodeKeys: ['A']}, true, true)
    expect(protectedGraph.wrapper.text()).toContain('身份不可读')
    const {wrapper, input} = await fixture({hiddenNodeKeys: ['MISSING'], edgeNodeKeys: {AliasA: 'A', AliasB: 'MISSING'}})
    expect(wrapper.getComponent(VueFlow).props('nodes')).toHaveLength(2)
    expect(wrapper.text()).toContain('端点未唯一绑定')
    input.hiddenNodeKeys = ['A']; await flushPromises()
    // A hidden real endpoint does not mask a broken endpoint on the other side.
    expect(wrapper.text()).toContain('端点未唯一绑定')
  })

  it('keeps the actual VueFlow edge store synchronized when the binding revision replaces node identities', async () => {
    const {wrapper, input} = await fixture()
    const flow = wrapper.getComponent(VueFlow)
    const store = useVueFlow(flow.props('id'))
    expect(store.edges.value).toHaveLength(1)
    // A canvas measurement/interaction updates its store before the parent
    // projects a new binding revision in the same rendering cycle.
    watch(store.nodes, () => {input.nodePositions = {A: {x: 100, y: 100}}}, {flush: 'post', once: true})
    store.setNodes([...store.nodes.value])
    await flushPromises()
    expect(store.edges.value).toHaveLength(1)
    expect(store.edges.value[0]?.source).toBe(flow.props('nodes')![0]!.id)
  })

  it('binds supplemental edges to their own view, rejects collisions and expires old selection events', async () => {
    const onSelect = vi.fn()
    const {wrapper, input, ds} = await fixture({onSelect})
    const table = ds.addTable('DraftEdges', [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'from', type: 'string'}, {name: 'to', type: 'string'}])
    table.resourceType = 'static-data'
    const view = table.getOrCreateView('default')
    view.replaceRows([{id: 'BA', from: 'AliasB', to: 'AliasA'}])
    input.additionalEdgeDataViewKey = 'G@DraftEdges@default'; await flushPromises()
    const flow = wrapper.getComponent(VueFlow), edge = flow.props('edges')!.find(item => item.id.includes('BA'))!
    expect(flow.props('edges')).toHaveLength(2)
    flow.vm.$emit('edgeDoubleClick', {edge}); await flushPromises()
    expect(view.currentRow?.['id']).toBe('BA')
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({kind: 'edge', id: 'BA', open: true}))
    view.replaceRows([{id: 'AB', from: 'AliasB', to: 'AliasA'}]); await flushPromises()
    expect(flow.props('edges')).toHaveLength(0)
    expect(wrapper.text()).toContain('关系身份重复')
    delete input.additionalEdgeDataViewKey; await flushPromises()
    flow.vm.$emit('edgeDoubleClick', {edge})
    expect(onSelect).toHaveBeenCalledOnce()
    expect(flow.props('edges')).toHaveLength(1)
  })

  it('applies supplemental edge endpoint permissions before graph projection', async () => {
    const {wrapper, input, ds} = await fixture()
    const view = ds.getView('ProtectedEdges', 'default')!
    const query = new DataSpaceQueryTable({scenarioId: 'G', metaName: 'ProtectedEdges'})
    const context = new DataSpaceQueryContext({identity: query.identity, scope: 'graph', readScope: () => 'graph',
      snapshot: query.applyResult({Result: {primaryKeyField: 'id', data: {Items: [{id: 'BA', from: 'AliasB', to: 'AliasA',
        lingma_sys_params: {r: [], e: [], h: ['from'], m: [], d: false}}], Count: 1}}})})
    view.bindQueryExecutor({executeQuery: async () => context}); await view.loadFromServer()
    input.additionalEdgeDataViewKey = 'G@ProtectedEdges@default'; await flushPromises()
    expect(wrapper.getComponent(VueFlow).props('edges')).toHaveLength(1)
    expect(wrapper.text()).toContain('身份或端点不可读')
  })

  it('uses supplemental field permissions and excludes colliding node identities from actions and edges', async () => {
    const protectedGraph = await fixture({additionalNodeSources: [{dataViewKey: 'G@Nodes@other'}]}, true)
    expect(protectedGraph.wrapper.text()).not.toContain('secret')
    expect(protectedGraph.wrapper.findAll('.graph-node')).toHaveLength(2)
    const {wrapper, ds, input} = await fixture({connectableKeys: ['A', 'B'], draggableKeys: ['A']})
    const other = ds.addTable('Draft', [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'}])
    other.resourceType = 'static-data'; other.getOrCreateView('default').replaceRows([{id: 'A', name: 'Collision'}])
    input.additionalNodeSources = [{dataViewKey: 'G@Draft@default'}]; await flushPromises()
    expect(wrapper.findAll('.graph-node').map(node => node.text())).toEqual(['Betasecond'])
    expect(wrapper.text()).toContain('节点身份重复')
    expect(wrapper.getComponent(VueFlow).props('edges')).toHaveLength(0)
    expect(wrapper.getComponent(VueFlow).props('nodes')!.some(node => node.draggable)).toBe(false)
  })

  it('binds supplemental nodes to their own view and rejects events after that binding changes', async () => {
    const onSelect = vi.fn(), onNodeMove = vi.fn()
    const {wrapper, input, ds, nodes} = await fixture({additionalNodeSources: [{dataViewKey: 'G@Nodes@other'}], draggableKeys: ['C'], onSelect, onNodeMove})
    const flow = wrapper.getComponent(VueFlow)
    const originalCurrent = nodes.currentRow
    expect(wrapper.findAll('.graph-node').map(node => node.text())).toEqual(expect.arrayContaining(['Alphafirst', 'Betasecond', 'Gamma']))
    const extra = flow.props('nodes')!.find(node => node.data.title === 'Gamma')!
    flow.vm.$emit('nodeDoubleClick', {node: extra})
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({id: 'C', open: true}))
    expect(ds.getView('Nodes', 'other')!.currentRow?.['id']).toBe('C')
    expect(nodes.currentRow).toBe(originalCurrent)
    await flushPromises()
    expect(wrapper.findAll('.vue-flow__node.selected').some(node => node.text() === 'Gamma')).toBe(true)
    flow.vm.$emit('nodeDragStart', {node: extra})
    delete input.additionalNodeSources; await flushPromises()
    flow.vm.$emit('nodeDragStop', {node: {...extra, position: {x: 20, y: 30}}})
    flow.vm.$emit('nodeDoubleClick', {node: extra})
    expect(onNodeMove).not.toHaveBeenCalled(); expect(onSelect).toHaveBeenCalledOnce()
    expect(wrapper.text()).not.toContain('Gamma')
  })

  it('binds three node sources with independent fields and releases removed sources', async () => {
    const onSelect = vi.fn(), onNodeMove = vi.fn()
    const {wrapper, input, ds, nodes} = await fixture({onSelect, onNodeMove, draggableKeys: ['C', 'F']})
    const files = ds.addTable('Files', [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'title', type: 'string'}])
    files.resourceType = 'static-data'
    const fileView = files.getOrCreateView('default'); fileView.replaceRows([{id: 'F', title: 'File model'}])
    input.additionalNodeSources = [{dataViewKey: 'G@Nodes@other'}, {dataViewKey: 'G@Files@default', labelField: 'title'}]
    await flushPromises()
    expect(wrapper.findAll('.graph-node')).toHaveLength(4)
    const flow = wrapper.getComponent(VueFlow), file = flow.props('nodes')!.find(node => node.data.title === 'File model')!
    expect(file).toBeDefined()
    const sameNodes = flow.props('nodes')
    input.additionalNodeSources = input.additionalNodeSources!.map(source => ({...source})); await flushPromises()
    expect(flow.props('nodes')).toBe(sameNodes)
    flow.vm.$emit('nodeDoubleClick', {node: file}); await flushPromises()
    expect(fileView.currentRow?.['id']).toBe('F'); expect(nodes.currentRow?.['id']).not.toBe('F')
    flow.vm.$emit('nodeDragStart', {node: file})
    input.additionalNodeSources = [{dataViewKey: 'G@Nodes@other'}]; await flushPromises()
    const currentNodes = flow.props('nodes')
    fileView.replaceRows([{id: 'F', title: 'Removed source'}]); await flushPromises()
    expect(flow.props('nodes')).toBe(currentNodes)
    flow.vm.$emit('nodeDragStop', {node: {...file, position: {x: 5, y: 6}}})
    flow.vm.$emit('nodeDoubleClick', {node: file})
    expect(onNodeMove).not.toHaveBeenCalled(); expect(onSelect).toHaveBeenCalledOnce()
    expect(wrapper.text()).not.toContain('Removed source')
  })

  it('renders priority badges only from readable fields and restores ordinary nodes on binding change', async () => {
    const {wrapper, input} = await fixture({nodeCaptionField: 'note', nodeBadgeRules: [
      {field: 'name', value: 'Alpha', label: '核心', tone: 'primary'},
      {field: 'note', value: 'first', label: '补充', tone: 'success'},
    ]})
    expect(wrapper.findAll('.graph-node__badge').map(node => node.text())).toEqual(['核心'])
    expect(wrapper.get('.graph-node--primary').text()).toContain('Alpha')
    expect(wrapper.findAll('button').map(node => node.attributes('aria-label'))).toEqual(expect.arrayContaining(['放大画布', '缩小画布', '适应画布']))
    input.dataViewKey = 'G@Nodes@other'; await flushPromises()
    expect(wrapper.find('.graph-node__badge').exists()).toBe(false)
    expect(wrapper.find('.graph-node--primary').exists()).toBe(false)
    const protectedGraph = await fixture({nodeCaptionField: 'note', nodeBadgeRules: [{field: 'name', value: 'secret', label: '不得泄露', tone: 'primary'}]}, true)
    expect(protectedGraph.wrapper.text()).not.toContain('不得泄露')
    expect(protectedGraph.wrapper.find('.graph-node__caption').text()).toBe('***')
  })
  it('formats source captions and default badges without replacing DataView values or selection identities', async () => {
    const onSelect = vi.fn()
    const {wrapper, input, nodes} = await fixture({nodeCaptionField: 'note', onSelect,
      nodeCaptionOptions: [{value: 'first', label: '数据库表', tone: 'success'}], nodeDefaultBadge: '普通模型',
      nodeBadgeRules: [{field: 'name', value: 'Beta', label: '业务模型', tone: 'primary'}]})
    const flow = wrapper.getComponent(VueFlow)
    expect(flow.props('nodes')!.map(node => node.data)).toMatchObject([
      {title: 'Alpha', caption: '数据库表', badge: {label: '普通模型', tone: 'success'}},
      {title: 'Beta', caption: 'second', badge: {label: '业务模型', tone: 'primary'}},
    ])
    expect(nodes.rows[0]?.['note']).toBe('first')
    flow.vm.$emit('nodeClick', {node: flow.props('nodes')![0]}); await flushPromises()
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({kind: 'node', id: 'A', open: false})
    expect(nodes.currentRow?.['id']).toBe('A')
    input.nodeCaptionOptions = [{value: 'first', label: '新显示', tone: 'warning'}]; await flushPromises()
    expect(flow.props('nodes')![0]!.data).toMatchObject({caption: '新显示', badge: {tone: 'warning'}})
    input.dataViewKey = 'G@Nodes@other'; await flushPromises()
    expect(flow.props('nodes')![0]!.data).toMatchObject({title: 'Gamma', caption: '', badge: {label: '普通模型', tone: 'info'}})
    expect(wrapper.text()).not.toContain('新显示')
  })

  it('does not translate masked captions or infer an ordinary badge from unreadable rule fields', async () => {
    const {wrapper} = await fixture({nodeCaptionField: 'note', nodeDefaultBadge: '普通模型',
      nodeCaptionOptions: [{value: 'masked secret', label: '秘密来源'}, {value: '***', label: '不能映射脱敏符'}],
      nodeBadgeRules: [{field: 'name', value: 'never', label: '业务模型'}]}, true)
    expect(wrapper.get('.graph-node__caption').text()).toBe('***')
    expect(wrapper.find('.graph-node__badge').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/秘密来源|不能映射脱敏符|普通模型/)
  })

  it('uses supplementary view caption options and never assigns model badges from missing fields', async () => {
    const {wrapper, input, ds} = await fixture({nodeCaptionField: 'note', nodeCaptionOptions: [{value: 'first', label: '数据库表'}],
      nodeDefaultBadge: '普通模型', nodeBadgeRules: [{field: 'name', value: 'Alpha', label: '主业务'}]})
    const file = ds.addTable('File', [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'title', type: 'string'}, {name: 'kind', type: 'string'}])
    file.resourceType = 'static-data'; file.getOrCreateView('default').replaceRows([{id: 'F', title: '文件定义', kind: 'file'}])
    input.additionalNodeSources = [{dataViewKey: 'G@File@default', labelField: 'title', descriptionField: '', nodeCaptionField: 'kind',
      nodeCaptionOptions: [{value: 'file', label: '文件资源', tone: 'warning'}]}]
    await flushPromises()
    const node = wrapper.getComponent(VueFlow).props('nodes')!.find(node => node.data.title === '文件定义')!
    expect(node.data.caption).toBe('文件资源'); expect(node.data.badge).toBeUndefined()
    input.additionalNodeSources = []; await flushPromises()
    expect(wrapper.text()).not.toContain('文件资源')
  })

  it('inherits the node view in the toolbar and rebinds explicit toolbar views through the common contract', async () => {
    const before = vi.fn((context: BeforeRenderContext) => ({label: `view:${context.dataSource?.viewId}/${context.row?.['id']}`}))
    const {wrapper, input, nodes} = await fixture({toolbar: {children: [{type: 'r-button', props: {onBeforeRender: before}}]}})
    nodes.setCurrentRowById('A'); await flushPromises()
    expect(wrapper.get('.renderer-toolbar').text()).toContain('view:default/A')
    input.toolbar = {...input.toolbar, dataViewKey: 'G@Nodes@other'}; await flushPromises()
    expect(wrapper.get('.renderer-toolbar').text()).toContain('view:other/')
    input.toolbar = {...input.toolbar, dataViewKey: 'G@Edges@default'}; await flushPromises()
    nodes.setCurrentRowById('B'); await flushPromises()
    expect(wrapper.get('.renderer-toolbar').text()).not.toContain('/B')
  })

  it('does not infer an edge view from the inherited node context when edge binding is absent', async () => {
    const {wrapper, input} = await fixture()
    delete input.edgeDataViewKey; await flushPromises()
    expect(wrapper.getComponent(VueFlow).props('edges')).toHaveLength(0)
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
  })

  it('renders the shared toolbar main and tail children and retains its position', async () => {
    const action = vi.fn()
    const {wrapper} = await fixture({toolbar: {position: 'bottom', wrap: true, children: [
      {type: 'r-button', props: {label: '刷新画布', onClick: action}},
    ], tail: {children: [{type: 'r-button', props: {label: '布局帮助'}}]}}})
    const button = wrapper.findAll('button').find(item => item.text() === '刷新画布')
    expect(button, 'shared toolbar must be rendered by r-graph').toBeDefined()
    await button!.trigger('click')
    expect(action).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('布局帮助')
    expect(wrapper.get('.renderer-toolbar-lane--start').attributes('style')).toContain('flex-wrap: wrap')
    expect(wrapper.find('.renderer-graph').classes()).toContain('renderer-graph--bottom')
  })

  it('projects controlled polylines and returns original edge keys without writing records', async () => {
    const onNodeMove = vi.fn()
    const paths = {AB: [{x: 0, y: 0}, {x: 0, y: 30}, {x: 100, y: 30}]}
    const {wrapper, ds, input} = await fixture({nodePositions: {A: {x: 0, y: 0}, B: {x: 100, y: 30}},
      edgePaths: paths, draggableKeys: ['A'], onNodeMove})
    const flow = wrapper.getComponent(VueFlow), first = flow.props('nodes')![0]!
    expect(wrapper.get('.vue-flow__edge-path').attributes('d')).toContain('M0,0 L0,30 L100,30')
    flow.vm.$emit('nodeDragStart', {node: first})
    flow.vm.$emit('nodeDragStop', {node: {...first, position: {x: -96, y: -50}}})
    expect(onNodeMove).toHaveBeenCalledExactlyOnceWith({id: 'A', x: 20, y: 10,
      edges: [{id: 'AB', pointsList: [{x: 20, y: 10}, {x: 20, y: 30}, {x: 100, y: 30}]}]})
    expect(paths.AB[0]).toEqual({x: 0, y: 0})
    expect(ds.getView('Edges', 'default')!.dirtyTracking.hasPendingChanges()).toBe(false)
    flow.vm.$emit('nodeDragStart', {node: first})
    input.edgePaths = {AB: [{x: 0, y: 0}, {x: 100, y: 30}]}; await flushPromises()
    flow.vm.$emit('nodeDragStop', {node: {...first, position: {x: -80, y: -20}}})
    expect(onNodeMove).toHaveBeenCalledOnce()
  })

  it('rejects connection endpoints after query replacement or interaction lock', async () => {
    const onConnect = vi.fn()
    const {wrapper, nodes, input} = await fixture({connectableKeys: ['A', 'B'], onConnect})
    const flow = wrapper.getComponent(VueFlow), before = flow.props('nodes')!
    await nodes.loadFromServer(); await flushPromises()
    flow.vm.$emit('connect', {source: before[0]!.id, target: before[1]!.id})
    expect(onConnect).not.toHaveBeenCalled()
    const current = flow.props('nodes')!
    input.disabled = true; await flushPromises()
    flow.vm.$emit('connect', {source: current[0]!.id, target: current[1]!.id})
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('emits connection endpoints as view keys and never inserts an edge itself', async () => {
    const onConnect = vi.fn()
    const {wrapper, ds, input} = await fixture({connectableKeys: ['A', 'B'], onConnect})
    const flow = wrapper.getComponent(VueFlow), [a, b] = flow.props('nodes')!
    expect(flow.props('nodesConnectable')).toBe(true)
    expect(a?.connectable).toBe(true)
    // VueFlow locates handles using their quoted data-id selector during pointer movement.
    for (const handle of wrapper.findAll('.vue-flow__handle')) {
      const id = handle.attributes('data-id')
      expect(wrapper.element.querySelector(`.vue-flow__handle[data-id="${id}"]`)).toBe(handle.element)
    }
    flow.vm.$emit('connect', {source: a!.id, target: b!.id})
    expect(onConnect).toHaveBeenCalledExactlyOnceWith({source: 'A', target: 'B'})
    expect(ds.getView('Edges', 'default')!.rows).toHaveLength(1)
    expect(ds.getView('Edges', 'default')!.dirtyTracking.hasPendingChanges()).toBe(false)
    input.connectableKeys = ['A']; await flushPromises()
    expect(flow.props('nodes')![1]!.connectable).toBe(false)
    flow.vm.$emit('connect', {source: a!.id, target: b!.id})
    expect(onConnect).toHaveBeenCalledTimes(1)
    input.dataViewKey = 'G@Nodes@other'; await flushPromises()
    flow.vm.$emit('connect', {source: a!.id, target: b!.id})
    expect(onConnect).toHaveBeenCalledTimes(1)
  })

  it('never exposes, connects or drags a node with unreadable identity', async () => {
    const onNodeMove = vi.fn(), onConnect = vi.fn()
    const {wrapper} = await fixture({draggableKeys: ['A', 'B'], connectableKeys: ['A', 'B'], onNodeMove, onConnect}, false, true)
    expect(wrapper.getComponent(VueFlow).props('nodes')).toHaveLength(0)
    expect(wrapper.getComponent(VueFlow).props('nodesConnectable')).toBe(false)
    expect(wrapper.text()).toContain('身份不可读')
    expect(onNodeMove).not.toHaveBeenCalled()
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('rejects a completed move when the allowed keys or interaction lock change', async () => {
    const onNodeMove = vi.fn()
    const {wrapper, input} = await fixture({draggableKeys: ['A'], onNodeMove})
    const flow = wrapper.getComponent(VueFlow), node = flow.props('nodes')![0]!
    flow.vm.$emit('nodeDragStart', {node})
    input.draggableKeys = []; await flushPromises()
    flow.vm.$emit('nodeDragStop', {node: {...node, position: {x: 500, y: 300}}})
    expect(onNodeMove).not.toHaveBeenCalled()
    input.draggableKeys = ['A']; await flushPromises()
    flow.vm.$emit('nodeDragStart', {node})
    input.disabled = true; await flushPromises()
    flow.vm.$emit('nodeDragStop', {node: {...node, position: {x: 500, y: 300}}})
    expect(onNodeMove).not.toHaveBeenCalled()
  })

  it('emits controlled layout moves for allowed identities without editing model data', async () => {
    const onNodeMove = vi.fn()
    const {wrapper, nodes} = await fixture({draggableKeys: ['A'], onNodeMove})
    const flow = wrapper.getComponent(VueFlow)
    const first = flow.props('nodes')![0]!, second = flow.props('nodes')![1]!
    expect(first.draggable).toBe(true)
    expect(second.draggable).toBe(false)
    flow.vm.$emit('nodeDragStart', {node: first})
    flow.vm.$emit('nodeDragStop', {node: {...first, position: {x: 200, y: 240}}})
    expect(onNodeMove).toHaveBeenCalledExactlyOnceWith({id: 'A', x: 316, y: 300, edges: []})
    expect(nodes.hasEditingChanges()).toBe(false)
    expect(nodes.dirtyTracking.hasPendingChanges()).toBe(false)
    await flushPromises()
    expect(flow.props('nodes')![0]!.position).toEqual(first.position)
  })

  it('rejects drag completions after a new query, selection member or binding', async () => {
    const onNodeMove = vi.fn()
    const {wrapper, input, nodes} = await fixture({draggableKeys: ['A'], onNodeMove})
    const flow = wrapper.getComponent(VueFlow)
    const first = flow.props('nodes')![0]!
    flow.vm.$emit('nodeDragStart', {node: first})
    await nodes.loadFromServer(); await flushPromises()
    flow.vm.$emit('nodeDragStop', {node: {...first, position: {x: 20, y: 20}}})
    expect(onNodeMove).not.toHaveBeenCalled()
    const fresh = flow.props('nodes')![0]!
    flow.vm.$emit('nodeDragStart', {node: fresh})
    input.dataViewKey = 'G@Nodes@other'; await flushPromises()
    flow.vm.$emit('nodeDragStop', {node: {...fresh, position: {x: 20, y: 20}}})
    expect(onNodeMove).not.toHaveBeenCalled()
  })

  it('renders real views, explicit endpoint mapping and selects the originating record', async () => {
    const onSelect = vi.fn()
    const {wrapper, nodes} = await fixture({onSelect, nodePositions: {A: {x: 40, y: 90}}})
    const flow = wrapper.getComponent(VueFlow)
    expect(wrapper.text()).toContain('Alpha')
    expect(flow.props('nodes')?.[0]?.position).toEqual({x: -76, y: 30})
    expect(flow.props('edges')).toHaveLength(1)
    const node = flow.props('nodes')![1]!
    flow.vm.$emit('nodeDoubleClick', {node: {id: node.id}})
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({kind: 'node', id: 'B', open: true}))
    expect(nodes.currentRow?.['id']).toBe('B')
    expect(nodes.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(flow.props('nodesDraggable')).toBe(false)
    expect(flow.props('nodesConnectable')).toBe(false)
  })

  it('keeps pointers unchanged when the page cancels selection', async () => {
    const {wrapper, nodes} = await fixture({onSelect: event => {event.control.cancel = true}})
    nodes.setCurrentRowById('A')
    await flushPromises()
    await wrapper.findAll('.vue-flow__node')[1]!.trigger('click')
    await flushPromises()
    expect(nodes.currentRow?.['id']).toBe('A')
    expect(wrapper.findAll('.vue-flow__node.selected').map(node => node.get('strong').text())).toEqual(['Alpha'])
  })

  it('follows the chosen rows member and ignores old node events after rebinding', async () => {
    const onSelect = vi.fn()
    const {wrapper, input, nodes, ds} = await fixture({onSelect})
    const previous = nodes.currentRow
    const flow = wrapper.getComponent(VueFlow), oldId = flow.props('nodes')![0]!.id
    input.dataViewKey = 'G@Nodes@other'
    await flushPromises()
    expect(wrapper.text()).toContain('Gamma')
    expect(wrapper.text()).not.toContain('Alpha')
    flow.vm.$emit('nodeClick', {node: {id: oldId}})
    expect(onSelect).not.toHaveBeenCalled()
    expect(nodes.currentRow).toBe(previous)
    input.dataViewKey = 'G@Nodes@default'; input.dataMember = 'selectedRows'
    nodes.setSelectedRows([nodes.rows[1]!])
    await flushPromises()
    expect(wrapper.getComponent(VueFlow).props('nodes')).toHaveLength(1)
    expect(wrapper.text()).toContain('Beta')
    ds.getView('Nodes', 'other')!.replaceRows([{id: 'C', name: 'Changed old view'}])
    await flushPromises()
    expect(wrapper.text()).not.toContain('Changed old view')
  })

  it('consumes formal field permissions and diagnoses unresolved edges', async () => {
    const {wrapper} = await fixture({}, true)
    expect(wrapper.text()).not.toContain('secret')
    expect(wrapper.getComponent(VueFlow).props('edges')).toHaveLength(0)
    expect(wrapper.find('[role="alert"]').text()).toContain('端点')
  })
})
