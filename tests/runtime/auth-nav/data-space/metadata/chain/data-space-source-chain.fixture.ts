import dictionaryConfig from '../../../../../../config/pages/data-platform/data-dictionary/pagedata.json'
import {dataSpaceChainFixture} from './data-space-chain.fixture'

export const sourceCases = [
  {type: 'table', catalog: 'View_TblList', source: {rowid: 'TABLE-SOURCE', tblname: 'SourceTable', tbldesc: '表', dbid: 'DB', DbName: 'main'}, fields: ['id', 'title']},
  {type: 'databaseView', catalog: 'View_ViewList', source: {rowid: 'VIEW-SOURCE', vewname: 'SourceView', vewdesc: '数据库视图', dbid: 'DB', DbName: 'main'}, fields: ['id', 'title']},
  {type: 'interface', catalog: 'Base_DataServiceInterface', source: {rowid: 'API-SOURCE', Name: 'SourceApi', Desc: '接口', ProviderID: 'PROVIDER'}, fields: ['id', 'title']},
  {type: 'logicView', catalog: 'Base_DataViewList', source: {rowid: 'LOGIC-SOURCE', name: 'SourceLogic'}, fields: ['id', 'title']},
  {type: 'json', catalog: 'Base_JsonData', source: {rowid: 'JSON-SOURCE', name: 'SourceJson'}, fields: ['id', 'pid', 'name', 'type', 'haschild', 'value']},
  {type: 'dict', catalog: '_Base_DictType', source: {rowid: 'DICT-SOURCE', TypeName: 'SourceDict', functiondesc: '字典', dictionaryType: '1',
    val: '代码', txt: '标题', secondValue: '属性二', thirdValue: '属性三', fourthvalue: '属性四', fiveValue: '属性五'},
    fields: ['rowid', 'val', 'txt', 'exVal_1', 'exVal_2', 'exVal_3', 'exVal_4', 'ordIdx']},
] as const

/** Seed formal records only; source preparation, metadata writes and runtime projection remain production code. */
export function sourceChainFixture() {
  const f = dataSpaceChainFixture({metadataCreate: true})
  for (const item of sourceCases) {
    f.records.get(item.catalog)!.push({...item.source})
    if (!['json', 'dict'].includes(item.type)) f.records.get('Base_TblField')!.push(...item.fields.map((name, index) => ({
      rowid: `${item.source.rowid}-${name}`, tblid: item.source.rowid, enname: name, cnname: `来源${name}`, DataType: 'varchar', IsPKey: index === 0 ? 1 : 0,
    })))
    if (item.type === 'interface' || item.type === 'logicView') f.records.get('_Base_ParamList')!.push({
      parid: `${item.source.rowid}-PARAM`, pid: item.source.rowid, parname: 'region', pardesc: '区域',
    })
  }
  f.records.get('Base_DataSet')!.push({rowid: dictionaryConfig.scenarioId, Name: '字典编辑', inputParams: '[]'})
  for (const [name, table] of Object.entries(dictionaryConfig.tables)) {
    const fields = name === '_Base_DictType' ? Object.keys(sourceCases[5].source)
      : ['rowid', 'dictionaryId', 'val', 'txt', 'secondValue', 'thirdValue', 'fourthvalue', 'fiveValue', 'ordIdx']
    f.addModel(dictionaryConfig.scenarioId, table.modelBinding.modelId, name, fields)
  }
  return f
}
