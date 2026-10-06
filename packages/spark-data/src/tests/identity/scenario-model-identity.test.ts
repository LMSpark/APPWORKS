import { describe, expect, it, vi } from 'vitest'

import { DataSet } from '../../dataset'
import { DataTable } from '../../data-table'

const COLUMNS = [{ name: 'id', type: 'string' as const, label: 'id' }]

function tableJson(modelBinding?: unknown) {
  return {
    tableName: 'Orders',
    columns: COLUMNS,
    ...(modelBinding === undefined ? {} : { modelBinding }),
    views: { default: { tableName: 'Orders', viewId: 'default', page: 1, pageSize: 10, rows: [] } },
  }
}

describe('DataSet 场景身份与 DataTable 模型绑定', () => {
  it('scenarioId 与 modelBinding 往返保持，且不改变页面内 tableName', () => {
    const dataSet = DataSet.fromJson({
      dataSetName: 'd',
      scenarioId: 'FORM-1',
      tables: { Orders: tableJson({ modelId: 'MODEL-1', modelName: '订单' }) },
    })

    expect(dataSet.scenarioId).toBe('FORM-1')
    expect(dataSet.getTable('Orders')?.modelBinding).toEqual({ modelId: 'MODEL-1', modelName: '订单' })

    const reloaded = DataSet.fromJson(JSON.parse(JSON.stringify(dataSet.toJson())))
    expect(reloaded.scenarioId).toBe('FORM-1')
    expect(reloaded.getTable('Orders')?.modelBinding).toEqual({ modelId: 'MODEL-1', modelName: '订单' })
    expect(Object.keys(reloaded.toJson().tables)).toEqual(['Orders'])
  })

  it('未声明身份的本地 DataSet 不出现这两个字段', () => {
    const json = DataSet.fromJson({ dataSetName: 'd', tables: { Orders: tableJson() } }).toJson()

    expect(json).not.toHaveProperty('scenarioId')
    expect(json.tables['Orders']).not.toHaveProperty('modelBinding')
  })

  it('modelBinding 的 modelId 与 modelName 必须同时有效', () => {
    expect(() => DataTable.fromJson(tableJson({ modelId: 'MODEL-1' }))).toThrow(/modelBinding/)
    expect(() => DataTable.fromJson(tableJson({ modelId: ' ', modelName: '订单' }))).toThrow(/modelBinding/)
    expect(() => DataTable.fromJson(tableJson({ modelId: 'MODEL-1', modelName: '' }))).toThrow(/modelBinding/)
  })

  it('运行模型绑定不可整体赋值或嵌套改写', () => {
    const table = DataTable.fromJson(tableJson({ modelId: 'MODEL-1', modelName: '订单' }))
    expect(() => Object.assign(table, { modelBinding: { modelId: 'MODEL-2', modelName: '其他' } })).toThrow()
    expect(() => Object.assign(table.modelBinding ?? {}, { modelName: '改名' })).toThrow()
    expect(table.modelBinding).toEqual({ modelId: 'MODEL-1', modelName: '订单' })
  })

  it('重建模型保持局部表名，输入和导出配置不改变原运行绑定', () => {
    const binding = { modelId: 'MODEL-1', modelName: '订单' }
    const table = DataTable.fromJson(tableJson(binding))
    binding.modelName = '外部修改'
    const exported = table.toJson()
    expect(exported.modelBinding).not.toBe(table.modelBinding)
    Object.assign(exported.modelBinding ?? {}, { modelId: 'MODEL-2', modelName: '新订单' })
    const rebuilt = DataTable.fromJson(exported)
    expect(table.modelBinding).toEqual({ modelId: 'MODEL-1', modelName: '订单' })
    expect(rebuilt.modelBinding).toEqual({ modelId: 'MODEL-2', modelName: '新订单' })
    expect(rebuilt.tableName).toBe(table.tableName)
    expect(rebuilt.getView('default')).not.toBe(table.getView('default'))
  })

  it('scenarioId 存在时必须是非空字符串', () => {
    expect(() => DataSet.fromJson({ dataSetName: 'd', scenarioId: ' ', tables: {} })).toThrow(/scenarioId/)
    expect(() => DataSet.fromJson({ dataSetName: 'd', scenarioId: 7, tables: {} })).toThrow(/scenarioId/)
  })

  it('运行场景身份不能直接改写或重新定义', () => {
    const dataSet = DataSet.fromJson({ dataSetName: 'd', scenarioId: 'FORM-1', tables: {} })
    expect(() => Object.assign(dataSet, { scenarioId: 'FORM-2' })).toThrow()
    expect(() => Object.defineProperty(dataSet, 'scenarioId', { value: undefined })).toThrow()
    expect(dataSet.scenarioId).toBe('FORM-1')
  })

  it.each([undefined, 'FORM-2'])('拒绝场景身份变成 %s，并保留旧表和视图', (scenarioId) => {
    const dataSet = DataSet.fromJson({ dataSetName: 'd', scenarioId: 'FORM-1', tables: { Orders: tableJson() } })
    const table = dataSet.getTable('Orders')
    const view = table?.getView('default')
    view?.appendRow({ id: 'local' })
    view?.dirtyTracking.markDirty('local', { id: 'local' })
    const rows = view?.rows

    expect(() => dataSet.replaceFromJson({ dataSetName: 'd', ...(scenarioId === undefined ? {} : { scenarioId }), tables: {} })).toThrow(/场景身份.*重新装配/)
    expect(dataSet.scenarioId).toBe('FORM-1')
    expect(dataSet.getTable('Orders')).toBe(table)
    expect(table?.dataSet).toBe(dataSet)
    expect(table?.getView('default')).toBe(view)
    expect(view?.destroyed).toBe(false)
    expect(view?.rows).toBe(rows)
    expect(view?.rows[0]?.['id']).toBe('local')
    expect(view?.dirtyTracking.dirtyRowIds.has('local')).toBe(true)
  })

  it('本地数据集不能原地绑定场景，同场景仍可替换结构', () => {
    const local = DataSet.fromJson({ dataSetName: 'd', tables: {} })
    expect(() => local.replaceFromJson({ dataSetName: 'd', scenarioId: 'FORM-1', tables: {} })).toThrow(/场景身份.*重新装配/)
    expect(local.scenarioId).toBeUndefined()

    const bound = DataSet.fromJson({ dataSetName: 'd', scenarioId: 'FORM-1', tables: {} })
    bound.replaceFromJson({ dataSetName: 'd', scenarioId: 'FORM-1', tables: { Orders: tableJson() } })
    expect(bound.scenarioId).toBe('FORM-1')
    expect(bound.getTable('Orders')).toBeDefined()
  })
})

function saveFixture() {
  const dataSet = DataSet.fromJson({ dataSetName: 'SaveScene', scenarioId: 'SCENE', tables: {
    Orders: { ...tableJson({ modelId: 'MODEL', modelName: 'Orders' }),
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }, { name: 'name', type: 'string' }],
      views: {
        default: { rows: [{ id: '1', name: 'original' }], commitMode: 'staged' },
        detail: { rows: [{ id: '1', name: 'original' }], commitMode: 'staged' },
      },
    },
  } })
  const first = dataSet.getView('Orders', 'default')
  const second = dataSet.getView('Orders', 'detail')
  if (!first || !second) throw new Error('missing save fixture views')
  const apply = vi.spyOn(first, 'applyEditingRows')
  const save = vi.spyOn(first, 'saveChanges').mockResolvedValue({ success: true })
  const teardown = vi.spyOn(first.cascade, 'teardownCascade')
  return { dataSet, first, second, apply, save, teardown }
}

describe('SPARK DataSet save preflight', () => {
  it('rejects same-model editing views before applying drafts or touching cascades', async () => {
    const { dataSet, first, second, apply, save, teardown } = saveFixture()
    first.updateEditingValue('1', 'name', 'first draft')
    second.updateEditingValue('1', 'name', 'second draft')
    await expect(dataSet.saveChanges()).rejects.toThrow('DATA_SET_SAVE_MODEL_CONFLICT')
    expect(apply).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(teardown).not.toHaveBeenCalled()
    expect(first.getEditingPatch('1')).toEqual({ name: 'first draft' })
    expect(second.getEditingPatch('1')).toEqual({ name: 'second draft' })
    dataSet.destroy()
  })

  it('rejects a pending change and an editing draft for the same model', async () => {
    const { dataSet, first, second, apply, save, teardown } = saveFixture()
    first.dirtyTracking.markDirty('1', { name: 'pending' })
    second.updateEditingValue('1', 'name', 'draft')
    await expect(dataSet.saveChanges()).rejects.toThrow('DATA_SET_SAVE_MODEL_CONFLICT')
    expect(apply).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(teardown).not.toHaveBeenCalled()
    expect(first.dirtyTracking.isDirty('1')).toBe(true)
    dataSet.destroy()
  })

  it.each(['option', 'config'] as const)('rejects transaction requested by %s without consuming edits', async source => {
    const { dataSet, first, apply, save, teardown } = saveFixture()
    first.updateEditingValue('1', 'name', 'draft')
    if (source === 'config') dataSet.saveChangesConfig = { mode: 'transaction' }
    await expect(dataSet.saveChanges(source === 'option' ? { mode: 'transaction' } : undefined))
      .rejects.toThrow('DATA_SET_SAVE_TRANSACTION_UNSUPPORTED')
    expect(apply).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(teardown).not.toHaveBeenCalled()
    expect(first.getEditingPatch('1')).toEqual({ name: 'draft' })
    dataSet.destroy()
  })

  it('explicit view selection leaves the other dirty view untouched', async () => {
    const { dataSet, first, second, save } = saveFixture()
    first.dirtyTracking.markDirty('1', { name: 'pending' })
    second.updateEditingValue('1', 'name', 'other draft')
    await expect(dataSet.saveChanges({ views: [{ tableName: 'Orders', viewId: 'default' }] }))
      .rejects.toThrow('DATA_VIEW_SAVE_OWNER')
    expect(save).not.toHaveBeenCalled()
    expect(first.dirtyTracking.isDirty('1')).toBe(true)
    expect(second.getEditingPatch('1')).toEqual({ name: 'other draft' })
    dataSet.destroy()
  })

  it('an empty selected row set does not cause a model conflict', async () => {
    const { dataSet, first, second, save } = saveFixture()
    first.dirtyTracking.markDirty('1', { name: 'pending' })
    second.updateEditingValue('1', 'name', 'unselected draft')
    await expect(dataSet.saveChanges({ views: [{ tableName: 'Orders', viewId: 'default' },
      { tableName: 'Orders', viewId: 'detail', ids: [] }] })).rejects.toThrow('DATA_VIEW_SAVE_OWNER')
    expect(save).not.toHaveBeenCalled()
    expect(first.dirtyTracking.isDirty('1')).toBe(true)
    expect(second.getEditingPatch('1')).toEqual({ name: 'unselected draft' })
    dataSet.destroy()
  })

  it('rejects a model save without a scene before invoking the view', async () => {
    const original = saveFixture()
    const { scenarioId: _scenarioId, ...localJson } = original.dataSet.toJson()
    const dataSet = DataSet.fromJson(localJson)
    original.dataSet.destroy()
    const view = dataSet.getView('Orders', 'default')!
    view.dirtyTracking.markDirty('1', { name: 'pending' })
    const save = vi.spyOn(view, 'saveChanges')
    await expect(dataSet.saveChanges()).rejects.toThrow('DATA_SET_SAVE_IDENTITY')
    expect(save).not.toHaveBeenCalled()
    expect(view.dirtyTracking.isDirty('1')).toBe(true)
    dataSet.destroy()
  })

  it('rejects a scene save without a formal model binding before consuming pending changes', async () => {
    const dataSet = DataSet.fromJson({ dataSetName: 'Unbound', scenarioId: 'SCENE', tables: { Orders: tableJson() } })
    const view = dataSet.getView('Orders', 'default')!
    view.dirtyTracking.markDirty('1', { id: '1' })
    const save = vi.spyOn(view, 'saveChanges')
    await expect(dataSet.saveChanges()).rejects.toThrow('DATA_SET_SAVE_IDENTITY')
    expect(save).not.toHaveBeenCalled()
    expect(view.dirtyTracking.isDirty('1')).toBe(true)
    dataSet.destroy()
  })

  it.each(['SCENE', 'OTHER'])('rejects a view owned by another DataSet instance with scenario %s', async scenarioId => {
    const original = saveFixture()
    const other = DataSet.fromJson({ ...original.dataSet.toJson(), scenarioId })
    const table = other.getTable('Orders')!
    const view = table.getView('default')!
    original.dataSet.tables['Foreign'] = table
    view.updateEditingValue('1', 'name', 'foreign draft')
    const apply = vi.spyOn(view, 'applyEditingRows')
    const save = vi.spyOn(view, 'saveChanges')
    await expect(original.dataSet.saveChanges({ views: [{ tableName: 'Foreign', viewId: 'default' }] }))
      .rejects.toThrow('DATA_SET_SAVE_IDENTITY')
    expect(apply).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(view.getEditingPatch('1')).toEqual({ name: 'foreign draft' })
    original.dataSet.destroy()
    other.destroy()
  })
})
