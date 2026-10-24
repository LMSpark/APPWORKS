import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent, h, ref, type Ref} from 'vue'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererButton, RendererForm, RendererTable} from '@spark-appworks/spark-component'
import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {lowcodeHttp} from '@/lowcode/lowcode-runtime'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'
import DictionaryDesign from '@/views/features/data-platform/structured-config/data-dictionary/ui/dictionary-setting.vue'
import DictionaryData from '@/views/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-page.vue'
import {DictionaryHttp, applicationOptionsFixture, fixture} from '../../../../packages/spark-lowcode-api/src/platform/resources/dictionary/tests/dictionary-workspace.fixture'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'

vi.mock('@/lowcode/lowcode-runtime', () => ({lowcodeApi: {readRequestScope: () => ({token: 'TEST-SCOPE', headers: {'X-AppId': 'APP'}})}, lowcodeHttp: {}}))
const originalStubs = {...config.global.stubs}
const sets: DataSet[] = [], wrappers: VueWrapper[] = []
const hosts = new WeakMap<VueWrapper, {dynamic: ReturnType<typeof createDynamicRouter>; designId: Ref<string>; dataId: Ref<string | undefined>}>()
let http: DictionaryHttp
beforeEach(() => {
  http = new DictionaryHttp()
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  vi.spyOn(LowcodeDictionary, 'loadEditor').mockImplementation(async () => {
    const {dataSet} = fixture(http, false, LowcodeDictionary.editorScenarioId)
    sets.push(dataSet)
    return {dataSet}
  })
  vi.spyOn(LowcodeDictionary, 'loadApplicationOptions').mockImplementation(async scenarioId => {
    const dataSet = await applicationOptionsFixture(http, scenarioId)
    sets.push(dataSet)
    return dataSet
  })
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  sets.splice(0).forEach(ds => ds.destroy())
  delete (lowcodeHttp as unknown as {request?: unknown}).request
  vi.restoreAllMocks(); vi.unstubAllGlobals(); config.global.stubs = originalStubs
})
async function open(kind: 'design' | 'data', create = false, dictionaryId: string | undefined = 'D1', applicationScenarioId = 'APPLICATION-CATALOG') {
  const designId = ref('D1')
  const dataId = ref(dictionaryId)
  const page = kind === 'design' ? defineComponent({setup: () => () => h(DictionaryDesign, {dictionaryId: designId.value,
      ...(create ? {applicationScenarioId} : {}), create})})
    : defineComponent({setup: () => () => h(DictionaryData, {dictionaryId: dataId.value})})
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: page, componentMap: {'/dictionary': page},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'dictionary', title: '字典', path: '/dictionary', itemKind: 'system-page', blueprintScenarioId: LowcodeDictionary.editorScenarioId},
    ]})})
  await dynamic.registerRoutes()
  await router.push('/dictionary'); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper)
  hosts.set(wrapper, {dynamic, designId, dataId})
  await flushPromises()
  return wrapper
}
function button(wrapper: VueWrapper, label: string) {
  const item = wrapper.findAll('button').find(node => node.text() === label)
  if (!item) throw new Error(`按钮不存在: ${label}\n${wrapper.text()}`)
  return item
}
function field(wrapper: VueWrapper, label: string) {
  const item = wrapper.findComponent(RendererForm).findAll('.el-form-item').find(node => node.find('label').text() === label)
  if (!item) throw new Error(`字段不存在: ${label}\n${wrapper.text()}`)
  return item
}
async function fillAiRequirements(wrapper: VueWrapper): Promise<void> {
  const form = wrapper.findAllComponents(RendererForm).find(item => String(item.props('dataViewKey')).includes('@DictionaryAiInput@'))
  if (!form) throw new Error('AI需求DataView表单未装配')
  await form.get('textarea').setValue('根据已保存字段生成候选条目')
}
async function selectEntry(wrapper: VueWrapper) {
  await wrapper.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
  await flushPromises()
}

function holdResponse(owner: DictionaryHttp, url: string) {
  let release!: () => void, reject!: (error: Error) => void
  const waiting = new Promise<void>((resolve, fail) => {release = resolve; reject = fail})
  owner.afterResponse = async config => {
    if (config.url !== url) return
    delete owner.afterResponse
    await waiting
  }
  return {release, reject}
}

function secondDictionary(): DictionaryHttp {
  const next = new DictionaryHttp()
  Object.assign(next.records['_Base_DictType']![0]!, {rowid: 'D2', fiveValue: '新目标标题'})
  Object.assign(next.records['_Base_DictData']![0]!, {rowid: 'E2', typeid: 'D2', exVal_4: '新目标数据'})
  return next
}

class WorkflowAiHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  readonly responses: unknown[] = []
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const response = this.responses.shift()
    if (response === undefined) throw new Error(`Unexpected AI request ${config.method} ${config.url}`)
    const result = typeof response === 'function' ? await (response as () => Promise<unknown>)() : response
    return {data: {Code: 200, Result: result}, status: 200, statusText: 'OK', headers: {}}
  }
}

class ExplicitCancelRefusalHttp extends WorkflowAiHttp {
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    if (String(config.url).endsWith('/cancel')) {
      this.requests.push(config)
      return {data: {Code: 1004, Message: 'cancel explicitly refused'}, status: 200, statusText: 'OK', headers: {}}
    }
    return super.executeRequest(config)
  }
}

function bindWorkflowAiHttp(http: WorkflowAiHttp): void {
  (lowcodeHttp as unknown as {request: (config: RequestConfig) => Promise<HttpResponse<unknown>>}).request = config => http.request(config)
}

describe('Dictionary independent design and data pages', () => {
  it('shows dictionary heading with saved type name', async () => {
    const data = await open('data')
    expect(data.text()).toContain('当前方案：配色')
  })
  it('binds requirements and preview to their DataViews, confirms into entries, then uses original cancel/save', async () => {
    const aiHttp = new WorkflowAiHttp()
    bindWorkflowAiHttp(aiHttp)
    const agents = [{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}]
    const ack1 = {conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null}
    const turn1 = {id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
      assistantDraft: JSON.stringify([{val: 'AI-1', txt: '候选一', exVal_1: '一', exVal_2: '二', exVal_3: '三', exVal_4: '四'}]),
      errorCode: null, errorMessage: null}
    const ack2 = {conversationId: 'C2', turnId: 'T2', status: 'QUEUED', acceptedAt: null}
    const turn2 = {id: 'T2', conversationId: 'C2', agentId: 'agent-metadata-admin', status: 'COMPLETED',
      assistantDraft: JSON.stringify([{val: 'AI-2', txt: '候选二', exVal_1: null, exVal_2: null, exVal_3: null, exVal_4: null}]),
      errorCode: null, errorMessage: null}
    aiHttp.responses.push(agents, ack1, turn1, agents, ack2, turn2)
    const data = await open('data')
    await selectEntry(data)
    await field(data, '说明').get('input').setValue('只留在原条目覆盖')
    await button(data, 'AI 候选').trigger('click')
    const dataSet = sets[0]!
    const inputForm = data.findAllComponents(RendererForm).find(form => form.props('dataViewKey') === `${dataSet.scenarioId}@DictionaryAiInput@default`)
    const preview = data.findAllComponents(RendererTable).find(table => table.props('dataViewKey') === `${dataSet.scenarioId}@DictionaryAiCandidates@default`)
    expect(inputForm).toBeDefined()
    expect(preview).toBeDefined()
    await inputForm!.get('textarea').setValue('保留六字段和已有扩展值')

    const entries = dataSet.getView('_Base_DictData', 'default')!
    await button(data, '生成候选').trigger('click')
    await flushPromises()
    expect(entries.dirtyTracking.pendingCreateIds.size).toBe(0)
    expect(entries.getEditingRow('E1')?.['exVal_4']).toBe('只留在原条目覆盖')
    expect(dataSet.getView('DictionaryAiCandidates', 'default')?.rows).toMatchObject([{val: 'AI-1', exVal_4: '四'}])
    expect(button(data, '放弃候选').attributes('disabled')).toBeUndefined()
    await button(data, '确认加入草稿').trigger('click')
    await flushPromises()
    expect(entries.dirtyTracking.pendingCreateIds.size).toBe(1)
    expect(entries.getEditingRow('E1')?.['exVal_4']).toBe('只留在原条目覆盖')
    expect(http.saves).toHaveLength(0)

    await button(data, '取消数据修改并重读').trigger('click')
    await flushPromises()
    expect(entries.dirtyTracking.pendingCreateIds.size).toBe(0)
    expect(entries.rows).toHaveLength(1)
    expect(entries.rows[0]?.['exVal_4']).toBeNull()
    expect(http.saves).toHaveLength(0)

    const inputAgain = data.findAllComponents(RendererForm).find(form => form.props('dataViewKey') === `${dataSet.scenarioId}@DictionaryAiInput@default`)
    await inputAgain!.get('textarea').setValue('重新生成后确认')
    await button(data, '生成候选').trigger('click')
    await flushPromises()
    await button(data, '确认加入草稿').trigger('click')
    await flushPromises()
    await button(data, '保存数据').trigger('click')
    await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData'}])
    expect(http.records['_Base_DictData']).toHaveLength(2)
    expect(http.records['_Base_DictData']?.find(row => row['val'] === 'AI-2')).toMatchObject({
      typeid: 'D1', val: 'AI-2', txt: '候选二', exVal_1: null, exVal_2: null, exVal_3: null, exVal_4: null,
    })
  })
  it('queries a tool-waiting turn after cancel ACK and shows the terminal status without manual refresh', async () => {
    const aiHttp = new WorkflowAiHttp()
    bindWorkflowAiHttp(aiHttp)
    aiHttp.responses.push(
      [{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}],
      {conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null},
      {id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'WAITING_CLIENT_TOOL',
        assistantDraft: null, errorCode: null, errorMessage: null},
    )
    const data = await open('data')
    await button(data, 'AI 候选').trigger('click')
    await fillAiRequirements(data)
    await button(data, '生成候选').trigger('click')
    await flushPromises()
    expect(data.text()).toContain('当前轮次等待审批或客户端工具')
    expect(button(data, '放弃候选').attributes('disabled')).toBeDefined()
    aiHttp.responses.push(true, {id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'CANCELLED',
      assistantDraft: null, errorCode: null, errorMessage: null})
    await button(data, '停止生成').trigger('click')
    await flushPromises()
    expect(aiHttp.requests.filter(request => request.method === 'GET' && String(request.url) === '/api/ai/v1/turns/T1')).toHaveLength(2)
    expect(data.text()).toContain('轮次状态：CANCELLED')
    expect(button(data, '停止生成').attributes('disabled')).toBeDefined()
  })
  it.each(['WAITING_CLIENT_TOOL', 'RUNNING'])('pauses automatic reads after %s cancellation ACK has a failed status GET, then resumes on manual query', async status => {
    vi.useFakeTimers()
    const aiHttp = new WorkflowAiHttp()
    try {
      bindWorkflowAiHttp(aiHttp)
      aiHttp.responses.push(
        [{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}],
        {conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null},
        {id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status,
          assistantDraft: null, errorCode: null, errorMessage: null},
        true,
        async () => {throw new Error('post-cancel status query failed')},
      )
      const data = await open('data')
      await button(data, 'AI 候选').trigger('click')
      await fillAiRequirements(data)
      await button(data, '生成候选').trigger('click')
      await flushPromises()
      const turnReads = () => aiHttp.requests.filter(request => request.method === 'GET' && String(request.url) === '/api/ai/v1/turns/T1')
      expect(turnReads()).toHaveLength(1)

      await button(data, '停止生成').trigger('click')
      await flushPromises()
      expect(turnReads()).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(5000)
      await flushPromises()
      expect(turnReads()).toHaveLength(2)

      aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'RUNNING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await button(data, '查询结果').trigger('click')
      await flushPromises()
      expect(turnReads()).toHaveLength(3)
      aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[]', errorCode: null, errorMessage: null})
      await vi.advanceTimersByTimeAsync(1500)
      await flushPromises()
      expect(turnReads()).toHaveLength(4)
      expect(data.text()).toContain('轮次状态：COMPLETED')
    } finally {vi.useRealTimers()}
  })
  it('resumes polling when stopping after a prior read failure yields a fresh nonterminal GET', async () => {
    vi.useFakeTimers()
    const aiHttp = new WorkflowAiHttp()
    try {
      bindWorkflowAiHttp(aiHttp)
      aiHttp.responses.push(
        [{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}],
        {conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null},
        {id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'RUNNING',
          assistantDraft: null, errorCode: null, errorMessage: null},
        async () => {throw new Error('automatic status query failed')},
      )
      const data = await open('data')
      await button(data, 'AI 候选').trigger('click')
      await fillAiRequirements(data)
      await button(data, '生成候选').trigger('click')
      await flushPromises()
      const turnReads = () => aiHttp.requests.filter(request => request.method === 'GET' && String(request.url) === '/api/ai/v1/turns/T1')
      await vi.advanceTimersByTimeAsync(1500)
      await flushPromises()
      expect(turnReads()).toHaveLength(2)
      expect(data.text()).toContain('待核验')

      aiHttp.responses.push(true, {id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'RUNNING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await button(data, '停止生成').trigger('click')
      await flushPromises()
      expect(turnReads()).toHaveLength(3)
      aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[]', errorCode: null, errorMessage: null})
      await vi.advanceTimersByTimeAsync(1500)
      await flushPromises()
      expect(turnReads()).toHaveLength(4)
      expect(data.text()).toContain('轮次状态：COMPLETED')
    } finally {vi.useRealTimers()}
  })
  it('does not automatically verify an unknown cancel when the stop action throws', async () => {
    vi.useFakeTimers()
    const aiHttp = new WorkflowAiHttp()
    try {
      bindWorkflowAiHttp(aiHttp)
      aiHttp.responses.push(
        [{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}],
        {conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null},
        {id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'RUNNING',
          assistantDraft: null, errorCode: null, errorMessage: null},
        async () => {throw new Error('cancel ACK lost')},
      )
      const data = await open('data')
      await button(data, 'AI 候选').trigger('click')
      await fillAiRequirements(data)
      await button(data, '生成候选').trigger('click')
      await flushPromises()
      const turnReads = () => aiHttp.requests.filter(request => request.method === 'GET' && String(request.url) === '/api/ai/v1/turns/T1')
      expect(turnReads()).toHaveLength(1)
      await button(data, '停止生成').trigger('click')
      await flushPromises()
      const cancelPosts = () => aiHttp.requests.filter(request => request.method === 'POST' && String(request.url).endsWith('/cancel'))
      expect(cancelPosts()).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(5000)
      await flushPromises()
      expect(turnReads()).toHaveLength(1)
      expect(cancelPosts()).toHaveLength(1)
    } finally {vi.useRealTimers()}
  })
  it('keeps polling a known RUNNING turn when cancel returns an explicit business refusal', async () => {
    vi.useFakeTimers()
    const aiHttp = new ExplicitCancelRefusalHttp()
    try {
      bindWorkflowAiHttp(aiHttp)
      aiHttp.responses.push(
        [{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}],
        {conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null},
        {id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'RUNNING',
          assistantDraft: null, errorCode: null, errorMessage: null},
        {id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'RUNNING',
          assistantDraft: null, errorCode: null, errorMessage: null},
        {id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
          assistantDraft: '[]', errorCode: null, errorMessage: null},
      )
      const data = await open('data')
      await button(data, 'AI 候选').trigger('click')
      await fillAiRequirements(data)
      await button(data, '生成候选').trigger('click')
      await flushPromises()
      const turnReads = () => aiHttp.requests.filter(request => request.method === 'GET' && String(request.url) === '/api/ai/v1/turns/T1')
      const cancelPosts = () => aiHttp.requests.filter(request => request.method === 'POST' && String(request.url).endsWith('/cancel'))
      expect(turnReads()).toHaveLength(1)

      await button(data, '停止生成').trigger('click')
      await flushPromises()
      expect(cancelPosts()).toHaveLength(1)
      expect(sets[0]!.getView('AiTurnCancel', 'default')!.hasUnconfirmedSave).toBe(false)
      await vi.advanceTimersByTimeAsync(1500)
      await flushPromises()
      expect(turnReads()).toHaveLength(2)
      expect(cancelPosts()).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1500)
      await flushPromises()
      expect(turnReads()).toHaveLength(3)
      expect(data.text()).toContain('轮次状态：COMPLETED')
      expect(cancelPosts()).toHaveLength(1)
    } finally {vi.useRealTimers()}
  })
  it('auto-refreshes QUEUED/RUNNING AI turns every 1500ms serially and clears the timer at terminal state', async () => {
    vi.useFakeTimers()
    const aiHttp = new WorkflowAiHttp()
    try {
      bindWorkflowAiHttp(aiHttp)
      aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'RUNNING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      let releaseRunning!: (value: unknown) => void
      aiHttp.responses.push(() => new Promise(resolve => { releaseRunning = resolve }))
      aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[]', errorCode: null, errorMessage: null})
      const data = await open('data')
      await button(data, 'AI 候选').trigger('click')
      await fillAiRequirements(data)
      const dataSet = sets[0]!
      const inputViewKey = `${dataSet.scenarioId}@DictionaryAiInput@default`
      const turnViewKey = `${dataSet.scenarioId}@AiTurnStatus@default`
      const candidatesViewKey = `${dataSet.scenarioId}@DictionaryAiCandidates@default`
      expect(data.findAllComponents(RendererForm).some(form => form.props('dataViewKey') === inputViewKey)).toBe(true)
      expect(data.findAllComponents(RendererForm).some(form => form.props('dataViewKey') === turnViewKey)).toBe(true)
      expect(data.findAllComponents(RendererTable).some(table => table.props('dataViewKey') === candidatesViewKey)).toBe(true)
      await button(data, '生成候选').trigger('click')
      await flushPromises()
      const turnReads = () => aiHttp.requests.filter(request => request.method === 'GET' && String(request.url) === '/api/ai/v1/turns/T1')
      expect(turnReads()).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(1499)
      expect(turnReads()).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1)
      await Promise.resolve()
      expect(turnReads()).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(3000)
      expect(turnReads()).toHaveLength(2)

      releaseRunning({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'RUNNING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await flushPromises()
      await vi.advanceTimersByTimeAsync(1500)
      await flushPromises()
      expect(turnReads()).toHaveLength(3)
      await vi.advanceTimersByTimeAsync(3000)
      expect(turnReads()).toHaveLength(3)
    } finally {
      vi.useRealTimers()
    }
  })
  it.each(['target-switch', 'unmount'])('disposes the AI owner and clears its poll timer on %s', async action => {
    vi.useFakeTimers()
    const aiHttp = new WorkflowAiHttp()
    try {
      bindWorkflowAiHttp(aiHttp)
      aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'RUNNING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      const data = await open('data')
      await button(data, 'AI 候选').trigger('click')
      await fillAiRequirements(data)
      await button(data, '生成候选').trigger('click')
      await flushPromises()
      const oldDataSet = sets[0]!
      const turnReads = () => aiHttp.requests.filter(request => request.method === 'GET' && String(request.url) === '/api/ai/v1/turns/T1')
      expect(turnReads()).toHaveLength(1)

      if (action === 'target-switch') {
        http = secondDictionary()
        hosts.get(data)!.dataId.value = 'D2'
        await flushPromises()
      } else data.unmount()
      expect(oldDataSet.destroyed).toBe(true)
      await vi.advanceTimersByTimeAsync(10000)
      expect(turnReads()).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
  it('does not let an old in-flight poll pause a newly selected dictionary AI owner', async () => {
    vi.useFakeTimers()
    const aiHttp = new WorkflowAiHttp()
    let releaseOld!: (value: unknown) => void
    try {
      bindWorkflowAiHttp(aiHttp)
      aiHttp.responses.push(
        [{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}],
        {conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null},
        {id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'RUNNING',
          assistantDraft: null, errorCode: null, errorMessage: null},
        () => new Promise(resolve => {releaseOld = resolve}),
      )
      const data = await open('data')
      await button(data, 'AI 候选').trigger('click')
      await fillAiRequirements(data)
      await button(data, '生成候选').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(1500)
      await Promise.resolve()
      const t1Reads = () => aiHttp.requests.filter(request => String(request.url) === '/api/ai/v1/turns/T1')
      expect(t1Reads()).toHaveLength(2)

      http = secondDictionary()
      hosts.get(data)!.dataId.value = 'D2'
      await flushPromises()
      await button(data, 'AI 候选').trigger('click')
      await fillAiRequirements(data)
      aiHttp.responses.push(
        [{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}],
        {conversationId: 'C2', turnId: 'T2', status: 'QUEUED', acceptedAt: null},
        {id: 'T2', conversationId: 'C2', agentId: 'agent-metadata-admin', status: 'RUNNING',
          assistantDraft: null, errorCode: null, errorMessage: null},
        {id: 'T2', conversationId: 'C2', agentId: 'agent-metadata-admin', status: 'COMPLETED',
          assistantDraft: '[]', errorCode: null, errorMessage: null},
      )
      await button(data, '生成候选').trigger('click')
      await flushPromises()
      const t2Reads = () => aiHttp.requests.filter(request => String(request.url) === '/api/ai/v1/turns/T2')
      expect(t2Reads()).toHaveLength(1)

      releaseOld({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'FAILED',
        assistantDraft: null, errorCode: null, errorMessage: null})
      await flushPromises()
      expect(data.text()).not.toContain('AI轮次请求结果未知')
      await vi.advanceTimersByTimeAsync(1500)
      await flushPromises()
      expect(t2Reads()).toHaveLength(2)
    } finally { vi.useRealTimers() }
  })
  it('pauses automatic refresh on the first read error and resumes after manual retry', async () => {
    vi.useFakeTimers()
    const aiHttp = new WorkflowAiHttp()
    try {
      bindWorkflowAiHttp(aiHttp)
      aiHttp.responses.push([{id: 'agent-metadata-admin', agentName: '元数据管理', description: '字典候选'}])
      aiHttp.responses.push({conversationId: 'C1', turnId: 'T1', status: 'QUEUED', acceptedAt: null})
      aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'QUEUED',
        assistantDraft: null, errorCode: null, errorMessage: null})
      aiHttp.responses.push(async () => { throw new Error('temporary status read failure') })
      aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'RUNNING',
        assistantDraft: null, errorCode: null, errorMessage: null})
      aiHttp.responses.push({id: 'T1', conversationId: 'C1', agentId: 'agent-metadata-admin', status: 'COMPLETED',
        assistantDraft: '[]', errorCode: null, errorMessage: null})
      const data = await open('data')
      await button(data, 'AI 候选').trigger('click')
      await fillAiRequirements(data)
      await button(data, '生成候选').trigger('click')
      await flushPromises()
      const turnReads = () => aiHttp.requests.filter(request => request.method === 'GET' && String(request.url) === '/api/ai/v1/turns/T1')
      expect(turnReads()).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(1500)
      await flushPromises()
      expect(turnReads()).toHaveLength(2)
      expect(data.text()).toContain('待核验')
      const {dynamic} = hosts.get(data)!
      const instance = dynamic.getSystemPageInstance(data.vm.$router.currentRoute.value)!
      expect(instance.isDirty).toBe(true)
      expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')
      expect(button(data, '生成候选').attributes('disabled')).toBeDefined()
      expect(button(data, '查询结果').attributes('disabled')).toBeUndefined()
      expect(button(data, '停止生成').attributes('disabled')).toBeUndefined()
      await vi.advanceTimersByTimeAsync(5000)
      expect(turnReads()).toHaveLength(2)

      await button(data, '查询结果').trigger('click')
      await flushPromises()
      expect(turnReads()).toHaveLength(3)
      await vi.advanceTimersByTimeAsync(1500)
      await flushPromises()
      expect(turnReads()).toHaveLength(4)
      await vi.advanceTimersByTimeAsync(3000)
      expect(turnReads()).toHaveLength(4)
    } finally {
      vi.useRealTimers()
    }
  })
  it.each(['target-switch', 'unmount'])('ignores a late formal query after %s and does not start further reads for it', async action => {
    const previous = http
    const gate = holdResponse(previous, '/api/DataOperation/GetData')
    const data = await open('data')
    expect(previous.reads).toHaveLength(1)
    const stale = sets[0]!
    if (action === 'target-switch') {
      http = secondDictionary()
      hosts.get(data)!.dataId.value = 'D2'; await flushPromises()
      expect(data.findComponent(RendererTable).text()).toContain('新目标数据')
    } else data.unmount()
    gate.release(); await flushPromises()
    expect(stale.destroyed).toBe(true)
    expect(previous.reads).toHaveLength(1)
    expect(previous.saves).toHaveLength(0)
    if (action === 'target-switch') {
      expect(data.findComponent(RendererTable).text()).toContain('新目标数据')
      expect(data.find('[role="alert"]').exists()).toBe(false)
    }
  })
  it('guards close and cancel while saving, then releases the dirty source only after confirmation and reread', async () => {
    const data = await open('data')
    await selectEntry(data)
    await field(data, '说明').get('input').setValue('在途保存')
    const gate = holdResponse(http, '/api/DataOperation/BatchTableOperateRequestByCRUD')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    const {dynamic} = hosts.get(data)!
    const instance = dynamic.getSystemPageInstance(data.vm.$router.currentRoute.value)!
    expect(instance.isDirty).toBe(true)
    expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')
    expect(() => dynamic.assertPageRuntimesClean()).toThrow('未保存')
    expect(button(data, '取消数据修改并重读').attributes('disabled')).toBeDefined()
    expect(data.find('form input:not([disabled]):not([readonly])').exists()).toBe(false)
    await button(data, '保存数据').trigger('click')
    expect(http.saves).toHaveLength(1)
    gate.release(); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(() => dynamic.assertPageRuntimesClean()).not.toThrow()
    expect(http.records['_Base_DictData']![0]!['exVal_4']).toBe('在途保存')
    expect(http.reads).toHaveLength(4)
    expect(http.saves).toHaveLength(1)
  })
  it('keeps a lost in-flight receipt guarded until reread without replaying the submission', async () => {
    const data = await open('data')
    await selectEntry(data)
    await field(data, '说明').get('input').setValue('已写但未知')
    const gate = holdResponse(http, '/api/DataOperation/BatchTableOperateRequestByCRUD')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    gate.reject(new Error('旧保存回执中断')); await flushPromises()
    const {dynamic} = hosts.get(data)!
    expect(() => dynamic.assertPageRuntimesClean()).toThrow('未保存')
    expect(button(data, '保存数据').attributes('disabled')).toBeDefined()
    await button(data, '核验原提交（保留本地修改）').trigger('click'); await flushPromises()
    expect(() => dynamic.assertPageRuntimesClean()).not.toThrow()
    expect(data.findComponent(RendererTable).text()).toContain('已写但未知')
    expect(http.saves).toHaveLength(1)
  })
  it('keeps the new design identity independent of an old pending save and its late error', async () => {
    const design = await open('design')
    const previous = http
    await field(design, '第五文本标题').get('input').setValue('旧定义提交')
    const gate = holdResponse(previous, '/api/DataOperation/BatchTableOperateRequestByCRUD')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    http = secondDictionary()
    hosts.get(design)!.designId.value = 'D2'; await flushPromises()
    const blockedByOldSave = button(design, '保存设计').attributes('disabled') !== undefined
    gate.reject(new Error('旧保存回执中断')); await flushPromises()
    expect.soft(blockedByOldSave).toBe(false)
    expect.soft(design.find('[role="alert"]').exists()).toBe(false)
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toBeUndefined()
    expect((field(design, '第五文本标题').get('input').element as HTMLInputElement).value).toBe('新目标标题')
    expect(previous.saves).toHaveLength(1)
    expect(http.saves).toHaveLength(0)
  })
  it.each(['success', 'failure'])('does not let an old save %s unlock or complete a newer save', async result => {
    const design = await open('design')
    const previous = http
    await field(design, '第五文本标题').get('input').setValue('旧定义提交')
    const oldGate = holdResponse(previous, '/api/DataOperation/BatchTableOperateRequestByCRUD')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    http = secondDictionary()
    hosts.get(design)!.designId.value = 'D2'; await flushPromises()
    await field(design, '第五文本标题').get('input').setValue('新定义提交')
    const newGate = holdResponse(http, '/api/DataOperation/BatchTableOperateRequestByCRUD')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    if (result === 'success') oldGate.release()
    else oldGate.reject(new Error('旧回执失败'))
    await flushPromises()
    expect(design.find('[role="alert"]').exists()).toBe(false)
    expect(button(design, '保存设计').attributes('disabled')).toBeDefined()
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toBeUndefined()
    expect(() => hosts.get(design)!.dynamic.assertPageRuntimesClean()).toThrow('未保存')
    newGate.release(); await flushPromises()
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toHaveLength(1)
    expect(() => hosts.get(design)!.dynamic.assertPageRuntimesClean()).not.toThrow()
    expect(previous.records['_Base_DictType']![0]!['fiveValue']).toBe('旧定义提交')
    expect(http.records['_Base_DictType']![0]!['fiveValue']).toBe('新定义提交')
    expect(previous.saves).toHaveLength(1)
    expect(http.saves).toHaveLength(1)
  })
  it('releases a force-unmounted saving page without publishing success or replaying the write', async () => {
    const design = await open('design')
    await field(design, '第五文本标题').get('input').setValue('卸载前提交')
    const gate = holdResponse(http, '/api/DataOperation/BatchTableOperateRequestByCRUD')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    const page = design.findComponent(DictionaryDesign), dataSet = sets[0]!
    design.unmount()
    gate.release(); await flushPromises()
    expect(dataSet.destroyed).toBe(true)
    expect(page.emitted('saved')).toBeUndefined()
    expect(http.saves).toHaveLength(1)
    expect(http.reads).toHaveLength(2)
    expect(http.records['_Base_DictType']![0]!['fiveValue']).toBe('卸载前提交')
  })
  it('ignores a superseded assembly and releases its DataSet after the new dictionary is ready', async () => {
    const previous = http
    const stale = fixture(previous, false, LowcodeDictionary.editorScenarioId).dataSet
    sets.push(stale)
    let release!: (value: {dataSet: DataSet}) => void
    vi.mocked(LowcodeDictionary.loadEditor).mockImplementationOnce(() => new Promise(resolve => {release = resolve}))
    const data = await open('data')
    expect(data.text()).toContain('正在读取字典数据')
    http = new DictionaryHttp()
    Object.assign(http.records['_Base_DictType']![0]!, {rowid: 'D2', fiveValue: '新目标标题'})
    Object.assign(http.records['_Base_DictData']![0]!, {rowid: 'E2', typeid: 'D2', exVal_4: '新目标数据'})
    hosts.get(data)!.dataId.value = 'D2'; await flushPromises()
    expect(data.findComponent(RendererTable).text()).toContain('新目标数据')
    release({dataSet: stale}); await flushPromises()
    expect(stale.destroyed).toBe(true)
    expect(data.findComponent(RendererTable).text()).toContain('新目标数据')
    expect(data.find('[role="alert"]').exists()).toBe(false)
    expect(previous.reads).toHaveLength(0)
    await selectEntry(data)
    await field(data, '新目标标题').get('input').setValue('当前目标提交')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(previous.saves).toHaveLength(0)
    expect(http.records['_Base_DictData']![0]).toMatchObject({rowid: 'E2', typeid: 'D2', exVal_4: '当前目标提交'})
  })
  it('destroys a late assembly after the data page unmounts without querying or saving it', async () => {
    const stale = fixture(http, false, LowcodeDictionary.editorScenarioId).dataSet
    sets.push(stale)
    let release!: (value: {dataSet: DataSet}) => void
    vi.mocked(LowcodeDictionary.loadEditor).mockImplementationOnce(() => new Promise(resolve => {release = resolve}))
    const data = await open('data')
    data.unmount()
    release({dataSet: stale}); await flushPromises()
    expect(stale.destroyed).toBe(true)
    expect(http.reads).toHaveLength(0)
    expect(http.saves).toHaveLength(0)
  })
  it.each(['', '   '])('rejects missing or blank resource identity before loading: %j', async dictionaryId => {
    const data = await open('data', false, dictionaryId)
    expect(data.get('[role="alert"]').text()).toContain('唯一字典')
    expect(LowcodeDictionary.loadEditor).not.toHaveBeenCalled()
    expect(http.reads).toHaveLength(0)
    expect(data.findComponent(RendererTable).exists()).toBe(false)
  })
  it('discards design changes without modifying either persistent model', async () => {
    const design = await open('design')
    await field(design, '第五文本标题').get('input').setValue('取消的标题')
    expect(button(design, '删除字典资源…').attributes('disabled')).toBeDefined()
    await button(design, '取消设计修改并重读').trigger('click'); await flushPromises()
    expect((field(design, '第五文本标题').get('input').element as HTMLInputElement).value).toBe('说明')
    expect(button(design, '删除字典资源…').attributes('disabled')).toBeUndefined()
    expect(http.saves).toHaveLength(0)
  })
  it('rebinds a clean target switch to the new identity and saves only its entries', async () => {
    const data = await open('data')
    const previous = http
    http = new DictionaryHttp()
    Object.assign(http.records['_Base_DictType']![0]!, {rowid: 'D2', fiveValue: '新目标标题'})
    Object.assign(http.records['_Base_DictData']![0]!, {rowid: 'E2', typeid: 'D2', exVal_4: '新目标数据'})
    hosts.get(data)!.dataId.value = 'D2'; await flushPromises()
    expect(data.findComponent(RendererTable).text()).toContain('新目标标题')
    expect(data.findComponent(RendererTable).text()).toContain('新目标数据')
    await selectEntry(data)
    await field(data, '新目标标题').get('input').setValue('目标二已修改')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(previous.saves).toHaveLength(0)
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {Changed: [{rowid: 'E2', exVal_4: '目标二已修改'}]}}])
    expect(http.records['_Base_DictType']![0]!['rowid']).toBe('D2')
  })
  it('saves design titles, reopens an independent data page, saves data and cancels a later edit through real components', async () => {
    const design = await open('design')
    expect(design.findComponent(RendererTable).exists()).toBe(false)
    await field(design, '第五文本标题').get('input').setValue('用途说明')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toHaveLength(1)
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictType'}])
    expect(http.saves[0]!.data).toHaveLength(1)
    design.unmount()
    const data = await open('data')
    expect(data.findComponent(RendererTable).text()).toContain('用途说明')
    expect(data.text()).not.toContain('保存设计')
    await selectEntry(data)
    await field(data, '用途说明').get('input').setValue('业务值')
    expect(data.findComponent(RendererTable).text()).toContain('业务值')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(2)
    expect(http.saves[1]!.data).toMatchObject([{TableName: '_Base_DictData'}])
    expect(http.saves[1]!.data).toHaveLength(1)
    data.unmount()
    const reopened = await open('data')
    expect(reopened.findComponent(RendererTable).text()).toContain('业务值')
    await selectEntry(reopened)
    await field(reopened, '用途说明').get('input').setValue('取消此值')
    await button(reopened, '取消数据修改并重读').trigger('click'); await flushPromises()
    expect(reopened.findComponent(RendererTable).text()).toContain('业务值')
    expect(reopened.text()).not.toContain('取消此值')
    expect(http.saves).toHaveLength(2)
  })
  it('persists the numeric order, reopens it and cancels a later change through the bound standard field', async () => {
    const data = await open('data')
    const query = http.reads.find(item => (item.data as {Table: {Name: string}[]}).Table[0]?.Name === '_Base_DictData')!
    expect(query.data).toMatchObject({Table: [{Fields: expect.arrayContaining([
      expect.objectContaining({Name: 'ordIdx', OrderType: 'ascending', Order: 2}),
      expect.objectContaining({Name: 'rowid', OrderType: 'ascending', Order: 1}),
    ])}]})
    await selectEntry(data)
    const number = field(data, '排序').get('input')
    expect(number.attributes('disabled')).toBeUndefined()
    await number.setValue('4'); await number.trigger('blur'); await flushPromises()
    expect((number.element as HTMLInputElement).value).toBe('4')
    expect(data.findComponent(RendererTable).get('.el-table__body .el-table__row').text()).toContain('4')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {Changed: [{rowid: 'E1', ordIdx: 4}]}}])
    expect(http.saves[0]!.data).toHaveLength(1)
    data.unmount()
    const reopened = await open('data')
    await selectEntry(reopened)
    expect((field(reopened, '排序').get('input').element as HTMLInputElement).value).toBe('4')
    await field(reopened, '排序').get('input').setValue('8'); await flushPromises()
    await button(reopened, '取消数据修改并重读').trigger('click'); await flushPromises()
    await selectEntry(reopened)
    expect((field(reopened, '排序').get('input').element as HTMLInputElement).value).toBe('4')
    expect(http.saves).toHaveLength(1)
  })
  it('preserves an explicit zero order on a new entry without submitting design configuration', async () => {
    const data = await open('data')
    await button(data, '新增条目').trigger('click'); await flushPromises()
    await field(data, '代码').get('input').setValue('new')
    await field(data, '名称').get('input').setValue('新条目')
    const number = field(data, '排序').get('input')
    expect(number.attributes('disabled')).toBeUndefined()
    await number.setValue('2'); await number.setValue('0'); await flushPromises()
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {Added: [{val: 'new', ordIdx: 0}]}}])
    expect(http.saves[0]!.data).toHaveLength(1)
    expect(http.records['_Base_DictData']!.find(row => row['val'] === 'new')?.['ordIdx']).toBe(0)
  })
  it('keeps denied ordering read only while allowing an unrelated entry field to save', async () => {
    http.denied = ['ordIdx']
    const data = await open('data')
    await selectEntry(data)
    expect(field(data, '排序').find('input:not([disabled]):not([readonly])').exists()).toBe(false)
    await field(data, '说明').get('input').setValue('独立修改')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {Changed: [{rowid: 'E1', exVal_4: '独立修改'}]}}])
    expect(http.records['_Base_DictData']![0]!['ordIdx']).toBe(1)
  })
  it('disables entry creation and protected fields according to the formal query result', async () => {
    http.allowAdd = false; http.denied = ['exVal_4']
    const data = await open('data')
    expect(button(data, '新增条目').attributes('disabled')).toBeDefined()
    await selectEntry(data)
    const protectedField = field(data, '说明')
    expect(protectedField.find('input:not([disabled]):not([readonly])').exists()).toBe(false)
    expect(http.saves).toHaveLength(0)
  })
  it('requires reread after a lost save receipt and does not repeat the write', async () => {
    const data = await open('data')
    await selectEntry(data)
    await field(data, '说明').get('input').setValue('回执中断的数据')
    http.failAfterWrite = true
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(data.get('[role="alert"]').text()).toBeTruthy()
    expect(button(data, '保存数据').attributes('disabled')).toBeDefined()
    await button(data, '核验原提交（保留本地修改）').trigger('click'); await flushPromises()
    expect(data.findComponent(RendererTable).text()).toContain('回执中断的数据')
    expect(button(data, '保存数据').attributes('disabled')).toBeUndefined()
    expect(http.saves).toHaveLength(1)
  })
  it('keeps a not-applied draft through verification and labels cancellation separately', async () => {
    const data = await open('data')
    await selectEntry(data)
    const note = field(data, '说明').get('input')
    await note.setValue('请求未到达的数据')
    http.failBeforeWrite = true
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(button(data, '核验原提交（保留本地修改）').exists()).toBe(true)
    http.failBeforeWrite = false

    await button(data, '核验原提交（保留本地修改）').trigger('click'); await flushPromises()

    expect(data.get('[role="alert"]').text()).toContain('原提交未生效')
    expect(data.text()).toContain('请求未到达的数据')
    expect(button(data, '取消数据修改并重读').exists()).toBe(true)
    expect(data.findAll('button').some(node => node.text() === '核验原提交（保留本地修改）')).toBe(false)
    expect(http.saves).toHaveLength(1)

    await button(data, '取消数据修改并重读').trigger('click'); await flushPromises()

    expect(data.findComponent(RendererTable).text()).not.toContain('请求未到达的数据')
    expect(http.saves).toHaveLength(1)
  })
  it.each(['design', 'data'] as const)('%s page labels a formal business rejection as an editable draft', async kind => {
    const page = await open(kind)
    let label: string
    if (kind === 'design') {
      label = '第五文本标题'
      await field(page, label).get('input').setValue('业务拒绝后的设计草稿')
    } else {
      await selectEntry(page)
      label = '说明'
      await field(page, label).get('input').setValue('业务拒绝后的数据草稿')
    }
    const draft = kind === 'design' ? '业务拒绝后的设计草稿' : '业务拒绝后的数据草稿'
    http.rejectWrite = {code: 400, message: '服务端明确拒绝字典修改'}

    await button(page, kind === 'design' ? '保存设计' : '保存数据').trigger('click'); await flushPromises()

    expect(page.get('[role="alert"]').text()).toContain('服务端明确拒绝字典修改')
    if (kind === 'design') expect((field(page, label).get('input').element as HTMLInputElement).value).toBe(draft)
    else expect(page.text()).toContain(draft)
    const buttons = page.findAll('button')
    const verify = buttons.find(node => node.text() === '核验原提交（保留本地修改）')
    const cancelLabel = kind === 'design' ? '取消设计修改并重读' : '取消数据修改并重读'
    const cancel = buttons.find(node => node.text() === cancelLabel)
    expect.soft(verify).toBeUndefined()
    expect.soft(cancel).toBeDefined()
    const availableAction = verify ?? cancel
    if (!availableAction) throw new Error('明确拒绝后没有可见的数据恢复或取消入口')

    await availableAction.trigger('click'); await flushPromises()

    expect(page.text()).not.toContain(draft)
    expect(http.saves).toHaveLength(1)
  })
  it('creates a design before entering data maintenance and persists a new six-field entry', async () => {
    http.records = {_Base_DictType: [], _Base_DictData: []}
    const design = await open('design', true)
    expect(field(design, '所属应用').exists()).toBe(true)
    await field(design, '所属应用').get('.el-select__wrapper').trigger('click'); await flushPromises()
    const option = Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item => item.textContent?.includes('应用说明'))
    expect(option).toBeDefined()
    await new DOMWrapper(option!).trigger('click'); await flushPromises()
    await field(design, '字典名称').get('input').setValue('新字典')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    expect(design.get('[role="alert"]').text()).toContain('功能描述')
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toBeUndefined()
    expect(http.saves).toHaveLength(0)
    await field(design, '功能描述').get('input').setValue('用于维护选项')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toHaveLength(1)
    expect(http.records['_Base_DictType']).toMatchObject([{rowid: 'D1', TypeName: '新字典', functiondesc: '用于维护选项'}])
    design.unmount()
    const data = await open('data')
    await button(data, '新增条目').trigger('click'); await flushPromises()
    await field(data, '编码').get('input').setValue('A')
    await field(data, '显示文本').get('input').setValue('新条目')
    await field(data, '第五文本').get('input').setValue('第五输出')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(http.records['_Base_DictData']).toMatchObject([{typeid: 'D1', val: 'A', txt: '新条目', exVal_4: '第五输出'}])
    expect(http.saves).toHaveLength(2)
    expect(sets[0]!.destroyed).toBe(true)
    expect(sets[1]!.destroyed).toBe(true)
  })
  it('locks the new definition AppId after the first save while allowing another design edit in the same dialog', async () => {
    http.records = {_Base_DictType: [], _Base_DictData: []}
    const design = await open('design', true)
    await field(design, '所属应用').get('.el-select__wrapper').trigger('click'); await flushPromises()
    const option = Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item => item.textContent?.includes('应用说明'))
    expect(option).toBeDefined()
    await new DOMWrapper(option!).trigger('click'); await flushPromises()
    await field(design, '字典名称').get('input').setValue('同窗新建')
    await field(design, '功能描述').get('input').setValue('首次保存')
    await button(design, '保存设计').trigger('click'); await flushPromises()

    expect(design.findComponent(DictionaryDesign).emitted('saved')).toHaveLength(1)
    expect(design.findAll('.el-form-item').some(item => item.find('label').text() === '所属应用')).toBe(false)
    expect(button(design, '删除字典资源…').exists()).toBe(true)
    await field(design, '功能描述').get('input').setValue('保存后继续编辑')
    await button(design, '保存设计').trigger('click'); await flushPromises()

    expect(design.find('[role="alert"]').exists()).toBe(false)
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toHaveLength(2)
    expect(http.records['_Base_DictType']![0]).toMatchObject({AppId: 'APP', functiondesc: '保存后继续编辑'})
    expect(http.saves).toHaveLength(2)
    expect((http.saves[1]!.data as Array<{CrudModel: {Changed: Array<Record<string, unknown>>}}>)
      [0]!.CrudModel.Changed[0]).not.toHaveProperty('AppId')
  })
  it('rejects a duplicate option scenario before opening data and releases a stale editor before loading options', async () => {
    const duplicate = await open('design', true, 'D1', LowcodeDictionary.editorScenarioId)
    expect(duplicate.get('[role="alert"]').text()).toContain('必须属于不同正式数据空间')
    expect(LowcodeDictionary.loadEditor).not.toHaveBeenCalled()
    expect(LowcodeDictionary.loadApplicationOptions).not.toHaveBeenCalled()
    duplicate.unmount()

    const stale = fixture(http, false, LowcodeDictionary.editorScenarioId).dataSet
    sets.push(stale)
    let release!: (value: {dataSet: DataSet}) => void
    vi.mocked(LowcodeDictionary.loadEditor).mockImplementationOnce(() => new Promise(resolve => {release = resolve}))
    const page = await open('design', true)
    page.unmount()
    release({dataSet: stale}); await flushPromises()
    expect(stale.destroyed).toBe(true)
    expect(LowcodeDictionary.loadApplicationOptions).not.toHaveBeenCalled()
  })
  it('blocks creation without an application and does not provide AppId editing for an existing definition', async () => {
    http.records = {_Base_DictType: [], _Base_DictData: []}
    const creating = await open('design', true)
    await field(creating, '字典名称').get('input').setValue('未选应用')
    await field(creating, '功能描述').get('input').setValue('必须选择正式应用')
    await button(creating, '保存设计').trigger('click'); await flushPromises()
    expect(creating.get('[role="alert"]').text()).toContain('新建字典必须选择所属应用')
    expect(http.saves).toHaveLength(0)
    await field(creating, '所属应用').get('.el-select__wrapper').trigger('click'); await flushPromises()
    const option = Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item => item.textContent?.includes('应用说明'))
    expect(option).toBeDefined()
    await new DOMWrapper(option!).trigger('click'); await flushPromises()
    await button(creating, '保存设计').trigger('click'); await flushPromises()
    expect(http.records['_Base_DictType']![0]).toMatchObject({AppId: 'APP', TypeName: '未选应用'})
    creating.unmount()

    const editing = await open('design')
    expect(editing.findAll('.el-form-item').some(item => item.find('label').text() === '所属应用')).toBe(false)
  })
  it('keeps local draft cancellation available when deletion of existing entries is denied', async () => {
    http.denyDeleteIds = ['E1']
    const data = await open('data')
    await selectEntry(data)
    expect(button(data, '删除当前条目').attributes('disabled')).toBeDefined()
    await button(data, '新增条目').trigger('click'); await flushPromises()
    expect(data.findComponent(RendererTable).findAll('.el-table__body .el-table__row')).toHaveLength(2)
    expect(button(data, '删除当前条目').attributes('disabled')).toBeUndefined()
    await button(data, '删除当前条目').trigger('click'); await flushPromises()
    expect(data.findComponent(RendererTable).findAll('.el-table__body .el-table__row')).toHaveLength(1)
    expect(http.saves).toHaveLength(0)
  })
  it('stages an allowed entry removal and saves only the entry model', async () => {
    const data = await open('data')
    await selectEntry(data)
    await button(data, '删除当前条目').trigger('click'); await flushPromises()
    expect(http.records['_Base_DictData']).toHaveLength(1)
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {Deleted: [{rowid: 'E1'}]}}])
    expect(http.records['_Base_DictData']).toHaveLength(0)
    expect(http.records['_Base_DictType']).toHaveLength(1)
  })
  it('disables resource removal when any child record is not deletable', async () => {
    http.denyDeleteIds = ['E1']
    const design = await open('design')
    expect(button(design, '删除字典资源…').attributes('disabled')).toBeDefined()
    expect(http.saves).toHaveLength(0)
  })
  it('confirms resource removal and verifies entries and definition are gone through the same owner', async () => {
    const design = await open('design')
    await button(design, '删除字典资源…').trigger('click'); await flushPromises()
    const confirm = design.findAllComponents(RendererButton).find(item => item.props('label') === '确认删除')!
    await confirm.get('button').trigger('click'); await flushPromises()
    expect(design.findComponent(DictionaryDesign).emitted('deleted')).toHaveLength(1)
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData'}, {TableName: '_Base_DictType'}])
    expect(http.records['_Base_DictType']).toHaveLength(0)
    expect(http.records['_Base_DictData']).toHaveLength(0)
  })
})
