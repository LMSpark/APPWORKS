import {createConfirmedMetadataFixture, withDefinitionResources} from '../view-design/definition-resource.fixture'
import {describe, expect, it} from 'vitest'
import {DataSet, DataViewFilter, type DataResourceRelation} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import {LowcodeDataSpaceViewDesign} from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-design'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type FormalRelations = Awaited<ReturnType<DataSpaceDesignApi['readRelations']>>
const tables = {
  Parents: {modelBinding: {modelId: 'P', modelName: 'P'},
    columns: [{name: 'total', type: 'number', computeExpression: "$sum('Children', 'amount')"}], views: {default: {}}},
  Children: {modelBinding: {modelId: 'C', modelName: 'C'}, views: {default: {}}},
}
const initial = JSON.stringify({scenarioId: 'SPACE', tables})
const relationSave = {views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]}
const native: DataResourceRelation = {relationId: 'NATIVE', relationName: 'Eligible children',
  parentTable: 'Parents', childTable: 'Children', cascadeUpdate: true, cascadeDelete: false,
  filterExpression: {logic: 'and', filters: [
    {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}},
    {logic: 'or', filters: [
      {field: 'amount', operator: 'gte', value: {Type: 'GetTableField', Field: 'minimum'}},
      {field: 'kind', operator: 'eq', value: 'bonus'},
    ]},
  ]}}
const reference = {sourceRelationId: 'REL', parentTable: 'Parents', childTable: 'Children',
  relationName: 'Source extension', cascadeUpdate: true}
const sourceRelations: FormalRelations = [{sourceRelationId: 'REL', dataSpaceId: 'SPACE',
  parentModelId: 'P', childModelId: 'C', parentResourceName: 'ParentSource', childResourceName: 'ChildSource',
  filterExpression: DataViewFilter.condition({field: 'ChildSource.parentId', operator: 'eq',
    value: {Type: 'GetTableField', Field: 'ParentSource.id'}}), dependencyType: 'currentRow', cascadeDelete: false}]

function model(id: string, sourceName: string, fields: readonly string[]): FormalModel {
  return {id, name: id, metaName: id, sourceName, sourceId: 'DB', sourceType: 'table',
    primaryKey: 'id', businessMain: false, raw: {}, fields: fields.map((name, order) => ({
      id: `${id}-${name}`, modelId: id, name, canonicalName: name,
      type: ['minimum', 'amount'].includes(name) ? 'number' : 'string', primaryKey: name === 'id',
      description: '', output: true, computed: false, order, orderType: '', raw: {},
    }))}
}

class QueryHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (config.url !== '/api/DataOperation/GetData' || !isRecord(config.data)
      || !Array.isArray(config.data['Table']) || !isRecord(config.data['Table'][0])) throw new Error('unexpected request')
    const name = config.data['Table'][0]['Name']
    if (name !== 'P' && name !== 'C') throw new Error('unexpected model')
    const rows = name === 'P' ? [{id: 'P1', minimum: 10}] : [
      {id: 'C1', parentId: 'P1', amount: 12, kind: 'normal'},
      {id: 'C2', parentId: 'P1', amount: 5, kind: 'normal'},
      {id: 'C3', parentId: 'P1', amount: 3, kind: 'bonus'},
      {id: 'C4', parentId: 'OTHER', amount: 20, kind: 'normal'},
    ]
    return {data: {Code: 200, Result: {primaryKeyField: 'id', allowAdd: false,
      data: {Items: rows, Count: rows.length}}}, status: 200, statusText: 'OK', headers: {}}
  }
}

function fixture(relations: FormalRelations = [], text = initial) {
  let stored = text
  let writes = 0
  let loseResponse = false
  let currentRelations = relations
  const models = [model('P', 'ParentSource', ['id', 'minimum']), model('C', 'ChildSource', ['id', 'parentId', 'amount', 'kind'])]
  const openOwner = () => {
    const workspace = new ProjectWorkspace({projectId: 'APP',
      blueprint: {},
      scenarioViews: {readScope: () => 'SCOPE',
        readText: async id => {expect(id).toBe('SPACE'); return stored},
        writeText: async (id, value) => {
          expect(id).toBe('SPACE'); stored = value; writes++
          if (loseResponse) {loseResponse = false; throw new Error('response lost')}
        }},
    })
    const http = new QueryHttp()
    const assembler = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({http,
      readScope: () => ({token: 'SCOPE', headers: {}})}), http)
    const service = new LowcodeDataSpaceViewDesign({workspace,
      loadMetadata: withDefinitionResources(async targetId => createConfirmedMetadataFixture(targetId)),
      assertScope: () => undefined,
      readModel: async input => {
        const found = models.find(item => item.id === input.modelId)
        if (!found) throw new Error('model missing')
        return found
      },
      assemble: async ({scenarioId: id, config}) => assembler.assemble({config,
        space: {dataSpaceId: id, name: id}, models, relations: currentRelations}),
    })
    return {service, http}
  }
  return {openOwner, get stored() {return stored}, get writes() {return writes},
    setRelations: (next: FormalRelations) => {currentRelations = next}, loseNextResponse: () => {loseResponse = true}}
}

function config(resourceRelations: unknown, extraTables = {}) {
  return JSON.stringify({scenarioId: 'SPACE', tables: {...tables, ...extraTables}, resourceRelations})
}

describe('native model relation persistence', () => {
  it('uses the same source extension rules for directory endpoints and full relations without fabricating a filter', () => {
    const source = {relationId: 'REL:Parents:Children', sourceRelationId: 'REL', parentTable: 'Parents', childTable: 'Children'}
    const definition = new ScenarioViewConfig('SPACE', config([reference, native]))
    const before = definition.toJSON()
    const endpoints = definition.resolveResourceRelationEndpoints([source])
    expect(endpoints[0]).toEqual({...source, relationName: reference.relationName, cascadeUpdate: true})
    expect(endpoints[1]).toMatchObject({relationId: 'NATIVE', parentTable: 'Parents', childTable: 'Children'})
    expect(endpoints.every(endpoint => !('filterExpression' in endpoint))).toBe(true)
    const complete = definition.resolveResourceRelations([{...source,filterExpression:native.filterExpression}])
    expect(complete.map(({relationId,parentTable,childTable,sourceRelationId}) => ({relationId,parentTable,childTable,sourceRelationId})))
      .toEqual(endpoints.map(({relationId,parentTable,childTable,sourceRelationId}) => ({relationId,parentTable,childTable,sourceRelationId})))
    expect(complete[0]?.filterExpression).toEqual(native.filterExpression)
    expect(definition.toJSON()).toBe(before); expect(source).not.toHaveProperty('relationName')
  })

  it('keeps native empty endpoints empty and rejects ambiguous legacy extensions and identity collisions', () => {
    const source = {relationId: 'REL:Parents:Children', sourceRelationId: 'REL', parentTable: 'Parents', childTable: 'Children'}
    const nativeEmpty = new ScenarioViewConfig('SPACE', JSON.stringify({scenarioId:'SPACE',tables,schemaVersion:2,resourceRelations:[]}))
    expect(nativeEmpty.resolveResourceRelationEndpoints([source])).toEqual([])
    const legacy = new ScenarioViewConfig('SPACE', config([reference]))
    for (const inherited of [[], [source,source], [{...source,parentTable:'Other'}]]) {
      expect(() => legacy.resolveResourceRelationEndpoints(inherited)).toThrow('来源引用未唯一解析')
    }
    const conflict = new ScenarioViewConfig('SPACE', config([{...native,relationId:source.relationId}]))
    expect(() => conflict.resolveResourceRelationEndpoints([source])).toThrow('关系ID冲突')
  })
  it('creates, edits, cancels and deletes a full relation and restores its runtime indexes without locally aggregating remote rows', async () => {
    const storage = fixture()
    const variants = [native, {...native, relationName: 'Bonus only', cascadeDelete: true,
      filterExpression: {logic: 'and' as const, filters: [
        {field: 'parentId', operator: 'eq' as const, value: {Type: 'GetTableField', Field: 'id'}},
        {field: 'kind', operator: 'eq' as const, value: 'bonus'},
      ]}}, null]
    for (const [index, relation] of variants.entries()) {
      const owner = storage.openOwner()
      const session = await owner.service.openDesignSession('SPACE')
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition')!
      if (index === 0) {
        await view.addRow({...native})
        view.discardPendingChanges()
        expect(view.rows).toEqual([])
      }
      const row = view.rows.find(item => item['relationId'] === native.relationId)
      if (!relation) expect(await view.removeRow(view.getPkKey(row!)!)).toBe(true)
      else if (!row) expect(await view.addRow({...relation})).toBeDefined()
      else for (const [name, value] of Object.entries(relation)) view.updateEditingValue(view.getPkKey(row)!, name, value)
      expect(storage.writes).toBe(index)
      expect((await session.metadataDataSet.saveChanges(relationSave)).success).toBe(true)
      expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(JSON.parse(storage.stored).schemaVersion).toBe(2)
      session.dispose()
      const reopenedOwner = storage.openOwner()
      const reopened = await reopenedOwner.service.openDesignSession('SPACE')
      try {
        const dataSet = reopened.definitionDataSet!
        expect(dataSet.resourceRelations).toEqual(relation ? [relation] : [])
        expect(dataSet.getResourceChildRelations('Parents')).toEqual(relation ? [relation] : [])
        expect(dataSet.getResourceParentRelations('Children')).toEqual(relation ? [relation] : [])
        expect(dataSet.viewCascades).toEqual([])
        const children = dataSet.getView('Children', 'default')!
        const parents = dataSet.getView('Parents', 'default')!
        await children.loadFromServer()
        await parents.loadFromServer()
        expect(parents.rows).toHaveLength(1)
        expect(children.rows).toHaveLength(4)
        expect(parents.supportsLocalAggregates).toBe(false)
        expect(parents.rows[0]?.['total']).toBeUndefined()
        expect(parents.fieldAccess(parents.rows[0]!, 'total').read).toBe('invisible')
        expect(parents.computedColumnError('total')?.message).toContain('DATA_VIEW_REMOTE_COMPUTED_AGGREGATE')
        expect(reopenedOwner.http.requests).toHaveLength(2)
        expect(reopened.viewState?.dirty).toBe(false)
        expect(storage.stored).not.toMatch(/"rows"|sourceRelationId|ParentSource|ChildSource/)
      } finally {reopened.dispose()}
    }
    expect(storage.writes).toBe(3)
  })

  it('reads legacy DB extensions per binding pair, then saves full native relations independent of later DB changes', async () => {
    const moreTables = {OtherParents: tables.Parents}
    const legacy = config([reference], moreTables)
    const storage = fixture(sourceRelations, legacy)
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    expect(session.definitionDataSet?.resourceRelations).toHaveLength(2)
    session.dispose()
    expect(JSON.parse(storage.stored).resourceRelations).toEqual([reference])
    expect(storage.writes).toBe(0)
    storage.setRelations(sourceRelations.map(item => ({...item, cascadeDelete: true,
      filterExpression: DataViewFilter.condition({field: 'ChildSource.amount', operator: 'gt', value: 8})})))
    const reopened = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(reopened.definitionDataSet?.resourceRelations).toEqual([
        {relationId: 'REL:Parents:Children', ...reference, cascadeDelete: true,
          filterExpression: {field: 'amount', operator: 'gt', value: 8}},
        {relationId: 'REL:OtherParents:Children', sourceRelationId: 'REL', parentTable: 'OtherParents',
          childTable: 'Children', cascadeDelete: true, filterExpression: {field: 'amount', operator: 'gt', value: 8}},
      ])
      const view = reopened.metadataDataSet.getView('DataResourceRelationDefinition')!
      const row = view.rows.find(item => item['parentTable'] === 'Parents')!
      view.updateEditingValue(view.getPkKey(row)!, 'relationName', undefined)
      view.updateEditingValue(view.getPkKey(row)!, 'cascadeUpdate', undefined)
      expect((await reopened.metadataDataSet.saveChanges(relationSave)).success).toBe(true)
      expect(JSON.parse(storage.stored).schemaVersion).toBe(2)
      expect(JSON.parse(storage.stored).resourceRelations).toHaveLength(2)
      expect(storage.writes).toBe(1)
    } finally {reopened.dispose()}
    storage.setRelations([])
    const nativeOwner = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(nativeOwner.definitionDataSet?.resourceRelations).toEqual(JSON.parse(storage.stored).resourceRelations)
      expect(nativeOwner.definitionDataSet?.resourceRelations).toHaveLength(2)
      expect(nativeOwner.definitionDataSet?.resourceRelations?.[0]).not.toHaveProperty('relationName')
      expect(nativeOwner.definitionDataSet?.resourceRelations?.[0]).not.toHaveProperty('cascadeUpdate')
    } finally {nativeOwner.dispose()}
  })

  it.each([undefined, []].map(value => ({value})))('retains existing DB relations for absent or empty file definitions: $value', async ({value}) => {
    const storage = fixture(sourceRelations, config(value))
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(session.definitionDataSet?.resourceRelations).toHaveLength(1)
      expect(session.definitionDataSet?.resourceRelations?.[0]?.sourceRelationId).toBe('REL')
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it.each([
    [{...reference, sourceRelationId: 'MISSING'}],
    [{...reference, parentTable: 'Children'}],
    [reference, reference],
  ].map(entries => ({entries})))('rejects invalid legacy references while reading, without rewriting the input: $entries', ({entries}) => {
    const text = config(entries)
    expect(() => new ScenarioViewConfig('SPACE', text).resolveResourceRelations([
      {relationId: 'REL:Parents:Children', sourceRelationId: 'REL', parentTable: 'Parents', childTable: 'Children', filterExpression: native.filterExpression},
    ])).toThrow()
    expect(config(entries)).toBe(text)
  })

  it.each([
    [{...native, relationId: 'REL:Parents:Children'}],
    [native, native],
    [{...native, filterExpression: {field: 'missing', operator: 'eq', value: 1}}],
    [{...native, filterExpression: {field: 'amount', operator: 'eq', value: {Type: 'GetTableField', Field: 'missing'}}}],
  ].map(entries => ({entries})))('rejects native identity or field errors on save and retains edits for cancellation: $entries', async ({entries}) => {
    const storage = fixture(sourceRelations)
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition')!
      for (const entry of entries) await view.addRow({...entry})
      await expect(session.metadataDataSet.saveChanges(relationSave)).rejects.toThrow()
      expect(session.viewState?.text).toBe(initial)
      expect(session.definitionDataSet?.resourceRelations).toHaveLength(1)
      expect(storage.stored).toBe(initial)
      expect(storage.writes).toBe(0)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
      view.discardPendingChanges()
      expect(view.rows).toHaveLength(1)
      expect((await session.metadataDataSet.saveChanges(relationSave)).success).toBe(true)
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it.each(['missing', 'untranslatable', 'ambiguous'])('rejects a legacy source extension on reopen when its DB source is %s', async state => {
    const legacy = config([reference])
    const storage = fixture(sourceRelations, legacy)
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    storage.setRelations(state === 'missing' ? [] : state === 'ambiguous' ? [...sourceRelations, ...sourceRelations]
      : sourceRelations.map(item => ({...item, filterExpression: DataViewFilter.condition({field: 'unknown', operator: 'eq', value: 1})})))
    try {
      const reopened = await storage.openOwner().service.openDesignSession('SPACE')
      try {expect(reopened.definitionError?.message).toMatch(/来源|引用/)} finally {reopened.dispose()}
      expect(session.viewState?.text).toBe(legacy)
      expect(storage.stored).toBe(legacy)
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it('verifies an unknown save without replaying the write and reopens the confirmed relationship', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition')!
      await view.addRow({...native})
      storage.loseNextResponse()
      await expect(session.metadataDataSet.saveChanges(relationSave)).rejects.toThrow()
      expect(storage.writes).toBe(1)
      expect(session.viewState?.saveStatus).toBe('unknown')
      expect((await session.metadataDataSet.saveChanges(relationSave)).success).toBe(true)
      expect(session.viewState).toMatchObject({saveStatus: 'idle', dirty: false})
      expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(storage.writes).toBe(1)
    } finally {session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession('SPACE')
    expect(reopened.definitionDataSet?.resourceRelations).toEqual([native])
    reopened.dispose()
  })

  it.each([
    null, {}, [{}], [{...native, parentField: 'id'}], [{...native, relationId: ' '}],
    [{...native, cascadeUpdate: 'true'}], [{...native, parentTable: 'UNKNOWN'}],
    [{...reference, relationId: 'COPIED'}], [{...reference, cascadeDelete: false}],
    [{...reference, filterExpression: native.filterExpression}],
  ].map(entries => ({entries})))('rejects malformed or duplicated-source configuration: $entries', ({entries}) => {
    expect(() => new ScenarioViewConfig('SPACE', config(entries))).toThrow()
  })

  it.each([
    {Type: 'GetRefData', RefTableName: 'Parents', RefFieldName: 'minimum', FkFieldName: 'id', FkFieldValue: 'P1'},
    {Type: 'GetGroupData', GroupTableName: 'Children', GroupField: 'parentId', Field: 'amount', ValType: 'sum'},
    {Type: 'GetExpData', refTableName: 'Parents', Exp: 'minimum + 1'},
    {Type: 'BackendExtension', payload: {ids: [0, false, 'a,b'], text: 'preserve'}},
  ])('round-trips structured or opaque value functions without claiming local execution: %j', async value => {
    const relation = {...native, filterExpression: {field: 'amount', operator: 'gte' as const, value}}
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      await session.metadataDataSet.getView('DataResourceRelationDefinition')!.addRow({...relation})
      expect((await session.metadataDataSet.saveChanges(relationSave)).success).toBe(true)
    } finally {session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession('SPACE')
    try {expect(reopened.definitionDataSet?.resourceRelations).toEqual([relation])} finally {reopened.dispose()}
  })

  it.each([
    {Type: 'GetRefData', RefTableName: 'Parents', RefFieldName: 'missing', FkFieldName: 'id'},
    {Type: 'GetGroupData', GroupTableName: 'Children', GroupField: 'missing', Field: 'amount'},
    {Type: 'GetExpData', refTableName: 'MISSING', Exp: 'minimum'},
    {Type: 'GetTableField', Field: 'MISSING.id'},
  ])('rejects explicit unresolved structured references: %j', async value => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataResourceRelationDefinition')!
      await view.addRow({...native, filterExpression: {field: 'amount', operator: 'eq', value}})
      await expect(session.metadataDataSet.saveChanges(relationSave)).rejects.toThrow(/引用/)
      expect(session.viewState?.text).toBe(initial)
      expect(storage.writes).toBe(0)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
      view.discardPendingChanges()
    } finally {session.dispose()}
  })

  it('isolates resolved relations from both the immutable configuration and inherited runtime objects', () => {
    const parsed = new ScenarioViewConfig('SPACE', config([native, reference]))
    const inherited: DataResourceRelation[] = [{relationId: 'REL:Parents:Children', sourceRelationId: 'REL',
      parentTable: 'Parents', childTable: 'Children', filterExpression: {field: 'kind', operator: 'eq', value: 'normal'}}]
    const before = JSON.stringify(inherited)
    const first = parsed.resolveResourceRelations(inherited)
    first[0]!.relationName = 'Changed runtime'
    first[1]!.filterExpression = {field: 'id', operator: 'eq', value: 'different'}
    const second = parsed.resolveResourceRelations(inherited)
    expect(second[0]?.relationName).toBe(reference.relationName)
    expect(second[1]).toEqual(native)
    expect(JSON.stringify(inherited)).toBe(before)
    expect(parsed.toJSON()['resourceRelations']).toEqual([native, reference])
    expect(Object.isFrozen(parsed.toJSON()['resourceRelations'])).toBe(true)
  })
})
