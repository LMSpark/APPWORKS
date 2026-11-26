/* global $page, h */
let rules
async function __init__() { rules = await $page.invokeHostCommand('rules.connect') }
function RenderRuleEditor({form, createTitle, editTitle, width, excludeOnCreate}) {
  const opened = rules?.capture('edit')
  if (!opened) return null
  const formRule = opened.created ? {...form, children: form.children.filter(child => child.props?.field !== excludeOnCreate)} : form
  return [h(rules.editor, {...opened, title: opened.created ? createTitle : editTitle, formRule, width})]
}
function RenderRuleDeletion({dialog}) {
  const opened = rules?.capture('delete')
  if (!opened) return null
  const {bind, ...input} = opened
  return [h(rules.deleteDialog, {...input, ref: bind}, {default: () => h(rules.node, {config: dialog})})]
}
function bindRuleDeleteWindow() {
  const deletion = rules?.deletion()
  return {closeDisabled: deletion?.state().busy !== false,
    'onUpdate:modelValue': open => {if (open === false) deletion?.close()}}
}
function bindRuleDeletePreview() {
  const state = rules?.deletion()?.state()
  return {visible: !!state, contextRowId: state?.recordId}
}
function bindRuleDeleteError() {
  const error = rules?.deletion()?.state().error
  return {visible: !!error, title: error ?? ''}
}
function bindRuleDeleteUnknown() { return {visible: rules?.deletion()?.state().ownUnconfirmed === true} }
function bindRuleDeleteCancel() {
  const deletion = rules?.deletion(), state = deletion?.state()
  return {label: state?.ownUnconfirmed ? '关闭并保留修改' : '取消', disabled: state?.busy !== false, onClick: deletion?.close}
}
function bindRuleDeleteSubmit() {
  const deletion = rules?.deletion(), state = deletion?.state()
  return {label: state?.verify ? '核验原删除结果' : '确定删除', disabled: state?.submitDisabled !== false, onClick: deletion?.submit}
}
function bindAction() { return {disabled: rules?.locked() !== false} }
function bindEdit(context) { return {...bindAction(), visible: rules?.canEdit(context.row) === true} }
function bindDelete(context) { return {...bindAction(), visible: rules?.canDelete(context.row) === true} }
function bindVerification() { return rules?.verification() ?? {visible: false} }
async function createRule() { await $page.invokeHostCommand('rules.create') }
async function editRule(row) { await $page.invokeHostCommand('rules.edit', row) }
async function removeRule(row) { await $page.invokeHostCommand('rules.remove', row) }
async function verifySave() { await $page.invokeHostCommand('rules.verify') }
