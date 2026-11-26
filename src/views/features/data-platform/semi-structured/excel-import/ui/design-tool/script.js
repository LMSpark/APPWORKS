/* global $page, h */
let tree

async function __init__() {
  tree = await $page.invokeHostCommand('excel.design.connect')
}

function bindWorkspaceTree() { return {inert: tree?.treeInert() || undefined} }
function bindTopTab() { return {modelValue: tree?.topTab() ?? 'basic'} }
function bindDependentTab() { return {disabled: !tree} }
function selectTopTab(name) {
  if (!tree) return undefined
  return $page.invokeHostCommand('excel.design.selectTopTab', name)
}

function region(node) {
  if (!node?.type) throw new Error('Excel 设计器缺少控制器规则区域')
  return h(tree.controls.node, {config: node})
}

function RenderExcelTransform(attrs) {
  if (!tree) return null
  return h(tree.controls.transform, tree.transformProps(), {
    'scheme-tools': () => region(attrs.scheme),
    'rule-list': () => region(attrs.list),
    'rule-editor': () => region(attrs.editor),
    'rule-operation': () => region(attrs.operation),
  })
}

function RenderExcelLayout(attrs) {
  if (!tree) return null
  const props = tree.layoutProps()
  return props ? h(tree.controls.layout, props, {
    'layout-controls': () => region(attrs.controls),
    'layout-document': () => region(attrs.document),
  }) : region(attrs.empty)
}

function RenderExcelSource(attrs) {
  const props = tree?.sourceProps()
  return props ? h(tree.controls.source, props, () => region(attrs.region)) : null
}

function RenderExcelReference(attrs) {
  const props = tree?.referenceProps()
  return props ? h(tree.controls.reference, props, () => region(attrs.region)) : null
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

function bindMissingNode() {
  return {visible:tree?.selected() === false}
}

function bindLayoutMappingNotice() {
  return {visible:tree?.fieldWorkspace()?.layoutEnabled === true}
}

function bindFieldTabs() {
  const workspace = tree?.fieldWorkspace()
  return {visible:workspace?.selected === true && !workspace.layoutEnabled,modelValue:workspace?.activeTab}
}

async function selectFieldTab(name) {
  if (!tree) return
  await $page.invokeHostCommand('excel.design.selectFieldTab',name)
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
  return {...bindRuleField(),visible:!!editor && !['DEDUPLICATE','PIVOT'].includes(kind),onEditingChange:value=>editor?.pending('condition',value)}
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

function bindLayoutNotice() {
  const state = tree?.layout()
  const title = !state?.root ? '请选择一个已保存的根配置。' : state.problem
  return {title,visible:!!title}
}
function bindLayoutClear() {
  const state = tree?.layout()
  return {visible:state?.root === true,disabled:state?.canClear !== true}
}
function bindLayoutDetails() { return {visible:tree?.layout()?.showDetails === true} }
function bindLayoutCreate() { return {disabled:tree?.layout()?.canCreate !== true} }
async function clearLayout() { await $page.invokeHostCommand('excel.design.clearLayout') }
async function createLayout() { await $page.invokeHostCommand('excel.design.createLayout') }

const layoutKey = '0F93B82141CF40852021D704B0E30BF4@Base_ImportData_Config@default'
function layoutDocumentState() { return tree?.layoutDocument()?.documentState() }
function bindLayoutForm() {
  const state = layoutDocumentState()
  return {visible:!!state?.sources,key:state?.epoch,contextRowId:state?.rootId,dataViewKey:layoutKey}
}
function bindLayoutFallback() {
  const state = layoutDocumentState()
  return {visible:state?.problem === true,contextRowId:state?.rootId,dataViewKey:layoutKey}
}
function layoutField(document, state, input) {
  return {dataViewKey:layoutKey,readonly:state?.readOnly !== false,onChange:document?.beforeChange,
    onEditingChange:value=>document?.pending(input,value)}
}
function bindLayoutEnabled() {
  const document = tree?.layoutDocument()
  const state = document?.documentState()
  return {...layoutField(document,state,'enabled'),schema:state?.enabledSchema}
}
function bindLayoutRegion(shape,member) {
  const document = tree?.layoutDocument()
  const state = document?.documentState()
  const region = state?.regions.find(candidate=>candidate.shape === shape)
  if (!region) return {visible:false}
  const field = {...layoutField(document,state,region.id + '.' + member),valuePath:['regions',region.index,member]}
  if (member === 'fields') return {...field,children:region.children,rowAdapter:region.adapter}
  const schema = member === 'bounds' ? state.boundsSchema : member === 'scan' ? state.scanSchema : state.linkSchema
  return {...field,schema}
}
function bindFormBounds() { return bindLayoutRegion('form','bounds') }
function bindFormRows() { return bindLayoutRegion('form','fields') }
function bindListBounds() { return bindLayoutRegion('list','bounds') }
function bindListScan() { return bindLayoutRegion('list','scan') }
function bindListLink() { return bindLayoutRegion('list','link') }
function bindListRows() { return bindLayoutRegion('list','fields') }
function bindBlockBounds() { return bindLayoutRegion('block','bounds') }
function bindBlockRows() { return bindLayoutRegion('block','fields') }
function bindLayoutSources() {
  const sources = layoutDocumentState()?.sources
  return {visible:!!sources,title:sources ? '主表来源：' + sources.root + '；明细来源：' + sources.detail : ''}
}
function bindLayoutDiagnose() { return {disabled:layoutDocumentState()?.canDiagnose !== true} }
function bindLayoutDiagnostic() {
  const title = layoutDocumentState()?.diagnostic || ''
  return {visible:!!title,title}
}
function bindLayoutDocumentError() {
  const title = layoutDocumentState()?.error || ''
  return {visible:!!title,title}
}
async function diagnoseLayout() { await $page.invokeHostCommand('excel.design.diagnoseLayout') }

function sourcePickerState() { return tree?.sourcePicker?.()?.state() }

function bindSourceStatus() {
  const state = sourcePickerState()
  return {status:state?.loading ? '正在读取目标来源…' : '',error:state?.error || ''}
}

function bindSourceContent() {
  const state = sourcePickerState()
  return {visible:state?.ready === true,inert:state?.busy || undefined}
}

function bindSourceAppForm() { return {dataViewKey:tree?.sourcePicker?.()?.bindings.appsKey} }
function bindSourceApplication() { return {optionDataViewKey:tree?.sourcePicker?.()?.bindings.appsKey} }
function bindSourceDatabase() {
  const picker = tree?.sourcePicker?.()
  return {dataViewKey:picker?.bindings.databasesKey,onRowClick:picker?.chooseDatabase}
}
function bindSourceTable() {
  const picker = tree?.sourcePicker?.()
  return {dataViewKey:picker?.bindings.tablesKey,onRowClick:picker?.chooseTable}
}
function bindSourceFields() { return {dataViewKey:tree?.sourcePicker?.()?.bindings.fieldsKey} }
function bindSourceCancel() { return {disabled:sourcePickerState()?.busy === true} }
function bindSourceConfirm() { return {disabled:sourcePickerState()?.canConfirm !== true} }

async function cancelSourcePicker() { await $page.invokeHostCommand('excel.design.closeSourcePicker') }
async function closeSourcePicker(open) { if (open === false) await cancelSourcePicker() }
async function confirmSourcePicker() { await $page.invokeHostCommand('excel.design.confirmSourcePicker') }

function referencePicker() { return tree?.referencePicker?.() }
function referencePickerState() { return referencePicker()?.state() }
function bindReferenceStatus() {
  const state = referencePickerState()
  return {status:state?.loading ? '正在读取引用来源…' : '',error:state?.error || ''}
}
function bindReferenceIdle() { return {disabled:referencePickerState()?.busy === true} }
function bindReferenceConfirm() { return {disabled:referencePickerState()?.canConfirm !== true} }
function bindReferenceContent() {
  const state = referencePickerState()
  return {inert:state?.busy || state?.loading || undefined}
}
function bindReferenceBrowse() { return {visible:referencePickerState()?.mode === 'browse'} }
function bindReferencePhysicalBrowse() {
  const state = referencePickerState()
  return {visible:state?.physical === true && state.mode === 'browse'}
}
function bindReferencePhysicalStored() {
  const state = referencePickerState()
  return {visible:state?.physical === true && state.mode === 'stored'}
}
function bindReferenceAppForm() { return {dataViewKey:referencePicker()?.bindings().appsKey} }
function bindReferenceApplication() { return {optionDataViewKey:referencePicker()?.bindings().appsKey} }
function bindReferenceDatabase() {
  const picker = referencePicker()
  return {dataViewKey:picker?.bindings().databasesKey,onRowClick:picker?.chooseDatabase}
}
function bindReferenceObjectTitle() { return {title:referencePickerState()?.kind === 'View' ? '物理视图' : '数据表'} }
function bindReferenceObject() {
  const picker = referencePicker()
  return {dataViewKey:picker?.bindings().objectKey,onRowClick:picker?.state().mode === 'browse' ? picker.chooseObject : undefined}
}
function bindReferenceObjectName() { return {field:referencePickerState()?.kind === 'View' ? 'vewname' : 'tblname'} }
function bindReferenceObjectDescription() { return {field:referencePickerState()?.kind === 'View' ? 'vewdesc' : 'tbldesc'} }
function bindReferenceDictionary() {
  const picker = referencePicker(), state = picker?.state()
  return {visible:state?.dictionary === true,dataViewKey:picker?.bindings().dictionaryKey,onRowClick:state?.mode === 'browse' ? picker.chooseDictionary : undefined}
}
function bindReferenceFields() { return {visible:referencePickerState()?.fields === true} }
function bindReferenceTextForm() { return {dataViewKey:referencePicker()?.bindings().textKey} }
function bindReferenceValueForm() { return {dataViewKey:referencePicker()?.bindings().valueKey} }
function bindReferenceFieldSelect(binding) {
  return {optionDataViewKey:referencePicker()?.bindings()[binding],optionLabelFields:referencePickerState()?.kind === 'Dict' ? ['label'] : ['cnname','enname']}
}
function bindReferenceTextSelect() { return bindReferenceFieldSelect('textKey') }
function bindReferenceValueSelect() { return bindReferenceFieldSelect('valueKey') }

async function cancelReferencePicker() { await $page.invokeHostCommand('excel.design.closeReferencePicker') }
async function closeReferencePicker(open) { if (open === false) await cancelReferencePicker() }
async function confirmReferencePicker() { await $page.invokeHostCommand('excel.design.confirmReferencePicker') }
async function restoreReference() { await $page.invokeHostCommand('excel.design.restoreReference') }
async function browseReferenceTable() { await $page.invokeHostCommand('excel.design.browseReference','Table') }
async function browseReferenceView() { await $page.invokeHostCommand('excel.design.browseReference','View') }
async function browseReferenceDictionary() { await $page.invokeHostCommand('excel.design.browseReference','Dict') }
