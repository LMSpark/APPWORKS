/**
 * @module @spark-appworks/spark-app:router/invalid-system-page
 * 职责：提供应用壳层 invalid-system-page 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 router/invalid-system-page。
 */
import { computed, defineComponent, h } from 'vue'
import { useRoute } from 'vue-router'

const rootStyle: Record<string, string> = {
  minHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px',
  boxSizing: 'border-box',
  background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
}

const cardStyle: Record<string, string> = {
  width: 'min(720px, 100%)',
  padding: '28px 32px',
  borderRadius: '20px',
  background: 'rgba(255, 255, 255, 0.92)',
  boxShadow: '0 18px 48px rgba(15, 23, 42, 0.12)',
  border: '1px solid rgba(148, 163, 184, 0.22)',
  color: '#0f172a',
}

const eyebrowStyle: Record<string, string> = {
  margin: '0 0 10px',
  color: '#b45309',
  fontSize: '12px',
  fontWeight: '700',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const titleStyle: Record<string, string> = {
  margin: '0 0 12px',
  fontSize: '28px',
  lineHeight: '36px',
  fontWeight: '700',
}

const bodyStyle: Record<string, string> = {
  margin: '0 0 18px',
  color: '#334155',
  fontSize: '15px',
  lineHeight: '24px',
}

const metaBlockStyle: Record<string, string> = {
  margin: '0',
  padding: '16px 18px',
  borderRadius: '14px',
  background: '#0f172a',
  color: '#e2e8f0',
  fontSize: '13px',
  lineHeight: '22px',
  overflowX: 'auto',
}

function readMetaString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

const PAGE_ERRORS = {
  'invalid-config-page': {
    eyebrow: 'Config Page Target Error',
    fallbackTitle: '未绑定工具的配置节点',
    body: '该导航节点被声明为配置页面，但没有明确的工具目标。应用壳不会根据路径推断页面，请在导航配置中为该节点绑定工具。',
    reason: 'navigation page node has no explicit tool target',
  },
  'invalid-system-page': {
    eyebrow: 'System Page Mapping Error',
    fallbackTitle: '未注册的系统页面',
    body: '该导航节点被声明为 system-page，但当前前端没有在 Vue 页面注册表中声明对应路径。路由层已停止把它误当成配置页加载，因此不会再继续触发 pages-config 404。',
    reason: 'route meta declares system-page, but no Vue page registry entry exists for this path',
  },
} as const

export const InvalidSystemPage = defineComponent({
  name: 'InvalidSystemPage',
  setup() {
    const route = useRoute()
    const meta = computed(() => route.meta)
    const error = computed(() => meta.value['type'] === 'invalid-config-page'
      ? PAGE_ERRORS['invalid-config-page']
      : PAGE_ERRORS['invalid-system-page'])
    const title = computed(() => readMetaString(meta.value, 'title') ?? error.value.fallbackTitle)
    const pageId = computed(() => readMetaString(meta.value, 'pageId') ?? '(missing)')
    const path = computed(() => route.path)

    return () => h('section', { style: rootStyle }, [
      h('div', { style: cardStyle }, [
        h('p', { style: eyebrowStyle }, error.value.eyebrow),
        h('h1', { style: titleStyle }, title.value),
        h('p', { style: bodyStyle }, error.value.body),
        h('pre', { style: metaBlockStyle }, `path: ${path.value}\npageId: ${pageId.value}\nreason: ${error.value.reason}`),
      ]),
    ])
  },
})

export default InvalidSystemPage
