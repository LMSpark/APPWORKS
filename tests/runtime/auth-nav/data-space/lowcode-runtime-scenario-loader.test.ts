import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {readFileSync} from 'node:fs'
import { DATA_SPACE_DESIGN_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { DataSet, DataViewFilter } from '@spark-appworks/spark-data'
import { PageRuntime, PageTool, ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import {getBuiltinApplicationDescriptor} from '@/registries/builtin-application-registry'
import {getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {BUILTIN_BLUEPRINT_BUSINESS_FIELDS} from '@/lowcode/resources/shared/builtin-system-navigation'
import {BUILTIN_BLUEPRINT_NODE_RESOURCE_ID, BUILTIN_BLUEPRINT_NODE_TABLE_NAME} from '@/lowcode/resources/shared/builtin-blueprint-node-resource'

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

import { loadLowcodeRuntimeScenario, loadScenarioDataSet } from '@/lowcode/data-space/lowcode-data-space-runtime'

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
    const scenario=JSON.parse(readFileSync(scene.path,'utf8')) as {tables:Record<string,{modelBinding?:{modelId:string;modelName:string}} >}
    const configuredModels=Object.values(scenario.tables).flatMap(table=>table.modelBinding?[table.modelBinding]:[])
    const fields=['rowid','SysId','prowid','FunOrderValue','name','FunName','funCode','NavigationUrl','NavigationImageWxz','MobileUrl',
      'NavigationType','ChildItemLocation','NavigationShowType','HorizontalAlignment','IsShowAtNav','IsShowChildItem','BeginGroup',
      'conid','conType','memo','htmlDesc','VersionId','DifficultyFactor','Manhour','Number','Sum','Total','personCharge','status']
    mocks.readRequestScope.mockReturnValue(scope('dynamic-token','APP-A'))
    mocks.readText.mockResolvedValue(JSON.stringify(scenario))
    mocks.readSpaceDefinition.mockResolvedValue({dataSpaceId:scene.scenarioId,name:'动态应用共享蓝图空间'})
    mocks.readRelations.mockResolvedValue([])
    mocks.readModelBatch.mockImplementation(async({metaNames}:{metaNames:string[]})=>metaNames.map(metaName=>{
      const binding=configuredModels.find(model=>model.modelName===metaName)
      if(!binding)throw new Error(`fixture model missing: ${metaName}`)
      return {id:binding.modelId,name:metaName,metaName,sourceName:`source_${metaName}`,sourceId:'DB',sourceType:'table',
        primaryKey:'rowid',businessMain:false,raw:{},fields:fields.map((name,index)=>({id:`${binding.modelId}-${name}`,modelId:binding.modelId,
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
        createChildActionState:()=>'disabled',viewActionState:()=>'hidden'})},{resource:{resourceType:'file',resourceId:'project:tool-file'}})).not.toThrow()
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
    mocks.listFiles.mockResolvedValue([{name: 'agent.workflow.alpha', lastModified: 1730000000000}])
    mocks.readTextFile.mockResolvedValue('{"kind":"agent.workflow.definition"}')
    const dataSet = await loadLowcodeRuntimeScenario({projectId: 'APP', scenarioId: 'SCENE'})
    try {
      const directory = dataSet.getView('AgentWorkflowFiles', 'directory')!
      expect((await directory.requestRefresh()).success).toBe(true)
      expect(directory.rows).toMatchObject([{workflowId: 'agent.workflow.alpha', fileName: 'design.json'}])
      expect(mocks.listFiles).toHaveBeenCalledExactlyOnceWith({appType: 'designfile', folderPath: 'APP/workflow-designs'})
      const definition = dataSet.getView('AgentWorkflowFiles', 'definition')!
      definition.queryContext = {...definition.queryContext, workflowId: 'agent.workflow.alpha'}
      expect((await definition.requestRefresh()).success).toBe(true)
      expect(definition.currentRow).toMatchObject({content: '{"kind":"agent.workflow.definition"}'})
      expect(mocks.readTextFile).toHaveBeenCalledExactlyOnceWith({appType: 'designfile',
        customPath: 'APP/workflow-designs/agent.workflow.alpha', fileName: 'definition.json'})
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
