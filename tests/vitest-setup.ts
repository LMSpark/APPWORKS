/**
 * Vitest 全局 setup —— 响应式包装由 Vue 集成层（如 usePageDataSet）处理
 *
 * spark-data 本身无框架依赖，DataView 是纯数据结构。
 * 响应式代理由上层消费方在各自的作用域里自行处理。
 */
import { defineComponent, h } from 'vue'
import { config } from '@vue/test-utils'

const GlobalElTableStub = defineComponent({
	name: 'GlobalElTableStub',
	setup(_, { slots, attrs }) {
		return () => h('div', { class: 'el-table-global-stub', ...attrs }, slots['default']?.())
	}
})

const GlobalElTableColumnStub = defineComponent({
	name: 'GlobalElTableColumnStub',
	props: {
		label: String,
		fixed: [Boolean, String],
	},
	setup(props, { slots, attrs }) {
		return () => h('div', {
			class: 'el-table-column-global-stub',
			'data-label': props.label,
			'data-fixed': String(props.fixed ?? ''),
			...attrs,
		}, slots['default']?.({ row: {}, $index: 0 }))
	}
})

const GlobalElButtonStub = defineComponent({
	name: 'GlobalElButtonStub',
	setup(_, { slots, attrs }) {
		return () => h('button', { class: 'el-button-global-stub', ...attrs }, slots['default']?.())
	}
})

const GlobalElTagStub = defineComponent({
	name: 'GlobalElTagStub',
	setup(_, { slots, attrs }) {
		return () => h('span', { class: 'el-tag-global-stub', ...attrs }, slots['default']?.())
	}
})

const GlobalSparkComponentRendererStub = defineComponent({
	name: 'GlobalSparkComponentRendererStub',
	setup(_, { slots, attrs }) {
		return () => h('div', { class: 'spark-component-renderer-global-stub', ...attrs }, slots['default']?.())
	}
})

const stubs = config.global.stubs ?? {}
if (stubs['el-table'] === undefined) {
	stubs['el-table'] = GlobalElTableStub
}
if (stubs['el-table-column'] === undefined) {
	stubs['el-table-column'] = GlobalElTableColumnStub
}
if (stubs['el-button'] === undefined) {
	stubs['el-button'] = GlobalElButtonStub
}
if (stubs['el-tag'] === undefined) {
	stubs['el-tag'] = GlobalElTagStub
}
if (stubs['SparkComponentRenderer'] === undefined) {
	stubs['SparkComponentRenderer'] = GlobalSparkComponentRendererStub
}
if (stubs['spark-component-renderer'] === undefined) {
	stubs['spark-component-renderer'] = GlobalSparkComponentRendererStub
}
config.global.stubs = stubs

const originalGetComputedStyle = window.getComputedStyle.bind(window)
const getComputedStyleOverride: typeof window.getComputedStyle = (element, pseudoElement) => {
	if (typeof pseudoElement === 'string' && pseudoElement.trim() !== '') {
		return originalGetComputedStyle(element)
	}
	return originalGetComputedStyle(element)
}
window.getComputedStyle = getComputedStyleOverride
