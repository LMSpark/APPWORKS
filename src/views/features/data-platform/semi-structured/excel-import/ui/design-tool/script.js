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

async function addRoot() { await $page.invokeHostCommand('excel.design.addRoot') }
async function addSibling() { await $page.invokeHostCommand('excel.design.addSibling') }
async function addChild() { await $page.invokeHostCommand('excel.design.addChild') }
async function removeNode() { await $page.invokeHostCommand('excel.design.remove') }
