/**
 * R16 manual checklist 仓内合同探测（不替代浏览器四格，但可自动证伪）。
 */
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FLOW_WORKBENCH_SCENARIO = 'A5BADCEE11D2438CB9E75C2453A220A6'

const WORKBENCH_TAB_BINDINGS = [
  {tab: 'pending', modelName: 'WFOBJ_FLOW_Waiting', viewId: 'workbenchPending'},
  {tab: 'processed', modelName: 'WFOBJ_FLOW_RELATIONLINE_STEP', viewId: 'workbenchProcessed'},
  {tab: 'shared', modelName: 'WFOBJ_FLOW_RELATIONLINE_STEP', viewId: 'workbenchShared'},
  {tab: 'started', modelName: 'WFOBJ_FLOW', viewId: 'workbenchStarted'},
]

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

function hasView(doc, modelName, viewId) {
  const table = doc.tables?.[modelName]
  return Boolean(table?.views?.[viewId])
}

export function checkWorkbenchFourTabsContract() {
  const doc = readJson('config/pages/workflow/flow-workbench/pagedata.json')
  if (doc.scenarioId !== FLOW_WORKBENCH_SCENARIO) {
    return {ok: false, reason: `flow-workbench scenarioId 不是 ${FLOW_WORKBENCH_SCENARIO}`}
  }
  const missing = []
  for (const binding of WORKBENCH_TAB_BINDINGS) {
    if (!hasView(doc, binding.modelName, binding.viewId)) {
      missing.push(`${binding.tab}:${binding.modelName}@${binding.viewId}`)
    }
  }
  if (missing.length) return {ok: false, reason: `缺少命名视图: ${missing.join(', ')}`}
  return {ok: true, bindings: WORKBENCH_TAB_BINDINGS}
}

export function checkDesignNodeAuthContract() {
  const doc = readJson('config/pages/workflow/flow-design/pagedata.json')
  const binding = doc.tables?.FunctionNodeAuth?.modelBinding
  const view = doc.tables?.FunctionNodeAuth?.views?.nodeAuth
  if (!binding?.modelName || binding.modelName !== 'FunctionNodeAuth') {
    return {ok: false, reason: 'FunctionNodeAuth modelBinding 缺失'}
  }
  if (!binding.modelId) return {ok: false, reason: 'FunctionNodeAuth 缺少 G0 modelId'}
  if (!view) return {ok: false, reason: '缺少 nodeAuth 命名视图'}
  return {ok: true, modelId: binding.modelId}
}

export function checkFlowRunRouteContract() {
  const testPath = join(root, 'tests/runtime/page/structured-config/workflow/flow-run-detail/flow-runtime-route.test.ts')
  if (!readFileSync(testPath, 'utf8').includes('buildFlowRunPageRoute')) {
    return {ok: false, reason: 'flow-runtime-route.test.ts 缺失路由合同'}
  }
  return {ok: true, evidence: 'tests/runtime/page/structured-config/workflow/flow-run-detail/flow-runtime-route.test.ts'}
}

export function summarizeManualContractProbe() {
  return {
    workbench: checkWorkbenchFourTabsContract(),
    design: checkDesignNodeAuthContract(),
    route: checkFlowRunRouteContract(),
    probedAt: new Date().toISOString(),
  }
}