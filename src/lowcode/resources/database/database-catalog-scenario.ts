/**
 * @module app:lowcode/resources/database/database-catalog-scenario
 * 职责：校验数据库目录宿主明确提供的正式 Base_DataSet.rowid，不推断或替换页面身份。
 * AI用途：维护目录装配时，确保一次查询只属于本次正式导航绑定的数据空间。
 */
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {lowcodeApi} from '../../lowcode-runtime'

/** 数据空间身份说明，供精确身份失败提示使用。 */
export const DATABASE_CATALOG_RESOLVE_HINT =
  'dataSpaceId 须为 Base_DataSet.rowid（= DataSet.scenarioId = x-FormKey），且必须来自当前正式页面绑定。'

/**
 * 目录装配可选的宿主预检结果。
 * resolvedDataSpaceId 仅用于传递已确认的同一目标；不能覆盖页面导航绑定。
 */
export type DatabaseCatalogLoadOptions = Readonly<{
  /** 宿主已核验的正式 Base_DataSet.rowid；必须与当前页面目标一致。 */
  resolvedDataSpaceId?: string
  /** 旧管理入口传入的正式数据库行主键；仅用于本 DataView 的精确过滤。 */
  databaseId?: string
}>

/** 将查询失败明确保留为当前正式目标失败，不附加候选空间诊断。 */
export function formatDatabaseCatalogResolveFailure(cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause)
  return new Error(`${DATABASE_CATALOG_RESOLVE_HINT} ${detail}`)
}

type ResolveDatabaseCatalogScenarioInput = Readonly<{
  /** 当前正式页面绑定的 DataSet.scenarioId。 */
  preferredScenarioId: string
  /** 本次页面必须存在的正式模型集合。 */
  metaNames: readonly string[]
  /** 身份/应用发生变化时中止当前核验。 */
  assertCurrent: () => void
}>

/**
 * 只对宿主给出的精确 FormKey 执行正式模型批量核验。
 * 缺少目标或模型时直接失败，不搜索导航、蓝图或目录中的其它数据空间。
 */
export async function resolveDatabaseCatalogScenarioId(input: ResolveDatabaseCatalogScenarioInput): Promise<string> {
  const dataSpaceId = input.preferredScenarioId.trim()
  if (!dataSpaceId) throw formatDatabaseCatalogResolveFailure(new Error('页面缺少正式 dataSpaceId'))
  input.assertCurrent()
  await lowcodeApi.dataSpace.design.readModelBatch({
    designScenarioId: DATA_SPACE_DESIGN_FORM_KEY,
    dataSpaceId,
    metaNames: input.metaNames,
    assertCurrent: input.assertCurrent,
  })
  input.assertCurrent()
  return dataSpaceId
}

/** loadCatalog 统一确认 DataSpace 身份；预检值只能与当前页面目标相同。 */
export type ResolveDatabaseCatalogDataSpaceIdInput = Readonly<{
  preferredScenarioId: string
  metaNames: readonly string[]
  options: DatabaseCatalogLoadOptions
  assertCurrent: () => void
}>

export async function resolveDatabaseCatalogDataSpaceId(input: ResolveDatabaseCatalogDataSpaceIdInput): Promise<string> {
  const preferred = input.preferredScenarioId.trim()
  const resolved = input.options.resolvedDataSpaceId?.trim()
  if (resolved && resolved !== preferred) {
    throw formatDatabaseCatalogResolveFailure(new Error('宿主预检身份与当前页面绑定不一致'))
  }
  return resolveDatabaseCatalogScenarioId({
    preferredScenarioId: preferred,
    metaNames: input.metaNames,
    assertCurrent: input.assertCurrent,
  })
}
