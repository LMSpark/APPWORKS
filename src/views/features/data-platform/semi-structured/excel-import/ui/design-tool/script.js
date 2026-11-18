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

function bindRemovalDialog() {
  const state = tree?.removal()
  const open = state?.open === true
  return {visible:open,modelValue:open,closeDisabled:state?.busy !== false || !state?.canCancel}
}

function bindRemovalImpact() {
  const state = tree?.removal()
  return {title:'将删除当前叶配置，同时删除 ' + state?.fields + ' 个字段和 ' + state?.rules + ' 条转换规则。'}
}
function bindRemovalConfirmed() { return {visible:tree?.removal().databaseConfirmed === true} }
function bindRemovalError() {
  const title = tree?.removal().error || ''
  return {title,visible:!!title}
}
function bindCancelRemoval() {
  const state = tree?.removal()
  return {disabled:state?.busy !== false || !state?.canCancel}
}
function bindAcceptRemoval() {
  const state = tree?.removal()
  return {visible:state?.canAccept === true,disabled:state?.busy !== false}
}
function bindSaveRemoval() {
  const state = tree?.removal()
  return {disabled:state?.busy !== false,label:state?.unconfirmed || state?.databaseConfirmed ? '核验删除并刷新' : '确认删除配置'}
}
async function closeRemovalDialog(open) { if (open === false) await cancelRemoval() }
async function cancelRemoval() { await $page.invokeHostCommand('excel.design.cancelRemoval') }
async function acceptRemoval() { await $page.invokeHostCommand('excel.design.acceptRemoval') }
async function saveRemoval() { await $page.invokeHostCommand('excel.design.saveRemoval') }

function bindRuleList() {
  const state = tree?.ruleList()
  return {error:state?.error || '',status:state?.hasNode
    ? '关闭增强规则时仍可设计；启用后按执行方向和顺序消费已保存规则。' : '选择配置后维护其增强规则。'}
}
function bindRuleTable() {
  return {visible:tree?.ruleList()?.hasNode === true,onRowClick:tree?.ruleRowClick}
}
function bindRuleAction() {
  const state = tree?.ruleList()
  return {disabled:state?.blocked !== false || !state?.hasNode}
}
function bindVerifyRule() {
  const state = tree?.ruleList()
  return {visible:state?.unconfirmed === true,disabled:state?.canVerify !== true}
}
function bindRuleDirection() { return {displayFormatter:tree?.ruleDirection} }

async function refreshRules() { await $page.invokeHostCommand('excel.design.refreshRules') }
async function addRule() { await $page.invokeHostCommand('excel.design.addRule') }
async function verifyRule() { await $page.invokeHostCommand('excel.design.verifyRule') }
async function editRule(row) { await $page.invokeHostCommand('excel.design.editRule', row) }
async function deleteRule(row) { await $page.invokeHostCommand('excel.design.deleteRule', row) }

function bindRuleOperationDialog() {
  const state = tree?.ruleOperation()
  return {modelValue:!!state,visible:!!state,closeDisabled:!!(state?.busy || state?.ownUnconfirmed),
    title:state?.mode === 'delete' ? '删除增强规则' : '处理本条待提交修改'}
}
function bindRuleOperationPrompt() {
  const state = tree?.ruleOperation()
  const title = state?.mode === 'delete' ? '确认删除这条增强规则？'
    : '原视图保留了本条待提交修改。继续保存或明确放弃，只处理当前这条记录。'
  return {title,description:state ? '规则：' + String(state.name ?? '') : ''}
}
function bindRuleOperationError() {
  const title = tree?.ruleOperation()?.error || ''
  return {title,visible:!!title}
}
function bindCancelRuleOperation() {
  const state = tree?.ruleOperation()
  return {disabled:!!(state?.busy || state?.ownUnconfirmed),label:state?.foreignRecovery
    ? '关闭并保留草稿' : state?.mode === 'delete' ? '取消删除规则' : '关闭'}
}
function bindDiscardRuleOperation() {
  const state = tree?.ruleOperation()
  return {visible:state?.mode === 'pending',disabled:!!(state?.busy || state?.ownUnconfirmed || state?.foreignRecovery || state?.confirmedCreation)}
}
function bindSaveRuleOperation() {
  const state = tree?.ruleOperation()
  const removing = state?.mode === 'delete'
  const label = state?.permissionsPending ? '回读已保存规则权限'
    : state?.ownUnconfirmed ? (removing ? '核验原删除结果' : '核验原保存结果')
      : state?.recoveryEnded ? '原提交已结束，请重新选择' : removing ? '确认删除规则' : '继续保存本条修改'
  return {label,disabled:!!(state?.busy || state?.foreignRecovery || state?.recoveryEnded && !state.permissionsPending)}
}
async function closeRuleOperation(open) { if (open === false) await cancelRuleOperation() }
async function cancelRuleOperation() { await $page.invokeHostCommand('excel.design.cancelRuleOperation') }
async function discardRuleOperation() { await $page.invokeHostCommand('excel.design.discardRuleOperation') }
async function saveRuleOperation() { await $page.invokeHostCommand('excel.design.saveRuleOperation') }

const rulesKey = '0F93B82141CF40852021D704B0E30BF4@Base_Import_Transform_Rule@default'
function ruleEditorState() { return tree?.ruleEditor()?.state() }
function bindRuleEditDialog() {
  const state = ruleEditorState()
  return {visible:!!state,modelValue:!!state,closeDisabled:!!(state?.busy || state?.unconfirmed),
    title:state?.created ? '新增增强规则' : '编辑增强规则'}
}
function bindRuleEditForm() {
  const state = ruleEditorState()
  return {dataViewKey:rulesKey,contextRowId:state?.id,key:state?.id}
}
function bindRuleField() { return {dataViewKey:rulesKey,readonly:ruleEditorState()?.locked !== false} }
function bindRuleType() {
  const editor = tree?.ruleEditor()
  const state = editor?.state()
  return {...bindRuleField(),options:state?.typeOptions,readonly:state?.locked !== false || !!state?.pendingInputs,onChange:editor?.changeType}
}
function bindRuleSource() {
  const state = ruleEditorState()
  return {...bindRuleField(),visible:state?.source === true,optionDataViewKey:state?.fieldOptionsKey}
}
function bindRuleTarget() {
  const state = ruleEditorState()
  return {...bindRuleField(),visible:state?.target === true,optionDataViewKey:state?.fieldOptionsKey}
}
function bindRuleErrorPolicy() { return {...bindRuleField(),options:ruleEditorState()?.errorOptions} }
function bindRuleSchema() {
  const editor = tree?.ruleEditor()
  const schema = editor?.state().schema
  return {...bindRuleField(),visible:!!schema,schema,onEditingChange:value=>editor?.pending('config',value)}
}
function bindRuleColumns() {
  const editor = tree?.ruleEditor()
  return {...bindRuleField(),visible:editor?.state().kind === 'UNPIVOT',onEditingChange:value=>editor?.pending('columns',value)}
}
function bindUnpivotSource() { return {optionDataViewKey:ruleEditorState()?.fieldOptionsKey} }
function bindRuleCondition() {
  const editor = tree?.ruleEditor()
  const kind = editor?.state().kind
  return {...bindRuleField(),visible:!!kind && !['DEDUPLICATE','PIVOT'].includes(kind),onEditingChange:value=>editor?.pending('condition',value)}
}
function bindRuleEditorError() {
  const title = ruleEditorState()?.error || ''
  return {visible:!!title,title}
}
function bindRuleEditorWarning() {
  const state = ruleEditorState()
  const title = state?.foreign ? '同一视图另有未确认提交，请关闭并保留本窗口草稿后核验原提交。'
    : state && !state.current ? '原记录已变化，本次编辑会话已失效。' : ''
  return {visible:!!title,title}
}
function bindCancelRuleEditor() {
  const state = ruleEditorState()
  const label = state?.foreign || state?.ended ? '关闭并保留草稿' : state?.confirmedCreation ? '关闭'
    : !state?.unconfirmed && state?.hasStaged && !state.created ? '关闭并保留待提交修改' : '取消'
  return {label,disabled:!!(state?.busy || state?.unconfirmed)}
}
function bindSaveRuleEditor() {
  const state = ruleEditorState()
  const label = state?.permissionsPending ? '回读已保存规则权限' : state?.unconfirmed ? '核验原保存结果'
    : state?.ended ? '原提交已结束，请重新选择' : '保存'
  return {label,disabled:!state || !!(state.busy || state.pendingInputs || state.foreign || !state.permissionsPending && (state.ended || !state.current && !state.unconfirmed))}
}
async function closeRuleEditor(open) { if (open === false) await cancelRuleEditor() }
async function cancelRuleEditor() { await $page.invokeHostCommand('excel.design.cancelRuleEditor') }
async function saveRuleEditor() { await $page.invokeHostCommand('excel.design.saveRuleEditor') }
