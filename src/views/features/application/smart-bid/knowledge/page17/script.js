/* global $page, $route */
async function openBidClassModelCatalog() {
  try {
    const result = await $page.invokeHostCommand('bid.models.readCatalog', {})
    result.assertCurrent()
    const lines = [`根模型 ${result.rootKind} · ${result.models.length} 个定义`]
    for (const model of result.models) {
      lines.push(model.kind)
      if (model.attributes.length) lines.push(...model.attributes.map(attribute => `${attribute.name}: ${attribute.typeText}`))
      if (model.methods.length) lines.push(...model.methods.map(method => method.signature))
      if (!model.attributes.length && !model.methods.length) lines.push('无成员定义')
    }
    await $page.showAlert(lines.join('\n'), 'ClassModel 定义目录')
  } catch {
    $page.showMessage('当前模型定义目录无法核验', 'warning')
  }
}

function bindBidClassModelGuide() {
  const {modelKind, modelAction, modelAttribute} = $route.query
  const valid = value => typeof value === 'string' && !!value && value.trim() === value
  return {visible: valid(modelKind) && (modelAction === undefined || valid(modelAction)) &&
    (modelAttribute === undefined || (modelAction === undefined && valid(modelAttribute)))}
}

async function openBidClassModelGuide() {
  if (!bindBidClassModelGuide().visible) return
  const {modelKind, modelAction, modelAttribute} = $route.query
  try {
    const catalog = await $page.invokeHostCommand('bid.models.readCatalog', {})
    const result = modelAttribute === undefined ? await catalog.readGuide(modelKind, modelAction)
      : await catalog.readAttributeGuide(modelKind, modelAttribute)
    result.assertCurrent()
    const title = modelAttribute !== undefined ? `属性指南 · ${modelKind}.${modelAttribute}`
      : modelAction === undefined ? `模型定义 · ${modelKind}` : `方法指南 · ${modelKind}.${modelAction}`
    await $page.showAlert(result.guide, title)
  } catch {
    $page.showMessage('同一模型实例的定义指南无法核验', 'warning')
  }
}
