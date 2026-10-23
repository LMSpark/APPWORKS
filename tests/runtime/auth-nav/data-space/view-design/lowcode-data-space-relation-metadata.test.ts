import {withDefinitionResources} from './definition-resource.fixture'
import {describe, expect, it, vi} from 'vitest'
import {DataSet, DataViewFilter, DataViewFilterCodec, RequestState, type DataResourceRelation} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace} from '@spark-appworks/spark-project-model'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import {LowcodeDataSpaceViewDesign} from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-design'
import {dataSpacePageFixture} from '../../../page/design/native/data-space-page.fixture'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type FormalRelations = Awaited<ReturnType<DataSpaceDesignApi['readRelations']>>
const native: DataResourceRelation = {relationId: 'LOCAL', parentTable: 'Parents', childTable: 'Children',
  relationName: 'Local', cascadeUpdate: true, cascadeDelete: false,
  filterExpression: {logic: 'or', filters: [
    {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}},
    {field: 'id', operator: 'ne', value: null},
  ]}}
const base = {scenarioId: 'SPACE', tables: {
  Parents: {modelBinding: {modelId: 'P', modelName: 'P'}, views: {default: {}}},
  Children: {modelBinding: {modelId: 'C', modelName: 'C'}, views: {default: {}}},
}, resourceRelations: [native], viewCascades: [], layout: {tablePositions: {Parents: {x: 1, y: 2}}}}
const initial = JSON.stringify(base)
const formal: FormalRelations = [{sourceRelationId: 'DBREL', dataSpaceId: 'SPACE', parentModelId: 'P',
  childModelId: 'C', parentResourceName: 'P', childResourceName: 'C', cascadeDelete: false,
  dependencyType: 'currentRow', filterExpression: DataViewFilter.condition({field: 'parentId',
    operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}})}]

class NoRequests extends HttpClientBase {
  protected override async executeRequest(_request: RequestConfig): Promise<HttpResponse<unknown>> {
    throw new Error('definition editing must not send business data requests')
  }
}

function fixture(text: string | null = initial) {
  let stored = text
  let writes = 0
  let scope = 'SCOPE'
  let current = formal
  let gate: Promise<void> | undefined
  let entered: (() => void) | undefined
  let failAfterWrite = false
  const models: FormalModel[] = ['P', 'C'].map(id => ({id, name: id, metaName: id, sourceName: id,
    sourceId: 'DB', sourceType: 'table', primaryKey: 'id', businessMain: false, raw: {},
    fields: (id === 'P' ? ['id'] : ['id', 'parentId']).map((name, order) => ({id: `${id}-${name}`,
      modelId: id, name, canonicalName: name, type: 'string', primaryKey: name === 'id',
      description: '', output: true, computed: false, order, orderType: '', raw: {}}))}))
  const openOwner = () => {
    const workspace = new ProjectWorkspace({projectId: 'APP',
      pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}},
      blueprint: {loadRoot: async () => ({children: []})},
      scenarioViews: {readScope: () => scope, readText: async () => stored,
        writeText: async (id, text) => {
          expect(id).toBe('SPACE'); stored = text; writes++
          if (failAfterWrite) {failAfterWrite = false; throw new Error('response lost')}
        }},
    })
    const metadata = DataSet.fromJson({scenarioId: 'META', dataSetName: 'metadata', tables: {
      Base_DataModel_Relation: {tableName: 'Base_DataModel_Relation', resourceType: 'static-data', columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}],
        views: {default: {rows: [{rowid: 'DBREL', filter: 'retained original'}]}}},
    }})
    const http = new NoRequests()
    const assembler = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({http,
      readScope: () => ({token: scope, headers: {}})}), http)
    const service = new LowcodeDataSpaceViewDesign({workspace, loadMetadata: withDefinitionResources(async () => metadata),
      assertScope: () => {if (scope !== 'SCOPE') throw new Error('STALE_SCOPE')},
      readModel: async input => {
        const model = models.find(item => item.id === input.modelId)
        if (!model) throw new Error('missing model')
        return model
      },
      assemble: async ({scenarioId: id, config}) => {
        entered?.(); await gate
        return assembler.assemble({config, space: {dataSpaceId: id, name: id}, models, relations: current})
      },
    })
    return {service, workspace, metadata}
  }
  return {openOwner, get stored() {return stored}, get writes() {return writes},
    changeScope: () => {scope = 'OTHER'}, relations: (value: FormalRelations) => {current = value},
    loseNextResponse: () => {failAfterWrite = true},
    hold: (value: Promise<void>) => {gate = value; return new Promise<void>(resolve => {entered = resolve})}}
}

describe('relation definitions in the metadata DataSet', () => {
  it('revokes the conversion source if metadata changes while publishing the relation view',async()=>{
    const f=dataSpacePageFixture({overviewOnly:true,deferDefinition:true,relationRows:[{rowid:'R',parentModId:'M2',childModId:'M1',
      parentTable:'CustomerSource',childTable:'OrderSource',filter:JSON.stringify({Type:'cond',Field:'rowid',Operator:'equal',ValueFun:{Type:'GetConstValue',Value:'x'}})}]})
    try{
      const session=await f.open('A'),view=session.metadataDataSet.getView('DataResourceRelationDefinition')!,source=session.metadataDataSet.getView('Base_DataModel_Relation')!
      const refresh=view.refresh.bind(view)
      vi.spyOn(view,'refresh').mockImplementationOnce(async()=>{await refresh();source.updateEditingValue('R','filter','changed')})
      await expect(session.loadRelationDefinitions()).rejects.toThrow('未保存修改')
      source.discardPendingChanges()
      view.updateEditingValue(view.getPkKey(view.rows[0]!)!,'relationName','Must not save stale source')
      await expect(session.metadataDataSet.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})).rejects.toThrow('SCENARIO_DEFINITION_BASELINE')
      expect(f.fileWrites).toEqual([])
    }finally{f.dispose()}
  })
  it('requeries a previously narrowed directory before conversion, preserving every old source and third-model dependencies', async () => {
    const f = dataSpacePageFixture({overviewOnly: true, deferDefinition: true, relationRows: ['R1','R2'].map(rowid => ({
      rowid, parentModId: 'M1', childModId: 'M1', parentTable: 'OrderSource', childTable: 'OrderSource',
      filter: DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'rowid',operator:'eq',
        value:{Type:'GetRefData',RefTableName:'Customers',RefFieldName:'rowid',FkFieldName:'rowid'}})),
    }))})
    try {
      const session=await f.open('A'), source=session.metadataDataSet.getView('Base_DataModel_Relation')!
      await source.loadFromServer({filter:{logic:'and',filters:[source.filterExpression!,{field:'rowid',operator:'eq',value:'R1'}]}})
      expect(source.rows).toHaveLength(1);expect(source.total).toBe(1)
      await session.loadRelationDefinitions()
      expect(source.rows).toHaveLength(2)
      expect(f.modelReads.map(input=>input.modelId).sort()).toEqual(['M1','M2'])
      const view=session.metadataDataSet.getView('DataResourceRelationDefinition')!
      expect(view.rows.map(row=>row['sourceRelationId'])).toEqual(['R1','R2'])
      view.updateEditingValue(view.getPkKey(view.rows[0]!)!,'relationName','Changed')
      const saved=await session.metadataDataSet.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})
      expect(saved.success,saved.message).toBe(true)
      expect(JSON.parse(f.stored.get('A')!).resourceRelations).toMatchObject([
        {sourceRelationId:'R1',relationName:'Changed'},{sourceRelationId:'R2'},
      ])
      const reopened=await f.open('A');await reopened.loadRelationDefinitions()
      const nativeView=reopened.metadataDataSet.getView(view.tableName)!
      for(const row of [...nativeView.rows])await nativeView.removeRow(nativeView.getPkKey(row)!)
      expect((await reopened.metadataDataSet.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})).success).toBe(true)
      const deleted=await f.open('A');await deleted.loadRelationDefinitions()
      expect(deleted.metadataDataSet.getView(view.tableName)!.rows).toEqual([])
      expect(JSON.parse(f.stored.get('A')!).resourceRelations).toEqual([])
    } finally {f.dispose()}
  })
  it.each(['scope','dispose','source'] as const)('rejects %s changes during dependency reads without publishing complete conversion',async kind=>{
    const f=dataSpacePageFixture({overviewOnly:true,deferDefinition:true,relationRows:[{rowid:'R',parentModId:'M2',childModId:'M1',
      parentTable:'CustomerSource',childTable:'OrderSource',filter:JSON.stringify({Type:'cond',Field:'rowid',Operator:'equal',ValueFun:{Type:'GetConstValue',Value:'x'}})}]})
    try {
      const session=await f.open('A'),original=f.stored.get('A'),release=f.holdDefinitionRead()
      const pending=session.loadRelationDefinitions(), rejected=expect(pending).rejects.toThrow()
      await vi.waitFor(()=>expect(f.modelReads.length).toBeGreaterThan(0))
      if(kind==='scope')f.invalidate()
      else if(kind==='dispose')session.dispose()
      else session.metadataDataSet.getView('Base_DataModel_Relation')!.updateEditingValue('R','filter','changed')
      release();await rejected
      expect(f.stored.get('A')).toBe(original);expect(f.fileWrites).toEqual([])
      if(kind==='source')expect(session.metadataDataSet.getView('DataResourceRelationDefinition')!.rows).toEqual([])
    }finally{f.dispose()}
  })
  it('keeps an unbound old relation visible as a diagnostic and refuses native conversion',async()=>{
    const f=dataSpacePageFixture({overviewOnly:true,deferDefinition:true,relationRows:[{rowid:'R',parentModId:'UNBOUND',childModId:'M1',
      parentTable:'Unknown',childTable:'OrderSource',filter:JSON.stringify({Type:'cond',Field:'rowid',Operator:'equal',ValueFun:{Type:'GetConstValue',Value:'x'}})}]})
    try{
      const session=await f.open('A'),original=f.stored.get('A')
      await expect(session.loadRelationDefinitions()).rejects.toThrow('未完整转换: R')
      const view=session.metadataDataSet.getView('DataResourceRelationDefinition')!
      await view.addRow({dataSetId:'A',relationId:'LOCAL',parentTable:'OrdersAlias',childTable:'CustomersAlias',filterExpression:{field:'rowid',operator:'eq',value:'x'}})
      await expect(session.metadataDataSet.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})).rejects.toThrow('SCENARIO_DEFINITION_LEGACY')
      expect(f.stored.get('A')).toBe(original);expect(f.fileWrites).toEqual([])
    }finally{f.dispose()}
  })
  it('converts complete legacy sources from overview, saves native changes and reopens without unrelated models or views', async () => {
    const relation = {rowid: 'OLD', parentModId: 'M2', childModId: 'M1', parentTable: 'CustomerSource', childTable: 'OrderSource',
      filter: DataViewFilterCodec.serializeStored(DataViewFilter.condition({field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'rowid'}})), depType: 'currentRow', cascadeDel: '1'}
    const f = dataSpacePageFixture({overviewOnly: true, deferDefinition: true, relationRows: [relation]})
    const original = {scenarioId: 'A', tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, invalidView: {sortExpression: [{field: 'missing', direction: 'asc'}]}}},
      CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}},
      Unavailable: {modelBinding: {modelId: 'MISSING', modelName: 'Missing'}, views: {default: {}}},
    }, layout: {tablePositions: {OrdersAlias: {x: 12, y: 24}}}}
    f.stored.set('A', JSON.stringify(original))
    try {
      const session = await f.open('A')
      expect(session.relationDefinitionsReady).toBe(false)
      await session.loadRelationDefinitions()
      expect(session.relationDefinitionsReady).toBe(true)
      expect(session.definitionStatus).toBe('unloaded')
      expect(f.assemblyScopes).toEqual([])
      expect(f.modelReads.map(item => item.modelId).sort()).toEqual(['M1', 'M2'])
      expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).not.toBe(RequestState.Loaded)
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition')!, source = view.rows[0]!, key = view.getPkKey(source)!
      expect(source).toMatchObject({sourceRelationId: 'OLD', parentTable: 'CustomersAlias', childTable: 'OrdersAlias', cascadeDelete: true,
        filterExpression: {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'rowid'}}})
      view.updateEditingValue(key, 'relationName', 'Cancelled')
      await session.loadRelationDefinitions()
      expect(view.getEditingRow(key)?.['relationName']).toBe('Cancelled')
      expect(f.modelReads).toHaveLength(2)
      view.discardPendingChanges()
      expect(f.fileWrites).toEqual([])
      view.updateEditingValue(key, 'relationName', 'Converted')
      expect((await session.metadataDataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})).success).toBe(true)
      expect(JSON.parse(f.stored.get('A')!)).toMatchObject({schemaVersion: 2, tables: original.tables, layout: original.layout,
        resourceRelations: [{sourceRelationId: 'OLD', relationName: 'Converted', cascadeDelete: true}]})
      expect(session.metadataDataSet.getView('Base_DataModel_Relation')!.rows[0]).toMatchObject(relation)
      const reopened = await f.open('A')
      await reopened.loadRelationDefinitions()
      expect(reopened.metadataDataSet.getView(view.tableName)!.rows).toMatchObject([{relationName: 'Converted'}])
      expect(reopened.definitionStatus).toBe('unloaded')
      expect(f.fileWrites).toHaveLength(1)
      expect(f.assemblyScopes).toEqual([['OrdersAlias', 'CustomersAlias']])
    } finally {f.dispose()}
  })
  it.each(['edit', 'delete'] as const)('preserves unloaded native relationships when the loaded subset performs %s', async operation => {
    const other = {...native, relationId: 'OTHER', relationName: 'Unloaded'}
    const storage = fixture(JSON.stringify({...base, schemaVersion: 2, resourceRelations: [native, other]}))
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      const row = view.rows.find(item => item['relationId'] === native.relationId)!
      view.replaceRows([row])
      if (operation === 'edit') view.updateEditingValue(view.getPkKey(row)!, 'relationName', 'Edited')
      else await view.removeRow(view.getPkKey(row)!)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
    } finally {session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(reopened.definitionDataSet?.resourceRelations).toEqual(operation === 'edit' ? [{...native, relationName: 'Edited'}, other] : [other])
      expect(storage.writes).toBe(1)
    } finally {reopened.dispose()}
  })

  it('converts legacy relationships to editable native definitions and never resurrects them after native deletion', async () => {
    const storage = fixture()
    const original = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const records = original.metadataDataSet.getView('Base_DataModel_Relation', 'default')!
      expect(records.fieldAccess(records.rows[0]!, 'rowid').read).toBe('visible')
      const view = original.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      const source = view.rows.find(row => row['sourceRelationId'] === 'DBREL')!
      view.updateEditingValue(view.getPkKey(source)!, 'filterExpression', native.filterExpression)
      view.updateEditingValue(view.getPkKey(source)!, 'cascadeDelete', true)
      await original.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
      expect(JSON.parse(storage.stored!)).toMatchObject({schemaVersion: 2, resourceRelations: expect.arrayContaining([
        {relationId: 'DBREL:Parents:Children', sourceRelationId: 'DBREL', parentTable: 'Parents', childTable: 'Children',
          filterExpression: native.filterExpression, cascadeDelete: true},
      ])})
      expect(original.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows[0]?.['filter']).toBe('retained original')
    } finally {original.dispose()}
    storage.relations([{...formal[0]!, filterExpression: DataViewFilter.condition({field: 'missing', operator: 'eq', value: 1})}])
    const reopened = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(reopened.definitionDiagnostics).toEqual([])
      expect(reopened.definitionDataSet?.resourceRelations?.find(row => row.sourceRelationId === 'DBREL')?.filterExpression).toEqual(native.filterExpression)
      const view = reopened.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      for (const row of [...view.rows]) await view.removeRow(view.getPkKey(row)!)
      await reopened.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
    } finally {reopened.dispose()}
    const empty = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(empty.definitionDataSet?.resourceRelations).toEqual([])
      expect(empty.metadataDataSet.getView('DataResourceRelationDefinition', 'default')?.rows).toEqual([])
      expect(empty.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows[0]?.['filter']).toBe('retained original')
    } finally {empty.dispose()}
  })

  it('edits, adds and deletes native definitions through metadata, file save and independent reopen', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const table = session.metadataDataSet.getTable('DataResourceRelationDefinition')
      expect(table).toBeDefined()
      expect(table!.modelBinding).toBeUndefined()
      const view = table!.getView('default')!
      expect(view.rows).toHaveLength(2)
      const row = view.rows.find(item => item['relationId'] === 'LOCAL')!
      expect(row).toMatchObject({dataSetId: 'SPACE', ...native})
      view.updateEditingValue(view.getPkKey(row)!, 'relationName', 'Edited')
      await view.addRow({dataSetId: 'SPACE', ...native, relationId: 'NEW'})
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
      expect(storage.writes).toBe(1)
    } finally {session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = reopened.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      expect(view.rows).toHaveLength(3)
      expect(reopened.definitionDataSet?.resourceRelations).toContainEqual({...native, relationName: 'Edited'})
      await view.removeRow(view.getPkKey(view.rows.find(item => item['relationId'] === 'NEW')!)!)
      await reopened.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
      expect(JSON.parse(storage.stored!).resourceRelations).toEqual([
        {relationId: 'DBREL:Parents:Children', sourceRelationId: 'DBREL', parentTable: 'Parents', childTable: 'Children', filterExpression: formal[0]!.filterExpression.toJSON(), cascadeDelete: false},
        {...native, relationName: 'Edited'},
      ])
      expect(JSON.parse(storage.stored!).layout).toEqual(base.layout)
      expect(storage.stored).not.toMatch(/dataSetId|definitionKey|DataResourceRelationDefinition|"rows"/)
    } finally {reopened.dispose()}
  })

  it('persists complete native relationships while retaining their legacy source records', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      const row = view.rows.find(item => item['sourceRelationId'] === 'DBREL')!
      expect(row).toMatchObject({relationId: 'DBREL:Parents:Children', parentTable: 'Parents', childTable: 'Children',
        filterExpression: formal[0]!.filterExpression.toJSON(), cascadeDelete: false})
      view.updateEditingValue(view.getPkKey(row)!, 'relationName', 'From DB')
      view.updateEditingValue(view.getPkKey(row)!, 'cascadeUpdate', false)
      expect((await session.metadataDataSet.saveChanges()).success).toBe(true)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
      expect(JSON.parse(storage.stored!).resourceRelations).toContainEqual({relationId: 'DBREL:Parents:Children', sourceRelationId: 'DBREL',
        parentTable: 'Parents', childTable: 'Children', relationName: 'From DB', cascadeUpdate: false,
        filterExpression: formal[0]!.filterExpression.toJSON(), cascadeDelete: false})
      expect(session.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows)
        .toContainEqual(expect.objectContaining({rowid: 'DBREL', filter: 'retained original'}))
      await session.loadDefinition()
      expect(session.definitionDataSet?.resourceRelations?.find(item => item.sourceRelationId === 'DBREL')?.relationName).toBe('From DB')
    } finally {session.dispose()}
  })

  it.each(['relationId', 'filterExpression', 'cascadeDelete', 'parentTable', 'delete'])('edits converted %s using native validation instead of source ownership', async field => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      const row = view.rows.find(item => item['sourceRelationId'] === 'DBREL')!
      const key = view.getPkKey(row)!
      if (field === 'delete') await view.removeRow(key)
      else view.updateEditingValue(key, field, field === 'filterExpression' ? native.filterExpression : field === 'cascadeDelete' ? true : 'CHANGED')
      if (field === 'parentTable') {
        await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})).rejects.toThrow('关系端点不存在')
        expect(session.viewState?.text).toBe(initial)
        expect(storage.writes).toBe(0)
      } else {
        await session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
        await session.loadDefinition()
        const saved = session.definitionDataSet?.resourceRelations?.find(item => item.sourceRelationId === 'DBREL')
        if (field === 'delete') expect(saved).toBeUndefined()
        else expect(saved?.[field as keyof DataResourceRelation]).toEqual(field === 'filterExpression' ? native.filterExpression : field === 'cascadeDelete' ? true : 'CHANGED')
        expect(storage.writes).toBe(1)
        expect(session.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows[0]?.['filter']).toBe('retained original')
      }
      expect(view.rows).toHaveLength(field === 'delete' ? 1 : 2)
    } finally {session.dispose()}
  })

  it('saves only the selected definitions and discards only the requested draft', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const relations = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      const views = session.metadataDataSet.getView('DataViewDefinition', 'default')!
      const relationKey = relations.getPkKey(relations.rows.find(row => row['relationId'] === 'LOCAL')!)!
      relations.updateEditingValue(relationKey, 'relationName', 'Unsaved')
      await expect(session.refresh()).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})
      expect(storage.writes).toBe(0)
      views.updateEditingValue(views.getPkKey(views.rows[0]!)!, 'pageSize', 31)
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})
      expect(JSON.parse(storage.stored!).resourceRelations).toContainEqual({...native, relationName: 'Unsaved'})
      expect(JSON.parse(storage.stored!).tables.Parents.views.default).not.toHaveProperty('pageSize')
      expect(views.getEditingRow(views.getPkKey(views.rows[0]!)!)?.['pageSize']).toBe(31)
      relations.updateEditingValue(relationKey, 'relationName', 'Next draft')
      session.metadataDataSet.getView('DataViewDefinition', 'default')!.discardPendingChanges()
      expect(relations.getEditingRow(relationKey)?.['relationName']).toBe('Next draft')
      session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!.discardPendingChanges()
      await session.refresh()
      expect(relations.rows.find(row => row['relationId'] === 'LOCAL')?.['relationName']).toBe('Unsaved')
      expect(storage.writes).toBe(1)
    } finally {session.dispose()}
  })

  it.each(['self', 'other', 'refresh', 'scope', 'dispose'])('preserves captured saves and rejects invalid lifecycle results for %s', async mode => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    const view = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
    const key = view.getPkKey(view.rows.find(row => row['relationId'] === 'LOCAL')!)!
    if (mode !== 'refresh') view.updateEditingValue(key, 'relationName', 'First')
    let release!: () => void
    const entered = storage.hold(new Promise(resolve => {release = resolve}))
    const pending = mode === 'refresh' ? session.refresh() : session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
    await entered
    if (mode === 'scope') storage.changeScope()
    else if (mode === 'dispose') session.dispose()
    else if (mode === 'other') {
      const other = session.metadataDataSet.getView('DataViewDefinition', 'default')!
      other.updateEditingValue(other.getPkKey(other.rows[0]!)!, 'pageSize', 99)
    } else view.updateEditingValue(key, 'relationName', 'Later')
    release()
    if (mode === 'self' || mode === 'other') {
      await expect(pending).resolves.toMatchObject({success: true})
      expect(JSON.parse(storage.stored!).resourceRelations).toContainEqual({...native, relationName: 'First'})
      expect(storage.writes).toBe(1)
      if (mode === 'self') expect(view.getEditingRow(key)?.['relationName']).toBe('Later')
      else {
        const other = session.metadataDataSet.getView('DataViewDefinition', 'default')!
        expect(other.getEditingRow(other.getPkKey(other.rows[0]!)!)?.['pageSize']).toBe(99)
        expect(JSON.parse(storage.stored!).tables.Parents.views.default).not.toHaveProperty('pageSize')
      }
    } else {
      await expect(pending).rejects.toThrow(/STALE|DIRTY|DATA_VIEW_UNSAVED_CHANGES|SCENARIO_DEFINITION_IDENTITY/)
      if (mode === 'refresh') expect(view.getEditingRow(key)?.['relationName']).toBe('Later')
      expect(storage.stored).toBe(initial)
      expect(storage.writes).toBe(0)
    }
    session.dispose()
  })

  it('surfaces adapter diagnostics without deleting source metadata or pretending a complete relation set', async () => {
    const storage = fixture()
    storage.relations(formal.map(item => ({...item, filterExpression: DataViewFilter.condition({field: 'missing', operator: 'eq', value: 1})})))
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(session.definitionDiagnostics).toEqual([expect.stringContaining('DBREL')])
      expect(Object.isFrozen(session.definitionDiagnostics)).toBe(true)
      expect(session.definitionDataSet?.resourceRelations).toEqual([native])
      expect(session.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows).toHaveLength(1)
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      view.updateEditingValue(view.getPkKey(view.rows[0]!)!, 'relationName', 'Incomplete import')
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})).rejects.toThrow('SCENARIO_DEFINITION_LEGACY')
      expect(storage.writes).toBe(0)
      expect(storage.stored).toBe(initial)
      session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!.discardPendingChanges()
      storage.relations(formal)
      await session.refresh()
      expect(session.definitionDiagnostics).toEqual([])
    } finally {session.dispose()}
  })

  it('rejects native migration when a legacy record has no converted endpoints', async () => {
    const storage = fixture()
    storage.relations([{...formal[0]!, childModelId: 'UNBOUND'}])
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(session.definitionDiagnostics).toEqual([])
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      view.updateEditingValue(view.getPkKey(view.rows[0]!)!, 'relationName', 'Incomplete import')
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})).rejects.toThrow('SCENARIO_DEFINITION_LEGACY')
      expect(storage.writes).toBe(0)
      expect(storage.stored).toBe(initial)
      expect(session.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows).toHaveLength(1)
    } finally {session.dispose()}
  })

  it('retains a broken file reference for repair even if definition assembly fails', async () => {
    const storage = fixture(JSON.stringify({...base, resourceRelations: [{sourceRelationId: 'MISSING', parentTable: 'Parents', childTable: 'Children'}]}))
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(session.definitionError).not.toBeNull()
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      expect(view.rows).toHaveLength(1)
      await view.removeRow(view.getPkKey(view.rows[0]!)!)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
      await session.loadDefinition()
      expect(session.definitionError).toBeNull()
      expect(session.definitionDataSet?.resourceRelations?.[0]?.sourceRelationId).toBe('DBREL')
      expect(JSON.parse(storage.stored!).resourceRelations).toEqual([])
      expect(JSON.parse(storage.stored!)).not.toHaveProperty('schemaVersion')
      expect(storage.writes).toBe(1)
    } finally {session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = reopened.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      const source = view.rows.find(row => row['sourceRelationId'] === 'DBREL')!
      expect(source).toMatchObject({parentTable: 'Parents', childTable: 'Children', filterExpression: formal[0]!.filterExpression.toJSON()})
      view.updateEditingValue(view.getPkKey(source)!, 'relationName', 'Repaired and converted')
      expect((await reopened.metadataDataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})).success).toBe(true)
      expect(JSON.parse(storage.stored!)).toMatchObject({schemaVersion: 2, resourceRelations: [{sourceRelationId: 'DBREL', relationName: 'Repaired and converted'}]})
      expect(reopened.metadataDataSet.getView('Base_DataModel_Relation')?.rows[0]?.['filter']).toBe('retained original')
      expect(storage.writes).toBe(2)
    } finally {reopened.dispose()}
    const native = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(native.definitionDataSet?.resourceRelations).toHaveLength(1)
      expect(native.definitionDataSet?.resourceRelations?.[0]?.relationName).toBe('Repaired and converted')
    } finally {native.dispose()}
  })

  it('keeps missing configuration explicit and does not create fake backend models', async () => {
    const storage = fixture(null)
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')?.rows).toEqual([])
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})
      expect(storage.stored).toBeNull()
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it('verifies unknown file saves without replaying metadata writes', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      const row = view.rows.find(item => item['relationId'] === 'LOCAL')!
      view.updateEditingValue(view.getPkKey(row)!, 'relationName', 'Saved')
      storage.loseNextResponse()
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})).rejects.toThrow('response lost')
      expect(view.getEditingRow(view.getPkKey(row)!)?.['relationName']).toBe('Saved')
      expect((await session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})).success).toBe(true)
      expect(storage.writes).toBe(1)
      await session.loadDefinition()
      expect(session.definitionDataSet?.resourceRelations).toContainEqual({...native, relationName: 'Saved'})
    } finally {session.dispose()}
  })

  it('preserves original bytes for unchanged definitions and clears an extension without deleting the source', async () => {
    const ref = {sourceRelationId: 'DBREL', parentTable: 'Parents', childTable: 'Children', relationName: 'Extension', cascadeUpdate: false}
    const text = JSON.stringify({...base, resourceRelations: [native, ref]}, null, 2)
    const storage = fixture(text)
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
      expect(storage.stored).toBe(text)
      expect(storage.writes).toBe(0)
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      const row = view.rows.find(item => item['sourceRelationId'] === 'DBREL')!
      const key = view.getPkKey(row)!
      view.updateEditingValue(key, 'relationName', undefined)
      view.updateEditingValue(key, 'cascadeUpdate', undefined)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
      expect(JSON.parse(storage.stored!).resourceRelations).toContainEqual({relationId: 'DBREL:Parents:Children', sourceRelationId: 'DBREL', parentTable: 'Parents', childTable: 'Children', filterExpression: formal[0]!.filterExpression.toJSON(), cascadeDelete: false})
      await session.loadDefinition()
      expect(session.definitionDataSet?.resourceRelations?.find(item => item.sourceRelationId === 'DBREL')).not.toHaveProperty('relationName')
    } finally {session.dispose()}
  })

  it.each([
    {field: 'filterExpression', value: {field: 'missing', operator: 'eq', value: 1}},
    {field: 'filterExpression', value: {field: 'id', operator: 'eq', value: Number.NaN}},
    {field: 'filterExpression', value: {field: 'id', operator: 'eq', value: new Date('2026-10-09T00:00:00Z')}},
    {field: 'relationId', value: ''}, {field: 'dataSetId', value: 'OTHER'}, {field: 'rows', value: []},
  ])('retains invalid $field edits without changing the shared file', async ({field, value}) => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      const key = view.getPkKey(view.rows.find(row => row['relationId'] === 'LOCAL')!)!
      view.updateEditingValue(key, field, value)
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})).rejects.toThrow()
      expect(view.getEditingRow(key)?.[field]).toEqual(value)
      expect(session.viewState?.text).toBe(initial)
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it('retains file and metadata edits separately after an external change and invalidates old diagnostics', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      const key = view.getPkKey(view.rows.find(row => row['relationId'] === 'LOCAL')!)!
      view.updateEditingValue(key, 'relationName', 'Draft')
      const remote = JSON.stringify({...base, resourceRelations: [{...native, relationName: 'Other editor'}]})
      owner.workspace.getScenarioViews('SPACE')!.setText(remote)
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})).rejects.toThrow('SCENARIO_DEFINITION_FILE_STATE')
      expect(() => session.definitionDiagnostics).toThrow('SESSION_STALE')
      expect(view.getEditingRow(key)?.['relationName']).toBe('Draft')
      session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!.discardPendingChanges()
      await session.refresh()
      expect(view.rows.find(row => row['relationId'] === 'LOCAL')?.['relationName']).toBe('Other editor')
    } finally {session.dispose()}
  })

  it('releases loaded metadata if a definition model name conflicts', async () => {
    const owner = fixture().openOwner()
    owner.metadata.addTable('DataResourceRelationDefinition', [{name: 'id', type: 'string'}])
    await expect(owner.service.openDesignSession('SPACE')).rejects.toThrow(/already exists/)
    expect(owner.metadata.destroyed).toBe(true)
  })
})
