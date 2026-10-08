import { config as testUtilsConfig, flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h, markRaw, ref, resolveComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'
import { PAGE_RUNTIME_SERVICES, registerAllRenderers, Spark, SparkPageRenderer, useSparkComponent } from '@spark-appworks/spark-component'
import { DataSpaceRuntimeApi, type DataSpaceDesignApi } from '@spark-appworks/spark-lowcode-api'
import { PageRuntime, PageTool, ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import { HttpClientBase, isRecord, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'
import { compileFunctions } from '../../../../packages/spark-component/src/page/createSandbox'
import { createPageComponentRegistry } from '../../../../packages/spark-component/src/page/context/page-component-registry'
import { buildPageContext } from '../../../../packages/spark-component/src/page/context/buildPageContext'
import type { PageContext } from '../../../../packages/spark-component/src/page/context/types'
import { LowcodeDataSpaceAssembler } from '../../../../src/lowcode/data-space/lowcode-data-space-assembler'

const designId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const catalogId = '90A82E287930A234FEC3E687C94A93EA'
const pageRoot = resolve(process.cwd(), 'config/pages/data-platform/data-space-design')
const routeSnapshot = { path: `/t/tenant/app/__tool/${designId}`, fullPath: `/t/tenant/app/__tool/${designId}?scenarioId=${designId}&dataSpaceId=DS-1&returnTo=%2Ft%2Ftenant%2Fapp%2Fcatalog`,
  name: 'tool', params: { tenantId: 'tenant', projectId: 'app' }, query: { scenarioId: designId,
    additionalScenarioIds: [catalogId], dataSpaceId: 'DS-1', returnTo: '/t/tenant/app/catalog' }, hash: '' }
type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type FormalModelSource = Readonly<{ id: string; name: string; primaryKey: string;
  fields: Array<[string, string, string, boolean]> }>
type RowPermission = Readonly<{ hiddenFields: string[]; maskedFields: string[] }>
type DesignFixtureOptions = Readonly<{ layout?: string | null; failModelQuery?: boolean; hiddenFields?: string[];
  modelRows?: Record<string, unknown>[]; fieldRows?: Record<string, unknown>[]; inputParams?: unknown;
  relationRows?: Record<string, unknown>[]; targetRows?: Record<string, unknown>[];
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
  public hiddenFields: string[] = []
  public failModelQuery = false
  public modelRows: Record<string, unknown>[] | undefined
  public fieldRows: Record<string, unknown>[] | undefined
  public relationRows: Record<string, unknown>[] | undefined
  public targetRows: Record<string, unknown>[] | undefined
  public inputParams: unknown
  public rowPermissions: Record<string, RowPermission> = {}
  public maskedFields: string[] = []
  public ignoreModelFilter = false
  public queryGate: Promise<void> | undefined
  public queryStarted: (() => void) | undefined

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const body = isRecord(config.data) ? config.data : {}
    const table = Array.isArray(body['Table']) && isRecord(body['Table'][0]) ? body['Table'][0] : {}
    const name = String(table['Name'] ?? '')
    if (this.queryGate && name === 'Base_DataModel') {
      this.queryStarted?.()
      await this.queryGate
    }
    if (this.failModelQuery && name === 'Base_DataModel') throw new Error('fixture query failure')
    let source: Record<string, unknown>[] = name === 'Base_DataSet' && record(config.headers)['x-FormKey'] === catalogId
      ? this.targetRows ?? [{ rowid: 'DS-1', Name: '目标空间', Type: '数据库', description: '只读描述', sysid: 'app' }]
      : name === 'Base_DataSet' ? [{ rowid: 'DS-1', inputParams: this.inputParams ?? null }]
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
      return { ...row, lingma_sys_key: row['rowid'], lingma_sys_params: { r: [], e: [],
        h: permission?.hiddenFields ?? this.hiddenFields, m: permission?.maskedFields ?? this.maskedFields, d: false } }
    })
    return { data: { Code: 200, Result: { primaryKeyField: 'rowid', allowAdd: false,
      data: { Items: rows, Count: filtered.length } } }, status: 200, statusText: 'OK', headers: {} }
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('expected object')
  return value
}

async function createDesignFixture(options: DesignFixtureOptions = {}) {
  const http = new DesignHttpClient()
  http.failModelQuery = options.failModelQuery ?? false
  http.hiddenFields = options.hiddenFields ?? []
  http.modelRows = options.modelRows
  http.fieldRows = options.fieldRows
  http.relationRows = options.relationRows
  http.targetRows = options.targetRows
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
  it('reads the routed target through the formal DataViews and reveals declared readonly tables in SparkPageRenderer', async () => {
    registerAllRenderers()
    const fixture = await createDesignFixture({ inputParams: JSON.stringify([{ id: 'PARAM-1', Name: '客户号',
      Description: '调用方客户标识', IsBusParam: true }]), layout: JSON.stringify({ graphVersion: 1, autoGenerated: false,
      nodes: [{ id: 'MODEL-1', x: 20, y: 30 }], edges: [] }), fieldRows: [
        { rowid: 'FIELD-1', Name: '客户编号', AsName: '', FieldType: 'varchar', IsOutput: true, IsPKey: 1,
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-2', Name: '内部标识', AsName: 'customer_id', FieldType: 'varchar', IsOutput: true, IsPKey: 0,
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
      ] })
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
      expect(wrapper.text()).toContain('数据空间设计 · 只读')
      expect(wrapper.text()).toContain('数据空间设计信息已加载')
      expect(wrapper.text()).toContain('目标空间')
      expect(wrapper.text()).toContain('模型甲')
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
      expect(wrapper.findAll('button').map(button => button.text())).toEqual(['返回目录', '重新加载'])
      expect(errors).toEqual([])
      expect(fixture.http.requests).toHaveLength(5)
      expect(fixture.http.requests.every(request => request.url !== '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(true)
      const reloadButton = wrapper.findAll('button').find(button => button.text() === '重新加载')
      if (!reloadButton) throw new Error('reload button is missing')
      await reloadButton.trigger('click')
      await flushPromises()
      await flushPromises()
      expect(fixture.http.requests).toHaveLength(10)
      expect(wrapper.text()).toContain('数据空间设计信息已加载')
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally { restore() }
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
        { id: 'MODEL-2', x: 10, y: 10 }], edges: [{ id: 'REL-1', sourceNodeId: 'MODEL-1', targetNodeId: 'MODEL-2' }] }) })
    await valid.functions['__init__']?.()
    expect(failedStatus(valid.functions)).toContain('数据空间设计信息已加载')
    expect(valid.layoutReads()).toBe(1)

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
  })
})

function failedStatus(functions: ReturnType<typeof compileFunctions>): string {
  const value = functions['RenderDesignStatus']?.()
  if (Array.isArray(value)) return value.map(item => isRecord(item) ? String(item['children'] ?? '') : '').join(' ')
  return isRecord(value) ? String(value['children'] ?? '') : String(value ?? '')
}
