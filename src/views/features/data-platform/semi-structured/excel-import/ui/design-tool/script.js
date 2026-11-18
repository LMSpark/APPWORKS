/* global $page */
let tree

async function __init__() {
  tree = await $page.invokeHostCommand('excel.design.connect')
}

function bindTreeAction() {
  return {dataViewKey:'0F93B82141CF40852021D704B0E30BF4@Base_ImportData_Config@default',disabled:tree?.locked() !== false}
}

function bindSelectedAction() {
  return {...bindTreeAction(),disabled:tree?.locked() !== false || !tree?.selected()}
}

function bindCurrentNode() {
  return {visible:tree?.selected() === true}
}

function bindNodeField() {
  return {readonly:tree?.locked() !== false}
}

function bindAssociationField(kind) {
  const handlers = tree?.association()
  return {...bindNodeField(),visible:!!handlers,onChange:handlers?.[kind]}
}

function bindParentField() { return bindAssociationField('parent') }
function bindForeignField() { return bindAssociationField('foreign') }

function bindFilterSection() {
  return {status:tree?.filter().readOnly ? '版式过滤字段范围尚未确认，当前仅查看已存条件。' : ''}
}

function bindFilterEditor() {
  const filter = tree?.filter()
  if (!filter || filter.readOnly) return {columns:[],readonly:true}
  return {
    columnDataViewKey:'0F93B82141CF40852021D704B0E30BF4@Base_ImportData_Field@foreignKeyFields',
    columnTypeField:'type',
    columnTypeMap:{'0':'string','1':'number','2':'datetime'},
    columnTable:filter.table,
    readonly:tree.locked(),
    onEditingChange:tree.setFilterPending,
  }
}

function bindSortSection() {
  return {status:tree?.sort().error || ''}
}

function bindSortToggle() {
  const sort = tree?.sort()
  return {label:sort?.mode === 'text' ? '返回排序表' : '完整JSON编辑',disabled:sort?.blocked !== false}
}

function bindSortEditor() {
  const sort = tree?.sort()
  return {mode:sort?.mode || 'rows',readonly:tree?.locked() !== false || sort?.mode === 'rows' && !sort.ready,
    onChange:tree?.validateSorted,onEditingChange:tree?.setSortPending}
}

function bindSortOptions() {
  const sort = tree?.sort()
  return {optionDataViewKey:sort?.ready ? sort.options : undefined}
}

async function toggleSort() { await $page.invokeHostCommand('excel.design.toggleSort') }

function bindNodeCommands() {
  return {visible:tree?.selected() === true,
    status:tree?.nodeCommands().source ? '目标及字段替换共同保存；提交开始后沿同一次保存核验。' : ''}
}

function bindNodeSave() {
  const state = tree?.nodeCommands()
  return {label:state?.saveLabel || '保存配置',disabled:state?.saveDisabled !== false}
}

function bindNodeCancel() {
  return {disabled:tree?.nodeCommands().cancelDisabled !== false}
}

function bindNodeRetry() {
  const state = tree?.nodeCommands()
  return {visible:state?.retry === true,disabled:state?.busy !== false,
    label:state?.source ? '确认未生效，重新提交目标及字段' : '确认未生效，重新提交原修改'}
}

function bindNodeAccept() {
  const state = tree?.nodeCommands()
  return {visible:state?.accept === true,disabled:state?.busy !== false,
    label:state?.source ? '读取并采用当前正式结果，结束原换源' : '读取并采用当前正式结果，结束原保存'}
}

function bindNodeDiscard() {
  const state = tree?.nodeCommands()
  return {visible:state?.discard === true,disabled:state?.busy !== false,
    label:state?.source ? '放弃本次配置和字段的本地修改' : '放弃本次保存范围的本地修改'}
}

async function saveNode() { await $page.invokeHostCommand('excel.design.saveNode') }
async function cancelNode() { await $page.invokeHostCommand('excel.design.cancelNode') }
async function retryNode() { await $page.invokeHostCommand('excel.design.retryNode') }
async function acceptNode() { await $page.invokeHostCommand('excel.design.acceptNode') }
async function discardNode() { await $page.invokeHostCommand('excel.design.discardNode') }

function bindOpenTarget() {
  return {disabled:tree?.canOpenTarget() !== true}
}

function bindTransformSwitch() {
  return {readonly:tree?.locked() !== false || tree?.transformSwitch().pending === true}
}

function bindSaveTransformSwitch() {
  const state = tree?.transformSwitch()
  return {disabled:state?.busy !== false || state.pending,
    label:state?.switchUnconfirmed ? '核验增强规则开关保存结果' : '保存增强规则开关'}
}

function bindCancelTransformSwitch() {
  const state = tree?.transformSwitch()
  return {disabled:state?.busy !== false || state.pending || state.unconfirmed}
}

async function openTarget() { await $page.invokeHostCommand('excel.design.openTarget') }
async function saveTransformSwitch() { await $page.invokeHostCommand('excel.design.saveTransformSwitch') }
async function cancelTransformSwitch() { await $page.invokeHostCommand('excel.design.cancelTransformSwitch') }

async function addRoot() { await $page.invokeHostCommand('excel.design.addRoot') }
async function addSibling() { await $page.invokeHostCommand('excel.design.addSibling') }
async function addChild() { await $page.invokeHostCommand('excel.design.addChild') }
async function removeNode() { await $page.invokeHostCommand('excel.design.remove') }

const mappingKey = '0F93B82141CF40852021D704B0E30BF4@Base_ImportData_Field@default'

function bindMappingCell() { return {cellReadonly:tree?.locked} }
function bindReferenceAction() { return {dataViewKey:mappingKey,disabled:tree?.mapping().referenceDisabled !== false} }
function bindDeleteField() { return {dataViewKey:mappingKey,disabled:tree?.mapping().deleteDisabled !== false} }
function bindSaveFields() {
  const state = tree?.mapping()
  return {label:state?.saveLabel || '保存字段',disabled:state?.saveDisabled !== false}
}
function bindCancelFields() { return {disabled:tree?.mapping().cancelDisabled !== false} }

async function setReference() { await $page.invokeHostCommand('excel.design.setReference') }
async function clearReference() { await $page.invokeHostCommand('excel.design.clearReference') }
async function deleteField() { await $page.invokeHostCommand('excel.design.deleteField') }
async function saveFields() { await $page.invokeHostCommand('excel.design.saveFields') }
async function cancelFields() { await $page.invokeHostCommand('excel.design.cancelFields') }
