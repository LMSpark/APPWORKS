/**
 * 从 lingmacn 待办样本解析 wfId+stepId 并探测 GetStepHistory（须 Code=200）。
 * E328 场景若未注册 WFOBJ_FLOW_Waiting，回退到 Base_DataModel 中同名模型的其它 dataSet。
 */
import {collectAllPages, postGetDataEnvelope} from './get-data-page.mjs'
import {buildSparkAuthHeaders} from './spark-http-headers.mjs'

const FLOW_MONITOR = 'E328FBBF518141973C575D612CD75151'

export async function fetchLoginUserInfo(ctx) {
  const response = await fetch(`${ctx.baseUrl}/api/LoginAuthority/GetUserInfo`, {
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      'X-AppId': ctx.appId,
    },
  })
  const json = await response.json()
  if (json?.Code !== 200) {
    throw new Error(typeof json?.Message === 'string' ? json.Message : `GetUserInfo Code=${json?.Code}`)
  }
  return json.Result?.userInfo ?? json.Result ?? {}
}

async function findWaitingFormKeys(ctx) {
  const headers = buildSparkAuthHeaders(ctx)
  const {items} = await collectAllPages({
    baseUrl: ctx.baseUrl,
    headers,
    tableName: 'Base_DataModel',
    pageSize: 500,
    maxRows: 50_000,
  })
  const keys = []
  for (const row of items) {
    if (String(row?.Name ?? '').trim() !== 'WFOBJ_FLOW_Waiting') continue
    const dataSetId = String(row?.dataSetId ?? row?.DataSetId ?? '').trim()
    if (dataSetId && !keys.includes(dataSetId)) keys.push(dataSetId)
  }
  if (!keys.includes(FLOW_MONITOR)) keys.unshift(FLOW_MONITOR)
  return keys
}

async function queryWaitingPage(ctx, formKey) {
  const headers = {
    Authorization: `Bearer ${ctx.token}`,
    'X-AppId': ctx.appId,
    'tenant-id': ctx.tenantId ?? 'NewApp',
    'x-FormKey': formKey,
    'Content-Type': 'application/json',
  }
  return postGetDataEnvelope({
    baseUrl: ctx.baseUrl,
    headers,
    body: {
      PageParam: {index: 1, size: 80},
      Table: [
        {
          Name: 'WFOBJ_FLOW_Waiting',
          Type: '数据库表',
          PrimaryKeyFields: 'rowid',
          OutputType: 'Table',
        },
      ],
    },
  })
}

function pickPendingRowForUser(rows, userInfo) {
  const userName = String(userInfo?.UserName ?? '').trim()
  const loginName = String(userInfo?.LoginName ?? '').trim()
  const userId = String(userInfo?.ID ?? '').trim()
  return (
    rows.find(row => userName && String(row?.UserName ?? '').trim() === userName)
    ?? rows.find(row => userId && String(row?.UserID ?? '').trim() === userId)
    ?? rows.find(row => loginName && String(row?.UserID ?? '').trim() === loginName)
    ?? rows[0]
  )
}

async function fetchStepHistoryByIds(ctx, wfId, stepId) {
  const url = new URL(`${ctx.baseUrl}/api/Flow/GetStepHistory`)
  url.searchParams.set('wfId', wfId)
  url.searchParams.set('stepId', stepId)
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      'X-AppId': ctx.appId,
    },
  })
  const json = await response.json()
  return {
    status: json?.Code === 200 ? 'pass' : 'fail',
    code: json?.Code,
    message: typeof json?.Message === 'string' ? json.Message.slice(0, 200) : undefined,
    wfId,
    stepId,
    httpStatus: response.status,
    resultShape: Array.isArray(json?.Result) ? `array(${json.Result.length})` : typeof json?.Result,
    source: 'env',
  }
}

export async function sampleStepHistoryLive(ctx) {
  const envWf = String(process.env.WORKFLOW_SMOKE_WFID ?? '').trim()
  const envStep = String(process.env.WORKFLOW_SMOKE_STEPID ?? '').trim()
  if (envWf && envStep) {
    return fetchStepHistoryByIds(ctx, envWf, envStep)
  }

  const userInfo = await fetchLoginUserInfo(ctx)
  const formKeys = await findWaitingFormKeys(ctx)
  let lastError
  for (const formKey of formKeys) {
    try {
      const page = await queryWaitingPage(ctx, formKey)
      const row = pickPendingRowForUser(page.items, userInfo)
      if (!row) continue
      const wfId = String(row?.wfid ?? row?.WFOBJID ?? '').trim()
      const stepId = String(row?.StepID ?? row?.rowid ?? '').trim()
      if (!wfId || !stepId) continue
      const url = new URL(`${ctx.baseUrl}/api/Flow/GetStepHistory`)
      url.searchParams.set('wfId', wfId)
      url.searchParams.set('stepId', stepId)
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${ctx.token}`,
          'X-AppId': ctx.appId,
        },
      })
      const json = await response.json()
      const live = {
        status: json?.Code === 200 ? 'pass' : 'fail',
        code: json?.Code,
        message: typeof json?.Message === 'string' ? json.Message.slice(0, 200) : undefined,
        wfId,
        stepId,
        httpStatus: response.status,
        resultShape: Array.isArray(json?.Result) ? `array(${json.Result.length})` : typeof json?.Result,
        formKey,
        pendingRowId: String(row?.rowid ?? ''),
        userName: String(row?.UserName ?? ''),
      }
      if (live.status === 'pass') return live
      lastError = live
    } catch (cause) {
      lastError = {status: 'fail', message: cause instanceof Error ? cause.message : String(cause), formKey}
    }
  }
  if (lastError) return lastError
  return {
    status: 'skipped',
    reason: '未在 lingmacn 上解析到可查询的 WFOBJ_FLOW_Waiting 待办行',
  }
}