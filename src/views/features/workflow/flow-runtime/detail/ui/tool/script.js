/* global $page, h */
let detail

async function __init__() {
  detail = await $page.invokeHostCommand('workflow.connectDetail')
}

function bindDetail() {
  const state = detail?.status()
  return {status: state?.loading ? '正在读取运行详情…' : '', error: state?.error ?? '',
    retryable: !!state && !state.loading && !state.ready}
}

function bindIdentity() { return {title: detail?.identity() ?? ''} }
function bindOpenRun() { return {visible: detail?.canOpenRun() === true} }
function bindGraph() {
  const graph = detail?.graph()
  return graph ? {...graph, visible: true} : {visible: false}
}
function bindGraphUnavailable() {
  const state = detail?.status()
  return {visible: !!state && !state.loading && !state.ready}
}

function bindWaitingStep({row, dataSource}) {
  const waiting = $page.resolveView('A5BADCEE11D2438CB9E75C2453A220A6@WFOBJ_FLOW_Waiting@default')
  if (!row || !dataSource || !waiting || dataSource.dataSet !== waiting.dataSet) return {visible: false}
  try {
    dataSource.captureReadRow(row, ['rowid', 'WFOBJID'])()
    waiting.captureReadResult()()
  } catch {
    return {visible: false}
  }
  const id = dataSource.getPkKey(row)
  const instance = row.WFOBJID
  return {visible: id !== undefined && typeof instance === 'string' && instance.length > 0
    && waiting.queryContext.wfid === instance && waiting.rows.some(item =>
      waiting.fieldAccess(item, 'wfid').read === 'visible' && item.wfid === instance
      && waiting.fieldAccess(item, 'StepID').read === 'visible' && item.StepID === id)}
}

function stepStateError() {
  const states = $page.resolveView('A5BADCEE11D2438CB9E75C2453A220A6@AppendStepStates@default')
  if (!states) return '缺少流程步骤状态字典'
  if (states.loadingError) return '流程步骤状态字典读取失败：' + states.loadingError.message
  return ''
}

function stepDialog(rule, table, state) {
  const {dialog, checkbox, tabs, tabPane, stepTable} = detail.controls
  const [voided, group] = rule.children
  return h(dialog, {...rule.props, id: rule.id, modelValue: state.open, title: state.title,
    'onUpdate:modelValue': state.setOpen}, () => [
    h(checkbox, {...voided.props, modelValue: state.showVoided, 'onUpdate:modelValue': state.setShowVoided}),
    h(tabs, {...group.props, modelValue: state.tab, 'onUpdate:modelValue': state.setTab}, () =>
      group.children.map((pane, index) => h(tabPane, {...pane.props, index, key: pane.props.name}, () =>
        state.open ? h(stepTable, {rule: table, viewKey: state.viewKey, showVoided: state.showVoided, statusError: stepStateError(),
          ...state.filters(pane.props.name)}) : null))),
  ])
}

function RenderFlowStepDrilldowns({node, edge, stepTable}) {
  if (!detail) return null
  const state = detail.drilldown()
  return [stepDialog(node, stepTable, state.node), stepDialog(edge, stepTable, state.edge)]
}

async function retryDetail() { await $page.invokeHostCommand('workflow.retryDetail') }
async function openRun() { await $page.invokeHostCommand('workflow.openRun') }
