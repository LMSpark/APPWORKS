import {describe, expect, it} from 'vitest'
import {DictionarySchema} from './dictionary-schema'
import {DictionaryHttp, fixture, initialDefinition, initialEntry} from './tests/dictionary-workspace.fixture'

describe('Dictionary resource through formal DataViews', () => {
  it.each(['', '   '])('rejects a new design with empty description %j before writing and retains its input', async description => {
    const http = new DictionaryHttp()
    http.records = {_Base_DictType: [], _Base_DictData: []}
    const {workspace, dataSet} = fixture(http, true)
    try {
      await workspace.load()
      workspace.definition.updateEditingValue('D1', 'TypeName', '未描述设计')
      workspace.definition.updateEditingValue('D1', 'functiondesc', description)
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
  it.each(['0', 0, '-1.5', '1e2'])('accepts numeric code %s without converting stored values', value => {
    const row = {...initialEntry, val: value}
    DictionarySchema.validateEntry(row, {...initialDefinition, dictionaryType: '1'})
    expect(row.val).toBe(value)
  })
  it.each(['', 'Infinity', '0x10', 'abc'])('rejects invalid numeric code %s', value => {
    expect(() => DictionarySchema.validateEntry({...initialEntry, val: value}, {...initialDefinition, dictionaryType: '1'})).toThrow()
  })
})
