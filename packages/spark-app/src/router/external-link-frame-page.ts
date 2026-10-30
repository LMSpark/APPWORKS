/**
 * @module @spark-appworks/spark-app:router/external-link-frame-page
 * 职责：提供应用壳层 external-link-frame-page 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 router/external-link-frame-page。
 */
import { computed, defineComponent, h } from 'vue'
import { useRoute } from 'vue-router'

const rootStyle: Record<string, string> = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  WebkitOverflowScrolling: 'touch',
  padding: '8px 8px 0',
  background: 'transparent',
}

const pageHeaderStyle: Record<string, string> = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '16px',
  marginBottom: '12px',
}

const pageHeaderMainStyle: Record<string, string> = {
  minWidth: '0',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const pageTitleStyle: Record<string, string> = {
  fontSize: '22px',
  lineHeight: '30px',
  fontWeight: '600',
  color: 'var(--spark-text-primary)',
}

const pageSubtitleStyle: Record<string, string> = {
  fontSize: '13px',
  lineHeight: '20px',
  color: 'var(--spark-text-secondary)',
}

const shellStyle: Record<string, string> = {
  flex: '1 1 auto',
  minHeight: '0',
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid var(--spark-border-light)',
  borderRadius: '12px',
  overflow: 'hidden',
  background: 'var(--spark-bg-page)',
  boxShadow: 'var(--spark-shadow-light)',
}

const toolbarStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '10px 14px',
  borderBottom: '1px solid var(--spark-border-light)',
  background: 'var(--spark-bg-page)',
  flex: '0 0 auto',
}

const shellHintStyle: Record<string, string> = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '2px 0',
  borderRadius: '999px',
  color: 'var(--spark-text-secondary)',
  fontSize: '12px',
  fontWeight: '500',
}

const toolbarMetaStyle: Record<string, string> = {
  flex: '1',
  minWidth: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--spark-text-secondary)',
  fontSize: '12px',
}

const openButtonStyle: Record<string, string> = {
  flex: '0 0 auto',
  border: '1px solid var(--spark-border-color)',
  background: 'var(--spark-bg-page)',
  color: 'var(--spark-text-primary)',
  borderRadius: '6px',
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: '12px',
}

const frameWrapStyle: Record<string, string> = {
  flex: '1 1 auto',
  minHeight: '0',
  overflow: 'hidden',
  padding: '12px',
  background: 'var(--spark-bg)',
}

const frameStyle: Record<string, string> = {
  width: '100%',
  height: '100%',
  minHeight: '100%',
  display: 'block',
  border: '1px solid var(--spark-border-light)',
  borderRadius: '10px',
  overflow: 'hidden',
  background: '#fff',
}

const emptyStyle: Record<string, string> = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--el-text-color-secondary)',
}

export const ExternalLinkFramePage = defineComponent({
  name: 'SparkExternalLinkFramePage',
  setup() {
    const route = useRoute()

    const pageTitle = computed(() => {
      const title = route.meta['title']
      return typeof title === 'string' && title.trim() !== '' ? title.trim() : '引用页面'
    })

    function resolveRouteTemplate(path: string): string {
      let resolved = path
      const projectId = route.params['projectId']

      if (typeof projectId === 'string' && projectId !== '') {
        resolved = resolved.replaceAll(':projectId', encodeURIComponent(projectId))
      }

      return resolved
    }

    const sourceUrl = computed(() => {
      const metaUrl = route.meta['linkUrl']
      if (typeof metaUrl === 'string' && metaUrl.trim() !== '') {
        return resolveRouteTemplate(metaUrl.trim())
      }
      return ''
    })

    function openInNewTab() {
      if (sourceUrl.value === '') return
      window.open(sourceUrl.value, '_blank', 'noopener,noreferrer')
    }

    return () => {
      if (sourceUrl.value === '') {
        return h('div', { style: emptyStyle }, '未配置超链接地址')
      }

      return h('div', { style: rootStyle }, [
        h('div', { style: pageHeaderStyle }, [
          h('div', { style: pageHeaderMainStyle }, [
            h('div', { style: pageTitleStyle }, pageTitle.value),
            h('div', { style: pageSubtitleStyle }, '当前页面以内嵌方式展示外部链接内容'),
          ]),
        ]),
        h('div', { style: shellStyle }, [
          h('div', { style: toolbarStyle }, [
            h('span', { style: shellHintStyle }, '引用内容'),
            h('span', { style: toolbarMetaStyle, title: sourceUrl.value }, sourceUrl.value),
            h('button', { type: 'button', style: openButtonStyle, onClick: openInNewTab }, '新标签打开'),
          ]),
          h('div', { style: frameWrapStyle }, [
            h('iframe', {
              src: sourceUrl.value,
              style: frameStyle,
              loading: 'lazy',
              scrolling: 'auto',
            }),
          ]),
        ]),
      ])
    }
  },
})
