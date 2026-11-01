import {readFile} from 'node:fs/promises'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {RequestState} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {buildFormalModels} from '../catalog/structured-config-catalog.fixture'

const SCENE = '868E62F90DB8118C74CDC9F6BCA61157'
// Independent service-contract fixture: names and IDs were checked against the live model catalog.
const specs = [
  ['Base_CodeDesign', 0, ['rowid', 'AppID', 'AppName', 'Name', 'BusTableRowid', 'BusTableName', 'KeyFields', 'CodeDescription', 'CodeExample']],
  ['Base_CodeNodeDesign', 1, ['rowid', 'CodeDesignID', 'NodeNo', 'NodeType', 'ParameterName', 'CodeNodeDesignJson', 'description']],
  ['Dict_CodeNodeType', 4, ['rowid', 'val', 'txt', 'ordIdx']],
  ['Base_CodeClassTable', 5, ['rowid', 'Name', 'TableRowid', 'TableName', 'TextFieldName', 'ValueFieldName', 'BusFilterField']],
  ['Base_CodingSequence', 6, ['rowid', 'Name', 'Incre', 'StartNo', 'EndNo', 'Format']],
  ['Base_TblField', 7, ['rowid', 'tblid', 'enname', 'cnname']],
  ['Base_CodeSerialPerform', 8, ['rowid', 'CodeDesignID', 'NodeDesignId', 'NodeCode', 'Code', 'LoopCodeSplitStr']],
] as const
const pages: PageRuntime[] = []
afterEach(() => {pages.splice(0).forEach(page => page.dispose())})

async function open(applicationId = 'A', codeDesignId = 'C1') {
  const text = await readFile('config/pages/structured-config/data-code-editor/pagedata.json', 'utf8')
  const models = specs.flatMap(([name, index, fields]) => buildFormalModels({[name]: fields}).map(model => ({
    ...model, id: `${SCENE}p${String(index).padStart(3, '0')}`,
    fields: model.fields.map(field => ({...field, output: !(name === 'Base_CodeNodeDesign' && field.name === 'description')})),
  })))
  const http = new ApiBackend()
  http.records = {
    Base_CodeDesign: [
      {rowid: 'C1', AppID: 'A', Name: 'A编码', BusTableRowid: 'T1'},
      {rowid: 'C2', AppID: 'B', Name: 'B编码', BusTableRowid: 'T2'},
      {rowid: 'C3', AppID: 'A', Name: '同应用父编码', BusTableRowid: 'T1'},
    ],
    Base_CodeNodeDesign: [
      {rowid: 'N1', CodeDesignID: 'C1', NodeNo: '1', NodeType: 'fixed', ParameterName: 'A'},
      {rowid: 'N2', CodeDesignID: 'C2', NodeNo: '1', NodeType: 'fixed', ParameterName: 'B'},
    ],
    Dict_CodeNodeType: [{rowid: 'D1', val: 'fixed', txt: '固定字符串', ordIdx: '1'}],
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
  it('queries the selected design and its nodes without loading rule-maintenance data', async () => {
    const {ds, http} = await open()
    expect(ds.getView('Base_CodeDesign')!.rows.map(row => row['rowid'])).toEqual(['C1'])
    expect(ds.getView('Base_CodeNodeDesign')!.rows.map(row => row['rowid'])).toEqual(['N1'])
    expect(ds.getView('Dict_CodeNodeType')!.rows.map(row => row['val'])).toEqual(['fixed'])
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
