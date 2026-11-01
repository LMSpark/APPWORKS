import workflow from '../../../../../config/pages/structured-config/workflow-catalog/pagedata.json?raw'
import excel from '../../../../../config/pages/semi-structured/excel-import-catalog/pagedata.json?raw'
import pdf from '../../../../../config/pages/semi-structured/pdf-inspect-catalog/pagedata.json?raw'
import {buildFormalModels} from './structured-config-catalog.fixture'
export const WORKFLOW = '5E9676B1E38860B023921F48FB4370DE', EXCEL = '36B01771C627B9BF5CD493DC75B996A1', PDF = 'A2D63AB2AAEF156E7727094A23AEA433'
export const topicTexts: Record<string, string> = {[WORKFLOW]: workflow, [EXCEL]: excel, [PDF]: pdf}
type TopicConfig = {tables: Record<string, {modelBinding: {modelId: string}; views: Record<string, {queryConfig: {fields: string[]}}>}>}
export function topicModels(scenarioId: string) {
  const config = JSON.parse(topicTexts[scenarioId]!) as TopicConfig
  return Object.entries(config.tables).flatMap(([name, table]) => {
    const fields = [...new Set(Object.values(table.views).flatMap(view => view.queryConfig.fields))]
    const key = name === 'Base_FileInspectConfig' ? 'id' : name === 'Base_UserInfo' ? 'ID' : 'rowid'
    return buildFormalModels({[name]: fields}).map(model => ({...model, id: table.modelBinding.modelId, primaryKey: key,
      fields: model.fields.map(field => ({...field, modelId: table.modelBinding.modelId, primaryKey: field.name === key}))}))
  })
}
