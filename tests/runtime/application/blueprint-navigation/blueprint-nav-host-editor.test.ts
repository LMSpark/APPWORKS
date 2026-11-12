import {describe, expect, it, vi} from 'vitest'
import {BlueprintNavHostEditor, parseNavHostParamType} from '@/services/project/blueprint-navigation/blueprint-nav-host-editor'
import {createHostRuntime} from './blueprint-navigation.fixture'

const NODE = 'NODE-1'
const HOST = 'Base_Navigation_DataRelation'

function open() {
  const runtime = createHostRuntime()
  runtime.http.records = {
    [HOST]: [
      {rowid: 'H1', prowid: NODE, pName: '导航甲', title: '宿主甲', dataSetId: 'DS1', DataName: 'tblA', dataType: 'table', selectTextParam: 'name',
        TextParamName: 'text', selectValParam: 'id', ValParamName: 'value', paramType: 'legacyName'},
      {rowid: 'H2', prowid: 'OTHER', title: '其他节点'},
    ],
    Base_DataSet: [{rowid: 'DS1', Name: '空间甲', sysid: 'APP-1'}, {rowid: 'DS2', Name: '空间乙', sysid: 'APP-1'}, {rowid: 'DS3', Name: '他应用', sysid: 'APP-2'}],
    Base_DataModel: [{rowid: 'M1', dataSetId: 'DS1', Name: '资源甲', MetaName: 'tblA', Type: 'table'},
      {rowid: 'M2', dataSetId: 'DS1', Name: '视图乙', MetaName: 'viewB', Type: 'view'},
      {rowid: 'M3', dataSetId: 'DS2', Name: '资源丙', MetaName: 'tblC', Type: 'dict'}],
    Base_DataModel_Field: [{rowid: 'F1', dataModelId: 'M1', Name: 'id', description: '编号', type: 'dataModel'},
      {rowid: 'F2', dataModelId: 'M1', Name: 'name', description: '名称', type: 'dataModel'},
      {rowid: 'F3', dataModelId: 'M1', Name: 'hidden', type: 'other'},
      {rowid: 'F4', dataModelId: 'M2', Name: 'code', description: '编码', type: 'dataModel'}],
  }
  const editor = new BlueprintNavHostEditor(runtime.dataSet, {applicationId: 'APP-1', nodeId: NODE, hostName: '导航甲', assertCurrent: () => undefined})
  return {...runtime, editor}
}

function fill(editor: BlueprintNavHostEditor, id: string, values: Record<string, string>) {
  for (const [field, value] of Object.entries(values)) editor.write(id, field, value)
}

const VALID = {title: '宿主乙', dataSetId: 'DS1', DataName: 'viewB', selectTextParam: 'code', TextParamName: 'text', selectValParam: 'code', ValParamName: 'value'}

describe('蓝图导航宿主关系 editor', () => {
  it('parses saved paramType JSON and keeps legacy plain values as the attribute name', () => {
    expect(parseNavHostParamType('{"type":"url","name":"code"}')).toEqual({type: 'url', name: 'code'})
    expect(parseNavHostParamType('legacyName')).toEqual({type: '', name: 'legacyName'})
    expect(parseNavHostParamType('')).toEqual({type: '', name: ''})
  })

  it('loads only the current node through the declared input parameter filter', async () => {
    const f = open()
    await f.editor.load()
    expect(f.editor.view.queryContext).toEqual({nodeId: NODE})
    expect(f.editor.view.rows.map(row => row['rowid'])).toEqual(['H1'])
  })

  it('loads the three candidate levels through their formal views', async () => {
    const f = open()
    await f.editor.loadDataSets()
    expect(f.editor.dataSets.rows.map(row => row['rowid'])).toEqual(['DS1', 'DS2'])
    await f.editor.loadResources('DS1')
    expect(f.editor.resources.rows.map(row => row['MetaName'])).toEqual(['tblA', 'viewB'])
    expect((await f.editor.loadFields('tblA'))?.['rowid']).toBe('M1')
    expect(f.editor.fieldOptions.rows.map(row => row['Name'])).toEqual(['id', 'name'])
  })

  it('creates a host under the node with the host name, checks required and distinct parameters, and stores paramType JSON', async () => {
    const f = open()
    await f.editor.load()
    const id = String(await f.editor.stageCreate())
    expect(f.editor.value(id, 'prowid')).toBe(NODE)
    expect(f.editor.value(id, 'pName')).toBe('导航甲')
    await expect(f.editor.save(id)).rejects.toThrow('请输入标题')
    fill(f.editor, id, {...VALID, ValParamName: 'text'})
    await expect(f.editor.save(id)).rejects.toThrow('值参数名称与文本参数名称不能相同')
    expect(f.http.saves).toHaveLength(0)
    f.editor.write(id, 'ValParamName', 'value')
    f.editor.paramInput.updateEditingValue('param', 'type', 'url')
    f.editor.paramInput.updateEditingValue('param', 'name', 'code')
    await f.editor.save(id)
    expect(f.http.saves).toHaveLength(1)
    expect(f.http.records[HOST]?.find(row => row['title'] === '宿主乙')).toEqual(expect.objectContaining({
      prowid: NODE, pName: '导航甲', DataName: 'viewB', paramType: '{"type":"url","name":"code"}'}))
    expect(f.editor.pending).toBe(false)
  })

  it('edits a host without rewriting an unchanged legacy paramType', async () => {
    const f = open()
    await f.editor.load()
    f.editor.beginEdit('H1')
    expect(f.editor.paramInput.getEditingRow('param')).toEqual(expect.objectContaining({type: '', name: 'legacyName'}))
    f.editor.write('H1', 'title', '宿主甲改')
    await f.editor.save('H1')
    expect(f.http.saves[0]?.changed[0]).not.toHaveProperty('paramType')
    expect(f.http.records[HOST]?.find(row => row['rowid'] === 'H1')).toEqual(expect.objectContaining({title: '宿主甲改', paramType: 'legacyName'}))
  })

  it('cascades data space → resource → field mapping and clears downstream values', async () => {
    const f = open()
    await f.editor.load()
    f.editor.beginEdit('H1')
    await f.editor.loadCandidates('H1')
    const errors: Error[] = []
    f.editor.followCascade('H1', cause => errors.push(cause))
    f.editor.write('H1', 'DataName', 'viewB')
    expect(f.editor.value('H1', 'selectTextParam')).toBe('')
    await vi.waitFor(() => expect(f.editor.value('H1', 'dataType')).toBe('view'))
    expect(f.editor.fieldOptions.rows.map(row => row['Name'])).toEqual(['code'])
    f.editor.write('H1', 'dataSetId', 'DS2')
    expect(f.editor.value('H1', 'DataName')).toBe('')
    expect(f.editor.value('H1', 'dataType')).toBe('')
    await vi.waitFor(() => expect(f.editor.resources.rows.map(row => row['MetaName'])).toEqual(['tblC']))
    expect(f.editor.fieldOptions.rows).toHaveLength(0)
    expect(errors).toEqual([])
    f.editor.release()
  })

  it('drops a late resource lookup so the latest resource decides the resource type', async () => {
    const f = open()
    await f.editor.load()
    f.editor.beginEdit('H1')
    await f.editor.loadCandidates('H1')
    let release: (() => void) | undefined
    let delayed = false
    f.http.beforeDefinitionRead = async table => {
      if (table !== 'Base_DataModel_Field' || delayed) return
      delayed = true
      await new Promise<void>(resolve => { release = resolve })
    }
    f.editor.followCascade('H1', () => undefined)
    f.editor.write('H1', 'DataName', 'viewB')
    f.editor.write('H1', 'DataName', 'tblA')
    await vi.waitFor(() => expect(f.editor.fieldOptions.rows.map(row => row['Name'])).toEqual(['id', 'name']))
    expect(f.editor.value('H1', 'dataType')).toBe('table')
    release?.()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(f.editor.value('H1', 'dataType')).toBe('table')
    expect(f.editor.fieldOptions.rows.map(row => row['Name'])).toEqual(['id', 'name'])
    f.editor.release()
  })

  it('removes only a host of the current node and verifies it is gone', async () => {
    const f = open()
    await f.editor.load()
    await expect(f.editor.remove('H2')).rejects.toThrow('不存在或不唯一')
    await f.editor.remove('H1')
    expect(f.http.records[HOST]?.map(row => row['rowid'])).toEqual(['H2'])
    expect(f.editor.view.rows).toHaveLength(0)
  })
})
