/**
 * @module @spark-appworks/spark-app:router/cross-project-ref-page
 * 职责：解析蓝图引用的明确调用目标并导航。
 * 边界：目标由既有路由装配，不重复加载数据空间。
 * AI用途：定位跨项目引用的请求作用域与场景参数传递。
 */
import { defineComponent, h, onMounted, ref } from 'vue'
import { useRouter, type RouteLocationNormalizedLoaded } from 'vue-router'
import { getNavTree } from '../navigation/nav-access'
import type { RuntimeNavigationItem } from '../navigation/runtime-navigation'

/** 本次引用调用的路由快照；保留场景 query 和 hash 传给实际目标。 */
type CrossProjectRefPageRouteProps = { route: RouteLocationNormalizedLoaded }

export function createCrossProjectRefRouteProps() {
  return (route: RouteLocationNormalizedLoaded): CrossProjectRefPageRouteProps => ({ route })
}

function findReference(nodes: readonly RuntimeNavigationItem[], id: string): RuntimeNavigationItem | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findReference(node.children ?? [], id)
    if (child) return child
  }
  return undefined
}

/** 引用只导航到明确目标；目标调用由同一个 DynamicRouter 装配，不创建第二条数据装载链。 */
export const CrossProjectRefPage = defineComponent({
  name: 'SparkCrossProjectRefPage',
  props: { route: { type: Object, required: true } },
  setup(props: Readonly<CrossProjectRefPageRouteProps>) {
    const router = useRouter()
    const error = ref('')
    onMounted(async () => {
      try {
        const nodeId = props.route.params['refNodeId'] ?? props.route.meta['nodeId']
        const reference = typeof nodeId === 'string' ? findReference(getNavTree()?.items ?? [], nodeId) : undefined
        const target = reference?.refPath ?? props.route.meta['refPath']
        if (typeof target !== 'string' || !target.trim()) throw new Error('引用缺少明确调用目标')
        const match = /^@app:([^/]+)(\/.*)$/.exec(target)
        const projectId = match?.[1] ?? props.route.params['projectId']
        const path = match?.[2] ?? target
        const tenantId = props.route.params['tenantId']
        if (typeof projectId !== 'string' || typeof tenantId !== 'string' || !path.startsWith('/')) throw new Error('引用缺少项目或租户请求作用域')
        const resolved = router.resolve(`/t/${encodeURIComponent(tenantId)}/${encodeURIComponent(projectId)}${path}`)
        const result = await router.replace({ path: resolved.path, query: { ...props.route.query, ...resolved.query }, hash: resolved.hash || props.route.hash })
        if (result) throw new Error('引用导航未完成')
      } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
    })
    return () => h('div', { class: 'spark-cross-project-ref' }, error.value || '正在打开引用目标…')
  },
})
