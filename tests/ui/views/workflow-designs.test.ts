import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {FieldJson, FieldText, PAGE_SERVICE, RendererGraph, RendererTable, Spark, registerAllRenderers, useSparkComponent, type GraphSelection, type PageServiceCapability} from '@spark-appworks/spark-component'
import WorkflowDesigns from '@/views/app/WorkflowDesigns.vue'
import type {AgentWorkflowFileDataViewOwner} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-file-owner'
import {agentWorkflowOwnerInput} from '../../runtime/auth-nav/workflow/agent-workflow-design-fixture'

const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(),
  uploads: (): string[] => [],
  creations: (): number => 0,
  afterCreate: (): void | Promise<void> => undefined,
  directoryError: (): Error | undefined => undefined,
  readError: (_path: string): Error | undefined => undefined,
  owner: (): AgentWorkflowFileDataViewOwner | undefined => undefined,
  readback: (text: string) => text,
  leave: (): boolean | Promise<boolean> => true,
  message: {success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn()},
  messageBox: {confirm: vi.fn(async () => 'confirm'), prompt: vi.fn()},
}))

vi.mock('element-plus', async importOriginal => ({
  ...await importOriginal<typeof import('element-plus')>(),
  ElMessage: mocks.message,
  ElMessageBox: mocks.messageBox,
}))

vi.mock('vue-router', () => ({onBeforeRouteLeave: (guard: typeof mocks.leave) => {mocks.leave = guard}}))
vi.mock('@spark-appworks/spark-app', async importOriginal => ({...await importOriginal<Record<string, unknown>>(), useSystemPageDirtySource: () => undefined}))

vi.mock('@/lowcode/resources/repository/agent-workflow/agent-workflow-file-owner', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lowcode/resources/repository/agent-workflow/agent-workflow-file-owner')>()
  return {...actual, createAgentWorkflowFileDataViewOwner: async () => {
    const {input, fileUpload} = agentWorkflowOwnerInput(mocks.files, {creation: true, publication: true, readback: text => mocks.readback(text),
      afterCreate: () => mocks.afterCreate(), directoryError: () => mocks.directoryError(), readError: path => mocks.readError(path)})
    mocks.creations = () => fileUpload.uploadTextVersion.mock.calls.length
    mocks.uploads = () => fileUpload.uploadWorkingText.mock.calls.map(([command]) => command.fileName)
    const owner = await actual.createAgentWorkflowFileDataViewOwner(input)
    mocks.owner = () => owner
    return owner
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
  let opened = false
  return () => {opened ||= props.modelValue; return opened ? h('section', {class: 'dialog-stub', style: props.modelValue ? '' : 'display:none'}, [slots['default']?.(), slots['footer']?.()]) : null}
}})

const mounted: VueWrapper[] = []
const restore: Array<() => void> = []
beforeEach(() => {
  mocks.files.clear()
  mocks.owner = () => undefined
  mocks.afterCreate = () => undefined
  mocks.directoryError = () => undefined
  mocks.readError = () => undefined
  mocks.messageBox.confirm.mockResolvedValue('confirm')
  mocks.readback = text => text
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
  const pageService: PageServiceCapability = {
    copyText: async () => {},
    showMessage: (message, type = 'info') => { mocks.message[type](message) },
    showConfirm: async () => mocks.messageBox.confirm().then(() => true, () => false),
    showPrompt: async () => {
      const result = await mocks.messageBox.prompt()
      if (result && typeof result === 'object' && 'value' in result && typeof result.value === 'string') return result.value
      return null
    },
    showAlert: async () => {},
    showDialog: async () => 'cancel',
    selectEntities: async () => [],
    browseFiles: async () => [],
    uploadFiles: async () => { throw new Error('workflow-designs fixture must not upload') },
    showLoading: () => {},
    navigate: () => {},
  }
  const Host = defineComponent({
    setup() {
      const {sparkProvide} = useSparkComponent({type: 'workflow-designs-test-host'})
      sparkProvide(PAGE_SERVICE, pageService)
      return () => h(WorkflowDesigns)
    },
  })
  const wrapper = mount(Host, {global: {plugins: [Spark.createPlugin(), ElementPlus], stubs: {RendererDrawer: DrawerStub, RendererDialog: DialogStub, ElDrawer: DrawerStub, ElDialog: DialogStub}}})
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
  const input = wrapper.findAllComponents(FieldText).find(item => item.props('field') === field && item.find('input').exists())?.find('input')
  if (!input) throw new Error(`missing field ${field}`)
  await input.setValue(value)
  await input.trigger('change')
  await flushPromises()
}

function usePublishableDesign() {
  const {nodes} = design.workflow.graph
  mocks.files.set('design.json', JSON.stringify({...design, workflow: {...design.workflow, graph: {nodes: [nodes[0], nodes[2]],
    lines: [{id: 'l1', from: {nodeId: 'start', modelId: '$workflow', memberName: 'out'}, to: {nodeId: 'output', modelId: '$workflow', memberName: 'in'}}]}}}))
}

describe('WorkflowDesigns on design projection DataViews', () => {
  it('creates via standard fields bound to the command view and opens the confirmed draft', async () => {
    const wrapper = await mountPage()
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'new-workflow'); await typeField(wrapper, 'title', '新首稿')
    const view = mocks.owner()?.dataSet.getView('AgentWorkflowCreation')
    const id = view?.currentRow?.['commandId']; if (!view || typeof id !== 'string') throw new Error('missing original command')
    expect(view.getEditingRow(id)).toMatchObject({workflowId: 'new-workflow', title: '新首稿'})
    expect(view?.currentRow?.['title']).toBe('')
    expect(mocks.creations()).toBe(0)
    await button(wrapper, '创建首稿').trigger('click'); await flushPromises(); await flushPromises()
    expect(mocks.creations()).toBe(1)
    expect(JSON.parse(mocks.files.get('new-workflow/design.json') ?? '{}').workflow.id).toBe('new-workflow')
    expect(wrapper.text()).toContain('Main Graph · new-workflow')
    expect(mocks.message.success).toHaveBeenCalledWith('工作流首稿已创建')
  })

  it('cancels creation without writing or losing the current design', async () => {
    const wrapper = await mountPage()
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'cancelled-workflow')
    await button(wrapper, '取消创建').trigger('click'); await flushPromises()
    expect(mocks.creations()).toBe(0); expect(uploads()).toEqual([])
    expect(mocks.owner()?.dataSet.getView('AgentWorkflowCreation')?.hasEditingChanges()).toBe(false)
    expect(wrapper.text()).toContain('Main Graph · alpha')
  })

  it('keeps conflicting input editable and never uploads over an existing workflow', async () => {
    const wrapper = await mountPage()
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'alpha')
    await button(wrapper, '创建首稿').trigger('click'); await flushPromises()
    expect(mocks.creations()).toBe(0)
    expect(wrapper.text()).toContain('已存在')
    expect(button(wrapper, '创建首稿').attributes('disabled')).toBeUndefined()
    expect(saved().workflow.id).toBe('alpha')
  })

  it('blocks abandoning unknown creation and verifies without uploading again', async () => {
    const wrapper = await mountPage()
    mocks.afterCreate = () => {throw new Error('lost ACK')}
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'unknown-workflow')
    await button(wrapper, '创建首稿').trigger('click'); await flushPromises()
    expect(mocks.creations()).toBe(1)
    expect(button(wrapper, '取消创建').attributes('disabled')).toBeDefined()
    expect(await mocks.leave()).toBe(false)
    await button(wrapper, '核验创建结果').trigger('click'); await flushPromises(); await flushPromises()
    expect(mocks.creations()).toBe(1)
    expect(wrapper.text()).toContain('Main Graph · unknown-workflow')
  })

  it('keeps the original unknown intent locked through missing and mismatched readbacks', async () => {
    const wrapper = await mountPage()
    mocks.afterCreate = () => {throw new Error('lost ACK')}
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'readback-workflow')
    await button(wrapper, '创建首稿').trigger('click'); await flushPromises()
    const original = mocks.files.get('readback-workflow/design.json')
    if (!original) throw new Error('missing original dispatched bytes')
    mocks.files.delete('readback-workflow/design.json')
    await button(wrapper, '核验创建结果').trigger('click'); await flushPromises()
    expect(button(wrapper, '取消创建').attributes('disabled')).toBeDefined()
    expect(await mocks.leave()).toBe(false)
    mocks.files.set('readback-workflow/design.json', '{}')
    await button(wrapper, '核验创建结果').trigger('click'); await flushPromises()
    expect(button(wrapper, '取消创建').attributes('disabled')).toBeDefined()
    mocks.files.set('readback-workflow/design.json', original)
    await button(wrapper, '核验创建结果').trigger('click'); await flushPromises(); await flushPromises()
    expect(mocks.creations()).toBe(1)
    expect(wrapper.text()).toContain('Main Graph · readback-workflow')
  })

  it('retains a confirmed receipt when refreshing the directory fails', async () => {
    const wrapper = await mountPage()
    mocks.afterCreate = () => {mocks.directoryError = () => new Error('directory unavailable')}
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'refresh-failed-workflow')
    await button(wrapper, '创建首稿').trigger('click'); await flushPromises()
    expect(mocks.creations()).toBe(1)
    expect(mocks.owner()?.dataSet.getView('AgentWorkflowCreation')?.rows).toEqual(expect.arrayContaining([expect.objectContaining({workflowId: 'refresh-failed-workflow', status: 'created'})]))
    expect(mocks.message.error).toHaveBeenCalledWith(expect.stringContaining('首稿已创建'))
    expect(wrapper.text()).toContain('Main Graph · alpha')
  })

  it('keeps the original design draft when the user declines switching after creation', async () => {
    const wrapper = await mountPage()
    await select(wrapper, 'node', 'workflow.graph#start', 0, true)
    await typeField(wrapper, 'title', '原稿未保存')
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'preserve-old-workflow')
    mocks.messageBox.confirm.mockRejectedValueOnce(new Error('cancel'))
    await button(wrapper, '创建首稿').trigger('click'); await flushPromises(); await flushPromises()
    expect(mocks.creations()).toBe(1); expect(uploads()).toEqual([])
    expect(wrapper.text()).toContain('Main Graph · alpha')
    expect(mocks.owner()?.design.nodes.getEditingRow('workflow.graph#start')?.['title']).toBe('原稿未保存')
  })

  it('reports an opening failure after successful creation without resubmitting', async () => {
    const wrapper = await mountPage()
    mocks.afterCreate = () => {mocks.readError = path => path.endsWith('/open-failed-workflow') ? new Error('open unavailable') : undefined}
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'open-failed-workflow')
    await button(wrapper, '创建首稿').trigger('click'); await flushPromises(); await flushPromises()
    expect(mocks.creations()).toBe(1)
    expect(mocks.message.success).toHaveBeenCalledWith('工作流首稿已创建')
    expect(wrapper.text()).toContain('打开工作流失败')
    await button(wrapper, '刷新目录').trigger('click'); await flushPromises()
    expect(mocks.creations()).toBe(1)
  })

  it('withdraws the old editor when only the new child views fail to load', async () => {
    const wrapper = await mountPage()
    let reads = 0
    mocks.afterCreate = () => {mocks.readError = path => path.endsWith('/partial-open-workflow') && ++reads === 6 ? new Error('child query failed') : undefined}
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'partial-open-workflow')
    await button(wrapper, '创建首稿').trigger('click'); await flushPromises(); await flushPromises()
    expect(reads).toBeGreaterThanOrEqual(6)
    expect(wrapper.text()).toContain('打开工作流失败')
    expect(wrapper.text()).not.toContain('Main Graph · alpha')
    expect(wrapper.findAllComponents(RendererGraph)).toHaveLength(0)
    expect(mocks.creations()).toBe(1)
  })

  it('rechecks all busy views before discarding any draft after confirmation', async () => {
    const wrapper = await mountPage(), owner = mocks.owner()
    if (!owner) throw new Error('missing owner')
    await owner.design.nodes.editRowById('workflow.graph#start', {title: '原稿待保护'})
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'inflight-workflow')
    let confirm: ((value: string) => void) | undefined, uploaded: (() => void) | undefined
    mocks.messageBox.confirm.mockImplementationOnce(() => new Promise<string>(resolve => {confirm = resolve}))
    const leaving = Promise.resolve(mocks.leave()).catch(error => error); await flushPromises()
    mocks.afterCreate = () => new Promise<void>(resolve => {uploaded = resolve})
    await button(wrapper, '创建首稿').trigger('click'); await flushPromises()
    expect(owner.dataSet.getView('AgentWorkflowCreation')?.mutating).toBe(true)
    confirm?.('confirm')
    try {
      expect(await leaving).toBe(false)
      expect(owner.design.nodes.getEditingRow('workflow.graph#start')?.['title']).toBe('原稿待保护')
    } finally {uploaded?.(); await flushPromises(); await flushPromises()}
  })

  it('does not let an old leave confirmation discard a replacement creation row', async () => {
    const wrapper = await mountPage(), owner = mocks.owner()
    if (!owner) throw new Error('missing owner')
    await owner.design.nodes.editRowById('workflow.graph#start', {title: '原稿待保护'})
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'first-intent')
    let confirm: ((value: string) => void) | undefined
    mocks.messageBox.confirm.mockImplementationOnce(() => new Promise<string>(resolve => {confirm = resolve}))
    const leaving = Promise.resolve(mocks.leave()).catch(error => error); await flushPromises()
    await button(wrapper, '取消创建').trigger('click'); await flushPromises()
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'replacement-intent')
    confirm?.('confirm')
    expect(await leaving).toBe(false)
    expect(owner.design.nodes.getEditingRow('workflow.graph#start')?.['title']).toBe('原稿待保护')
    expect(owner.dataSet.getView('AgentWorkflowCreation')?.hasEditingChanges()).toBe(true)
    expect(mocks.creations()).toBe(0)
  })

  it('releases a previously opened node dialog before switching to the created workflow', async () => {
    const errors: unknown[] = [], previous = config.global.config.errorHandler
    config.global.config.errorHandler = error => {errors.push(error)}
    restore.push(() => {if (previous) config.global.config.errorHandler = previous; else delete config.global.config.errorHandler})
    const wrapper = await mountPage()
    await button(wrapper, '新增节点').trigger('click'); await flushPromises()
    await button(wrapper, '取消').trigger('click'); await flushPromises()
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    await typeField(wrapper, 'workflowId', 'after-node-dialog')
    await button(wrapper, '创建首稿').trigger('click'); await flushPromises(); await flushPromises()
    expect(errors).toEqual([])
    expect(wrapper.text()).toContain('Main Graph · after-node-dialog')
    expect(mocks.creations()).toBe(1)
  })

  it('offers creation even when the original directory lookup fails', async () => {
    mocks.directoryError = () => new Error('[1003] 文件夹路径不存在')
    const wrapper = await mountPage()
    expect(button(wrapper, '新建工作流').attributes('disabled')).toBeUndefined()
    await button(wrapper, '新建工作流').trigger('click'); await flushPromises()
    expect(wrapper.findAllComponents(FieldText).some(field => field.props('field') === 'workflowId')).toBe(true)
    await button(wrapper, '取消创建').trigger('click'); await flushPromises()
    expect(mocks.creations()).toBe(0)
  })

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
    usePublishableDesign()
    const wrapper = await mountPage()
    await button(wrapper, '发布 Definition').trigger('click'); await flushPromises()
    expect(mocks.message.error).not.toHaveBeenCalled()
    expect(uploads()).toEqual(['definition.json'])
    const definition = JSON.parse(mocks.files.get('definition.json') ?? '{}')
    expect(definition.kind).not.toBe('old')
    expect(mocks.message.success).toHaveBeenCalledWith('definition.json 已发布')
  })

  it('refuses first publish when the Definition lookup fails for a non-404 reason', async () => {
    mocks.files.delete('definition.json')
    const wrapper = await mountPage()
    mocks.readError = () => new Error('service unavailable')
    await button(wrapper, '发布 Definition').trigger('click'); await flushPromises()
    expect(mocks.creations()).toBe(0)
    expect(uploads()).toEqual([])
    expect(mocks.message.error).toHaveBeenCalledWith(expect.stringContaining('拒绝首发或覆盖'))
  })

  it('creates definition.json on the first publish when the saved design is valid', async () => {
    mocks.files.delete('definition.json')
    usePublishableDesign()
    const wrapper = await mountPage()
    await button(wrapper, '发布 Definition').trigger('click'); await flushPromises(); await flushPromises()
    expect(mocks.creations()).toBe(1)
    expect(uploads()).toEqual([])
    expect(JSON.parse(mocks.files.get('definition.json') ?? '{}').kind).not.toBe('old')
    expect(mocks.message.success).toHaveBeenCalledWith('definition.json 已首次发布')
  })

  it('verifies an unknown first publication by the original command without uploading again', async () => {
    mocks.files.delete('definition.json')
    usePublishableDesign()
    mocks.afterCreate = () => {throw new Error('lost publication ACK')}
    const wrapper = await mountPage()
    await button(wrapper, '发布 Definition').trigger('click'); await flushPromises(); await flushPromises()
    expect(mocks.creations()).toBe(1)
    expect(button(wrapper, '核验首次发布').exists()).toBe(true)
    expect(await mocks.leave()).toBe(false)
    await button(wrapper, '核验首次发布').trigger('click'); await flushPromises(); await flushPromises()
    expect(mocks.creations()).toBe(1)
    expect(mocks.message.success).toHaveBeenCalledWith('definition.json 首次发布已确认')
  })

  it('preserves a user definition draft when publication refuses to replace it', async () => {
    const wrapper = await mountPage(), owner = mocks.owner()
    if (!owner) throw new Error('missing owner')
    await button(wrapper, 'Definition').trigger('click'); await flushPromises()
    const view = owner.definitionView
    await view.editRowById('alpha', {content: '{"user":"unsaved"}'})
    const discard = vi.spyOn(view, 'discardPendingChanges')
    await button(wrapper, '发布 Definition').trigger('click'); await flushPromises()
    expect(discard).not.toHaveBeenCalled()
    expect(view.getEditingRow('alpha')?.['content']).toBe('{"user":"unsaved"}')
    expect(uploads()).toEqual([])
    expect(mocks.message.error).toHaveBeenCalledWith(expect.stringContaining('未保存'))
  })

  it('keeps an uncertain publication and verifies the original row through Definition save without reupload', async () => {
    usePublishableDesign()
    const wrapper = await mountPage(), owner = mocks.owner()
    if (!owner) throw new Error('missing owner')
    const discard = vi.spyOn(owner.definitionView, 'discardPendingChanges')
    mocks.readback = () => 'unconfirmed readback'
    await button(wrapper, '发布 Definition').trigger('click'); await flushPromises()
    expect(uploads()).toEqual(['definition.json'])
    expect(owner.definitionView.hasUnconfirmedSave).toBe(true)
    expect(discard).not.toHaveBeenCalled()
    expect(await mocks.leave()).toBe(false)
    const load = vi.spyOn(owner, 'loadDesign')
    wrapper.findComponent(RendererTable).props('onRowClick')?.({workflowId: 'beta'}, undefined, undefined, {cancel: false})
    await flushPromises(); expect(load).not.toHaveBeenCalled()
    expect(owner.definitionView.hasUnconfirmedSave).toBe(true)
    await button(wrapper, 'Definition').trigger('click'); await flushPromises()
    expect(mocks.message.error.mock.calls.map(([text]) => text)).not.toContainEqual(expect.stringContaining('打开 Definition 失败'))
    expect(wrapper.findComponent(FieldJson).exists()).toBe(true)
    mocks.readback = text => text
    await button(wrapper, '保存 Definition').trigger('click'); await flushPromises()
    expect(owner.definitionView.hasUnconfirmedSave).toBe(false)
    expect(uploads()).toEqual(['definition.json'])
    expect(discard).not.toHaveBeenCalled()
  })

  it('rejects publishing before saving design changes when Definition already has a draft', async () => {
    const wrapper = await mountPage(), owner = mocks.owner()
    if (!owner) throw new Error('missing owner')
    await owner.loadDocument('alpha', 'definition.json')
    await owner.definitionView.editRowById('alpha', {content: '{"user":"pending"}'})
    await owner.design.workflow.editRowById('alpha', {title: 'unsaved design'})
    await flushPromises()
    await button(wrapper, '发布 Definition').trigger('click'); await flushPromises()
    expect(uploads()).toEqual([])
    expect(owner.design.workflow.getEditingRow('alpha')?.['title']).toBe('unsaved design')
    expect(owner.definitionView.getEditingRow('alpha')?.['content']).toBe('{"user":"pending"}')
  })

  it('preserves a definition-only draft when the user cancels leaving', async () => {
    const wrapper = await mountPage(), owner = mocks.owner()
    if (!owner) throw new Error('missing owner')
    await button(wrapper, 'Definition').trigger('click'); await flushPromises()
    await owner.definitionView.editRowById('alpha', {content: '{"user":"keep"}'})
    mocks.messageBox.confirm.mockRejectedValueOnce('cancel')
    expect(await mocks.leave()).toBe(false)
    expect(owner.definitionView.getEditingRow('alpha')?.['content']).toBe('{"user":"keep"}')
    expect(uploads()).toEqual([])
  })

  it('rechecks uncertainty when a discard confirmation resolves after a failed save', async () => {
    const wrapper = await mountPage(), owner = mocks.owner()
    if (!owner) throw new Error('missing owner')
    await button(wrapper, 'Definition').trigger('click'); await flushPromises()
    await owner.definitionView.editRowById('alpha', {content: '{"user":"pending"}'})
    let confirm: ((value: string) => void) | undefined
    mocks.messageBox.confirm.mockImplementationOnce(() => new Promise<string>(resolve => {confirm = resolve}))
    const leaving = mocks.leave(); await flushPromises()
    mocks.readback = () => 'unknown readback'
    await expect(owner.dataSet.saveChanges({views: [{tableName: owner.definitionView.tableName, viewId: 'definition'}]})).rejects.toThrow('回读不一致')
    expect(owner.definitionView.hasUnconfirmedSave).toBe(true)
    confirm?.('confirm')
    expect(await leaving).toBe(false)
    expect(owner.definitionView.hasUnconfirmedSave).toBe(true)
  })

  it('does not overwrite a Definition draft added while saved design is being read for publication', async () => {
    usePublishableDesign()
    const wrapper = await mountPage(), owner = mocks.owner()
    if (!owner) throw new Error('missing owner')
    const original = owner.readDocument
    let release: (() => void) | undefined
    vi.spyOn(owner, 'readDocument').mockImplementationOnce(async (id, file) => {
      const text = await original(id, file)
      return new Promise<string>(resolve => {release = () => resolve(text)})
    })
    await button(wrapper, '发布 Definition').trigger('click')
    await vi.waitFor(() => expect(release).toBeDefined())
    await owner.definitionView.editRowById('alpha', {content: '{"user":"late"}'})
    release?.(); await flushPromises()
    expect(uploads()).toEqual([])
    expect(owner.definitionView.getEditingRow('alpha')?.['content']).toBe('{"user":"late"}')
  })

  it('does not first-publish a captured design after a newer local edit arrives', async () => {
    mocks.files.delete('definition.json')
    usePublishableDesign()
    const wrapper = await mountPage(), owner = mocks.owner()
    if (!owner) throw new Error('missing owner')
    const original = owner.readDocument
    let release: (() => void) | undefined
    vi.spyOn(owner, 'readDocument').mockImplementationOnce(async (id, file) => {
      const text = await original(id, file)
      return new Promise<string>(resolve => {release = () => resolve(text)})
    })
    await button(wrapper, '发布 Definition').trigger('click')
    await vi.waitFor(() => expect(release).toBeDefined())
    await owner.design.workflow.editRowById('alpha', {title: 'late local edit'})
    release?.(); await flushPromises(); await flushPromises()
    expect(mocks.creations()).toBe(0)
    expect(owner.design.workflow.getEditingRow('alpha')?.['title']).toBe('late local edit')
    expect(mocks.message.error).toHaveBeenCalledWith(expect.stringContaining('设计稿'))
  })

  it('does not extend an earlier discard confirmation to a newly dirty Definition view', async () => {
    const wrapper = await mountPage(), owner = mocks.owner()
    if (!owner) throw new Error('missing owner')
    await owner.design.workflow.editRowById('alpha', {title: 'pending design'})
    let confirm: ((value: string) => void) | undefined
    mocks.messageBox.confirm.mockImplementationOnce(() => new Promise<string>(resolve => {confirm = resolve}))
    const leaving = mocks.leave(); await flushPromises()
    await owner.loadDocument('alpha', 'definition.json')
    await owner.definitionView.editRowById('alpha', {content: '{"user":"new-view"}'})
    confirm?.('confirm')
    expect(await leaving).toBe(false)
    expect(owner.definitionView.getEditingRow('alpha')?.['content']).toBe('{"user":"new-view"}')
    expect(owner.design.workflow.getEditingRow('alpha')?.['title']).toBe('pending design')
  })

  it('keeps the Definition dialog open when its save becomes unknown while confirming close', async () => {
    const wrapper = await mountPage(), owner = mocks.owner()
    if (!owner) throw new Error('missing owner')
    await button(wrapper, 'Definition').trigger('click'); await flushPromises()
    await owner.definitionView.editRowById('alpha', {content: '{"user":"pending"}'})
    let confirm: ((value: string) => void) | undefined
    mocks.messageBox.confirm.mockImplementationOnce(() => new Promise<string>(resolve => {confirm = resolve}))
    await button(wrapper, '关闭').trigger('click'); await flushPromises()
    mocks.readback = () => 'unknown readback'
    await expect(owner.dataSet.saveChanges({views: [{tableName: owner.definitionView.tableName, viewId: 'definition'}]})).rejects.toThrow('回读不一致')
    confirm?.('confirm'); await flushPromises()
    expect(wrapper.findComponent(FieldJson).exists()).toBe(true)
    expect(owner.definitionView.hasUnconfirmedSave).toBe(true)
  })

})
