/**
 * @module app:lowcode/resources/shared/repository-scenarios/repository-scenario-protocol
 * 仓内场景开发宿主与浏览器资源适配器之间唯一的传输合同。
 * 本模块只包含路径、DTO 和运行时结构校验，不依赖 Node 或宿主实现。
 * AI用途：浏览器客户端、Vite插件和Node存储共享同一端点及请求/响应形状。
 */
export const REPOSITORY_SCENARIO_ENDPOINT = '/__spark/repository-scenarios'

/** 成功读取或写入时返回的仓内资源身份、精确原文及其 SHA-256 修订值。 */
export type RepositoryScenarioSuccess = Readonly<{
  resourceId: string
  scenarioId: string
  text: string
  sourceRevision: string
}>

/** 仓内场景历史目录中的真实编号清单。 */
export type RepositoryScenarioHistoryList = Readonly<{
  resourceId: string
  scenarioId: string
  versions: ReadonlyArray<Readonly<{version: number; fileName: string; lastModified: number | null}>>
}>

/** 精确编号的只读历史原文。 */
export type RepositoryScenarioVersionSuccess = Readonly<{
  resourceId: string
  scenarioId: string
  version: number
  fileName: string
  text: string
  sourceRevision: string
}>

/**
 * 请求失败结果。`not-applied` 仅代表服务端能证明替换尚未开始；`unknown` 要求调用方只读核验，不能重放写入。
 * resourceId 为 null 表示服务端尚未确认目标身份，客户端不得据此清除某个资源的待保存状态。
 */
export type RepositoryScenarioFailure = Readonly<{
  resourceId: string | null
  outcome: 'not-applied' | 'unknown'
  code: string
  message: string
  version?: number
}>

/** 判断未知响应是否满足失败 DTO 结构；不对未应用语义作真实性推断。 */
export function isRepositoryScenarioFailure(value: unknown): value is RepositoryScenarioFailure {
  if (!isRecord(value)) return false
  const record = value
  return (record['resourceId'] === null || typeof record['resourceId'] === 'string')
    && (record['outcome'] === 'not-applied' || record['outcome'] === 'unknown')
    && typeof record['code'] === 'string' && typeof record['message'] === 'string'
    && (record['version'] === undefined || isNonnegativeSafeInteger(record['version']))
}

/** 判断不可信传输值是否为非负安全整数。 */
export function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** 判断未知响应是否满足成功 DTO 结构；资源身份及修订匹配由调用方进一步核验。 */
export function isRepositoryScenarioSuccess(value: unknown): value is RepositoryScenarioSuccess {
  if (!isRecord(value)) return false
  const record = value
  return typeof record['resourceId'] === 'string' && typeof record['scenarioId'] === 'string'
    && typeof record['text'] === 'string' && typeof record['sourceRevision'] === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
