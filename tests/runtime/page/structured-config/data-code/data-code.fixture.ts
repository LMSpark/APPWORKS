import {vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {buildFormalModels} from '../catalog/structured-config-catalog.fixture'
import designText from '../../../../../config/pages/structured-config/data-code-editor/pagedata.json?raw'

export {designText}
export const DESIGN = '868E62F90DB8118C74CDC9F6BCA61157'
export function codeModels() {
  const specs = [
    ['Base_CodeDesign', 0, ['rowid', 'AppID', 'AppName', 'Name', 'BusTableRowid', 'BusTableName', 'KeyFields', 'CodeDescription', 'CodeExample']],
    ['Base_CodeNodeDesign', 1, ['rowid', 'CodeDesignID', 'NodeNo', 'NodeType', 'ParameterName', 'CodeNodeDesignJson', 'description']],
    ['Dict_CodeNodeType', 4, ['rowid', 'val', 'txt', 'ordIdx']],
    ['Base_CodeClassTable', 5, ['rowid', 'Name', 'TableRowid', 'TableName', 'TextFieldName', 'ValueFieldName', 'BusFilterField']],
    ['Base_CodingSequence', 6, ['rowid', 'Name', 'Incre', 'StartNo', 'EndNo', 'Format']],
    ['Base_TblField', 7, ['rowid', 'tblid', 'enname', 'cnname']],
    ['Base_CodeSerialPerform', 8, ['rowid', 'CodeDesignID', 'NodeDesignId', 'NodeCode', 'Code', 'LoopCodeSplitStr']],
  ] as const
  return specs.flatMap(([name, index, fields]) => buildFormalModels({[name]: fields}).map(model => ({
    ...model, id: `${DESIGN}p${String(index).padStart(3, '0')}`,
    fields: model.fields.map(field => ({...field,
      type: name === 'Base_CodeNodeDesign' && ['NodeNo', 'NodeType'].includes(field.name) ? 'int' : field.type,
      output: !(name === 'Base_CodeNodeDesign' && field.name === 'description')})),
  })))
}

export function codeService() {
  const http = new ApiBackend()
  http.records = {
    Base_CodeDesign: [{rowid: 'C1', AppID: 'A', Name: '订单编码', BusTableRowid: 'T1', BusTableName: '订单', CodeDescription: '固定字符串(A)', CodeExample: 'A'},
      {rowid: 'C2', AppID: 'B', Name: '其他应用编码', BusTableRowid: 'T2'}],
    Base_CodeNodeDesign: [{rowid: 'N1', CodeDesignID: 'C1', NodeNo: 1, NodeType: 2, ParameterName: 'A', CodeNodeDesignJson: '{"ConstString":"A"}'},
      {rowid: 'N2', CodeDesignID: 'C2', NodeNo: 1, NodeType: 2, ParameterName: 'B', CodeNodeDesignJson: '{"ConstString":"B"}'}],
    Dict_CodeNodeType: [{rowid: 'D2', val: '2', txt: '固定字符串', ordIdx: '2'}],
    Base_CodingSequence: [], Base_CodeClassTable: [], Base_TblField: [], Base_CodeSerialPerform: [],
  }
  const readRequestScope = vi.fn(() => ({token: 'scope', headers: {'X-AppId': 'EXECUTION_APP'}}))
  const models = codeModels()
  return {http, runtime: new DataSpaceRuntimeApi({http, readScope: readRequestScope}), readRequestScope,
    readSpaceDefinition: async ({dataSpaceId}: {dataSpaceId: string}) => ({dataSpaceId, name: '编码设计'}),
    readModelBatch: async ({metaNames}: {metaNames: string[]}) => models.filter(model => metaNames.includes(model.metaName)),
    readRelations: async () => [],
  }
}
