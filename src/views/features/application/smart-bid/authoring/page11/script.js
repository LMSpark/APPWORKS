/* global $page, $route */
let authoring

async function __init__() {
  if (typeof $route.query.projectId !== 'string' || !$route.query.projectId ||
      typeof $route.query.draftId !== 'string' || !$route.query.draftId) return
  authoring = await $page.invokeHostCommand('content.authoring.connect')
}

function draftReady() {
  if (!authoring) return false
  try {
    authoring.assertCurrent()
    return true
  } catch {
    return false
  }
}

function bindDraftForm() { return {visible: draftReady()} }
function bindDraftCancel() { return {visible: draftReady(), disabled: authoring?.canCancel !== true} }
function cancelDraft() {
  if (!draftReady() || !authoring.canCancel) return
  authoring.cancel()
  $page.showMessage('已取消本次草稿编辑', 'success')
}
