import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  PageContentLoader,
  type PageFileReadCommand,
} from '@spark-appworks/spark-project-model'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import { CrossProjectRefPage } from '../../packages/spark-app/src/router/cross-project-ref-page'

function isPageNodeLike(value: unknown): value is { pageId: string; load: () => Promise<void> } {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && typeof Reflect.get(value, 'pageId') === 'string'
    && typeof Reflect.get(value, 'load') === 'function'
}

const navTreeState = vi.hoisted((): { tree: RuntimeNavigation | null } => ({
  tree: null,
}))

const rendererState = vi.hoisted((): { props: Record<string, unknown> | null } => ({
  props: null,
}))

vi.mock('../../packages/spark-app/src/navigation/nav-access', () => ({
  getNavTree: () => navTreeState.tree,
}))

vi.mock('@spark-appworks/spark-component', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  return {
    SparkPageRenderer: vue.defineComponent({
      name: 'SparkPageRenderer',
      props: {
        pageId: {
          type: String,
          required: true,
        },
        pageNode: {
          type: Object,
          required: true,
        },
      },
      setup(props) {
        rendererState.props = props
        return () => vue.h('div', { class: 'renderer-stub' })
      },
    }),
  }
})

describe('CrossProjectRefPage', () => {
  beforeEach(() => {
    rendererState.props = null
    navTreeState.tree = null
  })

  it('resolves stale host UUID meta through the ref node target', async () => {
    const hostRefNodeId = '06c56d10-4ff6-4c4d-a6ce-772536592c75'
    const requests: PageFileReadCommand[] = []

    navTreeState.tree = {
      id: 'root',
      title: 'root',
      childPlacement: 'sidebar',
      items: [
        {
          id: hostRefNodeId,
          title: 'project list ref',
          itemKind: 'ref',
          refId: 'project-list',
          refPath: '@app:engineering-pm/project-list',
          refProjectId: 'engineering-pm',
          children: [],
        },
      ],
    }

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/t/:tenantId/:projectId/__ref/:refNodeId',
          component: CrossProjectRefPage,
          meta: {
            type: 'cross-project-ref',
            pageId: hostRefNodeId,
          },
        },
      ],
    })

    await router.push(`/t/lmspark/homepage/__ref/${hostRefNodeId}`)
    await router.isReady()

    const pageContentLoader = new PageContentLoader({
      projectId: 'homepage',
      readPageFile: async (command) => {
        requests.push(command)
        if (command.fileName === 'pagedata.json') return '{"dataSetName":"CrossProject","tables":{}}'
        if (command.fileName === 'rule.json') return '[]'
        return ''
      },
    })

    mount(CrossProjectRefPage, {
      props: {
        pageContentLoader,
        tenantId: 'lmspark',
        hostProjectId: 'homepage',
        routePath: `/t/lmspark/homepage/__ref/${hostRefNodeId}`,
        routeMeta: {
          type: 'cross-project-ref',
          pageId: hostRefNodeId,
        },
      },
      global: {
        plugins: [router],
      },
    })

    expect(rendererState.props?.['pageId']).toBe('project-list')

    const rawPageNode = rendererState.props?.['pageNode']
    const pageNode = isPageNodeLike(rawPageNode) ? rawPageNode : undefined
    expect(pageNode).toBeDefined()
    if (!pageNode) return
    expect(pageNode.pageId).toBe('project-list')

    await pageNode.load()

    expect(requests).toContainEqual({
      projectId: 'engineering-pm',
      pageId: 'project-list',
      fileName: 'rule.json',
    })
  })
})
