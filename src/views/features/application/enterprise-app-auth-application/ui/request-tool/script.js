/* global $page */
let requests

async function __init__() { requests = await $page.invokeHostCommand('requests.connect') }
function bindRequestStatus() { return {error: requests?.state().error ?? ''} }
function bindRequestAction() { return {disabled: requests?.state().busy !== false} }
function bindCancel({row}) { return requests?.canCancel(row) === true }
function bindReapply({row}) { return requests?.canReapply(row) === true }
function bindRequestedAt() { return {displayFormatter: requests?.formatRequestedAt} }
async function openApply() { await $page.invokeHostCommand('requests.apply') }
async function cancelRequest(row) { await $page.invokeHostCommand('requests.cancel', row) }
async function reapplyRequest(row) { await $page.invokeHostCommand('requests.reapply', row) }
