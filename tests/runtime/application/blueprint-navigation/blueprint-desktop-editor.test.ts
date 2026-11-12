import {describe, expect, it} from 'vitest'
import {BlueprintDesktopEditor, BlueprintDesktopRecord} from '@/services/project/blueprint-navigation/blueprint-desktop-editor'
import {createDesktopDeps, SCENARIO} from './blueprint-navigation.fixture'

const NODE = 'NODE-1'

async function open(available?: readonly string[]) {
  const deps = createDesktopDeps(available)
  const editor = new BlueprintDesktopEditor(deps.design, deps.assembler)
  const {dataSet, warnings} = await editor.assemble(() => undefined)
  const record = new BlueprintDesktopRecord(dataSet, {nodeId: NODE, assertCurrent: () => undefined, warnings})
  return {...deps, editor, dataSet, record}
}

describe('蓝图桌面显示 editor', () => {
  it('assembles the desktop model under the blueprint scenario and degrades only missing dictionaries with a warning', async () => {
    const f = await open(['Base_Desktop_System', 'Dict_Page_Popup', 'DesktopStyle'])
    expect(f.editor.scenarioId).toBe(SCENARIO)
    expect(f.dataSet.scenarioId).toBe(SCENARIO)
    expect(Object.keys(f.record.layout.options).sort()).toEqual(['AppPopupMode', 'IconStyle'])
    expect(f.record.layout.warnings.join()).toContain('Dict_Desktop_AppType')
  })

  it('refuses to assemble when the desktop model cannot be resolved by registered name', async () => {
    const deps = createDesktopDeps(['Dict_Page_Popup'])
    await expect(new BlueprintDesktopEditor(deps.design, deps.assembler).assemble(() => undefined)).rejects.toThrow('桌面显示模型 Base_Desktop_System 未能按注册名解析')
  })

  it('creates the node desktop record with the node identity and verifies every filled field on readback', async () => {
    const f = await open()
    f.http.records['Dict_Page_Popup'] = [{rowid: 'P1', val: 'tab', txt: '页签'}]
    await f.record.load()
    expect(f.record.record).toBeUndefined()
    expect(f.record.view.queryContext).toEqual({nodeId: NODE})
    expect(f.dataSet.getView('Dict_Page_Popup', 'default')?.rows).toHaveLength(1)
    await f.record.stageCreate({AppName: '导航甲', ShortCNName: '导航甲', AppOrdidx: 3, AppUrl: 'vue:/features/a/b', MobileUrl: '',
      IsDesktopShow: f.record.flag('IsDesktopShow', true), IsReqLogin: f.record.flag('IsReqLogin', false)})
    await f.record.saveCreate()
    expect(f.http.saves).toHaveLength(1)
    expect(f.http.records['Base_Desktop_System']).toEqual([expect.objectContaining({rowid: NODE, AppName: '导航甲', AppUrl: 'vue:/features/a/b',
      IsDesktopShow: '1', IsReqLogin: '0'})])
    expect(f.record.record?.['rowid']).toBe(NODE)
    expect(f.record.pending).toBe(false)
  })

  it('blocks required fields before any write and lets the staged create be discarded', async () => {
    const f = await open()
    await f.record.load()
    await f.record.stageCreate({AppName: '导航甲', AppOrdidx: 1})
    await expect(f.record.saveCreate()).rejects.toThrow('请输入PC端地址')
    expect(f.http.saves).toHaveLength(0)
    f.record.discardCreate()
    expect(f.record.pending).toBe(false)
  })

  it('reports a readback mismatch when the server stored a different value', async () => {
    const f = await open()
    await f.record.load()
    let armed = false
    f.http.beforeSave = async () => { armed = true }
    f.http.beforeDefinitionRead = async table => {
      if (armed && table === 'Base_Desktop_System') f.http.records['Base_Desktop_System']![0]!['AppName'] = '服务端改写'
    }
    await f.record.stageCreate({AppName: '导航甲', AppOrdidx: 1, AppUrl: 'vue:/a/b'})
    await expect(f.record.saveCreate()).rejects.toThrow('回读核验失败')
  })

  it('keeps an unknown create result, forbids discarding it and only verifies the original submission on retry', async () => {
    const f = await open()
    await f.record.load()
    await f.record.stageCreate({AppName: '导航甲', AppOrdidx: 1, AppUrl: 'vue:/a/b'})
    f.http.failAfterWrite = true
    await expect(f.record.saveCreate()).rejects.toThrow('保存结果未知')
    expect(f.record.unknown).toBe(true)
    expect(() => f.record.discardCreate()).toThrow('不能放弃')
    await f.record.saveCreate()
    expect(f.record.unknown).toBe(false)
    expect(f.http.saves.filter(save => save.added.length > 0)).toHaveLength(1)
    expect(f.record.record?.['rowid']).toBe(NODE)
  })

  it('removes only the unique node record and verifies it is gone', async () => {
    const f = await open()
    f.http.records['Base_Desktop_System'] = [{rowid: NODE, AppName: '导航甲', AppOrdidx: 1, AppUrl: 'vue:/a/b'}, {rowid: 'OTHER', AppName: '其他'}]
    await f.record.load()
    expect(f.record.record?.['rowid']).toBe(NODE)
    await f.record.remove()
    expect(f.http.records['Base_Desktop_System']?.map(row => row['rowid'])).toEqual(['OTHER'])
    expect(f.record.record).toBeUndefined()
  })

  it('refuses to load when the node has more than one desktop record', async () => {
    const f = await open()
    f.http.primaryKeys['Base_Desktop_System'] = 'rowid'
    f.http.records['Base_Desktop_System'] = [{rowid: NODE, AppName: 'A'}, {rowid: NODE, AppName: 'B'}]
    await expect(f.record.load()).rejects.toThrow()
  })
})
