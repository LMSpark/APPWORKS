import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {FieldText, RendererGraph, RendererTable, Spark, registerAllRenderers, type GraphSelection} from '@spark-appworks/spark-component'
import WorkflowDesigns from '@/views/app/WorkflowDesigns.vue'
import {agentWorkflowOwnerInput} from '../../runtime/auth-nav/workflow/agent-workflow-design-fixture'

const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(),
  uploads: (): string[] => [],
  message: {success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn()},
  messageBox: {confirm: vi.fn(async () => 'confirm'), prompt: vi.fn()},
}))

vi.mock('element-plus', async importOriginal => ({
  ...await importOriginal<typeof import('element-plus')>(),
  ElMessage: mocks.message,
  ElMessageBox: mocks.messageBox,
}))

vi.mock('vue-router', () => ({onBeforeRouteLeave: vi.fn()}))
vi.mock('@spark-appworks/spark-app', async importOriginal => ({...await importOriginal<Record<string, unknown>>(), useSystemPageDirtySource: () => undefined}))

vi.mock('@/lowcode/resources/repository/agent-workflow/agent-workflow-file-owner', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lowcode/resources/repository/agent-workflow/agent-workflow-file-owner')>()
  return {...actual, createAgentWorkflowFileDataViewOwner: () => {
    const {input, fileUpload} = agentWorkflowOwnerInput(mocks.files)
    mocks.uploads = () => fileUpload.uploadWorkingText.mock.calls.map(([command]) => command.fileName)
    return actual.createAgentWorkflowFileDataViewOwner(input)
  }}
})

const design = {
  kind: 'agent.workflow.design', version: 1, id: 'alpha',
  workflow: {id: 'alpha', version: 1, variables: [{name: 'goal', title: '目标'}], runtimeBinding: {
    registration: {alias: 'demo', moduleId: 'demo', businessId: 'demo'},
    inputContract: {identityField: 'goal', messageField: 'goal', paramsSchema: {type: 'object', properties: {goal: {type: 'string'}}, required: ['goal'],
      additionalProperties: false}, readonlySteps: []},
    systemPrompt: {template: 'Demo: {{ goal }}', conditionalHints: []},
    modelProjectionRef: {kind: 'dts-class-model', rootClassName: 'DemoModel', manifestUrlRef: 'dts-class-model'},
    executableRef: {kind: 'js-module', moduleSpecifier: './demo-model.js', exportName: 'DemoModel'},
  }, graph: {nodes: [
    {id: 'start', type: 'custom', position: {x: 0, y: 0}, data: {type: 'start', title: '开始'}},
    {id: 'loop', type: 'custom', position: {x: 300, y: 0}, data: {type: 'loop', title: '循环', loop: {mode: 'count', subGraph: {nodes: [
      {id: 'inner', type: 'custom', position: {x: 0, y: 0}, data: {type: 'task', title: '内层'}},
    ], lines: []}}}},
    {id: 'output', type: 'custom', position: {x: 600, y: 0}, data: {type: 'output', title: '输出'}},
  ], lines: [{id: 'l1', from: {nodeId: 'start', modelId: '$workflow', memberName: 'out'}, to: {nodeId: 'loop', modelId: '', memberName: 'in'}}]}},
  x_spark: {designer: {title: 'Alpha'}},
}

const DrawerStub = defineComponent({props: {modelValue: Boolean, title: String}, setup(props, {slots}) {
  return () => props.modelValue ? h('section', {class: 'drawer-stub', 'data-title': props.title}, slots['default']?.()) : null
}})
const DialogStub = defineComponent({props: {modelValue: Boolean}, setup(props, {slots}) {
  return () => props.modelValue ? h('section', {class: 'dialog-stub'}, [slots['default']?.(), slots['footer']?.()]) : null
}})

const mounted: VueWrapper[] = []
const restore: Array<() => void> = []
beforeEach(() => {
  mocks.files.clear()
  mocks.files.set('design.json', JSON.stringify(design, null, 2))
  mocks.files.set('definition.json', JSON.stringify({kind: 'old'}))
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  Object.values(mocks.message).forEach(fn => fn.mockClear())
})
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  restore.splice(0).forEach(dispose => dispose())
  vi.unstubAllGlobals()
})

async function mountPage() {
  registerAllRenderers()
  const stubs = {...config.global.stubs}
  delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']
  const original = config.global.stubs; config.global.stubs = stubs
  restore.push(() => {config.global.stubs = original})
  const wrapper = mount(WorkflowDesigns, {global: {plugins: [Spark.createPlugin(), ElementPlus], stubs: {ElDrawer: DrawerStub, ElDialog: DialogStub}}})
  mounted.push(wrapper)
  for (let i = 0; i < 5; i++) await flushPromises()
  return wrapper
}

const saved = () => JSON.parse(mocks.files.get('design.json') ?? '{}')
const uploads = () => mocks.uploads()
function button(wrapper: VueWrapper, label: string) {
  const found = wrapper.findAll('button').find(item => item.text() === label)
  if (!found) throw new Error(`missing button ${label}`)
  return found
}
function graph(wrapper: VueWrapper, index = 0) {
  const found = wrapper.findAllComponents(RendererGraph)[index]
  if (!found) throw new Error(`missing graph ${index}`)
  return found
}
async function select(wrapper: VueWrapper, kind: 'node' | 'edge', id: string, index = 0, open = false) {
  const event: GraphSelection = {kind, id, open, control: {cancel: false}}
  graph(wrapper, index).props('onSelect')?.(event)
  await flushPromises()
}
async function typeField(wrapper: VueWrapper, field: string, value: string) {
  const input = wrapper.findAllComponents(FieldText).find(item => item.props('field') === field)?.find('input')
  if (!input) throw new Error(`missing field ${field}`)
  await input.setValue(value)
  await input.trigger('change')
  await flushPromises()
}

describe('WorkflowDesigns on design projection DataViews', () => {
  it('opens the first workflow and draws the main graph from node and line rows', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('.workflow-designs__directory').findComponent(RendererTable).props('dataViewKey')).toContain('AgentWorkflowFiles@directory')
    expect(wrapper.findAllComponents(RendererGraph)).toHaveLength(1)
    expect(wrapper.findAll('.graph-node').map(node => node.text())).toEqual(expect.arrayContaining([expect.stringContaining('开始'), expect.stringContaining('循环')]))
    expect(graph(wrapper).props('edgeNodeKeys')).toMatchObject({start: 'workflow.graph#start', loop: 'workflow.graph#loop'})
    expect(graph(wrapper).props('nodePositions')).toMatchObject({'workflow.graph#loop': {x: 416, y: 60}})
  })

  it('edits the selected node through the form and saves design.json once', async () => {
    const wrapper = await mountPage()
    await select(wrapper, 'node', 'workflow.graph#start', 0, true)
    expect(wrapper.find('.drawer-stub').attributes('data-title')).toBe('节点属性')
    await typeField(wrapper, 'title', '起点')
    expect(wrapper.text()).toContain('起点')
    expect(saved().workflow.graph.nodes[0].data.title).toBe('开始')
    await button(wrapper, '保存').trigger('click'); await flushPromises()
    expect(uploads()).toEqual(['design.json'])
    expect(saved().workflow.graph.nodes[0].data.title).toBe('起点')
    expect(saved().workflow.graph.nodes[1].data.loop.subGraph.nodes[0].id).toBe('inner')
    expect(mocks.message.success).toHaveBeenCalledWith('设计稿已保存')
  })

  it('cancel discards node moves and new lines without writing', async () => {
    const wrapper = await mountPage()
    graph(wrapper).props('onNodeMove')?.({id: 'workflow.graph#start', x: 216, y: 160, edges: []})
    graph(wrapper).props('onConnect')?.({source: 'workflow.graph#loop', target: 'workflow.graph#output', sourceHandle: '4', targetHandle: '10'})
    await flushPromises()
    expect(graph(wrapper).props('nodePositions')).toMatchObject({'workflow.graph#start': {x: 216, y: 160}})
    expect(wrapper.findAll('.vue-flow__edge')).toHaveLength(2)
    await button(wrapper, '取消修改').trigger('click'); await flushPromises()
    expect(graph(wrapper).props('nodePositions')).toMatchObject({'workflow.graph#start': {x: 116, y: 60}})
    expect(wrapper.findAll('.vue-flow__edge')).toHaveLength(1)
    expect(uploads()).toEqual([])
  })

  it('saves moves and a new docked line into the design document', async () => {
    const wrapper = await mountPage()
    graph(wrapper).props('onNodeMove')?.({id: 'workflow.graph#start', x: 216, y: 160, edges: []})
    graph(wrapper).props('onConnect')?.({source: 'workflow.graph#loop', target: 'workflow.graph#output', sourceHandle: '4', targetHandle: '10'})
    await flushPromises()
    await button(wrapper, '保存').trigger('click'); await flushPromises()
    const document = saved()
    expect(document.workflow.graph.nodes[0].position).toEqual({x: 100, y: 100})
    expect(document.workflow.graph.lines[1]).toMatchObject({id: 'line.loop.output', from: {nodeId: 'loop', dock: 4}, to: {nodeId: 'output', dock: 10},
      data: {branch: {label: 'default', default: true}, visual: {lineType: 'orthogonal', controlPoints: []}}})
    expect(uploads()).toEqual(['design.json'])
  })

  it('opens the loop sub-graph in a second graph bound to the child views', async () => {
    const wrapper = await mountPage()
    await select(wrapper, 'node', 'workflow.graph#loop')
    await button(wrapper, '打开子图').trigger('click'); await flushPromises()
    expect(wrapper.findAllComponents(RendererGraph)).toHaveLength(2)
    expect(wrapper.text()).toContain('workflow.graph.loop.loop.subGraph')
    expect(graph(wrapper, 1).find('.graph-node').text()).toContain('内层')
    graph(wrapper, 1).props('onNodeMove')?.({id: 'workflow.graph.loop.loop.subGraph#inner', x: 156, y: 100, edges: []})
    await flushPromises()
    await button(wrapper, '保存').trigger('click'); await flushPromises()
    expect(saved().workflow.graph.nodes[1].data.loop.subGraph.nodes[0].position).toEqual({x: 40, y: 40})
  })

  it('publishes the definition derived from the saved design into the existing definition.json', async () => {
    const {nodes} = design.workflow.graph
    mocks.files.set('design.json', JSON.stringify({...design, workflow: {...design.workflow, graph: {nodes: [nodes[0], nodes[2]],
      lines: [{id: 'l1', from: {nodeId: 'start', modelId: '$workflow', memberName: 'out'}, to: {nodeId: 'output', modelId: '$workflow', memberName: 'in'}}]}}}))
    const wrapper = await mountPage()
    await button(wrapper, '发布 Definition').trigger('click'); await flushPromises()
    expect(mocks.message.error).not.toHaveBeenCalled()
    expect(uploads()).toEqual(['definition.json'])
    const definition = JSON.parse(mocks.files.get('definition.json') ?? '{}')
    expect(definition.kind).not.toBe('old')
    expect(mocks.message.success).toHaveBeenCalledWith('definition.json 已发布')
  })

  it('refuses to publish when definition.json does not exist', async () => {
    mocks.files.delete('definition.json')
    const wrapper = await mountPage()
    await button(wrapper, '发布 Definition').trigger('click'); await flushPromises()
    expect(uploads()).toEqual([])
    expect(mocks.message.error).toHaveBeenCalledWith(expect.stringContaining('本页面不创建文件'))
  })
})
