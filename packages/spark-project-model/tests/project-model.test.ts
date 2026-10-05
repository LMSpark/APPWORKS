import { describe, expect, it } from 'vitest'
import type { ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData } from '../src/blueprint/project-blueprint-node'
import type { NavigationRootPlacement } from '@spark-appworks/spark-utils'
import { ProjectBlueprintNode } from '../src/blueprint/project-blueprint-node'
import { ConfigPageNode } from '../src/page/config-page'
import { resolveProjectPageSurface } from '../src/blueprint/project-blueprint-tree'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { createBlueprintNodePatch } from '../src/blueprint/project-blueprint-edit'

describe('ProjectModel', () => {
  function createRoot(children: ProjectBlueprintTreeNodeData[], childPlacement: NavigationRootPlacement = 'header'): ProjectBlueprintTreeData {
    return {
      id: 'homepage_root',
      title: 'CRM',
      nodeKind: 'module',
      childPlacement,
      children,
    }
  }

  function createWorkspace(): ProjectWorkspace {
    return new ProjectWorkspace({
      projectId: 'crm',
      pageFiles: { readPageFile: async () => '' },
      blueprint: { loadRoot: async () => createRoot([]) },
    })
  }

  it('resolves page design surface by nodeKind', () => {
    expect(resolveProjectPageSurface({ id: 'p', title: 'P', nodeKind: 'page', path: '/p' })).toBe('config-files')
    expect(resolveProjectPageSurface({ id: 's', title: 'S', nodeKind: 'system-page', path: '/dashboard' })).toBe('system-page')
    expect(resolveProjectPageSurface({ id: 'l', title: 'L', nodeKind: 'link', path: '/ext' })).toBe('link')
  })

  it('maps system-page nodes to ProjectNode with system-page family', () => {
    const p = createWorkspace().project
    p.replaceBlueprintTree(createRoot([
      { id: 'dashboard', title: '仪表盘', nodeKind: 'system-page', path: '/dashboard' },
    ]))
    const node = p.findNodeById('dashboard')
    expect(node).toBeInstanceOf(ProjectBlueprintNode)
    expect(node?.nodeKind).toBe('system-page')
    expect(node?.family).toBe('system-page')
    const summaries = p.readPlanningProjection()
    expect(summaries[0]?.designSurface).toBe('system-page')
  })

  it('maps system-directory nodes to ProjectNode with module family', () => {
    const p = createWorkspace().project
    p.replaceBlueprintTree({
      id: 'homepage_root',
      title: 'CRM',
      nodeKind: 'module',
      childPlacement: 'header',
      children: [
        {
          id: 'toolbar-root',
          title: '工具栏',
          nodeKind: 'system-directory',
          childPlacement: 'toolbar',
          children: [{ id: 'refresh', title: '刷新', nodeKind: 'system-action' }],
        },
      ],
    })
    const toolbarRoot = p.findNodeById('toolbar-root')
    expect(toolbarRoot).toBeInstanceOf(ProjectBlueprintNode)
    expect(toolbarRoot?.nodeKind).toBe('system-directory')
    expect(toolbarRoot?.family).toBe('module')
  })

  it('exposes the design aggregate on project root', () => {
    const p = createWorkspace().project
    expect(p.design).toBeDefined()
    p.design.replaceBlueprintTree(createRoot([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ]))
    expect(p.design.findConfigPageByPageId('orders')).toBeInstanceOf(ConfigPageNode)
    expect(p.findConfigPageByPageId('orders')?.pageId).toBe('orders')
  })

  it('finds pages by pageId from the tree', () => {
    const p = createWorkspace().project
    p.replaceBlueprintTree(createRoot([{
      id: 'orders-node', title: '订单页面', nodeKind: 'page', path: '/orders',
      children: [{
        id: 'order-detail',
        title: '订单详情',
        blueprintKind: 'sub-page',
        nodeKind: 'page',
        hidden: true,
        description: '订单详情功能',
      }],
    }]))
    const page = p.findConfigPageByPageId('orders')
    const sub = p.findConfigPageByPageId('order-detail')
    expect(page).toBeInstanceOf(ConfigPageNode)
    expect(sub).toBeInstanceOf(ConfigPageNode)
    expect(sub?.isSubPage).toBe(true)
    expect(page?.nodeKind).toBe('page')
    expect(sub?.nodeKind).toBe('page')
    expect(sub?.hidden).toBe(true)
    expect(sub?.pageId).toBe('order-detail')
    expect(sub?.isSubPage).toBe(true)
    expect(sub?.toSummary().designSurface).toBe('config-files')
    expect(sub?.toSummary().nodeKind).toBe('page')
  })

  it('builds tree from flat collection and finds nodes', () => {
    const p = createWorkspace().project
    p.replaceBlueprintTree(createRoot([
      { id: 'sales', title: '销售模块', nodeKind: 'module', description: '销售模块', children: [
        { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders', description: '订单页面' },
      ]},
    ]))
    const tree = p.blueprintTree.children
    expect(tree.length).toBeGreaterThanOrEqual(1)
    const salesNode = p.findNodeById('sales')
    expect(salesNode).toBeInstanceOf(ProjectBlueprintNode)
    expect(salesNode?.nodeKind).toBe('module')
    expect(salesNode?.family).toBe('module')
    expect(salesNode?.description).toBe('销售模块')
    const orderNode = p.findNodeById('orders')
    expect(orderNode).toBeInstanceOf(ConfigPageNode)
  })

  it('keeps ProjectBlueprintTreeNodeData copies from mutating the node class', () => {
    const p = createWorkspace().project
    p.replaceBlueprintTree(createRoot([
      {
        id: 'orders',
        title: '订单页面',
        nodeKind: 'page',
        path: '/orders',
        context: [{ id: 'tenant-a', title: '租户 A' }],
      },
    ]))

    const node = p.findNodeById('orders')
    const data = node?.toNodeData()
    if (data) {
      data.title = '被外部改掉'
      if (Array.isArray(data.context)) data.context[0]!.title = '租户 B'
    }

    expect(node?.title).toBe('订单页面')
    expect(Array.isArray(node?.context) ? node.context[0]?.title : '').toBe('租户 A')
  })

  it('applies navigation edits through the model class and refreshes cached tree projections', () => {
    const workspace = createWorkspace()
    workspace.project.replaceBlueprintTree(createRoot([
      { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders', order: 0 },
      { id: 'reports', title: '报表', nodeKind: 'page', path: '/reports', order: 1 },
    ]))
    workspace.project.selectNode('orders')
    expect(workspace.project.readBlueprintProjection().tree.map(node => node.id)).toEqual(['orders', 'reports'])

    const dto = workspace.project.beginBlueprintDraft()
    dto.node.title = '销售订单'
    dto.node.order = 2
    workspace.project.applyBlueprintNodeEdit(dto)

    const projection = workspace.project.readBlueprintProjection()
    expect(workspace.project.findNodeById('orders')?.title).toBe('销售订单')
    expect(projection.selectedNode?.title).toBe('销售订单')
    expect(projection.tree.map(node => node.id)).toEqual(['reports', 'orders'])
  })

  it('persists agent gate fields on navigation node and planning projection', () => {
    const workspace = createWorkspace()
    workspace.project.replaceBlueprintTree(createRoot([
      {
        id: 'orders',
        title: '订单页面',
        nodeKind: 'page',
        path: '/orders',
        description: '订单列表',
        order: 0,
      },
    ]))
    workspace.project.selectNode('orders')
    const dto = workspace.project.beginBlueprintDraft()
    dto.node.implGate = 'open'
    dto.node.upstreamContractsSatisfied = true
    workspace.project.applyBlueprintNodeEdit(dto)

    const summary = workspace.project.readPlanningProjection().find(item => item.pageId === 'orders')
    expect(summary).toMatchObject({
      implGate: 'open',
      upstreamContractsSatisfied: true,
    })
    expect(workspace.project.findNodeById('orders')?.toNodeData()).toMatchObject({
      implGate: 'open',
      upstreamContractsSatisfied: true,
    })
  })

  it('initializes missing agent gate fields as fail-closed draft values', () => {
    const workspace = createWorkspace()
    workspace.project.replaceBlueprintTree(createRoot([{
      id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders',
    }]))
    workspace.project.selectNode('orders')

    expect(workspace.project.beginBlueprintDraft().node).toMatchObject({
      implGate: 'closed',
      upstreamContractsSatisfied: false,
    })
  })

  it('rejects the removed planningStatus field when loading a blueprint', () => {
    const workspace = createWorkspace()
    const legacyNode = {
      id: 'orders',
      title: '订单页面',
      nodeKind: 'page' as const,
      path: '/orders',
      description: '订单列表',
      order: 0,
      planningStatus: 'planning_confirmed',
    }
    expect(() => workspace.project.replaceBlueprintTree(createRoot([legacyNode as ProjectBlueprintTreeNodeData])))
      .toThrow(/已移除字段 planningStatus/u)
  })

  it('does not mark navigation dirty when opening draft without edits', () => {
    const workspace = createWorkspace()
    workspace.project.replaceBlueprintTree(createRoot([
      { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders' },
    ]))
    workspace.project.selectNode('orders')
    workspace.project.beginBlueprintDraft()
    const dirty = workspace.project.readDirtyProjection()
    expect(dirty.blueprintDirty).toBe(false)
    expect(dirty.hasAnyDirty).toBe(false)
  })

  it('marks navigation dirty only after a real navigation edit', () => {
    const workspace = createWorkspace()
    workspace.project.replaceBlueprintTree(createRoot([
      { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders' },
    ]))
    workspace.project.selectNode('orders')
    const dto = workspace.project.beginBlueprintDraft()
    expect(workspace.project.readDirtyProjection().blueprintDirty).toBe(false)
    dto.node.title = '销售订单'
    workspace.project.applyBlueprintNodeEdit(dto)
    expect(workspace.project.readDirtyProjection().blueprintDirty).toBe(true)
  })

  it('exposes node hierarchy instead of a flat node list', () => {
    const p = createWorkspace().project
    p.replaceBlueprintTree(createRoot([
      { id: 'sales', title: '销售模块', nodeKind: 'module', children: [
        { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders' },
      ]},
      { id: 'settings', title: '设置', nodeKind: 'page', path: '/settings' },
    ]))

    expect(p.family).toBe('project')
    expect(p.name).toBe('crm')
    const rootNodes = p.getChildNodes('')
    expect(rootNodes.map(node => node.id)).toEqual(['homepage_root'])
    expect(rootNodes.map(node => node.pid)).toEqual([''])
    expect(rootNodes[0]).toBeInstanceOf(ProjectBlueprintNode)
    expect(rootNodes[0]?.nodeKind).toBe('module')
    expect(rootNodes[0]?.family).toBe('module')
    const root = rootNodes[0]
    expect(root?.title).toBe('CRM')
    expect(root?.childPlacement).toBe('header')
    expect(root ? p.getChildNodes(root.id).map(node => node.id) : []).toEqual(['sales', 'settings'])
    const sales = p.findNodeById('sales')
    expect(sales ? p.getChildNodes(sales.id).map(node => node.id) : []).toEqual(['orders'])
    const settings = p.findNodeById('settings')
    expect(settings).toBeInstanceOf(ConfigPageNode)
    expect(settings instanceof ConfigPageNode ? p.getChildNodes(settings.id) : []).toEqual([])
    expect(p.findNodeById('sales')?.toNodeData()).toMatchObject({ nodeKind: 'module' })
  })

  it('applies project layout edit on root module', () => {
    const p = createWorkspace().project
    p.replaceBlueprintTree(createRoot([
      { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders' },
    ], 'header'))
    expect(p.blueprintTree.childPlacement).toBe('header')

    p.applyProjectLayoutEdit('sidebar')
    expect(p.blueprintTree.childPlacement).toBe('sidebar')
    expect(p.rootNode?.toNodeData().childPlacement).toBe('sidebar')
    expect(p.readDirtyProjection().blueprintDirty).toBe(true)
  })

  it('uses a real project node as the project home node and keeps placement on root', () => {
    const p = createWorkspace().project
    p.replaceBlueprintTree(createRoot([
      { id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders' },
    ], 'sidebar'))
    p.replaceProjectInfo({ homeNodeId: 'orders' })

    expect(p.homeNodeId).toBe('orders')
    expect(p.homeNode).toBe(p.findNodeById('orders'))
    expect(p.projectInfo.homeNodeId).toBe('orders')
    expect(p.blueprintTree.childPlacement).toBe('sidebar')
    expect(p.rootNode?.id).toBe('homepage_root')
  })

  it('promotes a persisted root node returned as the only top-level child', () => {
    const p = createWorkspace().project
    p.replaceBlueprintTree({ title: '', childPlacement: 'header', children: [{
      id: 'homepage_root',
      title: 'CRM',
      nodeKind: 'module',
      childPlacement: 'sidebar',
      children: [{ id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders' }],
    }]})

    expect(p.rootNode?.id).toBe('homepage_root')
    expect(p.getChildNodes('').map(node => node.id)).toEqual(['homepage_root'])
    expect(p.getChildNodes('homepage_root').map(node => node.id)).toEqual(['orders'])
    expect(p.blueprintTree.children.map(node => node.id)).toEqual(['orders'])
  })

  it('promotes a persisted module root even when root childPlacement is missing', () => {
    const p = createWorkspace().project
    p.replaceBlueprintTree({ title: '', childPlacement: 'header', children: [{
      id: 'homepage_root',
      title: 'CRM',
      nodeKind: 'module',
      children: [{ id: 'orders', title: '订单页面', nodeKind: 'page', path: '/orders' }],
    }]})

    expect(p.rootNode?.id).toBe('homepage_root')
    expect(p.blueprintTree.childPlacement).toBe('header')
    expect(p.blueprintTree.children.map(node => node.id)).toEqual(['orders'])
  })

  it('promotes persisted root from mixed top-level rows and merges siblings under it', () => {
    const p = createWorkspace().project
    p.replaceBlueprintTree({ title: '', childPlacement: 'header', children: [
      {
        id: 'homepage_root',
        title: '',
        nodeKind: 'module',
        childPlacement: 'header',
        children: [{ id: 'home', title: '企业管理平台', nodeKind: 'system-page', path: '/home' }],
      },
      { id: 'app-list', title: '应用管理', nodeKind: 'system-page', path: '/app-list' },
    ]})

    expect(p.rootNode?.id).toBe('homepage_root')
    expect(p.getChildNodes('').map(node => node.id)).toEqual(['homepage_root'])
    expect(p.getChildNodes('homepage_root').map(node => node.id)).toEqual(['app-list', 'home'])
    expect(p.blueprintTree.children.map(node => node.id)).toEqual(['app-list', 'home'])
  })

  it('supports detached config pages', () => {
    const p = createWorkspace().project
    const page = p.design.openPageDesign('standalone')
    expect(page).toBeInstanceOf(ConfigPageNode)
    expect(page.rule).toBeDefined()
    expect(page.isLoaded).toBe(false)
    expect(page.pageId).toBe('standalone')
    expect(p.design.findConfigPageByPageId('standalone')).toBe(page)
    expect(p.findNodeById('standalone')).toBeNull()
  })

  it('creates full navigation patch so editable fields can be cleared', () => {
    const result = createBlueprintNodePatch({
      node: {
        id: 'orders',
        title: '订单',
        blueprintKind: 'page',
        icon: '',
        nodeKind: 'page',
        dividerAfter: false,
        description: '',
        planningAttachmentRef: '',
        path: '',
        linkTarget: 'iframe',
        childPlacement: '',
        order: 0,
        hidden: false,
        disabled: false,
        refId: '',
        permissionMode: 'masked',
        implGate: 'closed',
        upstreamContractsSatisfied: false,
      },
      context: {
        hasContext: true,
        items: [{ id: '', title: '' }],
        config: { placeholder: '', defaultValue: '', paramName: '' },
      },
    })

    expect(result.patch).toMatchObject({
      title: '订单',
      blueprintKind: 'page',
      icon: '',
      description: '',
      path: '',
      context: '',
      hidden: false,
      disabled: false,
      dividerAfter: false,
      order: 0,
    })
  })

  it('moves mounted pages through the injected navigation gateway', async () => {
    const moveCalls: Array<{ id: string; parentId: string | null; index: number }> = []
    const root: ProjectBlueprintTreeData = {
      id: 'homepage_root',
      title: 'CRM',
      nodeKind: 'module',
      childPlacement: 'header' as const,
      children: [
        { id: 'orders', title: '订单', nodeKind: 'page' as const, path: '/orders' },
      ],
    }
    const movedNode: ProjectBlueprintTreeNodeData = { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders', order: 0 }
    const workspace = new ProjectWorkspace({
      projectId: 'crm',
      pageFiles: { readPageFile: async () => '' },
      blueprint: {
        loadRoot: async () => root,
        moveNode: async (id, parentId, index) => {
          moveCalls.push({ id, parentId, index })
          return movedNode
        },
      },
    })

    await workspace.loadBlueprint()
    await workspace.moveMountedPage('orders', null, 0)

    expect(moveCalls).toEqual([
      { id: 'orders', parentId: null, index: 0 },
    ])
  })

  it('reads project planning input from navigation root description and attachment ref', () => {
    const workspace = createWorkspace()
    const project = workspace.project
    project.replaceProjectInfo({
      description: '项目级描述回退',
      planningAttachmentRef: 'attachments/project-fallback.md',
    })
    project.replaceBlueprintTree({
      ...createRoot([]),
      description: '根节点短需求',
      planningAttachmentRef: 'attachments/spec-v1.md',
    })

    expect(project.readProjectPlanningInput()).toEqual({
      requirement: '根节点短需求',
      planningAttachmentRef: 'attachments/spec-v1.md',
    })
  })

  it('reads navigation node planning inputs with per-node attachment refs', () => {
    const workspace = createWorkspace()
    const project = workspace.project
    project.replaceBlueprintTree(createRoot([
      {
        id: 'orders',
        title: '订单模块',
        blueprintKind: 'module',
        nodeKind: 'module',
        description: '订单域',
        planningAttachmentRef: 'attachments/orders.md',
        children: [
          {
            id: 'orders-list',
            title: '订单列表',
            blueprintKind: 'page',
            nodeKind: 'page',
            path: '/orders',
            description: '列表页需求',
            planningAttachmentRef: 'attachments/orders-list.md',
          },
        ],
      },
    ]))

    expect(project.readBlueprintNodePlanningInput('orders-list')).toEqual({
      nodeId: 'orders-list',
      title: '订单列表',
      blueprintKind: 'page',
      nodeKind: 'page',
      requirement: '列表页需求',
      planningAttachmentRef: 'attachments/orders-list.md',
    })
    expect(project.readPlanningProjection().find(item => item.pageId === 'orders')?.planningAttachmentRef)
      .toBe('attachments/orders-list.md')
  })

  it('falls back to project.description when navigation root description is empty', () => {
    const workspace = createWorkspace()
    const project = workspace.project
    project.replaceProjectInfo({ description: '仅项目描述' })
    project.replaceBlueprintTree(createRoot([]))

    expect(project.readProjectPlanningInput()).toEqual({
      requirement: '仅项目描述',
    })
  })

  it('replaceBlueprintChildren accepts ClassModel command object', () => {
    const workspace = createWorkspace()
    const project = workspace.project
    const children: ProjectBlueprintTreeNodeData[] = [{
      id: 'orders',
      title: '订单',
      nodeKind: 'page',
      path: '/orders',
      description: '订单页',
    }]

    project.replaceBlueprintChildren({ children })

    expect(project.blueprintTree.children.map(node => node.id)).toEqual(['orders'])
    expect(project.readDirtyProjection().blueprintDirty).toBe(true)
  })
})
