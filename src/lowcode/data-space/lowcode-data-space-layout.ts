import * as LowcodePlatform from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi, lowcodeHttp } from '@/lowcode/lowcode-runtime'
const designScenarioId = LowcodePlatform.DATA_SPACE_DESIGN_FORM_KEY

function requireDataSpaceId(value: string): string {
  if (/[\u0000-\u001f\u007f%]/.test(value)) throw new Error('数据空间布局 ID 必须是单路径段')
  const id = value.trim()
  if (!id || id === '.' || id === '..' || /[\\/]/.test(id)) {
    throw new Error('数据空间布局 ID 必须是单路径段')
  }
  return id
}

function staleScope(): Error {
  return new Error('SPARK_EXECUTION_SCOPE_STALE: 数据空间布局所属应用或会话已失效')
}

function bindLayoutScope() {
  const captured = lowcodeApi.readRequestScope()
  const appId = captured.headers['X-AppId']
  if (!appId) throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: 数据空间布局操作需要明确选中应用')
  const boundScope = { token: captured.token, headers: { ...captured.headers,
    'x-FormKey': LowcodePlatform.DATA_SPACE_DESIGN_FORM_KEY } }
  const assertScope = () => {
    try {
      if (lowcodeApi.readRequestScope().token !== captured.token) throw staleScope()
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('SPARK_EXECUTION_SCOPE_STALE:')) throw error
      throw staleScope()
    }
  }
  const design = new LowcodePlatform.LowcodeDesignApi({ http: lowcodeHttp, readScope: () => {
    assertScope()
    return boundScope
  } })
  return { assertScope, boundScope, design }
}

export const lowcodeDataSpaceLayout = {
  scenarioId: designScenarioId,
  createReader() {
    const { assertScope, design } = bindLayoutScope()
    return {
      async readDataSpaceLayout(dataSpaceId: string): Promise<string | null> {
        const id = requireDataSpaceId(dataSpaceId)
        assertScope()
        try {
          const text = await design.readTextFile({ appType: 'designfile', customPath: 'SysForm', fileName: `${id}.json` })
          assertScope()
          return text
        } catch (error) {
          assertScope()
          if (error instanceof LowcodePlatform.LowcodeApiError && error.code === 404) return null
          throw error
        }
      },
    }
  },
}
