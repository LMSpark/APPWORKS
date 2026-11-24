import {expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {SystemPageIdentityPool} from '../../../../packages/spark-app/src/router/system-page-identity/system-page-identity-pool'
import {createMemoryHistory, createRouter, RouterView, useRoute} from 'vue-router'
import ElementPlus from 'element-plus'
import {DataSet, bindDataSetReadonlyCommandQuery, getSparkNodeChildren, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import * as scenarioLoader from '@/platform-adapters/data-space/lowcode-data-space-runtime'
import DataRecoveryPage from '@/views/features/system/data-recovery/ui/data-recovery-page.vue'
import {DataRecoverySession} from '@/views/features/system/data-recovery/ui/data-recovery-session'
import {withTestPageService} from '../../../support/helpers/page-service-host'

vi.mock('@/views/features/system/data-recovery/ui/tool/style.css?raw', async () => {
  const {readFileSync} = await import('node:fs')
  return {default: readFileSync('src/views/features/system/data-recovery/ui/tool/style.css', 'utf8')}
})

async function bindRecoveryRows(view: DataView, rows: readonly DataRow[], options: Readonly<{
  allowAdd?: boolean
  editableFields?: readonly string[]
  rejectSave?: boolean
}> = {}): Promise<void> {
  const editable = new Set(options.editableFields ?? [])
  let next = 0
  view.bindQueryExecutor({executeQuery: async () => ({
    rows, total: rows.length, resultPrimaryKey: 'rowid', countReported: true,
    assertIdentity: () => undefined,
    rowKey: row => row['rowid'],
    fieldAccess: (_key, field) => ({
      read: 'visible' as const,
      write: editable.has(field) ? 'allowed' as const : 'denied' as const,
      component: editable.has(field) ? 'editable' as const : 'readonly' as const,
      required: false,
      writeMode: editable.has(field) ? 'editable' as const : 'readonly' as const,
    }),
    readFieldAccess: () => 'visible' as const,
    newRowFieldAccess: field => ({read: 'visible' as const,
      write: options.allowAdd === true && field !== 'rowid' ? 'allowed' as const : 'denied' as const, required: false}),
    prepareNewRow: input => ({...input, rowid: `R${++next}`}),
    addActionState: available => options.allowAdd === true && available !== false ? 'enabled' as const : 'disabled' as const,
    editActionState: (_key, available) => editable.size > 0 && available !== false ? 'enabled' as const : 'disabled' as const,
    deleteActionState: () => 'disabled' as const,
    createChildActionState: () => 'disabled' as const,
    viewActionState: () => 'enabled' as const,
  }),
  ...(options.rejectSave?{save:async()=>{throw new Error('owner rejected undo')}}:{})
  })
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}

async function recoverySessionFixture(confirm: (message:string)=>Promise<boolean>=async()=>true,rejectTargetSave=false) {
  const models = {
    Base_AppSystemList: ['rowid'],
    Base_AppAndSource_Relation: ['rowid', 'conid'],
    _Base_TblList: ['rowid', 'tblname'],
    获取软删除的数据: ['rowid', 'data'],
    Base_TableData_Recovery: ['rowid', 'sys_id', 'db_id', 'data_id', 'table_id', 'status'],
  }
  const dataSet = DataSet.fromJson({scenarioId: 'RECOVERY-SESSION', tables: Object.fromEntries(
    Object.entries(models).map(([modelName, columns]) => [modelName, {
      modelBinding: {modelId: modelName, modelName},
      columns: columns.map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
      views: {default: {autoLoad: false, autoCurrentFirst: false}},
    }]),
  )})
  const view = (model: string) => {
    const found = dataSet.getView(model)
    if (!found) throw new Error(`missing ${model}`)
    return found
  }
  const application = view('Base_AppSystemList')
  const database = view('Base_AppAndSource_Relation')
  const table = view('_Base_TblList')
  const source = view('获取软删除的数据')
  const target = view('Base_TableData_Recovery')
  await Promise.all([
    bindRecoveryRows(application, [{rowid: 'APP-1'}]),
    bindRecoveryRows(database, [{rowid: 'DB-ROW', conid: 'DB-1'}]),
    bindRecoveryRows(table, [{rowid: 'T-1', tblname: 'Example'}]),
    bindRecoveryRows(source, [{rowid: 'DATA-1', data: 'deleted'}], {editableFields: ['data']}),
    bindRecoveryRows(target, [{rowid: 'REC-1', sys_id: 'APP-1', db_id: 'DB-1', data_id: 'DATA-2',
      table_id: 'T-1', status: 0}], {allowAdd: true, editableFields: ['status'], rejectSave: rejectTargetSave}),
  ])
  application.setCurrentRowById('APP-1')
  database.setCurrentRowById('DB-ROW')
  table.setCurrentRowById('T-1')
  const isCurrentTable = vi.fn((id: string) => id === 'T-1')
  const assertCurrent = vi.fn()
  const confirmation = vi.fn(confirm)
  const session = new DataRecoverySession({
    target, source, owners: {table, database, application}, confirm: confirmation,
    assertCurrent, assertOperationCurrent: assertCurrent, isCurrentTable,
  })
  return {dataSet, session, source, target, application, database, table, confirmation}
}

function successfulSaveResult() {
  return {
    success: true as const, message: 'saved',
    data: {viewCount: 1, appliedEditingRows: 0, failedEditingRows: 0, createdCount: 1, savedCount: 0,
      deletedCount: 0, failedCount: 0, failedViews: [], viewResults: []},
  }
}

it('renders only the selected recovery table fields while the next field result is pending', async () => {
  const scenarioId = '70D5D8FACCC201A822F64B16A441BE8F'
  const models = {
    Base_AppSystemList: ['rowid', 'AppDesc', 'AppName'],
    Base_AppAndSource_Relation: ['rowid', 'conName', 'conid'],
    _Base_TblList: ['rowid', 'tbldesc', 'tblname'],
    Base_TblField: ['rowid', 'tblid', 'enname', 'cnname'],
    获取软删除的数据: ['rowid', 'before', 'after'],
    获取表数据: ['rowid', 'before', 'after'],
    Base_TableData_Recovery: ['rowid', 'sys_id', 'db_id', 'data_id', 'recovery_date', 'table_id', 'recovery_userid'],
  }
  const directoryModels = new Set(['Base_TblField', '_Base_TblList', 'Base_AppAndSource_Relation'])
  const ds = DataSet.fromJson({scenarioId, tables: Object.fromEntries(Object.entries(models).map(([modelName, names]) => [modelName, {
    ...(directoryModels.has(modelName)
      ? {resourceType: 'logical-view', resourceId: modelName}
      : {modelBinding: {modelId: modelName, modelName}}),
    columns: names.map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
    views: {default: {autoLoad: false, queryConfig: {pagination: 'none'}}},
  }]))})
  const tables = ds.getView('_Base_TblList')!, fields = ds.getView('Base_TblField')!
  const databases = ds.getView('Base_AppAndSource_Relation')!, all = ds.getView('获取表数据')!
  let fieldRows = [{rowid: 'F1', tblid: 'T1', enname: 'before', cnname: '原字段'}]
  bindDataSetReadonlyCommandQuery(fields, {resource: {resourceType: 'logical-view', resourceId: fields.tableName}, guard: () => {}, loadRows: async () => fieldRows})
  bindDataSetReadonlyCommandQuery(databases, {resource: {resourceType: 'logical-view', resourceId: databases.tableName}, guard: () => {}, loadRows: async () => [{rowid: 'D', conid: 'DB1', conName: '原库'}]})
  bindDataSetReadonlyCommandQuery(tables, {resource: {resourceType: 'logical-view', resourceId: tables.tableName}, guard: () => {}, loadRows: async () => [{rowid: 'T1', tblname: 'First'}, {rowid: 'T2', tblname: 'Second'}]})
  await Promise.all([fields.refresh(), databases.refresh(), tables.refresh()])
  databases.setCurrentRowById('D')
  tables.setCurrentRowById('T1')
  const loader = vi.spyOn(scenarioLoader, 'loadLowcodeRuntimeScenario').mockResolvedValue(ds)
  registerAllRenderers()
  const mainRead = vi.spyOn(ds.getView('Base_AppSystemList')!, 'refresh').mockResolvedValue(undefined)
  const allRead = vi.spyOn(all, 'refresh').mockResolvedValue(undefined)
  const path = '/apps/APP/recovery'
  const pool = new SystemPageIdentityPool()
  const host = defineComponent({setup() {
    const route = useRoute()
    const instance = pool.get(route, {scope: 'application', path, nodeId: 'RECOVERY', title: '数据恢复',
      pageId: 'RECOVERY', explicitQuery: {}, component: DataRecoveryPage})
    return () => h(instance.view)
  }})
  const router = createRouter({history: createMemoryHistory(), routes: [{path, component: host,
    meta: {nodeId: 'RECOVERY', blueprintScenarioId: scenarioId, systemPageIdentityState: 'resolved'}}]})
  await router.push(path)
  const originalStubs = config.global.stubs
  const stubs = {...originalStubs}
  for (const name of ['SparkComponentRenderer', 'spark-component-renderer']) delete stubs[name]
  config.global.stubs = stubs
  const wrapper = mount(withTestPageService(RouterView, router), {global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  try {
    const deletedFields = () => {
      const table = wrapper.findAllComponents(RendererTable).find(item => item.props('dataViewKey') === `${scenarioId}@获取软删除的数据@default`)
      return table ? getSparkNodeChildren(table.props('children')).map(node => node.props?.['field']) : undefined
    }
    await vi.waitFor(() => expect(deletedFields()).toEqual(['before']))
    tables.setCurrentRowById('T2')
    await flushPromises()
    const pageRoot = wrapper.get('.spark-page-container')
    const scope = `[data-page="${pageRoot.attributes('data-page')}"].spark-page-container`
    expect(wrapper.get('style').element.textContent).toContain(`${scope} .recovery-page__body`)
    expect(deletedFields()).toEqual([])
    fieldRows = [...fieldRows, {rowid: 'F2', tblid: 'T2', enname: 'after', cnname: '新字段'}]
    await fields.refresh()
    await vi.waitFor(() => expect(deletedFields()).toEqual(['after']))
    expect(allRead).not.toHaveBeenCalled()
    const selectTab = async (name: string) => {
      await wrapper.get(`[role="tab"]#tab-${name}`).trigger('click')
      await flushPromises()
    }
    all.queryContext = {TbName: 'First', DbId: 'DB1'}
    await selectTab('all')
    expect(allRead).not.toHaveBeenCalled()
    await selectTab('deleted')
    all.queryContext = {TbName: 'Second', DbId: 'DB1'}
    await selectTab('all')
    expect(allRead).toHaveBeenCalledTimes(1)
  } finally {
    wrapper.unmount()
    config.global.stubs = originalStubs
    loader.mockRestore()
    mainRead.mockRestore()
    allRead.mockRestore()
  }
})

it('keeps restore and undo eligibility tied to their distinct SPARK Data permissions', async () => {
  const fixture = await recoverySessionFixture()
  try {
    const deleted = fixture.source.rows[0]!
    const restored = fixture.target.rows[0]!
    const add = vi.spyOn(fixture.target, 'addActionState')
    const edit = vi.spyOn(fixture.target, 'editActionState')
    add.mockReturnValue('disabled')
    edit.mockReturnValue('enabled')
    expect(fixture.session.canRestore(deleted)).toBe(false)
    expect(fixture.session.canUndo(restored)).toBe(true)
    add.mockReturnValue('enabled')
    edit.mockReturnValue('disabled')
    expect(fixture.session.canRestore(deleted)).toBe(true)
    expect(fixture.session.canUndo(restored)).toBe(false)
    expect(fixture.confirmation).not.toHaveBeenCalled()
  } finally {
    fixture.dataSet.destroy()
  }
})

it('captures the exact deleted row and selected owners before a confirmed restore', async () => {
  const fixture = await recoverySessionFixture()
  try {
    const deleted = fixture.source.rows[0]!
    const sourceCheck = vi.fn(), tableCheck = vi.fn(), databaseCheck = vi.fn(), applicationCheck = vi.fn()
    vi.spyOn(fixture.source, 'captureReadRow').mockReturnValue(sourceCheck)
    vi.spyOn(fixture.table, 'captureReadRow').mockReturnValue(tableCheck)
    vi.spyOn(fixture.database, 'captureReadRow').mockReturnValue(databaseCheck)
    vi.spyOn(fixture.application, 'captureReadRow').mockReturnValue(applicationCheck)
    const add = vi.spyOn(fixture.target, 'addRow')
    vi.spyOn(fixture.dataSet, 'saveChanges').mockResolvedValue(successfulSaveResult())
    const sourceRefresh = vi.spyOn(fixture.source, 'refresh').mockResolvedValue(undefined)
    const targetRefresh = vi.spyOn(fixture.target, 'refresh').mockResolvedValue(undefined)

    await fixture.session.restore(deleted)

    expect(sourceCheck).toHaveBeenCalledOnce()
    expect(tableCheck).toHaveBeenCalledOnce()
    expect(databaseCheck).toHaveBeenCalledOnce()
    expect(applicationCheck).toHaveBeenCalledOnce()
    expect(fixture.source.captureReadRow).toHaveBeenCalledWith(deleted, ['rowid'])
    expect(fixture.table.captureReadRow).toHaveBeenCalledWith(fixture.table.currentRow, ['rowid'])
    expect(fixture.database.captureReadRow).toHaveBeenCalledWith(fixture.database.currentRow, ['conid'])
    expect(fixture.application.captureReadRow).toHaveBeenCalledWith(fixture.application.currentRow, ['rowid'])
    expect(add).toHaveBeenCalledWith({
      data_id: 'DATA-1', table_id: 'T-1', db_id: 'DB-1', sys_id: 'APP-1',
    })
    expect(fixture.dataSet.saveChanges).toHaveBeenCalledTimes(1)
    expect(fixture.dataSet.saveChanges).toHaveBeenCalledWith({views: [{
      tableName: 'Base_TableData_Recovery', viewId: 'default', ids: [expect.any(String)],
    }]})
    expect(sourceRefresh).toHaveBeenCalledOnce()
    expect(targetRefresh).toHaveBeenCalledOnce()
    expect(fixture.session.notice).toBe('恢复登记已确认')
  } finally {
    fixture.dataSet.destroy()
  }
})

it('does not stage a restore when its confirmation is cancelled', async () => {
  const fixture = await recoverySessionFixture(async () => false)
  try {
    const add = vi.spyOn(fixture.target, 'addRow')
    const save = vi.spyOn(fixture.dataSet, 'saveChanges')
    await fixture.session.restore(fixture.source.rows[0]!)
    expect(fixture.confirmation).toHaveBeenCalledWith('确认恢复该条数据吗？')
    expect(add).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  } finally {
    fixture.dataSet.destroy()
  }
})

it('retains a lost restore receipt and verifies the original capture without replay', async () => {
  const fixture = await recoverySessionFixture()
  try {
    let unknown = false
    const discard = vi.spyOn(fixture.target, 'discardPendingChanges')
    vi.spyOn(fixture.target, 'hasUnconfirmedSave', 'get').mockImplementation(() => unknown)
    vi.spyOn(fixture.target, 'hasUnconfirmedSaveFor').mockImplementation(ids =>
      unknown && ids.length === 1)
    const save = vi.spyOn(fixture.dataSet, 'saveChanges').mockImplementation(async () => {
      unknown = true
      throw new Error('receipt lost')
    })
    const verify = vi.spyOn(fixture.target, 'saveChanges').mockImplementation(async ids => {
      expect(ids).toHaveLength(1)
      unknown = false
      return {success: true, message: 'verified', data: {createdCount: 1, savedCount: 0, deletedCount: 0,
        failedCount: 0, failedIds: [], failedErrors: {}}}
    })
    const sourceRefresh = vi.spyOn(fixture.source, 'refresh').mockResolvedValue(undefined)
    const targetRefresh = vi.spyOn(fixture.target, 'refresh').mockResolvedValue(undefined)

    await fixture.session.restore(fixture.source.rows[0]!)
    expect(fixture.session.pendingVerification).toBe(true)
    expect(fixture.session.verification()).toEqual({visible: true, disabled: false})
    expect(save).toHaveBeenCalledTimes(1)
    expect(discard).not.toHaveBeenCalled()
    expect(sourceRefresh).not.toHaveBeenCalled()

    await fixture.session.verify()
    expect(save).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(fixture.session.pendingVerification).toBe(false)
    expect(sourceRefresh).toHaveBeenCalledOnce()
    expect(targetRefresh).toHaveBeenCalledOnce()
  } finally {
    fixture.dataSet.destroy()
  }
})

it('undoes only the captured recovery status and refreshes after its readback', async () => {
  const fixture = await recoverySessionFixture()
  try {
    const recovered = fixture.target.rows[0]!
    const original = vi.fn()
    vi.spyOn(fixture.target, 'captureReadRow').mockReturnValue(original)
    const edit = vi.spyOn(fixture.target, 'updateEditingValue')
    vi.spyOn(fixture.dataSet, 'saveChanges').mockResolvedValue(successfulSaveResult())
    const sourceRefresh = vi.spyOn(fixture.source, 'refresh').mockResolvedValue(undefined)
    const targetRefresh = vi.spyOn(fixture.target, 'refresh').mockResolvedValue(undefined)

    await fixture.session.undo(recovered)

    expect(fixture.confirmation).toHaveBeenCalledWith('撤销恢复后，原数据将重新进入回收站。确认继续吗？')
    expect(fixture.target.captureReadRow).toHaveBeenCalledWith(recovered, ['status'])
    expect(original).toHaveBeenCalledOnce()
    expect(edit).toHaveBeenCalledWith('REC-1', 'status', 1)
    expect(fixture.dataSet.saveChanges).toHaveBeenCalledWith({views: [{
      tableName: 'Base_TableData_Recovery', viewId: 'default', ids: ['REC-1'],
    }]})
    expect(sourceRefresh).toHaveBeenCalledOnce()
    expect(targetRefresh).toHaveBeenCalledOnce()
    expect(fixture.session.notice).toBe('撤销恢复登记已确认')
  } finally {
    fixture.dataSet.destroy()
  }
})

it('clears a definitely rejected undo patch and leaves the recovery session usable',async()=>{
  const fixture=await recoverySessionFixture(undefined,true)
  try{
    const row=fixture.target.rows[0]!
    fixture.source.updateEditingValue('DATA-1','data','unrelated source draft')
    await fixture.session.undo(row)
    expect(fixture.target.hasUnconfirmedSave).toBe(false)
    expect(fixture.target.hasEditingChanges('REC-1')).toBe(false)
    expect(fixture.target.dirtyTracking.hasPendingChanges('REC-1')).toBe(false)
    expect(fixture.session.pendingVerification).toBe(false)
    const current=fixture.target.rows.find(item=>fixture.target.getPkKey(item)==='REC-1')
    expect(fixture.session.canUndo(current)).toBe(true)
    expect(fixture.source.getEditingRow('DATA-1')?.['data']).toBe('unrelated source draft')
  }finally{fixture.dataSet.destroy()}
})
