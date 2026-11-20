/* global $page */
let design

async function __init__() {
  design = await $page.invokeHostCommand('pdf.design.connect')
}

function bindStatus() {
  const state = design?.state()
  return {description:state?.ruleId ? '规则 ID：' + state.ruleId : '',
    status:state?.loading ? '正在读取…' : '',error:state?.error || (state?.missing ? '当前规则不存在' : '')}
}

function bindUnconfirmed() { return {visible:design?.state().unconfirmed === true} }
function bindDefinition() { return {visible:design?.state().visible === true} }

function bindField() {
  const state = design?.state()
  return {readonly:!state || state.busy || state.unconfirmed}
}

function bindRule() {
  return {...bindField(),onChange:design?.validateRule,onEditingChange:design?.trackInput}
}

function bindSave() {
  const state = design?.state()
  return {label:state?.unconfirmed ? '核验保存结果' : '保存规则',disabled:!state || state.busy || state.pending}
}

function bindCancel() {
  const state = design?.state()
  return {disabled:!state || state.busy || state.unconfirmed}
}

async function saveRule() { await $page.invokeHostCommand('pdf.design.save') }
async function cancelRule() { await $page.invokeHostCommand('pdf.design.cancel') }
