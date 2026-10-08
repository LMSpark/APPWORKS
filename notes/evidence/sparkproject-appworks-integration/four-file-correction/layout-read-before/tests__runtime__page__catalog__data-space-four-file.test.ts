import { config as testUtilsConfig, flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, h, markRaw, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { registerAllRenderers, Spark, SparkPageRenderer } from '@spark-appworks/spark-component'
import { DataSpaceRuntimeApi, type DataSpaceDesignApi } from '@spark-appworks/spark-lowcode-api'
import { ScenarioViewConfig, PageRuntime, PageTool, type PageRuntime as PageRuntimeType } from '@spark-appworks/spark-project-model'
import { HttpClientBase, isRecord, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'
import { compileFunctions } from '../../../../packages/spark-component/src/page/createSandbox'
import { createPageComponentRegistry } from '../../../../packages/spark-component/src/page/context/page-component-registry'
import { buildPageContext } from '../../../../packages/spark-component/src/page/context/buildPageContext'
import type { PageContext } from '../../../../packages/spark-component/src/page/context/types'
import { LowcodeDataSpaceAssembler } from '../../../../src/lowcode/data-space/lowcode-data-space-assembler'

const pageId = 'data-space-catalog'
const scenarioId = '90A82E287930A234FEC3E687C94A93EA'
const designScenarioId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const blueprintScenarioId = '7AB874097A1E8711A42FD845939A6E05'
const pageRoot = resolve(process.cwd(), 'config/pages/data-platform/data-space-catalog')
const routeSnapshot = { path: '/__tool/test', fullPath: '/__tool/test', name: 'test', params: {}, query: {}, hash: '' }
type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type CompiledPageFunctions = ReturnType<typeof compileFunctions>
type TestFormalField = Readonly<{ id: string; name: string; type: string; primaryKey: boolean }>
type TestFormalModelInput = Readonly<{ id: string; metaName: string; primaryKey: string; fields: readonly TestFormalField[] }>
type CatalogScriptFixtureOptions = Readonly<{ includeDesignScenario?: boolean; includeBlueprintScenario?: boolean; initialize?: boolean }>

function recordAt(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`)
  return value
}

function recordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

function vnodeText(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(vnodeText)
  return isRecord(value) ? vnodeText(value['children']) : []
}

function matchesCatalogFilter(row: Record<string, unknown>, filter: unknown): boolean {
  if (!isRecord(filter)) throw new Error('Catalog fixture received an invalid filter')
  const type = filter['Type']
  if (type === 'and' || type === 'or') {
    const filters = filter['Filters']
    if (!Array.isArray(filters)) throw new Error('Catalog fixture filter group has no child filters')
    const matches = filters.map(item => matchesCatalogFilter(row, item))
    return type === 'and' ? matches.every(Boolean) : matches.some(Boolean)
  }
  if (type !== 'cond' || typeof filter['Field'] !== 'string' || typeof filter['Operator'] !== 'string') {
    throw new Error('Catalog fixture received an unsupported filter condition')
  }
  const valueFunction = filter['ValueFun']
  if (!isRecord(valueFunction) || valueFunction['Type'] !== 'GetConstValue') {
    throw new Error('Catalog fixture filter has no constant value')
  }
  const actual = row[filter['Field']]
  const expected = valueFunction['Value']
  if (filter['Operator'] === 'equal') return String(actual ?? '') === String(expected ?? '')
  if (filter['Operator'] === 'contains') return String(actual ?? '').includes(String(expected ?? ''))
  throw new Error(`Catalog fixture received unsupported operator: ${filter['Operator']}`)
}

function formalModel(input: TestFormalModelInput): FormalModel {
  const fields = input.fields.map((field, order) => ({ ...field, modelId: input.id,
    canonicalName: field.name, description: '', output: true, computed: false, order, orderType: '', raw: {} }))
  return { id: input.id, name: input.metaName, metaName: input.metaName, sourceName: input.metaName,
    sourceId: '', sourceType: 'database-table', primaryKey: input.primaryKey, businessMain: false, fields, raw: {} }
}

function formalModels(): FormalModel[] {
  return [
    formalModel({ id: `${blueprintScenarioId}p000`, metaName: 'Base_NavigationInfo', primaryKey: 'rowid', fields: [
      { id: 'nav-rowid', name: 'rowid', type: 'varchar', primaryKey: true },
      { id: 'nav-sysid', name: 'SysId', type: 'varchar', primaryKey: false },
      { id: 'nav-conid', name: 'conid', type: 'varchar', primaryKey: false },
      { id: 'nav-prowid', name: 'prowid', type: 'varchar', primaryKey: false },
      { id: 'nav-funname', name: 'FunName', type: 'varchar', primaryKey: false },
      { id: 'nav-name', name: 'name', type: 'varchar', primaryKey: false },
      { id: 'nav-url', name: 'NavigationUrl', type: 'varchar', primaryKey: false },
    ] }),
    formalModel({ id: '90A82E287930A234FEC3E687C94A93EAp000', metaName: 'Base_DataSet', primaryKey: 'rowid', fields: [
      { id: 'C29690D7067240CC840539CE0CBEE821', name: 'rowid', type: 'varchar', primaryKey: true },
      { id: 'C6F91361CC8C4C44A8F40259B52A19FE', name: 'Name', type: 'varchar', primaryKey: false },
      { id: '1D6C7C64E56346ED83C27CC6C97C7BC8', name: 'Type', type: 'varchar', primaryKey: false },
      { id: '6B5651FBDFD94754B341B298DC269185', name: 'description', type: 'varchar', primaryKey: false },
      { id: '807184E820A348ECAA5FDEC9FA99E07F', name: 'sysid', type: 'varchar', primaryKey: false },
      { id: '19324DE8445D4985AD77F7595E1BF281', name: 'createuser', type: 'varchar', primaryKey: false },
      { id: '7CEB9A4ABABB47BFB5826C5DB3A662E8', name: 'createtime', type: 'datetime', primaryKey: false },
    ] }),
    formalModel({ id: 'acb04903-043f-4c99-9a57-a8e9bc95ce72', metaName: 'Base_AppSystemList', primaryKey: 'rowid', fields: [
      { id: 'B70A3CE33F506E53F2D3E3299BBAD6F6', name: 'rowid', type: 'varchar', primaryKey: true },
      { id: '20BCD6183C5F6840EE1BFBC09C9D32AD', name: 'AppDesc', type: 'varchar', primaryKey: false },
      { id: '73D1E09E013336F7A9F0DD9643353AD7', name: 'AppName', type: 'varchar', primaryKey: false },
    ] }),
    formalModel({ id: '90A82E287930A234FEC3E687C94A93EAp001', metaName: 'Base_UserInfo', primaryKey: 'ID', fields: [
      { id: '0AA458FF39F246E9A2D5A9935AB34644', name: 'ROWID', type: 'varchar', primaryKey: false },
      { id: '24459754EAAE44C6B42C241E57F947CA', name: 'ID', type: 'varchar', primaryKey: true },
      { id: '60A746A09D8043C8B6ABD05C422914F8', name: 'UserName', type: 'varchar', primaryKey: false },
    ] }),
  ]
}

class CatalogFixtureHttpClient extends HttpClientBase {
  public readonly requests: RequestConfig[] = []
  public readonly saveRequests: RequestConfig[] = []
  public readonly savedRows: Record<string, unknown>[] = []
  public readonly changedRows: Record<string, unknown>[] = []
  public readonly deletedRows: Record<string, unknown>[] = []
  public failSave = false
  public maskCreatorName = false
  public hideCreatorName = false
  public allowAdd = true
  public allowDelete = false
  public datasetCount = 1
  public applyCatalogFilter = false
  public failQuery = false
  public keepDeletedRowsOnQueries = false
  public editableFields: string[] = []
  public requiredFields: string[] = []
  public hiddenFields: string[] = []
  public maskedFields: string[] = []
  public nullDescription = false
  public includeSecondDataset = false
  public omitChangedRowsFromQueries = false
  public apiModels: Record<string, unknown>[] = [
    { rowid: 'MODEL-1', Name: 'A', Type: '数据库表', dataSetId: 'DATASET-1' },
    { rowid: 'MODEL-2', Name: 'A', Type: '业务对象', dataSetId: 'DATASET-1' },
    { rowid: 'MODEL-3', Name: 'A_2', Type: '数据表', dataSetId: 'DATASET-1' },
    { rowid: 'MODEL-4', Name: 'A_Type', Type: '视图', dataSetId: 'DATASET-1' },
  ]
  public apiFields: Record<string, unknown>[] = [
    { rowid: 'FIELD-1', Name: "id'\\\nkey", type: 'dataModel', IsPKey: 1, dataSetId: 'DATASET-1', dataModelId: 'MODEL-1' },
    { rowid: 'FIELD-2', Name: 'rowid', type: 'dataModel', IsPKey: 0, dataSetId: 'DATASET-1', dataModelId: 'MODEL-2' },
    { rowid: 'FIELD-3', Name: 'key', type: 'dataModel', IsPKey: 1, dataSetId: 'DATASET-1', dataModelId: 'MODEL-3' },
  ]
  public designHiddenFields: string[] = []
  public designMaskedFields: string[] = []
  public designPermissionTable = ''
  public designQueryGate?: Promise<void>
  public designQueryGateTable = ''
  public designQueryStarted?: () => void
  public applicationQueryGate?: Promise<void>
  public applicationQueryStarted?: () => void
  public navigationHiddenFields: string[] = []
  public navigationMaskedFields: string[] = []
  public navigationRows: Record<string, unknown>[] = [
    { rowid: 'NAV-ROOT', SysId: 'APP-1', conid: null, prowid: '000000', FunName: '元数据管理', name: '', NavigationUrl: '' },
    { rowid: 'NAV-GROUP', SysId: 'APP-1', conid: null, prowid: 'NAV-ROOT', FunName: '', name: '目录配置', NavigationUrl: null },
    { rowid: 'NAV-BOUND', SysId: 'APP-1', conid: 'DATASET-1', prowid: 'NAV-GROUP', FunName: '数据空间管理', name: 'DataSetManage',
      NavigationUrl: 'vue:/features/data-platform/data-set-management/ui/data-set-list-page' },
    { rowid: 'NAV-BOUND-2', SysId: 'APP-1', conid: 'DATASET-1', prowid: 'NAV-ROOT', FunName: '服务管理', name: '', NavigationUrl: null },
    { rowid: 'NAV-OTHER', SysId: 'APP-1', conid: 'DATASET-OTHER', prowid: 'NAV-ROOT', FunName: '其它功能', name: '', NavigationUrl: '' },
  ]
  public navigationQueryGate?: Promise<void>
  public navigationQueryStarted?: () => void
  public omitNavigationSecondPage = false
  public omitNavigationTotal = false
  public navigationResponseRows?: Record<string, unknown>[]
  public navigationKeyOverride?: string
  public navigationPrimaryKeyField = 'rowid'

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      this.saveRequests.push(config)
      const models = Array.isArray(config.data) ? config.data : []
      const model = isRecord(models[0]) ? models[0] : {}
      const crud = isRecord(model['CrudModel']) ? model['CrudModel'] : {}
      const added = Array.isArray(crud['Added']) ? crud['Added'].filter(isRecord) : []
      const changed = Array.isArray(crud['Changed']) ? crud['Changed'].filter(isRecord) : []
      const deleted = Array.isArray(crud['Deleted']) ? crud['Deleted'].filter(isRecord) : []
      this.savedRows.push(...added)
      this.changedRows.push(...changed)
      this.deletedRows.push(...deleted)
      if (this.failSave) throw new Error('fixture connection lost after save dispatch')
      return { data: { Code: 200, Result: {
        ...(added.length ? { maplistadd: [{ physical: added.map(row => ({ ...row })) }] } : {}),
        ...(changed.length ? { maplistedit: [{ physical: changed.map(row => ({ ...row })) }] } : {}),
        ...(deleted.length ? { maplistdelete: [{ physical: deleted.map(row => ({ ...row })) }] } : {}),
      } },
        status: 200, statusText: 'OK', headers: {} }
    }
    this.requests.push(config)
    if (this.failQuery) throw new Error('fixture query failed')
    const payload = isRecord(config.data) ? config.data : {}
    const tables = Array.isArray(payload['Table']) ? payload['Table'] : []
    const first = isRecord(tables[0]) ? tables[0] : {}
    const modelName = typeof first['Name'] === 'string' ? first['Name'] : ''
    if (modelName === 'Base_AppSystemList') {
      this.applicationQueryStarted?.()
      await this.applicationQueryGate
    }
    if (modelName === 'Base_NavigationInfo') {
      this.navigationQueryStarted?.()
      await this.navigationQueryGate
      const filter = recordAt(first['Filter'], 'blueprint navigation filter')
      const filterValue = recordValue(recordValue(filter, 'ValueFun'), 'Value')
      const filteredRows = this.navigationResponseRows
        ? [...this.navigationResponseRows]
        : this.navigationRows.filter(row => String(row['SysId'] ?? '') === String(filterValue ?? ''))
      const page = recordValue(payload, 'PageParam')
      let rows = isRecord(page) && typeof page['index'] === 'number' && typeof page['size'] === 'number'
        ? filteredRows.slice((page['index'] - 1) * page['size'], page['index'] * page['size']) : [...filteredRows]
      if (this.omitNavigationSecondPage && isRecord(page) && page['index'] === 2) rows = []
      return { data: { Code: 200, Result: { primaryKeyField: this.navigationPrimaryKeyField, allowAdd: false,
        data: { Items: rows.map(row => ({ ...row, lingma_sys_key: row['rowid'] === 'NAV-BOUND'
          ? this.navigationKeyOverride ?? row['rowid'] : row['rowid'],
          lingma_sys_params: { r: [], e: [], h: this.navigationHiddenFields, m: this.navigationMaskedFields, d: false } })),
          ...(this.omitNavigationTotal ? {} : { Count: filteredRows.length }) } } }, status: 200, statusText: 'OK', headers: {} }
    }
    if (modelName === 'Base_DataModel' || modelName === 'Base_DataModel_Field') {
      if (!this.designQueryGateTable || this.designQueryGateTable === modelName) {
        this.designQueryStarted?.()
        await this.designQueryGate
      }
      const sourceRows = modelName === 'Base_DataModel' ? this.apiModels : this.apiFields
      const hiddenFields = !this.designPermissionTable || this.designPermissionTable === modelName ? this.designHiddenFields : []
      const maskedFields = !this.designPermissionTable || this.designPermissionTable === modelName ? this.designMaskedFields : []
      const page = recordValue(payload, 'PageParam')
      const rows = isRecord(page) && typeof page['index'] === 'number' && typeof page['size'] === 'number'
        ? sourceRows.slice((page['index'] - 1) * page['size'], page['index'] * page['size']) : [...sourceRows]
      return { data: { Code: 200, Result: { primaryKeyField: 'rowid', allowAdd: false,
        data: { Items: rows.map(row => ({ ...row, lingma_sys_key: 'DESIGN-ROW',
          lingma_sys_params: { r: [], e: [], h: hiddenFields, m: maskedFields, d: false } })), Count: sourceRows.length } } },
        status: 200, statusText: 'OK', headers: {} }
    }
    const firstDataset = { rowid: 'DATASET-1', Name: '试点目录', Type: 'datasource',
        description: this.nullDescription ? null : '目录', sysid: 'APP-1',
        createuser: 'USER-ROW-1', createtime: '2026-10-07', _pk: 'DATASET-1', lingma_sys_key: 'DS-ROW',
        lingma_sys_params: { r: this.requiredFields, e: this.editableFields, h: this.hiddenFields,
          m: this.maskedFields, d: this.allowDelete } }
    const baseRows: Record<string, unknown>[] = Array.from({ length: this.datasetCount }, (_, index) => index === 0 ? firstDataset
      : { ...firstDataset, rowid: `DATASET-${index + 1}`, Name: `目录${index + 1}`, _pk: `DATASET-${index + 1}` })
    if (this.includeSecondDataset && this.datasetCount === 1) {
      baseRows.push({ ...firstDataset, rowid: 'DATASET-2', Name: '第二目录', _pk: 'DATASET-2' })
    }
    const datasetRows: Record<string, unknown>[] = [...baseRows.map(row => {
      const changes = this.changedRows.filter(item => item['rowid'] === row['rowid'])
        .reduce((result, item) => ({ ...result, ...item }), {})
      return { ...row, ...changes }
    }),
      ...this.savedRows.map(row => ({ ...row, createuser: 'USER-ROW-1', createtime: '2026-10-07',
        _pk: row['rowid'], lingma_sys_key: 'DS-CREATED', lingma_sys_params: { r: [], e: [], h: [], m: [], d: false } }))]
    let rows = modelName === 'Base_DataSet'
      ? this.omitChangedRowsFromQueries
        ? datasetRows.filter(row => {
          const rowId = recordValue(row, 'rowid')
          return !this.changedRows.some(changed => changed['rowid'] === rowId)
        })
        : datasetRows.filter(row => this.keepDeletedRowsOnQueries
          || !this.deletedRows.some(deleted => deleted['rowid'] === row['rowid']))
      : modelName === 'Base_AppSystemList'
        ? [{ rowid: 'APP-1', AppDesc: '试点应用', AppName: '试点应用', _pk: 'APP-1', lingma_sys_key: 'APP-ROW',
          lingma_sys_params: { r: [], e: [], h: [], m: [], d: false } }]
        : [{ rowid: 'USER-ROW-1', ROWID: 'USER-ROW-1', ID: 'USER-1', UserName: '目录创建人', _pk: 'USER-1',
          lingma_sys_key: 'USER-ROW', lingma_sys_params: { r: [], e: [], h: this.hideCreatorName ? ['UserName'] : [],
            m: this.maskCreatorName ? ['UserName'] : [], d: false } }]
    const filter = recordValue(first, 'Filter')
    if (modelName === 'Base_DataSet' && this.applyCatalogFilter && filter !== undefined && filter !== null) {
      rows = rows.filter(row => matchesCatalogFilter(row, filter))
    }
    const count = rows.length
    const pageParam = recordValue(payload, 'PageParam')
    if (isRecord(pageParam) && typeof pageParam['index'] === 'number' && typeof pageParam['size'] === 'number') {
      const start = (pageParam['index'] - 1) * pageParam['size']
      rows = rows.slice(start, start + pageParam['size'])
    }
    return { data: { Code: 200, Result: { primaryKeyField: modelName === 'Base_UserInfo' ? 'ID' : 'rowid',
      allowAdd: this.allowAdd, lingma_sys_key: `TABLE-${modelName}`, data: { Items: rows, Count: count } } },
      status: 200, statusText: 'OK', headers: {} }
  }
}

function requestsForModel(http: CatalogFixtureHttpClient, modelName: string): RequestConfig[] {
  return http.requests.filter(request => {
    const tables = recordValue(recordValue(request, 'data'), 'Table')
    return Array.isArray(tables) && recordValue(tables[0], 'Name') === modelName
  })
}

async function createCatalogScriptFixture(services: Partial<PageContext['$page']> = {}, configureHttp?: (http: CatalogFixtureHttpClient) => void,
  options: CatalogScriptFixtureOptions = {}) {
  const { includeDesignScenario = true, includeBlueprintScenario = true, initialize = true } = options
  const pagedataText = readFileSync(resolve(pageRoot, 'pagedata.json'), 'utf8')
  const scenarioConfig = new ScenarioViewConfig(scenarioId, pagedataText)
  const rawTables = recordAt(scenarioConfig.toJSON()['tables'], 'scenario tables')
  const runtimeConfig = new ScenarioViewConfig(scenarioId, JSON.stringify({ scenarioId, tables: {
    Base_DataSet: rawTables['Base_DataSet'],
    Base_AppSystemList: rawTables['Base_AppSystemList'],
    Base_UserInfo: rawTables['Base_UserInfo'],
  } }))
  const http = new CatalogFixtureHttpClient()
  configureHttp?.(http)
  let scopeToken = 'catalog-test-scope'
  const runtime = new DataSpaceRuntimeApi({ http, readScope: () => ({ token: scopeToken, headers: {} }) })
  const assembly = new LowcodeDataSpaceAssembler(runtime, http).assemble({
    config: runtimeConfig, models: formalModels(), relations: [],
  })
  const designConfig = new ScenarioViewConfig(designScenarioId,
    readFileSync(resolve(process.cwd(), 'config/pages/data-platform/data-space-design/pagedata.json'), 'utf8'))
  const designModels: FormalModel[] = [
    formalModel({ id: '8D1AB14DD8277F3E7017CD38F77B09FDp001', metaName: 'Base_DataModel', primaryKey: 'rowid', fields: [
      { id: 'design-model-rowid', name: 'rowid', type: 'string', primaryKey: true },
      { id: 'design-model-name', name: 'Name', type: 'string', primaryKey: false },
      { id: 'design-model-type', name: 'Type', type: 'string', primaryKey: false },
      { id: 'design-model-dataset', name: 'dataSetId', type: 'string', primaryKey: false },
    ] }),
    formalModel({ id: '8D1AB14DD8277F3E7017CD38F77B09FDp002', metaName: 'Base_DataModel_Field', primaryKey: 'rowid', fields: [
      { id: 'design-field-rowid', name: 'rowid', type: 'string', primaryKey: true },
      { id: 'design-field-name', name: 'Name', type: 'string', primaryKey: false },
      { id: 'design-field-type', name: 'type', type: 'string', primaryKey: false },
      { id: 'design-field-pkey', name: 'IsPKey', type: 'number', primaryKey: false },
      { id: 'design-field-dataset', name: 'dataSetId', type: 'string', primaryKey: false },
      { id: 'design-field-model', name: 'dataModelId', type: 'string', primaryKey: false },
    ] }),
  ]
  const designAssembly = new LowcodeDataSpaceAssembler(runtime, http).assemble({ config: designConfig,
    models: designModels, relations: [] })
  const blueprintConfig = new ScenarioViewConfig(blueprintScenarioId,
    readFileSync(resolve(process.cwd(), 'config/pages/application/project-blueprint/pagedata.json'), 'utf8'))
  const blueprintAssembly = new LowcodeDataSpaceAssembler(runtime, http).assemble({
    config: blueprintConfig, models: formalModels(), relations: [],
  })
  const tool = markRaw(new PageTool({ pageId }))
  tool.hydrateFileText('rule.json', readFileSync(resolve(pageRoot, 'rule.json'), 'utf8'))
  tool.hydrateFileText('script.js', readFileSync(resolve(pageRoot, 'script.js'), 'utf8'))
  tool.hydrateFileText('style.css', readFileSync(resolve(pageRoot, 'style.css'), 'utf8'))
  tool.markLoaded()
  const scenarioIds = [scenarioId, ...(includeDesignScenario ? [designScenarioId] : []),
    ...(includeBlueprintScenario ? [blueprintScenarioId] : [])]
  const pageRuntime = markRaw(new PageRuntime({ tool, scenarioIds, mainScenarioId: scenarioId,
    loadScenario: async id => id === designScenarioId ? designAssembly.dataSet
      : id === blueprintScenarioId ? blueprintAssembly.dataSet : assembly.dataSet }))
  await pageRuntime.load()
  const controller = new AbortController()
  let dialogVisible = false
  const componentRegistry = createPageComponentRegistry()
  componentRegistry.registerApi({ id: 'catalog-bindings-dialog', type: 'r-dialog', api: {
    open() { dialogVisible = true },
    close() { dialogVisible = false; functions['onCatalogBindingsClose']?.() },
    isVisible() { return dialogVisible },
  } })
  const context = buildPageContext({ pageRuntime, signal: controller.signal, pageRoute: routeSnapshot,
    pageContainer: ref(null), pageService: createPageService(pageRuntime, services),
    getComponentRegistry: () => componentRegistry })
  const functions: CompiledPageFunctions = compileFunctions(readFileSync(resolve(pageRoot, 'script.js'), 'utf8'), context)
  if (initialize) await functions['__init__']?.()
  return { functions, pageRuntime, dataSet: assembly.dataSet, designDataSet: designAssembly.dataSet,
    blueprintDataSet: blueprintAssembly.dataSet, http, componentRegistry,
    isDialogVisible: () => dialogVisible,
    closeDialog: () => componentRegistry.getApi<Readonly<{ close: () => void }>>('catalog-bindings-dialog')?.close(),
    invalidatePage: () => controller.abort(), changeScope: (token: string) => { scopeToken = token } }
}

type CatalogActionNode = Record<string, unknown>

function isCatalogActionNode(value: unknown): value is CatalogActionNode {
  return isRecord(value) && (value['props'] === undefined || isRecord(value['props']))
}

function renderCatalogActionButtons(functions: CompiledPageFunctions): CatalogActionNode[] {
  const render = functions['RenderCatalogActions']
  if (typeof render !== 'function') return []
  const nodes = render()
  if (!Array.isArray(nodes)) return []
  const toolbar = nodes[0]
  if (!isRecord(toolbar) || !Array.isArray(toolbar['children'])) return []
  return toolbar['children'].filter(isCatalogActionNode)
}

function catalogActionHandler(node: CatalogActionNode | undefined): (() => unknown) | undefined {
  const props = node?.['props']
  if (!isRecord(props)) return undefined
  const onClick = props['onClick']
  return typeof onClick === 'function' ? () => onClick() : undefined
}

function catalogPagingError(functions: CompiledPageFunctions): string {
  const render = functions['RenderCatalogPaging']
  if (typeof render !== 'function') return ''
  const nodes = render()
  if (!Array.isArray(nodes)) return ''
  const error = nodes.find(node => isRecord(node) && isRecord(node['props'])
    && node['props']['class'] === 'catalog-error')
  return isRecord(error) && typeof error['children'] === 'string' ? error['children'] : ''
}

function createPageService(pageRuntime: PageRuntimeType, services: Partial<PageContext['$page']>): PageContext['$page'] {
  const pageService: PageContext['$page'] = {
    copyText: async () => undefined,
    getDataSet: (id) => pageRuntime.getDataSet(id),
    resolveView: (binding) => pageRuntime.resolveView(binding) ?? undefined,
    showMessage: () => undefined,
    showConfirm: async () => true,
    showPrompt: async () => null,
    showDialog: async () => 'cancel',
    selectEntities: async () => [],
    browseFiles: async () => [],
    uploadFiles: async () => [],
    showAlert: async () => undefined,
    showLoading: () => undefined,
    navigate: () => undefined,
    ...services,
  }
  return pageService
}

function disableSparkRendererStub(): () => void {
  const stubs = isRecord(testUtilsConfig.global.stubs) ? testUtilsConfig.global.stubs : {}
  const hadPascal = Object.hasOwn(stubs, 'SparkComponentRenderer')
  const hadKebab = Object.hasOwn(stubs, 'spark-component-renderer')
  const previousPascal = stubs['SparkComponentRenderer']
  const previousKebab = stubs['spark-component-renderer']
  delete stubs['SparkComponentRenderer']
  delete stubs['spark-component-renderer']
  testUtilsConfig.global.stubs = stubs
  return () => {
    if (hadPascal && previousPascal !== undefined) stubs['SparkComponentRenderer'] = previousPascal
    else delete stubs['SparkComponentRenderer']
    if (hadKebab && previousKebab !== undefined) stubs['spark-component-renderer'] = previousKebab
    else delete stubs['spark-component-renderer']
    testUtilsConfig.global.stubs = stubs
  }
}

function inputValue(element: unknown): string {
  if (!(element instanceof HTMLInputElement)) throw new Error('Catalog search control is not an input')
  return element.value
}

const ElementDialogStub = defineComponent({
  name: 'ElDialogStub',
  props: { modelValue: { type: Boolean, default: false } },
  emits: ['update:modelValue', 'close'],
  setup(props, { emit, slots }) {
    return () => props.modelValue ? h('section', { class: 'el-dialog' }, [
      h('header', {}, slots['header']?.()),
      slots['default']?.(),
      h('button', { type: 'button', class: 'el-dialog-close', onClick: () => {
        emit('update:modelValue', false)
        emit('close')
      } }, '关闭'),
    ]) : null
  },
})

describe('data-space four-file page', () => {
  it('offers a query-bindings action for the current readable catalog row', async () => {
    const fixture = await createCatalogScriptFixture()
    const action = renderCatalogActionButtons(fixture.functions)
      .find(item => item['children'] === '查询绑定')
    expect(action).toBeDefined()
    const onClick = catalogActionHandler(action)
    if (!onClick) throw new Error('query-bindings action has no handler')
    await onClick()
    const bindingView = fixture.blueprintDataSet.getView('Base_NavigationInfo', 'catalogBindings')
    expect(bindingView?.rows).toHaveLength(5)
    const rendered = vnodeText(fixture.functions['RenderCatalogBindings']?.())
    expect(rendered).toContain('功能路径')
    expect(rendered).toContain('蓝图节点 ID')
    expect(rendered).toContain('导航地址')
    expect(rendered).toContain('元数据管理 / 目录配置 / 数据空间管理')
    expect(rendered).toContain('NAV-BOUND')
    expect(rendered).toContain('vue:/features/data-platform/data-set-management/ui/data-set-list-page')
    expect(rendered).toContain('元数据管理 / 服务管理')
    expect(rendered.indexOf('元数据管理 / 服务管理')).toBeLessThan(rendered.indexOf('元数据管理 / 目录配置 / 数据空间管理'))
    expect(rendered).toContain('NAV-BOUND-2')
    const navigationRequests = requestsForModel(fixture.http, 'Base_NavigationInfo')
    expect(navigationRequests).toHaveLength(1)
    const requestText = JSON.stringify(navigationRequests[0]?.data)
    for (const field of ['rowid', 'SysId', 'conid', 'prowid', 'FunName', 'name', 'NavigationUrl']) {
      expect(requestText).toContain(field)
    }
    expect(requestText).toContain('APP-1')
    expect(requestText).toContain('"Field":"SysId"')
    expect(requestText).toContain('"Operator":"equal"')
    expect(requestText).toContain('"OrderType":"ascending"')
    expect(requestText).toContain('"index":1,"size":500')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('reads every blueprint page in ascending rowid order and rejects a truncated second page', async () => {
    const configureRows = (http: CatalogFixtureHttpClient) => {
      http.navigationRows = Array.from({ length: 501 }, (_, index) => ({ rowid: `NAV-ROOT-${index}`,
        SysId: 'APP-1', conid: null, prowid: '000000', FunName: `功能${index}`, name: '', NavigationUrl: '' }))
      http.navigationRows.push({ rowid: 'NAV-TARGET', SysId: 'APP-1', conid: 'DATASET-1',
        prowid: 'NAV-ROOT-0', FunName: '数据空间管理', name: '', NavigationUrl: '' })
    }
    const fixture = await createCatalogScriptFixture({}, configureRows)
    const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '查询绑定')
    const onClick = catalogActionHandler(action)
    if (!onClick) throw new Error('query-bindings action has no handler')
    await onClick()
    const pages = requestsForModel(fixture.http, 'Base_NavigationInfo').map(request => {
      const payload = recordAt(request.data, 'blueprint request')
      return recordAt(payload['PageParam'], 'blueprint page')['index']
    })
    expect(pages).toEqual([1, 2])
    expect(fixture.blueprintDataSet.getView('Base_NavigationInfo', 'catalogBindings')?.rows).toHaveLength(502)
    expect(vnodeText(fixture.functions['RenderCatalogBindings']?.()))
      .toContain('功能0 / 数据空间管理')

    const truncated = await createCatalogScriptFixture({}, http => {
      configureRows(http)
      http.omitNavigationSecondPage = true
    })
    const truncatedAction = renderCatalogActionButtons(truncated.functions).find(item => item['children'] === '查询绑定')
    const truncatedClick = catalogActionHandler(truncatedAction)
    if (!truncatedClick) throw new Error('query-bindings action has no handler')
    await truncatedClick()
    const truncatedText = vnodeText(truncated.functions['RenderCatalogBindings']?.()).join('\n')
    expect(truncatedText).not.toContain('功能0 / 数据空间管理')
    expect(truncatedText).not.toContain('当前应用暂无蓝图节点绑定该数据空间')
  })

  it('shows an empty state for a complete result with no matching data-space binding', async () => {
    const fixture = await createCatalogScriptFixture({}, http => {
      http.navigationRows = http.navigationRows.map(row => ({ ...row, conid: null }))
    })
    const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '查询绑定')
    const onClick = catalogActionHandler(action)
    if (!onClick) throw new Error('query-bindings action has no handler')
    await onClick()
    const rendered = vnodeText(fixture.functions['RenderCatalogBindings']?.()).join('\n')
    expect(rendered).toContain('当前应用暂无蓝图节点绑定该数据空间')
    expect(rendered).not.toContain('NAV-BOUND')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('fails closed when the blueprint scene or directory identity is unavailable', async () => {
    const missingScene = await createCatalogScriptFixture({}, undefined, { includeBlueprintScenario: false })
    const sceneAction = renderCatalogActionButtons(missingScene.functions).find(item => item['children'] === '查询绑定')
    const sceneClick = catalogActionHandler(sceneAction)
    if (!sceneClick) throw new Error('query-bindings action has no handler')
    await sceneClick()
    expect(vnodeText(missingScene.functions['RenderCatalogBindings']?.()).join('\n'))
      .toContain('页面未配置蓝图查询场景')
    expect(requestsForModel(missingScene.http, 'Base_NavigationInfo')).toHaveLength(0)

    const hiddenDirectoryId = await createCatalogScriptFixture({}, http => { http.hiddenFields = ['rowid'] })
    expect(renderCatalogActionButtons(hiddenDirectoryId.functions).some(item => item['children'] === '查询绑定')).toBe(false)
    expect(requestsForModel(hiddenDirectoryId.http, 'Base_NavigationInfo')).toHaveLength(0)

    const hiddenApplicationId = await createCatalogScriptFixture({}, http => { http.maskedFields = ['sysid'] })
    expect(renderCatalogActionButtons(hiddenApplicationId.functions).some(item => item['children'] === '查询绑定')).toBe(false)
    expect(requestsForModel(hiddenApplicationId.http, 'Base_NavigationInfo')).toHaveLength(0)
  })

  it('does not show a partial tree when any required blueprint field is hidden or masked', async () => {
    const fields = ['rowid', 'SysId', 'conid', 'prowid', 'FunName', 'name', 'NavigationUrl']
    for (const field of fields) {
      for (const permission of ['hidden', 'masked']) {
        const fixture = await createCatalogScriptFixture({}, http => {
          if (permission === 'hidden') http.navigationHiddenFields = [field]
          else http.navigationMaskedFields = [field]
        })
        const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '查询绑定')
        const onClick = catalogActionHandler(action)
        if (!onClick) throw new Error('query-bindings action has no handler')
        await onClick()
        const rendered = vnodeText(fixture.functions['RenderCatalogBindings']?.()).join('\n')
        expect(rendered).toContain('当前用户无权读取所需数据')
        expect(rendered).not.toContain('元数据管理 /')
        expect(rendered).not.toContain('NAV-BOUND')
        expect(fixture.http.saveRequests).toHaveLength(0)
      }
    }
  })

  it('rejects missing parents, cycles, and omitted conid values without presenting paths', async () => {
    const invalidRows = [
      { label: 'missing parent', change: (rows: Record<string, unknown>[]) => rows.map(row => row['rowid'] === 'NAV-BOUND'
        ? { ...row, prowid: 'MISSING-PARENT' } : row) },
      { label: 'parent cycle', change: (rows: Record<string, unknown>[]) => rows.map(row => row['rowid'] === 'NAV-ROOT'
        ? { ...row, prowid: 'NAV-GROUP' } : row) },
      { label: 'missing conid', change: (rows: Record<string, unknown>[]) => rows.map(row => {
        if (row['rowid'] !== 'NAV-BOUND') return row
        const changed = { ...row }
        delete changed['conid']
        return changed
      }) },
    ]
    for (const invalid of invalidRows) {
      const fixture = await createCatalogScriptFixture({}, http => { http.navigationRows = invalid.change(http.navigationRows) })
      const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '查询绑定')
      const onClick = catalogActionHandler(action)
      if (!onClick) throw new Error(`query-bindings action missing for ${invalid.label}`)
      await onClick()
      const rendered = vnodeText(fixture.functions['RenderCatalogBindings']?.()).join('\n')
      expect(rendered).not.toContain('元数据管理 /')
      expect(rendered).not.toContain('NAV-BOUND')
      expect(rendered).not.toContain('当前应用暂无蓝图节点绑定该数据空间')
      expect(fixture.http.saveRequests).toHaveLength(0)
    }
  })

  it('rejects wrong-application and duplicate or missing blueprint identities without a partial path', async () => {
    const cases: Array<{ label: string; rows: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
      navigationKeyOverride?: string }> = [
      { label: 'wrong application', rows: rows => rows.map(row => row['rowid'] === 'NAV-BOUND'
        ? { ...row, SysId: 'APP-OTHER' } : row) },
      { label: 'duplicate row identity', rows: rows => [...rows, { ...rows[0] }] },
      { label: 'missing row identity', rows: rows => rows.map(row => {
        if (row['rowid'] !== 'NAV-BOUND') return row
        const changed = { ...row }
        delete changed['rowid']
        return changed
      }) },
      { label: 'primary key mismatch', rows: rows => rows.map(row => row['rowid'] === 'NAV-BOUND'
        ? { ...row, alternateKey: 'NAV-WRONG-PK' } : row), navigationKeyOverride: 'NAV-WRONG-PK' },
    ]
    for (const invalid of cases) {
      const fixture = await createCatalogScriptFixture({}, http => {
        http.navigationResponseRows = invalid.rows(http.navigationRows)
        if (invalid.navigationKeyOverride !== undefined) {
          http.navigationKeyOverride = invalid.navigationKeyOverride
          http.navigationPrimaryKeyField = 'alternateKey'
        }
      })
      const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '查询绑定')
      const onClick = catalogActionHandler(action)
      if (!onClick) throw new Error(`query-bindings action missing for ${invalid.label}`)
      await onClick()
      const rendered = vnodeText(fixture.functions['RenderCatalogBindings']?.()).join('\n')
      expect(rendered).not.toContain('元数据管理 /')
      expect(rendered).not.toContain('NAV-BOUND')
      expect(rendered).not.toContain('当前应用暂无蓝图节点绑定该数据空间')
    }
  })

  it('fails explicitly when the original query owner cannot provide a total row count', async () => {
    const fixture = await createCatalogScriptFixture({}, http => { http.omitNavigationTotal = true })
    const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '查询绑定')
    const onClick = catalogActionHandler(action)
    if (!onClick) throw new Error('query-bindings action has no handler')
    await onClick()
    const rendered = vnodeText(fixture.functions['RenderCatalogBindings']?.()).join('\n')
    expect(rendered).not.toContain('元数据管理 /')
    expect(rendered).not.toContain('当前应用暂无蓝图节点绑定该数据空间')
  })

  it('clears a closed in-flight query and ignores its late result', async () => {
    let releaseQuery: (() => void) | undefined
    let notifyQueryStarted: (() => void) | undefined
    const queryStarted = new Promise<void>(resolve => { notifyQueryStarted = resolve })
    const fixture = await createCatalogScriptFixture({}, http => {
      http.navigationQueryGate = new Promise<void>(resolve => { releaseQuery = resolve })
      http.navigationQueryStarted = () => { notifyQueryStarted?.() }
    })
    const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '查询绑定')
    const onClick = catalogActionHandler(action)
    if (!onClick) throw new Error('query-bindings action has no handler')
    const pending = onClick()
    await queryStarted
    expect(fixture.isDialogVisible()).toBe(true)
    fixture.closeDialog()
    const closedAction = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '查询绑定')
    expect(isRecord(closedAction?.['props']) && closedAction['props']['disabled']).toBe(true)
    const closedActionHandler = catalogActionHandler(closedAction)
    await closedActionHandler?.()
    expect(requestsForModel(fixture.http, 'Base_NavigationInfo')).toHaveLength(1)
    releaseQuery?.()
    await pending
    const rendered = vnodeText(fixture.functions['RenderCatalogBindings']?.()).join('\n')
    expect(fixture.isDialogVisible()).toBe(false)
    expect(rendered).not.toContain('NAV-BOUND')
    expect(rendered).not.toContain('元数据管理 /')
    expect(fixture.http.saveRequests).toHaveLength(0)
    const releasedAction = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '查询绑定')
    expect(isRecord(releasedAction?.['props']) && releasedAction['props']['disabled']).toBe(false)
  })

  it('does not retain a successful path after query-owner scope revocation', async () => {
    const fixture = await createCatalogScriptFixture()
    const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '查询绑定')
    const onClick = catalogActionHandler(action)
    if (!onClick) throw new Error('query-bindings action has no handler')
    await onClick()
    expect(vnodeText(fixture.functions['RenderCatalogBindings']?.()).join('\n'))
      .toContain('元数据管理 / 目录配置 / 数据空间管理')
    fixture.changeScope('catalog-bindings-scope-revoked')
    const rendered = vnodeText(fixture.functions['RenderCatalogBindings']?.()).join('\n')
    expect(rendered).not.toContain('元数据管理 /')
    expect(rendered).not.toContain('NAV-BOUND')
    expect(rendered).toContain('数据已变化，请关闭后重新查询')
  })

  it('hides a successful path when the declared blueprint view result is replaced', async () => {
    const fixture = await createCatalogScriptFixture()
    const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '查询绑定')
    const onClick = catalogActionHandler(action)
    if (!onClick) throw new Error('query-bindings action has no handler')
    await onClick()
    const view = fixture.blueprintDataSet.getView('Base_NavigationInfo', 'catalogBindings')
    expect(vnodeText(fixture.functions['RenderCatalogBindings']?.()).join('\n'))
      .toContain('元数据管理 / 目录配置 / 数据空间管理')
    const refreshed = await view?.loadFromServer({ fields: ['rowid', 'SysId', 'conid', 'prowid', 'FunName', 'name', 'NavigationUrl'],
      filter: { field: 'SysId', operator: 'eq', value: 'APP-1' }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    expect(refreshed?.success).toBe(true)
    const rendered = vnodeText(fixture.functions['RenderCatalogBindings']?.()).join('\n')
    expect(rendered).not.toContain('元数据管理 /')
    expect(rendered).not.toContain('NAV-BOUND')
    expect(rendered).toContain('数据已变化，请关闭后重新查询')
  })

  it('rejects a pending result after the directory target row changes or refreshes', async () => {
    type CatalogView = NonNullable<ReturnType<Awaited<ReturnType<typeof createCatalogScriptFixture>>['dataSet']['getView']>>
    const changes: Array<{ label: string; apply: (view: CatalogView) => Promise<void> }> = [
      { label: 'current row', apply: async view => { view.setCurrentRowById('DATASET-2') } },
      { label: 'refreshed row object', apply: async view => { await view.refresh() } },
      { label: 'changed application id', apply: async view => { const row = view.currentRow; if (row) row['sysid'] = 'APP-CHANGED' } },
    ]
    for (const change of changes) {
      let releaseQuery: (() => void) | undefined
      let notifyQueryStarted: (() => void) | undefined
      const queryStarted = new Promise<void>(resolve => { notifyQueryStarted = resolve })
      const fixture = await createCatalogScriptFixture({}, http => {
        http.includeSecondDataset = true
        http.navigationQueryGate = new Promise<void>(resolve => { releaseQuery = resolve })
        http.navigationQueryStarted = () => { notifyQueryStarted?.() }
      })
      const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '查询绑定')
      const onClick = catalogActionHandler(action)
      if (!onClick) throw new Error(`query-bindings action missing for ${change.label}`)
      const pending = onClick()
      await queryStarted
      const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
      if (!view) throw new Error('catalog view missing during pending query')
      await change.apply(view)
      releaseQuery?.()
      await pending
      const rendered = vnodeText(fixture.functions['RenderCatalogBindings']?.()).join('\n')
      expect(rendered).not.toContain('元数据管理 /')
      expect(rendered).not.toContain('NAV-BOUND')
      expect(rendered).not.toContain('当前应用暂无蓝图节点绑定该数据空间')
    }
  })

  it('opens the configured r-dialog from the page and closes after showing the resolved path', async () => {
    registerAllRenderers()
    let releaseQuery: (() => void) | undefined
    let startedCount = 0
    let notifySecondQueryStarted: (() => void) | undefined
    const secondQueryStarted = new Promise<void>(resolve => { notifySecondQueryStarted = resolve })
    const fixture = await createCatalogScriptFixture({}, http => {
      http.navigationQueryStarted = () => {
        startedCount += 1
        if (startedCount === 2) notifySecondQueryStarted?.()
      }
    })
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/__tool/test', component: defineComponent({ name: 'RouteStub', render: () => h('div') }) },
    ] })
    await router.push('/__tool/test')
    await router.isReady()
    const restore = disableSparkRendererStub()
    let wrapper: ReturnType<typeof mount> | undefined
    try {
      const runtimeErrors: string[] = []
      wrapper = mount(SparkPageRenderer, { props: { routeSnapshot, pageRuntime: fixture.pageRuntime,
        onRuntimeError: error => runtimeErrors.push(error.message) },
        global: { plugins: [Spark.createPlugin(), router], stubs: { 'el-dialog': ElementDialogStub } } })
      await flushPromises()
      await wrapper.get('.catalog-query-bindings').trigger('click')
      await flushPromises()
      expect(wrapper.find('.renderer-dialog-body').exists()).toBe(true)
      expect(wrapper.text()).toContain('元数据管理 / 目录配置 / 数据空间管理')
      expect(runtimeErrors).toEqual([])
      expect(fixture.http.saveRequests).toHaveLength(0)
      expect(wrapper.find('.el-dialog').exists()).toBe(true)
      await wrapper.get('.el-dialog-close').trigger('click')
      await flushPromises()
      expect(wrapper.find('.el-dialog').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('元数据管理 / 目录配置 / 数据空间管理')
      fixture.http.navigationQueryGate = new Promise<void>(resolve => { releaseQuery = resolve })
      await wrapper.get('.catalog-query-bindings').trigger('click')
      await secondQueryStarted
      await wrapper.get('.el-dialog-close').trigger('click')
      await flushPromises()
      releaseQuery?.()
      await flushPromises()
      expect(wrapper.find('.el-dialog').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('元数据管理 / 目录配置 / 数据空间管理')
    } finally {
      wrapper?.unmount()
      restore()
    }
  })

  it('disables search while page initialization is pending', async () => {
    let releaseApps: (() => void) | undefined
    let notifyAppsStarted: (() => void) | undefined
    const appsStarted = new Promise<void>(resolve => { notifyAppsStarted = resolve })
    const fixture = await createCatalogScriptFixture({}, http => {
      http.applicationQueryGate = new Promise<void>(resolve => { releaseApps = resolve })
      http.applicationQueryStarted = () => { notifyAppsStarted?.() }
      http.datasetCount = 12
      http.applyCatalogFilter = true
    }, { initialize: false })
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/__tool/test', component: defineComponent({ name: 'RouteStub', render: () => h('div') }) },
    ] })
    await router.push('/__tool/test')
    await router.isReady()
    registerAllRenderers()
    const restore = disableSparkRendererStub()
    let wrapper: ReturnType<typeof mount> | undefined
    try {
      wrapper = mount(SparkPageRenderer, {
        props: { routeSnapshot, pageRuntime: fixture.pageRuntime },
        global: { plugins: [Spark.createPlugin(), router] },
      })
      await appsStarted
      const search = wrapper.get('.catalog-search-name')
      await search.setValue('DATASET-1')
      const query = wrapper.get('.catalog-search-controls .catalog-button')

      expect(inputValue(search.element)).toBe('DATASET-1')
      expect(query.attributes('disabled')).toBeDefined()
      const requestsBeforeBlockedHandlers = fixture.http.requests.length
      await query.trigger('click')
      await fixture.functions['applyCatalogFilter']?.()
      await fixture.functions['changeCatalogPage']?.(2)
      await fixture.functions['changeCatalogPageSize']?.({ target: { value: '20' } })
      const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
      await fixture.functions['addCatalogEntry']?.()
      await fixture.functions['editCatalogEntry']?.(view, view?.currentRow)
      await fixture.functions['deleteCatalogEntry']?.(view, view?.currentRow)
      await fixture.functions['copyCatalogApiInfo']?.(view, view?.currentRow)
      expect(fixture.http.requests).toHaveLength(requestsBeforeBlockedHandlers)
      expect(fixture.http.saveRequests).toHaveLength(0)

      releaseApps?.()
      releaseApps = undefined
      await flushPromises()
      await flushPromises()

      expect(query.attributes('disabled')).toBeUndefined()
      expect(inputValue(search.element)).toBe('DATASET-1')
      const catalogView = fixture.dataSet.getView('Base_DataSet', 'catalog')
      expect(catalogView?.rows.length, JSON.stringify({ requestState: catalogView?.requestState,
        loadingError: catalogView?.loadingError, requestCount: fixture.http.requests.length })).toBe(10)
      expect(fixture.dataSet.getView('Base_DataSet', 'catalog')?.total).toBe(12)

      await query.trigger('click')
      await flushPromises()
      await flushPromises()

      expect(fixture.dataSet.getView('Base_DataSet', 'catalog')?.rows).toMatchObject([{ rowid: 'DATASET-1' }])
      expect(fixture.dataSet.getView('Base_DataSet', 'catalog')?.rows).toHaveLength(1)
      expect(fixture.dataSet.getView('Base_DataSet', 'catalog')?.total).toBe(1)
      expect(wrapper.get('.catalog-pager').text()).toContain('1-1 / 1')
      const catalogRequests = fixture.http.requests.filter(request => {
        const payload = recordAt(request.data, 'query payload')
        const tables = Array.isArray(payload['Table']) ? payload['Table'] : []
        return recordValue(tables[0], 'Name') === 'Base_DataSet'
      })
      const latestPayload = recordAt(catalogRequests.at(-1)?.data, 'latest catalog query payload')
      const latestTables = latestPayload['Table']
      if (!Array.isArray(latestTables)) throw new Error('latest catalog query has no table')
      const latestTable = recordAt(latestTables[0], 'latest catalog query table')
      expect(latestTable['Filter']).toMatchObject({ Type: 'or', Filters: expect.arrayContaining([
        expect.objectContaining({ Type: 'cond', Field: 'rowid', Operator: 'equal' }),
      ]) })
    } finally {
      releaseApps?.()
      wrapper?.unmount()
      restore()
    }
  })

  it('releases the initialization guard after an application-option failure', async () => {
    const fixture = await createCatalogScriptFixture({}, http => { http.failQuery = true }, { initialize: false })
    const initialize = fixture.functions['__init__']
    const applyFilter = fixture.functions['applyCatalogFilter']
    if (typeof initialize !== 'function' || typeof applyFilter !== 'function') {
      throw new Error('catalog initialization handlers are missing')
    }
    await expect(initialize()).rejects.toThrow('fixture query failed')

    fixture.http.failQuery = false
    const requestsAfterInitFailure = fixture.http.requests.length
    await applyFilter()
    expect(fixture.http.requests.length).toBeGreaterThan(requestsAfterInitFailure)
  })

  it('renders a copy API action for a readable current catalog row', async () => {
    const fixture = await createCatalogScriptFixture()
    expect(renderCatalogActionButtons(fixture.functions).some(action => action['children'] === '复制 API')).toBe(true)
  })

  it('copies the source API text after the view owner collects every authorized page', async () => {
    const messages: string[] = []
    const copied: string[] = []
    const fixture = await createCatalogScriptFixture({
      copyText: async text => { copied.push(text) },
      showMessage: message => { messages.push(message) },
    })
    fixture.designDataSet.getView('Base_DataModel', 'apiInfoModels')!.pageSize = 1
    fixture.designDataSet.getView('Base_DataModel_Field', 'apiInfoFields')!.pageSize = 1
    const button = renderCatalogActionButtons(fixture.functions).find(action => action['children'] === '复制 API')
    const onClick = catalogActionHandler(button)
    if (!onClick) throw new Error('copy API action has no handler')
    await onClick()

    expect(copied).toEqual([[
      "const DataSetId = 'DATASET-1';",
      "const DataModel_A = 'A';",
      "const DataModel_A_Type = '数据库表';",
      "const DataModel_A_PK = 'id\\'\\\\\\nkey';",
      "const DataModel_A_2 = 'A';",
      "const DataModel_A_2_Type = '业务对象';",
      "const DataModel_A_2_PK = 'rowid';",
      "const DataModel_A_2_2 = 'A_2';",
      "const DataModel_A_2_2_Type = '数据表';",
      "const DataModel_A_2_2_PK = 'key';",
      "const DataModel_A_Type_2 = 'A_Type';",
      "const DataModel_A_Type_2_Type = '视图';",
      "const DataModel_A_Type_2_PK = 'rowid';",
    ].join('\n')])
    const declarations = [...copied[0]!.matchAll(/^const\s+([\p{L}_$][\p{L}\p{N}_$]*)\s*=/gmu)].map(match => match[1])
    expect(new Set(declarations).size).toBe(declarations.length)
    const designRequests = fixture.http.requests.filter(request => request.headers?.['x-FormKey'] === designScenarioId)
    expect(designRequests).toHaveLength(7)
    const firstFieldRequest = recordAt(designRequests[4]?.data, 'first field page')
    const firstFieldTables = firstFieldRequest['Table']
    if (!Array.isArray(firstFieldTables)) throw new Error('first field query has no table')
    const firstFieldTable = recordAt(firstFieldTables[0], 'first field table')
    expect(firstFieldTable['Name']).toBe('Base_DataModel_Field')
    expect(firstFieldTable['Filter']).toMatchObject({
      Field: 'dataSetId', Operator: 'equal', ValueFun: { Type: 'GetConstValue', Value: 'DATASET-1' },
    })
    expect(firstFieldTable['Fields']).toEqual(expect.arrayContaining([
      expect.objectContaining({ Name: 'rowid', OrderType: 'ascending' }),
      expect.objectContaining({ Name: 'dataModelId' }),
    ]))
    expect(designRequests.map(request => recordValue(recordAt(request.data, 'design query'), 'PageParam')))
      .toMatchObject([{ index: 1, size: 1 }, { index: 2, size: 1 }, { index: 3, size: 1 }, { index: 4, size: 1 },
        { index: 1, size: 1 }, { index: 2, size: 1 }, { index: 3, size: 1 }])
    expect(fixture.http.saveRequests).toHaveLength(0)
    expect(messages).toContain('API 信息已复制')
  })

  it('copies only the dataset header when both design queries return no rows', async () => {
    const copied: string[] = []
    const fixture = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) } }, http => {
      http.apiModels = []
      http.apiFields = []
    })
    await fixture.functions['copyCatalogApiInfo']?.(fixture.dataSet.getView('Base_DataSet', 'catalog'),
      fixture.dataSet.getView('Base_DataSet', 'catalog')?.currentRow)
    expect(copied).toEqual(["const DataSetId = 'DATASET-1';"])
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it.each([
    { type: '   ', name: 'BusinessId', expected: "const DataModel_A_PK = 'BusinessId';" },
    { type: 'dataModel', name: '   ', expected: "const DataModel_A_PK = 'rowid';" },
  ])('matches source API primary-key fallback for type and name whitespace', async ({ type, name, expected }) => {
    const copied: string[] = []
    const fixture = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) } }, http => {
      http.apiModels = [http.apiModels[0]!]
      http.apiFields = [{ rowid: 'FIELD-1', Name: name, type, IsPKey: '1',
        dataSetId: 'DATASET-1', dataModelId: 'MODEL-1' }]
    })
    await fixture.functions['copyCatalogApiInfo']?.(fixture.dataSet.getView('Base_DataSet', 'catalog'),
      fixture.dataSet.getView('Base_DataSet', 'catalog')?.currentRow)
    expect(copied[0]).toContain(expected)
  })

  it.each(['rowid', 'Name', 'Type', 'dataSetId'])(
    'rejects model API output when required field %s is hidden', async field => {
      const copied: string[] = []
      const messages: string[] = []
      const fixture = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) },
        showMessage: message => { messages.push(message) } }, http => { http.designHiddenFields = [field] })
      await fixture.functions['copyCatalogApiInfo']?.(fixture.dataSet.getView('Base_DataSet', 'catalog'),
        fixture.dataSet.getView('Base_DataSet', 'catalog')?.currentRow)
      expect(copied).toHaveLength(0)
      expect(messages).toContain('复制 API 失败，请检查数据权限或剪贴板后重试')
      expect(fixture.http.saveRequests).toHaveLength(0)
    })

  it('rejects masked field metadata and foreign model ownership without copying', async () => {
    const messages: string[] = []
    const copied: string[] = []
    const masked = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) },
      showMessage: message => { messages.push(message) } }, http => {
      http.designMaskedFields = ['IsPKey']
      http.designPermissionTable = 'Base_DataModel_Field'
    })
    await masked.functions['copyCatalogApiInfo']?.(masked.dataSet.getView('Base_DataSet', 'catalog'),
      masked.dataSet.getView('Base_DataSet', 'catalog')?.currentRow)
    expect(copied).toHaveLength(0)
    expect(messages).toContain('复制 API 失败，请检查数据权限或剪贴板后重试')

    const foreign = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) },
      showMessage: message => { messages.push(message) } }, http => { http.apiModels[0]!['dataSetId'] = 'OTHER-DATASET' })
    await foreign.functions['copyCatalogApiInfo']?.(foreign.dataSet.getView('Base_DataSet', 'catalog'),
      foreign.dataSet.getView('Base_DataSet', 'catalog')?.currentRow)
    expect(copied).toHaveLength(0)
    expect(foreign.http.saveRequests).toHaveLength(0)
  })

  it.each(['rowid', 'Name', 'type', 'IsPKey', 'dataSetId', 'dataModelId'])(
    'rejects field API output when required field %s is hidden', async field => {
      const messages: string[] = []
      const copied: string[] = []
      const fixture = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) },
        showMessage: message => { messages.push(message) } }, http => {
        http.designHiddenFields = [field]
        http.designPermissionTable = 'Base_DataModel_Field'
      })
      await fixture.functions['copyCatalogApiInfo']?.(fixture.dataSet.getView('Base_DataSet', 'catalog'),
        fixture.dataSet.getView('Base_DataSet', 'catalog')?.currentRow)
      expect(copied).toHaveLength(0)
      expect(messages).toContain('复制 API 失败，请检查数据权限或剪贴板后重试')
    })

  it('reports an undeclared design scenario and does not query or copy', async () => {
    const messages: string[] = []
    const copied: string[] = []
    const fixture = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) },
      showMessage: message => { messages.push(message) } }, undefined, { includeDesignScenario: false })
    await fixture.functions['copyCatalogApiInfo']?.(fixture.dataSet.getView('Base_DataSet', 'catalog'),
      fixture.dataSet.getView('Base_DataSet', 'catalog')?.currentRow)
    expect(fixture.http.requests.filter(request => request.headers?.['x-FormKey'] === designScenarioId)).toHaveLength(0)
    expect(copied).toHaveLength(0)
    expect(messages).toContain('页面未配置数据空间设计场景')
  })

  it('does not query design data when the catalog row ID is hidden', async () => {
    const copied: string[] = []
    const fixture = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) } }, http => {
      http.hiddenFields = ['rowid']
    })
    await fixture.functions['copyCatalogApiInfo']?.(fixture.dataSet.getView('Base_DataSet', 'catalog'),
      fixture.dataSet.getView('Base_DataSet', 'catalog')?.currentRow)
    expect(fixture.http.requests.filter(request => request.headers?.['x-FormKey'] === designScenarioId)).toHaveLength(0)
    expect(copied).toHaveLength(0)
  })

  it('does not copy or notify after the captured row changes during a design query', async () => {
    let release: (() => void) | undefined
    let started: (() => void) | undefined
    const queryStarted = new Promise<void>(resolve => { started = resolve })
    const fixture = await createCatalogScriptFixture({ copyText: async () => { throw new Error('must not copy') } }, http => {
      http.includeSecondDataset = true
      http.designQueryGate = new Promise<void>(resolve => { release = resolve })
      http.designQueryStarted = () => { started?.() }
    })
    const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
    const row = view?.currentRow
    const pending = fixture.functions['copyCatalogApiInfo']?.(view, row)
    await queryStarted
    if (!view?.rows[1]) throw new Error('second dataset row is missing')
    view.setCurrentRow(view.rows[1])
    release?.()
    await pending
    expect(fixture.http.requests.filter(request => request.headers?.['x-FormKey'] === designScenarioId)).toHaveLength(1)
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('does not copy or notify after the page is invalidated during a design query', async () => {
    let release: (() => void) | undefined
    let started: (() => void) | undefined
    const queryStarted = new Promise<void>(resolve => { started = resolve })
    const messages: string[] = []
    const copied: string[] = []
    const fixture = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) },
      showMessage: message => { messages.push(message) } }, http => {
      http.designQueryGate = new Promise<void>(resolve => { release = resolve })
      http.designQueryStarted = () => { started?.() }
    })
    const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
    const pending = fixture.functions['copyCatalogApiInfo']?.(view, view?.currentRow)
    await queryStarted
    fixture.invalidatePage()
    release?.()
    await pending
    expect(copied).toHaveLength(0)
    expect(messages).not.toContain('API 信息已复制')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('does not copy or notify after the query owner scope changes', async () => {
    let release: (() => void) | undefined
    let started: (() => void) | undefined
    const queryStarted = new Promise<void>(resolve => { started = resolve })
    const messages: string[] = []
    const copied: string[] = []
    const fixture = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) },
      showMessage: message => { messages.push(message) } }, http => {
      http.designQueryGate = new Promise<void>(resolve => { release = resolve })
      http.designQueryStarted = () => { started?.() }
    })
    const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
    const pending = fixture.functions['copyCatalogApiInfo']?.(view, view?.currentRow)
    await queryStarted
    fixture.changeScope('catalog-test-scope-rotated')
    release?.()
    await pending
    expect(copied).toHaveLength(0)
    expect(messages).not.toContain('API 信息已复制')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('rejects a model view refresh that replaces the captured query result during field loading', async () => {
    let release: (() => void) | undefined
    let started: (() => void) | undefined
    const queryStarted = new Promise<void>(resolve => { started = resolve })
    const copied: string[] = []
    const messages: string[] = []
    const fixture = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) },
      showMessage: message => { messages.push(message) } }, http => {
      http.designQueryGateTable = 'Base_DataModel_Field'
      http.designQueryGate = new Promise<void>(resolve => { release = resolve })
      http.designQueryStarted = () => { started?.() }
    })
    const catalogView = fixture.dataSet.getView('Base_DataSet', 'catalog')
    const models = fixture.designDataSet.getView('Base_DataModel', 'apiInfoModels')
    const pending = fixture.functions['copyCatalogApiInfo']?.(catalogView, catalogView?.currentRow)
    await queryStarted
    const refreshed = await models?.loadFromServer({ fields: ['rowid', 'Name', 'Type', 'dataSetId'],
      filter: { field: 'dataSetId', operator: 'eq', value: 'DATASET-1' }, allPages: true, maxRows: 50000 })
    expect(refreshed?.success).toBe(true)
    release?.()
    await pending
    expect(copied).toHaveLength(0)
    expect(messages).not.toContain('API 信息已复制')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('rejects a catalog refresh that replaces the captured directory row during field loading', async () => {
    let release: (() => void) | undefined
    let started: (() => void) | undefined
    const queryStarted = new Promise<void>(resolve => { started = resolve })
    const copied: string[] = []
    const messages: string[] = []
    const fixture = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) },
      showMessage: message => { messages.push(message) } }, http => {
      http.designQueryGateTable = 'Base_DataModel_Field'
      http.designQueryGate = new Promise<void>(resolve => { release = resolve })
      http.designQueryStarted = () => { started?.() }
    })
    const catalogView = fixture.dataSet.getView('Base_DataSet', 'catalog')
    const capturedRow = catalogView?.currentRow
    const pending = fixture.functions['copyCatalogApiInfo']?.(catalogView, capturedRow)
    await queryStarted
    await catalogView?.refresh()
    release?.()
    await pending
    expect(copied).toHaveLength(0)
    expect(messages).not.toContain('API 信息已复制')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('does not copy or notify after the PageRuntime is disposed during a design query', async () => {
    let release: (() => void) | undefined
    let started: (() => void) | undefined
    const queryStarted = new Promise<void>(resolve => { started = resolve })
    const copied: string[] = []
    const messages: string[] = []
    const fixture = await createCatalogScriptFixture({ copyText: async text => { copied.push(text) },
      showMessage: message => { messages.push(message) } }, http => {
      http.designQueryGate = new Promise<void>(resolve => { release = resolve })
      http.designQueryStarted = () => { started?.() }
    })
    const catalogView = fixture.dataSet.getView('Base_DataSet', 'catalog')
    const pending = fixture.functions['copyCatalogApiInfo']?.(catalogView, catalogView?.currentRow)
    await queryStarted
    fixture.pageRuntime.dispose()
    release?.()
    await pending
    expect(copied).toHaveLength(0)
    expect(messages).not.toContain('API 信息已复制')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('shows clipboard rejection and releases the copy lock for retry', async () => {
    const messages: string[] = []
    let failClipboard = true
    const fixture = await createCatalogScriptFixture({ copyText: async () => {
      if (failClipboard) throw new Error('clipboard denied')
    }, showMessage: message => { messages.push(message) } })
    const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
    const row = view?.currentRow
    await fixture.functions['copyCatalogApiInfo']?.(view, row)
    expect(messages).not.toContain('API 信息已复制')
    expect(messages).toContain('复制 API 失败，请检查数据权限或剪贴板后重试')
    failClipboard = false
    await fixture.functions['copyCatalogApiInfo']?.(view, row)
    expect(messages).toContain('API 信息已复制')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('does not report success when the design model result is replaced during clipboard writing', async () => {
    let releaseClipboard: (() => void) | undefined
    let clipboardStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { clipboardStarted = resolve })
    const messages: string[] = []
    const copied: string[] = []
    const fixture = await createCatalogScriptFixture({ copyText: async text => {
      copied.push(text)
      clipboardStarted?.()
      await new Promise<void>(resolve => { releaseClipboard = resolve })
    }, showMessage: message => { messages.push(message) } })
    const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
    const pending = fixture.functions['copyCatalogApiInfo']?.(view, view?.currentRow)
    await started
    const models = fixture.designDataSet.getView('Base_DataModel', 'apiInfoModels')
    const refreshed = await models?.loadFromServer({ fields: ['rowid', 'Name', 'Type', 'dataSetId'],
      filter: { field: 'dataSetId', operator: 'eq', value: 'DATASET-1' }, allPages: true, maxRows: 50000 })
    expect(refreshed?.success).toBe(true)
    releaseClipboard?.()
    await pending
    expect(copied).toHaveLength(1)
    expect(messages).not.toContain('API 信息已复制')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('does not report success when the design owner scope changes during clipboard writing', async () => {
    let releaseClipboard: (() => void) | undefined
    let clipboardStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { clipboardStarted = resolve })
    const messages: string[] = []
    const copied: string[] = []
    const fixture = await createCatalogScriptFixture({ copyText: async text => {
      copied.push(text)
      clipboardStarted?.()
      await new Promise<void>(resolve => { releaseClipboard = resolve })
    }, showMessage: message => { messages.push(message) } })
    const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
    const pending = fixture.functions['copyCatalogApiInfo']?.(view, view?.currentRow)
    await started
    fixture.changeScope('catalog-test-scope-after-clipboard-start')
    releaseClipboard?.()
    await pending
    expect(copied).toHaveLength(1)
    expect(messages).not.toContain('API 信息已复制')
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('loads all four assets, validates scenario config, assembles a PageRuntime, and renders the list shell', async () => {
    registerAllRenderers()
    const ruleText = readFileSync(resolve(pageRoot, 'rule.json'), 'utf8')
    const scriptText = readFileSync(resolve(pageRoot, 'script.js'), 'utf8')
    const styleText = readFileSync(resolve(pageRoot, 'style.css'), 'utf8')
    const pagedataText = readFileSync(resolve(pageRoot, 'pagedata.json'), 'utf8')
    const scenarioConfig = new ScenarioViewConfig(scenarioId, pagedataText)
    const rawTables = recordAt(scenarioConfig.toJSON()['tables'], 'scenario tables')
    const runtimeConfig = new ScenarioViewConfig(scenarioId, JSON.stringify({ scenarioId, tables: {
      Base_DataSet: rawTables['Base_DataSet'],
      Base_AppSystemList: rawTables['Base_AppSystemList'],
      Base_UserInfo: rawTables['Base_UserInfo'],
    } }))
    const http = new CatalogFixtureHttpClient()
    const runtime = new DataSpaceRuntimeApi({ http, readScope: () => ({ token: 'catalog-test-scope', headers: {} }) })
    const assembly = new LowcodeDataSpaceAssembler(runtime, http).assemble({
      config: runtimeConfig, models: formalModels(), relations: [],
    })
    const tool = markRaw(new PageTool({ pageId }))
    tool.hydrateFileText('rule.json', ruleText)
    tool.hydrateFileText('script.js', scriptText)
    tool.hydrateFileText('style.css', styleText)
    tool.markLoaded()
    const pageRuntime = markRaw(new PageRuntime({ tool, scenarioIds: [scenarioId], mainScenarioId: scenarioId,
      loadScenario: async () => assembly.dataSet }))
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/__tool/test', component: defineComponent({ name: 'RouteStub', render: () => h('div') }) },
    ] })
    await router.push('/__tool/test')
    await router.isReady()

    const restore = disableSparkRendererStub()
    try {
      const runtimeErrors: string[] = []
      const wrapper = mount(SparkPageRenderer, { props: { routeSnapshot, pageRuntime,
        onRuntimeError: error => runtimeErrors.push(error.message) },
        global: { plugins: [Spark.createPlugin(), router] } })
      await flushPromises()
      await flushPromises()

      expect(wrapper.text()).toContain('数据空间目录')
      expect(runtimeErrors).toEqual([])
      expect(wrapper.find('.renderer-table-main').exists(), wrapper.html()).toBe(true)
      expect(wrapper.html()).toContain('catalog-page')
      expect(assembly.dataSet.getView('Base_DataSet', 'catalog')?.rows).toMatchObject([
        { rowid: 'DATASET-1', Name: '试点目录', sysid: 'APP-1', createuser: 'USER-ROW-1' },
      ])
      expect(http.requests).toHaveLength(3)
      wrapper.unmount()
    } finally {
      restore()
    }
  })

  it('cancels before append and saves the generated row identity and datasource payload', async () => {
    let unauthorizedPromptCalls = 0
    const unauthorized = await createCatalogScriptFixture({
      selectEntities: async () => { unauthorizedPromptCalls += 1; return [] },
      showPrompt: async () => { unauthorizedPromptCalls += 1; return null },
    }, http => { http.allowAdd = false })
    await unauthorized.functions['addCatalogEntry']?.()
    expect(unauthorizedPromptCalls).toBe(0)
    expect(unauthorized.http.saveRequests).toHaveLength(0)

    const cancelled = await createCatalogScriptFixture({ selectEntities: async () => [] })
    const cancelledView = cancelled.dataSet.getView('Base_DataSet', 'catalog')
    const before = cancelledView?.rows.length
    await cancelled.functions['addCatalogEntry']?.()
    expect(cancelledView?.rows).toHaveLength(before ?? -1)
    expect(cancelled.http.saveRequests).toHaveLength(0)

    const promptCancelled = await createCatalogScriptFixture({
      selectEntities: async () => [{ value: 'APP-1', label: '试点应用' }],
      showPrompt: async () => null,
    })
    const promptCancelledView = promptCancelled.dataSet.getView('Base_DataSet', 'catalog')
    const promptCancelledBefore = promptCancelledView?.rows.length
    await promptCancelled.functions['addCatalogEntry']?.()
    expect(promptCancelledView?.rows).toHaveLength(promptCancelledBefore ?? -1)
    expect(promptCancelled.http.saveRequests).toHaveLength(0)

    const prompts = ['新增目录', '新增描述']
    const created = await createCatalogScriptFixture({
      selectEntities: async () => [{ value: 'APP-1', label: '试点应用' }],
      showPrompt: async () => prompts.shift() ?? null,
    })
    await created.functions['addCatalogEntry']?.()
    expect(created.http.saveRequests).toHaveLength(1)
    const saved = created.http.savedRows[0]
    expect(saved).toMatchObject({ Name: '新增目录', Type: 'datasource', description: '新增描述', sysid: 'APP-1' })
    expect(typeof saved?.['rowid']).toBe('string')
    expect(created.dataSet.getView('Base_DataSet', 'catalog')?.rows.some(row =>
      created.dataSet.getView('Base_DataSet', 'catalog')?.getPkKey(row) === saved?.['rowid'])).toBe(true)
  })

  it('keeps a masked creator masked and does not resend a save with unknown outcome', async () => {
    const creatorFixture = await createCatalogScriptFixture({}, http => { http.maskCreatorName = true })
    const creatorRenderer = creatorFixture.functions['RenderCatalogCreator']
    expect(creatorRenderer?.({ rowKey: 'DATASET-1' })).toMatchObject([{ children: '••••' }])
    const hiddenCreator = await createCatalogScriptFixture({}, http => { http.hideCreatorName = true })
    expect(hiddenCreator.functions['RenderCatalogCreator']?.({ rowKey: 'DATASET-1' }))
      .toMatchObject([{ children: '' }])

    const prompts = ['待确认目录', '待确认描述']
    const uncertain = await createCatalogScriptFixture({
      selectEntities: async () => [{ value: 'APP-1', label: '试点应用' }],
      showPrompt: async () => prompts.shift() ?? null,
    })
    uncertain.http.failSave = true
    await uncertain.functions['addCatalogEntry']?.()
    await uncertain.functions['addCatalogEntry']?.()
    expect(uncertain.http.saveRequests).toHaveLength(1)
    expect(uncertain.http.savedRows[0]).toMatchObject({ Name: '待确认目录', Type: 'datasource',
      description: '待确认描述', sysid: 'APP-1' })
  })

  it('deletes only the authorized current row through the original save owner', async () => {
    let confirmations = 0
    const denied = await createCatalogScriptFixture({
      showConfirm: async () => { confirmations += 1; return true },
    })
    expect(renderCatalogActionButtons(denied.functions).some(action => action['children'] === '删除数据空间')).toBe(false)
    const deniedView = denied.dataSet.getView('Base_DataSet', 'catalog')
    const deniedDelete = denied.functions['deleteCatalogEntry']
    if (typeof deniedDelete !== 'function' || !deniedView?.currentRow) throw new Error('denied fixture has no current row')
    await deniedDelete(deniedView, deniedView.currentRow)
    expect(confirmations).toBe(0)
    expect(denied.http.saveRequests).toHaveLength(0)

    const messages: string[] = []
    const fixture = await createCatalogScriptFixture({
      showConfirm: async message => { confirmations += 1; expect(message).not.toContain('试点目录'); return true },
      showMessage: message => { messages.push(message) },
    }, http => { http.allowDelete = true })
    const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '删除数据空间')
    const onClick = catalogActionHandler(action)
    if (!onClick) throw new Error('authorized delete action was not rendered')
    await onClick()

    expect(confirmations).toBe(1)
    expect(fixture.http.saveRequests).toHaveLength(1)
    expect(fixture.http.deletedRows).toMatchObject([{ rowid: 'DATASET-1', lingma_sys_key: 'DS-ROW' }])
    expect(fixture.http.deletedRows[0]).not.toHaveProperty('_pk')
    expect(fixture.http.deletedRows[0]).not.toHaveProperty('lingma_sys_params')
    expect(fixture.http.savedRows).toHaveLength(0)
    expect(fixture.http.changedRows).toHaveLength(0)
    expect(fixture.dataSet.getView('Base_DataSet', 'catalog')?.rows).toHaveLength(0)
    expect(fixture.dataSet.getView('Base_DataSet', 'catalog')?.dirtyTracking.pendingDeleteIds.size).toBe(0)
    expect(messages.join('\\n')).toContain('数据空间已删除')
  })

  it('cancels a delete without staging and rejects a row that changes during confirmation', async () => {
    let confirmations = 0
    const cancelled = await createCatalogScriptFixture({
      showConfirm: async () => { confirmations += 1; return false },
    }, http => { http.allowDelete = true })
    const cancelAction = renderCatalogActionButtons(cancelled.functions).find(item => item['children'] === '删除数据空间')
    const cancelClick = catalogActionHandler(cancelAction)
    if (!cancelClick) throw new Error('authorized delete action was not rendered')
    await cancelClick()
    expect(confirmations).toBe(1)
    expect(cancelled.dataSet.getView('Base_DataSet', 'catalog')?.rows).toHaveLength(1)
    expect(cancelled.dataSet.getView('Base_DataSet', 'catalog')?.dirtyTracking.pendingDeleteIds.size).toBe(0)
    expect(cancelled.http.saveRequests).toHaveLength(0)

    let release: ((value: boolean) => void) | undefined
    let started: (() => void) | undefined
    const confirmationStarted = new Promise<void>(resolve => { started = resolve })
    const stale = await createCatalogScriptFixture({
      showConfirm: async () => { started?.(); return new Promise(resolve => { release = resolve }) },
    }, http => { http.allowDelete = true; http.includeSecondDataset = true })
    const view = stale.dataSet.getView('Base_DataSet', 'catalog')
    const action = renderCatalogActionButtons(stale.functions).find(item => item['children'] === '删除数据空间')
    const onClick = catalogActionHandler(action)
    if (!onClick || !view?.rows[1]) throw new Error('delete target fixture is incomplete')
    const deleting = onClick()
    await confirmationStarted
    view.setCurrentRow(view.rows[1])
    release?.(true)
    await deleting
    expect(view.currentRow).toMatchObject({ rowid: 'DATASET-2' })
    expect(view.rows).toHaveLength(2)
    expect(view.dirtyTracking.pendingDeleteIds.size).toBe(0)
    expect(stale.http.saveRequests).toHaveLength(0)
  })

  it('blocks query re-entry during confirmation and stops if the page context becomes stale', async () => {
    let release: ((value: boolean) => void) | undefined
    let started: (() => void) | undefined
    const confirmationStarted = new Promise<void>(resolve => { started = resolve })
    const fixture = await createCatalogScriptFixture({
      showConfirm: async () => { started?.(); return new Promise(resolve => { release = resolve }) },
    }, http => { http.allowDelete = true })
    const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '删除数据空间')
    const onClick = catalogActionHandler(action)
    if (!onClick) throw new Error('authorized delete action was not rendered')
    const deleting = onClick()
    await confirmationStarted
    const requestCount = fixture.http.requests.length
    await fixture.functions['applyCatalogFilter']?.()
    await fixture.functions['changeCatalogPage']?.(2)
    expect(fixture.http.requests).toHaveLength(requestCount)
    release?.(false)
    await deleting
    expect(fixture.http.saveRequests).toHaveLength(0)

    let releaseStale: ((value: boolean) => void) | undefined
    let startedStale: (() => void) | undefined
    const staleConfirmationStarted = new Promise<void>(resolve => { startedStale = resolve })
    const stale = await createCatalogScriptFixture({
      showConfirm: async () => { startedStale?.(); return new Promise(resolve => { releaseStale = resolve }) },
    }, http => { http.allowDelete = true })
    const staleAction = renderCatalogActionButtons(stale.functions).find(item => item['children'] === '删除数据空间')
    const staleClick = catalogActionHandler(staleAction)
    if (!staleClick) throw new Error('authorized delete action was not rendered')
    const staleDelete = staleClick()
    await staleConfirmationStarted
    stale.invalidatePage()
    releaseStale?.(true)
    await staleDelete
    expect(stale.dataSet.getView('Base_DataSet', 'catalog')?.rows).toHaveLength(1)
    expect(stale.http.saveRequests).toHaveLength(0)
  })

  it('rejects the confirmed target after an external DataView query replaces its row', async () => {
    for (const replace of ['executeFilter', 'refresh'] as const) {
      let release: ((value: boolean) => void) | undefined
      let started: (() => void) | undefined
      const confirmationStarted = new Promise<void>(resolve => { started = resolve })
      const fixture = await createCatalogScriptFixture({
        showConfirm: async () => { started?.(); return new Promise(resolve => { release = resolve }) },
      }, http => { http.allowDelete = true })
      const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
      const original = view?.currentRow
      const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '删除数据空间')
      const onClick = catalogActionHandler(action)
      if (!onClick || !view || !original) throw new Error('delete target fixture is incomplete')
      const deleting = onClick()
      await confirmationStarted
      if (replace === 'executeFilter') await view.executeFilter(undefined)
      else await view.refresh()
      expect(view.currentRow).not.toBe(original)
      release?.(true)
      await deleting
      expect(view.rows).toMatchObject([{ rowid: 'DATASET-1' }])
      expect(view.dirtyTracking.pendingDeleteIds.size).toBe(0)
      expect(fixture.http.saveRequests).toHaveLength(0)
    }
  })

  it('keeps an unknown delete locked with a safe persistent message and does not resend', async () => {
    const messages: string[] = []
    const fixture = await createCatalogScriptFixture({
      showConfirm: async message => { expect(message).not.toContain('试点目录'); return true },
      showPrompt: async () => '更名',
      selectEntities: async () => [{ value: 'APP-1', label: '试点应用' }],
      showMessage: message => { messages.push(message) },
    }, http => { http.allowDelete = true; http.editableFields = ['Name']; http.hiddenFields = ['rowid']; http.includeSecondDataset = true })
    fixture.http.failSave = true
    const deleteAction = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '删除数据空间')
    const deleteClick = catalogActionHandler(deleteAction)
    if (!deleteClick) throw new Error('authorized delete action was not rendered')
    await deleteClick()
    expect(fixture.http.saveRequests).toHaveLength(1)
    expect(fixture.http.deletedRows).toMatchObject([{ rowid: 'DATASET-1', lingma_sys_key: 'DS-ROW' }])
    const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
    if (!view?.rows[0]) throw new Error('second row is missing after staging the delete')
    view.setCurrentRow(view.rows[0])
    expect(view.currentRow).toMatchObject({ rowid: 'DATASET-2' })
    expect(view.dirtyTracking.pendingDeleteIds.has('DATASET-1')).toBe(true)
    expect(view.rows).toMatchObject([{ rowid: 'DATASET-2' }])
    expect(catalogPagingError(fixture.functions)).toContain('删除结果未知')
    expect(catalogPagingError(fixture.functions)).not.toContain('DATASET-1')
    expect(messages.join('\n')).toContain('删除结果未知')
    expect(messages.join('\n')).not.toContain('DATASET-1')
    const latestActions = renderCatalogActionButtons(fixture.functions)
    const addClick = catalogActionHandler(latestActions.find(item => item['children'] === '新增数据空间'))
    const editClick = catalogActionHandler(latestActions.find(item => item['children'] === '编辑数据空间'))
    const latestDeleteClick = catalogActionHandler(latestActions.find(item => item['children'] === '删除数据空间'))
    if (!addClick || !editClick || !latestDeleteClick) throw new Error('unknown delete must retain all toolbar handlers')
    await addClick()
    await editClick()
    await latestDeleteClick()
    expect(messages).toHaveLength(1)
    expect(fixture.http.saveRequests).toHaveLength(1)
    expect(view.dirtyTracking.pendingDeleteIds.has('DATASET-1')).toBe(true)
  })

  it('reports refresh failure separately after a confirmed deletion', async () => {
    const messages: string[] = []
    const fixture = await createCatalogScriptFixture({
      showConfirm: async () => true,
      showMessage: message => { messages.push(message) },
    }, http => { http.allowDelete = true })
    fixture.http.failQuery = true
    const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '删除数据空间')
    const onClick = catalogActionHandler(action)
    if (!onClick) throw new Error('authorized delete action was not rendered')
    await onClick()
    expect(fixture.http.saveRequests).toHaveLength(1)
    expect(fixture.http.deletedRows).toMatchObject([{ rowid: 'DATASET-1' }])
    expect(fixture.dataSet.getView('Base_DataSet', 'catalog')?.dirtyTracking.pendingDeleteIds.size).toBe(0)
    expect(catalogPagingError(fixture.functions)).toBe('数据空间已删除，刷新失败')
    expect(messages.join('\n')).toContain('数据空间已删除，刷新失败')
    expect(messages.join('\n')).not.toContain('删除结果未知')
  })

  it('reports read-back inconsistency when a successful delete refresh still returns the target ID', async () => {
    const messages: string[] = []
    const fixture = await createCatalogScriptFixture({
      showConfirm: async () => true,
      showMessage: message => { messages.push(message) },
    }, http => { http.allowDelete = true; http.keepDeletedRowsOnQueries = true })
    const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
    if (!view) throw new Error('catalog view was not assembled')
    const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '删除数据空间')
    const onClick = catalogActionHandler(action)
    if (!onClick) throw new Error('authorized delete action was not rendered')
    await onClick()
    expect(fixture.http.saveRequests).toHaveLength(1)
    expect(fixture.http.deletedRows).toMatchObject([{ rowid: 'DATASET-1' }])
    expect(view.dirtyTracking.pendingDeleteIds.size).toBe(0)
    expect(view.rows).toMatchObject([{ rowid: 'DATASET-1' }])
    expect(catalogPagingError(fixture.functions)).toContain('删除回执已确认，但刷新仍含原记录')
    expect(messages.join('\n')).toContain('删除回执已确认，但刷新仍含原记录')
    expect(messages.join('\n')).not.toContain('数据空间已删除')
  })

  it('uses query PageParam and Count to delete the last row of a later page and returns one page', async () => {
    const fixture = await createCatalogScriptFixture({ showConfirm: async () => true }, http => {
      http.allowDelete = true
      http.datasetCount = 11
    })
    const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
    if (!view) throw new Error('catalog view was not assembled')
    expect(view.total).toBe(11)
    expect(view.rows).toHaveLength(10)
    await view.setPage(2)
    expect(view.page).toBe(2)
    expect(view.rows).toMatchObject([{ rowid: 'DATASET-11' }])
    const before = fixture.http.requests.filter(request => {
      const payload = recordAt(request.data, 'query payload')
      const tables = Array.isArray(payload['Table']) ? payload['Table'] : []
      return recordValue(tables[0], 'Name') === 'Base_DataSet'
    }).at(-1)
    const beforePayload = recordAt(before?.data, 'last query payload')
    expect(beforePayload['PageParam']).toMatchObject({ index: 2, size: 10 })

    const action = renderCatalogActionButtons(fixture.functions).find(item => item['children'] === '删除数据空间')
    const onClick = catalogActionHandler(action)
    if (!onClick) throw new Error('authorized delete action was not rendered')
    await onClick()
    expect(fixture.http.deletedRows).toMatchObject([{ rowid: 'DATASET-11' }])
    expect(view.page).toBe(1)
    expect(view.total).toBe(10)
    expect(view.rows).toHaveLength(10)
    const after = fixture.http.requests.filter(request => {
      const payload = recordAt(request.data, 'query payload')
      const tables = Array.isArray(payload['Table']) ? payload['Table'] : []
      return recordValue(tables[0], 'Name') === 'Base_DataSet'
    }).at(-1)
    const afterPayload = recordAt(after?.data, 'last refreshed payload')
    expect(afterPayload['PageParam']).toMatchObject({ index: 1, size: 10 })
    expect(view.rows.some(row => row['rowid'] === 'DATASET-11')).toBe(false)
  })

  it('renders an edit action only for rows authorized by the query result', async () => {
    let deniedPrompts = 0
    const denied = await createCatalogScriptFixture({
      showPrompt: async () => { deniedPrompts += 1; return null },
    })
    expect(renderCatalogActionButtons(denied.functions).some(action => action['children'] === '编辑数据空间')).toBe(false)
    const deniedView = denied.dataSet.getView('Base_DataSet', 'catalog')
    const directEdit = denied.functions['editCatalogEntry']
    if (typeof directEdit !== 'function' || !deniedView?.currentRow) throw new Error('denied fixture has no current row')
    await directEdit(deniedView, deniedView.currentRow)
    expect(deniedPrompts).toBe(0)
    expect(denied.http.saveRequests).toHaveLength(0)

    const allowed = await createCatalogScriptFixture({}, http => {
      http.editableFields = ['Name', 'description']
    })
    const actions = renderCatalogActionButtons(allowed.functions)
    expect(actions).toMatchObject(expect.arrayContaining([
      expect.objectContaining({ children: '编辑数据空间' }),
    ]))
  })

  it('stages and saves only changed editable business fields for the selected row', async () => {
    const prompts = ['更新后的目录', '更新后的描述']
    const fixture = await createCatalogScriptFixture({
      showPrompt: async () => prompts.shift() ?? null,
    }, http => { http.editableFields = ['Name', 'description'] })
    const editButton = renderCatalogActionButtons(fixture.functions)
      .find(action => action['children'] === '编辑数据空间')
    const onClick = catalogActionHandler(editButton)
    if (!onClick) throw new Error('edit action has no handler')
    await onClick()

    expect(fixture.http.saveRequests).toHaveLength(1)
    expect(fixture.http.changedRows).toMatchObject([{ rowid: 'DATASET-1', Name: '更新后的目录',
      description: '更新后的描述' }])
    expect(fixture.http.changedRows[0]).not.toHaveProperty('Type')
    expect(fixture.http.changedRows[0]).not.toHaveProperty('sysid')
    expect(fixture.dataSet.getView('Base_DataSet', 'catalog')?.rows).toMatchObject([
      { rowid: 'DATASET-1', Name: '更新后的目录', description: '更新后的描述' },
    ])
  })

  it('keeps unread writable values out of prompt defaults and honors field write permission independently', async () => {
    const prompts: unknown[][] = []
    const fixture = await createCatalogScriptFixture({
      showPrompt: async (...args) => { prompts.push(args); return '仅提交名称' },
    }, http => { http.editableFields = ['Name']; http.hiddenFields = ['Name'] })
    const button = renderCatalogActionButtons(fixture.functions).find(action => action['children'] === '编辑数据空间')
    const onClick = catalogActionHandler(button)
    if (!onClick) throw new Error('authorized edit action was not rendered')
    await onClick()

    expect(prompts).toHaveLength(1)
    expect(prompts[0]?.[2]).toMatchObject({ placeholder: '名称' })
    expect(prompts[0]?.[2]).not.toHaveProperty('defaultValue')
    expect(fixture.http.changedRows).toMatchObject([{ rowid: 'DATASET-1', Name: '仅提交名称' }])
    expect(fixture.http.changedRows[0]).not.toHaveProperty('description')
  })

  it('submits an explicit empty value for an unread writable description whose original value is null', async () => {
    const prompts: unknown[][] = []
    const fixture = await createCatalogScriptFixture({
      showPrompt: async (...args) => { prompts.push(args); return '' },
    }, http => { http.editableFields = ['description']; http.hiddenFields = ['description']; http.nullDescription = true })
    const button = renderCatalogActionButtons(fixture.functions).find(action => action['children'] === '编辑数据空间')
    const onClick = catalogActionHandler(button)
    if (!onClick) throw new Error('authorized edit action was not rendered')
    await onClick()

    expect(prompts).toHaveLength(1)
    expect(prompts[0]?.[2]).not.toHaveProperty('defaultValue')
    expect(fixture.http.changedRows).toMatchObject([{ rowid: 'DATASET-1', description: '' }])
  })

  it('rejects an empty value when the backend marks a writable description as required', async () => {
    const fixture = await createCatalogScriptFixture({ showPrompt: async () => '' }, http => {
      http.editableFields = ['description']
      http.requiredFields = ['description']
    })
    const button = renderCatalogActionButtons(fixture.functions).find(action => action['children'] === '编辑数据空间')
    const onClick = catalogActionHandler(button)
    if (!onClick) throw new Error('authorized edit action was not rendered')
    await onClick()
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('does not write when the edit prompt is cancelled or all submitted values are unchanged', async () => {
    const cancelled = await createCatalogScriptFixture({ showPrompt: async () => null }, http => {
      http.editableFields = ['Name', 'description']
    })
    const cancelButton = renderCatalogActionButtons(cancelled.functions).find(action => action['children'] === '编辑数据空间')
    const cancelClick = catalogActionHandler(cancelButton)
    if (!cancelClick) throw new Error('authorized edit action was not rendered')
    await cancelClick()
    expect(cancelled.http.saveRequests).toHaveLength(0)

    const unchanged = await createCatalogScriptFixture({
      showPrompt: async message => message.includes('名称') ? ' 试点目录 ' : ' 目录 ',
    }, http => { http.editableFields = ['Name', 'description'] })
    const unchangedButton = renderCatalogActionButtons(unchanged.functions).find(action => action['children'] === '编辑数据空间')
    const unchangedClick = catalogActionHandler(unchangedButton)
    if (!unchangedClick) throw new Error('authorized edit action was not rendered')
    await unchangedClick()
    expect(unchanged.http.saveRequests).toHaveLength(0)
  })

  it('rejects stale rows after a query and blocks query re-entry while an edit is pending', async () => {
    let release: ((value: string | null) => void) | undefined
    let started: (() => void) | undefined
    const promptStarted = new Promise<void>(resolve => { started = resolve })
    const fixture = await createCatalogScriptFixture({
      showPrompt: async () => { started?.(); return new Promise(resolve => { release = resolve }) },
    }, http => { http.editableFields = ['Name', 'description'] })
    const button = renderCatalogActionButtons(fixture.functions).find(action => action['children'] === '编辑数据空间')
    const onClick = catalogActionHandler(button)
    if (!onClick) throw new Error('authorized edit action was not rendered')
    const edit = onClick()
    await promptStarted
    const requestsBeforeBlockedQuery = fixture.http.requests.length
    await fixture.functions['applyCatalogFilter']?.()
    expect(fixture.http.requests).toHaveLength(requestsBeforeBlockedQuery)
    await fixture.dataSet.getView('Base_DataSet', 'catalog')?.executeFilter(undefined)
    release?.('新名称')
    await edit
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('rejects the captured row when the current row changes during a prompt', async () => {
    let release: ((value: string | null) => void) | undefined
    let started: (() => void) | undefined
    const promptStarted = new Promise<void>(resolve => { started = resolve })
    const fixture = await createCatalogScriptFixture({
      showPrompt: async () => { started?.(); return new Promise(resolve => { release = resolve }) },
    }, http => { http.editableFields = ['Name', 'description']; http.includeSecondDataset = true })
    const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
    const button = renderCatalogActionButtons(fixture.functions).find(action => action['children'] === '编辑数据空间')
    const onClick = catalogActionHandler(button)
    if (!onClick || !view?.rows[1]) throw new Error('current-row edit fixture is incomplete')
    const edit = onClick()
    await promptStarted
    view.setCurrentRow(view.rows[1])
    release?.('切换期间输入')
    await edit
    expect(view.currentRow).toMatchObject({ rowid: 'DATASET-2' })
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('stops an edit when buildPageContext invalidates the script during a prompt', async () => {
    let release: ((value: string | null) => void) | undefined
    let started: (() => void) | undefined
    const promptStarted = new Promise<void>(resolve => { started = resolve })
    const fixture = await createCatalogScriptFixture({
      showPrompt: async () => { started?.(); return new Promise(resolve => { release = resolve }) },
    }, http => { http.editableFields = ['Name', 'description'] })
    const button = renderCatalogActionButtons(fixture.functions).find(action => action['children'] === '编辑数据空间')
    const onClick = catalogActionHandler(button)
    if (!onClick) throw new Error('authorized edit action was not rendered')
    const edit = onClick()
    await promptStarted
    fixture.invalidatePage()
    release?.('页面失效后输入')
    await edit
    expect(fixture.http.saveRequests).toHaveLength(0)
  })

  it('does not resend an edit when the save outcome is unknown', async () => {
    const promptValues = ['未知结果新名', '未知结果新描述']
    const messages: string[] = []
    const fixture = await createCatalogScriptFixture({
      showPrompt: async () => promptValues.shift() ?? null,
      showMessage: message => { messages.push(message) },
    }, http => { http.editableFields = ['Name']; http.hiddenFields = ['rowid'] })
    const button = renderCatalogActionButtons(fixture.functions).find(action => action['children'] === '编辑数据空间')
    const onClick = catalogActionHandler(button)
    if (!onClick) throw new Error('authorized edit action was not rendered')
    fixture.http.failSave = true
    await onClick()
    expect(messages.join('\n')).not.toContain('DATASET-1')
    const latestButtons = renderCatalogActionButtons(fixture.functions)
    const latestEdit = latestButtons.find(action => action['children'] === '编辑数据空间')
    const latestAdd = latestButtons.find(action => action['children'] === '新增数据空间')
    const latestEditClick = catalogActionHandler(latestEdit)
    const latestAddClick = catalogActionHandler(latestAdd)
    if (!latestEditClick || !latestAddClick) throw new Error('latest toolbar actions were not rendered')
    await latestEditClick()
    await latestAddClick()
    expect(fixture.http.saveRequests).toHaveLength(1)
  })

  it('keeps the active filter and reports success when the edited row leaves the refreshed result', async () => {
    const messages: string[] = []
    const fixture = await createCatalogScriptFixture({
      showPrompt: async message => message.includes('名称') ? '已移出筛选结果' : '目录',
      showMessage: message => { messages.push(message) },
    }, http => { http.editableFields = ['Name']; http.omitChangedRowsFromQueries = true })
    const view = fixture.dataSet.getView('Base_DataSet', 'catalog')
    if (!view) throw new Error('catalog view was not assembled')
    await view.executeFilter({ field: 'Name', operator: 'eq', value: '试点目录' })
    const beforeRequest = fixture.http.requests.at(-1)
    const beforePayload = isRecord(beforeRequest?.data) ? beforeRequest.data : {}
    const beforeTables = Array.isArray(beforePayload['Table']) ? beforePayload['Table'] : []
    const beforeTable = isRecord(beforeTables[0]) ? beforeTables[0] : {}
    const beforeFilter = beforeTable['Filter']

    const button = renderCatalogActionButtons(fixture.functions).find(action => action['children'] === '编辑数据空间')
    const onClick = catalogActionHandler(button)
    if (!onClick) throw new Error('authorized edit action was not rendered')
    await onClick()

    const afterRequest = fixture.http.requests.at(-1)
    const afterPayload = isRecord(afterRequest?.data) ? afterRequest.data : {}
    const afterTables = Array.isArray(afterPayload['Table']) ? afterPayload['Table'] : []
    const afterTable = isRecord(afterTables[0]) ? afterTables[0] : {}
    expect(afterTable['Filter']).toEqual(beforeFilter)
    expect(view.rows).toHaveLength(0)
    expect(fixture.http.saveRequests).toHaveLength(1)
    expect(messages.join('\n')).toContain('数据空间已保存')
    expect(messages.join('\n')).toContain('当前记录已不在列表中')
    expect(messages.join('\n')).not.toContain('刷新失败')
  })
})
