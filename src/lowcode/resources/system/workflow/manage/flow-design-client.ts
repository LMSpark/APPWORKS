/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design-client
 * 职责：流程设计聚合读写的 lowcode 入口占位；完整图编辑语义待接 FlowDesign 专用合同。
 * 边界：页面经本模块访问设计能力，禁止在 Vue 中直接引用 lowcodeApi。
 */
export const FLOW_DESIGN_SCENARIO_ID = '6E462C4A39EE0D96F4D1A28FFE887C89'

export type FlowDesignClientOptions = Readonly<{
  flowModelId: string
  assertCurrent?: () => void
}>

/** 设计页装配前校验目标模型身份。 */
export function assertFlowDesignTarget(options: FlowDesignClientOptions): string {
  const flowModelId = String(options.flowModelId ?? '').trim()
  if (!flowModelId) throw new Error('流程设计缺少目标模型 rowid')
  options.assertCurrent?.()
  return flowModelId
}