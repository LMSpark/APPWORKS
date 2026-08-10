let _pageState = {
	initialized: false,
	suppressRowsSnapshot: false,
	filterActive: false,
	masterRows: [],
	lastTreeLoadError: '',
	loadFailureNotified: false,
}

function getView(tableName, viewId) {
	return $dataSet?.getView(tableName, viewId || 'default') || null
}

function getTreeApi() {
	return $components?.getApi('treeEditor') || null
}

function waitForApi(getter, onReady, onTimeout) {
	var retries = 30
	var count = 0

	function poll() {
		var api = getter()
		if (api) {
			onReady(api)
			return
		}
		count += 1
		if (count >= retries) {
			if (onTimeout) onTimeout()
			return
		}
		setTimeout(poll, 60)
	}

	poll()
}

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value == null ? [] : value))
}

function isCrudResult(value) {
	return value !== null && typeof value === 'object' && typeof value.success === 'boolean'
}

function ensureCrudSuccess(result, fallbackMessage) {
	if (!isCrudResult(result)) return result !== false
	if (result.success) return true
	var message = result.message || (result.error && result.error.message) || fallbackMessage
	throw new Error(message || fallbackMessage || '提交失败')
}

function getTreeLoadErrorMessage(view) {
	if (!view) return '导航树远端加载失败'
	var error = view.loadingError
	if (error && error.message) return String(error.message)
	return '导航树远端加载失败'
}

function formatTreeStatus(message, suffix) {
	var text = String(message || '').trim()
	if (!text) return suffix ? String(suffix) : ''
	return suffix ? text + '｜' + suffix : text
}

function nowText() {
	return new Date().toLocaleString('zh-CN', { hour12: false })
}

function readRows(value) {
	return Array.isArray(value) ? value : []
}

function walkTree(rows, visitor, depth) {
	var list = readRows(rows)
	var level = depth || 1
	for (var i = 0; i < list.length; i += 1) {
		var row = list[i]
		if (!row) continue
		visitor(row, level)
		if (Array.isArray(row.children) && row.children.length > 0) {
			walkTree(row.children, visitor, level + 1)
		}
	}
}

function flattenNodeCount(rows) {
	var count = 0
	walkTree(rows, function() {
		count += 1
	})
	return count
}

function findFirstNode(rows) {
	var list = readRows(rows)
	if (list.length === 0) return null
	return list[0] || null
}

function computeMeta(rows, statusText) {
	var totalNodes = 0
	var pageCount = 0
	var groupCount = 0
	var refCount = 0
	var hiddenCount = 0

	walkTree(rows, function(row) {
		totalNodes += 1
		var kind = String(row.nodeKind || '')
		if (kind === 'page' || kind === 'system-page' || kind === 'sub-page') pageCount += 1
		if (kind === 'module' || kind === 'system-directory') groupCount += 1
		if (kind === 'ref') refCount += 1
		if (row.hidden === true) hiddenCount += 1
	})

	return {
		id: 1,
		totalNodes: totalNodes,
		pageCount: pageCount,
		groupCount: groupCount,
		refCount: refCount,
		hiddenCount: hiddenCount,
		statusText: statusText || '树数据已同步',
		lastSync: nowText(),
	}
}

function syncPageMeta(statusText, rows) {
	var metaView = getView('PageMeta')
	if (!metaView) return
	var sourceRows = rows || readRows(getView('NavigationNodes')?.rows)
	metaView.replaceRows([computeMeta(sourceRows, statusText)])
	metaView.setCurrentRowById(1)
}

function nextLogId(rows) {
	var list = readRows(rows)
	var maxId = 0
	for (var i = 0; i < list.length; i += 1) {
		var id = list[i] && list[i].id
		if (typeof id === 'number' && id > maxId) maxId = id
	}
	return maxId + 1
}

function pushActionLog(action, target, status, detail) {
	var logView = getView('ActionLogs')
	if (!logView) return
	var rows = readRows(logView.rows)
	var entry = {
		id: nextLogId(rows),
		time: nowText(),
		action: action,
		target: target,
		status: status,
		detail: detail,
	}
	logView.replaceRows([entry].concat(rows).slice(0, 30))
}

function readFilters() {
	var view = getView('EditorFilters')
	return view?.currentRow || view?.rows?.[0] || {
		searchKeyword: '',
		nodeKindFilter: 'all',
		placementFilter: 'all',
	}
}

function setFilters(patch) {
	var view = getView('EditorFilters')
	if (!view) return
	if (!view.updateRowById(1, patch)) {
		view.replaceRows([Object.assign({ id: 1 }, readFilters(), patch)])
		view.setCurrentRowById(1)
	}
}

function hasActiveFilters(filters) {
	if (!filters) return false
	return !!(
		String(filters.searchKeyword || '').trim() ||
		(filters.nodeKindFilter && filters.nodeKindFilter !== 'all') ||
		(filters.placementFilter && filters.placementFilter !== 'all')
	)
}

function nodeMatchesFilters(node, filters) {
	var keyword = String(filters.searchKeyword || '').trim().toLowerCase()
	var nodeKindFilter = String(filters.nodeKindFilter || 'all')
	var placementFilter = String(filters.placementFilter || 'all')

	if (nodeKindFilter !== 'all' && String(node.nodeKind || '') !== nodeKindFilter) {
		return false
	}
	if (placementFilter !== 'all' && String(node.childPlacement || '') !== placementFilter) {
		return false
	}
	if (!keyword) return true

	var haystack = [node.title, node.path, node.description, node.icon, node.nodeKind]
		.filter(Boolean)
		.join(' ')
		.toLowerCase()
	return haystack.indexOf(keyword) >= 0
}

function filterTreeRows(rows, filters) {
	var list = readRows(rows)
	var result = []

	for (var i = 0; i < list.length; i += 1) {
		var node = list[i]
		var cloned = Object.assign({}, node)
		var filteredChildren = filterTreeRows(node.children, filters)
		var matched = nodeMatchesFilters(node, filters)

		if (filteredChildren.length > 0) {
			cloned.children = filteredChildren
			result.push(cloned)
			continue
		}

		if (matched) {
			cloned.children = []
			result.push(cloned)
		}
	}

	return result
}

function captureMasterRows(rows) {
	_pageState.masterRows = cloneJson(rows)
}

function bindTreeView() {
	var treeView = getView('NavigationNodes')
	if (!treeView || _pageState.initialized) return

	treeView.events.on('rowsChanged', function() {
		var currentRows = readRows(treeView.rows)
		if (_pageState.suppressRowsSnapshot) {
			_pageState.suppressRowsSnapshot = false
			syncPageMeta(_pageState.filterActive ? '已应用本地筛选' : '树数据已同步', currentRows)
			return
		}
		if (!_pageState.filterActive) {
			captureMasterRows(currentRows)
		}
		syncPageMeta(_pageState.filterActive ? '当前显示为筛选结果' : '树数据已同步', currentRows)
	})

	treeView.events.on('currentRowChanged', function(row) {
		if (!row) return
		pushActionLog('切换当前节点', String(row.title || row.id || '-'), 'info', String(row.path || '无路径'))
	})

	treeView.events.on('requestStateChanged', function(state) {
		if (state === 2) {
			_pageState.lastTreeLoadError = ''
			_pageState.loadFailureNotified = false
			syncPageMeta('正在拉取远端导航树...', readRows(treeView.rows))
			return
		}
		if (state === 3) {
			_pageState.lastTreeLoadError = ''
			_pageState.loadFailureNotified = false
			var loadedRows = readRows(treeView.rows)
			var loadedCount = flattenNodeCount(loadedRows)
			if (loadedCount === 0) {
				syncPageMeta('远端导航树加载成功，但当前项目返回 0 个节点', loadedRows)
				pushActionLog('远端加载', 'NavigationNodes', 'warning', '接口请求成功，但返回 0 个导航节点')
				if ($page) $page.showMessage('导航树接口已返回，但当前项目没有节点数据', 'warning')
				return
			}
			syncPageMeta('树数据已同步', loadedRows)
			pushActionLog('远端加载', 'NavigationNodes', 'success', '导航树远端加载完成')
			return
		}
		if (state === 4) {
			var errorMessage = getTreeLoadErrorMessage(treeView)
			_pageState.lastTreeLoadError = errorMessage
			syncPageMeta(formatTreeStatus('导航树远端加载失败', errorMessage), readRows(treeView.rows))
			pushActionLog('远端加载', 'NavigationNodes', 'error', errorMessage)
			if ($page && !_pageState.loadFailureNotified) {
				_pageState.loadFailureNotified = true
				$page.showMessage('导航树加载失败：' + errorMessage, 'error')
			}
		}
	})

	_pageState.initialized = true
}

function getTreeView() {
	return getView('NavigationNodes')
}

function getCurrentNode() {
	return getTreeView()?.currentRow || null
}

async function reloadTreeFromServer() {
	var view = getTreeView()
	if (!view) return

	_pageState.filterActive = false
	if (view.dataTable && view.dataTable.api && view.dataTable.api.list) {
		await view.refresh()
		captureMasterRows(readRows(view.rows))
		syncPageMeta('已重新拉取远端导航树', readRows(view.rows))
		pushActionLog('刷新导航树', 'NavigationNodes', 'success', '已从服务端重新拉取导航树')
		if ($page) $page.showMessage('导航树已刷新', 'success')
		return
	}

	syncPageMeta('当前为内联树数据，无需远端刷新', readRows(view.rows))
	if ($page) $page.showMessage('当前树为内联数据，无需刷新', 'info')
}

function applyTreeFilters() {
	var view = getTreeView()
	if (!view) return

	var filters = readFilters()
	if (!hasActiveFilters(filters)) {
		resetTreeFilters()
		return
	}

	if (_pageState.masterRows.length === 0) {
		captureMasterRows(readRows(view.rows))
	}

	var filteredRows = filterTreeRows(_pageState.masterRows, filters)
	_pageState.filterActive = true
	_pageState.suppressRowsSnapshot = true
	view.replaceRows(filteredRows)

	var firstNode = findFirstNode(filteredRows)
	if (firstNode && firstNode.id != null) {
		view.setCurrentRowById(firstNode.id)
	}

	syncPageMeta('已应用本地筛选', filteredRows)
	pushActionLog('应用筛选', 'NavigationNodes', 'success', '共命中 ' + flattenNodeCount(filteredRows) + ' 个节点')
	if ($page) $page.showMessage('已应用树筛选', 'success')
}

async function resetTreeFilters() {
	setFilters({
		searchKeyword: '',
		nodeKindFilter: 'all',
		placementFilter: 'all',
	})

	_pageState.filterActive = false
	await reloadTreeFromServer()
}

async function focusCurrentNode() {
	var treeApi = getTreeApi()
	var row = getCurrentNode()
	if (!treeApi || !row || row.id == null) {
		if ($page) $page.showMessage('请先选中一个节点', 'warning')
		return
	}
	await treeApi.expandToNode(row.id)
	pushActionLog('定位节点', String(row.title || row.id), 'success', '已展开到当前节点')
}

function __init__() {
	bindTreeView()
	waitForApi(
		getTreeApi,
		function() {
			var treeView = getTreeView()
			captureMasterRows(readRows(treeView?.rows))
			syncPageMeta('页面初始化完成，等待导航树自动加载', readRows(treeView?.rows))
			pushActionLog('页面初始化', 'tree-demo', 'ready', 'tree-demo 已完成初始化绑定')
		},
		function() {
			syncPageMeta('组件挂接超时，请稍后重试', readRows(getTreeView()?.rows))
		}
	)
}

