/**
 * @module app:lowcode/resources/database/catalog/scenario
 * 职责：校验数据库目录宿主明确提供的正式 Base_DataSet.rowid，不推断或替换页面身份。
 * AI用途：维护目录装配时，确保一次查询只属于本次正式导航绑定的数据空间。
 */
import {DATA_SPACE_DESIGN_FORM_KEY, DataSpaceRuntimeApi, type DataSpaceApi} from '@spark-appworks/spark-lowcode-api'
import {lowcodeApi, lowcodeCatalogDataSpace, lowcodeHttp} from '../../../lowcode-runtime'

/** 元数据、模型运行与命令均属于同一次目录身份；应用切换后须重新装配。 */
type DatabaseCatalogScope = Readonly<{
  /** 本次企业目录或应用范围内的正式元数据入口。 */
  dataSpace: DataSpaceApi
  /** 与本次身份一致的模型查询及保存责任方，继续执行原数据权限守卫。 */
  runtime: DataSpaceRuntimeApi
  /** 本次应用代次和认证上下文的内部比较值；仅用于失效检查，不作业务身份。 */
  fingerprint: string
  /** 复核原应用代次及认证上下文；切换或失效时抛错，中止旧请求。 */
  assertCurrent: () => void
  /** 仅供数据资源适配器捕获本次正式请求范围。 */
  readScope: () => ReturnType<typeof lowcodeApi.readAuthenticatedRequestScope>
}>

/** 企业目录复用正式认证元数据入口；运行owner包含目录宿主的应用代次守卫。 */
export function readDatabaseCatalogScope(): DatabaseCatalogScope {
  const applicationId = lowcodeApi.application.get()?.application.id ?? null
  const applicationRevision = lowcodeApi.application.revision
  const readScope = applicationId === null
    ? () => lowcodeApi.readAuthenticatedRequestScope()
    : () => lowcodeApi.readRequestScope()
  const scope = readScope()
  const assertCurrent = (): void => {
    const failure = () => new Error('数据库目录请求所属应用或登录身份已变化')
    if ((lowcodeApi.application.get()?.application.id ?? null) !== applicationId
      || lowcodeApi.application.revision !== applicationRevision) throw failure()
    let current: ReturnType<typeof readScope>
    try {current = readScope()} catch {throw failure()}
    if (current.token !== scope.token || current.headers['X-AppId'] !== scope.headers['X-AppId']) throw failure()
  }
  const dataSpace = applicationId === null ? lowcodeCatalogDataSpace : lowcodeApi.dataSpace
  const runtime = applicationId === null
    ? new DataSpaceRuntimeApi({http: lowcodeHttp, readScope: () => {assertCurrent(); return readScope()}})
    : dataSpace.runtime
  return {dataSpace, runtime, fingerprint: JSON.stringify([applicationId, applicationRevision, scope.token]), assertCurrent,
    readScope: () => {assertCurrent(); return readScope()}}
}

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
  /** 宿主本次目录或应用作用域中的正式数据入口。 */
  dataSpace: DataSpaceApi
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
  await input.dataSpace.design.readModelBatch({
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
  dataSpace: DataSpaceApi
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
    dataSpace: input.dataSpace,
    preferredScenarioId: preferred,
    metaNames: input.metaNames,
    assertCurrent: input.assertCurrent,
  })
}
