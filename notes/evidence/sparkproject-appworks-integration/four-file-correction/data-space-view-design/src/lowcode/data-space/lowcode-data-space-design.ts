import * as LowcodePlatform from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import type { PageRuntimeServicesCapability } from '@spark-appworks/spark-component'
import { LowcodeDataSpaceModelSourceReader } from './model-source/lowcode-data-space-model-source-reader'

type BoundDataSpaceDesignReader = ReturnType<NonNullable<PageRuntimeServicesCapability['dataSpaceDesign']>['createReader']>

function staleScope(): Error {
  return new Error('SPARK_EXECUTION_SCOPE_STALE: 关系依赖字典所属应用或会话已失效')
}

function assertCurrentScope(token: string): void {
  try {
    if (lowcodeApi.readRequestScope().token !== token) throw staleScope()
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SPARK_EXECUTION_SCOPE_STALE:')) throw error
    throw staleScope()
  }
}

export const lowcodeDataSpaceDesign = {
  scenarioId: LowcodePlatform.DATA_SPACE_DESIGN_FORM_KEY,
  createReader(): BoundDataSpaceDesignReader {
    const scope = lowcodeApi.readRequestScope()
    if (!Object.entries(scope.headers).some(([key, value]) => key.toLowerCase() === 'x-appid'
      && typeof value === 'string' && value.trim().length > 0)) {
      throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: 关系依赖字典读取需要明确选中应用')
    }
    return {
      modelSources: new LowcodeDataSpaceModelSourceReader(),
      async readRelationDependencyOptions() {
        assertCurrentScope(scope.token)
        try {
          const result = await lowcodeApi.dataSpace.design.readRelationDependencyOptions()
          assertCurrentScope(scope.token)
          return result
        } catch (error) {
          assertCurrentScope(scope.token)
          throw error
        }
      },
    }
  },
}
