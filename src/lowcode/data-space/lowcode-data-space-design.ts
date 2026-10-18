import * as LowcodePlatform from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { LowcodeDataSpaceModelSourceReader } from './model-source/lowcode-data-space-model-source-reader'
import { getAppProjectBlueprintWorkspace } from '@/services/project/project-shell'
import { LowcodeDataSpaceViewDesign } from './view-design/lowcode-data-space-view-design'
import { loadLowcodeDataSpaceMetadata, loadScenarioDataSet } from './lowcode-data-space-runtime'
import { lowcodeDataSpaceLayout } from './lowcode-data-space-layout'

function staleScope(): Error {
  return new Error('SPARK_EXECUTION_SCOPE_STALE: 数据空间设计所属应用或会话已失效')
}

function assertCurrentScope(token: string): void {
  try {
    if (lowcodeApi.readRequestScope().token !== token) throw staleScope()
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SPARK_EXECUTION_SCOPE_STALE:')) throw error
    throw staleScope()
  }
}

function createViewDesign(scope: ReturnType<typeof lowcodeApi.readRequestScope>): LowcodeDataSpaceViewDesign {
  const applicationId = Object.entries(scope.headers).find(([key]) => key.toLowerCase() === 'x-appid')?.[1]
  if (typeof applicationId !== 'string' || !applicationId.trim()) {
    throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: 视图配置需要明确应用')
  }
  const assertScope = () => {
    assertCurrentScope(scope.token)
    const currentAppId = Object.entries(lowcodeApi.readRequestScope().headers)
      .find(([key]) => key.toLowerCase() === 'x-appid')?.[1]
    if (currentAppId !== applicationId) throw staleScope()
  }
  return new LowcodeDataSpaceViewDesign({
    workspace: getAppProjectBlueprintWorkspace(applicationId), assertScope,
    readModel: (input, metadata) => lowcodeApi.dataSpace.design.readModel({
      designScenarioId: LowcodePlatform.DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: input.scenarioId,
      metaName: input.modelName, assertCurrent: assertScope,
    }, metadata),
    assemble: (scenarioId, config, fileExecutors, modelScope) => loadScenarioDataSet({scenarioId, config, assertCurrent: assertScope,
      ...(modelScope === undefined ? {} : {modelScope}),
      ...(fileExecutors ? {fileExecutors} : {})}),
    loadMetadata: loadLowcodeDataSpaceMetadata,
    readLegacyLayout: lowcodeDataSpaceLayout.createReader().readDataSpaceLayout,
    modelSources: new LowcodeDataSpaceModelSourceReader(),
  })
}

/** 先交付概览及文件；画布由loadGraphRelations读取端点，完整编辑工作区再经loadDefinition装配目标结构。 */
export function openLowcodeDataSpaceDesignSession(targetId: string) {
  return createViewDesign(lowcodeApi.readRequestScope()).openDesignSession(targetId, {deferDefinition: true})
}
