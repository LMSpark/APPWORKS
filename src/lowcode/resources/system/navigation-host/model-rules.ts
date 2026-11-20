/**
 * @module app:lowcode/resources/system/navigation-host/model-rules
 * 职责：导航宿主关系（Base_Navigation_DataRelation）的跨字段保存约束：值参数名称与文本参数名称不能相同。
 * 边界：只在应用目录场景的既有正式模型上注册；单字段必填、去空格与候选成员由 pagedata 列规则承担，不在此重复。
 * AI用途：所有装配该场景的页面经场景装配统一获得本约束，页面不再自行校验。
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'

const HOST_MODEL = 'Base_Navigation_DataRelation'

export function registerNavigationHostModelRules(dataSet: DataSet): void {
  if (dataSet.scenarioId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY) return
  const matches = Object.values(dataSet.tables).filter(table => table.modelBinding?.modelName === HOST_MODEL)
  if (matches.length > 1) throw new Error(`NAVIGATION_HOST_MODEL_IDENTITY: ${HOST_MODEL} 正式模型不唯一`)
  matches[0]?.setQuerySaveRule({groups: [{fields: ['TextParamName', 'ValParamName'], validate: ({values}) => {
    const text = String(values['TextParamName'] ?? '').trim()
    if (text !== '' && text === String(values['ValParamName'] ?? '').trim()) throw new Error('值参数名称与文本参数名称不能相同')
    return undefined
  }}]})
}
