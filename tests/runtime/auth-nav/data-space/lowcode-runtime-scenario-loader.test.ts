import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {readFileSync} from 'node:fs'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter} from 'vue-router'
import {PageRuntimePool} from '../../../../packages/spark-app/src/router/page-runtime-pool'
import {createPageToolPublicationManifest} from '@/services/project/page-tool-publication'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import { DATA_SPACE_DESIGN_FORM_KEY, LowcodeApiError } from '@/platform-adapters/api'
import { DataSet, DataViewFilter } from '@spark-appworks/spark-data'
import { PageRuntime, PageTool, ScenarioViewConfig, ProjectToolResource, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {getSystemScenarioResource} from '@/registries/system-scenario-registry'
import {cacheScenarioModels} from './cache/cache-scenario.fixture'
import agentWorkflowConfig from '../../../../config/pages/shared/agent-workflow-files/pagedata.json'

const mocks = vi.hoisted(() => ({
  readRequestScope: vi.fn(),
  verifyNativeApplicationPlan: vi.fn(),
  readCatalogScope: vi.fn(),
  readText: vi.fn(),
  readSpaceDefinition: vi.fn(),
  readModelBatch: vi.fn(),
  readRelations: vi.fn(),
  listFiles: vi.fn(),
  readTextFile: vi.fn(),
  request: vi.fn(),
  prepareRequest: vi.fn(),
}))

vi.mock('@/platform-adapters/lowcode-runtime', async () => {
  const {DataSpaceRuntimeApi} = await import('@spark-appworks/spark-data')
  const {HttpClientBase} = await import('@spark-appworks/spark-utils')
  class NoRequest extends HttpClientBase {
    protected override async executeRequest() {
      const response = await mocks.request()
      if (response) return response
      throw new Error('unexpected business request')
    }
  }
  const http = new NoRequest()
  http.interceptors.request.use({async onRequest(config) {await mocks.prepareRequest(); return config}})
  return {
  createPageToolFilesIo: () => ({list: async () => [], read: async () => null,
    upload: async () => {throw new Error('unexpected ProjectToolFile upload')},
    remove: async () => {throw new Error('unexpected ProjectToolFile remove')},
    restoreWorkingFile: async () => {throw new Error('unexpected ProjectToolFile restore')},
    listVersions: async () => [], uploadVersion: async () => {throw new Error('unexpected ProjectToolFile version upload')},
    readVersion: async () => null}),
  lowcodeApi: {
    readRequestScope: mocks.readRequestScope,
    dataSpace: { design: { readSpaceDefinition: mocks.readSpaceDefinition,
      readModelBatch: mocks.readModelBatch, readRelations: mocks.readRelations },
      runtime: new DataSpaceRuntimeApi({http, readScope: mocks.readRequestScope}) },
    design: {listFiles: mocks.listFiles, readTextFile: mocks.readTextFile},
  },
  verifyLowcodeNativeApplicationPlan: mocks.verifyNativeApplicationPlan,
  lowcodeHttp: http,
  readLowcodeCatalogRuntimeRequestScope: mocks.readCatalogScope,
  lowcodeDesignFileUpload: vi.fn(),
  createLowcodeProjectGateways: () => ({ scenarioViews: { readText: mocks.readText } }),
  readLowcodeRuntimeDatasetPlan: async () => {throw Error('published Plan must not use the legacy file reader')},
  }
})

import {resolve} from 'node:path'
import { assembleLowcodeRuntimeScenario, loadLowcodeRuntimeScenario, loadScenarioDataSet, readLowcodeExecutionProject } from '@/platform-adapters/data-space/lowcode-data-space-runtime'
import {readRuntimeDataSetPlan,RUNTIME_DATA_SET_PLAN_FILE_TABLE} from '@/platform-adapters/data-space/runtime-data-set-plan-file'

const scope = (token: string, appId: string) => ({ token, headers: { 'X-AppId': appId } })

describe('Runtime Dataset Plan FileResource read',()=>{
  it('reads the plan through its scoped SPARK Data file view',async()=>{
    mocks.readRequestScope.mockReturnValue(scope('plan-read','APP'))
    mocks.readTextFile.mockResolvedValue('{"kind":"spark.runtimeDataSetPlan","scenarioId":"PLAN"}')
    const dataSet=DataSet.fromJson({scenarioId:'CATALOG',tables:{}})
    try{
      await expect(readRuntimeDataSetPlan({dataSet,scenarioId:'PLAN',assertCurrent:()=>{}}))
        .resolves.toBe('{"kind":"spark.runtimeDataSetPlan","scenarioId":"PLAN"}')
      expect(dataSet.getTable(RUNTIME_DATA_SET_PLAN_FILE_TABLE)?.resourceType).toBe('file')
      expect(mocks.readTextFile).toHaveBeenCalledWith(expect.objectContaining({fileName:'PLAN.dataset.json'}))
      expect(dataSet.getTable(RUNTIME_DATA_SET_PLAN_FILE_TABLE)?.viewList.some(view=>view.viewId.startsWith('dataset-read-'))).toBe(false)
      const firstNode=readRuntimeDataSetPlan({dataSet,scenarioId:'PLAN',assertCurrent:()=>{}})
      const secondNode=readRuntimeDataSetPlan({dataSet,scenarioId:'PLAN',assertCurrent:()=>{}})
      await expect(Promise.all([firstNode,secondNode])).resolves.toEqual([
        '{"kind":"spark.runtimeDataSetPlan","scenarioId":"PLAN"}',
        '{"kind":"spark.runtimeDataSetPlan","scenarioId":"PLAN"}',
      ])
      expect(dataSet.getTable(RUNTIME_DATA_SET_PLAN_FILE_TABLE)?.viewList.map(view=>view.viewId)).toEqual(['default'])
      mocks.readTextFile.mockRejectedValueOnce(new Error('plan read failed'))
      await expect(readRuntimeDataSetPlan({dataSet,scenarioId:'PLAN',assertCurrent:()=>{}})).rejects.toThrow('plan read failed')
      expect(dataSet.getTable(RUNTIME_DATA_SET_PLAN_FILE_TABLE)?.viewList.map(view=>view.viewId)).toEqual(['default'])
      let release:((value:string)=>void)|undefined,ownerNode='node-c'
      mocks.readTextFile.mockImplementationOnce(()=>new Promise<string>(resolve=>{release=resolve}))
      const stale=readRuntimeDataSetPlan({dataSet,scenarioId:'PLAN',
        assertCurrent:()=>{if(ownerNode!=='node-c')throw new Error('node publication stale')}})
      await vi.waitFor(()=>expect(release).toBeDefined())
      ownerNode='node-d'
      const current=readRuntimeDataSetPlan({dataSet,scenarioId:'PLAN',
        assertCurrent:()=>{if(ownerNode!=='node-d')throw new Error('other publication stale')}})
      release?.('{"kind":"spark.runtimeDataSetPlan","scenarioId":"PLAN"}')
      const settled=await Promise.allSettled([stale,current])
      expect(settled[0]).toMatchObject({status:'rejected',reason:expect.objectContaining({message:'node publication stale'})})
      expect(settled[1]).toEqual({status:'fulfilled',value:'{"kind":"spark.runtimeDataSetPlan","scenarioId":"PLAN"}'})
      expect(dataSet.getTable(RUNTIME_DATA_SET_PLAN_FILE_TABLE)?.viewList.map(view=>view.viewId)).toEqual(['default'])
    }finally{dataSet.destroy()}
  })
})

function relationFixture(field = 'missing', childModelId = 'CHILD') {
  const models = ['PARENT', 'CHILD'].map(id => ({id, name: id, metaName: id, sourceName: `physical_${id}`,
    sourceId: 'DB', sourceType: 'table', primaryKey: 'id', businessMain: false, raw: {},
    fields: [{id: `${id}-key`, modelId: id, name: 'rowid', canonicalName: 'id', type: 'string', primaryKey: true,
      description: '', output: true, computed: false, order: 0, orderType: '', raw: {}}]}))
  const text = JSON.stringify({scenarioId: 'SCENE', tables: Object.fromEntries(models.map(model => [model.id, {
    modelBinding: {modelId: model.id, modelName: model.name}, views: {default: {}},
  }]))})
  const relation = {sourceRelationId: 'REL-BROKEN', parentModelId: 'PARENT', childModelId,
    parentResourceName: 'PARENT', childResourceName: 'CHILD', cascadeDelete: false,
    filterExpression: DataViewFilter.condition({field, operator: 'eq', value: {Type: 'GetTableField', Field: 'rowid'}})}
  mocks.readRequestScope.mockReturnValue(scope('t1', 'APP'))
  mocks.readText.mockResolvedValue(text)
  mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId: 'SCENE', name: '正式空间'})
  mocks.readModelBatch.mockImplementation(async ({metaNames}: {metaNames: string[]}) => models.filter(model => metaNames.includes(model.metaName)))
  mocks.readRelations.mockResolvedValue([relation])
  return {text, relation, models}
}

describe('loadLowcodeRuntimeScenario', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => {
    mocks.readCatalogScope.mockReset()
    vi.restoreAllMocks()
  })

  it.each(['response', 'dispatch', 'restored navigation', 'append validation'] as const)(
    'blocks formal reads after the retained publication loses its navigation binding during %s', async checkpoint => {
    const {text, models} = relationFixture('rowid')
    for (const model of models) {
      model.primaryKey = 'rowid'
      model.fields[0]!.canonicalName = 'rowid'
    }
    mocks.readRelations.mockResolvedValue([])
    const response = (rowid: string) => ({status: 200, statusText: 'OK', headers: {},
      data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: false, lingma_sys_key: 'table',
        data: {Items: [{rowid, lingma_sys_key: 'row', lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}}], Count: 1}}}})
    let releaseResponse = () => {}
    const delayed = new Promise<void>(resolve => { releaseResponse = resolve })
    mocks.request.mockResolvedValueOnce(response('baseline'))
    if (checkpoint === 'append validation') {
      mocks.request.mockResolvedValueOnce(response('late'))
    } else if (checkpoint !== 'dispatch') {
      mocks.request.mockImplementationOnce(async () => {await delayed; return response('late')})
    }
    const page = defineComponent({render: () => h('div')})
    const tool = {projectId: 'APP', pageId: 'TOOL'}
    const path = '/apps/APP/__page/NODE'
    const router = createRouter({history: createMemoryHistory(), routes: [
      {path, component: page, meta: {type: 'config-page', nodeId: 'NODE', tool, blueprintScenarioId: 'SCENE'}},
      {path: '/apps/APP/other', component: page},
    ]})
    await router.push({path, query: {scenarioId: 'SCENE'}})
    const route = router.currentRoute.value
    const files = [{fileName: 'rule.json', version: 1, text: '[]'}, {fileName: 'script.js', version: 1, text: ''},
      {fileName: 'style.css', version: 1, text: ''}] as const
    const manifest = await createPageToolPublicationManifest({pageId: 'TOOL', files,
      pagedata: [{scenarioId: 'SCENE', version: 1, sourceRevision: 'scene-v1', text}]})
    let allowed = true
    const pool = new PageRuntimePool({pageComponent: page, readPageFile: undefined,
      resolvePageNavigationReceipt: async () => ({state: 'READY', files, assertCurrent() {},
        publication: {manifest, publicationRef: 'r=1;s=1;t=1;m=1', assertCurrent() {}}}),
      readCurrentRoute: () => router.currentRoute.value,
      readNavTree: () => ({title: 'App', childPlacement: 'header',
        items: allowed ? [{id: 'NODE', title: 'Tool', path, tool, blueprintScenarioId: 'SCENE'}] : []}),
      refreshRoutes: async () => undefined, loadScenario: loadLowcodeRuntimeScenario,
    })
    const runtime = pool.getPageRuntime(route)!
    try {
      await runtime.load()
      const view = runtime.getDataSet('SCENE')!.getView('PARENT')!
      await view.refresh()
      expect(view.rows[0]?.['rowid']).toBe('baseline')
      await router.push('/apps/APP/other')
      let preparing = false
      if (checkpoint === 'dispatch') mocks.prepareRequest.mockImplementationOnce(async () => {
        preparing = true
        await delayed
      })
      if (checkpoint === 'append validation') view.validateQueryResult = async () => {
        preparing = true
        await delayed
      }
      const pending = checkpoint === 'append validation'
        ? Promise.allSettled([view.appendQueryRows({filter: {field: 'rowid', operator: 'eq', value: 'late'}})])
        : view.refresh()
      const dispatched = checkpoint === 'dispatch' ? 1 : 2
      await vi.waitFor(() => {
        expect(mocks.request).toHaveBeenCalledTimes(dispatched)
        if (checkpoint === 'dispatch' || checkpoint === 'append validation') expect(preparing).toBe(true)
      })
      await router.push(route.fullPath)
      allowed = false
      if (checkpoint === 'restored navigation') {
        pool.acceptApplicationNavigation({projectId:'APP', title:'App', childPlacement:'header', items:[]})
        allowed = true
      } else expect(() => pool.getPageRuntime(route)).toThrow('PAGE_RUNTIME_STALE')
      releaseResponse()
      const result = await pending
      if (checkpoint === 'append validation') {
        expect(result).toMatchObject([{status:'rejected', reason: expect.objectContaining({message: expect.stringContaining('PAGE_RUNTIME_STALE')})}])
      }
      expect(view.rows[0]?.['rowid']).not.toBe('late')
      if (checkpoint !== 'append validation') expect(view.loadingError?.message).toContain('PAGE_RUNTIME_STALE')
      await view.refresh()
      expect(mocks.request).toHaveBeenCalledTimes(dispatched)
      expect(view.loadingError?.message).toContain('PAGE_RUNTIME_STALE')
      expect(view.destroyed).toBe(false)
      allowed = true
      expect(() => pool.getPageRuntime(route)).toThrow('PAGE_RUNTIME_STALE')
      await view.refresh()
      expect(mocks.request).toHaveBeenCalledTimes(dispatched)
    } finally {
      releaseResponse()
      pool.disposePageRuntimes()
      mocks.request.mockReset()
      mocks.prepareRequest.mockReset()
    }
  })

  it('reopens an independently proved Plan only after a current FileResource read', async () => {
    const scenarioId = 'PUBLISHED-PLAN'
    const sourceRevision = 'fnv1a:12345678'
    const text = JSON.stringify({
      schemaVersion: 1, kind: 'spark.runtimeDataSetPlan', scenarioId, name: scenarioId, description: '', type: '数据源',
      savedAt: '2026-11-23T00:00:00.000Z', contentHash: sourceRevision,
      source: {dataSetId: scenarioId, exportedFrom: 'data-space-design', graphFile: `${scenarioId}.json`},
      inputParams: [], models: [], modelFields: [], views: [], viewFields: [], relations: [], linkage: {edges: []},
    })
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    const command = {
      projectId: 'APP', scenarioId,
      source: {mode: 'published' as const, sourceRevision: 'manifest-proof', publicationRef: 'r=1;s=1;t=1;m=1', scenarioIds: [scenarioId]},
      dataset: {scenarioId, fileName: `${scenarioId}.dataset.json`, sha256, sourceRevision},
    }
    mocks.readRequestScope.mockReturnValue(scope('published-token', 'APP'))
    mocks.readTextFile.mockResolvedValue(text)
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId: scenarioId, name: scenarioId})
    mocks.readModelBatch.mockResolvedValue([])
    mocks.readRelations.mockResolvedValue([])
    const opened = await loadLowcodeRuntimeScenario(command)
    try {
      expect(opened.scenarioId).toBe(scenarioId)
      expect(mocks.readTextFile).toHaveBeenCalledExactlyOnceWith({
        appType: 'designfile', customPath: 'DataSet', fileName: command.dataset.fileName,
      })
      expect(mocks.readText).not.toHaveBeenCalled()
      mocks.readSpaceDefinition.mockClear()
      mocks.readTextFile.mockRejectedValueOnce(new LowcodeApiError(403, 'Plan read denied'))
      await expect(loadLowcodeRuntimeScenario(command)).rejects.toThrow('Plan read denied')
      mocks.readTextFile.mockRejectedValueOnce(new LowcodeApiError(404, 'Plan file missing'))
      await expect(loadLowcodeRuntimeScenario(command)).rejects.toThrow('DATASET_PLAN_FILE_MISSING')
      mocks.readTextFile.mockResolvedValueOnce(`${text} `)
      await expect(loadLowcodeRuntimeScenario(command)).rejects.toThrow('Dataset 文件 SHA 不匹配')
      await expect(loadLowcodeRuntimeScenario({...command, dataset: {...command.dataset, sourceRevision:'fnv1a:88776655'}}))
        .rejects.toThrow('Dataset contentHash 不匹配')
      mocks.readTextFile.mockImplementationOnce(async () => {
        mocks.readRequestScope.mockReturnValue(scope('replacement-token', 'APP'))
        return text
      })
      await expect(loadLowcodeRuntimeScenario(command)).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
      expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
      expect(mocks.readTextFile).toHaveBeenCalledTimes(6)
    } finally {opened.destroy()}
  })

  it('assembles published pagedata from the verified manifest snapshot without reading the working file', async () => {
    const scenarioId = 'PUBLISHED-SCENE'
    const text = JSON.stringify({scenarioId, tables: {}})
    mocks.readRequestScope.mockReturnValue(scope('published-token', 'APP-A'))
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId: scenarioId, name: 'Published'})
    mocks.readModelBatch.mockResolvedValue([])
    mocks.readRelations.mockResolvedValue([])
    const dataSet = await loadLowcodeRuntimeScenario({
      projectId: 'APP-A', scenarioId,
      source:{mode:'published',sourceRevision:'manifest-proof',publicationRef:'rule=1;script=1;style=1;manifest=2',
        scenarioIds:[scenarioId]},
      pagedata: {
        scenarioId, version: 4, fileName: '4__pagedata.json', sha256: 'already-proven',
        sourceRevision: 'source-proof', text,
      },
    })
    try {
      expect(dataSet.scenarioId).toBe(scenarioId)
      expect(mocks.readText).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it('rejects pagedata injected without a published source contract',async()=>{
    const scenarioId='BYPASS-SCENE'
    mocks.readRequestScope.mockReturnValue(scope('bypass-token','APP-A'))
    await expect(loadLowcodeRuntimeScenario({
      projectId:'APP-A',scenarioId,
      pagedata:{scenarioId,version:1,fileName:'1__pagedata.json',sha256:'proof',
        sourceRevision:'snapshot',text:JSON.stringify({scenarioId,tables:{}})},
    })).rejects.toThrow('PAGE_RUNTIME_SOURCE_CONFLICT')
    expect(mocks.readText).not.toHaveBeenCalled()
  })

  it('keeps Agent Workflow creation, publication and deletion command bindings in the assembled DataSet', async () => {
    const scenarioId = agentWorkflowConfig.scenarioId
    mocks.readRequestScope.mockReturnValue(scope('workflow-token', 'APP-A'))
    mocks.readText.mockResolvedValue(JSON.stringify(agentWorkflowConfig))
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId: scenarioId, name: 'Agent 工作流文件资源'})
    mocks.readModelBatch.mockResolvedValue([])
    mocks.readRelations.mockResolvedValue([])
    const dataSet = await loadLowcodeRuntimeScenario({projectId: 'APP-A', scenarioId})
    try {
      const creation = dataSet.getView('AgentWorkflowCreation')
      const publication = dataSet.getView('AgentWorkflowPublication')
      const deletion = dataSet.getView('AgentWorkflowDeletion')
      if (!creation || !publication || !deletion) throw new Error('Agent Workflow 命令视图缺失')
      expect((await creation.loadFromServer()).success).toBe(true)
      expect((await publication.loadFromServer()).success).toBe(true)
      expect((await deletion.loadFromServer()).success).toBe(true)
      const creationRow = await creation.addRow({title: ''})
      const publicationRow = await publication.addRow({workflowId: 'alpha', designContent: '{}', definitionContent: '{}'})
      const deletionRow = await deletion.addRow({workflowId: 'alpha'})
      expect(creation.getPkKey(creationRow)).toBeDefined()
      expect(publication.getPkKey(publicationRow)).toBeDefined()
      expect(deletion.getPkKey(deletionRow)).toBeDefined()
      creation.discardPendingChanges()
      publication.discardPendingChanges()
      deletion.discardPendingChanges()
      expect(mocks.request).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it('loads the registered cache scenario through original model bindings and the configured command factory', async () => {
    const scene=getSystemScenarioResource('cacheManagement'),app={id:'APP-A'}
    mocks.readRequestScope.mockReturnValue(scope('cache-token',app.id))
    mocks.readText.mockResolvedValue(readFileSync(scene.path,'utf8'))
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId:scene.scenarioId,name:'缓存管理'})
    mocks.readModelBatch.mockResolvedValue(cacheScenarioModels())
    const ds=await loadLowcodeRuntimeScenario({projectId:app.id,scenarioId:scene.scenarioId})
    try{
      expect(mocks.readModelBatch.mock.calls[0]?.[0]).toMatchObject({metaNames:expect.arrayContaining(['缓存过滤条件','获取缓存信息','根据键删除缓存中的值'])})
      expect(ds.getTable('CacheDeleteRequest')?.modelBinding).toBeUndefined()
      await ds.getView('CacheDeleteRequest')!.refresh()
      await expect(ds.getView('CacheDeleteDefinition')!.loadFromServer()).rejects.toThrow('SPARK_MODEL_COMMAND')
      expect(mocks.request).not.toHaveBeenCalled()
    }finally{ds.destroy()}
  })

  it('rejects an unregistered scenario in the catalog scope before reading any source', async () => {
    await expect(loadLowcodeRuntimeScenario({projectId: 'homepage', scenarioId: 'UNREGISTERED'}))
      .rejects.toThrow('CATALOG_SCENARIO_SOURCE_MISSING')
    expect(mocks.readText).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it.each(['preview', 'published pagedata', 'published Plan', 'other scenario'] as const)(
    'rejects directory source %s before entering the directory owner',
    async kind => {
      const {scenarioId} = getSystemScenarioResource('pdfInspectCatalog')
      const pagedata = {scenarioId, version: 4, fileName: '4__pagedata.json', sha256: 'proven', sourceRevision: 'snapshot',
        text: JSON.stringify({scenarioId, tables: {}})}
      const dataset = {scenarioId, fileName: `${scenarioId}.dataset.json`, sha256: 'proven', sourceRevision: 'snapshot'}
      const published = {mode: 'published' as const, publicationRef: 'r=1;s=1;t=1;m=1', sourceRevision: 'manifest', scenarioIds: [scenarioId]}
      const source = kind === 'preview'
        ? {mode: 'preview' as const, publicationRef: null, sourceRevision: 'preview:temporary', scenarioIds: [scenarioId]}
        : kind === 'other scenario'
          ? {mode: 'design' as const, publicationRef: null, sourceRevision: 'working', scenarioIds: ['OTHER']}
          : published
      mocks.readCatalogScope.mockImplementationOnce(() => {throw new Error('directory owner was entered')})
      await expect(loadLowcodeRuntimeScenario({projectId: 'homepage', scenarioId, source,
        ...(kind === 'published pagedata' ? {pagedata} : kind === 'published Plan' ? {dataset} : {}),
      })).rejects.toThrow(kind === 'other scenario' ? 'PAGE_RUNTIME_SOURCE_CONTRACT'
        : kind === 'preview' ? 'PAGE_PREVIEW_TEMPORARY_SOURCE' : 'CATALOG_SCENARIO_SOURCE_CONFLICT')
      expect(mocks.readCatalogScope).not.toHaveBeenCalled()
      expect(mocks.readText).not.toHaveBeenCalled()
      expect(mocks.readTextFile).not.toHaveBeenCalled()
      expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
    },
  )

  it('assembles the full shared 7AB scenario for a dynamic app',async()=>{
    const scene=getSystemScenarioResource('projectBlueprint')
    type OptionSource={tableName:string;valueField?:string;labelField?:string;fill?:Record<string,string>}
    const scenario=JSON.parse(readFileSync(scene.path,'utf8')) as {tables:Record<string,{modelBinding?:{modelId:string;modelName:string}
      columns?:Array<{name:string;computeExpression?:string;optionsView?:OptionSource}>
      views?:Record<string,{queryConfig?:{fields?:string[]};filterExpression?:unknown;sortExpression?:unknown}>}>
      viewCascades?:Array<{tableName:string;targetField?:string;parents?:Array<{tableName:string;field:string}>;optionsView?:OptionSource}>}
    const configuredModels=Object.values(scenario.tables).flatMap(table=>table.modelBinding?[table.modelBinding]:[])
    const baseFields=['rowid','SysId','prowid','FunOrderValue','name','FunName','funCode','NavigationUrl','NavigationImageWxz','MobileUrl',
      'NavigationType','ChildItemLocation','NavigationShowType','HorizontalAlignment','IsShowAtNav','IsShowChildItem','BeginGroup',
      'conid','conType','memo','htmlDesc','VersionId','DifficultyFactor','Manhour','Number','Sum','Total','personCharge','status']
    // 正式输出须覆盖 pagedata 视图投影、过滤/排序、非计算列规则、选项来源与级联引用的字段，否则装配按缺失字段拒绝。
    const referenced=new Map<string,Set<string>>()
    const add=(table:string,field:string|undefined)=>{if(field)(referenced.get(table)??referenced.set(table,new Set(baseFields)).get(table)!).add(field)}
    const addSource=(owner:string,source:OptionSource|undefined)=>{
      if(!source)return
      add(source.tableName,source.valueField);add(source.tableName,source.labelField)
      for(const [target,field] of Object.entries(source.fill??{})){add(owner,target);add(source.tableName,field)}
    }
    for(const [name,table] of Object.entries(scenario.tables)){
      for(const column of table.columns??[]){if(!column.computeExpression)add(name,column.name);addSource(name,column.optionsView)}
      for(const view of Object.values(table.views??{})){
        for(const field of view.queryConfig?.fields??[])add(name,field)
        for(const match of JSON.stringify([view.filterExpression??{},view.sortExpression??[]]).matchAll(/"field":"([^"]+)"/g))add(name,match[1])
      }
    }
    for(const cascade of scenario.viewCascades??[]){
      add(cascade.tableName,cascade.targetField);addSource(cascade.tableName,cascade.optionsView)
      for(const parent of cascade.parents??[])add(parent.tableName,parent.field)
    }
    const modelFields=new Map(Object.entries(scenario.tables).flatMap(([name,table])=>table.modelBinding
      ?[[table.modelBinding.modelName,[...referenced.get(name)??baseFields]] as const]:[]))
    mocks.readRequestScope.mockReturnValue(scope('dynamic-token','APP-A'))
    mocks.readText.mockResolvedValue(JSON.stringify(scenario))
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId:scene.scenarioId,name:'动态应用共享蓝图空间'})
    mocks.readRelations.mockResolvedValue([])
    mocks.readModelBatch.mockImplementation(async({metaNames}:{metaNames:string[]})=>metaNames.map(metaName=>{
      const binding=configuredModels.find(model=>model.modelName===metaName)
      if(!binding)throw new Error(`fixture model missing: ${metaName}`)
      return {id:binding.modelId,name:metaName,metaName,sourceName:`source_${metaName}`,sourceId:'DB',sourceType:'table',
        primaryKey:'rowid',businessMain:false,raw:{},fields:(modelFields.get(metaName)??baseFields).map((name,index)=>({id:`${binding.modelId}-${name}`,modelId:binding.modelId,
          name,canonicalName:name,type:'string',primaryKey:name==='rowid',description:'',output:true,computed:false,order:index,orderType:'',raw:{}}))}
    }))
    const dataSet=await loadLowcodeRuntimeScenario({projectId:'APP-A',scenarioId:scene.scenarioId})
    try{
      expect(dataSet.getTable('Base_NavigationInfo')?.modelBinding?.modelName).toBe('Base_NavigationInfo')
      const toolFile=dataSet.getView('ProjectToolFile','default')
      expect(toolFile?.dataTable?.resourceId).toBe('project:tool-file')
      expect(()=>toolFile?.bindQueryExecutor({executeQuery:async view=>({rows:[],total:0,assertIdentity:()=>undefined,
        rowKey:row=>row[view.primaryKey],fieldAccess:()=>({read:'invisible',write:'denied',component:'hidden',required:false,writeMode:'readonly'}),
        readFieldAccess:()=>'invisible',addActionState:()=>'disabled',editActionState:()=>'disabled',deleteActionState:()=>'disabled',
        createChildActionState:()=>'disabled',viewActionState:()=>'hidden'})},{resource:{resourceType:'file',resourceId:'project:tool-file'}}))
        .toThrow('DATA_VIEW_QUERY_IDENTITY')
      expect(mocks.readModelBatch).toHaveBeenCalledOnce()
      expect(mocks.request).not.toHaveBeenCalled()
    }finally{dataSet.destroy()}
  })

  it('scopes legacy preview model reads after reading real relationships, leaving unrelated bindings untouched', async () => {
    const {text} = relationFixture('rowid')
    const input = JSON.parse(text)
    input.tables.Unavailable = {modelBinding: {modelId: 'MISSING', modelName: 'MissingModel'}, views: {default: {}}}
    const config = new ScenarioViewConfig('SCENE', JSON.stringify(input))
    const result = await loadScenarioDataSet({scenarioId: 'SCENE', config, modelScope: 'PARENT'})
    try {
      expect(mocks.readRelations).toHaveBeenCalledOnce()
      expect(mocks.readModelBatch).toHaveBeenCalledExactlyOnceWith({designScenarioId: DATA_SPACE_DESIGN_FORM_KEY,
        dataSpaceId: 'SCENE', metaNames: ['PARENT', 'CHILD']}, undefined)
      expect(result.dataSet.getTable('Unavailable')).toBeUndefined()
      expect(result.dataSet.resourceRelations).toHaveLength(1)
      expect(result.diagnostics).toEqual([])
      expect(config.toJSON()).toEqual(input)
      expect(mocks.request).not.toHaveBeenCalled()
    } finally {result.dataSet.destroy()}
  })

  it.each([
    {Type: 'GetTableField', Field: 'TAX.rowid'},
    {Type: 'GetRefData', RefTableName: 'TAX', RefFieldName: 'rowid', FkFieldName: 'rowid'},
    {Type: 'GetGroupData', GroupTableName: 'TAX', GroupField: 'rowid', Field: 'rowid', Fun: 'count'},
    {Type: 'GetExpData', refTableName: 'TAX', Exp: '1'},
  ])('includes the third formal model referenced by $Type before translating fields', async value => {
    const {text, relation, models} = relationFixture('rowid')
    const template = models[0]!
    models.push({...template, id: 'TAX', name: 'TAX', metaName: 'TAX', sourceName: 'physical_tax',
      fields: template.fields.map(field => ({...field, id: 'TAX-key', modelId: 'TAX'}))})
    const input = JSON.parse(text)
    input.tables.TaxAlias = {modelBinding: {modelId: 'TAX', modelName: 'TAX'}, views: {default: {}}}
    input.tables.Unavailable = {modelBinding: {modelId: 'MISSING', modelName: 'Missing'}, views: {default: {}}}
    relation.filterExpression = DataViewFilter.condition({field: 'rowid', operator: 'eq', value})
    const result = await loadScenarioDataSet({scenarioId: 'SCENE', config: new ScenarioViewConfig('SCENE', JSON.stringify(input)), modelScope: 'PARENT'})
    try {
      expect(mocks.readModelBatch.mock.calls[0]?.[0].metaNames).toEqual(['PARENT', 'CHILD', 'TAX'])
      expect(result.dataSet.getTable('TaxAlias')).toBeDefined()
      expect(result.dataSet.getTable('Unavailable')).toBeUndefined()
      expect(result.diagnostics).toEqual([])
      expect(JSON.stringify(result.dataSet.resourceRelations)).toContain('TaxAlias')
      expect(relation.filterExpression.toJSON()).toEqual({field: 'rowid', operator: 'eq', value})
    } finally {result.dataSet.destroy()}
  })

  it('stops scoped model reads if the calling scope changes while legacy relationships load', async () => {
    const {text} = relationFixture('rowid')
    let current = true
    mocks.readRelations.mockImplementationOnce(async () => {current = false; return []})
    await expect(loadScenarioDataSet({scenarioId: 'SCENE', config: new ScenarioViewConfig('SCENE', text), modelScope: 'PARENT',
      assertCurrent: () => {if (!current) throw new Error('STALE')}})).rejects.toThrow('STALE')
    expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
    expect(mocks.readModelBatch).not.toHaveBeenCalled()
  })

  it('validates the selected table before reading sources and preserves relevant translation diagnostics', async () => {
    const {text} = relationFixture()
    const config = new ScenarioViewConfig('SCENE', text)
    await expect(loadScenarioDataSet({scenarioId: 'SCENE', config, modelScope: 'missing'})).rejects.toThrow('模型表不存在')
    expect(mocks.readRelations).not.toHaveBeenCalled()
    const result = await loadScenarioDataSet({scenarioId: 'SCENE', config, modelScope: 'PARENT'})
    try {expect(result.diagnostics).toEqual([expect.stringContaining('REL-BROKEN')])}
    finally {result.dataSet.destroy()}
  })

  it.each([false, true])('reads only formal bindings while assembling declared file resources (file only: %s)', async fileOnly => {
    const {text} = relationFixture()
    const config = new ScenarioViewConfig('SCENE', JSON.stringify({scenarioId: 'SCENE', schemaVersion: 2, resourceRelations: [], tables: {
      ...(fileOnly ? {} : JSON.parse(text).tables), FileDefinitions: {resourceType: 'file', resourceId: 'pagedata.json',
        columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {autoLoad: false}}},
    }}))
    const executeQuery = vi.fn(async () => {throw new Error('not during assembly')})
    const input = {scenarioId: 'SCENE', config, fileExecutors: {FileDefinitions: {executeQuery}}}
    const assembly = await loadScenarioDataSet(input)
    try {
      if (fileOnly) expect(mocks.readModelBatch).not.toHaveBeenCalled()
      else expect(mocks.readModelBatch).toHaveBeenCalledExactlyOnceWith({designScenarioId: DATA_SPACE_DESIGN_FORM_KEY,
        dataSpaceId: 'SCENE', metaNames: ['PARENT', 'CHILD']}, undefined)
      expect(mocks.readSpaceDefinition).toHaveBeenCalledOnce()
      expect(mocks.readRelations).not.toHaveBeenCalled(); expect(executeQuery).not.toHaveBeenCalled()
      expect(assembly.dataSet.getTable('FileDefinitions')?.resourceId).toBe('pagedata.json')
    } finally {assembly.dataSet.destroy()}
  })

  it('rejects a missing file owner before starting model or space reads', async () => {
    relationFixture()
    const config = new ScenarioViewConfig('SCENE', JSON.stringify({scenarioId: 'SCENE', tables: {
      FileDefinitions: {resourceType: 'file', resourceId: 'pagedata.json', columns: [], views: {default: {}}},
    }}))
    await expect(loadScenarioDataSet({scenarioId: 'SCENE', config})).rejects.toThrow('SCENARIO_FILE_OWNER')
    expect(mocks.readSpaceDefinition).not.toHaveBeenCalled(); expect(mocks.readModelBatch).not.toHaveBeenCalled()
    expect(mocks.readRelations).not.toHaveBeenCalled()
  })

  it('injects the registered Workflow file executor through formal runtime loading', async () => {
    mocks.readRequestScope.mockReturnValue(scope('workflow-loader', 'APP'))
    mocks.readText.mockResolvedValue(JSON.stringify({scenarioId: 'SCENE', schemaVersion: 2, resourceRelations: [], tables: {
      AgentWorkflowFiles: {resourceType: 'file', resourceId: 'agent-workflow-files', columns: [
        {name: 'workflowId', type: 'string', isPrimaryKey: true}, {name: 'fileName', type: 'string'},
        {name: 'timestamp', type: 'string'}, {name: 'content', type: 'string'},
      ], views: {default: {}, directory: {queryConfig: {allPages: true}}, design: {autoLoad: false,
        queryContext: {workflowId: ''}}, definition: {autoLoad: false, queryContext: {workflowId: ''}}}},
    }}))
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId: 'SCENE', name: '正式空间'})
    mocks.readModelBatch.mockResolvedValue([])
    mocks.listFiles.mockResolvedValue([{name: 'agent-workflow-alpha', lastModified: 1730000000000}])
    mocks.readTextFile.mockResolvedValue('{"kind":"agent.workflow.definition"}')
    const dataSet = await loadLowcodeRuntimeScenario({projectId: 'APP', scenarioId: 'SCENE'})
    try {
      const directory = dataSet.getView('AgentWorkflowFiles', 'directory')!
      expect((await directory.requestRefresh()).success).toBe(true)
      expect(directory.rows).toMatchObject([{workflowId: 'agent-workflow-alpha', fileName: 'design.json'}])
      expect(mocks.listFiles).toHaveBeenCalledExactlyOnceWith({appType: 'designfile', folderPath: 'APP/workflow-designs'})
      const definition = dataSet.getView('AgentWorkflowFiles', 'definition')!
      definition.queryContext = {...definition.queryContext, workflowId: 'agent-workflow-alpha'}
      expect((await definition.requestRefresh()).success).toBe(true)
      expect(definition.currentRow).toMatchObject({content: '{"kind":"agent.workflow.definition"}'})
      expect(mocks.readTextFile).toHaveBeenCalledExactlyOnceWith({appType: 'designfile',
        customPath: 'APP/workflow-designs/agent-workflow-alpha', fileName: 'definition.json'})
    } finally {dataSet.destroy()}
  })

  it.each([false, true])('consumes saved native relationships without reading legacy records (empty: %s)', async empty => {
    const {text} = relationFixture()
    const resourceRelations = empty ? [] : [{relationId: 'NATIVE', sourceRelationId: 'REL-BROKEN',
      parentTable: 'PARENT', childTable: 'CHILD', cascadeDelete: false,
      filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}}]
    mocks.readText.mockResolvedValue(JSON.stringify({...JSON.parse(text), schemaVersion: 2, resourceRelations}))
    mocks.readRelations.mockRejectedValue(new Error('legacy store must not be consumed'))
    const dataSet = await loadLowcodeRuntimeScenario({projectId: 'APP', scenarioId: 'SCENE'})
    try {
      expect(dataSet.resourceRelations).toEqual(resourceRelations)
      expect(dataSet.getView('PARENT', 'default')).toBeDefined()
      expect(mocks.readRelations).not.toHaveBeenCalled()
      expect(mocks.request).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it.each([false, true])('limits formal model reads to the native connected scope (related: %s)', async related => {
    const {text} = relationFixture()
    const source = JSON.parse(text)
    source.tables['Unavailable'] = {modelBinding: {modelId: 'MISSING', modelName: 'Unavailable'}, views: {default: {}}}
    const resourceRelations = related ? [{relationId: 'NATIVE', parentTable: 'PARENT', childTable: 'CHILD',
      filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}}] : []
    const full = new ScenarioViewConfig('SCENE', JSON.stringify({...source, schemaVersion: 2, resourceRelations}))
    mocks.readRelations.mockRejectedValue(new Error('native configuration must not read legacy records'))
    const assembly = await loadScenarioDataSet({scenarioId: 'SCENE', config: full, modelScope: 'PARENT'})
    try {
      expect(mocks.readModelBatch).toHaveBeenCalledExactlyOnceWith({designScenarioId: DATA_SPACE_DESIGN_FORM_KEY,
        dataSpaceId: 'SCENE', metaNames: related ? ['PARENT', 'CHILD'] : ['PARENT']}, undefined)
      expect(assembly.diagnostics).toEqual([])
      expect(assembly.dataSet.getView('PARENT', 'default')).toBeDefined()
      expect(assembly.dataSet.getView('CHILD', 'default') !== undefined).toBe(related)
      expect(assembly.dataSet.getView('Unavailable', 'default')).toBeUndefined()
      expect(assembly.dataSet.resourceRelations).toEqual(resourceRelations)
      expect(full.toJSON()['tables']).toHaveProperty('Unavailable')
      expect(mocks.readRelations).not.toHaveBeenCalled()
      expect(mocks.request).not.toHaveBeenCalled()
    } finally { assembly.dataSet.destroy() }
  })

  it('loads a reused model once in the requested scenario batch and keeps independent named views', async () => {
    const {text} = relationFixture('rowid')
    const config: {scenarioId: string; tables: Record<string, unknown>} = JSON.parse(text)
    config.tables['ParentCopy'] = {modelBinding: {modelId: 'PARENT', modelName: 'PARENT'}, views: {default: {}, compact: {pageSize: 7}}}
    const assembly = await loadScenarioDataSet({scenarioId: 'SCENE', config: new ScenarioViewConfig('SCENE', JSON.stringify(config))})
    expect(mocks.readModelBatch).toHaveBeenCalledExactlyOnceWith({designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: 'SCENE', metaNames: ['PARENT', 'CHILD']}, undefined)
    expect(assembly.dataSet.getView('ParentCopy', 'compact')?.pageSize).toBe(7)
    expect(assembly.dataSet.getView('ParentCopy', 'default')).not.toBe(assembly.dataSet.getView('PARENT', 'default'))
    assembly.dataSet.destroy()
  })

  it('rejects and destroys incomplete runtime assembly while retaining design diagnostics and the source definition', async () => {
    const {text, relation} = relationFixture()
    const raw = relation.filterExpression.toJSON()
    const design = await loadScenarioDataSet({scenarioId: 'SCENE', config: new ScenarioViewConfig('SCENE', text)})
    expect(design.diagnostics).toEqual([expect.stringContaining('REL-BROKEN')])
    expect(design.dataSet.destroyed).toBe(false)
    design.dataSet.destroy()
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    await expect(loadLowcodeRuntimeScenario({projectId: 'APP', scenarioId: 'SCENE'}))
      .rejects.toThrow(/SCENARIO_ASSEMBLY_INCOMPLETE.*SCENE.*REL-BROKEN/s)
    expect(destroy).toHaveBeenCalledOnce()
    expect(relation.filterExpression.toJSON()).toEqual(raw)
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('rejects unsaved preview config with the same incomplete-assembly contract and does not read the saved file', async () => {
    const {text} = relationFixture()
    mocks.readText.mockRejectedValue(new Error('saved pagedata must not be read for unsaved preview'))
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    await expect(assembleLowcodeRuntimeScenario({projectId: 'APP', scenarioId: 'SCENE',
      config: new ScenarioViewConfig('SCENE', text), assertCurrent: () => undefined}))
      .rejects.toThrow(/SCENARIO_ASSEMBLY_INCOMPLETE.*SCENE.*REL-BROKEN/s)
    expect(destroy).toHaveBeenCalledOnce()
    expect(mocks.readText).not.toHaveBeenCalled()
  })

  it('injects registered file owners for unsaved preview config', async () => {
    mocks.readRequestScope.mockReturnValue(scope('preview-file', 'APP'))
    const config = new ScenarioViewConfig('SCENE', JSON.stringify({scenarioId: 'SCENE', schemaVersion: 2, resourceRelations: [], tables: {
      AgentWorkflowFiles: {resourceType: 'file', resourceId: 'agent-workflow-files', columns: [
        {name: 'workflowId', type: 'string', isPrimaryKey: true}, {name: 'fileName', type: 'string'},
        {name: 'timestamp', type: 'string'}, {name: 'content', type: 'string'},
      ], views: {default: {}, directory: {queryConfig: {allPages: true}}, design: {autoLoad: false,
        queryContext: {workflowId: ''}}, definition: {autoLoad: false, queryContext: {workflowId: ''}}}},
    }}))
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId: 'SCENE', name: '正式空间'})
    mocks.readModelBatch.mockResolvedValue([])
    mocks.listFiles.mockResolvedValue([{name: 'agent-workflow-alpha', lastModified: 1730000000000}])
    mocks.readText.mockRejectedValue(new Error('saved pagedata must not be read for unsaved preview'))
    const dataSet = await assembleLowcodeRuntimeScenario({projectId: 'APP', scenarioId: 'SCENE', config, assertCurrent: () => undefined})
    try {
      const directory = dataSet.getView('AgentWorkflowFiles', 'directory')!
      expect((await directory.requestRefresh()).success).toBe(true)
      expect(directory.rows).toMatchObject([{workflowId: 'agent-workflow-alpha', fileName: 'design.json'}])
      expect(mocks.readText).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it.each(['resolved', 'outside'])('loads %s relationships without false incompleteness errors', async kind => {
    relationFixture('rowid', kind === 'outside' ? 'UNBOUND' : 'CHILD')
    const result = await loadLowcodeRuntimeScenario({projectId: 'APP', scenarioId: 'SCENE'})
    expect(result.resourceRelations).toHaveLength(kind === 'outside' ? 0 : 1)
    expect(result.getView('PARENT', 'default')).toBeDefined()
    expect(result.getView('CHILD', 'default')).toBeDefined()
    expect(mocks.request).not.toHaveBeenCalled()
    result.destroy()
  })

  it('keeps a failed PageRuntime unloaded and allows a fresh assembly after the relation is repaired', async () => {
    relationFixture()
    const tool = new PageTool({pageId: 'TOOL'})
    tool.markLoaded()
    const companions: DataSet[] = []
    const runtime = new PageRuntime({tool, scenarioIds: ['SCENE', 'OTHER'], loadScenario: scenarioId => {
      if (scenarioId === 'SCENE') return loadLowcodeRuntimeScenario({projectId: 'APP', scenarioId})
      const other = DataSet.fromJson({scenarioId, dataSetName: '其他空间', tables: {}})
      companions.push(other)
      return Promise.resolve(other)
    }})
    try {
      await expect(runtime.load()).rejects.toThrow('SCENARIO_ASSEMBLY_INCOMPLETE')
      expect(runtime.isLoaded).toBe(false)
      expect(runtime.getDataSet('SCENE')).toBeUndefined()
      expect(runtime.getDataSet('OTHER')).toBeUndefined()
      expect(companions[0]?.destroyed).toBe(true)
      relationFixture('rowid')
      await runtime.load()
      expect(runtime.isLoaded).toBe(true)
      expect(runtime.getDataSet('SCENE')?.resourceRelations).toHaveLength(1)
      expect(runtime.getDataSet('OTHER')).toBe(companions[1])
      expect(companions[1]?.destroyed).toBe(false)
      expect(mocks.request).not.toHaveBeenCalled()
    } finally {runtime.dispose()}
  })

  it('reads the current application header and rejects a later token or application change', () => {
    mocks.readRequestScope.mockReturnValue(scope('t1', 'APP'))
    const execution = readLowcodeExecutionProject()
    expect(execution.projectId).toBe('APP')
    execution.assertCurrent()
    mocks.readRequestScope.mockReturnValue(scope('t2', 'APP'))
    expect(() => execution.assertCurrent()).toThrow('SPARK_EXECUTION_SCOPE_STALE: 场景请求所属应用已失效')
    mocks.readRequestScope.mockReturnValue(scope('t1', 'OTHER'))
    expect(() => execution.assertCurrent()).toThrow('SPARK_EXECUTION_SCOPE_STALE: 场景请求所属应用已失效')
  })

  it('rejects a missing application header before a design page can load a blueprint', () => {
    mocks.readRequestScope.mockReturnValue({token: 't1', headers: {}})
    expect(() => readLowcodeExecutionProject()).toThrow('SPARK_EXECUTION_SCOPE_REQUIRED: 缺少当前应用身份')
  })

  it('keeps the data space design page off the lowcode request scope', () => {
    const source = readFileSync(resolve('src/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue'), 'utf8')
    expect(source).not.toContain('lowcodeApi')
  })

  it('hosts the data space design runtime through the shared native session', () => {
    const source = readFileSync(resolve('src/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue'), 'utf8')
    expect(source).toContain('new NativePageRuntimeSession')
    expect(source).toContain('runtimeSession.isCurrent(runtime)')
    expect(source).not.toContain('new PageRuntime')
  })

  it('rejects when the request application differs from the page project', async () => {
    mocks.readRequestScope.mockReturnValue(scope('t1', 'OTHER'))
    await expect(loadLowcodeRuntimeScenario({ projectId: 'APP', scenarioId: 'SCENE' })).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(mocks.readText).not.toHaveBeenCalled()
  })

  it('rejects when the request identity changes while reading the scenario file', async () => {
    mocks.readRequestScope.mockReturnValueOnce(scope('t1', 'APP')).mockReturnValueOnce(scope('t1', 'APP')).mockReturnValue(scope('t2', 'APP'))
    mocks.readText.mockResolvedValue('{}')
    await expect(loadLowcodeRuntimeScenario({ projectId: 'APP', scenarioId: 'SCENE' })).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(mocks.readModelBatch).not.toHaveBeenCalled()
  })

  it('rejects a missing scenario view file without reading formal models', async () => {
    mocks.readRequestScope.mockReturnValue(scope('t1', 'APP'))
    mocks.readText.mockResolvedValue(null)
    await expect(loadLowcodeRuntimeScenario({ projectId: 'APP', scenarioId: 'SCENE' })).rejects.toThrow('SCENARIO_VIEW_FILE_MISSING')
    expect(mocks.readModelBatch).not.toHaveBeenCalled()
  })

  it('rejects a same-token application switch while reading the scenario before metadata access', async () => {
    mocks.readRequestScope.mockReturnValue(scope('t1', 'APP'))
    mocks.readText.mockImplementationOnce(async () => {
      mocks.readRequestScope.mockReturnValue(scope('t1', 'OTHER'))
      return JSON.stringify({scenarioId: 'SCENE', resourceRelations: [], tables: {}})
    })
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId: 'SCENE', name: 'Original'})
    mocks.readRelations.mockResolvedValue([])
    await expect(loadLowcodeRuntimeScenario({projectId: 'APP', scenarioId: 'SCENE'}).then(dataSet => dataSet.destroy())).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
    expect(mocks.readModelBatch).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('reads formal space even when no tables are configured, keeping scenario identity separate from Name', async () => {
    mocks.readRequestScope.mockReturnValue(scope('t1', 'APP'))
    mocks.readText.mockResolvedValue(JSON.stringify({scenarioId: 'SCENE', tables: {}}))
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId: 'SCENE', name: '正式场景名称'})
    mocks.readRelations.mockResolvedValue([])
    const dataSet = await loadLowcodeRuntimeScenario({projectId: 'APP', scenarioId: 'SCENE'})
    expect(dataSet.scenarioId).toBe('SCENE')
    expect(dataSet.dataSetName).toBe('正式场景名称')
    expect(mocks.readSpaceDefinition).toHaveBeenCalledWith(expect.objectContaining({
      designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: 'SCENE'}), undefined)
    expect(mocks.readModelBatch).not.toHaveBeenCalled()
    dataSet.destroy()
  })

  it('rejects a formal space result returned after request scope changed', async () => {
    let resolveSpace!: (value: {dataSpaceId: string; name: string}) => void
    mocks.readRequestScope.mockReturnValue(scope('t1', 'APP'))
    mocks.readText.mockResolvedValue(JSON.stringify({scenarioId: 'SCENE', tables: {}}))
    mocks.readSpaceDefinition.mockReturnValue(new Promise(resolve => {resolveSpace = resolve}))
    mocks.readRelations.mockResolvedValue([])
    const pending = loadLowcodeRuntimeScenario({projectId: 'APP', scenarioId: 'SCENE'})
    await vi.waitFor(() => expect(mocks.readSpaceDefinition).toHaveBeenCalledOnce())
    mocks.readRequestScope.mockReturnValue(scope('t2', 'APP'))
    resolveSpace({dataSpaceId: 'SCENE', name: '迟到名称'})
    await expect(pending).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
  })
})


it('loads the complete parent query plan when only a persisted named child view model is requested', async () => {
  vi.clearAllMocks()
  const {text, models} = relationFixture('rowid')
  // This plan consumes formal SQL children, unlike the resource-relation fixture above.
  for (const model of models) model.raw = {DbId: 'DB', ...(model.metaName === 'PARENT' ? {} : {PId: 'PARENT', ForeignKeyFields: 'rowid'})}
  const input = JSON.parse(text)
  input.schemaVersion = 2; input.resourceRelations = []
  input.tables.PARENT.views.default.queryConfig = {outputType: 'Navigation', pagination: 'none', children: [
    {modelName: 'CHILD', fields: ['id']}, {modelName: 'EXTRA', fields: ['id']},
  ]}
  input.tables.CHILD.views.default.queryConfig = {pagination: 'none', autoQuery: false,
    parentResult: {dataViewKey: 'SCENE@PARENT@default', childModelName: 'CHILD'}}
  input.tables.ThirdConfig = {modelBinding: {modelId: 'EXTRA', modelName: 'EXTRA'}, views: {default: {}}}
  input.tables.Unavailable = {modelBinding: {modelId: 'MISSING', modelName: 'Unavailable'}, views: {default: {}}}
  const extra = {...models[1]!, id: 'EXTRA', name: 'EXTRA', metaName: 'EXTRA', sourceName: 'physical_extra',
    fields: models[1]!.fields.map(field => ({...field, id: 'EXTRA-key', modelId: 'EXTRA'}))}
  mocks.readModelBatch.mockImplementation(async ({metaNames}: {metaNames: string[]}) => [...models, extra].filter(model => metaNames.includes(model.metaName)))
  mocks.readRelations.mockRejectedValue(new Error('native configuration must not read legacy records'))
  const config = new ScenarioViewConfig('SCENE', JSON.stringify(input))
  const assembly = await loadScenarioDataSet({scenarioId: 'SCENE', config, modelScope: 'CHILD'})
  try {
    expect(mocks.readModelBatch).toHaveBeenCalledExactlyOnceWith({designScenarioId: DATA_SPACE_DESIGN_FORM_KEY,
      dataSpaceId: 'SCENE', metaNames: ['PARENT', 'CHILD', 'EXTRA']}, undefined)
    expect(assembly.diagnostics).toEqual([])
    expect(Object.keys(assembly.dataSet.tables)).toEqual(['PARENT', 'CHILD', 'ThirdConfig'])
    expect(assembly.dataSet.getView('CHILD')!.queryConfig.parentResult).toEqual({dataViewKey: 'SCENE@PARENT@default', childModelName: 'CHILD'})
    expect(assembly.dataSet.resourceRelations).toEqual([])
    expect(mocks.readRelations).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
    expect(config.toJSON()).toEqual(input)
  } finally {assembly.dataSet.destroy()}
})


it('rejects a persisted concrete-view parentResult cycle during native assembly without business reads', async () => {
  vi.clearAllMocks()
  const {text} = relationFixture('rowid'), input = JSON.parse(text)
  input.schemaVersion = 2; input.resourceRelations = []
  input.tables.PARENT.views.default.queryConfig = {pagination: 'none', autoQuery: false,
    parentResult: {dataViewKey: 'SCENE@CHILD@default', childModelName: 'PARENT'}}
  input.tables.CHILD.views.default.queryConfig = {pagination: 'none', autoQuery: false,
    parentResult: {dataViewKey: 'SCENE@PARENT@default', childModelName: 'CHILD'}}
  await expect(loadScenarioDataSet({scenarioId: 'SCENE', config: new ScenarioViewConfig('SCENE', JSON.stringify(input)), modelScope: 'CHILD'})).rejects.toThrow('PARENT_CYCLE')
  expect(mocks.request).not.toHaveBeenCalled()
})


describe('scoped projection scenario loading',()=>{
 it('resolves a valid inherited relation before scoping legacy model configuration',async()=>{
  const f=relationFixture('rowid')
  const raw=JSON.parse(f.text)
  raw.resourceRelations=[{sourceRelationId:f.relation.sourceRelationId,parentTable:'PARENT',childTable:'CHILD',relationName:'preserved',cascadeUpdate:true}]
  const config=new ScenarioViewConfig('SCENE',JSON.stringify(raw))
  const {dataSet}=await loadScenarioDataSet({scenarioId:'SCENE',config,modelScope:'PARENT'})
  try{
   expect(mocks.readRelations).toHaveBeenCalledOnce()
   expect(Object.keys(dataSet.tables)).toEqual(['PARENT','CHILD'])
   expect(dataSet.resourceRelations).toEqual(expect.arrayContaining([expect.objectContaining({relationName:'preserved',cascadeUpdate:true})]))
  }finally{dataSet.destroy()}
 })

 beforeEach(()=>vi.clearAllMocks())
 const definition=()=>new ScenarioViewConfig(DATA_SPACE_DESIGN_FORM_KEY,readFileSync('config/pages/data-platform/data-space-design/pagedata.json','utf8'))
 it('rejects a missing scoped projection factory before formal service reads',async()=>{
  mocks.readRequestScope.mockReturnValue(scope('projection-token','APP'))
  mocks.readRelations.mockResolvedValue([])
  await expect(loadScenarioDataSet({scenarioId:DATA_SPACE_DESIGN_FORM_KEY,config:definition(),modelScope:'ProjectToolCatalog'})).rejects.toThrow('SCENARIO_PROJECTION_BINDING')
  expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
  expect(mocks.readRelations).not.toHaveBeenCalled()
  expect(mocks.readModelBatch).not.toHaveBeenCalled()
 })
 it('selects the production catalog from full metadata without loading backend model definitions or requiring its tree',async()=>{
  mocks.readRequestScope.mockReturnValue(scope('projection-token','APP'))
  mocks.readRelations.mockResolvedValue([])
  mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId:DATA_SPACE_DESIGN_FORM_KEY,name:'Metadata'})
  const owner=new ProjectToolResource({workspace:new ProjectWorkspace({projectId:'APP',blueprint:{}}),metadataScenarioId:DATA_SPACE_DESIGN_FORM_KEY,assertCurrent:()=>{}})
  const {dataSet}=await loadScenarioDataSet({scenarioId:DATA_SPACE_DESIGN_FORM_KEY,config:definition(),modelScope:'ProjectToolCatalog',projectionBindings:{ProjectToolCatalog:view=>owner.queryBinding(view)}})
  try{
   expect(Object.keys(dataSet.tables)).toEqual(['ProjectToolCatalog'])
   expect(mocks.readModelBatch).not.toHaveBeenCalled()
   expect(mocks.request).not.toHaveBeenCalled()
   await expect(dataSet.getView('ProjectToolCatalog')!.loadFromServer()).rejects.toThrow('PROJECT_TOOL_CATALOG_OWNER')
   expect(mocks.request).not.toHaveBeenCalled()
  }finally{dataSet.destroy()}
 })
})

describe('D99 application entry explicitly reads its working Dataset Plan', () => {
  const projectId = 'D99A1DCE9894698799101EFD70F8FC76'
  const scenarioId = 'B9EB9A416B3AFC711E3787399368D247'
  const modelId = '42a0f810-edb8-46a1-9174-f6141d212c6d'
  const modelName = 'base_channel_miniapp_template_application'
  const routePath = '/features/integration/mp-open/ui/application-page'
  const workingSource = {nodeId: scenarioId, routePath, assertCurrent: () => undefined}
  const command = {projectId, scenarioId, workingSource}
  const fixtureFieldId = 'isolation-formal-id-field'
  const planModel = {id: modelId, metaName: modelName, name: modelName, description: '', sourceType: '数据库表',
    isBusinessMain: false, isBusiness: false, outputType: '', filter: '', parentField: '', hasChildField: '',
    selfType: '', topValue: '', cacheType: '', join: {joinType: '', foreignKeyFields: '', joinFilter: '', pId: ''},
    crud: {addApi: '', updateApi: '', deleteApi: ''}}

  function plan(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      schemaVersion: 1, kind: 'spark.runtimeDataSetPlan', scenarioId, name: '申请审批', description: '', type: '数据源',
      savedAt: '2026-11-25T00:00:00.000Z', contentHash: 'fnv1a:12345678',
      source: {dataSetId: scenarioId, exportedFrom: 'data-space-design', graphFile: `${scenarioId}.json`},
      inputParams: [], models: [planModel],
      modelFields: [{id: fixtureFieldId, dataModelId: modelId, name: 'id', asName: '', fieldType: 'bigint',
        isPKey: true, isOutput: true, order: 0, orderType: '', group: 0, type: 'dataModel', description: ''}],
      views: [], viewFields: [], relations: [], linkage: {edges: []}, ...overrides,
    })
  }

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.readRequestScope.mockReturnValue(scope('current-actor', projectId))
    mocks.readText.mockResolvedValue(null)
    mocks.verifyNativeApplicationPlan.mockResolvedValue(undefined)
    mocks.readTextFile.mockResolvedValue(plan())
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId: scenarioId, name: '申请审批'})
    mocks.readModelBatch.mockResolvedValue([{id: modelId, name: modelName, metaName: modelName,
      sourceName: modelName, sourceId: 'fixture-database', sourceType: '数据库表', primaryKey: 'id',
      businessMain: false, raw: {}, fields: [{id: fixtureFieldId, modelId, name: 'id',
        canonicalName: 'id', type: 'bigint', primaryKey: true, description: '', output: true, computed: false,
        order: 0, orderType: '', raw: {}}]}])
  })


  const catalogScenario = '3F1AB1BEE8CDF6A4DE28F44A933CDCF5'
  const catalogPath = '/features/integration/mp-open/ui/catalog-page'
  const templateModel = {...planModel, id:'6b62d736-17ba-44fe-a93d-52a80fc124ea', metaName:'base_channel_miniapp_template'}
  const accountModel = {...planModel, id:'3104bca0-9393-4124-9eec-ca122be7a359', metaName:'base_enterprise_channel_account'}
  const catalogCommand = {projectId,scenarioId:catalogScenario,workingSource:{nodeId:catalogScenario,routePath:catalogPath,assertCurrent(){}}}
  const catalogFields = ['id','provider','display_name','catalog_visible','active']

  function mockCatalogPlan(models = [templateModel, accountModel]) {
    const modelFields = [templateModel, accountModel].flatMap(model =>
      (model === templateModel ? catalogFields : ['id']).map((name, order) => ({id: `${model.id}:${name}`,
        dataModelId:model.id, name, asName:'', fieldType:name === 'id' ? 'bigint' : 'string', isPKey:name === 'id',
        isOutput:true, order, orderType:'', group:0, type:'dataModel', description:''})))
    mocks.readTextFile.mockResolvedValue(plan({scenarioId:catalogScenario,name:'模板目录',models,modelFields,
      source:{dataSetId:catalogScenario,exportedFrom:'data-space-design',graphFile:`${catalogScenario}.json`}}))
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId:catalogScenario,name:'模板目录'})
    mocks.readModelBatch.mockResolvedValue([templateModel,accountModel].map(model => ({...model,
      sourceName:model.metaName,sourceId:'fixture-database',primaryKey:'id',businessMain:false,raw:{},
      fields:modelFields.filter(field=>field.dataModelId===model.id).map(field=>({...field,modelId:model.id,
        canonicalName:field.name,type:field.fieldType,primaryKey:field.isPKey,output:true,computed:false,raw:{}}))})))
  }

  it('admits the catalog by exact identity and binds distinct server-filtered views', async () => {
    mockCatalogPlan([accountModel,templateModel])
    const dataSet = await loadLowcodeRuntimeScenario(catalogCommand)
    try {
      const table = dataSet.getTable(templateModel.metaName)!
      const catalog = table.getView('catalogWechat')!
      const candidate = table.getView('installableWechat')!
      const douyin = table.getView('catalogDouyin')!
      expect(catalog.primaryKey).toBe('id')
      expect(candidate).not.toBe(catalog)
      expect(catalog.scopeFilter).toEqual({field:'provider',operator:'eq',value:'WECHAT_OPEN'})
      expect(douyin.scopeFilter).toEqual({field:'provider',operator:'eq',value:'DOUYIN_OPEN'})
      expect(candidate.scopeFilter).toEqual({logic:'and',filters:[{field:'provider',operator:'eq',value:'WECHAT_OPEN'},
        {field:'catalog_visible',operator:'eq',value:true},{field:'active',operator:'eq',value:true}]})
      expect(catalog.queryConfig.fields).toEqual(catalogFields)
      expect(catalog.sortExpression).toEqual([{field:'id',direction:'asc'}])
      expect(catalog.pageSize).toBe(10)
      expect(mocks.request).not.toHaveBeenCalled()
      expect(mocks.verifyNativeApplicationPlan).toHaveBeenCalledWith(expect.objectContaining({nodeId:catalogScenario,routePath:catalogPath}))
      expect(mocks.readTextFile).toHaveBeenCalledWith(expect.objectContaining({fileName:`${catalogScenario}.dataset.json`}))
    } finally {dataSet.destroy()}
  })

  it('binds candidate lists to the formal models of the My Miniapp working Plan', async () => {
    const miniappScenario = '547CB8AD9613D81428C2280A8FC22819'
    const definitions = [
      {id:'29391cd6-5164-439d-95a0-e28af992853f', model:'base_channel_miniapp_template_application',
        fields:['id','channel_account_id','status','user_version','deployment_id']},
      {id:'37f50083-7d99-4db4-b93d-a2137fc016df', model:'Base_AppSystemList', fields:['rowid','AppName']},
      {id:'42c4bc92-cf0d-461e-a8fc-c32bcff7810a', model:'base_channel_account_application',
        fields:['id','channel_account_id','usage_code','status']},
      {id:'5fd93d86-2d6e-4d21-af30-55ebabaf7ae3', model:'base_channel_miniapp_deployment',
        fields:['id','channel_account_id','status','user_version','provider']},
      {id:'9cc27e89-e1cf-492b-b5db-2a93a68c9611', model:'base_enterprise_channel_account',
        fields:['id','provider','account_type','nick_name','authorizer_appid','authorization_status','enabled']},
      {id:'a8d2e26a-8f73-46f3-a36a-45b5f6b50adf', model:'base_channel_miniapp_template', fields:catalogFields},
    ]
    const models = definitions.map(({id,model}) => ({...planModel,id,name:model,metaName:model}))
    const modelFields = definitions.flatMap(({id,fields}) => fields.map((name,order) => ({
      id:`${id}:${name}`,dataModelId:id,name,asName:'',fieldType:name==='id'?'bigint':'string',
      isPKey:order===0,isOutput:true,order,orderType:'',group:0,type:'dataModel',description:'',
    })))
    mocks.readTextFile.mockResolvedValue(plan({scenarioId:miniappScenario,name:'我的小程序',models,modelFields,
      source:{dataSetId:miniappScenario,exportedFrom:'data-space-design',graphFile:`${miniappScenario}.json`}}))
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId:miniappScenario,name:'我的小程序'})
    mocks.readModelBatch.mockResolvedValue(models.map(model => ({...model,sourceName:model.metaName,
      sourceId:'fixture-database',primaryKey:model.metaName==='Base_AppSystemList'?'rowid':'id',businessMain:false,raw:{},
      fields:modelFields.filter(field=>field.dataModelId===model.id).map(field=>({...field,modelId:model.id,
        canonicalName:field.name,type:field.fieldType,primaryKey:field.isPKey,output:true,computed:false,raw:{}}))})))
    const dataSet=await loadLowcodeRuntimeScenario({projectId,scenarioId:miniappScenario,
      workingSource:{nodeId:miniappScenario,routePath:'/features/integration/mp-open/ui/my-miniapp-page',assertCurrent(){}}})
    try {
      const template=dataSet.getTable('base_channel_miniapp_template')
      const wechat=template?.getView('installableWechat')
      const douyin=template?.getView('installableDouyin')
      const applications=dataSet.getView('Base_AppSystemList','businessApplications')
      expect(template?.modelBinding?.modelId).toBe('a8d2e26a-8f73-46f3-a36a-45b5f6b50adf')
      expect(template?.getView('catalogWechat')).toBeUndefined()
      expect(wechat).toBeDefined()
      expect(wechat).not.toBe(douyin)
      expect([wechat,douyin].map(view=>view?.scopeFilter)).toEqual(['WECHAT_OPEN','DOUYIN_OPEN'].map(provider=>({
        logic:'and',filters:[{field:'provider',operator:'eq',value:provider},
          {field:'catalog_visible',operator:'eq',value:true},{field:'active',operator:'eq',value:true}],
      })))
      expect(wechat?.sortExpression).toEqual([{field:'id',direction:'asc'}])
      expect(wechat?.pageSize).toBe(10)
      expect(applications?.primaryKey).toBe('rowid')
      expect(applications?.queryConfig.fields).toEqual(['rowid','AppName'])
      expect(applications?.sortExpression).toEqual([{field:'rowid',direction:'asc'}])
      expect([wechat,douyin,applications].every(view=>view?.hasQueryExecutorBinding())).toBe(true)
      expect(mocks.request).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })


  it('rejects a catalog Plan when one of the two formal model identities is wrong', async () => {
    mockCatalogPlan([templateModel, {...accountModel, metaName:'base_other_account'}])
    await expect(loadLowcodeRuntimeScenario(catalogCommand)).rejects.toThrow('NATIVE_DATASET_PLAN_MODEL')
    expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
  })

  it('rejects an application-node identifier combined with the catalog route', async () => {
    await expect(loadLowcodeRuntimeScenario({...catalogCommand,workingSource:{...catalogCommand.workingSource,nodeId:scenarioId}}))
      .rejects.toThrow('NATIVE_DATASET_PLAN_IDENTITY')
    expect(mocks.verifyNativeApplicationPlan).not.toHaveBeenCalled()
    expect(mocks.readTextFile).not.toHaveBeenCalled()
  })

  it('rejects a catalog with revoked navigation before reading the working file', async () => {
    mocks.verifyNativeApplicationPlan.mockRejectedValue(new Error('NATIVE_DATASET_PLAN_NAVIGATION_UNAUTHORIZED'))
    await expect(loadLowcodeRuntimeScenario(catalogCommand)).rejects.toThrow('NATIVE_DATASET_PLAN_NAVIGATION_UNAUTHORIZED')
    expect(mocks.readTextFile).not.toHaveBeenCalled()
    expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
  })

  it('binds the one historical model through its current scoped working file and formal metadata', async () => {
    const native = new NativePageRuntimeSession()
    const runtime = native.acquire({
      pageId: scenarioId, scenarioIds: [scenarioId], targetId: `${projectId}:${scenarioId}`,
      loadScenario: id => loadLowcodeRuntimeScenario({...command, scenarioId: id}),
    })
    try {
      await runtime.load()
      expect(runtime.getDataSet(scenarioId)?.getTable(modelName)?.modelBinding?.modelId).toBe(modelId)
      expect(runtime.resolveView(`${scenarioId}@${modelName}@default`)?.primaryKey).toBe('id')
      expect(mocks.readTextFile).toHaveBeenCalledExactlyOnceWith({
        appType: 'designfile', customPath: 'DataSet', fileName: `${scenarioId}.dataset.json`,
      })
      expect(mocks.readText).not.toHaveBeenCalled()
    } finally {native.dispose()}
  })

  it('stops before both file and metadata reads when the formal node is absent', async () => {
    mocks.verifyNativeApplicationPlan.mockRejectedValue(new Error('NATIVE_DATASET_PLAN_NAVIGATION_UNAUTHORIZED'))
    await expect(loadLowcodeRuntimeScenario(command)).rejects.toThrow('NATIVE_DATASET_PLAN_NAVIGATION_UNAUTHORIZED')
    expect(mocks.readTextFile).not.toHaveBeenCalled()
    expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
  })

  it.each([
    ['node', {workingSource: {...workingSource, nodeId: 'different-node'}}],
    ['path', {workingSource: {...workingSource, routePath: '/another-entry'}}],
    ['scenario', {scenarioId: 'different-scenario'}],
    ['project', {projectId: 'different-application'}],
    ['directory', {projectId: 'homepage'}],
  ])('rejects a different %s before any Plan or metadata IO', async (_case, overrides) => {
    await expect(loadLowcodeRuntimeScenario({...command, ...overrides})).rejects.toThrow('NATIVE_DATASET_PLAN_IDENTITY')
    expect(mocks.verifyNativeApplicationPlan).not.toHaveBeenCalled()
    expect(mocks.readTextFile).not.toHaveBeenCalled()
    expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
  })

  it('does not treat a working-source admission as publication proof', async () => {
    await expect(loadLowcodeRuntimeScenario({...command, source: {
      mode: 'published', sourceRevision: 'revision', publicationRef: null, scenarioIds: [scenarioId],
    }})).rejects.toThrow('PAGE_RUNTIME_PUBLICATION_REQUIRED')
    expect(mocks.verifyNativeApplicationPlan).not.toHaveBeenCalled()
    expect(mocks.readTextFile).not.toHaveBeenCalled()
  })

  it('retains permission and missing file errors and never falls back to pagedata', async () => {
    mocks.readTextFile.mockRejectedValueOnce(new LowcodeApiError(403, 'Plan read denied'))
    await expect(loadLowcodeRuntimeScenario(command)).rejects.toThrow('Plan read denied')
    mocks.readTextFile.mockRejectedValueOnce(new LowcodeApiError(404, 'Plan file missing'))
    await expect(loadLowcodeRuntimeScenario(command)).rejects.toThrow('DATASET_PLAN_FILE_MISSING')
    expect(mocks.readText).not.toHaveBeenCalled()
    expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
  })

  it('rejects a valid-shaped Plan for another model before metadata IO', async () => {
    const replacementModel = {...planModel, id: 'other-model'}
    mocks.readTextFile.mockResolvedValue(plan({models: [replacementModel], modelFields: []}))
    await expect(loadLowcodeRuntimeScenario(command)).rejects.toThrow('NATIVE_DATASET_PLAN_MODEL')
    expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
  })

  it('discards a working file that arrives after the page or application identity changed', async () => {
    let currentPage = true
    const guardedCommand = {...command, workingSource: {...workingSource, assertCurrent() {
      if (!currentPage) throw new Error('page instance expired')
    }}}
    mocks.readTextFile.mockImplementationOnce(async () => {currentPage = false; return plan()})
    await expect(loadLowcodeRuntimeScenario(guardedCommand)).rejects.toThrow('page instance expired')
    mocks.readTextFile.mockImplementationOnce(async () => {
      mocks.readRequestScope.mockReturnValue(scope('replacement-actor', projectId))
      return plan()
    })
    await expect(loadLowcodeRuntimeScenario(command)).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
  })
})
