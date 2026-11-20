let _pageState = { uptime: 0 };

function __init__() {
  var view = $dataSet?.getView('Users', 'default');
  if (!view) return;

  // 监听当前行变化 — 数据脉冲
  view.events.on('currentRowChanged', function(currentRow) {
    if (currentRow) {
      console.log('[CYBER_GRID] 实体焦点 →', currentRow.name, '(ID:', currentRow.id, ')');
    }
  });

  // 监听选中行变化
  view.events.on('selectedRowsChanged', function(selectedRows) {
    console.log('[CYBER_GRID] 选中实体:', selectedRows.length, '条');
  });
}

// 行操作渲染函数 — 赛博风格按钮
function RenderRowActions(props) {
  var row = props?.row || props?.scope?.row || props?.data?.row || null;
  if (!row) return h('span', '');

  function neonBtn(color, glowColor, label, handler) {
    return h('button', {
      onClick: handler,
      style: {
        padding: '4px 12px',
        fontSize: '12px',
        fontFamily: 'Courier New, monospace',
        fontWeight: '700',
        letterSpacing: '1px',
        color: color,
        backgroundColor: 'rgba(' + glowColor + ',0.2)',
        border: '1px solid rgba(' + glowColor + ',0.7)',
        borderRadius: '4px',
        cursor: 'pointer',
        textShadow: '0 0 8px rgba(' + glowColor + ',0.6)',
        boxShadow: '0 0 8px rgba(' + glowColor + ',0.25), inset 0 0 6px rgba(' + glowColor + ',0.1)',
        transition: 'all 0.3s ease',
        marginRight: '4px',
      }
    }, label);
  }

  var handleView = function() {
    $page.showMessage({
      type: 'info',
      message: '◉ SCAN :: ' + row.name + ' [ID:' + row.id + ']'
    });
  };

  var handleEdit = function() {
    $page.showMessage({
      type: 'warning',
      message: '✎ EDIT :: ' + row.name
    });
  };

  var handleDelete = function() {
    $page.showConfirm({
      title: '⚠ CONFIRM_DELETE',
      message: '确认从矩阵中移除实体 ' + row.name + ' ？此操作不可逆。',
      onConfirm: function() {
        var view = $dataSet?.getView('Users', 'default');
        if (view) {
          view.deleteRowById(row.id);
          $page.showMessage({ type: 'success', message: '✓ PURGED :: ' + row.name });
        }
      }
    });
  };

  return h('div', { style: { display: 'flex', gap: '4px' } }, [
    neonBtn('#00d4ff', '0,212,255', '◉ SCAN', handleView),
    neonBtn('#fbbf24', '251,191,36', '✎ EDIT', handleEdit),
    neonBtn('#ff6b9d', '255,107,157', '✕ DEL', handleDelete),
  ]);
}

function RenderStatusAction(props) {
  var row = props?.row || props?.scope?.row || props?.data?.row || null;
  if (!row) return h('span', '');

  var isActive = Boolean(row.active);
  var nextActive = !isActive;
  var label = isActive ? '⏻ OFFLINE' : '⏼ ONLINE';

  var handleToggleStatus = function() {
    var view = $dataSet?.getView('Users', 'default');
    if (!view) return;

    var updated = view.updateRowById(row.id, { active: nextActive });
    if (!updated) {
      $page.showMessage({ type: 'error', message: '⚠ SYSTEM_ERROR: 状态更新失败' });
      return;
    }

    $page.showMessage({
      type: 'success',
      message: '✓ ' + row.name + ' → ' + (nextActive ? 'ONLINE' : 'OFFLINE')
    });
  };

  return h('button', {
    onClick: handleToggleStatus,
    style: {
      padding: '3px 10px',
      fontSize: '11px',
      fontFamily: 'Courier New, monospace',
      letterSpacing: '1px',
      color: nextActive ? '#00ffaa' : '#ff6b9d',
      backgroundColor: nextActive ? 'rgba(0,255,170,0.08)' : 'rgba(255,107,157,0.08)',
      border: '1px solid ' + (nextActive ? 'rgba(0,255,170,0.4)' : 'rgba(255,107,157,0.4)'),
      borderRadius: '4px',
      cursor: 'pointer',
      textShadow: '0 0 8px ' + (nextActive ? 'rgba(0,255,170,0.5)' : 'rgba(255,107,157,0.5)'),
      transition: 'all 0.3s ease',
    }
  }, label);
}

// 表格行点击事件处理
function handleRowClick(row, column, event) {
  console.log('[CYBER_GRID] ROW_CLICK ::', row?.name);
}

// 当前行变化事件处理
function handleRowChange(currentRow, oldRow) {
  console.log('[CYBER_GRID] FOCUS_SHIFT ::', oldRow?.name, '→', currentRow?.name);
}

// 选中行变化事件处理
function handleSelection(selection) {
  console.log('[CYBER_GRID] SELECTION ::', selection?.length, 'entities');
}