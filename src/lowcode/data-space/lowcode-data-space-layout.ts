import * as LowcodePlatform from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi, lowcodeHttp } from '@/lowcode/lowcode-runtime'
import type { PageRuntimeServicesCapability } from '@spark-appworks/spark-component'

type PageDataSpaceLayoutReader = ReturnType<NonNullable<PageRuntimeServicesCapability['dataSpaceLayout']>['createReader']>
type PageDataSpaceLayoutWriter = ReturnType<NonNullable<NonNullable<PageRuntimeServicesCapability['dataSpaceLayout']>['createWriter']>>
type DataSpaceLayoutWriteCommand = Parameters<PageDataSpaceLayoutWriter['saveDataSpaceLayout']>[0]
type DataSpaceLayoutCreateCommand = Parameters<PageDataSpaceLayoutWriter['createDataSpaceLayout']>[0]

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

function requireValidGraphContent(content: string, label: string): void {
  if (!content.trim()) throw new Error(`${label} 不能为空`)
  let graph: unknown
  try { graph = JSON.parse(content) } catch { throw new Error(`${label} 不是有效 JSON`) }
  if (!isRecord(graph) || graph['graphVersion'] !== 1 || !Array.isArray(graph['nodes']) || !Array.isArray(graph['edges'])) {
    throw new Error(`${label} 缺少 graphVersion=1、nodes 或 edges`)
  }
}

export const lowcodeDataSpaceLayout = {
  scenarioId: designScenarioId,
  createReader(): PageDataSpaceLayoutReader {
    const { assertScope, design } = bindLayoutScope()
    return {
      async readDataSpaceLayout(dataSpaceId) {
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
  createWriter(): PageDataSpaceLayoutWriter {
    const { assertScope, boundScope, design } = bindLayoutScope()
    const upload = new LowcodePlatform.LowcodeDesignFileUpload({ http: lowcodeHttp, readScope: () => {
      assertScope()
      return boundScope
    } })
    return {
      async saveDataSpaceLayout(command: DataSpaceLayoutWriteCommand) {
        const id = requireDataSpaceId(command.dataSpaceId)
        requireValidGraphContent(command.expectedContent, '数据空间布局预像')
        requireValidGraphContent(command.content, '数据空间布局')
        assertScope()
        const currentBytes = await design.readFileBytes({ appType: 'designfile', customPath: 'SysForm', fileName: `${id}.json` })
        assertScope()
        const current = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(currentBytes)
        if (current !== command.expectedContent) throw new Error('数据空间布局已变化，请重新读取后再保存')
        const receipt = await upload.uploadWorkingText({ customPath: 'SysForm', fileName: `${id}.json`, text: command.content })
        assertScope()
        if (receipt['state'] !== 'success') throw new Error('数据空间布局上传回执未确认成功')
      },
      async createDataSpaceLayout(command: DataSpaceLayoutCreateCommand) {
        const id = requireDataSpaceId(command.dataSpaceId)
        requireValidGraphContent(command.content, '数据空间布局')
        assertScope()
        try {
          await design.readTextFile({appType: 'designfile', customPath: 'SysForm', fileName: `${id}.json`})
          assertScope()
          throw new Error('数据空间布局文件已存在，请重新读取')
        } catch (error) {
          assertScope()
          if (!(error instanceof LowcodePlatform.LowcodeApiError && error.code === 404)) throw error
        }
        const receipt = await upload.uploadTextVersion({customPath: 'SysForm', fileName: `${id}.json`, text: command.content})
        assertScope()
        if (receipt['state'] !== 'success') throw new Error('数据空间布局创建回执未确认成功')
      },
    }
  },
}
