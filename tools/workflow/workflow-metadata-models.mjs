/**
 * workflow G0：从 Base_DataModel 分页扫描解析 modelId（客户端按 dataSetId/Name 筛选）。
 */
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {collectAllPages, fetchGetDataPage, parseGetDataResponse} from './get-data-page.mjs'
import {WORKFLOW_METADATA_DESIGN_FORM_KEY} from './spark-http-headers.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const workflowScenarios = [
  {key: 'flowModelList', scenarioId: '87F0EF6AD1B64D67FFE597E7E3285994'},
  {key: 'flowDesign', scenarioId: '6E462C4A39EE0D96F4D1A28FFE887C89'},
  {key: 'flowMonitor', scenarioId: 'E328FBBF518141973C575D612CD75151'},
  /** lingmacn：Waiting/RELATIONLINE/FORM 与 E328 监控空间共存的运行工作台空间（G0 探测）。 */
  {key: 'flowWorkbench', scenarioId: 'A5BADCEE11D2438CB9E75C2453A220A6'},
]

export const scenarioModelNames = {
  flowModelList: ['WFM_FLOW_MODLE', 'Base_UserInfo'],
  flowDesign: [
    'WFM_FLOW_MODLE',
    'WFM_FLOW_NODE',
    'WFM_NODE_REALATION',
    'WFM_WORKFORM',
    'FunctionNodeAuth',
    '_Base_FunctionNode',
    'Base_AppSystemList',
  ],
  flowMonitor: ['WFOBJ_FLOW', 'View_FlowObjList'],
  flowWorkbench: ['WFOBJ_FLOW_Waiting', 'WFOBJ_FLOW_RELATIONLINE_STEP', 'WFOBJ_FLOW', 'WFOBJ_FLOW_FORM'],
}

const WORKBENCH_SHARED_MODELS = ['WFOBJ_FLOW_Waiting', 'WFOBJ_FLOW_RELATIONLINE_STEP']

/** 解析 Waiting+RELATIONLINE 共同归属的 dataSetId；多候选时取首个共享空间并附诊断。 */
export function resolveWorkflowWorkbenchScenario(rows) {
  const buckets = new Map()
  for (const row of rows) {
    const name = formalModelName(row)
    if (!WORKBENCH_SHARED_MODELS.includes(name)) continue
    const dataSetId = formalDataSetId(row)
    if (!dataSetId) continue
    if (!buckets.has(dataSetId)) buckets.set(dataSetId, new Set())
    buckets.get(dataSetId).add(name)
  }
  const shared = [...buckets.entries()]
    .filter(([, names]) => WORKBENCH_SHARED_MODELS.every(model => names.has(model)))
    .map(([dataSetId]) => dataSetId)
  const configured = workflowScenarios.find(entry => entry.key === 'flowWorkbench')?.scenarioId ?? ''
  return {
    configuredScenarioId: configured,
    sharedDataSetIds: shared,
    recommendedScenarioId: shared.includes(configured) ? configured : shared[0] ?? configured,
    ambiguous: shared.length > 1,
  }
}

let repositoryScenarioIds = null

export function loadRepositoryScenarioIds() {
  if (repositoryScenarioIds) return repositoryScenarioIds
  const doc = JSON.parse(readFileSync(join(root, 'config/pages/system-scenarios.json'), 'utf8'))
  repositoryScenarioIds = new Set((doc.scenarios ?? []).map(entry => String(entry.scenarioId ?? '').trim()).filter(Boolean))
  return repositoryScenarioIds
}

export function formalDataSetId(row) {
  return String(row?.dataSetId ?? row?.DataSetId ?? row?.datasetid ?? '').trim()
}

export function formalModelName(row) {
  return String(row?.Name ?? row?.name ?? '').trim()
}

export function formalRowId(row) {
  return String(row?.rowid ?? row?.RowID ?? row?.modelId ?? '').trim()
}

/**
 * @param {Readonly<{baseUrl: string; headers: Record<string, string>}>} ctx
 */
async function loadBaseDataModelRows(ctx) {
  return collectAllPages({
    baseUrl: ctx.baseUrl,
    headers: ctx.headers,
    tableName: 'Base_DataModel',
    pageSize: 500,
    maxRows: 50_000,
  })
}

export function pickModelsForScenario(rows, scenarioId, names) {
  const filtered = rows.filter(row => formalDataSetId(row) === scenarioId && names.includes(formalModelName(row)))
  const picked = {}
  for (const name of names) {
    const hits = filtered.filter(row => formalModelName(row) === name)
    if (hits.length === 1) picked[name] = formalRowId(hits[0])
  }
  return picked
}

const FORMAL_TABLE_TYPES = new Set(['数据库表', '表'])

/** 数据库表模型缺 PrimaryKeyFields 时 runtime readModelBatch 失败（与 GetData 直查无关）。 */
export function assessWorkflowFormalTablePrimaryKeys(rows) {
  const repair = []
  for (const entry of workflowScenarios) {
    for (const name of scenarioModelNames[entry.key] ?? []) {
      const modelRow = rows.find(row => formalDataSetId(row) === entry.scenarioId && formalModelName(row) === name)
      if (!modelRow) continue
      const type = String(modelRow.Type ?? modelRow.type ?? '').trim()
      if (!FORMAL_TABLE_TYPES.has(type)) continue
      const primaryKeyFields = String(modelRow.PrimaryKeyFields ?? modelRow.primaryKeyFields ?? '').trim()
      if (primaryKeyFields) continue
      repair.push({
        scenarioKey: entry.key,
        scenarioId: entry.scenarioId,
        modelName: name,
        modelId: formalRowId(modelRow),
        metaName: String(modelRow.MetaName ?? modelRow.metaName ?? name).trim(),
        dbId: String(modelRow.DbId ?? modelRow.dbId ?? '').trim(),
        suggestedPrimaryKeyFields: 'rowid',
      })
    }
  }
  return Object.freeze({
    ready: repair.length === 0,
    repair,
    hint: repair.length
      ? '元数据设计：为各表模型保存 PrimaryKeyFields（建议 rowid）；并确认 View_TblList/Base_TblField 仅保留一个非租户主键'
      : '',
  })
}

/**
 * @param {Readonly<{baseUrl: string; headers: Record<string, string>}>} ctx
 */
export async function readWorkflowModelMap(ctx) {
  const {items: rows, total, pages} = await loadBaseDataModelRows(ctx)
  const scenarios = {}
  for (const entry of workflowScenarios) {
    const names = scenarioModelNames[entry.key] ?? []
    const required = pickModelsForScenario(rows, entry.scenarioId, names)
    const scopedAll =
      entry.key === 'flowMonitor'
        ? rows
            .filter(row => formalDataSetId(row) === entry.scenarioId)
            .reduce((bag, row) => {
              const name = formalModelName(row)
              const id = formalRowId(row)
              if (name && id && !(name in bag)) bag[name] = id
              return bag
            }, {})
        : {}
    scenarios[entry.key] = {
      scenarioId: entry.scenarioId,
      models: entry.key === 'flowMonitor'
        ? {...scopedAll, ...required}
        : {...required},
    }
  }
  const workbenchResolution = resolveWorkflowWorkbenchScenario(rows)
  const formalTablePrimaryKey = assessWorkflowFormalTablePrimaryKeys(rows)
  const globalModels = rows.reduce((bag, row) => {
    const name = formalModelName(row)
    const id = formalRowId(row)
    if (name && id && !bag[name]) bag[name] = id
    return bag
  }, {})

  return {
    scannedAt: new Date().toISOString(),
    designFormKey: WORKFLOW_METADATA_DESIGN_FORM_KEY,
    transport: 'DataOperation/GetData',
    scan: {baseDataModelRows: rows.length, reportedTotal: total, pages},
    scenarios,
    globalModels,
    workbenchResolution,
    formalTablePrimaryKey,
  }
}

export function listMissingModels(output) {
  const missing = []
  for (const entry of workflowScenarios) {
    const models = output.scenarios?.[entry.key]?.models ?? {}
    for (const name of scenarioModelNames[entry.key] ?? []) {
      if (!models[name]) missing.push(`${entry.key}:${name}`)
    }
  }
  return missing
}

export function probeWorkflowModelsReady(output) {
  const missing = listMissingModels(output)
  return {
    ready: missing.length === 0,
    missing,
    wfmAny: workflowScenarios.some(entry =>
      Object.keys(output.scenarios?.[entry.key]?.models ?? {}).some(name => name.startsWith('WFM_')),
    ),
  }
}

/**
 * @param {Readonly<{baseUrl: string; token: string; appId: string; tenantId?: string}>} ctx
 */
export async function probeRuntimeWfmRowCount(ctx) {
  const headers = {
    Authorization: `Bearer ${ctx.token}`,
    'X-AppId': ctx.appId,
    'tenant-id': ctx.tenantId ?? 'NewApp',
    'x-FormKey': workflowScenarios[0].scenarioId,
  }
  const response = await fetch(`${ctx.baseUrl.replace(/\/$/, '')}/api/DataOperation/GetData`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...headers},
    body: JSON.stringify({
      PageParam: {index: 1, size: 1},
      Table: [{
        Name: 'WFM_FLOW_MODLE',
        Type: '表',
        PrimaryKeyFields: 'rowid',
        OutputType: 'Table',
        inputParams: [],
        DISTINCT: false,
        IsBusinessMain: 1,
      }],
    }),
  })
  const json = await response.json()
  try {
    const page = parseGetDataResponse(json)
    return {count: page.count, code: page.code}
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return {count: 0, code: json?.Code, error: message.slice(0, 200)}
  }
}

/**
 * @param {Readonly<{baseUrl: string; headers: Record<string, string>; dataSpaceId: string}>} ctx
 */
export async function probeDataSpaceRow(ctx) {
  const page = await fetchGetDataPage({
    baseUrl: ctx.baseUrl,
    headers: ctx.headers,
    tableName: 'Base_DataSet',
    filter: {Type: 'and', Filters: [{Field: 'rowid', ValueFun: {Value: ctx.dataSpaceId}}]},
    pageIndex: 1,
    pageSize: 2,
  })
  const hit = page.items.find(row => formalRowId(row) === ctx.dataSpaceId)
  return {found: Boolean(hit), name: hit ? formalModelName(hit) || String(hit.Name ?? '') : undefined}
}