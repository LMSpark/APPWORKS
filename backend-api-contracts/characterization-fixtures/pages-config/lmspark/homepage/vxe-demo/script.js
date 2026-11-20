function getDemoView() {
	return $dataSet?.getView('DemoData', 'default') ?? null
}

function getCurrentDemoRow() {
	return getDemoView()?.currentRow ?? null
}

function resolveRowPk(row) {
	if (!row || typeof row !== 'object') return null
	const id = row.id
	if (typeof id === 'number' || typeof id === 'string') return id
	const pk = row._pk
	if (typeof pk === 'number' || typeof pk === 'string') return pk
	return null
}

function resolveCurrentRowPk() {
	return resolveRowPk(getCurrentDemoRow())
}

function handleCreateRow() {
	const view = getDemoView()
	if (!view) {
		$page.showMessage('DemoData 视图不存在', 'warning')
		return
	}

	const nextId = view.rows.reduce((maxId, row) => {
		const currentId = typeof row.id === 'number' ? row.id : 0
		return Math.max(maxId, currentId)
	}, 1000) + 1

	view.appendRow({
		id: nextId,
		name: '新成员',
		gender: 'male',
		age: 26,
		birthday: '2000-01-01',
		status: 'pending',
		address: '待补充地址',
		score: 80,
		active: true,
	})

	const newRow = view.rows.find((row) => row.id === nextId) ?? null
	if (newRow && view.selection?.setCurrentRow) {
		view.selection.setCurrentRow(newRow)
	}
	$page.showMessage(`已新增演示数据 #${nextId}`, 'success')
}

function handleRefreshDemo() {
	const view = getDemoView()
	if (!view) {
		$page.showMessage('DemoData 视图不存在', 'warning')
		return
	}

	if (typeof view.refresh === 'function') {
		Promise.resolve(view.refresh())
			.then(() => {
				$page.showMessage('演示数据已刷新', 'success')
			})
			.catch((error) => {
				const message = error instanceof Error ? error.message : String(error)
				$page.showMessage(`刷新失败: ${message}`, 'error')
			})
		return
	}

	$page.showMessage('当前示例使用静态数据，无需刷新', 'info')
}

function handleInspectRow() {
	const row = getCurrentDemoRow()
	if (!row) {
		$page.showMessage('请先选择一行数据', 'warning')
		return
	}
	$page.showMessage(`当前行: ${row.name} / ${row.status}`, 'info')
}

function handleDeleteCurrentRow() {
	const view = getDemoView()
	const row = getCurrentDemoRow()
	if (!view || !row) {
		$page.showMessage('请先选择一行数据', 'warning')
		return
	}

	const rowId = resolveRowPk(row)
	if (!(typeof rowId === 'number' || typeof rowId === 'string')) {
		$page.showMessage('当前行缺少主键，无法删除', 'error')
		return
	}

	const deleted = view.deleteRowById(rowId)
	if (deleted) {
		const nextRow = view.rows?.[0] ?? null
		if (view.selection?.setCurrentRow) {
			view.selection.setCurrentRow(nextRow, 'row-action-delete-fallback')
		}
		$page.showMessage(`已删除 #${rowId}`, 'success')
		return
	}
	$page.showMessage(`删除失败：记录 #${rowId} 不存在或已删除`, 'warning')
}

function handleDeleteRowById(rowId) {
	const view = getDemoView()
	if (!view) {
		$page.showMessage('DemoData 视图不存在', 'warning')
		return
	}

	const targetId = (typeof rowId === 'number' || typeof rowId === 'string')
		? rowId
		: resolveCurrentRowPk()

	if (!(typeof targetId === 'number' || typeof targetId === 'string')) {
		$page.showMessage('当前行主键不可用，无法删除', 'error')
		return
	}

	const beforeRows = Array.isArray(view.rows) ? view.rows : []
	const targetIndex = beforeRows.findIndex((item) => resolveRowPk(item) === targetId)
	if (targetIndex < 0) {
		$page.showMessage(`删除失败：记录 #${targetId} 不存在或已删除`, 'warning')
		return
	}

	const deleted = view.deleteRowById(targetId)
	if (deleted) {
		const afterRows = Array.isArray(view.rows) ? view.rows : []
		const nextIndex = Math.min(targetIndex, Math.max(afterRows.length - 1, 0))
		const nextRow = afterRows.length > 0 ? afterRows[nextIndex] : null
		if (view.selection?.setCurrentRow) {
			view.selection.setCurrentRow(nextRow, 'row-action-delete-by-id')
		}
		$page.showMessage(`已删除 #${targetId}`, 'success')
		return
	}
	$page.showMessage(`删除失败：记录 #${targetId} 不存在或已删除`, 'warning')
}

function RenderToolbar() {
	return h('div', {
		style: {
			display: 'flex',
			gap: '8px',
			alignItems: 'center',
			flexWrap: 'wrap',
		},
	}, [
		h('button', {
			type: 'button',
			class: 'el-button el-button--primary',
			onClick: handleCreateRow,
		}, '新增'),
		h('button', {
			type: 'button',
			class: 'el-button',
			onClick: handleRefreshDemo,
		}, '刷新'),
	])
}

function RenderTableToolbar() {
	return h('div', {
		style: {
			display: 'flex',
			gap: '8px',
			alignItems: 'center',
			flexWrap: 'wrap',
		},
	}, [
		h('button', {
			type: 'button',
			class: 'el-button el-button--primary is-plain el-button--small',
			onClick: handleCreateRow,
		}, '+ 新增'),
		h('button', {
			type: 'button',
			class: 'el-button el-button--small',
			onClick: handleRefreshDemo,
		}, '刷新'),
	])
}

function RenderRowActions(props) {
	const row = props?.row || props?.scope?.row || props?.data?.row || null
	const rowId = resolveRowPk(row)
	const rowName = row?.name ?? (rowId ?? '-')
	const rowStatus = row?.status ?? '-'

	return h('div', {
		style: {
			display: 'flex',
			gap: '6px',
			justifyContent: 'center',
			flexWrap: 'wrap',
		},
	}, [
		h('button', {
			type: 'button',
			class: 'el-button el-button--small is-plain',
			onClick: function() {
				if (rowId === null) {
					$page.showMessage('当前行数据不可用', 'warning')
					return
				}
				$page.showMessage(`当前行: ${rowName} / ${rowStatus}`, 'info')
			},
		}, '查看'),
		h('button', {
			type: 'button',
			class: 'el-button el-button--danger is-plain el-button--small',
			onClick: function() { handleDeleteRowById(rowId) },
		}, '删除'),
	])
}
