// 页面脚本
// 沙箱注入的全局变量: 
// - $route, $el, $query, $queryAll, $dataSet, $refreshData, $page

// 页面初始化（直接使用沙箱变量）
console.log('🚀 工作台页面已加载');
console.log('📦 DataSet:', $dataSet);
console.log('🛣️ 当前路由:', $route?.path);
console.log('📄 页面容器:', $el());

// 定义函数（不使用 export）
function testButtonClick() {
    console.log('🎯 测试按钮被点击');

    // 用 $el() 拿到页面容器，再 querySelectorAll 查找卡片
    const container = $el()
    console.log('📦 容器元素:', container)
    if (!container) {
        $page.showMessage('页面容器未就绪，请稍后再试', 'warning')
        return
    }

    // 只操作统计卡片区域，不影响表格和表单
    const cards = container.querySelectorAll('.stats-grid .content-section')
    console.log('🃏 找到统计卡片数:', cards.length)

    if (!cards || cards.length === 0) {
        $page.showMessage('找不到 .content-section 元素', 'warning')
        return
    }

    // 以第一张卡片的 data-active 属性判断当前状态
    const isActive = cards[0].dataset.cssActive !== 'true'

    cards.forEach(card => {
        if (isActive) {
            card.dataset.cssActive = 'true'
            // 直接操作内联样式，100% 生效，无需担心选择器优先级
            card.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
            card.style.color = '#ffffff'
            card.style.borderTopColor = '#feca57'
            card.style.transform = 'scale(1.04)'
            card.style.boxShadow = '0 12px 36px rgba(102,126,234,0.5)'
            card.style.transition = 'all 0.4s ease'
            // 子文本也变白
            card.querySelectorAll('div').forEach(d => d.style.color = '#ffffff')
        } else {
            card.dataset.cssActive = 'false'
            card.style.background = ''
            card.style.color = ''
            card.style.borderTopColor = ''
            card.style.transform = ''
            card.style.boxShadow = ''
            card.querySelectorAll('div').forEach(d => d.style.color = '')
        }
    })

    if (isActive) {
        $page.showMessage('🎨 JS + CSS 已激活！卡片变为蓝紫渐变，切换到其他页面后样式自动消失')
    } else {
        $page.showMessage('🔄 已恢复原始样式', 'info')
    }
}

function showAlert() {
    const now = new Date().toLocaleTimeString();
    $page.showAlert('🔔 当前时间: ' + now, '提示');
}

function getFormData() {
    console.warn('⚠️ getFormData 已废弃，请使用 $dataSet 读取数据')
    return null
}

function handleInputChange(value) {
    console.log('📝 输入值变化:', value);
}

function handleRowClick(row, column, event) {
    console.log('📊 点击行:', row);
    console.log('📊 点击列:', column);
    alert('点击了行: ' + JSON.stringify(row));
}

// 示例：操作 DOM 元素
function highlightButtons() {
    const buttons = $queryAll('button');
    if (buttons) {
        buttons.forEach((btn, index) => {
            setTimeout(() => {
                btn.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    btn.style.transform = 'scale(1)';
                }, 200);
            }, index * 100);
        });
    }
    console.log('✨ 按钮高亮动画执行');
}

// 私有辅助函数（不导出，外部无法访问）
function formatDate(date) {
    return date.toLocaleDateString('zh-CN');
}

// 配置对象
const config = {
    pageName: '工作台',
    version: '1.0.0',
    initTime: new Date().toISOString()
};

