/* global $page */
let review

async function __init__() { review = await $page.invokeHostCommand('review.connect') }
function bindRequestedAt() { return {displayFormatter: review?.formatRequestedAt} }
function bindAuditAction({row}) { return review?.canAudit(row) === true }

function bindOpenError() {
  const state = review?.state()
  return {visible: state?.recordId === undefined && !!state?.error, title: state?.error ?? ''}
}
function bindDialog() {
  const state = review?.state()
  return {visible: state?.recordId !== undefined, closeDisabled: state?.busy === true}
}
function bindLoading() { return {visible: review?.state().loading === true} }
function bindAuditError() {
  const error = review?.state().error
  return {visible: !!error, title: error ?? ''}
}
function bindRecord() {
  const state = review?.state()
  return {visible: state?.ready === true && state.recordId !== undefined, contextRowId: state?.recordId}
}
function bindCancel() { return {disabled: review?.state().busy !== false} }
function bindDecision() {
  const state = review?.state()
  return {disabled: !state?.ready || state.busy || state.unconfirmed}
}

async function openAudit(row) { await review.open(row) }
async function closeAudit() { await review.close() }
async function onDialogChange(open) { if (open === false) await closeAudit() }
async function approve() { await review.decide('INITIALIZING') }
async function reject() { await review.decide('REJECTED') }
