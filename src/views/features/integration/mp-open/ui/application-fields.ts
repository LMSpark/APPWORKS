import type {SparkNode} from '@spark-appworks/spark-data'

export const applicationPageScope = {
  scenarioId: 'B9EB9A416B3AFC711E3787399368D247',
  modelName: 'base_channel_miniapp_template_application',
  workingPlanRoute: '/features/integration/mp-open/ui/application-page',
} as const

export const listFields = {
  id: '申请编号',
  authorizer_appid: 'AppId',
  user_version: '版本号',
  user_desc: '版本说明',
  status: '状态',
  created_at: '提交时间',
  review_note: '审批意见',
} as const

export const detailFields = {
  ...listFields,
  api_base_url: 'API 地址',
  external_template_id: '外部模板 ID',
  deployment_id: '部署 ID',
  reviewed_at: '审批时间',
  reviewed_by: '审批人',
} as const

export function textFields(fields: Readonly<Record<string, string>>): SparkNode[] {
  return Object.entries(fields).map(([field, label]) => ({type: 'r-text', props: {field, label, readonly: true}}))
}
