import {afterEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref, type Component} from 'vue'
import ElementPlus, {ElTable, ElTableColumn} from 'element-plus'
import {bindDataSetReadonlyCommandQuery, DataSet, ensureDataSetFileCommandView, ensureDataSetStaticInputTable, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime, PageTool} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, FieldText, RendererForm, RendererTable, Spark, registerAllRenderers, useSparkComponent, AI_DATA_ENTRY_HOST} from '@spark-appworks/spark-component'
import type {PageRuntime as PageRuntimeType} from '@spark-appworks/spark-project-model'
import SparkAiDataEntry from '../../ai/components/SparkAiDataEntry/SparkAiDataEntry.vue'

type SessionSurface = Readonly<{
  targetView: DataView; input: DataView; candidates: DataView; turn: DataView
  turnId: string | undefined; status: string | undefined; busy: boolean; hasUnconfirmedSave: boolean
  blocksWorkspace: boolean; pending: boolean; error: string; canStart: boolean; canRefresh: boolean
  canCancel: boolean; canConfirm: boolean; confirmationError: string; shouldAutoRefresh: boolean
  subscribe(listener: () => void): () => void
  start(): Promise<void>; refresh(): Promise<void>; confirm(): Promise<void>; cancel(): Promise<void>; discard(): Promise<void>
  dispose?: () => void
}>
type Attachment = Readonly<{session: SessionSurface; signal: AbortSignal; detach(): void}>
type HostCapability = Readonly<{openSession(targetView: DataView): Attachment}>

const runtimes: PageRuntimeType[] = []
const dataSets: DataSet[] = []
const wrappers: VueWrapper[] = []
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => {if (wrapper.exists()) wrapper.unmount()})
  runtimes.splice(0).forEach(runtime => runtime.dispose())
  dataSets.splice(0).forEach(dataSet => {if (!dataSet.destroyed) dataSet.destroy()})
  vi.restoreAllMocks()
})

async function createTarget(options: {autoRefresh?: boolean; blocksWorkspace?: boolean; candidateRows?: readonly Record<string, unknown>[]} = {}) {
  const dataSet = DataSet.fromJson({scenarioId: 'AI-ENTRY-SPACE', tables: {Rows: {
    modelBinding: {modelId: 'MODEL-ROWS', modelName: 'Items'},
    columns: [
      {name: 'rowid', type: 'string', isPrimaryKey: true},
      {name: 'ordIdx', type: 'tinyint', label: '排序', min: 0, max: 10, allowAIAdd: true},
      {name: 'name', type: 'varchar', label: '名称', allowAIAdd: true},
      {name: 'privateNote', type: 'string', label: '内部备注', allowAIAdd: false},
    ], views: {default: {commitMode: 'staged'}, alternate: {commitMode: 'staged'}},
  }}})
  dataSets.push(dataSet)
  const targetView = dataSet.getView('Rows', 'default')
  if (targetView === undefined) throw new Error('target DataView fixture was not created')
  targetView.bindQueryExecutor({executeQuery: async () => ({
    rows: [{rowid: 'EXISTING', ordIdx: 0, name: '已有'}], total: 1,
    assertIdentity: identity => {
      if (identity.scenarioId !== 'AI-ENTRY-SPACE' || identity.metaName !== 'Items') throw new Error('query identity mismatch')
    },
    rowKey: row => row['rowid'],
    prepareNewRow: row => ({...row, rowid: 'DRAFT'}),
    isFieldReadOnly: () => false,
    fieldAccess: field => ({read: 'visible', write: field === 'privateNote' ? 'denied' : 'allowed', required: false,
      component: 'editable', writeMode: 'editable'}),
    readFieldAccess: () => 'visible',
    addActionState: available => available ? 'enabled' : 'disabled',
    editActionState: () => 'enabled', deleteActionState: () => 'enabled', createChildActionState: () => 'enabled', viewActionState: () => 'enabled',
  })})
  await targetView.refresh()
  expect(targetView.loadingError).toBeNull()
  expect(targetView.readSnapshot().rows).toHaveLength(1)
  ensureDataSetStaticInputTable(dataSet, 'AiDataEntryInput', [{name: 'inputKey', primary: true}, {name: 'businessPrompt'}])
  const input = dataSet.getView('AiDataEntryInput', 'default')
  if (input === undefined) throw new Error('business prompt input DataView fixture was not created')
  input.commitMode = 'staged'
  input.appendRow({inputKey: 'input', businessPrompt: ''})
  input.setCurrentRowById('input')
  const candidates = ensureDataSetFileCommandView({dataSet, tableName: 'AiDataEntryCandidates', resourceId: 'candidate-fixture',
    columns: [{name: 'candidateKey', primary: true}, ...targetView.columns.filter(column => column.allowAIAdd === true && !column.isPrimaryKey)
      .map(column => ({name: column.name, type: column.type, label: column.label ?? column.name}))]})
  bindDataSetReadonlyCommandQuery(candidates, {resource: {resourceType: 'file', resourceId: 'candidate-fixture'}, guard: () => undefined,
    loadRows: async () => options.candidateRows ?? []})
  const turnTable = dataSet.addTable('AiEntryTurnFixture', [
    {name: 'turnId', type: 'string', isPrimaryKey: true}, {name: 'status', type: 'string'},
    {name: 'errorCode', type: 'string'}, {name: 'errorMessage', type: 'string'},
  ])
  const turn = dataSet.getView(turnTable.tableName, 'default')
  if (turn === undefined) throw new Error('turn status DataView fixture was not created')
  turn.appendRow({turnId: 'TURN-FIXTURE', status: 'RUNNING', errorCode: '', errorMessage: ''})
  const listeners = new Set<() => void>()
  const sessionState = {error: '', autoRefresh: options.autoRefresh === true, failNextRefresh: false, blocksWorkspace: options.blocksWorkspace === true}
  const session: SessionSurface = {
    targetView, input, candidates, turn,
    get turnId() {return undefined}, get status() {return undefined}, get busy() {return false},
    get hasUnconfirmedSave() {return false}, get blocksWorkspace() {return sessionState.blocksWorkspace}, get pending() {return input.hasEditingChanges()},
    get error() {return sessionState.error}, get canStart() {return input.hasEditingChanges()}, get canRefresh() {return options.autoRefresh === true},
    get canCancel() {return false}, get canConfirm() {return false}, get confirmationError() {return '没有候选'}, get shouldAutoRefresh() {return sessionState.autoRefresh},
    subscribe: vi.fn(listener => {
      const onInputChange = () => listener()
      listeners.add(listener)
      input.events.on('editingChanged', onInputChange)
      return () => {listeners.delete(listener); input.events.off('editingChanged', onInputChange)}
    }),
    start: vi.fn(async () => undefined), refresh: vi.fn(async () => {
      if (sessionState.failNextRefresh) {
        sessionState.failNextRefresh = false
        sessionState.error = 'status query failed'
        listeners.forEach(listener => listener())
        throw new Error(sessionState.error)
      }
      sessionState.error = ''
      sessionState.autoRefresh = options.autoRefresh === true
      listeners.forEach(listener => listener())
    }), confirm: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined), discard: vi.fn(async () => undefined), dispose: vi.fn(),
  }
  const runtime = await runtimeFor(dataSet)
  return {dataSet, runtime, targetView, session, sessionState, listeners}
}

async function runtimeFor(dataSet: DataSet): Promise<PageRuntimeType> {
  const tool = new PageTool({pageId: '/ai-entry-test'})
  tool.markLoaded()
  const runtime = new PageRuntime({tool, scenarioIds: ['AI-ENTRY-SPACE'], mainScenarioId: 'AI-ENTRY-SPACE',
    loadScenario: async () => dataSet})
  runtimes.push(runtime)
  await runtime.load()
  return runtime
}

function provideRuntimeAndHost(runtime: PageRuntimeType, host: HostCapability, child: Component, disabled = false) {
  return defineComponent({
    name: 'AiDataEntryCapabilityFixture',
    setup() {
      const {sparkProvide} = useSparkComponent({type: 'ai-entry-capability-fixture'})
      sparkProvide(PAGE_RUNTIME, runtime)
      sparkProvide(AI_DATA_ENTRY_HOST, host)
      return () => h(child, {dataViewKey: 'AI-ENTRY-SPACE@Items@default', title: 'AI批量新增', disabled})
    },
  })
}

describe('SparkAiDataEntry renderer', () => {
  it('resolves the full PAGE_RUNTIME binding and attaches the exact target DataView', async () => {
    const f = await createTarget()
    const controller = new AbortController()
    const detach = vi.fn()
    const openSession = vi.fn((): Attachment => ({session: f.session, signal: controller.signal, detach}))
    const host: HostCapability = {openSession}
    const Root = provideRuntimeAndHost(f.runtime, host, SparkAiDataEntry)

    registerAllRenderers()
    const wrapper = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
    wrappers.push(wrapper)
    await flushPromises()

    expect(f.runtime.resolveView('AI-ENTRY-SPACE@Items@default')).toBe(f.targetView)
    expect(openSession).toHaveBeenCalledOnce()
    expect(openSession).toHaveBeenCalledWith(f.targetView)
    expect(wrapper.findComponent(RendererForm).props('dataViewKey')).toContain('@AiDataEntryInput@')
    expect(wrapper.findComponent(RendererTable).props('dataViewKey')).toContain('@AiDataEntryCandidates@')
    const candidateTable = wrapper.findComponent(RendererTable)
    expect(candidateTable.props('children')).toEqual(expect.arrayContaining([
      expect.objectContaining({type: 'r-text', props: expect.objectContaining({field: 'ordIdx', readonly: true})}),
      expect.objectContaining({type: 'r-text', props: expect.objectContaining({field: 'name', readonly: true})}),
    ]))
    expect(f.session.candidates.columns.find(column => column.name === 'ordIdx')?.allowAIAdd).toBeUndefined()
    expect(f.session.candidates.addActionState()).not.toBe('enabled')
  })

  it.each([
    ['different space', 'OTHER-SPACE@Items@default'],
    ['different model', 'AI-ENTRY-SPACE@Other@default'],
  ])('rejects a full PAGE_RUNTIME key for a %s without acquiring an attachment', async (_label, dataViewKey) => {
    const f = await createTarget()
    const detach = vi.fn()
    const host: HostCapability = {openSession: vi.fn(() => ({session: f.session, signal: new AbortController().signal, detach}))}
    const Root = defineComponent({
      name: 'AiDataEntryInvalidBindingFixture',
      setup() {
        const {sparkProvide} = useSparkComponent({type: 'ai-entry-invalid-binding'})
        sparkProvide(PAGE_RUNTIME, f.runtime)
        sparkProvide(AI_DATA_ENTRY_HOST, host)
        return () => h(SparkAiDataEntry, {dataViewKey, title: '错误目标', disabled: false})
      },
    })
    registerAllRenderers()
    const wrapper = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
    wrappers.push(wrapper)
    await flushPromises()

    expect(host.openSession).not.toHaveBeenCalled()
    expect(wrapper.text()).toMatch(/视图|绑定|目标|无法/i)
    expect(detach).not.toHaveBeenCalled()
  })

  it('rejects a host factory attachment for a different target without detaching that owner', async () => {
    const f = await createTarget()
    const other = f.dataSet.addTable('OtherRows', [
      {name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'},
    ])
    const foreignTarget = f.dataSet.getView(other.tableName, 'default')
    if (foreignTarget === undefined) throw new Error('foreign DataView fixture is missing')
    const detach = vi.fn()
    const host: HostCapability = {openSession: vi.fn(() => ({session: {...f.session, targetView: foreignTarget}, signal: new AbortController().signal, detach}))}
    const Root = provideRuntimeAndHost(f.runtime, host, SparkAiDataEntry)
    registerAllRenderers()
    const wrapper = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
    wrappers.push(wrapper)
    await flushPromises()

    expect(host.openSession).toHaveBeenCalledWith(f.targetView)
    expect(wrapper.text()).toMatch(/目标|绑定|会话|不匹配/i)
    expect(detach).not.toHaveBeenCalled()
  })

  it('renders queried candidate rows through readonly standard field children', async () => {
    const f = await createTarget({candidateRows: [{candidateKey: 'CANDIDATE-1', ordIdx: 3, name: 'AI候选'}]})
    await f.session.candidates.refresh()
    const host: HostCapability = {openSession: () => ({session: f.session, signal: new AbortController().signal, detach: vi.fn()})}
    const Root = provideRuntimeAndHost(f.runtime, host, SparkAiDataEntry)
    registerAllRenderers()
    const wrapper = mount(Root, {attachTo: document.body, global: {
      plugins: [ElementPlus, Spark.createPlugin()],
      components: {'el-table': ElTable, 'el-table-column': ElTableColumn},
      stubs: {SparkComponentRenderer: false, 'el-table': ElTable, 'el-table-column': ElTableColumn},
    }})
    wrappers.push(wrapper)
    await flushPromises()

    expect(f.session.candidates.rows).toHaveLength(1)
    expect(wrapper.text()).toContain('AI候选')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.findAll('textarea')).toHaveLength(1)
    expect(wrapper.find('textarea').attributes()).toHaveProperty('disabled')
    expect(f.session.candidates.addActionState()).not.toBe('enabled')
    expect(f.session.candidates.newRowFieldAccess('name').write).not.toBe('allowed')
  })

  it('disables the prompt textarea when the component is disabled with no candidates or workspace lock', async () => {
    const f = await createTarget()
    expect(f.session.candidates.rows).toHaveLength(0)
    expect(f.session.blocksWorkspace).toBe(false)
    const host: HostCapability = {openSession: () => ({session: f.session, signal: new AbortController().signal, detach: vi.fn()})}
    const Root = provideRuntimeAndHost(f.runtime, host, SparkAiDataEntry, true)
    registerAllRenderers()
    const wrapper = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
    wrappers.push(wrapper)
    await flushPromises()

    expect(wrapper.find('textarea').attributes()).toHaveProperty('disabled')
  })

  it('edits only businessPrompt through the standard input DataView and never exposes Agent/system/schema props', async () => {
    const f = await createTarget()
    const controller = new AbortController()
    const host: HostCapability = {openSession: () => ({session: f.session, signal: controller.signal, detach: vi.fn()})}
    const Root = provideRuntimeAndHost(f.runtime, host, SparkAiDataEntry)
    registerAllRenderers()
    const wrapper = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
    wrappers.push(wrapper)
    await flushPromises()

    const input = wrapper.find('textarea')
    expect(input.exists()).toBe(true)
    await input.setValue('按当前模型新增条目')
    const inputRow = f.session.input.currentRow
    if (inputRow === null) throw new Error('businessPrompt input row is missing')
    const inputId = f.session.input.getPkKey(inputRow)
    expect(f.session.input.getEditingRow(inputId)?.['businessPrompt']).toBe('按当前模型新增条目')
    expect(f.session.input.hasEditingChanges()).toBe(true)
    expect(input.attributes()).not.toHaveProperty('disabled')
    const startButton = wrapper.findAll('button').find(button => button.text().includes('开始生成'))
    if (!startButton) throw new Error('start action is missing')
    expect(startButton.attributes('disabled')).toBeUndefined()
    await startButton.trigger('click')
    await flushPromises()
    expect(f.session.start).toHaveBeenCalledOnce()
    const renderer = wrapper.findComponent(SparkAiDataEntry)
    expect(renderer.props()).not.toHaveProperty('agentId')
    expect(renderer.props()).not.toHaveProperty('systemPrompt')
    expect(renderer.props()).not.toHaveProperty('schema')
  })

  it('does not dispose its pending session on component detach and reuses it on reattach without another create', async () => {
    const f = await createTarget()
    const controller = new AbortController()
    const detach = vi.fn()
    const attachment: Attachment = {session: f.session, signal: controller.signal, detach}
    const host: HostCapability = {openSession: vi.fn(() => attachment)}
    const Root = provideRuntimeAndHost(f.runtime, host, SparkAiDataEntry)
    registerAllRenderers()
    const first = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
    wrappers.push(first)
    await flushPromises()
    f.session.input.updateEditingValue('input', 'businessPrompt', '保持用户输入')
    expect(f.session.pending).toBe(true)
    first.unmount()
    expect(detach).toHaveBeenCalledOnce()
    expect(f.session.dispose).not.toHaveBeenCalled()
    expect(f.dataSet.getTable('AiDataEntryInput')).toBeDefined()
    expect(f.dataSet.getTable('AiDataEntryCandidates')).toBeDefined()
    expect(f.session.input.getEditingRow('input')?.['businessPrompt']).toBe('保持用户输入')

    const second = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
    wrappers.push(second)
    await flushPromises()
    expect(host.openSession).toHaveBeenCalledTimes(2)
    expect(second.findComponent(RendererForm).props('dataViewKey')).toContain('@AiDataEntryInput@')
    expect(f.session.input.getEditingRow('input')?.['businessPrompt']).toBe('保持用户输入')
  })

  it('pauses real owner refresh hints after query error across detach and reattach until an explicit query', async () => {
    const f = await createTarget({autoRefresh: true})
    vi.useFakeTimers()
    try {
      f.sessionState.failNextRefresh = true
      const controller = new AbortController()
      const detach = vi.fn()
      const host: HostCapability = {openSession: vi.fn(() => ({session: f.session, signal: controller.signal, detach}))}
      const Root = provideRuntimeAndHost(f.runtime, host, SparkAiDataEntry)
      registerAllRenderers()
      const wrapper = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
      wrappers.push(wrapper)
      await flushPromises()
      await vi.advanceTimersByTimeAsync(10_000)
      await flushPromises()
      expect(f.session.refresh).toHaveBeenCalledTimes(1)
      expect(f.session.shouldAutoRefresh).toBe(true)
      await vi.advanceTimersByTimeAsync(10_000)
      expect.soft(f.session.refresh).toHaveBeenCalledTimes(1)

      wrapper.unmount()
      expect(detach).toHaveBeenCalledOnce()
      expect(f.listeners.size).toBe(0)
      const nextController = new AbortController()
      vi.mocked(host.openSession).mockReturnValue({session: f.session, signal: nextController.signal, detach: vi.fn()})
      const remounted = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
      wrappers.push(remounted)
      await flushPromises()
      await vi.advanceTimersByTimeAsync(20_000)
      expect.soft(f.session.refresh).toHaveBeenCalledTimes(1)
      expect.soft(remounted.text()).toContain('status query failed')

      const queryButton = remounted.findAll('button').find(button => /刷新|查询/.test(button.text()))
      if (!queryButton) throw new Error('manual status query button is missing')
      await queryButton.trigger('click')
      await flushPromises()
      expect.soft(f.session.refresh).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(10_000)
      expect.soft(f.session.refresh).toHaveBeenCalledTimes(3)
    } finally {vi.useRealTimers()}
  })

  it('shows a real session error after automatic refresh fails', async () => {
    const f = await createTarget({autoRefresh: true})
    vi.useFakeTimers()
    try {
      f.sessionState.failNextRefresh = true
      const host: HostCapability = {openSession: () => ({session: f.session, signal: new AbortController().signal, detach: vi.fn()})}
      const Root = provideRuntimeAndHost(f.runtime, host, SparkAiDataEntry)
      registerAllRenderers()
      const wrapper = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
      wrappers.push(wrapper)
      await flushPromises()
      await vi.advanceTimersByTimeAsync(10_000)
      await flushPromises()

      expect(f.session.error).toBe('status query failed')
      expect(wrapper.text()).toContain('status query failed')
    } finally {vi.useRealTimers()}
  })

  it('requires a complete scoped key even when PAGE_RUNTIME has a main scenario', async () => {
    const f = await createTarget()
    const host: HostCapability = {openSession: vi.fn(() => ({session: f.session, signal: new AbortController().signal, detach: vi.fn()}))}
    const Root = defineComponent({setup() {
      const {sparkProvide} = useSparkComponent({type: 'ai-entry-local-key-fixture'})
      sparkProvide(PAGE_RUNTIME, f.runtime)
      sparkProvide(AI_DATA_ENTRY_HOST, host)
      return () => h(SparkAiDataEntry, {dataViewKey: 'Items@default', title: '局部键', disabled: false})
    }})
    registerAllRenderers()
    const wrapper = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
    wrappers.push(wrapper)
    await flushPromises()

    expect(host.openSession).not.toHaveBeenCalled()
    expect(wrapper.text()).toMatch(/完整|数据空间|绑定/i)
  })

  it('switches a mounted key and ignores a delayed result from the previous target', async () => {
    const f = await createTarget({autoRefresh: true})
    const alternate = f.dataSet.getView('Rows', 'alternate')
    if (alternate === undefined) throw new Error('alternate target DataView fixture is missing')
    const key = ref('AI-ENTRY-SPACE@Items@default')
    let releaseQuery: (() => void) | undefined
    const oldRefresh = vi.fn(() => new Promise<void>((_resolve, reject) => {
      releaseQuery = () => reject(new Error('stale old target result'))
    }))
    const oldSession: SessionSurface = {...f.session, get canRefresh() {return true}, refresh: oldRefresh}
    const alternateSession: SessionSurface = {...f.session, targetView: alternate}
    const detachOld = vi.fn()
    const host: HostCapability = {openSession: vi.fn((target: DataView) => target === f.targetView
      ? {session: oldSession, signal: new AbortController().signal, detach: detachOld}
      : {session: alternateSession, signal: new AbortController().signal, detach: vi.fn()})}
    const Root = defineComponent({setup() {
      const {sparkProvide} = useSparkComponent({type: 'ai-entry-changing-key-fixture'})
      sparkProvide(PAGE_RUNTIME, f.runtime)
      sparkProvide(AI_DATA_ENTRY_HOST, host)
      return () => h(SparkAiDataEntry, {dataViewKey: key.value, title: '切换目标', disabled: false})
    }})
    registerAllRenderers()
    const wrapper = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
    wrappers.push(wrapper)
    await flushPromises()
    const queryButton = wrapper.findAll('button').find(button => button.text().includes('刷新查询'))
    if (!queryButton) throw new Error('manual query action is missing')
    await queryButton.trigger('click')
    await flushPromises()
    expect(oldRefresh).toHaveBeenCalledOnce()

    key.value = 'AI-ENTRY-SPACE@Items@alternate'
    await flushPromises()
    expect.soft(host.openSession).toHaveBeenCalledTimes(2)
    expect.soft(host.openSession).toHaveBeenLastCalledWith(alternate)
    expect.soft(detachOld).toHaveBeenCalledOnce()
    expect.soft(wrapper.findComponent(RendererTable).props('dataViewKey')).toContain('@AiDataEntryCandidates@')
    releaseQuery?.()
    await flushPromises()
    expect(wrapper.text()).not.toContain('stale old target result')
    expect(wrapper.text()).not.toContain('AI录入目标DataView不属于当前宿主DataSet')
  })

  it('uses standard turn/table toolbar bindings and locks business prompt when workspace is blocked', async () => {
    const f = await createTarget({blocksWorkspace: true})
    const host: HostCapability = {openSession: () => ({session: f.session, signal: new AbortController().signal, detach: vi.fn()})}
    const Root = provideRuntimeAndHost(f.runtime, host, SparkAiDataEntry)
    registerAllRenderers()
    const wrapper = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
    wrappers.push(wrapper)
    await flushPromises()

    const table = wrapper.findComponent(RendererTable)
    expect.soft(table.props('toolbar')).toMatchObject({
      dataViewKey: expect.stringContaining('@AiDataEntryCandidates@'),
      children: expect.arrayContaining([
        expect.objectContaining({props: expect.objectContaining({label: '开始生成', dataViewKey: expect.stringContaining('@AiDataEntryInput@')})}),
        expect.objectContaining({props: expect.objectContaining({label: '停止生成', dataViewKey: expect.stringContaining('@AiEntryTurnFixture@')})}),
      ]),
    })
    expect.soft(wrapper.findAllComponents(RendererForm).some(form => String(form.props('dataViewKey')).includes('@AiEntryTurnFixture@'))).toBe(true)
    expect.soft(wrapper.findAllComponents(FieldText).some(field => field.props('readonly') === true)).toBe(true)
    expect.soft(wrapper.find('textarea').attributes()).toHaveProperty('disabled')
  })

  it('detaches an accepted lease when its derived session-view binding fails and can retry cleanly', async () => {
    const f = await createTarget()
    const foreignDataSet = DataSet.fromJson({scenarioId: 'FOREIGN-SPACE', tables: {Prompt: {
      columns: [{name: 'inputKey', type: 'string', isPrimaryKey: true}, {name: 'businessPrompt', type: 'string'}],
      views: {default: {commitMode: 'staged'}},
    }}})
    dataSets.push(foreignDataSet)
    const foreignInput = foreignDataSet.getView('Prompt', 'default')
    if (foreignInput === undefined) throw new Error('foreign prompt view fixture is missing')
    const firstDetach = vi.fn()
    const host: HostCapability = {openSession: vi.fn()
      .mockReturnValueOnce({session: {...f.session, input: foreignInput}, signal: new AbortController().signal, detach: firstDetach})
      .mockReturnValue({session: f.session, signal: new AbortController().signal, detach: vi.fn()})}
    const Root = provideRuntimeAndHost(f.runtime, host, SparkAiDataEntry)
    registerAllRenderers()
    const first = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
    wrappers.push(first)
    await flushPromises()

    expect.soft(firstDetach).toHaveBeenCalledOnce()
    expect.soft(first.findComponent(RendererForm).exists()).toBe(false)
    first.unmount()
    const retry = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
    wrappers.push(retry)
    await flushPromises()
    expect(host.openSession).toHaveBeenCalledTimes(2)
    expect(retry.findComponent(RendererForm).exists()).toBe(true)
  })

  it('clears polling on abort and unmount without overlapping an in-flight refresh', async () => {
    const f = await createTarget({autoRefresh: true})
    vi.useFakeTimers()
    let releaseRefresh: (() => void) | undefined
    let activeRefreshes = 0
    let maximumActiveRefreshes = 0
    vi.mocked(f.session.refresh).mockImplementation(() => new Promise<void>(resolve => {
      activeRefreshes++
      maximumActiveRefreshes = Math.max(maximumActiveRefreshes, activeRefreshes)
      releaseRefresh = () => {activeRefreshes--; resolve()}
    }))
    const firstController = new AbortController()
    const firstDetach = vi.fn()
    const firstAttachment: Attachment = {session: f.session, signal: firstController.signal, detach: () => {firstDetach(); firstController.abort()}}
    let attachmentIndex = 0
    const host: HostCapability = {openSession: vi.fn(() => {
      attachmentIndex++
      return attachmentIndex === 1
        ? firstAttachment
        : {session: f.session, signal: new AbortController().signal, detach: vi.fn()}
    })}
    const Root = provideRuntimeAndHost(f.runtime, host, SparkAiDataEntry)
    registerAllRenderers()
    try {
      const first = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
      wrappers.push(first)
      await flushPromises()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(f.session.refresh).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(30_000)
      expect(f.session.refresh).toHaveBeenCalledTimes(1)

      firstAttachment.detach()
      await vi.advanceTimersByTimeAsync(20_000)
      expect(f.session.refresh).toHaveBeenCalledTimes(1)
      expect(f.listeners.size).toBe(0)
      first.unmount()
      expect(firstDetach).toHaveBeenCalledOnce()
      releaseRefresh?.()
      await flushPromises()

      const second = mount(Root, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false}}})
      wrappers.push(second)
      await flushPromises()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(f.session.refresh).toHaveBeenCalledTimes(2)
      second.unmount()
      await vi.advanceTimersByTimeAsync(20_000)
      expect(f.session.refresh).toHaveBeenCalledTimes(2)
      expect(maximumActiveRefreshes).toBe(1)
    } finally {
      releaseRefresh?.()
      vi.useRealTimers()
    }
  })
})
