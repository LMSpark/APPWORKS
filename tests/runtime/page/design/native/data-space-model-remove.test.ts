import {afterEach, describe, expect, it, vi} from 'vitest'
import {dataSpacePageFixture} from './data-space-page.fixture'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => fixtures.splice(0).forEach(fixture => fixture.dispose()))
function fixture(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const result = dataSpacePageFixture({missing: true, allowDelete: true,
    sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'},
      {rowid: 'F2', dataModelId: 'M1', Name: 'input', type: 'inputParams'},
      {rowid: 'F3', dataModelId: 'M2', Name: 'rowid', type: 'dataModel'},
      {rowid: 'ORPHAN', dataModelId: 'NOT-READ', Name: 'orphan', type: 'dataModel'},
    ], relationRows: [{rowid: 'R', parentModId: 'M1', childModId: 'M2', filter: ''}], ...options})
  fixtures.push(result); return result
}
const writes = (fixture: ReturnType<typeof dataSpacePageFixture>) => fixture.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')

describe('formal model removal', () => {
  it.each([false, true])('submits layout cleanup through the queried DataView and DataSet (lost=%s)', async lost => {
    const f = fixture({overviewOnly: true})
    f.stored.set('A', JSON.stringify({schemaVersion: 2, scenarioId: 'A', tables: {}, resourceRelations: [],
      layout: {modelPositions: {M1: {x: 1, y: 2}, M2: {x: 3, y: 4}}, unboundNodes: {draft: {x: 7, y: 8, label: 'keep'}},
        unboundEdges: {removed: {source: 'M1', target: 'draft'}, keep: {source: 'M2', target: 'draft'}}}}))
    const session = await f.open('A', {deferDefinition: true}), data = session.metadataDataSet
    const layout = data.getView('DataSpaceLayoutDefinition', 'default')!, operation = session.getModelRemove('M1')
    const native = data.saveChanges.bind(data)
    const captured: unknown[] = []
    vi.spyOn(data, 'saveChanges').mockImplementation(async options => {
      if (options?.views?.some(view => view.tableName === layout.tableName)) {
        const id = layout.getPkKey(layout.rows[0]!)
        if (id === undefined) throw new Error('missing layout identity')
        captured.push(layout.getEditingRow(id))
      }
      return native(options)
    })
    await operation.preview()
    if (lost) {
      f.loseNextFileResponse()
      await expect(operation.save()).rejects.toThrow()
      expect(layout.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(await operation.verify()).toBe(true)
    } else expect(await operation.save()).toBe(true)
    expect(captured).toHaveLength(lost ? 2 : 1)
    expect(captured[0]).toMatchObject({dataSetId: 'A', modelPositions: {M2: {x: 3, y: 4}},
      unboundEdges: {keep: {source: 'M2', target: 'draft'}}})
    expect(layout.hasEditingChanges() || layout.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    expect(f.modelReads).toHaveLength(0)
    const reopened = await f.open('A', {deferDefinition: true})
    const saved = reopened.metadataDataSet.getView('DataSpaceLayoutDefinition', 'default')!
    await saved.refresh()
    expect(saved.rows[0]).toMatchObject(captured[0] as object)
  })

  it('preserves a pending native layout edit and refuses model removal before database dispatch', async () => {
    const f = fixture({overviewOnly: true})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}}}}))
    const session = await f.open('A', {deferDefinition: true}), layout = session.metadataDataSet.getView('DataSpaceLayoutDefinition', 'default')!
    await layout.refresh()
    const id = layout.getPkKey(layout.rows[0]!)
    if (id === undefined) throw new Error('missing layout identity')
    layout.updateEditingValue(id, 'modelPositions', {M1: {x: 50, y: 60}})
    await expect(session.getModelRemove('M1').preview()).rejects.toThrow(/草稿|编辑|修改/)
    expect(layout.getEditingRow(id)?.['modelPositions']).toEqual({M1: {x: 50, y: 60}})
    expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('retains unapplied layout changes and only retries on the next explicit continuation', async () => {
    const f = fixture({overviewOnly: true})
    const baseline = JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}}}})
    f.stored.set('A', baseline)
    const session = await f.open('A', {deferDefinition: true}), operation = session.getModelRemove('M1')
    const layout = session.metadataDataSet.getView('DataSpaceLayoutDefinition', 'default')!
    await operation.preview(); f.loseNextFileResponse()
    await expect(operation.save()).rejects.toThrow(/file response/)
    f.stored.set('A', baseline)
    await expect(operation.verify()).rejects.toThrow(/SCENARIO_DEFINITION_NOT_APPLIED/)
    expect(layout.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    expect(await operation.verify()).toBe(true)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(2)
    expect(layout.dirtyTracking.hasPendingChanges()).toBe(false)
    const reopened = await f.open('A', {deferDefinition: true})
    expect(reopened.viewState?.config['layout']).toEqual({modelPositions: {}})
  })

  it('keeps native layout edits made after an unknown submission instead of overwriting them on recovery', async () => {
    const f = fixture({overviewOnly: true})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}}}}))
    const session = await f.open('A', {deferDefinition: true}), operation = session.getModelRemove('M1')
    const layout = session.metadataDataSet.getView('DataSpaceLayoutDefinition', 'default')!
    await operation.preview(); f.loseNextFileResponse()
    await expect(operation.save()).rejects.toThrow(/file response/)
    const id = layout.getPkKey(layout.rows[0]!)
    if (id === undefined) throw new Error('missing layout identity')
    layout.updateEditingValue(id, 'modelPositions', {M2: {x: 70, y: 80}})
    await expect(operation.verify()).rejects.toThrow(/外来草稿/)
    expect(layout.getEditingRow(id)?.['modelPositions']).toEqual({M2: {x: 70, y: 80}})
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
  })

  it.each(['field', 'reference', 'read failure'])('rechecks a remote %s before dispatch without deleting or covering it', async kind => {
    const f = fixture({overviewOnly: true}), session = await f.open('A', {deferDefinition: true}), operation = session.getModelRemove('M1')
    await operation.preview()
    if (kind === 'field') f.created.set('Base_DataModel_Field', [{rowid: 'LATE', dataSetId: 'A', dataModelId: 'M1', Name: 'new', type: 'dataModel'}])
    else if (kind === 'reference') f.setModelValues({addApi: 'Orders'}, 'A', 'M2')
    else f.failNextFieldRead()
    await expect(operation.save()).rejects.toThrow()
    expect(writes(f)).toHaveLength(0)
    expect(f.fileWrites).toHaveLength(0)
    expect(operation.getState().status).toBe('ready')
    operation.cancel()
    expect(operation.getState().pending).toBe(false)
  })

  it.each([false, true])('deletes from overview using scoped command views, with cancellation and independent reopening (lost=%s)', async lost => {
    const f = fixture({overviewOnly: true})
    f.stored.set('A', JSON.stringify({schemaVersion: 2, scenarioId: 'A', tables: {}, resourceRelations: [], layout: {modelPositions: {M1: {x: 1, y: 2}, M2: {x: 3, y: 4}}}}))
    const session = await f.open('A', {deferDefinition: true}), data = session.metadataDataSet
    const fields = data.getView('Base_DataModel_Field')!, relations = data.getView('Base_DataModel_Relation')!
    const initial = [fields.requestState, relations.requestState], operation = session.getModelRemove('M1')
    await operation.preview()
    expect(operation.getState().preview?.records).toEqual([
      {table: 'Base_DataModel', ids: ['M1']}, {table: 'Base_DataModel_Field', ids: ['F1', 'F2']}, {table: 'Base_DataModel_Relation', ids: ['R']},
    ])
    operation.cancel(); expect(writes(f)).toHaveLength(0)
    await operation.preview()
    if (lost) {
      f.loseNextResponse()
      await expect(operation.save()).rejects.toThrow()
      expect(await operation.verify()).toBe(false)
      expect(f.fileWrites).toHaveLength(0)
    } else {
      expect(await operation.save()).toBe(true)
      expect(JSON.parse(f.stored.get('A')!).layout.modelPositions).toEqual({M2: {x: 3, y: 4}})
      expect(f.modelReads).toHaveLength(0)
    }
    expect(writes(f)).toHaveLength(1)
    expect([fields.requestState, relations.requestState]).toEqual(initial)
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel')?.rows.map(row => row['rowid'])).toEqual(['M2'])
    await reopened.loadMetadataViews(['Base_DataModel_Field'])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')?.rows.map(row => row['rowid'])).toEqual(['F3', 'ORPHAN'])
  })

  it.each([false, true])('preserves a physical output reference colliding with the deleted registration (lost=%s)', async lost => {
    const raw = ' {"Type":"GetRefData","RefTableName":"Orders","RefFieldName":"name","FkFieldName":"rowid","Extra":{"keep":[false,0,null]}} '
    const f = fixture({sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'},
      {rowid: 'F3', dataModelId: 'M2', Name: 'parentId', type: 'dataModel', ValueFun: raw},
    ]})
    f.setModelValues({Type: '数据库表', MetaName: 'Orders'}, 'A', 'M1')
    f.setModelValues({Type: '数据库表'}, 'A', 'M2')
    const session = await f.open('A'), operation = session.getModelRemove('M1')
    await operation.preview(); operation.cancel()
    expect(writes(f)).toHaveLength(0)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.rows.find(row => row['rowid'] === 'F3')?.['ValueFun']).toBe(raw)
    await operation.preview()
    if (lost) {
      f.loseNextResponse()
      await expect(operation.save()).rejects.toThrow()
      await expect(operation.save()).rejects.toThrow(/重复|核验/)
      // A lost delete receipt stays unresolved even after empty readback; no replay.
      expect(await operation.verify()).toBe(false)
    } else expect(await operation.save()).toBe(true)
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel')?.rows.map(row => row['rowid'])).toEqual(['M2'])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')?.rows).toHaveLength(1)
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')?.rows[0]?.['ValueFun']).toBe(raw)
    expect(writes(f)).toHaveLength(1)
    expect(writes(f)[0]?.data).toEqual([
      expect.objectContaining({TableName: 'Base_DataModel', CrudModel: {Added: [], Changed: [], Deleted: [expect.objectContaining({rowid: 'M1'})]}}),
      expect.objectContaining({TableName: 'Base_DataModel_Field', CrudModel: {Added: [], Changed: [], Deleted: [expect.objectContaining({rowid: 'F1'})]}}),
      expect.objectContaining({TableName: 'Base_DataModel_Relation', CrudModel: {Added: [], Changed: [], Deleted: [expect.objectContaining({rowid: 'R'})]}}),
    ])
    expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['inputParams', 'unknown'])('retains a registered-model reference in a %s field', async type => {
    const raw = '{"Type":"GetRefData","RefTableName":"Orders","RefFieldName":"rowid","FkFieldName":"rowid"}'
    const f = fixture({sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'},
      {rowid: 'F3', dataModelId: 'M2', Name: 'parentId', type, ValueFun: raw},
    ]})
    await expect((await f.open('A')).getModelRemove('M1').preview()).rejects.toThrow(/依赖/)
    expect(writes(f)).toHaveLength(0)
  })

  it('refuses to infer the namespace of an output reference when its field kind is unreadable', async () => {
    const f = fixture({hiddenFieldProperties: ['type'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'},
      {rowid: 'F3', dataModelId: 'M2', Name: 'parentId', type: 'dataModel',
        ValueFun: '{"Type":"GetRefData","RefTableName":"Orders","RefFieldName":"rowid","FkFieldName":"rowid"}'},
    ]})
    await expect((await f.open('A')).getModelRemove('M1').preview()).rejects.toThrow(/type不可读/)
    expect(writes(f)).toHaveLength(0)
  })

  it.each([false, true])('preserves an unrelated desensitization rule ID through deletion and reopening (hidden=%s)', async hidden => {
    const rule = '  Orders.rowid  '
    const f = fixture({hiddenFieldProperties: hidden ? ['Expression'] : [], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'},
      {rowid: 'F3', dataModelId: 'M2', Name: 'rowid', type: 'dataModel', Expression: rule},
    ]})
    const operation = (await f.open('A')).getModelRemove('M1')
    await operation.preview(); expect(await operation.save()).toBe(true)
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')?.rows.find(row => row['rowid'] === 'F3')).toHaveProperty('Expression', rule)
    expect(reopened.metadataDataSet.getView('Base_DataModel')?.rows.map(row => row['rowid'])).toEqual(['M2'])
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
  })

  it.each([false, true])('cleans attached pending edges without requiring stored node positions: lost=%s', async lost => {
    const f = fixture()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {
      unboundNodes: {DRAFT: {label: '待配置模型', x: 1, y: 2}},
      unboundEdges: {REMOVE: {source: 'M1', target: 'DRAFT'}, KEEP: {source: 'M2', target: 'DRAFT'}},
    }}))
    const session = await f.open('A'), operation = session.getModelRemove('M1')
    await operation.preview()
    if (lost) f.loseNextFileResponse()
    if (lost) {await expect(operation.save()).rejects.toThrow(); expect(await operation.verify()).toBe(true)}
    else await operation.save()
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.layout?.unboundEdges).toEqual({KEEP: {source: 'M2', target: 'DRAFT'}})
    expect(reopened.definitionDataSet?.layout?.unboundNodes?.['DRAFT']).toBeDefined()
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
  })

  it.each([
    {table: 'Base_DataModel_Field', row: {rowid: 'LATE-FIELD', dataSetId: 'A', dataModelId: 'M1', Name: 'late', type: 'dataModel'}},
    {table: 'Base_DataModel_Relation', row: {rowid: 'LATE-RELATION', dataSetId: 'A', parentModId: 'M2', childModId: 'M1', filter: ''}},
  ])('reports a newly discovered dependent in $table as an incomplete deletion without replay', async ({table, row}) => {
    const f = fixture()
    const originalFile = JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}}}})
    f.stored.set('A', originalFile)
    const session = await f.open('A'), operation = session.getModelRemove('M1')
    await operation.preview()
    // Inject after the actual batch dispatch, beyond the new pre-dispatch dependency check.
    const save = session.metadataDataSet.saveChanges.bind(session.metadataDataSet)
    vi.spyOn(session.metadataDataSet, 'saveChanges').mockImplementation(async args => {
      const result = await save(args); f.created.set(table, [row]); return result
    })
    await expect(operation.save()).rejects.toThrow(/回读/)
    expect(operation.getState().status).toBe('readback')
    expect(await operation.verify()).toBe(false)
    expect(operation.getState().status).toBe('different')
    expect(operation.getState().verification).toContainEqual({table, id: row.rowid, result: '新增从属记录仍存在；不在原删除清单'})
    expect(writes(f)).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(0)
    expect(f.stored.get('A')).toBe(originalFile)
    operation.acceptCurrent()
    expect(operation.getState().pending).toBe(false)
    await session.loadMetadataViews([table as 'Base_DataModel_Field' | 'Base_DataModel_Relation'])
    expect(session.metadataDataSet.getView(table)?.rows.some(value => value['rowid'] === row.rowid)).toBe(true)
  })

  it('does not classify unreadable dependent ownership as a completed deletion', async () => {
    const hidden: string[] = [], f = fixture({hiddenFieldProperties: hidden})
    const session = await f.open('A'), operation = session.getModelRemove('M1')
    await operation.preview()
    const save = session.metadataDataSet.saveChanges.bind(session.metadataDataSet)
    vi.spyOn(session.metadataDataSet, 'saveChanges').mockImplementation(async args => {
      const result = await save(args)
      f.created.set('Base_DataModel_Field', [{rowid: 'PRIVATE-OWNER', dataSetId: 'A', dataModelId: 'M1', Name: 'late', type: 'dataModel'}])
      hidden.push('dataModelId'); return result
    })
    await expect(operation.save()).rejects.toThrow(/归属/)
    expect(operation.getState().status).toBe('readback')
    expect(operation.getState().verification.some(item => item.id === 'PRIVATE-OWNER')).toBe(false)
    hidden.splice(0)
    expect(await operation.verify()).toBe(false)
    expect(operation.getState().verification.some(item => item.id === 'PRIVATE-OWNER' && item.result.includes('仍存在'))).toBe(true)
    expect(writes(f)).toHaveLength(1)
  })

  it('rechecks database completion when resuming a layout failure', async () => {
    const f = fixture()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}}}}))
    const operation = (await f.open('A')).getModelRemove('M1')
    await operation.preview(); f.loseNextFileResponse()
    await expect(operation.save()).rejects.toThrow()
    expect(operation.getState().status).toBe('configuration')
    f.created.set('Base_DataModel_Field', [{rowid: 'AFTER-CONFIRM', dataSetId: 'A', dataModelId: 'M1', Name: 'late', type: 'dataModel'}])
    expect(await operation.verify()).toBe(false)
    expect(operation.getState().status).toBe('different')
    expect(operation.getState().verification.some(item => item.id === 'AFTER-CONFIRM')).toBe(true)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    operation.acceptCurrent()
    expect(operation.getState().pending).toBe(false)
  })

  it.each([false, true])('includes the model layout in the preview and keeps unrelated native relations after deletion; provenance=%s', async provenance => {
    const f = fixture()
    const resourceRelations = [{relationId: 'NATIVE', sourceRelationId: 'R', parentTable: 'Customers', childTable: 'Customers',
      filterExpression: {logic: 'and', filters: []}}]
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {Customers: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {pageSize: 7}}}},
      ...(provenance ? {schemaVersion: 2, resourceRelations} : {}),
      layout: {modelPositions: {M1: {x: 1, y: 2}, M2: {x: 3, y: 4}}, tablePositions: {Customers: {x: 5, y: 6}}}}))
    const session = await f.open('A'), operation = session.getModelRemove('M1')
    await operation.preview()
    expect(operation.getState().preview).toMatchObject({layout: true})
    expect(f.fileWrites).toHaveLength(0)
    operation.cancel(); expect(f.fileWrites).toHaveLength(0)
    await operation.preview(); expect(await operation.save()).toBe(true)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    const reopened = await f.open('A')
    expect(reopened.viewState?.config['layout']).toEqual({modelPositions: {M2: {x: 3, y: 4}}, tablePositions: {Customers: {x: 5, y: 6}}})
    expect(reopened.definitionDataSet?.getView('Customers', 'default')?.pageSize).toBe(7)
    expect(reopened.metadataDataSet.getView('Base_DataModel', 'default')?.rows.map(row => row['rowid'])).toEqual(['M2'])
    if (provenance) expect(reopened.definitionDataSet?.resourceRelations).toEqual(resourceRelations)
  })

  it('keeps unknown database deletion separate from layout and never writes the file', async () => {
    const f = fixture()
    const text = JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}}}})
    f.stored.set('A', text)
    const operation = (await f.open('A')).getModelRemove('M1')
    await operation.preview(); f.loseNextResponse()
    await expect(operation.save()).rejects.toThrow()
    expect(await operation.verify()).toBe(false)
    expect(f.stored.get('A')).toBe(text); expect(f.fileWrites).toHaveLength(0)
  })

  it('verifies a lost file receipt without replaying the confirmed database delete or file write', async () => {
    const f = fixture()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}, M2: {x: 3, y: 4}}}}))
    const session = await f.open('A'), operation = session.getModelRemove('M1')
    await operation.preview(); f.loseNextFileResponse()
    await expect(operation.save()).rejects.toThrow(/file response/)
    expect(operation.getState()).toMatchObject({status: 'configuration', pending: true})
    expect(session.hasPendingModelRemovals()).toBe(true)
    await expect(operation.save()).rejects.toThrow(/重复提交/)
    expect(await operation.verify()).toBe(true)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    expect(operation.getState().pending).toBe(false)
  })

  it('explicitly resumes against current remote configuration and preserves unrelated edits', async () => {
    const f = fixture()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}}}}))
    const operation = (await f.open('A')).getModelRemove('M1')
    await operation.preview(); f.loseNextFileResponse()
    await expect(operation.save()).rejects.toThrow()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}, M2: {x: 99, y: 10}}}}))
    expect(await operation.verify()).toBe(true)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(2)
    expect((await f.open('A')).viewState?.config['layout']).toEqual({modelPositions: {M2: {x: 99, y: 10}}})
  })

  it('does not recreate a layout file removed remotely during recovery', async () => {
    const f = fixture()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}}}}))
    const operation = (await f.open('A')).getModelRemove('M1')
    await operation.preview(); f.loseNextFileResponse()
    await expect(operation.save()).rejects.toThrow()
    f.stored.delete('A')
    expect(await operation.verify()).toBe(true)
    expect(f.stored.has('A')).toBe(false)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
  })

  it('blocks a remote binding to the deleted model and can resume after explicit repair', async () => {
    const f = fixture()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}}}}))
    const operation = (await f.open('A')).getModelRemove('M1')
    await operation.preview(); f.loseNextFileResponse()
    await expect(operation.save()).rejects.toThrow()
    const remote = JSON.stringify({scenarioId: 'A', tables: {Orders: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}}}})
    f.stored.set('A', remote)
    await expect(operation.verify()).rejects.toThrow(/绑定已删除模型/)
    expect(f.stored.get('A')).toBe(remote); expect(f.fileWrites).toHaveLength(1)
    expect(operation.getState().status).toBe('configuration')
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M2: {x: 7, y: 8}}}}))
    expect(await operation.verify()).toBe(true)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    expect((await f.open('A')).viewState?.config['layout']).toEqual({modelPositions: {M2: {x: 7, y: 8}}})
  })

  it('preserves another editor draft instead of using recovery to overwrite it', async () => {
    const f = fixture()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}}}}))
    const operation = (await f.open('A')).getModelRemove('M1')
    await operation.preview(); f.loseNextFileResponse()
    await expect(operation.save()).rejects.toThrow()
    const file = f.workspaces[0]!.getScenarioViews('A')!
    const foreign = JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M2: {x: 77, y: 88}}}})
    file.setText(foreign)
    await expect(operation.verify()).rejects.toThrow(/外来草稿/)
    expect(file.getText()).toBe(foreign)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
  })

  it('refuses recovery after the authorized scope changes', async () => {
    const f = fixture()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}}}}))
    const operation = (await f.open('A')).getModelRemove('M1')
    await operation.preview(); f.loseNextFileResponse()
    await expect(operation.save()).rejects.toThrow()
    f.invalidate()
    await expect(operation.verify()).rejects.toThrow(/STALE/)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
  })

  it('preserves an existing layout file when the removed model has no position', async () => {
    const f = fixture()
    const text = JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M2: {x: 1, y: 2}}}})
    f.stored.set('A', text)
    const operation = (await f.open('A')).getModelRemove('M1')
    await operation.preview()
    expect(operation.getState().preview?.layout).toBe(false)
    expect(await operation.save()).toBe(true)
    expect(f.stored.get('A')).toBe(text); expect(f.fileWrites).toHaveLength(0)
  })

  it('previews without writing, then deletes only the model, owned fields and direct relations and reopens', async () => {
    const f = fixture(), session = await f.open('A')
    const operation = session.getModelRemove('M1')
    await operation.preview()
    expect(operation.getState().preview?.records).toEqual([
      {table: 'Base_DataModel', ids: ['M1']}, {table: 'Base_DataModel_Field', ids: ['F1', 'F2']}, {table: 'Base_DataModel_Relation', ids: ['R']},
    ])
    expect(writes(f)).toHaveLength(0)
    operation.cancel(); expect(operation.getState().pending).toBe(false)
    await operation.preview(); expect(await operation.save()).toBe(true)
    expect(writes(f)).toHaveLength(1)
    expect(writes(f)[0]?.data).toEqual([
      expect.objectContaining({TableName: 'Base_DataModel', CrudModel: {Added: [], Changed: [], Deleted: [expect.objectContaining({rowid: 'M1'})]}}),
      expect.objectContaining({TableName: 'Base_DataModel_Field', CrudModel: {Added: [], Changed: [], Deleted: [expect.objectContaining({rowid: 'F1'}), expect.objectContaining({rowid: 'F2'})]}}),
      expect.objectContaining({TableName: 'Base_DataModel_Relation', CrudModel: {Added: [], Changed: [], Deleted: [expect.objectContaining({rowid: 'R'})]}}),
    ])
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel', 'default')?.rows.map(row => row['rowid'])).toEqual(['M2'])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows.map(row => row['rowid'])).toEqual(['F3', 'ORPHAN'])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows).toEqual([])
    expect(f.fileWrites).toEqual([])
  })

  it.each(['M1', 'F2', 'R'])('rejects a single denied delete permission on %s without writing', async id => {
    const f = fixture({denyDeleteIds: [id]}), session = await f.open('A')
    await expect(session.getModelRemove('M1').preview()).rejects.toThrow(/删除权限/)
    expect(writes(f)).toHaveLength(0)
  })

  it('requires saved view bindings to be explicitly removed first', async () => {
    const f = fixture({missing: false}), session = await f.open('A')
    await expect(session.getModelRemove('M1').preview()).rejects.toThrow(/绑定/)
    expect(writes(f)).toHaveLength(0)
  })

  it('keeps a stale source-relation extension repairable instead of deleting its source silently', async () => {
    const f = fixture()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {Customers: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}}},
      resourceRelations: [{sourceRelationId: 'R', parentTable: 'Customers', childTable: 'Customers'}]}))
    const session = await f.open('A')
    await expect(session.getModelRemove('M1').preview()).rejects.toThrow(/来源关系扩展/)
    expect(writes(f)).toHaveLength(0)
  })

  it('keeps an unknown deletion unresolved after empty readback and never replays writes', async () => {
    const f = fixture(), session = await f.open('A'), operation = session.getModelRemove('M1')
    await operation.preview(); f.loseNextResponse()
    await expect(operation.save()).rejects.toThrow()
    expect(operation.getState().status).toBe('unknown')
    const count = writes(f).length
    expect(await operation.verify()).toBe(false)
    expect(operation.getState().status).toBe('different')
    expect(writes(f)).toHaveLength(count)
    operation.acceptCurrent(); expect(operation.getState().pending).toBe(false)
  })

  it('does not claim success for a positive receipt with a surviving field', async () => {
    const f = fixture({omitDeleteWrite: 'Base_DataModel_Field'}), session = await f.open('A'), operation = session.getModelRemove('M1')
    await operation.preview(); await expect(operation.save()).rejects.toThrow(/回读/)
    expect(await operation.verify()).toBe(false)
    expect(operation.getState().verification.some(item => item.result.includes('仍存在'))).toBe(true)
  })

  it('rejects unreadable ownership and stale scopes without a write', async () => {
    const hidden = fixture({hiddenFieldOwner: true})
    await expect((await hidden.open('A')).getModelRemove('M1').preview()).rejects.toThrow(/归属/)
    const f = fixture(), session = await f.open('A'), operation = session.getModelRemove('M1')
    await operation.preview(); f.invalidate()
    await expect(operation.save()).rejects.toThrow(/STALE/)
    expect(writes(f)).toHaveLength(0)
  })

  it.each([
    {PId: 'M1'},
    {Filter: JSON.stringify({Type: 'cond', Field: 'Orders.rowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'x'}})},
    {Filter: JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: {Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'rowid', FkFieldName: 'rowid'}})},
    {RequestComplete: 'opaque callback'},
  ])('blocks surviving structured or unresolved model references: %j', async values => {
    const f = fixture(); f.setModelValues(values, 'A', 'M2')
    await expect((await f.open('A')).getModelRemove('M1').preview()).rejects.toThrow(/依赖|不透明/)
    expect(writes(f)).toHaveLength(0)
  })

  it('does not treat a constant containing a model name as a dependency', async () => {
    const f = fixture(); f.setModelValues({Filter: JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'Orders.rowid'}})}, 'A', 'M2')
    await (await f.open('A')).getModelRemove('M1').preview()
    expect(writes(f)).toHaveLength(0)
  })

  it('rejects metadata changed after preview and preserves the foreign draft', async () => {
    const f = fixture(), session = await f.open('A'), operation = session.getModelRemove('M1')
    await operation.preview()
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    models.updateEditingValue('M2', 'description', 'other draft')
    await expect(operation.save()).rejects.toThrow(/草稿/)
    expect(models.getEditingPatch('M2')).toEqual({description: 'other draft'})
    expect(writes(f)).toHaveLength(0)
  })

  it('rejects a newly saved remote binding before dispatch', async () => {
    const f = fixture(), session = await f.open('A'), operation = session.getModelRemove('M1')
    await operation.preview()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {Orders: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}}}}))
    await expect(operation.save()).rejects.toThrow(/远端/)
    expect(writes(f)).toHaveLength(0)
    expect(session.metadataDataSet.getView('Base_DataModel', 'default')?.rows).toHaveLength(2)
  })

  it('retains incomplete receipts as unresolved and readback failures can recover without replay', async () => {
    const partial = fixture({omitDeleteReceipt: 'Base_DataModel_Field'}), first = (await partial.open('A')).getModelRemove('M1')
    await first.preview(); await expect(first.save()).rejects.toThrow(/回执/)
    expect(await first.verify()).toBe(false)
    const f = fixture(), session = await f.open('A'), operation = session.getModelRemove('M1')
    await operation.preview()
    const save = session.metadataDataSet.saveChanges.bind(session.metadataDataSet)
    vi.spyOn(session.metadataDataSet, 'saveChanges').mockImplementation(async args => {
      const result = await save(args); f.failNextFieldRead(); return result
    })
    await expect(operation.save()).rejects.toThrow('field read unavailable')
    const count = writes(f).length
    expect(await operation.verify()).toBe(true)
    expect(writes(f)).toHaveLength(count)
  })

  it('uses one SPARK batch request for multiple changed model rows and their field configuration', async () => {
    const f = fixture({allowSourceEdit: true, allowFieldEdit: true}), session = await f.open('A')
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!, fields = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    models.updateEditingValue('M1', 'description', 'order updated')
    models.updateEditingValue('M2', 'description', 'customer updated')
    fields.updateEditingValue('F1', 'AsName', 'orderId')
    const result = await session.metadataDataSet.saveChanges({views: [
      {tableName: 'Base_DataModel', viewId: 'default', ids: ['M1', 'M2']},
      {tableName: 'Base_DataModel_Field', viewId: 'default', ids: ['F1']},
    ]})
    expect(result.success).toBe(true); expect(result.data?.savedCount).toBe(3)
    expect(writes(f)).toHaveLength(1)
    expect(writes(f)[0]?.data).toEqual([
      expect.objectContaining({TableName: 'Base_DataModel', CrudModel: {Added: [], Deleted: [], Changed: [
        expect.objectContaining({rowid: 'M1', description: 'order updated'}), expect.objectContaining({rowid: 'M2', description: 'customer updated'}),
      ]}}),
      expect.objectContaining({TableName: 'Base_DataModel_Field', CrudModel: {Added: [], Deleted: [], Changed: [expect.objectContaining({rowid: 'F1', AsName: 'orderId'})]}}),
    ])
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel', 'default')?.rows.map(row => row['description'])).toEqual(['order updated', 'customer updated'])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows.find(row => row['rowid'] === 'F1')?.['AsName']).toBe('orderId')
  })
})
