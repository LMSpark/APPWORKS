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

function stepDialog(rule, table, state) {
  const {dialog, checkbox, tabs, tabPane, stepTable} = detail.controls
  const [voided, group] = rule.children
  return h(dialog, {...rule.props, id: rule.id, modelValue: state.open, title: state.title,
    'onUpdate:modelValue': state.setOpen}, () => [
    h(checkbox, {...voided.props, modelValue: state.showVoided, 'onUpdate:modelValue': state.setShowVoided}),
    h(tabs, {...group.props, modelValue: state.tab, 'onUpdate:modelValue': state.setTab}, () =>
      group.children.map((pane, index) => h(tabPane, {...pane.props, index, key: pane.props.name}, () =>
        state.open ? h(stepTable, {rule: table, viewKey: state.viewKey, showVoided: state.showVoided,
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
