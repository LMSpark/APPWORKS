import {afterEach, describe, expect, it, vi} from 'vitest'
import {SparkData, type DataSet} from '@spark-appworks/spark-data'

const instances: DataSet[] = []
afterEach(() => {instances.splice(0).forEach(instance => instance.destroy())})
function setup() {
  const dataSet = SparkData.createDataSet({dataSetName: 'Checkpoint', tables: {Items: {tableName: 'Items',
    columns: [{name: 'id', type: 'number', isPrimaryKey: true}, {name: 'name', type: 'string'}, {name: 'note', type: 'string'}],
    views: {default: {rows: [{id: 1, name: 'one', note: 'first'}, {id: 2, name: 'two', note: 'second'}]}}}}})
  instances.push(dataSet)
  const view = dataSet.getView('Items')!
  view.commitMode = 'staged'
  return view
}

async function setupNewRowQuery(options: {
  isFieldReadOnly?: (field: string, scope: string) => boolean
  addEnabled?: boolean
  childEnabled?: boolean
  keyless?: boolean
  omitPrepareNewRow?: boolean
  explicitIdentity?: boolean
  remapIdentity?: boolean
  remapParent?: boolean
} = {}) {
  const dataSet = SparkData.createDataSet({scenarioId: 'SPACE', dataSetName: 'Candidate', tables: {Items: {
    tableName: 'Items', modelBinding: {modelId: 'ITEMS', modelName: 'Items'},
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'title', type: 'string', required: true},
      {name: 'parentId', type: 'string'}, {name: 'restricted', type: 'string'}, {name: 'computed', type: 'string', isComputed: true},
      {name: 'expression', type: 'string', computeExpression: "title + ' computed'"},
      {name: 'generated', type: 'number', autoIncrement: true}],
    views: {default: {commitMode: 'staged'}},
  }}})
  instances.push(dataSet)
  const view = dataSet.getView('Items')!
  let shouldFail = false
  view.bindQueryExecutor({executeQuery: async (_view, params) => {
    if (shouldFail) throw new Error('query failed for stale-context check')
    const scope = String(params.context?.['scope'] ?? 'default')
    return {
      rows: [{id: '1', title: 'original', restricted: 'original'}], total: 1,
      ...(!options.keyless ? {resultPrimaryKey: 'id'} : {}),
      assertIdentity: identity => {
        if (identity.scenarioId !== 'SPACE' || identity.metaName !== 'Items') throw new Error('identity mismatch')
      },
      rowKey: row => row['id'],
      ...(options.keyless ? {resultPrimaryKey: ''} : {}),
      ...(options.omitPrepareNewRow ? {} : {prepareNewRow: (row: Record<string, unknown>) => ({...row, id: '2'})}),
      ...(options.explicitIdentity ? {prepareNewRowWithIdentity: (row: Record<string, unknown>, identity: {field: string; value: string | number}) => ({...row, ...(options.remapParent ? {parentId: 'OTHER'} : {}), id: options.remapIdentity ? 'REMAPPED' : identity.value})} : {}),
      isFieldReadOnly: field => options.isFieldReadOnly?.(field, scope) ?? false,
      fieldAccess: () => ({read: 'visible', write: 'allowed', component: 'editable', required: false, writeMode: 'editable'}),
      readFieldAccess: () => 'visible',
      addActionState: available => options.addEnabled === false || available === false ? 'disabled' : 'enabled',
      editActionState: () => 'enabled', deleteActionState: () => 'enabled',
      createChildActionState: (_rowKey: unknown, available = true) => options.childEnabled === false || !available ? 'disabled' : 'enabled', viewActionState: () => 'enabled',
    }
  }})
  await view.loadFromServer()
  return {dataSet, view, failNextQuery: () => { shouldFail = true }}
}

describe('DataView editing checkpoints', () => {
  it('cancels a dialog overlay on a stable staged new row without dropping the creation', async () => {
    const view = setup()
    await view.addRow({id: 3, name: 'new', note: ''})
    const checkpoint = view.createEditingCheckpoint(3, ['name'])
    view.updateEditingValue(3, 'name', 'dialog')
    checkpoint.restore()
    expect(view.getEditingRow(3)?.['name']).toBe('new')
    expect(view.dirtyTracking.isPendingCreate(3)).toBe(true)
    const removed = view.createEditingCheckpoint(3, ['name'])
    await view.removeRow(3)
    expect(() => removed.restore()).toThrow(/CHECKPOINT_STALE/)
  })

  it('restores only the scoped fields, retaining preceding and unrelated edits without modifying rows', () => {
    const view = setup()
    view.updateEditingValue(1, 'name', 'before dialog')
    const checkpoint = view.createEditingCheckpoint(1, ['name'])
    view.updateEditingValue(1, 'name', 'inside dialog')
    view.updateEditingValue(1, 'note', 'unrelated same row')
    view.updateEditingValue(2, 'name', 'unrelated row')
    const changed = vi.fn()
    view.events.on('editingFieldChanged', changed)
    checkpoint.restore()
    expect(view.getEditingPatch(1)).toEqual({name: 'before dialog', note: 'unrelated same row'})
    expect(view.getEditingPatch(2)).toEqual({name: 'unrelated row'})
    expect(view.rows[0]?.['name']).toBe('one')
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({rowId: 1, field: 'name', previousValue: 'inside dialog', nextValue: 'before dialog'}))
    expect(() => checkpoint.restore()).toThrow(/CHECKPOINT_CLOSED/)
  })

  it('restores all captured fields atomically before notifying value consumers and removes a new patch', () => {
    const view = setup(), checkpoint = view.createEditingCheckpoint(1, ['name', 'note'])
    view.updateEditingValue(1, 'name', 'changed'); view.updateEditingValue(1, 'note', 'changed')
    const values: unknown[] = []
    view.events.on('editingFieldChanged', () => values.push({...view.getEditingRow(1)}))
    checkpoint.restore()
    expect(view.hasEditingChanges()).toBe(false)
    expect(values).toHaveLength(2)
    expect(values.every(row => JSON.stringify(row) === JSON.stringify(view.rows[0]))).toBe(true)
  })

  it('release keeps the original overlay and closes the checkpoint without saving', () => {
    const view = setup(), checkpoint = view.createEditingCheckpoint(1, ['name'])
    view.updateEditingValue(1, 'name', 'accepted')
    checkpoint.release(); checkpoint.release()
    expect(view.getEditingPatch(1)).toEqual({name: 'accepted'})
    expect(view.rows[0]?.['name']).toBe('one')
    expect(() => checkpoint.restore()).toThrow(/CHECKPOINT_CLOSED/)
  })

  it('rejects stale query context without overwriting the current overlay', () => {
    const view = setup(), checkpoint = view.createEditingCheckpoint(1, ['name'])
    view.updateEditingValue(1, 'name', 'keep')
    view.queryContext = {dataSpaceId: 'another'}
    expect(() => checkpoint.restore()).toThrow(/CHECKPOINT_STALE/)
    expect(view.getEditingPatch(1)).toEqual({name: 'keep'})
  })

  it('cannot roll back already applied data or act after destruction', async () => {
    const view = setup(), checkpoint = view.createEditingCheckpoint(1, ['name'])
    view.updateEditingValue(1, 'name', 'applied')
    expect((await view.applyEditingRows([1])).success).toBe(true)
    expect(() => checkpoint.restore()).toThrow(/CHECKPOINT_STALE/)
    expect(view.rows[0]?.['name']).toBe('applied')
    view.destroy()
    expect(() => checkpoint.restore()).toThrow()
  })

  it('requires a real row and known non-key fields', () => {
    const view = setup()
    expect(() => view.createEditingCheckpoint(3, ['name'])).toThrow(/CHECKPOINT_SCOPE/)
    expect(() => view.createEditingCheckpoint(1, [])).toThrow(/CHECKPOINT_SCOPE/)
    expect(() => view.createEditingCheckpoint(1, ['missing'])).toThrow(/CHECKPOINT_SCOPE/)
    expect(() => view.createEditingCheckpoint(1, ['id'])).toThrow(/CHECKPOINT_SCOPE/)
  })

  it('preflights a not-yet-added row through the current query before creating a pending row', async () => {
    const dataSet = SparkData.createDataSet({scenarioId: 'SPACE', dataSetName: 'Candidate', tables: {Items: {
      tableName: 'Items', modelBinding: {modelId: 'ITEMS', modelName: 'Items'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'title', type: 'string', required: true},
        {name: 'restricted', type: 'string'}], views: {default: {commitMode: 'staged'}},
    }}})
    instances.push(dataSet)
    const view = dataSet.getView('Items')!
    const readOnlyFields: string[] = []
    view.bindQueryExecutor({executeQuery: async () => ({
      rows: [{id: '1', title: 'original', restricted: 'original'}], total: 1,
      resultPrimaryKey: 'id',
      assertIdentity: identity => {
        if (identity.scenarioId !== 'SPACE' || identity.metaName !== 'Items') throw new Error('identity mismatch')
      },
      rowKey: row => row['id'],
      prepareNewRow: row => ({...row, id: '2'}),
      isFieldReadOnly: field => { readOnlyFields.push(field); return field === 'restricted' },
      fieldAccess: () => ({read: 'visible', write: 'allowed', component: 'editable', required: false, writeMode: 'editable'}),
      readFieldAccess: () => 'visible',
      addActionState: available => available === false ? 'disabled' : 'enabled',
      editActionState: () => 'enabled', deleteActionState: () => 'enabled',
      createChildActionState: () => 'enabled', viewActionState: () => 'enabled',
    })})
    await view.loadFromServer()
    view.updateEditingValue('1', 'title', 'preserve this existing edit')
    const rowsBefore = structuredClone(view.rows)
    const patchBefore = view.getEditingPatch('1')

    const access = view.newRowFieldAccess('title')

    expect(access).toMatchObject({read: 'visible', write: 'allowed', required: true, component: 'editable', writeMode: 'required'})
    expect(view.rows).toEqual(rowsBefore)
    expect(view.getEditingPatch('1')).toEqual(patchBefore)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(readOnlyFields).toEqual(['title'])

    await expect(view.addRow({title: 'new', restricted: 'candidate'})).rejects.toThrow(/restricted/u)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    const added = await view.addRow({title: 'new'})
    expect(view.fieldAccess(added, 'title')).toEqual(access)
    expect(view.fieldAccess(added, 'restricted').write).toBe('denied')
    expect(readOnlyFields).toContain('restricted')
  })

  it('denies a later query-context read-only field before addRow and leaves no pending create', async () => {
    const {view} = await setupNewRowQuery({isFieldReadOnly: field => field === 'restricted'})
    const rowsBefore = structuredClone(view.rows)
    const access = view.newRowFieldAccess('restricted')
    expect(access.write).toBe('denied')
    expect(view.rows).toEqual(rowsBefore)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    expect([...view.dirtyTracking.pendingCreateIds]).toEqual([])
  })

  it.each(['computed', 'expression', 'id', 'generated', 'missing'] as const)(
    'denies a declared non-input or unknown new-row field: %s', async field => {
      const {view} = await setupNewRowQuery()
      expect(view.newRowFieldAccess(field).write).toBe('denied')
    },
  )

  it('denies new-row input when the current query says adding is unavailable', async () => {
    const {view} = await setupNewRowQuery({addEnabled: false})
    expect(view.newRowFieldAccess('title').write).toBe('denied')
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('accepts a separate formal identity without granting primary-key field editing', async () => {
    const {view} = await setupNewRowQuery({explicitIdentity: true})
    expect(view.supportsExplicitIdentityCreate).toBe(true)
    expect(view.newRowFieldAccess('id').write).toBe('denied')
    await expect(view.addRow({id: 'DIRECT', title: 'candidate'})).rejects.toThrow('DATA_VIEW_NEW_ROW_IDENTITY_REQUIRED')

    const added = await view.addRowWithIdentity({field: 'id', value: 'EXPLICIT'}, {title: 'candidate'})

    expect(added).toMatchObject({id: 'EXPLICIT', title: 'candidate'})
    expect(view.dirtyTracking.pendingCreateIds.has('EXPLICIT')).toBe(true)
    expect(() => view.updateEditingValue('EXPLICIT', 'id', 'MUTATED')).toThrow(/不允许修改主键字段/u)
  })

  it('creates an explicit child from the canonical authorized parent without requiring root add permission', async () => {
    const {view} = await setupNewRowQuery({explicitIdentity: true, addEnabled: false})
    const parent = {...view.rows[0]!, id: '1', title: 'forged parent'}
    const child = await view.addChildRow({parentRow: parent, parentField: 'id', childForeignKey: 'parentId', identity: {field: 'id', value: 'CHILD'}, data: {title: 'child'}})
    expect(child).toMatchObject({id: 'CHILD', parentId: '1', title: 'child'})
  })

  it('rejects an owner that remaps the child foreign key before accepting any pending row', async () => {
    const {view} = await setupNewRowQuery({explicitIdentity: true, remapParent: true})
    const parent = {...view.rows[0]!, id: '1'}
    await expect(view.addChildRow({parentRow: parent, parentField: 'id', childForeignKey: 'parentId', identity: {field: 'id', value: 'CHILD'}, data: {title: 'child'}}))
      .rejects.toThrow('DATA_VIEW_CHILD_FK_MISMATCH')
    expect(view.rows.some(row => row['id'] === 'CHILD')).toBe(false)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('rejects invalid canonical parent identities and non-output parent mapping fields', async () => {
    const {view} = await setupNewRowQuery({explicitIdentity: true})
    await expect(view.addChildRow({parentRow: {...view.rows[0]!, id: ' '}, parentField: 'id', childForeignKey: 'parentId', identity: {field: 'id', value: 'A'}, data: {title: 'child'}}))
      .rejects.toThrow('DATA_VIEW_CHILD_PARENT_IDENTITY')
    await expect(view.addChildRow({parentRow: view.rows[0]!, parentField: 'notOutput', childForeignKey: 'parentId', identity: {field: 'id', value: 'B'}, data: {title: 'child'}}))
      .rejects.toThrow('DATA_VIEW_CHILD_PARENT_FIELD_OUTPUT')
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('keeps formal identity additions on the DataSet staging path even in immediate mode', async () => {
    const {view} = await setupNewRowQuery({explicitIdentity: true})
    view.commitMode = 'immediate'
    await view.addRowWithIdentity({field: 'id', value: 'IMMEDIATE-MODE'}, {title: 'candidate'})
    expect(view.dirtyTracking.pendingCreateIds.has('IMMEDIATE-MODE')).toBe(true)
    expect(view.rows.some(row => row['id'] === 'IMMEDIATE-MODE')).toBe(true)
  })

  it('does not infer formal identity support for a local configuration view', () => {
    const view = setup()
    expect(view.supportsExplicitIdentityCreate).toBe(false)
  })

  it('rejects identity when the owner does not explicitly support it or the field mismatches', async () => {
    const unsupported = await setupNewRowQuery()
    await expect(unsupported.view.addRowWithIdentity({field: 'id', value: 'NEW'}, {title: 'candidate'}))
      .rejects.toThrow('DATA_VIEW_NEW_ROW_IDENTITY_OWNER')
    const supported = await setupNewRowQuery({explicitIdentity: true})
    await expect(supported.view.addRowWithIdentity({field: 'other', value: 'NEW'}, {title: 'candidate'}))
      .rejects.toThrow('DATA_VIEW_NEW_ROW_IDENTITY_MISMATCH')
    expect(supported.view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('preflights every identity-backed new field before staging any row', async () => {
    const {view} = await setupNewRowQuery({explicitIdentity: true, isFieldReadOnly: field => field === 'restricted'})
    const rowsBefore = structuredClone(view.rows)
    await expect(view.addRowWithIdentity({field: 'id', value: 'NEW'}, {title: 'candidate', restricted: 'denied'}))
      .rejects.toThrow(/restricted/u)
    expect(view.rows).toEqual(rowsBefore)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it.each(['computed', 'expression', 'generated', 'missing'] as const)(
    'rejects identity-backed non-input or unknown fields before staging: %s', async field => {
      const {view} = await setupNewRowQuery({explicitIdentity: true})
      const rowsBefore = structuredClone(view.rows)
      await expect(view.addRowWithIdentity({field: 'id', value: 'NEW'}, {[field]: 'candidate'}))
        .rejects.toThrow()
      expect(view.rows).toEqual(rowsBefore)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    },
  )

  it('requires root add permission for identity-backed root additions', async () => {
    const {view} = await setupNewRowQuery({explicitIdentity: true, addEnabled: false})
    await expect(view.addRowWithIdentity({field: 'id', value: 'NEW'}, {title: 'candidate'}))
      .rejects.toThrow('DATA_VIEW_ADD_DISABLED')
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('rejects identity-backed inputs that conflict with owner-derived query defaults', async () => {
    const {view} = await setupNewRowQuery({explicitIdentity: true})
    view.filterExpression = {field: 'parentId', operator: 'eq', value: 'PARENT-1'}
    await view.refresh()
    await expect(view.addRowWithIdentity({field: 'id', value: 'CHILD'}, {title: 'candidate', parentId: 'PARENT-2'}))
      .rejects.toThrow('DATA_VIEW_NEW_ROW_DEFAULT_CONFLICT')
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    await expect(view.addRowWithIdentity({field: 'id', value: 'CHILD-OK'}, {title: 'candidate', parentId: 'PARENT-1'}))
      .resolves.toMatchObject({id: 'CHILD-OK', parentId: 'PARENT-1'})
  })

  it('rejects explicit identity staging after the query owner becomes stale', async () => {
    const {view, failNextQuery} = await setupNewRowQuery({explicitIdentity: true})
    failNextQuery()
    await view.refresh()
    await expect(view.addRowWithIdentity({field: 'id', value: 'STALE'}, {title: 'candidate'}))
      .rejects.toThrow('DATA_VIEW_RESULT_STALE')
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('rejects an owner that silently remaps the requested identity before staging', async () => {
    const {view} = await setupNewRowQuery({explicitIdentity: true, remapIdentity: true})
    await expect(view.addRowWithIdentity({field: 'id', value: 'REQUESTED'}, {title: 'candidate'}))
      .rejects.toThrow('DATA_VIEW_NEW_ROW_IDENTITY_MISMATCH')
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('denies new-row input for a keyless query result, matching addRow read-only behavior', async () => {
    const {view} = await setupNewRowQuery({keyless: true})
    expect(view.newRowFieldAccess('title').write).toBe('denied')
    await expect(view.addRow({title: 'candidate'})).rejects.toThrow('DATA_VIEW_KEYLESS_READONLY')
  })

  it('does not preflight writable when the query owner cannot prepare a new row', async () => {
    const {view} = await setupNewRowQuery({omitPrepareNewRow: true})
    expect(view.newRowFieldAccess('title').write).toBe('denied')
    await expect(view.addRow({title: 'candidate'})).rejects.toThrow('DATA_VIEW_NEW_ROW_OWNER')
  })

  it('uses the refreshed query context after query inputs change', async () => {
    const {view} = await setupNewRowQuery({
      isFieldReadOnly: (field, scope) => scope === 'second' && field === 'restricted',
    })
    view.queryContext = {scope: 'first'}
    await view.refresh()
    expect(view.newRowFieldAccess('restricted').write).toBe('allowed')
    view.queryContext = {scope: 'second'}
    expect(view.newRowFieldAccess('restricted').write).toBe('denied')
    await view.refresh()
    expect(view.newRowFieldAccess('restricted').write).toBe('denied')
  })

  it('denies new-row access after the current query becomes stale', async () => {
    const {view, failNextQuery} = await setupNewRowQuery()
    failNextQuery()
    await view.refresh()
    expect(view.loadingError?.message).toBe('query failed for stale-context check')
    expect(view.newRowFieldAccess('title').write).toBe('denied')
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('keeps fieldAccess(null, field) and unbound new-row access denied', () => {
    const view = setup()
    expect(view.fieldAccess(null, 'name').write).toBe('denied')
    expect(view.newRowFieldAccess('name').write).toBe('denied')
  })

  it('rejects new-row access after the DataView is destroyed', () => {
    const view = setup()
    view.destroy()
    expect(() => view.newRowFieldAccess('name')).toThrow(/destroy/i)
  })
})
