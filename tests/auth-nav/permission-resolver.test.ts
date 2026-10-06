import { describe, expect, it } from 'vitest'
import {
  DataSet,
} from '@spark-appworks/spark-data'
import { permission } from '../../packages/spark-component/src/index'
import { isActionDescriptorPermitted, isDataViewSavePermitted } from '../../packages/spark-component/src/page/actions/executor-helpers'
import { DataSpaceQueryTable } from '../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

const { isModelActionAllowed, isRowActionAllowed } = permission

async function actionViewFixture(allowAdd = false, allowChild = false) {
  let scope = 'query-a'
  let fail = false
  const dataSet = DataSet.fromJson({ dataSetName: 'scene', scenarioId: 'SCENE', tables: { Orders: {
    tableName: 'Orders', modelBinding: { modelId: 'MODEL', modelName: 'Orders' },
    columns: [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'name', type: 'string' }],
    views: { default: { page: 1, pageSize: 20 } },
  } } })
  const view = dataSet.getView('Orders', 'default')
  if (!view) throw new Error('view missing')
  const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Orders' })
  const result = new DataSpaceQueryContext({ identity: table.identity, scope, readScope: () => scope,
    snapshot: table.applyResult({ Result: { primaryKeyField: 'id', allowAdd, data: {
      Items: [{ id: 0, name: null, lingma_sys_params: { e: ['name'], r: ['name'], h: ['name'], d: true, c: allowChild } },
        { id: 1, name: 'locked', lingma_sys_params: { e: [], r: [], d: false } }], Count: 2,
    } } }) })
  view.bindQueryExecutor({ executeQuery: async () => {
    if (fail) throw new Error('query failed')
    return result
  } })
  await view.loadFromServer()
  view.setCurrentRowById(0)
  return { dataSet, view, invalidate: () => { scope = 'query-b' }, failQuery: () => { fail = true } }
}

describe('declarative actions consume DataView query permissions', () => {
  it('does not expose retired row-snapshot permission helpers', () => {
    for (const name of ['isPermittedAction', 'resolveFieldPermissionState', 'computeFieldState',
      'filterDisplayableFields', 'filterFields', 'filterDeletableRows', 'filterEditableRows',
      'getEditableFields', 'getVisibleFields', 'canCreate', 'canImport', 'canExport',
      'canDelete', 'canCreateChild', 'canEdit', 'isFieldVisible', 'isFieldEditable',
      'getFieldVisibility', 'maskFieldValue', 'extractPermissionSnapshot']) {
      expect(permission).not.toHaveProperty(name)
    }
  })
  it('resolves button model and row decisions from the bound DataView', async () => {
    const { dataSet, view } = await actionViewFixture(true)
    expect(isModelActionAllowed({ type: 'r-button', props: { action: 'append-row' } }, view)).toBe(true)
    expect(isRowActionAllowed({ type: 'r-button', props: { action: 'delete-current' } }, view.rows[0], view)).toBe(true)
    expect(isRowActionAllowed({ type: 'r-button', props: { action: 'patch-current' } }, view.rows[1], view)).toBe(false)
    expect(isModelActionAllowed({ type: 'r-button', props: { permAction: 'unissued-feature' } }, view)).toBe(false)
    dataSet.destroy()
  })

  it.each([false, true])('authorizes tree children from parent c independently of model allowAdd=%s', async (allowAdd) => {
    const { dataSet, view } = await actionViewFixture(allowAdd, true)
    const node = { type: 'r-button', props: { permAction: 'create-child' } }
    expect(isModelActionAllowed(node, view)).toBe(true)
    expect(isRowActionAllowed(node, view.rows[0], view)).toBe(true)
    expect(isRowActionAllowed(node, view.rows[1], view)).toBe(false)
    expect(isRowActionAllowed(node, undefined, view)).toBe(false)
    dataSet.destroy()
  })

  it('uses the private returned context after wire permission fields are removed', async () => {
    const { dataSet, view } = await actionViewFixture()
    expect(view.rows[0]).not.toHaveProperty('lingma_sys_params')
    expect(isActionDescriptorPermitted({ action: 'patch', target: 'current', patch: { name: 'new' } }, view)).toBe(true)
    expect(isActionDescriptorPermitted({ action: 'set-field', field: 'name', value: 'new' }, view)).toBe(true)
    expect(isActionDescriptorPermitted({ action: 'delete', target: 'current' }, view)).toBe(true)
    expect(isActionDescriptorPermitted({ action: 'patch', target: 'current', patch: { other: 'new' } }, view)).toBe(false)
    view.setSelectedRows(view.rows)
    expect(isActionDescriptorPermitted({ action: 'delete', target: 'selected' }, view)).toBe(false)
    dataSet.destroy()
  })

  it('does not accept forged consumer row permissions or a public table snapshot', async () => {
    const { dataSet, view } = await actionViewFixture()
    const locked = view.rows[1]
    if (!locked) throw new Error('locked row missing')
    locked.lingma_sys_params = { e: ['name'], r: [], h: [], m: [], d: true }
    view.setCurrentRowById(1)
    Reflect.set(view, 'permissionSnapshot', {allowAdd:true})
    expect(isActionDescriptorPermitted({ action: 'patch', target: 'current', patch: { name: 'new' } }, view)).toBe(false)
    expect(isActionDescriptorPermitted({ action: 'delete', target: 'current' }, view)).toBe(false)
    expect(isActionDescriptorPermitted({ action: 'append-row' }, view)).toBe(false)
    expect(isActionDescriptorPermitted({ action: 'delete', target: 'scope' }, view,
      { row: { id: 'unreturned', lingma_sys_params: locked.lingma_sys_params } })).toBe(false)
    dataSet.destroy()
  })

  it('checks editing patches and deleted row snapshots through the same context', async () => {
    const editable = await actionViewFixture()
    editable.view.updateEditingValue(0, 'name', 'new')
    expect(isDataViewSavePermitted({ view: editable.view })).toBe(true)
    editable.dataSet.destroy()
    const deleted = await actionViewFixture()
    deleted.view.deleteRowById(0)
    expect(isDataViewSavePermitted({ view: deleted.view })).toBe(true)
    deleted.dataSet.destroy()
  })

  it('uses addActionState for locally pending creates', async () => {
    for (const allowAdd of [false, true]) {
      const { dataSet, view } = await actionViewFixture(allowAdd)
      await view.addRow({ id: 2, name: 'draft' })
      expect(isDataViewSavePermitted({ view })).toBe(allowAdd)
      dataSet.destroy()
    }
  })

  it('pauses mutation actions after a query error and rejects retired identities', async () => {
    const { dataSet, view, failQuery, invalidate } = await actionViewFixture(true)
    failQuery()
    await expect(view.loadFromServer()).rejects.toThrow('query failed')
    expect(isActionDescriptorPermitted({ action: 'append-row' }, view)).toBe(false)
    expect(isActionDescriptorPermitted({ action: 'delete', target: 'current' }, view)).toBe(false)
    invalidate()
    expect(() => isActionDescriptorPermitted({ action: 'delete', target: 'current' }, view)).toThrow('STALE')
    dataSet.destroy()
  })
})
