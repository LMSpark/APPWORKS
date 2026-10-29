import {afterEach, describe, expect, it, vi} from 'vitest'
import {DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus, {ElButton, ElCheckbox, ElTabs, ElSelect, ElRadioGroup, ElInputNumber, ElTable, ElTableColumn} from 'element-plus'
import {FieldText, FieldNumber, FieldCheckbox, FieldJson, FilterExpressionEditor, FilterValueFunctionDialog, RendererSection, RendererTabs, RendererForm, Spark, PAGE_RUNTIME, useSparkComponent, registerAllRenderers} from '@spark-appworks/spark-component'
import DataSpaceViewEditor from '@/views/features/data-platform/data-set-management/design/views/DataSpaceViewEditor.vue'
import {PageRuntime, ProjectWorkspace, ScenarioDefinitionDocument} from '@spark-appworks/spark-project-model'
import {RequestState, type DataSet, DataView} from '@spark-appworks/spark-data'
import {isRecord, type RequestConfig} from '@spark-appworks/spark-utils'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'
import {dataSpaceChainFixture} from './data-space-chain.fixture'
import {sourceCases, sourceChainFixture} from './data-space-source-chain.fixture'
import {LowcodeDataSpaceModelSourceReader} from '@/lowcode/data-space/model-source/lowcode-data-space-model-source-reader'

const transport = vi.hoisted(() => ({request: vi.fn(), scope: vi.fn(), workspace: vi.fn(), gateways: vi.fn()}))
vi.mock('@/lowcode/lowcode-runtime', async () => {
  const {DataSpaceRuntimeApi, DataSpaceDesignApi} = await import('@spark-appworks/spark-lowcode-api')
  const {HttpClientBase} = await import('@spark-appworks/spark-utils')
  class TestHttp extends HttpClientBase {
    protected override async executeRequest(config: RequestConfig) {
      return {data: await transport.request(config), status: 200, statusText: 'OK', headers: {}}
    }
  }
  const http = new TestHttp()
  const runtime = new DataSpaceRuntimeApi({http, readScope: transport.scope})
  return {lowcodeHttp: http, createLowcodeProjectGateways: transport.gateways, lowcodeApi: {
    readRequestScope: transport.scope,
    dataSpace: {runtime, design: new DataSpaceDesignApi({http, runtime, readScope: transport.scope})},
  }, lowcodeDesignFileUpload: async () => {throw new Error('unexpected design file upload')}}
})
vi.mock('@/services/project/project-shell', () => ({getAppProjectBlueprintWorkspace: transport.workspace}))
import {openLowcodeDataSpaceDesignSession} from '@/lowcode/data-space/lowcode-data-space-design'
import {loadLowcodeRuntimeScenario, loadLowcodeScenarioDefinitions} from '@/lowcode/data-space/lowcode-data-space-runtime'

const sessions: LowcodeDataSpaceDesignSession[] = []
const runtimes: DataSet[] = []
const wrappers: VueWrapper[] = []
const pageRuntimes: PageRuntime[] = []
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  pageRuntimes.splice(0).forEach(runtime => runtime.dispose())
  sessions.splice(0).forEach(session => session.dispose())
  runtimes.splice(0).forEach(dataSet => dataSet.destroy())
  vi.clearAllMocks()
})
function view(dataSet: DataSet, tableName: string, viewId = 'default'): DataView {
  const found = dataSet.getView(tableName, viewId)
  if (!found) throw new Error(`missing view ${tableName}@${viewId}`)
  return found
}
async function open(target: string) {
  const session = await openLowcodeDataSpaceDesignSession(target)
  sessions.push(session)
  await session.loadDefinition()
  return session
}

describe('one data space from metadata definitions through persistence to runtime', () => {
  it('reads formal model columns through the current metadata DataViews and preserves the editing workspace', async () => {
    const f = dataSpaceChainFixture()
    transport.request.mockImplementation(async (config: RequestConfig) => {
      const response = await f.request(config)
      const result = response.Result as {data?: {Items: Array<Record<string, unknown>>}}
      for (const row of result.data?.Items ?? []) {
        if (row['dataModelId'] === 'ORDER-MODEL') (row['lingma_sys_params'] as Record<string, unknown>)['e'] = ['description']
      }
      return response
    })
    transport.scope.mockImplementation(f.readScope); transport.workspace.mockImplementation(f.workspace)
    transport.gateways.mockReturnValue({scenarioViews: f.fileGateway})
    const session = await open(f.target), dataSet = session.metadataDataSet
    const fields = await session.loadModelFields('ORDER-MODEL')
    const row = fields.rows.find(item => item['Name'] === 'region')!, key = fields.getPkKey(row)!
    fields.updateEditingValue(key, 'description', 'keep my draft')
    fields.setSelectedRows([row])
    const before = JSON.stringify({config: fields.toJson(), rows: fields.rows, selected: fields.selectedRows})
    const owners = Object.values(dataSet.tables).flatMap(table => Object.values(table.views))
    const queried: DataView[] = [], load = DataView.prototype.loadFromServer
    const reads = vi.spyOn(DataView.prototype, 'loadFromServer').mockImplementation(function (this: DataView, ...args) {
      if (this.dataSet === dataSet) queried.push(this)
      return load.apply(this, args)
    })
    try {
      await session.loadViewFields({tableName: 'OrderTable', modelId: 'ORDER-MODEL', modelName: 'Orders', viewId: 'default'})
      const formalReads = queried.filter(context =>
        ['Base_DataModel', 'Base_DataModel_Field', 'View_TblList', 'Base_TblField'].includes(context.tableName))
      expect(formalReads.map(context => context.tableName).sort()).toEqual(['Base_DataModel', 'Base_DataModel_Field', 'Base_TblField', 'View_TblList'])
      expect(formalReads.every(context => !owners.includes(context) && context.destroyed)).toBe(true)
      expect(Object.values(dataSet.tables).flatMap(table => Object.values(table.views))).toEqual(owners)
      expect(JSON.stringify({config: fields.toJson(), rows: fields.rows, selected: fields.selectedRows})).toBe(before)
      expect(fields.getEditingRow(key)?.['description']).toBe('keep my draft')
      await expect(session.readApiInfo()).rejects.toThrow(/未提交/)
      expect(fields.getEditingRow(key)?.['description']).toBe('keep my draft')
      expect(session.getViewFields({tableName: 'OrderTable', modelId: 'ORDER-MODEL', modelName: 'Orders', viewId: 'default'})?.map(column => column.name)).toContain('region')
      expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
    } finally {reads.mockRestore()}
  })

  it.each(['View_TblList', 'Base_TblField'])('reads formal model definitions when %s retains a non-output source column', async tableName => {
    const f = dataSpaceChainFixture()
    const source = f.records.get('Base_DataModel')!.find(row => row['Name'] === tableName && row['dataSetId'] === f.meta)!
    const fields = f.records.get('Base_DataModel_Field')!
    const field = fields.find(row => row['dataModelId'] === source['rowid'])!
    fields.push({...field, rowid: `${tableName}-NON-OUTPUT`, Name: 'multiTenancy', IsPKey: 0, IsOutput: 0})
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.workspace.mockImplementation(f.workspace); transport.gateways.mockReturnValue({scenarioViews: f.fileGateway})
    const session = await open(f.target), start = f.requests.length
    await session.loadViewFields({tableName: 'OrderTable', modelId: 'ORDER-MODEL', modelName: 'Orders', viewId: 'default'})
    expect(session.getViewFields({tableName: 'OrderTable', modelId: 'ORDER-MODEL', modelName: 'Orders', viewId: 'default'})?.map(column => column.name)).toContain('region')
    const queries = f.requests.slice(start).filter(request => JSON.stringify(request.data).includes(`"Name":"${tableName}"`))
    expect(queries.length).toBeGreaterThan(0)
    expect(queries.every(request => !JSON.stringify(request.data).includes('multiTenancy'))).toBe(true)
    expect(session.metadataDataSet.getTable(tableName)!.columns.map(column => column.name)).toContain('multiTenancy')
    expect(Object.values(session.metadataDataSet.tables).flatMap(table => Object.keys(table.views)).some(id => id.startsWith('formalRead_'))).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
    expect(f.requests.some(request => request.url.includes('BatchTableOperate'))).toBe(false)
  })

  it.each(['Base_DataModel_Field', 'Base_TblField'])('rejects unavailable %s in the active metadata DataSet without falling back to HTTP', async tableName => {
    const f = dataSpaceChainFixture()
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.workspace.mockImplementation(f.workspace); transport.gateways.mockReturnValue({scenarioViews: f.fileGateway})
    const session = await open(f.target)
    session.metadataDataSet.getTable(tableName)!.destroyView('default')
    const count = f.requests.length
    await expect(session.loadViewFields({tableName: 'OrderTable', modelId: 'ORDER-MODEL', modelName: 'Orders', viewId: 'default'})).rejects.toThrow(/元数据.*视图/)
    expect(f.requests.slice(count).some(request => JSON.stringify(request.data).includes(`"Name":"${tableName}"`))).toBe(false)
    expect(Object.values(session.metadataDataSet.tables).flatMap(table => Object.keys(table.views)).some(id => id.startsWith('formalRead_'))).toBe(false)
  })

  it.each(['scope', 'dispose', 'sourceView'] as const)('rejects a delayed formal read after %s invalidation and releases query views', async invalidation => {
    const f = dataSpaceChainFixture()
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.workspace.mockImplementation(f.workspace); transport.gateways.mockReturnValue({scenarioViews: f.fileGateway})
    const session = await open(f.target), dataSet = session.metadataDataSet
    let release!: () => void, started!: () => void
    const pending = new Promise<void>(resolve => {release = resolve}), entered = new Promise<void>(resolve => {started = resolve})
    transport.request.mockImplementation(async (config: RequestConfig) => {
      const response = await f.request(config)
      if (JSON.stringify(config.data).includes('"Name":"Base_DataModel_Field"')) {started(); await pending}
      return response
    })
    const reading = session.loadViewFields({tableName: 'OrderTable', modelId: 'ORDER-MODEL', modelName: 'Orders', viewId: 'default'})
    const rejected = expect(reading).rejects.toThrow()
    await entered
    const temporary = Object.values(dataSet.tables).flatMap(table => Object.values(table.views)).filter(view => view.viewId.startsWith('formalRead_'))
    expect(temporary.length).toBeGreaterThan(0)
    if (invalidation === 'scope') f.expire()
    else if (invalidation === 'dispose') session.dispose()
    else dataSet.getTable('Base_DataModel_Field')!.destroyView('default')
    release()
    await rejected
    expect(temporary.every(view => view.destroyed)).toBe(true)
    expect(Object.values(dataSet.tables).flatMap(table => Object.keys(table.views)).some(id => id.startsWith('formalRead_'))).toBe(false)
  })

  it('retains the formal field read-permission rejection on the metadata DataView path', async () => {
    const f = dataSpaceChainFixture()
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.workspace.mockImplementation(f.workspace); transport.gateways.mockReturnValue({scenarioViews: f.fileGateway})
    const session = await open(f.target)
    transport.request.mockImplementation(async (config: RequestConfig) => {
      const response = await f.request(config)
      const result = response.Result as {data?: {Items: Array<Record<string, unknown>>}}
      for (const row of result.data?.Items ?? []) {
        if (row['dataModelId'] === 'ORDER-MODEL') (row['lingma_sys_params'] as Record<string, unknown>)['m'] = ['Name']
      }
      return response
    })
    await expect(session.loadViewFields({tableName: 'OrderTable', modelId: 'ORDER-MODEL', modelName: 'Orders', viewId: 'default'})).rejects.toThrow(/不可读取|脱敏/)
    await expect(session.readApiInfo()).rejects.toThrow(/不可读取|脱敏/)
    expect(Object.values(session.metadataDataSet.tables).flatMap(table => Object.keys(table.views)).some(id => id.startsWith('formalRead_'))).toBe(false)
  })

  it('copies complete API identities from a deferred page without first loading the whole field workspace', async () => {
    const f = dataSpaceChainFixture()
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.workspace.mockImplementation(f.workspace); transport.gateways.mockReturnValue({scenarioViews: f.fileGateway})
    const session = await openLowcodeDataSpaceDesignSession(f.target); sessions.push(session)
    const fields = view(session.metadataDataSet, 'Base_DataModel_Field')
    expect(fields.requestState).toBe(RequestState.Idle)
    const content = await session.readApiInfo()
    const models = JSON.parse(content.split('const DataModels = ')[1]!.slice(0, -1))
    expect(models).toHaveLength(2)
    expect(models).toEqual(expect.arrayContaining([
      {modelId: 'ORDER-MODEL', modelName: 'Orders', type: '数据库表', primaryKey: 'rowid', dataViewKeys: [`${f.target}@Orders@default`]},
      {modelId: 'CHOICE-MODEL', modelName: 'Choices', type: '数据库表', primaryKey: 'rowid', dataViewKeys: [`${f.target}@Choices@default`]},
    ]))
    expect(fields.requestState).toBe(RequestState.Idle)
    expect(fields.rows).toEqual([])
    expect(session.definitionStatus).toBe('unloaded')
    expect(f.fileWrites).toHaveLength(0)
    expect(f.requests.some(request => request.url.includes('BatchTableOperate'))).toBe(false)
  })

  it('shares the formal definition DataSet in one workspace and persists only the queried view', async () => {
    const f = dataSpaceChainFixture()
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.gateways.mockReturnValue({scenarioViews: f.fileGateway})
    const workspace = new ProjectWorkspace({projectId: 'CHAIN-APP', pageFiles: {readPageFile: async () => ''},
      blueprint: {}, scenarioViews: f.fileGateway,
      scenarioDefinitions: loadLowcodeScenarioDefinitions})
    const [first, second] = await Promise.all([workspace.loadScenarioDefinitions({scenarioId: f.target}), workspace.loadScenarioDefinitions({scenarioId: f.target})])
    runtimes.push(first)
    expect(first).toBe(second)
    expect(first.scenarioId).toBe(f.meta)
    expect(workspace.getScenarioDefinitions(f.target)).toBe(first)
    expect(view(first, 'Base_DataModel_Field').requestState).toBe(RequestState.Idle)
    const definitions = view(first, 'DataViewDefinition')
    expect(definitions.requestState).toBe(RequestState.Idle)
    expect((await definitions.loadFromServer()).success).toBe(true)
    const row = definitions.rows.find(item => item['viewId'] === 'default')!
    definitions.updateEditingValue(definitions.getPkKey(row)!, 'pageSize', 37)
    expect(workspace.dirtyScenarioIds).toEqual([f.target])
    expect((await first.saveChanges({views: [{tableName: 'DataViewDefinition'}]})).success).toBe(true)
    expect(workspace.dirtyScenarioIds).toEqual([])
    expect(f.fileWrites).toHaveLength(1)
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
    expect(view(first, 'Base_DataModel_Field').requestState).toBe(RequestState.Idle)
    const reopened = await loadLowcodeRuntimeScenario({projectId: f.readScope().headers['X-AppId']!, scenarioId: f.target})
    runtimes.push(reopened)
    expect(view(reopened, String(row['tableName'])).pageSize).toBe(37)
    f.expire()
    expect(workspace.getScenarioDefinitions(f.target)).toBeNull()
    expect(first.destroyed).toBe(true)
  })

  it('uses the same formal definition chain when the designed target is the metadata space itself', async () => {
    const f = dataSpaceChainFixture()
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.gateways.mockReturnValue({scenarioViews: f.fileGateway})
    const openWorkspace = () => new ProjectWorkspace({projectId: 'CHAIN-APP', pageFiles: {readPageFile: async () => ''},
      blueprint: {}, scenarioViews: f.fileGateway, scenarioDefinitions: loadLowcodeScenarioDefinitions})
    const first = await openWorkspace().loadScenarioDefinitions({scenarioId: f.meta}); runtimes.push(first)
    const document = await ScenarioDefinitionDocument.open(first, f.meta)
    const definition = JSON.parse(document.getText())
    definition.tables.Base_DataModel.views.default.pageSize = 17
    definition.tables.Base_DataModel.crudConfig = {timeout: 4500}
    definition.tables.Base_DataModel.views.selfDescriptionOptions = {...definition.tables.Base_DataModel.views.modelOptions}
    definition.viewCascades[0].parentViewId = 'selfDescriptionOptions'
    definition.layout = {tablePositions: {Base_DataModel: {x: 10, y: 20}}}
    await document.setText(JSON.stringify(definition))
    expect((await first.saveChanges({views: document.viewSelectors})).success).toBe(true)
    document.dispose()
    expect(f.fileWrites.map(text => JSON.parse(text).scenarioId)).toEqual([f.meta])
    const reopened = await openWorkspace().loadScenarioDefinitions({scenarioId: f.target}); runtimes.push(reopened)
    expect(view(reopened, 'Base_DataModel').pageSize).toBe(17)
    expect(view(reopened, 'Base_DataModel').rows).not.toHaveLength(0)
    expect(view(reopened, 'Base_DataModel').rows.every(row => row['dataSetId'] === f.target)).toBe(true)
    expect(view(reopened, 'Base_DataModel_Field').requestState).toBe(RequestState.Idle)
    expect(reopened.getTable('Base_DataModel')?.crudConfig).toEqual({timeout: 4500})
    const options = view(reopened, 'Base_DataModel', 'selfDescriptionOptions')
    await options.loadFromServer()
    const selected = options.rows.find(row => row['Name'] === 'Orders')!
    expect(selected).toBeDefined()
    options.setSelectedRows([selected])
    const fields = view(reopened, 'Base_DataModel_Field', 'modelFieldOptions')
    await vi.waitFor(() => expect(fields.requestState).toBe(RequestState.Loaded))
    expect(fields.rows.length).toBeGreaterThan(0)
    expect(fields.rows.every(row => row['dataModelId'] === selected['rowid'])).toBe(true)
    expect(view(reopened, 'Base_DataModel_Field').requestState).toBe(RequestState.Idle)
    const selfReopen = await openWorkspace().loadScenarioDefinitions({scenarioId: f.meta}); runtimes.push(selfReopen)
    const layout = view(selfReopen, 'DataSpaceLayoutDefinition')
    await layout.loadFromServer()
    expect(layout.rows[0]?.['tablePositions']).toEqual({Base_DataModel: {x: 10, y: 20}})
  })

  it.each(sourceCases)('creates and consumes $type through the real source reader and formal saved model', async item => {
    const f = sourceChainFixture()
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.workspace.mockImplementation(f.workspace); transport.gateways.mockReturnValue({scenarioViews: f.fileGateway,
      blueprint: {}, pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}}})
    const session = await openLowcodeDataSpaceDesignSession(f.target); sessions.push(session)
    const reader = new LowcodeDataSpaceModelSourceReader()
    const candidates = await reader.query({type: item.type, pageSize: 100}, session.metadataDataSet)
    const source = candidates.rows.find(row => row.id === item.source.rowid)!
    expect(source).toBeDefined()
    const create = session.getModelCreate()
    await create.preview(source)
    expect(create.getState().preview?.prepared.fields.filter(field => field.type === 'dataModel').map(field => field.Name)).toEqual(item.fields)
    create.discard()
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
    await create.preview(source)
    const registration = `Registered_${item.type}`
    create.setName(registration)
    const id = await create.save()
    expect(view(session.metadataDataSet, 'Base_DataModel_Field').requestState).toBe(RequestState.Idle)
    const model = f.records.get('Base_DataModel')!.find(row => row['rowid'] === id)!
    expect(model).toMatchObject({Name: registration, MetaName: source.name, dataSetId: f.target})
    const fields = f.records.get('Base_DataModel_Field')!.filter(row => row['dataModelId'] === id)
    expect(fields.filter(row => row['type'] === 'dataModel').map(row => row['Name'])).toEqual(item.fields)
    expect(fields.every(row => row['dataSetId'] === f.target)).toBe(true)
    const parameterSource = item.type === 'interface' || item.type === 'logicView'
    expect(fields.filter(row => row['type'] === 'inputParams')).toHaveLength(parameterSource ? 1 : 0)
    if (item.type === 'dict') expect(fields.find(row => row['Name'] === 'val')).toMatchObject({description: '代码', FieldType: 'double'})
    const reopened = await openLowcodeDataSpaceDesignSession(f.target); sessions.push(reopened)
    await view(reopened.metadataDataSet, 'DataViewDefinition').addRow({dataSetId: f.target, dataModelId: id,
      dataModelName: registration, tableName: 'SourceResult', viewId: 'list', autoLoad: false,
      ...(parameterSource ? {queryConfig: {sourceInputMode: 'direct'}, queryContext: {region: 'east'}} : {})})
    expect((await reopened.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).success).toBe(true)
    f.records.set(registration, [Object.fromEntries(item.fields.map(name => [name, name === 'val' ? 7 : name === 'haschild' ? false : name === 'ordIdx' ? 1 : `${name}-value`]))])
    const consumer = await open(f.target), result = view(consumer.definitionDataSet!, 'SourceResult', 'list')
    await consumer.loadViewFields({tableName: 'SourceResult', modelId: id, modelName: registration, viewId: 'list'})
    expect(result.dataTable?.modelBinding).toEqual({modelId: id, modelName: registration})
    expect((await result.loadFromServer()).success, result.loadingError?.message).toBe(true)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.[item.fields[0]]).toBe(`${item.fields[0]}-value`)
    expect(f.requests.at(-1)?.data).toMatchObject({Table: [{Name: registration,
      ...(parameterSource ? {inputParams: [{Name: 'region', Value: 'east'}]} : {})}]})
    expect(result.addActionState()).not.toBe('enabled')
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(1)
  })

  it('creates two named views through standard controls and reopens their independent requests and pages', async () => {
    const f = dataSpaceChainFixture()
    f.files.set(f.target, JSON.stringify({...JSON.parse(f.files.get(f.target)!), schemaVersion: 2, resourceRelations: []}))
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.workspace.mockImplementation(f.workspace); transport.gateways.mockReturnValue({scenarioViews: f.fileGateway,
      blueprint: {}, pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}}})
    const session = await openLowcodeDataSpaceDesignSession(f.target)
    sessions.push(session)
    const definitions = view(session.metadataDataSet, 'DataViewDefinition')
    const runtime = new PageRuntime({pageId: 'named-view-editor', scenarioIds: [f.meta], loadScenario: async () => session.metadataDataSet})
    await runtime.load(); pageRuntimes.push(runtime); registerAllRenderers()
    const selected = ref<string | number>(), revision = ref(0)
    const Host = defineComponent({setup() {
      useSparkComponent({type: 'named-view-editor'}).sparkProvide(PAGE_RUNTIME, runtime)
      return () => h(DataSpaceViewEditor, {session, modelId: 'CHOICE-MODEL', modelName: 'Choices',
        rowKey: selected.value, revision: revision.value, onChanged: () => {revision.value++}, onSelect: key => {selected.value = key}})
    }})
    const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()],
      stubs: {'el-button': ElButton, SparkComponentRenderer: false, 'spark-component-renderer': false}}})
    wrappers.push(wrapper); await flushPromises()
    for (const [name, size] of [['east', 1], ['west', 2]] as const) {
      const input = wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'newName')!
      expect(input.props('modelValue')).toBeUndefined()
      await input.get('input').setValue(name); await flushPromises()
      await wrapper.get('[data-action="add-view"]').trigger('click'); await flushPromises()
      expect(definitions.getEditingRow(selected.value!)?.['viewId'], wrapper.text()).toBe(name)
      const request = wrapper.get('[data-request-workspace]')
      request.get('[data-json-member="outputType"]').getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'Table')
      await flushPromises()
      request.get('[data-json-member="allPages"]').getComponent(ElRadioGroup).vm.$emit('update:modelValue', false)
      await flushPromises()
      const section = wrapper.findAllComponents(RendererSection).find(item => item.props('title') === '其他请求配置与完整编辑')!
      await section.get('.renderer-section-toggle').trigger('click'); await flushPromises()
      const pageSize = section.findAllComponents(FieldNumber).find(field => field.props('field') === 'pageSize')!
      expect(pageSize.props('modelValue')).toBeUndefined()
      pageSize.getComponent(ElInputNumber).vm.$emit('update:modelValue', size); await flushPromises()
      const filter = request.getComponent(FilterExpressionEditor)
      await filter.get('[data-action="open"]').trigger('click'); await flushPromises()
      const body = new DOMWrapper(document.body)
      await body.findAll('button').find(button => button.text() === '添加条件')!.trigger('click'); await flushPromises()
      filter.findAllComponents(ElSelect)[0]!.vm.$emit('update:modelValue', 'region'); await flushPromises()
      await body.get('input[aria-label="文本常量"]').setValue(name)
      expect(wrapper.get('[data-action="save-views"]').attributes('disabled')).toBeDefined()
      await body.get('[data-action="apply"]').trigger('click'); await flushPromises()
      expect(f.fileWrites).toHaveLength(name === 'east' ? 0 : 1)
      await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
      expect(f.fileWrites, wrapper.text()).toHaveLength(name === 'east' ? 1 : 2)
      expect(definitions.hasEditingChanges() || definitions.dirtyTracking.hasPendingChanges()).toBe(false)
    }
    const eastDefinition = definitions.rows.find(row => row['viewId'] === 'east')!
    wrapper.getComponent(RendererTabs).getComponent(ElTabs).vm.$emit('update:modelValue', String(definitions.getPkKey(eastDefinition)))
    await flushPromises()
    expect(wrapper.get('[data-view-properties]').text()).toContain('ChoiceTable @ east')
    const filter = wrapper.get('[data-request-workspace]').getComponent(FilterExpressionEditor)
    await filter.get('[data-action="open"]').trigger('click'); await flushPromises()
    await new DOMWrapper(document.body).get('input[aria-label="文本常量"]').setValue('discarded')
    await new DOMWrapper(document.body).get('[data-action="cancel"]').trigger('click'); await flushPromises()
    expect(definitions.hasEditingChanges()).toBe(false)
    expect(f.fileWrites).toHaveLength(2)
    expect(session.definitionStatus).toBe('unloaded')
    expect(view(session.metadataDataSet, 'Base_DataModel_Field').requestState).toBe(RequestState.Idle)
    expect(f.requests.some(request => isRecord(request.data) && Array.isArray(request.data['Table'])
      && request.data['Table'].some(table => isRecord(table) && table['Name'] === 'Choices'))).toBe(false)
    const reopened = await open(f.target), east = view(reopened.definitionDataSet!, 'ChoiceTable', 'east')
    const west = view(reopened.definitionDataSet!, 'ChoiceTable', 'west')
    expect(east.pageSize).toBe(1); expect(west.pageSize).toBe(2)
    expect(east.queryConfig).toMatchObject({outputType: 'Table', allPages: false})
    expect(west.queryConfig).toMatchObject({outputType: 'Table', allPages: false})
    expect((await east.loadFromServer()).success).toBe(true)
    expect((await west.loadFromServer()).success).toBe(true)
    expect(east.rows.map(row => row['rowid'])).toEqual(['OPT-E'])
    expect(west.rows.map(row => row['rowid'])).toEqual(['OPT-W'])
    expect(east.total).toBe(2); expect(west.total).toBe(1)
    await east.setPage(2)
    expect(east.rows.map(row => row['rowid'])).toEqual(['OPT-LOW'])
    expect(west.page).toBe(1); expect(west.rows.map(row => row['rowid'])).toEqual(['OPT-W'])
    expect(f.requests.at(-1)?.data).toMatchObject({PageParam: {index: 2, size: 1}})
    expect(view(reopened.definitionDataSet!, 'ChoiceTable').filterExpression).toBeUndefined()
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
  }, 15000)

  it.each(['native', 'legacy'] as const)('edits formal query output from a deferred %s first screen through standard children, cancels and reopens the saved query', async relationFormat => {
    const f = dataSpaceChainFixture()
    if (relationFormat === 'native') f.files.set(f.target, JSON.stringify({...JSON.parse(f.files.get(f.target)!), schemaVersion: 2, resourceRelations: []}))
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.workspace.mockImplementation(f.workspace); transport.gateways.mockReturnValue({scenarioViews: f.fileGateway, blueprint: {}, pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}}})
    const session = await openLowcodeDataSpaceDesignSession(f.target)
    sessions.push(session)
    const definitions = view(session.metadataDataSet, 'DataViewDefinition')
    const assertDeferred = (afterEditing = false) => {
      expect(session.metadataDataSet.scenarioId).toBe(f.meta)
      expect(session.definitionStatus).toBe('unloaded')
      for (const name of ['Base_DataModel_Field', 'Base_DataModel_Relation']) {
        expect(view(session.metadataDataSet, name).requestState, name).toBe(
          afterEditing && name === 'Base_DataModel_Relation' && relationFormat === 'legacy' ? RequestState.Loaded : RequestState.Idle)
        expect(view(session.metadataDataSet, name).rows, name).toEqual([])
      }
    }
    assertDeferred()
    const modelFields = await session.loadModelFields('CHOICE-MODEL')
    expect(modelFields.rows).toHaveLength(8)
    expect(modelFields.rows.every(row => row['dataSetId'] === f.target && row['dataModelId'] === 'CHOICE-MODEL')).toBe(true)
    assertDeferred()
    await definitions.addRow({dataSetId: f.target, dataModelId: 'CHOICE-MODEL', tableName: 'ChoiceTable', viewId: 'statistics',
      autoLoad: false, queryConfig: {outputType: 'Table'}, filterExpression: {field: 'orderId', operator: 'eq', value: 'ORDER-1'}})
    await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    const row = definitions.rows.find(row => row['viewId'] === 'statistics')!, key = definitions.getPkKey(row)!
    const runtime = new PageRuntime({pageId: 'projection-editor', scenarioIds: [f.meta], loadScenario: async () => session.metadataDataSet})
    await runtime.load(); pageRuntimes.push(runtime); registerAllRenderers()
    const Host = defineComponent({setup() {
      useSparkComponent({type: 'projection-editor'}).sparkProvide(PAGE_RUNTIME, runtime)
      const revision = ref(0)
      return () => h(DataSpaceViewEditor, {session, modelId: 'CHOICE-MODEL', modelName: 'Choices', rowKey: key,
        revision: revision.value, onChanged: () => {revision.value++}})
    }})
    const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()],
      stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn, 'el-button': ElButton,
        SparkComponentRenderer: false, 'spark-component-renderer': false, JsonTreeEditor: true, SparkJsonEditor: true}}})
    wrappers.push(wrapper)
    await flushPromises()
    expect(definitions.getEditingRow(key)?.['fieldProjection']).toBeUndefined()
    await wrapper.get('[data-action="initialize-query-output"]').trigger('click'); await flushPromises()
    expect(definitions.getEditingRow(key)?.['fieldProjection']).toHaveLength(8)
    expect(f.fileWrites).toHaveLength(1)
    await wrapper.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(definitions.getEditingRow(key)?.['fieldProjection']).toBeUndefined()
    await wrapper.get('[data-action="initialize-query-output"]').trigger('click'); await flushPromises()
    const output = () => wrapper.get('[data-query-output]').getComponent(FieldJson)
    expect(output().findAll('[data-function-open]')).toHaveLength(8)
    for (const [index, checkbox] of output().findAllComponents(FieldCheckbox).entries()) {
      if (index === 6) continue
      checkbox.getComponent(ElCheckbox).vm.$emit('update:modelValue', false); await flushPromises()
    }
    await output().findAll('[data-function-open]')[6]!.trigger('click'); await flushPromises()
    const dialog = wrapper.getComponent(FilterValueFunctionDialog)
    dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetGroupData'); await flushPromises()
    dialog.getComponent(ElSelect).vm.$emit('update:modelValue', 'SUM'); await flushPromises()
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.fileWrites, wrapper.text()).toHaveLength(2)
    expect(definitions.hasEditingChanges()).toBe(false)
    assertDeferred(true)
    expect(f.requests.some(request => isRecord(request.data) && Array.isArray(request.data['Table'])
      && request.data['Table'].some(table => isRecord(table) && ['Orders', 'Choices'].includes(String(table['Name']))))).toBe(false)
    const reopened = await open(f.target), statistics = view(reopened.definitionDataSet!, 'ChoiceTable', 'statistics')
    expect(statistics.fieldProjection.filter(field => field.output)).toMatchObject([{fieldId: 'CHOICE-MODEL-FIELD-6', viewField: 'amount', valueFunction: '{"Type":"GetGroupData","ValType":"SUM"}'}])
    expect((await statistics.loadFromServer()).success).toBe(true)
    expect(statistics.rows[0]?.['amount']).toBe(20)
    const unchangedDefault = view(reopened.definitionDataSet!, 'ChoiceTable')
    expect((await unchangedDefault.loadFromServer()).success).toBe(true)
    expect(unchangedDefault.rows.map(row => row['amount'])).toEqual([12, 3, 5, 100])
    expect(unchangedDefault.total).toBe(4)
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toEqual([])
  }, 15000)
  it.each(['database-first', 'file-first'] as const)('handles a lost file receipt with %s submission without replaying confirmed sources', async order => {
    const f = dataSpaceChainFixture()
    if (order === 'database-first') {
      const config = JSON.parse(f.files.get(f.meta)!)
      f.files.set(f.meta, JSON.stringify({...config, tables: {Base_DataSet: config.tables.Base_DataSet, ...config.tables}}))
    }
    const write = f.fileGateway.writeText
    let loseReceipt = true
    f.fileGateway.writeText = async (id, text) => {
      await write(id, text)
      if (loseReceipt) {loseReceipt = false; throw new Error('file response lost')}
    }
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.workspace.mockImplementation(f.workspace); transport.gateways.mockReturnValue({scenarioViews: f.fileGateway, blueprint: {}, pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}}})
    const session = await openLowcodeDataSpaceDesignSession(f.target)
    sessions.push(session)
    const dataSet = session.metadataDataSet, metadata = view(dataSet, 'Base_DataSet'), definitions = view(dataSet, 'DataViewDefinition')
    const definition = definitions.rows.find(row => row['tableName'] === 'ChoiceTable' && row['viewId'] === 'default')!
    const parameters = '[{"rowid":"REGION-PARAM","Name":"region","Description":"区域","IsBusParam":true}]'
    metadata.updateEditingValue(f.target, 'inputParams', parameters)
    definitions.updateEditingValue(definitions.getPkKey(definition)!, 'pageSize', 17)
    const submission = {views: [{tableName: 'Base_DataSet', viewId: 'default'}, {tableName: 'DataViewDefinition', viewId: 'default'}]}
    await expect(dataSet.saveChanges(submission)).rejects.toThrow('file response lost')
    expect(f.records.get('Base_DataSet')?.find(row => row['rowid'] === f.target)?.['inputParams']).toBe(order === 'database-first' ? parameters : '[]')
    expect(metadata.dirtyTracking.hasPendingChanges()).toBe(order !== 'database-first')
    if (order === 'database-first') expect(metadata.mutatingError).toBeNull()
    expect(definitions.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(session.viewState?.saveStatus).toBe('unknown')
    expect((await dataSet.saveChanges(submission)).success).toBe(true)
    if (order === 'file-first') {
      expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
      expect(metadata.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(session.viewState?.saveStatus).toBe('idle')
      expect((await dataSet.saveChanges(submission)).success).toBe(true)
    }
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(1)
    const reopened = await open(f.target)
    expect(view(reopened.metadataDataSet, 'Base_DataSet').rows[0]?.['inputParams']).toBe(parameters)
    expect(view(reopened.definitionDataSet!, 'ChoiceTable').pageSize).toBe(17)
    expect(view(reopened.definitionDataSet!, 'OrderTable').columns.some(column => column.name === 'doubleMinimum')).toBe(true)
  })
  it('saves the designer own C through its definition view and consumes it in fresh designer and page runtimes', async () => {
    const f = dataSpaceChainFixture()
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.workspace.mockImplementation(f.workspace); transport.gateways.mockReturnValue({scenarioViews: f.fileGateway, blueprint: {}, pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}}})
    const designer = await open(f.meta)
    const runningModels = view(designer.metadataDataSet, 'Base_DataModel')
    const originalSize = runningModels.pageSize
    const definitions = view(designer.metadataDataSet, 'DataViewDefinition')
    const definition = definitions.rows.find(row => row['tableName'] === 'Base_DataModel' && row['viewId'] === 'default')!
    definitions.updateEditingValue(definitions.getPkKey(definition)!, 'pageSize', 3)
    await designer.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    expect(f.fileWrites).toHaveLength(1)
    expect(runningModels.pageSize).toBe(originalSize)
    const reopened = await open(f.target)
    expect(reopened.metadataDataSet.scenarioId).toBe(f.meta)
    expect(view(reopened.metadataDataSet, 'Base_DataModel').pageSize).toBe(3)
    expect(view(reopened.metadataDataSet, 'Base_DataModel').rows.every(row => row['dataSetId'] === f.target)).toBe(true)
    const runtime = await loadLowcodeRuntimeScenario({projectId: 'CHAIN-APP', scenarioId: f.meta})
    runtimes.push(runtime)
    expect(view(runtime, 'Base_DataModel').pageSize).toBe(3)
    expect(view(runtime, 'Base_DataModel').filterExpression).toEqual(runningModels.filterExpression)
    expect(reopened.viewState?.dirty).toBe(false)
  })

  it('cascades definition field candidates by model and view, then saves through the definition DataSet', async () => {
    const f = dataSpaceChainFixture()
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.workspace.mockImplementation(f.workspace); transport.gateways.mockReturnValue({scenarioViews: f.fileGateway, blueprint: {}, pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}}})
    const session = await open(f.target)
    const definitions = view(session.metadataDataSet, 'DataViewDefinition')
    const address = {tableName: 'DataViewDefinition', viewId: 'default', field: 'labelField'}
    const order = definitions.rows.find(row => row['tableName'] === 'OrderTable')!
    const choice = definitions.rows.find(row => row['tableName'] === 'ChoiceTable')!
    definitions.setCurrentRow(order)
    const orderState = await session.metadataDataSet.refreshFieldCascade(address)
    expect(orderState.error).toBeUndefined()
    expect(orderState).toMatchObject({status: 'ready', valueStatus: 'empty'})
    expect(orderState.options.map(row => row['name'])).toContain('minimum')
    expect(orderState.options.map(row => row['name'])).not.toContain('title')
    definitions.setCurrentRow(choice)
    const choiceState = await session.metadataDataSet.refreshFieldCascade(address)
    expect(choiceState.options.map(row => row['name'])).toContain('title')
    expect(choiceState.options.map(row => row['name'])).not.toContain('minimum')
    definitions.updateEditingValue(definitions.getPkKey(choice)!, 'labelField', 'missing')
    expect(session.metadataDataSet.getFieldCascadeState(address).valueStatus).toBe('invalid')
    expect(definitions.getEditingRow(definitions.getPkKey(choice)!)?.['labelField']).toBe('missing')
    await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).rejects.toThrow()
    expect(f.fileWrites).toHaveLength(0)
    definitions.updateEditingValue(definitions.getPkKey(choice)!, 'labelField', 'title')
    await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    const reopened = await open(f.target)
    expect(reopened.definitionDataSet?.getView('ChoiceTable', 'default')?.labelField).toBe('title')
    expect(f.files.get(f.target)).not.toMatch(/DataViewFieldOption|view-definition-|"rows"/)
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
  })

  it('reopens named views, queries server aggregates, and edits through a bound standard component with a multi-input cascade', async () => {
    const f = dataSpaceChainFixture()
    transport.request.mockImplementation(f.request); transport.scope.mockImplementation(f.readScope)
    transport.workspace.mockImplementation(f.workspace); transport.gateways.mockReturnValue({scenarioViews: f.fileGateway, blueprint: {}, pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}}})
    const session = await open(f.target)
    expect(session.metadataDataSet.scenarioId).toBe(f.meta)
    expect(session.targetId).toBe(f.target)
    for (const name of ['Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation']) {
      expect(view(session.metadataDataSet, name).rows.every(row => row['dataSetId'] === f.target)).toBe(true)
      expect(view(session.metadataDataSet, name).queryContext).toMatchObject({dataSpaceId: f.target})
    }
    expect(view(session.metadataDataSet, 'Base_DataModel').rows.map(row => row['rowid'])).toEqual(['ORDER-MODEL', 'CHOICE-MODEL'])

    session.stageInputParameters({expectedValue: '[]', value: [{rowid: 'REGION-PARAM', Name: 'region', Description: '区域', IsBusParam: true},
      {rowid: 'CATEGORY-PARAM', Name: 'category', Description: '类别', IsBusParam: true}]})
    await session.saveInputParameters({expectedValue: '[]'})
    expect(f.fileWrites).toHaveLength(0)

    const definitions = view(session.metadataDataSet, 'DataViewDefinition')
    await definitions.addRow({dataSetId: f.target, dataModelId: 'ORDER-MODEL', tableName: 'OrderTable', viewId: 'edit',
      autoLoad: false, commitMode: 'staged', pageSize: 7})
    await definitions.addRow({dataSetId: f.target, dataModelId: 'CHOICE-MODEL', tableName: 'ChoiceTable', viewId: 'choices',
      autoLoad: false, valueField: 'code', labelField: 'title', selectionDelimiter: '|', filterExpression: {logic: 'and', filters: [
        {field: 'region', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'region'}},
        {field: 'category', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'category'}},
      ]}})
    await definitions.addRow({dataSetId: f.target, dataModelId: 'CHOICE-MODEL', tableName: 'ChoiceTable', viewId: 'statistics',
      autoLoad: false, pageSize: 1, queryConfig: {outputType: 'Table'}, fieldProjection: [{
        fieldId: 'CHOICE-MODEL-FIELD-6', source: 'resource', resourceFieldId: 'CHOICE-MODEL-FIELD-6',
        resourceField: 'amount', viewField: 'amount', type: 'number', label: 'amount', output: true,
        sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: false,
        value: '', valueFunction: '{"Type":"Sum"}', expression: '',
      }], filterExpression: {logic: 'and', filters: [
        {field: 'orderId', operator: 'eq', value: 'ORDER-1'},
        {logic: 'or', filters: [{field: 'amount', operator: 'gte', value: 10}, {field: 'kind', operator: 'eq', value: 'bonus'}]},
      ]}})
    const relation = {relationId: 'eligible-choices', relationName: '达标或奖励选项', parentTable: 'OrderTable', childTable: 'ChoiceTable',
      cascadeDelete: false, cascadeUpdate: false, filterExpression: {logic: 'and', filters: [
        {field: 'orderId', operator: 'eq', value: {Type: 'GetTableField', Field: 'rowid'}},
        {logic: 'or', filters: [{field: 'amount', operator: 'gte', value: {Type: 'GetTableField', Field: 'minimum'}},
          {field: 'kind', operator: 'eq', value: {Type: 'GetConstValue', Value: 'bonus'}}]},
      ]}}
    await view(session.metadataDataSet, 'DataResourceRelationDefinition').addRow({dataSetId: f.target, ...relation})
    const cascade = {kind: 'field', cascadeId: 'choice-options', tableName: 'OrderTable', viewId: 'edit', targetField: 'choice',
      valueFormat: 'selection-string', parents: [
        {tableName: 'OrderTable', viewId: 'edit', field: 'region', parameter: 'region'},
        {tableName: 'OrderTable', viewId: 'edit', field: 'category', parameter: 'category'},
      ], optionsView: {tableName: 'ChoiceTable', viewId: 'choices'}, valuePolicy: {mode: 'retain-valid', clearValue: ''}}
    await view(session.metadataDataSet, 'DataViewCascadeDefinition').addRow({dataSetId: f.target, ...cascade})
    expect((await session.metadataDataSet.saveChanges({views: [
      {tableName: 'DataViewDefinition', viewId: 'default'},
      {tableName: 'DataResourceRelationDefinition', viewId: 'default'},
      {tableName: 'DataViewCascadeDefinition', viewId: 'default'},
    ]})).success).toBe(true)
    const savedFile = f.files.get(f.target)
    expect(f.fileWrites).toHaveLength(1)
    expect(f.records.get('Base_DataModel_Relation')).toEqual([])
    expect(savedFile).not.toMatch(/"rows"|DataViewDefinition|DataResourceRelationDefinition|DataViewCascadeDefinition|lingma_sys_/)
    session.dispose()

    const reopened = await open(f.target)
    expect(DataSpaceDesignApi.readInputParameters({value: view(reopened.metadataDataSet, 'Base_DataSet').rows[0]?.['inputParams']})
      .map(item => item['Name'])).toEqual(['region', 'category'])
    expect(view(reopened.metadataDataSet, 'DataViewDefinition').rows).toHaveLength(5)
    expect(reopened.definitionDataSet?.resourceRelations).toEqual([relation])
    expect(reopened.definitionDataSet?.viewCascades).toEqual([cascade])

    const dataSet = await loadLowcodeRuntimeScenario({projectId: 'CHAIN-APP', scenarioId: f.target})
    runtimes.push(dataSet)
    expect(dataSet).not.toBe(reopened.definitionDataSet)
    const orders = view(dataSet, 'OrderTable'), choices = view(dataSet, 'ChoiceTable'), editing = view(dataSet, 'OrderTable', 'edit')
    const statistics = view(dataSet, 'ChoiceTable', 'statistics')
    expect((await orders.loadFromServer()).success).toBe(true)
    choices.pageSize = 1
    expect((await choices.loadFromServer()).success).toBe(true)
    expect(choices.rows).toHaveLength(1)
    expect(choices.rows[0]?.['amount']).toBe(12)
    expect(choices.total).toBe(4)
    expect(orders.rows[0]?.['doubleMinimum']).toBe(20)
    expect((await statistics.loadFromServer()).success).toBe(true)
    expect(statistics.rows).toHaveLength(1)
    expect(statistics.rows[0]?.['amount']).toBe(15)
    expect(statistics.primaryKey).toBe('')
    expect(f.requests.at(-1)?.data).toMatchObject({OutputFieldMode: 'REQUEST', PageParam: {index: 1, size: 1}, Table: [{Name: 'Choices',
      Fields: [{Name: 'amount', Group: 0, ValueFun: {Type: 'GetGroupData', ValType: 'SUM'}}]}]})
    choices.replaceRows([])
    const requestCount = f.requests.length
    await statistics.refresh()
    expect(f.requests).toHaveLength(requestCount + 1)
    expect(statistics.rows[0]?.['amount']).toBe(15)
    expect(choices.rows).toEqual([])
    expect(JSON.stringify(dataSet.toJson())).not.toContain('$sum')
    expect(editing.rows).toEqual([])
    expect((await editing.loadFromServer()).success).toBe(true)
    editing.setCurrentRow(editing.rows[0]!)
    const address = {tableName: 'OrderTable', viewId: 'edit', field: 'choice'}
    const first = await dataSet.refreshFieldCascade(address)
    expect(first).toMatchObject({status: 'ready', valueStatus: 'invalid'})
    expect(first.options.map(row => row['code'])).toEqual(['EAST'])
    const pageRuntime = new PageRuntime({pageId: 'chain-consumer', scenarioIds: [f.target], loadScenario: async () => dataSet})
    await pageRuntime.load()
    pageRuntimes.push(pageRuntime)
    const Host = defineComponent({setup() {
      useSparkComponent({type: 'chain-consumer'}).sparkProvide(PAGE_RUNTIME, pageRuntime)
      return () => h(RendererForm, {dataViewKey: `${f.target}@Orders@edit`, contextDataMember: 'currentRow',
        autoColumns: false, showDataViewMeta: false}, {default: () => h(FieldText, {field: 'region', label: '区域'})})
    }})
    const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()]}})
    wrappers.push(wrapper)
    await wrapper.getComponent(FieldText).get('input').setValue('west')
    await flushPromises()
    await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address)).toMatchObject({status: 'ready', valueStatus: 'empty'}))
    expect(dataSet.getFieldCascadeState(address).options.map(row => row['code'])).toEqual(['WEST'])
    expect(editing.getEditingRow('ORDER-1')).toMatchObject({region: 'west', category: 1, choice: ''})
    expect(orders.rows[0]).toMatchObject({region: 'east', choice: 'OLD|EAST'})
    expect(view(dataSet, 'ChoiceTable', 'choices').rows).toEqual([])
    expect(dataSet.resourceRelations).toEqual([relation])
    await editing.applyEditingRows()
    expect(await editing.saveChanges()).toMatchObject({success: true, data: {savedCount: 1}})
    expect(f.records.get('Orders')).toEqual([{rowid: 'ORDER-1', region: 'west', category: 1, choice: '', minimum: 10}])
    expect(f.files.get(f.target)).toBe(savedFile)
    expect((await editing.loadFromServer()).success).toBe(true)
    expect(editing.rows[0]).toMatchObject({region: 'west', choice: ''})
    f.denyWrite()
    expect((await editing.loadFromServer()).success).toBe(true)
    expect(editing.fieldAccess(editing.rows[0]!, 'choice').write).toBe('denied')
    expect(f.records.get('Base_DataSet')?.find(row => row['rowid'] === 'OTHER')?.['inputParams']).toBe('[]')
  })
})
