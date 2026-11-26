/* global $page, h */
let design

async function __init__() { design = await $page.invokeHostCommand('approvalDesign.connect') }

function state() { return design?.state() }
function bindWorkspace() {
  const input = state()
  return {visible: !!design, error: input?.error ?? '', status: input?.loading ? '正在打开流程设计…' : ''}
}
function bindTitle() { return {title: `设计目标：${state()?.modelTitle ?? ''}`} }
function bindGraphAction() { return {disabled: state()?.graphDisabled !== false} }
function bindRemove() { return {disabled: bindGraphAction().disabled || !state()?.graphSelection} }
function bindCancel() { return {disabled: state()?.cancelDisabled !== false} }
function bindSave() {
  const input = state()
  return {disabled: input?.saveDisabled !== false, label: input?.unconfirmed ? '核验原提交' : '保存设计'}
}
function bindGraph() {
  const input = state()
  return {visible: !!input && !input.loading, disabled: input?.graphDisabled !== false, edgeMarkers: design?.edgeMarkers,
    nodePositions: input?.graphLayout.nodePositions, edgePaths: input?.graphLayout.edgePaths,
    draggableKeys: input?.draggableNodeKeys, connectableKeys: input?.draggableNodeKeys, current: input?.graphSelection}
}

function RenderDesignNodePanel() {
  const input = state()
  return input && !input.loading ? h(design.panels.node, {viewKey: input.nodeViewKey, highlightId: input.nodeHighlightId,
    onSelectGraphId: selectNode}) : null
}
function RenderDesignEdgePanel() {
  const input = state()
  return input && !input.loading ? h(design.panels.edge, {viewKey: input.edgeViewKey, highlightId: input.edgeHighlightId,
    onSelectGraphId: selectEdge}) : null
}
function RenderDesignFormPanel() {
  const input = state()
  return input?.workFormViewKey && !input.loading ? h(design.panels.form, {viewKey: input.workFormViewKey, class: 'flow-design-page__wide'}) : null
}
function RenderDesignAuthPanel() {
  const input = state()
  return input && !input.loading ? h(design.panels.auth, {viewKey: input.nodeAuthViewKey, selectedNodeId: input.selectedNodeId,
    flowModelId: input.flowModelId, class: 'flow-design-page__wide'}) : null
}

async function selectNode(id) { await $page.invokeHostCommand('approvalDesign.selectNode', id) }
async function selectEdge(id) { await $page.invokeHostCommand('approvalDesign.selectEdge', id) }
async function selectGraph(event) { await $page.invokeHostCommand('approvalDesign.selectGraph', event) }
async function moveNode(event) { await $page.invokeHostCommand('approvalDesign.move', event) }
async function connectNodes(event) { await $page.invokeHostCommand('approvalDesign.link', event) }
async function addNode() { await $page.invokeHostCommand('approvalDesign.add') }
async function removeSelection() { await $page.invokeHostCommand('approvalDesign.remove') }
async function saveDesign() { await $page.invokeHostCommand('approvalDesign.save') }
async function cancelChanges() { await $page.invokeHostCommand('approvalDesign.cancel') }
