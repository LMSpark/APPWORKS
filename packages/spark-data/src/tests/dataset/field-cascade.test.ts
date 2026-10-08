import { describe, expect, it, vi } from 'vitest'
import { DataSet } from '../../dataset'
import type { DataRow, DataViewFieldCascade, QueryParams } from '../../types'

function result(tableName: string, rows: DataRow[], access?: { hidden?: string; targetWritable?: boolean }) {
  return {
    rows, total: rows.length,
    assertIdentity(identity: { scenarioId: string; metaName: string }) {
      if (identity.scenarioId !== 'SCENE' || identity.metaName !== tableName) throw new Error('identity mismatch')
    },
    rowKey: (row: DataRow) => row['id'],
    fieldAccess: (_key: unknown, field: string) => ({ read: field === access?.hidden ? 'invisible' as const : 'visible' as const,
      write: (field === 'city' && access?.targetWritable !== false) || field === 'province' ? 'allowed' as const : 'denied' as const,
      component: field === access?.hidden ? 'hidden' as const
        : (field === 'city' && access?.targetWritable !== false) || field === 'province' ? 'editable' as const : 'readonly' as const,
      required: false, writeMode: (field === 'city' && access?.targetWritable !== false) || field === 'province'
        ? 'editable' as const : 'readonly' as const }),
    readFieldAccess: (_row: DataRow, field: string) => field === access?.hidden ? 'invisible' as const : 'visible' as const,
    addActionState: () => 'hidden' as const, editActionState: () => 'hidden' as const,
    deleteActionState: () => 'hidden' as const, createChildActionState: () => 'hidden' as const,
    viewActionState: () => 'hidden' as const,
  }
}

async function fixture(input?: { policy?: DataViewFieldCascade['valuePolicy']; rows?: DataRow[];
  format?: DataViewFieldCascade['valueFormat']; parents?: DataViewFieldCascade['parents']; options?: DataRow[];
  valueField?: string | string[]; delimiter?: string;
  access?: { hidden?: string; targetWritable?: boolean } }) {
  const policy = input?.policy ?? { mode: 'retain-valid', clearValue: null }
  const rows = input?.rows ?? [{ id: 1, country: 'A', province: 0, city: 'OLD' }]
  const dataSet = DataSet.fromJson({ scenarioId: 'SCENE', dataSetName: 'SCENE', tables: {
    Orders: { tableName: 'Orders', modelBinding: { modelId: 'ORDER', modelName: 'Orders' },
      columns: [{ name: 'id', type: 'number', isPrimaryKey: true }, { name: 'country', type: 'string' },
        { name: 'province', type: 'number' }, { name: 'city', type: 'string' }],
      views: { default: {}, edit: {}, selected: { autoSelectFirst: false, valueField: 'country' } } },
    Cities: { tableName: 'Cities', modelBinding: { modelId: 'CITY', modelName: 'Cities' },
      columns: [{ name: 'id', type: 'string', isPrimaryKey: true }, { name: 'caption', type: 'string' }, { name: 'code', type: 'string' }],
      views: { default: {}, choices: { valueField: input?.valueField ?? 'id', labelField: 'caption', selectionDelimiter: input?.delimiter ?? '|' } } },
  }, viewCascades: [{ kind: 'field', cascadeId: 'city-by-region', tableName: 'Orders', viewId: 'edit',
    valueFormat: input?.format ?? 'native', targetField: 'city',
    parents: input?.parents ?? [{ tableName: 'Orders', viewId: 'edit', field: 'country', parameter: 'countryId' }, { tableName: 'Orders', viewId: 'edit', field: 'province', parameter: 'provinceId' }],
    optionsView: { tableName: 'Cities', viewId: 'choices' },
    valuePolicy: policy }] })
  const target = dataSet.getView('Orders', 'edit')!
  const options = dataSet.getView('Cities', 'choices')!
  const source = dataSet.getView('Orders', 'selected')!
  const contexts: unknown[] = []
  let optionQuery = async (_params: QueryParams) => result('Cities', input?.options ?? [{ id: 'NEW', caption: 'New City' }])
  target.bindQueryExecutor({ executeQuery: async () => result('Orders', rows, input?.access) })
  source.bindQueryExecutor({ executeQuery: async () => result('Orders', rows, input?.access) })
  options.bindQueryExecutor({ executeQuery: async (_view, params) => {
    contexts.push(params.context)
    return optionQuery(params)
  } })
  await target.loadFromServer()
  await source.loadFromServer()
  return { dataSet, target, source, options, contexts,
    setOptionQuery: (next: (params: QueryParams) => Promise<ReturnType<typeof result>>) => { optionQuery = next } }
}

function address() { return { tableName: 'Orders', viewId: 'edit', field: 'city' } }

describe('DataSet field input cascades', () => {
  it('queries using selected primary key arrays from another view, including an empty selection', async () => {
    const { dataSet, source, contexts } = await fixture({ parents: [{ tableName: 'Orders', viewId: 'selected', parameter: 'ids' }],
      policy: { mode: 'retain' }, rows: [{ id: 0, country: 'A', province: 0, city: null },
        { id: 2, country: 'B', province: 0, city: null }] })
    try {
      source.setSelectedRows(source.rows)
      await vi.waitFor(() => expect(contexts).toHaveLength(1))
      expect(contexts[0]).toEqual({ ids: [0, 2] })
      expect(source.value).toBe('A,B')
      source.setCurrentRowById(2)
      expect(contexts).toHaveLength(1)
      source.clearSelectedRows()
      await vi.waitFor(() => expect(contexts).toHaveLength(2))
      expect(contexts[1]).toEqual({ ids: [] })
    } finally { dataSet.destroy() }
  })

  it.each([
    { format: 'selection-string' as const, before: '01|0|gone', after: '01|0', clearValue: '' },
    { format: 'native' as const, before: ['01', 0, 'gone'], after: ['01', 0], clearValue: [] },
  ])('retains valid $format values and round-trips business values independently of primary keys', async input => {
    const { dataSet, target, options } = await fixture({ format: input.format, valueField: 'code',
      rows: [{ id: 1, country: 'A', province: 0, city: input.before }],
      options: [{ id: 'pk1', code: '01', caption: 'one' }, { id: 'pk2', code: 0, caption: 'zero' }],
      policy: { mode: 'retain-valid', clearValue: input.clearValue } })
    try {
      target.updateEditingValue(1, 'country', 'B')
      await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address()).status).toBe('ready'))
      expect(target.getEditingRow(1)?.['city']).toEqual(input.after)
      expect(dataSet.getFieldCascadeState(address()).valueStatus).toBe('valid')
      if (typeof input.after === 'string') {
        await options.loadFromServer()
        options.value = input.after
        expect(options.selectedRows.map(row => options.getPkKey(row))).toEqual(['pk1', 'pk2'])
        expect(options.value).toBe(input.after)
      }
    } finally { dataSet.destroy() }
  })

  it('keeps ordinary delimited strings as scalar values and does not split them by appearance', async () => {
    const { dataSet, target, contexts } = await fixture({ rows: [{ id: 1, country: 'X,Y', province: false, city: 'A|B' }],
      options: [{ id: 'A|B', caption: 'one complete value' }] })
    try {
      target.updateEditingValue(1, 'country', 'C,D')
      await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address()).valueStatus).toBe('valid'))
      expect(contexts).toEqual([{ countryId: 'C,D', provinceId: false }])
      expect(target.getEditingRow(1)?.['city']).toBe('A|B')
    } finally { dataSet.destroy() }
  })

  it('uses the option view single-selection and composite valueField format', async () => {
    const { dataSet, target, options } = await fixture({ format: 'selection-string', delimiter: '', valueField: ['code', 'id'],
      rows: [{ id: 1, country: 'A', province: 0, city: '01:pk1' }],
      options: [{ id: 'pk1', code: '01', caption: 'one' }], policy: { mode: 'retain-valid', clearValue: '' } })
    try {
      target.updateEditingValue(1, 'country', 'B')
      await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address()).valueStatus).toBe('valid'))
      expect(target.getEditingRow(1)?.['city']).toBe('01:pk1')
      await options.loadFromServer()
      options.value = '01:pk1'
      expect(options.value).toBe('01:pk1')
    } finally { dataSet.destroy() }
  })

  it('rejects old rowMode and missing explicit formats instead of guessing how a string is stored', async () => {
    const { dataSet } = await fixture()
    try {
      const snapshot = dataSet.toJson()
      const cascade = snapshot.viewCascades?.[0]
      expect(() => DataSet.fromJson({ ...snapshot, viewCascades: [{ ...cascade, rowMode: 'editing-row' }] })).toThrow('rowMode')
      expect(() => DataSet.fromJson({ ...snapshot, viewCascades: [{ ...cascade, valueFormat: undefined }] })).toThrow('valueFormat')
      const obsoleteAddress = { ...address(), rowId: 1 }
      expect(() => dataSet.getFieldCascadeState(obsoleteAddress)).toThrow('FIELD_CASCADE_ADDRESS')
    } finally { dataSet.destroy() }
  })

  it('uses both bound input values and clears an invalid target only after complete options', async () => {
    const { dataSet, target, options, contexts } = await fixture()

    target.updateEditingValue(1, 'country', 'B')
    await vi.waitFor(() => expect(dataSet.getFieldCascadeState({ tableName: 'Orders', viewId: 'edit',
      field: 'city' })).toMatchObject({ status: 'ready', valueStatus: 'empty' }))
    expect(contexts).toEqual([{ countryId: 'B', provinceId: 0 }])
    expect(target.getEditingPatch(1)).toEqual({ country: 'B', city: null })
    expect(target.rows[0]?.['city']).toBe('OLD')
    expect(options.rows).toEqual([])
    dataSet.destroy()
  })

  it('loads explicit options without writing and preserves them across unrelated edits', async () => {
    const { dataSet, target, contexts } = await fixture({ policy: { mode: 'clear', clearValue: null } })
    const states: string[] = []
    const off = dataSet.onFieldCascadeChange((_address, state) => states.push(state.status))
    expect(await dataSet.refreshFieldCascade(address())).toMatchObject({ status: 'ready', valueStatus: 'invalid',
      options: [{ id: 'NEW', caption: 'New City' }] })
    expect(target.getEditingPatch(1)).toBeUndefined()
    const snapshot = dataSet.getFieldCascadeState(address())
    expect(Reflect.set(snapshot.options[0] ?? {}, 'id', 'FORGED')).toBe(false)
    expect(dataSet.getFieldCascadeState(address()).options[0]?.['id']).toBe('NEW')
    target.updateEditingValue(1, 'unrelated', 'x')
    expect(dataSet.getFieldCascadeState(address()).status).toBe('ready')
    expect(contexts).toHaveLength(1)
    expect(states).toEqual(['loading', 'ready'])
    off()
    dataSet.destroy()
  })

  it('updates ready value status after manual selection and cancellation without another query', async () => {
    const { dataSet, target, contexts } = await fixture({ policy: { mode: 'retain' } })
    const addresses: Array<{ tableName: string; viewId: string; field: string }> = []
    const off = dataSet.onFieldCascadeChange(changedAddress => { addresses.push(changedAddress) })
    await dataSet.refreshFieldCascade(address())
    expect(dataSet.getFieldCascadeState(address()).valueStatus).toBe('invalid')
    target.updateEditingValue(1, 'city', 'NEW')
    expect(dataSet.getFieldCascadeState(address()).valueStatus).toBe('valid')
    expect(Reflect.set(addresses[0] ?? {}, 'field', 'forged')).toBe(false)
    expect(dataSet.getFieldCascadeState(address()).options[0]?.['id']).toBe('NEW')
    target.discardEditingRows([1])
    expect(dataSet.getFieldCascadeState(address())).toMatchObject({ status: 'idle', valueStatus: 'unverified', options: [] })
    expect(contexts).toHaveLength(1)
    off()
    dataSet.destroy()
  })

  it('does not inspect a hidden target value or return old ready options after row invalidation', async () => {
    const hidden = await fixture({ access: { hidden: 'city' } })
    hidden.target.updateEditingValue(1, 'country', 'B')
    await vi.waitFor(() => expect(hidden.dataSet.getFieldCascadeState(address()).status).toBe('error'))
    expect(hidden.dataSet.getFieldCascadeState(address()).error).toMatch(/DATA_VIEW_VALUE_READ.*city/)
    expect(hidden.contexts).toHaveLength(0)
    hidden.dataSet.destroy()

    const normal = await fixture()
    await normal.dataSet.refreshFieldCascade(address())
    normal.target.clearAll()
    expect(normal.dataSet.getFieldCascadeState(address()).status).toBe('idle')
    expect(normal.dataSet.getFieldCascadeState(address()).options).toEqual([])
    normal.dataSet.destroy()
  })

  it('retains explicit null, zero, false and empty parent values without guessing defaults', async () => {
    const { dataSet, target, contexts } = await fixture({ rows: [
      { id: 1, country: null, province: false, city: null },
    ], policy: { mode: 'retain' } })
    expect(await dataSet.refreshFieldCascade(address())).toMatchObject({ status: 'ready', valueStatus: 'empty' })
    target.updateEditingValue(1, 'country', '')
    await vi.waitFor(() => expect(contexts).toHaveLength(2))
    expect(contexts).toEqual([{ countryId: null, provinceId: false }, { countryId: '', provinceId: false }])
    expect(target.getEditingPatch(1)).toEqual({ country: '' })
    dataSet.destroy()
  })

  it('does not query or clear when a parent is unreadable, and reports denied target writes', async () => {
    const hidden = await fixture({ access: { hidden: 'country' } })
    hidden.target.updateEditingValue(1, 'province', 2)
    await vi.waitFor(() => expect(hidden.dataSet.getFieldCascadeState(address()).status).toBe('error'))
    expect(hidden.dataSet.getFieldCascadeState(address()).error).toMatch(/DATA_VIEW_VALUE_READ.*country/)
    expect(hidden.contexts).toHaveLength(0)
    expect(hidden.target.getEditingPatch(1)).toEqual({ province: 2 })
    hidden.dataSet.destroy()

    const denied = await fixture({ access: { targetWritable: false } })
    denied.target.updateEditingValue(1, 'country', 'B')
    await vi.waitFor(() => expect(denied.dataSet.getFieldCascadeState(address()).status).toBe('error'))
    expect(denied.dataSet.getFieldCascadeState(address()).error).toMatch(/目标字段不可写/)
    expect(denied.target.getEditingPatch(1)).toEqual({ country: 'B' })
    denied.dataSet.destroy()
  })

  it('does not query again for equal inputs or write to a different target pointer', async () => {
    const { dataSet, target, contexts, setOptionQuery } = await fixture({ rows: [
      { id: 1, country: 'A', province: 0, city: 'OLD' },
      { id: 2, country: 'B', province: 0, city: 'USER' },
    ] })
    let release: ((value: ReturnType<typeof result>) => void) | undefined
    setOptionQuery(async () => new Promise(resolve => { release = resolve }))
    target.updateEditingValue(1, 'country', 'B')
    target.setCurrentRowById(2)
    expect(contexts).toHaveLength(1)
    target.updateEditingValue(1, 'country', 'INACTIVE')
    expect(contexts).toHaveLength(1)
    release?.(result('Cities', [{ id: 'NEW', caption: 'New City' }]))
    await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address()).status).toBe('ready'))
    expect(target.getEditingPatch(1)).toEqual({ country: 'INACTIVE' })
    expect(target.getEditingPatch(2)).toBeUndefined()
    dataSet.destroy()
  })

  it('does not let late options overwrite a newer parent or user-entered target', async () => {
    const { dataSet, target, setOptionQuery } = await fixture()
    const pending: Array<(value: ReturnType<typeof result>) => void> = []
    setOptionQuery(async () => new Promise(resolve => { pending.push(resolve) }))
    target.updateEditingValue(1, 'country', 'B')
    target.updateEditingValue(1, 'country', 'C')
    pending[0]?.(result('Cities', [{ id: 'OLD', caption: 'Old City' }]))
    await Promise.resolve()
    expect(dataSet.getFieldCascadeState(address()).status).toBe('loading')
    target.updateEditingValue(1, 'city', 'USER')
    pending[1]?.(result('Cities', [{ id: 'NEW', caption: 'New City' }]))
    await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address()).status).toBe('ready'))
    expect(dataSet.getFieldCascadeState(address()).valueStatus).toBe('invalid')
    expect(target.getEditingPatch(1)).toEqual({ country: 'C', city: 'USER' })
    dataSet.destroy()
  })

  it('invalidates pending options on edit cancellation and preserves the original value on query failure', async () => {
    const { dataSet, target, setOptionQuery } = await fixture()
    let release: ((value: ReturnType<typeof result>) => void) | undefined
    setOptionQuery(async () => new Promise(resolve => { release = resolve }))
    target.updateEditingValue(1, 'country', 'B')
    target.discardEditingRows([1])
    expect(dataSet.getFieldCascadeState(address()).status).toBe('idle')
    release?.(result('Cities', [{ id: 'NEW', caption: 'New City' }]))
    await Promise.resolve()
    expect(target.getEditingPatch(1)).toBeUndefined()
    setOptionQuery(async () => { throw new Error('option failure') })
    target.updateEditingValue(1, 'country', 'C')
    await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address()).status).toBe('error'))
    expect(dataSet.getFieldCascadeState(address()).error).toMatch(/option failure/)
    expect(target.getEditingPatch(1)).toEqual({ country: 'C' })
    dataSet.destroy()
  })

  it('queries when moving the pointer changes the bound values, without row endpoints', async () => {
    const { dataSet, target, contexts } = await fixture({ rows: [
      { id: 1, country: 'A', province: 0, city: 'OLD' },
      { id: 2, country: 'A', province: 0, city: 'NEW' },
      { id: 3, country: 'B', province: 0, city: 'OLD' },
    ] })
    await dataSet.refreshFieldCascade(address())
    target.setCurrentRowById(2)
    expect(contexts).toHaveLength(1)
    expect(dataSet.getFieldCascadeState(address()).valueStatus).toBe('valid')
    target.setCurrentRowById(3)
    await vi.waitFor(() => expect(target.getEditingPatch(3)).toEqual({ city: null }))
    expect(contexts).toEqual([{ countryId: 'A', provinceId: 0 }, { countryId: 'B', provinceId: 0 }])
    expect(dataSet.toJson().viewCascades).not.toEqual(expect.arrayContaining([expect.objectContaining({ rowMode: expect.anything() })]))
    dataSet.destroy()
  })

  it('refreshes options when a previously bound input becomes unavailable and returns', async () => {
    const { dataSet, target, contexts } = await fixture({ policy: { mode: 'retain' } })
    try {
      await dataSet.refreshFieldCascade(address())
      target.setCurrentRow(null)
      expect(dataSet.getFieldCascadeState(address()).status).toBe('idle')
      target.setCurrentRowById(1)
      await vi.waitFor(() => expect(contexts).toHaveLength(2))
      await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address()).status).toBe('ready'))
      expect(target.getEditingPatch(1)).toBeUndefined()
    } finally { dataSet.destroy() }
  })

  it('invalidates a legal zero-patch query-backed cancellation but ignores an empty row selection', async () => {
    const { dataSet, target, setOptionQuery } = await fixture({ policy: { mode: 'clear', clearValue: null } })
    const pending: Array<(value: ReturnType<typeof result>) => void> = []
    setOptionQuery(async () => new Promise(resolve => { pending.push(resolve) }))
    target.updateEditingValue(1, 'country', 'B')
    target.updateEditingValue(1, 'country', 'A')
    expect(target.getEditingPatch(1)).toBeUndefined()
    expect(target.discardPendingChanges([1])).toBe(0)
    pending[1]?.(result('Cities', [{ id: 'NEW', caption: 'New City' }]))
    await new Promise<void>(resolve => { setTimeout(resolve, 0) })
    expect(dataSet.getFieldCascadeState(address()).status).toBe('idle')
    expect(target.getEditingPatch(1)).toBeUndefined()

    target.updateEditingValue(1, 'country', 'B')
    expect(target.discardEditingRows([])).toBe(0)
    pending[2]?.(result('Cities', [{ id: 'NEW', caption: 'New City' }]))
    await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address()).status).toBe('ready'))
    expect(target.getEditingPatch(1)).toEqual({ country: 'B', city: null })
    dataSet.destroy()
  })

  it('propagates a configured chain and preserves state subscribers across definition rebuilds', async () => {
    const { dataSet, target, contexts } = await fixture()
    const changed: string[] = []
    const off = dataSet.onFieldCascadeChange((changedAddress, state) => {
      if (state.status === 'ready') changed.push(changedAddress.field)
    })
    dataSet.addCascade({ kind: 'field', cascadeId: 'province-by-country', tableName: 'Orders', viewId: 'edit',
      valueFormat: 'native', targetField: 'province', parents: [{ tableName: 'Orders', viewId: 'edit', field: 'country', parameter: 'countryId' }],
      optionsView: { tableName: 'Cities', viewId: 'choices',  },
      valuePolicy: { mode: 'retain-valid', clearValue: null } })
    target.updateEditingValue(1, 'country', 'B')
    await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address()).status).toBe('ready'))
    await vi.waitFor(() => expect(changed).toContain('province'))
    expect(target.getEditingPatch(1)).toEqual({ country: 'B', province: null, city: null })
    expect(contexts).toContainEqual({ countryId: 'B', provinceId: null })
    expect(changed).toContain('city')
    off()
    dataSet.destroy()
  })

  it('rejects duplicate targets and parent cycles before changing definitions', async () => {
    const { dataSet } = await fixture()
    const before = dataSet.toJson().viewCascades
    expect(() => dataSet.addCascade({ kind: 'field', cascadeId: 'second-city', tableName: 'Orders', viewId: 'edit',
      valueFormat: 'native', targetField: 'city', parents: [{ tableName: 'Orders', viewId: 'edit', field: 'country', parameter: 'countryId' }],
      optionsView: { tableName: 'Cities', viewId: 'choices',  },
      valuePolicy: { mode: 'retain' } })).toThrow('FIELD_CASCADE_DUPLICATE')
    expect(() => dataSet.addCascade({ kind: 'field', cascadeId: 'country-by-city', tableName: 'Orders', viewId: 'edit',
      valueFormat: 'native', targetField: 'country', parents: [{ tableName: 'Orders', viewId: 'edit', field: 'city', parameter: 'cityId' }],
      optionsView: { tableName: 'Cities', viewId: 'choices',  },
      valuePolicy: { mode: 'retain' } })).toThrow('FIELD_CASCADE_CYCLE')
    expect(dataSet.toJson().viewCascades).toEqual(before)
    dataSet.destroy()
  })

  it('keeps subscriptions across replacement and releases its temporary normalized DataSet', async () => {
    const { dataSet, target } = await fixture()
    const previous = target
    const snapshot = dataSet.toJson()
    const observed: string[] = []
    const off = dataSet.onFieldCascadeChange((_address, state) => observed.push(state.status))
    const destroyed: DataSet[] = []
    const originalDestroy = DataSet.prototype.destroy
    const spy = vi.spyOn(DataSet.prototype, 'destroy').mockImplementation(function (this: DataSet) {
      destroyed.push(this)
      originalDestroy.call(this)
    })
    try {
      dataSet.replaceFromJson(snapshot)
      expect(previous.destroyed).toBe(true)
      expect(destroyed.some(candidate => candidate !== dataSet && candidate.destroyed)).toBe(true)
      const next = dataSet.getView('Orders', 'edit')!
      const options = dataSet.getView('Cities', 'choices')!
      next.bindQueryExecutor({ executeQuery: async () => result('Orders', [
        { id: 1, country: 'A', province: 0, city: 'OLD' },
      ]) })
      options.bindQueryExecutor({ executeQuery: async () => result('Cities', [{ id: 'NEW', caption: 'New City' }]) })
      await next.loadFromServer()
      next.updateEditingValue(1, 'country', 'B')
      await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address()).status).toBe('ready'))
      expect(observed).toContain('ready')
    } finally {
      off()
      dataSet.destroy()
      spy.mockRestore()
    }
  })
})
