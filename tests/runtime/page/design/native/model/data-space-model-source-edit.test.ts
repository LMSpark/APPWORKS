import {afterEach, describe, expect, it, vi} from 'vitest'
import {dataSpacePageFixture} from '../data-space-page.fixture'
import {RequestState} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => {vi.restoreAllMocks(); fixtures.splice(0).forEach(f => f.dispose())})
const source = {type: 'table' as const, id: 'NEXT', name: 'NextOrders', description: '新来源', dbid: 'DB2', databaseName: 'new-database', providerId: ''}
const field = {type: 'dataModel' as const, Name: 'rowid', description: 'ID', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
  AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
const prepared = {source, model: {Type: '数据库表', MetaName: source.name, description: source.description, DbId: source.dbid, DbName: source.databaseName,
  JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: [field, {...field, Name: 'parentId', IsPKey: 0}, {...field, Name: 'extra', IsPKey: 0}]}
async function setup(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  type Reader = NonNullable<NonNullable<Parameters<typeof dataSpacePageFixture>[0]>['modelSources']>
  type Prepared = Awaited<ReturnType<Reader['prepare']>>
  const reader = {query: vi.fn(async (): Promise<Awaited<ReturnType<Reader['query']>>> => ({rows: [source], total: 1})), prepare: vi.fn(async (): Promise<Prepared> => structuredClone(prepared))}
  const f = dataSpacePageFixture({allowSourceEdit: true, modelSources: reader,
    sourceFields: [field, {...field, Name: 'parentId', IsPKey: 0}].map((row, i) => ({...row, rowid: `F${i + 1}`, dataModelId: 'M1'})), ...options})
  fixtures.push(f)
  const session = await f.open('A'), owner = session.getModelSourceEdit('M1')
  await owner.preview(source)
  return {f, session, owner, reader, writes: () => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}

async function synchronize(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const result = await setup({allowFieldAdd: true, allowDelete: true, sourceFields: [
    {...field, rowid: 'F1', dataModelId: 'M1'},
    {...field, rowid: 'F2', dataModelId: 'M1', Name: 'removed', IsPKey: 0, IsOutput: 0},
    {...field, rowid: 'C1', dataModelId: 'M1', Name: 'computed', FieldType: '计算字段', IsPKey: 0},
  ], ...options})
  result.owner.discard()
  const bound = {...source, id: 'CURRENT', name: 'OrderSource', dbid: 'DB', databaseName: 'old-database'}
  result.reader.query.mockResolvedValue({rows: [bound], total: 1})
  result.reader.prepare.mockResolvedValue({...prepared, source: bound, model: {...prepared.model, MetaName: bound.name, DbId: bound.dbid, DbName: bound.databaseName},
    fields: [field, {...field, Name: 'newField', IsPKey: 0, IsOutput: 0}]})
  await result.owner.previewBoundSource()
  return result
}

async function synchronizeInputs(type: 'interface' | 'logicView') {
  const bound = {...source, type, id: 'RESOURCE', name: 'OrderSource', dbid: '', providerId: 'PROVIDER'}
  const oldValue = ' {"Type":"GetConstValue","Value":false} '
  const input = {...field, type: 'inputParams' as const, IsPKey: 0, IsOutput: 0}
  const reader = {query: vi.fn(async () => ({rows: [bound], total: 1})), prepare: vi.fn(async () => ({source: bound,
    model: {...prepared.model, Type: type === 'interface' ? '接口' : '视图', MetaName: bound.name,
      DbId: type === 'interface' ? bound.providerId : bound.id},
    fields: [field, {...input, Name: 'existingArg'}, {...input, Name: 'newArg'}]}))}
  const f = dataSpacePageFixture({overviewOnly: true, deferDefinition: true, formalSourceInputs: true,
    allowSourceEdit: true, allowFieldAdd: true, modelSources: reader, businessRows: {Orders: [{rowid: 'ONE'}, {rowid: 'TWO'}]},
    sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}, {...input, rowid: 'P1', dataModelId: 'M1', Name: 'existingArg', ValueFun: oldValue}]})
  fixtures.push(f); f.setModelValues({Type: type === 'interface' ? '接口' : '视图', DbId: type === 'interface' ? bound.providerId : bound.id})
  const session = await f.open('A'), owner = session.getModelSourceEdit('M1')
  await owner.previewBoundSource()
  return {f, session, owner, reader, oldValue, writes: () => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}

describe('complete source model columns', () => {
  async function schemaCase(operation: 'replace' | 'synchronize', conflict?: 'formal' | 'local') {
    const bound = {...source, id: 'CURRENT', name: 'OrderSource', dbid: 'DB', databaseName: 'old-database'}
    const selected = operation === 'replace' ? source : bound
    const next = {...prepared, source: selected, model: {...prepared.model, MetaName: selected.name, DbId: selected.dbid, DbName: selected.databaseName},
      fields: [field, {...field, Name: 'newField', IsPKey: 0, IsOutput: 0}]}
    const reader = {query: vi.fn(async () => ({rows: [bound], total: 1})), prepare: vi.fn(async () => structuredClone(next))}
    const f = dataSpacePageFixture({formalProjection: true, overviewOnly: true, deferDefinition: true, allowSourceEdit: true,
      allowFieldAdd: true, modelSources: reader, sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'},
        ...conflict === 'formal' ? [{...field, rowid: 'CALC', dataModelId: 'M1', Name: 'computed', AsName: 'newField', FieldType: '计算字段', IsPKey: 0, IsOutput: 0}] : []]})
    fixtures.push(f)
    const configuration = {scenarioId: 'A', schemaVersion: 2, tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'},
      ...conflict === 'local' ? {columns: [{name: 'newField', type: 'number', computeExpression: '1'}]} : {}, views: {default: {}, shared: {pageSize: 7}}}}}
    f.stored.set('A', JSON.stringify(configuration))
    const session = await f.open('A'), owner = session.getModelSourceEdit('M1')
    if (operation === 'replace') {await owner.preview(source); await owner.includeField({sourceName: 'newField', included: true})}
    else await owner.previewBoundSource()
    return {f, session, owner, configuration, writes: () => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
  }

  it.each((['replace', 'synchronize'] as const).flatMap(operation => (['formal', 'local'] as const).map(conflict => ({operation, conflict}))))(
    'blocks $operation when the complete candidate conflicts with a $conflict column before accepting or submitting', async ({operation, conflict}) => {
      const {f, session, owner, configuration, writes} = await schemaCase(operation, conflict)
      expect.soft(owner.getState().preview?.problems.join('；')).toMatch(conflict === 'formal' ? /字段重复/ : /本地计算列/)
      await expect(owner.save()).rejects.toThrow(conflict === 'formal' ? /字段重复/ : /本地计算列/)
      expect(writes()).toEqual([]); expect(f.fileWrites).toEqual([])
      expect(f.stored.get('A')).toBe(JSON.stringify(configuration))
      owner.discard()
      expect(owner.getState()).toMatchObject({status: 'idle', pending: false})
      expect(session.metadataDataSet.getTable('Base_DataModel_Field')!.viewList.every(view => !view.hasEditingChanges() && !view.dirtyTracking.hasPendingChanges())).toBe(true)
    })

  it.each(['replace', 'synchronize'] as const)('saves a valid %s candidate and independently reopens its model and two view projections', async operation => {
    const {f, owner, configuration, writes} = await schemaCase(operation)
    expect(owner.getState().preview?.problems).toEqual([])
    await owner.save()
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toEqual([])
    const reopened = await f.open('A'), definitions = await reopened.loadModelFields('M1')
    const output = operation === 'replace' ? 1 : 0
    expect(definitions.rows.find(row => row['Name'] === 'newField')).toMatchObject({IsOutput: output, IsPKey: 0})
    await reopened.loadDefinition()
    const table = reopened.definitionDataSet!.getTable('OrdersAlias')!
    expect(table.columns.some(column => column.name === 'newField')).toBe(true)
    for (const viewId of ['default', 'shared']) expect(table.getOrCreateView(viewId).fieldProjection.find(column => column.resourceField === 'newField')?.output).toBe(output === 1)
    expect(f.stored.get('A')).toBe(JSON.stringify(configuration))
  })
})

describe('source edit capture recovery A3.3', () => {
  it('does not abandon an unrelated sibling view capture while verifying this source edit', async () => {
    const {owner, session, f, writes} = await setup({allowFieldEdit: true})
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()

    const sibling = session.metadataDataSet.getView('Base_DataSet', 'default')!
    sibling.updateEditingValue('A', 'inputParams', '[{"rowid":"P1","Name":"sibling change"}]')
    expect(sibling.hasEditingChanges('A')).toBe(true)
    expect((await sibling.applyEditingRows(['A'])).success).toBe(true)
    f.loseNextResponse()
    await expect(session.metadataDataSet.saveChanges({applyEditingRows: false, views: [
      {tableName: sibling.tableName, viewId: sibling.viewId, ids: ['A']},
    ]})).rejects.toThrow()
    expect(sibling.hasUnconfirmedSave).toBe(true)

    await expect(owner.verify()).resolves.toMatchObject({confirmed: true, modelId: 'M1'})
    expect(writes()).toHaveLength(2)
    expect(sibling.hasUnconfirmedSave).toBe(true)
  })

  it('keeps an invalid partial receipt unresolved and blocks accepting the current result', async () => {
    const {owner, f, writes} = await setup({allowFieldAdd: true, omitFieldReceipt: true, omitFieldWrite: true, formalProjection: true})
    await owner.includeField({sourceName: 'extra', included: true})
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')

    await expect(owner.verify()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    expect(writes()).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(0)
    expect(() => owner.acceptCurrent()).toThrow()
  })

  it('does not re-sign a late edit made during the first native capture verification await', async () => {
    const {owner, session, f, writes, reader} = await setup({allowFieldEdit: true})
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentCode', IsPKey: 0}]})
    await owner.preview(source)
    await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()

    const dataSet = session.metadataDataSet
    const nativeSave = dataSet.saveChanges.bind(dataSet)
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const held = vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {
      const result = await nativeSave(options)
      await gate
      return result
    })
    const verification = owner.verify()
    await vi.waitFor(() => expect(held).toHaveBeenCalledTimes(1))
    const fields = dataSet.getView('Base_DataModel_Field', 'sourceReplace:M1')!
    fields.updateEditingValue('F2', 'AsName', 'late edit')
    release()
    await expect(verification).rejects.toThrow(/新字段编辑|草稿发生变化|本地新修改/)

    expect(fields.getEditingRow('F2')?.['AsName']).toBe('late edit')
    await expect(owner.verify()).rejects.toThrow(/新字段编辑|草稿发生变化|本地新修改/)
    expect(fields.getEditingRow('F2')?.['AsName']).toBe('late edit')
    expect(writes()).toHaveLength(1)
  })

  it('preflights every captured view before discarding any late edits when a later target is busy', async () => {
    const {owner, session, reader, f, writes} = await setup({allowFieldEdit: true})
    owner.discard()
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentCode', IsPKey: 0}, prepared.fields[2]!]})
    await owner.preview(source)
    await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()

    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'sourceReplace:M1')!
    models.updateEditingValue('M1', 'description', '后续模型草稿')
    fields.updateEditingValue('F2', 'AsName', '后续字段草稿')
    fields.mutating = true
    const discardModelRows = vi.spyOn(models, 'discardPendingChanges')
    await expect(owner.verify({discardLocalChanges: true})).rejects.toThrow('原来源批次仍在操作')
    expect(discardModelRows).not.toHaveBeenCalled()
    expect(models.getEditingRow('M1')?.['description']).toBe('后续模型草稿')
    expect(fields.getEditingRow('F2')?.['AsName']).toBe('后续字段草稿')
    expect(writes()).toHaveLength(1)
    fields.mutating = false
  })
})

describe('explicit replacement field contracts', () => {
  async function replacement(moveKey = false) {
    const result = await setup({formalProjection: true, overviewOnly: true, deferDefinition: true, allowFieldEdit: true,
      editableFieldProperties: ['FieldType', 'IsPKey', 'IsOutput'],
      businessRows: {Orders: [{rowid: 11, parentId: 22}]}})
    const {f, session, owner, reader} = result
    owner.discard(); session.dispose(); f.setModelValues({PrimaryKeyFields: 'rowid'})
    const config = JSON.parse(f.stored.get('A')!)
    config.tables.OrdersAlias.views.shared.fieldProjection = [{fieldId: 'F1', source: 'resource', resourceFieldId: 'F1', resourceField: 'rowid', viewField: 'rowid', type: 'varchar',
      label: 'ID', output: true, primaryKey: true, expression: '', value: '', valueFunction: '', group: 0, distinct: false, sortOrder: 0, sortDirection: null}]
    config.tables.OrdersAlias.views.shared.pageSize = 7; f.stored.set('A', JSON.stringify(config))
    const next = {...prepared, source: {...source, type: 'databaseView' as const}, model: {...prepared.model, Type: '数据库视图'},
      fields: [{...field, Name: 'nextId', FieldType: 'int', IsPKey: moveKey ? 0 : 1},
        {...field, Name: 'parentCode', FieldType: 'int', IsPKey: moveKey ? 1 : 0}]}
    reader.prepare.mockResolvedValue(next)
    const reopened = await f.open('A', {deferDefinition: true}), edit = reopened.getModelSourceEdit('M1')
    await edit.preview(next.source)
    return {...result, session: reopened, owner: edit, config, next}
  }

  async function mapAndConfirm(owner: Awaited<ReturnType<typeof replacement>>['owner']) {
    await owner.mapField({fieldId: 'F1', sourceName: 'nextId'})
    await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    for (const change of owner.getState().preview!.contractChanges) owner.confirmFieldContract({fieldId: change.id, accepted: true})
  }

  it.each([false, true])('maps different types and keys explicitly, merges the record delta and reopens the saved view (moveKey=%s)', async moveKey => {
    const {f, session, owner, writes, config} = await replacement(moveKey)
    expect(owner.getState().preview!.fieldChoices[0]!.candidates).toContain('nextId')
    await owner.mapField({fieldId: 'F1', sourceName: 'nextId'})
    await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    await expect(owner.save()).rejects.toThrow('请先处理')
    expect(writes()).toHaveLength(0)
    expect(owner.getState().preview!.viewChanges).toContainEqual(expect.objectContaining({fieldId: 'F1', viewId: 'shared'}))
    for (const change of owner.getState().preview!.contractChanges) owner.confirmFieldContract({fieldId: change.id, accepted: true})
    expect(owner.getState().preview!.problems).toEqual([])
    await expect(owner.save()).resolves.toBe('M1')
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    config.tables.OrdersAlias.views.shared.fieldProjection[0].type = 'int'
    config.tables.OrdersAlias.views.shared.fieldProjection[0].primaryKey = !moveKey
    expect(JSON.parse(f.stored.get('A')!)).toEqual(config)
    session.dispose()
    const reopened = await f.open('A', {deferDefinition: true}), fields = await reopened.loadModelFields('M1')
    expect(fields.rows).toContainEqual(expect.objectContaining({rowid: 'F1', Name: 'nextId', AsName: 'rowid', FieldType: 'int', IsPKey: moveKey ? 0 : 1}))
    expect(fields.rows).toContainEqual(expect.objectContaining({rowid: 'F2', Name: 'parentCode', AsName: 'parentId', FieldType: 'int', IsPKey: moveKey ? 1 : 0}))
    await reopened.loadDefinition()
    const view = reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!
    expect(view.primaryKey).toBe(moveKey ? 'parentId' : 'rowid'); expect(view.pageSize).toBe(7)
    expect((await view.loadFromServer()).success).toBe(true); expect(view.rows[0]?.['rowid']).toBe(11)
  })

  it.each(['database', 'file'] as const)('recovers the %s phase without repeating the replacement batch', async phase => {
    const {f, owner, writes} = await replacement(true); await mapAndConfirm(owner)
    if (phase === 'database') f.loseNextResponse(); else f.loseNextFileResponse()
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe(phase === 'database' ? 'unknown' : 'configuration')
    expect(await owner.verify()).toEqual({confirmed: true, modelId: 'M1'})
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
  })

  it('clears a mapped field confirmation when its source changes and rejects duplicate mappings', async () => {
    const {owner, writes} = await replacement(true); await mapAndConfirm(owner)
    await owner.mapField({fieldId: 'F1', sourceName: 'parentCode'})
    expect(owner.getState().preview!.contractChanges.find(change => change.id === 'F1')?.accepted).toBe(false)
    expect(owner.getState().preview!.problems.join()).toContain('同一来源字段')
    await expect(owner.save()).rejects.toThrow(); expect(writes()).toHaveLength(0)
    owner.discard(); expect(owner.getState().status).toBe('idle')
  })

  it.each(['cancel', 'scope'] as const)('does not adopt a late mapping plan after %s', async kind => {
    const {f, session, owner, writes} = await replacement()
    await owner.mapField({fieldId: 'F1', sourceName: 'nextId'})
    let release = () => {}
    const waiting = new Promise<void>(resolve => {release = resolve}), originalRead = session.previewRemoteViews.bind(session)
    const read = vi.spyOn(session, 'previewRemoteViews').mockImplementationOnce(async () => {await waiting; return originalRead()})
    const pending = owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    const outcome = pending.then(() => null, error => error)
    await vi.waitFor(() => expect(read).toHaveBeenCalled())
    expect(owner.getState().status).toBe('previewing')
    if (kind === 'cancel') owner.discard(); else f.invalidate()
    release()
    const error = await outcome
    if (kind === 'cancel') {expect(error).toBeNull(); expect(owner.getState()).toMatchObject({status: 'idle', preview: null})}
    else expect(error).toBeInstanceOf(Error)
    expect(writes()).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('rechecks field permissions after replacement confirmation', async () => {
    const {f, owner, writes} = await replacement(); await mapAndConfirm(owner)
    f.denyFieldProperty('FieldType')
    await expect(owner.save()).rejects.toThrow('不允许修改映射字段')
    expect(writes()).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['none', 'tree', 'view', 'permission'] as const)('explicitly introduces a replacement key and checks removed-key references (%s)', async dependency => {
    const {f, session, owner, reader, writes} = await setup({formalProjection: true, overviewOnly: true, deferDefinition: true,
      allowFieldAdd: true, allowDelete: true, denyDeleteIds: dependency === 'permission' ? ['F1'] : [],
      sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}], businessRows: {Orders: [{nextId: 31}]}})
    owner.discard(); f.setModelValues({PrimaryKeyFields: 'rowid', ...dependency === 'tree' ? {parentField: 'rowid'} : {}})
    await session.metadataDataSet.getView('Base_DataModel')!.loadFromServer()
    let edit = owner, active = session
    if (dependency === 'view') {
      session.dispose()
      const config = JSON.parse(f.stored.get('A')!)
      config.tables.OrdersAlias.views.shared.treeConfig = {idField: 'rowid', parentIdField: 'rowid'}
      f.stored.set('A', JSON.stringify(config))
      active = await f.open('A', {deferDefinition: true}); edit = active.getModelSourceEdit('M1')
    }
    const next = {...prepared, source: {...source, type: 'databaseView' as const}, model: {...prepared.model, Type: '数据库视图'},
      fields: [{...field, Name: 'nextId', FieldType: 'int', IsOutput: 0}]}
    reader.prepare.mockResolvedValue(next); await edit.preview(next.source)
    await edit.includeField({sourceName: 'nextId', included: true})
    await edit.removeField({fieldId: 'F1', removed: true})
    if (dependency !== 'none') {
      await expect(edit.save()).rejects.toThrow(); expect(writes()).toHaveLength(0)
      expect(f.modelRow()).toMatchObject({PrimaryKeyFields: 'rowid'})
      return
    }
    expect(edit.getState().preview!.problems).toEqual([])
    await expect(edit.save()).resolves.toBe('M1'); expect(writes()).toHaveLength(1)
    expect(f.created.get('Base_DataModel_Field')).toContainEqual(expect.objectContaining({Name: 'nextId', IsPKey: 1, IsOutput: 1}))
    active.dispose()
    const reopened = await f.open('A', {deferDefinition: true}); await reopened.loadDefinition()
    const view = reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!
    expect(view.primaryKey).toBe('nextId'); expect(view.columns.some(column => column.name === 'rowid')).toBe(false)
    expect((await view.loadFromServer()).success).toBe(true); expect(view.rows[0]?.['nextId']).toBe(31)
  })
})

describe('explicit source field contract synchronization', () => {
  async function contractSync(type: 'table' | 'databaseView' = 'databaseView', originalType = 'varchar', options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
    const result = await setup({formalProjection: true, overviewOnly: true, deferDefinition: true,
      ...type === 'table' ? {formalPrimaryKey: 'code'} : {},
      editableFieldProperties: ['FieldType', 'IsPKey', 'IsOutput'],
      sourceFields: [{...field, FieldType: originalType, rowid: 'F1', dataModelId: 'M1'},
        {...field, rowid: 'F2', dataModelId: 'M1', Name: 'code', AsName: 'businessCode', IsPKey: 0, IsOutput: 0}],
      businessRows: {Orders: [{rowid: 'OLD', businessCode: 41}]}, ...options})
    const {f, session, owner, reader} = result
    owner.discard(); f.setModelValues({Type: type === 'table' ? '数据库表' : '数据库视图', PrimaryKeyFields: 'rowid'})
    await session.metadataDataSet.getView('Base_DataModel')!.loadFromServer()
    const bound = {...source, type, id: 'CURRENT', name: 'OrderSource', dbid: 'DB', databaseName: 'old-database'}
    reader.query.mockResolvedValue({rows: [bound], total: 1})
    reader.prepare.mockResolvedValue({...prepared, source: bound, model: {...prepared.model, Type: type === 'table' ? '数据库表' : '数据库视图', MetaName: bound.name, DbId: bound.dbid, DbName: bound.databaseName},
      fields: [{...field, IsPKey: 0}, {...field, Name: 'code', FieldType: 'int'}]})
    await owner.previewBoundSource()
    return result
  }

  it.each(['table', 'databaseView'] as const)('requires explicit confirmation and saves the final %s key and type through the original batch before independent reopening', async type => {
    const {f, session, owner, writes} = await contractSync(type)
    await expect(owner.save()).rejects.toThrow('主键合同')
    owner.confirmFieldContract({fieldId: 'F1', accepted: true})
    await expect(owner.save()).rejects.toThrow('主键合同')
    owner.confirmFieldContract({fieldId: 'F2', accepted: true})
    expect(owner.getState().preview?.problems).toEqual([])
    expect(owner.getState().preview?.modelChanges).toContainEqual({property: 'PrimaryKeyFields', before: 'rowid', after: 'code'})
    await expect(owner.save()).resolves.toBe('M1')
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    session.dispose()
    const reopened = await f.open('A', {deferDefinition: true})
    const fields = await reopened.loadModelFields('M1')
    expect(fields.rows).toContainEqual(expect.objectContaining({rowid: 'F1', IsPKey: 0}))
    expect(fields.rows).toContainEqual(expect.objectContaining({rowid: 'F2', Name: 'code', AsName: 'businessCode', FieldType: 'int', IsPKey: 1, IsOutput: 1}))
    await reopened.loadDefinition()
    const view = reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!
    expect(view.primaryKey).toBe('businessCode')
    expect(view.columns.find(column => column.name === 'businessCode')?.type).toBe('int')
    expect((await view.loadFromServer()).success).toBe(true)
    expect(view.rows[0]?.['businessCode']).toBe(41)
  })

  it('drops contract choices on cancellation and rechecks the exact source before dispatch', async () => {
    const {owner, reader, writes} = await contractSync()
    owner.confirmFieldContract({fieldId: 'F1', accepted: true}); owner.confirmFieldContract({fieldId: 'F2', accepted: true})
    owner.discard(); await owner.previewBoundSource()
    expect(owner.getState().preview?.contractChanges.every(change => !change.accepted)).toBe(true)
    expect(writes()).toHaveLength(0)
    owner.confirmFieldContract({fieldId: 'F1', accepted: true}); owner.confirmFieldContract({fieldId: 'F2', accepted: true})
    const changed = structuredClone(await reader.prepare.mock.results.at(-1)!.value)
    changed.fields[1]!.FieldType = 'decimal'; reader.prepare.mockResolvedValue(changed)
    await expect(owner.save()).rejects.toThrow('来源或元数据已变化')
    expect(writes()).toHaveLength(0)
  })

  it('rechecks write permission after confirmation without widening the original guard', async () => {
    const {f, owner, writes} = await contractSync()
    owner.confirmFieldContract({fieldId: 'F1', accepted: true}); owner.confirmFieldContract({fieldId: 'F2', accepted: true})
    f.denySourceWrite()
    await expect(owner.save()).rejects.toThrow('不允许修改')
    expect(writes()).toHaveLength(0)
  })

  it('verifies a lost migration receipt without replaying the batch', async () => {
    const {f, owner, writes} = await contractSync()
    owner.confirmFieldContract({fieldId: 'F1', accepted: true}); owner.confirmFieldContract({fieldId: 'F2', accepted: true})
    f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    expect(await owner.verify()).toEqual({confirmed: true, modelId: 'M1'})
    expect(writes()).toHaveLength(1)
  })

  it.each(['duplicate-key', 'ambiguous-declaration'] as const)('keeps %s contract changes blocked after confirmation', async kind => {
    const {f, session, owner, reader, writes} = await contractSync()
    owner.discard()
    const changed = structuredClone(await reader.prepare.mock.results.at(-1)!.value)
    if (kind === 'duplicate-key') changed.fields[0]!.IsPKey = 1
    if (kind === 'ambiguous-declaration') {
      f.setModelValues({PrimaryKeyFields: 'unknownKey'})
      await session.metadataDataSet.getView('Base_DataModel')!.loadFromServer()
    }
    reader.prepare.mockResolvedValue(changed); await owner.previewBoundSource()
    for (const change of owner.getState().preview!.contractChanges) owner.confirmFieldContract({fieldId: change.id, accepted: true})
    await expect(owner.save()).rejects.toThrow('主键')
    expect(writes()).toHaveLength(0)
  })

  async function newPrimarySync(removeOld: boolean, type: 'table' | 'databaseView' = 'databaseView') {
    const result = await contractSync(type, 'varchar', {allowFieldAdd: true, allowDelete: true,
      ...type === 'table' ? {formalPrimaryKey: 'newKey'} : {},
      businessRows: {Orders: [{rowid: 'OLD', newKey: 73}]}})
    const {owner, reader} = result
    owner.discard()
    const next = structuredClone(await reader.prepare.mock.results.at(-1)!.value)
    next.fields = [...removeOld ? [] : [{...field, IsPKey: 0}], {...field, Name: 'code', IsPKey: 0, IsOutput: 0},
      {...field, Name: 'newKey', FieldType: 'int', IsOutput: 0}]
    reader.prepare.mockResolvedValue(next)
    await owner.previewBoundSource()
    for (const change of owner.getState().preview!.contractChanges) owner.confirmFieldContract({fieldId: change.id, accepted: true})
    return result
  }

  it.each(['table', 'databaseView'].flatMap(type => [false, true].map(removeOld => ({type: type as 'table' | 'databaseView', removeOld}))))('adds a new source primary identity in the original batch and reopens it ($type/removeOld=$removeOld)', async ({type, removeOld}) => {
    const {f, session, owner, writes} = await newPrimarySync(removeOld, type)
    expect(owner.getState().preview?.problems).toEqual([])
    expect(owner.getState().preview?.modelChanges).toContainEqual({property: 'PrimaryKeyFields', before: 'rowid', after: 'newKey'})
    expect(writes()).toHaveLength(0)
    await expect(owner.save()).resolves.toBe('M1')
    expect(writes()).toHaveLength(1)
    const row = f.created.get('Base_DataModel_Field')?.find(item => item['Name'] === 'newKey')
    expect(row).toMatchObject({dataModelId: 'M1', Name: 'newKey', IsPKey: 1, IsOutput: 1})
    expect(row?.['rowid']).toEqual(expect.any(String)); expect(row?.['rowid']).not.toMatch(/^new:/)
    expect(f.modelRow()).toMatchObject({PrimaryKeyFields: 'newKey'})
    session.dispose()
    const reopened = await f.open('A', {deferDefinition: true}); await reopened.loadDefinition()
    const view = reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!
    expect(view.primaryKey).toBe('newKey')
    expect(view.columns.some(column => column.name === 'rowid')).toBe(!removeOld)
    expect((await view.loadFromServer()).success).toBe(true); expect(view.rows[0]?.['newKey']).toBe(73)
    expect(f.stored.get('A')).not.toContain('new:')
  })

  it.each([false, true])('recovers an unknown new primary batch without repeating additions or deletions (removeOld=%s)', async removeOld => {
    const {f, owner, writes} = await newPrimarySync(removeOld)
    f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    expect(await owner.verify()).toEqual({confirmed: true, modelId: 'M1'})
    expect(writes()).toHaveLength(1)
    expect(f.created.get('Base_DataModel_Field')?.filter(row => row['Name'] === 'newKey')).toHaveLength(1)
  })

  it('cancels new primary synchronization without allocating or saving formal fields', async () => {
    const {f, session, owner, writes} = await newPrimarySync(true)
    owner.discard()
    expect(owner.getState().pending).toBe(false)
    expect(writes()).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
    expect(f.created.get('Base_DataModel_Field') ?? []).toHaveLength(0)
    expect(['Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation'].some(name => session.metadataDataSet.getTable(name)!.viewList.some(view => view.dirtyTracking.hasPendingChanges()))).toBe(false)
  })

  it.each(['newKey', 'unknownKey'])('recovers a model with no fields while preserving its explicit key declaration %s', async declared => {
    const {f, session, owner, reader, writes} = await setup({formalProjection: true, overviewOnly: true, deferDefinition: true,
      allowFieldAdd: true, sourceFields: []})
    owner.discard(); f.setModelValues({Type: '数据库视图', PrimaryKeyFields: declared})
    await session.metadataDataSet.getView('Base_DataModel')!.loadFromServer()
    const bound = {...source, type: 'databaseView' as const, name: 'OrderSource', dbid: 'DB', databaseName: 'old-database'}
    reader.query.mockResolvedValue({rows: [bound], total: 1})
    reader.prepare.mockResolvedValue({...prepared, source: bound, model: {...prepared.model, Type: '数据库视图', MetaName: bound.name, DbId: bound.dbid},
      fields: [{...field, Name: 'newKey', IsOutput: 0}]})
    await owner.previewBoundSource()
    if (declared === 'unknownKey') {
      await expect(owner.save()).rejects.toThrow('主键')
      expect(writes()).toHaveLength(0)
    } else {
      await expect(owner.save()).resolves.toBe('M1'); expect(writes()).toHaveLength(1)
      expect(f.created.get('Base_DataModel_Field')).toContainEqual(expect.objectContaining({Name: 'newKey', IsPKey: 1, IsOutput: 1}))
    }
    expect(f.modelRow()).toMatchObject({PrimaryKeyFields: declared})
  })

  it('rechecks new primary field creation permission before dispatch', async () => {
    const {f, owner, writes} = await newPrimarySync(true)
    f.denyFieldAdd()
    await expect(owner.save()).rejects.toThrow('不允许新增字段')
    expect(writes()).toHaveLength(0); expect(f.created.get('Base_DataModel_Field') ?? []).toHaveLength(0)
  })

  it('does not treat replacing the primary declaration as permission to delete a tree field reference', async () => {
    const {f, session, owner, writes} = await newPrimarySync(true)
    owner.discard(); f.setModelValues({parentField: 'rowid'})
    await session.metadataDataSet.getView('Base_DataModel')!.loadFromServer()
    await owner.previewBoundSource()
    await expect(owner.save()).rejects.toThrow('parentField')
    expect(f.modelRow()).toMatchObject({PrimaryKeyFields: 'rowid'}); expect(writes()).toHaveLength(0)
  })

  it('preserves named-view tree references to the removed primary and refuses implicit field removal', async () => {
    const {f, session, owner, writes} = await newPrimarySync(true)
    owner.discard(); session.dispose()
    const config = JSON.parse(f.stored.get('A')!)
    config.tables.OrdersAlias.views.shared.treeConfig = {idField: 'rowid', parentIdField: 'rowid'}
    const text = JSON.stringify(config); f.stored.set('A', text)
    const reopened = await f.open('A', {deferDefinition: true}), edit = reopened.getModelSourceEdit('M1')
    await edit.previewBoundSource()
    await expect(edit.save()).rejects.toThrow('treeConfig.idField 不是当前正式输出字段')
    expect(f.stored.get('A')).toBe(text); expect(writes()).toHaveLength(0)
  })

  it('recovers the fixed projection phase without allocating the newly saved primary field again', async () => {
    const {f, session, owner, writes} = await newPrimarySync(false)
    owner.discard(); session.dispose()
    const config = JSON.parse(f.stored.get('A')!)
    config.tables.OrdersAlias.views.shared.fieldProjection = [{fieldId: 'F1', source: 'resource', resourceFieldId: 'F1', resourceField: 'rowid', viewField: 'rowid', type: 'varchar',
      label: 'ID', output: true, primaryKey: true, expression: '', value: '', valueFunction: '', group: 0, distinct: false, sortOrder: 0, sortDirection: null}]
    f.stored.set('A', JSON.stringify(config))
    const reopened = await f.open('A', {deferDefinition: true}), edit = reopened.getModelSourceEdit('M1')
    await edit.previewBoundSource(); edit.confirmFieldContract({fieldId: 'F1', accepted: true})
    f.loseNextFileResponse(); await expect(edit.save()).rejects.toThrow()
    expect(edit.getState().status).toBe('configuration')
    expect(await edit.verify()).toEqual({confirmed: true, modelId: 'M1'})
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    const added = f.created.get('Base_DataModel_Field')?.filter(row => row['Name'] === 'newKey')
    expect(added).toHaveLength(1); expect(added?.[0]?.['rowid']).not.toMatch(/^new:/)
    expect(JSON.parse(f.stored.get('A')!).tables.OrdersAlias.views.shared.fieldProjection[0]).toMatchObject({fieldId: 'F1', primaryKey: false})
    reopened.dispose()
    const fresh = await f.open('A', {deferDefinition: true}); await fresh.loadDefinition()
    const view = fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!
    expect(view.primaryKey).toBe('newKey'); expect((await view.loadFromServer()).success).toBe(true)
    expect(view.rows[0]?.['newKey']).toBe(73)
  })

  async function projectedSync(nextType = 'int') {
    const originalType = nextType === '' ? '' : 'varchar'
    const result = await contractSync('databaseView', originalType), {f, owner, session, reader} = result
    owner.discard(); session.dispose()
    const config = JSON.parse(f.stored.get('A')!)
    config.tables.OrdersAlias.views.shared.fieldProjection = [{fieldId: 'F1', source: 'resource', resourceFieldId: 'F1', resourceField: 'rowid', viewField: 'rowid', type: originalType || 'string',
      label: 'ID', output: true, primaryKey: true, expression: '', value: '', valueFunction: '', group: 0, distinct: false, sortOrder: 0, sortDirection: null}]
    config.tables.OrdersAlias.views.shared.pageSize = 7
    f.stored.set('A', JSON.stringify(config))
    const next = structuredClone(await reader.prepare.mock.results.at(-1)!.value)
    next.fields[0]!.FieldType = nextType; reader.prepare.mockResolvedValue(next)
    const reopened = await f.open('A', {deferDefinition: true}), edit = reopened.getModelSourceEdit('M1')
    await edit.previewBoundSource(); edit.confirmFieldContract({fieldId: 'F1', accepted: true}); edit.confirmFieldContract({fieldId: 'F2', accepted: true})
    return {...result, session: reopened, owner: edit, config}
  }

  function acceptCurrentSourceContracts(owner: Awaited<ReturnType<typeof contractSync>>['owner']) {
    for (const change of owner.getState().preview?.contractChanges ?? []) owner.confirmFieldContract({fieldId: change.id, accepted: true})
  }

  it('verifies authoritative not-applied through native save, repeats verification, then abandons only the unchanged captured selectors', async () => {
    const {f, session, owner, writes} = await contractSync('databaseView', 'varchar', {omitModelWrite: true, omitAllFieldChanges: true})
    acceptCurrentSourceContracts(owner)
    const fileBefore = f.stored.get('A')
    const modelBefore = structuredClone(f.modelRow())
    const dataSet = session.metadataDataSet, nativeSave = dataSet.saveChanges.bind(dataSet)
    const batches: Parameters<typeof dataSet.saveChanges>[0][] = []
    vi.spyOn(dataSet, 'saveChanges').mockImplementation(async options => {batches.push(options); return nativeSave(options)})
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    expect(batches).toHaveLength(1)

    const sibling = dataSet.getView('Base_DataSet', 'default')!
    sibling.updateEditingValue('A', 'inputParams', '[{"Name":"keep-sibling"}]')
    expect(await owner.verify()).toEqual({confirmed: false, modelId: null})
    expect(owner.getState().status).toBe('different')
    expect(batches).toHaveLength(2)
    expect(batches[1]?.views).toEqual(batches[0]?.views)
    expect(writes()).toHaveLength(1)
    expect(f.modelRow()).toEqual(modelBefore)
    expect(f.fileWrites).toHaveLength(0)

    expect(await owner.verify()).toEqual({confirmed: false, modelId: null})
    expect(batches).toHaveLength(2)
    await owner.verify({abandonNotApplied: true})
    expect(owner.getState()).toMatchObject({status: 'idle', pending: false})
    expect(batches).toHaveLength(2)
    expect(writes()).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(0)
    expect(f.stored.get('A')).toBe(fileBefore)
    expect(sibling.getEditingRow('A')?.['inputParams']).toBe('[{"Name":"keep-sibling"}]')
    expect(sibling.hasEditingChanges('A')).toBe(true)
  })

  it.each(['overlay', 'applied'] as const)('rejects a late %s edit across first native not-applied verification and preserves the original save count', async editKind => {
    const {f, session, owner, writes} = await contractSync('databaseView', 'varchar', {omitModelWrite: true, omitAllFieldChanges: true})
    acceptCurrentSourceContracts(owner)
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    const dataSet = session.metadataDataSet, nativeSave = dataSet.saveChanges.bind(dataSet)
    let enter!: () => void, release!: () => void
    const entered = new Promise<void>(resolve => {enter = resolve}), gate = new Promise<void>(resolve => {release = resolve})
    const recoverySaves: Parameters<typeof dataSet.saveChanges>[0][] = []
    vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {
      recoverySaves.push(options); enter(); await gate; return nativeSave(options)
    })
    const verification = owner.verify()
    await entered
    const fields = dataSet.getTable('Base_DataModel_Field')!.viewList.find(view => view.hasUnconfirmedSave)!
    fields.updateEditingValue('F1', 'FieldType', 'late-local-type')
    if (editKind === 'applied') expect((await fields.applyEditingRows(['F1'])).success).toBe(true)
    release()
    await expect(verification).rejects.toThrow()
    await expect(owner.verify()).rejects.toThrow()
    expect(fields.getEditingRow('F1')?.['FieldType']).toBe('late-local-type')
    expect(recoverySaves).toHaveLength(1)
    expect(writes()).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(0)
    expect(() => owner.acceptCurrent()).toThrow()
  })

  it.each(['malformed', 'duplicate', 'incomplete'] as const)('keeps a %s DataSet receipt unresolved without accepting or replaying the source batch', async receiptKind => {
    const {f, session, owner, writes} = await contractSync()
    acceptCurrentSourceContracts(owner)
    const fileBefore = f.stored.get('A'), dataSet = session.metadataDataSet, nativeSave = dataSet.saveChanges.bind(dataSet)
    const saveCalls: Parameters<typeof dataSet.saveChanges>[0][] = []
    vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {
      saveCalls.push(options)
      const result = await nativeSave(options)
      const data = result.data
      if (!data) throw new Error('native DataSet save returned no receipt data')
      if (receiptKind === 'malformed') {
        return {...result, data: {...data, viewResults: data.viewResults.map((view, index) => index === 0 ? {...view, viewId: 'wrong-view'} : view)}}
      }
      if (receiptKind === 'duplicate') {
        const first = data.viewResults[0]
        return first ? {...result, data: {...data, viewCount: data.viewCount + 1, viewResults: [...data.viewResults, first]}} : result
      }
      return {...result, data: {...data, viewCount: Math.max(0, data.viewCount - 1), viewResults: data.viewResults.slice(0, -1)}}
    })
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    await expect(owner.verify()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    await expect(owner.verify()).rejects.toThrow()
    expect(() => owner.acceptCurrent()).toThrow()
    expect(saveCalls).toHaveLength(1)
    expect(writes()).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(0)
    expect(f.stored.get('A')).toBe(fileBefore)
  })

  it.each(['changed-query', 'missing-view', 'replaced-view'] as const)('rejects original capture identity drift (%s) without accept-current, DB replay, or file completion', async identityChange => {
    const {f, session, owner, writes} = await contractSync()
    acceptCurrentSourceContracts(owner)
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    const dataSet = session.metadataDataSet, table = dataSet.getTable('Base_DataModel_Field')!
    const original = table.viewList.find(view => view.hasUnconfirmedSave)!
    if (identityChange === 'changed-query') original.queryContext = {...original.queryContext, proofScope: 'changed'}
    else {
      table.destroyView(original.viewId)
      if (identityChange === 'replaced-view') table.getOrCreateView(original.viewId)
    }
    const save = dataSet.saveChanges.bind(dataSet), calls: Parameters<typeof dataSet.saveChanges>[0][] = []
    vi.spyOn(dataSet, 'saveChanges').mockImplementation(async options => {calls.push(options); return save(options)})
    await expect(owner.verify()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    await expect(owner.verify()).rejects.toThrow()
    expect(() => owner.acceptCurrent()).toThrow()
    expect(calls).toHaveLength(0)
    expect(writes()).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(0)
  })

  it('discards only captured applied edits, keeps unrelated and post-click drafts, then completes the confirmed file plan once', async () => {
    const {f, session, owner, writes} = await projectedSync()
    const dataSet = session.metadataDataSet, models = dataSet.getView('Base_DataModel', 'default')!
    const loadModel = models.loadFromServer.bind(models)
    const releaseSave = f.holdModelResponse()
    const saving = owner.save()
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    f.failNextModelRead(); releaseSave()
    await expect(saving).rejects.toThrow('model read unavailable')
    expect(owner.getState().status).toBe('readback')
    expect(owner.getState().pending).toBe(true)
    expect(f.fileWrites).toHaveLength(0)

    const fields = dataSet.getTable('Base_DataModel_Field')!.viewList.find(view => view.viewId.startsWith('sourceSync:'))!
    const fieldId = 'F1'
    fields.updateEditingValue(fieldId, 'FieldType', 'local-applied-type')
    expect((await fields.applyEditingRows([fieldId])).success).toBe(true)
    expect(fields.dirtyTracking.hasPendingChanges(fieldId)).toBe(true)
    const sibling = dataSet.getView('Base_DataSet', 'default')!
    sibling.updateEditingValue('A', 'inputParams', '[{"Name":"unrelated-before-click"}]')

    let enter!: () => void, release!: () => void
    const entered = new Promise<void>(resolve => {enter = resolve}), gate = new Promise<void>(resolve => {release = resolve})
    vi.spyOn(models, 'loadFromServer').mockImplementationOnce(async options => {
      const result = await loadModel(options); enter(); await gate; return result
    })
    const verification = owner.verify({discardLocalChanges: true})
    expect(fields.hasEditingChanges(fieldId)).toBe(false)
    expect(fields.dirtyTracking.hasPendingChanges(fieldId)).toBe(false)
    await entered
    sibling.updateEditingValue('A', 'inputParams', '[{"Name":"post-click"}]')
    release()
    await expect(verification).resolves.toEqual({confirmed: true, modelId: 'M1'})
    expect(owner.getState()).toMatchObject({status: 'idle', pending: false})
    expect(fields.hasEditingChanges(fieldId)).toBe(false)
    expect(fields.dirtyTracking.hasPendingChanges(fieldId)).toBe(false)
    expect(sibling.getEditingRow('A')?.['inputParams']).toBe('[{"Name":"post-click"}]')
    expect(sibling.hasEditingChanges('A')).toBe(true)
    expect(writes()).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(1)
    await expect(owner.verify()).rejects.toThrow()
    expect(writes()).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(1)
  })

  it.each(['overlay', 'applied'] as const)('preserves a captured F1 %s edit made during the domain readback after explicit discard', async editKind => {
    const {f, session, owner, writes} = await projectedSync()
    const dataSet = session.metadataDataSet, models = dataSet.getView('Base_DataModel', 'default')!
    const loadModel = models.loadFromServer.bind(models)
    const releaseSave = f.holdModelResponse()
    const saving = owner.save()
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    f.failNextModelRead(); releaseSave()
    await expect(saving).rejects.toThrow('model read unavailable')
    expect(owner.getState().status).toBe('readback')
    expect(owner.getState().pending).toBe(true)

    const fields = dataSet.getTable('Base_DataModel_Field')!.viewList.find(view => view.viewId.startsWith('sourceSync:'))!
    const fieldId = 'F1'
    fields.updateEditingValue(fieldId, 'FieldType', 'pre-click-applied-type')
    expect((await fields.applyEditingRows([fieldId])).success).toBe(true)
    expect(fields.dirtyTracking.hasPendingChanges(fieldId)).toBe(true)

    let enter!: () => void, release!: () => void
    const entered = new Promise<void>(resolve => {enter = resolve}), gate = new Promise<void>(resolve => {release = resolve})
    vi.spyOn(models, 'loadFromServer').mockImplementationOnce(async options => {
      const result = await loadModel(options); enter(); await gate; return result
    })
    const verification = owner.verify({discardLocalChanges: true})
    expect(fields.hasEditingChanges(fieldId)).toBe(false)
    expect(fields.dirtyTracking.hasPendingChanges(fieldId)).toBe(false)
    await entered
    fields.updateEditingValue(fieldId, 'FieldType', `late-${editKind}-type`)
    if (editKind === 'applied') expect((await fields.applyEditingRows([fieldId])).success).toBe(true)
    release()

    await expect(verification).rejects.toThrow()
    expect(owner.getState()).toMatchObject({status: 'readback', pending: true})
    expect(fields.getEditingRow(fieldId)?.['FieldType']).toBe(`late-${editKind}-type`)
    expect(fields.hasEditingChanges(fieldId)).toBe(editKind === 'overlay')
    expect(fields.dirtyTracking.hasPendingChanges(fieldId)).toBe(editKind === 'applied')
    expect(writes()).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(0)

    await expect(owner.verify()).rejects.toThrow()
    expect(owner.getState()).toMatchObject({status: 'readback', pending: true})
    expect(fields.getEditingRow(fieldId)?.['FieldType']).toBe(`late-${editKind}-type`)
    expect(writes()).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['int', ''])('coordinates the confirmed source contract with fixed named projections and independently reopens the saved design (type=%s)', async nextType => {
    const {f, session, owner, config, writes} = await projectedSync(nextType)
    expect(owner.getState().preview?.viewChanges).toContainEqual(expect.objectContaining({tableName: 'OrdersAlias', viewId: 'shared', fieldId: 'F1'}))
    await expect(owner.save()).resolves.toBe('M1')
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    config.tables.OrdersAlias.views.shared.fieldProjection[0].type = nextType || 'string'
    config.tables.OrdersAlias.views.shared.fieldProjection[0].primaryKey = false
    expect(JSON.parse(f.stored.get('A')!)).toEqual(config)
    session.dispose()
    const reopened = await f.open('A', {deferDefinition: true}); await reopened.loadDefinition()
    const view = reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!
    expect(view.primaryKey).toBe('businessCode'); expect(view.pageSize).toBe(7)
    expect(view.fieldProjection[0]).toMatchObject({fieldId: 'F1', type: nextType || 'string', primaryKey: false})
    expect((await view.loadFromServer()).success).toBe(true)
    expect(view.rows[0]?.['businessCode']).toBe(41)
  })

  it.each(['database', 'file'] as const)('recovers a lost %s receipt without replaying the database phase', async phase => {
    const {f, owner, writes} = await projectedSync()
    if (phase === 'database') f.loseNextResponse(); else f.loseNextFileResponse()
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe(phase === 'database' ? 'unknown' : 'configuration')
    expect(await owner.verify()).toEqual({confirmed: true, modelId: 'M1'})
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    expect(JSON.parse(f.stored.get('A')!).tables.OrdersAlias.views.shared.fieldProjection[0]).toMatchObject({type: 'int', primaryKey: false})
  })

  it('keeps a captured metadata edit made while the file plan is completing', async () => {
    const {f, session, owner, writes} = await projectedSync()
    const release = f.holdFileResponse()
    const saving = owner.save()
    await vi.waitFor(() => expect(f.fileWrites).toHaveLength(1))
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    models.updateEditingValue('M1', 'description', '文件完成期间的本地修改')
    release()
    await expect(saving).rejects.toThrow(/原来源批次目标|正式注册名未确认|其他元数据草稿/)
    expect(models.getEditingRow('M1')?.['description']).toBe('文件完成期间的本地修改')
    expect(owner.getState().status).toBe('configuration')
    await expect(owner.verify()).rejects.toThrow(/原来源批次目标|正式注册名未确认|远端配置已改变|其他元数据草稿/)
    expect(models.getEditingRow('M1')?.['description']).toBe('文件完成期间的本地修改')
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
  })

  it('rejects remote configuration changes before dispatch without losing the other document', async () => {
    const {f, owner, config, writes} = await projectedSync()
    config.tables.CustomersAlias.views.shared.pageSize = 99
    const remote = JSON.stringify(config); f.stored.set('A', remote)
    await expect(owner.save()).rejects.toThrow('远端视图配置已变化')
    expect(writes()).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
    expect(f.stored.get('A')).toBe(remote)
  })

  it('retains unapplied file changes until an explicit retry without replaying the confirmed database batch', async () => {
    const {f, owner, config, writes} = await projectedSync()
    vi.spyOn(f.stored, 'set').mockImplementationOnce(() => {throw new Error('file write did not reach storage')})
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('configuration')
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    expect(JSON.parse(f.stored.get('A')!)).toEqual(config)
    await expect(owner.verify()).rejects.toThrow('SCENARIO_DEFINITION_NOT_APPLIED:')
    expect(owner.getState().status).toBe('configuration')
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    expect(await owner.verify()).toEqual({confirmed: true, modelId: 'M1'})
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    expect(JSON.parse(f.stored.get('A')!).tables.OrdersAlias.views.shared.fieldProjection[0]).toMatchObject({type: 'int', primaryKey: false})
  })

  it('retains a post-database remote conflict and resumes only the file phase once the baseline is restored', async () => {
    const {f, session, owner, config, writes} = await projectedSync()
    const baseline = JSON.stringify(config), remote = structuredClone(config)
    remote.tables.CustomersAlias.views.shared.pageSize = 99
    const save = session.metadataDataSet.saveChanges.bind(session.metadataDataSet)
    vi.spyOn(session.metadataDataSet, 'saveChanges').mockImplementationOnce(async options => {
      const result = await save(options); f.stored.set('A', JSON.stringify(remote)); return result
    })
    await expect(owner.save()).rejects.toThrow('远端场景配置已变化')
    expect(owner.getState().status).toBe('configuration')
    await expect(owner.verify()).rejects.toThrow('远端配置已改变')
    expect(owner.getState().status).toBe('configuration')
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    expect(JSON.parse(f.stored.get('A')!)).toEqual(remote)
    f.stored.set('A', baseline)
    expect(await owner.verify()).toEqual({confirmed: true, modelId: 'M1'})
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
  })

  it('preserves a foreign definition draft and allows resuming after the user cancels it', async () => {
    const {f, session, owner, writes} = await projectedSync()
    const view = session.metadataDataSet.getView('DataViewDefinition')!
    expect((await view.loadFromServer()).success).toBe(true)
    const row = view.rows.find(row => row['tableName'] === 'CustomersAlias' && row['viewId'] === 'shared')!, id = view.getPkKey(row)!
    view.updateEditingValue(id, 'pageSize', 91)
    await expect(owner.save()).rejects.toThrow()
    expect(view.getEditingRow(id)?.['pageSize']).toBe(91)
    expect(writes()).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
    view.discardPendingChanges([id]); await expect(owner.save()).resolves.toBe('M1')
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
  })
})

const resourceTargets = [
  {type: 'table', label: '数据库表', resourceType: 'database-table'},
  {type: 'databaseView', label: '数据库视图', resourceType: 'database-view'},
  {type: 'interface', label: '接口', resourceType: 'third-party-api'},
  {type: 'logicView', label: '视图', resourceType: 'logical-view'},
  {type: 'dict', label: '字典', resourceType: 'dictionary'},
  {type: 'json', label: 'JSON', resourceType: 'json'},
] as const

describe('source resource transitions', () => {
  it.each(resourceTargets)('preserves identity and named views while reopening $type through the formal runtime', async target => {
    const keyless = ['dict', 'json'].includes(target.type)
    const output = {...field, Name: target.type === 'json' ? 'id' : 'rowid', IsPKey: keyless ? 0 : 1}
    const {f, session, reader, owner, writes} = await setup({formalProjection: true, overviewOnly: true,
      sourceFields: [{...output, rowid: 'F1', dataModelId: 'M1', AsName: 'keyValue'}], businessRows: {Orders: [{keyValue: 'VALUE'}]}})
    f.setModelValues({Type: target.type === 'table' ? '数据库视图' : '数据库表'})
    await session.metadataDataSet.getView('Base_DataModel')!.loadFromServer()
    const chosen = {...source, type: target.type}
    reader.prepare.mockResolvedValue({...prepared, source: chosen, model: {...prepared.model, Type: target.label}, fields: [output]})
    await owner.preview(chosen)
    expect(owner.getState().preview?.problems).toEqual([])
    const text = f.stored.get('A')
    expect(await owner.save()).toBe('M1')
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(0); expect(f.stored.get('A')).toBe(text)
    const fresh = await f.open('A'), table = fresh.definitionDataSet!.tables['OrdersAlias']!, view = table.getView('shared')!
    expect(table.modelBinding).toEqual({modelId: 'M1', modelName: 'Orders'})
    expect(table.resourceType).toBe(target.resourceType); expect(table.resourceId).toBe(source.name)
    expect(view.pageSize).toBe(12)
    expect((await fresh.loadModelFields('M1')).rows).toContainEqual(expect.objectContaining({rowid: 'F1', Name: output.Name, AsName: 'keyValue'}))
    expect((await view.loadFromServer()).success).toBe(true)
    expect(view.rows[0]?.['keyValue']).toBe('VALUE')
    expect(f.requests.at(-1)).toMatchObject({url: '/api/DataOperation/GetData', data: {Table: [{Name: 'Orders'}]}})
  })

  it.each(['direct', 'aggregate', 'api', 'write-api'] as const)('checks every saved view and request contract before a %s transition', async kind => {
    const {f, reader, writes} = await setup({deferDefinition: true, sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}]})
    const config = JSON.parse(f.stored.get('A')!)
    const table = config.tables.OrdersAlias
    if (kind === 'direct') {
      f.setModelValues({Type: '接口'})
      table.views.shared.queryConfig = {sourceInputMode: 'direct'}
    }
    if (kind === 'aggregate') table.views.shared.fieldProjection = [{fieldId: 'F1', source: 'resource', resourceFieldId: 'F1', resourceField: 'rowid',
      viewField: 'rowid', type: 'varchar', label: 'ID', output: true, sortOrder: 0, sortDirection: null, group: 1,
      distinct: false, primaryKey: true, value: '', valueFunction: '', expression: ''}]
    if (kind === 'api') table.api = {list: {url: '/api/Orders/query'}}
    if (kind === 'write-api') table.api = {update: {url: '/api/Orders/write'}}
    f.stored.set('A', JSON.stringify(config))
    const chosen = {...source, type: kind === 'direct' ? 'table' as const : 'interface' as const}
    reader.prepare.mockResolvedValue({...prepared, source: chosen, model: {...prepared.model, Type: kind === 'direct' ? '数据库表' : '接口'}, fields: [field]})
    const session = await f.open('A'), owner = session.getModelSourceEdit('M1')
    await owner.preview(chosen)
    expect(owner.getState().preview?.problems).toEqual([])
    await expect(owner.save()).rejects.toThrow(kind === 'direct' ? /shared.*SPARK_SOURCE_INPUT/ : kind === 'aggregate' ? /shared.*SPARK_QUERY_AGGREGATE/ : /OrdersAlias.*(api|crudConfig)/)
    expect(writes()).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('keeps a remote configuration conflict even when the transition changes no fields', async () => {
    const {f, reader, owner, writes} = await setup()
    const chosen = {...source, type: 'databaseView' as const}
    reader.prepare.mockResolvedValue({...prepared, source: chosen, model: {...prepared.model, Type: '数据库视图'}})
    await owner.preview(chosen)
    f.stored.set('A', `${f.stored.get('A')} `)
    await expect(owner.save()).rejects.toThrow('远端视图配置已变化')
    expect(writes()).toHaveLength(0)
  })

  it('retains transport policy and a compatible SQL aggregation across a source change', async () => {
    const {f, reader, writes} = await setup({formalProjection: true, sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}]})
    const config = JSON.parse(f.stored.get('A')!), table = config.tables.OrdersAlias
    table.api = {}; table.crudConfig = {timeout: 4500, retryCount: 0, validateData: true}
    table.views.shared.fieldProjection = [{fieldId: 'F1', source: 'resource', resourceFieldId: 'F1', resourceField: 'rowid',
      viewField: 'rowid', type: 'varchar', label: 'ID', output: true, sortOrder: 0, sortDirection: null, group: 1,
      distinct: false, primaryKey: true, value: '', valueFunction: '', expression: ''}]
    const text = JSON.stringify(config); f.stored.set('A', text)
    const chosen = {...source, type: 'databaseView' as const}
    reader.prepare.mockResolvedValue({...prepared, source: chosen, model: {...prepared.model, Type: '数据库视图'}, fields: [field]})
    const owner = (await f.open('A')).getModelSourceEdit('M1')
    await owner.preview(chosen); await owner.save()
    expect(writes()).toHaveLength(1); expect(f.stored.get('A')).toBe(text)
    const fresh = await f.open('A'), view = fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!
    expect((await view.loadFromServer()).success).toBe(true)
    expect(f.requests.at(-1)).toMatchObject({timeout: 4500, data: {Table: [{Name: 'Orders', Fields: [{Name: 'rowid', Group: 1}]}]}})
  })

  it('validates retained computed value functions against the target resource', async () => {
    const {reader, owner, writes} = await setup({sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'C1', dataModelId: 'M1', Name: 'computed', FieldType: '计算字段', IsPKey: 0,
        ValueFun: '{"Type":"GetTableField","Field":"rowid"}'}]})
    const chosen = {...source, type: 'interface' as const}
    reader.prepare.mockResolvedValue({...prepared, source: chosen, model: {...prepared.model, Type: '接口'}})
    await owner.preview(chosen)
    await expect(owner.save()).rejects.toThrow('来源未唯一匹配数据库字段执行合同')
    expect(writes()).toHaveLength(0)
  })

  it.each(['lost', 'partial'])('does not replay a cross-type batch after a %s receipt', async receipt => {
    const {f, reader, owner, writes} = await setup({omitModelProperties: receipt === 'partial' ? ['Type'] : []})
    const chosen = {...source, type: 'databaseView' as const}
    reader.prepare.mockResolvedValue({...prepared, source: chosen, model: {...prepared.model, Type: '数据库视图'}})
    await owner.preview(chosen)
    if (receipt === 'lost') f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    expect(writes()).toHaveLength(1)
    expect((await owner.verify()).confirmed).toBe(receipt === 'lost')
    await expect(owner.save()).rejects.toThrow()
    expect(writes()).toHaveLength(1)
  })
})

describe('same-contract source replacement', () => {
  it.each([false, true])('explicitly removes a missing source field in the replacement batch and reopens (lost=%s)', async lost => {
    const {owner, f, writes} = await setup({overviewOnly: true, allowDelete: true, sourceFields: [
      {...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'F2', dataModelId: 'M1', Name: 'obsolete', IsPKey: 0, IsOutput: 0},
    ]})
    expect(owner.getState().preview?.problems.join()).toContain('来源字段缺失')
    expect(owner.getState().preview?.removals).toEqual([])
    await owner.removeField({fieldId: 'F2', removed: true})
    expect(owner.getState().preview?.removals).toEqual([{id: 'F2', name: 'obsolete', type: 'dataModel'}])
    await owner.removeField({fieldId: 'F2', removed: false})
    expect(owner.getState().preview?.problems.join()).toContain('来源字段缺失')
    await owner.mapField({fieldId: 'F2', sourceName: 'extra'})
    expect(owner.getState().preview?.removals).toEqual([])
    await owner.removeField({fieldId: 'F2', removed: true})
    expect(owner.getState().preview?.problems).toEqual([])
    if (lost) {
      f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
      expect((await owner.verify()).confirmed).toBe(true)
    } else await owner.save()
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    const reopened = await f.open('A'), rows = (await reopened.loadModelFields('M1')).rows
    expect(rows.map(row => row['Name'])).toEqual(['rowid'])
    expect(f.modelRow().MetaName).toBe('NextOrders')
  })

  it.each(['primary', 'present', 'computed'])('does not offer destructive replacement for a %s field', async kind => {
    const row = kind === 'primary' ? {...field} : {...field, Name: kind === 'present' ? 'extra' : 'computed',
      FieldType: kind === 'computed' ? '计算字段' : 'varchar', IsPKey: 0}
    const {owner, writes} = await setup({allowDelete: true, sourceFields: [{...row, rowid: 'F1', dataModelId: 'M1'}]})
    await expect(owner.removeField({fieldId: 'F1', removed: true})).rejects.toThrow()
    owner.discard(); expect(writes()).toHaveLength(0)
  })

  it.each(['model', 'value', 'permission'])('blocks explicitly selected replacement removal with a %s dependency', async kind => {
    const {owner, f, session, writes} = await setup({allowDelete: true, denyDeleteIds: kind === 'permission' ? ['F2'] : [], sourceFields: [
      {...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'F2', dataModelId: 'M1', Name: 'obsolete', IsPKey: 0, IsOutput: 0},
      ...kind === 'value' ? [{...field, rowid: 'C1', dataModelId: 'M1', Name: 'computed', IsPKey: 0, FieldType: '计算字段', ValueFun: '{"Type":"GetTableField","Field":"obsolete"}'}] : [],
    ]})
    if (kind === 'model') {
      f.setModelValues({parentField: 'obsolete'}); await session.metadataDataSet.getView('Base_DataModel')!.loadFromServer()
      await owner.preview(source)
    }
    await owner.removeField({fieldId: 'F2', removed: true})
    await expect(owner.save()).rejects.toThrow(kind === 'permission' ? '不允许' : /引用|依赖/)
    expect(writes()).toHaveLength(0)
  })

  it.each(['constant', 'parameter'])('requires an explicit new source input %s and preserves it after lost receipt and reopen', async kind => {
    const {owner, f, session, reader, writes} = await setup({allowFieldAdd: true, overviewOnly: true})
    const input = {...field, type: 'inputParams' as const, Name: 'customerArg', IsPKey: 0, IsOutput: 0}
    f.setModelValues({Type: '接口'})
    await session.metadataDataSet.getView('Base_DataModel')!.loadFromServer()
    const apiSource = {...source, type: 'interface' as const}
    reader.prepare.mockResolvedValue({...prepared, source: apiSource, model: {...prepared.model, Type: '接口'}, fields: [...prepared.fields, input]})
    await owner.preview(apiSource)
    await expect(owner.save()).rejects.toThrow('新增来源入参')
    const value = kind === 'constant' ? ' {"Type":"GetConstValue","Value":{"ids":[1,2],"empty":null}} ' : '{"Type":"GetInputParam","ParamName":"customer"}'
    expect(() => owner.configureInput({sourceName: input.Name, value: '{"Type":"SystemData","ParamName":"customer"}'})).toThrow()
    expect(() => owner.configureInput({sourceName: input.Name, value: '{"Type":"GetInputParam","ParamName":"missing"}'})).toThrow()
    owner.configureInput({sourceName: input.Name, value})
    expect(owner.getState().preview?.problems).toEqual([])
    f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
    expect((await owner.verify()).confirmed).toBe(true)
    expect(writes()).toHaveLength(1)
    const rows = (await (await f.open('A')).loadSourceInputFields('M1')).rows
    expect(rows).toContainEqual(expect.objectContaining({type: 'inputParams', Name: 'customerArg', IsOutput: 0, ValueFun: value}))
  })

  it.each(['named-view', 'relation'])('preserves a missing source field referenced by a %s', async kind => {
    const {f, writes} = await setup({deferDefinition: true, overviewOnly: true, allowDelete: true, sourceFields: [
      {...field, rowid: 'F1', dataModelId: 'M1'}, {...field, rowid: 'F2', dataModelId: 'M1', Name: 'obsolete', IsPKey: 0},
    ], relationRows: kind === 'relation' ? [{rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders', depType: '', cascadeDel: 0,
      filter: '{"Type":"cond","Field":"obsolete","Operator":"equal","ValueFun":{"Type":"GetTableField","Field":"rowid"}}'}] : []})
    if (kind === 'named-view') {
      const config = JSON.parse(f.stored.get('A')!)
      config.tables.OrdersAlias.views.shared.labelField = 'obsolete'
      f.stored.set('A', JSON.stringify(config))
    }
    const owner = (await f.open('A')).getModelSourceEdit('M1')
    await owner.preview(source); await owner.removeField({fieldId: 'F2', removed: true})
    await expect(owner.save()).rejects.toThrow(kind === 'named-view' ? /labelField.*正式输出字段/ : /引用|依赖/)
    expect(writes()).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('keeps a partial replacement removal unresolved without replaying the batch', async () => {
    const {owner, f, writes} = await setup({allowDelete: true, omitDeleteWrite: 'Base_DataModel_Field', sourceFields: [
      {...field, rowid: 'F1', dataModelId: 'M1'}, {...field, rowid: 'F2', dataModelId: 'M1', Name: 'obsolete', IsPKey: 0, IsOutput: 0},
    ]})
    await owner.removeField({fieldId: 'F2', removed: true})
    await expect(owner.save()).rejects.toThrow('回读')
    expect((await owner.verify()).confirmed).toBe(false)
    expect(owner.getState().verification).toContainEqual(expect.objectContaining({id: 'F2', result: '字段仍存在，删除未确认'}))
    await expect(owner.save()).rejects.toThrow('先核验')
    expect(writes()).toHaveLength(1); expect(f.modelRow().MetaName).toBe('NextOrders')
    expect(() => owner.acceptCurrent()).toThrow()
    const fresh = await f.open('A')
    expect((await fresh.loadModelFields('M1')).rows.some(row => row['rowid'] === 'F2')).toBe(true)
  })

  it('rechecks configured source parameters and clears both choices on a fresh preview', async () => {
    const {owner, session, reader, writes} = await setup({allowFieldAdd: true, allowDelete: true, sourceFields: [
      {...field, rowid: 'F1', dataModelId: 'M1'}, {...field, rowid: 'F2', dataModelId: 'M1', Name: 'obsolete', IsPKey: 0, IsOutput: 0},
    ]})
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, type: 'inputParams', Name: 'arg', IsPKey: 0, IsOutput: 0}]})
    await owner.preview(source)
    await owner.removeField({fieldId: 'F2', removed: true})
    owner.configureInput({sourceName: 'arg', value: '{"Type":"GetInputParam","ParamName":"customer"}'})
    const space = session.metadataDataSet.getView('Base_DataSet')!
    space.updateEditingValue('A', 'inputParams', '[]')
    await expect(owner.save()).rejects.toThrow('其他定义操作')
    expect(space.getEditingRow('A')?.['inputParams']).toBe('[]')
    expect(writes()).toHaveLength(0)
    space.discardEditingRows(); owner.discard(); await owner.preview(source)
    expect(owner.getState().preview?.removals).toEqual([])
    expect(owner.getState().preview?.inputChoices).toEqual([{sourceName: 'arg', value: ''}])
    expect(owner.getState().preview?.problems.join()).toContain('新增来源入参')
  })

  it.each([false, true])('preserves computed definitions and migrates their explicit source references (mapped=%s)', async mapped => {
    const raw = mapped ? '{"Type":"GetTableField","Field":"parentId"}' : ' { "Type": "GetConstValue", "Value": "literal" } '
    const computed = {...field, rowid: 'C1', dataModelId: 'M1', Name: 'display', AsName: 'caption',
      description: '计算字段标题', FieldType: '计算字段', IsPKey: 0, ValueFun: raw, Expression: 'rule-id'}
    const {f, owner, reader, writes} = await setup({allowFieldEdit: true, sourceFields: [
      {...field, rowid: 'F1', dataModelId: 'M1'}, {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0}, computed,
    ]})
    if (mapped) {
      reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentCode', IsPKey: 0}]})
      await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    }
    expect(owner.getState().preview?.problems).toEqual([])
    expect(owner.getState().preview?.fieldChoices.some(item => item.id === 'C1')).toBe(false)
    expect(owner.getState().preview?.differences).toContainEqual({name: 'display', result: '保留计算字段及配置；取值引用按原合同核验'})
    f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
    expect((await owner.verify()).confirmed).toBe(true)
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    const fresh = await f.open('A'), fields = await fresh.loadModelFields('M1')
    expect(fields.rows.find(row => row['rowid'] === 'C1')).toMatchObject({...computed,
      ValueFun: mapped ? '{"Type":"GetTableField","Field":"parentCode"}' : raw})
    expect(fresh.definitionDataSet!.getView('OrdersAlias', 'shared')?.pageSize).toBe(12)
  })

  it.each(['source-collision', 'unknown-function', 'unknown-purpose', 'missing-name'] as const)('retains and rejects unresolved computed source contracts: %s', async kind => {
    const {owner, reader, writes} = await setup({sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'C1', dataModelId: 'M1', Name: kind === 'missing-name' ? '' : 'display', FieldType: '计算字段', IsPKey: 0,
        type: kind === 'unknown-purpose' ? 'legacy-process' : 'dataModel',
        ValueFun: kind === 'unknown-function' ? '{"Type":"UnknownFunction"}' : '{"Type":"GetConstValue","Value":1}'},
    ]})
    if (kind === 'source-collision') {
      reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'display', IsPKey: 0}]})
      await owner.preview(source)
    }
    expect(owner.getState().preview?.problems.length).toBeGreaterThan(0)
    if (kind === 'source-collision') expect(owner.getState().preview?.problems.join()).toContain('来源字段与保留的计算字段重名')
    await expect(owner.save()).rejects.toThrow()
    expect(writes()).toHaveLength(0)
  })

  it.each(['replace', 'synchronize'])('does not adopt a differing %s result while its original batch is unresolved', async operation => {
    const {owner, f, session, writes} = operation === 'replace' ? await setup() : await synchronize()
    const fields = await session.loadModelFields('M1')
    const fieldRows = [...fields.rows]
    const other = fields.createQueryView('unrelated-model')
    other.configure({queryContext: {dataSpaceId: 'A', modelId: 'M2'}})
    await other.loadFromServer()
    const otherRows = other.rows
    expect(other.requestState).toBe(RequestState.Loaded)
    f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
    f.setModelValues({description: '正式结果另有修改'})
    expect(await owner.verify()).toEqual({confirmed: false, modelId: null})
    expect(fields.requestState).toBe(RequestState.Loaded)
    expect(() => owner.acceptCurrent()).toThrow()
    expect(fields.requestState).toBe(RequestState.Loaded)
    expect(fields.rows).toEqual(fieldRows)
    expect(other.requestState).toBe(RequestState.Loaded); expect(other.rows).toBe(otherRows)
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel')!.rows.find(row => row['rowid'] === 'M1')?.['description']).toBe('正式结果另有修改')
    expect((await reopened.loadModelFields('M1')).rows.map(row => row['Name']).sort()).toEqual(
      operation === 'replace' ? ['parentId', 'rowid'] : ['computed', 'newField', 'rowid'])
  })

  it('retains loaded consumers and new drafts when adoption cannot invalidate every affected view', async () => {
    const {owner, f, session, writes} = await setup()
    const fields = await session.loadModelFields('M1')
    f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
    f.setModelValues({description: '正式结果另有修改'})
    await owner.verify()
    fields.updateEditingValue('F1', 'description', '核验后草稿')
    expect(() => owner.acceptCurrent()).toThrow('其他元数据草稿')
    expect(fields.requestState).toBe(RequestState.Loaded)
    expect(fields.getEditingRow('F1')?.['description']).toBe('核验后草稿')
    expect(owner.getState().status).toBe('different'); expect(writes()).toHaveLength(1)
  })

  it('does not clear field or relation consumers when a synchronization batch remains unresolved', async () => {
    const {f, writes} = await synchronize()
    const session = await f.open('A'), owner = session.getModelSourceEdit('M1')
    await owner.previewBoundSource()
    const fields = await session.loadModelFields('M1'), relations = session.metadataDataSet.getView('Base_DataModel_Relation')!
    f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
    f.setModelValues({description: '正式结果另有修改'}); await owner.verify()
    f.created.set('Base_DataModel_Relation', [{rowid: 'R', dataSetId: 'A', parentModId: 'M1', childModId: 'M2', filter: '', cascadeDel: 0}])
    await relations.loadFromServer({allPages: true})
    relations.updateEditingValue('R', 'cascadeDel', 1)
    expect(() => owner.acceptCurrent()).toThrow('原来源批次未确认')
    expect(fields.requestState).toBe(RequestState.Loaded)
    expect(relations.getEditingRow('R')?.['cascadeDel']).toBe(1)
    expect(owner.getState().status).toBe('different'); expect(writes()).toHaveLength(1)
  })

  it('reloads adopted source parameters through their own DataView without losing the original ValueFun', async () => {
    const raw = ' { "Type": "SystemData", "ParamName": "customer", "Extra": 7 } '
    const parameter = {...field, type: 'inputParams' as const, Name: 'customerArg', IsPKey: 0, IsOutput: 0}
    const {reader, owner, f, session, writes} = await setup({allowFieldEdit: true, sourceFields: [
      {...field, rowid: 'F1', dataModelId: 'M1'}, {...parameter, rowid: 'F2', dataModelId: 'M1', ValueFun: raw},
    ]})
    owner.discard(); f.setModelValues({Type: '接口'})
    await session.metadataDataSet.getView('Base_DataModel')!.loadFromServer({allPages: true})
    const apiSource = {...source, type: 'interface' as const}
    reader.prepare.mockResolvedValue({...prepared, source: apiSource, model: {...prepared.model, Type: '接口'}, fields: [field, {...parameter, Name: 'clientArg'}]})
    await owner.preview(apiSource); await owner.mapField({fieldId: 'F2', sourceName: 'clientArg'})
    const inputs = await session.loadSourceInputFields('M1')
    expect(inputs.rows[0]?.['Name']).toBe('customerArg')
    f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
    f.setModelValues({description: '正式结果另有修改'}); await owner.verify()
    expect(() => owner.acceptCurrent()).toThrow()
    expect(inputs.requestState).toBe(RequestState.Loaded)
    expect(inputs.rows).toContainEqual(expect.objectContaining({rowid: 'F2', Name: 'customerArg', ValueFun: raw}))
    expect(writes()).toHaveLength(1)
  })

  it.each([false, true])('synchronizes removed source fields from overview without loading default directories (lost=%s)', async lost => {
    const {f, session, owner, writes} = await synchronize({overviewOnly: true, deferDefinition: true})
    const fields = session.metadataDataSet.getView('Base_DataModel_Field')!, relations = session.metadataDataSet.getView('Base_DataModel_Relation')!
    expect(fields.rows).toEqual([]); expect(relations.rows).toEqual([])
    if (lost) {
      f.loseNextResponse()
      await expect(owner.save()).rejects.toThrow()
      expect((await owner.verify()).confirmed).toBe(true)
    } else await owner.save()
    expect(writes()).toHaveLength(1)
    expect(fields.rows).toEqual([]); expect(relations.rows).toEqual([])
    const reopened = await f.open('A'), rows = (await reopened.loadModelFields('M1')).rows
    expect(rows.map(row => row['Name']).sort()).toEqual(['computed', 'newField', 'rowid'])
    expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['field', 'relation'])('checks a newly added %s dependency before overview synchronization deletes fields', async kind => {
    const {f, owner, session, writes} = await synchronize({overviewOnly: true, deferDefinition: true})
    if (kind === 'field') f.created.set('Base_DataModel_Field', [{rowid: 'REF', dataSetId: 'A', dataModelId: 'M2',
      Name: 'dependent', type: 'inputParams', ValueFun: JSON.stringify({Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'removed', FkFieldName: 'rowid'})}])
    else f.created.set('Base_DataModel_Relation', [{rowid: 'REL', dataSetId: 'A', parentModId: 'M1', childModId: 'M2',
      parentTable: 'OrderSource', childTable: 'CustomerSource', filter: JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: {Type: 'GetTableField', Field: 'removed'}})}])
    await expect(owner.save()).rejects.toThrow(/仍有配置依赖/)
    expect(writes()).toHaveLength(0)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.rows).toEqual([])
  })

  it.each([false, true])('replaces a source from overview with scoped field views and reopens the result (lost=%s)', async lost => {
    const {f, session, owner, writes} = await setup({overviewOnly: true, deferDefinition: true, allowFieldAdd: true,
      sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'},
        {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0},
        {...field, rowid: 'OTHER', dataModelId: 'M2', Name: 'unrelated', ValueFun: 'unrelated legacy value'}]})
    expect(owner.getState().preview?.problems).toEqual([])
    await owner.includeField({sourceName: 'extra', included: true})
    owner.discard()
    expect(writes()).toHaveLength(0)
    await owner.preview(source)
    await owner.includeField({sourceName: 'extra', included: true})
    if (lost) {
      f.loseNextResponse()
      await expect(owner.save()).rejects.toThrow()
      await expect(owner.save()).rejects.toThrow('先核验')
      expect(await owner.verify()).toEqual({confirmed: true, modelId: 'M1'})
    } else await owner.save()
    expect(writes()).toHaveLength(1)
    for (const table of ['Base_DataModel_Field', 'Base_DataModel_Relation']) {
      expect(session.metadataDataSet.getView(table)!.rows).toEqual([])
    }
    const reopened = await f.open('A'), fields = await reopened.loadModelFields('M1')
    expect(fields.rows.map(row => row['Name']).sort()).toEqual(['extra', 'parentId', 'rowid'])
    expect(f.modelRow()).toMatchObject({Name: 'Orders', MetaName: 'NextOrders'})
    const reads = f.requests.filter(request => request.url.includes('GetData') && JSON.stringify(request.data).includes('Base_DataModel_Field'))
    expect(reads.length).toBeGreaterThan(0)
    for (const read of reads) expect(JSON.stringify(read.data)).toContain('dataModelId')
    expect((await reopened.loadModelFields('M2')).rows.find(row => row['rowid'] === 'OTHER')?.['ValueFun']).toBe('unrelated legacy value')
  })

  it.each([false, true])('synchronizes from overview using only this model fields and reopens the result (lost=%s)', async lost => {
    const bound = {...source, id: 'CURRENT', name: 'OrderSource', dbid: 'DB', databaseName: 'old-database'}
    const f = dataSpacePageFixture({overviewOnly: true, allowSourceEdit: true, allowFieldAdd: true, sourceFields: [
      {...field, rowid: 'F1', dataModelId: 'M1'}, {...field, rowid: 'OTHER', dataModelId: 'M2', Name: 'unrelated'},
    ], modelSources: {query: async () => ({rows: [bound], total: 1}), prepare: async () => ({...prepared, source: bound,
      model: {...prepared.model, MetaName: bound.name, DbId: bound.dbid, DbName: bound.databaseName}, fields: [field, {...field, Name: 'fresh', IsPKey: 0}]})}})
    fixtures.push(f)
    const session = await f.open('A'), owner = session.getModelSourceEdit('M1')
    await owner.previewBoundSource()
    expect(owner.getState().preview?.removals).toEqual([])
    expect(owner.getState().preview?.differences.map(item => item.name)).toEqual(['rowid', 'fresh'])
    owner.discard()
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
    await session.loadModelInputFields('M2')
    await owner.previewBoundSource()
    if (lost) {
      f.loseNextResponse()
      await expect(owner.save()).rejects.toThrow()
      await expect(owner.save()).rejects.toThrow('先核验')
      expect(await owner.verify()).toEqual({confirmed: true, modelId: 'M1'})
    } else await owner.save()
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(1)
    for (const name of ['Base_DataModel_Field', 'Base_DataModel_Relation']) {
      expect(session.metadataDataSet.getView(name)?.rows).toEqual([])
    }
    const reopened = await f.open('A'), rows = (await reopened.loadModelFields('M1')).rows
    expect(rows.map(row => row['Name']).sort()).toEqual(['fresh', 'rowid'])
    const reads = f.requests.filter(request => request.url.includes('GetData') && JSON.stringify(request.data).includes('Base_DataModel_Field'))
    expect(reads.length).toBeGreaterThan(1)
    for (const read of reads) expect(JSON.stringify(read.data)).toContain('dataModelId')
    expect(f.modelRow().MetaName).toBe('OrderSource')
  })

  it.each(['addition', 'deletion', 'named-draft', 'reference'])('rejects synchronization before staging for %s', async kind => {
    const {owner, session, f, writes} = await synchronize({allowFieldAdd: kind !== 'addition', denyDeleteIds: kind === 'deletion' ? ['F2'] : []})
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    if (kind === 'named-draft') {
      await session.loadModelFields('M1')
      session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!.updateEditingValue('F1', 'ValueFun', 'draft')
    }
    if (kind === 'reference') {
      f.setModelValues({parentField: 'removed'})
      await session.metadataDataSet.getView('Base_DataModel', 'default')!.loadFromServer({allPages: true})
      await owner.previewBoundSource()
    }
    await expect(owner.save()).rejects.toThrow(kind === 'named-draft' ? '其他元数据草稿' : kind === 'reference' ? '依赖' : '不允许')
    expect(writes()).toHaveLength(0)
    expect(fields.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(fields.rows.some(row => row['rowid'] === 'F2')).toBe(true)
  })

  it('rejects a changed synchronization query scope without dispatch or permission reuse', async () => {
    const {owner, session, writes} = await synchronize()
    const view = session.metadataDataSet.getView('Base_DataModel_Field', 'sourceSync:M1')!
    view.queryContext = {...view.queryContext, modelId: 'M2', modelIds: ['M2']}
    await expect(owner.save()).rejects.toThrow('查询或目标已变化')
    expect(writes()).toHaveLength(0)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('does not borrow old directory add permission after the synchronization query loses it', async () => {
    const {owner, f, session, writes} = await synchronize({sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}]})
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.addActionState()).toBe('enabled')
    f.denyFieldAdd()
    await expect(owner.save()).rejects.toThrow('不允许新增字段')
    expect(writes()).toHaveLength(0)
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'sourceSync:M1')!.addActionState()).toBe('hidden')
  })

  it('retains a removal preview when the scoped dependency query fails instead of assuming no references', async () => {
    const bound = {...source, id: 'CURRENT', name: 'OrderSource', dbid: 'DB', databaseName: 'old-database'}
    const f = dataSpacePageFixture({overviewOnly: true, allowSourceEdit: true, allowDelete: true, sourceFields: [
      {...field, rowid: 'F1', dataModelId: 'M1'}, {...field, rowid: 'F2', dataModelId: 'M1', Name: 'obsolete', IsPKey: 0, IsOutput: 0},
    ], modelSources: {query: async () => ({rows: [bound], total: 1}), prepare: async () => ({...prepared, source: bound,
      model: {...prepared.model, MetaName: bound.name, DbId: bound.dbid, DbName: bound.databaseName}, fields: [field]})}})
    fixtures.push(f)
    const session = await f.open('A'), owner = session.getModelSourceEdit('M1')
    await owner.previewBoundSource()
    expect(owner.getState().preview?.removals).toEqual([{id: 'F2', name: 'obsolete', type: 'dataModel'}])
    const sourceFields = session.metadataDataSet.getView('Base_DataModel_Field', 'sourceSync:M1')!
    const load = sourceFields.loadFromServer.bind(sourceFields)
    vi.spyOn(sourceFields, 'loadFromServer').mockImplementationOnce(async (...args) => {
      const result = await load(...args); f.failNextFieldRead(); return result
    })
    await expect(owner.save()).rejects.toThrow('field read unavailable')
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
    expect(owner.getState()).toMatchObject({status: 'ready', preview: {operation: 'synchronize'}})
    for (const name of ['Base_DataModel_Field', 'Base_DataModel_Relation']) expect(session.metadataDataSet.getView(name)?.rows).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'sourceSync:M1')?.rows.some(row => row['rowid'] === 'F2')).toBe(true)
  })

  it.each(['database', 'duplicate'])('rejects a %s source identity mismatch without name-only fallback', async kind => {
    const {owner, reader, writes} = await synchronize()
    const bound = {...source, id: 'CURRENT', name: 'OrderSource', dbid: kind === 'database' ? 'OTHER_DB' : 'DB'}
    reader.query.mockResolvedValue({rows: kind === 'database' ? [bound] : [bound, {...bound, id: 'SECOND'}], total: kind === 'database' ? 1 : 2})
    await expect(owner.previewBoundSource()).rejects.toThrow('已绑定来源不存在、不唯一')
    expect(writes()).toHaveLength(0)
  })

  it('retains a partial synchronization for explicit verification without replay', async () => {
    const {owner, writes} = await synchronize({omitDeleteWrite: 'Base_DataModel_Field'})
    await expect(owner.save()).rejects.toThrow('回读')
    await expect(owner.save()).rejects.toThrow('先核验')
    expect((await owner.verify()).confirmed).toBe(false)
    expect(owner.getState().verification).toContainEqual(expect.objectContaining({id: 'F2', result: '字段仍存在，删除未确认'}))
    expect(writes()).toHaveLength(1)
    expect(() => owner.acceptCurrent()).toThrow()
  })

  it('synchronizes source parameters by purpose while preserving unrelated definitions', async () => {
    const {owner, reader, f, writes} = await synchronize({sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'P1', dataModelId: 'M1', type: 'inputParams', Name: 'oldArg', IsPKey: 0, IsOutput: 0},
      {...field, rowid: 'X1', dataModelId: 'M1', type: 'other', Name: 'internal', IsPKey: 0}]})
    const current = await reader.prepare.mock.results.at(-1)!.value
    reader.prepare.mockResolvedValue({...current, fields: [field, {...field, type: 'inputParams', Name: 'newArg', IsPKey: 0, IsOutput: 0}]})
    await owner.previewBoundSource()
    await expect(owner.save()).rejects.toThrow('新增来源入参')
    owner.configureInput({sourceName: 'newArg', value: '{"Type":"GetInputParam","ParamName":"customer"}'})
    await owner.save()
    const rows = (await f.open('A')).metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows
    expect(rows.some(row => row['rowid'] === 'P1')).toBe(false)
    expect(rows.some(row => row['rowid'] === 'X1')).toBe(true)
    expect(rows).toContainEqual(expect.objectContaining({Name: 'newArg', type: 'inputParams', IsOutput: 0, ValueFun: '{"Type":"GetInputParam","ParamName":"customer"}'}))
    expect(writes()).toHaveLength(1)
  })

  it.each(['interface', 'logicView'] as const)('synchronizes explicit %s input mappings and reopens formal named-view requests', async type => {
    const {f, owner, session, oldValue, writes} = await synchronizeInputs(type)
    expect(owner.getState().preview?.inputChoices).toEqual([{sourceName: 'newArg', value: ''}])
    await expect(owner.save()).rejects.toThrow('新增来源入参')
    expect(writes()).toHaveLength(0)
    const value = type === 'interface' ? '{"Type":"GetInputParam","ParamName":"customer"}'
      : ' {"Type":"GetConstValue","Value":{"ids":[1,2],"empty":null}} '
    expect(() => owner.configureInput({sourceName: 'newArg', value: '{"Type":"SystemData","ParamName":"customer"}'})).toThrow()
    owner.configureInput({sourceName: 'newArg', value})
    expect(owner.getState().preview?.problems).toEqual([])
    if (type === 'interface') {f.loseNextResponse(); await expect(owner.save()).rejects.toThrow(); expect((await owner.verify()).confirmed).toBe(true)}
    else await owner.save()
    expect(writes()).toHaveLength(1)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    const reopened = await f.open('A')
    expect((await reopened.loadSourceInputFields('M1')).rows).toEqual(expect.arrayContaining([
      expect.objectContaining({Name: 'newArg', ValueFun: value, IsOutput: 0, type: 'inputParams'}),
      expect.objectContaining({rowid: 'P1', ValueFun: oldValue}),
    ]))
    await reopened.loadDefinition()
    const view = reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!
    view.configure({queryContext: {customer: 'C10'}, pageSize: 1})
    await view.refresh(); await view.setSort([{field: 'rowid', direction: 'desc'}]); await view.setPage(2)
    expect(view.loadingError).toBeNull(); expect(view.rows).toHaveLength(1)
    const queries = f.requests.map(request => request.data).filter(isRecord)
      .flatMap(data => Array.isArray(data['Table']) ? data['Table'].filter(isRecord) : []).filter(table => table['Name'] === 'Orders')
    expect(queries).toHaveLength(3)
    for (const query of queries) expect(query['inputParams']).toEqual(expect.arrayContaining([
      {Name: 'existingArg', Value: false}, {Name: 'newArg', Value: type === 'interface' ? 'C10' : {ids: [1, 2], empty: null}},
    ]))
    expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['type', 'primary'])('shows the actual %s synchronization conflict and permits a fresh corrected preview', async kind => {
    const {owner, reader, writes} = await synchronize({sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}]})
    const original = await reader.prepare.mock.results.at(-1)!.value
    reader.prepare.mockResolvedValue({...original, fields: [{...field, ...kind === 'type' ? {FieldType: 'int'} : {IsPKey: 0}}]})
    await owner.previewBoundSource()
    expect(owner.getState().preview?.differences[0]?.result).toContain(kind === 'type' ? 'varchar → int' : '1 → 0')
    await expect(owner.save()).rejects.toThrow('主键合同')
    expect(writes()).toHaveLength(0)
    owner.discard(); reader.prepare.mockResolvedValue(original); await owner.previewBoundSource()
    expect(owner.getState().preview?.problems).toEqual([])
    expect(writes()).toHaveLength(0)
  })

  it.each(['permission', 'parameter', 'source'])('rechecks %s before saving newly configured synchronization inputs', async kind => {
    const {f, session, owner, reader, oldValue, writes} = await synchronizeInputs('interface')
    owner.configureInput({sourceName: 'newArg', value: '{"Type":"GetInputParam","ParamName":"customer"}'})
    if (kind === 'permission') f.denyFieldAdd()
    if (kind === 'parameter') session.metadataDataSet.getView('Base_DataSet')!.updateEditingValue('A', 'inputParams', '[]')
    if (kind === 'source') {
      const current = await reader.prepare()
      reader.prepare.mockResolvedValue({...current, fields: [field]})
    }
    await expect(owner.save()).rejects.toThrow()
    expect(writes()).toHaveLength(0)
    expect(owner.getState().preview?.inputChoices).toEqual([{sourceName: 'newArg', value: '{"Type":"GetInputParam","ParamName":"customer"}'}])
    expect((await session.loadSourceInputFields('M1')).rows).toEqual([expect.objectContaining({rowid: 'P1', ValueFun: oldValue})])
  })

  it('cancels newly configured synchronization inputs without writing or retaining a stale confirmation', async () => {
    const {session, owner, oldValue, writes} = await synchronizeInputs('interface')
    owner.configureInput({sourceName: 'newArg', value: '{"Type":"GetConstValue","Value":null}'})
    owner.discard()
    expect(owner.getState()).toMatchObject({status: 'idle', pending: false, preview: null})
    expect((await session.loadSourceInputFields('M1')).rows).toEqual([expect.objectContaining({rowid: 'P1', ValueFun: oldValue})])
    await owner.previewBoundSource()
    expect(owner.getState().preview?.inputChoices).toEqual([{sourceName: 'newArg', value: ''}])
    expect(writes()).toHaveLength(0)
  })

  it('compares source type names without case but preserves the original stored spelling', async () => {
    const {owner, session, writes} = await synchronize({sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1', FieldType: 'VARCHAR'}]})
    expect(owner.getState().preview?.problems).toEqual([])
    await owner.save()
    expect((await session.loadModelFields('M1')).rows.find(row => row['rowid'] === 'F1')?.['FieldType']).toBe('VARCHAR')
    expect(writes().flatMap(request => request.data)).toEqual([expect.objectContaining({CrudModel: expect.objectContaining({Changed: []})})])
  })

  it('synchronizes additions and removals in one field batch while retaining original and computed fields', async () => {
    const {owner, session, f, writes} = await synchronize()
    const before = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows.find(row => row['rowid'] === 'C1')
    await owner.save()
    const commands = writes().flatMap(request => request.data)
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({TableName: 'Base_DataModel_Field', CrudModel: {
      Added: [expect.objectContaining({Name: 'newField', IsOutput: 0})], Changed: [],
      Deleted: [expect.objectContaining({rowid: 'F2', lingma_sys_key: 'token-A-F2'})]}})
    const rows = (await f.open('A')).metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows
    expect(rows.find(row => row['rowid'] === 'C1')).toEqual(before)
    expect(rows.some(row => row['rowid'] === 'F2')).toBe(false)
    expect(rows.some(row => row['Name'] === 'newField')).toBe(true)
    expect(owner.getState().status).toBe('idle')
  })

  it('recovers a deletion staging failure without dispatching or retaining partial additions', async () => {
    const {owner, session, writes} = await synchronize()
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'sourceSync:M1')!
    const remove = fields.removeRow.bind(fields)
    vi.spyOn(fields, 'removeRow').mockImplementationOnce(async id => {await remove(id); throw new Error('delete staging failed')})
    await expect(owner.save()).rejects.toThrow('delete staging failed')
    expect(owner.getState().status).toBe('unsubmitted')
    expect((await owner.verify()).confirmed).toBe(false)
    expect(fields.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(fields.rows.some(row => row['rowid'] === 'F2')).toBe(true)
    expect(fields.rows.some(row => row['Name'] === 'newField')).toBe(false)
    expect(writes()).toHaveLength(0)
  })

  it('blocks deletion while opaque data processing configurations still need reference review', async () => {
    const {owner, f, session, writes} = await synchronize()
    f.setModelValues({addApi: '{"model":"Orders","fields":["removed"]}'})
    await session.metadataDataSet.getView('Base_DataModel', 'default')!.loadFromServer({allPages: true})
    await owner.previewBoundSource()
    await expect(owner.save()).rejects.toThrow('addApi')
    expect(writes()).toHaveLength(0)
  })

  it('verifies a lost synchronization receipt without resending mixed additions and removals', async () => {
    const {owner, f, writes} = await synchronize()
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    expect(await owner.verify()).toMatchObject({confirmed: true, modelId: 'M1'})
    expect(writes()).toHaveLength(1)
  })

  it('previews bound-source synchronization without changing source identity or losing computed definitions', async () => {
    const {owner, reader, writes} = await setup({sourceFields: [
      {...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'F2', dataModelId: 'M1', Name: 'removed', IsPKey: 0},
      {...field, rowid: 'C1', dataModelId: 'M1', Name: 'computed', FieldType: '计算字段', IsPKey: 0},
    ]})
    owner.discard()
    const bound = {...source, id: 'CURRENT', name: 'OrderSource', dbid: 'DB', databaseName: 'old-database'}
    reader.query.mockResolvedValue({rows: [bound], total: 1})
    reader.prepare.mockResolvedValue({...prepared, source: bound, model: {...prepared.model, MetaName: bound.name, DbId: bound.dbid, DbName: bound.databaseName},
      fields: [field, {...field, Name: 'newField', IsPKey: 0, IsOutput: 0}]})
    await owner.previewBoundSource()
    expect(owner.getState().preview).toMatchObject({operation: 'synchronize', name: 'Orders',
      removals: [{id: 'F2', name: 'removed'}], additions: [{sourceName: 'newField', included: true}], problems: []})
    expect(writes()).toHaveLength(0)
    owner.discard(); expect(owner.getState().status).toBe('idle')
  })

  it('finishes a no-op synchronization without a fabricated database receipt or file write', async () => {
    const current = {...source, id: 'CURRENT', name: 'OrderSource', dbid: 'DB', databaseName: 'old-database'}
    const {owner, reader, f, writes} = await setup({allowFieldAdd: true, allowDelete: true, sourceFields: [
      {...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0},
      {...field, rowid: 'F3', dataModelId: 'M1', Name: 'extra', IsPKey: 0},
    ]})
    owner.discard()
    reader.query.mockResolvedValue({rows: [current], total: 1})
    reader.prepare.mockResolvedValue({...prepared, source: current,
      model: {...prepared.model, MetaName: current.name, DbId: current.dbid, DbName: current.databaseName},
      fields: [field, {...field, Name: 'parentId', IsPKey: 0}, {...field, Name: 'extra', IsPKey: 0}]})
    await owner.previewBoundSource()
    expect(owner.getState().preview).toMatchObject({operation: 'synchronize', additions: [], removals: [], contractChanges: [], problems: []})
    const originalFile = f.stored.get('A')

    await expect(owner.save()).resolves.toBe('M1')

    expect(owner.getState()).toMatchObject({status: 'idle', pending: false})
    expect(writes()).toHaveLength(0)
    expect(f.fileWrites).toHaveLength(0)
    expect(f.stored.get('A')).toBe(originalFile)
  })

  it('maps a renamed source field to its original ID and output, and explicitly introduces a new output field', async () => {
    const {owner, reader, session, f, writes} = await setup({allowFieldAdd: true, allowFieldEdit: true})
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentCode', IsPKey: 0}, {...field, Name: 'extra', IsPKey: 0}]})
    await owner.preview(source)
    await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    await owner.includeField({sourceName: 'extra', included: true})
    expect(owner.getState().preview?.problems).toEqual([])
    const originalFile = f.stored.get('A')
    expect(await owner.save()).toBe('M1')
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows).toEqual([])
    const fields = await session.loadModelFields('M1')
    expect(fields.rows.find(row => row['rowid'] === 'F2')).toMatchObject({Name: 'parentCode', AsName: 'parentId', FieldType: 'varchar', IsPKey: 0})
    const added = fields.rows.find(row => row['Name'] === 'extra')!
    expect(added).toMatchObject({dataSetId: 'A', dataModelId: 'M1', IsOutput: 1})
    expect(writes().flatMap(request => request.data)).toEqual(expect.arrayContaining([expect.objectContaining({TableName: 'Base_DataModel_Field',
      CrudModel: expect.objectContaining({Changed: [expect.objectContaining({rowid: 'F2', Name: 'parentCode', AsName: 'parentId', lingma_sys_key: 'token-A-F2'})],
        Added: [expect.objectContaining({Name: 'extra', dataModelId: 'M1'})]})})]))
    const fresh = await f.open('A')
    const view = fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!
    expect(view.columns.map(column => column.name)).toEqual(expect.arrayContaining(['rowid', 'parentId', 'extra']))
    expect(view.treeConfig).toMatchObject({parentIdField: 'parentId'})
    expect(view.pageSize).toBe(12)
    expect(f.stored.get('A')).toBe(originalFile); expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['unknown', 'partial'])('verifies mixed field writes without replay after %s results', async kind => {
    const {owner, f, writes} = await setup({allowFieldAdd: true, omitFieldWrite: kind === 'partial'})
    await owner.includeField({sourceName: 'extra', included: true})
    if (kind === 'unknown') f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    const before = writes().length
    await expect(owner.save()).rejects.toThrow('先核验')
    expect((await owner.verify()).confirmed).toBe(kind === 'unknown')
    expect(writes()).toHaveLength(before)
    if (kind === 'partial') {
      expect(owner.getState().verification.some(item => item.result.includes('未读取'))).toBe(true)
      expect(() => owner.acceptCurrent()).toThrow()
    }
  })

  it('rejects introducing an output that collides with a local computed column', async () => {
    const {f, writes} = await setup({allowFieldAdd: true})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'},
      columns: [{name: 'extra', type: 'string', computeExpression: '"local"'}], views: {default: {}}}}}))
    const fresh = await f.open('A'), owner = fresh.getModelSourceEdit('M1')
    await owner.preview(source); await owner.includeField({sourceName: 'extra', included: true})
    await expect(owner.save()).rejects.toThrow('本地计算列')
    expect(writes()).toHaveLength(0)
  })

  it('checks the remote view definition before introducing new output fields', async () => {
    const {f, owner, writes} = await setup({allowFieldAdd: true})
    await owner.includeField({sourceName: 'extra', included: true})
    f.stored.set('A', f.stored.get('A')!.replace('"pageSize":12', '"pageSize":14'))
    await expect(owner.save()).rejects.toThrow('视图配置已变化')
    expect(writes()).toHaveLength(0)
  })

  it('retains the exact legacy ValueFun when a source parameter is explicitly mapped to a new name', async () => {
    const raw = ' { "Type": "SystemData", "ParamName": "customer", "Extra": 7 } '
    const parameter = {...field, type: 'inputParams' as const, Name: 'customerArg', IsPKey: 0, IsOutput: 0}
    const {reader, owner, f} = await setup({allowFieldEdit: true, sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'},
      {...parameter, rowid: 'F2', dataModelId: 'M1', ValueFun: raw}]})
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...parameter, Name: 'clientArg'}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'clientArg'}); await owner.save()
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows.find(row => row['rowid'] === 'F2')).toMatchObject({Name: 'clientArg', ValueFun: raw})
  })

  it('rejects two existing fields mapped to the same source field', async () => {
    const {owner, reader, writes} = await setup({sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0}, {...field, rowid: 'F3', dataModelId: 'M1', Name: 'other', IsPKey: 0}]})
    reader.prepare.mockResolvedValue({...prepared, fields: [...prepared.fields, {...field, Name: 'other', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F3', sourceName: 'parentId'})
    await expect(owner.save()).rejects.toThrow('多个记录'); expect(writes()).toHaveLength(0)
  })

  it.each(['mapping', 'addition'])('recovers its %s staging failure without dispatching or losing another draft', async kind => {
    const {owner, reader, session, writes} = await setup({allowFieldEdit: true, allowFieldAdd: true})
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'sourceReplace:M1')!
    if (kind === 'mapping') {
      reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentCode', IsPKey: 0}]})
      await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
      const apply = fields.applyEditingRows.bind(fields)
      vi.spyOn(fields, 'applyEditingRows').mockImplementationOnce(async ids => {await apply(ids); throw new Error('field staging failed')})
    } else {
      await owner.includeField({sourceName: 'extra', included: true})
      const add = fields.addRow.bind(fields)
      vi.spyOn(fields, 'addRow').mockImplementationOnce(async values => {await add(values); throw new Error('field staging failed')})
    }
    await expect(owner.save()).rejects.toThrow('field staging failed')
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    models.updateEditingValue('M2', 'description', 'other')
    await expect(owner.verify()).rejects.toThrow('其他元数据草稿')
    expect(models.getEditingRow('M2')?.['description']).toBe('other')
    models.discardEditingRows(['M2'])
    expect((await owner.verify()).confirmed).toBe(false)
    expect(fields.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(models.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(writes()).toHaveLength(0)
  })

  it.each([false, true])('preserves a source addition edited during repeated recovery, staged=%s', async staged => {
    const {owner, session, f, writes} = await setup({allowFieldAdd: true, allowFieldEdit: true})
    await owner.includeField({sourceName: 'extra', included: true})
    f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'sourceReplace:M1')!
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const dataSet = session.metadataDataSet, save = dataSet.saveChanges.bind(dataSet)
    const held = vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {
      const result = await save(options); await gate; return result
    })
    const verifying = expect(owner.verify()).rejects.toThrow(/草稿|编辑/)
    await vi.waitFor(() => expect(held).toHaveBeenCalledTimes(1))
    const id = String(fields.rows.find(row => row['Name'] === 'extra')!['rowid'])
    fields.updateEditingValue(id, 'AsName', 'laterExtra')
    if (staged) expect((await fields.applyEditingRows([id])).success).toBe(true)
    release(); await verifying
    expect(fields.getEditingRow(id)?.['AsName']).toBe('laterExtra')
    await expect(owner.verify()).rejects.toThrow(/草稿|编辑/)
    expect(fields.getEditingRow(id)?.['AsName']).toBe('laterExtra'); expect(writes()).toHaveLength(1)
    fields.discardPendingChanges([id])
    expect((await owner.verify()).confirmed).toBe(true); expect(writes()).toHaveLength(1)
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel_Field')!.rows.find(row => row['rowid'] === id)?.['AsName']).toBe('')
  })

  it('does not discard its staged field if it has subsequently been edited', async () => {
    const {owner, reader, session, f, writes} = await setup({allowFieldEdit: true})
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentCode', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'sourceReplace:M1')!
    fields.updateEditingValue('F2', 'AsName', 'subsequent')
    await expect(owner.verify()).rejects.toThrow('原来源目标草稿在核验前已改变')
    expect(fields.getEditingRow('F2')?.['AsName']).toBe('subsequent')
    expect(writes()).toHaveLength(1)
  })

  it('migrates the raw parent field while retaining the output flag and literal tree root', async () => {
    const {f, owner, session, reader, writes} = await setup({allowFieldEdit: true})
    f.setModelValues({parentField: 'parentId', hasChildField: 'parentId', topValue: 'parentId'})
    await session.metadataDataSet.getView('Base_DataModel', 'default')!.loadFromServer({allPages: true})
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentCode', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    expect(owner.getState().preview?.problems).toEqual([])
    await owner.save()
    expect(f.modelRow()).toMatchObject({parentField: 'parentCode', hasChildField: 'parentId', topValue: 'parentId'})
    expect(writes()).toHaveLength(1)
    const fresh = await f.open('A')
    expect(fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!.treeConfig).toMatchObject({parentIdField: 'parentId'})
  })

  it.each(['add', 'edit'])('rechecks the formal %s permission before staging any source changes', async kind => {
    const {owner, reader, f, session, writes} = await setup()
    if (kind === 'add') await owner.includeField({sourceName: 'extra', included: true})
    else {
      reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentCode', IsPKey: 0}]})
      await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    }
    await expect(owner.save()).rejects.toThrow('不允许')
    expect(writes()).toHaveLength(0)
    expect(f.modelRow().MetaName).toBe('OrderSource')
    expect(session.metadataDataSet.getView('Base_DataModel', 'default')!.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('migrates primary and parent source names together, preserving canonical primary-key and tree bindings', async () => {
    const {f, owner, session, reader, writes} = await setup({allowFieldEdit: true})
    f.setModelValues({parentField: 'parentId', PrimaryKeyFields: 'rowid', hasChildField: 'rowid'})
    await session.metadataDataSet.getView('Base_DataModel', 'default')!.loadFromServer({allPages: true})
    reader.prepare.mockResolvedValue({...prepared, fields: [{...field, Name: 'newId'}, {...field, Name: 'newParent', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F1', sourceName: 'newId'}); await owner.mapField({fieldId: 'F2', sourceName: 'newParent'})
    expect(owner.getState().preview?.modelChanges).toEqual([{property: 'parentField', before: 'parentId', after: 'newParent'}, {property: 'PrimaryKeyFields', before: 'rowid', after: 'newId'}])
    f.denyModelField('hasChildField')
    await owner.save()
    expect(f.modelRow()).toMatchObject({parentField: 'newParent', PrimaryKeyFields: 'newId', hasChildField: 'rowid'})
    expect(writes()[0]?.data).toEqual(expect.arrayContaining([expect.objectContaining({TableName: 'Base_DataModel', CrudModel: expect.objectContaining({Changed: [expect.objectContaining({rowid: 'M1', parentField: 'newParent', PrimaryKeyFields: 'newId', lingma_sys_key: 'token-A-M1'})]})})]))
    const fresh = await f.open('A'), view = fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!
    expect(view.primaryKey).toBe('rowid'); expect(view.treeConfig).toMatchObject({idField: 'rowid', parentIdField: 'parentId'})
    expect(view.columns.map(column => column.name)).toEqual(expect.arrayContaining(['rowid', 'parentId']))
    expect(f.fileWrites).toHaveLength(0)
  })

  it('rejects unsupported composite keys without rewriting the original declaration or mappings', async () => {
    const {f, owner, session, reader, writes} = await setup({allowFieldEdit: true, sourceFields: [
      {...field, rowid: 'F1', dataModelId: 'M1'}, {...field, rowid: 'F2', dataModelId: 'M1', Name: 'otherKey'},
    ]})
    f.setModelValues({PrimaryKeyFields: ' rowid , otherKey '})
    await session.metadataDataSet.getView('Base_DataModel', 'default')!.loadFromServer({allPages: true})
    reader.prepare.mockResolvedValue({...prepared, fields: [{...field, Name: 'nextKey'}, {...field, Name: 'rowid'}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F1', sourceName: 'nextKey'}); await owner.mapField({fieldId: 'F2', sourceName: 'rowid'})
    expect(owner.getState().preview?.problems.join()).toContain('多个主键')
    await expect(owner.save()).rejects.toThrow('多个主键')
    expect(writes()).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
    owner.discard()
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel', 'default')!.rows[0]?.['PrimaryKeyFields']).toBe(' rowid , otherKey ')
    expect((await fresh.loadModelFields('M1')).rows.map(row => row['Name'])).toEqual(['rowid', 'otherKey'])
  })

  it.each(['parentField', 'PrimaryKeyFields'])('rechecks %s write permission and rejects remote changes before staging', async property => {
    const {f, owner, session, reader, writes} = await setup({allowFieldEdit: true})
    const name = property === 'parentField' ? 'parentId' : 'rowid'
    f.setModelValues({[property]: name})
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    await models.loadFromServer({allPages: true})
    reader.prepare.mockResolvedValue({...prepared, fields: [{...field, Name: 'newId'}, {...field, Name: 'newParent', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F1', sourceName: 'newId'}); await owner.mapField({fieldId: 'F2', sourceName: 'newParent'})
    f.denyModelField(property)
    await expect(owner.save()).rejects.toThrow('不允许修改来源')
    expect(models.dirtyTracking.hasPendingChanges()).toBe(false)
    f.setModelValues({[property]: 'changed remotely'})
    await expect(owner.save()).rejects.toThrow('元数据已变化')
    expect(writes()).toHaveLength(0)
  })

  it.each(['missing', 'rowid,', 'rowid,rowid', 12])('preserves unresolved primary field configuration %s without submitting guesses', async value => {
    const {f, owner, session, reader, writes} = await setup({allowFieldEdit: true})
    f.setModelValues({PrimaryKeyFields: value})
    await session.metadataDataSet.getView('Base_DataModel', 'default')!.loadFromServer({allPages: true})
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentCode', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    await expect(owner.save()).rejects.toThrow('PrimaryKeyFields')
    expect(f.modelRow()).toHaveProperty('PrimaryKeyFields', value); expect(writes()).toHaveLength(0)
  })

  it.each(['partial', 'unknown'])('reports each migrated model property and never replays after a %s write', async kind => {
    const {f, owner, session, reader, writes} = await setup({allowFieldEdit: true, ...(kind === 'partial' ? {omitModelProperties: ['parentField']} : {})})
    f.setModelValues({parentField: 'parentId'})
    await session.metadataDataSet.getView('Base_DataModel', 'default')!.loadFromServer({allPages: true})
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentCode', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    if (kind === 'unknown') f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    expect((await owner.verify()).confirmed).toBe(kind === 'unknown')
    if (kind === 'partial') {
      expect(owner.getState().verification).toContainEqual({table: 'Base_DataModel', id: 'M1.parentField', result: 'parentField引用与预览不同，请处理差异'})
      expect(() => owner.acceptCurrent()).toThrow()
    }
    expect(writes()).toHaveLength(1)
  })

  it('drops model-reference preview on cancellation and leaves a later model draft intact during recovery', async () => {
    const {f, owner, session, reader, writes} = await setup({allowFieldEdit: true})
    f.setModelValues({parentField: 'parentId'})
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!, fields = session.metadataDataSet.getView('Base_DataModel_Field', 'sourceReplace:M1')!
    await models.loadFromServer({allPages: true})
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentCode', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    expect(owner.getState().preview?.modelChanges).toHaveLength(1)
    owner.discard(); expect(owner.getState().preview).toBeNull(); expect(f.modelRow().parentField).toBe('parentId')
    await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    const apply = fields.applyEditingRows.bind(fields)
    vi.spyOn(fields, 'applyEditingRows').mockImplementationOnce(async ids => {
      const result = await apply(ids); models.updateEditingValue('M1', 'parentField', 'later draft'); return result
    })
    await expect(owner.save()).rejects.toThrow()
    await expect(owner.verify()).rejects.toThrow('来源编辑已改变')
    expect(models.getEditingRow('M1')?.['parentField']).toBe('later draft'); expect(writes()).toHaveLength(0)
  })

  it.each(['extra', ' extra '])('rejects duplicate canonical output %s and ambiguous mappings; cancellation clears choices', async alias => {
    const {owner, reader, writes} = await setup({sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', AsName: alias, IsPKey: 0}]})
    await owner.includeField({sourceName: 'extra', included: true})
    expect(owner.getState().preview?.problems.join()).toContain('正式模型输出字段重复')
    await expect(owner.save()).rejects.toThrow()
    await owner.includeField({sourceName: 'extra', included: false})
    await owner.mapField({fieldId: 'F1', sourceName: 'parentId'})
    expect(owner.getState().preview?.problems.join()).toContain('同一来源字段')
    await expect(owner.mapField({fieldId: 'other', sourceName: 'extra'})).rejects.toThrow('字段')
    owner.discard(); await owner.preview(source)
    expect(reader.prepare).toHaveBeenCalled()
    expect(owner.getState().preview?.problems).toEqual([]); expect(writes()).toHaveLength(0)
  })

  it('diagnoses expressions on other models before changing a source field reference', async () => {
    const {f, session, owner, reader, writes} = await setup({allowFieldEdit: true})
    f.setModelValues({Filter: '{"reference":"Orders.parentId"}'}, 'A', 'M2')
    await session.metadataDataSet.getView('Base_DataModel', 'default')!.loadFromServer({allPages: true})
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentCode', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    await expect(owner.save()).rejects.toThrow('跨模型')
    expect(writes()).toHaveLength(0)
  })

  it('changes only source identity with a query signature, preserves fields and named views, and reopens the new resource', async () => {
    const {owner, f, session, writes} = await setup()
    const fields = JSON.stringify(session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows)
    const file = f.stored.get('A')
    expect(owner.getState().preview?.differences).toEqual(expect.arrayContaining([expect.objectContaining({name: 'extra', result: '来源新增字段，未引入模型'})]))
    expect(await owner.save()).toBe('M1')
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.data).toEqual([expect.objectContaining({TableName: 'Base_DataModel', CrudModel: expect.objectContaining({Changed: [{
      rowid: 'M1', MetaName: 'NextOrders', DbId: 'DB2', DbName: 'new-database', lingma_sys_key: 'token-A-M1',
    }]})})])
    expect(JSON.stringify(session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows)).toBe(fields)
    expect(f.stored.get('A')).toBe(file); expect(f.fileWrites).toHaveLength(0)
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel', 'default')!.rows[0]).toMatchObject({Name: 'Orders', MetaName: 'NextOrders', description: ''})
    expect(fresh.metadataDataSet.getView('Base_DataModel', 'default')!.rows[0]?.['updatetime']).toBe('2026-10-09T19:30:00')
    expect(fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!.pageSize).toBe(12)
    expect(fresh.definitionDataSet!.tables['OrdersAlias']?.resourceId).toBe('NextOrders')
    await fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!.requestData()
    expect(f.requests.at(-1)).toMatchObject({url: '/api/DataOperation/GetData', data: {Table: [{Name: 'Orders'}]}})
    expect(session.hasPendingModelSourceEdits()).toBe(false)
  })

  it.each(['missing', 'type', 'primary', 'parameter', 'duplicate'])('blocks a %s source contract difference without changing records', async kind => {
    const {reader, owner, session, writes} = await setup()
    const changed = structuredClone(prepared)
    if (kind === 'missing') changed.fields.shift()
    if (kind === 'type') changed.fields[0]!.FieldType = 'int'
    if (kind === 'primary') changed.fields[0]!.IsPKey = 0
    if (kind === 'duplicate') changed.fields.push({...field})
    if (kind === 'parameter') {
      reader.prepare.mockResolvedValueOnce({...prepared, fields: [...prepared.fields, {...field, type: 'inputParams', Name: 'newParam', IsPKey: 0}]})
    } else reader.prepare.mockResolvedValueOnce(changed)
    await owner.preview(source)
    expect(owner.getState().preview?.problems.length).toBeGreaterThan(0)
    await expect(owner.save()).rejects.toThrow()
    expect(writes()).toHaveLength(0)
    expect(session.metadataDataSet.getView('Base_DataModel', 'default')!.hasEditingChanges()).toBe(false)
    owner.discard(); expect(session.hasPendingModelSourceEdits()).toBe(false)
  })

  it.each(['Filter', 'JoinFilter', 'RequestComplete', 'relation'])('retains source-sensitive %s rather than rewriting it', async kind => {
    const {f, owner, session, writes} = await setup(kind === 'relation' ? {relationRows: [{rowid: 'R', filter: 'old-expression'}]} : {})
    if (kind !== 'relation') {
      f.setModelValues({[kind]: 'original expression'})
      await session.metadataDataSet.getView('Base_DataModel', 'default')!.loadFromServer({allPages: true})
      await owner.preview(source)
    }
    expect(owner.getState().preview?.problems.join()).toContain(kind === 'relation' ? '关系' : kind)
    await expect(owner.save()).rejects.toThrow(); expect(writes()).toHaveLength(0)
  })

  it('rechecks formal write permission after preview and sends no mutation when tightened', async () => {
    const {owner, f, writes} = await setup()
    f.denyModelField('MetaName')
    await expect(owner.save()).rejects.toThrow('不允许修改来源')
    expect(writes()).toHaveLength(0)
  })

  it('does not expose a comparison if a required current field is hidden', async () => {
    const f = dataSpacePageFixture({hidden: true, allowSourceEdit: true, modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => prepared}})
    fixtures.push(f)
    const session = await f.open('A'), owner = session.getModelSourceEdit('M1')
    await expect(owner.preview(source)).rejects.toThrow('无法完整核对')
    expect(owner.getState().preview).toBeNull()
  })

  it.each(['source', 'model'])('rejects a stale %s preview after fresh preflight reads', async kind => {
    const {reader, f, owner, writes} = await setup()
    if (kind === 'source') reader.prepare.mockResolvedValueOnce({...prepared, fields: []})
    else f.setModelValues({description: 'changed remotely'})
    await expect(owner.save()).rejects.toThrow('重新预览'); expect(writes()).toHaveLength(0)
  })

  it.each(['unknown', 'readback'])('recovers a %s result using reads only', async kind => {
    const {owner, f, writes} = await setup()
    if (kind === 'unknown') f.loseNextResponse()
    else {
      const original = owner.save.bind(owner)
      const release = f.holdModelResponse()
      const saving = expect(original()).rejects.toThrow('model read unavailable')
      await vi.waitFor(() => expect(writes()).toHaveLength(1))
      f.failNextModelRead(); release(); await saving
    }
    if (kind === 'unknown') await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe(kind)
    await expect(owner.save()).rejects.toThrow('先核验')
    expect(await owner.verify()).toEqual({confirmed: true, modelId: 'M1'})
    expect(writes()).toHaveLength(1)
  })

  it('preserves another draft during an unknown result and requires explicit adoption of a differing formal state', async () => {
    const {owner, f, session, writes} = await setup()
    f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    models.updateEditingValue('M2', 'description', 'other draft')
    await expect(owner.verify()).rejects.toThrow('其他元数据草稿')
    expect(models.getEditingRow('M2')?.['description']).toBe('other draft')
    models.discardEditingRows(['M2']); f.setModelValues({MetaName: 'remotely changed'})
    expect(await owner.verify()).toEqual({confirmed: false, modelId: null})
    expect(owner.getState().status).toBe('different')
    await expect(owner.save()).rejects.toThrow('先核验')
    if (owner.getState().abandonNotApplied) await owner.verify({abandonNotApplied: true})
    else expect(() => owner.acceptCurrent()).toThrow()
    expect(writes()).toHaveLength(1)
  })

  it('ignores late preview after cancellation and rejects obsolete session results', async () => {
    const {owner, reader, f, session, writes} = await setup()
    let release = () => {}
    reader.prepare.mockImplementationOnce(() => new Promise(resolve => {release = () => resolve(prepared)}))
    const preview = owner.preview(source); await vi.waitFor(() => expect(reader.prepare).toHaveBeenCalledTimes(2)); owner.discard(); release(); await preview
    expect(owner.getState().preview).toBeNull()
    await owner.preview(source)
    const resume = f.holdModelResponse(), saving = expect(owner.save()).rejects.toThrow()
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    session.dispose(); resume(); await saving
    await expect(owner.verify()).rejects.toThrow('释放')
  })

  it('preserves a legacy source parameter mapping instead of silently migrating it', async () => {
    const parameter = {...field, type: 'inputParams' as const, Name: 'customerArg', IsPKey: 0, IsOutput: 0}
    const {owner, reader, f, session} = await setup({sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'},
      {...parameter, rowid: 'F2', dataModelId: 'M1', ValueFun: ' { "Type": "SystemData", "ParamName": "customer" } '}]})
    reader.prepare.mockResolvedValue({...prepared, fields: [field, parameter]})
    await owner.preview(source); await owner.save()
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows[1]?.['ValueFun']).toBe(' { "Type": "SystemData", "ParamName": "customer" } ')
    expect(f.fileWrites).toHaveLength(0)
  })

  it('can explicitly cancel its own staging failure before dispatch without abandoning other edits', async () => {
    const {owner, session, writes} = await setup()
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    vi.spyOn(models, 'applyEditingRows').mockRejectedValueOnce(new Error('staging failed'))
    await expect(owner.save()).rejects.toThrow('staging failed')
    expect(owner.getState().status).toBe('unsubmitted')
    expect(await owner.verify()).toEqual({confirmed: false, modelId: null})
    expect(owner.getState().status).toBe('ready')
    expect(models.hasEditingChanges()).toBe(false)
    expect(writes()).toHaveLength(0)
  })

  it('keeps operation recovery available when apply throws after creating a local delta', async () => {
    const {owner, session, writes} = await setup()
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!, original = models.applyEditingRows.bind(models)
    vi.spyOn(models, 'applyEditingRows').mockImplementationOnce(async ids => {await original(ids); throw new Error('apply result unavailable')})
    await expect(owner.save()).rejects.toThrow('apply result unavailable')
    expect(await owner.verify()).toEqual({confirmed: false, modelId: null})
    expect(models.dirtyTracking.hasPendingChanges()).toBe(false); expect(writes()).toHaveLength(0)
  })

  it('rejects a different URL target before saving', async () => {
    const {owner, session, writes} = await setup()
    session.metadataDataSet.getView('Base_DataModel', 'default')!.queryContext = {dataSpaceId: 'B'}
    await expect(owner.save()).rejects.toThrow('目标已变化'); expect(writes()).toHaveLength(0)
  })
})
