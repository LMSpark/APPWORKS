/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design-client
 * 职责：声明流程设计正式场景身份并校验调用目标。
 * 边界：不查询或提交数据，读写由原 DataSet 的模型及文件 DataView 承接。
 */
export const FLOW_DESIGN_SCENARIO_ID = '6E462C4A39EE0D96F4D1A28FFE887C89'

export type FlowDesignClientOptions = Readonly<{
  flowModelId: string
  /** 检查本次原目标及运行实例；失效时抛错中止后续读取或保存。 */
  assertCurrent?: () => void
}>

/** 设计页装配前校验目标模型身份。 */
export function assertFlowDesignTarget(options: FlowDesignClientOptions): string {
  const flowModelId = typeof options.flowModelId === 'string' ? options.flowModelId.trim() : ''
  if (!flowModelId) throw new Error('流程设计缺少目标模型 rowid')
  options.assertCurrent?.()
  return flowModelId
}
