/**
 * @module app:lowcode/resources/shared/repository-scenarios/repository-scenario-host-client
 * 职责：为仓内场景 SPARK data 资源适配器访问 Vite 开发宿主提供受约束的读写客户端。
 * 边界：GET读取新鲜文本；POST携带捕获的expectedText；仅精确资源的明确未应用响应可转成 typed 拒绝，超时/回读错误保持未知并且不重试。
 * AI用途：仅由仓内场景资源执行器调用，不作为页面或通用文件API使用。
 */
import {ScenarioViewVersionNotAppliedError, ScenarioViewWriteNotAppliedError} from '@spark-appworks/spark-project-model'
import {isNonnegativeSafeInteger, isRepositoryScenarioFailure, isRepositoryScenarioSuccess, REPOSITORY_SCENARIO_ENDPOINT, type RepositoryScenarioHistoryList, type RepositoryScenarioVersionSuccess} from './repository-scenario-protocol'
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

/** 列出仓内开发历史；开发宿主没有历史目录时返回空列表，不创建任何文件。 */
export async function listRepositoryScenarioVersions(resource: Pick<BuiltinScenarioResource, 'resourceId' | 'scenarioId'>): Promise<RepositoryScenarioHistoryList['versions']> {
  const query = new URLSearchParams({resourceId: resource.resourceId, history: 'list'})
  return withRequestDeadline(async signal => {
    const response = await fetch(`${REPOSITORY_SCENARIO_ENDPOINT}?${query.toString()}`,
      {cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal})
    const result = await readResponse(response)
    if (!response.ok || !isRecord(result) || result['resourceId'] !== resource.resourceId || result['scenarioId'] !== resource.scenarioId
      || !Array.isArray(result['versions']) || !result['versions'].every(isVersionSummary)) {
      throw new Error('REPOSITORY_SCENARIO_HISTORY_READ_FAILED: 开发宿主未返回匹配的仓内历史清单')
    }
    return result['versions'].map(item => Object.freeze({...item}))
  })
}

/** 读取指定编号的仓内快照原文，不修改活动场景文件。 */
export async function readRepositoryScenarioVersion(resource: Pick<BuiltinScenarioResource, 'resourceId' | 'scenarioId'>,
  version: number): Promise<string> {
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('REPOSITORY_SCENARIO_VERSION_INVALID: 历史编号无效')
  const query = new URLSearchParams({resourceId: resource.resourceId, version: String(version)})
  return withRequestDeadline(async signal => {
    const response = await fetch(`${REPOSITORY_SCENARIO_ENDPOINT}?${query.toString()}`,
      {cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal})
    const result = await readResponse(response)
    if (!response.ok || !isVersionSuccess(result) || result.resourceId !== resource.resourceId || result.scenarioId !== resource.scenarioId
      || result.version !== version || result.fileName !== `${version}__pagedata.json`
      || !(await isValidRevision(result.text, result.sourceRevision))) {
      throw new Error('REPOSITORY_SCENARIO_HISTORY_READ_FAILED: 开发宿主未返回匹配的历史快照')
    }
    return result.text
  })
}

/** 浏览器开发宿主的单次场景快照创建请求，携带已捕获的scope和活动文件基线。 */
export type CreateRepositoryScenarioVersionCommand = Readonly<{
  /** 资源注册表中的仓内文件身份。 */
  resource: Pick<BuiltinScenarioResource, 'resourceId' | 'scenarioId'>
  /** 创建attempt所属的原始请求scope。 */
  scope: string
  /** 调用方按已列出的历史编号预先分配的N。 */
  version: number
  /** 精确快照原文。 */
  text: string
  /** 上传前核对的活动文件原文。 */
  expectedText: string
  /** 请求发送前同步持久化原attempt身份。 */
  onAttempt: (attempt: Readonly<{scenarioId: string; resourceId: string; scope: string; version: number; fileName: string; text: string}>) => void
}>

/** 按调用方在写入前确定的编号独占创建；任何未知结果都不重发请求。 */
export async function createRepositoryScenarioVersion(command: CreateRepositoryScenarioVersionCommand): Promise<void> {
  const {resource, scope, version, text, expectedText, onAttempt} = command
  if (!Number.isSafeInteger(version) || version < 0 || !scope.trim()) throw new Error('REPOSITORY_SCENARIO_VERSION_INVALID: 历史attempt身份无效')
  const fileName = `${version}__pagedata.json`
  onAttempt(Object.freeze({scenarioId: resource.scenarioId, resourceId: resource.resourceId, scope, version, fileName, text}))
  await withRequestDeadline(async signal => {
    const response = await fetch(REPOSITORY_SCENARIO_ENDPOINT, {method: 'POST', cache: 'no-store', credentials: 'same-origin', redirect: 'error',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({operation: 'create-version', resourceId: resource.resourceId,
        version, text, expectedText}), signal})
    const result = await readResponse(response)
    if (!response.ok) {
      if (isRepositoryScenarioFailure(result) && result.outcome === 'not-applied'
        && result.resourceId === resource.resourceId && result.version === version) {
        throw new ScenarioViewVersionNotAppliedError(resource.resourceId, scope, version, result.message)
      }
      throw new Error('REPOSITORY_SCENARIO_VERSION_UNKNOWN: 开发宿主未确认仓内历史快照结果')
    }
    if (!isVersionSuccess(result) || result.resourceId !== resource.resourceId || result.scenarioId !== resource.scenarioId
      || result.version !== version || result.fileName !== fileName || result.text !== text
      || !(await isValidRevision(result.text, result.sourceRevision))) {
      throw new Error('REPOSITORY_SCENARIO_VERSION_UNKNOWN: 开发宿主回执与历史attempt不匹配')
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

function isRecord(value: unknown): value is Record<string, unknown> {return typeof value === 'object' && value !== null && !Array.isArray(value)}
function isVersionSummary(value: unknown): value is RepositoryScenarioHistoryList['versions'][number] {
  if (!isRecord(value)) return false
  const version = value['version'], lastModified = value['lastModified']
  return isNonnegativeSafeInteger(version) && value['fileName'] === `${version}__pagedata.json`
    && (lastModified === null || typeof lastModified === 'number' && Number.isFinite(lastModified))
}
function isVersionSuccess(value: unknown): value is RepositoryScenarioVersionSuccess {
  if (!isRecord(value)) return false
  const version = value['version']
  return typeof value['resourceId'] === 'string' && typeof value['scenarioId'] === 'string'
    && isNonnegativeSafeInteger(version) && value['fileName'] === `${version}__pagedata.json`
    && typeof value['text'] === 'string' && typeof value['sourceRevision'] === 'string'
}
