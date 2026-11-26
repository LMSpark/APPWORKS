/* global $page, h */

let workbench

async function __init__() {
  workbench = await $page.invokeHostCommand('workbench.connect')
}

function RenderWorkbenchTabs({tabs}) {
  if (!workbench) return null
  const {controls, tab, select} = workbench
  return h(controls.tabs, {...tabs.props, modelValue: tab, 'onUpdate:modelValue': select}, () =>
    tabs.children.map((pane, index) => h(controls.pane, {...pane.props, key: pane.id, index}, () =>
      pane.props.name === tab ? pane.children.map(config => h(controls.render, {config})) : null,
    )),
  )
}

async function openWorkbenchRun(row) { await $page.invokeHostCommand('workbench.run', row) }
async function openWorkbenchDetail(row) { await $page.invokeHostCommand('workbench.detail', row) }
