/* global $page, h */
let detail

async function __init__() { detail = await $page.invokeHostCommand('workflow.connectBusinessDetail') }

function bindBusinessDetail() {
  const state = detail?.status()
  return {status: state?.loading ? '正在加载…' : '', error: state?.error ?? '', retryable: !!state && !state.loading}
}

function bindPrepared() { return {visible: detail?.status().ready === true} }

function RenderBusinessDetailTitle({className}) {
  if (!detail?.status().ready) return null
  return h('p', {class: className}, detail.title())
}

function RenderBusinessDetailForms({empty, tabs, pane}) {
  const forms = detail?.forms()
  if (!forms) return null
  const controls = detail.controls
  if (!forms.items.length) return h(controls.empty, empty)
  return h(controls.tabs, {...tabs, key: forms.instance, modelValue: forms.active, 'onUpdate:modelValue': forms.select}, () =>
    forms.items.map((tab, index) => h(controls.pane, {...pane, key: tab.tabKey, label: tab.label, name: tab.tabKey, index}, () => {
      if (!tab.routeFound) return h(controls.empty, {description: tab.routeError})
      if (!tab.routeLocation) return null
      return h(controls.route, {route: tab.routeLocation, cacheKey: tab.cacheKey, tabKey: tab.tabKey, registry: detail.registry})
    })))
}

async function retryBusinessDetail() { await $page.invokeHostCommand('workflow.retryBusinessDetail') }
async function openRun() { await $page.invokeHostCommand('workflow.openRun') }
async function openDetail() { await $page.invokeHostCommand('workflow.openDetail') }
