/* global $page, h */
let workflow

async function __init__() { workflow = await $page.invokeHostCommand('workflow.connect') }

function bindShell() {
  const shell = workflow?.shell()
  return {status: shell?.status ?? '', error: shell?.error ?? '', retryable: shell?.retryable === true}
}

function bindNavigationRetry() {
  return {visible: workflow?.shell().reloadBlocked === true, disabled: workflow?.hasPendingWork() === true}
}

function bindActions(bar) {
  return {...bar, children: bar.children.flatMap(button => {
    const {visible, disabled, loading} = workflow.actionState(button.id)
    return visible ? [{...button, props: {...button.props, disabled, loading}}] : []
  })}
}

function RenderWorkflowActions({bar}) {
  return workflow?.shell().ready ? h(workflow.controls.render, {config: bindActions(bar)}) : null
}

function workflowFormTabs(controls, rule, state) {
  if (!state.tabs.length) return h(controls.empty, rule.empty)
  const [pane] = rule.tabs.children
  return h(controls.tabs, {...rule.tabs.props, modelValue: state.active, 'onUpdate:modelValue': state.select}, () =>
    state.tabs.map((tab, index) => h(controls.pane, {...pane.props, key: tab.tabKey, index, label: tab.label, name: tab.tabKey}, () => {
      if (!tab.routeFound) return h(controls.empty, {description: tab.routeError})
      if (!tab.routeLocation) return null
      const source = state.source
      return h(controls.route, {route: tab.routeLocation, cacheKey: tab.cacheKey, tabKey: tab.tabKey, registry: state.registry,
        fallbackProps: {flowid: source.flowModelId, flowobjid: source.flowObjectId, stepid: source.stepId,
          workFormId: tab.tabKey, pageParam: source.formTabs.find(form => form.tabKey === tab.tabKey)?.queryString ?? '', busRowid: source.busRowId}})
    })))
}

function workflowApprovalPane(rule, state) {
  if (!state.open) return null
  const {section, nodes, input, actions, className} = rule
  const fields = input.children.filter(field => field.props.field !== 'forceNodeId' || state.showForceTarget)
    .map(field => ({...field, props: {...field.props, readonly: state.locked}}))
  const columns = nodes.children.map(column => column.type !== 'r-column-group' ? column :
    {...column, children: column.children.map(field => ({...field, props: {...field.props, readonly: state.locked || field.props.readonly || false}}))})
  const children = [{...nodes, children: columns}, {...input, children: fields}, bindActions(actions)]
  return h('aside', {class: className}, [h(workflow.controls.render, {config: {...section, children}})])
}

function RenderWorkflowLayout({layoutClass, mobileClass, business, history, approval}) {
  const state = workflow?.business()
  if (!state?.source) return null
  const controls = workflow.controls
  return h('div', {class: [layoutClass, state.mobile && mobileClass]}, [
    h('section', {class: business.className}, [
      h('p', {class: business.titleClass}, state.source.instanceTitle),
      state.error ? h(controls.alert, {...business.error, title: state.error}) : null,
      workflowFormTabs(controls, business, state),
    ]),
    h(controls.render, {config: history}),
    workflowApprovalPane(approval, workflow.approval()),
  ])
}

function scopeAppendActions(rule, isCurrent) {
  const bind = button => ({...button, props: {...button.props,
    onClick: (...args) => {if (isCurrent()) return button.props.onClick(...args)},
  }})
  if (rule.type === 'r-toolbar') return {...rule, children: rule.children.map(bind)}
  const actions = rule.props?.actions
  return actions ? {...rule, props: {...rule.props, actions: {...actions, children: actions.children.map(bind)}}} : rule
}

function RenderWorkflowAppend({dialog, rules}) {
  if (!workflow) return null
  const {open, closeDisabled, child, close} = workflow.append()
  const controls = workflow.controls
  return h(controls.dialog, {...dialog.props, modelValue: open, closeDisabled,
    'onUpdate:modelValue': visible => {if (!visible) close()}}, () => child ? h(controls.append, {
    ref: child.bind, context: child.context, toolRules: rules.map(rule => scopeAppendActions(rule, child.isCurrent)), embedded: true,
    userDirectoryViewKey: child.userDirectoryViewKey, stepViewKey: child.stepViewKey,
  }) : null)
}

function RenderWorkflowChart({dialog}) {
  const chart = workflow?.chart()
  if (!chart) return null
  const controls = workflow.controls
  return h(controls.dialog, {...dialog.props, modelValue: chart.open, 'onUpdate:modelValue': visible => {if (!visible) chart.close()}},
    () => dialog.children.map(config => h(controls.render, {config})))
}

function bindChartStatus() {
  const chart = workflow?.chart()
  return {status: chart?.loading ? '正在加载流程图…' : '', error: chart?.error ?? ''}
}

function bindChartGraph() {
  const chart = workflow?.chart(), graph = chart?.graph
  if (!graph) return {visible: false}
  return {dataViewKey: graph.nodeViewKey, edgeDataViewKey: graph.edgeViewKey, edgeMarkers: chart.markers,
    nodePositions: graph.graphLayout.nodePositions, edgePaths: graph.graphLayout.edgePaths, nodeBadgeField: graph.nodeBadgeField}
}

async function retryWorkflow() { await $page.invokeHostCommand('workflow.retry') }
async function runChart() { await $page.invokeHostCommand('workflow.chart') }
async function runAppend() { await $page.invokeHostCommand('workflow.append') }
async function runRevoke() { await $page.invokeHostCommand('workflow.revoke') }
async function runHandle() { await $page.invokeHostCommand('workflow.handle') }
async function runVerify() { await $page.invokeHostCommand('workflow.verify') }
async function runSubmit() { await $page.invokeHostCommand('workflow.submit') }
async function runBack() { await $page.invokeHostCommand('workflow.back') }
async function runForceBack() { await $page.invokeHostCommand('workflow.forceBack') }
async function runBackToCreator() { await $page.invokeHostCommand('workflow.backToCreator') }
async function runClose() { await $page.invokeHostCommand('workflow.close') }

async function runRevokeAppend(row) { await $page.invokeHostCommand('append.revoke', row) }
async function runOpenAppendInput() { await $page.invokeHostCommand('append.openAppendInput') }
async function runVerifyAppendList() { await $page.invokeHostCommand('append.verifyAppendList') }
async function runVerifyAppendInput() { await $page.invokeHostCommand('append.verifyAppendInput') }
async function runCancelAppendInput() { await $page.invokeHostCommand('append.cancelAppendInput') }
async function runConfirmAppendInput() { await $page.invokeHostCommand('append.confirmAppendInput') }
