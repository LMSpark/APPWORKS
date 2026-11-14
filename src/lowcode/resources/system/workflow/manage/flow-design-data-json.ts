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
  assertCurrent?: () => void
}>

/** 读取设计图 JSON：优先 `${flowId}EJ2.json`，失败或空则回退模型行 DesignJson 字段。 */
export async function readFlowDesignDataJsonText(command: ReadFlowDesignDataJsonCommand): Promise<string> {
  const id = normalizeText(command.flowId)
  const fallback = readDesignJsonFromModelRow(command.modelRow)
  if (!id) return fallback
  const customPath = normalizeText(command.customPath) || 'SysForm'
  const fileName = `${id}EJ2.json`
  try {
    const content = normalizeText(await command.api.readTextFile({appType: 'designfile', customPath, fileName}))
    command.assertCurrent?.()
    if (content) return content
  } catch (error) {
    if (error instanceof LowcodeApiError && error.code === 404) {
      // 无平台文件时与参考实现一致，回退模型字段。
    }
  }
  return fallback
}