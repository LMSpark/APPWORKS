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

async function addRoot() { await $page.invokeHostCommand('excel.design.addRoot') }
async function addSibling() { await $page.invokeHostCommand('excel.design.addSibling') }
async function addChild() { await $page.invokeHostCommand('excel.design.addChild') }
async function removeNode() { await $page.invokeHostCommand('excel.design.remove') }
