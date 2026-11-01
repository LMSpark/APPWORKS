import designText from '../../../../config/pages/semi-structured/excel-import-editor/pagedata.json?raw'
import {buildFormalModels} from '../structured-config/catalog/structured-config-catalog.fixture'
export {designText}
export const EXCEL_DESIGN = '0F93B82141CF40852021D704B0E30BF4'
export function excelDesignModels() {
  const config = JSON.parse(designText) as {tables: Record<string, {modelBinding: {modelId: string}; views: Record<string, {queryConfig: {fields: string[]}}>}>}
  return Object.entries(config.tables).flatMap(([name, table]) => {
    const key = name === 'Base_Import_Transform_Rule' ? 'id' : 'rowid'
    const fields = [...new Set(Object.values(table.views).flatMap(view => view.queryConfig.fields))]
    return buildFormalModels({[name]: fields}).map(model => ({...model, id: table.modelBinding.modelId, primaryKey: key,
      fields: model.fields.map(field => ({...field, modelId: table.modelBinding.modelId, primaryKey: field.name === key,
        type: ['sheet', 'titleIndex', 'dataIndex', 'type', 'isReadOnly', 'isDict', 'enabled', 'sort_order', 'ordIdx'].includes(field.name) ? 'int' : 'varchar'}))}))
  })
}
