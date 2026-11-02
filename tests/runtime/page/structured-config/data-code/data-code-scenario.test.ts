import {readFile} from 'node:fs/promises'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {RequestState} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {codeModels, DESIGN} from './data-code.fixture'
import {addCodeSegment, changeCodeSegmentType} from '@/lowcode/resources/structured-config/data-code/segment-ops'
import {saveDataCodeDesign} from '@/lowcode/resources/structured-config/data-code/design-ops'

const SCENE = DESIGN
const pages: PageRuntime[] = []
afterEach(() => {pages.splice(0).forEach(page => page.dispose())})

async function open(applicationId = 'A', codeDesignId = 'C1') {
  const text = await readFile('config/pages/structured-config/data-code-editor/pagedata.json', 'utf8')
  const models = codeModels()
  const http = new ApiBackend()
  http.records = {
    Base_CodeDesign: [
      {rowid: 'C1', AppID: 'A', Name: 'A编码', BusTableRowid: 'T1'},
      {rowid: 'C2', AppID: 'B', Name: 'B编码', BusTableRowid: 'T2'},
      {rowid: 'C3', AppID: 'A', Name: '同应用父编码', BusTableRowid: 'T1'},
    ],
    Base_CodeNodeDesign: [
      {rowid: 'N1', CodeDesignID: 'C1', NodeNo: 1, NodeType: 2, ParameterName: 'A'},
      {rowid: 'N2', CodeDesignID: 'C2', NodeNo: 1, NodeType: 2, ParameterName: 'B'},
    ],
    Dict_CodeNodeType: [{rowid: 'D1', val: '2', txt: '固定字符串', ordIdx: '1'}],
    Base_CodingSequence: [{rowid: 'S1', Name: '序号', Incre: '1', StartNo: '1', EndNo: '1', Format: '001-999'}],
    Base_CodeClassTable: [], Base_TblField: [], Base_CodeSerialPerform: [],
  }
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'EXECUTION_APP'}})})
  const assembled = new LowcodeDataSpaceAssembler(api, http).assemble({config: new ScenarioViewConfig(SCENE, text),
    space: {dataSpaceId: SCENE, name: '编码设计'}, models, relations: []})
  expect(assembled.diagnostics).toEqual([])
  const page = new PageRuntime({pageId: 'code-contract', scenarioIds: [SCENE],
    scenarioInputs: {[SCENE]: {applicationId, codeDesignId}}, loadScenario: async () => assembled.dataSet})
  pages.push(page)
  await page.load()
  assembled.dataSet.triggerAutoLoad()
  await vi.waitFor(() => {
    for (const table of Object.values(assembled.dataSet.tables)) for (const view of table.viewList) if (view.autoLoad) {
      expect([RequestState.Preparing, RequestState.Loading]).not.toContain(view.requestState)
      expect(view.loadingError).toBeFalsy()
    }
  })
  return {ds: assembled.dataSet, http}
}

describe('formal code-design scenario', () => {
  it('persists a new main definition before allowing child creation, then saves and rereads its segment', async () => {
    const {ds, http} = await open('A', 'NEW')
    const main = ds.getView('Base_CodeDesign')!, nodes = ds.getView('Base_CodeNodeDesign')!
    const added = await main.addRowWithIdentity({field: 'rowid', value: 'NEW'}, {AppID: 'A', Name: '新增编码', BusTableRowid: 'T1'})
    main.setCurrentRow(added); main.setSelectedRows([added])
    await vi.waitFor(() => expect(nodes.requestState).toBe(RequestState.Loaded))
    expect(nodes.addActionState()).toBe('disabled')
    await expect(addCodeSegment(ds)).rejects.toThrow('DATA_VIEW_ADD_PARENT_PENDING')
    expect((await saveDataCodeDesign(ds)).success).toBe(true)
    expect(main.dirtyTracking.pendingCreateIds.has('NEW')).toBe(false)
    expect(http.saves.map(item => item.table)).toEqual(['Base_CodeDesign'])
    await main.refresh();main.setCurrentRowById('NEW');main.setSelectedRows([main.currentRow!]);await nodes.refresh()
    expect(nodes.addActionState()).toBe('enabled')
    const segment = await addCodeSegment(ds), id = nodes.getPkKey(segment)!
    changeCodeSegmentType(ds,{id,previous:''},2)
    nodes.updateEditingValue(id,'ParameterName','NEW_PREFIX')
    expect((await saveDataCodeDesign(ds)).success).toBe(true)
    await main.refresh();await nodes.refresh()
    expect(main.rows).toEqual([expect.objectContaining({rowid:'NEW',Name:'新增编码',CodeDescription:'固定字符串(NEW_PREFIX)'})])
    expect(nodes.rows).toEqual([expect.objectContaining({CodeDesignID:'NEW',NodeType:2,ParameterName:'NEW_PREFIX',CodeNodeDesignJson:'{"ConstString":"NEW_PREFIX"}'})])
    expect(http.records['Base_CodeNodeDesign']!.filter(row=>row['CodeDesignID']==='C1')).toHaveLength(1)
  })
  it('keeps child creation blocked after an interrupted parent receipt and verifies the same save without replay', async () => {
    const {ds,http}=await open('A','NEW'),main=ds.getView('Base_CodeDesign')!,nodes=ds.getView('Base_CodeNodeDesign')!
    const added=await main.addRowWithIdentity({field:'rowid',value:'NEW'},{AppID:'A',Name:'未知回执编码',BusTableRowid:'T1'})
    main.setCurrentRow(added);main.setSelectedRows([added]);await nodes.refresh()
    http.failAfterWrite=true
    await expect(saveDataCodeDesign(ds)).rejects.toThrow()
    expect(main.hasUnconfirmedSave).toBe(true)
    await expect(addCodeSegment(ds)).rejects.toThrow('保存未确认')
    expect(http.saves).toHaveLength(1)
    expect((await saveDataCodeDesign(ds)).success).toBe(true)
    expect(http.saves).toHaveLength(1)
    expect(main.hasUnconfirmedSave).toBe(false)
    await nodes.refresh()
    expect(nodes.addActionState()).toBe('enabled')
    expect(http.records['Base_CodeDesign']!.filter(row=>row['rowid']==='NEW')).toHaveLength(1)
  })
  it('saves an explicitly confirmed last-segment deletion without imposing the example-generation precondition', async () => {
    const {ds,http}=await open(),nodes=ds.getView('Base_CodeNodeDesign')!
    await nodes.removeRow('N1')
    expect((await saveDataCodeDesign(ds)).success).toBe(true)
    await nodes.refresh()
    expect(nodes.rows).toEqual([])
    expect(http.records['Base_CodeNodeDesign']).toEqual([expect.objectContaining({rowid:'N2',CodeDesignID:'C2'})])
    expect(http.records['Base_CodeDesign']!.find(row=>row['rowid']==='C1')?.['CodeDescription']).toBe('')
  })
  it('queries the selected design and its nodes without loading rule-maintenance data', async () => {
    const {ds, http} = await open()
    expect(ds.getView('Base_CodeDesign')!.rows.map(row => row['rowid'])).toEqual(['C1'])
    expect(ds.getView('Base_CodeNodeDesign')!.rows.map(row => row['rowid'])).toEqual(['N1'])
    expect(ds.getView('Dict_CodeNodeType')!.rows.map(row => row['val'])).toEqual(['2'])
    expect(http.reads.map(read => read.table)).not.toContain('Base_CodingSequence')
    const parents = ds.getView('Base_CodeDesign', 'parents')!
    await parents.refresh()
    expect(parents.rows.map(row => row['rowid'])).toEqual(['C3'])
  })

  it('does not read a design belonging to another managed application', async () => {
    const {ds} = await open('B', 'C1')
    expect(ds.getView('Base_CodeDesign')!.rows).toEqual([])
    // Node isolation additionally needs an authorized main-record cascade; it must not query by unverified input.
    expect(ds.getView('Base_CodeNodeDesign')!.rows).toEqual([])
  })

  it('cancels node edits and saves main/nodes without submitting independently edited sequence rules', async () => {
    const {ds, http} = await open()
    const main = ds.getView('Base_CodeDesign')!, nodes = ds.getView('Base_CodeNodeDesign')!
    nodes.updateEditingValue('N1', 'ParameterName', 'cancelled')
    nodes.discardPendingChanges(['N1'])
    expect(nodes.rows[0]!['ParameterName']).toBe('A')
    const sequences = ds.getView('Base_CodingSequence')!
    await sequences.refresh()
    sequences.updateEditingValue('S1', 'Name', '待保存规则')
    main.updateEditingValue('C1', 'Name', '修改编码')
    nodes.updateEditingValue('N1', 'ParameterName', 'X')
    const saved = await ds.saveChanges({views: [
      {tableName: 'Base_CodeDesign', viewId: 'default'}, {tableName: 'Base_CodeNodeDesign', viewId: 'default'},
    ]})
    expect(saved.success).toBe(true)
    expect(http.records['Base_CodeDesign']![0]!['Name']).toBe('修改编码')
    expect(http.records['Base_CodeNodeDesign']![0]!['ParameterName']).toBe('X')
    expect(http.records['Base_CodingSequence']![0]!['Name']).toBe('序号')
    expect(sequences.hasEditingChanges('S1')).toBe(true)
    expect((await ds.saveChanges({views: [{tableName: 'Base_CodingSequence', viewId: 'default'}]})).success).toBe(true)
    expect(http.records['Base_CodingSequence']![0]!['Name']).toBe('待保存规则')
  })
})
