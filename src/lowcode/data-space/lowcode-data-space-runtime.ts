/**
 * 运行态页面 DataSet 唯一装载入口：DataSpace 设计 + 平台权限 → spark-data DataSet。
 * 有 PageDataSpaceBinding 时禁止再把 pagedata.json 当运行数据真源。
 */
import type { PageDataSpaceBinding } from '@spark-appworks/spark-project-model'
import type { DataSet } from '@spark-appworks/spark-data'

import { lowcodeApi, lowcodeHttp } from '../lowcode-runtime'
import { LowcodeDataSpaceAssembler } from './lowcode-data-space-assembler'

export type LoadBoundDataSpaceDataSetResult = Readonly<{
  dataSet: DataSet
  diagnostics: readonly string[]
}>

export async function loadBoundDataSpaceDataSet(
  binding: PageDataSpaceBinding,
): Promise<LoadBoundDataSpaceDataSetResult> {
  const formKey = binding.formKey.trim()
  const dataSpaceId = binding.dataSpaceId.trim()
  const modelId = binding.modelId.trim()
  if (!formKey || !dataSpaceId || !modelId) {
    throw new Error('页面数据空间闭包不完整：需要 formKey + dataSpaceId + modelId')
  }

  const [permission, design] = await Promise.all([
    lowcodeApi.permission.runtime.read(formKey),
    lowcodeApi.dataSpace.design.read({
      dataSpaceId,
      catalogFormKeys: formKey,
    }),
  ])

  const assembly = new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp).assemble({
    design,
    formKey,
    permission,
  })

  const hasModel = design.models.some((model) => model.modelId === modelId)
  if (!hasModel) {
    throw new Error(`数据空间 ${dataSpaceId} 不包含模型 ${modelId}`)
  }

  return {
    dataSet: assembly.dataSet,
    diagnostics: assembly.diagnostics.map((item) => item.message),
  }
}
