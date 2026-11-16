/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design-data-json
 * 职责：读取流程设计图 JSON（平台文件优先，模型字段回退），对齐参考 FlowDesign.readFlowDesignDataJson。
 * 边界：只读文本；不保存、不刷新节点/连线表。
 */
import type {LowcodeDesignApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'

const DESIGN_JSON_KEYS = ['DesignJson', 'DESIGNJSON', 'designJson', 'DesignJSON'] as const

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

export type FlowDesignPlatformFileApi = Pick<LowcodeDesignApi, 'readTextFile'>

export function readDesignJsonFromModelRow(row: Record<string, unknown> | undefined): string {
  if (!row) return ''
  for (const key of DESIGN_JSON_KEYS) {
    const text = normalizeText(row[key])
    if (text) return text
  }
  return ''
}

export type ReadFlowDesignDataJsonCommand = Readonly<{
  flowId: string
  modelRow?: Record<string, unknown>
  api: FlowDesignPlatformFileApi
  customPath?: string
  /** 检查本次原目标及运行实例；失效时抛错中止后续读取或保存。 */
  assertCurrent?: () => void
}>

/** 读取明确目标的设计图；仅真实404或成功空文本回退模型，权限/网络/失效错误继续向上传递。 */
export async function readFlowDesignDataJsonText(command: ReadFlowDesignDataJsonCommand): Promise<string> {
  command.assertCurrent?.()
  const id = normalizeText(command.flowId)
  if (!id) throw Error('流程设计文件读取缺少目标flowId')
  const fallback = readDesignJsonFromModelRow(command.modelRow)
  const customPath = normalizeText(command.customPath) || 'SysForm'
  const fileName = `${id}EJ2.json`
  let content: string
  try {
    content = await command.api.readTextFile({appType: 'designfile', customPath, fileName})
  } catch (error) {
    command.assertCurrent?.()
    if (error instanceof LowcodeApiError && error.code === 404) return fallback
    throw error
  }
  command.assertCurrent?.()
  return normalizeText(content) || fallback
}
