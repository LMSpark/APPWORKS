import { config as testUtilsConfig, DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h, markRaw, ref, resolveComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus, { ElSelect, ElSelectV2, ElTable } from 'element-plus'
import { describe, expect, it, vi } from 'vitest'
import { FilterValueFunctionDialog, PAGE_RUNTIME_SERVICES, registerAllRenderers, Spark, SparkPageRenderer, useSparkComponent } from '@spark-appworks/spark-component'
import { DataSpaceRuntimeApi, type DataSpaceDesignApi } from '@spark-appworks/spark-lowcode-api'
import { VueFlow } from '@vue-flow/core'
import { PageRuntime, PageTool, ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import { HttpClientBase, isRecord, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'
import { compileFunctions } from '../../../../packages/spark-component/src/page/createSandbox'
import { createPageComponentRegistry } from '../../../../packages/spark-component/src/page/context/page-component-registry'
import { buildPageContext } from '../../../../packages/spark-component/src/page/context/buildPageContext'
import type { PageContext } from '../../../../packages/spark-component/src/page/context/types'
import { LowcodeDataSpaceAssembler } from '../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import DataSpaceDesignGraph from '../../../../src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue'
import DataSpaceParametersEditor from '../../../../src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.vue'
import DataSpaceFilterEditor from '../../../../src/views/app/control/data-platform/data-space/design/expression/DataSpaceFilterEditor.vue'
import DataSpaceValueFunctionEditor from '../../../../src/views/app/control/data-platform/data-space/design/expression/DataSpaceValueFunctionEditor.vue'
import FilterExpressionGroup from '../../../../packages/spark-component/src/components/containers/filter/expression/FilterExpressionGroup/FilterExpressionGroup.vue'

const designId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const catalogId = '90A82E287930A234FEC3E687C94A93EA'
const pageRoot = resolve(process.cwd(), 'config/pages/data-platform/data-space-design')
const routeSnapshot = { path: `/t/tenant/app/__tool/${designId}`, fullPath: `/t/tenant/app/__tool/${designId}?scenarioId=${designId}&dataSpaceId=DS-1&returnTo=%2Ft%2Ftenant%2Fapp%2Fcatalog`,
  name: 'tool', params: { tenantId: 'tenant', projectId: 'app' }, query: { scenarioId: designId,
    additionalScenarioIds: [catalogId], dataSpaceId: 'DS-1', returnTo: '/t/tenant/app/catalog' }, hash: '' }
type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type FormalModelSource = Readonly<{ id: string; name: string; primaryKey: string;
  fields: Array<[string, string, string, boolean]> }>
type RowPermission = Readonly<{ hiddenFields: string[]; maskedFields: string[]; editableFields?: string[]; allowDelete?: boolean }>
type DesignFixtureOptions = Readonly<{ layout?: string | null; failModelQuery?: boolean; failSave?: boolean; hiddenFields?: string[];
  layoutWriteResult?: 'unknown';
  layoutCreateResult?: 'unknown';
  failPostCreateReload?: boolean;
  modelRows?: Record<string, unknown>[]; fieldRows?: Record<string, unknown>[]; inputParams?: unknown;
  relationRows?: Record<string, unknown>[]; targetRows?: Record<string, unknown>[];
  otherParameterRows?: Record<string, unknown>[];
  ignoreModelFilter?: boolean; rowPermissions?: Record<string, RowPermission> }>
type NavigationCall = readonly [string, Record<string, unknown> | undefined]

function graphProps(fixture: Awaited<ReturnType<typeof createDesignFixture>>): Record<string, unknown> {
  const result = fixture.functions['designGraphBeforeRender']?.()
  if (!isRecord(result) || !isRecord(result['props'])) throw new Error('graph render props are unavailable')
  return result['props']
}

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
  model({ id: `${designId}p001`, name: 'Base_DataModel', primaryKey: 'rowid', fields: [['m0', 'rowid', 'string', true],
    ['m1', 'Name', 'string', false], ['m2', 'MetaName', 'string', false], ['m3', 'description', 'string', false],
    ['m4', 'Type', 'string', false], ['m5', 'dataSetId', 'string', false], ['m6', 'Filter', 'string', false],
    ['m7', 'RequestComplete', 'string', false], ['m8', 'OutputType', 'string', false],
    ['m9', 'IsBusiness', 'number', false], ['m10', 'IsBusinessMain', 'number', false],
    ['m11', 'parentField', 'string', false], ['m12', 'hasChildField', 'string', false], ['m13', 'selfType', 'string', false],
    ['m14', 'topValue', 'string', false], ['m15', 'cacheType', 'string', false], ['m16', 'JoinType', 'string', false],
    ['m17', 'ForeignKeyFields', 'string', false], ['m18', 'JoinFilter', 'string', false], ['m19', 'PId', 'string', false]] }),
  model({ id: `${designId}p002`, name: 'Base_DataModel_Field', primaryKey: 'rowid', fields: [['f0', 'rowid', 'string', true], ['f1', 'Name', 'string', false],
    ['f2', 'AsName', 'string', false], ['f3', 'FieldType', 'string', false], ['f4', 'IsOutput', 'number', false],
    ['f5', 'IsPKey', 'number', false], ['f6', 'dataSetId', 'string', false], ['f7', 'dataModelId', 'string', false],
    ['f8', 'description', 'string', false], ['f9', 'OrderType', 'string', false], ['f10', 'Order', 'number', false],
    ['f11', 'Group', 'number', false], ['f12', 'type', 'string', false], ['f13', 'ValueFun', 'string', false]] }),
  model({ id: `${designId}p003`, name: 'Base_DataModel_Relation', primaryKey: 'rowid', fields: [['rel0', 'rowid', 'string', true],
    ['rel1', 'dataSetId', 'string', false], ['rel2', 'parentModId', 'string', false], ['rel3', 'childModId', 'string', false],
    ['rel4', 'depType', 'string', false], ['rel5', 'filter', 'string', false], ['rel6', 'cascadeDel', 'boolean', false],
    ['rel7', 'parentTable', 'string', false], ['rel8', 'childTable', 'string', false]] }),
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
      const responses: Record<string, Record<string, unknown>[]>[] = []
      const deletes: Record<string, Record<string, unknown>[]>[] = []
      if (this.failSave) throw new Error('fixture connection lost after save dispatch')
      if (record(config.headers)['x-FormKey'] === designId) {
        for (const value of commands) {
          const command = record(value)
          const tableName = String(command['TableName'] ?? 'Base_DataSet')
          const crud = isRecord(command['CrudModel']) ? command['CrudModel'] : {}
          const added = Array.isArray(crud['Added']) ? crud['Added'].filter(isRecord) : []
          const changed = Array.isArray(crud['Changed']) ? crud['Changed'].filter(isRecord) : []
          const deleted = Array.isArray(crud['Deleted']) ? crud['Deleted'].filter(isRecord) : []
          const returnedRows = [...added, ...changed].map(row => ({ ...row }))
          if (returnedRows.length) responses.push({ [tableName]: returnedRows })
          if (deleted.length) deletes.push({ [tableName]: deleted.map(row => ({ ...row })) })
          if (tableName === 'Base_DataSet' && returnedRows[0]
            && Object.prototype.hasOwnProperty.call(returnedRows[0], 'inputParams')) this.inputParams = returnedRows[0]['inputParams']
          const rows = tableName === 'Base_DataModel' ? this.modelRows
            : tableName === 'Base_DataModel_Field' ? this.fieldRows
              : tableName === 'Base_DataModel_Relation' ? this.relationRows : undefined
          if (rows) {
            const next = rows.filter(row => !deleted.some(item => item['rowid'] === row['rowid']))
            for (const item of returnedRows) {
              const index = next.findIndex(row => row['rowid'] === item['rowid'])
              if (index >= 0) next[index] = { ...next[index], ...item }
              else next.push(item)
            }
            if (tableName === 'Base_DataModel') this.modelRows = next
            else if (tableName === 'Base_DataModel_Field') this.fieldRows = next
            else this.relationRows = next
          }
        }
      }
      return { data: { Code: 200, Result: { ...(responses.length ? { maplistedit: responses } : {}),
        ...(deletes.length ? { maplistdelete: deletes } : {}) } },
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
      : name === 'Base_DataModel' ? this.modelRows ?? [{ rowid: 'MODEL-1', Name: '模型注册甲', MetaName: '模型甲',
        description: '正式模型描述', Type: '表', dataSetId: 'DS-1', Filter: '', RequestComplete: '',
        OutputType: '', IsBusiness: 0, IsBusinessMain: 0 }]
      : name === 'Base_DataModel_Field' ? this.fieldRows ?? [{ rowid: 'FIELD-1', Name: '字段源甲', AsName: '字段甲', FieldType: 'varchar', IsOutput: 1, IsPKey: 1,
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
        e: permission?.editableFields ?? [], d: permission?.allowDelete === true } }
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
  http.modelRows = options.modelRows ?? [{ rowid: 'MODEL-1', Name: '模型注册甲', MetaName: '模型甲',
    description: '正式模型描述', Type: '表', dataSetId: 'DS-1', Filter: '', RequestComplete: '',
    OutputType: '', IsBusiness: 0, IsBusinessMain: 0 }]
  http.fieldRows = options.fieldRows ?? [{ rowid: 'FIELD-1', Name: '字段源甲', AsName: '字段甲', FieldType: 'varchar', IsOutput: 1,
    IsPKey: 1, description: '正式字段描述', dataSetId: 'DS-1', dataModelId: 'MODEL-1' }]
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
  const messages: Array<{ message: string; type?: 'success' | 'error' | 'warning' | 'info' }> = []
  let layoutReadCount = 0
  let layoutWriteCount = 0
  let layoutWriteAttempts = 0
  let layoutCreateAttempts = 0
  let layoutText = options.layout === undefined ? null : options.layout
  const readLayout = async () => {
    layoutReadCount += 1
    return layoutText
  }
  const pageService: PageContext['$page'] = {
    copyText: async () => undefined, readDataSpaceLayout: readLayout,
    saveDataSpaceLayout: async () => undefined,
    createDataSpaceLayout: async () => undefined,
    readDataSpaceRelationDependencyOptions: async () => [{ label: '一对多', value: 'one-to-many' }],
    getDataSet: id => pageRuntime.getDataSet(id), resolveView: binding => pageRuntime.resolveView(binding) ?? undefined,
    showMessage: (message, type) => { messages.push({ message, ...(type ? { type } : {}) }) },
    showConfirm: async () => true, showPrompt: async () => null, showDialog: async () => 'cancel',
    selectEntities: async () => [], browseFiles: async () => [], uploadFiles: async () => [], showAlert: async () => undefined,
    showLoading: () => undefined, navigate: (path, params) => { navigationCalls.push([path, params]) },
  }
  const context = buildPageContext({ pageRuntime, signal: controller.signal, pageRoute: routeSnapshot,
    pageContainer: ref(null), pageService, getComponentRegistry: () => registry,
    dataSpaceLayout: { scenarioId: designId, createReader: () => ({ readDataSpaceLayout: readLayout }),
      createWriter: () => ({ saveDataSpaceLayout: async command => {
        layoutWriteAttempts += 1
        if (options.layoutWriteResult === 'unknown') throw new Error('fixture write result unknown')
        if (layoutText !== command.expectedContent) throw new Error('fixture layout preimage changed')
        layoutText = command.content
        layoutWriteCount += 1
      }, createDataSpaceLayout: async command => {
        layoutCreateAttempts += 1
        if (options.layoutCreateResult === 'unknown') throw new Error('fixture create result unknown')
        if (layoutText !== null) throw new Error('fixture layout already exists')
        layoutText = command.content
        layoutWriteCount += 1
        if (options.failPostCreateReload) http.failModelQuery = true
      } }) },
    dataSpaceDesign: { scenarioId: designId, createReader: () => ({ readRelationDependencyOptions: async () => [
      { label: '一对多', value: 'one-to-many' }, { label: '多对一', value: 'many-to-one' },
    ] }) } })
  const functions = compileFunctions(readFileSync(resolve(pageRoot, 'script.js'), 'utf8'), context)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/t/:tenantId/:projectId/__tool/:pageId', component: defineComponent({ render: () => h('div') }) },
  ] })
  await router.push(routeSnapshot.fullPath)
  await router.isReady()
  return { http, pageRuntime, assemblies, registry, functions, controller, router,
    layoutReads: () => layoutReadCount, layoutWrites: () => layoutWriteCount, layoutWriteAttempts: () => layoutWriteAttempts,
    layoutCreateAttempts: () => layoutCreateAttempts,
    layoutContent: () => layoutText,
    writeLayout: async (command: { content: string; expectedContent: string }) => {
      if (layoutText !== command.expectedContent) throw new Error('fixture layout preimage changed')
      layoutText = command.content
      layoutWriteCount += 1
    }, createLayout: async (command: {content: string}) => {
      layoutCreateAttempts += 1
      if (layoutText !== null) throw new Error('fixture layout already exists')
      layoutText = command.content
      layoutWriteCount += 1
    }, navigationCalls, messages }
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
  it('previews a missing layout without writing and permits explicit cancel', async () => {
    const fixture = await createDesignFixture({layout: null})
    await fixture.functions['__init__']?.()
    await fixture.functions['designPrepareLayoutCreate']?.()
    expect(fixture.functions['designLayoutCreatePreviewBeforeRender']?.()).toMatchObject({visible: true})
    expect(fixture.layoutWrites()).toBe(0)
    fixture.functions['designCancelLayoutCreate']?.()
    expect(fixture.functions['designLayoutCreatePreviewBeforeRender']?.()).toEqual({visible: false})
    expect(fixture.layoutWrites()).toBe(0)
  })

  it('confirms a missing layout once and fully reloads the saved model and relation graph', async () => {
    const fixture = await createDesignFixture({layout: null, modelRows: [
      {rowid: 'MODEL-1', Name: 'A', MetaName: 'A', Type: '表', dataSetId: 'DS-1'},
      {rowid: 'MODEL-2', Name: 'B', MetaName: 'B', Type: '表', dataSetId: 'DS-1'}], fieldRows: [],
    relationRows: [{rowid: 'REL-1', dataSetId: 'DS-1', parentModId: 'MODEL-1', childModId: 'MODEL-2',
      depType: 'one-to-many', filter: '{"Type":"Constant","Value":1}'}]})
    await fixture.functions['__init__']?.()
    await fixture.functions['designPrepareLayoutCreate']?.()
    const preview = record(fixture.functions['designLayoutCreatePreviewBeforeRender']?.())
    expect(preview['visible']).toBe(true)
    expect(record(preview['props'])['nodes']).toMatchObject([
      {id: 'MODEL-1', x: 250, y: 150}, {id: 'MODEL-2', x: 584, y: 150}])
    expect(fixture.layoutWrites()).toBe(0)
    await fixture.functions['designConfirmLayoutCreate']?.()
    expect(fixture.layoutCreateAttempts()).toBe(1)
    expect(fixture.layoutWrites()).toBe(1)
    const saved = JSON.parse(String(fixture.layoutContent()))
    expect(saved).toEqual({graphVersion: 1,
      nodes: [{id: 'MODEL-1', x: 250, y: 150}, {id: 'MODEL-2', x: 584, y: 150}],
      edges: [{id: 'REL-1', sourceNodeId: 'MODEL-1', targetNodeId: 'MODEL-2'}]})
    expect(fixture.functions['designGraphBeforeRender']?.()).toMatchObject({visible: true, props: {
      nodes: [{id: 'MODEL-1', x: 250, y: 150}, {id: 'MODEL-2', x: 584, y: 150}],
      edges: [{id: 'REL-1', source: 'MODEL-1', target: 'MODEL-2'}]}})
    await fixture.functions['reloadDesign']?.()
    expect(fixture.functions['designGraphBeforeRender']?.()).toMatchObject({visible: true, props: {
      nodes: [{id: 'MODEL-1', x: 250, y: 150}, {id: 'MODEL-2', x: 584, y: 150}]}})
  })

  it('routes the rendered preview and confirmation controls to a created layout and reopens its graph', async () => {
    registerAllRenderers()
    Spark.register('data-space-design-graph', DataSpaceDesignGraph)
    vi.stubGlobal('ResizeObserver', class { public observe(): void {} public unobserve(): void {} public disconnect(): void {} })
    const fixture = await createDesignFixture({layout: null, fieldRows: [], relationRows: []})
    const restore = disableRendererStubs()
    try {
      const services = {dataSpaceLayout: {scenarioId: designId,
        createReader: () => ({readDataSpaceLayout: async () => fixture.layoutContent()}),
        createWriter: () => ({saveDataSpaceLayout: async () => { throw new Error('existing layout save is unavailable') },
          createDataSpaceLayout: async (command: Parameters<PageContext['$page']['createDataSpaceLayout']>[0]) =>
            fixture.createLayout(command)})}}
      const Host = defineComponent({setup() {
        const context = useSparkComponent({type: 'layout-create-test', id: 'layout-create-test'})
        context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
        return () => h(resolveComponent('SparkPageRenderer'), {routeSnapshot, pageRuntime: fixture.pageRuntime})
      }})
      const wrapper = mount(Host, {global: {plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
        components: {SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub}}})
      await flushPromises()
      const prepare = wrapper.findAll('button').find(button => button.text() === '预览创建布局')
      if (!prepare) throw new Error('layout preview action is missing')
      await prepare.trigger('click')
      await flushPromises()
      const graph = wrapper.findComponent(DataSpaceDesignGraph)
      expect(graph.exists()).toBe(true)
      expect(graph.props('disabled')).toBe(true)
      expect(fixture.layoutWrites()).toBe(0)
      const confirm = wrapper.findAll('button').find(button => button.text() === '确认创建布局')
      if (!confirm) throw new Error('layout creation confirmation is missing')
      await confirm.trigger('click')
      await flushPromises()
      expect(fixture.layoutWrites()).toBe(1)
      expect(JSON.parse(String(fixture.layoutContent()))).toMatchObject({graphVersion: 1,
        nodes: [{id: 'MODEL-1', x: 250, y: 150}], edges: []})
      expect(wrapper.text()).toContain('完整重新装载')
      wrapper.unmount()
      const reopened = await createDesignFixture({layout: String(fixture.layoutContent()), fieldRows: [], relationRows: []})
      const reopenedHost = defineComponent({setup() {
        const context = useSparkComponent({type: 'layout-create-reopen-test', id: 'layout-create-reopen-test'})
        context.sparkProvide(PAGE_RUNTIME_SERVICES, {dataSpaceLayout: {scenarioId: designId,
          createReader: () => ({readDataSpaceLayout: async () => reopened.layoutContent()}),
          createWriter: () => ({saveDataSpaceLayout: async () => { throw new Error('existing layout save is unavailable') },
            createDataSpaceLayout: async () => { throw new Error('reopen must not create layout') }})}})
        return () => h(resolveComponent('SparkPageRenderer'), {routeSnapshot, pageRuntime: reopened.pageRuntime})
      }})
      const reopenedWrapper = mount(reopenedHost, {global: {plugins: [Spark.createPlugin(), ElementPlus, reopened.router],
        components: {SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub}}})
      await flushPromises()
      expect(reopenedWrapper.findComponent(DataSpaceDesignGraph).props('nodes')).toMatchObject([
        {id: 'MODEL-1', x: 250, y: 150}])
      expect(fixture.layoutCreateAttempts() + reopened.layoutCreateAttempts()).toBe(1)
      reopenedWrapper.unmount()
    } finally {Spark.getRegistry().unregister('data-space-design-graph'); vi.unstubAllGlobals(); restore()}
  })

  it('rejects a changed readable relation expression or permission before layout creation', async () => {
    const fixture = await createDesignFixture({layout: null, modelRows: [
      {rowid: 'MODEL-1', Name: 'A', MetaName: 'A', Type: '表', dataSetId: 'DS-1'}], fieldRows: [],
    relationRows: [{rowid: 'REL-1', dataSetId: 'DS-1', parentModId: 'MODEL-1', childModId: 'MODEL-1',
      depType: 'one-to-many', filter: '{"Type":"Constant","Value":1}'}]})
    await fixture.functions['__init__']?.()
    await fixture.functions['designPrepareLayoutCreate']?.()
    if (!fixture.http.relationRows?.[0]) throw new Error('formal relation is unavailable')
    fixture.http.relationRows[0]['filter'] = '{"Type":"Constant","Value":2}'
    await fixture.functions['designConfirmLayoutCreate']?.()
    expect(fixture.layoutCreateAttempts()).toBe(0)
    expect(fixture.layoutContent()).toBeNull()
    expect(record(fixture.functions['RenderDesignLayoutCreateStatus']?.())['children']).toContain('正式数据空间配置或读取权限已变化')

    await fixture.functions['designPrepareLayoutCreate']?.()
    fixture.http.rowPermissions['REL-1'] = {hiddenFields: [], maskedFields: ['filter']}
    await fixture.functions['designConfirmLayoutCreate']?.()
    expect(fixture.layoutCreateAttempts()).toBe(0)
  })

  it('rejects a changed target projection before first layout creation', async () => {
    const fixture = await createDesignFixture({layout: null})
    await fixture.functions['__init__']?.()
    await fixture.functions['designPrepareLayoutCreate']?.()
    fixture.http.targetRows = [{rowid: 'DS-1', Name: '目标空间已变更', Type: '数据库',
      description: '只读描述', sysid: 'app'}]
    await fixture.functions['designConfirmLayoutCreate']?.()
    expect(fixture.layoutCreateAttempts()).toBe(0)
    expect(fixture.layoutContent()).toBeNull()
    expect(record(fixture.functions['RenderDesignLayoutCreateStatus']?.())['children']).toContain('正式数据空间配置或读取权限已变化')
  })

  it('locks an unknown first layout write and does not repeat it', async () => {
    const fixture = await createDesignFixture({layout: null, layoutCreateResult: 'unknown'})
    await fixture.functions['__init__']?.()
    await fixture.functions['designPrepareLayoutCreate']?.()
    await fixture.functions['designConfirmLayoutCreate']?.()
    expect(fixture.layoutCreateAttempts()).toBe(1)
    expect(fixture.layoutWrites()).toBe(0)
    await fixture.functions['designConfirmLayoutCreate']?.()
    fixture.functions['designCancelLayoutCreate']?.()
    expect(fixture.layoutCreateAttempts()).toBe(1)
    expect(record(fixture.functions['designLayoutCreateConfirmBeforeRender']?.())['disabled']).toBe(true)
    expect(record(fixture.functions['RenderDesignLayoutCreateStatus']?.())['children']).toContain('结果尚未确认')
  })

  it('reports confirmed creation when its later formal reload fails without creating again', async () => {
    const fixture = await createDesignFixture({layout: null, failPostCreateReload: true})
    await fixture.functions['__init__']?.()
    await fixture.functions['designPrepareLayoutCreate']?.()
    await fixture.functions['designConfirmLayoutCreate']?.()
    expect(fixture.layoutCreateAttempts()).toBe(1)
    expect(fixture.layoutWrites()).toBe(1)
    expect(record(fixture.functions['RenderDesignLayoutCreateStatus']?.())['children'])
      .toContain('布局文件已创建，但后续完整读取未通过')
    await fixture.functions['designConfirmLayoutCreate']?.()
    expect(fixture.layoutCreateAttempts()).toBe(1)
  })

  it('creates a versioned empty graph and deterministic positions for multi-parent, cycle, and detached models', async () => {
    const empty = await createDesignFixture({layout: null, modelRows: [], fieldRows: [], relationRows: []})
    await empty.functions['__init__']?.()
    await empty.functions['designPrepareLayoutCreate']?.()
    await empty.functions['designConfirmLayoutCreate']?.()
    expect(JSON.parse(String(empty.layoutContent()))).toEqual({graphVersion: 1, nodes: [], edges: []})

    const ids = ['A', 'B', 'C', 'D', 'E']
    const fixture = await createDesignFixture({layout: null,
      modelRows: ids.map(id => ({rowid: id, Name: id, MetaName: id, Type: '表', dataSetId: 'DS-1'})), fieldRows: [],
      relationRows: [['A', 'C'], ['B', 'C'], ['C', 'D'], ['D', 'C']].map(([parent, child], index) => ({
        rowid: `REL-${index}`, dataSetId: 'DS-1', parentModId: parent, childModId: child, depType: 'one-to-many'}))})
    await fixture.functions['__init__']?.()
    await fixture.functions['designPrepareLayoutCreate']?.()
    await fixture.functions['designConfirmLayoutCreate']?.()
    const graph = JSON.parse(String(fixture.layoutContent()))
    expect(graph.nodes).toEqual([
      {id: 'A', x: 250, y: 150}, {id: 'B', x: 250, y: 356},
      {id: 'C', x: 584, y: 150}, {id: 'D', x: 250, y: 562}, {id: 'E', x: 250, y: 768}])
    expect(graph.edges).toHaveLength(4)
  })
  it('selects a readable input-parameter source row on the shared designFields currentRow', async () => {
    const fixture = await createDesignFixture({
      modelRows: [
        { rowid: 'MODEL-1', Name: '接口注册名', MetaName: '接口来源名', Type: '接口', dataSetId: 'DS-1', Filter: '' },
        { rowid: 'MODEL-2', Name: '模型乙', MetaName: '来源乙', Type: '接口', dataSetId: 'DS-1', Filter: '' },
      ],
      fieldRows: [
        { rowid: 'FIELD-ORDINARY', Name: '普通字段', type: 'dataModel', FieldType: 'varchar', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-INPUT', Name: '接口入参', type: 'inputParams', FieldType: 'INT', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-HIDDEN', Name: '隐藏入参名', type: 'inputParams', FieldType: 'varchar', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-OTHER-MODEL', Name: '其他模型入参', type: 'inputParams', FieldType: 'varchar', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-2' },
      ],
      rowPermissions: { 'FIELD-HIDDEN': { hiddenFields: ['Name'], maskedFields: [] } },
    })
    await fixture.functions['__init__']?.()
    const modelView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const fieldView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Field@designFields`)
    const modelRow = modelView?.rows.find(row => row['rowid'] === 'MODEL-1')
    if (!modelView || !fieldView || !modelRow) throw new Error('shared model and field DataViews are unavailable')
    modelView.setCurrentRow(modelRow)

    const selectorResult = fixture.functions['designModelInputParamSelectorBeforeRender']?.()
    if (!isRecord(selectorResult) || !isRecord(selectorResult['props'])) throw new Error('input-parameter selector is unavailable')
    const selectorProps = selectorResult['props']
    const options = selectorProps['options']
    if (!Array.isArray(options)) throw new Error('input-parameter selector options are unavailable')
    expect(options.filter(isRecord).map(option => option['value'])).toEqual(['FIELD-INPUT'])
    expect(selectorProps['modelValue']).toBe('')

    fixture.functions['designSelectModelInputParam']?.('FIELD-INPUT')
    expect(fieldView.currentRow).toBe(fieldView.rows.find(row => row['rowid'] === 'FIELD-INPUT'))
    const selectedResult = fixture.functions['designModelInputParamSelectorBeforeRender']?.()
    if (!isRecord(selectedResult) || !isRecord(selectedResult['props'])) throw new Error('selected source row was lost')
    expect(selectedResult['props']['modelValue']).toBe('FIELD-INPUT')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('guards source ValueFun by category, field permission, model identity, reload generation, and cancel', async () => {
    const fixture = await createDesignFixture({
      modelRows: [
        { rowid: 'MODEL-1', Name: '模型甲', MetaName: '来源甲', Type: '接口', dataSetId: 'DS-1', Filter: '' },
        { rowid: 'MODEL-2', Name: '模型乙', MetaName: '来源乙', Type: '视图', dataSetId: 'DS-1', Filter: '' },
      ],
      fieldRows: [
        { rowid: 'FIELD-ORDINARY', Name: '普通字段', AsName: '普通别名', type: 'dataModel', FieldType: 'INT', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-2' },
        { rowid: 'FIELD-INPUT-1', Name: '来源入参甲', type: 'inputParams', FieldType: 'INT', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-HIDDEN-NAME', Name: '隐藏名称入参', type: 'inputParams', FieldType: 'INT', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-HIDDEN-TYPE', Name: '隐藏分类入参', type: 'inputParams', FieldType: 'INT', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-INPUT-2', Name: '来源入参乙', type: 'inputParams', FieldType: 'INT', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-2' },
        { rowid: 'FIELD-INPUT-READONLY', Name: '只读入参', type: 'inputParams', FieldType: 'varchar', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-2' },
      ],
      inputParams: JSON.stringify([{ Name: '空间参数', Description: '设计空间参数' }]),
      rowPermissions: {
        'FIELD-HIDDEN-NAME': { hiddenFields: ['Name'], maskedFields: [] },
        'FIELD-HIDDEN-TYPE': { hiddenFields: ['type'], maskedFields: [] },
        'FIELD-INPUT-1': { hiddenFields: [], maskedFields: [], editableFields: ['ValueFun'] },
        'FIELD-INPUT-2': { hiddenFields: [], maskedFields: [], editableFields: ['ValueFun'] },
        'FIELD-INPUT-READONLY': { hiddenFields: [], maskedFields: [], editableFields: [] },
        'FIELD-ORDINARY': { hiddenFields: [], maskedFields: [], editableFields: ['AsName', 'ValueFun'] },
      },
    })
    await fixture.functions['__init__']?.()
    const modelView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const fieldView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Field@designFields`)
    if (!modelView || !fieldView) throw new Error('formal model and field DataViews are unavailable')
    const modelOne = modelView.rows.find(row => row['rowid'] === 'MODEL-1')
    const modelTwo = modelView.rows.find(row => row['rowid'] === 'MODEL-2')
    if (!modelOne || !modelTwo) throw new Error('source model rows are unavailable')
    modelView.setCurrentRow(modelOne)
    const firstOptions = fixture.functions['designModelInputParamSelectorBeforeRender']?.()
    if (!isRecord(firstOptions) || !isRecord(firstOptions['props']) || !Array.isArray(firstOptions['props']['options'])) {
      throw new Error('first model input-parameter options are unavailable')
    }
    expect(firstOptions['props']['options'].filter(isRecord).map(option => option['value'])).toEqual(['FIELD-INPUT-1'])
    fixture.functions['designSelectModelInputParam']?.('FIELD-INPUT-1')
    const firstValueEditor = fixture.functions['designInputParamValueFunctionBeforeRender']?.()
    if (!isRecord(firstValueEditor) || !isRecord(firstValueEditor['props'])
      || typeof firstValueEditor['props']['contextKey'] !== 'string') throw new Error('source ValueFun context is unavailable')
    expect(firstValueEditor['props']['disabled']).toBe(false)
    expect(firstValueEditor['props']['functionContext']).toMatchObject({
      systemParams: [{ label: '设计空间参数', value: '空间参数' }],
    })
    expect(Object.hasOwn(record(firstValueEditor['props']['functionContext']), 'inputParams')).toBe(false)
    const staleModelKey = firstValueEditor['props']['contextKey']
    const value = JSON.stringify({ Type: 'SystemData', ParamName: '空间参数' })
    fixture.functions['designChangeInputParamValueFunction']?.({ contextKey: staleModelKey, value })
    expect(fieldView.getEditingRow('FIELD-INPUT-1')?.['ValueFun']).toBe(value)
    fixture.functions['designCancelFieldEdit']?.()
    expect(fieldView.rows.find(row => row['rowid'] === 'FIELD-INPUT-1')?.['ValueFun']).toBe('')
    expect(fieldView.getEditingRow('FIELD-INPUT-1')?.['ValueFun']).toBe('')
    expect(fixture.http.saveRequests).toHaveLength(0)

    modelView.setCurrentRow(modelTwo)
    fixture.functions['designSelectModelInputParam']?.('FIELD-INPUT-2')
    const secondValueEditor = fixture.functions['designInputParamValueFunctionBeforeRender']?.()
    if (!isRecord(secondValueEditor) || !isRecord(secondValueEditor['props'])
      || typeof secondValueEditor['props']['contextKey'] !== 'string') throw new Error('second model ValueFun context is unavailable')
    fixture.functions['designChangeInputParamValueFunction']?.({ contextKey: staleModelKey, value })
    expect(fieldView.currentRow).toBe(fieldView.rows.find(row => row['rowid'] === 'FIELD-INPUT-2'))
    expect(fieldView.getEditingRow('FIELD-INPUT-2')?.['ValueFun']).toBe('')
    const staleReloadKey = secondValueEditor['props']['contextKey']
    fixture.functions['designChangeInputParamValueFunction']?.({ contextKey: staleReloadKey, value })
    expect(fieldView.getEditingRow('FIELD-INPUT-2')?.['ValueFun']).toBe(value)
    fieldView.updateEditingValue('FIELD-INPUT-2', 'AsName', '非法来源入参别名')
    await fixture.functions['designSaveField']?.()
    expect(fixture.http.saveRequests).toHaveLength(0)
    expect(fieldView.rows.find(row => row['rowid'] === 'FIELD-INPUT-2')?.['AsName']).toBeUndefined()
    fixture.functions['designCancelFieldEdit']?.()
    await fixture.functions['reloadDesign']?.()
    const reloadedModelTwo = modelView.rows.find(row => row['rowid'] === 'MODEL-2')
    if (!reloadedModelTwo) throw new Error('reloaded model row is unavailable')
    modelView.setCurrentRow(reloadedModelTwo)
    fixture.functions['designSelectModelInputParam']?.('FIELD-INPUT-2')
    fixture.functions['designChangeInputParamValueFunction']?.({ contextKey: staleReloadKey, value: '' })
    expect(fieldView.getEditingRow('FIELD-INPUT-2')?.['ValueFun']).toBe('')
    expect(fieldView.rows.find(row => row['rowid'] === 'FIELD-INPUT-2')?.['ValueFun']).toBe('')
    expect(fixture.http.saveRequests).toHaveLength(0)

    fixture.functions['designSelectModelInputParam']?.('FIELD-INPUT-READONLY')
    const readonlyEditor = fixture.functions['designInputParamValueFunctionBeforeRender']?.()
    if (!isRecord(readonlyEditor) || !isRecord(readonlyEditor['props'])
      || typeof readonlyEditor['props']['contextKey'] !== 'string') throw new Error('read-only input row editor is unavailable')
    expect(readonlyEditor['props']['disabled']).toBe(true)
    fixture.functions['designChangeInputParamValueFunction']?.({ contextKey: readonlyEditor['props']['contextKey'], value })
    expect(fieldView.getEditingRow('FIELD-INPUT-READONLY')?.['ValueFun']).toBe('')
    expect(fixture.http.saveRequests).toHaveLength(0)

    const ordinaryRow = fieldView.rows.find(row => row['rowid'] === 'FIELD-ORDINARY')
    if (!ordinaryRow) throw new Error('ordinary field row is unavailable')
    fieldView.setCurrentRow(ordinaryRow)
    expect(fixture.functions['designFieldEditorBeforeRender']?.()).toBe(true)
    const ordinaryEditor = fixture.functions['designFieldValueFunctionBeforeRender']?.()
    if (!isRecord(ordinaryEditor) || !isRecord(ordinaryEditor['props'])
      || typeof ordinaryEditor['props']['contextKey'] !== 'string') throw new Error('ordinary field ValueFun editor is unavailable')
    expect(ordinaryEditor['props']['functionContext']).toMatchObject({
      inputParams: [{ label: '设计空间参数', value: '空间参数' }],
    })
    expect(Object.hasOwn(record(ordinaryEditor['props']['functionContext']), 'systemParams')).toBe(false)
    fixture.functions['designChangeFieldValueFunctionValue']?.({ contextKey: ordinaryEditor['props']['contextKey'], value })
    expect(fieldView.getEditingRow('FIELD-ORDINARY')?.['ValueFun']).toBe(value)
    fixture.functions['designCancelFieldEdit']?.()
    expect(fieldView.rows.find(row => row['rowid'] === 'FIELD-ORDINARY')?.['ValueFun']).toBe('')
    expect(fieldView.rows.find(row => row['rowid'] === 'FIELD-ORDINARY')?.['AsName']).toBe('普通别名')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('routes a real Renderer input-parameter selection to the existing designFields DataView row', async () => {
    registerAllRenderers()
    Spark.register('data-space-filter-editor', DataSpaceFilterEditor)
    Spark.register('data-space-value-function-editor', DataSpaceValueFunctionEditor)
    Spark.register('data-space-design-graph', DataSpaceDesignGraph)
    const fixture = await createDesignFixture({
      modelRows: [
        { rowid: 'MODEL-1', Name: '接口注册名', MetaName: '接口来源名', Type: '接口', dataSetId: 'DS-1', Filter: '' },
        { rowid: 'MODEL-2', Name: '其他模型注册名', MetaName: '其他模型来源名', Type: '接口', dataSetId: 'DS-1', Filter: '' },
        { rowid: 'MODEL-PARENT', Name: '祖先注册名', MetaName: '祖先来源名', Type: '表', dataSetId: 'DS-1', Filter: '' },
        { rowid: 'MODEL-PARENT-2', Name: '另一祖先注册名', MetaName: '另一祖先来源名', Type: '表', dataSetId: 'DS-1', Filter: '' },
        { rowid: 'MODEL-GRAND', Name: '共享祖先注册名', MetaName: '共享祖先来源名', Type: '表', dataSetId: 'DS-1', Filter: '' },
      ],
      fieldRows: [
        { rowid: 'FIELD-ORDINARY', Name: '普通模型字段', type: 'dataModel', FieldType: 'INT', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-INPUT', Name: '接口入参', type: 'inputParams', FieldType: 'INT', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-HIDDEN', Name: '隐藏入参名', type: 'inputParams', FieldType: 'varchar', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-OTHER-MODEL', Name: '其他模型入参', type: 'inputParams', FieldType: 'varchar', ValueFun: '',
          dataSetId: 'DS-1', dataModelId: 'MODEL-2' },
        { rowid: 'FIELD-PARENT', Name: '祖先字段', AsName: '祖先别名', description: '祖先字段说明', type: 'dataModel', FieldType: 'varchar',
          ValueFun: '', dataSetId: 'DS-1', dataModelId: 'MODEL-PARENT' },
        { rowid: 'FIELD-PARENT-2', Name: '另一祖先字段', type: 'dataModel', FieldType: 'varchar',
          ValueFun: '', dataSetId: 'DS-1', dataModelId: 'MODEL-PARENT-2' },
        { rowid: 'FIELD-GRAND', Name: '共享祖先字段', type: 'dataModel', FieldType: 'varchar',
          ValueFun: '', dataSetId: 'DS-1', dataModelId: 'MODEL-GRAND' },
      ],
      relationRows: [
        { rowid: 'REL-1', dataSetId: 'DS-1', parentModId: 'MODEL-PARENT', childModId: 'MODEL-1' },
        { rowid: 'REL-2', dataSetId: 'DS-1', parentModId: 'MODEL-PARENT-2', childModId: 'MODEL-1' },
        { rowid: 'REL-3', dataSetId: 'DS-1', parentModId: 'MODEL-GRAND', childModId: 'MODEL-PARENT' },
        { rowid: 'REL-4', dataSetId: 'DS-1', parentModId: 'MODEL-GRAND', childModId: 'MODEL-PARENT-2' },
      ],
      inputParams: JSON.stringify([{ Name: '订单号', Description: '空间订单参数' }]),
      rowPermissions: {
        'FIELD-HIDDEN': { hiddenFields: ['Name'], maskedFields: [] },
        'FIELD-INPUT': { hiddenFields: [], maskedFields: [], editableFields: ['ValueFun'] },
      },
    })
    const restore = disableRendererStubs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const errors: string[] = []
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => null }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-input-param-select-test', id: 'design-input-param-select-test' })
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
      const modelView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
      const fieldView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Field@designFields`)
      const modelRow = modelView?.rows.find(row => row['rowid'] === 'MODEL-1')
      if (!modelView || !fieldView || !modelRow) throw new Error('real selector owner DataViews are unavailable')
      const modelTable = wrapper.findAllComponents(ElTable).find(table => table.text().includes('接口注册名'))
      if (!modelTable) throw new Error('real model table did not render its registered-name row')
      await modelTable.trigger('current-change', modelRow)
      await flushPromises()
      expect(modelView.currentRow?.['rowid']).toBe('MODEL-1')
      const selector = wrapper.findComponent(ElSelectV2)
      expect(selector.exists(), wrapper.html()).toBe(true)
      expect(selector.props('options')).toEqual([{ label: '接口入参', value: 'FIELD-INPUT' }])
      const selectInput = selector.find('input')
      await selectInput.trigger('click')
      await flushPromises()
      const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'))
        .find(item => item.textContent?.includes('接口入参'))
      if (!option) throw new Error('global el-select-v2 option did not render')
      option.click()
      await flushPromises()
      expect(selector.emitted('update:modelValue')).toEqual([['FIELD-INPUT']])
      expect(fieldView.currentRow).toBe(fieldView.rows.find(row => row['rowid'] === 'FIELD-INPUT'))
      expect(fixture.http.saveRequests).toHaveLength(0)
      const valueEditor = wrapper.findComponent(DataSpaceValueFunctionEditor)
      expect(valueEditor.exists()).toBe(true)
      expect(valueEditor.props('functionContext')).toMatchObject({
        tables: [
          { name: '接口注册名', fields: [{ name: '普通模型字段', type: 'int' }] },
          { name: '祖先注册名', fields: [{ name: '祖先字段', type: 'varchar', label: '祖先字段说明' }] },
          { name: '另一祖先注册名', fields: [{ name: '另一祖先字段', type: 'varchar' }] },
          { name: '共享祖先注册名', fields: [{ name: '共享祖先字段', type: 'varchar' }] },
        ],
        relatedFields: [
          { label: '祖先字段说明', value: '祖先注册名.祖先字段' },
          { label: '另一祖先注册名.另一祖先字段', value: '另一祖先注册名.另一祖先字段' },
          { label: '共享祖先注册名.共享祖先字段', value: '共享祖先注册名.共享祖先字段' },
        ],
        systemParams: [{ label: '空间订单参数', value: '订单号' }],
      })
      expect(Object.hasOwn(record(valueEditor.props('functionContext')), 'inputParams')).toBe(false)
      const originalQueryContext = JSON.stringify(modelView.queryContext)
      const originalFilterExpression = JSON.stringify(modelView.filterExpression)
      await valueEditor.get('[data-action="edit"]').trigger('click')
      const dialog = wrapper.findComponent(FilterValueFunctionDialog)
      const functionType = dialog.findAllComponents(ElSelect)[0]
      if (!functionType) throw new Error('ValueFun function type selector did not render')
      functionType.vm.$emit('update:modelValue', 'SystemData')
      await flushPromises()
      const systemParameter = dialog.findAllComponents(ElSelect)[1]
      if (!systemParameter) throw new Error('SystemData parameter selector did not render')
      systemParameter.vm.$emit('update:modelValue', '订单号')
      await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click')
      await flushPromises()
      const expectedValueFun = JSON.stringify({ Type: 'SystemData', ParamName: '订单号' })
      expect(fieldView.getEditingRow('FIELD-INPUT')?.['ValueFun']).toBe(expectedValueFun)
      expect(fieldView.rows.find(row => row['rowid'] === 'FIELD-INPUT')?.['ValueFun']).toBe('')
      expect(fixture.http.saveRequests).toHaveLength(0)
      expect(JSON.stringify(modelView.queryContext)).toBe(originalQueryContext)
      expect(JSON.stringify(modelView.filterExpression)).toBe(originalFilterExpression)
      const saveInput = wrapper.findAll('button').find(button => button.text().includes('保存来源入参'))
      if (!saveInput) throw new Error('source input save action did not render')
      await saveInput.trigger('click')
      await flushPromises()
      await flushPromises()
      expect(fixture.http.saveRequests).toHaveLength(1)
      const command = record(Array.isArray(fixture.http.saveRequests[0]?.data) ? fixture.http.saveRequests[0]?.data[0] : undefined)
      const crud = record(command['CrudModel'])
      const changed = Array.isArray(crud['Changed']) ? crud['Changed'][0] : undefined
      expect(isRecord(changed) ? changed['rowid'] : undefined).toBe('FIELD-INPUT')
      expect(isRecord(changed) ? changed['ValueFun'] : undefined).toBe(expectedValueFun)
      expect(Object.keys(record(changed)).sort()).toEqual(['ValueFun', 'lingma_sys_key', 'rowid'])
      expect(fieldView.rows.find(row => row['rowid'] === 'FIELD-INPUT')?.['ValueFun']).toBe(expectedValueFun)
      expect(JSON.stringify(modelView.queryContext)).toBe(originalQueryContext)
      expect(JSON.stringify(modelView.filterExpression)).toBe(originalFilterExpression)
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally {
      container.remove()
      Spark.getRegistry().unregister('data-space-filter-editor')
      Spark.getRegistry().unregister('data-space-value-function-editor')
      Spark.getRegistry().unregister('data-space-design-graph')
      restore()
    }
  })

  it('shares every readable ancestor branch across ValueFun and both Filter contexts', async () => {
    const modelRows = [
      { rowid: 'C', Name: '子注册', MetaName: '子来源', Type: '表', dataSetId: 'DS-1', Filter: '' },
      { rowid: 'P1', Name: '父一注册', MetaName: '父一来源', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'P2', Name: '父二注册', MetaName: '父二来源', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'H', Name: '隐藏父名', MetaName: '隐藏来源', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'G', Name: '共享祖先注册', MetaName: '共享祖先来源', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'A', Name: '隐藏父的祖先注册', MetaName: '隐藏父的祖先来源', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'U', Name: '无关注册', MetaName: '无关来源', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'E', Name: '', MetaName: '空注册名来源', Type: '表', dataSetId: 'DS-1' },
    ]
    const fieldRows = [
      { rowid: 'FC', Name: '子字段', type: 'dataModel', FieldType: 'INT', ValueFun: '', dataSetId: 'DS-1', dataModelId: 'C' },
      { rowid: 'FI', Name: '来源入参', type: 'inputParams', FieldType: 'INT', ValueFun: '', dataSetId: 'DS-1', dataModelId: 'C' },
      { rowid: 'FP1', Name: '父一字段', description: '隐藏字段说明', type: 'dataModel', FieldType: 'varchar', dataSetId: 'DS-1', dataModelId: 'P1' },
      { rowid: 'FP2', Name: '脱敏父二字段', type: 'dataModel', FieldType: 'varchar', dataSetId: 'DS-1', dataModelId: 'P2' },
      { rowid: 'FG', Name: '共享字段', type: 'dataModel', FieldType: 'varchar', dataSetId: 'DS-1', dataModelId: 'G' },
      { rowid: 'FA', Name: '上游字段', AsName: '脱敏别名', type: 'dataModel', FieldType: 'varchar', dataSetId: 'DS-1', dataModelId: 'A' },
      { rowid: 'FU', Name: '无关字段', type: 'dataModel', FieldType: 'varchar', dataSetId: 'DS-1', dataModelId: 'U' },
      { rowid: 'FE', Name: '不可具名字段', type: 'dataModel', FieldType: 'varchar', dataSetId: 'DS-1', dataModelId: 'E' },
    ]
    const relationRows = [
      { rowid: 'R1', dataSetId: 'DS-1', parentModId: 'P1', childModId: 'C', depType: 'one-to-many', filter: '' },
      { rowid: 'R2', dataSetId: 'DS-1', parentModId: 'P2', childModId: 'C', depType: 'one-to-many', filter: '' },
      { rowid: 'R3', dataSetId: 'DS-1', parentModId: 'H', childModId: 'C', depType: 'one-to-many', filter: '' },
      { rowid: 'R4', dataSetId: 'DS-1', parentModId: 'G', childModId: 'P1', depType: 'one-to-many', filter: '' },
      { rowid: 'R5', dataSetId: 'DS-1', parentModId: 'G', childModId: 'P2', depType: 'one-to-many', filter: '' },
      { rowid: 'R6', dataSetId: 'DS-1', parentModId: 'A', childModId: 'H', depType: 'one-to-many', filter: '' },
      { rowid: 'R7', dataSetId: 'DS-1', parentModId: 'C', childModId: 'G', depType: 'one-to-many', filter: '' },
      { rowid: 'R8', dataSetId: 'DS-1', parentModId: 'G', childModId: 'G', depType: 'one-to-many', filter: '' },
      { rowid: 'R9', dataSetId: 'DS-1', parentModId: 'E', childModId: 'C', depType: 'one-to-many', filter: '' },
    ]
    const fixture = await createDesignFixture({ modelRows, fieldRows, relationRows,
      inputParams: JSON.stringify([{ Name: '空间参数', Description: '参数说明' }]),
      rowPermissions: {
        C: { hiddenFields: [], maskedFields: [], editableFields: ['Filter'] },
        FC: { hiddenFields: [], maskedFields: [], editableFields: ['ValueFun'] },
        H: { hiddenFields: ['Name'], maskedFields: [] },
        FP1: { hiddenFields: ['description'], maskedFields: [] },
        FP2: { hiddenFields: [], maskedFields: ['Name'] },
        FA: { hiddenFields: [], maskedFields: ['AsName'] },
        R2: { hiddenFields: [], maskedFields: [], editableFields: ['filter'] },
      } })
    await fixture.functions['__init__']?.()
    expect(failedStatus(fixture.functions)).toContain('数据空间设计信息已加载')
    const models = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const fields = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Field@designFields`)
    const relations = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Relation@designRelations`)
    if (!models || !fields || !relations) throw new Error('expression catalog DataViews are missing')
    const current = models.rows.find(row => models.getPkKey(row) === 'C')
    const valueField = fields.rows.find(row => fields.getPkKey(row) === 'FC')
    const selected = relations.rows.find(row => relations.getPkKey(row) === 'R2')
    if (!current || !valueField || !selected) throw new Error('expression catalog identity is missing')
    models.setCurrentRow(current)
    fields.setCurrentRow(valueField)
    const ordinaryResult = fixture.functions['designFieldValueFunctionBeforeRender']?.()
    expect(ordinaryResult).toHaveProperty('props')
    const ordinary = record(record(ordinaryResult)['props'])
    const modelFilter = record(record(fixture.functions['designModelFilterEditorBeforeRender']?.())['props'])
    fixture.functions['designSelectRelation']?.(selected)
    const relationFilter = record(record(fixture.functions['designRelationFilterBeforeRender']?.())['props'])
    const joinFilter = record(record(fixture.functions['designRelationJoinFilterBeforeRender']?.())['props'])
    const ordinaryContext = record(ordinary['functionContext'])
    const modelContext = record(modelFilter['functionContext'])
    const relationContext = record(relationFilter['functionContext'])
    const ordinaryTables = ordinaryContext['tables']
    const modelTables = modelContext['tables']
    const relationTables = relationContext['tables']
    if (!Array.isArray(ordinaryTables) || !Array.isArray(modelTables) || !Array.isArray(relationTables)) {
      throw new Error('expression table catalog is missing')
    }
    const defaultNames = ['子注册', '父一注册', '父二注册', '共享祖先注册', '隐藏父的祖先注册']
    expect(ordinaryTables.map(item => record(item)['name'])).toEqual(defaultNames)
    expect(modelTables.map(item => record(item)['name'])).toEqual(defaultNames)
    expect(relationTables.map(item => record(item)['name']))
      .toEqual(['子注册', '父二注册', '父一注册', '共享祖先注册', '隐藏父的祖先注册'])
    expect(joinFilter['functionContext']).toEqual(relationFilter['functionContext'])
    expect(ordinaryContext['relatedFields']).toEqual([
      { label: '父一注册.父一字段', value: '父一注册.父一字段' },
      { label: '共享祖先注册.共享字段', value: '共享祖先注册.共享字段' },
      { label: '隐藏父的祖先注册.上游字段', value: '隐藏父的祖先注册.上游字段' },
    ])
    expect(modelFilter['columns']).toEqual([{ name: '子字段', type: 'int' }])
    expect(relationFilter['columns']).toEqual(modelFilter['columns'])
    expect(ordinaryContext['inputParams']).toEqual([{ label: '参数说明', value: '空间参数' }])
    expect(Object.hasOwn(ordinaryContext, 'systemParams')).toBe(false)
    expect(modelContext).toMatchObject({ systemParams: ordinaryContext['inputParams'], inputParams: ordinaryContext['inputParams'] })
    expect(relationContext).toMatchObject({ systemParams: ordinaryContext['inputParams'], inputParams: ordinaryContext['inputParams'] })
    expect(JSON.stringify({ ordinaryContext, modelContext, relationContext })).not.toContain('无关')
    expect(JSON.stringify({ ordinaryContext, modelContext, relationContext })).not.toContain('隐藏字段说明')
    expect(JSON.stringify({ ordinaryContext, modelContext, relationContext })).not.toContain('脱敏')
    expect(JSON.stringify({ ordinaryContext, modelContext, relationContext })).not.toContain('.不可具名字段')
  })

  it('rejects duplicate readable model registration names before the design becomes ready', async () => {
    const fixture = await createDesignFixture({ modelRows: [
      { rowid: 'MODEL-1', Name: '重复注册名', MetaName: '来源甲', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-2', Name: '重复注册名', MetaName: '来源乙', Type: '表', dataSetId: 'DS-1' },
    ], fieldRows: [] })
    await fixture.functions['__init__']?.()
    expect(failedStatus(fixture.functions)).toContain('模型注册名重复，表达式引用无法唯一绑定')
    expect(fixture.functions['designBeforeRender']?.()).toBe(false)
    expect(fixture.http.saveRequests).toHaveLength(0)
    expect(fixture.layoutReads()).toBe(0)
  })

  it.each(['hidden', 'masked'])('excludes $0 model registration names from duplicate checks and page output', async permission => {
    const fixture = await createDesignFixture({ modelRows: [
      { rowid: 'MODEL-1', Name: '可见注册名', MetaName: '来源甲', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-2', Name: '可见注册名', MetaName: '来源乙', Type: '表', dataSetId: 'DS-1' },
    ], fieldRows: [], rowPermissions: { 'MODEL-2': { hiddenFields: permission === 'hidden' ? ['Name'] : [],
      maskedFields: permission === 'masked' ? ['Name'] : [] } } })
    await fixture.functions['__init__']?.()
    expect(failedStatus(fixture.functions)).toContain('数据空间设计信息已加载')
    expect(fixture.http.saveRequests).toHaveLength(0)
    const modelView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const hiddenRow = modelView?.rows.find(row => modelView.getPkKey(row) === 'MODEL-2')
    if (!modelView || !hiddenRow) throw new Error('permission-restricted model row is missing')
    modelView.setCurrentRow(hiddenRow)
    const editor = fixture.functions['designModelFilterEditorBeforeRender']?.()
    expect(JSON.stringify(editor)).not.toContain('可见注册名')
  })

  it('rejects duplicate readable model names when restoring a parameter draft on remount', async () => {
    const fixture = await createDesignFixture({ modelRows: [
      { rowid: 'MODEL-1', Name: '原注册甲', MetaName: '来源甲', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-2', Name: '原注册乙', MetaName: '来源乙', Type: '表', dataSetId: 'DS-1' },
    ], fieldRows: [], rowPermissions: { 'DS-1': { hiddenFields: [], maskedFields: [], editableFields: ['inputParams'] } } })
    await fixture.functions['__init__']?.()
    expect(failedStatus(fixture.functions)).toContain('数据空间设计信息已加载')
    const parameters = fixture.pageRuntime.resolveView(`#${designId}@Base_DataSet@designParameters`)
    const models = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    if (!parameters || !models) throw new Error('remount DataViews are missing')
    parameters.updateEditingValue('DS-1', 'inputParams', '[]')
    fixture.http.modelRows = [
      { rowid: 'MODEL-1', Name: '重复注册名', MetaName: '来源甲', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-2', Name: '重复注册名', MetaName: '来源乙', Type: '表', dataSetId: 'DS-1' },
    ]
    const refresh = await models.loadFromServer({ fields: ['rowid', 'Name', 'MetaName', 'Type', 'dataSetId'],
      filter: { field: 'dataSetId', operator: 'eq', value: 'DS-1' }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    expect(refresh.success).toBe(true)
    await fixture.functions['__init__']?.()
    expect(failedStatus(fixture.functions)).toContain('模型注册名重复，表达式引用无法唯一绑定')
    expect(fixture.functions['designBeforeRender']?.()).toBe(false)
    expect(parameters.getEditingRow('DS-1')?.['inputParams']).toBe('[]')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('renders the real model Filter editor from the page rule and saves its staged tree through the model DataView', async () => {
    registerAllRenderers()
    Spark.register('data-space-filter-editor', DataSpaceFilterEditor)
    Spark.register('data-space-design-graph', DataSpaceDesignGraph)
    const fixture = await createDesignFixture({ modelRows: [{ rowid: 'MODEL-1', Name: '注册名甲', MetaName: '来源名甲',
      description: '模型说明', Type: '表', dataSetId: 'DS-1', Filter: '', OutputType: 'Table' }],
      fieldRows: [
        { rowid: 'FIELD-1', Name: '字段源甲', AsName: '', FieldType: 'varchar', IsOutput: 1, IsPKey: 0,
          description: '字段说明', dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-2', Name: 'Age', AsName: '', FieldType: 'INT', IsOutput: 1, IsPKey: 0,
          description: '年龄', dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
      ], inputParams: JSON.stringify([{ Name: '客户号', Description: '空间客户参数' }]),
      rowPermissions: { 'MODEL-1': { hiddenFields: [], maskedFields: [], editableFields: ['Filter'] } } })
    const restore = disableRendererStubs()
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const errors: string[] = []
      const services = { dataSpaceLayout: { scenarioId: designId,
        createReader: () => ({ readDataSpaceLayout: async () => null }) } }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-model-filter-test', id: 'design-model-filter-test' })
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
      const modelView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
      const modelRow = modelView?.rows[0]
      if (!modelView || !modelRow) throw new Error('formal model filter editor owner is unavailable')
      modelView.setCurrentRow(modelRow)
      const originalQueryContext = JSON.stringify(modelView.queryContext)
      const originalFilterExpression = JSON.stringify(modelView.filterExpression)
      await flushPromises()
      const editor = wrapper.findComponent(DataSpaceFilterEditor)
      expect(editor.exists()).toBe(true)
      expect(editor.props('columns')).toMatchObject([
        { name: '字段源甲', type: 'varchar', label: '字段说明' }, { name: 'Age', type: 'int', label: '年龄' },
      ])
      expect(editor.props('functionContext')).toMatchObject({
        tables: [{ name: '注册名甲' }], systemParams: [{ label: '空间客户参数', value: '客户号' }],
      })
      await editor.get('[data-action="open"]').trigger('click')
      const group = wrapper.findComponent(FilterExpressionGroup)
      expect(group.exists()).toBe(true)
      const draft = group.props('draft')
      await group.findAll('button').find(button => button.text() === '添加条件')?.trigger('click')
      const condition = draft.root.children[0]
      if (!condition || condition.kind !== 'condition') throw new Error('Filter tree did not add a condition')
      condition.field = 'Age'
      condition.operator = 'gt'
      condition.valueText = '3'
      const apply = document.body.querySelector<HTMLButtonElement>('[data-action="apply"]')
      if (!apply) throw new Error('Filter tree apply action is missing')
      apply.click()
      await flushPromises()
      const editingWire = modelView.getEditingRow('MODEL-1')?.['Filter']
      expect(typeof editingWire).toBe('string')
      const wire = JSON.parse(typeof editingWire === 'string' ? editingWire : '')
      expect(wire).toMatchObject({ Type: 'cond', Field: 'Age', Value: null,
        ValueFun: { Type: 'GetConstValue', Value: 3 } })
      expect(JSON.stringify(modelView.queryContext)).toBe(originalQueryContext)
      expect(JSON.stringify(modelView.filterExpression)).toBe(originalFilterExpression)
      expect(modelView.rows[0]?.['Filter']).toBe('')
      expect(fixture.http.saveRequests).toHaveLength(0)
      const saveButton = wrapper.findAll('button').find(button => button.text().includes('保存模型配置'))
      if (!saveButton) throw new Error('model save action is missing after Filter tree apply')
      await saveButton.trigger('click')
      await flushPromises()
      await flushPromises()
      expect(fixture.http.saveRequests).toHaveLength(1)
      const command = record(Array.isArray(fixture.http.saveRequests[0]?.data) ? fixture.http.saveRequests[0]?.data[0] : undefined)
      const crud = record(command['CrudModel'])
      const changed = Array.isArray(crud['Changed']) ? crud['Changed'][0] : undefined
      expect(isRecord(changed) ? changed['Filter'] : undefined).toBe(editingWire)
      expect(modelView.rows[0]?.['Filter']).toBe(editingWire)
      expect(JSON.stringify(modelView.queryContext)).toBe(originalQueryContext)
      expect(JSON.stringify(modelView.filterExpression)).toBe(originalFilterExpression)
      expect(fixture.http.requests.every(request => request.url !== '/api/DataOperation/BatchTableOperateRequestByCRUD'
        || request.method === 'POST')).toBe(true)
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally {
      container.remove()
      Spark.getRegistry().unregister('data-space-filter-editor')
      Spark.getRegistry().unregister('data-space-design-graph')
      restore()
    }
  })

  it('refuses unavailable Filter writes, preserves a draft on cancel, and rejects a captured old target event', async () => {
    const fixture = await createDesignFixture({ rowPermissions: { 'MODEL-1': { hiddenFields: [], maskedFields: [], editableFields: ['description'] } } })
    await fixture.functions['__init__']?.()
    const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const row = view?.rows[0]
    if (!view || !row) throw new Error('formal model filter owner is unavailable')
    view.setCurrentRow(row)
    const unavailable = fixture.functions['designModelFilterEditorBeforeRender']?.()
    if (!isRecord(unavailable) || !isRecord(unavailable['props'])) throw new Error('Filter editor permissions are unavailable')
    expect(unavailable['visible']).toBe(true)
    expect(unavailable['props']['disabled']).toBe(true)
    const staleKey = unavailable['props']['contextKey']
    if (typeof staleKey !== 'string') throw new Error('Filter editor context key is missing')
    fixture.functions['designChangeModelFilter']?.({ contextKey: staleKey, value: '{"stale":true}' })
    expect(view.getEditingRow('MODEL-1')?.['Filter']).toBe('')
    expect(fixture.http.saveRequests).toHaveLength(0)

    const editable = await createDesignFixture({ modelRows: [
      { rowid: 'MODEL-1', Name: '模型甲', MetaName: '来源甲', description: '', Type: '表', dataSetId: 'DS-1', Filter: '' },
      { rowid: 'MODEL-2', Name: '模型乙', MetaName: '来源乙', description: '', Type: '表', dataSetId: 'DS-1', Filter: '' },
    ], rowPermissions: { 'MODEL-1': { hiddenFields: [], maskedFields: [], editableFields: ['Filter'] },
      'MODEL-2': { hiddenFields: [], maskedFields: [], editableFields: ['Filter'] } } })
    await editable.functions['__init__']?.()
    const editableView = editable.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const editableRow = editableView?.rows[0]
    if (!editableView || !editableRow) throw new Error('editable model filter owner is unavailable')
    editableView.setCurrentRow(editableRow)
    const opened = editable.functions['designModelFilterEditorBeforeRender']?.()
    if (!isRecord(opened) || !isRecord(opened['props']) || typeof opened['props']['contextKey'] !== 'string') {
      throw new Error('editable Filter context key is missing')
    }
    editable.functions['designChangeModelFilter']?.({ contextKey: opened['props']['contextKey'], value: 'local draft' })
    expect(editableView.getEditingRow('MODEL-1')?.['Filter']).toBe('local draft')
    editable.functions['designCancelModelEdit']?.()
    expect(editableView.getEditingRow('MODEL-1')?.['Filter']).toBe('')
    expect(editableView.rows[0]?.['Filter']).toBe('')
    expect(editable.http.saveRequests).toHaveLength(0)
    const oldEvent = opened['props']['contextKey']
    const secondModel = editableView.rows.find(candidate => candidate['rowid'] === 'MODEL-2')
    if (!secondModel) throw new Error('second model row is unavailable for context-switch check')
    editableView.setCurrentRow(secondModel)
    editable.functions['designChangeModelFilter']?.({ contextKey: oldEvent, value: 'same value, stale model' })
    expect(editableView.getEditingRow('MODEL-2')?.['Filter']).toBe('')
    const firstModel = editableView.rows.find(candidate => candidate['rowid'] === 'MODEL-1')
    if (!firstModel) throw new Error('first model row is unavailable after context switch')
    editableView.setCurrentRow(firstModel)
    await editable.functions['reloadDesign']?.()
    editable.functions['designChangeModelFilter']?.({ contextKey: oldEvent, value: 'late event' })
    expect(editableView.getEditingRow('MODEL-1')?.['Filter']).toBe('')
    expect(editable.http.saveRequests).toHaveLength(0)

    for (const sourceType of ['接口', '视图']) {
      const inputMode = await createDesignFixture({ modelRows: [{ rowid: 'MODEL-1', Name: '注册名', MetaName: '来源名',
        description: '模型说明', Type: sourceType, dataSetId: 'DS-1', Filter: 'keep existing filter' }] })
      await inputMode.functions['__init__']?.()
      const inputView = inputMode.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
      const inputRow = inputView?.rows[0]
      if (!inputView || !inputRow) throw new Error('input-parameter mode model row is unavailable')
      inputView.setCurrentRow(inputRow)
      expect(inputMode.functions['designModelFilterEditorBeforeRender']?.()).toEqual({ visible: false })
      expect(inputView.rows[0]?.['Filter']).toBe('keep existing filter')
      expect(inputMode.http.saveRequests).toHaveLength(0)
    }

    const databaseView = await createDesignFixture({ modelRows: [{ rowid: 'MODEL-1', Name: '数据库视图模型', MetaName: '来源视图',
      description: '数据库视图', Type: '数据库视图', dataSetId: 'DS-1', Filter: '' }],
      rowPermissions: { 'MODEL-1': { hiddenFields: [], maskedFields: [], editableFields: ['Filter'] } } })
    await databaseView.functions['__init__']?.()
    const databaseViewRows = databaseView.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const databaseViewRow = databaseViewRows?.rows[0]
    if (!databaseViewRows || !databaseViewRow) throw new Error('database-view model row is unavailable')
    databaseViewRows.setCurrentRow(databaseViewRow)
    const databaseViewEditor = databaseView.functions['designModelFilterEditorBeforeRender']?.()
    if (!isRecord(databaseViewEditor)) throw new Error('database-view Filter editor visibility result is missing')
    expect(databaseViewEditor['visible']).toBe(true)
    expect(databaseView.http.saveRequests).toHaveLength(0)

    const hiddenType = await createDesignFixture({ hiddenFields: ['Type'] })
    await hiddenType.functions['__init__']?.()
    const hiddenTypeView = hiddenType.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const hiddenTypeRow = hiddenTypeView?.rows[0]
    if (!hiddenTypeView || !hiddenTypeRow) throw new Error('hidden model type row is unavailable')
    hiddenTypeView.setCurrentRow(hiddenTypeRow)
    expect(hiddenType.functions['designModelFilterEditorBeforeRender']?.()).toEqual({ visible: false })

    const hiddenName = await createDesignFixture({ hiddenFields: ['Name'] })
    await hiddenName.functions['__init__']?.()
    const hiddenNameView = hiddenName.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const hiddenNameRow = hiddenNameView?.rows[0]
    if (!hiddenNameView || !hiddenNameRow) throw new Error('hidden model name row is unavailable')
    hiddenNameView.setCurrentRow(hiddenNameRow)
    const hiddenNameEditor = hiddenName.functions['designModelFilterEditorBeforeRender']?.()
    if (!isRecord(hiddenNameEditor)) throw new Error('Filter editor visibility result is missing')
    if (hiddenNameEditor['visible'] === true) {
      const props = hiddenNameEditor['props']
      const functionContext = isRecord(props) ? props['functionContext'] : undefined
      expect(isRecord(functionContext) ? functionContext['tables'] : undefined).toEqual([])
    } else {
      expect(hiddenNameEditor['visible']).toBe(false)
    }
  })

  it('edits model metadata through the staged DataView owner and confirms numeric flags by readback', async () => {
    const fixture = await createDesignFixture({ rowPermissions: { 'MODEL-1': { hiddenFields: [], maskedFields: [],
      editableFields: ['description', 'RequestComplete', 'IsBusiness', 'IsBusinessMain'] } } })
    await fixture.functions['__init__']?.()
    const dataSet = fixture.pageRuntime.getDataSet(designId)
    const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const row = view?.rows[0]
    if (!dataSet || !view || !row) throw new Error('formal model editor owner is unavailable')
    view.setCurrentRow(row)
    view.updateEditingValue('MODEL-1', 'description', '更新后的模型说明')
    view.updateEditingValue('MODEL-1', 'RequestComplete', '完成回执')
    view.updateEditingValue('MODEL-1', 'IsBusiness', true)
    view.updateEditingValue('MODEL-1', 'IsBusinessMain', true)
    expect(fixture.functions['designModelSaveBeforeRender']?.()).toBe(true)
    await fixture.functions['designSaveModel']?.()
    expect(fixture.http.saveRequests).toHaveLength(1)
    const command = record((Array.isArray(fixture.http.saveRequests[0]?.data)
      ? fixture.http.saveRequests[0]?.data[0] : undefined))
    expect(command['TableName']).toBe('Base_DataModel')
    const crudModel = record(command['CrudModel'])
    const changedRows = Array.isArray(crudModel['Changed']) ? crudModel['Changed'] : []
    const changed = changedRows[0]
    expect(isRecord(changed)).toBe(true)
    if (!isRecord(changed)) throw new Error('model save command has no changed row')
    expect(changed).toMatchObject({ rowid: 'MODEL-1', description: '更新后的模型说明',
      RequestComplete: '完成回执', IsBusiness: 1, IsBusinessMain: 1 })
    expect(view.rows[0]).toMatchObject({ rowid: 'MODEL-1', description: '更新后的模型说明',
      RequestComplete: '完成回执', IsBusiness: 1, IsBusinessMain: 1 })
    expect(fixture.functions['designBeforeRender']?.()).toBe(true)
  })

  it('edits model request and tree settings from current model fields and reads the saved row back', async () => {
    const fixture = await createDesignFixture({
      modelRows: [{ rowid: 'MODEL-1', Name: '注册名', MetaName: '来源名', description: '模型说明', Type: '表',
        dataSetId: 'DS-1', Filter: '', RequestComplete: '', OutputType: 'Table', parentField: '', hasChildField: '',
        selfType: 'child', topValue: '', cacheType: '不设置', IsBusiness: 0, IsBusinessMain: 0 },
        { rowid: 'MODEL-2', Name: '注册名乙', MetaName: '来源名乙', description: '另一个模型', Type: '表',
          dataSetId: 'DS-1', Filter: '', RequestComplete: '', OutputType: 'Table', IsBusiness: 0, IsBusinessMain: 0 }],
      fieldRows: [
        { rowid: 'FIELD-PARENT', Name: 'ParentId', AsName: '', FieldType: 'varchar', IsOutput: 1, IsPKey: 0,
          description: '父级字段', dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-CHILD', Name: 'HasChildren', AsName: '', FieldType: 'boolean', IsOutput: 1, IsPKey: 0,
          description: '子级字段', dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-OTHER', Name: 'ForeignParent', AsName: '', FieldType: 'varchar', IsOutput: 1, IsPKey: 0,
          description: '其他模型字段', dataSetId: 'DS-1', dataModelId: 'MODEL-2' },
        { rowid: 'FIELD-HIDDEN', Name: 'HiddenParent', AsName: '', FieldType: 'varchar', IsOutput: 1, IsPKey: 0,
          description: '隐藏字段', dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-MASKED', Name: 'MaskedParent', AsName: '', FieldType: 'varchar', IsOutput: 1, IsPKey: 0,
          description: '脱敏字段', dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
      ],
      rowPermissions: {
        'MODEL-1': { hiddenFields: [], maskedFields: [], editableFields: ['OutputType', 'parentField', 'hasChildField',
          'selfType', 'topValue', 'cacheType'] },
        'FIELD-HIDDEN': { hiddenFields: ['Name'], maskedFields: [] },
        'FIELD-MASKED': { hiddenFields: [], maskedFields: ['Name'] },
      },
    })
    await fixture.functions['__init__']?.()
    const modelView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const fieldView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Field@designFields`)
    if (!modelView?.rows[0] || !fieldView) throw new Error('formal model and field views are unavailable')
    modelView.setCurrentRow(modelView.rows[0])
    const parentFieldProps = record(fixture.functions['designModelParentFieldBeforeRender']?.())
    const parentProps = record(parentFieldProps['props'])
    const options = parentProps['options']
    if (!Array.isArray(options)) throw new Error('current model field options are unavailable')
    expect(options.filter(isRecord).map(option => option['value'])).toEqual(['ParentId', 'HasChildren'])

    modelView.updateEditingValue('MODEL-1', 'OutputType', 'SelfRefData')
    modelView.updateEditingValue('MODEL-1', 'parentField', 'ParentId')
    modelView.updateEditingValue('MODEL-1', 'hasChildField', 'HasChildren')
    modelView.updateEditingValue('MODEL-1', 'selfType', 'parent')
    modelView.updateEditingValue('MODEL-1', 'topValue', 'ROOT')
    modelView.updateEditingValue('MODEL-1', 'cacheType', '页面')
    expect(fixture.functions['designModelSaveBeforeRender']?.()).toBe(true)
    await fixture.functions['designSaveModel']?.()

    expect(fixture.http.saveRequests).toHaveLength(1)
    const command = record((Array.isArray(fixture.http.saveRequests[0]?.data) ? fixture.http.saveRequests[0]?.data[0] : undefined))
    expect(command['TableName']).toBe('Base_DataModel')
    const crud = record(command['CrudModel'])
    const changed = Array.isArray(crud['Changed']) ? crud['Changed'] : []
    expect(changed).toHaveLength(1)
    expect(changed[0]).toMatchObject({ rowid: 'MODEL-1', OutputType: 'SelfRefData', parentField: 'ParentId',
      hasChildField: 'HasChildren', selfType: 'parent', topValue: 'ROOT', cacheType: '页面' })
    expect(modelView.rows[0]).toMatchObject({ rowid: 'MODEL-1', OutputType: 'SelfRefData', parentField: 'ParentId',
      hasChildField: 'HasChildren', selfType: 'parent', topValue: 'ROOT', cacheType: '页面' })

    modelView.updateEditingValue('MODEL-1', 'selfType', '')
    expect(modelView.getEditingRow('MODEL-1')?.['selfType']).toBe('')
    await fixture.functions['designSaveModel']?.()
    expect(fixture.http.saveRequests).toHaveLength(2)
    const clearCommand = record((Array.isArray(fixture.http.saveRequests[1]?.data) ? fixture.http.saveRequests[1]?.data[0] : undefined))
    const clearCrud = record(clearCommand['CrudModel'])
    const clearChanged = Array.isArray(clearCrud['Changed']) ? clearCrud['Changed'] : []
    expect(clearChanged).toMatchObject([{ rowid: 'MODEL-1', selfType: '' }])
    expect(modelView.rows[0]?.['selfType']).toBe('')
  })

  it('saves field order and group settings, explicitly clears order type, and rejects negative integers', async () => {
    const fixture = await createDesignFixture({ fieldRows: [{ rowid: 'FIELD-1', Name: '字段源甲', AsName: '字段甲',
      FieldType: 'varchar', IsOutput: 1, IsPKey: 1, description: '正式字段描述', dataSetId: 'DS-1', dataModelId: 'MODEL-1',
      OrderType: 'ascending', Order: 3, Group: 2 }],
    rowPermissions: { 'FIELD-1': { hiddenFields: [], maskedFields: [], editableFields: ['OrderType', 'Order', 'Group'] } } })
    await fixture.functions['__init__']?.()
    const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Field@designFields`)
    if (!view?.rows[0]) throw new Error('formal field editor view is unavailable')
    view.setCurrentRow(view.rows[0])
    view.updateEditingValue('FIELD-1', 'OrderType', '')
    view.updateEditingValue('FIELD-1', 'Order', 0)
    view.updateEditingValue('FIELD-1', 'Group', 0)
    expect(fixture.functions['designFieldSaveBeforeRender']?.()).toBe(true)
    await fixture.functions['designSaveField']?.()
    expect(fixture.http.saveRequests).toHaveLength(1)
    const command = record((Array.isArray(fixture.http.saveRequests[0]?.data) ? fixture.http.saveRequests[0]?.data[0] : undefined))
    const crud = record(command['CrudModel'])
    const changed = Array.isArray(crud['Changed']) ? crud['Changed'] : []
    expect(changed).toMatchObject([{ rowid: 'FIELD-1', OrderType: '', Order: 0, Group: 0 }])
    expect(view.rows[0]).toMatchObject({ OrderType: '', Order: 0, Group: 0 })

    view.updateEditingValue('FIELD-1', 'Group', -1)
    await fixture.functions['designSaveField']?.()
    expect(fixture.http.saveRequests).toHaveLength(1)
    expect(view.rows[0]?.['Group']).toBe(0)
  })

  it('warns and preserves unknown model enums when saving another field', async () => {
    const fixture = await createDesignFixture({ modelRows: [{ rowid: 'MODEL-1', Name: '注册名', MetaName: '来源名',
      description: '模型说明', Type: '表', dataSetId: 'DS-1', Filter: '', RequestComplete: '', OutputType: 'LegacyMode',
      parentField: 'RemovedField', hasChildField: '', selfType: 'LegacySelf', topValue: '', cacheType: 'LegacyCache',
      IsBusiness: 0, IsBusinessMain: 0 }], fieldRows: [{ rowid: 'FIELD-1', Name: '字段源甲', AsName: '字段甲',
      FieldType: 'varchar', IsOutput: 1, IsPKey: 1, description: '正式字段描述', dataSetId: 'DS-1', dataModelId: 'MODEL-1',
      OrderType: 'legacy-order', Order: 1, Group: 0 }],
    rowPermissions: { 'MODEL-1': { hiddenFields: [], maskedFields: [], editableFields: ['description'] } } })
    await fixture.functions['__init__']?.()
    const modelView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const fieldView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Field@designFields`)
    if (!modelView?.rows[0] || !fieldView?.rows[0]) throw new Error('formal editor views are unavailable')
    modelView.setCurrentRow(modelView.rows[0])
    fieldView.setCurrentRow(fieldView.rows[0])
    const warning = record(fixture.functions['RenderDesignModelConfigStatus']?.())
    expect(warning['children']).toContain('未知')
    const enumProps = record(fixture.functions['designModelOutputTypeBeforeRender']?.())
    const options = enumProps['options']
    expect(Array.isArray(options) && options.some(option => isRecord(option) && option['value'] === 'LegacyMode')).toBe(true)
    modelView.updateEditingValue('MODEL-1', 'description', '更新说明')
    await fixture.functions['designSaveModel']?.()
    expect(fixture.http.saveRequests).toHaveLength(1)
    const command = record((Array.isArray(fixture.http.saveRequests[0]?.data) ? fixture.http.saveRequests[0]?.data[0] : undefined))
    const crud = record(command['CrudModel'])
    const changed = Array.isArray(crud['Changed']) ? crud['Changed'] : []
    expect(changed[0]).toMatchObject({ rowid: 'MODEL-1', description: '更新说明' })
    expect(isRecord(changed[0]) && Object.keys(changed[0])).toEqual(expect.arrayContaining(['description', 'rowid']))
    expect(changed[0]).not.toHaveProperty('OutputType')
    expect(modelView.rows[0]).toMatchObject({ OutputType: 'LegacyMode', selfType: 'LegacySelf', cacheType: 'LegacyCache' })
    expect(fieldView.rows[0]).toMatchObject({ OrderType: 'legacy-order' })
  })

  it('refuses model writes when an edited field lacks current write permission or the target changes', async () => {
    const fixture = await createDesignFixture({ rowPermissions: { 'MODEL-1': { hiddenFields: [], maskedFields: [],
      editableFields: ['description'] } } })
    await fixture.functions['__init__']?.()
    const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    if (!view?.rows[0]) throw new Error('formal model editor view is unavailable')
    view.setCurrentRow(view.rows[0])
    view.updateEditingValue('MODEL-1', 'OutputType', 'Join')
    await fixture.functions['designSaveModel']?.()
    expect(fixture.http.saveRequests).toHaveLength(0)

    view.discardEditingRows(['MODEL-1'])
    view.updateEditingValue('MODEL-1', 'description', '不会跨目标保存')
    routeSnapshot.query['dataSpaceId'] = 'DS-OTHER'
    try {
      expect(fixture.functions['designModelSaveBeforeRender']?.()).toBe(false)
      await fixture.functions['designSaveModel']?.()
      expect(fixture.http.saveRequests).toHaveLength(0)
    } finally {
      routeSnapshot.query['dataSpaceId'] = 'DS-1'
    }
  })

  it('cancels field edits locally without dispatching a write', async () => {
    const fixture = await createDesignFixture({ rowPermissions: { 'FIELD-1': { hiddenFields: [], maskedFields: [],
      editableFields: ['description', 'AsName', 'IsOutput'] } } })
    await fixture.functions['__init__']?.()
    const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Field@designFields`)
    const row = view?.rows[0]
    if (!view || !row) throw new Error('formal field editor view is unavailable')
    view.setCurrentRow(row)
    view.updateEditingValue('FIELD-1', 'AsName', '新别名')
    expect(fixture.functions['designFieldSaveBeforeRender']?.()).toBe(true)
    fixture.functions['designCancelFieldEdit']?.()
    expect(view.getEditingRow('FIELD-1')?.['AsName']).toBe('字段甲')
    expect(view.hasEditingChanges('FIELD-1')).toBe(false)
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

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

  it('routes a real graph drag through the page draft, cancel, and exact layout save', async () => {
    registerAllRenderers()
    Spark.register('data-space-design-graph', DataSpaceDesignGraph)
    vi.stubGlobal('ResizeObserver', class { public observe(): void {} public unobserve(): void {} public disconnect(): void {} })
    const original = JSON.stringify({graphVersion: 1, custom: {keep: true}, nodes: [
      {id: 'MODEL-1', x: 0, y: 0, label: 'keep node', text: {x: 5, y: 6}},
      {id: 'MODEL-2', x: 100, y: 40}], edges: [{id: 'REL-1', sourceNodeId: 'MODEL-1', targetNodeId: 'MODEL-2', custom: 'keep edge',
        pointsList: [{x: 0, y: 0, tag: 'start'}, {x: 0, y: 40, tag: 'bend'}, {x: 100, y: 40, tag: 'end'}]}]})
    const fixture = await createDesignFixture({layout: original, modelRows: [
      {rowid: 'MODEL-1', Name: 'A', MetaName: '模型甲', Type: '表', dataSetId: 'DS-1'},
      {rowid: 'MODEL-2', Name: 'B', MetaName: '模型乙', Type: '表', dataSetId: 'DS-1'}], fieldRows: [],
    relationRows: [{rowid: 'REL-1', dataSetId: 'DS-1', parentModId: 'MODEL-1', childModId: 'MODEL-2', depType: 'one-to-many'}]})
    const restore = disableRendererStubs()
    try {
      const services = {dataSpaceLayout: {scenarioId: designId,
        createReader: () => ({readDataSpaceLayout: async () => fixture.layoutContent()}),
        createWriter: () => ({saveDataSpaceLayout: async (command: Parameters<PageContext['$page']['saveDataSpaceLayout']>[0]) => fixture.writeLayout(command),
          createDataSpaceLayout: async () => { throw new Error('fixture layout creation is unavailable') }})}}
      const Host = defineComponent({setup() {
        const context = useSparkComponent({type: 'graph-layout-test', id: 'graph-layout-test'})
        context.sparkProvide(PAGE_RUNTIME_SERVICES, services)
        return () => h(resolveComponent('SparkPageRenderer'), {routeSnapshot, pageRuntime: fixture.pageRuntime})
      }})
      const wrapper = mount(Host, {global: {plugins: [Spark.createPlugin(), ElementPlus, fixture.router],
        components: {SparkPageRenderer, ElTabs: ElementTabsStub, ElTabPane: ElementTabPaneStub}}})
      await flushPromises()
      const graph = wrapper.findComponent(DataSpaceDesignGraph)
      const flow = graph.findComponent(VueFlow)
      expect(flow.exists()).toBe(true)
      const drag = () => {
        flow.vm.$emit('nodeDragStart', {node: {id: 'MODEL-1', position: {x: -116, y: -60}}})
        flow.vm.$emit('nodeDrag', {node: {id: 'MODEL-1', position: {x: -96, y: -50}}})
        flow.vm.$emit('nodeDragStop', {node: {id: 'MODEL-1', position: {x: -96, y: -50}}})
      }
      drag()
      await flushPromises()
      expect(wrapper.text()).toContain('布局有未保存修改')
      expect(fixture.layoutWrites()).toBe(0)
      expect(fixture.layoutContent()).toBe(original)
      const goBack = wrapper.findAll('button').find(button => button.text() === '返回目录')
      if (!goBack) throw new Error('catalog return action is missing')
      await goBack.trigger('click')
      await flushPromises()
      expect(wrapper.find('[role="status"].design-graph-status').text()).toContain('请先保存或取消')
      expect(fixture.navigationCalls).toHaveLength(0)
      const cancel = wrapper.findAll('button').find(button => button.text() === '取消布局修改')
      if (!cancel) throw new Error('layout cancel action is missing')
      await cancel.trigger('click')
      await flushPromises()
      expect(fixture.layoutWrites()).toBe(0)
      expect(graph.props('nodes')[0]).toMatchObject({id: 'MODEL-1', x: 0, y: 0})
      drag()
      await flushPromises()
      const save = wrapper.findAll('button').find(button => button.text() === '保存布局')
      if (!save) throw new Error('layout save action is missing')
      await save.trigger('click')
      await flushPromises()
      expect(fixture.layoutWrites()).toBe(1)
      expect(JSON.parse(String(fixture.layoutContent()))).toMatchObject({custom: {keep: true}, nodes: [
        {id: 'MODEL-1', x: 20, y: 10, label: 'keep node', text: {x: 25, y: 16}}, {id: 'MODEL-2', x: 100, y: 40}],
      edges: [{id: 'REL-1', custom: 'keep edge', pointsList: [
        {x: 20, y: 10, tag: 'start'}, {x: 20, y: 40, tag: 'bend'}, {x: 100, y: 40, tag: 'end'}]}]})
      flow.vm.$emit('nodeDoubleClick', {node: {id: 'MODEL-2'}})
      await flushPromises()
      const modelView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
      expect(modelView?.currentRow?.['rowid']).toBe('MODEL-2')
      flow.vm.$emit('edgeDoubleClick', {edge: {id: 'REL-1'}})
      await flushPromises()
      const relationView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Relation@designRelations`)
      expect(relationView?.currentRow?.['rowid']).toBe('REL-1')
      wrapper.unmount()
    } finally {Spark.getRegistry().unregister('data-space-design-graph'); vi.unstubAllGlobals(); restore()}
  })

  it('locks graph dragging for a pending DataView change outside the loaded snapshot rows', async () => {
    const fixture = await createDesignFixture({layout: JSON.stringify({graphVersion: 1,
      nodes: [{id: 'MODEL-1', x: 0, y: 0}], edges: []})})
    await fixture.functions['__init__']?.()
    const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    if (!view) throw new Error('model DataView is unavailable')
    expect(graphProps(fixture)['disabled']).toBe(false)
    view.dirtyTracking.trackCreate('OUTSIDE-SNAPSHOT', {rowid: 'OUTSIDE-SNAPSHOT', dataSetId: 'DS-1'})
    expect(graphProps(fixture)['disabled']).toBe(true)
    const key = graphProps(fixture)['contextKey']
    fixture.functions['designGraphMove']?.({contextKey: key, id: 'MODEL-1', x: 20, y: 0, edges: []})
    expect(record(fixture.functions['designGraphSaveBeforeRender']?.())['disabled']).toBe(true)
    expect(fixture.layoutWrites()).toBe(0)
  })

  it('keeps an unknown layout write locked without automatically repeating the upload', async () => {
    const fixture = await createDesignFixture({layout: JSON.stringify({graphVersion: 1,
      nodes: [{id: 'MODEL-1', x: 0, y: 0}], edges: []}), layoutWriteResult: 'unknown'})
    await fixture.functions['__init__']?.()
    const key = graphProps(fixture)['contextKey']
    fixture.functions['designGraphMove']?.({contextKey: key, id: 'MODEL-1', x: 0, y: 0, edges: []})
    expect(record(fixture.functions['designGraphSaveBeforeRender']?.())['disabled']).toBe(true)
    fixture.functions['designGraphMove']?.({contextKey: key, id: 'MODEL-1', x: 20, y: 0, edges: []})
    expect(record(fixture.functions['designGraphSaveBeforeRender']?.())['disabled']).toBe(false)
    await fixture.functions['designGraphSave']?.()
    expect(fixture.layoutWriteAttempts()).toBe(1)
    expect(fixture.layoutWrites()).toBe(0)
    await fixture.functions['designGraphSave']?.()
    fixture.functions['designGraphCancel']?.()
    expect(fixture.layoutWriteAttempts()).toBe(1)
    expect(graphProps(fixture)['disabled']).toBe(true)
    expect(record(fixture.functions['RenderDesignGraphStatus']?.())['children']).toContain('布局保存结果尚未确认')
  })

  it('saves explicit endpoint and text geometry for an incident edge without pointsList', async () => {
    const layout = JSON.stringify({graphVersion: 1, extra: 'keep', nodes: [
      {id: 'MODEL-1', x: 0, y: 0}, {id: 'MODEL-2', x: 100, y: 40}], edges: [
        {id: 'REL-1', sourceNodeId: 'MODEL-1', targetNodeId: 'MODEL-2', extra: 'edge',
          startPoint: {x: 0, y: 0, tag: 'start'}, endPoint: {x: 100, y: 40, tag: 'end'},
          text: {x: 50, y: 20, label: 'keep'}},
        {id: 'REL-2', sourceNodeId: 'MODEL-1', targetNodeId: 'MODEL-2',
          startPoint: {anchor: 'center'}, endPoint: {anchor: 'center'}, text: {label: 'keep anchor'}}]})
    const fixture = await createDesignFixture({layout, modelRows: [
      {rowid: 'MODEL-1', Name: 'A', MetaName: 'A', Type: '表', dataSetId: 'DS-1'},
      {rowid: 'MODEL-2', Name: 'B', MetaName: 'B', Type: '表', dataSetId: 'DS-1'}], fieldRows: [],
    relationRows: [
      {rowid: 'REL-1', dataSetId: 'DS-1', parentModId: 'MODEL-1', childModId: 'MODEL-2', depType: 'one-to-many'},
      {rowid: 'REL-2', dataSetId: 'DS-1', parentModId: 'MODEL-1', childModId: 'MODEL-2', depType: 'one-to-many'}]})
    await fixture.functions['__init__']?.()
    const key = graphProps(fixture)['contextKey']
    fixture.functions['designGraphMove']?.({contextKey: key, id: 'MODEL-1', x: 20, y: 10, edges: []})
    await fixture.functions['designGraphSave']?.()
    expect(fixture.layoutWrites()).toBe(1)
    expect(JSON.parse(String(fixture.layoutContent()))).toMatchObject({extra: 'keep', edges: [
      {extra: 'edge', startPoint: {x: 20, y: 10, tag: 'start'},
        endPoint: {x: 100, y: 40, tag: 'end'}, text: {x: 60, y: 25, label: 'keep'}},
      {startPoint: {anchor: 'center'}, endPoint: {anchor: 'center'}, text: {label: 'keep anchor'}}]})
    const saved = JSON.parse(String(fixture.layoutContent()))
    expect(saved.edges[1].startPoint).toEqual({anchor: 'center'})
    expect(saved.edges[1].endPoint).toEqual({anchor: 'center'})
  })

  it('distinguishes an empty saved graph from a missing layout and hides the graph after identity access fails', async () => {
    const empty = await createDesignFixture({ layout: JSON.stringify({ graphVersion: 1, nodes: [], edges: [] }) })
    await empty.functions['__init__']?.()
    expect(empty.functions['designGraphBeforeRender']?.()).toMatchObject({ visible: true,
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
        { rowid: 'FIELD-1', Name: '客户编号', AsName: '', FieldType: 'varchar', IsOutput: 1, IsPKey: 1,
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-2', Name: '内部标识', AsName: 'customer_id', FieldType: 'varchar', IsOutput: 1, IsPKey: 0,
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
      expect(wrapper.findAll('button').map(button => button.text())).toEqual(['返回目录', '重新加载', '编辑输入参数', '保存布局', '取消布局修改'])
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
        { rowid: 'FIELD-HIDDEN', Name: '隐藏字段名', AsName: '', FieldType: 'varchar', IsOutput: 1, IsPKey: 0,
          dataSetId: 'DS-1', dataModelId: 'MODEL-1' },
        { rowid: 'FIELD-MASKED', Name: '脱敏字段名', AsName: '', FieldType: 'varchar', IsOutput: 1, IsPKey: 0,
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
      AsName: `字段${index + 1}`, FieldType: 'varchar', IsOutput: 1, IsPKey: 0,
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
      fieldRows: [{ rowid: 'FIELD-X', AsName: '异属字段', FieldType: 'varchar', IsOutput: 1,
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
    expect(valid.functions['designGraphBeforeRender']?.()).toMatchObject({ visible: true, props: {
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

  it('edits and deletes the selected relation through the rendered page and confirms raw filter, exact row, and layout', async () => {
    registerAllRenderers()
    Spark.register('data-space-filter-editor', DataSpaceFilterEditor)
    Spark.register('data-space-design-graph', DataSpaceDesignGraph)
    const initialFilter = JSON.stringify({ Type: 'or', Filters: [
      { Type: 'cond', Field: 'Name', Operator: 'equal', Value: null, ValueFun: { Type: 'GetConstValue', Value: 'A' } },
      { Type: 'and', Filters: [{ Type: 'cond', Field: 'Amount', Operator: 'equal', Value: null,
        ValueFun: { Type: 'GetConstValue', Value: 3 } }] },
    ] })
    const initialLayout = JSON.stringify({ graphVersion: 1, autoGenerated: false, custom: { keep: true },
      nodes: [{ id: 'MODEL-1', x: 12, y: 34, label: 'preserve node extension' },
        { id: 'MODEL-2', x: 56, y: 78 }],
      edges: [{ id: 'REL-1', sourceNodeId: 'MODEL-1', targetNodeId: 'MODEL-2', custom: 'keep edge extension',
        pointsList: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] })
    const relation = { rowid: 'REL-1', dataSetId: 'DS-1', parentModId: 'MODEL-1', childModId: 'MODEL-2',
      parentTable: '父注册名', childTable: '子注册名', depType: 'one-to-many', filter: initialFilter, cascadeDel: false }
    const relationPermission = { hiddenFields: [], maskedFields: [],
      editableFields: ['parentModId', 'childModId', 'depType', 'filter', 'parentTable', 'childTable'], allowDelete: true }
    const fixture = await createDesignFixture({ modelRows: [
      { rowid: 'MODEL-1', Name: '父注册名', MetaName: '父来源名', Type: '表', dataSetId: 'DS-1',
        JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: '' },
      { rowid: 'MODEL-2', Name: '子注册名', MetaName: '子来源名', Type: '表', dataSetId: 'DS-1',
        JoinType: 'LEFT', ForeignKeyFields: 'Name', JoinFilter: initialFilter, PId: '父注册名' },
    ], fieldRows: [
      { rowid: 'FIELD-1', Name: 'Name', FieldType: 'varchar', dataSetId: 'DS-1', dataModelId: 'MODEL-2' },
      { rowid: 'FIELD-2', Name: 'Amount', FieldType: 'int', dataSetId: 'DS-1', dataModelId: 'MODEL-2' },
    ], relationRows: [relation], layout: initialLayout,
    rowPermissions: {
      'REL-1': relationPermission,
      'MODEL-2': { hiddenFields: [], maskedFields: [], editableFields: ['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'] },
    } })
    const restore = disableRendererStubs()
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {}
      public unobserve(): void {}
      public disconnect(): void {}
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const errors: string[] = []
      const services = {
        pageService: { showMessage: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => {
          fixture.messages.push({ message, ...(type ? { type } : {}) })
        } },
        dataSpaceLayout: { scenarioId: designId,
          createReader: () => ({ readDataSpaceLayout: async () => fixture.layoutContent() }),
          createWriter: () => ({ saveDataSpaceLayout: async (command: Parameters<PageContext['$page']['saveDataSpaceLayout']>[0]) => fixture.writeLayout(command),
            createDataSpaceLayout: async () => { throw new Error('fixture layout creation is unavailable') } }) },
        dataSpaceDesign: { scenarioId: designId, createReader: () => ({ readRelationDependencyOptions: async () => [
          { label: '一对多', value: 'one-to-many' },
        ] }) },
      }
      const PageWithServices = defineComponent({
        setup() {
          const context = useSparkComponent({ type: 'design-relation-test', id: 'design-relation-test' })
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
      expect(wrapper.text()).toContain('父：父注册名')
      expect(wrapper.text()).toContain('子：子注册名')
      const relationButton = wrapper.findAll('button').find(button => button.text().includes('关系 ID：REL-1'))
      if (!relationButton) throw new Error('rendered relation identity button is missing')
      await relationButton.trigger('click')
      await flushPromises()
      const filterEditor = wrapper.findAllComponents(DataSpaceFilterEditor)
        .find(component => String(component.props('contextKey')).startsWith('relation:'))
      if (!filterEditor) throw new Error('rendered relation Filter editor is missing')
      await filterEditor.get('[data-action="open"]').trigger('click')
      const group = wrapper.findComponent(FilterExpressionGroup)
      expect(group.exists()).toBe(true)
      const draft = group.props('draft')
      const first = draft.root.children[0]
      if (!first || first.kind !== 'condition') throw new Error('relation OR Filter first condition is missing')
      first.valueText = '"C"'
      const apply = document.body.querySelector<HTMLButtonElement>('[data-action="apply"]')
      if (!apply) throw new Error('relation Filter apply action is missing')
      apply.click()
      await flushPromises()
      expect(fixture.http.saveRequests).toHaveLength(0)
      const save = wrapper.findAll('button').find(button => button.text().includes('保存关系'))
      if (!save) throw new Error('rendered relation save button is missing')
      await save.trigger('click')
      await flushPromises()
      await flushPromises()
      expect(fixture.http.saveRequests).toHaveLength(1)
      const commands = fixture.http.saveRequests[0]?.data
      expect(Array.isArray(commands)).toBe(true)
      if (!Array.isArray(commands)) throw new Error('relation save commands are missing')
      expect(commands.map(value => record(value)['TableName'])).toEqual(['Base_DataModel_Relation'])
      const persisted = fixture.http.relationRows?.find(row => row['rowid'] === 'REL-1')
      const editedFilter = typeof persisted?.['filter'] === 'string' ? JSON.parse(persisted['filter']) : null
      expect(editedFilter).toMatchObject({ Type: 'or', Filters: [
        { Type: 'cond', Field: 'Name', ValueFun: { Type: 'GetConstValue', Value: 'C' } },
        { Type: 'and', Filters: [{ Type: 'cond', Field: 'Amount', ValueFun: { Type: 'GetConstValue', Value: 3 } }] },
      ] })
      expect(persisted?.['parentTable']).toBe('父注册名')
      expect(persisted?.['childTable']).toBe('子注册名')
      expect(persisted?.['cascadeDel']).toBe(false)
      expect(fixture.layoutWrites()).toBe(0)

      const modelView = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
      if (!modelView) throw new Error('rendered relation child model DataView is missing')
      const selectForJoin = wrapper.findAll('button').find(button => button.text().includes('关系 ID：REL-1'))
      if (!selectForJoin) throw new Error('relation cannot be selected for Join editing')
      await selectForJoin.trigger('click')
      await flushPromises()
      await wrapper.find('.design-relation-join-editor .el-select__wrapper').trigger('click')
      await flushPromises()
      const rightJoin = [...document.body.querySelectorAll('[role="option"]')]
        .find(option => option.textContent?.includes('右连接'))
      if (!(rightJoin instanceof HTMLElement)) throw new Error('rendered RIGHT Join option is missing')
      rightJoin.click()
      await flushPromises()
      expect(modelView.getEditingPatch('MODEL-2')).toMatchObject({ JoinType: 'RIGHT' })
      const saveJoin = wrapper.findAll('button').find(button => button.text().includes('保存关系'))
      if (!saveJoin) throw new Error('rendered Join save button is missing')
      await saveJoin.trigger('click')
      await flushPromises()
      await flushPromises()
      expect(fixture.http.saveRequests).toHaveLength(2)
      expect(fixture.http.modelRows?.find(row => row['rowid'] === 'MODEL-2')).toMatchObject({ JoinType: 'RIGHT' })

      relationPermission.editableFields = []
      const reload = wrapper.findAll('button').find(button => button.text().includes('重新加载'))
      if (!reload) throw new Error('relation page reload action is missing')
      await reload.trigger('click')
      await flushPromises()
      await flushPromises()
      const reloadedRelation = wrapper.findAll('button').find(button => button.text().includes('关系 ID：REL-1'))
      if (!reloadedRelation) throw new Error('relation identity disappeared after readback')
      await reloadedRelation.trigger('click')
      await flushPromises()
      const restrictedSave = wrapper.findAll('button').find(button => button.text().includes('保存关系'))
      if (!restrictedSave || restrictedSave.attributes('disabled') === undefined) {
        throw new Error('delete-only row unexpectedly enables relation editing')
      }
      const remove = wrapper.findAll('button').find(button => button.text().includes('删除关系'))
      if (!remove || remove.attributes('disabled') !== undefined) throw new Error('authorized relation delete action is unavailable')
      const httpRequestsBeforeDelete = fixture.http.requests.length
      const layoutWritesBeforeDelete = fixture.layoutWrites()
      await remove.trigger('click')
      await flushPromises()
      await flushPromises()
      expect(fixture.http.requests.length).toBeGreaterThan(httpRequestsBeforeDelete + 1)
      expect(fixture.layoutWrites()).toBe(layoutWritesBeforeDelete + 1)
      expect(fixture.http.saveRequests).toHaveLength(3)
      expect(fixture.http.relationRows?.some(row => row['rowid'] === 'REL-1')).toBe(false)
      const clearedModel = fixture.http.modelRows?.find(row => row['rowid'] === 'MODEL-2')
      expect(clearedModel).toMatchObject({ JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: '' })
      expect(fixture.messages.filter(item => item.type === 'warning' || item.type === 'error')).toEqual([])
      const finalLayout = JSON.parse(String(fixture.layoutContent()))
      expect(finalLayout.edges).toEqual([])
      expect(finalLayout).toMatchObject({ autoGenerated: false, custom: { keep: true },
        nodes: [{ id: 'MODEL-1', x: 12, y: 34, label: 'preserve node extension' }, { id: 'MODEL-2', x: 56, y: 78 }], edges: [] })
      const deleteCommands = fixture.http.saveRequests[2]?.data
      expect(Array.isArray(deleteCommands)).toBe(true)
      if (!Array.isArray(deleteCommands)) throw new Error('relation delete commands are missing')
      expect(deleteCommands.map(value => record(value)['TableName']))
        .toEqual(['Base_DataModel', 'Base_DataModel_Relation'])
      expect(errors).toEqual([])
      wrapper.unmount()
    } finally {
      container.remove()
      vi.unstubAllGlobals()
      Spark.getRegistry().unregister('data-space-filter-editor')
      Spark.getRegistry().unregister('data-space-design-graph')
      restore()
    }
  })

  it('saves first Join assignment and clearing through the selected relation DataViews', async () => {
    const filter = JSON.stringify({ Type: 'cond', Field: 'Name', Operator: 'equal', Value: null,
      ValueFun: { Type: 'GetConstValue', Value: 'A' } })
    const relation = { rowid: 'REL-1', dataSetId: 'DS-1', parentModId: 'MODEL-1', childModId: 'MODEL-2',
      parentTable: '父注册名', childTable: '子注册名', depType: 'one-to-many', filter, cascadeDel: false }
    const fixture = await createDesignFixture({ modelRows: [
      { rowid: 'MODEL-1', Name: '父注册名', MetaName: '父来源名', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-2', Name: '子注册名', MetaName: '子来源名', Type: '表', dataSetId: 'DS-1',
        JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: '' },
    ], fieldRows: [{ rowid: 'FIELD-1', Name: 'Name', FieldType: 'varchar', dataSetId: 'DS-1', dataModelId: 'MODEL-2' }],
    relationRows: [relation], layout: JSON.stringify({ graphVersion: 1, nodes: [
      { id: 'MODEL-1', x: 0, y: 0 }, { id: 'MODEL-2', x: 1, y: 1 }], edges: [
      { id: 'REL-1', sourceNodeId: 'MODEL-1', targetNodeId: 'MODEL-2' }] }), rowPermissions: {
      'REL-1': { hiddenFields: [], maskedFields: [], editableFields: ['filter'] },
      'MODEL-2': { hiddenFields: [], maskedFields: [], editableFields: ['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'] },
    } })
    await fixture.functions['__init__']?.()
    const models = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const relations = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Relation@designRelations`)
    if (!models || !relations) throw new Error('relation DataViews are missing')
    const selected = relations.rows.find(row => relations.getPkKey(row) === 'REL-1')
    if (!selected) throw new Error('relation row is missing')
    fixture.functions['designSelectRelation']?.(selected)
    models.updateEditingValue('MODEL-2', 'JoinType', 'LEFT')
    models.updateEditingValue('MODEL-2', 'ForeignKeyFields', 'Name')
    models.updateEditingValue('MODEL-2', 'JoinFilter', filter)
    const joinProps = record(fixture.functions['designRelationJoinFilterBeforeRender']?.())['props']
    fixture.functions['designRelationJoinFilterValidation']?.({ contextKey: record(joinProps)['contextKey'], value: filter, valid: true })
    await fixture.functions['designSaveRelation']?.()
    expect(fixture.messages.filter(item => item.type === 'warning' || item.type === 'error')).toEqual([])
    expect(fixture.http.saveRequests).toHaveLength(1)
    expect(fixture.http.modelRows?.find(row => row['rowid'] === 'MODEL-2'))
      .toMatchObject({ JoinType: 'LEFT', ForeignKeyFields: 'Name', JoinFilter: filter, PId: '父注册名' })
    const current = relations.rows.find(row => relations.getPkKey(row) === 'REL-1')
    if (!current) throw new Error('relation row disappeared')
    fixture.functions['designSelectRelation']?.(current)
    for (const field of ['JoinType', 'ForeignKeyFields', 'JoinFilter']) models.updateEditingValue('MODEL-2', field, '')
    const clearProps = record(fixture.functions['designRelationJoinFilterBeforeRender']?.())['props']
    fixture.functions['designRelationJoinFilterValidation']?.({ contextKey: record(clearProps)['contextKey'], value: '', valid: true })
    await fixture.functions['designSaveRelation']?.()
    expect(fixture.messages.filter(item => item.type === 'warning' || item.type === 'error')).toEqual([])
    expect(fixture.http.saveRequests).toHaveLength(2)
    expect(fixture.http.modelRows?.find(row => row['rowid'] === 'MODEL-2'))
      .toMatchObject({ JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: '' })
  })

  it('restores only this Join stage before dispatch and locks an unknown result after dispatch', async () => {
    const joinFilter = JSON.stringify({ Type: 'cond', Field: 'Name', Operator: 'equal', Value: null,
      ValueFun: { Type: 'GetConstValue', Value: 'A' } })
    const fixture = await createDesignFixture({ modelRows: [
      { rowid: 'MODEL-1', Name: '父注册名', MetaName: '父来源名', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-2', Name: '子注册名', MetaName: '子来源名', Type: '表', dataSetId: 'DS-1',
        description: '原描述', JoinType: 'LEFT', ForeignKeyFields: 'Name', JoinFilter: joinFilter, PId: '父注册名' },
      { rowid: 'MODEL-3', Name: '其他模型', MetaName: '其他来源', Type: '表', dataSetId: 'DS-1', description: '原其他描述' },
    ], fieldRows: [{ rowid: 'FIELD-1', Name: 'Name', FieldType: 'varchar', dataSetId: 'DS-1', dataModelId: 'MODEL-2' }],
    relationRows: [{ rowid: 'REL-1', dataSetId: 'DS-1', parentModId: 'MODEL-1', childModId: 'MODEL-2',
      parentTable: '父注册名', childTable: '子注册名', depType: 'one-to-many', filter: '', cascadeDel: false }],
    rowPermissions: {
      'REL-1': { hiddenFields: [], maskedFields: [], editableFields: ['depType'] },
      'MODEL-2': { hiddenFields: [], maskedFields: [], editableFields: ['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'] },
      'MODEL-3': { hiddenFields: [], maskedFields: [], editableFields: ['description'] },
    } })
    await fixture.functions['__init__']?.()
    const models = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const relations = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Relation@designRelations`)
    if (!models || !relations) throw new Error('relation DataViews are missing')
    models.updateEditingValue('MODEL-3', 'description', '保留其他草稿')
    const selected = relations.rows.find(row => relations.getPkKey(row) === 'REL-1')
    if (!selected) throw new Error('relation row is missing')
    fixture.functions['designSelectRelation']?.(selected)
    models.updateEditingValue('MODEL-2', 'JoinType', 'RIGHT')
    relations.updateEditingValue('REL-1', 'depType', 'many-to-one')
    const joinProps = record(fixture.functions['designRelationJoinFilterBeforeRender']?.())['props']
    fixture.functions['designRelationJoinFilterValidation']?.({ contextKey: record(joinProps)['contextKey'], value: joinFilter, valid: true })
    vi.spyOn(relations, 'editRowById').mockResolvedValueOnce(false)
    await fixture.functions['designSaveRelation']?.()
    expect(fixture.http.saveRequests).toHaveLength(0)
    expect(models.rows.find(row => models.getPkKey(row) === 'MODEL-2')).toMatchObject({ JoinType: 'LEFT' })
    expect(models.dirtyTracking.isDirty('MODEL-2')).toBe(false)
    expect(models.getEditingPatch('MODEL-3')).toMatchObject({ description: '保留其他草稿' })
    expect(relations.rows.find(row => relations.getPkKey(row) === 'REL-1')).toMatchObject({ depType: 'one-to-many' })
    models.updateEditingValue('MODEL-2', 'JoinType', 'RIGHT')
    fixture.http.failSave = true
    await fixture.functions['designSaveRelation']?.()
    expect(fixture.http.saveRequests).toHaveLength(1)
    expect(models.dirtyTracking.isDirty('MODEL-2')).toBe(true)
    expect(relations.dirtyTracking.isDirty('REL-1')).toBe(true)
    await fixture.functions['designSaveRelation']?.()
    expect(fixture.http.saveRequests).toHaveLength(1)
  })

  it('keeps a pre-existing child draft when deletion is rejected before Join clearing', async () => {
    const fixture = await createDesignFixture({ modelRows: [
      { rowid: 'MODEL-1', Name: '父注册名', MetaName: '父来源名', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-2', Name: '子注册名', MetaName: '子来源名', Type: '表', dataSetId: 'DS-1',
        description: '原描述', JoinType: 'LEFT', ForeignKeyFields: 'Name', JoinFilter: 'old', PId: '父注册名' },
    ], fieldRows: [{ rowid: 'FIELD-1', Name: 'Name', FieldType: 'varchar', dataSetId: 'DS-1', dataModelId: 'MODEL-2' }],
    relationRows: [{ rowid: 'REL-1', dataSetId: 'DS-1', parentModId: 'MODEL-1', childModId: 'MODEL-2',
      parentTable: '父注册名', childTable: '子注册名', depType: 'one-to-many', filter: '', cascadeDel: false }],
    rowPermissions: {
      'REL-1': { hiddenFields: [], maskedFields: [], allowDelete: true },
      'MODEL-2': { hiddenFields: [], maskedFields: [], editableFields: ['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId', 'description'] },
    } })
    await fixture.functions['__init__']?.()
    const models = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const relations = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Relation@designRelations`)
    if (!models || !relations) throw new Error('relation DataViews are missing')
    const selected = relations.rows.find(row => relations.getPkKey(row) === 'REL-1')
    if (!selected) throw new Error('relation row is missing')
    fixture.functions['designSelectRelation']?.(selected)
    models.updateEditingValue('MODEL-2', 'description', '预存描述草稿')
    models.updateEditingValue('MODEL-2', 'JoinType', 'RIGHT')
    await fixture.functions['designDeleteRelation']?.()
    expect(fixture.http.saveRequests).toHaveLength(0)
    expect(models.getEditingPatch('MODEL-2')).toMatchObject({ description: '预存描述草稿', JoinType: 'RIGHT' })
    expect(relations.rows.find(row => relations.getPkKey(row) === 'REL-1')).toMatchObject({ rowid: 'REL-1' })
  })

  it('restores staged Join clearing if relation deletion rejects before dispatch', async () => {
    const fixture = await createDesignFixture({ modelRows: [
      { rowid: 'MODEL-1', Name: '父注册名', MetaName: '父来源名', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-2', Name: '子注册名', MetaName: '子来源名', Type: '表', dataSetId: 'DS-1',
        JoinType: 'LEFT', ForeignKeyFields: 'Name', JoinFilter: 'old', PId: '父注册名' },
    ], fieldRows: [{ rowid: 'FIELD-1', Name: 'Name', FieldType: 'varchar', dataSetId: 'DS-1', dataModelId: 'MODEL-2' }],
    relationRows: [{ rowid: 'REL-1', dataSetId: 'DS-1', parentModId: 'MODEL-1', childModId: 'MODEL-2',
      parentTable: '父注册名', childTable: '子注册名', depType: 'one-to-many', filter: '', cascadeDel: false }],
    rowPermissions: {
      'REL-1': { hiddenFields: [], maskedFields: [], allowDelete: true },
      'MODEL-2': { hiddenFields: [], maskedFields: [], editableFields: ['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'] },
    } })
    await fixture.functions['__init__']?.()
    const models = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel@designModels`)
    const relations = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Relation@designRelations`)
    if (!models || !relations) throw new Error('relation DataViews are missing')
    const selected = relations.rows.find(row => relations.getPkKey(row) === 'REL-1')
    if (!selected) throw new Error('relation row is missing')
    fixture.functions['designSelectRelation']?.(selected)
    vi.spyOn(relations, 'removeRow').mockResolvedValueOnce(false)
    await fixture.functions['designDeleteRelation']?.()
    expect(fixture.http.saveRequests).toHaveLength(0)
    expect(models.rows.find(row => models.getPkKey(row) === 'MODEL-2'))
      .toMatchObject({ JoinType: 'LEFT', ForeignKeyFields: 'Name', JoinFilter: 'old', PId: '父注册名' })
    expect(models.dirtyTracking.isDirty('MODEL-2')).toBe(false)
    expect(relations.rows.find(row => relations.getPkKey(row) === 'REL-1')).toMatchObject({ rowid: 'REL-1' })
  })

  it.each([
    { label: 'another relation with the same endpoints', owner: '父注册名', otherParent: 'MODEL-1' },
    { label: 'Join owned by another parent', owner: '另一父注册名', otherParent: 'MODEL-3' },
  ])('deletes only the selected row when $label protects shared Join', async scenario => {
    const relations = [
      { rowid: 'REL-1', dataSetId: 'DS-1', parentModId: 'MODEL-1', childModId: 'MODEL-2', parentTable: '父注册名',
        childTable: '子注册名', depType: 'one-to-many', filter: '', cascadeDel: false },
      { rowid: 'REL-2', dataSetId: 'DS-1', parentModId: scenario.otherParent, childModId: 'MODEL-2',
        parentTable: scenario.owner, childTable: '子注册名', depType: 'one-to-many', filter: '', cascadeDel: false },
    ]
    const fixture = await createDesignFixture({ modelRows: [
      { rowid: 'MODEL-1', Name: '父注册名', MetaName: '父来源名', Type: '表', dataSetId: 'DS-1' },
      { rowid: 'MODEL-2', Name: '子注册名', MetaName: '子来源名', Type: '表', dataSetId: 'DS-1',
        JoinType: 'LEFT', ForeignKeyFields: 'Name', JoinFilter: 'old', PId: scenario.owner },
      { rowid: 'MODEL-3', Name: '另一父注册名', MetaName: '另一父来源', Type: '表', dataSetId: 'DS-1' },
    ], fieldRows: [{ rowid: 'FIELD-1', Name: 'Name', FieldType: 'varchar', dataSetId: 'DS-1', dataModelId: 'MODEL-2' }],
    relationRows: relations, layout: JSON.stringify({ graphVersion: 1, nodes: [
      { id: 'MODEL-1', x: 0, y: 0 }, { id: 'MODEL-2', x: 1, y: 1 }, { id: 'MODEL-3', x: 2, y: 2 }],
    edges: relations.map(row => ({ id: row.rowid, sourceNodeId: row.parentModId, targetNodeId: row.childModId })) }),
    rowPermissions: { 'REL-1': { hiddenFields: [], maskedFields: [], allowDelete: true },
      'MODEL-2': { hiddenFields: [], maskedFields: [], editableFields: ['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'] } } })
    await fixture.functions['__init__']?.()
    const view = fixture.pageRuntime.resolveView(`#${designId}@Base_DataModel_Relation@designRelations`)
    if (!view) throw new Error('relation DataView is missing')
    const selected = view.rows.find(row => view.getPkKey(row) === 'REL-1')
    if (!selected) throw new Error('selected relation is missing')
    fixture.functions['designSelectRelation']?.(selected)
    await fixture.functions['designDeleteRelation']?.()
    expect(fixture.http.saveRequests).toHaveLength(1)
    const commands = fixture.http.saveRequests[0]?.data
    if (!Array.isArray(commands)) throw new Error('relation delete commands are missing')
    expect(commands.map(value => record(value)['TableName'])).toEqual(['Base_DataModel_Relation'])
    expect(fixture.http.relationRows?.map(row => row['rowid'])).toEqual(['REL-2'])
    expect(fixture.http.modelRows?.find(row => row['rowid'] === 'MODEL-2'))
      .toMatchObject({ JoinType: 'LEFT', ForeignKeyFields: 'Name', JoinFilter: 'old', PId: scenario.owner })
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
