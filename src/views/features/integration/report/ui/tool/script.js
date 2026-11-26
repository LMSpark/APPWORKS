/* global $page, h */
let reports
async function __init__() { reports = await $page.invokeHostCommand('reports.connect') }

function bindReportButtons(region, commands, invoke) {
  return {...region, children: region.children.map(button => {
    const command = commands[button.id]
    if (typeof command !== 'string') throw Error(`报表工具缺少按钮命令 ${button.id}`)
    return {...button, props: {...button.props, onClick: row => invoke(command, row)}}
  })}
}
function RenderReportCreate({infoRule, versionRule, footerRule, commands}) {
  const binding = reports?.capture('create')
  if (!binding) return null
  return [h(reports.components.create, {
    key: binding.key, ref: binding.bind, infoKey: binding.infoKey, reportKey: binding.reportKey,
    appKey: binding.appKey, infoId: binding.infoId, reportId: binding.reportId, onClose: binding.onClose,
    infoRule, versionRule, footerRule: bindReportButtons(footerRule, commands, binding.invoke),
  })]
}
function RenderReportEdit({formRule, title}) {
  const binding = reports?.capture('edit')
  return binding ? [h(reports.components.edit, {
    key: binding.key, dataViewKey: binding.infoKey, recordId: binding.infoId, title, formRule,
    validate: binding.validate, onClose: binding.onClose,
  })] : null
}
function RenderReportVersion({tableRule, toolbarRule, formRule, commands}) {
  const binding = reports?.capture('version')
  if (!binding) return null
  const actions = bindReportButtons(tableRule.props.actions, commands, binding.invoke)
  return [h(reports.components.version, {
    key: binding.key, ref: binding.bind, infoKey: binding.infoKey, infoId: binding.infoId, onClose: binding.onClose, formRule,
    tableRule: {...tableRule, props: {...tableRule.props, actions}},
    toolbarRule: bindReportButtons(toolbarRule, commands, binding.invoke),
  })]
}
function RenderReportModel({tableRule, footerRule, commands, rowCommand}) {
  const binding = reports?.capture('model')
  if (!binding) return null
  return [h(reports.components.model, {
    key: binding.key, ref: binding.bind, infoKey: binding.infoKey, infoId: binding.infoId,
    reportKey: binding.reportKey, onClose: binding.onClose,
    tableRule: {...tableRule, props: {...tableRule.props, onRowClick: row => binding.invoke(rowCommand, row)}},
    footerRule: bindReportButtons(footerRule, commands, binding.invoke),
  })]
}

function bindReportDate() { return {displayFormatter: reports?.formatDay} }
function bindReportAction() { return {disabled: reports?.locked() !== false} }
async function editReport(row) { await $page.invokeHostCommand('reports.edit', row) }
async function removeReport(row) { await $page.invokeHostCommand('reports.remove', row) }
async function versionReport(row) { await $page.invokeHostCommand('reports.version', row) }
async function modelReport(row) { await $page.invokeHostCommand('reports.model', row) }
function bindReportVerification() { return reports?.verification() ?? {visible: false} }
async function verifyReport() { await $page.invokeHostCommand('reports.verify') }
async function createReport() { await $page.invokeHostCommand('reports.create') }
