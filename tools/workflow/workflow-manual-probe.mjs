#!/usr/bin/env node
/**
 * R16 合同探测 + Flow 只读 API（非 SPA）；输出 manualContract 与 live.stepHistory。
 */
import {writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {fetchGetDataPage} from './get-data-page.mjs'
import {loadSparkEnvFromLocal} from './load-spark-env.mjs'
import {ensureSparkEnvFromSession} from './resolve-spark-session.mjs'
import {loadSparkHttpContext} from './spark-http-headers.mjs'
import {readSpaStepHistorySample, todayStamp} from './workflow-spa-evidence.mjs'
import {sampleStepHistoryLive} from './workflow-step-history-sample.mjs'
import {summarizeManualContractProbe} from './workflow-manual-contract.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const stamp = todayStamp()
const FLOW_MONITOR = 'E328FBBF518141973C575D612CD75151'
const FLOW_LIST = '87F0EF6AD1B64D67FFE597E7E3285994'

loadSparkEnvFromLocal()
await ensureSparkEnvFromSession()
const ctx = loadSparkHttpContext()

const contracts = summarizeManualContractProbe()

async function resolveStepHistorySample() {
  const envWf = String(process.env.WORKFLOW_SMOKE_WFID ?? '').trim()
  const envStep = String(process.env.WORKFLOW_SMOKE_STEPID ?? '').trim()
  if (envWf && envStep) {
    return sampleStepHistoryLive(ctx)
  }

  const spaSample = readSpaStepHistorySample(stamp)
  if (spaSample?.wfId && spaSample?.stepId) {
    process.env.WORKFLOW_SMOKE_WFID = spaSample.wfId
    process.env.WORKFLOW_SMOKE_STEPID = spaSample.stepId
    const live = await sampleStepHistoryLive(ctx)
    return {...live, source: spaSample.source ?? 'workflow-spa-smoke'}
  }

  return sampleStepHistoryLive(ctx)
}

async function sampleWorkflowInstanceId() {
  const configured = String(process.env.WORKFLOW_SMOKE_WFID ?? '').trim()
  if (configured) return configured
  const headers = {
    Authorization: `Bearer ${ctx.token}`,
    'X-AppId': ctx.appId,
    'tenant-id': process.env.SPARK_TENANT_NAME ?? 'NewApp',
    'x-FormKey': FLOW_MONITOR,
  }
  const page = await fetchGetDataPage({
    baseUrl: ctx.baseUrl,
    headers,
    tableName: 'WFOBJ_FLOW',
    pageIndex: 1,
    pageSize: 3,
  })
  for (const row of page.items) {
    const wfid = String(row?.wfid ?? row?.WFID ?? row?.rowid ?? row?.RowID ?? '').trim()
    if (wfid) return wfid
  }
  return undefined
}

async function probeListScenarioData() {
  const headers = {
    Authorization: `Bearer ${ctx.token}`,
    'X-AppId': ctx.appId,
    'tenant-id': process.env.SPARK_TENANT_NAME ?? 'NewApp',
    'x-FormKey': FLOW_LIST,
  }
  const page = await fetchGetDataPage({
    baseUrl: ctx.baseUrl,
    headers,
    tableName: 'WFM_FLOW_MODLE',
    pageIndex: 1,
    pageSize: 3,
  })
  return {count: page.count, sampleTitles: page.items.slice(0, 3).map(row => row.TITLE ?? row.Name)}
}

const stepHistory = await resolveStepHistorySample()
const wfId = await sampleWorkflowInstanceId()
const listData = await probeListScenarioData()

function contractRow(ok, okNote, failReason) {
  return ok
    ? {status: 'pass', note: okNote}
    : {status: 'fail', note: failReason}
}

const manualContract = {
  workbench: contractRow(
    contracts.workbench.ok,
    'pagedata 四命名视图合同通过（非 SPA tab 切换）',
    contracts.workbench.reason,
  ),
  design: contractRow(
    contracts.design.ok,
    'FunctionNodeAuth modelId+nodeAuth 合同通过（保存重开须 SPA）',
    contracts.design.reason,
  ),
  runApi: {
    status:
      stepHistory.status === 'pass' ? 'pass' : stepHistory.status === 'skipped' ? 'documented' : 'fail',
    note:
      stepHistory.status === 'pass'
        ? `GetStepHistory Code=200 wfId=${stepHistory.wfId} stepId=${stepHistory.stepId}`
        : stepHistory.reason ?? stepHistory.message ?? 'GetStepHistory 未通过',
  },
  route: contractRow(
    contracts.route.ok,
    contracts.route.evidence ?? 'flow-runtime-route 合同',
    contracts.route.reason,
  ),
}

const out = {
  probedAt: new Date().toISOString(),
  contracts,
  live: {
    wfId,
    stepHistory,
    listData,
    flowMonitorScenario: FLOW_MONITOR,
  },
  manualContract,
}

const outPath = join(root, 'notes', 'evidence', `workflow-manual-probe-${stamp}.json`)
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8')
process.stdout.write(JSON.stringify(out, null, 2))

const contractFail =
  manualContract.workbench.status === 'fail'
  || manualContract.design.status === 'fail'
  || manualContract.runApi.status === 'fail'
  || manualContract.route.status === 'fail'
process.exit(contractFail ? 1 : 0)