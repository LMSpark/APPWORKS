/* global $page */
let design

async function __init__() {
  design = await $page.invokeHostCommand('dictionary.design.connect')
}

function bindError() {
  const title = design?.state().error
  return {visible: !!title, title}
}

function bindDefinition() {
  const readonly = design?.state().busy !== false
  const children = []
  const options = design?.applicationOptions()
  if (options) children.push({type: 'r-select', props: {
    field: 'AppId', label: '所属应用', readonly, clearable: true,
    optionDataViewKey: options, optionLabelField: 'AppDesc', optionValueField: 'rowid',
  }})
  children.push(
    {type: 'r-text', props: {field: 'TypeName', label: '字典名称', readonly}},
    {type: 'r-select', props: {field: 'dictionaryType', label: '编码类型', readonly,
      options: [{value: '0', label: '字符型'}, {value: '1', label: '数值型'}]}},
    ...(design?.titleFields ?? []).map(field => ({
      type: 'r-text', props: {field: field.titleField, label: field.defaultLabel + '标题', readonly},
    })),
    {type: 'r-text', props: {field: 'functiondesc', label: '功能描述', readonly}},
  )
  return {children}
}

function bindEditAction() {
  const state = design?.state()
  return {disabled: state?.busy !== false || state?.uncertain === true}
}

function bindReload() {
  const state = design?.state()
  return {disabled: state?.busy !== false, label: state?.uncertain ? '核验原提交（保留本地修改）' : '取消设计修改并重读'}
}

function bindExisting() { return {visible: design?.state().creating === false} }
function saveDesign() { return design?.save() }
function reloadDesign() { return design?.reload() }
function cancelDesign() { design?.cancel() }
