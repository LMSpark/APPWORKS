/* global $page, $route */
async function openBidClassModelCatalog() {
  try {
    const result = await $page.invokeHostCommand('bid.models.readCatalog', {})
    result.assertCurrent()
    const lines = [`根模型 ${result.rootKind} · ${result.models.length} 个定义`]
    for (const model of result.models) {
      lines.push(model.methods.length ? `${model.kind} · 方法\n${model.methods.map(method => method.signature).join('\n')}` : `${model.kind} · 无方法定义`)
    }
    await $page.showAlert(lines.join('\n'), 'ClassModel 定义目录')
  } catch {
    $page.showMessage('当前模型定义目录无法核验', 'warning')
  }
}

function bindBidClassModelGuide() {
  const {modelKind, modelAction} = $route.query
  const valid = value => typeof value === 'string' && !!value && value.trim() === value
  return {visible: valid(modelKind) && (modelAction === undefined || valid(modelAction))}
}

async function openBidClassModelGuide() {
  if (!bindBidClassModelGuide().visible) return
  const {modelKind, modelAction} = $route.query
  try {
    const catalog = await $page.invokeHostCommand('bid.models.readCatalog', {})
    const result = await catalog.readGuide(modelKind, modelAction)
    result.assertCurrent()
    await $page.showAlert(result.guide, modelAction === undefined ? `模型定义 · ${modelKind}` : `方法指南 · ${modelKind}.${modelAction}`)
  } catch {
    $page.showMessage('同一模型实例的定义指南无法核验', 'warning')
  }
}
