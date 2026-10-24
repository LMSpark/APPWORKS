import {describe, expect, it} from 'vitest'
import {DictionarySchema} from './dictionary-schema'
import {DictionaryHttp, fixture, initialDefinition, initialEntry} from './tests/dictionary-workspace.fixture'

describe('Dictionary resource through formal DataViews', () => {
  it('opens and saves a readable selected dictionary from another application without changing its AppId', async () => {
    const http = new DictionaryHttp()
    http.records['_Base_DictType']![0]!['AppId'] = 'OTHER-APP'
    const {workspace, dataSet} = fixture(http)
    try {
      await workspace.load()
      expect(workspace.definition.rows).toHaveLength(1)
      expect(workspace.definition.rows[0]?.['AppId']).toBe('OTHER-APP')
      workspace.definition.updateEditingValue('D1', 'TypeName', '跨应用可读字典')
      await workspace.saveDesign()
      expect(http.records['_Base_DictType']![0]).toMatchObject({rowid: 'D1', AppId: 'OTHER-APP', TypeName: '跨应用可读字典'})
      const payload = http.saves[0]!.data as Array<{TableName: string; CrudModel: {Changed: Array<Record<string, unknown>>}}>
      expect(payload).toHaveLength(1)
      expect(payload[0]!.TableName).toBe('_Base_DictType')
      expect(payload[0]!.CrudModel.Changed[0]).toMatchObject({rowid: 'D1', TypeName: '跨应用可读字典'})
      expect(payload[0]!.CrudModel.Changed[0]).not.toHaveProperty('AppId')
    } finally {dataSet.destroy()}
  })

  it('initializes creation time once for a new dictionary definition through its native DataView', async () => {
    const http = new DictionaryHttp()
    http.records['_Base_DictType'] = []
    http.records['_Base_DictData'] = []
    const {workspace, dataSet} = fixture(http, true)
    try {
      await workspace.load()
      const created = workspace.definition.getEditingRow('D1')
      const createdAt = created?.['crttime']
      expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
      expect(created?.['AppId']).toBe('')
      workspace.definition.updateEditingValue('D1', 'AppId', 'APP')
      workspace.definition.updateEditingValue('D1', 'TypeName', '新字典')
      workspace.definition.updateEditingValue('D1', 'functiondesc', '正式新增时间合同')
      await workspace.saveDesign()
      expect(workspace.definition.getEditingRow('D1')?.['crttime']).toBe(createdAt)
      const payload = http.saves[0]!.data as Array<{TableName: string; CrudModel: {Added: Array<Record<string, unknown>>}}>
      expect(payload[0]!.TableName).toBe('_Base_DictType')
      expect(payload[0]!.CrudModel.Added[0]?.['crttime']).toBe(createdAt)
    } finally {dataSet.destroy()}
  })

  it('requires an application selection before saving a new definition and preserves creation time', async () => {
    const http = new DictionaryHttp()
    http.records['_Base_DictType'] = []
    http.records['_Base_DictData'] = []
    const {workspace, dataSet} = fixture(http, true)
    try {
      await workspace.load()
      const createdAt = workspace.definition.getEditingRow('D1')?.['crttime']
      workspace.definition.updateEditingValue('D1', 'TypeName', '缺少应用')
      workspace.definition.updateEditingValue('D1', 'functiondesc', '必须先选择应用')
      await expect(workspace.saveDesign()).rejects.toThrow('新建字典必须选择所属应用')
      expect(http.saves).toHaveLength(0)
      workspace.definition.updateEditingValue('D1', 'AppId', 'APP-SELECTED')
      await workspace.saveDesign()
      expect(http.records['_Base_DictType']![0]).toMatchObject({rowid: 'D1', AppId: 'APP-SELECTED', crttime: createdAt})
    } finally {dataSet.destroy()}
  })

  it('rejects changing AppId on an existing definition without submitting a reassignment', async () => {
    const {workspace, dataSet, http} = fixture()
    try {
      await workspace.load()
      workspace.definition.updateEditingValue('D1', 'AppId', 'OTHER-APP')
      await expect(workspace.saveDesign()).rejects.toThrow('字典所属应用不可修改')
      expect(http.saves).toHaveLength(0)
      expect(http.records['_Base_DictType']![0]?.['AppId']).toBe('APP')
    } finally {dataSet.destroy()}
  })

  it.each(['', null])('preserves a historical AppId value %j while saving other fields on an existing definition', async appId => {
    const http = new DictionaryHttp()
    http.records['_Base_DictType']![0]!['AppId'] = appId
    const {workspace, dataSet} = fixture(http)
    try {
      await workspace.load()
      workspace.definition.updateEditingValue('D1', 'TypeName', '共享字典')
      await workspace.saveDesign()
      expect(http.records['_Base_DictType']![0]).toMatchObject({rowid: 'D1', AppId: appId, TypeName: '共享字典'})
      const payload = http.saves[0]!.data as Array<{CrudModel: {Changed: Array<Record<string, unknown>>}}>
      expect(payload[0]!.CrudModel.Changed[0]).not.toHaveProperty('AppId')
    } finally {dataSet.destroy()}
  })

  it('requires AppId to remain formally readable on an existing definition', async () => {
    const {workspace, dataSet, http} = fixture()
    http.hidden = ['AppId']
    try {
      await expect(workspace.load()).rejects.toThrow('字典所属应用不可读或缺少正式字段')
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })

  it('keeps a new entry creation time stable and out of the sort-only existing-row patch', async () => {
    const http = new DictionaryHttp()
    http.records['_Base_DictData']![0]!['ordIdx'] = 5
    const {workspace, dataSet} = fixture(http)
    try {
      await workspace.load()
      await workspace.addEntry()
      const createdId = workspace.entries.getPkKey(workspace.entries.currentRow!)!
      const createdAt = workspace.entries.getEditingRow(createdId)?.['crttime']
      expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
      workspace.entries.updateEditingValue(createdId, 'val', 'new')
      workspace.entries.updateEditingValue(createdId, 'txt', '新条目')
      expect(workspace.canApplyDisplayedOrder).toBe(true)
      await workspace.applyDisplayedOrder()
      expect(workspace.entries.getEditingRow(createdId)?.['crttime']).toBe(createdAt)
      await workspace.saveData()
      expect(workspace.entries.getEditingRow(createdId)?.['crttime']).toBe(createdAt)
      const payload = http.saves[0]!.data as Array<{TableName: string; CrudModel: {
        Added: Array<Record<string, unknown>>; Changed: Array<Record<string, unknown>>
      }}>
      expect(payload[0]!.TableName).toBe('_Base_DictData')
      expect(payload[0]!.CrudModel.Added[0]?.['crttime']).toBe(createdAt)
      expect(payload[0]!.CrudModel.Changed.map(row => Object.fromEntries(Object.entries(row)
        .filter(([field]) => !field.startsWith('lingma_sys_'))))).toEqual([{rowid: 'E1', ordIdx: 1}])
    } finally {dataSet.destroy()}
  })

  it('applies only the displayed order through entry edits and persists the default query order', async () => {
    const http = new DictionaryHttp()
    http.records['_Base_DictData'] = [
      {...initialEntry, rowid: 'C', ordIdx: 1, val: 'C'},
      {...initialEntry, rowid: 'A', ordIdx: 2, val: 'A'},
      {...initialEntry, rowid: 'B', ordIdx: 3, val: 'B'},
    ]
    const {workspace, dataSet} = fixture(http)
    let destroyed = false
    try {
      await workspace.load()
      expect(workspace.entries.rows.map(row => row['rowid'])).toEqual(['C', 'A', 'B'])
      await workspace.entries.setSort([{field: 'val', direction: 'asc'}])
      expect(workspace.entries.rows.map(row => row['rowid'])).toEqual(['A', 'B', 'C'])
      const readsBeforeApply = http.reads.length

      expect(workspace.canApplyDisplayedOrder).toBe(true)
      await workspace.applyDisplayedOrder()

      expect(http.reads).toHaveLength(readsBeforeApply)
      expect(http.saves).toHaveLength(0)
      expect(workspace.entries.rows.map(row => workspace.entries.getEditingRow(workspace.entries.getPkKey(row)!)?.['ordIdx'])).toEqual([1, 2, 3])
      expect(workspace.entries.rows.map(row => workspace.entries.getEditingRow(workspace.entries.getPkKey(row)!)?.['val'])).toEqual(['A', 'B', 'C'])
      await workspace.applyDisplayedOrder()
      expect(http.saves).toHaveLength(0)
      await workspace.saveData()
      expect(http.saves).toHaveLength(1)
      const submitted = http.saves[0]!.data as Array<{TableName: string; CrudModel: {Changed: Array<Record<string, unknown>>}}>
      expect(submitted).toHaveLength(1)
      expect(submitted[0]!.TableName).toBe('_Base_DictData')
      expect(submitted[0]!.CrudModel.Changed.map(row => Object.fromEntries(Object.entries(row)
        .filter(([field]) => !field.startsWith('lingma_sys_'))))).toEqual([
        {rowid: 'A', ordIdx: 1}, {rowid: 'B', ordIdx: 2}, {rowid: 'C', ordIdx: 3},
      ])
      expect(http.saves[0]!.data).toHaveLength(1)

      dataSet.destroy()
      destroyed = true
      const reopened = fixture(http)
      await reopened.workspace.load()
      expect(reopened.workspace.entries.rows.map(row => row['rowid'])).toEqual(['A', 'B', 'C'])
      reopened.dataSet.destroy()
    } finally { if (!destroyed) dataSet.destroy() }
  })

  it.each(['denied', 'hidden'] as const)('rejects displayed-order preflight when ordIdx is %s without changing any overlay or issuing a write', async protection => {
    const {workspace, dataSet, http} = fixture()
    http[protection] = ['ordIdx']
    try {
      await workspace.load()
      workspace.entries.updateEditingValue('E1', 'exVal_4', '已有草稿')
      const before = workspace.entries.getEditingRow('E1')
      expect(workspace.canApplyDisplayedOrder).toBe(false)
      await expect(Promise.resolve().then(() => workspace.applyDisplayedOrder())).rejects.toThrow()
      expect(workspace.entries.getEditingRow('E1')).toEqual(before)
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })

  it('preflights every displayed row before writing when only the later row is denied', async () => {
    const http = new DictionaryHttp()
    http.records['_Base_DictData'] = [
      {...initialEntry, rowid: 'A', ordIdx: 10, val: 'A'},
      {...initialEntry, rowid: 'B', ordIdx: 20, val: 'B'},
      {...initialEntry, rowid: 'C', ordIdx: 30, val: 'C'},
    ]
    http.deniedByRow.C = ['ordIdx']
    const {workspace, dataSet} = fixture(http)
    try {
      await workspace.load()
      expect(workspace.entries.fieldAccess(workspace.entries.rows[0]!, 'ordIdx').write).toBe('allowed')
      expect(workspace.entries.fieldAccess(workspace.entries.rows.at(-1)!, 'ordIdx').write).toBe('denied')
      const before = workspace.entries.rows.map(row => workspace.entries.getEditingRow(workspace.entries.getPkKey(row)!)?.['ordIdx'])
      expect(before).toEqual([10, 20, 30])
      expect(workspace.canApplyDisplayedOrder).toBe(false)
      await expect(Promise.resolve().then(() => workspace.applyDisplayedOrder())).rejects.toThrow()
      expect(workspace.entries.rows.map(row => workspace.entries.getEditingRow(workspace.entries.getPkKey(row)!)?.['ordIdx'])).toEqual(before)
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })

  it('reports no displayed-order command for an empty loaded collection', async () => {
    const http = new DictionaryHttp()
    http.records['_Base_DictData'] = []
    const {workspace, dataSet} = fixture(http)
    try {
      await workspace.load()
      const readsBefore = http.reads.length
      expect(workspace.entries.rows).toEqual([])
      expect(workspace.canApplyDisplayedOrder).toBe(false)
      await workspace.applyDisplayedOrder()
      expect(http.reads).toHaveLength(readsBefore)
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })

  it('ranks only loaded displayed IDs when the formal result reports unloaded rows', async () => {
    const http = new DictionaryHttp()
    http.records['_Base_DictData'] = [
      {...initialEntry, rowid: 'C', ordIdx: 10, val: 'C'},
      {...initialEntry, rowid: 'A', ordIdx: 20, val: 'A'},
      {...initialEntry, rowid: 'B', ordIdx: 30, val: 'B'},
    ]
    http.responseLimit = 2
    const {workspace, dataSet} = fixture(http)
    try {
      workspace.entries.queryConfig = {...workspace.entries.queryConfig, allPages: false}
      await workspace.load()
      expect(workspace.entries.rows.map(row => row['rowid'])).toEqual(['C', 'A'])
      expect(workspace.entries.total).toBe(3)
      expect(workspace.entries.rows.map(row => row['ordIdx'])).toEqual([10, 20])
      const readsBefore = http.reads.length
      expect(workspace.canApplyDisplayedOrder).toBe(true)
      await workspace.applyDisplayedOrder()
      expect(http.reads).toHaveLength(readsBefore)
      expect(workspace.entries.rows.map(row => workspace.entries.getEditingRow(workspace.entries.getPkKey(row)!)?.['ordIdx']))
        .toEqual([1, 2])
      expect(workspace.entries.getEditingRow('B')).toBeNull()
      expect(http.records['_Base_DictData']!.find(row => row['rowid'] === 'B')?.['ordIdx']).toBe(30)
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })

  it('keeps an unrelated edit and a stable pending create in the same native DataView batch', async () => {
    const http = new DictionaryHttp()
    http.records['_Base_DictData']![0]!['ordIdx'] = 7
    const {workspace, dataSet} = fixture(http)
    try {
      await workspace.load()
      workspace.entries.updateEditingValue('E1', 'exVal_4', '保留的无关草稿')
      await workspace.addEntry()
      const createdId = workspace.entries.getPkKey(workspace.entries.currentRow!)!
      const createdRow = workspace.entries.getEditingRow(createdId)
      workspace.entries.updateEditingValue(createdId, 'val', 'new')
      workspace.entries.updateEditingValue(createdId, 'txt', '新条目')
      expect(workspace.canApplyDisplayedOrder).toBe(true)
      await workspace.applyDisplayedOrder()
      await workspace.applyDisplayedOrder()
      expect(workspace.entries.getPkKey(workspace.entries.currentRow!)).toBe(createdId)
      expect(workspace.entries.getEditingRow(createdId)).toMatchObject({ordIdx: 2})
      expect(workspace.entries.getEditingRow('E1')).toMatchObject({exVal_4: '保留的无关草稿', ordIdx: 1})
      expect(createdRow?.['rowid']).toBe(createdId)
      expect(http.saves).toHaveLength(0)
      await workspace.saveData()
      expect(http.saves).toHaveLength(1)
      expect(http.saves[0]!.data).toHaveLength(1)
      expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {
        Added: [expect.objectContaining({ordIdx: 2})],
        Changed: [{rowid: 'E1', exVal_4: '保留的无关草稿', ordIdx: 1}],
      }}])
    } finally {dataSet.destroy()}
  })

  it('cancels displayed-order overlays by rereading the original entry values', async () => {
    const http = new DictionaryHttp()
    http.records['_Base_DictData'] = [
      {...initialEntry, rowid: 'C', ordIdx: 1, val: 'C'},
      {...initialEntry, rowid: 'A', ordIdx: 2, val: 'A'},
      {...initialEntry, rowid: 'B', ordIdx: 3, val: 'B'},
    ]
    const {workspace, dataSet} = fixture(http)
    try {
      await workspace.load()
      await workspace.entries.setSort([{field: 'val', direction: 'asc'}])
      expect(workspace.canApplyDisplayedOrder).toBe(true)
      await workspace.applyDisplayedOrder()
      await workspace.load(true)
      expect(Object.fromEntries(workspace.entries.rows.map(row => [row['rowid'], row['ordIdx']]))).toEqual({A: 2, B: 3, C: 1})
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })

  it('rejects declared ordIdx bounds before writing any displayed-order overlay', async () => {
    const http = new DictionaryHttp()
    http.records['_Base_DictData'] = [
      {...initialEntry, rowid: 'A', ordIdx: 10, val: 'A'},
      {...initialEntry, rowid: 'B', ordIdx: 20, val: 'B'},
      {...initialEntry, rowid: 'C', ordIdx: 30, val: 'C'},
    ]
    const {workspace, dataSet} = fixture(http, false, 'SCENE', [], {max: 2})
    try {
      await workspace.load()
      const before = workspace.entries.rows.map(row => workspace.entries.getEditingRow(workspace.entries.getPkKey(row)!)?.['ordIdx'])
      expect(before).toEqual([10, 20, 30])
      expect(workspace.canApplyDisplayedOrder).toBe(false)
      await expect(Promise.resolve().then(() => workspace.applyDisplayedOrder())).rejects.toThrow()
      expect(workspace.entries.rows.map(row => workspace.entries.getEditingRow(workspace.entries.getPkKey(row)!)?.['ordIdx'])).toEqual(before)
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })

  it('rejects a failed or wrong-scope query result before displayed-order edits', async () => {
    const failed = fixture()
    failed.http.failReads = true
    try {
      await expect(failed.workspace.load()).rejects.toThrow('读取失败')
      const failedReads = failed.http.reads.length
      expect(failed.workspace.canApplyDisplayedOrder).toBe(false)
      await expect(Promise.resolve().then(() => failed.workspace.applyDisplayedOrder())).rejects.toThrow()
      expect(failed.http.reads).toHaveLength(failedReads)
      expect(failed.http.saves).toHaveLength(0)
    } finally {failed.dataSet.destroy()}

    const wrongScope = fixture()
    wrongScope.http.records['_Base_DictData']![0]!['typeid'] = 'OTHER'
    try {
      await expect(wrongScope.workspace.load()).rejects.toThrow('归属')
      expect(wrongScope.workspace.canApplyDisplayedOrder).toBe(false)
      await expect(Promise.resolve().then(() => wrongScope.workspace.applyDisplayedOrder())).rejects.toThrow()
      expect(wrongScope.http.saves).toHaveLength(0)
    } finally {wrongScope.dataSet.destroy()}
  })

  it('rejects when the native DataView query scope no longer matches its accepted result', async () => {
    const {workspace, dataSet, http} = fixture()
    try {
      await workspace.load()
      http.scopeToken = 'next-scope'
      expect(workspace.canApplyDisplayedOrder).toBe(false)
      await expect(Promise.resolve().then(() => workspace.applyDisplayedOrder())).rejects.toThrow()
      expect(workspace.entries.getEditingPatch('E1')).toBeUndefined()
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })

  it('rejects displayed-order execution while the query is loading', async () => {
    const {workspace, dataSet, http} = fixture()
    let release!: () => void, started!: () => void
    const waiting = new Promise<void>(resolve => {started = resolve})
    const gate = new Promise<void>(resolve => {release = resolve})
    http.beforeRead = async config => {
      if (config.url === '/api/DataOperation/GetData') {http.beforeRead = undefined; started(); await gate}
    }
    try {
      const loading = workspace.load()
      await waiting
      expect(workspace.canApplyDisplayedOrder).toBe(false)
      await expect(Promise.resolve().then(() => workspace.applyDisplayedOrder())).rejects.toThrow()
      expect(http.saves).toHaveLength(0)
      release()
      await loading
    } finally {dataSet.destroy()}
  })

  it('rejects displayed-order execution while the native save owner is busy', async () => {
    const {workspace, dataSet, http} = fixture()
    let release!: () => void, started!: () => void
    const waiting = new Promise<void>(resolve => {started = resolve})
    const gate = new Promise<void>(resolve => {release = resolve})
    http.afterResponse = async config => {
      if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
        http.afterResponse = undefined
        started()
        await gate
      }
    }
    try {
      await workspace.load()
      workspace.entries.updateEditingValue('E1', 'exVal_4', '待保存草稿')
      const saving = workspace.saveData()
      await waiting
      const before = workspace.entries.getEditingRow('E1')
      expect(workspace.canApplyDisplayedOrder).toBe(false)
      await expect(Promise.resolve().then(() => workspace.applyDisplayedOrder())).rejects.toThrow()
      expect(workspace.entries.getEditingRow('E1')).toEqual(before)
      expect(http.saves).toHaveLength(1)
      release()
      await saving
    } finally {dataSet.destroy()}
  })

  it('does not apply order or replay a write while a save receipt is unknown', async () => {
    const {workspace, dataSet, http} = fixture()
    try {
      await workspace.load()
      workspace.entries.updateEditingValue('E1', 'exVal_4', '原有草稿')
      http.failAfterWrite = true
      await expect(workspace.saveData()).rejects.toThrow()
      const before = workspace.entries.getEditingRow('E1')
      expect(workspace.requiresVerification).toBe(true)
      expect(workspace.canApplyDisplayedOrder).toBe(false)
      await expect(Promise.resolve().then(() => workspace.applyDisplayedOrder())).rejects.toThrow()
      await expect(workspace.saveData()).rejects.toThrow()
      expect(workspace.entries.getEditingRow('E1')).toEqual(before)
      expect(http.saves).toHaveLength(1)
    } finally {dataSet.destroy()}
  })

  it.each(['', '   '])('rejects a new design with empty description %j before writing and retains its input', async description => {
    const http = new DictionaryHttp()
    http.records = {_Base_DictType: [], _Base_DictData: []}
    const {workspace, dataSet} = fixture(http, true)
    try {
      await workspace.load()
      workspace.definition.updateEditingValue('D1', 'TypeName', '未描述设计')
      workspace.definition.updateEditingValue('D1', 'functiondesc', description)
      workspace.definition.updateEditingValue('D1', 'AppId', 'APP')
      await expect(workspace.saveDesign()).rejects.toThrow('功能描述')
      expect(http.saves).toHaveLength(0)
      expect(workspace.definition.getEditingRow('D1')?.['TypeName']).toBe('未描述设计')
      expect(workspace.pending).toBe(true)
    } finally {dataSet.destroy()}
  })
  it('rejects clearing an existing description but preserves an untouched historical empty one', async () => {
    const {workspace, dataSet, http} = fixture()
    try {
      await workspace.load()
      workspace.definition.updateEditingValue('D1', 'fiveValue', '新标题')
      await workspace.saveDesign()
      expect(http.records['_Base_DictType']![0]!['functiondesc']).toBe('')
      workspace.definition.updateEditingValue('D1', 'functiondesc', '可维护的说明')
      await workspace.saveDesign()
      workspace.definition.updateEditingValue('D1', 'functiondesc', '  ')
      await expect(workspace.saveDesign()).rejects.toThrow('功能描述')
      expect(http.saves).toHaveLength(2)
      expect(http.records['_Base_DictType']![0]!['functiondesc']).toBe('可维护的说明')
    } finally {dataSet.destroy()}
  })
  it.each((['hidden', 'masked', 'missing'] as const).flatMap(unavailable =>
    (['edit', 'add'] as const).map(operation => ({unavailable, operation}))))('rejects $operation when design encoding type is $unavailable and retains the draft', async ({unavailable, operation}) => {
    const {workspace, dataSet, http} = fixture()
    if (unavailable === 'missing') delete http.records['_Base_DictType']![0]!['dictionaryType']
    else http[unavailable] = ['dictionaryType']
    try {
      await workspace.load()
      if (operation === 'add') await workspace.addEntry()
      const id = operation === 'edit' ? 'E1' : workspace.entries.getPkKey(workspace.entries.currentRow!)!
      workspace.entries.updateEditingValue(id, 'val', '12')
      if (operation === 'add') workspace.entries.updateEditingValue(id, 'txt', '新条目')
      await expect(workspace.saveData()).rejects.toThrow(/编码类型.*不可读|编码类型.*缺失/)
      expect(http.saves).toHaveLength(0)
      expect(workspace.entries.getEditingRow(id)?.['val']).toBe('12')
      expect(workspace.pending).toBe(true)
    } finally {dataSet.destroy()}
  })
  it('does not require encoding type for an unrelated extension edit', async () => {
    const {workspace, dataSet, http} = fixture()
    http.hidden = ['dictionaryType']
    try {
      await workspace.load()
      workspace.entries.updateEditingValue('E1', 'exVal_4', '可独立维护')
      await workspace.saveData()
      expect(http.saves).toHaveLength(1)
      expect(http.records['_Base_DictData']![0]).toMatchObject({val: '00', exVal_4: '可独立维护'})
    } finally {dataSet.destroy()}
  })
  it('keeps all six output fields, including extensions without titles', async () => {
    const {workspace, dataSet} = fixture()
    await workspace.load()
    expect(DictionarySchema.fields.map(field => field.name)).toEqual(['val', 'txt', 'exVal_1', 'exVal_2', 'exVal_3', 'exVal_4'])
    expect(workspace.entries.rows[0]).toMatchObject(initialEntry)
    workspace.definition.updateEditingValue('D1', 'fiveValue', '')
    expect(workspace.fieldLabel('exVal_4')).toBe('第五文本')
    expect(workspace.entries.rows[0]!['exVal_4']).toBeNull()
    dataSet.destroy()
  })
  it('saves design first, then maintains data independently with titles from the saved design', async () => {
    const {workspace, dataSet, http} = fixture()
    await workspace.load()
    workspace.definition.updateEditingValue('D1', 'secondValue', 'HEX')
    await workspace.saveDesign()
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictType'}])
    expect(http.saves[0]!.data).toHaveLength(1)
    for (let i = 1; i <= 4; i++) workspace.entries.updateEditingValue('E1', `exVal_${i}`, `扩展${i}`)
    await workspace.saveData()
    expect(http.saves).toHaveLength(2)
    expect(http.saves[1]!.data).toMatchObject([{TableName: '_Base_DictData'}])
    expect(http.saves[1]!.data).toHaveLength(1)
    expect(workspace.pending).toBe(false)
    dataSet.destroy()
    const next = fixture(http)
    await next.workspace.load()
    expect(next.workspace.fieldLabel('exVal_1')).toBe('HEX')
    expect(next.workspace.entries.rows[0]).toMatchObject({val: '00', exVal_1: '扩展1', exVal_2: '扩展2', exVal_3: '扩展3', exVal_4: '扩展4'})
    next.dataSet.destroy()
  })
  it('uses original field permissions on extended fields before dispatch', async () => {
    const {workspace, http, dataSet} = fixture()
    http.denied = ['exVal_4']
    await workspace.load()
    expect(workspace.entries.fieldAccess(workspace.entries.rows[0]!, 'exVal_4').write).toBe('denied')
    workspace.entries.updateEditingValue('E1', 'exVal_4', '未授权')
    expect(workspace.pending).toBe(true)
    await expect(workspace.saveData()).rejects.toThrow()
    expect(http.saves).toHaveLength(0)
    dataSet.destroy()
  })
  it('never replays an uncertain write and rereads the actual six-field result', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load()
    workspace.entries.updateEditingValue('E1', 'exVal_4', '已写但回执丢失')
    http.failAfterWrite = true
    await expect(workspace.saveData()).rejects.toThrow()
    expect(workspace.requiresVerification).toBe(true)
    await expect(workspace.saveData()).rejects.toThrow()
    expect(http.saves).toHaveLength(1)
    await workspace.load(true)
    expect(workspace.entries.rows[0]!['exVal_4']).toBe('已写但回执丢失')
    expect(workspace.pending).toBe(false)
    dataSet.destroy()
  })
  it('does not let an ordinary discard-and-reload erase a partially applied original capture', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load()
    workspace.entries.updateEditingValue('E1', 'exVal_1', '新值一')
    workspace.entries.updateEditingValue('E1', 'exVal_2', '新值二')
    http.failAfterWrite = true
    http.afterWriteBeforeFailure = () => {http.records['_Base_DictData']![0]!['exVal_2'] = '基础'}
    await expect(workspace.saveData()).rejects.toThrow()
    expect(workspace.entries.hasUnconfirmedSave).toBe(true)
    http.failAfterWrite = false

    await expect(workspace.load(true)).rejects.toThrow(/部分生效|无法按主键核验/)

    expect(http.saves).toHaveLength(1)
    expect(workspace.entries.hasUnconfirmedSave).toBe(true)
    expect(workspace.entries.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(workspace.requiresVerification).toBe(true)
    expect(workspace.pending).toBe(true)
    expect(http.reads).toHaveLength(3)
    dataSet.destroy()
  })
  it('retains the unknown deletion batch when only the entry deletion reached the owner', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load()
    await workspace.removeDefinition()
    http.failAfterWrite = true
    http.afterWriteBeforeFailure = () => {http.records['_Base_DictType']!.push({...initialDefinition})}
    await expect(workspace.saveDesign()).rejects.toThrow()
    expect(workspace.definition.hasUnconfirmedSave).toBe(true)
    expect(workspace.entries.hasUnconfirmedSave).toBe(true)
    http.failAfterWrite = false

    await expect(workspace.load(true)).rejects.toThrow(/部分生效|无法按主键核验/)

    expect(http.saves).toHaveLength(1)
    expect(workspace.definition.hasUnconfirmedSave).toBe(true)
    expect(workspace.entries.hasUnconfirmedSave).toBe(true)
    expect(workspace.pending).toBe(true)
    expect(workspace.removed).toBe(false)
    expect(http.reads).toHaveLength(4)
    dataSet.destroy()
  })
  it('does not discard the original capture or draft when recovery verification reads fail', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load()
    workspace.entries.updateEditingValue('E1', 'exVal_4', '已写但回执丢失')
    http.failAfterWrite = true
    await expect(workspace.saveData()).rejects.toThrow()
    expect(workspace.entries.hasUnconfirmedSave).toBe(true)
    http.failAfterWrite = false
    http.failReads = true

    await expect(workspace.load(true)).rejects.toThrow('读取失败')

    expect(http.saves).toHaveLength(1)
    expect(workspace.entries.hasUnconfirmedSave).toBe(true)
    expect(workspace.entries.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(workspace.entries.rows[0]!['exVal_4']).toBe('已写但回执丢失')
    expect(workspace.requiresVerification).toBe(true)
    expect(workspace.pending).toBe(true)
    expect(http.reads).toHaveLength(3)
    dataSet.destroy()
  })
  it('preserves an edit made while the explicit reload is awaiting its first query', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load()
    workspace.entries.updateEditingValue('E1', 'exVal_4', '原草稿')
    await workspace.saveData()
    http.failAfterWrite = true
    workspace.entries.updateEditingValue('E1', 'exVal_4', '不确定草稿')
    await expect(workspace.saveData()).rejects.toThrow()
    http.failAfterWrite = false

    let entered!: () => void, release!: () => void
    const waiting = new Promise<void>(resolve => {entered = resolve})
    const gate = new Promise<void>(resolve => {release = resolve})
    let firstRead = true
    http.beforeRead = async config => {
      if (config.url === '/api/DataOperation/GetData' && firstRead) {firstRead = false; entered(); await gate}
    }
    const reload = workspace.load(true)
    await waiting
    workspace.entries.updateEditingValue('E1', 'exVal_3', '等待期间应用的新编辑')
    expect((await workspace.entries.applyEditingRows()).success).toBe(true)
    workspace.entries.updateEditingValue('E1', 'txt', '等待期间的新编辑')
    release()

    await expect(reload).rejects.toThrow('原提交已确认，仍有随后发生的编辑')

    expect(http.saves).toHaveLength(2)
    expect(workspace.entries.getEditingRow('E1')?.['txt']).toBe('等待期间的新编辑')
    expect(workspace.entries.rows[0]!['exVal_3']).toBe('等待期间应用的新编辑')
    expect(workspace.entries.hasEditingChanges()).toBe(true)
    expect(workspace.entries.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(workspace.entries.hasUnconfirmedSave).toBe(false)
    expect(http.reads).toHaveLength(5)
    dataSet.destroy()
  })
  it('keeps an authoritative not-applied draft until a separate explicit cancellation', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load()
    workspace.entries.updateEditingValue('E1', 'exVal_4', '尚未写入的草稿')
    http.failBeforeWrite = true
    await expect(workspace.saveData()).rejects.toThrow()
    expect(workspace.entries.hasUnconfirmedSave).toBe(true)
    http.failBeforeWrite = false

    await expect(workspace.load(true)).rejects.toThrow('原提交未生效')

    expect(http.saves).toHaveLength(1)
    expect(workspace.entries.hasUnconfirmedSave).toBe(false)
    expect(workspace.entries.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(workspace.entries.rows[0]!['exVal_4']).toBe('尚未写入的草稿')
    expect(workspace.requiresVerification).toBe(false)
    expect(workspace.pending).toBe(true)
    await workspace.load(true)
    expect(workspace.entries.rows[0]!['exVal_4']).toBeNull()
    expect(workspace.pending).toBe(false)
    expect(http.saves).toHaveLength(1)
    expect(http.reads).toHaveLength(5)
    dataSet.destroy()
  })
  it('keeps an explicit server rejection editable and allows a later deliberate retry', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load()
    workspace.entries.updateEditingValue('E1', 'exVal_4', '被拒后保留的草稿')
    http.rejectWrite = {code: 400, message: '字典条目业务拒绝'}

    await expect(workspace.saveData()).rejects.toThrow('字典条目业务拒绝')

    expect.soft(workspace.entries.hasUnconfirmedSave).toBe(false)
    expect.soft(workspace.requiresVerification).toBe(false)
    expect.soft(workspace.entries.getEditingRow('E1')?.['exVal_4']).toBe('被拒后保留的草稿')
    expect.soft(workspace.pending).toBe(true)
    expect.soft(http.saves).toHaveLength(1)
    http.rejectWrite = undefined

    await expect.soft(workspace.saveData()).resolves.toBeUndefined()

    expect.soft(http.saves).toHaveLength(2)
    expect.soft(http.records['_Base_DictData']![0]!['exVal_4']).toBe('被拒后保留的草稿')
    dataSet.destroy()
  })
  it('keeps a real DataSet preflight validation failure correctable without a false unknown state', async () => {
    const {workspace, http, dataSet} = fixture(new DictionaryHttp(), false, 'SCENE', ['_Base_DictData.exVal_4'])
    await workspace.load()
    workspace.entries.updateEditingValue('E1', 'exVal_4', '')

    await expect(workspace.saveData()).rejects.toThrow('DATA_VIEW_SAVE_VALIDATION')

    expect(workspace.entries.hasUnconfirmedSave).toBe(false)
    expect(workspace.requiresVerification).toBe(false)
    expect(workspace.entries.getEditingRow('E1')?.['exVal_4']).toBe('')
    expect(workspace.pending).toBe(true)
    expect(http.saves).toHaveLength(0)
    workspace.entries.updateEditingValue('E1', 'exVal_4', '修正后的值')
    await workspace.saveData()
    expect(http.saves).toHaveLength(1)
    expect(http.records['_Base_DictData']![0]!['exVal_4']).toBe('修正后的值')
    dataSet.destroy()
  })
  it('clears the creating state after a lost new-design receipt is confirmed', async () => {
    const http = new DictionaryHttp()
    http.records = {_Base_DictType: [], _Base_DictData: []}
    const {workspace, dataSet} = fixture(http, true)
    await workspace.load()
    workspace.definition.updateEditingValue('D1', 'AppId', 'APP')
    workspace.definition.updateEditingValue('D1', 'TypeName', '新字典')
    workspace.definition.updateEditingValue('D1', 'functiondesc', '新字典用途')
    http.failAfterWrite = true
    await expect(workspace.saveDesign()).rejects.toThrow()
    expect(workspace.definition.hasUnconfirmedSave).toBe(true)
    http.failAfterWrite = false

    await workspace.load(true)

    expect(workspace.requiresVerification).toBe(false)
    expect(workspace.pending).toBe(false)
    await workspace.addEntry()
    const id = workspace.entries.getPkKey(workspace.entries.currentRow!)!
    workspace.entries.updateEditingValue(id, 'val', 'A')
    workspace.entries.updateEditingValue(id, 'txt', '新条目')
    await workspace.saveData()
    expect(http.saves).toHaveLength(2)
    expect(http.saves[1]!.data).toMatchObject([{TableName: '_Base_DictData'}])
    expect(http.records['_Base_DictData']).toMatchObject([{typeid: 'D1', val: 'A', txt: '新条目'}])
    dataSet.destroy()
  })
  it('discards a staged added row and an edited extension without a write', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load(); await workspace.addEntry()
    workspace.entries.updateEditingValue('E1', 'exVal_2', '本地')
    await workspace.load(true)
    expect(workspace.entries.rows).toHaveLength(1)
    expect(workspace.entries.rows[0]!['exVal_2']).toBe('基础')
    expect(http.saves).toHaveLength(0)
    dataSet.destroy()
  })
  it('refuses records outside the input dictionary', async () => {
    const {workspace, http, dataSet} = fixture()
    http.records['_Base_DictData']![0]!['typeid'] = 'OTHER'
    await expect(workspace.load()).rejects.toThrow('归属')
    expect(http.saves).toHaveLength(0)
    dataSet.destroy()
  })
  it('stages child deletions and definition deletion in one owner and cancels without persisting', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load(); await workspace.removeDefinition()
    expect(workspace.pending).toBe(true)
    await workspace.load(true)
    expect(workspace.definition.rows).toHaveLength(1)
    expect(workspace.entries.rows).toHaveLength(1)
    expect(http.saves).toHaveLength(0)
    dataSet.destroy()
  })
  it('edits extensions without requiring unmodified legacy titles or encoding type', async () => {
    const {workspace, http, dataSet} = fixture()
    Object.assign(http.records['_Base_DictType']![0]!, {val: null, txt: null, dictionaryType: null})
    http.records['_Base_DictData']!.push({...initialEntry, rowid: 'OLD', val: null, txt: null})
    await workspace.load()
    workspace.entries.updateEditingValue('E1', 'exVal_4', '保留旧定义')
    await workspace.saveData()
    expect(http.records['_Base_DictData']![0]!['exVal_4']).toBe('保留旧定义')
    expect(http.records['_Base_DictData']![1]!['val']).toBeNull()
    expect(http.records['_Base_DictType']![0]!['dictionaryType']).toBeNull()
    dataSet.destroy()
  })
  it('validates all existing codes when switching to numeric dictionary', async () => {
    const {workspace, http, dataSet} = fixture()
    http.records['_Base_DictData']![0]!['val'] = 'legacy-code'
    await workspace.load()
    workspace.definition.updateEditingValue('D1', 'dictionaryType', '1')
    await expect(workspace.saveDesign()).rejects.toThrow('十进制')
    expect(http.saves).toHaveLength(0)
    dataSet.destroy()
  })
  it('requires a persisted design before data maintenance and keeps the two commits separate', async () => {
    const http = new DictionaryHttp()
    http.records = {_Base_DictType: [], _Base_DictData: []}
    const {workspace, dataSet} = fixture(http, true)
    await workspace.load()
    expect(workspace.definition.fieldAccess(workspace.definition.rows[0]!, 'TypeName').write).toBe('allowed')
    workspace.definition.updateEditingValue('D1', 'TypeName', '新增测试')
    workspace.definition.updateEditingValue('D1', 'functiondesc', '新字典用途')
    await expect(workspace.addEntry()).rejects.toThrow('先保存字典设计')
    await expect(workspace.saveData()).rejects.toThrow('先保存字典设计')
    workspace.definition.updateEditingValue('D1', 'AppId', 'APP')
    await workspace.saveDesign()
    await workspace.addEntry()
    expect(workspace.entries.fieldAccess(workspace.entries.rows[0]!, 'exVal_4').write).toBe('allowed')
    const id = workspace.entries.getPkKey(workspace.entries.rows[0]!)!
    workspace.entries.updateEditingValue(id, 'val', 'new')
    workspace.entries.updateEditingValue(id, 'txt', '新增条目')
    workspace.entries.updateEditingValue(id, 'exVal_4', '扩展四')
    await workspace.saveData()
    expect(http.saves).toHaveLength(2)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictType'}])
    expect(http.saves[0]!.data).toHaveLength(1)
    expect(http.saves[1]!.data).toMatchObject([{TableName: '_Base_DictData'}])
    expect(http.saves[1]!.data).toHaveLength(1)
    expect(workspace.entries.rows[0]).toMatchObject({typeid: 'D1', val: 'new', txt: '新增条目', exVal_4: '扩展四'})
    expect(workspace.pending).toBe(false)
    dataSet.destroy()
  })
  it('submits entry deletions before definition through the formal batch owner', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load()
    await workspace.removeDefinition()
    await workspace.saveDesign()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData'}, {TableName: '_Base_DictType'}])
    expect(http.records['_Base_DictType']).toEqual([])
    expect(http.records['_Base_DictData']).toEqual([])
    expect(workspace.pending).toBe(false)
    dataSet.destroy()
  })
  it('rereads both resources after a lost deletion receipt without repeating deletion', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load(); await workspace.removeDefinition()
    http.failAfterWrite = true
    await expect(workspace.saveDesign()).rejects.toThrow()
    await expect(workspace.saveDesign()).rejects.toThrow()
    await workspace.load(true)
    expect(workspace.removed).toBe(true)
    expect(workspace.pending).toBe(false)
    expect(http.saves).toHaveLength(1)
    expect(http.reads.map(config => (config.data as {Table: Array<{Name: string}>}).Table[0]!.Name)).toEqual([
      '_Base_DictType', '_Base_DictData', '_Base_DictData', '_Base_DictType', '_Base_DictType', '_Base_DictData',
    ])
    dataSet.destroy()
  })
  it('allows reread after a confirmed deletion whose follow-up query failed', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load()
    await workspace.removeDefinition()
    http.failReadAt = http.reads.length + 1

    await expect(workspace.saveDesign()).rejects.toThrow('读取失败')

    expect(http.saves).toHaveLength(1)
    expect(workspace.entries.hasUnconfirmedSave).toBe(false)
    expect(workspace.definition.hasUnconfirmedSave).toBe(false)
    expect(workspace.requiresVerification).toBe(false)
    http.failReadAt = undefined

    await workspace.load(true)

    expect(workspace.removed).toBe(true)
    expect(http.saves).toHaveLength(1)
    dataSet.destroy()
  })
  it('refuses mixed design and data edits without dispatching either save', async () => {
    const {workspace, http, dataSet} = fixture()
    await workspace.load()
    workspace.definition.updateEditingValue('D1', 'fiveValue', '标题草稿')
    workspace.entries.updateEditingValue('E1', 'exVal_4', '数据草稿')
    await expect(workspace.saveDesign()).rejects.toThrow('分别维护和保存')
    await expect(workspace.saveData()).rejects.toThrow('分别维护和保存')
    expect(http.saves).toHaveLength(0)
    expect(workspace.pending).toBe(true)
    dataSet.destroy()
  })

  it('allows only declared local draft fields and revokes draft presentation on cancellation', async () => {
    const {workspace, dataSet} = fixture()
    await workspace.load(); await workspace.addEntry()
    const row = workspace.entries.currentRow!
    const id = workspace.entries.getPkKey(row)!
    expect(workspace.entries.fieldAccess(row, 'exVal_4')).toMatchObject({read: 'visible', write: 'allowed'})
    expect(workspace.entries.fieldAccess(row, 'rowid').write).toBe('denied')
    expect(workspace.entries.fieldAccess(row, 'unregistered')).toMatchObject({read: 'invisible', write: 'denied'})
    expect(workspace.entries.fieldAccess({rowid: 'UNOWNED'}, 'exVal_4').write).toBe('denied')
    await workspace.removeEntry(id)
    expect(workspace.entries.fieldAccess(row, 'exVal_4').write).toBe('denied')
    expect(workspace.pending).toBe(false)
    dataSet.destroy()
  })
  it('does not create inputs when the formal query denies add', async () => {
    const {workspace, http, dataSet} = fixture()
    http.allowAdd = false
    await workspace.load()
    await expect(workspace.addEntry()).rejects.toThrow('不允许新增')
    expect(workspace.entries.rows).toHaveLength(1)
    expect(http.saves).toHaveLength(0)
    dataSet.destroy()
  })
  it('exposes batch candidate staging through the existing entries DataView', async () => {
    const {workspace, dataSet} = fixture()
    try {
      await workspace.load()
      expect((workspace as unknown as {appendEntries?: unknown}).appendEntries).toBeTypeOf('function')
    } finally {dataSet.destroy()}
  })
  it('preflights every candidate before staging any entry and preserves existing edits', async () => {
    const {workspace, dataSet, http} = fixture()
    try {
      await workspace.load()
      workspace.entries.updateEditingValue('E1', 'exVal_4', '先前条目草稿')
      const appendEntries = (workspace as unknown as {appendEntries(values: readonly Readonly<Record<string, unknown>>[]): Promise<void>}).appendEntries
      await expect(appendEntries.call(workspace, [
        {val: 'AI-1', txt: '有效候选', exVal_4: '保留扩展'},
        {val: '', txt: '后一个候选无效'},
      ])).rejects.toThrow()
      expect(workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(workspace.entries.getEditingRow('E1')?.['exVal_4']).toBe('先前条目草稿')
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })
  it('stages valid candidates in entries and leaves persistence to the existing saveData command', async () => {
    const {workspace, dataSet, http} = fixture()
    try {
      await workspace.load()
      workspace.entries.updateEditingValue('E1', 'exVal_4', '已有修改')
      const appendEntries = (workspace as unknown as {appendEntries(values: readonly Readonly<Record<string, unknown>>[]): Promise<void>}).appendEntries
      await appendEntries.call(workspace, [{val: 'AI-1', txt: '建议条目', exVal_1: '#abc', exVal_2: '类别', exVal_3: null, exVal_4: '扩展'}])
      expect(workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(1)
      expect(workspace.entries.rows).toHaveLength(2)
      expect(workspace.entries.rows.find(row => row['val'] === 'AI-1')).toMatchObject({
        typeid: 'D1', val: 'AI-1', txt: '建议条目', exVal_1: '#abc', exVal_2: '类别', exVal_3: null, exVal_4: '扩展',
      })
      expect(workspace.entries.getEditingRow('E1')?.['exVal_4']).toBe('已有修改')
      expect(http.saves).toHaveLength(0)
      await workspace.saveData()
      expect(http.saves).toHaveLength(1)
      expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData'}])
      expect(http.records['_Base_DictData']).toHaveLength(2)
    } finally {dataSet.destroy()}
  })
  it('persists ordIdx 0 on AI Added rows without changing existing rows or their drafts', async () => {
    const {workspace, dataSet, http} = fixture()
    try {
      await workspace.load()
      workspace.entries.updateEditingValue('E1', 'exVal_4', '保留既有草稿')
      await workspace.appendEntries([{val: 'AI-1', txt: '候选'}])
      const addedId = [...workspace.entries.dirtyTracking.pendingCreateIds][0]
      expect(workspace.entries.getEditingRow(addedId!)?.['ordIdx']).toBe(0)
      expect(workspace.entries.getEditingRow('E1')?.['exVal_4']).toBe('保留既有草稿')
      await workspace.saveData()
      const groups = http.saves[0]!.data as Array<{TableName: string; CrudModel: {Added: Array<Record<string, unknown>>; Changed: Array<Record<string, unknown>>}}>
      expect(groups).toMatchObject([{TableName: '_Base_DictData', CrudModel: {Added: [expect.objectContaining({val: 'AI-1', ordIdx: 0})],
        Changed: [{rowid: 'E1', exVal_4: '保留既有草稿'}]}}])
      expect(http.records['_Base_DictData']?.find(row => row['val'] === 'AI-1')).toMatchObject({typeid: 'D1', ordIdx: 0})
      expect(http.records['_Base_DictData']?.find(row => row['rowid'] === 'E1')?.['ordIdx']).toBe(1)
    } finally {dataSet.destroy()}
  })
  it.each(['computed', 'allowAdd', 'min'])('preflights ordIdx %s for the whole AI batch and preserves existing drafts', async restriction => {
    const http = new DictionaryHttp()
    if (restriction === 'allowAdd') http.allowAdd = false
    const setup = restriction === 'min' ? fixture(http, false, 'SCENE', [], {min: 1}) : fixture(http)
    try {
      await setup.workspace.load()
      setup.workspace.entries.updateEditingValue('E1', 'exVal_4', '保留既有草稿')
      if (restriction === 'computed') setup.dataSet.getTable('_Base_DictData')!.updateColumn('ordIdx', {isComputed: true, computeExpression: '1'})
      await expect(setup.workspace.appendEntries([{val: 'AI-1', txt: '有效候选'}, {val: 'AI-2', txt: '后续候选'}])).rejects.toThrow()
      expect(setup.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(setup.workspace.entries.rows).toHaveLength(1)
      expect(setup.workspace.entries.getEditingRow('E1')?.['exVal_4']).toBe('保留既有草稿')
      expect(setup.http.saves).toHaveLength(0)
    } finally {setup.dataSet.destroy()}
  })
  it('initializes manually added entries with ordIdx 0 and persists that same value', async () => {
    const {workspace, dataSet, http} = fixture()
    try {
      await workspace.load()
      await workspace.addEntry()
      const row = workspace.entries.currentRow!
      const id = workspace.entries.getPkKey(row)!
      expect(workspace.entries.getEditingRow(id)?.['ordIdx']).toBe(0)
      expect(workspace.entries.getEditingRow(id)?.['val']).toBe('')
      expect(workspace.entries.getEditingRow(id)?.['txt']).toBe('')
      workspace.entries.updateEditingValue(id, 'val', 'HAND-1')
      workspace.entries.updateEditingValue(id, 'txt', '手工条目')
      await workspace.saveData()
      const groups = http.saves[0]!.data as Array<{TableName: string; CrudModel: {Added: Array<Record<string, unknown>>}}>
      expect(groups).toMatchObject([{TableName: '_Base_DictData', CrudModel: {Added: [expect.objectContaining({ordIdx: 0})]}}])
      expect(http.records['_Base_DictData']?.find(item => item['rowid'] === id)?.['ordIdx']).toBe(0)
    } finally {dataSet.destroy()}
  })
  it.each(['computed', 'allowAdd', 'min'])('refuses manual add before creating a row when ordIdx is %s', async restriction => {
    const http = new DictionaryHttp()
    if (restriction === 'allowAdd') http.allowAdd = false
    const setup = restriction === 'min' ? fixture(http, false, 'SCENE', [], {min: 1}) : fixture(http)
    try {
      await setup.workspace.load()
      setup.workspace.entries.updateEditingValue('E1', 'exVal_4', '保留既有草稿')
      if (restriction === 'computed') setup.dataSet.getTable('_Base_DictData')!.updateColumn('ordIdx', {isComputed: true, computeExpression: '1'})
      await expect(setup.workspace.addEntry()).rejects.toThrow()
      expect(setup.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(setup.workspace.entries.rows).toHaveLength(1)
      expect(setup.workspace.entries.getEditingRow('E1')?.['exVal_4']).toBe('保留既有草稿')
      expect(setup.http.saves).toHaveLength(0)
    } finally {setup.dataSet.destroy()}
  })
  it('allows manual and candidate additions when ordIdx is denied only on the existing row', async () => {
    const {workspace, dataSet, http} = fixture()
    http.denied = ['ordIdx']
    try {
      await workspace.load()
      expect(workspace.entries.fieldAccess(workspace.entries.rows[0]!, 'ordIdx').write).toBe('denied')
      await workspace.addEntry()
      expect(workspace.entries.getEditingRow(workspace.entries.getPkKey(workspace.entries.currentRow!)!)?.['ordIdx']).toBe(0)
      const appendEntries = (workspace as unknown as {appendEntries(values: readonly Readonly<Record<string, unknown>>[]): Promise<void>}).appendEntries
      await appendEntries.call(workspace, [{val: 'AI-1', txt: '候选'}])
      const aiId = [...workspace.entries.dirtyTracking.pendingCreateIds].find(id =>
        workspace.entries.getEditingRow(id)?.['val'] === 'AI-1')
      expect(workspace.entries.getEditingRow(aiId!)?.['ordIdx']).toBe(0)
      expect(workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(2)
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })
  it('preserves existing and new entry drafts after the original save explicitly refuses the batch', async () => {
    const {workspace, dataSet, http} = fixture()
    try {
      await workspace.load()
      workspace.entries.updateEditingValue('E1', 'exVal_4', '原条目草稿')
      await workspace.appendEntries([{val: 'AI-1', txt: '候选'}])
      const addedId = [...workspace.entries.dirtyTracking.pendingCreateIds][0]
      http.rejectWrite = {code: 1004, message: '明确拒绝保存'}
      await expect(workspace.saveData()).rejects.toThrow('明确拒绝保存')
      expect(workspace.entries.dirtyTracking.pendingCreateIds.has(addedId!)).toBe(true)
      expect(workspace.entries.getEditingRow(addedId!)?.['ordIdx']).toBe(0)
      expect(workspace.entries.getEditingRow('E1')?.['exVal_4']).toBe('原条目草稿')
      expect(http.records['_Base_DictData']).toHaveLength(1)
    } finally {dataSet.destroy()}
  })
  it.each(['val', 'typeid', 'crttime', 'exVal_4'])('uses new-row input rules instead of borrowing existing-row %s permission', async field => {
    const {workspace, dataSet, http} = fixture()
    http.denied = [field]
    try {
      await workspace.load()
      expect(workspace.entries.fieldAccess(workspace.entries.rows[0]!, field).write).toBe('denied')
      const appendEntries = (workspace as unknown as {appendEntries(values: readonly Readonly<Record<string, unknown>>[]): Promise<void>}).appendEntries
      await appendEntries.call(workspace, [{val: 'AI-1', txt: '候选', exVal_4: '扩展'}])
      expect(workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(1)
      expect(workspace.entries.rows).toHaveLength(2)
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })
  it('refuses candidate staging when the current query hides dictionaryType', async () => {
    const {workspace, dataSet, http} = fixture()
    http.hidden = ['dictionaryType']
    try {
      await workspace.load()
      const appendEntries = (workspace as unknown as {appendEntries(values: readonly Readonly<Record<string, unknown>>[]): Promise<void>}).appendEntries
      await expect(appendEntries.call(workspace, [{val: 'AI-1', txt: '候选'}])).rejects.toThrow(/编码类型不可读/)
      expect(workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
    } finally {dataSet.destroy()}
  })
  it('refuses candidate staging when the native query does not allow new rows', async () => {
    const {workspace, dataSet, http} = fixture()
    http.allowAdd = false
    try {
      await workspace.load()
      const appendEntries = (workspace as unknown as {appendEntries(values: readonly Readonly<Record<string, unknown>>[]): Promise<void>}).appendEntries
      await expect(appendEntries.call(workspace, [{val: 'AI-1', txt: '候选'}])).rejects.toThrow()
      expect(workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(workspace.entries.rows).toHaveLength(1)
    } finally {dataSet.destroy()}
  })
  it('rejects reserved identity and non-business properties from AI input', async () => {
    const {workspace, dataSet, http} = fixture()
    try {
      await workspace.load()
      const appendEntries = (workspace as unknown as {appendEntries(values: readonly Readonly<Record<string, unknown>>[]): Promise<void>}).appendEntries
      await expect(appendEntries.call(workspace, [{rowid: 'AI-ROW', typeid: 'D1', val: 'AI-1', txt: '候选'}])).rejects.toThrow()
      await expect(appendEntries.call(workspace, [{val: 'AI-1', txt: '候选', ordIdx: 1}])).rejects.toThrow()
      expect(workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })
  it('treats an empty candidate batch as a no-op on the native DataView', async () => {
    const {workspace, dataSet, http} = fixture()
    try {
      await workspace.load()
      workspace.entries.updateEditingValue('E1', 'exVal_4', 'existing draft')
      const before = workspace.entries.getEditingRow('E1')
      const appendEntries = (workspace as unknown as {appendEntries(values: readonly Readonly<Record<string, unknown>>[]): Promise<void>}).appendEntries
      await appendEntries.call(workspace, [])
      expect(workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(workspace.entries.getEditingRow('E1')).toEqual(before)
      expect(http.saves).toHaveLength(0)
    } finally {dataSet.destroy()}
  })
  it('rejects computed reserved columns and formal maxLength constraints before adding any row', async () => {
    const computed = fixture()
    try {
      await computed.workspace.load()
      computed.dataSet.getTable('_Base_DictData')!.updateColumn('typeid', {isComputed: true, computeExpression: "'D1'"})
      await expect(computed.workspace.appendEntries([{val: 'AI-1', txt: '候选'}])).rejects.toThrow()
      expect(computed.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(computed.workspace.entries.rows).toHaveLength(1)
      expect(computed.http.saves).toHaveLength(0)
    } finally {computed.dataSet.destroy()}

    const lengthLimited = fixture(new DictionaryHttp(), false, 'SCENE', [], {}, {exVal_4: {maxLength: 3}})
    try {
      await lengthLimited.workspace.load()
      await expect(lengthLimited.workspace.appendEntries([{val: 'AI-1', txt: '候选', exVal_4: '超过长度'}])).rejects.toThrow()
      expect(lengthLimited.workspace.entries.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(lengthLimited.workspace.entries.rows).toHaveLength(1)
      expect(lengthLimited.http.saves).toHaveLength(0)
    } finally {lengthLimited.dataSet.destroy()}
  })
  it.each(['0', 0, '-1.5', '1e2'])('accepts numeric code %s without converting stored values', value => {
    const row = {...initialEntry, val: value}
    DictionarySchema.validateEntry(row, {...initialDefinition, dictionaryType: '1'})
    expect(row.val).toBe(value)
  })
  it.each(['', 'Infinity', '0x10', 'abc'])('rejects invalid numeric code %s', value => {
    expect(() => DictionarySchema.validateEntry({...initialEntry, val: value}, {...initialDefinition, dictionaryType: '1'})).toThrow()
  })
})
