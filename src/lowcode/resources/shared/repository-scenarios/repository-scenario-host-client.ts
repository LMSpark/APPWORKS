/**
 * @module app:lowcode/resources/shared/repository-scenarios/repository-scenario-host-client
 * 职责：为仓内场景 SPARK data 资源适配器访问 Vite 开发宿主提供受约束的读写客户端。
 * 边界：GET读取新鲜文本；POST携带捕获的expectedText；仅精确资源的明确未应用响应可转成 typed 拒绝，超时/回读错误保持未知并且不重试。
 * AI用途：仅由仓内场景资源执行器调用，不作为页面或通用文件API使用。
 */
import {ScenarioViewWriteNotAppliedError} from '@spark-appworks/spark-project-model'
import {isRepositoryScenarioFailure, isRepositoryScenarioSuccess, REPOSITORY_SCENARIO_ENDPOINT} from './repository-scenario-protocol'
import type {BuiltinScenarioResource} from '@/registries/builtin-application-registry'

const REQUEST_TIMEOUT_MS = 30_000

/**
 * 仓内场景 SPARK data 资源适配器使用的开发宿主读取器。
 * 每次 GET 都请求新鲜原文并校验资源身份和 SHA-256；不读取模块缓存，也不回退到正式远端来源。
 * 请求及响应体处理最多等待 30 秒；超时直接失败且不重试。
 */
export async function readRepositoryScenarioFromHost(resource: Pick<BuiltinScenarioResource, 'resourceId' | 'scenarioId'>): Promise<string> {
  const query = new URLSearchParams({resourceId: resource.resourceId})
  return withRequestDeadline(async signal => {
    const response = await fetch(`${REPOSITORY_SCENARIO_ENDPOINT}?${query.toString()}`,
      {cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal})
    const result = await readResponse(response)
    if (!response.ok || !isRepositoryScenarioSuccess(result) || result.resourceId !== resource.resourceId
      || result.scenarioId !== resource.scenarioId || !(await isValidRevision(result.text, result.sourceRevision))) {
      throw new Error('REPOSITORY_SCENARIO_READ_FAILED: 开发宿主未返回匹配的仓内场景原文')
    }
    return result.text
  })
}

/**
 * 仓内场景 SPARK data 资源适配器使用的开发宿主写入器。
 * POST 携带本次已捕获的 expectedText 作为比较基线；请求最多等待 30 秒且不重试。
 * 只有响应明确声明 not-applied 且 resourceId 精确匹配时才抛出 typed 未应用错误；超时、读回/回执错误均保持未知结果。
 */
export async function writeRepositoryScenarioToHost(resource: Pick<BuiltinScenarioResource, 'resourceId' | 'scenarioId'>,
  text: string, expectedText: string): Promise<void> {
  await withRequestDeadline(async signal => {
    const response = await fetch(REPOSITORY_SCENARIO_ENDPOINT, {method: 'POST', cache: 'no-store', credentials: 'same-origin', redirect: 'error',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({resourceId: resource.resourceId, text, expectedText}), signal})
    const result = await readResponse(response)
    if (!response.ok) {
      if (isRepositoryScenarioFailure(result) && result.outcome === 'not-applied'
        && result.resourceId === resource.resourceId) {
        throw new ScenarioViewWriteNotAppliedError(resource.resourceId, result.code, result.message)
      }
      throw new Error('REPOSITORY_SCENARIO_WRITE_UNKNOWN: 开发宿主未确认仓内场景保存结果')
    }
    if (!isRepositoryScenarioSuccess(result) || result.resourceId !== resource.resourceId
      || result.scenarioId !== resource.scenarioId || result.text !== text
      || !(await isValidRevision(result.text, result.sourceRevision))) {
      throw new Error('REPOSITORY_SCENARIO_WRITE_UNKNOWN: 开发宿主回执与提交内容不匹配')
    }
  })
}

function withRequestDeadline<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  return request(controller.signal).finally(() => clearTimeout(timeout))
}

async function isValidRevision(text: string, sourceRevision: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/u.test(sourceRevision)) return false
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  const actual = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
  return actual === sourceRevision
}

async function readResponse(response: Response): Promise<unknown> {
  if (response.redirected || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('REPOSITORY_SCENARIO_RESPONSE_INVALID: 开发宿主响应不是 JSON')
  }
  try { return await response.json() }
  catch { throw new Error('REPOSITORY_SCENARIO_RESPONSE_INVALID: 开发宿主 JSON 响应无效') }
}
