var catalogSearchName = ''
var catalogSearchApp = ''
var catalogRequestError = ''
var catalogSaveUncertain = false
var catalogOperationBusy = false
var catalogInitializationPending = true
var catalogUnknownId = ''
var catalogBindingsLoading = false
var catalogBindingsError = ''
var catalogBindingsResult = null
var catalogBindingsTarget = null
var catalogBindingsRowsReference = null
var catalogBindingsRevision = 0

function catalogTargetIsCurrent(view, row, id) {
  return $page.resolveView('Base_DataSet@catalog') === view
    && view.currentRow === row && view.rows.includes(row) && view.getPkKey(row) === id
}

function catalogPageIsStale(error) {
  return error instanceof Error && error.message.startsWith('PAGE_RUNTIME_STALE:')
}

function catalogBindingsText(value) {
  return value == null ? '' : String(value).trim()
}

function catalogBindingsDialogApi() {
  const api = $components.getApi('catalog-bindings-dialog')
  if (!api || typeof api.open !== 'function' || typeof api.close !== 'function'
    || typeof api.isVisible !== 'function') throw new Error('数据空间影响范围弹窗尚未装载')
  return api
}

function catalogBindingsTargetIsCurrent(target) {
  try {
    if (!target) return false
    const directory = $page.resolveView('Base_DataSet@catalog')
    const blueprintDataSet = $page.getDataSet('7AB874097A1E8711A42FD845939A6E05')
    return target !== null && directory === target.directory && directory.currentRow === target.row
      && directory.rows.includes(target.row) && directory.getPkKey(target.row) === target.id
      && directory.fieldAccess(target.row, 'rowid').read === 'visible'
      && catalogBindingsText(target.row.rowid) === target.id
      && directory.fieldAccess(target.row, 'sysid').read === 'visible'
      && catalogBindingsText(target.row.sysid) === target.sysid
      && blueprintDataSet === target.dataSet
      && (!target.dataSet || $page.resolveView('#7AB874097A1E8711A42FD845939A6E05@Base_NavigationInfo@catalogBindings') === target.view)
  } catch {
    return false
  }
}

function catalogBindingsResultIsCurrent() {
  if (!catalogBindingsResult || !catalogBindingsTargetIsCurrent(catalogBindingsTarget)) return false
  try {
    if (catalogBindingsTarget.view.rows !== catalogBindingsRowsReference) return false
    for (const row of catalogBindingsRowsReference) {
      for (const field of ['rowid', 'SysId', 'conid', 'prowid', 'FunName', 'name', 'NavigationUrl']) {
        if (catalogBindingsTarget.view.fieldAccess(row, field).read !== 'visible') return false
      }
    }
    return true
  } catch {
    return false
  }
}

function catalogBindingsProjection(view, rows, target) {
  if (!Array.isArray(rows) || rows.length !== view.total) throw new Error('完整性')
  const rowById = new Map()
  for (const row of rows) {
    const requiredFields = ['rowid', 'SysId', 'conid', 'prowid', 'FunName', 'name', 'NavigationUrl']
    for (const field of requiredFields) {
      if (view.fieldAccess(row, field).read !== 'visible') throw new Error('权限')
    }
    const id = catalogBindingsText(row.rowid)
    if (!id || view.getPkKey(row) == null || catalogBindingsText(view.getPkKey(row)) !== id || rowById.has(id)) {
      throw new Error('行身份')
    }
    if (row.SysId == null || catalogBindingsText(row.SysId) !== target.sysid) throw new Error('应用归属')
    if (!Object.hasOwn(row, 'conid') || row.conid === undefined) throw new Error('绑定字段')
    if (row.prowid === undefined) throw new Error('父节点字段')
    rowById.set(id, row)
  }

  const pathOf = (nodeId) => {
    const segments = []
    const visited = new Set()
    let currentId = nodeId
    while (currentId) {
      if (visited.has(currentId)) throw new Error('父链循环')
      visited.add(currentId)
      const row = rowById.get(currentId)
      if (!row) throw new Error('父节点缺失')
      segments.unshift(catalogBindingsText(row.FunName) || catalogBindingsText(row.name) || currentId)
      const parentId = catalogBindingsText(row.prowid)
      currentId = parentId === '000000' ? '' : parentId
    }
    return segments.join(' / ')
  }

  return rows.filter(row => catalogBindingsText(row.conid) === target.id)
    .map(row => ({ nodeId: catalogBindingsText(row.rowid), path: pathOf(catalogBindingsText(row.rowid)),
      navigationTarget: catalogBindingsText(row.NavigationUrl) }))
    .sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'))
}

function catalogBindingsErrorMessage(error) {
  const message = error instanceof Error ? error.message : ''
  if (message === '页面未配置蓝图查询场景') return message
  if (['完整性', '权限', '行身份', '应用归属', '绑定字段', '父节点字段'].includes(message)) {
    return '蓝图查询结果不完整，当前用户无权读取所需数据或数据身份不一致'
  }
  if (message === '父链循环' || message === '父节点缺失') return '蓝图层级数据异常，无法计算完整功能路径'
  return '查询蓝图绑定失败，请检查网络和数据权限后重试'
}

function onCatalogBindingsClose() {
  catalogBindingsRevision++
  catalogBindingsLoading = false
  catalogBindingsError = ''
  catalogBindingsResult = null
  catalogBindingsTarget = null
  catalogBindingsRowsReference = null
}

async function queryCatalogBindings(view, row) {
  if (catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain) return
  const id = catalogBindingsText(row?.rowid)
  const sysid = catalogBindingsText(row?.sysid)
  if (!row || !id || !sysid || !catalogTargetIsCurrent(view, row, id)
    || view.fieldAccess(row, 'rowid').read !== 'visible'
    || view.fieldAccess(row, 'sysid').read !== 'visible') return
  const target = { directory: view, row, id, sysid, dataSet: undefined, view: undefined }
  catalogBindingsTarget = target
  catalogBindingsResult = null
  catalogBindingsRowsReference = null
  catalogBindingsError = ''
  catalogBindingsLoading = true
  catalogOperationBusy = true
  const revision = ++catalogBindingsRevision
  try {
    catalogBindingsDialogApi().open()
    target.dataSet = $page.getDataSet('7AB874097A1E8711A42FD845939A6E05')
    if (!target.dataSet) throw new Error('页面未配置蓝图查询场景')
    target.view = $page.resolveView('#7AB874097A1E8711A42FD845939A6E05@Base_NavigationInfo@catalogBindings')
    if (!target.view) throw new Error('页面未配置蓝图查询场景')
    if (!catalogBindingsTargetIsCurrent(target)) throw new Error('目标失效')
    const response = await target.view.loadFromServer({
      fields: ['rowid', 'SysId', 'conid', 'prowid', 'FunName', 'name', 'NavigationUrl'],
      filter: { field: 'SysId', operator: 'eq', value: sysid },
      sort: 'rowid:asc', allPages: true, maxRows: 50000,
    })
    if (revision !== catalogBindingsRevision || !catalogBindingsTargetIsCurrent(target)) return
    if (!response.success) throw new Error(response.message || '查询失败')
    const rows = target.view.rows
    const projection = catalogBindingsProjection(target.view, rows, target)
    if (revision !== catalogBindingsRevision || !catalogBindingsTargetIsCurrent(target)
      || target.view.rows !== rows) return
    catalogBindingsRowsReference = rows
    catalogBindingsResult = projection
  } catch (error) {
    if (revision === catalogBindingsRevision && catalogBindingsTargetIsCurrent(target)) {
      catalogBindingsError = catalogBindingsErrorMessage(error)
    }
  } finally {
    if (revision === catalogBindingsRevision) catalogBindingsLoading = false
    catalogOperationBusy = false
  }
}

async function loadCreatorRows() {
  const data = $page.resolveView('Base_DataSet@catalog')
  const users = $page.resolveView('Base_UserInfo@catalogUsers')
  const ids = [...new Set(data.rows.flatMap((row) => {
    if (data.fieldAccess(row, 'createuser').read !== 'visible') return []
    const value = row.createuser
    return value == null || String(value).trim() === '' ? [] : [String(value).trim()]
  }))]
  if (ids.length === 0) return
  await users.loadFromServer({ fields: ['ID', 'ROWID', 'UserName'],
    filter: { field: 'ROWID', operator: 'in', value: ids }, allPages: true })
}

async function __init__() {
  try {
    const view = $page.resolveView('Base_DataSet@catalog')
    const apps = $page.resolveView('Base_AppSystemList@catalogApps')
    await apps.loadFromServer({ fields: ['rowid', 'AppDesc', 'AppName'], allPages: true })
    await view.loadFromServer({ fields: ['rowid', 'Name', 'Type', 'description', 'sysid', 'createuser', 'createtime'] })
    await loadCreatorRows()
  } finally {
    catalogInitializationPending = false
  }
}

async function applyCatalogFilter() {
  if (catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain) return
  const view = $page.resolveView('Base_DataSet@catalog')
  const terms = []
  if (catalogSearchName.trim()) {
    terms.push({ logic: 'or', filters: [
      { field: 'Name', operator: 'contains', value: catalogSearchName.trim() },
      { field: 'rowid', operator: 'eq', value: catalogSearchName.trim() },
    ] })
  }
  if (catalogSearchApp) terms.push({ field: 'sysid', operator: 'eq', value: catalogSearchApp })
  const filter = terms.length > 1 ? { logic: 'and', filters: terms }
    : terms.length === 1 ? terms[0] : undefined
  try {
    catalogRequestError = ''
    await view.executeFilter(filter)
    if (view.loadingError) throw new Error(view.loadingError)
    await loadCreatorRows()
  } catch (error) {
    catalogRequestError = error instanceof Error ? error.message : String(error)
    throw error
  }
}

async function changeCatalogPage(page) {
  if (catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain) return
  const view = $page.resolveView('Base_DataSet@catalog')
  try {
    catalogRequestError = ''
    await view.setPage(page)
    if (view.loadingError) throw new Error(view.loadingError)
    await loadCreatorRows()
  } catch (error) {
    catalogRequestError = error instanceof Error ? error.message : String(error)
    throw error
  }
}

async function changeCatalogPageSize(event) {
  if (catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain) return
  const view = $page.resolveView('Base_DataSet@catalog')
  try {
    catalogRequestError = ''
    await view.setPageSize(Number(event.target.value))
    if (view.loadingError) throw new Error(view.loadingError)
    await loadCreatorRows()
  } catch (error) {
    catalogRequestError = error instanceof Error ? error.message : String(error)
    throw error
  }
}

async function addCatalogEntry() {
  if (catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain) return
  catalogOperationBusy = true
  const view = $page.resolveView('Base_DataSet@catalog')
  try {
    if (catalogSaveUncertain) {
      $page.showMessage(`上次保存结果未知（${catalogUnknownId}）。请刷新确认服务端状态后再新增。`, 'warning')
      return
    }
    if (view.addActionState() !== 'enabled') {
      $page.showMessage('当前没有数据空间新增权限', 'warning')
      return
    }
    const apps = $page.resolveView('Base_AppSystemList@catalogApps')
    const options = apps.rows.flatMap((row) => {
      if (apps.fieldAccess(row, 'rowid').read !== 'visible') return []
      const value = row.rowid
      if (typeof value !== 'string' || !value.trim()) return []
      let label = ''
      for (const field of ['AppDesc', 'AppName']) {
        const access = apps.fieldAccess(row, field)
        if (access.read === 'masked') { label = '••••'; break }
        if (access.read === 'visible' && row[field] != null && String(row[field]).trim()) {
          label = String(row[field]).trim()
          break
        }
      }
      return [{ value: value.trim(), label: label || value.trim() }]
    })
    const selected = await $page.selectEntities({ title: '选择所属应用', entityName: '应用', searchable: true,
      multiple: false, options })
    if (selected.length === 0) return
    const sysid = String(selected[0].value).trim()
    if (!options.some((option) => option.value === sysid)) throw new Error('所选应用不在当前可读候选项中')
    const name = await $page.showPrompt('请输入数据空间名称（最多100字）', '新增数据空间', { placeholder: '名称' })
    if (name === null) return
    const normalizedName = name.trim()
    if (!normalizedName) {
      $page.showMessage('数据空间名称不能为空', 'warning')
      return
    }
    if (normalizedName.length > 100) {
      $page.showMessage('数据空间名称不能超过100字', 'warning')
      return
    }
    const description = await $page.showPrompt('请输入描述（最多500字）', '新增数据空间', { placeholder: '描述' })
    if (description === null) return
    const normalizedDescription = description.trim()
    if (normalizedDescription.length > 500) {
      $page.showMessage('数据空间描述不能超过500字', 'warning')
      return
    }
    if (view.addActionState() !== 'enabled') {
      $page.showMessage('新增权限已变化，请刷新后重试', 'warning')
      return
    }
    const row = await view.addRow({ Name: normalizedName, Type: 'datasource',
      description: normalizedDescription, sysid })
    const id = view.getPkKey(row)
    if (typeof id !== 'string' && typeof id !== 'number') throw new Error('新增数据空间缺少本地正式主键')
    catalogUnknownId = String(id)
    catalogSaveUncertain = true
    try {
      const result = await view.dataSet.saveChanges({ views: [{ tableName: 'Base_DataSet', viewId: 'catalog', ids: [id] }] })
      if (!result.success) throw new Error('数据空间保存未确认成功')
      catalogSaveUncertain = false
      catalogUnknownId = ''
    } catch (error) {
      catalogRequestError = error instanceof Error ? error.message : String(error)
      if (catalogSaveUncertain) {
        $page.showMessage(`数据空间保存结果未知（${catalogUnknownId}）：${catalogRequestError}。请刷新确认后再操作。`, 'error')
        return
      }
      throw error
    }
    try {
      await view.refresh()
      if (view.loadingError) throw new Error(view.loadingError)
      await loadCreatorRows()
      $page.showMessage('数据空间已保存', 'success')
    } catch (error) {
      catalogRequestError = error instanceof Error ? error.message : String(error)
      $page.showMessage(`数据空间已保存，刷新失败：${catalogRequestError}`, 'error')
    }
  } catch (error) {
    catalogRequestError = error instanceof Error ? error.message : String(error)
    if (!catalogPageIsStale(error)) $page.showMessage(`新增数据空间失败：${catalogRequestError}`, 'error')
  } finally {
    catalogOperationBusy = false
  }
}

async function editCatalogEntry(view, row) {
  if (catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain) return
  catalogOperationBusy = true
  const id = view.getPkKey(row)
  try {
    if ((typeof id !== 'string' && typeof id !== 'number') || !catalogTargetIsCurrent(view, row, id)) return
    if (view.editActionState(row) !== 'enabled') {
      $page.showMessage('当前没有此数据空间的编辑权限', 'warning')
      return
    }
    const editable = ['Name', 'description'].filter(field => view.fieldAccess(row, field).write === 'allowed')
    if (editable.length === 0) {
      $page.showMessage('当前没有可编辑的数据空间字段', 'warning')
      return
    }
    const input = {}
    for (const field of editable) {
      const access = view.fieldAccess(row, field)
      const visibleValue = access.read === 'visible' ? row[field] : undefined
      const defaultValue = visibleValue == null ? '' : String(visibleValue)
      const title = field === 'Name' ? '编辑数据空间名称' : '编辑数据空间描述'
      const label = field === 'Name' ? '名称' : '描述'
      const value = await $page.showPrompt(`请输入${label}${field === 'Name' ? '（最多100字）' : '（最多500字）'}`, title,
        { placeholder: label, ...(access.read === 'visible' ? { defaultValue } : {}) })
      if (!catalogTargetIsCurrent(view, row, id)) return
      if (value === null) return
      const normalized = value.trim()
      if (field === 'Name' && !normalized) {
        $page.showMessage('数据空间名称不能为空', 'warning')
        return
      }
      if (view.fieldAccess(row, field).required && !normalized) {
        $page.showMessage(`数据空间${label}不能为空`, 'warning')
        return
      }
      if (normalized.length > (field === 'Name' ? 100 : 500)) {
        $page.showMessage(`数据空间${label}不能超过${field === 'Name' ? 100 : 500}字`, 'warning')
        return
      }
      input[field] = normalized
    }
    if (!catalogTargetIsCurrent(view, row, id)) return
    if (view.editActionState(row) !== 'enabled') {
      $page.showMessage('编辑权限已变化，请刷新后重试', 'warning')
      return
    }
    const patch = {}
    for (const field of editable) {
      if (view.fieldAccess(row, field).write !== 'allowed') {
        $page.showMessage('字段编辑权限已变化，请刷新后重试', 'warning')
        return
      }
      if (view.fieldAccess(row, field).read !== 'visible') {
        patch[field] = input[field]
        continue
      }
      const original = row[field]
      if (field === 'description' && original == null && input[field] === '') continue
      if (String(original ?? '') !== input[field]) patch[field] = input[field]
    }
    if (Object.keys(patch).length === 0) return
    const updated = await view.editRowById(id, patch)
    if (updated === false || (typeof updated === 'object' && !updated.success)) {
      throw new Error(typeof updated === 'object' ? updated.message ?? '数据空间暂存编辑失败' : '目标数据空间已不存在')
    }
    catalogUnknownId = String(id)
    catalogSaveUncertain = true
    try {
      const result = await view.dataSet.saveChanges({ views: [{ tableName: 'Base_DataSet', viewId: 'catalog', ids: [id] }] })
      if (!result.success) throw new Error(result.message ?? '数据空间保存未确认成功')
      catalogSaveUncertain = false
      catalogUnknownId = ''
    } catch (error) {
      catalogRequestError = error instanceof Error ? error.message : String(error)
      if (catalogSaveUncertain) {
        $page.showMessage(`当前记录保存结果未知：${catalogRequestError}。请刷新确认后再操作。`, 'error')
        return
      }
      throw error
    }
    try {
      await view.refresh()
      if (view.loadingError) throw new Error(view.loadingError)
      const refreshed = view.rows.find(item => view.getPkKey(item) === id)
      await loadCreatorRows()
      $page.showMessage(refreshed ? '数据空间已保存' : '数据空间已保存，当前记录已不在列表中', 'success')
    } catch (error) {
      catalogRequestError = error instanceof Error ? error.message : String(error)
      if (!catalogPageIsStale(error)) $page.showMessage(`数据空间已保存，刷新失败：${catalogRequestError}`, 'error')
    }
  } catch (error) {
    catalogRequestError = error instanceof Error ? error.message : String(error)
    if (!catalogPageIsStale(error)) $page.showMessage(`编辑数据空间失败：${catalogRequestError}`, 'error')
  } finally {
    catalogOperationBusy = false
  }
}

async function deleteCatalogEntry(view, row) {
  if (catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain) return
  catalogOperationBusy = true
  const id = view.getPkKey(row)
  let saveStarted = false
  try {
    if ((typeof id !== 'string' && typeof id !== 'number') || !catalogTargetIsCurrent(view, row, id)) return
    if (view.deleteActionState(row) !== 'enabled') {
      $page.showMessage('当前没有此数据空间的删除权限', 'warning')
      return
    }
    const confirmed = await $page.showConfirm('确认删除当前数据空间？此操作无法撤销。', '删除数据空间',
      { confirmText: '删除', cancelText: '取消', type: 'warning' })
    if (!confirmed || !catalogTargetIsCurrent(view, row, id)) return
    if (view.deleteActionState(row) !== 'enabled') {
      $page.showMessage('删除权限已变化，请刷新后重试', 'warning')
      return
    }

    const page = view.page
    const onlyRowOnPage = view.rows.length === 1
    const removed = await view.removeRow(id)
    if (removed === false || (typeof removed === 'object' && !removed.success)) {
      throw new Error('当前数据空间暂存删除失败')
    }
    catalogUnknownId = String(id)
    catalogSaveUncertain = true
    saveStarted = true
    let result
    try {
      result = await view.dataSet.saveChanges({ views: [{ tableName: 'Base_DataSet', viewId: 'catalog', ids: [id] }] })
      if (!result.success || result.data.deletedCount !== 1) throw new Error('删除回执未确认')
    } catch {
      catalogRequestError = '删除结果未知，请重新打开页面核对服务端状态后再操作'
      $page.showMessage(catalogRequestError, 'error')
      return
    }
    catalogSaveUncertain = false
    catalogUnknownId = ''
    try {
      if (page > 1 && onlyRowOnPage) await view.setPage(page - 1)
      else await view.refresh()
      if (view.loadingError) throw new Error('refresh')
      if (view.rows.some(item => view.getPkKey(item) === id)) {
        catalogRequestError = '删除回执已确认，但刷新仍含原记录，回读不一致'
        $page.showMessage(catalogRequestError, 'error')
        return
      }
      await loadCreatorRows()
      catalogRequestError = ''
      $page.showMessage('数据空间已删除', 'success')
    } catch (error) {
      catalogRequestError = '数据空间已删除，刷新失败'
      if (!catalogPageIsStale(error)) $page.showMessage(catalogRequestError, 'error')
    }
  } catch (error) {
    catalogRequestError = saveStarted ? '删除结果未知，请重新打开页面核对服务端状态后再操作' : '数据空间删除失败'
    if (!catalogPageIsStale(error)) $page.showMessage(catalogRequestError, 'error')
  } finally {
    catalogOperationBusy = false
  }
}

function normalizeApiInfoText(value) {
  return value == null ? '' : String(value).trim()
}

function quoteApiInfoValue(value) {
  return `'${normalizeApiInfoText(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    .replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`
}

function apiInfoIdentifier(value) {
  return normalizeApiInfoText(value).replace(/[^\p{L}\p{N}_$]+/gu, '_')
    .replace(/^_+/, '').replace(/^([0-9])/u, '_$1') || 'Model'
}

function formatCatalogApiInfo(dataSetId, models, fields) {
  const fieldMap = new Map()
  for (const field of fields) {
    const modelId = normalizeApiInfoText(field.dataModelId)
    if (!modelId) continue
    const group = fieldMap.get(modelId) || []
    group.push(field)
    fieldMap.set(modelId, group)
  }
  const declarations = new Set()
  const lines = [`const DataSetId = ${quoteApiInfoValue(dataSetId)};`]
  models.forEach(model => {
    const base = apiInfoIdentifier(model.Name)
    let identifier = base
    let suffix = 2
    const declarationNames = candidate => [`DataModel_${candidate}`, `DataModel_${candidate}_Type`, `DataModel_${candidate}_PK`]
    while (declarationNames(identifier).some(name => declarations.has(name))) identifier = `${base}_${suffix++}`
    declarationNames(identifier).forEach(name => declarations.add(name))
    const modelId = normalizeApiInfoText(model.rowid)
    const primaryKeyField = (fieldMap.get(modelId) || []).find(field =>
      (normalizeApiInfoText(field.type) || 'dataModel') === 'dataModel' && Number(field.IsPKey))
    const primaryKey = normalizeApiInfoText(primaryKeyField?.Name) || 'rowid'
    lines.push(
      `const DataModel_${identifier} = ${quoteApiInfoValue(model.Name)};`,
      `const DataModel_${identifier}_Type = ${quoteApiInfoValue(model.Type)};`,
      `const DataModel_${identifier}_PK = ${quoteApiInfoValue(primaryKey)};`,
    )
  })
  return lines.join('\n')
}

function assertApiInfoRowsReadable({ view, rows, fields, dataSetId, modelIds }) {
  if (!Array.isArray(rows)) throw new Error('设计视图查询结果无效')
  const rowIds = new Set()
  for (const row of rows) {
    for (const field of fields) {
      if (view.fieldAccess(row, field).read !== 'visible') throw new Error('设计数据字段不可读')
    }
    const id = normalizeApiInfoText(row.rowid)
    if (!id || rowIds.has(id)) throw new Error('设计数据正式行 ID 缺失或重复')
    rowIds.add(id)
    if (normalizeApiInfoText(row.dataSetId) !== dataSetId) throw new Error('设计数据归属与当前数据空间不一致')
    if (modelIds && !modelIds.has(normalizeApiInfoText(row.dataModelId))) throw new Error('字段归属与正式模型不一致')
  }
}

function catalogApiTargetIsCurrent(view, row, id) {
  try {
    return catalogTargetIsCurrent(view, row, id)
      && view.fieldAccess(row, 'rowid').read === 'visible'
      && normalizeApiInfoText(row.rowid) === id
  } catch {
    return false
  }
}

function catalogApiDesignResultIsCurrent({ dataSet, models, modelRows, fields, fieldRows, id,
  requiredModelFields, requiredFieldFields }) {
  try {
    if ($page.getDataSet('8D1AB14DD8277F3E7017CD38F77B09FD') !== dataSet
      || $page.resolveView('#8D1AB14DD8277F3E7017CD38F77B09FD@Base_DataModel@apiInfoModels') !== models
      || $page.resolveView('#8D1AB14DD8277F3E7017CD38F77B09FD@Base_DataModel_Field@apiInfoFields') !== fields
      || models.rows !== modelRows || fields.rows !== fieldRows) return false
    assertApiInfoRowsReadable({ view: models, rows: modelRows, fields: requiredModelFields, dataSetId: id })
    const modelIds = new Set(modelRows.map(model => normalizeApiInfoText(model.rowid)))
    assertApiInfoRowsReadable({ view: fields, rows: fieldRows, fields: requiredFieldFields, dataSetId: id, modelIds })
    return true
  } catch {
    return false
  }
}

async function copyCatalogApiInfo(view, row) {
  if (catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain) {
    if (catalogSaveUncertain) $page.showMessage('上次保存结果未知，请刷新确认后再复制 API', 'warning')
    return
  }
  if (!row || view.currentRow !== row || view.fieldAccess(row, 'rowid').read !== 'visible') return
  const id = normalizeApiInfoText(row.rowid)
  if (!id || !catalogApiTargetIsCurrent(view, row, id)) return
  catalogOperationBusy = true
  try {
    const designDataSet = $page.getDataSet('8D1AB14DD8277F3E7017CD38F77B09FD')
    if (!designDataSet) throw new Error('页面未配置数据空间设计场景')
    const models = $page.resolveView('#8D1AB14DD8277F3E7017CD38F77B09FD@Base_DataModel@apiInfoModels')
    const fields = $page.resolveView('#8D1AB14DD8277F3E7017CD38F77B09FD@Base_DataModel_Field@apiInfoFields')
    if (!models || !fields) throw new Error('页面未配置数据空间设计场景')
    if (!catalogApiTargetIsCurrent(view, row, id)) return
    const modelResult = await models.loadFromServer({ fields: ['rowid', 'Name', 'Type', 'dataSetId'],
      filter: { field: 'dataSetId', operator: 'eq', value: id }, allPages: true, maxRows: 50000 })
    if (!modelResult.success) throw new Error(modelResult.message || '模型查询失败')
    const modelRows = models.rows
    if (!catalogApiTargetIsCurrent(view, row, id)) return
    const fieldResult = await fields.loadFromServer({ fields: ['rowid', 'Name', 'type', 'IsPKey', 'dataSetId', 'dataModelId'],
      filter: { field: 'dataSetId', operator: 'eq', value: id }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    if (!fieldResult.success) throw new Error(fieldResult.message || '字段查询失败')
    const fieldRows = fields.rows
    if (!catalogApiTargetIsCurrent(view, row, id)) return
    const requiredModelFields = ['rowid', 'Name', 'Type', 'dataSetId']
    const requiredFieldFields = ['rowid', 'Name', 'type', 'IsPKey', 'dataSetId', 'dataModelId']
    const designResult = { dataSet: designDataSet, models, modelRows, fields, fieldRows, id,
      requiredModelFields, requiredFieldFields }
    if (!catalogApiDesignResultIsCurrent(designResult)) throw new Error('设计数据查询结果已失效')
    if (!catalogApiTargetIsCurrent(view, row, id)) return
    const text = formatCatalogApiInfo(id, modelRows, fieldRows)
    await $page.copyText(text)
    if (!catalogApiDesignResultIsCurrent(designResult) || !catalogApiTargetIsCurrent(view, row, id)) return
    $page.showMessage('API 信息已复制', 'success')
  } catch (error) {
    const staleOwner = error instanceof Error && (error.message.startsWith('SPARK_EXECUTION_SCOPE_STALE:')
      || error.message.startsWith('SPARK_QUERY_CONTEXT_STALE:'))
    if (!catalogPageIsStale(error) && !staleOwner && catalogApiTargetIsCurrent(view, row, id)) {
      $page.showMessage(error instanceof Error && error.message === '页面未配置数据空间设计场景'
        ? error.message : '复制 API 失败，请检查数据权限或剪贴板后重试', 'error')
    }
  } finally {
    catalogOperationBusy = false
  }
}

function openCatalogDesign(view, row) {
  const currentView = $page.resolveView('Base_DataSet@catalog')
  if (catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain
    || !view || currentView !== view || !row || view.currentRow !== row || !view.rows.includes(row)
    || view.fieldAccess(row, 'rowid').read !== 'visible') return
  const id = catalogBindingsText(row.rowid)
  if (!id || catalogBindingsText(view.getPkKey(row)) !== id) return
  const tenantId = $route.params.tenantId
  const projectId = $route.params.projectId
  if (typeof tenantId !== 'string' || !tenantId.trim()
    || typeof projectId !== 'string' || !projectId.trim()) return
  const prefix = `/t/${encodeURIComponent(tenantId.trim())}/${encodeURIComponent(projectId.trim())}/`
  if (typeof $route.fullPath !== 'string' || !$route.fullPath.startsWith(prefix)) return
  catalogOperationBusy = true
  try {
    $page.navigate(`/t/${encodeURIComponent(tenantId.trim())}/${encodeURIComponent(projectId.trim())}/__tool/8D1AB14DD8277F3E7017CD38F77B09FD`, {
      scenarioId: '8D1AB14DD8277F3E7017CD38F77B09FD',
      additionalScenarioIds: ['90A82E287930A234FEC3E687C94A93EA'],
      dataSpaceId: id,
      returnTo: $route.fullPath,
    })
  } finally {
    catalogOperationBusy = false
  }
}

function RenderCatalogActions() {
  const view = $page.resolveView('Base_DataSet@catalog')
  const actions = []
  if (view.addActionState() === 'enabled') actions.push(h('button', { type: 'button', class: 'catalog-button catalog-add',
    disabled: catalogInitializationPending || catalogSaveUncertain || catalogOperationBusy, onClick: addCatalogEntry }, '新增数据空间'))
  const row = view.currentRow
  if (row && view.fieldAccess(row, 'rowid').read === 'visible' && normalizeApiInfoText(row.rowid)) {
    actions.push(h('button', { type: 'button', class: 'catalog-button catalog-copy-api',
      disabled: catalogInitializationPending || catalogSaveUncertain || catalogOperationBusy, onClick: () => copyCatalogApiInfo(view, row) }, '复制 API'))
  }
  if (row && view.rows.includes(row) && view.fieldAccess(row, 'rowid').read === 'visible'
    && view.fieldAccess(row, 'sysid').read === 'visible'
    && catalogBindingsText(row.rowid) && catalogBindingsText(row.sysid)) {
    actions.push(h('button', { type: 'button', class: 'catalog-button catalog-query-bindings',
      disabled: catalogInitializationPending || catalogSaveUncertain || catalogOperationBusy,
      onClick: () => queryCatalogBindings(view, row) }, '查询绑定'))
  }
  if (row && view.rows.includes(row) && view.fieldAccess(row, 'rowid').read === 'visible'
    && catalogBindingsText(row.rowid)) {
    actions.push(h('button', { type: 'button', class: 'catalog-button catalog-design',
      disabled: catalogInitializationPending || catalogSaveUncertain || catalogOperationBusy,
      onClick: () => openCatalogDesign(view, row) }, '设计'))
  }
  if (row && view.editActionState(row) === 'enabled'
    && ['Name', 'description'].some(field => view.fieldAccess(row, field).write === 'allowed')) {
    actions.push(h('button', { type: 'button', class: 'catalog-button catalog-edit', disabled: catalogInitializationPending || catalogSaveUncertain || catalogOperationBusy,
      onClick: () => editCatalogEntry(view, row) }, '编辑数据空间'))
  }
  if (row && view.deleteActionState(row) === 'enabled') {
    actions.push(h('button', { type: 'button', class: 'catalog-button catalog-delete', disabled: catalogInitializationPending || catalogSaveUncertain || catalogOperationBusy,
      onClick: () => deleteCatalogEntry(view, row) }, '删除数据空间'))
  }
  return [h('div', { class: 'catalog-actions' }, actions)]
}

function RenderCatalogPaging() {
  const view = $page.resolveView('Base_DataSet@catalog')
  const start = view.total === 0 ? 0 : (view.page - 1) * view.pageSize + 1
  const end = Math.min(view.page * view.pageSize, view.total)
  return [h('div', { class: 'catalog-pager' }, [
    h('span', {}, `${start}-${end} / ${view.total}`),
    h('button', { type: 'button', disabled: catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain || view.page <= 1,
      onClick: () => changeCatalogPage(view.page - 1) }, '上一页'),
    h('span', {}, `第 ${view.page} 页`),
    h('button', { type: 'button', disabled: catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain || end >= view.total,
      onClick: () => changeCatalogPage(view.page + 1) }, '下一页'),
    h('select', { value: view.pageSize, disabled: catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain,
      onChange: changeCatalogPageSize }, [10, 20, 50].map((size) =>
      h('option', { value: size }, `${size} 条/页`))),
  ]), catalogRequestError ? h('p', { class: 'catalog-error', role: 'alert' }, catalogRequestError) : null]
}

function RenderCatalogBindings() {
  if (!catalogBindingsTargetIsCurrent(catalogBindingsTarget)) {
    return [h('div', { class: 'catalog-bindings-status', role: 'status' }, '数据已变化，请关闭后重新查询')]
  }
  if (catalogBindingsLoading) {
    return [h('div', { class: 'catalog-bindings-status', role: 'status' }, '正在查询绑定…')]
  }
  if (catalogBindingsError) {
    return [h('div', { class: 'catalog-bindings-status catalog-bindings-error', role: 'alert' }, catalogBindingsError)]
  }
  if (!catalogBindingsResultIsCurrent()) {
    return [h('div', { class: 'catalog-bindings-status', role: 'status' }, '数据已变化，请关闭后重新查询')]
  }
  if (catalogBindingsResult.length === 0) {
    return [h('div', { class: 'catalog-bindings-status', role: 'status' }, '当前应用暂无蓝图节点绑定该数据空间')]
  }
  return [h('div', { class: 'catalog-bindings-table-wrap' }, [
    h('table', { class: 'catalog-bindings-table' }, [
      h('thead', {}, [h('tr', {}, [
        h('th', {}, '功能路径'), h('th', {}, '蓝图节点 ID'), h('th', {}, '导航地址'),
      ])]),
      h('tbody', {}, catalogBindingsResult.map(item => h('tr', { key: item.nodeId }, [
        h('td', {}, item.path), h('td', {}, item.nodeId), h('td', {}, item.navigationTarget),
      ]))),
    ]),
  ])]
}

function findCurrentRow(view, rowKey) {
  return view.rows.find((row) => String(view.getPkKey(row)) === String(rowKey)) || null
}

function RenderCatalogApp(props) {
  const data = $page.resolveView('Base_DataSet@catalog')
  const row = findCurrentRow(data, props.rowKey)
  if (!row) return []
  const access = data.fieldAccess(row, 'sysid')
  if (access.read === 'masked') return [h('span', {}, '••••')]
  if (access.read !== 'visible' || row.sysid == null || row.sysid === '') return [h('span', {}, '')]
  const id = String(row.sysid)
  const apps = $page.resolveView('Base_AppSystemList@catalogApps')
  const matches = apps.rows.filter((item) => String(item.rowid ?? '') === id
    && apps.fieldAccess(item, 'rowid').read === 'visible')
  if (matches.length !== 1) return [h('span', {}, id)]
  const item = matches[0]
  for (const field of ['AppDesc', 'AppName']) {
    const fieldAccess = apps.fieldAccess(item, field)
    if (fieldAccess.read === 'masked') return [h('span', {}, '••••')]
    if (fieldAccess.read === 'visible' && item[field] != null && String(item[field]).trim()) {
      return [h('span', {}, String(item[field]).trim())]
    }
  }
  return [h('span', {}, id)]
}

function RenderCatalogCreator(props) {
  const data = $page.resolveView('Base_DataSet@catalog')
  const row = findCurrentRow(data, props.rowKey)
  if (!row) return []
  const access = data.fieldAccess(row, 'createuser')
  if (access.read === 'masked') return [h('span', {}, '••••')]
  if (access.read !== 'visible' || row.createuser == null || row.createuser === '') return [h('span', {}, '')]
  const id = String(row.createuser)
  const users = $page.resolveView('Base_UserInfo@catalogUsers')
  const matches = users.rows.filter((item) => {
    if (users.getPkKey(item) !== item.ID || users.fieldAccess(item, 'ROWID').read !== 'visible'
      || users.fieldAccess(item, 'rowid').read !== 'visible') return false
    const outputId = Object.hasOwn(item, 'rowid') ? String(item.rowid ?? '') : ''
    const formalId = Object.hasOwn(item, 'ROWID') ? String(item.ROWID ?? '') : ''
    if (outputId && formalId && outputId !== formalId) return false
    return (outputId || formalId) === id
  })
  if (matches.length !== 1) return [h('span', {}, '未解析用户')]
  const item = matches[0]
  const nameAccess = users.fieldAccess(item, 'UserName')
  if (nameAccess.read === 'masked') return [h('span', {}, '••••')]
  if (nameAccess.read !== 'visible') return [h('span', {}, '')]
  const label = String(item.UserName ?? '').trim() || '未解析用户'
  return [h('span', {}, label)]
}

function RenderCatalogSearch() {
  const apps = $page.resolveView('Base_AppSystemList@catalogApps')
  const options = apps.rows.filter((row) => apps.fieldAccess(row, 'rowid').read === 'visible')
    .map((row) => {
      let label = ''
      for (const field of ['AppDesc', 'AppName']) {
        const access = apps.fieldAccess(row, field)
        if (access.read === 'masked') { label = '••••'; break }
        if (access.read === 'visible' && row[field] != null && String(row[field]).trim()) {
          label = String(row[field]).trim()
          break
        }
      }
      return { value: String(row.rowid), label: label || String(row.rowid) }
    })
  return [
    h('div', { class: 'catalog-search-controls' }, [
      h('input', { class: 'catalog-search-name', value: catalogSearchName, placeholder: '输入名称或 ID',
        onInput: (event) => { catalogSearchName = event.target.value } }),
      h('select', { class: 'catalog-search-app', value: catalogSearchApp,
        onChange: (event) => { catalogSearchApp = event.target.value } }, [
        h('option', { value: '' }, '全部应用'),
        ...options.map((option) => h('option', { value: option.value }, option.label)),
      ]),
      h('button', { type: 'button', class: 'catalog-button',
        disabled: catalogInitializationPending || catalogOperationBusy || catalogSaveUncertain, onClick: applyCatalogFilter }, '查询'),
      catalogRequestError ? h('span', { class: 'catalog-error', role: 'alert' }, catalogRequestError) : null,
    ]),
  ]
}
