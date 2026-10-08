import { config as testUtilsConfig, flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h, markRaw, ref, resolveComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import { describe, expect, it, vi } from 'vitest'
import { PAGE_RUNTIME_SERVICES, registerAllRenderers, Spark, SparkPageRenderer, useSparkComponent } from '@spark-appworks/spark-component'
import { DataSpaceRuntimeApi, type DataSpaceDesignApi } from '@spark-appworks/spark-lowcode-api'
import { PageRuntime, PageTool, ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import { HttpClientBase, isRecord, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'
import { compileFunctions } from '../../../../packages/spark-component/src/page/createSandbox'
import { createPageComponentRegistry } from '../../../../packages/spark-component/src/page/context/page-component-registry'
import { buildPageContext } from '../../../../packages/spark-component/src/page/context/buildPageContext'
import type { PageContext } from '../../../../packages/spark-component/src/page/context/types'
import { LowcodeDataSpaceAssembler } from '../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import DataSpaceDesignGraph from '../../../../src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue'
import DataSpaceParametersEditor from '../../../../src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.vue'

const designId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const catalogId = '90A82E287930A234FEC3E687C94A93EA'
const pageRoot = resolve(process.cwd(), 'config/pages/data-platform/data-space-design')
const routeSnapshot = { path: `/t/tenant/app/__tool/${designId}`, fullPath: `/t/tenant/app/__tool/${designId}?scenarioId=${designId}&dataSpaceId=DS-1&returnTo=%2Ft%2Ftenant%2Fapp%2Fcatalog`,
  name: 'tool', params: { tenantId: 'tenant', projectId: 'app' }, query: { scenarioId: designId,
    additionalScenarioIds: [catalogId], dataSpaceId: 'DS-1', returnTo: '/t/tenant/app/catalog' }, hash: '' }
type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type FormalModelSource = Readonly<{ id: string; name: string; primaryKey: string;
  fields: Array<[string, string, string, boolean]> }>
type RowPermission = Readonly<{ hiddenFields: string[]; maskedFields: string[]; editableFields?: string[] }>
type DesignFixtureOptions = Readonly<{ layout?: string | null; failModelQuery?: boolean; failSave?: boolean; hiddenFields?: string[];
  modelRows?: Record<string, unknown>[]; fieldRows?: Record<string, unknown>[]; inputParams?: unknown;
  relationRows?: Record<string, unknown>[]; targetRows?: Record<string, unknown>[];
  otherParameterRows?: Record<string, unknown>[];
  ignoreModelFilter?: boolean; rowPermissions?: Record<string, RowPermission> }>
type NavigationCall = readonly [string, Record<string, unknown> | undefined]

function model(source: FormalModelSource): FormalModel {
  const { id, name, primaryKey, fields } = source
  return { id, name, metaName: name, sourceName: name, sourceId: '', sourceType: 'database-table', primaryKey,
    businessMain: false, raw: {}, fields: fields.map(([fieldId, canonicalName, type, isPrimaryKey], order) => ({
      id: fieldId, modelId: id, name: canonicalName, canonicalName, type, primaryKey: isPrimaryKey,
      description: '', output: true, computed: false, order, orderType: '', raw: {},
    })) }
}

const formalModels: FormalModel[] = [
  model({ id: '44402ab3-7708-4a12-adaf-5d8a2e42b9ff', name: 'Base_NavigationInfo', primaryKey: 'rowid', fields: [
    ['nav0', 'rowid', 'string', true], ['nav1', 'SysId', 'string', false], ['nav2', 'conid', 'string', false],
    ['nav3', 'prowid', 'string', false], ['nav4', 'FunName', 'string', false], ['nav5', 'name', 'string', false], ['nav6', 'NavigationUrl', 'string', false]] }),
  model({ id: `${catalogId}p000`, name: 'Base_DataSet', primaryKey: 'rowid', fields: [
    ['C29690D7067240CC840539CE0CBEE821', 'rowid', 'varchar', true],
    ['C6F91361CC8C4C44A8F40259B52A19FE', 'Name', 'varchar', false],
    ['1D6C7C64E56346ED83C27CC6C97C7BC8', 'Type', 'varchar', false],
    ['6B5651FBDFD94754B341B298DC269185', 'description', 'varchar', false],
    ['807184E820A348ECAA5FDEC9FA99E07F', 'sysid', 'varchar', false],
    ['19324DE8445D4985AD77F7595E1BF281', 'createuser', 'varchar', false],
    ['7CEB9A4ABABB47BFB5826C5DB3A662E8', 'createtime', 'datetime', false],
  ] }),
  model({ id: `${catalogId}p001`, name: 'Base_UserInfo', primaryKey: 'ID', fields: [['u0', 'ROWID', 'string', false], ['u1', 'ID', 'string', true], ['u2', 'UserName', 'string', false]] }),
  model({ id: 'a30f1b5b-4a2f-432c-aa71-1b597bc36e11', name: 'Base_DataModel_Field', primaryKey: 'rowid', fields: [['catf0', 'rowid', 'string', true]] }),
  model({ id: 'acb04903-043f-4c99-9a57-a8e9bc95ce72', name: 'Base_AppSystemList', primaryKey: 'rowid', fields: [['app0', 'rowid', 'string', true]] }),
  model({ id: 'e9f6c362-9ec9-4d77-bf62-cdcb5d2c1bbb', name: 'Base_DataModel', primaryKey: 'rowid', fields: [['catm0', 'rowid', 'string', true]] }),
  model({ id: `${designId}p000`, name: 'Base_DataSet', primaryKey: 'rowid', fields: [['p0r', 'rowid', 'string', true], ['p0i', 'inputParams', 'string', false],
    ['p0d', 'description', 'string', false]] }),
  model({ id: `${designId}p001`, name: 'Base_DataModel', primaryKey: 'rowid', fields: [['m0', 'rowid', 'string', true], ['m1', 'MetaName', 'string', false],
    ['m2', 'description', 'string', false], ['m3', 'Type', 'string', false], ['m4', 'dataSetId', 'string', false]] }),
  model({ id: `${designId}p002`, name: 'Base_DataModel_Field', primaryKey: 'rowid', fields: [['f0', 'rowid', 'string', true], ['f1', 'Name', 'string', false],
    ['f2', 'AsName', 'string', false], ['f3', 'FieldType', 'string', false], ['f4', 'IsOutput', 'boolean', false],
    ['f5', 'IsPKey', 'number', false], ['f6', 'dataSetId', 'string', false], ['f7', 'dataModelId', 'string', false]] }),
  model({ id: `${designId}p003`, name: 'Base_DataModel_Relation', primaryKey: 'rowid', fields: [['rel0', 'rowid', 'string', true],
    ['rel1', 'dataSetId', 'string', false], ['rel2', 'parentModId', 'string', false], ['rel3', 'childModId', 'string', false],
    ['rel4', 'depType', 'string', false], ['rel5', 'filter', 'string', false], ['rel6', 'cascadeDel', 'boolean', false]] }),
]

class DesignHttpClient extends HttpClientBase {
  public readonly requests: RequestConfig[] = []
  public readonly saveRequests: RequestConfig[] = []
  public hiddenFields: string[] = []
  public failModelQuery = false
  public parameterQueryFailures = 0
  public failSave = false
  public modelRows: Record<string, unknown>[] | undefined
  public fieldRows: Record<string, unknown>[] | undefined
  public relationRows: Record<string, unknown>[] | undefined
  public targetRows: Record<string, unknown>[] | undefined
  public otherParameterRows: Record<string, unknown>[] = []
  public inputParams: unknown
  public rowPermissions: Record<string, RowPermission> = {}
  public maskedFields: string[] = []
  public ignoreModelFilter = false
  public queryGate: Promise<void> | undefined
  public queryStarted: (() => void) | undefined
  public parameterQueryGate: Promise<void> | undefined
  public parameterQueryStarted: (() => void) | undefined
  public saveGate: Promise<void> | undefined
  public saveStarted: (() => void) | undefined

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      this.saveRequests.push(config)
      this.saveStarted?.()
      if (this.saveGate) await this.saveGate
      const commands = Array.isArray(config.data) ? config.data : []
      const command = commands[0] ? record(commands[0]) : {}
      const crud = isRecord(command['CrudModel']) ? command['CrudModel'] : {}
      const changed = Array.isArray(crud['Changed']) ? crud['Changed'].filter(isRecord) : []
      const returnedRows = changed.map(row => ({ ...row }))
      if (this.failSave) throw new Error('fixture connection lost after save dispatch')
      const savedRow = returnedRows[0]
      if (record(config.headers)['x-FormKey'] === designId && savedRow
        && Object.prototype.hasOwnProperty.call(savedRow, 'inputParams')) {
        this.inputParams = savedRow['inputParams']
      }
      return { data: { Code: 200, Result: { maplistedit: [{ Base_DataSet: returnedRows }] } },
        status: 200, statusText: 'OK', headers: {} }
    }
    const body = isRecord(config.data) ? config.data : {}
    const table = Array.isArray(body['Table']) && isRecord(body['Table'][0]) ? body['Table'][0] : {}
    const name = String(table['Name'] ?? '')
    const queryFilter = isRecord(table['Filter']) ? table['Filter'] : {}
    const queryValueFun = isRecord(queryFilter['ValueFun']) ? queryFilter['ValueFun'] : {}
    if (name === 'Base_DataSet' && record(config.headers)['x-FormKey'] === designId
      && queryFilter['Field'] === 'rowid' && queryValueFun['Value'] === 'DS-1' && this.parameterQueryFailures > 0) {
      this.parameterQueryFailures -= 1
      throw new Error('fixture parameter readback unavailable')
    }
    if (this.parameterQueryGate && name === 'Base_DataSet' && record(config.headers)['x-FormKey'] === designId
      && queryFilter['Field'] === 'rowid' && queryValueFun['Value'] === 'DS-1') {
      this.parameterQueryStarted?.()
      await this.parameterQueryGate
    }
    if (this.queryGate && name === 'Base_DataModel') {
      this.queryStarted?.()
      await this.queryGate
    }
    if (this.failModelQuery && name === 'Base_DataModel') throw new Error('fixture query failure')
    let source: Record<string, unknown>[] = name === 'Base_DataSet' && record(config.headers)['x-FormKey'] === catalogId
      ? this.targetRows ?? [{ rowid: 'DS-1', Name: '目标空间', Type: '数据库', description: '只读描述', sysid: 'app' }]
      : name === 'Base_DataSet' ? [{ rowid: 'DS-1', inputParams: this.inputParams ?? null }, ...this.otherParameterRows]
      : name === 'Base_DataModel' ? this.modelRows ?? [{ rowid: 'MODEL-1', MetaName: '模型甲', description: '正式模型描述', Type: '表', dataSetId: 'DS-1' }]
      : name === 'Base_DataModel_Field' ? this.fieldRows ?? [{ rowid: 'FIELD-1', AsName: '字段甲', FieldType: 'varchar', IsOutput: true, IsPKey: 1,
        dataSetId: 'DS-1', dataModelId: 'MODEL-1' }]
      : name === 'Base_DataModel_Relation' ? this.relationRows ?? [] : []
    const explicitFields = Array.isArray(table['Fields']) ? table['Fields'] : []
    const requested = explicitFields.map(field => isRecord(field) ? field['Name'] : undefined).filter((field): field is string => typeof field === 'string')
    source = source.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => requested.includes(key))))
    const filtered = source.filter(row => {
      if (this.ignoreModelFilter && name === 'Base_DataModel') return true
      const filter = isRecord(table['Filter']) ? table['Filter'] : {}
      const valueFun = isRecord(filter['ValueFun']) ? filter['ValueFun'] : {}
      const field = filter['Field']
      return typeof field !== 'string' || String(row[field] ?? '') === String(valueFun['Value'] ?? '')
    })
    const page = isRecord(body['PageParam']) ? body['PageParam'] : {}
    const size = typeof page['size'] === 'number' ? page['size'] : filtered.length
    const index = typeof page['index'] === 'number' ? page['index'] : 1
    const rows = filtered.slice((index - 1) * size, index * size).map(row => {
      const permission = this.rowPermissions[String(row['rowid'])]
      return { ...row, lingma_sys_key: row['rowid'], lingma_sys_params: { r: [],
        h: permission?.hiddenFields ?? this.hiddenFields, m: permission?.maskedFields ?? this.maskedFields,
        e: permission?.editableFields ?? [], d: false } }
    })
    return { data: { Code: 200, Result: { primaryKeyField: 'rowid', allowAdd: false,
      data: { Items: rows, Count: filtered.length } } }, status: 200, statusText: 'OK', headers: {} }
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('expected object')
  return value
}

function expectTargetParameterQueries(requests: readonly RequestConfig[], expectedCount: number): void {
  const queries = requests.filter(request => {
    const tables = isRecord(request.data) ? request.data['Table'] : undefined
    return isRecord(request.headers) && request.headers['x-FormKey'] === designId && Array.isArray(tables)
      && isRecord(tables[0]) && tables[0]['Name'] === 'Base_DataSet'
  })
  expect(queries).toHaveLength(expectedCount)
  for (const request of queries) {
    const tables = record(request.data)['Table']
    if (!Array.isArray(tables) || !isRecord(tables[0])) throw new Error('parameter query table is missing')
    const table = tables[0]
    expect(table['Filter']).toMatchObject({ Field: 'rowid', ValueFun: { Value: 'DS-1' } })
    const fields = table['Fields']
    if (!Array.isArray(fields)) throw new Error('parameter query fields are missing')
    expect(fields.filter(isRecord).map(field => field['Name']).sort()).toEqual(['inputParams', 'rowid'])
  }
}

async function createDesignFixture(options: DesignFixtureOptions = {}) {
  const http = new DesignHttpClient()
  http.failModelQuery = options.failModelQuery ?? false
  http.failSave = options.failSave ?? false
  http.hiddenFields = options.hiddenFields ?? []
  http.modelRows = options.modelRows
  http.fieldRows = options.fieldRows
  http.relationRows = options.relationRows
  http.targetRows = options.targetRows
  http.otherParameterRows = options.otherParameterRows ?? []
  http.inputParams = options.inputParams
  http.ignoreModelFilter = options.ignoreModelFilter ?? false
  http.rowPermissions = options.rowPermissions ?? {}
  const runtime = new DataSpaceRuntimeApi({ http, readScope: () => ({ token: 'design-test-scope', headers: {} }) })
  const assemblies = new Map<string, ReturnType<LowcodeDataSpaceAssembler['assemble']>['dataSet']>()
  for (const id of [designId, catalogId]) {
    const text = readFileSync(resolve(id === designId ? pageRoot : 'config/pages/data-platform/data-space-catalog', 'pagedata.json'), 'utf8')
    const config = new ScenarioViewConfig(id, text)
    assemblies.set(id, new LowcodeDataSpaceAssembler(runtime, http).assemble({ config, models: formalModels, relations: [] }).dataSet)
  }
  const tool = markRaw(new PageTool({ pageId: designId }))
  for (const name of ['rule.json', 'script.js', 'style.css'] as const) tool.hydrateFileText(name, readFileSync(resolve(pageRoot, name), 'utf8'))
  tool.markLoaded()
  const pageRuntime = markRaw(new PageRuntime({ tool, scenarioIds: [designId, catalogId], mainScenarioId: designId,
    loadScenario: async id => {
      const dataSet = assemblies.get(id)
      if (!dataSet) throw new Error(`fixture scenario is unavailable: ${id}`)
      return dataSet
    } }))
  await pageRuntime.load()
  const controller = new AbortController()
  const registry = createPageComponentRegistry()
  const navigationCalls: NavigationCall[] = []
  let layoutReadCount = 0
  const readLayout = async () => {
    layoutReadCount += 1
    return options.layout === undefined ? null : options.layout
  }
  const pageService: PageContext['$page'] = {
    copyText: async () => undefined, readDataSpaceLayout: readLayout,
    getDataSet: id => pageRuntime.getDataSet(id), resolveView: binding => pageRuntime.resolveView(binding) ?? undefined,
    showMessage: () => undefined, showConfirm: async () => true, showPrompt: async () => null, showDialog: async () => 'cancel',
    selectEntities: async () => [], browseFiles: async () => [], uploadFiles: async () => [], showAlert: async () => undefined,
    showLoading: () => undefined, navigate: (path, params) => { navigationCalls.push([path, params]) },
  }
  const context = buildPageContext({ pageRuntime, signal: controller.signal, pageRoute: routeSnapshot,
    pageContainer: ref(null), pageService, getComponentRegistry: () => registry,
    dataSpaceLayout: { scenarioId: designId, createReader: () => ({ readDataSpaceLayout: readLayout }) } })
  const functions = compileFunctions(readFileSync(resolve(pageRoot, 'script.js'), 'utf8'), context)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/t/:tenantId/:projectId/__tool/:pageId', component: defineComponent({ render: () => h('div') }) },
  ] })
  await router.push(routeSnapshot.fullPath)
  await router.isReady()
  return { http, pageRuntime, assemblies, registry, functions, controller, router,
    layoutReads: () => layoutReadCount, navigationCalls }
}

function disableRendererStubs(): () => void {
  const stubs = isRecord(testUtilsConfig.global.stubs) ? testUtilsConfig.global.stubs : {}
  const before = { ...stubs }
  delete stubs['SparkComponentRenderer']
  delete stubs['spark-component-renderer']
  delete stubs['el-table']
  delete stubs['el-table-column']
  delete stubs['el-pagination']
  testUtilsConfig.global.stubs = stubs
  return () => { testUtilsConfig.global.stubs = before }
}

const ElementTabsStub = defineComponent({
  name: 'ElTabs',
  setup(_, { slots }) { return () => h('div', { class: 'el-tabs' }, slots['default']?.()) },
})
const ElementTabPaneStub = defineComponent({
  name: 'ElTabPane',
  setup(_, { slots }) { return () => h('section', { class: 'el-tab-pane' }, slots['default']?.()) },
})

describe('data-space design four-file read page', () => {
  it('saves a parameter value and restores exact null through the formal DataSet owner', async () => {
    const fixture = await createDesignFixture({ inputParams: null,
      otherParameterRows: [{ rowid: 'DS-OTHER', inputParams: '[]' }],
      rowPermissions: { 'DS-1': { hiddenFields: [], maskedFields: [], editableFields: ['inputParams'] } } })
    await fixture.functions['__init__']?.()
    const dataSet = fixture.pageRuntime.getDataSet(designId)
    const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataSet@designParameters`)
    if (!dataSet || !view) throw new Error('formal parameter DataSet owner is unavailable')
    expect(view.rows[0]?.['inputParams']).toBeNull()
    const parameterValue = JSON.stringify([{ rowid: 'PARAM-NULL-ROUNDTRIP', Name: '临时参数', Description: '', IsBusParam: false }])
    view.updateEditingValue('DS-1', 'inputParams', parameterValue)
    const saved = await dataSet.saveChanges({ views: [{ tableName: 'Base_DataSet', viewId: 'designParameters', ids: ['DS-1'] }] })
    expect(saved).toMatchObject({ success: true, data: { failedCount: 0, failedEditingRows: 0, savedCount: 1 } })
    const parameterRead = await view.loadFromServer({ fields: ['rowid', 'inputParams'],
      filter: { field: 'rowid', operator: 'eq', value: 'DS-1' }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    expect(parameterRead.success).toBe(true)
    expect(view.rows[0]?.['inputParams']).toBe(parameterValue)

    view.updateEditingValue('DS-1', 'inputParams', null)
    const restored = await dataSet.saveChanges({ views: [{ tableName: 'Base_DataSet', viewId: 'designParameters', ids: ['DS-1'] }] })
    expect(restored).toMatchObject({ success: true, data: { failedCount: 0, failedEditingRows: 0, savedCount: 1 } })
    const restoreRequest = fixture.http.saveRequests[1]
    if (!restoreRequest) throw new Error('formal null restore request is missing')
    const restoreCommands = Array.isArray(restoreRequest.data) ? restoreRequest.data : []
    const restoreCommand = restoreCommands[0] ? record(restoreCommands[0]) : {}
    const restoreCrud = record(restoreCommand['CrudModel'])
    const restoreChanged = Array.isArray(restoreCrud['Changed']) ? restoreCrud['Changed'] : []
    expect(restoreChanged).toHaveLength(1)
    expect(record(restoreChanged[0])).toMatchObject({ rowid: 'DS-1', inputParams: null })
    const restoredRead = await view.loadFromServer({ fields: ['rowid', 'inputParams'],
      filter: { field: 'rowid', operator: 'eq', value: 'DS-1' }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    expect(restoredRead.success).toBe(true)
    expect(view.rows[0]?.['inputParams']).toBeNull()
    expect(fixture.http.saveRequests).toHaveLength(2)
    expectTargetParameterQueries(fixture.http.requests, 3)
  })

  it('projects only current authorized model text into the saved graph beforeRender props', async () => {
    const fixture = await createDesignFixture({
      modelRows: [{ rowid: 'MODEL-1', MetaName: '隐藏模型标题', description: '模型描述', Type: '表', dataSetId: 'DS-1' }],
      fieldRows: [],
      rowPermissions: { 'MODEL-1': { hiddenFields: ['MetaName'], maskedFields: ['description'] } },
      layout: JSON.stringify({ graphVersion: 1, autoGenerated: false,
        nodes: [{ id: 'MODEL-1', x: -10, y: 20, label: '旧标题泄漏', properties: { nodeTitle: '旧属性泄漏' } }], edges: [] }),
    })
    await fixture.functions['__init__']?.()

    const result = fixture.functions['designGraphBeforeRender']?.()
    expect(isRecord(result)).toBe(true)
    if (!isRecord(result)) throw new Error('graph beforeRender did not return a decision')
    expect(result['visible']).toBe(true)
    const props = result['props']
    expect(isRecord(props)).toBe(true)
    if (!isRecord(props)) throw new Error('graph beforeRender did not return component props')
    expect(props['nodes']).toEqual([{ id: 'MODEL-1', x: -10, y: 20, title: '', description: '••••' }])
    expect(JSON.stringify(props)).not.toContain('隐藏模型标题')
    expect(JSON.stringify(props)).not.toContain('旧标题泄漏')
    expect(JSON.stringify(props)).not.toContain('旧属性泄漏')
  })

  it('distinguishes an empty saved graph from a missing layout and hides the graph after identity access fails', async () => {
    const empty = await createDesignFixture({ layout: JSON.stringify({ graphVersion: 1, nodes: [], edges: [] }) })
    await empty.functions['__init__']?.()
    expect(empty.functions['designGraphBeforeRender']?.()).toEqual({ visible: true,
      props: { nodes: [], edges: [] } })

    const missing = await createDesignFixture({ layout: null })
    await missing.functions['__init__']?.()
    expect(missing.functions['designGraphBeforeRender']?.()).toEqual({ visible: false })

    const denied = await createDesignFixture({ hiddenFields: ['rowid'] })
    await denied.functions['__init__']?.()
    expect(denied.functions['designGraphBeforeRender']?.()).toEqual({ visible: false })
  })

  it('reads the routed target through the formal DataViews and reveals declared readonly tables in SparkPageRenderer', async () => {
    registerAllRenderers()
    Spark.register('data-space-design-graph', DataSpaceDesignGraph)
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {}
      public unobserve(): void {}
      public disconnect(): void {}
    })
    const fixture = await createDesignFixture({ inputParams: JSON.stringify([{ id: 'PARAM-1', Name: '客户号',
      Description: '调用方客户标识', IsBusParam: true }]), layout: JSON.stringify({ graphVersion: 1, autoGenerated: false,
      nodes: [{ id: 'MODEL-1', x: 20, y: 30 }], edges: [] }), fieldRows: [
        { rowid: 'FIELD-1', Name: '客户编号', AsName: '', FieldType: 'varchar', IsOutput: true, IsPKey: 1,
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-2', Name: '内部标识', AsName: 'customer_id', FieldType: 'varchar', IsOutput: true, IsPKey: 0,
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
      ], rowPermissions: { 'DS-1': { hiddenFields: [], maskedFields: [], editableFields: ['inputParams'] } } })
    const restore = disableRendererStubs()
    try {
      const errors: string[] = []
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => JSON.stringify({ graphVersion: 1,
          autoGenerated: false, nodes: [{ id: 'MODEL-1', x: 20, y: 30 }], edges: [] }) }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-test-provider', id: 'design-test-provider' })
          context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
          const Renderer = resolveComponent('SparkPageRenderer')
          return () => h(Renderer, { routeSnapshot, pageRuntime: fixture.pageRuntime,
            onRuntimeError: (error: Error) => errors.push(error.message) })
        },
      })
      const wrapper = mount(PageWithServices, { global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
        components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      expect(fixture.pageRuntime.resolveView(`#${catalogId}@Base_DataSet@designTarget`)?.rows).toMatchObject([{ rowid: 'DS-1', Name: '目标空间' }])
      expect(wrapper.text()).toContain('数据空间设计')
      expect(wrapper.text()).toContain('数据空间设计信息已加载')
      expect(wrapper.text()).toContain('目标空间')
      expect(wrapper.text()).toContain('模型甲')
      expect(wrapper.find('[data-testid="data-space-design-graph"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('字段名称')
      expect(wrapper.text()).toContain('规范别名')
      expect(wrapper.text()).toContain('客户编号')
      expect(wrapper.text()).toContain('内部标识')
      expect(wrapper.text()).toContain('customer_id')
      expect(wrapper.text()).toContain('已保存布局')
      expect(wrapper.text()).toContain('名称：客户号')
      expect(wrapper.text()).toContain('描述：调用方客户标识')
      expect(wrapper.text()).toContain('业务参数：是')
      expect(wrapper.text()).not.toContain('Name：客户号')
      expect(wrapper.findAll('button').map(button => button.text())).toEqual(['返回目录', '重新加载', '编辑输入参数'])
      expect(errors).toEqual([])
      expect(fixture.http.requests).toHaveLength(5)
      expect(fixture.http.requests.every(request => request.url !== '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
      expect(fixture.http.requests.every(request => request.method !== 'POST' || !String(request.url).includes('upload'))).toBe(true)
      const reloadButton = wrapper.findAll('button').find(button => button.text() === '重新加载')
      if (!reloadButton) throw new Error('reload button is missing')
      await reloadButton.trigger('click')
      await flushPromises()
      await flushPromises()
      expect(fixture.http.requests).toHaveLength(10)
      expect(wrapper.text()).toContain('数据空间设计信息已加载')
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally { Spark.getRegistry().unregister('data-space-design-graph'); vi.unstubAllGlobals(); restore() }
  })

  it('writes parameter editor changes only to the existing DataView editing overlay', async () => {
    registerAllRenderers()
    Spark.register('data-space-parameters-editor', DataSpaceParametersEditor)
    const originalParameters = JSON.stringify([{ rowid: 'PARAM-1', Name: '客户号', Description: '原描述', IsBusParam: true }])
    const fixture = await createDesignFixture({ inputParams: originalParameters, layout: null,
      rowPermissions: { 'DS-1': { hiddenFields: [], maskedFields: [], editableFields: ['inputParams'] } } })
    const restore = disableRendererStubs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const errors: string[] = []
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => null }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-parameter-edit-test', id: 'design-parameter-edit-test' })
          context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
          const Renderer = resolveComponent('SparkPageRenderer')
          return () => h(Renderer, { routeSnapshot, pageRuntime: fixture.pageRuntime,
            onRuntimeError: (error: Error) => errors.push(error.message) })
        },
      })
      let wrapper = mount(PageWithServices, { attachTo: container,
        global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
          components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      const editButton = wrapper.findAll('button').find(button => button.text().includes('编辑输入参数'))
      if (!editButton) throw new Error('parameter editor entry is missing')
      const parameterView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataSet@designParameters`)
      const parameterRow = parameterView?.rows[0]
      expect(parameterRow).toBeDefined()
      if (!parameterView || !parameterRow) throw new Error('formal input parameter view is missing')
      expect(parameterView.editActionState(parameterRow)).toBe('enabled')
      expect(parameterView.fieldAccess(parameterRow, 'rowid').read).toBe('visible')
      expect(parameterView.fieldAccess(parameterRow, 'inputParams')).toMatchObject({ read: 'visible', write: 'allowed' })
      await editButton.trigger('click')
      await flushPromises()
      const nameInput = document.body.querySelector<HTMLInputElement>('input[aria-label="名称 1"]')
      if (!nameInput) throw new Error('parameter editor input is missing')
      nameInput.value = ' 新客户号 '
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataSet@designParameters`)
      expect(view?.getEditingRow('DS-1')?.['inputParams']).toBe(
        JSON.stringify([{ rowid: 'PARAM-1', Name: ' 新客户号 ', Description: '原描述', IsBusParam: true }]),
      )
      expect(view?.rows[0]?.['inputParams']).toBe(originalParameters)
      expect(fixture.http.requests.every(request => request.url !== '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
      expect(errors).toEqual([])
      const requestCountBeforeRemount = fixture.http.requests.length
      wrapper.unmount()
      wrapper = mount(PageWithServices, { attachTo: container,
        global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
          components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      expect(fixture.http.requests).toHaveLength(requestCountBeforeRemount)
      const remountedEditButton = wrapper.findAll('button').find(button => button.text().includes('编辑输入参数'))
      if (!remountedEditButton) throw new Error('parameter editor entry is missing after remount')
      await remountedEditButton.trigger('click')
      await flushPromises()
      const remountedInput = document.body.querySelector<HTMLInputElement>('input[aria-label="名称 1"]')
      expect(remountedInput?.value).toBe(' 新客户号 ')
      if (!remountedInput) throw new Error('parameter editor input is missing after remount')
      remountedInput.value = ''
      remountedInput.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      const invalidSave = Array.from(document.body.querySelectorAll('button'))
        .find(button => button.textContent?.includes('确认保存'))
      if (!invalidSave) throw new Error('parameter save action is missing after remount')
      invalidSave.click()
      await flushPromises()
      expect(view?.getEditingRow('DS-1')?.['inputParams']).toContain('"Name":""')
      expect(fixture.http.saveRequests).toHaveLength(0)
      const cancelButton = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.includes('取消'))
      if (!cancelButton) throw new Error('parameter editor cancel button is missing')
      cancelButton.click()
      await flushPromises()
      expect(view?.getEditingRow('DS-1')?.['inputParams']).toBe(originalParameters)
      expect(fixture.http.requests.every(request => request.url !== '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
      wrapper.unmount()
    } finally {
      container.remove()
      vi.unstubAllGlobals()
      Spark.getRegistry().unregister('data-space-parameters-editor')
      restore()
    }
  })

  it('hides parameter editing without E permission and performs no write', async () => {
    registerAllRenderers()
    Spark.register('data-space-parameters-editor', DataSpaceParametersEditor)
    const fixture = await createDesignFixture({ inputParams: '[]', layout: null })
    const restore = disableRendererStubs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const errors: string[] = []
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => null }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-parameter-deny-test', id: 'design-parameter-deny-test' })
          context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
          const Renderer = resolveComponent('SparkPageRenderer')
          return () => h(Renderer, { routeSnapshot, pageRuntime: fixture.pageRuntime,
            onRuntimeError: (error: Error) => errors.push(error.message) })
        },
      })
      const wrapper = mount(PageWithServices, { attachTo: container,
        global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
          components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataSet@designParameters`)
      const row = view?.rows[0]
      expect(row).toBeDefined()
      if (!view || !row) throw new Error('formal input parameter view is missing')
      expect(view.editActionState(row)).toBe('hidden')
      expect(view.fieldAccess(row, 'inputParams')).toMatchObject({ read: 'visible', write: 'denied' })
      expect(wrapper.findAll('button').some(button => button.text().includes('编辑输入参数'))).toBe(false)
      expect(document.body.querySelector('input[aria-label="名称 1"]')).toBeNull()
      expect(fixture.http.requests.every(request => request.url !== '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally {
      container.remove()
      vi.unstubAllGlobals()
      Spark.getRegistry().unregister('data-space-parameters-editor')
      restore()
    }
  })

  it.each([
    { label: 'hidden', hiddenFields: ['inputParams'], maskedFields: [] },
    { label: 'masked', hiddenFields: [], maskedFields: ['inputParams'] },
  ])('does not expose or edit $label inputParams values', async permission => {
    registerAllRenderers()
    const secret = '参数权限保护值'
    const fixture = await createDesignFixture({ inputParams: JSON.stringify([{ rowid: 'SECRET-1', Name: secret }]), layout: null,
      rowPermissions: { 'DS-1': { hiddenFields: permission.hiddenFields, maskedFields: permission.maskedFields } } })
    const restore = disableRendererStubs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const errors: string[] = []
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => null }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: `design-parameter-${permission.label}-test`, id: `design-parameter-${permission.label}-test` })
          context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
          const Renderer = resolveComponent('SparkPageRenderer')
          return () => h(Renderer, { routeSnapshot, pageRuntime: fixture.pageRuntime,
            onRuntimeError: (error: Error) => errors.push(error.message) })
        },
      })
      const wrapper = mount(PageWithServices, { attachTo: container,
        global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
          components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataSet@designParameters`)
      const row = view?.rows[0]
      expect(row).toBeDefined()
      if (!view || !row) throw new Error('formal input parameter view is missing')
      expect(view.fieldAccess(row, 'inputParams').read).not.toBe('visible')
      expect(wrapper.html()).not.toContain(secret)
      expect(document.body.querySelector('input[aria-label="名称 1"]')).toBeNull()
      expect(wrapper.findAll('button').some(button => button.text().includes('编辑输入参数'))).toBe(false)
      expect(fixture.http.saveRequests).toHaveLength(0)
      expect(fixture.layoutReads()).toBe(0)
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally {
      container.remove()
      vi.unstubAllGlobals()
      Spark.getRegistry().unregister('data-space-parameters-editor')
      restore()
    }
  })

  it('keeps legacy malformed parameter values readable but rejects opening the editor', async () => {
    registerAllRenderers()
    const fixture = await createDesignFixture({ inputParams: JSON.stringify([{ rowid: 'PARAM-LEGACY', Name: null,
      Description: '历史描述', IsBusParam: 'legacy-value' }]), layout: null,
      rowPermissions: { 'DS-1': { hiddenFields: [], maskedFields: [], editableFields: ['inputParams'] } } })
    const restore = disableRendererStubs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const errors: string[] = []
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => null }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-parameter-legacy-read-test', id: 'design-parameter-legacy-read-test' })
          context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
          const Renderer = resolveComponent('SparkPageRenderer')
          return () => h(Renderer, { routeSnapshot, pageRuntime: fixture.pageRuntime,
            onRuntimeError: (error: Error) => errors.push(error.message) })
        },
      })
      const wrapper = mount(PageWithServices, { attachTo: container,
        global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
          components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      expect(wrapper.text()).toContain('数据空间设计信息已加载')
      expect(wrapper.find('.design-parameter').exists()).toBe(true)
      const editButton = wrapper.findAll('button').find(button => button.text().includes('编辑输入参数'))
      if (!editButton) throw new Error('parameter editor entry is missing')
      await editButton.trigger('click')
      await flushPromises()
      expect(document.body.querySelector('input[aria-label="名称 1"]')).toBeNull()
      expect(fixture.http.saveRequests).toHaveLength(0)
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally {
      container.remove()
      vi.unstubAllGlobals()
      Spark.getRegistry().unregister('data-space-parameters-editor')
      restore()
    }
  })

  it('saves the normalized parameter array through the formal design DataSet and reads it back', async () => {
    registerAllRenderers()
    Spark.register('data-space-parameters-editor', DataSpaceParametersEditor)
    const legacyParameter = { name: '旧别名参数', description: ' 保留空格 ', isBusParam: '未知扩展属性', extra: { retained: true } }
    const fixture = await createDesignFixture({ inputParams: JSON.stringify([{ rowid: 'PARAM-1', Name: '客户号',
      Description: '原描述', IsBusParam: true }, legacyParameter]), layout: null,
    otherParameterRows: [{ rowid: 'DS-OTHER', inputParams: '[]' }],
    rowPermissions: { 'DS-1': { hiddenFields: [], maskedFields: [], editableFields: ['inputParams'] } } })
    let releaseReadback: (() => void) | undefined
    let notifyReadbackStarted: (() => void) | undefined
    const readbackStarted = new Promise<void>(resolve => { notifyReadbackStarted = resolve })
    const restore = disableRendererStubs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const errors: string[] = []
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => null }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-parameter-save-test', id: 'design-parameter-save-test' })
          context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
          const Renderer = resolveComponent('SparkPageRenderer')
          return () => h(Renderer, { routeSnapshot, pageRuntime: fixture.pageRuntime,
            onRuntimeError: (error: Error) => errors.push(error.message) })
        },
      })
      const wrapper = mount(PageWithServices, { attachTo: container,
        global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
          stubs: { transition: false, Transition: false, transitionGroup: false, TransitionGroup: false },
          components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      const rendererState = (wrapper.findComponent(SparkPageRenderer).vm as unknown as { $: { setupState: Record<string, unknown> } }).$.setupState
      const registry = rendererState['componentRegistry'] as { getApi: (id: string) => { isVisible: () => boolean } | null }
      const scriptFunctions = rendererState['functions'] as Record<string, (() => void) | undefined>
      const cancelEditor = scriptFunctions['designCancelParameterEditor']
      if (!cancelEditor) throw new Error('parameter close callback is missing')
      let closeCallbackCount = 0
      scriptFunctions['designCancelParameterEditor'] = () => { closeCallbackCount += 1; cancelEditor() }
      fixture.http.parameterQueryGate = new Promise<void>(resolve => { releaseReadback = resolve })
      fixture.http.parameterQueryStarted = () => { notifyReadbackStarted?.() }
      const editButton = wrapper.findAll('button').find(button => button.text().includes('编辑输入参数'))
      if (!editButton) throw new Error('parameter editor entry is missing')
      await editButton.trigger('click')
      await flushPromises()
      const nameInput = document.body.querySelector<HTMLInputElement>('input[aria-label="名称 1"]')
      if (!nameInput) throw new Error('parameter editor input is missing')
      nameInput.value = ' 新客户号 '
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      const saveButton = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.includes('确认保存'))
      if (!saveButton) throw new Error('parameter editor save button is missing')
      saveButton.click()
      await readbackStarted
      await new Promise(resolve => setTimeout(resolve, 500))
      const liveParameterView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataSet@designParameters`)
      expect(liveParameterView?.requestState).toBe(2)
      expect(closeCallbackCount).toBeGreaterThan(0)
      expect(registry.getApi('design-parameters-dialog')?.isVisible()).toBe(false)
      expect(document.body.querySelector('input[aria-label="名称 1"]')).toBeNull()
      releaseReadback?.()
      await flushPromises()
      await flushPromises()
      expect(registry.getApi('design-parameters-dialog')?.isVisible()).toBe(false)
      expect(fixture.http.saveRequests).toHaveLength(1)
      const saveRequest = fixture.http.saveRequests[0]
      if (!saveRequest) throw new Error('formal save request is missing')
      expect(saveRequest).toMatchObject({ url: '/api/DataOperation/BatchTableOperateRequestByCRUD', method: 'POST',
        headers: { 'x-FormKey': designId } })
      const saveModels = Array.isArray(saveRequest.data) ? saveRequest.data : []
      const saveModel = saveModels[0] ? record(saveModels[0]) : {}
      expect(saveModel['TableName']).toBe('Base_DataSet')
      const saveCrud = record(saveModel['CrudModel'])
      const changed = Array.isArray(saveCrud['Changed']) ? saveCrud['Changed'] : []
      expect(changed).toHaveLength(1)
      const expectedParameters = [
        { rowid: 'PARAM-1', Name: '新客户号', Description: '原描述', IsBusParam: true }, legacyParameter,
      ]
      expect(changed[0]).toMatchObject({ rowid: 'DS-1', inputParams: JSON.stringify(expectedParameters) })
      const parameterView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataSet@designParameters`)
      expect(wrapper.text()).toContain('数据空间设计信息已加载')
      expect(parameterView?.rows).toHaveLength(1)
      expect(parameterView?.rows).toMatchObject([{ rowid: 'DS-1', inputParams: JSON.stringify(expectedParameters) }])
      const parameterReads = fixture.http.requests.filter(request => {
        const tables = isRecord(request.data) ? request.data['Table'] : undefined
        return isRecord(request.headers) && request.headers['x-FormKey'] === designId && Array.isArray(tables)
          && isRecord(tables[0]) && tables[0]['Name'] === 'Base_DataSet'
      })
      expect(parameterReads).toHaveLength(2)
      for (const request of parameterReads) {
        const body = record(request.data)
        const tables = body['Table']
        if (!Array.isArray(tables) || !isRecord(tables[0])) throw new Error('parameter query table is missing')
        const table = tables[0]
        expect(table['Filter']).toMatchObject({ Field: 'rowid', ValueFun: { Value: 'DS-1' } })
        const requestedFields = table['Fields']
        if (!Array.isArray(requestedFields)) throw new Error('parameter query fields are missing')
        expect(requestedFields.filter(isRecord).map(field => field['Name']).sort()).toEqual(['inputParams', 'rowid'])
      }
      expect(wrapper.text()).toContain('名称：新客户号')
      expect(document.body.querySelector('input[aria-label="名称 1"]')).toBeNull()
      const editAgain = wrapper.findAll('button').find(button => button.text().includes('编辑输入参数'))
      if (!editAgain) throw new Error('parameter editor entry is missing after save')
      await editAgain.trigger('click')
      await flushPromises()
      const unchangedInput = document.body.querySelector<HTMLInputElement>('input[aria-label="名称 1"]')
      if (!unchangedInput) throw new Error('parameter name input is missing after save')
      unchangedInput.value = ' 新客户号 '
      unchangedInput.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      const unchangedSave = Array.from(document.body.querySelectorAll('button'))
        .find(button => button.textContent?.includes('确认保存'))
      if (!unchangedSave) throw new Error('parameter save action is missing after save')
      unchangedSave.click()
      await flushPromises()
      expect(fixture.http.saveRequests).toHaveLength(1)
      expect(parameterView?.rows[0]?.['inputParams']).toBe(JSON.stringify(expectedParameters))
      const editForDelete = wrapper.findAll('button').find(button => button.text().includes('编辑输入参数'))
      if (!editForDelete) throw new Error('parameter editor entry is missing before deleting the preceding item')
      await editForDelete.trigger('click')
      await flushPromises()
      const removeFirst = document.body.querySelector<HTMLButtonElement>('button[aria-label="删除参数 1"]')
      if (!removeFirst) throw new Error('first parameter delete action is missing')
      removeFirst.click()
      await flushPromises()
      const retainedLegacy = document.body.querySelector<HTMLInputElement>('input[aria-label="名称 1"]')
      expect(retainedLegacy?.value).toBe('旧别名参数')
      const saveAfterDelete = Array.from(document.body.querySelectorAll('button'))
        .find(button => button.textContent?.includes('确认保存'))
      if (!saveAfterDelete) throw new Error('parameter save action is missing after deletion')
      saveAfterDelete.click()
      await flushPromises()
      expect(fixture.http.saveRequests).toHaveLength(2)
      const deleteSaveCommand = record((Array.isArray(fixture.http.saveRequests[1]?.data)
        ? fixture.http.saveRequests[1]?.data : [])[0])
      const deleteSaveCrud = record(deleteSaveCommand['CrudModel'])
      const deleteChanged = Array.isArray(deleteSaveCrud['Changed']) ? deleteSaveCrud['Changed'] : []
      expect(record(deleteChanged[0])['inputParams']).toBe(JSON.stringify([legacyParameter]))
      expect(parameterView?.rows[0]?.['inputParams']).toBe(JSON.stringify([legacyParameter]))
      expectTargetParameterQueries(fixture.http.requests, 3)
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally {
      releaseReadback?.()
      container.remove()
      vi.unstubAllGlobals()
      Spark.getRegistry().unregister('data-space-parameters-editor')
      restore()
    }
  })

  it('offers recovery outside the page gate when an editing overlay cannot rebuild after remount', async () => {
    registerAllRenderers()
    Spark.register('data-space-parameters-editor', DataSpaceParametersEditor)
    const original = JSON.stringify([{ rowid: 'PARAM-1', Name: '客户号', Description: '原描述', IsBusParam: true }])
    const fixture = await createDesignFixture({ inputParams: original, layout: null,
      rowPermissions: { 'DS-1': { hiddenFields: [], maskedFields: [], editableFields: ['inputParams'] } } })
    let failLayout = false
    const restore = disableRendererStubs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const errors: string[] = []
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => {
          if (failLayout) throw new Error('fixture layout reader unavailable')
          return null
        } }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-parameter-failed-remount-test', id: 'design-parameter-failed-remount-test' })
          context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
          const Renderer = resolveComponent('SparkPageRenderer')
          return () => h(Renderer, { routeSnapshot, pageRuntime: fixture.pageRuntime,
            onRuntimeError: (error: Error) => errors.push(error.message) })
        },
      })
      let wrapper = mount(PageWithServices, { attachTo: container,
        global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
          components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      const editButton = wrapper.findAll('button').find(button => button.text().includes('编辑输入参数'))
      if (!editButton) throw new Error('parameter editor entry is missing')
      await editButton.trigger('click')
      await flushPromises()
      const input = document.body.querySelector<HTMLInputElement>('input[aria-label="名称 1"]')
      if (!input) throw new Error('parameter editor input is missing')
      input.value = '待放弃草稿'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataSet@designParameters`)
      expect(view?.hasEditingChanges('DS-1')).toBe(true)
      failLayout = true
      wrapper.unmount()
      wrapper = mount(PageWithServices, { attachTo: container,
        global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
          components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      expect(wrapper.text()).toContain('本地参数草稿未能重建')
      const discardButton = wrapper.findAll('button').find(button => button.text().includes('放弃本地修改并重新读取'))
      if (!discardButton) throw new Error('recovery action is hidden behind the failed page gate')
      failLayout = false
      await discardButton.trigger('click')
      await flushPromises()
      const confirmDiscard = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.el-message-box__btns button'))
        .find(button => button.textContent?.includes('确定'))
      if (!confirmDiscard) throw new Error('local discard confirmation button is missing')
      confirmDiscard.click()
      await flushPromises()
      await flushPromises()
      expect(view?.hasEditingChanges('DS-1')).toBe(false)
      expect(view?.dirtyTracking.hasPendingChanges('DS-1')).toBe(false)
      expect(view?.rows[0]?.['inputParams']).toBe(original)
      expect(wrapper.text()).toContain('数据空间设计信息已加载')
      expect(wrapper.text()).not.toContain('放弃本地修改并重新读取')
      expect(fixture.http.saveRequests).toHaveLength(0)
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally {
      container.remove()
      vi.unstubAllGlobals()
      Spark.getRegistry().unregister('data-space-parameters-editor')
      restore()
    }
  })

  it('keeps an in-flight DataView save single-owner across renderer remount', async () => {
    registerAllRenderers()
    Spark.register('data-space-parameters-editor', DataSpaceParametersEditor)
    const fixture = await createDesignFixture({ inputParams: JSON.stringify([{ rowid: 'PARAM-1', Name: '客户号',
      Description: '原描述', IsBusParam: true }]), layout: null,
      rowPermissions: { 'DS-1': { hiddenFields: [], maskedFields: [], editableFields: ['inputParams'] } } })
    let releaseSave: (() => void) | undefined
    let notifySaveStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { notifySaveStarted = resolve })
    fixture.http.saveGate = new Promise<void>(resolve => { releaseSave = resolve })
    fixture.http.saveStarted = () => { notifySaveStarted?.() }
    const restore = disableRendererStubs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const errors: string[] = []
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => null }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-parameter-save-remount-test', id: 'design-parameter-save-remount-test' })
          context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
          const Renderer = resolveComponent('SparkPageRenderer')
          return () => h(Renderer, { routeSnapshot, pageRuntime: fixture.pageRuntime,
            onRuntimeError: (error: Error) => errors.push(error.message) })
        },
      })
      let wrapper = mount(PageWithServices, { attachTo: container,
        global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
          components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      const editButton = wrapper.findAll('button').find(button => button.text().includes('编辑输入参数'))
      if (!editButton) throw new Error('parameter editor entry is missing')
      await editButton.trigger('click')
      await flushPromises()
      const input = document.body.querySelector<HTMLInputElement>('input[aria-label="名称 1"]')
      if (!input) throw new Error('parameter editor input is missing')
      input.value = '保存中重挂载'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      const saveButton = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.includes('确认保存'))
      if (!saveButton) throw new Error('parameter editor save button is missing')
      saveButton.click()
      await started
      const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataSet@designParameters`)
      expect(view?.mutating).toBe(true)
      const requestsBeforeRemount = fixture.http.requests.length
      wrapper.unmount()
      wrapper = mount(PageWithServices, { attachTo: container,
        global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
          components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      expect(fixture.http.requests).toHaveLength(requestsBeforeRemount)
      expect(fixture.http.saveRequests).toHaveLength(1)
      expect(view?.mutating).toBe(true)
      releaseSave?.()
      await flushPromises()
      await flushPromises()
      expect(view?.mutating).toBe(false)
      expect(fixture.http.saveRequests).toHaveLength(1)
      expect(fixture.http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD'))
        .toHaveLength(1)
      expect(wrapper.text()).not.toContain('放弃本地修改并重新读取')
      expect(wrapper.text()).toContain('重新读取')
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally {
      releaseSave?.()
      container.remove()
      vi.unstubAllGlobals()
      Spark.getRegistry().unregister('data-space-parameters-editor')
      restore()
    }
  })

  it('keeps unknown-save changes when the user cancels the actual discard confirmation', async () => {
    registerAllRenderers()
    Spark.register('data-space-parameters-editor', DataSpaceParametersEditor)
    const original = JSON.stringify([{ rowid: 'PARAM-1', Name: '客户号', Description: '原描述', IsBusParam: true }])
    const fixture = await createDesignFixture({ inputParams: original, layout: null, failSave: true,
      otherParameterRows: [{ rowid: 'DS-OTHER', inputParams: '[]' }],
      rowPermissions: { 'DS-1': { hiddenFields: [], maskedFields: [], editableFields: ['inputParams'] } } })
    const restore = disableRendererStubs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const errors: string[] = []
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => null }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-parameter-cancel-discard-test', id: 'design-parameter-cancel-discard-test' })
          context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
          const Renderer = resolveComponent('SparkPageRenderer')
          return () => h(Renderer, { routeSnapshot, pageRuntime: fixture.pageRuntime,
            onRuntimeError: (error: Error) => errors.push(error.message) })
        },
      })
      const wrapper = mount(PageWithServices, { attachTo: container,
        global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
          components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      const editButton = wrapper.findAll('button').find(button => button.text().includes('编辑输入参数'))
      if (!editButton) throw new Error('parameter editor entry is missing')
      await editButton.trigger('click')
      await flushPromises()
      const input = document.body.querySelector<HTMLInputElement>('input[aria-label="名称 1"]')
      if (!input) throw new Error('parameter editor input is missing')
      input.value = '保留本地修改'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      const saveButton = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.includes('确认保存'))
      if (!saveButton) throw new Error('parameter editor save button is missing')
      saveButton.click()
      await flushPromises()
      await flushPromises()
      const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataSet@designParameters`)
      expect(fixture.http.saveRequests).toHaveLength(1)
      expect(view?.dirtyTracking.hasPendingChanges('DS-1')).toBe(true)
      const discardButton = wrapper.findAll('button').find(button => button.text().includes('放弃本地修改并重新读取'))
      if (!discardButton) throw new Error('unknown-save recovery action is missing')
      await discardButton.trigger('click')
      await flushPromises()
      const cancel = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.el-message-box__btns button'))
        .reverse().find(button => button.textContent?.includes('取消'))
      if (!cancel) throw new Error('local discard cancel button is missing')
      cancel.click()
      await flushPromises()
      expect(view?.dirtyTracking.hasPendingChanges('DS-1')).toBe(true)
      expect(view?.rows[0]?.['inputParams']).toContain('保留本地修改')
      expect(fixture.http.saveRequests).toHaveLength(1)
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally {
      container.remove()
      vi.unstubAllGlobals()
      Spark.getRegistry().unregister('data-space-parameters-editor')
      restore()
    }
  })

  it('does not retry an unknown save and restores the local baseline only after explicit discard', async () => {
    registerAllRenderers()
    Spark.register('data-space-parameters-editor', DataSpaceParametersEditor)
    const original = JSON.stringify([{ rowid: 'PARAM-1', Name: '客户号', Description: '原描述', IsBusParam: true }])
    const fixture = await createDesignFixture({ inputParams: original, layout: null, failSave: true,
      otherParameterRows: [{ rowid: 'DS-OTHER', inputParams: '[]' }],
      rowPermissions: { 'DS-1': { hiddenFields: [], maskedFields: [], editableFields: ['inputParams'] } } })
    const restore = disableRendererStubs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const errors: string[] = []
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => null }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-parameter-unknown-save-test', id: 'design-parameter-unknown-save-test' })
          context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
          const Renderer = resolveComponent('SparkPageRenderer')
          return () => h(Renderer, { routeSnapshot, pageRuntime: fixture.pageRuntime,
            onRuntimeError: (error: Error) => errors.push(error.message) })
        },
      })
      const wrapper = mount(PageWithServices, { attachTo: container,
        global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
          components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      const editButton = wrapper.findAll('button').find(button => button.text().includes('编辑输入参数'))
      if (!editButton) throw new Error('parameter editor entry is missing')
      await editButton.trigger('click')
      await flushPromises()
      const nameInput = document.body.querySelector<HTMLInputElement>('input[aria-label="名称 1"]')
      if (!nameInput) throw new Error('parameter editor input is missing')
      nameInput.value = '待确认名称'
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      const saveButton = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.includes('确认保存'))
      if (!saveButton) throw new Error('parameter editor save button is missing')
      saveButton.click()
      await flushPromises()
      await flushPromises()
      expect(fixture.http.saveRequests).toHaveLength(1)
      const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataSet@designParameters`)
      expect(view?.rows[0]?.['inputParams']).toContain('待确认名称')
      expect(view?.dirtyTracking.hasPendingChanges('DS-1')).toBe(true)
      expect(wrapper.text()).toContain('此操作不代表服务器回滚')
      fixture.http.parameterQueryFailures = 1
      const discardButton = wrapper.findAll('button').find(button => button.text().includes('放弃本地修改并重新读取'))
      if (!discardButton) throw new Error('unknown-save recovery action is missing')
      await discardButton.trigger('click')
      await flushPromises()
      expect(document.body.querySelector('.el-message-box')).not.toBeNull()
      const confirmDiscard = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.el-message-box__btns button'))
        .reverse().find(button => button.textContent?.includes('确定'))
      if (!confirmDiscard) throw new Error('local discard confirmation button is missing')
      const requestsBeforeOwnerCheck = fixture.http.requests.length
      routeSnapshot.query['dataSpaceId'] = 'DS-OTHER'
      confirmDiscard.click()
      await flushPromises()
      expect(view?.dirtyTracking.hasPendingChanges('DS-1')).toBe(true)
      expect(fixture.http.requests).toHaveLength(requestsBeforeOwnerCheck)
      routeSnapshot.query['dataSpaceId'] = 'DS-1'
      const discardAgain = wrapper.findAll('button').find(button => button.text().includes('放弃本地修改并重新读取'))
      if (!discardAgain) throw new Error('recovery action disappeared after stale route confirmation')
      await discardAgain.trigger('click')
      await flushPromises()
      const secondConfirm = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.el-message-box__btns button'))
        .reverse().find(button => button.textContent?.includes('确定'))
      if (!secondConfirm) throw new Error('second local discard confirmation button is missing')
      secondConfirm.click()
      await flushPromises()
      expect(fixture.http.saveRequests).toHaveLength(1)
      expect(view?.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(view?.rows[0]?.['inputParams']).toBe(original)
      expect(wrapper.text()).toContain('服务器重新读取失败')
      const retryButton = wrapper.findAll('button').find(button => button.text() === '重新读取')
      if (!retryButton) throw new Error('failed read did not leave an independent retry action')
      await retryButton.trigger('click')
      await flushPromises()
      await flushPromises()
      expect(wrapper.text()).toContain('数据空间设计信息已加载')
      expect(wrapper.text()).not.toContain('放弃本地修改并重新读取')
      expectTargetParameterQueries(fixture.http.requests, 3)
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally {
      routeSnapshot.query['dataSpaceId'] = 'DS-1'
      container.remove()
      vi.unstubAllGlobals()
      Spark.getRegistry().unregister('data-space-parameters-editor')
      restore()
    }
  })

  it('keeps the page available when ordinary target and model display fields are hidden or masked', async () => {
    registerAllRenderers()
    const fixture = await createDesignFixture({ layout: null,
      modelRows: [{ rowid: 'MODEL-1', MetaName: '模型甲', description: '正式模型描述', Type: '表', dataSetId: 'DS-1' },
        { rowid: 'MODEL-2', MetaName: '隐藏模型名称', description: '隐藏模型描述', Type: '视图', dataSetId: 'DS-1' }],
      fieldRows: [
        { rowid: 'FIELD-HIDDEN', Name: '隐藏字段名', AsName: '', FieldType: 'varchar', IsOutput: true, IsPKey: 0,
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-MASKED', Name: '脱敏字段名', AsName: '', FieldType: 'varchar', IsOutput: true, IsPKey: 0,
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
      ],
      rowPermissions: { 'DS-1': { hiddenFields: ['Name'], maskedFields: ['description'] },
        'MODEL-2': { hiddenFields: ['MetaName'], maskedFields: ['description'] },
        'FIELD-HIDDEN': { hiddenFields: ['Name'], maskedFields: [] },
        'FIELD-MASKED': { hiddenFields: [], maskedFields: ['Name'] } } })
    const restore = disableRendererStubs()
    try {
      const errors: string[] = []
      let providerLayoutReads = 0
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => { providerLayoutReads += 1; return null } }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-permission-test', id: 'design-permission-test' })
          context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
          const Renderer = resolveComponent('SparkPageRenderer')
          return () => h(Renderer, { routeSnapshot, pageRuntime: fixture.pageRuntime,
            onRuntimeError: (error: Error) => errors.push(error.message) })
        },
      })
      const wrapper = mount(PageWithServices, { global: { plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
        components: { SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub } } })
      await flushPromises()
      await flushPromises()
      const targetView = fixture.pageRuntime.resolveView(`#${catalogId}@Base_DataSet@designTarget`)
      const modelView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
      const fieldView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Field@designFields`)
      expect(targetView?.fieldAccess(targetView.rows[0] ?? null, 'Name').read).toBe('invisible')
      expect(modelView?.fieldAccess(modelView.rows[1] ?? null, 'MetaName').read).toBe('invisible')
      expect(fieldView?.fieldAccess(fieldView.rows[0] ?? null, 'Name').read).toBe('invisible')
      expect(fieldView?.fieldAccess(fieldView.rows[1] ?? null, 'Name').read).toBe('masked')
      expect(wrapper.text()).toContain('数据空间设计信息已加载')
      expect(wrapper.text()).toContain('模型甲')
      expect(wrapper.html()).not.toContain('目标空间')
      expect(wrapper.html()).not.toContain('只读描述')
      expect(wrapper.html()).not.toContain('隐藏模型名称')
      expect(wrapper.html()).not.toContain('隐藏模型描述')
      expect(wrapper.html()).not.toContain('隐藏字段名')
      expect(wrapper.html()).not.toContain('脱敏字段名')
      expect(providerLayoutReads).toBe(1)
      expect(fixture.http.requests).toHaveLength(5)
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally { restore() }
  })

  it('shows an explicit missing-layout state and rejects query or layout corruption without displaying stale rows', async () => {
    const missing = await createDesignFixture({ layout: null })
    await missing.functions['__init__']?.()
    expect(missing.functions['RenderDesignLayout']?.()).toBeDefined()
    expect(missing.http.requests).toHaveLength(5)

    const failed = await createDesignFixture({ failModelQuery: true })
    await failed.functions['__init__']?.()
    expect(failedStatus(failed.functions)).toContain('读取失败')
    expect(failed.functions['designBeforeRender']?.()).toBe(false)
  })

  it('rejects required hidden identity fields and malformed layouts', async () => {
    const denied = await createDesignFixture({ hiddenFields: ['rowid'] })
    await denied.functions['__init__']?.()
    expect(failedStatus(denied.functions)).toContain('权限')
    const malformed = await createDesignFixture({ layout: '{bad json' })
    await malformed.functions['__init__']?.()
    expect(failedStatus(malformed.functions)).toContain('有效 JSON')
  })

  it('validates every returned model and loads all 501 fields before reading layout', async () => {
    const fields = Array.from({ length: 501 }, (_, index) => ({ rowid: `FIELD-${index + 1}`,
      AsName: `字段${index + 1}`, FieldType: 'varchar', IsOutput: true, IsPKey: 0,
      dataSetId: 'DS-1', dataModelId: 'MODEL-1' }))
    const models = [{ rowid: 'MODEL-1', MetaName: '模型甲', description: '正式模型描述', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-2', MetaName: '模型乙', description: '第二模型', Type: '视图', dataSetId: 'FOREIGN-DS' }]
    const denied = await createDesignFixture({ modelRows: models, fieldRows: fields, ignoreModelFilter: true })
    await denied.functions['__init__']?.()
    expect(failedStatus(denied.functions)).toContain('不属于目标数据空间')
    expect(denied.layoutReads()).toBe(0)

    const complete = await createDesignFixture({ fieldRows: fields })
    await complete.functions['__init__']?.()
    const fieldView = complete.pageRuntime.resolveView(`#${designId}@Base_DataModel_Field@designFields`)
    expect(fieldView?.rows).toHaveLength(501)
    expect(fieldView?.total).toBe(501)
    const fieldRequests = complete.http.requests.filter(request => {
      const body = record(request.data)
      const tables = body['Table']
      return Array.isArray(tables) && isRecord(tables[0]) && tables[0]['Name'] === 'Base_DataModel_Field'
    })
    expect(fieldRequests).toHaveLength(2)
    expect(fieldRequests.map(request => record(request.data)['PageParam'])).toMatchObject([
      { index: 1, size: 500 }, { index: 2, size: 500 },
    ])
    expect(complete.layoutReads()).toBe(1)
  })

  it.each([
    { mode: 'hidden', permission: { hiddenFields: ['dataSetId'], maskedFields: [] }, expected: 'invisible' },
    { mode: 'masked', permission: { hiddenFields: [], maskedFields: ['dataSetId'] }, expected: 'masked' },
  ])('rejects a second model whose data-space ownership is $mode', async access => {
    const models = [
      { rowid: 'MODEL-1', MetaName: '模型甲', description: '正式模型描述', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-2', MetaName: '模型乙', description: '正式模型描述乙', Type: '视图', dataSetId: 'DS-1' },
    ]
    const fixture = await createDesignFixture({ modelRows: models, rowPermissions: {
      'MODEL-2': access.permission,
    } })
    await fixture.functions['__init__']?.()
    const modelView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    expect(modelView?.rows).toHaveLength(2)
    expect(modelView?.fieldAccess(modelView.rows[0] ?? null, 'dataSetId').read).toBe('visible')
    expect(modelView?.fieldAccess(modelView.rows[1] ?? null, 'dataSetId').read).toBe(access.expected)
    expect(failedStatus(fixture.functions)).toContain('当前数据权限不能读取设计所需身份或关联字段')
    expect(fixture.layoutReads()).toBe(0)
    const queryTables = fixture.http.requests.map(request => {
      const tables = record(request.data)['Table']
      return Array.isArray(tables) && isRecord(tables[0]) ? tables[0]['Name'] : undefined
    })
    expect(queryTables).toEqual(['Base_DataSet', 'Base_DataSet', 'Base_DataModel'])
    expect(queryTables).not.toContain('Base_DataModel_Field')
    expect(queryTables).not.toContain('Base_DataModel_Relation')
  })

  it.each(['[null]', '[1]'])('rejects malformed parameter item %s before reading layout', async inputParams => {
    const fixture = await createDesignFixture({ inputParams })
    await fixture.functions['__init__']?.()
    expect(failedStatus(fixture.functions)).toContain('输入参数项必须是对象')
    expect(fixture.layoutReads()).toBe(0)
  })

  it.each([
    { label: 'missing target', targetRows: [] },
    { label: 'duplicate target', targetRows: [{ rowid: 'DS-1', Name: '空间一', Type: '数据库', description: '' },
      { rowid: 'DS-1', Name: '空间一', Type: '数据库', description: '' }] },
  ])('rejects a $label before reading parameters or layout', async invalid => {
    const fixture = await createDesignFixture({ targetRows: invalid.targetRows })
    await fixture.functions['__init__']?.()
    expect(failedStatus(fixture.functions)).toContain('目标数据空间不存在、不可读或身份不唯一')
    expect(fixture.http.requests).toHaveLength(1)
    expect(fixture.layoutReads()).toBe(0)
  })

  it.each([
    { label: 'duplicate model identity', modelRows: [
      { rowid: 'MODEL-1', MetaName: '模型甲', description: 'a', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-1', MetaName: '模型乙', description: 'b', Type: '表', dataSetId: 'DS-1' }],
      fieldRows: [] },
    { label: 'field linked to an unknown model', modelRows: [
      { rowid: 'MODEL-1', MetaName: '模型甲', description: 'a', Type: '表', dataSetId: 'DS-1' }],
      fieldRows: [{ rowid: 'FIELD-X', AsName: '异属字段', FieldType: 'varchar', IsOutput: true,
        IsPKey: 0, dataSetId: 'DS-1', dataModelId: 'UNKNOWN-MODEL' }] },
  ])('rejects $label before reading layout', async invalid => {
    const fixture = await createDesignFixture({ modelRows: invalid.modelRows, fieldRows: invalid.fieldRows })
    await fixture.functions['__init__']?.()
    expect(failedStatus(fixture.functions)).not.toContain('设计信息已加载')
    expect(fixture.layoutReads()).toBe(0)
  })

  it('accepts an owned formal relation edge and rejects unknown endpoints or mismatched layout edges', async () => {
    const models = [
      { rowid: 'MODEL-1', MetaName: '模型甲', description: 'a', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-2', MetaName: '模型乙', description: 'b', Type: '表', dataSetId: 'DS-1' },
    ]
    const relation = { rowid: 'REL-1', dataSetId: 'DS-1', parentModId: 'MODEL-1', childModId: 'MODEL-2',
      depType: 'one-to-many', filter: 'Active=1', cascadeDel: false }
    const valid = await createDesignFixture({ modelRows: models, fieldRows: [], relationRows: [relation],
      layout: JSON.stringify({ graphVersion: 1, nodes: [{ id: 'MODEL-1', x: 0, y: 0 },
        { id: 'MODEL-2', x: 10, y: 10 }], edges: [{ id: 'REL-1', sourceNodeId: 'MODEL-1', targetNodeId: 'MODEL-2',
          pointsList: [{ x: -5, y: 10 }, { x: 40, y: 20 }, { x: 90, y: -10 }] }] }) })
    await valid.functions['__init__']?.()
    expect(failedStatus(valid.functions)).toContain('数据空间设计信息已加载')
    expect(valid.layoutReads()).toBe(1)
    expect(valid.functions['designGraphBeforeRender']?.()).toEqual({ visible: true, props: {
      nodes: [{ id: 'MODEL-1', x: 0, y: 0, title: '模型甲', description: 'a' },
        { id: 'MODEL-2', x: 10, y: 10, title: '模型乙', description: 'b' }],
      edges: [{ id: 'REL-1', source: 'MODEL-1', target: 'MODEL-2',
        pointsList: [{ x: -5, y: 10 }, { x: 40, y: 20 }, { x: 90, y: -10 }] }],
    } })

    const unknown = await createDesignFixture({ modelRows: models, fieldRows: [],
      relationRows: [{ ...relation, childModId: 'UNKNOWN-MODEL' }] })
    await unknown.functions['__init__']?.()
    expect(failedStatus(unknown.functions)).toContain('关系端点不在目标模型集合中')
    expect(unknown.layoutReads()).toBe(0)

    const invalidLayout = await createDesignFixture({ modelRows: models, fieldRows: [], relationRows: [relation],
      layout: JSON.stringify({ graphVersion: 1, nodes: [{ id: 'MODEL-1', x: 0, y: 0 },
        { id: 'MODEL-2', x: 10, y: 10 }], edges: [{ id: 'REL-1', sourceNodeId: 'UNKNOWN-MODEL', targetNodeId: 'MODEL-2' }] }) })
    await invalidLayout.functions['__init__']?.()
    expect(failedStatus(invalidLayout.functions)).toContain('布局关系端点与正式关系不一致')
    expect(invalidLayout.layoutReads()).toBe(1)

    const brokenPath = await createDesignFixture({ modelRows: models, fieldRows: [], relationRows: [relation],
      layout: JSON.stringify({ graphVersion: 1, nodes: [{ id: 'MODEL-1', x: 0, y: 0 },
        { id: 'MODEL-2', x: 10, y: 10 }], edges: [{ id: 'REL-1', sourceNodeId: 'MODEL-1', targetNodeId: 'MODEL-2',
          pointsList: [{ x: 1, y: 2 }, { x: 'bad', y: 4 }] }] }) })
    await brokenPath.functions['__init__']?.()
    expect(failedStatus(brokenPath.functions)).toContain('布局包含无效的边路径点')
    expect(brokenPath.functions['designGraphBeforeRender']?.()).toEqual({ visible: false })
  })

  it.each(['BAD%2FID', '../DS-1', 'DS-1\\child'])('rejects invalid target ID %s before issuing queries', async targetId => {
    const fixture = await createDesignFixture()
    routeSnapshot.query['dataSpaceId'] = targetId
    await fixture.functions['__init__']?.()
    expect(fixture.http.requests).toHaveLength(0)
    expect(fixture.layoutReads()).toBe(0)
    routeSnapshot.query['dataSpaceId'] = 'DS-1'
  })

  it('preserves valid return query bytes while rejecting paths outside the current tenant and app', async () => {
    const fixture = await createDesignFixture()
    routeSnapshot.params['tenantId'] = 'tenant one'
    routeSnapshot.query['returnTo'] = '/t/tenant%20one/app/catalog?next=%2F&note=hello\\world'
    fixture.functions['returnToCatalog']?.()
    expect(fixture.navigationCalls).toEqual([[routeSnapshot.query['returnTo'], undefined]])
    fixture.navigationCalls.length = 0
    routeSnapshot.query['returnTo'] = '/t/other/app/catalog?next=%2F'
    fixture.functions['returnToCatalog']?.()
    expect(fixture.navigationCalls).toHaveLength(0)
    routeSnapshot.query['returnTo'] = '/t/tenant%20one/app/%2e%2e/catalog'
    fixture.functions['returnToCatalog']?.()
    expect(fixture.navigationCalls).toHaveLength(0)
    routeSnapshot.query['returnTo'] = '/t/tenant/app/catalog'
    routeSnapshot.params['tenantId'] = 'tenant'
  })

  it('does not read layout after the page owner aborts during a formal query', async () => {
    let releaseQuery: (() => void) | undefined
    let notifyStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { notifyStarted = resolve })
    const fixture = await createDesignFixture()
    fixture.http.queryGate = new Promise<void>(resolve => { releaseQuery = resolve })
    fixture.http.queryStarted = () => { notifyStarted?.() }
    const pending = fixture.functions['__init__']?.()
    await started
    fixture.controller.abort()
    releaseQuery?.()
    await pending
    expect(fixture.layoutReads()).toBe(0)
  })

  it('stops before layout when the verified target view refreshes during a pending model query', async () => {
    let releaseQuery: (() => void) | undefined
    let notifyStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { notifyStarted = resolve })
    const fixture = await createDesignFixture()
    fixture.http.queryGate = new Promise<void>(resolve => { releaseQuery = resolve })
    fixture.http.queryStarted = () => { notifyStarted?.() }
    const pending = fixture.functions['__init__']?.()
    await started
    const target = fixture.pageRuntime.resolveView(`#${catalogId}@Base_DataSet@designTarget`)
    if (!target) throw new Error('target DataView is unavailable during the pending model query')
    await target.loadFromServer({ fields: ['rowid', 'Name', 'Type', 'description'],
      filter: { field: 'rowid', operator: 'eq', value: 'DS-1' }, allPages: true, maxRows: 50000 })
    releaseQuery?.()
    await pending
    expect(fixture.layoutReads()).toBe(0)
    expect(failedStatus(fixture.functions)).not.toContain('数据空间设计信息已加载')
  })

  it('invalidates the completed page when the target DataView is refreshed', async () => {
    const fixture = await createDesignFixture()
    await fixture.functions['__init__']?.()
    expect(fixture.functions['designBeforeRender']?.()).toBe(true)
    const target = fixture.pageRuntime.resolveView(`#${catalogId}@Base_DataSet@designTarget`)
    if (!target) throw new Error('target DataView is unavailable after loading')
    await target.loadFromServer({ fields: ['rowid', 'Name', 'Type', 'description'],
      filter: { field: 'rowid', operator: 'eq', value: 'DS-1' }, allPages: true, maxRows: 50000 })
    expect(fixture.functions['designBeforeRender']?.()).toBe(false)
    expect(fixture.functions['designGraphBeforeRender']?.()).toEqual({ visible: false })
  })
})

function failedStatus(functions: ReturnType<typeof compileFunctions>): string {
  const value = functions['RenderDesignStatus']?.()
  if (Array.isArray(value)) return value.map(item => isRecord(item) ? String(item['children'] ?? '') : '').join(' ')
  return isRecord(value) ? String(value['children'] ?? '') : String(value ?? '')
}
