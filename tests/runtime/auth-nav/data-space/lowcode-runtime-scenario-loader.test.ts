import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {readFileSync} from 'node:fs'
import { DATA_SPACE_DESIGN_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { DataSet, DataViewFilter } from '@spark-appworks/spark-data'
import { PageRuntime, PageTool, ScenarioViewConfig, ProjectToolResource, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {getBuiltinApplicationDescriptor} from '@/registries/builtin-application-registry'
import {getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {BUILTIN_BLUEPRINT_BUSINESS_FIELDS} from '@/lowcode/resources/repository/builtin-system-navigation'
import {BUILTIN_BLUEPRINT_NODE_RESOURCE_ID, BUILTIN_BLUEPRINT_NODE_TABLE_NAME} from '@/lowcode/resources/repository/builtin-blueprint-node-resource'
import {cacheScenarioModels} from './cache/cache-scenario.fixture'
import agentWorkflowConfig from '../../../../config/pages/shared/agent-workflow-files/pagedata.json'

const mocks = vi.hoisted(() => ({
  readRequestScope: vi.fn(),
  readText: vi.fn(),
  readSpaceDefinition: vi.fn(),
  readModelBatch: vi.fn(),
  readRelations: vi.fn(),
  listFiles: vi.fn(),
  readTextFile: vi.fn(),
  request: vi.fn(),
}))

vi.mock('@/lowcode/lowcode-runtime', async () => {
  const {DataSpaceRuntimeApi} = await import('@spark-appworks/spark-lowcode-api')
  const {HttpClientBase} = await import('@spark-appworks/spark-utils')
  class NoRequest extends HttpClientBase {
    protected override async executeRequest(): Promise<never> {
      mocks.request()
      throw new Error('unexpected business request')
    }
  }
  const http = new NoRequest()
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
  lowcodeHttp: http,
  lowcodeDesignFileUpload: vi.fn(),
  createLowcodeProjectGateways: () => ({ scenarioViews: { readText: mocks.readText } }),
  }
})

import {resolve} from 'node:path'
import { assembleLowcodeRuntimeScenario, loadLowcodeRuntimeScenario, loadScenarioDataSet, readLowcodeExecutionProject } from '@/lowcode/data-space/lowcode-data-space-runtime'

const scope = (token: string, appId: string) => ({ token, headers: { 'X-AppId': appId } })

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
  afterEach(() => { vi.restoreAllMocks() })

  it('keeps both Agent Workflow command bindings in the assembled DataSet', async () => {
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
      if (!creation || !publication) throw new Error('Agent Workflow 命令视图缺失')
      expect((await creation.loadFromServer()).success).toBe(true)
      expect((await publication.loadFromServer()).success).toBe(true)
      const creationRow = await creation.addRow({title: ''})
      const publicationRow = await publication.addRow({workflowId: 'alpha', designContent: '{}', definitionContent: '{}'})
      expect(creation.getPkKey(creationRow)).toBeDefined()
      expect(publication.getPkKey(publicationRow)).toBeDefined()
      creation.discardPendingChanges()
      publication.discardPendingChanges()
      expect(mocks.request).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it('loads the registered cache scenario through original model bindings and the configured command factory', async () => {
    const scene=getBuiltinScenarioResource('cacheManagement'),app=getBuiltinApplicationDescriptor()
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

  it('rejects an undeclared builtin program scene before invoking the dynamic file owner', async () => {
    await expect(loadLowcodeRuntimeScenario({projectId: getBuiltinApplicationDescriptor().id, scenarioId: 'UNREGISTERED'}))
      .rejects.toThrow('BUILTIN_SCENARIO_SOURCE_MISSING')
    expect(mocks.readText).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('registers the declared builtin blueprint file DataView through the normal scenario loader',async()=>{
    const application=getBuiltinApplicationDescriptor(),scene=getBuiltinScenarioResource('projectBlueprint')
    const page=JSON.parse(readFileSync(scene.path,'utf8')) as {tables:Record<string,{resourceType?:string;resourceId?:string;columns?:Array<{name:string;type:string}>;views?:Record<string,unknown>}>}
    const table=page.tables[BUILTIN_BLUEPRINT_NODE_TABLE_NAME]
    mocks.readRequestScope.mockReturnValue(scope('builtin-token',application.id))
    mocks.readText.mockResolvedValue(JSON.stringify({scenarioId:scene.scenarioId,tables:{[BUILTIN_BLUEPRINT_NODE_TABLE_NAME]:table}}))
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId:scene.scenarioId,name:'仓内项目蓝图'})
    mocks.readRelations.mockResolvedValue([])
    const dataSet=await loadLowcodeRuntimeScenario({projectId:application.id,scenarioId:scene.scenarioId})
    try{
      const view=dataSet.getView(BUILTIN_BLUEPRINT_NODE_TABLE_NAME,'default')!
      expect(view.dataTable?.resourceType).toBe('file')
      expect(view.dataTable?.resourceId).toBe(BUILTIN_BLUEPRINT_NODE_RESOURCE_ID)
      expect(view.dataTable?.columns.map(column=>column.name).filter(name=>name!=='_pk').sort())
        .toEqual([...BUILTIN_BLUEPRINT_BUSINESS_FIELDS].sort())
      view.queryConfig={...view.queryConfig,allPages:true,maxRows:100}
      await view.refresh()
      expect(view.rows).toHaveLength(85)
      expect(view.rows.find(row=>row['rowid']===application.id)).toMatchObject({name:'DataSchemaManage',conType:'Model',NavigationUrl:null,htmlDesc:null})
      expect(mocks.readModelBatch).not.toHaveBeenCalled()
      expect(mocks.request).not.toHaveBeenCalled()
    }finally{dataSet.destroy()}
  })

  it('does not fall back to database models when the builtin blueprint file DataView is absent',async()=>{
    const application=getBuiltinApplicationDescriptor(),scene=getBuiltinScenarioResource('projectBlueprint')
    mocks.readRequestScope.mockReturnValue(scope('builtin-token',application.id))
    mocks.readText.mockResolvedValue(JSON.stringify({scenarioId:scene.scenarioId,tables:{}}))
    await expect(loadLowcodeRuntimeScenario({projectId:application.id,scenarioId:scene.scenarioId}))
      .rejects.toThrow('BUILTIN_BLUEPRINT_SOURCE_MISSING')
    expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
    expect(mocks.readModelBatch).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('assembles the full shared 7AB scenario for a dynamic app without reading builtin blueprint rows',async()=>{
    const scene=getBuiltinScenarioResource('projectBlueprint')
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
      expect(dataSet.getTable(BUILTIN_BLUEPRINT_NODE_TABLE_NAME)?.resourceId).toBe(BUILTIN_BLUEPRINT_NODE_RESOURCE_ID)
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
