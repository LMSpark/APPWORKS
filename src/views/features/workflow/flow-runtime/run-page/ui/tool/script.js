/* global $page */
async function runChart() { await $page.invokeHostCommand('workflow.chart') }
async function runAppend() { await $page.invokeHostCommand('workflow.append') }
async function runRevoke() { await $page.invokeHostCommand('workflow.revoke') }
async function runHandle() { await $page.invokeHostCommand('workflow.handle') }
async function runVerify() { await $page.invokeHostCommand('workflow.verify') }
async function runSubmit() { await $page.invokeHostCommand('workflow.submit') }
async function runBack() { await $page.invokeHostCommand('workflow.back') }
async function runForceBack() { await $page.invokeHostCommand('workflow.forceBack') }
async function runBackToCreator() { await $page.invokeHostCommand('workflow.backToCreator') }
async function runClose() { await $page.invokeHostCommand('workflow.close') }

async function runRevokeAppend(row) { await $page.invokeHostCommand('append.revoke', row) }
async function runOpenAppendInput() { await $page.invokeHostCommand('append.openAppendInput') }
async function runVerifyAppendList() { await $page.invokeHostCommand('append.verifyAppendList') }
async function runVerifyAppendInput() { await $page.invokeHostCommand('append.verifyAppendInput') }
async function runCancelAppendInput() { await $page.invokeHostCommand('append.cancelAppendInput') }
async function runConfirmAppendInput() { await $page.invokeHostCommand('append.confirmAppendInput') }
