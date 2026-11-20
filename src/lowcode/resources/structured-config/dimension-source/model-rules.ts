/**
 * @module app:lowcode/resources/structured-config/dimension-source/model-rules
 * 职责：维度设计场景（88A4）来源绑定、字段映射与事件合同的跨字段保存约束：来源类型与模型/平台合同一致、
 *   来源凭证投影与账套字段、常量映射值、启用事件的业务日期字段。
 * 边界：只在 88A4 场景的既有正式模型上注册；单字段必填、格式、不可变与候选引用由 pagedata 列规则承担，
 *   版本递增、集合结构与台账引用等需对照已存快照或正式模型的约束由编辑器保存命令承担。
 * AI用途：所有装配该场景的页面经场景装配统一获得本约束，编辑器不再自行重复。
 */
import type {DataSet, DataTableQuerySaveRuleGroup} from '@spark-appworks/spark-data'
import {getSystemScenarioResource} from '@/registries/system-scenario-registry'
import {dimensionSourceContract} from './source-contracts'

const text = (value: unknown): string => value === undefined || value === null ? '' : String(value).trim()
const enabled = (value: unknown): boolean => value === true || (typeof value === 'number' ? value !== 0 : ['1', 'true'].includes(text(value).toLowerCase()))

const BINDING_RULE: DataTableQuerySaveRuleGroup = {
  fields: ['source_kind', 'source_model_id', 'source_model_meta_name', 'source_contract_id', 'event_code', 'payload_version',
    'projection_role', 'account_field_id', 'account_field_name'],
  validate: ({values}) => {
    const kind = text(values['source_kind'])
    const model = text(values['source_model_id']) || text(values['source_model_meta_name'])
    if (kind === 'data-model') {
      if (!text(values['source_model_id']) || !text(values['source_model_meta_name'])) throw new Error('数据模型来源必须绑定正式模型')
      if (text(values['source_contract_id'])) throw new Error('数据模型来源不能引用平台事件合同')
    } else if (kind === 'platform-event') {
      if (model) throw new Error('平台注册事件来源不能绑定数据模型')
      const contract = dimensionSourceContract(text(values['source_contract_id']))
      if (text(values['event_code']) !== contract.eventCode || Number(values['payload_version']) !== contract.payloadVersion) {
        throw new Error('来源绑定与平台注册事件合同不一致')
      }
    }
    const voucher = text(values['projection_role']) === 'source-voucher'
    if (voucher && kind !== 'data-model') throw new Error('来源凭证投影必须绑定节点数据空间模型')
    const account = text(values['account_field_id']), accountName = text(values['account_field_name'])
    if (voucher || account || accountName) {
      if (kind !== 'data-model') throw new Error('根模型账套字段只适用于数据模型来源')
      if (!account || !accountName) throw new Error('正式账套字段不能为空')
    }
    return undefined
  },
}
const MAPPING_RULE: DataTableQuerySaveRuleGroup = {
  fields: ['mapping_kind', 'mapping_value'],
  validate: ({values}) => {
    if (text(values['mapping_kind']) === 'constant' && !text(values['mapping_value'])) throw new Error('常量映射缺少映射值')
    return undefined
  },
}
const TEMPLATE_RULE: DataTableQuerySaveRuleGroup = {
  fields: ['status', 'biz_date_field'],
  validate: ({values}) => {
    if (enabled(values['status']) && !text(values['biz_date_field'])) throw new Error('启用事件业务日期字段不能为空')
    return undefined
  },
}
const RULES: Readonly<Record<string, DataTableQuerySaveRuleGroup>> = {
  Bil_Dimension_Source_Binding: BINDING_RULE, Bil_Dimension_Source_Mapping: MAPPING_RULE, Bil_Dimension_Rule_Template: TEMPLATE_RULE,
}

export function registerDimensionSourceModelRules(dataSet: DataSet): void {
  if (dataSet.scenarioId !== getSystemScenarioResource('dimensionDesign').scenarioId) return
  for (const [modelName, rule] of Object.entries(RULES)) {
    const matches = Object.values(dataSet.tables).filter(table => table.modelBinding?.modelName === modelName)
    if (matches.length > 1) throw new Error(`DIMENSION_SOURCE_MODEL_IDENTITY: ${modelName} 正式模型不唯一`)
    matches[0]?.setQuerySaveRule({groups: [...(matches[0].querySaveRule?.groups ?? []), rule]})
  }
}
